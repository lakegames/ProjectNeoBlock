"use client";

import * as React from 'react';

import type { Command, MatchSnapshot, ProtocolError } from '@neoblock/shared';

import { Button, Dialog, Drawer, Input, Tooltip } from '@neoblock/ui';

export type BoardPlayer = {
  playerId: string;
  displayName: string;
};

type CommandInput = Command extends infer C ? (C extends unknown ? Omit<C, 'commandId' | 'clientSeq'> : never) : never;

type BoardPropertyTile = {
  kind: 'property';
  propertyId: string;
  groupId: string;
  price: number;
  houseCost: number;
  rents: [number, number, number, number, number, number];
  ownerPlayerId?: string;
  mortgaged?: boolean;
  buildings?: number;
};

type BoardTile =
  | { kind: 'start' }
  | BoardPropertyTile
  | { kind: 'jail' }
  | { kind: 'goToJail' }
  | { kind: 'tax'; amount: number }
  | { kind: 'chance' }
  | { kind: 'communityChest' };

type CardDef = {
  cardId: string;
  deck: 'chance' | 'communityChest';
  text: string;
  effect: unknown;
};

type BoardConfig = {
  tiles: BoardTile[];
  jailIndex: number;
  cards?: CardDef[];
};

type PendingPrompt =
  | { kind: 'buyOrAuction'; promptId: string; playerId: string; propertyId: string; price: number }
  | {
      kind: 'auctionBid';
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
  creditor: { kind: 'bank' } | { kind: 'player'; playerId: string };
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
  deck: 'chance' | 'communityChest';
  cardId: string;
  playerId: string;
};

type LiveProps = {
  snapshot: MatchSnapshot;
  selfPlayerId: string;
  sendCommand: (command: CommandInput) => void;
  pending: boolean;
  lastError: ProtocolError | null;
  lastCardDrawn: CardDrawn | null;
  clearLastCard: () => void;
};

type LegacyProps = { players: BoardPlayer[]; selfPlayerId?: string | null };

export type BoardSkeletonProps = LiveProps | LegacyProps;

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function formatMoney(amount: number) {
  return `¥${Math.max(0, Math.floor(amount)).toLocaleString('zh-CN')}`;
}

const playerColors = ['#2563eb', '#f97316', '#16a34a', '#a855f7', '#e11d48', '#0ea5e9', '#d97706', '#22c55e'];

function tileIndexAt(row: number, col: number) {
  if (row === 10) {
    if (col === 10) return 0;
    if (col === 0) return 10;
    return 10 - col;
  }
  if (col === 0) {
    if (row === 10) return 10;
    if (row === 0) return 20;
    return 20 - row;
  }
  if (row === 0) {
    if (col === 0) return 20;
    if (col === 10) return 30;
    return 20 + col;
  }
  if (col === 10) {
    if (row === 0) return 30;
    if (row === 10) return 0;
    return 30 + row;
  }
  return null;
}

const tileNames: string[] = [
  '起点（GO）',
  '地块 A1',
  '机会',
  '地块 A2',
  '税收',
  '车站 1',
  '地块 B1',
  '命运',
  '地块 B2',
  '地块 B3',
  '监狱/探监',
  '地块 C1',
  '电力公司',
  '地块 C2',
  '地块 C3',
  '车站 2',
  '地块 D1',
  '机会',
  '地块 D2',
  '地块 D3',
  '免费停车',
  '地块 E1',
  '命运',
  '地块 E2',
  '地块 E3',
  '车站 3',
  '地块 F1',
  '地块 F2',
  '自来水公司',
  '地块 F3',
  '进监狱',
  '地块 G1',
  '地块 G2',
  '机会',
  '地块 G3',
  '车站 4',
  '命运',
  '地块 H1',
  '税收',
  '地块 H2',
];

function buildPlayerDerived(players: BoardPlayer[]) {
  return players.map((p, i) => {
    const h = hashString(p.playerId);
    const cash = 1200 + (h % 1400);
    const tile = (i * 7 + (h % 11)) % 40;
    const color = playerColors[i % playerColors.length];
    const assets = Array.from({ length: (h % 4) + 1 }, (_, k) => `资产 #${k + 1}`);
    return { ...p, cash, tile, color, assets };
  });
}

function tileTitle(tile: BoardTile, idx: number) {
  if (tile.kind === 'start') return '起点（GO）';
  if (tile.kind === 'jail') return '监狱/探监';
  if (tile.kind === 'goToJail') return '进监狱';
  if (tile.kind === 'tax') return `税收（${formatMoney(tile.amount)}）`;
  if (tile.kind === 'chance') return '机会';
  if (tile.kind === 'communityChest') return '命运';
  if (tile.kind === 'property') return `地块 ${tile.propertyId}`;
  return `格子 ${idx}`;
}

function getPropertyTile(board: BoardConfig, propertyId: string) {
  return board.tiles.find((t): t is BoardPropertyTile => t.kind === 'property' && t.propertyId === propertyId) ?? null;
}

export function BoardSkeleton(props: BoardSkeletonProps) {
  if (!('snapshot' in props)) {
    const derived = React.useMemo(() => buildPlayerDerived(props.players), [props.players]);

    const [search, setSearch] = React.useState('');
    const [activePlayerId, setActivePlayerId] = React.useState<string | null>(null);
    const [drawerPlayerId, setDrawerPlayerId] = React.useState<string | null>(null);

    const activePlayer = derived.find((p) => p.playerId === activePlayerId) ?? null;
    const drawerPlayer = derived.find((p) => p.playerId === drawerPlayerId) ?? null;

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
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>棋盘（渲染骨架）</div>
            <div style={{ marginTop: 6, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>格子 + 棋子 + 玩家面板 + 资产/现金展示</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索格子（名称/序号）" style={{ minWidth: 240 }} />
            <Button tone="primary" variant="soft">
              掷骰（占位）
            </Button>
            <Button variant="soft">结束回合（占位）</Button>
          </div>
        </div>

      {filteredTiles ? (
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>匹配：</div>
          {filteredTiles.map((t) => (
            <Button key={t.idx} size="sm" variant="soft" onClick={() => setSearch(String(t.idx))}>
              #{t.idx} {t.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'start' }}>
        <div
          style={{
            width: 'min(72vh, 660px)',
            minWidth: 320,
            aspectRatio: '1',
            borderRadius: 'var(--nb-radius-lg, 16px)',
            border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
            background: 'var(--nb-color-surface, #fff)',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(11, minmax(0, 1fr))' }}>
            {Array.from({ length: 121 }, (_, cellIndex) => {
              const row = Math.floor(cellIndex / 11);
              const col = cellIndex % 11;
              const tileIndex = tileIndexAt(row, col);
              const isTile = tileIndex != null;
              const name = isTile ? tileNames[tileIndex] ?? `格子 ${tileIndex}` : null;
              const pieces = isTile ? derived.filter((p) => p.tile === tileIndex) : [];
              const focused = search.trim() && isTile && (String(tileIndex) === search.trim() || name?.includes(search.trim()));

              if (!isTile) {
                return (
                  <div
                    key={`${row}-${col}`}
                    style={{
                      background:
                        row >= 3 && row <= 7 && col >= 3 && col <= 7
                          ? 'var(--nb-color-bg, #f8fafc)'
                          : 'var(--nb-color-surface, #fff)',
                      border: '1px solid rgba(0,0,0,0.04)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))',
                      fontWeight: 800,
                      letterSpacing: 0.6,
                      fontSize: 12,
                      userSelect: 'none',
                    }}
                  >
                    {row === 5 && col === 5 ? 'NEOBLOCK' : null}
                  </div>
                );
              }

              return (
                <div
                  key={`${row}-${col}`}
                  style={{
                    position: 'relative',
                    border: focused ? '2px solid var(--nb-color-primary, #2563eb)' : '1px solid rgba(0,0,0,0.08)',
                    background: focused ? 'var(--nb-color-primary-soft, rgba(37,99,235,0.12))' : 'var(--nb-color-surface, #fff)',
                    padding: 6,
                    overflow: 'hidden',
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
                        lineHeight: '14px',
                        color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))',
                        fontWeight: tileIndex % 10 === 0 ? 800 : 600,
                        outline: 'none',
                        cursor: 'default',
                      }}
                    >
                      #{tileIndex}
                      <div style={{ marginTop: 4, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))', fontSize: 12, fontWeight: 700 }}>
                        {name}
                      </div>
                    </div>
                  </Tooltip>

                  {pieces.length ? (
                    <div style={{ position: 'absolute', right: 6, bottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'end' }}>
                      {pieces.map((p, i) => (
                        <div
                          key={p.playerId}
                          title={p.displayName}
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            background: p.color,
                            border: '1px solid rgba(255,255,255,0.9)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
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
            flex: '1 1 320px',
            minWidth: 320,
            borderRadius: 'var(--nb-radius-lg, 16px)',
            border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
            background: 'var(--nb-color-surface, #fff)',
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>玩家面板</div>
          <div style={{ marginTop: 8, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 14, lineHeight: '20px' }}>
            现金与资产为占位数据（后续接入对局快照/事件）
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {derived.map((p) => {
              const isSelf = !!selfPlayerId && p.playerId === selfPlayerId;
              return (
                <div
                  key={p.playerId}
                  style={{
                    borderRadius: 'var(--nb-radius-md, 12px)',
                    border: isSelf ? `2px solid ${p.color}` : '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: p.color,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.14)',
                        flex: '0 0 auto',
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.displayName}
                        {isSelf ? <span style={{ marginLeft: 6, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>（我）</span> : null}
                      </div>
                      <div style={{ marginTop: 4, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13, lineHeight: '18px' }}>
                        现金 {formatMoney(p.cash)} ｜位置 #{p.tile}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'end' }}>
                    <Button size="sm" variant="soft" onClick={() => setDrawerPlayerId(p.playerId)}>
                      资产（{p.assets.length}）
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setActivePlayerId(p.playerId)}>
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
          description={activePlayer ? `playerId: ${activePlayer.playerId}` : undefined}
          footer={
            activePlayer ? (
              <>
                <Button variant="soft" onClick={() => setDrawerPlayerId(activePlayer.playerId)}>
                  查看资产
                </Button>
                <Button tone="primary" onClick={() => setActivePlayerId(null)}>
                  确定
                </Button>
              </>
            ) : null
          }
        >
          {activePlayer ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>现金</div>
                <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>{formatMoney(activePlayer.cash)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>当前位置</div>
                <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>
                  #{activePlayer.tile} {tileNames[activePlayer.tile]}
                </div>
              </div>
            </div>
          ) : null}
        </Dialog>

        <Drawer open={!!drawerPlayer} onOpenChange={(o) => setDrawerPlayerId(o ? drawerPlayerId : null)} title={drawerPlayer ? `${drawerPlayer.displayName} 的资产` : undefined}>
          {drawerPlayer ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>占位资产列表（后续接入地产/公司/抵押等）</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {drawerPlayer.assets.map((a) => (
                  <div
                    key={a}
                    style={{
                      padding: 12,
                      borderRadius: 'var(--nb-radius-md, 12px)',
                      border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
                      background: 'var(--nb-color-bg, #f8fafc)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>{a}</div>
                    <Button size="sm" variant="ghost">
                      操作（占位）
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Drawer>
      </section>
    );
  }

  const { snapshot, selfPlayerId, sendCommand, pending, lastError, lastCardDrawn, clearLastCard } = props;
  const room = snapshot.room;
  const game = snapshot.game;
  if (!game) return null;

  const engine = (game.engineState as unknown as GameEngineState) ?? null;
  const board = engine?.board;
  if (!board) return null;

  const membersById = React.useMemo(() => new Map(room.members.map((m) => [m.playerId, m])), [room.members]);
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

  const [search, setSearch] = React.useState('');
  const [activePlayerId, setActivePlayerId] = React.useState<string | null>(null);
  const [drawerPlayerId, setDrawerPlayerId] = React.useState<string | null>(null);

  const [tradeOpen, setTradeOpen] = React.useState(false);
  const [tradeTo, setTradeTo] = React.useState<string>('');
  const [tradeOfferCash, setTradeOfferCash] = React.useState('0');
  const [tradeRequestCash, setTradeRequestCash] = React.useState('0');
  const [tradeOfferProps, setTradeOfferProps] = React.useState<Record<string, boolean>>({});
  const [tradeRequestProps, setTradeRequestProps] = React.useState<Record<string, boolean>>({});

  const [auctionBid, setAuctionBid] = React.useState('');
  const [hiddenPrompts, setHiddenPrompts] = React.useState<Record<string, boolean>>({});

  const activePlayer = players.find((p) => p.playerId === activePlayerId) ?? null;
  const drawerPlayer = players.find((p) => p.playerId === drawerPlayerId) ?? null;

  const tileNamesLive = React.useMemo(() => board.tiles.map((t, i) => tileTitle(t, i)), [board.tiles]);

  const filteredTiles = React.useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    const hit = tileNamesLive
      .map((name, idx) => ({ idx, name }))
      .filter((t) => t.name.includes(q) || String(t.idx).includes(q))
      .slice(0, 6);
    return hit.length ? hit : null;
  }, [search, tileNamesLive]);

  const currentPlayerName = membersById.get(game.currentPlayerId)?.displayName ?? game.currentPlayerId;
  const isMyTurn = game.currentPlayerId === selfPlayerId;
  const canAct = !isSpectator && isMyTurn && !pending;

  const pendingPrompt = engine.pendingPrompt;
  const buyPrompt = pendingPrompt?.kind === 'buyOrAuction' ? pendingPrompt : null;
  const auctionPrompt = pendingPrompt?.kind === 'auctionBid' ? pendingPrompt : null;

  const showBuyPrompt = !!buyPrompt && buyPrompt.playerId === selfPlayerId;
  const showAuctionPrompt = !!auctionPrompt && auctionPrompt.playerId === selfPlayerId;

  const trade = engine.trade;
  const showTradePrompt = !!trade && trade.toPlayerId === selfPlayerId && game.phase === 'await_prompt';

  const debt = engine.debt;
  const showDebtPrompt = !!debt && debt.debtorId === selfPlayerId && game.phase === 'await_debt';

  const buyKey = buyPrompt ? `prompt:${buyPrompt.promptId}` : null;
  const auctionKey = auctionPrompt ? `prompt:${auctionPrompt.promptId}` : null;
  const tradeKey = trade ? `trade:${trade.tradeId}` : null;
  const debtKey = debt ? `debt:${debt.debtorId}` : null;

  const hiddenBuy = buyKey ? hiddenPrompts[buyKey] === true : false;
  const hiddenAuction = auctionKey ? hiddenPrompts[auctionKey] === true : false;
  const hiddenTrade = tradeKey ? hiddenPrompts[tradeKey] === true : false;
  const hiddenDebt = debtKey ? hiddenPrompts[debtKey] === true : false;

  const myProperties = React.useMemo(() => {
    if (!self) return [];
    return board.tiles
      .filter((t): t is BoardPropertyTile => t.kind === 'property' && t.ownerPlayerId === self.playerId)
      .map((t) => ({
        propertyId: t.propertyId,
        groupId: t.groupId,
        price: t.price,
        houseCost: t.houseCost,
        mortgaged: !!t.mortgaged,
        buildings: t.buildings ?? 0,
      }));
  }, [board.tiles, self]);

  const otherPlayers = React.useMemo(() => players.filter((p) => p.playerId !== selfPlayerId && !p.eliminated), [players, selfPlayerId]);

  React.useEffect(() => {
    if (!tradeOpen) return;
    if (!tradeTo && otherPlayers.length) setTradeTo(otherPlayers[0]!.playerId);
  }, [otherPlayers, tradeOpen, tradeTo]);

  const onRollDice = React.useCallback(() => {
    if (!canAct) return;
    if (game.phase !== 'await_roll') return;
    sendCommand({ type: 'game/rollDice', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId });
  }, [canAct, game.gameId, game.phase, room.roomId, selfPlayerId, sendCommand]);

  const onEndTurn = React.useCallback(() => {
    if (!canAct) return;
    if (game.phase !== 'await_end_turn') return;
    sendCommand({ type: 'game/endTurn', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId });
  }, [canAct, game.gameId, game.phase, room.roomId, selfPlayerId, sendCommand]);

  const canRoll = canAct && game.phase === 'await_roll';
  const canEndTurn = canAct && game.phase === 'await_end_turn';

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>棋盘</div>
          <div style={{ marginTop: 6, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>
            回合 #{game.round}｜阶段 {game.phase}｜当前玩家 {currentPlayerName}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索格子（名称/序号）" style={{ minWidth: 240 }} />
          <Button tone="primary" variant="soft" onClick={onRollDice} disabled={!canRoll}>
            {engine.lastDice ? `掷骰（上次 ${engine.lastDice[0]} + ${engine.lastDice[1]}）` : '掷骰'}
          </Button>
          <Button variant="soft" onClick={onEndTurn} disabled={!canEndTurn}>
            结束回合
          </Button>
          <Button variant="soft" onClick={() => setDrawerPlayerId(selfPlayerId)} disabled={isSpectator || !self}>
            我的资产
          </Button>
          <Button variant="soft" onClick={() => setTradeOpen(true)} disabled={!canAct || game.phase !== 'await_end_turn'}>
            发起交易
          </Button>
        </div>
      </div>

      {showBuyPrompt && hiddenBuy ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(37,99,235,0.08)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>待处理：购买/拍卖</div>
          <Button size="sm" tone="primary" variant="soft" onClick={() => buyKey && setHiddenPrompts((s) => ({ ...s, [buyKey]: false }))}>
            打开
          </Button>
        </div>
      ) : null}
      {showAuctionPrompt && hiddenAuction ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(37,99,235,0.08)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>待处理：拍卖出价</div>
          <Button size="sm" tone="primary" variant="soft" onClick={() => auctionKey && setHiddenPrompts((s) => ({ ...s, [auctionKey]: false }))}>
            打开
          </Button>
        </div>
      ) : null}
      {showTradePrompt && hiddenTrade ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(37,99,235,0.08)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>待处理：交易请求</div>
          <Button size="sm" tone="primary" variant="soft" onClick={() => tradeKey && setHiddenPrompts((s) => ({ ...s, [tradeKey]: false }))}>
            打开
          </Button>
        </div>
      ) : null}
      {showDebtPrompt && hiddenDebt ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(180,35,24,0.08)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>待处理：债务</div>
          <Button size="sm" tone="danger" variant="soft" onClick={() => debtKey && setHiddenPrompts((s) => ({ ...s, [debtKey]: false }))}>
            打开
          </Button>
        </div>
      ) : null}

      {filteredTiles ? (
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>匹配：</div>
          {filteredTiles.map((t) => (
            <Button key={t.idx} size="sm" variant="soft" onClick={() => setSearch(String(t.idx))}>
              #{t.idx} {t.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'start' }}>
        {board.tiles.length >= 40 ? (
          <div
            style={{
              width: 'min(72vh, 660px)',
              minWidth: 320,
              aspectRatio: '1',
              borderRadius: 'var(--nb-radius-lg, 16px)',
              border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
              background: 'var(--nb-color-surface, #fff)',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(11, minmax(0, 1fr))' }}>
              {Array.from({ length: 121 }, (_, cellIndex) => {
                const row = Math.floor(cellIndex / 11);
                const col = cellIndex % 11;
                const tileIndex = tileIndexAt(row, col);
                const isTile = tileIndex != null && tileIndex < board.tiles.length;
                const name = isTile ? tileNamesLive[tileIndex] : null;
                const pieces = isTile ? players.filter((p) => p.position === tileIndex && !p.eliminated) : [];
                const focused = search.trim() && isTile && (String(tileIndex) === search.trim() || name?.includes(search.trim()));

                if (!isTile) {
                  return (
                    <div
                      key={`${row}-${col}`}
                      style={{
                        background:
                          row >= 3 && row <= 7 && col >= 3 && col <= 7
                            ? 'var(--nb-color-bg, #f8fafc)'
                            : 'var(--nb-color-surface, #fff)',
                        border: '1px solid rgba(0,0,0,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))',
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        fontSize: 12,
                        userSelect: 'none',
                      }}
                    >
                      {row === 5 && col === 5 ? 'NEOBLOCK' : null}
                    </div>
                  );
                }

                const pieceColors = pieces.map((p) => playerColors[(p.seatIndex ?? 0) % playerColors.length]);

                return (
                  <div
                    key={`${row}-${col}`}
                    style={{
                      position: 'relative',
                      border: focused ? '2px solid var(--nb-color-primary, #2563eb)' : '1px solid rgba(0,0,0,0.08)',
                      background: focused ? 'var(--nb-color-primary-soft, rgba(37,99,235,0.12))' : 'var(--nb-color-surface, #fff)',
                      padding: 6,
                      overflow: 'hidden',
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
                          lineHeight: '14px',
                          color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))',
                          fontWeight: tileIndex % 10 === 0 ? 800 : 600,
                          outline: 'none',
                          cursor: 'default',
                        }}
                      >
                        #{tileIndex}
                        <div style={{ marginTop: 4, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))', fontSize: 12, fontWeight: 700 }}>
                          {name}
                        </div>
                      </div>
                    </Tooltip>

                    {pieceColors.length ? (
                      <div style={{ position: 'absolute', right: 6, bottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'end' }}>
                        {pieceColors.map((c, i) => (
                          <div
                            key={`${tileIndex}-${i}`}
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              background: c,
                              border: '1px solid rgba(255,255,255,0.9)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
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
        ) : (
          <div
            style={{
              flex: '1 1 560px',
              minWidth: 320,
              borderRadius: 'var(--nb-radius-lg, 16px)',
              border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
              background: 'var(--nb-color-surface, #fff)',
              padding: 12,
              overflow: 'auto',
            }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {board.tiles.map((t, idx) => {
                const pieces = players.filter((p) => p.position === idx && !p.eliminated);
                return (
                  <div
                    key={idx}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
                      background: 'var(--nb-color-bg, #f8fafc)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>
                        #{idx} {tileTitle(t, idx)}
                      </div>
                      {t.kind === 'property' ? (
                        <div style={{ marginTop: 4, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>
                          价格 {formatMoney(t.price)}｜房价 {formatMoney(t.houseCost)}｜{t.ownerPlayerId ? `归属 ${membersById.get(t.ownerPlayerId)?.displayName ?? t.ownerPlayerId}` : '未售出'}
                        </div>
                      ) : null}
                    </div>
                    {pieces.length ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'end' }}>
                        {pieces.map((p) => (
                          <Button key={p.playerId} size="sm" variant="soft" onClick={() => setActivePlayerId(p.playerId)}>
                            {p.displayName}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setActivePlayerId(null)} disabled>
                        无棋子
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <aside
          style={{
            flex: '1 1 320px',
            minWidth: 320,
            borderRadius: 'var(--nb-radius-lg, 16px)',
            border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
            background: 'var(--nb-color-surface, #fff)',
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>玩家面板</div>
          <div style={{ marginTop: 8, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 14, lineHeight: '20px' }}>
            点击玩家可查看详情与资产；轮到自己时可掷骰/结束回合，并在资产中建房/卖房/抵押/赎回
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {players.map((p) => {
              const isSelf = p.playerId === selfPlayerId;
              const color = playerColors[(p.seatIndex ?? 0) % playerColors.length];
              return (
                <div
                  key={p.playerId}
                  style={{
                    borderRadius: 'var(--nb-radius-md, 12px)',
                    border: isSelf ? `2px solid ${color}` : '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    opacity: p.eliminated ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        background: color,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.14)',
                        flex: '0 0 auto',
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.displayName}
                        {isSelf ? <span style={{ marginLeft: 6, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>（我）</span> : null}
                      </div>
                      <div style={{ marginTop: 4, color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13, lineHeight: '18px' }}>
                        现金 {formatMoney(p.cash)} ｜位置 #{p.position}
                        {p.inJail ? `｜监狱 ${p.jailTurns}` : ''}
                        {p.eliminated ? '｜已出局' : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'end' }}>
                    <Button size="sm" variant="soft" onClick={() => setDrawerPlayerId(p.playerId)}>
                      资产（{p.properties.length}）
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setActivePlayerId(p.playerId)}>
                      详情
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {lastError ? <div style={{ marginTop: 12, color: '#b42318' }}>{lastError.message}</div> : null}
        </aside>
      </div>

      <Dialog
        open={!!activePlayer}
        onOpenChange={(o) => setActivePlayerId(o ? activePlayerId : null)}
        title={activePlayer ? `玩家：${activePlayer.displayName}` : undefined}
        description={activePlayer ? `playerId: ${activePlayer.playerId}` : undefined}
        footer={
          activePlayer ? (
            <>
              <Button variant="soft" onClick={() => setDrawerPlayerId(activePlayer.playerId)}>
                查看资产
              </Button>
              <Button tone="primary" onClick={() => setActivePlayerId(null)}>
                确定
              </Button>
            </>
          ) : null
        }
      >
        {activePlayer ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>现金</div>
              <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>{formatMoney(activePlayer.cash)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>当前位置</div>
              <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>
                #{activePlayer.position} {tileNamesLive[activePlayer.position]}
              </div>
            </div>
            {activePlayer.properties.length ? (
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>地产：{activePlayer.properties.join('、')}</div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Drawer open={!!drawerPlayer} onOpenChange={(o) => setDrawerPlayerId(o ? drawerPlayerId : null)} title={drawerPlayer ? `${drawerPlayer.displayName} 的资产` : undefined}>
        {drawerPlayer ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {drawerPlayer.properties.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {drawerPlayer.properties.map((pid) => {
                  const tile = getPropertyTile(board, pid);
                  if (!tile) return null;
                  const isMine = drawerPlayer.playerId === selfPlayerId;
                  const mortgageValue = Math.floor(tile.price / 2);
                  const building = tile.buildings ?? 0;
                  return (
                    <div
                      key={pid}
                      style={{
                        padding: 12,
                        borderRadius: 'var(--nb-radius-md, 12px)',
                        border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))',
                        background: 'var(--nb-color-bg, #f8fafc)',
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>
                          {tileTitle(tile, board.tiles.indexOf(tile))}
                        </div>
                        <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>
                          {tile.mortgaged ? '已抵押' : '未抵押'}｜建筑 {building}
                        </div>
                      </div>
                      <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>
                        价格 {formatMoney(tile.price)}｜房价 {formatMoney(tile.houseCost)}｜抵押值 {formatMoney(mortgageValue)}
                      </div>
                      {isMine ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() => sendCommand({ type: 'game/build', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, propertyId: pid })}
                            disabled={!canAct}
                          >
                            建房
                          </Button>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() =>
                              sendCommand({ type: 'game/sellBuilding', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, propertyId: pid })
                            }
                            disabled={!canAct}
                          >
                            卖房
                          </Button>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() =>
                              sendCommand({ type: 'game/mortgageProperty', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, propertyId: pid })
                            }
                            disabled={!canAct || tile.mortgaged}
                          >
                            抵押
                          </Button>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() =>
                              sendCommand({ type: 'game/redeemProperty', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, propertyId: pid })
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
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>暂无资产</div>
            )}
          </div>
        ) : null}
      </Drawer>

      <Dialog
        open={showBuyPrompt && !hiddenBuy}
        onOpenChange={(o) => {
          if (o) return;
          if (buyKey) setHiddenPrompts((s) => ({ ...s, [buyKey]: true }));
        }}
        title="购买还是拍卖？"
        description={buyPrompt ? `地块 ${buyPrompt.propertyId}｜价格 ${formatMoney(buyPrompt.price)}` : undefined}
        footer={
          buyPrompt ? (
            <>
              <Button
                variant="soft"
                onClick={() =>
                  sendCommand({ type: 'game/respondPrompt', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, promptId: buyPrompt.promptId, choice: { action: 'auction' } })
                }
                disabled={!canAct}
              >
                放弃并拍卖
              </Button>
              <Button
                tone="primary"
                onClick={() =>
                  sendCommand({ type: 'game/buyProperty', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, propertyId: buyPrompt.propertyId })
                }
                disabled={!canAct}
              >
                购买
              </Button>
            </>
          ) : null
        }
      >
        {buyPrompt ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>我的现金</div>
              <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>{formatMoney(self?.cash ?? 0)}</div>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={showAuctionPrompt && !hiddenAuction}
        onOpenChange={(o) => {
          if (o) return;
          if (auctionKey) setHiddenPrompts((s) => ({ ...s, [auctionKey]: true }));
        }}
        title="拍卖出价"
        description={
          auctionPrompt
            ? `地块 ${auctionPrompt.propertyId}｜最低出价 ${formatMoney(auctionPrompt.minBid)}｜当前最高 ${formatMoney(auctionPrompt.highestBid)}`
            : undefined
        }
        footer={
          auctionPrompt ? (
            <>
              <Button
                variant="soft"
                onClick={() =>
                  sendCommand({ type: 'game/respondPrompt', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, promptId: auctionPrompt.promptId, choice: { pass: true } })
                }
                disabled={!canAct}
              >
                放弃出价
              </Button>
              <Button
                tone="primary"
                onClick={() => {
                  const bid = Math.floor(Number(auctionBid));
                  if (!Number.isFinite(bid) || bid <= 0) return;
                  sendCommand({ type: 'game/respondPrompt', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, promptId: auctionPrompt.promptId, choice: { bid } });
                  setAuctionBid('');
                }}
                disabled={!canAct}
              >
                出价
              </Button>
            </>
          ) : null
        }
      >
        {auctionPrompt ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <Input
              value={auctionBid}
              onChange={(e) => setAuctionBid(e.target.value)}
              type="number"
              min={auctionPrompt.minBid}
              step={1}
              placeholder={`最低 ${auctionPrompt.minBid}`}
            />
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={showTradePrompt && !hiddenTrade}
        onOpenChange={(o) => {
          if (o) return;
          if (tradeKey) setHiddenPrompts((s) => ({ ...s, [tradeKey]: true }));
        }}
        title="收到交易请求"
        description={trade ? `来自：${membersById.get(trade.fromPlayerId)?.displayName ?? trade.fromPlayerId}` : undefined}
        footer={
          trade ? (
            <>
              <Button
                variant="soft"
                onClick={() => sendCommand({ type: 'game/respondTrade', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, accept: false })}
                disabled={!canAct}
              >
                拒绝
              </Button>
              <Button
                tone="primary"
                onClick={() => sendCommand({ type: 'game/respondTrade', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId, accept: true })}
                disabled={!canAct}
              >
                接受
              </Button>
            </>
          ) : null
        }
      >
        {trade ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>对方给我</div>
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>现金 {formatMoney(trade.offer.cash)}</div>
              {trade.offer.properties.length ? (
                <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>地产 {trade.offer.properties.join('、')}</div>
              ) : null}
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>我给对方</div>
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>现金 {formatMoney(trade.request.cash)}</div>
              {trade.request.properties.length ? (
                <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>地产 {trade.request.properties.join('、')}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={showDebtPrompt && !hiddenDebt}
        onOpenChange={(o) => {
          if (o) return;
          if (debtKey) setHiddenPrompts((s) => ({ ...s, [debtKey]: true }));
        }}
        title="需要还款"
        description={debt ? `${debt.reason}｜金额 ${formatMoney(debt.amount)}` : undefined}
        footer={
          debt ? (
            <>
              <Button
                tone="danger"
                onClick={() => sendCommand({ type: 'game/declareBankruptcy', roomId: room.roomId, gameId: game.gameId, playerId: selfPlayerId })}
                disabled={!canAct}
              >
                宣布破产
              </Button>
              <Button variant="soft" onClick={() => setDrawerPlayerId(selfPlayerId)} disabled={isSpectator || !self}>
                去资产处理
              </Button>
            </>
          ) : null
        }
      >
        {debt ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>
              可通过卖房/抵押/赎回等操作调整现金，现金足够时将自动扣款并清除债务
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        title="发起交易"
        description={isSpectator ? '观战者无法发起交易' : !isMyTurn ? '仅当前回合玩家可发起交易' : undefined}
        footer={
          tradeOpen ? (
            <>
              <Button variant="soft" onClick={() => setTradeOpen(false)}>
                取消
              </Button>
              <Button
                tone="primary"
                onClick={() => {
                  const toPlayerId = tradeTo;
                  if (!toPlayerId) return;
                  const offerCash = Math.max(0, Math.floor(Number(tradeOfferCash)));
                  const requestCash = Math.max(0, Math.floor(Number(tradeRequestCash)));
                  const offerProps = Object.entries(tradeOfferProps)
                    .filter(([, v]) => v)
                    .map(([k]) => k);
                  const requestProps = Object.entries(tradeRequestProps)
                    .filter(([, v]) => v)
                    .map(([k]) => k);
                  sendCommand({
                    type: 'game/proposeTrade',
                    roomId: room.roomId,
                    gameId: game.gameId,
                    playerId: selfPlayerId,
                    toPlayerId,
                    offer: { cash: offerCash, properties: offerProps },
                    request: { cash: requestCash, properties: requestProps },
                  });
                  setTradeOpen(false);
                  setTradeOfferCash('0');
                  setTradeRequestCash('0');
                  setTradeOfferProps({});
                  setTradeRequestProps({});
                }}
                disabled={!canAct || game.phase !== 'await_end_turn' || !tradeTo}
              >
                发送
              </Button>
            </>
          ) : null
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>对象</div>
            <select
              value={tradeTo}
              onChange={(e) => setTradeTo(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)' }}
            >
              {otherPlayers.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>我给对方</div>
            <Input value={tradeOfferCash} onChange={(e) => setTradeOfferCash(e.target.value)} type="number" min={0} step={1} placeholder="现金" />
            {myProperties.length ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {myProperties.map((p) => (
                  <label key={p.propertyId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={tradeOfferProps[p.propertyId] === true}
                      onChange={(e) => setTradeOfferProps((s) => ({ ...s, [p.propertyId]: e.target.checked }))}
                    />
                    <span style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>
                      {p.propertyId}｜建筑 {p.buildings}｜{p.mortgaged ? '已抵押' : '未抵押'}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>无地产可选</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>我向对方要</div>
            <Input value={tradeRequestCash} onChange={(e) => setTradeRequestCash(e.target.value)} type="number" min={0} step={1} placeholder="现金" />
            {tradeTo ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {board.tiles
                  .filter((t): t is BoardPropertyTile => t.kind === 'property' && t.ownerPlayerId === tradeTo)
                  .map((t) => (
                    <label key={t.propertyId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={tradeRequestProps[t.propertyId] === true}
                        onChange={(e) => setTradeRequestProps((s) => ({ ...s, [t.propertyId]: e.target.checked }))}
                      />
                      <span style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))', fontSize: 13 }}>
                        {t.propertyId}｜建筑 {t.buildings ?? 0}｜{t.mortgaged ? '已抵押' : '未抵押'}
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
            ? `${membersById.get(lastCardDrawn.playerId)?.displayName ?? lastCardDrawn.playerId} 抽到了一张${lastCardDrawn.deck === 'chance' ? '机会' : '命运'}`
            : undefined
        }
        footer={
          <Button tone="primary" onClick={clearLastCard}>
            确定
          </Button>
        }
      >
        {lastCardDrawn ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--nb-color-muted-fg, rgba(0,0,0,0.65))' }}>cardId: {lastCardDrawn.cardId}</div>
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--nb-color-border, rgba(0,0,0,0.12))', background: 'var(--nb-color-bg, #f8fafc)' }}>
              <div style={{ fontWeight: 800, color: 'var(--nb-color-fg, rgba(0,0,0,0.92))' }}>
                {board.cards?.find((c) => c.cardId === lastCardDrawn.cardId)?.text ?? '（未知卡牌文本）'}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
