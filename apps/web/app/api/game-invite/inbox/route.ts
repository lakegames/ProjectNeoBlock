import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { inviteTtlMs } from 'lib/game-invite';
import { shouldCloseRoomByEmpty } from 'lib/room-lifecycle';
import { updateAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const nowMs = Date.now();
  const result = await updateAppData((data) => {
    const invites = (data.gameInvites ?? [])
      .filter((x) => {
        if (x.toUid !== uid) return false;
        if (x.dismissedAtMs) return false;
        if (x.readAtMs) return false;
        if (nowMs - x.createdAtMs > inviteTtlMs) return false;
        const room = data.rooms[x.roomCode];
        if (!room) return false;
        if (room.closedAtMs) return false;
        if (shouldCloseRoomByEmpty(room, nowMs)) {
          room.closedAtMs = nowMs;
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 200);
    return { invites };
  });

  return NextResponse.json({ invites: result.invites });
}
