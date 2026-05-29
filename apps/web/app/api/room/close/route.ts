import { NextResponse } from "next/server";

import { resolveActor } from "lib/room";
import { updateAppData } from "lib/store";

export const runtime = "nodejs";

type Body = {
  roomCode?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCode = (body?.roomCode ?? "").trim().toUpperCase();
  if (!roomCode)
    return NextResponse.json({ error: "INVALID_ROOM_CODE" }, { status: 400 });

  const actor = await resolveActor({ allowGuestCreate: false });
  if (!actor)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: "ROOM_NOT_FOUND" as const };
    if (room.hostPlayerId !== actor.playerId)
      return { ok: false as const, error: "NOT_HOST" as const };
    if (room.status === "playing")
      return { ok: false as const, error: "NOT_ALLOWED" as const };
    if (!room.closedAtMs) room.closedAtMs = Date.now();
    room.members = [];
    room.emptySinceMs = room.closedAtMs;
    room.status = "lobby";
    return {
      ok: true as const,
      deleted: false as const,
      closedAtMs: room.closedAtMs,
    };
  });

  if (!result.ok) {
    const status =
      result.error === "ROOM_NOT_FOUND"
        ? 404
        : result.error === "NOT_HOST"
          ? 403
          : result.error === "NOT_ALLOWED"
            ? 400
            : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
