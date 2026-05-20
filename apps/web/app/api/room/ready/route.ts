import { NextResponse } from 'next/server';

import { normalizeRoomCode, resolveActor } from 'lib/room';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  roomCode?: string;
  ready?: boolean;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCodeRaw = body?.roomCode;
  if (!roomCodeRaw) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });
  const roomCode = normalizeRoomCode(roomCodeRaw);
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });

  const actor = await resolveActor({ allowGuestCreate: false });
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const ready = body?.ready === true;

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };
    if (room.status !== 'lobby') return { ok: false as const, error: 'GAME_ALREADY_STARTED' as const };

    const member = room.members.find((m) => m.playerId === actor.playerId);
    if (!member) return { ok: false as const, error: 'NOT_IN_ROOM' as const };
    if (member.isSpectator) return { ok: false as const, error: 'NOT_A_PLAYER' as const };

    member.ready = ready;
    return { ok: true as const, room };
  });

  if (!result.ok) {
    const status =
      result.error === 'ROOM_NOT_FOUND'
        ? 404
        : result.error === 'NOT_IN_ROOM' || result.error === 'NOT_A_PLAYER'
          ? 403
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

