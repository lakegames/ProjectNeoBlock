import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';

import { authOptions } from 'lib/auth';
import { getGuestIdentity } from 'lib/identity';
import { readAppData, type RoomMember } from 'lib/store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomCode = url.searchParams.get('roomCode')?.trim().toUpperCase() ?? '';
  if (!roomCode) return NextResponse.json({ error: 'INVALID_ROOM_CODE' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  const guest = getGuestIdentity();

  let selfPlayerId: string | null = null;
  if (uid) {
    selfPlayerId = `user:${uid}`;
  } else if (guest) {
    selfPlayerId = `guest:${guest.id}`;
  }

  const data = await readAppData();
  const room = data.rooms[roomCode];
  if (!room) return NextResponse.json({ error: 'ROOM_NOT_FOUND' }, { status: 404 });

  const selfMember: RoomMember | null = selfPlayerId
    ? room.members.find((m) => m.playerId === selfPlayerId) ?? null
    : null;

  return NextResponse.json({
    roomCode,
    room,
    self: selfMember
      ? {
          playerId: selfMember.playerId,
          isSpectator: selfMember.isSpectator,
          displayName: selfMember.displayName,
          ready: selfMember.ready,
        }
      : null,
  });
}
