import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ConfigDoc } from './config';

export type Profile = {
  id: string;
  displayName: string;
  githubAvatarUrl?: string | null;
  customAvatarDataUrl?: string | null;
  customAvatarMime?: 'image/png' | 'image/jpeg' | 'image/webp' | null;
  avatarUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Invite = {
  code: string;
  inviterId: string;
  createdAt: string;
  usedBy?: string;
  usedAt?: string;
  uses?: number;
  maxUses?: number;
  expiresAt?: string;
};

export type AuditEntry = {
  id: string;
  atMs: number;
  actorUid: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: unknown;
};

export type GameInviteMessage = {
  id: string;
  toUid: string;
  fromUid: string;
  roomCode: string;
  createdAtMs: number;
  readAtMs?: number;
  dismissedAtMs?: number;
};

export type Participant = {
  kind: 'user' | 'guest';
  id: string;
  nickname: string;
  joinedAt: string;
};

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export type RoomConfig = {
  maxPlayers: number;
  turnTimeSec: number;
  enableAuto: boolean;
  enableAI: boolean;
  templateVersionId?: string;
  rulesetVersionId?: string;
  boardVersionId?: string;
  cardsVersionId?: string;
};

export type RoomMember = {
  playerId: string;
  userId?: string;
  displayName: string;
  isSpectator: boolean;
  ready: boolean;
  joinedAtMs: number;
};

export type Room = {
  code: string;
  roomId: string;
  status: RoomStatus;
  hostPlayerId: string;
  createdAtMs: number;
  config: RoomConfig;
  members: RoomMember[];
  startedAtMs?: number;
  endedAtMs?: number;
  emptySinceMs?: number;
  closedAtMs?: number;
};

export type MatchRecord = {
  id: string;
  roomCode: string;
  gameId: string;
  roomId: string;
  hostPlayerId: string;
  participants: RoomMember[];
  endedAtMs: number;
  configSnapshot: RoomConfig;
  hiddenByUids?: string[];
};

export type AppData = {
  profiles: Record<string, Profile>;
  invites: Record<string, Invite>;
  friends: Record<string, string[]>;
  rooms: Record<string, Room>;
  matchRecords: MatchRecord[];
  configDocs: Record<string, ConfigDoc>;
  audit: AuditEntry[];
  gameInvites: GameInviteMessage[];
};

const defaultData: AppData = {
  profiles: {},
  invites: {},
  friends: {},
  rooms: {},
  matchRecords: [],
  configDocs: {},
  audit: [],
  gameInvites: [],
};

function coerceBoolean(input: unknown, fallback: boolean) {
  return typeof input === 'boolean' ? input : fallback;
}

function coerceNumber(input: unknown, fallback: number) {
  return typeof input === 'number' && Number.isFinite(input) ? input : fallback;
}

function coerceString(input: unknown, fallback: string) {
  return typeof input === 'string' ? input : fallback;
}

function coerceStringOrNull(input: unknown): string | null {
  return input === null ? null : typeof input === 'string' ? input : null;
}

function playerIdFromParticipant(p: Participant) {
  return `${p.kind}:${p.id}`;
}

function defaultRoomConfig(): RoomConfig {
  return { maxPlayers: 4, turnTimeSec: 60, enableAuto: false, enableAI: false };
}

function coerceRoomConfig(input: unknown): RoomConfig {
  const v = (typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  return {
    maxPlayers: Math.trunc(coerceNumber(v.maxPlayers, 4)),
    turnTimeSec: Math.trunc(coerceNumber(v.turnTimeSec, 60)),
    enableAuto: coerceBoolean(v.enableAuto, false),
    enableAI: coerceBoolean(v.enableAI, false),
    ...(typeof v.templateVersionId === 'string' && v.templateVersionId ? { templateVersionId: v.templateVersionId } : {}),
    ...(typeof v.rulesetVersionId === 'string' && v.rulesetVersionId ? { rulesetVersionId: v.rulesetVersionId } : {}),
    ...(typeof v.boardVersionId === 'string' && v.boardVersionId ? { boardVersionId: v.boardVersionId } : {}),
    ...(typeof v.cardsVersionId === 'string' && v.cardsVersionId ? { cardsVersionId: v.cardsVersionId } : {}),
  };
}

function coerceConfigVersion(input: unknown) {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  const versionId = typeof r.versionId === 'string' && r.versionId ? r.versionId : null;
  const status = r.status === 'draft' || r.status === 'published' || r.status === 'archived' ? r.status : null;
  const createdAtMs = coerceNumber(r.createdAtMs, Date.now());
  const updatedAtMs = coerceNumber(r.updatedAtMs, createdAtMs);
  if (!versionId || !status) return null;
  const baseVersionId = typeof r.baseVersionId === 'string' && r.baseVersionId ? r.baseVersionId : undefined;
  const note = typeof r.note === 'string' && r.note ? r.note : undefined;
  return {
    versionId,
    status,
    createdAtMs,
    updatedAtMs,
    data: (r as { data?: unknown }).data,
    ...(baseVersionId ? { baseVersionId } : {}),
    ...(note ? { note } : {}),
  } satisfies ConfigDoc['versions'][string];
}

function coerceConfigDoc(input: unknown, docIdKey: string): ConfigDoc | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  const docId = coerceString(r.docId, docIdKey);
  const kind = r.kind === 'rules' || r.kind === 'board' || r.kind === 'cards' || r.kind === 'template' ? r.kind : null;
  if (!kind) return null;
  const createdAtMs = coerceNumber(r.createdAtMs, Date.now());
  const updatedAtMs = coerceNumber(r.updatedAtMs, createdAtMs);
  const name = coerceString(r.name, `${kind}:${docId}`);
  const ownerRaw = (r as { ownerId?: unknown }).ownerId;
  const ownerId = ownerRaw === undefined ? undefined : coerceStringOrNull(ownerRaw);
  const visibilityRaw = (r as { visibility?: unknown }).visibility;
  const visibility = visibilityRaw === 'private' || visibilityRaw === 'public' ? visibilityRaw : undefined;

  const versionsRaw =
    typeof (r as { versions?: unknown }).versions === 'object' && (r as { versions?: unknown }).versions !== null
      ? ((r as { versions: Record<string, unknown> }).versions as Record<string, unknown>)
      : {};
  const versions: ConfigDoc['versions'] = {};
  for (const [key, value] of Object.entries(versionsRaw)) {
    const v = coerceConfigVersion(value);
    if (v) versions[key] = v;
  }

  const versionIds =
    Array.isArray(r.versionIds) && r.versionIds.every((x) => typeof x === 'string')
      ? (r.versionIds as string[])
      : Object.keys(versions);

  const draftVersionId = typeof r.draftVersionId === 'string' ? r.draftVersionId : versionIds[0] ?? '';
  if (!draftVersionId || !versions[draftVersionId]) return null;

  const publishedVersionId = coerceStringOrNull(r.publishedVersionId);
  return {
    docId,
    kind,
    name,
    ...(ownerRaw === undefined ? {} : { ownerId }),
    ...(typeof visibility !== 'undefined' ? { visibility } : {}),
    createdAtMs,
    updatedAtMs,
    publishedVersionId: publishedVersionId && versions[publishedVersionId] ? publishedVersionId : null,
    draftVersionId,
    versionIds,
    versions,
  };
}

function coerceRoom(input: unknown, roomCode: string): Room | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  const code = typeof r.code === 'string' && r.code ? r.code : roomCode;
  const roomId = typeof r.roomId === 'string' && r.roomId ? r.roomId : `room:${code}`;
  const status =
    r.status === 'lobby' || r.status === 'playing' || r.status === 'ended' ? r.status : ('lobby' as const);
  const createdAtMs = coerceNumber(r.createdAtMs, Date.now());
  const startedAtMs = typeof r.startedAtMs === 'number' && Number.isFinite(r.startedAtMs) ? r.startedAtMs : undefined;
  const endedAtMs = typeof r.endedAtMs === 'number' && Number.isFinite(r.endedAtMs) ? r.endedAtMs : undefined;
  const emptySinceMs = typeof r.emptySinceMs === 'number' && Number.isFinite(r.emptySinceMs) ? r.emptySinceMs : undefined;
  const closedAtMs = typeof r.closedAtMs === 'number' && Number.isFinite(r.closedAtMs) ? r.closedAtMs : undefined;
  const config = r.config ? coerceRoomConfig(r.config) : defaultRoomConfig();

  if (Array.isArray(r.members)) {
    const members: RoomMember[] = r.members
      .map((m) => {
        if (typeof m !== 'object' || m === null) return null;
        const mm = m as Record<string, unknown>;
        const playerId = typeof mm.playerId === 'string' ? mm.playerId : '';
        if (!playerId) return null;
        const displayName = typeof mm.displayName === 'string' ? mm.displayName : playerId;
        const userId = typeof mm.userId === 'string' ? mm.userId : undefined;
        const isSpectator = coerceBoolean(mm.isSpectator, false);
        const ready = coerceBoolean(mm.ready, false);
        const joinedAtMs = coerceNumber(mm.joinedAtMs, createdAtMs);
        return {
          playerId,
          ...(userId ? { userId } : {}),
          displayName,
          isSpectator,
          ready,
          joinedAtMs,
        };
      })
      .filter((x): x is RoomMember => !!x);

    const hostPlayerId =
      typeof r.hostPlayerId === 'string' && r.hostPlayerId ? r.hostPlayerId : members[0]?.playerId || 'unknown';
    return {
      code,
      roomId,
      status,
      hostPlayerId,
      createdAtMs,
      config,
      members,
      ...(startedAtMs ? { startedAtMs } : {}),
      ...(endedAtMs ? { endedAtMs } : {}),
      ...(emptySinceMs ? { emptySinceMs } : {}),
      ...(closedAtMs ? { closedAtMs } : {}),
    };
  }

  if (Array.isArray(r.participants)) {
    const participants = r.participants
      .map((p) => {
        if (typeof p !== 'object' || p === null) return null;
        const pp = p as Record<string, unknown>;
        const kind = pp.kind === 'user' || pp.kind === 'guest' ? pp.kind : null;
        const id = typeof pp.id === 'string' ? pp.id : '';
        const nickname = typeof pp.nickname === 'string' ? pp.nickname : '';
        const joinedAt = typeof pp.joinedAt === 'string' ? pp.joinedAt : '';
        if (!kind || !id) return null;
        return { kind, id, nickname, joinedAt } satisfies Participant;
      })
      .filter((x): x is Participant => !!x);

    const members: RoomMember[] = participants.map((p) => ({
      playerId: playerIdFromParticipant(p),
      ...(p.kind === 'user' ? { userId: p.id } : {}),
      displayName: p.nickname || p.id,
      isSpectator: false,
      ready: false,
      joinedAtMs: Number.isFinite(Date.parse(p.joinedAt)) ? Date.parse(p.joinedAt) : createdAtMs,
    }));

    const hostPlayerId = members[0]?.playerId || 'unknown';
    return { code, roomId, status: 'lobby', hostPlayerId, createdAtMs, config, members, ...(emptySinceMs ? { emptySinceMs } : {}) };
  }

  return {
    code,
    roomId,
    status,
    hostPlayerId: typeof r.hostPlayerId === 'string' && r.hostPlayerId ? r.hostPlayerId : 'unknown',
    createdAtMs,
    config,
    members: [],
    ...(startedAtMs ? { startedAtMs } : {}),
    ...(endedAtMs ? { endedAtMs } : {}),
    ...(emptySinceMs ? { emptySinceMs } : {}),
    ...(closedAtMs ? { closedAtMs } : {}),
  };
}

function coerceMatchRecord(input: unknown): MatchRecord | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id ? r.id : null;
  const roomCode = typeof r.roomCode === 'string' && r.roomCode ? r.roomCode.trim().toUpperCase() : null;
  const gameId = typeof r.gameId === 'string' && r.gameId ? r.gameId : null;
  const roomId = typeof r.roomId === 'string' && r.roomId ? r.roomId : null;
  const hostPlayerId = typeof r.hostPlayerId === 'string' && r.hostPlayerId ? r.hostPlayerId : null;
  const endedAtMs = coerceNumber(r.endedAtMs, 0);
  if (!id || !roomCode || !gameId || !roomId || !hostPlayerId || !endedAtMs) return null;

  const configSnapshot = r.configSnapshot ? coerceRoomConfig(r.configSnapshot) : defaultRoomConfig();

  const participantsRaw = Array.isArray(r.participants) ? (r.participants as unknown[]) : [];
  const participants: RoomMember[] = participantsRaw
    .map((m) => {
      if (typeof m !== 'object' || m === null) return null;
      const mm = m as Record<string, unknown>;
      const playerId = typeof mm.playerId === 'string' ? mm.playerId : '';
      if (!playerId) return null;
      const displayName = typeof mm.displayName === 'string' ? mm.displayName : playerId;
      const userId = typeof mm.userId === 'string' ? mm.userId : undefined;
      const isSpectator = coerceBoolean(mm.isSpectator, false);
      const ready = coerceBoolean(mm.ready, false);
      const joinedAtMs = coerceNumber(mm.joinedAtMs, Date.now());
      return {
        playerId,
        ...(userId ? { userId } : {}),
        displayName,
        isSpectator,
        ready,
        joinedAtMs,
      } satisfies RoomMember;
    })
    .filter((x): x is RoomMember => !!x);

  const hiddenByUids =
    Array.isArray((r as { hiddenByUids?: unknown }).hiddenByUids) &&
    (r as { hiddenByUids: unknown[] }).hiddenByUids.every((x) => typeof x === 'string')
      ? ((r as { hiddenByUids: string[] }).hiddenByUids as string[])
      : undefined;

  return {
    id,
    roomCode,
    gameId,
    roomId,
    hostPlayerId,
    participants,
    endedAtMs,
    configSnapshot,
    ...(hiddenByUids?.length ? { hiddenByUids } : {}),
  };
}

function dataFilePath() {
  return path.join(process.cwd(), '.data', 'neoblock.json');
}

async function ensureDataDir() {
  await mkdir(path.dirname(dataFilePath()), { recursive: true });
}

export async function readAppData(): Promise<AppData> {
  await ensureDataDir();
  try {
    const raw = await readFile(dataFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as AppData;
    const roomsRaw =
      typeof (parsed as unknown as { rooms?: unknown }).rooms === 'object' &&
      (parsed as unknown as { rooms?: unknown }).rooms !== null
        ? ((parsed as unknown as { rooms: Record<string, unknown> }).rooms as Record<string, unknown>)
        : {};
    const rooms: Record<string, Room> = {};
    for (const [code, value] of Object.entries(roomsRaw)) {
      const roomCode = code.trim().toUpperCase() || code;
      const coerced = coerceRoom(value, roomCode);
      if (coerced) rooms[roomCode] = coerced;
    }

    const configDocsRaw =
      typeof (parsed as unknown as { configDocs?: unknown }).configDocs === 'object' &&
      (parsed as unknown as { configDocs?: unknown }).configDocs !== null
        ? ((parsed as unknown as { configDocs: Record<string, unknown> }).configDocs as Record<string, unknown>)
        : {};
    const configDocs: Record<string, ConfigDoc> = {};
    for (const [docId, value] of Object.entries(configDocsRaw)) {
      const coerced = coerceConfigDoc(value, docId);
      if (coerced) configDocs[coerced.docId] = coerced;
    }

    const auditRaw = Array.isArray((parsed as unknown as { audit?: unknown }).audit)
      ? ((parsed as unknown as { audit: unknown[] }).audit as unknown[])
      : [];
    const audit: AuditEntry[] = auditRaw
      .map((x) => {
        if (typeof x !== 'object' || x === null) return null;
        const r = x as Record<string, unknown>;
        const id = typeof r.id === 'string' && r.id ? r.id : null;
        const atMs = coerceNumber(r.atMs, 0);
        const actorUid = typeof r.actorUid === 'string' && r.actorUid ? r.actorUid : null;
        const action = typeof r.action === 'string' && r.action ? r.action : null;
        if (!id || !actorUid || !action || !atMs) return null;
        const targetType = typeof r.targetType === 'string' && r.targetType ? r.targetType : undefined;
        const targetId = typeof r.targetId === 'string' && r.targetId ? r.targetId : undefined;
        const detail = (r as { detail?: unknown }).detail;
        const entry: AuditEntry = {
          id,
          atMs,
          actorUid,
          action,
          ...(targetType ? { targetType } : {}),
          ...(targetId ? { targetId } : {}),
          ...(typeof detail === 'undefined' ? {} : { detail }),
        };
        return entry;
      })
      .filter((x): x is AuditEntry => x !== null);

    const gameInvitesRaw = Array.isArray((parsed as unknown as { gameInvites?: unknown }).gameInvites)
      ? ((parsed as unknown as { gameInvites: unknown[] }).gameInvites as unknown[])
      : [];
    const gameInvites: GameInviteMessage[] = gameInvitesRaw
      .map((x) => {
        if (typeof x !== 'object' || x === null) return null;
        const r = x as Record<string, unknown>;
        const id = typeof r.id === 'string' && r.id ? r.id : null;
        const toUid = typeof r.toUid === 'string' && r.toUid ? r.toUid : null;
        const fromUid = typeof r.fromUid === 'string' && r.fromUid ? r.fromUid : null;
        const roomCode = typeof r.roomCode === 'string' && r.roomCode ? r.roomCode : null;
        const createdAtMs = coerceNumber(r.createdAtMs, 0);
        if (!id || !toUid || !fromUid || !roomCode || !createdAtMs) return null;
        const readAtMs = typeof r.readAtMs === 'number' && Number.isFinite(r.readAtMs) ? r.readAtMs : undefined;
        const dismissedAtMs = typeof r.dismissedAtMs === 'number' && Number.isFinite(r.dismissedAtMs) ? r.dismissedAtMs : undefined;
        const msg: GameInviteMessage = {
          id,
          toUid,
          fromUid,
          roomCode,
          createdAtMs,
          ...(readAtMs ? { readAtMs } : {}),
          ...(dismissedAtMs ? { dismissedAtMs } : {}),
        };
        return msg;
      })
      .filter((x): x is GameInviteMessage => x !== null);

    const matchRecordsRaw = Array.isArray((parsed as unknown as { matchRecords?: unknown }).matchRecords)
      ? ((parsed as unknown as { matchRecords: unknown[] }).matchRecords as unknown[])
      : [];
    const matchRecords: MatchRecord[] = matchRecordsRaw
      .map((x) => coerceMatchRecord(x))
      .filter((x): x is MatchRecord => x !== null);
    return {
      profiles: parsed.profiles ?? {},
      invites: parsed.invites ?? {},
      friends: parsed.friends ?? {},
      rooms,
      matchRecords,
      configDocs,
      audit,
      gameInvites,
    };
  } catch {
    return structuredClone(defaultData);
  }
}

export async function writeAppData(data: AppData) {
  await ensureDataDir();
  await writeFile(dataFilePath(), JSON.stringify(data, null, 2), 'utf8');
}

export async function updateAppData<T>(fn: (data: AppData) => T | Promise<T>): Promise<T> {
  const data = await readAppData();
  const result = await fn(data);
  await writeAppData(data);
  return result;
}
