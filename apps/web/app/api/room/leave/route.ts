import { NextResponse } from 'next/server';

import { resolveActor } from 'lib/room';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  roomCode?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCode = (body?.roomCode ?? '').trim().toUpperCase();
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });

  const actor = await resolveActor({ allowGuestCreate: false });
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };

    const before = room.members.length;
    room.members = room.members.filter((m) => m.playerId !== actor.playerId);
    const after = room.members.length;
    if (before === after) return { ok: false as const, error: 'NOT_IN_ROOM' as const };

    if (room.members.length === 0) {
      if (!room.emptySinceMs) room.emptySinceMs = Date.now();
      return { ok: true as const, deleted: false as const };
    }

    if (room.hostPlayerId === actor.playerId) {
      const nextHost = room.members.find((m) => !m.isSpectator)?.playerId ?? room.members[0]?.playerId ?? room.hostPlayerId;
      room.hostPlayerId = nextHost;
    }

    return { ok: true as const, deleted: false as const, hostPlayerId: room.hostPlayerId };
  });

  if (!result.ok) {
    const status = result.error === 'ROOM_NOT_FOUND' ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
