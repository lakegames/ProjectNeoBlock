import { NextResponse } from 'next/server';

import { encodeGuestIdentity, guestCookieName } from 'lib/identity';
import { normalizeRoomCode, resolveActor } from 'lib/room';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  roomCode?: string;
  nickname?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCodeRaw = body?.roomCode;
  if (!roomCodeRaw) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });
  const roomCode = normalizeRoomCode(roomCodeRaw);
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });

  const actor = await resolveActor({ allowGuestCreate: true, nickname: body?.nickname || '观众' });
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const now = Date.now();
  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };

    const existing = room.members.find((m) => m.playerId === actor.playerId);
    if (existing) {
      existing.displayName = actor.displayName;
      if (existing.isSpectator) existing.joinedAtMs = now;
      return { ok: true as const, room };
    }

    room.members.unshift({
      playerId: actor.playerId,
      ...(actor.kind === 'user' ? { userId: actor.userId } : {}),
      displayName: actor.displayName,
      isSpectator: true,
      ready: false,
      joinedAtMs: now,
    });
    room.members = room.members.slice(0, 64);
    return { ok: true as const, room };
  });

  if (!result.ok) return NextResponse.json(result, { status: result.error === 'ROOM_NOT_FOUND' ? 404 : 400 });

  const res = NextResponse.json(result);
  if (actor.kind === 'guest' && actor.newGuest) {
    res.cookies.set(guestCookieName, encodeGuestIdentity(actor.newGuest), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

