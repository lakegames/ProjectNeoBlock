import { NextResponse } from "next/server";

import { resolveActor } from "lib/room";
import { updateAppData } from "lib/store";

export const runtime = "nodejs";

type Body = {
  roomCode?: string;
  gameId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCode = (body?.roomCode ?? "").trim().toUpperCase();
  if (!roomCode)
    return NextResponse.json({ error: "INVALID_ROOM_CODE" }, { status: 400 });
  const gameId = typeof body?.gameId === "string" ? body.gameId : "";
  if (!gameId)
    return NextResponse.json({ error: "INVALID_GAME_ID" }, { status: 400 });

  const actor = await resolveActor({ allowGuestCreate: false });
  if (!actor)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: "ROOM_NOT_FOUND" as const };
    if (room.closedAtMs)
      return { ok: false as const, error: "ROOM_CLOSED" as const };
    if (room.hostPlayerId !== actor.playerId)
      return { ok: false as const, error: "NOT_HOST" as const };

    const id = `${roomCode}:${gameId}`;
    const existing = (data.matchRecords ?? []).some((x) => x.id === id);
    const endedAtMs = Date.now();
    if (!existing) {
      data.matchRecords ??= [];
      data.matchRecords.push({
        id,
        roomCode,
        gameId,
        roomId: room.roomId,
        hostPlayerId: room.hostPlayerId,
        participants: room.members.filter((m) => !m.isSpectator),
        endedAtMs,
        configSnapshot: { ...room.config },
      });
      if (data.matchRecords.length > 5000)
        data.matchRecords = data.matchRecords.slice(
          data.matchRecords.length - 5000,
        );
    }

    room.status = "lobby";
    room.endedAtMs = endedAtMs;
    return { ok: true as const, room, id };
  });

  if (!result.ok) {
    const status =
      result.error === "ROOM_NOT_FOUND"
        ? 404
        : result.error === "ROOM_CLOSED"
          ? 410
          : result.error === "NOT_HOST"
            ? 403
            : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
