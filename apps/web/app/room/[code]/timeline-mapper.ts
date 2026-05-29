import type { Event, PlayerId } from "@neoblock/shared";

export type TimelineEntry =
  | {
      kind: "move";
      eventId: string;
      seq: number;
      createdAtMs: number;
      playerId: PlayerId;
      title: string;
      subtitle: string;
      from: number;
      to: number;
      toTileLabel?: string;
    }
  | {
      kind: "charge";
      eventId: string;
      seq: number;
      createdAtMs: number;
      playerId: PlayerId;
      title: string;
      subtitle: string;
      delta: number;
      reason: string;
      reasonLabel: string;
    }
  | {
      kind: "purchase";
      eventId: string;
      seq: number;
      createdAtMs: number;
      playerId: PlayerId;
      title: string;
      subtitle: string;
      propertyId: string;
      propertyLabel: string;
      price: number;
    };

export type MemberLike = { playerId: PlayerId; displayName: string };

export type BoardLikeTile =
  | { kind: "start" }
  | { kind: "jail" }
  | { kind: "goToJail" }
  | { kind: "chance" }
  | { kind: "communityChest" }
  | { kind: "tax"; amount: number }
  | { kind: "property"; propertyId: string; name?: string };

export type BoardLike = {
  tiles: BoardLikeTile[];
  cards?: { cardId: string; text: string }[];
};

export function eventsToTimelineEntries(input: {
  events: Event[];
  members: MemberLike[];
  board?: BoardLike | null;
}): TimelineEntry[] {
  const { events, members, board } = input;
  const safeBoard = board ?? null;

  const purchasesByCommandId = new Map<
    string,
    { playerId: PlayerId; propertyId: string; price: number }[]
  >();
  const purchasesByPlayerProp = new Map<string, { price: number }[]>();

  for (const e of events) {
    if (e.type !== "game/engine" || e.name !== "property/bought") continue;
    const data = e.data as {
      playerId?: PlayerId;
      propertyId?: string;
      price?: number;
    };
    const playerId = data.playerId;
    const propertyId = data.propertyId;
    const price =
      typeof data.price === "number" && Number.isFinite(data.price)
        ? Math.floor(data.price)
        : null;
    if (!playerId || !propertyId || price === null) continue;

    const cmd = e.causedBy?.commandId ?? null;
    if (cmd) {
      const list = purchasesByCommandId.get(cmd) ?? [];
      list.push({ playerId, propertyId, price });
      purchasesByCommandId.set(cmd, list);
    }

    const k = `${playerId}|${propertyId}`;
    const list2 = purchasesByPlayerProp.get(k) ?? [];
    list2.push({ price });
    purchasesByPlayerProp.set(k, list2);
  }

  const isDuplicatedPurchaseCharge = (
    e: Extract<Event, { type: "game/moneyChanged" }>,
  ) => {
    if (Math.trunc(e.delta) >= 0) return false;
    const r = parsePurchaseReason(e.reason);
    if (!r) return false;
    const propertyId = r.propertyId;

    const cmd = e.causedBy?.commandId ?? null;
    if (cmd) {
      const list = purchasesByCommandId.get(cmd) ?? null;
      if (
        list?.some(
          (p) => p.playerId === e.playerId && p.propertyId === propertyId,
        )
      )
        return true;
    }

    const list2 =
      purchasesByPlayerProp.get(`${e.playerId}|${propertyId}`) ?? null;
    if (!list2) return false;
    const amount = Math.abs(Math.trunc(e.delta));
    return list2.some((p) => p.price === amount);
  };

  const list: TimelineEntry[] = [];
  for (const e of events) {
    if (e.type === "game/moneyChanged" && isDuplicatedPurchaseCharge(e))
      continue;
    const entry = eventToTimelineEntry({ event: e, members, board: safeBoard });
    if (entry) list.push(entry);
  }
  return list;
}

export function eventToTimelineEntry(input: {
  event: Event;
  members: MemberLike[];
  board?: BoardLike | null;
}): TimelineEntry | null {
  const { event, members, board } = input;
  const memberName = (playerId: PlayerId) =>
    members.find((m) => m.playerId === playerId)?.displayName ?? playerId;
  const tileLabel = (idx: number) => boardTileLabel(board, idx);
  const propertyLabel = (propertyId: string) =>
    boardPropertyLabel(board, propertyId);

  if (event.type === "game/playerMoved") {
    const playerName = memberName(event.playerId);
    const toTileLabel = tileLabel(event.to);
    const subtitle = `${tileIndexLabel(event.from)} → ${tileIndexLabel(event.to)}${toTileLabel ? `（${toTileLabel}）` : ""}`;
    return {
      kind: "move",
      eventId: event.eventId,
      seq: event.seq,
      createdAtMs: event.createdAtMs,
      playerId: event.playerId,
      title: `${playerName} 移动`,
      subtitle,
      from: event.from,
      to: event.to,
      ...(toTileLabel ? { toTileLabel } : {}),
    };
  }

  if (event.type === "game/moneyChanged") {
    const playerName = memberName(event.playerId);
    const delta = Math.trunc(event.delta);
    const reason = event.reason;
    const reasonLabel = humanizeMoneyReason({
      reason,
      delta,
      propertyLabel,
      tileLabel,
      cardTextById: (cardId) => boardCardText(board, cardId),
    });
    return {
      kind: "charge",
      eventId: event.eventId,
      seq: event.seq,
      createdAtMs: event.createdAtMs,
      playerId: event.playerId,
      title: `${playerName} ${delta >= 0 ? "获得" : "支付"} ${formatMoney(Math.abs(delta))}`,
      subtitle: reasonLabel,
      delta,
      reason,
      reasonLabel,
    };
  }

  if (event.type === "game/engine" && event.name === "property/bought") {
    const data = event.data as {
      playerId?: PlayerId;
      propertyId?: string;
      price?: number;
    };
    const playerId = data.playerId;
    const propertyId = data.propertyId;
    const price =
      typeof data.price === "number" && Number.isFinite(data.price)
        ? Math.floor(data.price)
        : null;
    if (!playerId || !propertyId || price === null) return null;
    const playerName = memberName(playerId);
    const prop = propertyLabel(propertyId);
    return {
      kind: "purchase",
      eventId: event.eventId,
      seq: event.seq,
      createdAtMs: event.createdAtMs,
      playerId,
      title: `${playerName} 购买地产`,
      subtitle: `${prop}｜价格 ${formatMoney(price)}`,
      propertyId,
      propertyLabel: prop,
      price,
    };
  }

  return null;
}

function parsePurchaseReason(
  reasonRaw: string,
): { kind: "buy" | "auction"; propertyId: string } | null {
  const reason = String(reasonRaw || "");
  if (reason.startsWith("buy:"))
    return { kind: "buy", propertyId: reason.slice("buy:".length) };
  if (reason.startsWith("auction:"))
    return { kind: "auction", propertyId: reason.slice("auction:".length) };
  return null;
}

function tileIndexLabel(idx: number) {
  return `#${Math.max(0, Math.floor(idx))}`;
}

function formatMoney(amount: number) {
  return `¥${Math.max(0, Math.floor(amount)).toLocaleString("zh-CN")}`;
}

function boardTileLabel(
  board: BoardLike | null | undefined,
  tileIndex: number,
) {
  const idx = Math.max(0, Math.floor(tileIndex));
  const tile = board?.tiles?.[idx];
  if (!tile) return null;
  if (tile.kind === "start") return "起点（GO）";
  if (tile.kind === "jail") return "监狱/探监";
  if (tile.kind === "goToJail") return "进监狱";
  if (tile.kind === "tax") return "税收";
  if (tile.kind === "chance") return "机会";
  if (tile.kind === "communityChest") return "命运";
  if (tile.kind === "property") return tile.name ?? `地产 ${tile.propertyId}`;
  return null;
}

function boardPropertyLabel(
  board: BoardLike | null | undefined,
  propertyId: string,
) {
  const pid = String(propertyId || "");
  const tile = board?.tiles?.find(
    (t): t is Extract<BoardLikeTile, { kind: "property" }> =>
      t.kind === "property" && t.propertyId === pid,
  );
  if (!tile) return `地产 ${pid || "-"}`;
  return tile.name ?? `地产 ${pid || "-"}`;
}

function boardCardText(board: BoardLike | null | undefined, cardId: string) {
  const id = String(cardId || "");
  const hit = board?.cards?.find((c) => c.cardId === id);
  return hit?.text ?? null;
}

export function humanizeMoneyReason(input: {
  reason: string;
  delta: number;
  propertyLabel: (propertyId: string) => string;
  tileLabel: (tileIndex: number) => string | null;
  cardTextById: (cardId: string) => string | null;
}): string {
  const reason = String(input.reason || "");
  const delta = Math.trunc(input.delta);
  const dirPay = delta < 0;

  if (reason === "jailFine") return "监狱罚金";
  if (reason === "passStart") return "经过起点";
  if (reason === "debug:addCash") return "Debug 调整资金";

  const parse = (prefix: string) =>
    reason.startsWith(prefix) ? reason.slice(prefix.length) : null;

  const buyPid = parse("buy:");
  if (buyPid) return `购买地产：${input.propertyLabel(buyPid)}`;

  const auctionPid = parse("auction:");
  if (auctionPid) return `拍卖购得：${input.propertyLabel(auctionPid)}`;

  const rentPid = parse("rent:");
  if (rentPid)
    return `${dirPay ? "支付" : "收到"}租金：${input.propertyLabel(rentPid)}`;

  const mortgagePid = parse("mortgage:");
  if (mortgagePid) return `抵押地产：${input.propertyLabel(mortgagePid)}`;

  const redeemPid = parse("redeem:");
  if (redeemPid) return `赎回地产：${input.propertyLabel(redeemPid)}`;

  const buildPid = parse("build:");
  if (buildPid) return `建房：${input.propertyLabel(buildPid)}`;

  const sellPid = parse("sellBuilding:");
  if (sellPid) return `卖房：${input.propertyLabel(sellPid)}`;

  const taxPosRaw = parse("tax:");
  if (taxPosRaw) {
    const pos = Number(taxPosRaw);
    const posInt = Number.isFinite(pos) ? Math.max(0, Math.floor(pos)) : null;
    const label = posInt === null ? null : input.tileLabel(posInt);
    return `税收：#${posInt ?? "?"}${label ? ` ${label}` : ""}`;
  }

  const cardId = parse("card:");
  if (cardId) {
    const text = input.cardTextById(cardId);
    return `卡牌：${text ?? cardId}`;
  }

  const tradeId = parse("trade:");
  if (tradeId) return `${dirPay ? "交易支出" : "交易收入"}：${tradeId}`;

  return `资金变化（${reason || "unknown"}）`;
}
