import { NextResponse } from 'next/server';

import { requireAdmin } from 'lib/admin-auth';
import { appendAudit } from 'lib/audit';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  roomCode?: string;
  hostPlayerId?: string;
};

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCode = (body?.roomCode ?? '').trim().toUpperCase();
  const hostPlayerId = (body?.hostPlayerId ?? '').trim();
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });
  if (!hostPlayerId) return NextResponse.json({ error: 'INVALID_PLAYER_ID' }, { status: 400 });

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };
    const exists = room.members.some((m) => m.playerId === hostPlayerId);
    if (!exists) return { ok: false as const, error: 'PLAYER_NOT_IN_ROOM' as const };

    const before = room.hostPlayerId;
    room.hostPlayerId = hostPlayerId;

    appendAudit(data, {
      actorUid: auth.uid,
      action: 'admin.room.setHost',
      targetType: 'room',
      targetId: roomCode,
      detail: { beforeHostPlayerId: before, afterHostPlayerId: hostPlayerId },
    });

    return { ok: true as const, hostPlayerId };
  });

  if (!result.ok) {
    const status = result.error === 'ROOM_NOT_FOUND' ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

