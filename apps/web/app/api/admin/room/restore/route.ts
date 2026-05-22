import { NextResponse } from 'next/server';

import { requireAdmin } from 'lib/admin-auth';
import { appendAudit } from 'lib/audit';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

type Body = {
  roomCode?: string;
};

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCode = (body?.roomCode ?? '').trim().toUpperCase();
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };

    const beforeClosedAt = (room as { closedAtMs?: number }).closedAtMs ?? null;
    if (beforeClosedAt) delete (room as { closedAtMs?: number }).closedAtMs;

    appendAudit(data, {
      actorUid: auth.uid,
      action: 'admin.room.restore',
      targetType: 'room',
      targetId: roomCode,
      detail: { beforeClosedAtMs: beforeClosedAt, restored: !!beforeClosedAt },
    });

    return { ok: true as const, restored: !!beforeClosedAt };
  });

  if (!result.ok) {
    const status = result.error === 'ROOM_NOT_FOUND' ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

