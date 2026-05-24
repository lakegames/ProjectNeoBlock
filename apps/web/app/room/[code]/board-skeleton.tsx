"use client";

import Image from "next/image";
import * as React from "react";

import type {
  Command,
  Event,
  MatchSnapshot,
  ProtocolError,
} from "@neoblock/shared";

import { Button, Dialog, Drawer, Input, Popover, Tooltip } from "@neoblock/ui";

import {
  eventsToTimelineEntries,
  type BoardLike,
  type TimelineEntry,
} from "./timeline-mapper";

export type BoardPlayer = {
  playerId: string;
  displayName: string;
};

type CommandInput = Command extends infer C
  ? C extends unknown
    ? Omit<C, "commandId" | "clientSeq">
    : never
  : never;

type BoardPropertyTile = {
  kind: "property";
  propertyId: string;
  name?: string;
  groupId: string;
  groupName?: string;
  price: number;
  houseCost: number;
  rents: [number, number, number, number, number, number];
  ownerPlayerId?: string;
  mortgaged?: boolean;
  buildings?: number;
};

type BoardTile =
  | { kind: "start" }
  | BoardPropertyTile
  | { kind: "jail" }
  | { kind: "goToJail" }
  | { kind: "tax"; amount: number }
  | { kind: "chance" }
  | { kind: "communityChest" };

type CardDef = {
  cardId: string;
  deck: "chance" | "communityChest";
  text: string;
  effect: unknown;
};

type BoardConfig = {
  tiles: BoardTile[];
  jailIndex: number;
  cards?: CardDef[];
};

type PendingPrompt =
  | {
      kind: "buyOrAuction";
      promptId: string;
      playerId: string;
      propertyId: string;
      price: number;
    }
  | {
      kind: "auctionBid";
      promptId: string;
      playerId: string;
      propertyId: string;
      minBid: number;
      highestBid: number;
      highestBidderId?: string;
    };

type AuctionState = {
  propertyId: string;
  activeBidders: string[];
  currentBidderIndex: number;
  highestBid: number;
  highestBidderId?: string;
};

type TradeOffer = {
  cash: number;
  properties: string[];
  getOutOfJailChance?: number;
  getOutOfJailCommunity?: number;
};

type TradeState = {
  tradeId: string;
  fromPlayerId: string;
  toPlayerId: string;
  offer: TradeOffer;
  request: TradeOffer;
};

type DebtState = {
  debtorId: string;
  creditor: { kind: "bank" } | { kind: "player"; playerId: string };
  amount: number;
  reason: string;
};

type GameEngineState = {
  board: BoardConfig;
  pendingPrompt: PendingPrompt | null;
  auction: AuctionState | null;
  trade: TradeState | null;
  debt: DebtState | null;
  bank: { houses: number; hotels: number };
  decks: unknown;
  lastDice: [number, number] | null;
  turnOrder: string[];
};

type CardDrawn = {
  eventId: string;
  createdAtMs: number;
  deck: "chance" | "communityChest";
  cardId: string;
  playerId: string;
};

type ChatMessage = {
  eventId: string;
  createdAtMs: number;
  fromPlayerId: string;
  text: string;
  toPlayerId?: string;
};

type LiveProps = {
  snapshot: MatchSnapshot;
  selfPlayerId: string;
  sendCommand: (command: CommandInput) => void;
  pending: boolean;
  lastError: ProtocolError | null;
  lastCardDrawn: CardDrawn | null;
  clearLastCard: () => void;
  chatMessages: ChatMessage[];
  recentEvents50: Event[];
};

type LegacyProps = { players: BoardPlayer[]; selfPlayerId?: string | null };

export type BoardSkeletonProps = LiveProps | LegacyProps;

type PublicProfile = {
  id: string;
  displayName: string;
  avatarKind: "custom" | "github" | "none";
  avatarUrl: string | null;
};

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function formatMoney(amount: number) {
  return `¥${Math.max(0, Math.floor(amount)).toLocaleString("zh-CN")}`;
}

function formatClock(ms: number) {
  const t = new Date(ms);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const ss = String(t.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const playerColors = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#a855f7",
  "#e11d48",
  "#0ea5e9",
  "#d97706",
  "#22c55e",
];

function initialFor(name: string) {
  const s = name.trim();
  if (!s) return "?";
  const last = s.at(-1);
  return last ? last.toUpperCase() : "?";
}

function tileIndexAt(row: number, col: number) {
  return tileIndexAtRing(row, col, 10);
}

function tileIndexAtRing(row: number, col: number, side: number) {
  if (row === side) {
    if (col === side) return 0;
    if (col === 0) return side;
    return side - col;
  }
  if (col === 0) {
    if (row === side) return side;
    if (row === 0) return side * 2;
    return side * 2 - row;
  }
  if (row === 0) {
    if (col === 0) return side * 2;
    if (col === side) return side * 3;
    return side * 2 + col;
  }
  if (col === side) {
    if (row === 0) return side * 3;
    if (row === side) return 0;
    return side * 3 + row;
  }
  return null;
}

const tileNames: string[] = [
  "起点（GO）",
  "旧金山",
  "命运",
  "洛杉矶",
  "税收",
  "纽约",
  "多伦多",
  "机会",
  "温哥华",
  "西雅图",
  "监狱/探监",
  "墨西哥城",
  "里约热内卢",
  "布宜诺斯艾利斯",
  "伦敦",
  "巴黎",
  "阿姆斯特丹",
  "命运",
  "柏林",
  "罗马",
  "机会",
  "马德里",
  "机会",
  "里斯本",
  "苏黎世",
  "斯德哥尔摩",
  "赫尔辛基",
  "莫斯科",
  "伊斯坦布尔",
  "迪拜",
  "进监狱",
  "开罗",
  "内罗毕",
  "命运",
  "约翰内斯堡",
  "新德里",
  "机会",
  "北京",
  "税收",
  "东京",
];

function propertyName(propertyId: string) {
  return `地块 ${propertyId}`;
}

function buildPlayerDerived(players: BoardPlayer[]) {
  return players.map((p, i) => {
    const color = playerColors[i % playerColors.length];
    return { ...p, cash: 0, tile: 0, color, assets: [] };
  });
}

function tileTitle(tile: BoardTile, idx: number) {
  if (tile.kind === "start") return "起点（GO）";
  if (tile.kind === "jail") return "监狱/探监";
  if (tile.kind === "goToJail") return "进监狱";
  if (tile.kind === "tax") return `税收（${formatMoney(tile.amount)}）`;
  if (tile.kind === "chance") return "机会";
  if (tile.kind === "communityChest") return "命运";
  if (tile.kind === "property")
    return tile.name ?? propertyName(tile.propertyId);
  return `格子 ${idx}`;
}

function getPropertyTile(board: BoardConfig, propertyId: string) {
  return (
    board.tiles.find(
      (t): t is BoardPropertyTile =>
        t.kind === "property" && t.propertyId === propertyId,
    ) ?? null
  );
}

function groupColorById(groupId: string) {
  return (
    playerColors[hashString(groupId) % playerColors.length] ??
    "rgba(0,0,0,0.08)"
  );
}

function calcPropertyRent(board: BoardConfig, tile: BoardPropertyTile) {
  if (tile.mortgaged) return 0;

  const buildingsRaw = tile.buildings ?? 0;
  const buildings = Math.min(
    tile.rents.length - 1,
    Math.max(0, Math.floor(buildingsRaw)),
  );
  if (buildings > 0) return tile.rents[buildings] ?? 0;

  const base = tile.rents[0] ?? 0;
  const owner = tile.ownerPlayerId ?? null;
  if (!owner) return base;

  const groupTiles = board.tiles.filter(
    (t): t is BoardPropertyTile =>
      t.kind === "property" && t.groupId === tile.groupId,
  );
  const monopoly =
    groupTiles.length > 0 &&
    groupTiles.every(
      (t) => (t.ownerPlayerId ?? null) === owner && !t.mortgaged,
    );
  return monopoly ? base * 2 : base;
}

export function BoardSkeleton(props: BoardSkeletonProps) {
  if (!("snapshot" in props)) {
    const derived = React.useMemo(
      () => buildPlayerDerived(props.players),
      [props.players],
    );

    const [search, setSearch] = React.useState("");
    const [activePlayerId, setActivePlayerId] = React.useState<string | null>(
      null,
    );
    const [drawerPlayerId, setDrawerPlayerId] = React.useState<string | null>(
      null,
    );

    const activePlayer =
      derived.find((p) => p.playerId === activePlayerId) ?? null;
    const drawerPlayer =
      derived.find((p) => p.playerId === drawerPlayerId) ?? null;

    const filteredTiles = React.useMemo(() => {
      const q = search.trim();
      if (!q) return null;
      const hit = tileNames
        .map((name, idx) => ({ idx, name }))
        .filter((t) => t.name.includes(q) || String(t.idx).includes(q))
        .slice(0, 6);
      return hit.length ? hit : null;
    }, [search]);

    return (
      <section style={{ marginTop: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
              }}
            >
              棋盘
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索格子（名称/序号）"
              style={{ minWidth: 240 }}
            />
          </div>
        </div>

        {filteredTiles ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div
              style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
            >
              匹配：
            </div>
            {filteredTiles.map((t) => (
              <Button
                key={t.idx}
                size="sm"
                mode="Second"
                onClick={() => setSearch(String(t.idx))}
              >
                #{t.idx} {t.name}
              </Button>
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div
            style={{
              width: "min(80vh, 760px)",
              minWidth: 320,
              aspectRatio: "1",
              borderRadius: "var(--nb-radius-lg, 16px)",
              border: "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
              background: "var(--nb-color-surface, #fff)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "grid",
                gridTemplateColumns: "repeat(11, minmax(0, 1fr))",
              }}
            >
              {Array.from({ length: 121 }, (_, cellIndex) => {
                const row = Math.floor(cellIndex / 11);
                const col = cellIndex % 11;
                const tileIndex = tileIndexAt(row, col);
                const isTile = tileIndex != null;
                const name = isTile
                  ? (tileNames[tileIndex] ?? `格子 ${tileIndex}`)
                  : null;
                const pieces: typeof derived = [];
                const focused =
                  search.trim() &&
                  isTile &&
                  (String(tileIndex) === search.trim() ||
                    name?.includes(search.trim()));

                if (!isTile) {
                  return (
                    <div
                      key={`${row}-${col}`}
                      style={{
                        background:
                          row >= 3 && row <= 7 && col >= 3 && col <= 7
                            ? "var(--nb-color-bg, #f8fafc)"
                            : "var(--nb-color-surface, #fff)",
                        border: "1px solid rgba(0,0,0,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        fontSize: 12,
                        userSelect: "none",
                      }}
                    >
                      {row === 5 && col === 5 ? "NEOBLOCK" : null}
                    </div>
                  );
                }

                return (
                  <div
                    key={`${row}-${col}`}
                    style={{
                      position: "relative",
                      border: focused
                        ? "2px solid var(--nb-color-primary, #2563eb)"
                        : "1px solid rgba(0,0,0,0.08)",
                      background: focused
                        ? "var(--nb-color-primary-soft, rgba(37,99,235,0.12))"
                        : "var(--nb-color-surface, #fff)",
                      padding: 6,
                      overflow: "hidden",
                    }}
                  >
                    <Tooltip
                      content={
                        <span>
                          #{tileIndex} {name}
                        </span>
                      }
                    >
                      <div
                        tabIndex={0}
                        style={{
                          fontSize: 11,
                          lineHeight: "14px",
                          color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                          fontWeight: tileIndex % 10 === 0 ? 800 : 600,
                          outline: "none",
                          cursor: "default",
                        }}
                      >
                        #{tileIndex}
                        <div
                          style={{
                            marginTop: 4,
                            color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {name}
                        </div>
                      </div>
                    </Tooltip>

                    {pieces.length ? (
                      <div
                        style={{
                          position: "absolute",
                          right: 6,
                          bottom: 6,
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                          justifyContent: "end",
                        }}
                      >
                        {pieces.map((p, i) => (
                          <div
                            key={p.playerId}
                            title={p.displayName}
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              background: p.color,
                              border: "1px solid rgba(255,255,255,0.9)",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                              transform: `translateY(${Math.min(8, i) * -1}px)`,
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <aside
            style={{
              flex: "1 1 320px",
              minWidth: 320,
              borderRadius: "var(--nb-radius-lg, 16px)",
              border: "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
              background: "var(--nb-color-surface, #fff)",
              padding: 14,
            }}
          >
            <div
              style={{
                fontWeight: 800,
                color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
              }}
            >
              玩家面板
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {derived.map((p) => {
                const isSelf = !!selfPlayerId && p.playerId === selfPlayerId;
                return (
                  <div
                    key={p.playerId}
                    style={{
                      borderRadius: "var(--nb-radius-md, 12px)",
                      border: isSelf
                        ? `2px solid ${p.color}`
                        : "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
                      padding: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          background: p.color,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.14)",
                          flex: "0 0 auto",
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.displayName}
                          {isSelf ? (
                            <span
                              style={{
                                marginLeft: 6,
                                color:
                                  "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                              }}
                            >
                              （我）
                            </span>
                          ) : null}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                            fontSize: 13,
                            lineHeight: "18px",
                          }}
                        >
                          对局未开始
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        justifyContent: "end",
                      }}
                    >
                      <Button
                        size="sm"
                        mode="Default"
                        onClick={() => setDrawerPlayerId(p.playerId)}
                      >
                        资产
                      </Button>
                      <Button
                        size="sm"
                        mode="Default"
                        onClick={() => setActivePlayerId(p.playerId)}
                      >
                        详情
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>

        <Dialog
          open={!!activePlayer}
          onOpenChange={(o) => setActivePlayerId(o ? activePlayerId : null)}
          title={activePlayer ? `玩家：${activePlayer.displayName}` : undefined}
          footer={
            activePlayer ? (
              <>
                <Button
                  mode="Second"
                  onClick={() => setDrawerPlayerId(activePlayer.playerId)}
                >
                  查看资产
                </Button>
                <Button mode="Primary" onClick={() => setActivePlayerId(null)}>
                  确定
                </Button>
              </>
            ) : null
          }
        >
          {activePlayer ? (
            <div
              style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
            >
              对局未开始
            </div>
          ) : null}
        </Dialog>

        <Drawer
          open={!!drawerPlayer}
          onOpenChange={(o) => setDrawerPlayerId(o ? drawerPlayerId : null)}
          title={
            drawerPlayer ? `${drawerPlayer.displayName} 的资产` : undefined
          }
        >
          {drawerPlayer ? (
            <div
              style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
            >
              对局未开始
            </div>
          ) : null}
        </Drawer>
      </section>
    );
  }

  const {
    snapshot,
    selfPlayerId,
    sendCommand,
    pending,
    lastError,
    lastCardDrawn,
    clearLastCard,
    chatMessages,
    recentEvents50,
  } = props;
  const room = snapshot.room;
  const game = snapshot.game;
  if (!game) return null;

  const engine = (game.engineState as unknown as GameEngineState) ?? null;
  const board = engine?.board;
  if (!board) return null;

  const boardLike: BoardLike = React.useMemo(() => {
    const tiles = board.tiles.map((t): BoardLike["tiles"][number] => {
      if (t.kind === "tax") return { kind: "tax", amount: t.amount };
      if (t.kind === "property")
        return {
          kind: "property",
          propertyId: t.propertyId,
          ...(t.name ? { name: t.name } : {}),
        };
      if (t.kind === "start") return { kind: "start" };
      if (t.kind === "jail") return { kind: "jail" };
      if (t.kind === "goToJail") return { kind: "goToJail" };
      if (t.kind === "chance") return { kind: "chance" };
      return { kind: "communityChest" };
    });
    const cards = (board.cards ?? []).map((c) => ({
      cardId: c.cardId,
      text: c.text,
    }));
    return { tiles, ...(cards.length ? { cards } : {}) };
  }, [board.cards, board.tiles]);

  const timeline: TimelineEntry[] = React.useMemo(() => {
    const members = room.members.map((m) => ({
      playerId: m.playerId,
      displayName: m.displayName,
    }));
    return eventsToTimelineEntries({
      events: recentEvents50,
      members,
      board: boardLike,
    });
  }, [boardLike, recentEvents50, room.members]);

  const membersById = React.useMemo(
    () => new Map(room.members.map((m) => [m.playerId, m])),
    [room.members],
  );
  const propertyLabel = React.useCallback(
    (propertyId: string) => {
      const t = getPropertyTile(board, propertyId);
      return t?.name ?? propertyName(propertyId);
    },
    [board],
  );
  const players = game.players.map((p) => {
    const member = membersById.get(p.playerId);
    return {
      playerId: p.playerId,
      displayName: member?.displayName ?? p.playerId,
      seatIndex: member?.seatIndex ?? 0,
      cash: p.cash,
      position: p.position,
      eliminated: !!p.eliminated,
      inJail: !!p.inJail,
      jailTurns: p.jailTurns ?? 0,
      properties: p.properties ?? [],
    };
  });

  const self = players.find((p) => p.playerId === selfPlayerId) ?? null;
  const selfMember = membersById.get(selfPlayerId) ?? null;
  const isSpectator = !!selfMember?.isSpectator;

  const [search, setSearch] = React.useState("");
  const [activePlayerId, setActivePlayerId] = React.useState<string | null>(
    null,
  );
  const [drawerPlayerId, setDrawerPlayerId] = React.useState<string | null>(
    null,
  );

  const [tradeOpen, setTradeOpen] = React.useState(false);
  const [tradeTo, setTradeTo] = React.useState<string>("");
  const [tradeOfferCash, setTradeOfferCash] = React.useState("0");
  const [tradeRequestCash, setTradeRequestCash] = React.useState("0");
  const [tradeOfferProps, setTradeOfferProps] = React.useState<
    Record<string, boolean>
  >({});
  const [tradeRequestProps, setTradeRequestProps] = React.useState<
    Record<string, boolean>
  >({});

  const [auctionBid, setAuctionBid] = React.useState("");
  const promptStackStorageKey = React.useMemo(
    () => `nb_prompt_stack_collapsed:${room.roomId}:${selfPlayerId}`,
    [room.roomId, selfPlayerId],
  );
  const [promptStackCollapsed, setPromptStackCollapsed] = React.useState<
    Record<string, boolean>
  >({});
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(promptStackStorageKey);
      if (!raw) {
        setPromptStackCollapsed({});
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") {
        setPromptStackCollapsed({});
        return;
      }
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "boolean") next[k] = v;
      }
      setPromptStackCollapsed(next);
    } catch {
      setPromptStackCollapsed({});
    }
  }, [promptStackStorageKey]);
  const setPromptStackCollapsedFor = React.useCallback(
    (key: string, collapsed: boolean) => {
      setPromptStackCollapsed((s) => {
        const next = { ...s, [key]: collapsed };
        if (typeof window !== "undefined")
          window.localStorage.setItem(
            promptStackStorageKey,
            JSON.stringify(next),
          );
        return next;
      });
    },
    [promptStackStorageKey],
  );
  const [debugOpen, setDebugOpen] = React.useState(false);
  const [debugTargetPlayerId, setDebugTargetPlayerId] =
    React.useState(selfPlayerId);
  const [debugCashDelta, setDebugCashDelta] = React.useState("0");
  const [debugPropertyId, setDebugPropertyId] = React.useState("");
  const [debugOwnerPlayerId, setDebugOwnerPlayerId] =
    React.useState<string>("");
  const [debugBuildings, setDebugBuildings] = React.useState("0");
  const debugMode = debugOpen;

  const activePlayer =
    players.find((p) => p.playerId === activePlayerId) ?? null;
  const drawerPlayer =
    players.find((p) => p.playerId === drawerPlayerId) ?? null;
  const tradeToPlayer = players.find((p) => p.playerId === tradeTo) ?? null;
  const playerColorById = React.useMemo(() => {
    return new Map(
      players.map(
        (p) =>
          [
            p.playerId,
            playerColors[(p.seatIndex ?? 0) % playerColors.length],
          ] as const,
      ),
    );
  }, [players]);

  const userIdsKey = React.useMemo(() => {
    const ids = [
      ...new Set(
        room.members.map((m) => m.userId).filter((x): x is string => !!x),
      ),
    ];
    ids.sort();
    return ids.join(",");
  }, [room.members]);
  const [publicProfiles, setPublicProfiles] = React.useState<
    Record<string, PublicProfile>
  >({});
  React.useEffect(() => {
    const ids = userIdsKey ? userIdsKey.split(",").filter(Boolean) : [];
    if (!ids.length) {
      setPublicProfiles({});
      return;
    }
    fetch(`/api/profile/public?ids=${encodeURIComponent(ids.join(","))}`, {
      cache: "no-store",
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) return;
        const list = (json.profiles ?? []) as PublicProfile[];
        const map: Record<string, PublicProfile> = {};
        for (const p of list) map[p.id] = p;
        setPublicProfiles(map);
      })
      .catch(() => {});
  }, [userIdsKey]);

  const tileNamesLive = React.useMemo(
    () => board.tiles.map((t, i) => tileTitle(t, i)),
    [board.tiles],
  );
  const isHost = selfPlayerId === room.hostPlayerId;
  const canUseDebug = isHost && !isSpectator;
  const propertyOptions = React.useMemo(() => {
    return board.tiles
      .map((t, idx) => {
        if (t.kind !== "property") return null;
        const n = t.name ?? propertyName(t.propertyId);
        return {
          propertyId: t.propertyId,
          label: `${n}（${t.propertyId}）｜#${idx}`,
        };
      })
      .filter((x): x is { propertyId: string; label: string } => x !== null);
  }, [board.tiles, tileNamesLive]);

  React.useEffect(() => {
    if (!debugOpen) return;
    if (!debugPropertyId && propertyOptions.length)
      setDebugPropertyId(propertyOptions[0]!.propertyId);
  }, [debugOpen, debugPropertyId, propertyOptions]);

  const filteredTiles = React.useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    const hit = tileNamesLive
      .map((name, idx) => ({ idx, name }))
      .filter((t) => t.name.includes(q) || String(t.idx).includes(q))
      .slice(0, 6);
    return hit.length ? hit : null;
  }, [search, tileNamesLive]);

  const currentPlayerName =
    membersById.get(game.currentPlayerId)?.displayName ?? game.currentPlayerId;
  const isMyTurn = game.currentPlayerId === selfPlayerId;
  const canAct = !isSpectator && isMyTurn && !pending;
  const canRespondPrompt = !isSpectator && !pending;

  const pendingPrompt = engine.pendingPrompt;
  const buyPrompt =
    pendingPrompt?.kind === "buyOrAuction" ? pendingPrompt : null;
  const auctionPrompt =
    pendingPrompt?.kind === "auctionBid" ? pendingPrompt : null;

  const trade = engine.trade;

  const debt = engine.debt;
  type PromptStackItem =
    | { kind: "debt"; key: string; debt: DebtState }
    | { kind: "trade"; key: string; trade: TradeState }
    | {
        kind: "auctionBid";
        key: string;
        prompt: Extract<PendingPrompt, { kind: "auctionBid" }>;
      }
    | {
        kind: "buyOrAuction";
        key: string;
        prompt: Extract<PendingPrompt, { kind: "buyOrAuction" }>;
      };

  const tradeOfferCashValue = React.useMemo(
    () => Math.max(0, Math.floor(Number(tradeOfferCash))),
    [tradeOfferCash],
  );
  const tradeRequestCashValue = React.useMemo(
    () => Math.max(0, Math.floor(Number(tradeRequestCash))),
    [tradeRequestCash],
  );
  const tradeLocalError = React.useMemo(() => {
    if (!tradeOpen) return null;
    if (!self) return "未加入对局";
    if (isSpectator) return "观战者无法发起交易";
    if (!isMyTurn) return "仅当前回合玩家可发起交易";
    if (pending) return "正在处理上一条指令…";
    if (game.phase !== "await_end_turn") return "仅回合结束阶段可发起交易";
    if (!tradeTo) return "请选择交易对象";
    if (!tradeToPlayer) return "交易对象不存在";
    if (tradeOfferCashValue > self.cash) return "我给对方的现金超出我的余额";
    if (tradeRequestCashValue > tradeToPlayer.cash)
      return "我向对方要的现金超出对方余额";
    return null;
  }, [
    game.phase,
    isMyTurn,
    isSpectator,
    pending,
    self,
    tradeOfferCashValue,
    tradeOpen,
    tradeRequestCashValue,
    tradeTo,
    tradeToPlayer,
  ]);

  const buyKey = buyPrompt ? `prompt:${buyPrompt.promptId}` : null;
  const auctionKey = auctionPrompt ? `prompt:${auctionPrompt.promptId}` : null;
  const tradeKey = trade ? `trade:${trade.tradeId}` : null;
  const debtKey = debt ? `debt:${debt.debtorId}` : null;

  const promptStackItems: PromptStackItem[] = React.useMemo(() => {
    const items: PromptStackItem[] = [];
    if (debt && debtKey) items.push({ kind: "debt", key: debtKey, debt });
    if (trade && tradeKey && game.phase === "await_prompt")
      items.push({ kind: "trade", key: tradeKey, trade });
    if (auctionPrompt && auctionKey)
      items.push({
        kind: "auctionBid",
        key: auctionKey,
        prompt: auctionPrompt,
      });
    if (buyPrompt && buyKey)
      items.push({ kind: "buyOrAuction", key: buyKey, prompt: buyPrompt });
    return items;
  }, [
    auctionKey,
    auctionPrompt,
    buyKey,
    buyPrompt,
    debt,
    debtKey,
    game.phase,
    trade,
    tradeKey,
  ]);

  React.useEffect(() => {
    setAuctionBid("");
  }, [auctionPrompt?.promptId]);

  const myProperties = React.useMemo(() => {
    if (!self) return [];
    return board.tiles
      .filter(
        (t): t is BoardPropertyTile =>
          t.kind === "property" && t.ownerPlayerId === self.playerId,
      )
      .map((t) => ({
        propertyId: t.propertyId,
        groupId: t.groupId,
        price: t.price,
        houseCost: t.houseCost,
        mortgaged: !!t.mortgaged,
        buildings: t.buildings ?? 0,
      }));
  }, [board.tiles, self]);

  const otherPlayers = React.useMemo(
    () => players.filter((p) => p.playerId !== selfPlayerId && !p.eliminated),
    [players, selfPlayerId],
  );

  React.useEffect(() => {
    if (!tradeOpen) return;
    if (!tradeTo && otherPlayers.length) setTradeTo(otherPlayers[0]!.playerId);
  }, [otherPlayers, tradeOpen, tradeTo]);

  const onRollDice = React.useCallback(() => {
    if (!canAct) return;
    if (game.phase !== "await_roll") return;
    sendCommand({
      type: "game/rollDice",
      roomId: room.roomId,
      gameId: game.gameId,
      playerId: selfPlayerId,
    });
  }, [canAct, game.gameId, game.phase, room.roomId, selfPlayerId, sendCommand]);

  const onEndTurn = React.useCallback(() => {
    if (!canAct) return;
    if (game.phase !== "await_end_turn") return;
    sendCommand({
      type: "game/endTurn",
      roomId: room.roomId,
      gameId: game.gameId,
      playerId: selfPlayerId,
    });
  }, [canAct, game.gameId, game.phase, room.roomId, selfPlayerId, sendCommand]);

  const canRoll = canAct && game.phase === "await_roll";
  const canEndTurn = canAct && game.phase === "await_end_turn";

  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatTo, setChatTo] = React.useState("");
  const [chatText, setChatText] = React.useState("");
  const canSendChat =
    !pending && !!chatText.trim() && chatText.trim().length <= 400;
  const onSendChat = React.useCallback(() => {
    if (!canSendChat) return;
    const text = chatText.trim();
    sendCommand({
      type: "room/sendChat",
      roomId: room.roomId,
      playerId: selfPlayerId,
      text,
      ...(chatTo ? { toPlayerId: chatTo } : {}),
    });
    setChatText("");
  }, [canSendChat, chatText, chatTo, room.roomId, selfPlayerId, sendCommand]);

  const chatTargets = React.useMemo(() => {
    const list = room.members
      .map((m) => ({ playerId: m.playerId, displayName: m.displayName }))
      .filter((x) => x.playerId !== selfPlayerId);
    list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return list;
  }, [room.members, selfPlayerId]);

  const [floatingChats, setFloatingChats] = React.useState<ChatMessage[]>([]);
  const lastFloatingIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const last = chatMessages.at(-1) ?? null;
    if (!last) return;
    if (last.eventId === lastFloatingIdRef.current) return;
    lastFloatingIdRef.current = last.eventId;
    setFloatingChats((s) => [...s, last].slice(-3));
    const t = window.setTimeout(() => {
      setFloatingChats((s) => s.filter((x) => x.eventId !== last.eventId));
    }, 4_500);
    return () => window.clearTimeout(t);
  }, [chatMessages]);

  const [diceOverlay, setDiceOverlay] = React.useState<{
    dice: [number, number];
    open: boolean;
  } | null>(null);
  const lastDiceKeyRef = React.useRef<string>("");
  React.useEffect(() => {
    const d = engine.lastDice;
    if (!d) return;
    const key = `${game.gameId}:${game.rngStep}`;
    if (key === lastDiceKeyRef.current) return;
    lastDiceKeyRef.current = key;
    setDiceOverlay({ dice: d, open: false });
    const raf = window.requestAnimationFrame(() => {
      setDiceOverlay((s) => (s ? { ...s, open: true } : s));
    });
    const t1 = window.setTimeout(() => {
      setDiceOverlay((s) => (s ? { ...s, open: false } : s));
    }, 900);
    const t2 = window.setTimeout(() => setDiceOverlay(null), 1_100);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [engine.lastDice, game.gameId, game.rngStep]);

  return (
    <section style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
            }}
          >
            棋盘
          </div>
          <div
            style={{
              marginTop: 6,
              color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
            }}
          >
            回合 #{game.round}｜阶段 {game.phase}｜当前玩家 {currentPlayerName}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索格子（名称/序号）"
            style={{ minWidth: 240 }}
          />
          <Button mode="Default" onClick={onRollDice} disabled={!canRoll}>
            {engine.lastDice
              ? `掷骰（上次 ${engine.lastDice[0]} + ${engine.lastDice[1]}）`
              : "掷骰"}
          </Button>
          <Button mode="Default" onClick={onEndTurn} disabled={!canEndTurn}>
            结束回合
          </Button>
          <Button
            mode="Default"
            onClick={() => setDrawerPlayerId(selfPlayerId)}
            disabled={isSpectator || !self}
          >
            我的资产
          </Button>
          <Button
            mode="Default"
            onClick={() => setTradeOpen(true)}
            disabled={!canAct || game.phase !== "await_end_turn"}
          >
            发起交易
          </Button>
          {canUseDebug ? (
            <Tooltip content="仅房主可用；需服务端启用 NEOBLOCK_DEBUG_TOOLS=1">
              <Button mode="Second" onClick={() => setDebugOpen(true)}>
                Debug
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {filteredTiles ? (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}>
            匹配：
          </div>
          {filteredTiles.map((t) => (
            <Button
              key={t.idx}
              size="sm"
              mode="Default"
              onClick={() => setSearch(String(t.idx))}
            >
              #{t.idx} {t.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        {board.tiles.length >= 12 && board.tiles.length % 4 === 0 ? (
          <div
            style={{
              position: "relative",
              width: "min(80vh, 760px)",
              minWidth: 320,
              aspectRatio: "1",
              borderRadius: "var(--nb-radius-lg, 16px)",
              border: "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
              background: "var(--nb-color-surface, #fff)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "grid",
                gridTemplateColumns: `repeat(${board.tiles.length / 4 + 1}, minmax(0, 1fr))`,
              }}
            >
              {(() => {
                const side = Math.floor(board.tiles.length / 4);
                const size = side + 1;
                return Array.from({ length: size * size }, (_, cellIndex) => {
                  const row = Math.floor(cellIndex / size);
                  const col = cellIndex % size;
                  const tileIndex = tileIndexAtRing(row, col, side);
                  const isTile =
                    tileIndex != null && tileIndex < board.tiles.length;
                  const name = isTile ? tileNamesLive[tileIndex] : null;
                  const tile = isTile
                    ? (board.tiles[tileIndex] as BoardTile)
                    : null;
                  const pieces = isTile
                    ? players.filter(
                        (p) => p.position === tileIndex && !p.eliminated,
                      )
                    : [];
                  const focused =
                    search.trim() &&
                    isTile &&
                    (String(tileIndex) === search.trim() ||
                      name?.includes(search.trim()));

                  if (!isTile) {
                    return (
                      <div
                        key={`${row}-${col}`}
                        style={{
                          background:
                            row >= Math.floor(size / 3) &&
                            row <= Math.floor((size * 2) / 3) &&
                            col >= Math.floor(size / 3) &&
                            col <= Math.floor((size * 2) / 3)
                              ? "var(--nb-color-bg, #f8fafc)"
                              : "var(--nb-color-surface, #fff)",
                          border: "1px solid rgba(0,0,0,0.04)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          fontSize: 12,
                          userSelect: "none",
                        }}
                      >
                        {row === Math.floor(size / 2) &&
                        col === Math.floor(size / 2)
                          ? "NEOBLOCK"
                          : null}
                      </div>
                    );
                  }

                  const pieceColors = pieces.map(
                    (p) =>
                      playerColors[(p.seatIndex ?? 0) % playerColors.length],
                  );
                  const ownedBy =
                    tile && tile.kind === "property"
                      ? (tile.ownerPlayerId ?? null)
                      : null;
                  const ownerColor = ownedBy
                    ? (playerColorById.get(ownedBy) ?? null)
                    : null;
                  const groupColor =
                    tile && tile.kind === "property"
                      ? groupColorById(tile.groupId)
                      : null;
                  const mortgaged =
                    tile && tile.kind === "property" ? !!tile.mortgaged : false;
                  const buildings =
                    tile && tile.kind === "property"
                      ? Math.max(0, Math.floor(tile.buildings ?? 0))
                      : 0;

                  return (
                    <div
                      key={`${row}-${col}`}
                      style={{
                        position: "relative",
                        border: focused
                          ? "2px solid var(--nb-color-primary, #2563eb)"
                          : "1px solid rgba(0,0,0,0.08)",
                        background: focused
                          ? "var(--nb-color-primary-soft, rgba(37,99,235,0.12))"
                          : "var(--nb-color-surface, #fff)",
                        padding: 6,
                        overflow: "hidden",
                      }}
                    >
                      {tile && tile.kind === "property" ? (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              right: 0,
                              height: 6,
                              background: groupColor ?? "rgba(0,0,0,0.08)",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              bottom: 0,
                              right: 0,
                              height: 4,
                              background: ownerColor ?? "rgba(0,0,0,0.08)",
                              opacity: ownerColor ? 1 : 0.5,
                            }}
                          />
                          {mortgaged ? (
                            <div
                              style={{
                                position: "absolute",
                                left: 6,
                                top: 8,
                                padding: "1px 6px",
                                borderRadius: 999,
                                background: "rgba(0,0,0,0.08)",
                                color: "rgba(0,0,0,0.75)",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              抵
                            </div>
                          ) : null}
                          {buildings > 0 ? (
                            <div
                              style={{
                                position: "absolute",
                                right: 6,
                                top: 8,
                                padding: "1px 6px",
                                borderRadius: 999,
                                background: "rgba(0,0,0,0.08)",
                                color: "rgba(0,0,0,0.75)",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              {buildings}
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      <Popover
                        content={
                          <div
                            style={{
                              width: 280,
                              maxWidth: "min(86vw, 280px)",
                              display: "grid",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 800,
                                color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                              }}
                            >
                              {`#${tileIndex} `}
                              {name}
                            </div>
                            {tile && tile.kind === "property" ? (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: 999,
                                    background: groupColorById(tile.groupId),
                                    border: "1px solid rgba(0,0,0,0.12)",
                                  }}
                                />
                                <div
                                  style={{
                                    color:
                                      "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                    fontSize: 13,
                                    lineHeight: "18px",
                                  }}
                                >
                                  {tile.groupName ?? tile.groupId}
                                </div>
                              </div>
                            ) : null}
                            {tile ? (
                              <div
                                style={{
                                  color:
                                    "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                  fontSize: 13,
                                  lineHeight: "18px",
                                }}
                              >
                                {tile.kind === "start"
                                  ? "起点"
                                  : tile.kind === "jail"
                                    ? "监狱/探监"
                                    : tile.kind === "goToJail"
                                      ? "进监狱"
                                      : tile.kind === "tax"
                                        ? `税收：${formatMoney((tile as { amount: number }).amount)}`
                                        : tile.kind === "chance"
                                          ? "机会"
                                          : tile.kind === "communityChest"
                                            ? "命运"
                                            : tile.kind === "property"
                                              ? `地产${debugMode ? `：${(tile as BoardPropertyTile).propertyId}` : ""}`
                                              : ""}
                              </div>
                            ) : null}

                            {tile && tile.kind === "property" ? (
                              <>
                                <div
                                  style={{
                                    color: "rgba(0,0,0,0.65)",
                                    fontSize: 13,
                                  }}
                                >
                                  价格 {formatMoney(tile.price)}｜房价{" "}
                                  {formatMoney(tile.houseCost)}｜建筑{" "}
                                  {buildings}｜{mortgaged ? "已抵押" : "未抵押"}
                                </div>
                                <div
                                  style={{
                                    color: "rgba(0,0,0,0.65)",
                                    fontSize: 13,
                                  }}
                                >
                                  过路费（当前）{" "}
                                  {formatMoney(calcPropertyRent(board, tile))}
                                </div>
                                <div
                                  style={{
                                    color: "rgba(0,0,0,0.65)",
                                    fontSize: 12,
                                    lineHeight: "16px",
                                  }}
                                >
                                  过路费表 空地{" "}
                                  {formatMoney(tile.rents[0] ?? 0)}｜1{" "}
                                  {formatMoney(tile.rents[1] ?? 0)}｜2{" "}
                                  {formatMoney(tile.rents[2] ?? 0)}｜3{" "}
                                  {formatMoney(tile.rents[3] ?? 0)}｜4{" "}
                                  {formatMoney(tile.rents[4] ?? 0)}｜5{" "}
                                  {formatMoney(tile.rents[5] ?? 0)}
                                </div>
                                <div
                                  style={{
                                    color: "rgba(0,0,0,0.65)",
                                    fontSize: 13,
                                  }}
                                >
                                  {tile.ownerPlayerId
                                    ? `归属 ${membersById.get(tile.ownerPlayerId)?.displayName ?? tile.ownerPlayerId}`
                                    : "未售出"}
                                </div>
                                {tile.ownerPlayerId === selfPlayerId ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <Button
                                      size="sm"
                                      mode="Second"
                                      onClick={() =>
                                        sendCommand({
                                          type: "game/build",
                                          roomId: room.roomId,
                                          gameId: game.gameId,
                                          playerId: selfPlayerId,
                                          propertyId: tile.propertyId,
                                        })
                                      }
                                      disabled={!canAct}
                                    >
                                      建房
                                    </Button>
                                    <Button
                                      size="sm"
                                      mode="Second"
                                      onClick={() =>
                                        sendCommand({
                                          type: "game/sellBuilding",
                                          roomId: room.roomId,
                                          gameId: game.gameId,
                                          playerId: selfPlayerId,
                                          propertyId: tile.propertyId,
                                        })
                                      }
                                      disabled={!canAct}
                                    >
                                      卖房
                                    </Button>
                                    <Button
                                      size="sm"
                                      mode="Second"
                                      onClick={() =>
                                        sendCommand({
                                          type: "game/mortgageProperty",
                                          roomId: room.roomId,
                                          gameId: game.gameId,
                                          playerId: selfPlayerId,
                                          propertyId: tile.propertyId,
                                        })
                                      }
                                      disabled={!canAct || mortgaged}
                                    >
                                      抵押
                                    </Button>
                                    <Button
                                      size="sm"
                                      mode="Second"
                                      onClick={() =>
                                        sendCommand({
                                          type: "game/redeemProperty",
                                          roomId: room.roomId,
                                          gameId: game.gameId,
                                          playerId: selfPlayerId,
                                          propertyId: tile.propertyId,
                                        })
                                      }
                                      disabled={!canAct || !mortgaged}
                                    >
                                      赎回
                                    </Button>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        }
                      >
                        <div
                          tabIndex={0}
                          role="button"
                          aria-label={`查看地块：#${tileIndex} ${name}`}
                          style={{
                            fontSize: 11,
                            lineHeight: "14px",
                            color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                            fontWeight: tileIndex % side === 0 ? 800 : 600,
                            outline: "none",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          {`#${tileIndex}`}
                          <div
                            style={{
                              marginTop: 4,
                              color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {name}
                          </div>
                          {tile && tile.kind === "property" ? (
                            <div
                              style={{
                                marginTop: 2,
                                color:
                                  "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                fontSize: 11,
                                lineHeight: "14px",
                              }}
                            >
                              {formatMoney(tile.price)}
                            </div>
                          ) : null}
                        </div>
                      </Popover>

                      {pieceColors.length ? (
                        <div
                          style={{
                            position: "absolute",
                            right: 6,
                            bottom: 6,
                            display: "flex",
                            gap: 4,
                            flexWrap: "wrap",
                            justifyContent: "end",
                          }}
                        >
                          {pieceColors.map((c, i) => (
                            <div
                              key={`${tileIndex}-${i}`}
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 999,
                                background: c,
                                border: "1px solid rgba(255,255,255,0.9)",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                                transform: `translateY(${Math.min(8, i) * -1}px)`,
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                });
              })()}
            </div>

            {diceOverlay ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: 16,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.88)",
                    border: "1px solid rgba(0,0,0,0.12)",
                    boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
                    transform: diceOverlay.open ? "scale(1)" : "scale(0.92)",
                    opacity: diceOverlay.open ? 1 : 0,
                    transition: "transform 160ms ease, opacity 160ms ease",
                  }}
                >
                  <img
                    src={`/lucks/Point0${diceOverlay.dice[0]}.svg`}
                    alt=""
                    width={64}
                    height={64}
                  />
                  <img
                    src={`/lucks/Point0${diceOverlay.dice[1]}.svg`}
                    alt=""
                    width={64}
                    height={64}
                  />
                </div>
              </div>
            ) : null}

            {floatingChats.length ? (
              <div
                style={{
                  position: "absolute",
                  right: 10,
                  bottom: 10,
                  display: "grid",
                  gap: 8,
                  pointerEvents: "none",
                  zIndex: 12,
                  width: "min(320px, 86%)",
                }}
              >
                {floatingChats
                  .slice()
                  .reverse()
                  .map((m) => {
                    const fromName =
                      membersById.get(m.fromPlayerId)?.displayName ??
                      m.fromPlayerId;
                    const toName = m.toPlayerId
                      ? (membersById.get(m.toPlayerId)?.displayName ??
                        m.toPlayerId)
                      : null;
                    return (
                      <div
                        key={m.eventId}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 12,
                          background: "rgba(15,23,42,0.92)",
                          color: "#fff",
                          boxShadow: "0 8px 24px rgba(15,23,42,0.24)",
                          lineHeight: "18px",
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 800, opacity: 0.9 }}>
                          {fromName}
                          {toName ? ` → ${toName}` : ""}
                        </div>
                        <div
                          style={{
                            marginTop: 2,
                            opacity: 0.98,
                            wordBreak: "break-word",
                          }}
                        >
                          {m.text}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              flex: "1 1 560px",
              minWidth: 320,
              borderRadius: "var(--nb-radius-lg, 16px)",
              border: "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
              background: "var(--nb-color-surface, #fff)",
              padding: 12,
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              {board.tiles.map((t, idx) => {
                const pieces = players.filter(
                  (p) => p.position === idx && !p.eliminated,
                );
                const name = tileTitle(t, idx);
                const focused =
                  search.trim() &&
                  (String(idx) === search.trim() ||
                    name.includes(search.trim()));
                const pieceColors = pieces.map(
                  (p) => playerColors[(p.seatIndex ?? 0) % playerColors.length],
                );
                const groupColor =
                  t.kind === "property" ? groupColorById(t.groupId) : null;
                const groupLabel =
                  t.kind === "property" ? (t.groupName ?? t.groupId) : null;
                return (
                  <div
                    key={idx}
                    style={{
                      position: "relative",
                      padding: 10,
                      borderRadius: 12,
                      border: focused
                        ? "2px solid var(--nb-color-primary, #2563eb)"
                        : "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
                      background: focused
                        ? "var(--nb-color-primary-soft, rgba(37,99,235,0.12))"
                        : "var(--nb-color-bg, #f8fafc)",
                      display: "grid",
                      gap: 8,
                      overflow: "hidden",
                    }}
                  >
                    {groupColor ? (
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          right: 0,
                          height: 6,
                          background: groupColor,
                        }}
                      />
                    ) : null}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "baseline",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 850,
                          color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                        }}
                      >
                        #{idx}
                      </div>
                      <Button
                        size="sm"
                        mode="NoBackground"
                        onClick={() => setSearch(String(idx))}
                      >
                        定位
                      </Button>
                    </div>

                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      {groupColor ? (
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: groupColor,
                            border: "1px solid rgba(0,0,0,0.12)",
                          }}
                        />
                      ) : null}
                      <div
                        style={{
                          fontWeight: 800,
                          color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                        }}
                      >
                        {name}
                        {groupLabel ? (
                          <span
                            style={{
                              marginLeft: 6,
                              color:
                                "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {groupLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      {pieceColors.length ? (
                        pieceColors.map((c, i) => (
                          <div
                            key={`${idx}-p-${i}`}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: c,
                              border: "1px solid rgba(255,255,255,0.9)",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                            }}
                          />
                        ))
                      ) : (
                        <div
                          style={{
                            color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                            fontSize: 12,
                          }}
                        >
                          无棋子
                        </div>
                      )}
                    </div>

                    {pieces.length ? (
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        {pieces.slice(0, 3).map((p) => (
                          <Button
                            key={p.playerId}
                            size="sm"
                            mode="Second"
                            onClick={() => setActivePlayerId(p.playerId)}
                          >
                            {p.displayName}
                          </Button>
                        ))}
                        {pieces.length > 3 ? (
                          <div
                            style={{
                              color:
                                "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                              fontSize: 12,
                            }}
                          >
                            +{pieces.length - 3}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {t.kind === "property" ? (
                      <div
                        style={{
                          marginTop: 4,
                          color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                          fontSize: 13,
                        }}
                      >
                        价格 {formatMoney(t.price)}｜房价{" "}
                        {formatMoney(t.houseCost)}｜
                        {t.ownerPlayerId
                          ? `归属 ${membersById.get(t.ownerPlayerId)?.displayName ?? t.ownerPlayerId}`
                          : "未售出"}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <aside
          style={{
            borderRadius: "var(--nb-radius-lg, 16px)",
            border: "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
            background: "var(--nb-color-surface, #fff)",
            padding: 12,
            flex: "1 1 340px",
            minWidth: 320,
            maxWidth: 420,
            height: "min(80vh, 760px)",
            overflow: "auto",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                }}
              >
                待处理提示
              </div>
              <div
                style={{
                  color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                  fontSize: 12,
                }}
              >
                {promptStackItems.length} 条
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {promptStackItems.length ? (
                promptStackItems.map((item) => {
                  const collapsed = promptStackCollapsed[item.key] === true;
                  const toggleCollapsed = () =>
                    setPromptStackCollapsedFor(item.key, !collapsed);
                  if (item.kind === "trade") {
                    const t = item.trade;
                    const fromName =
                      membersById.get(t.fromPlayerId)?.displayName ??
                      t.fromPlayerId;
                    const toName =
                      membersById.get(t.toPlayerId)?.displayName ??
                      t.toPlayerId;
                    const isTargetSelf = t.toPlayerId === selfPlayerId;
                    const isFromSelf = t.fromPlayerId === selfPlayerId;
                    const canActPrompt = isTargetSelf && canRespondPrompt;
                    const offerTitle = isTargetSelf
                      ? "对方给我"
                      : isFromSelf
                        ? "我给对方"
                        : `${fromName} 给 ${toName}`;
                    const requestTitle = isTargetSelf
                      ? "我给对方"
                      : isFromSelf
                        ? "对方给我"
                        : `${toName} 给 ${fromName}`;
                    const offerProps = t.offer.properties.map(propertyLabel);
                    const requestProps =
                      t.request.properties.map(propertyLabel);
                    return (
                      <div
                        key={item.key}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid rgba(0,0,0,0.08)",
                          background: "var(--nb-color-bg, #f8fafc)",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 800,
                              color: "rgba(0,0,0,0.82)",
                            }}
                          >
                            交易请求
                          </div>
                          <Button
                            size="sm"
                            mode="NoBackground"
                            onClick={toggleCollapsed}
                          >
                            {collapsed ? "展开" : "收起"}
                          </Button>
                        </div>
                        <div
                          style={{
                            color: "rgba(0,0,0,0.68)",
                            fontSize: 13,
                            lineHeight: "18px",
                            wordBreak: "break-word",
                          }}
                        >
                          {fromName} → {toName}
                        </div>
                        {!isTargetSelf ? (
                          <div
                            style={{
                              color:
                                "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                              fontSize: 13,
                              lineHeight: "18px",
                            }}
                          >
                            等待{toName}处理交易请求…
                          </div>
                        ) : null}
                        {!collapsed ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "grid", gap: 6 }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                                }}
                              >
                                {offerTitle}
                              </div>
                              <div
                                style={{
                                  color:
                                    "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                  fontSize: 13,
                                }}
                              >
                                现金 {formatMoney(t.offer.cash)}
                              </div>
                              <div
                                style={{
                                  color:
                                    "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                  fontSize: 13,
                                }}
                              >
                                地产{" "}
                                {offerProps.length
                                  ? offerProps.join("、")
                                  : "无"}
                              </div>
                            </div>
                            <div style={{ display: "grid", gap: 6 }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                                }}
                              >
                                {requestTitle}
                              </div>
                              <div
                                style={{
                                  color:
                                    "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                  fontSize: 13,
                                }}
                              >
                                现金 {formatMoney(t.request.cash)}
                              </div>
                              <div
                                style={{
                                  color:
                                    "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                  fontSize: 13,
                                }}
                              >
                                地产{" "}
                                {requestProps.length
                                  ? requestProps.join("、")
                                  : "无"}
                              </div>
                            </div>
                            {isTargetSelf ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  justifyContent: "end",
                                }}
                              >
                                <Button
                                  size="sm"
                                  mode="Second"
                                  onClick={() =>
                                    sendCommand({
                                      type: "game/respondTrade",
                                      roomId: room.roomId,
                                      gameId: game.gameId,
                                      playerId: selfPlayerId,
                                      accept: false,
                                    })
                                  }
                                  disabled={!canActPrompt}
                                >
                                  拒绝
                                </Button>
                                <Button
                                  size="sm"
                                  mode="Primary"
                                  onClick={() =>
                                    sendCommand({
                                      type: "game/respondTrade",
                                      roomId: room.roomId,
                                      gameId: game.gameId,
                                      playerId: selfPlayerId,
                                      accept: true,
                                    })
                                  }
                                  disabled={!canActPrompt}
                                >
                                  接受
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  if (item.kind === "buyOrAuction") {
                    const prompt = item.prompt;
                    const actorName =
                      membersById.get(prompt.playerId)?.displayName ??
                      prompt.playerId;
                    const isTargetSelf = prompt.playerId === selfPlayerId;
                    const canActPrompt =
                      prompt.playerId === selfPlayerId && canRespondPrompt;
                    return (
                      <div
                        key={item.key}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid rgba(0,0,0,0.08)",
                          background: "var(--nb-color-bg, #f8fafc)",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 800,
                              color: "rgba(0,0,0,0.82)",
                            }}
                          >
                            购买/拍卖
                          </div>
                          <Button
                            size="sm"
                            mode="NoBackground"
                            onClick={toggleCollapsed}
                          >
                            {collapsed ? "展开" : "收起"}
                          </Button>
                        </div>
                        <div
                          style={{
                            color: "rgba(0,0,0,0.68)",
                            fontSize: 13,
                            lineHeight: "18px",
                            wordBreak: "break-word",
                          }}
                        >
                          {actorName}：{propertyLabel(prompt.propertyId)}｜价格{" "}
                          {formatMoney(prompt.price)}
                        </div>
                        {!isTargetSelf ? (
                          <div
                            style={{
                              color:
                                "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                              fontSize: 13,
                              lineHeight: "18px",
                            }}
                          >
                            等待{actorName}…
                          </div>
                        ) : null}
                        {!collapsed ? (
                          isTargetSelf ? (
                            <>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div
                                  style={{
                                    color:
                                      "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                  }}
                                >
                                  我的现金
                                </div>
                                <div
                                  style={{
                                    fontWeight: 800,
                                    color:
                                      "var(--nb-color-fg, rgba(0,0,0,0.92))",
                                  }}
                                >
                                  {formatMoney(self?.cash ?? 0)}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  justifyContent: "end",
                                }}
                              >
                                <Button
                                  size="sm"
                                  mode="Second"
                                  onClick={() =>
                                    sendCommand({
                                      type: "game/respondPrompt",
                                      roomId: room.roomId,
                                      gameId: game.gameId,
                                      playerId: selfPlayerId,
                                      promptId: prompt.promptId,
                                      choice: { action: "auction" },
                                    })
                                  }
                                  disabled={!canActPrompt}
                                >
                                  放弃并拍卖
                                </Button>
                                <Button
                                  size="sm"
                                  mode="Primary"
                                  onClick={() =>
                                    sendCommand({
                                      type: "game/buyProperty",
                                      roomId: room.roomId,
                                      gameId: game.gameId,
                                      playerId: selfPlayerId,
                                      propertyId: prompt.propertyId,
                                    })
                                  }
                                  disabled={!canActPrompt}
                                >
                                  购买
                                </Button>
                              </div>
                            </>
                          ) : null
                        ) : null}
                      </div>
                    );
                  }
                  if (item.kind === "auctionBid") {
                    const prompt = item.prompt;
                    const actorName =
                      membersById.get(prompt.playerId)?.displayName ??
                      prompt.playerId;
                    const isTargetSelf = prompt.playerId === selfPlayerId;
                    const highestBidderName = prompt.highestBidderId
                      ? (membersById.get(prompt.highestBidderId)?.displayName ??
                        prompt.highestBidderId)
                      : null;
                    const canActPrompt =
                      prompt.playerId === selfPlayerId && canRespondPrompt;
                    return (
                      <div
                        key={item.key}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid rgba(0,0,0,0.08)",
                          background: "var(--nb-color-bg, #f8fafc)",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 800,
                              color: "rgba(0,0,0,0.82)",
                            }}
                          >
                            拍卖出价
                          </div>
                          <Button
                            size="sm"
                            mode="NoBackground"
                            onClick={toggleCollapsed}
                          >
                            {collapsed ? "展开" : "收起"}
                          </Button>
                        </div>
                        <div
                          style={{
                            color: "rgba(0,0,0,0.68)",
                            fontSize: 13,
                            lineHeight: "18px",
                            wordBreak: "break-word",
                          }}
                        >
                          {actorName}：{propertyLabel(prompt.propertyId)}｜最低{" "}
                          {formatMoney(prompt.minBid)}｜最高{" "}
                          {formatMoney(prompt.highestBid)}
                          {highestBidderName ? `（${highestBidderName}）` : ""}
                        </div>
                        {!isTargetSelf ? (
                          <div
                            style={{
                              color:
                                "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                              fontSize: 13,
                              lineHeight: "18px",
                            }}
                          >
                            等待{actorName}…
                          </div>
                        ) : null}
                        {!collapsed ? (
                          isTargetSelf ? (
                            <>
                              <Input
                                value={auctionBid}
                                onChange={(e) => setAuctionBid(e.target.value)}
                                type="number"
                                min={prompt.minBid}
                                step={1}
                                placeholder={`最低 ${prompt.minBid}`}
                                disabled={!canActPrompt}
                              />
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  justifyContent: "end",
                                }}
                              >
                                <Button
                                  size="sm"
                                  mode="Second"
                                  onClick={() =>
                                    sendCommand({
                                      type: "game/respondPrompt",
                                      roomId: room.roomId,
                                      gameId: game.gameId,
                                      playerId: selfPlayerId,
                                      promptId: prompt.promptId,
                                      choice: { pass: true },
                                    })
                                  }
                                  disabled={!canActPrompt}
                                >
                                  弃权
                                </Button>
                                <Button
                                  size="sm"
                                  mode="Primary"
                                  onClick={() => {
                                    const bid = Math.floor(Number(auctionBid));
                                    if (
                                      !Number.isFinite(bid) ||
                                      bid < prompt.minBid
                                    )
                                      return;
                                    sendCommand({
                                      type: "game/respondPrompt",
                                      roomId: room.roomId,
                                      gameId: game.gameId,
                                      playerId: selfPlayerId,
                                      promptId: prompt.promptId,
                                      choice: { bid },
                                    });
                                    setAuctionBid("");
                                  }}
                                  disabled={!canActPrompt}
                                >
                                  出价
                                </Button>
                              </div>
                            </>
                          ) : null
                        ) : null}
                      </div>
                    );
                  }
                  const d = item.debt;
                  const debtorName =
                    membersById.get(d.debtorId)?.displayName ?? d.debtorId;
                  const isTargetSelf = d.debtorId === selfPlayerId;
                  const creditorLabel =
                    d.creditor.kind === "bank"
                      ? "银行"
                      : (membersById.get(d.creditor.playerId)?.displayName ??
                        d.creditor.playerId);
                  const canActPrompt =
                    d.debtorId === selfPlayerId && canRespondPrompt;
                  return (
                    <div
                      key={item.key}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(180,35,24,0.06)",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{ fontWeight: 800, color: "rgba(0,0,0,0.82)" }}
                        >
                          债务
                        </div>
                        <Button
                          size="sm"
                          mode="NoBackground"
                          onClick={toggleCollapsed}
                        >
                          {collapsed ? "展开" : "收起"}
                        </Button>
                      </div>
                      <div
                        style={{
                          color: "rgba(0,0,0,0.72)",
                          fontSize: 13,
                          lineHeight: "18px",
                          wordBreak: "break-word",
                        }}
                      >
                        {debtorName} 欠 {creditorLabel}：{d.reason}｜金额{" "}
                        {formatMoney(d.amount)}
                      </div>
                      {!isTargetSelf ? (
                        <div
                          style={{
                            color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                            fontSize: 13,
                            lineHeight: "18px",
                          }}
                        >
                          等待{debtorName}…
                        </div>
                      ) : null}
                      {!collapsed ? (
                        isTargetSelf ? (
                          <>
                            <div
                              style={{
                                color: "rgba(0,0,0,0.68)",
                                fontSize: 13,
                                lineHeight: "18px",
                              }}
                            >
                              可通过卖房/抵押/赎回等操作调整现金，现金足够时将自动扣款并清除债务
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                                justifyContent: "end",
                              }}
                            >
                              <Button
                                size="sm"
                                mode="Primary"
                                style={
                                  {
                                    "--nb-btn-bg": "var(--nb-color-danger)",
                                    "--nb-btn-bg-hover":
                                      "var(--nb-color-danger-hover)",
                                    "--nb-btn-bg-active":
                                      "var(--nb-color-danger-active)",
                                    "--nb-btn-fg":
                                      "var(--nb-color-danger-fg, #fff)",
                                    "--nb-btn-border": "transparent",
                                    "--nb-btn-border-hover": "transparent",
                                    "--nb-btn-ring":
                                      "var(--nb-color-danger-soft)",
                                    "--nb-btn-shadow":
                                      "inset 0 -1px 0 rgba(0, 0, 0, 0.08)",
                                  } as React.CSSProperties
                                }
                                onClick={() =>
                                  sendCommand({
                                    type: "game/declareBankruptcy",
                                    roomId: room.roomId,
                                    gameId: game.gameId,
                                    playerId: selfPlayerId,
                                  })
                                }
                                disabled={!canActPrompt}
                              >
                                宣布破产
                              </Button>
                              <Button
                                size="sm"
                                mode="Second"
                                onClick={() => setDrawerPlayerId(selfPlayerId)}
                                disabled={!canActPrompt || !self}
                              >
                                去资产处理
                              </Button>
                            </div>
                          </>
                        ) : null
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                  }}
                >
                  暂无待处理提示
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div
              style={{
                fontWeight: 800,
                color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
              }}
            >
              事件时间轴
            </div>
            <div
              style={{
                color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                fontSize: 12,
              }}
            >
              {timeline.length} 条
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gap: 10,
              maxHeight: "min(80vh, 760px)",
              overflow: "auto",
              paddingRight: 4,
            }}
          >
            {timeline.length ? (
              timeline
                .slice()
                .reverse()
                .map((e) => (
                  <div
                    key={e.eventId}
                    style={{
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: "var(--nb-color-bg, #f8fafc)",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          color: "rgba(0,0,0,0.82)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.title}
                      </div>
                      <div
                        style={{
                          color: "rgba(0,0,0,0.5)",
                          fontSize: 12,
                          flex: "0 0 auto",
                        }}
                      >
                        {formatClock(e.createdAtMs)}
                      </div>
                    </div>
                    <div
                      style={{
                        color: "rgba(0,0,0,0.68)",
                        fontSize: 13,
                        lineHeight: "18px",
                        wordBreak: "break-word",
                      }}
                    >
                      {e.subtitle}
                    </div>
                  </div>
                ))
            ) : (
              <div
                style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
              >
                暂无事件
              </div>
            )}
          </div>
        </aside>
      </div>

      <Dialog
        open={!!activePlayer}
        onOpenChange={(o) => setActivePlayerId(o ? activePlayerId : null)}
        title={activePlayer ? `玩家：${activePlayer.displayName}` : undefined}
        description={
          activePlayer && debugMode
            ? `playerId: ${activePlayer.playerId}`
            : undefined
        }
        footer={
          activePlayer ? (
            <>
              <Button
                mode="Second"
                onClick={() => setDrawerPlayerId(activePlayer.playerId)}
              >
                查看资产
              </Button>
              <Button mode="Primary" onClick={() => setActivePlayerId(null)}>
                确定
              </Button>
            </>
          ) : null
        }
      >
        {activePlayer ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
              >
                现金
              </div>
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                }}
              >
                {formatMoney(activePlayer.cash)}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
              >
                当前位置
              </div>
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                }}
              >
                #{activePlayer.position} {tileNamesLive[activePlayer.position]}
              </div>
            </div>
            {activePlayer.properties.length ? (
              <div
                style={{
                  color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                  fontSize: 13,
                }}
              >
                地产：
                {activePlayer.properties
                  .map((pid) =>
                    debugMode
                      ? `${propertyLabel(pid)}（${pid}）`
                      : propertyLabel(pid),
                  )
                  .join("、")}
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={debugOpen}
        onOpenChange={setDebugOpen}
        title="Debug 工具"
        description="仅房主可用；需服务端启用 NEOBLOCK_DEBUG_TOOLS=1"
        width={680}
      >
        {(() => {
          const deltaValue = Number(debugCashDelta);
          const deltaError =
            Number.isFinite(deltaValue) && Number.isInteger(deltaValue)
              ? null
              : "请输入整数";
          const buildingsValue = Number(debugBuildings);
          const buildingsError =
            Number.isFinite(buildingsValue) &&
            Number.isInteger(buildingsValue) &&
            buildingsValue >= 0 &&
            buildingsValue <= 5
              ? null
              : "楼层需为 0~5 整数";
          const canSendCash = !pending && !!debugTargetPlayerId && !deltaError;
          const canAssignProperty = !pending && !!debugPropertyId;
          const canSetBuildings =
            !pending && !!debugPropertyId && !buildingsError;
          return (
            <div style={{ display: "grid", gap: 12 }}>
              {lastError ? (
                <div style={{ color: "#b42318" }}>{lastError.message}</div>
              ) : null}
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                  }}
                >
                  增加/减少金钱
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontSize: 13,
                      }}
                    >
                      目标玩家
                    </div>
                    <select
                      value={debugTargetPlayerId}
                      onChange={(e) => setDebugTargetPlayerId(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.12)",
                      }}
                    >
                      {players.map((p) => (
                        <option key={p.playerId} value={p.playerId}>
                          {p.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontSize: 13,
                      }}
                    >
                      变化值（可为负）
                    </div>
                    <Input
                      value={debugCashDelta}
                      onChange={(e) => setDebugCashDelta(e.target.value)}
                      type="number"
                      step={1}
                    />
                    {deltaError ? (
                      <div style={{ color: "#b42318", fontSize: 13 }}>
                        {deltaError}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", justifyContent: "end" }}>
                    <Button
                      mode="Second"
                      onClick={() => {
                        if (!canSendCash) return;
                        sendCommand({
                          type: "debug/addCash",
                          roomId: room.roomId,
                          gameId: game.gameId,
                          playerId: selfPlayerId,
                          targetPlayerId: debugTargetPlayerId,
                          delta: deltaValue,
                        });
                      }}
                      disabled={!canSendCash}
                    >
                      应用
                    </Button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                  }}
                >
                  分配地块
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontSize: 13,
                      }}
                    >
                      地块
                    </div>
                    <select
                      value={debugPropertyId}
                      onChange={(e) => setDebugPropertyId(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.12)",
                      }}
                    >
                      {propertyOptions.map((p) => (
                        <option key={p.propertyId} value={p.propertyId}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontSize: 13,
                      }}
                    >
                      归属
                    </div>
                    <select
                      value={debugOwnerPlayerId}
                      onChange={(e) => setDebugOwnerPlayerId(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.12)",
                      }}
                    >
                      <option value="">无（清空归属）</option>
                      {players.map((p) => (
                        <option key={p.playerId} value={p.playerId}>
                          {p.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", justifyContent: "end" }}>
                    <Button
                      mode="Second"
                      onClick={() => {
                        if (!canAssignProperty) return;
                        sendCommand({
                          type: "debug/assignProperty",
                          roomId: room.roomId,
                          gameId: game.gameId,
                          playerId: selfPlayerId,
                          propertyId: debugPropertyId,
                          ownerPlayerId: debugOwnerPlayerId
                            ? debugOwnerPlayerId
                            : null,
                        });
                      }}
                      disabled={!canAssignProperty}
                    >
                      应用
                    </Button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                  }}
                >
                  增减楼层
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontSize: 13,
                      }}
                    >
                      地块
                    </div>
                    <select
                      value={debugPropertyId}
                      onChange={(e) => setDebugPropertyId(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.12)",
                      }}
                    >
                      {propertyOptions.map((p) => (
                        <option key={p.propertyId} value={p.propertyId}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontSize: 13,
                      }}
                    >
                      楼层（0~5）
                    </div>
                    <Input
                      value={debugBuildings}
                      onChange={(e) => setDebugBuildings(e.target.value)}
                      type="number"
                      min={0}
                      max={5}
                      step={1}
                    />
                    {buildingsError ? (
                      <div style={{ color: "#b42318", fontSize: 13 }}>
                        {buildingsError}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", justifyContent: "end" }}>
                    <Button
                      mode="Second"
                      onClick={() => {
                        if (!canSetBuildings) return;
                        sendCommand({
                          type: "debug/setBuildings",
                          roomId: room.roomId,
                          gameId: game.gameId,
                          playerId: selfPlayerId,
                          propertyId: debugPropertyId,
                          buildings: buildingsValue,
                        });
                      }}
                      disabled={!canSetBuildings}
                    >
                      应用
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>

      <Drawer
        open={!!drawerPlayer}
        onOpenChange={(o) => setDrawerPlayerId(o ? drawerPlayerId : null)}
        title={drawerPlayer ? `${drawerPlayer.displayName} 的资产` : undefined}
      >
        {drawerPlayer ? (
          <div style={{ display: "grid", gap: 10 }}>
            {drawerPlayer.properties.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {drawerPlayer.properties.map((pid) => {
                  const tile = getPropertyTile(board, pid);
                  if (!tile) return null;
                  const isMine = drawerPlayer.playerId === selfPlayerId;
                  const mortgageValue = Math.floor(tile.price / 2);
                  const building = tile.buildings ?? 0;
                  const rent = calcPropertyRent(board, tile);
                  const groupColor = groupColorById(tile.groupId);
                  const groupLabel = tile.groupName ?? tile.groupId;
                  return (
                    <div
                      key={pid}
                      style={{
                        position: "relative",
                        padding: 12,
                        borderRadius: "var(--nb-radius-md, 12px)",
                        border:
                          "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
                        background: "var(--nb-color-bg, #f8fafc)",
                        display: "grid",
                        gap: 10,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          right: 0,
                          height: 6,
                          background: groupColor,
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: groupColor,
                              border: "1px solid rgba(0,0,0,0.12)",
                            }}
                          />
                          <div
                            style={{
                              fontWeight: 800,
                              color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                            }}
                          >
                            {tileTitle(tile, board.tiles.indexOf(tile))}
                            <span
                              style={{
                                marginLeft: 6,
                                color:
                                  "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {groupLabel}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                            fontSize: 13,
                          }}
                        >
                          {tile.mortgaged ? "已抵押" : "未抵押"}｜建筑{" "}
                          {building}
                        </div>
                      </div>
                      <div
                        style={{
                          color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                          fontSize: 13,
                        }}
                      >
                        价格 {formatMoney(tile.price)}｜房价{" "}
                        {formatMoney(tile.houseCost)}｜抵押值{" "}
                        {formatMoney(mortgageValue)}
                      </div>
                      <div
                        style={{
                          color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                          fontSize: 13,
                        }}
                      >
                        过路费（当前） {formatMoney(rent)}
                      </div>
                      {isMine ? (
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <Button
                            size="sm"
                            mode="Second"
                            onClick={() =>
                              sendCommand({
                                type: "game/build",
                                roomId: room.roomId,
                                gameId: game.gameId,
                                playerId: selfPlayerId,
                                propertyId: pid,
                              })
                            }
                            disabled={!canAct}
                          >
                            建房
                          </Button>
                          <Button
                            size="sm"
                            mode="Second"
                            onClick={() =>
                              sendCommand({
                                type: "game/sellBuilding",
                                roomId: room.roomId,
                                gameId: game.gameId,
                                playerId: selfPlayerId,
                                propertyId: pid,
                              })
                            }
                            disabled={!canAct}
                          >
                            卖房
                          </Button>
                          <Button
                            size="sm"
                            mode="Second"
                            onClick={() =>
                              sendCommand({
                                type: "game/mortgageProperty",
                                roomId: room.roomId,
                                gameId: game.gameId,
                                playerId: selfPlayerId,
                                propertyId: pid,
                              })
                            }
                            disabled={!canAct || tile.mortgaged}
                          >
                            抵押
                          </Button>
                          <Button
                            size="sm"
                            mode="Second"
                            onClick={() =>
                              sendCommand({
                                type: "game/redeemProperty",
                                roomId: room.roomId,
                                gameId: game.gameId,
                                playerId: selfPlayerId,
                                propertyId: pid,
                              })
                            }
                            disabled={!canAct || !tile.mortgaged}
                          >
                            赎回
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
              >
                暂无资产
              </div>
            )}
          </div>
        ) : null}
      </Drawer>

      <Dialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        title="发起交易"
        description={
          isSpectator
            ? "观战者无法发起交易"
            : !isMyTurn
              ? "仅当前回合玩家可发起交易"
              : undefined
        }
        footer={
          tradeOpen ? (
            <>
              <Button mode="Second" onClick={() => setTradeOpen(false)}>
                取消
              </Button>
              <Button
                mode="Primary"
                onClick={() => {
                  const toPlayerId = tradeTo;
                  if (!toPlayerId) return;
                  const offerProps = Object.entries(tradeOfferProps)
                    .filter(([, v]) => v)
                    .map(([k]) => k);
                  const requestProps = Object.entries(tradeRequestProps)
                    .filter(([, v]) => v)
                    .map(([k]) => k);
                  sendCommand({
                    type: "game/proposeTrade",
                    roomId: room.roomId,
                    gameId: game.gameId,
                    playerId: selfPlayerId,
                    toPlayerId,
                    offer: {
                      cash: tradeOfferCashValue,
                      properties: offerProps,
                    },
                    request: {
                      cash: tradeRequestCashValue,
                      properties: requestProps,
                    },
                  });
                }}
                disabled={!!tradeLocalError}
              >
                发送
              </Button>
            </>
          ) : null
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          {tradeLocalError ? (
            <div style={{ color: "#b42318" }}>{tradeLocalError}</div>
          ) : null}
          {lastError ? (
            <div style={{ color: "#b42318" }}>{lastError.message}</div>
          ) : null}
          {tradeToPlayer ? (
            <div
              style={{
                color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                fontSize: 13,
              }}
            >
              对方余额：{formatMoney(tradeToPlayer.cash)}
            </div>
          ) : null}
          {trade && trade.fromPlayerId === selfPlayerId ? (
            <div
              style={{
                color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                fontSize: 13,
              }}
            >
              已存在待处理交易：等待对方响应
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                fontWeight: 800,
                color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
              }}
            >
              对象
            </div>
            <select
              value={tradeTo}
              onChange={(e) => setTradeTo(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
              }}
            >
              {otherPlayers.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                fontWeight: 800,
                color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
              }}
            >
              我给对方
            </div>
            <Input
              value={tradeOfferCash}
              onChange={(e) => setTradeOfferCash(e.target.value)}
              type="number"
              min={0}
              step={1}
              placeholder="现金"
            />
            {myProperties.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {myProperties.map((p) => (
                  <label
                    key={p.propertyId}
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <input
                      type="checkbox"
                      checked={tradeOfferProps[p.propertyId] === true}
                      onChange={(e) =>
                        setTradeOfferProps((s) => ({
                          ...s,
                          [p.propertyId]: e.target.checked,
                        }))
                      }
                    />
                    <span
                      style={{
                        color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                        fontSize: 13,
                      }}
                    >
                      {propertyLabel(p.propertyId)}｜建筑 {p.buildings}｜
                      {p.mortgaged ? "已抵押" : "未抵押"}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div
                style={{
                  color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                  fontSize: 13,
                }}
              >
                无地产可选
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                fontWeight: 800,
                color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
              }}
            >
              我向对方要
            </div>
            <Input
              value={tradeRequestCash}
              onChange={(e) => setTradeRequestCash(e.target.value)}
              type="number"
              min={0}
              step={1}
              placeholder="现金"
            />
            {tradeTo ? (
              <div style={{ display: "grid", gap: 6 }}>
                {board.tiles
                  .filter(
                    (t): t is BoardPropertyTile =>
                      t.kind === "property" && t.ownerPlayerId === tradeTo,
                  )
                  .map((t) => (
                    <label
                      key={t.propertyId}
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <input
                        type="checkbox"
                        checked={tradeRequestProps[t.propertyId] === true}
                        onChange={(e) =>
                          setTradeRequestProps((s) => ({
                            ...s,
                            [t.propertyId]: e.target.checked,
                          }))
                        }
                      />
                      <span
                        style={{
                          color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))",
                          fontSize: 13,
                        }}
                      >
                        {propertyLabel(t.propertyId)}｜建筑 {t.buildings ?? 0}｜
                        {t.mortgaged ? "已抵押" : "未抵押"}
                      </span>
                    </label>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!lastCardDrawn}
        onOpenChange={(o) => {
          if (!o) clearLastCard();
        }}
        title="卡牌"
        description={
          lastCardDrawn
            ? `${membersById.get(lastCardDrawn.playerId)?.displayName ?? lastCardDrawn.playerId} 抽到了一张${lastCardDrawn.deck === "chance" ? "机会" : "命运"}`
            : undefined
        }
        footer={
          <Button mode="Primary" onClick={clearLastCard}>
            确定
          </Button>
        }
      >
        {lastCardDrawn ? (
          <div style={{ display: "grid", gap: 10 }}>
            {debugMode ? (
              <div
                style={{ color: "var(--nb-color-muted-fg, rgba(0,0,0,0.65))" }}
              >
                cardId: {lastCardDrawn.cardId}
              </div>
            ) : null}
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid var(--nb-color-border, rgba(0,0,0,0.12))",
                background: "var(--nb-color-bg, #f8fafc)",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--nb-color-fg, rgba(0,0,0,0.92))",
                }}
              >
                {board.cards?.find((c) => c.cardId === lastCardDrawn.cardId)
                  ?.text ?? "（未知卡牌文本）"}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
