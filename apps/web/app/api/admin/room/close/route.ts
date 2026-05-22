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

    const before = { status: room.status, startedAtMs: room.startedAtMs ?? null, closedAtMs: (room as { closedAtMs?: number }).closedAtMs ?? null };

    if (room.status === 'lobby') {
      delete data.rooms[roomCode];
      appendAudit(data, {
        actorUid: auth.uid,
        action: 'admin.room.close',
        targetType: 'room',
        targetId: roomCode,
        detail: { before, deleted: true },
      });
      return { ok: true as const, deleted: true as const };
    }

    if (room.status !== 'ended') return { ok: false as const, error: 'NOT_ENDED' as const };

    if (room.startedAtMs) {
      room.closedAtMs = Date.now();
      appendAudit(data, {
        actorUid: auth.uid,
        action: 'admin.room.close',
        targetType: 'room',
        targetId: roomCode,
        detail: { before, deleted: false, archived: true, closedAtMs: room.closedAtMs },
      });
      return { ok: true as const, deleted: false as const, archived: true as const, closedAtMs: room.closedAtMs };
    }

    delete data.rooms[roomCode];
    appendAudit(data, {
      actorUid: auth.uid,
      action: 'admin.room.close',
      targetType: 'room',
      targetId: roomCode,
      detail: { before, deleted: true },
    });
    return { ok: true as const, deleted: true as const };
  });

  if (!result.ok) {
    const status = result.error === 'ROOM_NOT_FOUND' ? 404 : result.error === 'NOT_ENDED' ? 400 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

