import { NextResponse } from 'next/server';

import { readAppData } from 'lib/store';

export const runtime = 'nodejs';

export async function GET() {
  const data = await readAppData();
  const rooms = Object.values(data.rooms)
    .map((r) => {
      const players = r.members.filter((m) => !m.isSpectator);
      const spectators = r.members.filter((m) => m.isSpectator);
      const host = r.members.find((m) => m.playerId === r.hostPlayerId);
      return {
        roomCode: r.code,
        status: r.status,
        createdAtMs: r.createdAtMs,
        startedAtMs: r.startedAtMs ?? null,
        maxPlayers: r.config.maxPlayers,
        turnTimeSec: r.config.turnTimeSec,
        enableAuto: r.config.enableAuto,
        enableAI: r.config.enableAI,
        hostDisplayName: host?.displayName ?? r.hostPlayerId,
        playerCount: players.length,
        spectatorCount: spectators.length,
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 30);

  return NextResponse.json({ rooms });
}

