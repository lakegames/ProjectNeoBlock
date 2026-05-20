import crypto from 'node:crypto';

import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { encodeGuestIdentity, guestCookieName, type GuestIdentity } from 'lib/identity';
import { normalizeDisplayName, normalizeRoomCode } from 'lib/room';
import { updateAppData, type RoomMember } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  roomCode?: string;
  nickname?: string;
  mode?: 'guest' | 'account';
};

function makePlayerMember(input: {
  playerId: string;
  userId?: string;
  displayName: string;
  joinedAtMs: number;
}): RoomMember {
  return {
    playerId: input.playerId,
    ...(input.userId ? { userId: input.userId } : {}),
    displayName: input.displayName,
    isSpectator: false,
    ready: false,
    joinedAtMs: input.joinedAtMs,
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCodeRaw = body?.roomCode;
  const nicknameRaw = body?.nickname;
  const mode = body?.mode ?? 'guest';

  if (!roomCodeRaw) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });
  const roomCode = normalizeRoomCode(roomCodeRaw);
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });

  if (mode === 'account') {
    const session = await getServerSession(authOptions);
    const uid = (session?.user as { id?: string } | undefined)?.id;
    if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

    const result = await updateAppData((data) => {
      const room = data.rooms[roomCode];
      if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };
      if (room.status !== 'lobby') return { ok: false as const, error: 'GAME_ALREADY_STARTED' as const };

      const profile = data.profiles[uid];
      const displayName = normalizeDisplayName(nicknameRaw || profile?.displayName || session?.user?.name || uid) || uid;
      const playerId = `user:${uid}`;

      const now = Date.now();
      const isExisting = room.members.some((m) => m.playerId === playerId && !m.isSpectator);
      const playerCount = room.members.filter((m) => !m.isSpectator).length;
      if (!isExisting && playerCount >= room.config.maxPlayers)
        return { ok: false as const, error: 'ROOM_FULL' as const };

      const existing = room.members.find((m) => m.playerId === playerId);
      if (existing) {
        existing.displayName = displayName;
        existing.isSpectator = false;
      } else {
        room.members.unshift(
          makePlayerMember({ playerId, userId: uid, displayName, joinedAtMs: now }),
        );
      }
      room.members = room.members.slice(0, 64);
      return { ok: true as const, roomCode };
    });

    if (!result.ok) return NextResponse.json(result, { status: result.error === 'ROOM_NOT_FOUND' ? 404 : 400 });
    return NextResponse.json(result);
  }

  const nickname = normalizeDisplayName(nicknameRaw || '游客');
  if (!nickname) return NextResponse.json({ error: 'INVALID_NICKNAME' }, { status: 400 });

  const guest: GuestIdentity = { id: crypto.randomUUID(), nickname };

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };
    if (room.status !== 'lobby') return { ok: false as const, error: 'GAME_ALREADY_STARTED' as const };

    const playerId = `guest:${guest.id}`;
    const now = Date.now();
    const playerCount = room.members.filter((m) => !m.isSpectator).length;
    if (playerCount >= room.config.maxPlayers) return { ok: false as const, error: 'ROOM_FULL' as const };

    room.members.unshift(makePlayerMember({ playerId, displayName: guest.nickname, joinedAtMs: now }));
    room.members = room.members.slice(0, 64);
    return { ok: true as const, roomCode };
  });

  if (!result.ok) return NextResponse.json(result, { status: result.error === 'ROOM_NOT_FOUND' ? 404 : 400 });

  const res = NextResponse.json(result);
  res.cookies.set(guestCookieName, encodeGuestIdentity(guest), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
