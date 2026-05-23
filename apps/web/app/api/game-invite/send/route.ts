import crypto from 'node:crypto';

import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { shouldCloseRoomByEmpty } from 'lib/room-lifecycle';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { toUid?: unknown; roomCode?: unknown } | null;
  const toUid = typeof body?.toUid === 'string' ? body.toUid.trim() : '';
  const roomCode = typeof body?.roomCode === 'string' ? body.roomCode.trim().toUpperCase() : '';
  if (!toUid || !roomCode) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  if (toUid === uid) return NextResponse.json({ error: 'CANNOT_INVITE_SELF' }, { status: 400 });

  const result = await updateAppData((data) => {
    const friends = data.friends[uid] ?? [];
    if (!friends.includes(toUid)) return { ok: false as const, error: 'NOT_FRIEND' as const };
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: 'ROOM_NOT_FOUND' as const };
    const nowMs = Date.now();
    if (room.closedAtMs) return { ok: false as const, error: 'ROOM_CLOSED' as const };
    if (shouldCloseRoomByEmpty(room, nowMs)) {
      room.closedAtMs = nowMs;
      return { ok: false as const, error: 'ROOM_CLOSED' as const };
    }

    const id = crypto.randomUUID();
    data.gameInvites.push({ id, toUid, fromUid: uid, roomCode, createdAtMs: nowMs });
    if (data.gameInvites.length > 5000) data.gameInvites = data.gameInvites.slice(data.gameInvites.length - 5000);
    return { ok: true as const, id };
  });

  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
