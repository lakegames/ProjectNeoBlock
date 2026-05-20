import crypto from 'node:crypto';
import { createServer } from 'node:http';

import {
  ErrorCode,
  createProtocolError,
  issuesToProtocolError,
  validateClientMessage,
  type Command,
  type CommandId,
  type Event,
  type EventSeq,
  type GameId,
  type MatchSnapshot,
  type PlayerId,
  type ProtocolError,
  type RoomCode,
  type RoomId,
  type ServerMessage,
  type UserId,
} from '@neoblock/shared';
import {
  createGame,
  handleCommand,
  toGameSnapshot,
  type BoardConfig,
  type MatchState,
} from '@neoblock/rules';
import { WebSocket, WebSocketServer } from 'ws';

type RoomMember = {
  playerId: PlayerId;
  userId?: UserId;
  displayName: string;
  isSpectator: boolean;
  connected: boolean;
  ready: boolean;
  seatIndex?: number;
  joinedAtMs: number;
};

type RoomState = {
  roomId: RoomId;
  roomCode: RoomCode;
  status: 'lobby' | 'playing' | 'ended';
  hostPlayerId: PlayerId;
  createdAtMs: number;
  config: {
    maxPlayers: number;
    turnTimeMs?: number;
    rulesetVersionId?: string;
    boardVersionId?: string;
  };
  members: Map<PlayerId, RoomMember>;
  playerToSocket: Map<PlayerId, WebSocket>;
  sockets: Set<WebSocket>;
  events: Event[];
  lastEventSeq: EventSeq;
  minEventSeq: EventSeq;
  processedCommandIds: Set<CommandId>;
  lastClientSeqByPlayer: Map<PlayerId, number>;
  pendingDisconnectTimers: Map<PlayerId, NodeJS.Timeout>;
  queue: Promise<void>;
  game: null | { gameId: GameId; match: MatchState };
};

type ConnectionState = {
  ws: WebSocket;
  roomId: RoomId | null;
  playerId: PlayerId | null;
};

export type BoardPreset = 'default' | 'e2e_fast';

export type StartServerOptions = {
  port?: number;
  reconnectWindowMs?: number;
  maxEvents?: number;
  boardPreset?: BoardPreset;
  fixedGameSeed?: string;
  initialCash?: number;
};

export type RunningServer = {
  port: number;
  close: () => Promise<void>;
};

function createDefaultBoard(): BoardConfig {
  return {
    jailIndex: 6,
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'p1', groupId: 'g1', price: 60, houseCost: 50, rents: [2, 10, 30, 90, 160, 250] },
      { kind: 'property', propertyId: 'p2', groupId: 'g1', price: 60, houseCost: 50, rents: [4, 20, 60, 180, 320, 450] },
      { kind: 'property', propertyId: 'p3', groupId: 'g2', price: 100, houseCost: 50, rents: [6, 30, 90, 270, 400, 550] },
      { kind: 'property', propertyId: 'p4', groupId: 'g2', price: 120, houseCost: 50, rents: [8, 40, 100, 300, 450, 600] },
      { kind: 'property', propertyId: 'p5', groupId: 'g3', price: 140, houseCost: 100, rents: [10, 50, 150, 450, 625, 750] },
      { kind: 'jail' },
      { kind: 'property', propertyId: 'p6', groupId: 'g3', price: 160, houseCost: 100, rents: [12, 60, 180, 500, 700, 900] },
      { kind: 'property', propertyId: 'p7', groupId: 'g4', price: 180, houseCost: 100, rents: [14, 70, 200, 550, 750, 950] },
      { kind: 'property', propertyId: 'p8', groupId: 'g4', price: 200, houseCost: 100, rents: [16, 80, 220, 600, 800, 1000] },
      { kind: 'property', propertyId: 'p9', groupId: 'g5', price: 220, houseCost: 150, rents: [18, 90, 250, 700, 875, 1050] },
      { kind: 'property', propertyId: 'p10', groupId: 'g5', price: 240, houseCost: 150, rents: [20, 100, 300, 750, 925, 1100] },
    ],
  };
}

function createE2EFastBoard(): BoardConfig {
  return {
    jailIndex: 2,
    startSalary: 0,
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'e2e_p1', groupId: 'e2e_g1', price: 1, houseCost: 0, rents: [300, 300, 300, 300, 300, 300] },
      { kind: 'jail' },
    ],
  };
}

function mapThrownError(err: unknown, commandId?: CommandId): ProtocolError {
  const raw = err instanceof Error ? err.message : String(err);
  const code = (() => {
    if (raw === 'NOT_YOUR_TURN') return ErrorCode.NOT_YOUR_TURN;
    if (raw === 'WRONG_GAME') return ErrorCode.GAME_NOT_FOUND;
    if (raw === 'UNSUPPORTED_COMMAND') return ErrorCode.INVALID_COMMAND;
    if (raw === 'INVALID_PHASE') return ErrorCode.INVALID_COMMAND;
    if (raw === 'NO_PENDING_BUY') return ErrorCode.INVALID_COMMAND;
    if (raw === 'PROPERTY_MISMATCH') return ErrorCode.INVALID_COMMAND;
    if (raw === 'NOT_BUYABLE') return ErrorCode.INVALID_COMMAND;
    if (raw === 'ELIMINATED') return ErrorCode.INVALID_COMMAND;
    if (raw === 'PLAYER_NOT_FOUND') return ErrorCode.NOT_FOUND;
    return ErrorCode.INTERNAL_ERROR;
  })();
  return createProtocolError({ code, message: raw, ...(commandId ? { commandId } : {}) });
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const reconnectWindowMs = options.reconnectWindowMs ?? Number(process.env.RECONNECT_WINDOW_MS ?? 30_000);
  const maxEvents = options.maxEvents ?? Number(process.env.MAX_EVENTS ?? 2_000);
  const boardPreset = options.boardPreset ?? ((process.env.BOARD_PRESET as BoardPreset | undefined) ?? 'default');
  const fixedGameSeed = options.fixedGameSeed ?? process.env.FIXED_GAME_SEED;
  const initialCash = options.initialCash ?? (process.env.INITIAL_CASH ? Number(process.env.INITIAL_CASH) : undefined);

  const roomsByCode = new Map<RoomCode, RoomState>();
  const roomsById = new Map<RoomId, RoomState>();
  const connections = new WeakMap<WebSocket, ConnectionState>();

  function nowMs() {
    return Date.now();
  }

  function send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }

  function sendError(ws: WebSocket, error: ProtocolError) {
    send(ws, { kind: 'error', error });
  }

  function broadcast(room: RoomState, msg: ServerMessage) {
    for (const ws of room.sockets) {
      send(ws, msg);
    }
  }

  function allocEventBase(room: RoomState, input: { causedBy?: { commandId?: CommandId; playerId?: PlayerId } }) {
    const seq = (room.lastEventSeq + 1) as EventSeq;
    room.lastEventSeq = seq;
    return {
      roomId: room.roomId,
      createdAtMs: nowMs(),
      eventId: `e${seq}`,
      seq,
      ...(input.causedBy ? { causedBy: input.causedBy } : {}),
    };
  }

  function appendEvents(room: RoomState, events: Event[]) {
    if (events.length === 0) return;
    room.events.push(...events);
    if (room.events.length > maxEvents) {
      room.events = room.events.slice(room.events.length - maxEvents);
      room.minEventSeq = room.events[0]?.seq ?? room.lastEventSeq;
    } else if (room.events.length === 1) {
      room.minEventSeq = room.events[0]?.seq ?? 0;
    }
  }

  function getEventsAfter(room: RoomState, fromSeqExclusive: EventSeq) {
    return room.events.filter((e) => e.seq > fromSeqExclusive);
  }

  function buildSnapshot(room: RoomState): MatchSnapshot {
    const members = [...room.members.values()].sort((a, b) => a.joinedAtMs - b.joinedAtMs);
    return {
      protocolVersion: 1,
      serverTimeMs: nowMs(),
      room: {
        roomId: room.roomId,
        roomCode: room.roomCode,
        status: room.status,
        hostPlayerId: room.hostPlayerId,
        createdAtMs: room.createdAtMs,
        config: room.config,
        members,
      },
      game: room.game ? toGameSnapshot(room.game.match) : null,
      cursor: { lastEventSeq: room.lastEventSeq },
    };
  }

  function createRoom(roomCode: RoomCode): RoomState {
    const roomId = crypto.randomUUID();
    const room: RoomState = {
      roomId,
      roomCode,
      status: 'lobby',
      hostPlayerId: '' as PlayerId,
      createdAtMs: nowMs(),
      config: { maxPlayers: 4 },
      members: new Map(),
      playerToSocket: new Map(),
      sockets: new Set(),
      events: [],
      lastEventSeq: 0,
      minEventSeq: 0,
      processedCommandIds: new Set(),
      lastClientSeqByPlayer: new Map(),
      pendingDisconnectTimers: new Map(),
      queue: Promise.resolve(),
      game: null,
    };
    roomsByCode.set(roomCode, room);
    roomsById.set(roomId, room);
    return room;
  }

  function ensureRoom(roomCode: RoomCode) {
    return roomsByCode.get(roomCode) ?? createRoom(roomCode);
  }

  function closeSocket(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      void 0;
    }
  }

  function onSocketClosed(ws: WebSocket) {
    const conn = connections.get(ws);
    if (!conn || !conn.roomId || !conn.playerId) return;
    const roomId = conn.roomId;
    const playerId = conn.playerId;
    const room = roomsById.get(roomId);
    if (!room) return;

    room.sockets.delete(ws);
    if (room.playerToSocket.get(playerId) === ws) room.playerToSocket.delete(playerId);

    const member = room.members.get(playerId);
    if (!member) return;
    if (!member.connected) return;

    member.connected = false;
    const base = allocEventBase(room, { causedBy: { playerId } });
    const e: Event = { ...base, type: 'room/playerConnectionChanged', playerId, connected: false };
    appendEvents(room, [e]);
    broadcast(room, {
      kind: 'events',
      roomId: room.roomId,
      gameId: room.game?.gameId ?? null,
      fromSeqExclusive: base.seq - 1,
      events: [e],
    });

    const existing = room.pendingDisconnectTimers.get(playerId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const r = roomsById.get(room.roomId);
      if (!r) return;
      const m = r.members.get(playerId);
      if (!m || m.connected) return;
      r.members.delete(playerId);
      r.lastClientSeqByPlayer.delete(playerId);
      r.pendingDisconnectTimers.delete(playerId);

      const base2 = allocEventBase(r, { causedBy: { playerId } });
      const left: Event = { ...base2, type: 'room/playerLeft', playerId };
      appendEvents(r, [left]);
      broadcast(r, {
        kind: 'events',
        roomId: r.roomId,
        gameId: r.game?.gameId ?? null,
        fromSeqExclusive: base2.seq - 1,
        events: [left],
      });

      if (r.members.size === 0) {
        roomsByCode.delete(r.roomCode);
        roomsById.delete(r.roomId);
      }
    }, reconnectWindowMs);
    room.pendingDisconnectTimers.set(playerId, timer);
  }

  async function handleRoomCommand(room: RoomState, conn: ConnectionState, command: Command, ws: WebSocket) {
    const commandId = command.commandId;
    if (room.processedCommandIds.has(commandId)) {
      sendError(ws, createProtocolError({ code: ErrorCode.DUPLICATE_COMMAND, message: '重复指令', commandId }));
      return;
    }

    let pendingClientSeq: { playerId: PlayerId; clientSeq: number } | null = null;

    const requireInRoom = () => {
      if (!conn.roomId || !conn.playerId)
        throw createProtocolError({ code: ErrorCode.NOT_IN_ROOM, message: '未加入房间', commandId });
    };

    const requireClientSeq = () => {
      if (!conn.playerId) return;
      const last = room.lastClientSeqByPlayer.get(conn.playerId) ?? -1;
      const expected = last + 1;
      if (command.clientSeq !== expected)
        throw createProtocolError({
          code: ErrorCode.OUT_OF_ORDER,
          message: '指令乱序',
          commandId,
          details: { expectedClientSeq: expected, gotClientSeq: command.clientSeq, lastClientSeq: last },
        });
      pendingClientSeq = { playerId: conn.playerId, clientSeq: command.clientSeq };
    };

    const commitClientSeq = () => {
      if (!pendingClientSeq) return;
      room.lastClientSeqByPlayer.set(pendingClientSeq.playerId, pendingClientSeq.clientSeq);
    };

    const requireSelfPlayer = (playerId: PlayerId) => {
      if (!conn.playerId || conn.playerId !== playerId)
        throw createProtocolError({ code: ErrorCode.FORBIDDEN, message: 'playerId 不匹配', commandId });
    };

    const requireNotSpectator = () => {
      if (!conn.playerId) return;
      const m = room.members.get(conn.playerId);
      if (m?.isSpectator)
        throw createProtocolError({ code: ErrorCode.NOT_A_PLAYER, message: '观战者不可执行该指令', commandId });
    };

    if (command.type === 'room/leave') {
      requireInRoom();
      requireClientSeq();
      if (command.roomId !== room.roomId)
        throw createProtocolError({ code: ErrorCode.ROOM_NOT_FOUND, message: 'roomId 不匹配', commandId });
      if (!conn.playerId) return;

      const existed = room.members.get(conn.playerId);
      room.members.delete(conn.playerId);
      room.lastClientSeqByPlayer.delete(conn.playerId);
      const t = room.pendingDisconnectTimers.get(conn.playerId);
      if (t) clearTimeout(t);
      room.pendingDisconnectTimers.delete(conn.playerId);

      if (existed) {
        const base = allocEventBase(room, { causedBy: { commandId, playerId: conn.playerId } });
        const left: Event = { ...base, type: 'room/playerLeft', playerId: conn.playerId };
        appendEvents(room, [left]);
        broadcast(room, {
          kind: 'events',
          roomId: room.roomId,
          gameId: room.game?.gameId ?? null,
          fromSeqExclusive: base.seq - 1,
          events: [left],
        });
      }

      room.processedCommandIds.add(commandId);
      closeSocket(ws, 1000, 'left');
      return;
    }

    if (command.type === 'room/setReady') {
      requireInRoom();
      requireClientSeq();
      requireSelfPlayer(command.playerId);
      requireNotSpectator();
      if (command.roomId !== room.roomId)
        throw createProtocolError({ code: ErrorCode.ROOM_NOT_FOUND, message: 'roomId 不匹配', commandId });
      const member = room.members.get(command.playerId);
      if (!member)
        throw createProtocolError({ code: ErrorCode.NOT_IN_ROOM, message: '玩家不在房间中', commandId });

      member.ready = command.ready;
      const base = allocEventBase(room, { causedBy: { commandId, playerId: command.playerId } });
      const e: Event = { ...base, type: 'room/playerReadyChanged', playerId: command.playerId, ready: command.ready };
      appendEvents(room, [e]);
      broadcast(room, {
        kind: 'events',
        roomId: room.roomId,
        gameId: room.game?.gameId ?? null,
        fromSeqExclusive: base.seq - 1,
        events: [e],
      });
      broadcast(room, { kind: 'snapshot', snapshot: buildSnapshot(room) });
      commitClientSeq();
      room.processedCommandIds.add(commandId);
      return;
    }

    if (command.type === 'room/startGame') {
      requireInRoom();
      requireClientSeq();
      requireSelfPlayer(command.playerId);
      requireNotSpectator();
      if (command.roomId !== room.roomId)
        throw createProtocolError({ code: ErrorCode.ROOM_NOT_FOUND, message: 'roomId 不匹配', commandId });
      if (room.game) throw createProtocolError({ code: ErrorCode.GAME_ALREADY_STARTED, message: '对局已开始', commandId });
      if (room.hostPlayerId !== command.playerId)
        throw createProtocolError({ code: ErrorCode.NOT_HOST, message: '仅房主可开局', commandId });

      const players = [...room.members.values()].filter((m) => !m.isSpectator);
      if (players.length < 2)
        throw createProtocolError({ code: ErrorCode.VALIDATION_FAILED, message: '至少需要 2 名玩家', commandId });
      if (players.some((p) => !p.ready))
        throw createProtocolError({ code: ErrorCode.VALIDATION_FAILED, message: '所有玩家需要准备', commandId });

      const gameId = crypto.randomUUID();
      const seed = fixedGameSeed ?? crypto.randomUUID();
      const board = boardPreset === 'e2e_fast' ? createE2EFastBoard() : createDefaultBoard();
      const result = createGame({
        roomId: room.roomId,
        gameId,
        seed,
        playerIds: players.map((p) => p.playerId),
        board,
        nowMs: nowMs(),
        ...(initialCash !== undefined ? { initialCash } : {}),
      });

      room.game = { gameId, match: result.state };
      room.status = 'playing';

      const fromSeqExclusive = room.lastEventSeq;
      const normalized = result.events.map((e) => {
        const base = allocEventBase(room, {});
        const causedBy = e.causedBy ?? { commandId, playerId: command.playerId };
        return { ...e, causedBy, eventId: base.eventId, seq: base.seq };
      });

      appendEvents(room, normalized);
      broadcast(room, {
        kind: 'events',
        roomId: room.roomId,
        gameId,
        fromSeqExclusive,
        events: normalized,
      });
      broadcast(room, { kind: 'snapshot', snapshot: buildSnapshot(room) });
      commitClientSeq();
      room.processedCommandIds.add(commandId);
      return;
    }

    if (command.type.startsWith('game/')) {
      requireInRoom();
      requireClientSeq();
      requireNotSpectator();

      if (!room.game)
        throw createProtocolError({ code: ErrorCode.GAME_NOT_STARTED, message: '对局未开始', commandId });

      const cAny = command as Extract<Command, { type: `game/${string}` }>;
      if (cAny.roomId !== room.roomId)
        throw createProtocolError({ code: ErrorCode.ROOM_NOT_FOUND, message: 'roomId 不匹配', commandId });
      if (cAny.gameId !== room.game.gameId)
        throw createProtocolError({ code: ErrorCode.GAME_NOT_FOUND, message: 'gameId 不匹配', commandId });
      if ('playerId' in cAny) requireSelfPlayer((cAny as { playerId: PlayerId }).playerId);

      const r = handleCommand(room.game.match, command, nowMs());
      room.game.match = r.state;

      const fromSeqExclusive = room.lastEventSeq;
      const normalized = r.events.map((e) => {
        const base = allocEventBase(room, e.causedBy ? { causedBy: e.causedBy } : {});
        return { ...e, eventId: base.eventId, seq: base.seq };
      });

      appendEvents(room, normalized);
      if (normalized.length > 0) {
        broadcast(room, {
          kind: 'events',
          roomId: room.roomId,
          gameId: room.game.gameId,
          fromSeqExclusive,
          events: normalized,
        });
      }

      broadcast(room, { kind: 'snapshot', snapshot: buildSnapshot(room) });
      commitClientSeq();
      room.processedCommandIds.add(commandId);
      return;
    }

    throw createProtocolError({ code: ErrorCode.INVALID_COMMAND, message: '不支持的指令', commandId });
  }

  async function handleJoinCommand(command: Extract<Command, { type: 'room/join' }>, conn: ConnectionState, ws: WebSocket) {
    const roomCode = command.roomCode.trim().toUpperCase();
    if (!roomCode) {
      sendError(ws, createProtocolError({ code: ErrorCode.VALIDATION_FAILED, message: 'roomCode 不能为空', commandId: command.commandId }));
      return;
    }

    const room = ensureRoom(roomCode);
    if (room.processedCommandIds.has(command.commandId)) {
      sendError(ws, createProtocolError({ code: ErrorCode.DUPLICATE_COMMAND, message: '重复指令', commandId: command.commandId }));
      return;
    }
    const userId = command.userId?.trim();
    const playerId: PlayerId = (userId && userId.length > 0 ? userId : `guest:${crypto.randomUUID()}`) as PlayerId;

    const clearTimer = room.pendingDisconnectTimers.get(playerId);
    if (clearTimer) clearTimeout(clearTimer);
    room.pendingDisconnectTimers.delete(playerId);

    const prevSocket = room.playerToSocket.get(playerId);
    if (prevSocket && prevSocket !== ws) closeSocket(prevSocket, 4000, 'replaced');

    const member = room.members.get(playerId);
    const mode = command.mode;
    if (member) {
      member.displayName = command.displayName;
      member.isSpectator = mode === 'spectator';
      if (!member.connected) {
        member.connected = true;
        const base = allocEventBase(room, { causedBy: { commandId: command.commandId, playerId } });
        const e: Event = {
          ...base,
          type: 'room/playerConnectionChanged',
          playerId,
          connected: true,
        };
        appendEvents(room, [e]);
        broadcast(room, {
          kind: 'events',
          roomId: room.roomId,
          gameId: room.game?.gameId ?? null,
          fromSeqExclusive: base.seq - 1,
          events: [e],
        });
      }
    } else {
      const playerCount = [...room.members.values()].filter((m) => !m.isSpectator).length;
      if (mode === 'player' && playerCount >= room.config.maxPlayers) {
        sendError(ws, createProtocolError({ code: ErrorCode.ROOM_FULL, message: '房间已满', commandId: command.commandId }));
        return;
      }

      const now = nowMs();
      const seatIndex = mode === 'player' ? playerCount : undefined;
      const next: RoomMember = {
        playerId,
        userId: userId && userId.length > 0 ? userId : playerId,
        displayName: command.displayName,
        isSpectator: mode === 'spectator',
        connected: true,
        ready: false,
        ...(seatIndex !== undefined ? { seatIndex } : {}),
        joinedAtMs: now,
      };
      room.members.set(playerId, next);
      if (!room.hostPlayerId) room.hostPlayerId = playerId;

      const base = allocEventBase(room, { causedBy: { commandId: command.commandId, playerId } });
      const e: Event = {
        ...base,
        type: 'room/playerJoined',
        player: {
          playerId,
          displayName: next.displayName,
          isSpectator: next.isSpectator,
          connected: true,
          joinedAtMs: next.joinedAtMs,
        },
      };
      appendEvents(room, [e]);
      broadcast(room, {
        kind: 'events',
        roomId: room.roomId,
        gameId: room.game?.gameId ?? null,
        fromSeqExclusive: base.seq - 1,
        events: [e],
      });
    }

    conn.roomId = room.roomId;
    conn.playerId = playerId;
    room.sockets.add(ws);
    room.playerToSocket.set(playerId, ws);

    send(ws, { kind: 'snapshot', snapshot: buildSnapshot(room) });

    const resume = command.resumeFromSeqExclusive ?? null;
    if (resume !== null) {
      if (resume < room.minEventSeq - 1) {
        sendError(
          ws,
          createProtocolError({
            code: ErrorCode.VERSION_MISMATCH,
            message: '事件游标过旧，需全量重建',
            commandId: command.commandId,
            details: { minEventSeq: room.minEventSeq },
          }),
        );
      }

      const fromSeqExclusive = Math.max(resume, room.minEventSeq - 1) as EventSeq;
      const events = getEventsAfter(room, fromSeqExclusive);
      send(ws, {
        kind: 'events',
        roomId: room.roomId,
        gameId: room.game?.gameId ?? null,
        fromSeqExclusive,
        events,
      });
    }

    room.processedCommandIds.add(command.commandId);
  }

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 404;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws: WebSocket) => {
    const conn: ConnectionState = { ws, roomId: null, playerId: null };
    connections.set(ws, conn);

    ws.on('message', (data: WebSocket.RawData) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        sendError(ws, createProtocolError({ code: ErrorCode.VALIDATION_FAILED, message: 'JSON 解析失败' }));
        return;
      }
      const validated = validateClientMessage(parsed);
      if (!validated.ok) {
        sendError(ws, issuesToProtocolError(validated.issues));
        return;
      }

      if (validated.value.kind === 'ping') {
        send(ws, { kind: 'pong', serverTimeMs: nowMs() });
        return;
      }

      const command = validated.value.command;
      if (command.type === 'room/join') {
        handleJoinCommand(command, conn, ws).catch((err) => {
          sendError(ws, mapThrownError(err, command.commandId));
        });
        return;
      }

      if (!conn.roomId) {
        sendError(ws, createProtocolError({ code: ErrorCode.NOT_IN_ROOM, message: '未加入房间', commandId: command.commandId }));
        return;
      }

      const room = roomsById.get(conn.roomId);
      if (!room) {
        sendError(ws, createProtocolError({ code: ErrorCode.ROOM_NOT_FOUND, message: '房间不存在', commandId: command.commandId }));
        return;
      }

      room.queue = room.queue
        .then(() => handleRoomCommand(room, conn, command, ws))
        .catch((err) => {
          if (typeof err === 'object' && err && 'code' in err && 'message' in err) {
            sendError(ws, err as ProtocolError);
            return;
          }
          sendError(ws, mapThrownError(err, command.commandId));
        });
    });

    ws.on('close', () => onSocketClosed(ws));
    ws.on('error', () => onSocketClosed(ws));
  });

  const port = options.port ?? Number(process.env.PORT ?? 3001);
  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  const address = server.address();
  const actualPort =
    address && typeof address === 'object' && 'port' in address && typeof address.port === 'number' ? address.port : port;

  return {
    port: actualPort,
    close: async () => {
      for (const room of roomsById.values()) {
        for (const timer of room.pendingDisconnectTimers.values()) clearTimeout(timer);
      }
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
