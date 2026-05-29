import { NextResponse } from "next/server";

import {
  canViewTemplate,
  ensureSeedConfigs,
  resolvePublishedVersionId,
  resolveTemplateByPublishedVersionId,
  resolveTemplateDocByPublishedVersionId,
} from "lib/config-service";
import { normalizeRoomCode, validateRoomConfig, resolveActor } from "lib/room";
import { updateAppData, type RoomConfig } from "lib/store";

export const runtime = "nodejs";

type Body = {
  roomCode?: string;
  config?: Partial<RoomConfig>;
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
  const uid = actor.kind === "user" ? actor.userId : null;

  const nowMs = Date.now();
  const result = await updateAppData((data) => {
    ensureSeedConfigs(data, nowMs);
    const room = data.rooms[roomCode];
    if (!room) return { ok: false as const, error: "ROOM_NOT_FOUND" as const };
    if (room.closedAtMs)
      return { ok: false as const, error: "ROOM_CLOSED" as const };
    if (room.status !== "lobby")
      return { ok: false as const, error: "GAME_ALREADY_STARTED" as const };
    if (room.hostPlayerId !== actor.playerId)
      return { ok: false as const, error: "NOT_HOST" as const };

    const rawConfig = { ...room.config, ...(body?.config ?? {}) };
    const vr = validateRoomConfig(rawConfig);
    if (!vr.ok)
      return {
        ok: false as const,
        error: "INVALID_ROOM_CONFIG" as const,
        issues: vr.issues,
      };

    const playerCount = room.members.filter((m) => !m.isSpectator).length;
    if (vr.value.maxPlayers < playerCount)
      return {
        ok: false as const,
        error: "MAX_PLAYERS_TOO_SMALL" as const,
        playerCount,
      };

    const requirePublishedVersion = (
      kind: "rules" | "board" | "cards",
      preferred?: string,
    ) => {
      if (preferred) {
        const ok = Object.values(data.configDocs).some(
          (d) => d.kind === kind && d.publishedVersionId === preferred,
        );
        if (!ok)
          return {
            ok: false as const,
            error: "CONFIG_VERSION_NOT_FOUND" as const,
            kind,
            versionId: preferred,
          };
        return { ok: true as const, versionId: preferred };
      }
      const resolved = resolvePublishedVersionId(data, kind);
      if (!resolved)
        return {
          ok: false as const,
          error: "NO_PUBLISHED_CONFIG" as const,
          kind,
        };
      return { ok: true as const, versionId: resolved };
    };

    const templateVersionId = vr.value.templateVersionId;
    if (templateVersionId) {
      const tplDoc = resolveTemplateDocByPublishedVersionId(
        data,
        templateVersionId,
      );
      if (!tplDoc)
        return {
          ok: false as const,
          error: "TEMPLATE_NOT_FOUND" as const,
          versionId: templateVersionId,
        };
      if (!canViewTemplate(tplDoc, uid))
        return {
          ok: false as const,
          error: "TEMPLATE_FORBIDDEN" as const,
          versionId: templateVersionId,
        };
      const tpl = resolveTemplateByPublishedVersionId(data, templateVersionId);
      if (!tpl)
        return {
          ok: false as const,
          error: "TEMPLATE_NOT_FOUND" as const,
          versionId: templateVersionId,
        };
      room.config = {
        ...vr.value,
        templateVersionId,
        rulesetVersionId: tpl.rulesVersionId,
        boardVersionId: tpl.boardVersionId,
        cardsVersionId: tpl.cardsVersionId,
      };
      return { ok: true as const, room };
    }

    const rulesV = requirePublishedVersion("rules", vr.value.rulesetVersionId);
    if (!rulesV.ok) return rulesV;
    const boardV = requirePublishedVersion("board", vr.value.boardVersionId);
    if (!boardV.ok) return boardV;
    const cardsV = requirePublishedVersion("cards", vr.value.cardsVersionId);
    if (!cardsV.ok) return cardsV;

    room.config = {
      ...vr.value,
      rulesetVersionId: rulesV.versionId,
      boardVersionId: boardV.versionId,
      cardsVersionId: cardsV.versionId,
    };
    return { ok: true as const, room };
  });

  if (!result.ok) {
    let status = 400;
    if (result.error === "ROOM_NOT_FOUND") status = 404;
    else if (result.error === "ROOM_CLOSED") status = 410;
    else if (result.error === "NOT_HOST") status = 403;
    else if (result.error === "TEMPLATE_FORBIDDEN") status = 403;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
