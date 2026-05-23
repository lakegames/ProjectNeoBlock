import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { effectiveTemplateVisibility, ensureSeedConfigs, listDocs, type AppDataStore, type RoomConfig, type RoomMember } from './store.js';

const inviteTtlMs = 7 * 24 * 3600 * 1000;
const roomEmptyCloseMs = 3 * 60 * 1000;

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeRoomCode(input: string) {
  return input.trim().toUpperCase().replaceAll(/[^A-Z0-9]/g, '');
}

function normalizeDisplayName(input: string) {
  return input.trim().slice(0, 20);
}

function generateRoomCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  }
  return out;
}

type RoomConfigIssue = { path: keyof RoomConfig; message: string };
type RoomConfigValidationResult = { ok: true; value: RoomConfig } | { ok: false; issues: RoomConfigIssue[] };

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function validateRoomConfig(input: unknown): RoomConfigValidationResult {
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

  const parseVersionId = (key: 'templateVersionId' | 'rulesetVersionId' | 'boardVersionId' | 'cardsVersionId') => {
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

  const templateVersionId = parseVersionId('templateVersionId');
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
      ...(templateVersionId ? { templateVersionId } : {}),
      ...(rulesetVersionId ? { rulesetVersionId } : {}),
      ...(boardVersionId ? { boardVersionId } : {}),
      ...(cardsVersionId ? { cardsVersionId } : {}),
    },
  };
}

function defaultRoomConfig(): RoomConfig {
  return { maxPlayers: 4, turnTimeSec: 60, enableAuto: false, enableAI: false };
}

function shouldCloseRoomByEmpty(room: { members: unknown[]; emptySinceMs?: number; closedAtMs?: number }, nowMs: number) {
  if (room.closedAtMs) return false;
  if (room.members.length) return false;
  if (!room.emptySinceMs) return false;
  return nowMs - room.emptySinceMs >= roomEmptyCloseMs;
}

function getHeader(req: IncomingMessage, key: string) {
  const v = req.headers[key.toLowerCase()];
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

function proxyAuthOk(req: IncomingMessage) {
  const expected = process.env.NEOBLOCK_PROXY_KEY;
  if (!expected) return { ok: false as const, status: 500, body: { error: 'PROXY_KEY_NOT_CONFIGURED' } };
  const got = getHeader(req, 'x-neoblock-proxy-key');
  if (!got || got !== expected) return { ok: false as const, status: 403, body: { error: 'FORBIDDEN' } };
  return { ok: true as const };
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function avatarInfoFor(profile: {
  id: string;
  githubAvatarUrl?: string | null;
  customAvatarMime?: string | null;
  avatarUpdatedAt?: string | null;
}) {
  if (profile.customAvatarMime) {
    const t = profile.avatarUpdatedAt || '';
    return {
      avatarKind: 'custom' as const,
      avatarUrl: `/api/profile/avatar?userId=${encodeURIComponent(profile.id)}&t=${encodeURIComponent(t)}`,
    };
  }
  if (profile.githubAvatarUrl) {
    return { avatarKind: 'github' as const, avatarUrl: profile.githubAvatarUrl };
  }
  return { avatarKind: 'none' as const, avatarUrl: null };
}

function fallbackDisplayName(id: string) {
  return id.split(':').at(-1) || id;
}

function validateGithubAvatarUrl(input: unknown) {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (!v || v.length > 500) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function makeMember(input: {
  playerId: string;
  userId?: string | undefined;
  displayName: string;
  isSpectator: boolean;
  joinedAtMs: number;
}): RoomMember {
  return {
    playerId: input.playerId,
    ...(input.userId ? { userId: input.userId } : {}),
    displayName: input.displayName,
    isSpectator: input.isSpectator,
    ready: false,
    joinedAtMs: input.joinedAtMs,
  };
}

function parseActor(req: IncomingMessage) {
  const playerId = getHeader(req, 'x-neoblock-actor-player-id');
  if (playerId) return { playerId };

  const uid = getHeader(req, 'x-neoblock-actor-uid');
  if (uid) return { playerId: `user:${uid}`, uid };

  const guestId = getHeader(req, 'x-neoblock-guest-id');
  if (guestId) return { playerId: `guest:${guestId}`, guestId };

  return null;
}

function ensureUser(req: IncomingMessage) {
  const uid = getHeader(req, 'x-neoblock-actor-uid');
  if (!uid) return null;
  const displayName = normalizeDisplayName(getHeader(req, 'x-neoblock-actor-display-name') || uid) || uid;
  const githubAvatarUrl = validateGithubAvatarUrl(getHeader(req, 'x-neoblock-actor-github-avatar-url'));
  return { uid, displayName, githubAvatarUrl };
}

function ensureGuest(req: IncomingMessage, inputNickname: string | null, allowCreate: boolean) {
  const existingId = getHeader(req, 'x-neoblock-guest-id');
  const headerNickname = getHeader(req, 'x-neoblock-guest-nickname');
  const nickname = normalizeDisplayName(inputNickname || headerNickname || '游客');
  if (!nickname) return null;

  if (existingId) {
    return { guestId: existingId, nickname, newGuest: null };
  }
  if (!allowCreate) return null;
  const guestId = crypto.randomUUID();
  return { guestId, nickname, newGuest: { id: guestId, nickname } };
}

export function createAppDataHttpHandler(store: AppDataStore) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const auth = proxyAuthOk(req);
    if (!auth.ok) {
      sendJson(res, auth.status, auth.body);
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/config/published' && req.method === 'GET') {
      const uid = getHeader(req, 'x-neoblock-actor-uid')?.trim() || null;

      const data = await store.read();
      const full = data.configDocs['builtin:board-full'];
      const sysTpl = data.configDocs['system:template-standard'];
      const legacyTpl = data.configDocs['builtin:template-standard'];
      const hasDefaultTpl = !!(sysTpl?.publishedVersionId || legacyTpl?.publishedVersionId);
      if (!Object.keys(data.configDocs).length || !full || !full.publishedVersionId || !hasDefaultTpl) {
        await store.update((d) => {
          ensureSeedConfigs(d, Date.now());
        });
      }

      const data2 = await store.read();
      const mapKind = (kind: 'rules' | 'board' | 'cards' | 'template') =>
        listDocs(data2, kind)
          .filter((d) => d.publishedVersionId)
          .map((d) => ({
            docId: d.docId,
            name: d.name,
            versionId: d.publishedVersionId,
            updatedAtMs: d.updatedAtMs,
          }));

      const sysTpl2 = data2.configDocs['system:template-standard'];
      const legacyTpl2 = data2.configDocs['builtin:template-standard'];
      const defaultTemplateVersionId = sysTpl2?.publishedVersionId || legacyTpl2?.publishedVersionId || null;

      const hiddenTemplateDocIds = new Set(['system:template-standard', 'builtin:template-standard']);
      const templates = listDocs(data2, 'template')
        .filter((d) => d.publishedVersionId)
        .filter((d) => !hiddenTemplateDocIds.has(d.docId))
        .filter((d) => {
          const visibility = effectiveTemplateVisibility(d);
          if (visibility === 'public') return true;
          if (!uid) return false;
          return d.ownerId === uid;
        })
        .map((d) => ({
          docId: d.docId,
          name: d.name,
          versionId: d.publishedVersionId as string,
          updatedAtMs: d.updatedAtMs,
        }));

      sendJson(res, 200, {
        rules: mapKind('rules'),
        boards: mapKind('board'),
        cards: mapKind('cards'),
        templates,
        defaultTemplateVersionId,
      });
      return;
    }

    if (pathname === '/api/room/create' && req.method === 'POST') {
      const body = (await readJson(req)) as { mode?: 'guest' | 'account'; nickname?: string; config?: Partial<RoomConfig> } | null;
      const mode = body?.mode ?? 'guest';
      const nickname = typeof body?.nickname === 'string' ? body.nickname : '';

      const createdAtMs = Date.now();
      const result = await store.update((data) => {
        const rawConfig = { ...defaultRoomConfig(), ...(body?.config ?? {}) };
        const configResult = validateRoomConfig(rawConfig);
        if (!configResult.ok) return { ok: false as const, error: 'INVALID_ROOM_CONFIG' as const, issues: configResult.issues };

        if (mode === 'account') {
          const actor = ensureUser(req);
          if (!actor) return { ok: false as const, error: 'UNAUTHORIZED' as const };
          const userId = actor.uid;

          let code = generateRoomCode();
          while (data.rooms[code]) code = generateRoomCode();

          const member = makeMember({
            playerId: `user:${userId}`,
            userId,
            displayName: actor.displayName,
            isSpectator: false,
            joinedAtMs: createdAtMs,
          });

          data.rooms[code] = {
            code,
            roomId: `room:${code}`,
            status: 'lobby',
            hostPlayerId: member.playerId,
            createdAtMs,
            config: configResult.value,
            members: [member],
          };

          return { ok: true as const, roomCode: code, room: data.rooms[code]!, newGuest: null };
        }

        const guest = ensureGuest(req, nickname, true);
        if (!guest) return { ok: false as const, error: 'INVALID_NICKNAME' as const };

        let code = generateRoomCode();
        while (data.rooms[code]) code = generateRoomCode();

        const member = makeMember({
          playerId: `guest:${guest.guestId}`,
          displayName: guest.nickname,
          isSpectator: false,
          joinedAtMs: createdAtMs,
        });

        data.rooms[code] = {
          code,
          roomId: `room:${code}`,
          status: 'lobby',
          hostPlayerId: member.playerId,
          createdAtMs,
          config: configResult.value,
          members: [member],
        };

        return { ok: true as const, roomCode: code, room: data.rooms[code]!, newGuest: guest.newGuest };
      });

      if (!result.ok) {
        const status = result.error === 'UNAUTHORIZED' ? 401 : result.error === 'INVALID_NICKNAME' ? 400 : 400;
        sendJson(res, status, 'issues' in result ? { error: result.error, issues: result.issues } : { error: result.error });
        return;
      }

      const origin = getHeader(req, 'origin') ?? '';
      sendJson(res, 200, {
        roomCode: result.roomCode,
        link: origin ? `${origin}/room/${result.roomCode}` : `/room/${result.roomCode}`,
        room: result.room,
        ...(result.newGuest ? { newGuest: result.newGuest } : {}),
      });
      return;
    }

    if (pathname === '/api/room/join' && req.method === 'POST') {
      const body = (await readJson(req)) as { roomCode?: string; nickname?: string; mode?: 'guest' | 'account' } | null;
      const roomCodeRaw = typeof body?.roomCode === 'string' ? body.roomCode : '';
      const mode = body?.mode ?? 'guest';
      const nowMs = Date.now();

      if (!roomCodeRaw) {
        sendJson(res, 400, { error: 'INVALID_ROOM_CODE' });
        return;
      }
      const roomCode = normalizeRoomCode(roomCodeRaw);
      if (!roomCode) {
        sendJson(res, 400, { error: 'INVALID_ROOM_CODE' });
        return;
      }

      const result = await store.update((data) => {
        const room = data.rooms[roomCode];
        if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };
        if (room.closedAtMs) return { ok: false as const, error: 'ROOM_CLOSED' as const };
        if (room.members.length === 0 && room.emptySinceMs && nowMs - room.emptySinceMs >= roomEmptyCloseMs) {
          room.closedAtMs = nowMs;
          return { ok: false as const, error: 'ROOM_CLOSED' as const };
        }
        if (room.emptySinceMs) delete room.emptySinceMs;
        if (room.status !== 'lobby') return { ok: false as const, error: 'GAME_ALREADY_STARTED' as const };

        if (mode === 'account') {
          const actor = ensureUser(req);
          if (!actor) return { ok: false as const, error: 'UNAUTHORIZED' as const };

          const playerId = `user:${actor.uid}`;
          const isExisting = room.members.some((m) => m.playerId === playerId && !m.isSpectator);
          const playerCount = room.members.filter((m) => !m.isSpectator).length;
          if (!isExisting && playerCount >= room.config.maxPlayers) return { ok: false as const, error: 'ROOM_FULL' as const };

          const existing = room.members.find((m) => m.playerId === playerId);
          if (existing) {
            existing.displayName = actor.displayName;
            existing.isSpectator = false;
          } else {
            room.members.unshift(
              makeMember({ playerId, userId: actor.uid, displayName: actor.displayName, isSpectator: false, joinedAtMs: nowMs }),
            );
          }
          room.members = room.members.slice(0, 64);
          return { ok: true as const, roomCode, newGuest: null };
        }

        const nickname = typeof body?.nickname === 'string' ? body.nickname : '';
        const guest = ensureGuest(req, nickname, true);
        if (!guest) return { ok: false as const, error: 'INVALID_NICKNAME' as const };

        const playerId = `guest:${guest.guestId}`;
        const playerCount = room.members.filter((m) => !m.isSpectator).length;
        const isExisting = room.members.some((m) => m.playerId === playerId && !m.isSpectator);
        if (!isExisting && playerCount >= room.config.maxPlayers) return { ok: false as const, error: 'ROOM_FULL' as const };

        const existing = room.members.find((m) => m.playerId === playerId);
        if (existing) {
          existing.displayName = guest.nickname;
          existing.isSpectator = false;
        } else {
          room.members.unshift(makeMember({ playerId, displayName: guest.nickname, isSpectator: false, joinedAtMs: nowMs }));
        }
        room.members = room.members.slice(0, 64);
        return { ok: true as const, roomCode, newGuest: guest.newGuest };
      });

      if (!result.ok) {
        if (result.error === 'UNAUTHORIZED') {
          sendJson(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }
        const status = result.error === 'ROOM_NOT_FOUND' ? 404 : result.error === 'ROOM_CLOSED' ? 410 : 400;
        sendJson(res, status, result);
        return;
      }

      sendJson(res, 200, { ok: true, roomCode: result.roomCode, ...(result.newGuest ? { newGuest: result.newGuest } : {}) });
      return;
    }

    if (pathname === '/api/room/state' && req.method === 'GET') {
      const roomCode = url.searchParams.get('roomCode')?.trim().toUpperCase() ?? '';
      if (!roomCode) {
        sendJson(res, 400, { error: 'INVALID_ROOM_CODE' });
        return;
      }

      const nowMs = Date.now();
      const result = await store.update((data) => {
        const room = data.rooms[roomCode];
        if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };
        if (room.closedAtMs) return { ok: false as const, error: 'ROOM_CLOSED' as const };
        if (shouldCloseRoomByEmpty(room, nowMs)) {
          room.closedAtMs = nowMs;
          return { ok: false as const, error: 'ROOM_CLOSED' as const };
        }
        return { ok: true as const, room };
      });

      if (!result.ok) {
        const status = result.error === 'ROOM_NOT_FOUND' ? 404 : result.error === 'ROOM_CLOSED' ? 410 : 400;
        sendJson(res, status, result);
        return;
      }

      const actor = parseActor(req);
      const selfMember = actor ? (result.room.members.find((m) => m.playerId === actor.playerId) ?? null) : null;
      sendJson(res, 200, {
        roomCode,
        room: result.room,
        self: selfMember
          ? {
              playerId: selfMember.playerId,
              isSpectator: selfMember.isSpectator,
              displayName: selfMember.displayName,
              ready: selfMember.ready,
            }
          : null,
      });
      return;
    }

    if (pathname === '/api/profile' && req.method === 'GET') {
      const actor = ensureUser(req);
      if (!actor) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return;
      }

      const result = await store.update((data) => {
        const now = new Date().toISOString();
        const existing = data.profiles[actor.uid];
        if (!existing) {
          data.profiles[actor.uid] = {
            id: actor.uid,
            displayName: actor.displayName || fallbackDisplayName(actor.uid),
            githubAvatarUrl: actor.githubAvatarUrl ?? null,
            customAvatarDataUrl: null,
            customAvatarMime: null,
            avatarUpdatedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        } else {
          if (typeof existing.githubAvatarUrl === 'undefined') existing.githubAvatarUrl = null;
          if (typeof (existing as { customAvatarDataUrl?: unknown }).customAvatarDataUrl === 'undefined') {
            (existing as { customAvatarDataUrl?: string | null }).customAvatarDataUrl = null;
          }
          if (typeof existing.customAvatarMime === 'undefined') existing.customAvatarMime = null;
          if (typeof existing.avatarUpdatedAt === 'undefined') existing.avatarUpdatedAt = null;
        }
        if (actor.githubAvatarUrl && actor.githubAvatarUrl !== data.profiles[actor.uid]!.githubAvatarUrl) {
          data.profiles[actor.uid]!.githubAvatarUrl = actor.githubAvatarUrl;
          data.profiles[actor.uid]!.updatedAt = now;
        }
        const profile = data.profiles[actor.uid]!;
        const avatar = avatarInfoFor(profile);
        return {
          profile: {
            ...profile,
            ...avatar,
          },
          friends: data.friends[actor.uid] ?? [],
        };
      });

      sendJson(res, 200, result);
      return;
    }

    if (pathname === '/api/profile' && req.method === 'POST') {
      const actor = ensureUser(req);
      if (!actor) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return;
      }

      const body = (await readJson(req)) as { displayName?: string } | null;
      const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
      if (!displayName || displayName.length > 40) {
        sendJson(res, 400, { error: 'INVALID_DISPLAY_NAME' });
        return;
      }

      const result = await store.update((data) => {
        const now = new Date().toISOString();
        const existing = data.profiles[actor.uid];
        if (!existing) {
          data.profiles[actor.uid] = {
            id: actor.uid,
            displayName,
            githubAvatarUrl: actor.githubAvatarUrl ?? null,
            customAvatarDataUrl: null,
            customAvatarMime: null,
            avatarUpdatedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        } else {
          if (typeof existing.githubAvatarUrl === 'undefined') existing.githubAvatarUrl = null;
          if (typeof (existing as { customAvatarDataUrl?: unknown }).customAvatarDataUrl === 'undefined') {
            (existing as { customAvatarDataUrl?: string | null }).customAvatarDataUrl = null;
          }
          if (typeof existing.customAvatarMime === 'undefined') existing.customAvatarMime = null;
          if (typeof existing.avatarUpdatedAt === 'undefined') existing.avatarUpdatedAt = null;
          existing.displayName = displayName;
          existing.updatedAt = now;
        }
        const profile = data.profiles[actor.uid]!;
        const avatar = avatarInfoFor(profile);
        return {
          profile: {
            ...profile,
            ...avatar,
          },
        };
      });

      sendJson(res, 200, result);
      return;
    }

    if (pathname === '/api/profile/public' && req.method === 'GET') {
      const idsParam = url.searchParams.get('ids');
      const idsRaw = idsParam ? idsParam.split(',') : url.searchParams.getAll('userId');
      const ids: string[] = [];
      for (const raw of idsRaw) {
        const id = raw.trim();
        if (!id || id.length > 200) {
          sendJson(res, 400, { error: 'INVALID_USER_ID' });
          return;
        }
        if (!ids.includes(id)) ids.push(id);
      }

      if (!ids.length) {
        sendJson(res, 400, { error: 'INVALID_USER_ID' });
        return;
      }
      if (ids.length > 50) {
        sendJson(res, 400, { error: 'TOO_MANY_IDS' });
        return;
      }

      const data = await store.read();
      const profiles = ids.map((id) => {
        const p = data.profiles[id];
        const avatar = p ? avatarInfoFor(p) : { avatarKind: 'none' as const, avatarUrl: null };
        return {
          id,
          displayName: p?.displayName ?? fallbackDisplayName(id),
          ...avatar,
        };
      });

      sendJson(res, 200, { profiles });
      return;
    }

    if (pathname === '/api/game-invite/inbox' && req.method === 'GET') {
      const actor = ensureUser(req);
      if (!actor) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return;
      }

      const nowMs = Date.now();
      const result = await store.update((data) => {
        const invites = (data.gameInvites ?? [])
          .filter((x) => {
            if (x.toUid !== actor.uid) return false;
            if (x.dismissedAtMs) return false;
            if (x.readAtMs) return false;
            if (nowMs - x.createdAtMs > inviteTtlMs) return false;
            const room = data.rooms[x.roomCode];
            if (!room) return false;
            if (room.closedAtMs) return false;
            if (shouldCloseRoomByEmpty(room, nowMs)) {
              room.closedAtMs = nowMs;
              return false;
            }
            return true;
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, 200);
        return { invites };
      });

      sendJson(res, 200, { invites: result.invites });
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  };
}
