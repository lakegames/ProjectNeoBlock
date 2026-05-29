import { NextResponse } from "next/server";

import { applyRoomAutoClose, roomArchivedTtlMs } from "lib/room-lifecycle";
import { readAppData, updateAppData } from "lib/store";

export const runtime = "nodejs";

export async function GET() {
  const now = Date.now();
  const archivedTtlMs = roomArchivedTtlMs;

  await updateAppData((data) => {
    for (const [code, room] of Object.entries(data.rooms)) {
      applyRoomAutoClose(room, now);
      const closedAt = room.closedAtMs ?? null;
      if (closedAt !== null && now - closedAt > archivedTtlMs)
        delete data.rooms[code];
    }
  });

  const data = await readAppData();
  const rooms = Object.values(data.rooms)
    .filter((r) => !(r as { closedAtMs?: number }).closedAtMs)
    .map((r) => {
      const players = r.members.filter((m) => !m.isSpectator);
      const spectators = r.members.filter((m) => m.isSpectator);
      const host = r.members.find((m) => m.playerId === r.hostPlayerId);
      return {
        roomCode: r.code,
        status: r.status,
        createdAtMs: r.createdAtMs,
        startedAtMs: r.startedAtMs ?? null,
        endedAtMs: (r as { endedAtMs?: number }).endedAtMs ?? null,
        closedAtMs: (r as { closedAtMs?: number }).closedAtMs ?? null,
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
