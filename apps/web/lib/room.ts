import crypto from 'node:crypto';

import { getServerSession } from 'next-auth/next';

import { authOptions } from 'lib/auth';
import { getGuestIdentity, type GuestIdentity } from 'lib/identity';
import { type RoomConfig } from 'lib/store';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(input: string) {
  return input.trim().toUpperCase().replaceAll(/[^A-Z0-9]/g, '');
}

export function normalizeDisplayName(input: string) {
  return input.trim().slice(0, 20);
}

export function generateRoomCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  }
  return out;
}

export type Actor =
  | {
      kind: 'user';
      userId: string;
      playerId: string;
      displayName: string;
      newGuest?: undefined;
    }
  | {
      kind: 'guest';
      guest: GuestIdentity;
      playerId: string;
      displayName: string;
      newGuest?: GuestIdentity;
    };

export async function resolveActor(options: {
  nickname?: string;
  allowGuestCreate?: boolean;
}): Promise<Actor | null> {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (uid) {
    const displayName = normalizeDisplayName(options.nickname || session?.user?.name || uid) || uid;
    return { kind: 'user', userId: uid, playerId: `user:${uid}`, displayName };
  }

  const existingGuest = getGuestIdentity();
  if (existingGuest) {
    const displayName = normalizeDisplayName(options.nickname || existingGuest.nickname) || existingGuest.id;
    return {
      kind: 'guest',
      guest: { id: existingGuest.id, nickname: displayName },
      playerId: `guest:${existingGuest.id}`,
      displayName,
    };
  }

  if (!options.allowGuestCreate) return null;
  const nickname = normalizeDisplayName(options.nickname || '游客');
  if (!nickname) return null;
  const guest: GuestIdentity = { id: crypto.randomUUID(), nickname };
  return {
    kind: 'guest',
    guest,
    newGuest: guest,
    playerId: `guest:${guest.id}`,
    displayName: guest.nickname,
  };
}

export type RoomConfigIssue = { path: keyof RoomConfig; message: string };
export type RoomConfigValidationResult =
  | { ok: true; value: RoomConfig }
  | { ok: false; issues: RoomConfigIssue[] };

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

export function validateRoomConfig(input: unknown): RoomConfigValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, issues: [{ path: 'maxPlayers', message: '配置必须为对象' }] };
  }
  const raw = input as Record<string, unknown>;
  const issues: RoomConfigIssue[] = [];

  const maxPlayers = clampInt(Number(raw.maxPlayers), 2, 16);
  if (!Number.isFinite(Number(raw.maxPlayers)) || maxPlayers !== Math.trunc(Number(raw.maxPlayers))) {
    issues.push({ path: 'maxPlayers', message: '玩家上限必须为整数' });
  }
  if (maxPlayers < 2 || maxPlayers > 16) {
    issues.push({ path: 'maxPlayers', message: '玩家上限范围为 2-16' });
  }

  const turnTimeSec = clampInt(Number(raw.turnTimeSec), 10, 600);
  if (!Number.isFinite(Number(raw.turnTimeSec)) || turnTimeSec !== Math.trunc(Number(raw.turnTimeSec))) {
    issues.push({ path: 'turnTimeSec', message: '回合时间必须为整数秒' });
  }
  if (turnTimeSec < 10 || turnTimeSec > 600) {
    issues.push({ path: 'turnTimeSec', message: '回合时间范围为 10-600 秒' });
  }

  const enableAuto = typeof raw.enableAuto === 'boolean' ? raw.enableAuto : false;
  const enableAI = typeof raw.enableAI === 'boolean' ? raw.enableAI : false;

  const parseVersionId = (key: 'rulesetVersionId' | 'boardVersionId' | 'cardsVersionId') => {
    const v = raw[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') {
      issues.push({ path: key, message: `${key} 必须为字符串` });
      return undefined;
    }
    const trimmed = v.trim();
    if (!trimmed) {
      issues.push({ path: key, message: `${key} 不能为空` });
      return undefined;
    }
    return trimmed;
  };

  const rulesetVersionId = parseVersionId('rulesetVersionId');
  const boardVersionId = parseVersionId('boardVersionId');
  const cardsVersionId = parseVersionId('cardsVersionId');

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      maxPlayers,
      turnTimeSec,
      enableAuto,
      enableAI,
      ...(rulesetVersionId ? { rulesetVersionId } : {}),
      ...(boardVersionId ? { boardVersionId } : {}),
      ...(cardsVersionId ? { cardsVersionId } : {}),
    },
  };
}
