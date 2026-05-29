import { NextResponse } from "next/server";

import { normalizeRoomCode, resolveActor } from "lib/room";
import { updateAppData } from "lib/store";

export const runtime = "nodejs";

type Body = {
  roomCode?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const roomCodeRaw = body?.roomCode;
  if (!roomCodeRaw)
    return NextResponse.json({ error: "INVALID_ROOM_CODE" }, { status: 400 });
  const roomCode = normalizeRoomCode(roomCodeRaw);
  if (!roomCode)
    return NextResponse.json({ error: "INVALID_ROOM_CODE" }, { status: 400 });

  const actor = await resolveActor({ allowGuestCreate: false });
  if (!actor)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const result = await updateAppData((data) => {
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: "ROOM_NOT_FOUND" as const };
    if (room.closedAtMs)
      return { ok: false as const, error: "ROOM_CLOSED" as const };
    if (room.status !== "lobby")
      return { ok: false as const, error: "GAME_ALREADY_STARTED" as const };
    if (room.hostPlayerId !== actor.playerId)
      return { ok: false as const, error: "NOT_HOST" as const };

    const players = room.members.filter((m) => !m.isSpectator);
    if (players.length < 2)
      return { ok: false as const, error: "NEED_MORE_PLAYERS" as const };
    const notReady = players.filter((p) => !p.ready);
    if (notReady.length) {
      return {
        ok: false as const,
        error: "NOT_ALL_READY" as const,
        notReady: notReady.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
        })),
      };
    }

    room.status = "playing";
    room.startedAtMs = Date.now();
    if (room.emptySinceMs) delete room.emptySinceMs;
    return { ok: true as const, room };
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
