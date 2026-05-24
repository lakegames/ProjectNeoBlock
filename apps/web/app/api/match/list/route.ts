import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { authOptions } from "lib/auth";
import { readAppData } from "lib/store";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const data = await readAppData();
  const selfPlayerId = `user:${uid}`;

  const records = (data.matchRecords ?? [])
    .filter((r) => {
      const hidden = (r.hiddenByUids ?? []).includes(uid);
      if (hidden) return false;
      return r.participants.some(
        (p) => p.userId === uid || p.playerId === selfPlayerId,
      );
    })
    .sort((a, b) => b.endedAtMs - a.endedAtMs)
    .slice(0, 200)
    .map((r) => {
      const host = r.participants.find((p) => p.playerId === r.hostPlayerId);
      return {
        id: r.id,
        roomCode: r.roomCode,
        gameId: r.gameId,
        endedAtMs: r.endedAtMs,
        roomId: r.roomId,
        hostPlayerId: r.hostPlayerId,
        hostDisplayName: host?.displayName ?? r.hostPlayerId,
        maxPlayers: r.configSnapshot.maxPlayers,
        turnTimeSec: r.configSnapshot.turnTimeSec,
        enableAuto: r.configSnapshot.enableAuto,
        enableAI: r.configSnapshot.enableAI,
        playerCount: r.participants.filter((p) => !p.isSpectator).length,
        spectatorCount: 0,
        createdAtMs: r.endedAtMs,
        status: "ended" as const,
      };
    });

  return NextResponse.json({ records });
}
