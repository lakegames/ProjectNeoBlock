"use client";

import * as React from 'react';

import {
  type ClientMessage,
  type Command,
  type Event,
  type MatchSnapshot,
  type ProtocolError,
  type ServerMessage,
} from '@neoblock/shared';

type CommandInput = Command extends infer C ? (C extends unknown ? Omit<C, 'commandId' | 'clientSeq'> : never) : never;

type Actor =
  | { kind: 'user'; playerId: string; userId: string; displayName: string }
  | { kind: 'guest'; playerId: string; displayName: string };

type CardDrawn = {
  eventId: string;
  createdAtMs: number;
  deck: 'chance' | 'communityChest';
  cardId: string;
  playerId: string;
};

export type ChatMessage = {
  eventId: string;
  createdAtMs: number;
  fromPlayerId: string;
  toPlayerId?: string;
  text: string;
};

export type RoomConnectionDebugDump = {
  kind: 'neoblock-debug';
  version: 1;
  at: string;
  roomCode: string;
  mode: 'player' | 'spectator';
  url: string | null;
  userAgent: string | null;
  actor: Actor | null;
  connected: boolean;
  connecting: boolean;
  pending: null | { commandId: string; clientSeq: number; command: Command; retries: number };
  lastError: ProtocolError | null;
  snapshot: MatchSnapshot | null;
  recentCommands: Command[];
  recentEvents: Event[];
  chatMessages: ChatMessage[];
};

export type UseRoomConnectionResult = {
  actor: Actor | null;
  identifyGuest: (nickname: string) => Promise<Actor>;
  snapshot: MatchSnapshot | null;
  connected: boolean;
  connecting: boolean;
  lastError: ProtocolError | null;
  sendCommand: (command: CommandInput) => void;
  pending: boolean;
  lastCardDrawn: CardDrawn | null;
  clearLastCard: () => void;
  getDebugDump: () => RoomConnectionDebugDump;
  chatMessages: ChatMessage[];
  recentEvents50: Event[];
  recentEvents200: Event[];
};

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `c_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function getWsUrl() {
  const env = process.env.NEXT_PUBLIC_SERVER_WS_URL;
  if (env) return env;
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname}:3001/ws`;
}

async function fetchActor(): Promise<Actor | null> {
  const r = await fetch('/api/actor', { cache: 'no-store' });
  const json = (await r.json().catch(() => null)) as { actor?: Actor | null } | null;
  return (json?.actor ?? null) as Actor | null;
}

async function ensureGuest(nickname: string): Promise<Actor> {
  const r = await fetch('/api/actor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  const json = (await r.json().catch(() => null)) as { actor?: Actor | null; error?: string } | null;
  if (!r.ok) throw new Error(json?.error || 'IDENTITY_FAILED');
  const actor = json?.actor ?? null;
  if (!actor) throw new Error('IDENTITY_FAILED');
  return actor;
}

export function useRoomConnection(options: {
  roomCode: string;
  mode: 'player' | 'spectator';
  initialNickname?: string;
}): UseRoomConnectionResult {
  const roomCode = options.roomCode.trim().toUpperCase();

  const [actor, setActor] = React.useState<Actor | null>(null);
  const [snapshot, setSnapshot] = React.useState<MatchSnapshot | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [lastError, setLastError] = React.useState<ProtocolError | null>(null);
  const [lastCardDrawn, setLastCardDrawn] = React.useState<CardDrawn | null>(null);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [recentEvents200, setRecentEvents200] = React.useState<Event[]>([]);
  const [recentEvents50, setRecentEvents50] = React.useState<Event[]>([]);

  const wsRef = React.useRef<WebSocket | null>(null);
  const connectRef = React.useRef<(a: Actor) => void>(() => {});
  const reconnectTimerRef = React.useRef<number | null>(null);
  const reconnectAttemptRef = React.useRef(0);

  const actorRef = React.useRef<Actor | null>(null);
  React.useEffect(() => {
    actorRef.current = actor;
  }, [actor]);

  const lastEventSeqRef = React.useRef<number>(0);
  const nextClientSeqRef = React.useRef<number>(0);
  const pendingRef = React.useRef<null | { commandId: string; clientSeq: number; command: Command; retries: number }>(null);
  const recentEventsRef = React.useRef<Event[]>([]);
  const recentCommandsRef = React.useRef<Command[]>([]);

  const clearReconnectTimer = React.useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const sendRaw = React.useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const join = React.useCallback(
    (a: Actor) => {
      if (!roomCode) return;
      const commandId = uuid();
      const msg: ClientMessage = {
        kind: 'command',
        command: {
          type: 'room/join',
          commandId,
          clientSeq: 0,
          roomCode,
          userId: a.playerId,
          displayName: a.displayName,
          mode: options.mode,
          resumeFromSeqExclusive: lastEventSeqRef.current,
        },
      };
      sendRaw(msg);
    },
    [options.mode, roomCode, sendRaw],
  );

  const onServerMessage = React.useCallback((parsed: ServerMessage) => {
    if (parsed.kind === 'snapshot') {
      setSnapshot(parsed.snapshot);
      lastEventSeqRef.current = parsed.snapshot.cursor.lastEventSeq;
      return;
    }

    if (parsed.kind === 'events') {
      if (parsed.events.length > 0) {
        const maxSeq = parsed.events.reduce((m, e) => Math.max(m, e.seq), lastEventSeqRef.current);
        lastEventSeqRef.current = maxSeq;
      }

      if (parsed.events.length) {
        const next200 = [...recentEventsRef.current, ...parsed.events].slice(-200);
        recentEventsRef.current = next200;
        setRecentEvents200(next200);
        setRecentEvents50(next200.slice(-50));
      }

      const nextChats: ChatMessage[] = [];
      const selfId = actorRef.current?.playerId ?? null;
      for (const e of parsed.events) {
        if (e.type !== 'room/chatMessage') continue;
        const ce = e as Extract<Event, { type: 'room/chatMessage' }>;
        if (ce.toPlayerId && selfId && ce.fromPlayerId !== selfId && ce.toPlayerId !== selfId) continue;
        if (ce.toPlayerId && !selfId) continue;
        nextChats.push({
          eventId: ce.eventId,
          createdAtMs: ce.createdAtMs,
          fromPlayerId: ce.fromPlayerId,
          text: ce.text,
          ...(ce.toPlayerId ? { toPlayerId: ce.toPlayerId } : {}),
        });
      }
      if (nextChats.length) {
        setChatMessages((s) => [...s, ...nextChats].slice(-60));
      }

      const pending = pendingRef.current;
      if (pending) {
        const ok = parsed.events.some((e) => e.causedBy?.commandId === pending.commandId);
        if (ok) {
          pendingRef.current = null;
          nextClientSeqRef.current = pending.clientSeq + 1;
        }
      }

      const lastCard = [...parsed.events]
        .reverse()
        .find((e) => e.type === 'game/engine' && (e as Extract<Event, { type: 'game/engine' }>).name === 'card/drawn');
      if (lastCard && lastCard.type === 'game/engine') {
        const data = lastCard.data as { deck: 'chance' | 'communityChest'; cardId: string; playerId: string };
        setLastCardDrawn({
          eventId: lastCard.eventId,
          createdAtMs: lastCard.createdAtMs,
          deck: data.deck,
          cardId: data.cardId,
          playerId: data.playerId,
        });
      }

      return;
    }

    if (parsed.kind === 'error') {
      if (parsed.error.code === 'OUT_OF_ORDER') {
        const expected = (parsed.error.details as { expectedClientSeq?: unknown } | undefined)?.expectedClientSeq;
        if (typeof expected === 'number' && Number.isFinite(expected) && expected >= 0) {
          const pending = pendingRef.current;
          if (pending && parsed.error.commandId === pending.commandId && pending.retries < 1) {
            nextClientSeqRef.current = expected;
            const commandId = uuid();
            const msg: ClientMessage = {
              kind: 'command',
              command: { ...pending.command, commandId, clientSeq: expected } as Command,
            };
            pendingRef.current = { commandId, clientSeq: expected, command: msg.command as Command, retries: pending.retries + 1 };
            setLastError(null);
            recentCommandsRef.current = [...recentCommandsRef.current, msg.command as Command].slice(-100);
            if (sendRaw(msg)) return;
            pendingRef.current = null;
          }
          nextClientSeqRef.current = expected;
        }
      }
      setLastError(parsed.error);
      const pending = pendingRef.current;
      if (pending && parsed.error.commandId === pending.commandId) {
        pendingRef.current = null;
      }
    }
  }, [sendRaw]);

  const connect = React.useCallback(
    (a: Actor) => {
      clearReconnectTimer();
      if (!roomCode) return;
      const prev = wsRef.current;
      if (prev) {
        try {
          prev.close();
        } catch {
          void 0;
        }
      }

      setConnecting(true);
      setLastError(null);

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        reconnectAttemptRef.current = 0;
        setConnected(true);
        setConnecting(false);
        join(a);
      });

      ws.addEventListener('message', (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : '';
        if (!raw) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw) as unknown;
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== 'object') return;
        const kind = (parsed as { kind?: unknown }).kind;
        if (kind !== 'snapshot' && kind !== 'events' && kind !== 'error') return;
        onServerMessage(parsed as ServerMessage);
      });

      const scheduleReconnect = () => {
        setConnected(false);
        setConnecting(false);
        if (!roomCode) return;
        const attempt = (reconnectAttemptRef.current += 1);
        const delay = Math.min(8_000, 800 + attempt * 700);
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => connectRef.current(a), delay);
      };

      ws.addEventListener('close', scheduleReconnect);
      ws.addEventListener('error', scheduleReconnect);
    },
    [clearReconnectTimer, join, onServerMessage, roomCode],
  );
  connectRef.current = connect;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = await fetchActor();
      if (cancelled) return;
      if (options.mode === 'player') {
        if (a?.kind === 'user') setActor(a);
        else setActor(null);
        return;
      }

      if (a) {
        setActor(a);
        return;
      }

      try {
        const g = await ensureGuest(options.initialNickname ?? '观众');
        if (cancelled) return;
        setActor(g);
      } catch {
        setActor(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [options.initialNickname, options.mode]);

  React.useEffect(() => {
    if (!actor || !roomCode) return;
    connect(actor);
    return () => {
      clearReconnectTimer();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          void 0;
        }
      }
    };
  }, [actor, clearReconnectTimer, connect, roomCode]);

  const identifyGuest = React.useCallback(async (nickname: string) => {
    const a = await ensureGuest(nickname);
    setActor(a);
    return a;
  }, []);

  const sendCommand = React.useCallback(
    (command: CommandInput) => {
      const a = actor;
      if (!a) return;
      if (pendingRef.current) return;
      const commandId = uuid();
      const clientSeq = nextClientSeqRef.current;
      setLastError(null);
      const msg: ClientMessage = {
        kind: 'command',
        command: { ...(command as Command), commandId, clientSeq } as Command,
      };
      pendingRef.current = { commandId, clientSeq, command: msg.command as Command, retries: 0 };
      recentCommandsRef.current = [...recentCommandsRef.current, msg.command].slice(-100);
      sendRaw(msg);
    },
    [actor, sendRaw],
  );

  const clearLastCard = React.useCallback(() => setLastCardDrawn(null), []);

  const getDebugDump = React.useCallback((): RoomConnectionDebugDump => {
    return {
      kind: 'neoblock-debug',
      version: 1,
      at: new Date().toISOString(),
      roomCode,
      mode: options.mode,
      url: typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      actor,
      connected,
      connecting,
      pending: pendingRef.current,
      lastError,
      snapshot,
      recentCommands: recentCommandsRef.current,
      recentEvents: recentEventsRef.current,
      chatMessages,
    };
  }, [actor, chatMessages, connected, connecting, lastError, options.mode, roomCode, snapshot]);

  return {
    actor,
    identifyGuest,
    snapshot,
    connected,
    connecting,
    lastError,
    sendCommand,
    pending: pendingRef.current !== null,
    lastCardDrawn,
    clearLastCard,
    getDebugDump,
    chatMessages,
    recentEvents50,
    recentEvents200,
  };
}
