import { NextResponse } from 'next/server';

import { requireAdmin } from 'lib/admin-auth';
import { appendAudit } from 'lib/audit';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  roomCode?: string;
  playerId?: string;
};

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCode = (body?.roomCode ?? '').trim().toUpperCase();
  const playerId = (body?.playerId ?? '').trim();
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });
  if (!playerId) return NextResponse.json({ error: 'INVALID_PLAYER_ID' }, { status: 400 });

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };

    const beforeHost = room.hostPlayerId;
    const beforeCount = room.members.length;
    room.members = room.members.filter((m) => m.playerId !== playerId);
    const afterCount = room.members.length;
    if (beforeCount === afterCount) return { ok: false as const, error: 'NOT_IN_ROOM' as const };

    let deleted = false;
    if (room.members.length === 0) {
      delete data.rooms[roomCode];
      deleted = true;
    } else if (room.hostPlayerId === playerId) {
      room.hostPlayerId = room.members.find((m) => !m.isSpectator)?.playerId ?? room.members[0]?.playerId ?? room.hostPlayerId;
    }

    appendAudit(data, {
      actorUid: auth.uid,
      action: 'admin.room.kick',
      targetType: 'room',
      targetId: roomCode,
      detail: { playerId, beforeHostPlayerId: beforeHost, afterHostPlayerId: deleted ? null : room.hostPlayerId, deleted },
    });

    return { ok: true as const, deleted, hostPlayerId: deleted ? null : room.hostPlayerId };
  });

  if (!result.ok) {
    const status = result.error === 'ROOM_NOT_FOUND' ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

