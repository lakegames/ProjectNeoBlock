import { NextResponse } from 'next/server';

import { requireAdmin } from 'lib/admin-auth';
import { readAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const includeClosed = url.searchParams.get('includeClosed') === '1';

  const data = await readAppData();
  const rooms = Object.values(data.rooms)
    .filter((r) => (includeClosed ? true : !(r as { closedAtMs?: number }).closedAtMs))
    .map((r) => {
      const players = r.members.filter((m) => !m.isSpectator);
      const spectators = r.members.filter((m) => m.isSpectator);
      const host = r.members.find((m) => m.playerId === r.hostPlayerId);
      return {
        roomCode: r.code,
        roomId: r.roomId,
        status: r.status,
        createdAtMs: r.createdAtMs,
        startedAtMs: r.startedAtMs ?? null,
        endedAtMs: (r as { endedAtMs?: number }).endedAtMs ?? null,
        closedAtMs: (r as { closedAtMs?: number }).closedAtMs ?? null,
        hostPlayerId: r.hostPlayerId,
        hostDisplayName: host?.displayName ?? r.hostPlayerId,
        maxPlayers: r.config.maxPlayers,
        turnTimeSec: r.config.turnTimeSec,
        enableAuto: r.config.enableAuto,
        enableAI: r.config.enableAI,
        playerCount: players.length,
        spectatorCount: spectators.length,
        members: r.members,
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 200);

  return NextResponse.json({ rooms, org: auth.org, uid: auth.uid });
}

