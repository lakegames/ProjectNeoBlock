import crypto from 'node:crypto';

import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import {
  canViewTemplate,
  ensureSeedConfigs,
  resolvePublishedVersionId,
  resolveTemplateByPublishedVersionId,
  resolveTemplateDocByPublishedVersionId,
} from 'lib/config-service';
import { encodeGuestIdentity, guestCookieName, type GuestIdentity } from 'lib/identity';
import { generateRoomCode, normalizeDisplayName, validateRoomConfig } from 'lib/room';
import { updateAppData, type Room, type RoomConfig, type RoomMember } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  mode?: 'guest' | 'account';
  nickname?: string;
  config?: Partial<RoomConfig>;
};

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

function defaultConfig(): RoomConfig {
  return { maxPlayers: 4, turnTimeSec: 60, enableAuto: false, enableAI: false };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const mode = body?.mode ?? 'guest';
  const nickname = normalizeDisplayName(body?.nickname || '');

  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;

  if (mode === 'account') {
    if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  } else {
    if (!nickname) return NextResponse.json({ error: 'INVALID_NICKNAME' }, { status: 400 });
  }

  const rawConfig = { ...defaultConfig(), ...(body?.config ?? {}) };
  const configResult = validateRoomConfig(rawConfig);
  if (!configResult.ok) return NextResponse.json({ error: 'INVALID_ROOM_CONFIG', issues: configResult.issues }, { status: 400 });

  const createdAtMs = Date.now();
  const result = await updateAppData((data) => {
    ensureSeedConfigs(data, createdAtMs);

    const requirePublishedVersion = (kind: 'rules' | 'board' | 'cards', preferred?: string) => {
      if (preferred) {
        const ok = Object.values(data.configDocs).some((d) => d.kind === kind && d.publishedVersionId === preferred);
        if (!ok) return { ok: false as const, error: 'CONFIG_VERSION_NOT_FOUND' as const, kind, versionId: preferred };
        return { ok: true as const, versionId: preferred };
      }
      const resolved = resolvePublishedVersionId(data, kind);
      if (!resolved) return { ok: false as const, error: 'NO_PUBLISHED_CONFIG' as const, kind };
      return { ok: true as const, versionId: resolved };
    };

    const templateVersionId = configResult.value.templateVersionId;
    let rulesVersionId: string;
    let boardVersionId: string;
    let cardsVersionId: string;
    if (templateVersionId) {
      const tplDoc = resolveTemplateDocByPublishedVersionId(data, templateVersionId);
      if (!tplDoc) return { ok: false as const, error: 'TEMPLATE_NOT_FOUND' as const, versionId: templateVersionId };
      if (!canViewTemplate(tplDoc, uid)) return { ok: false as const, error: 'TEMPLATE_FORBIDDEN' as const, versionId: templateVersionId };
      const tpl = resolveTemplateByPublishedVersionId(data, templateVersionId);
      if (!tpl) return { ok: false as const, error: 'TEMPLATE_NOT_FOUND' as const, versionId: templateVersionId };
      rulesVersionId = tpl.rulesVersionId;
      boardVersionId = tpl.boardVersionId;
      cardsVersionId = tpl.cardsVersionId;
    } else {
      const rulesV = requirePublishedVersion('rules', configResult.value.rulesetVersionId);
      if (!rulesV.ok) return rulesV;
      const boardV = requirePublishedVersion('board', configResult.value.boardVersionId);
      if (!boardV.ok) return boardV;
      const cardsV = requirePublishedVersion('cards', configResult.value.cardsVersionId);
      if (!cardsV.ok) return cardsV;
      rulesVersionId = rulesV.versionId;
      boardVersionId = boardV.versionId;
      cardsVersionId = cardsV.versionId;
    }

    let code = generateRoomCode();
    while (data.rooms[code]) code = generateRoomCode();

    let member: RoomMember;
    let guest: GuestIdentity | null = null;
    if (mode === 'account') {
      const userId = uid as string;
      const profile = data.profiles[userId];
      const displayName =
        normalizeDisplayName(profile?.displayName || session?.user?.name || userId || '玩家') || '玩家';
      member = makeMember({
        playerId: `user:${userId}`,
        userId,
        displayName,
        isSpectator: false,
        joinedAtMs: createdAtMs,
      });
    } else {
      guest = { id: crypto.randomUUID(), nickname };
      member = makeMember({
        playerId: `guest:${guest.id}`,
        displayName: guest.nickname,
        isSpectator: false,
        joinedAtMs: createdAtMs,
      });
    }

    const room: Room = {
      code,
      roomId: `room:${code}`,
      status: 'lobby',
      hostPlayerId: member.playerId,
      createdAtMs,
      config: {
        ...configResult.value,
        ...(templateVersionId ? { templateVersionId } : {}),
        rulesetVersionId: rulesVersionId,
        boardVersionId,
        cardsVersionId,
      },
      members: [member],
    };
    data.rooms[code] = room;

    return { ok: true as const, room, guest };
  });

  if (!result.ok) {
    const status =
      result.error === 'TEMPLATE_FORBIDDEN'
        ? 403
        : result.error === 'CONFIG_VERSION_NOT_FOUND' || result.error === 'TEMPLATE_NOT_FOUND'
          ? 400
          : 500;
    return NextResponse.json(result, { status });
  }

  const origin = req.headers.get('origin') ?? '';
  const res = NextResponse.json({
    roomCode: result.room.code,
    link: origin ? `${origin}/room/${result.room.code}` : `/room/${result.room.code}`,
    room: result.room,
  });

  if (result.guest) {
    res.cookies.set(guestCookieName, encodeGuestIdentity(result.guest), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return res;
}
