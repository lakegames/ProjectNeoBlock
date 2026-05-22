import type {
  Command,
  CommandId,
  Event,
  EventId,
  EventSeq,
  GameId,
  GameSnapshot,
  PlayerId,
  RoomId,
} from '@neoblock/shared';

import { createRng, rollDice } from './rng.js';
import type {
  AuctionState,
  BoardChanceTile,
  BoardCommunityChestTile,
  BoardConfig,
  BoardPropertyTile,
  BoardTaxTile,
  CardDeckKind,
  CardDef,
  DebtCreditor,
  DebtState,
  GameState,
  MatchState,
  PendingPrompt,
  RulesPhase,
  TradeOffer,
  TradeState,
} from './types.js';

export type CreateGameInput = {
  roomId: RoomId;
  gameId: GameId;
  seed: string;
  playerIds: PlayerId[];
  board: BoardConfig;
  nowMs: number;
  initialCash?: number;
};

export type HandleCommandResult = {
  state: MatchState;
  events: Event[];
};

type CausedBy = { commandId?: CommandId; playerId?: PlayerId } | undefined;

function createBaseEvent(input: {
  roomId: RoomId;
  createdAtMs: number;
  eventId: EventId;
  seq: EventSeq;
  causedBy?: CausedBy;
}) {
  const base: {
    roomId: RoomId;
    createdAtMs: number;
    eventId: EventId;
    seq: EventSeq;
    causedBy?: { commandId?: CommandId; playerId?: PlayerId };
  } = {
    roomId: input.roomId,
    createdAtMs: input.createdAtMs,
    eventId: input.eventId,
    seq: input.seq,
  };
  if (input.causedBy) base.causedBy = input.causedBy;
  return base;
}

function createEventId(seq: number): EventId {
  return `e${seq}`;
}

function createEventSeq(nextSeq: number): EventSeq {
  return nextSeq;
}

function allocSeq(match: MatchState): { seq: number; match: MatchState } {
  const seq = match.nextSeq + 1;
  return { seq, match: { ...match, nextSeq: seq } };
}

function allocEvent(match: MatchState, nowMs: number, causedBy: CausedBy) {
  const { seq, match: next } = allocSeq(match);
  const base = createBaseEvent({
    roomId: next.game.roomId,
    createdAtMs: nowMs,
    eventId: createEventId(seq),
    seq: createEventSeq(seq),
    causedBy,
  });
  return { base, match: next, seq };
}

function gamePlayersInOrder(game: GameState) {
  return game.turnOrder
    .map((id) => game.players[id])
    .filter((p): p is GameState['players'][PlayerId] => Boolean(p));
}

function findNextActivePlayer(game: GameState, fromPlayerId: PlayerId) {
  const order = game.turnOrder;
  const fromIndex = Math.max(0, order.indexOf(fromPlayerId));
  for (let offset = 1; offset <= order.length; offset++) {
    const candidate = order[(fromIndex + offset) % order.length];
    if (!candidate) continue;
    const p = game.players[candidate];
    if (p && !p.eliminated) return candidate;
  }
  return fromPlayerId;
}

function activePlayerIds(game: GameState) {
  return game.turnOrder.filter((id) => {
    const p = game.players[id];
    return p && !p.eliminated;
  });
}

function getTile(game: GameState, position: number) {
  const size = game.board.tiles.length;
  const idx = ((position % size) + size) % size;
  const tile = game.board.tiles[idx];
  if (!tile) throw new Error('INVALID_BOARD');
  return tile;
}

function getPropertyTile(game: GameState, propertyId: string) {
  return game.board.tiles.find(
    (t): t is BoardPropertyTile => t.kind === 'property' && t.propertyId === propertyId,
  );
}

function clearTurnTransient(game: GameState) {
  delete game.lastDice;
}

function buildingsInUse(buildings: number) {
  return buildings === 5 ? { houses: 0, hotels: 1 } : { houses: Math.max(0, Math.min(4, buildings)), hotels: 0 };
}

function applyBuildingsDeltaToBank(game: GameState, before: number, after: number) {
  const b = buildingsInUse(before);
  const a = buildingsInUse(after);
  game.bank.houses += b.houses - a.houses;
  game.bank.hotels += b.hotels - a.hotels;
}

function rulesStartSalary(board: BoardConfig) {
  return board.startSalary ?? 200;
}

function rulesJailFine(board: BoardConfig) {
  return board.jailFine ?? 50;
}

function rulesMortgageInterestRate(board: BoardConfig) {
  return board.mortgageInterestRate ?? 0.1;
}

function getAllCards(board: BoardConfig): CardDef[] {
  return board.cards ?? [];
}

function getDeckCards(board: BoardConfig, deck: CardDeckKind) {
  return getAllCards(board).filter((c) => c.deck === deck);
}

function shuffle<T>(seed: string, step: number, items: T[]) {
  let rng = createRng(seed, step);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const r = rng.nextIntInclusive(0, i);
    rng = r.rng;
    const j = r.value;
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }
  return { items: arr, nextStep: rng.step };
}

export function createGame(input: CreateGameInput): HandleCommandResult {
  if (input.playerIds.length < 2) throw new Error('NEED_AT_LEAST_2_PLAYERS');
  if (input.board.tiles.length === 0) throw new Error('INVALID_BOARD');
  const firstPlayerId = input.playerIds[0];
  if (!firstPlayerId) throw new Error('INVALID_PLAYERS');

  const initialCash = input.initialCash ?? 1500;
  const players = Object.fromEntries(
    input.playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        cash: initialCash,
        position: 0,
        inJail: false,
        jailTurns: 0,
        getOutOfJailChance: 0,
        getOutOfJailCommunity: 0,
        properties: [],
        eliminated: false,
      },
    ]),
  ) as Record<PlayerId, GameState['players'][PlayerId]>;

  const board = structuredClone(input.board) as BoardConfig;
  for (const t of board.tiles) {
    if (t.kind === 'property') {
      if (t.buildings === undefined) t.buildings = 0;
      if (t.mortgaged === undefined) t.mortgaged = false;
    }
  }

  const chanceCards = getDeckCards(board, 'chance');
  const communityCards = getDeckCards(board, 'communityChest');
  const s1 = shuffle(input.seed, 0, chanceCards.map((c) => c.cardId));
  const s2 = shuffle(input.seed, s1.nextStep, communityCards.map((c) => c.cardId));

  let match: MatchState = {
    nextSeq: 0,
    game: {
      roomId: input.roomId,
      gameId: input.gameId,
      status: 'playing',
      seed: input.seed,
      rngStep: s2.nextStep,
      round: 1,
      phase: 'await_roll',
      currentPlayerId: firstPlayerId,
      turnOrder: [...input.playerIds],
      players,
      board,
      bank: {
        houses: board.bankHouses ?? 32,
        hotels: board.bankHotels ?? 12,
      },
      decks: {
        chance: { drawPile: s1.items, discardPile: [] },
        communityChest: { drawPile: s2.items, discardPile: [] },
      },
    },
  };

  const events: Event[] = [];

  {
    const r = allocEvent(match, input.nowMs, undefined);
    match = r.match;
    events.push({
      ...r.base,
      type: 'room/gameStarted',
      gameId: input.gameId,
    });
  }

  {
    const r = allocEvent(match, input.nowMs, undefined);
    match = r.match;
    events.push({
      ...r.base,
      type: 'game/turnStarted',
      gameId: input.gameId,
      currentPlayerId: match.game.currentPlayerId,
      round: match.game.round,
      phase: 'await_roll',
    });
  }

  match = applyEvents(match, events);
  return { state: match, events };
}

function validateGameCommand(match: MatchState, command: Command) {
  if (command.type.startsWith('debug/')) return;
  if (
    command.type === 'game/rollDice' ||
    command.type === 'game/buyProperty' ||
    command.type === 'game/endTurn' ||
    command.type === 'game/respondPrompt' ||
    command.type === 'game/payJailFine' ||
    command.type === 'game/useGetOutOfJailCard' ||
    command.type === 'game/mortgageProperty' ||
    command.type === 'game/redeemProperty' ||
    command.type === 'game/build' ||
    command.type === 'game/sellBuilding' ||
    command.type === 'game/proposeTrade' ||
    command.type === 'game/respondTrade' ||
    command.type === 'game/declareBankruptcy'
  )
    return;
  throw new Error('UNSUPPORTED_COMMAND');
}

export function handleCommand(match: MatchState, command: Command, nowMs: number): HandleCommandResult {
  validateGameCommand(match, command);
  if (match.game.status !== 'playing') return { state: match, events: [] };

  const causedBy: CausedBy = (() => {
    const c: { commandId?: CommandId; playerId?: PlayerId } = { commandId: command.commandId };
    if ('playerId' in command) c.playerId = command.playerId;
    return c;
  })();

  const requireGame = () => {
    if ('gameId' in command && 'roomId' in command) {
      if (command.gameId !== match.game.gameId || command.roomId !== match.game.roomId)
        throw new Error('WRONG_GAME');
    }
  };

  const requireCurrentPlayer = (playerId: PlayerId) => {
    if (playerId !== match.game.currentPlayerId) throw new Error('NOT_YOUR_TURN');
    if (match.game.players[playerId]?.eliminated) throw new Error('ELIMINATED');
  };

  const ensureNoBlockingInteraction = () => {
    if (match.game.pendingPrompt) throw new Error('INVALID_PHASE');
    if (match.game.auction) throw new Error('INVALID_PHASE');
    if (match.game.trade) throw new Error('INVALID_PHASE');
  };

  if (command.type === 'game/rollDice') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    if (match.game.phase !== 'await_roll') throw new Error('INVALID_PHASE');
    if (match.game.debt) throw new Error('INVALID_PHASE');
    ensureNoBlockingInteraction();

    let events: Event[] = [];
    let cursor = match;

    const dice = rollDice(match.game.seed, match.game.rngStep).dice;
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/diceRolled',
        gameId: match.game.gameId,
        playerId: command.playerId,
        dice,
      });
    }

    const player = match.game.players[command.playerId];
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    const sum = dice[0] + dice[1];
    const isDouble = dice[0] === dice[1];

    const boardSize = match.game.board.tiles.length;
    const emitMove = (from: number, to: number) => {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/playerMoved',
        gameId: match.game.gameId,
        playerId: command.playerId,
        from,
        to,
      });
    };

    const emitMoney = (playerId: PlayerId, delta: number, reason: string) => {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/moneyChanged',
        gameId: match.game.gameId,
        playerId,
        delta,
        reason,
      });
    };

    if (player.inJail) {
      if (isDouble) {
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          events.push({
            ...r.base,
            type: 'game/engine',
            gameId: match.game.gameId,
            name: 'jail/release',
            data: { playerId: command.playerId },
          });
        }
      } else if (player.jailTurns >= 2) {
        const fine = rulesJailFine(match.game.board);
        if (player.cash < fine) {
          {
            const r = allocEvent(cursor, nowMs, causedBy);
            cursor = r.match;
            events.push({
              ...r.base,
              type: 'game/engine',
              gameId: match.game.gameId,
              name: 'debt/created',
              data: {
                debtorId: command.playerId,
                creditor: { kind: 'bank' },
                amount: fine,
                reason: 'jailFine',
              } satisfies DebtState,
            });
          }
          const nextState = applyEvents(match, events);
          return { state: nextState, events };
        }
        emitMoney(command.playerId, -fine, 'jailFine');
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          events.push({
            ...r.base,
            type: 'game/engine',
            gameId: match.game.gameId,
            name: 'jail/release',
            data: { playerId: command.playerId },
          });
        }
      } else {
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          events.push({
            ...r.base,
            type: 'game/engine',
            gameId: match.game.gameId,
            name: 'jail/turn',
            data: { playerId: command.playerId },
          });
        }
        const nextState = applyEvents(match, events);
        return { state: nextState, events };
      }
    }

    const afterRelease = applyEvents(match, events);
    const from = afterRelease.game.players[command.playerId]?.position ?? player.position;
    const rawTo = from + sum;
    const to = rawTo % boardSize;
    if (rawTo >= boardSize) {
      emitMoney(command.playerId, rulesStartSalary(match.game.board), 'passStart');
    }
    emitMove(from, to);

    const afterMove = applyEvents(match, events);
    const landingEvents = deriveLandingEvents(afterMove, cursor, nowMs, causedBy);
    events = [...events, ...landingEvents.events];
    cursor = landingEvents.match;

    const afterLanding = applyEvents(match, events);
    const endEvents = deriveEndEvents(afterLanding, cursor, nowMs);
    events = [...events, ...endEvents.events];
    cursor = endEvents.match;

    const nextState = applyEvents(match, events);
    return { state: nextState, events };
  }

  if (command.type === 'game/payJailFine') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    if (match.game.phase !== 'await_roll') throw new Error('INVALID_PHASE');
    ensureNoBlockingInteraction();
    const player = match.game.players[command.playerId];
    if (!player?.inJail) throw new Error('INVALID_PHASE');
    const fine = rulesJailFine(match.game.board);
    if (player.cash < fine) throw new Error('INSUFFICIENT_CASH');

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/moneyChanged',
        gameId: match.game.gameId,
        playerId: command.playerId,
        delta: -fine,
        reason: 'jailFine',
      });
    }
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'jail/release',
        data: { playerId: command.playerId },
      });
    }
    const nextState = applyEvents(match, events);
    return { state: nextState, events };
  }

  if (command.type === 'game/useGetOutOfJailCard') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    if (match.game.phase !== 'await_roll') throw new Error('INVALID_PHASE');
    ensureNoBlockingInteraction();
    const player = match.game.players[command.playerId];
    if (!player?.inJail) throw new Error('INVALID_PHASE');

    const deck: CardDeckKind = command.deck;
    const has =
      deck === 'chance' ? player.getOutOfJailChance > 0 : player.getOutOfJailCommunity > 0;
    if (!has) throw new Error('NO_CARD');

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'card/usedGetOutOfJail',
        data: { playerId: command.playerId, deck },
      });
    }
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'jail/release',
        data: { playerId: command.playerId },
      });
    }
    const nextState = applyEvents(match, events);
    return { state: nextState, events };
  }

  const requireActionPhase = () => {
    if (match.game.debt) return;
    if (match.game.phase !== 'await_roll' && match.game.phase !== 'await_end_turn')
      throw new Error('INVALID_PHASE');
  };

  if (command.type === 'game/mortgageProperty') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    requireActionPhase();
    ensureNoBlockingInteraction();

    const tile = getPropertyTile(match.game, command.propertyId);
    if (!tile || tile.ownerPlayerId !== command.playerId) throw new Error('NOT_OWNER');
    if (tile.mortgaged) throw new Error('ALREADY_MORTGAGED');
    if ((tile.buildings ?? 0) > 0) throw new Error('HAS_BUILDINGS');
    const groupHasBuildings = match.game.board.tiles.some(
      (t) =>
        t.kind === 'property' &&
        t.groupId === tile.groupId &&
        ((t.buildings ?? 0) > 0),
    );
    if (groupHasBuildings) throw new Error('GROUP_HAS_BUILDINGS');

    const mortgageValue = Math.floor(tile.price / 2);

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'property/mortgaged',
        data: { playerId: command.playerId, propertyId: command.propertyId, mortgageValue },
      });
    }
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/moneyChanged',
        gameId: match.game.gameId,
        playerId: command.playerId,
        delta: mortgageValue,
        reason: `mortgage:${command.propertyId}`,
      });
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const finalEvents = [...events, ...debtEvents.events];
    const finalState = applyEvents(match, finalEvents);
    return { state: finalState, events: finalEvents };
  }

  if (command.type === 'game/redeemProperty') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    requireActionPhase();
    ensureNoBlockingInteraction();

    const tile = getPropertyTile(match.game, command.propertyId);
    if (!tile || tile.ownerPlayerId !== command.playerId) throw new Error('NOT_OWNER');
    if (!tile.mortgaged) throw new Error('NOT_MORTGAGED');

    const mortgageValue = Math.floor(tile.price / 2);
    const cost = Math.ceil(mortgageValue * (1 + rulesMortgageInterestRate(match.game.board)));
    const player = match.game.players[command.playerId];
    if (!player || player.cash < cost) throw new Error('INSUFFICIENT_CASH');

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'property/redeemed',
        data: { playerId: command.playerId, propertyId: command.propertyId, cost },
      });
    }
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/moneyChanged',
        gameId: match.game.gameId,
        playerId: command.playerId,
        delta: -cost,
        reason: `redeem:${command.propertyId}`,
      });
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const finalEvents = [...events, ...debtEvents.events];
    const finalState = applyEvents(match, finalEvents);
    return { state: finalState, events: finalEvents };
  }

  if (command.type === 'game/build') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    requireActionPhase();
    ensureNoBlockingInteraction();

    const tile = getPropertyTile(match.game, command.propertyId);
    if (!tile || tile.ownerPlayerId !== command.playerId) throw new Error('NOT_OWNER');
    if (tile.mortgaged) throw new Error('MORTGAGED');

    const groupTiles = match.game.board.tiles.filter(
      (t): t is BoardPropertyTile => t.kind === 'property' && t.groupId === tile.groupId,
    );
    const ownsAll = groupTiles.every((t) => t.ownerPlayerId === command.playerId);
    const noneMortgaged = groupTiles.every((t) => !t.mortgaged);
    if (!ownsAll || !noneMortgaged) throw new Error('NO_MONOPOLY');

    const levels = groupTiles.map((t) => t.buildings ?? 0);
    const min = Math.min(...levels);
    const max = Math.max(...levels);
    const current = tile.buildings ?? 0;
    if (current > min) throw new Error('MUST_BUILD_EVENLY');
    if (current >= 5) throw new Error('MAX_BUILDINGS');

    const player = match.game.players[command.playerId];
    if (!player || player.cash < tile.houseCost) throw new Error('INSUFFICIENT_CASH');

    const needsHotel = current === 4;
    if (needsHotel) {
      if (match.game.bank.hotels <= 0) throw new Error('NO_HOTELS');
    } else {
      if (match.game.bank.houses <= 0) throw new Error('NO_HOUSES');
    }

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'building/built',
        data: { playerId: command.playerId, propertyId: command.propertyId },
      });
    }
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/moneyChanged',
        gameId: match.game.gameId,
        playerId: command.playerId,
        delta: -tile.houseCost,
        reason: `build:${command.propertyId}`,
      });
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const finalEvents = [...events, ...debtEvents.events];
    const finalState = applyEvents(match, finalEvents);
    return { state: finalState, events: finalEvents };
  }

  if (command.type === 'game/sellBuilding') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    requireActionPhase();
    ensureNoBlockingInteraction();

    const tile = getPropertyTile(match.game, command.propertyId);
    if (!tile || tile.ownerPlayerId !== command.playerId) throw new Error('NOT_OWNER');
    const current = tile.buildings ?? 0;
    if (current <= 0) throw new Error('NO_BUILDINGS');

    const groupTiles = match.game.board.tiles.filter(
      (t): t is BoardPropertyTile => t.kind === 'property' && t.groupId === tile.groupId,
    );
    const levels = groupTiles.map((t) => t.buildings ?? 0);
    const min = Math.min(...levels);
    const max = Math.max(...levels);
    if (current < max) throw new Error('MUST_SELL_EVENLY');

    if (current === 5) {
      if (match.game.bank.houses < 4) throw new Error('NO_HOUSES');
    }

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'building/sold',
        data: { playerId: command.playerId, propertyId: command.propertyId },
      });
    }
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/moneyChanged',
        gameId: match.game.gameId,
        playerId: command.playerId,
        delta: Math.floor(tile.houseCost / 2),
        reason: `sellBuilding:${command.propertyId}`,
      });
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const finalEvents = [...events, ...debtEvents.events];
    const finalState = applyEvents(match, finalEvents);
    return { state: finalState, events: finalEvents };
  }

  if (command.type === 'game/proposeTrade') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    requireActionPhase();
    ensureNoBlockingInteraction();

    const from = match.game.players[command.playerId];
    const to = match.game.players[command.toPlayerId];
    if (!from || !to || to.eliminated) throw new Error('PLAYER_NOT_FOUND');

    const offer: TradeOffer = command.offer;
    const request: TradeOffer = command.request;
    if (offer.cash < 0 || request.cash < 0) throw new Error('INVALID_TRADE');
    if (from.cash < offer.cash) throw new Error('INSUFFICIENT_CASH');
    if (to.cash < request.cash) throw new Error('OTHER_INSUFFICIENT_CASH');

    for (const pid of offer.properties) {
      const t = getPropertyTile(match.game, pid);
      if (!t || t.ownerPlayerId !== command.playerId) throw new Error('NOT_OWNER');
      if ((t.buildings ?? 0) > 0) throw new Error('HAS_BUILDINGS');
    }
    for (const pid of request.properties) {
      const t = getPropertyTile(match.game, pid);
      if (!t || t.ownerPlayerId !== command.toPlayerId) throw new Error('NOT_OWNER');
      if ((t.buildings ?? 0) > 0) throw new Error('HAS_BUILDINGS');
    }

    let cursor = match;
    const events: Event[] = [];
    const tradeId = `t${nowMs}`;
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'trade/offered',
        data: {
          tradeId,
          fromPlayerId: command.playerId,
          toPlayerId: command.toPlayerId,
          offer,
          request,
        } satisfies TradeState,
      });
    }
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      const promptId = `p${r.seq}`;
      events.push({
        ...r.base,
        type: 'game/prompted',
        gameId: match.game.gameId,
        prompt: {
          promptId,
          playerId: command.toPlayerId,
          kind: 'tradeOffer',
          data: { tradeId, fromPlayerId: command.playerId, offer, request },
        },
      });
    }

    const nextState = applyEvents(match, events);
    return { state: nextState, events };
  }

  if (command.type === 'game/respondTrade') {
    requireGame();
    if (!match.game.trade) throw new Error('NO_TRADE');
    if (match.game.trade.toPlayerId !== command.playerId) throw new Error('FORBIDDEN');
    if (match.game.phase !== 'await_prompt') throw new Error('INVALID_PHASE');

    const trade = match.game.trade;
    const accept = command.accept;

    let cursor = match;
    let events: Event[] = [];

    if (accept) {
      const from = match.game.players[trade.fromPlayerId];
      const to = match.game.players[trade.toPlayerId];
      if (!from || !to) throw new Error('PLAYER_NOT_FOUND');
      if (from.cash < trade.offer.cash) throw new Error('INSUFFICIENT_CASH');
      if (to.cash < trade.request.cash) throw new Error('OTHER_INSUFFICIENT_CASH');

      const emitMoney = (playerId: PlayerId, delta: number, reason: string) => {
        const r = allocEvent(cursor, nowMs, causedBy);
        cursor = r.match;
        events.push({
          ...r.base,
          type: 'game/moneyChanged',
          gameId: match.game.gameId,
          playerId,
          delta,
          reason,
        });
      };

      if (trade.offer.cash > 0) {
        emitMoney(trade.fromPlayerId, -trade.offer.cash, `trade:${trade.tradeId}`);
        emitMoney(trade.toPlayerId, trade.offer.cash, `trade:${trade.tradeId}`);
      }
      if (trade.request.cash > 0) {
        emitMoney(trade.toPlayerId, -trade.request.cash, `trade:${trade.tradeId}`);
        emitMoney(trade.fromPlayerId, trade.request.cash, `trade:${trade.tradeId}`);
      }

      const transferProperty = (propertyId: string, fromId: PlayerId, toId: PlayerId) => {
        const r = allocEvent(cursor, nowMs, causedBy);
        cursor = r.match;
        events.push({
          ...r.base,
          type: 'game/engine',
          gameId: match.game.gameId,
          name: 'property/transferred',
          data: { propertyId, fromPlayerId: fromId, toPlayerId: toId },
        });
      };

      for (const pid of trade.offer.properties) transferProperty(pid, trade.fromPlayerId, trade.toPlayerId);
      for (const pid of trade.request.properties) transferProperty(pid, trade.toPlayerId, trade.fromPlayerId);

      const cardDelta = (deck: CardDeckKind, fromId: PlayerId, toId: PlayerId, count: number) => {
        if (count <= 0) return;
        const r = allocEvent(cursor, nowMs, causedBy);
        cursor = r.match;
        events.push({
          ...r.base,
          type: 'game/engine',
          gameId: match.game.gameId,
          name: 'card/transferredGetOutOfJail',
          data: { deck, fromPlayerId: fromId, toPlayerId: toId, count },
        });
      };

      cardDelta('chance', trade.fromPlayerId, trade.toPlayerId, trade.offer.getOutOfJailChance ?? 0);
      cardDelta('communityChest', trade.fromPlayerId, trade.toPlayerId, trade.offer.getOutOfJailCommunity ?? 0);
      cardDelta('chance', trade.toPlayerId, trade.fromPlayerId, trade.request.getOutOfJailChance ?? 0);
      cardDelta(
        'communityChest',
        trade.toPlayerId,
        trade.fromPlayerId,
        trade.request.getOutOfJailCommunity ?? 0,
      );
    }

    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'trade/resolved',
        data: { tradeId: trade.tradeId, accepted: accept },
      });
    }

    const after = applyEvents(match, events);
    const endEvents = deriveEndEvents(after, cursor, nowMs);
    events = [...events, ...endEvents.events];
    cursor = endEvents.match;

    const nextState = applyEvents(match, events);
    return { state: nextState, events };
  }

  if (command.type === 'game/buyProperty') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    if (match.game.phase !== 'await_prompt') throw new Error('INVALID_PHASE');
    const pending = match.game.pendingPrompt;
    if (!pending || pending.kind !== 'buyOrAuction') throw new Error('INVALID_PHASE');
    if (pending.playerId !== command.playerId) throw new Error('FORBIDDEN');
    if (pending.propertyId !== command.propertyId) throw new Error('PROPERTY_MISMATCH');

    return handleCommand(
      match,
      {
        type: 'game/respondPrompt',
        commandId: command.commandId,
        clientSeq: command.clientSeq,
        roomId: command.roomId,
        gameId: command.gameId,
        playerId: command.playerId,
        promptId: pending.promptId,
        choice: { action: 'buy' },
      },
      nowMs,
    );
  }

  if (command.type === 'game/respondPrompt') {
    requireGame();
    if (match.game.phase !== 'await_prompt') throw new Error('INVALID_PHASE');
    const pending = match.game.pendingPrompt;
    if (!pending) throw new Error('INVALID_PHASE');
    if (pending.promptId !== command.promptId) throw new Error('PROMPT_MISMATCH');
    if (pending.playerId !== command.playerId) throw new Error('FORBIDDEN');

    let cursor = match;
    let events: Event[] = [];

    if (pending.kind === 'buyOrAuction') {
      const choice = command.choice as { action?: unknown };
      const action = choice?.action;
      if (action !== 'buy' && action !== 'auction') throw new Error('INVALID_CHOICE');
      const tile = getPropertyTile(match.game, pending.propertyId);
      if (!tile || tile.ownerPlayerId) throw new Error('NOT_BUYABLE');
      const buyer = match.game.players[pending.playerId];
      if (!buyer) throw new Error('PLAYER_NOT_FOUND');

      if (action === 'buy') {
        if (buyer.cash < pending.price) throw new Error('INSUFFICIENT_CASH');
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          events.push({
            ...r.base,
            type: 'game/engine',
            gameId: match.game.gameId,
            name: 'property/bought',
            data: { playerId: pending.playerId, propertyId: pending.propertyId, price: pending.price },
          });
        }
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          events.push({
            ...r.base,
            type: 'game/moneyChanged',
            gameId: match.game.gameId,
            playerId: pending.playerId,
            delta: -pending.price,
            reason: `buy:${pending.propertyId}`,
          });
        }
      } else {
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          events.push({
            ...r.base,
            type: 'game/engine',
            gameId: match.game.gameId,
            name: 'auction/started',
            data: { propertyId: pending.propertyId },
          });
        }
        const bidders = (() => {
          const list = activePlayerIds(match.game);
          const idx = list.indexOf(pending.playerId);
          if (idx <= 0) return list;
          return [...list.slice(idx), ...list.slice(0, idx)];
        })();
        const firstBidder = bidders[0] ?? pending.playerId;
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          const promptId = `p${r.seq}`;
          events.push({
            ...r.base,
            type: 'game/prompted',
            gameId: match.game.gameId,
            prompt: {
              promptId,
              playerId: firstBidder,
              kind: 'auctionBid',
              data: {
                propertyId: pending.propertyId,
                minBid: 1,
                highestBid: 0,
                highestBidderId: null,
              },
            },
          });
        }
      }
    } else if (pending.kind === 'auctionBid') {
      const choice = command.choice as { bid?: unknown; pass?: unknown };
      const bidRaw = choice?.bid;
      const pass = choice?.pass === true;
      const bid = typeof bidRaw === 'number' && Number.isFinite(bidRaw) ? Math.floor(bidRaw) : null;

      const auction = match.game.auction;
      if (!auction) throw new Error('NO_AUCTION');
      if (auction.propertyId !== pending.propertyId) throw new Error('AUCTION_MISMATCH');

      const tile = getPropertyTile(match.game, auction.propertyId);
      if (!tile || tile.ownerPlayerId) throw new Error('NOT_BUYABLE');

      const active = [...auction.activeBidders];
      const bidder = pending.playerId;
      const bidderIndex = active.indexOf(bidder);
      if (bidderIndex < 0) throw new Error('NOT_A_BIDDER');

      let highestBid = auction.highestBid;
      let highestBidderId = auction.highestBidderId;

      if (pass) {
        active.splice(bidderIndex, 1);
      } else {
        if (bid === null) throw new Error('INVALID_CHOICE');
        const minBid = highestBid + 1;
        if (bid < minBid) throw new Error('BID_TOO_LOW');
        const p = match.game.players[bidder];
        if (!p || p.cash < bid) throw new Error('INSUFFICIENT_CASH');
        highestBid = bid;
        highestBidderId = bidder;
      }

      const nextAuction: AuctionState = {
        propertyId: auction.propertyId,
        activeBidders: active,
        currentBidderIndex: 0,
        highestBid,
        ...(highestBidderId ? { highestBidderId } : {}),
      };

      {
        const r = allocEvent(cursor, nowMs, causedBy);
        cursor = r.match;
        events.push({
          ...r.base,
          type: 'game/engine',
          gameId: match.game.gameId,
          name: 'auction/updated',
          data: nextAuction,
        });
      }

      if (active.length <= 1) {
        const winner = active[0] ?? highestBidderId;
        if (winner && highestBid > 0) {
          {
            const r = allocEvent(cursor, nowMs, causedBy);
            cursor = r.match;
            events.push({
              ...r.base,
              type: 'game/engine',
              gameId: match.game.gameId,
              name: 'property/bought',
              data: { playerId: winner, propertyId: auction.propertyId, price: highestBid },
            });
          }
          {
            const r = allocEvent(cursor, nowMs, causedBy);
            cursor = r.match;
            events.push({
              ...r.base,
              type: 'game/moneyChanged',
              gameId: match.game.gameId,
              playerId: winner,
              delta: -highestBid,
              reason: `auction:${auction.propertyId}`,
            });
          }
        }
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          events.push({
            ...r.base,
            type: 'game/engine',
            gameId: match.game.gameId,
            name: 'auction/ended',
            data: { propertyId: auction.propertyId, winnerPlayerId: winner ?? null, price: highestBid },
          });
        }
      } else {
        const nextIndex = pass ? bidderIndex % active.length : (bidderIndex + 1) % active.length;
        const nextBidder = active[nextIndex]!;
        {
          const r = allocEvent(cursor, nowMs, causedBy);
          cursor = r.match;
          const promptId = `p${r.seq}`;
          events.push({
            ...r.base,
            type: 'game/prompted',
            gameId: match.game.gameId,
            prompt: {
              promptId,
              playerId: nextBidder,
              kind: 'auctionBid',
              data: {
                propertyId: auction.propertyId,
                minBid: highestBid + 1,
                highestBid,
                highestBidderId: highestBidderId ?? null,
              },
            },
          });
        }
      }
    } else {
      throw new Error('UNSUPPORTED_PROMPT');
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const combined = [...events, ...debtEvents.events];
    const afterDebt = applyEvents(match, combined);
    const endEvents = deriveEndEvents(afterDebt, debtEvents.match, nowMs);
    const finalEvents = [...combined, ...endEvents.events];
    const nextState = applyEvents(match, finalEvents);
    return { state: nextState, events: finalEvents };
  }

  if (command.type === 'game/declareBankruptcy') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    if (!match.game.debt) throw new Error('NO_DEBT');
    if (match.game.debt.debtorId !== command.playerId) throw new Error('FORBIDDEN');
    if (match.game.phase !== 'await_debt') throw new Error('INVALID_PHASE');

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'bankruptcy/declared',
        data: match.game.debt,
      });
    }

    const afterBankruptcy = applyEvents(match, events);
    const active = activePlayerIds(afterBankruptcy.game);
    if (active.length > 1) {
      const nextPlayerId = findNextActivePlayer(afterBankruptcy.game, command.playerId);
      const round =
        nextPlayerId === afterBankruptcy.game.turnOrder[0] ? afterBankruptcy.game.round + 1 : afterBankruptcy.game.round;
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/turnStarted',
        gameId: match.game.gameId,
        currentPlayerId: nextPlayerId,
        round,
        phase: 'await_roll',
      });
    }

    const after = applyEvents(match, events);
    const endEvents = deriveEndEvents(after, cursor, nowMs);
    const finalEvents = [...events, ...endEvents.events];
    const nextState = applyEvents(match, finalEvents);
    return { state: nextState, events: finalEvents };
  }

  if (command.type === 'game/endTurn') {
    requireGame();
    requireCurrentPlayer(command.playerId);
    if (match.game.phase !== 'await_end_turn') throw new Error('INVALID_PHASE');
    if (match.game.debt) throw new Error('INVALID_PHASE');
    ensureNoBlockingInteraction();

    const nextPlayerId = findNextActivePlayer(match.game, command.playerId);
    const round =
      nextPlayerId === match.game.turnOrder[0] ? match.game.round + 1 : match.game.round;

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/turnStarted',
        gameId: match.game.gameId,
        currentPlayerId: nextPlayerId,
        round,
        phase: 'await_roll',
      });
    }
    const nextState = applyEvents(match, events);
    return { state: nextState, events };
  }

  if (command.type === 'debug/addCash') {
    requireGame();
    const delta = Number.isFinite(command.delta) ? Math.trunc(command.delta) : 0;
    const targetId = command.targetPlayerId;
    const target = match.game.players[targetId];
    if (!target) throw new Error('PLAYER_NOT_FOUND');

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/moneyChanged',
        gameId: match.game.gameId,
        playerId: targetId,
        delta,
        reason: 'debug:addCash',
      });
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const combined = [...events, ...debtEvents.events];
    const afterDebt = applyEvents(match, combined);
    const endEvents = deriveEndEvents(afterDebt, debtEvents.match, nowMs);
    const finalEvents = [...combined, ...endEvents.events];
    const nextState = applyEvents(match, finalEvents);
    return { state: nextState, events: finalEvents };
  }

  if (command.type === 'debug/assignProperty') {
    requireGame();
    const tile = getPropertyTile(match.game, command.propertyId);
    if (!tile) throw new Error('INVALID_PROPERTY');
    if (!(command.ownerPlayerId === null || match.game.players[command.ownerPlayerId])) throw new Error('PLAYER_NOT_FOUND');

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'debug/propertyAssigned',
        data: { propertyId: command.propertyId, ownerPlayerId: command.ownerPlayerId },
      });
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const combined = [...events, ...debtEvents.events];
    const afterDebt = applyEvents(match, combined);
    const endEvents = deriveEndEvents(afterDebt, debtEvents.match, nowMs);
    const finalEvents = [...combined, ...endEvents.events];
    const nextState = applyEvents(match, finalEvents);
    return { state: nextState, events: finalEvents };
  }

  if (command.type === 'debug/setBuildings') {
    requireGame();
    const tile = getPropertyTile(match.game, command.propertyId);
    if (!tile) throw new Error('INVALID_PROPERTY');
    if (!tile.ownerPlayerId) throw new Error('NOT_OWNED');
    const buildings = Math.max(0, Math.min(5, Math.trunc(command.buildings)));

    let cursor = match;
    const events: Event[] = [];
    {
      const r = allocEvent(cursor, nowMs, causedBy);
      cursor = r.match;
      events.push({
        ...r.base,
        type: 'game/engine',
        gameId: match.game.gameId,
        name: 'debug/buildingsSet',
        data: { propertyId: command.propertyId, buildings },
      });
    }

    const after = applyEvents(match, events);
    const debtEvents = deriveAutoDebtPayment(after, cursor, nowMs, causedBy);
    const combined = [...events, ...debtEvents.events];
    const afterDebt = applyEvents(match, combined);
    const endEvents = deriveEndEvents(afterDebt, debtEvents.match, nowMs);
    const finalEvents = [...combined, ...endEvents.events];
    const nextState = applyEvents(match, finalEvents);
    return { state: nextState, events: finalEvents };
  }

  return { state: match, events: [] };
}

type DeriveEventsResult = { events: Event[]; match: MatchState };

function deriveLandingEvents(
  afterMove: MatchState,
  cursor: MatchState,
  nowMs: number,
  causedBy: CausedBy,
): DeriveEventsResult {
  let state = afterMove;
  let m = cursor;
  const all: Event[] = [];

  const calcRent = (g: GameState, t: BoardPropertyTile) => {
    if (t.mortgaged) return 0;
    const buildings = t.buildings ?? 0;
    if (buildings > 0) return t.rents[buildings] ?? 0;
    const groupTiles = g.board.tiles.filter(
      (x): x is BoardPropertyTile => x.kind === 'property' && x.groupId === t.groupId,
    );
    const ownsAll = groupTiles.every((x) => x.ownerPlayerId === t.ownerPlayerId);
    const noneMortgaged = groupTiles.every((x) => !x.mortgaged);
    if (ownsAll && noneMortgaged) return (t.rents[0] ?? 0) * 2;
    return t.rents[0] ?? 0;
  };

  const allocEngine = (events: Event[], name: string, data: unknown) => {
    const r = allocEvent(m, nowMs, causedBy);
    m = r.match;
    events.push({ ...r.base, type: 'game/engine', gameId: state.game.gameId, name, data });
  };

  const allocMoney = (events: Event[], playerId: PlayerId, delta: number, reason: string) => {
    const r = allocEvent(m, nowMs, causedBy);
    m = r.match;
    events.push({ ...r.base, type: 'game/moneyChanged', gameId: state.game.gameId, playerId, delta, reason });
  };

  const allocMove = (events: Event[], playerId: PlayerId, from: number, to: number) => {
    const r = allocEvent(m, nowMs, causedBy);
    m = r.match;
    events.push({ ...r.base, type: 'game/playerMoved', gameId: state.game.gameId, playerId, from, to });
  };

  const allocPromptBuyOrAuction = (events: Event[], playerId: PlayerId, propertyId: string, price: number) => {
    const r = allocEvent(m, nowMs, causedBy);
    m = r.match;
    const promptId = `p${r.seq}`;
    events.push({
      ...r.base,
      type: 'game/prompted',
      gameId: state.game.gameId,
      prompt: { promptId, playerId, kind: 'buyOrAuction', data: { propertyId, price } },
    });
  };

  const createDebt = (events: Event[], debt: DebtState) => {
    allocEngine(events, 'debt/created', debt);
  };

  const tryPay = (events: Event[], debtorId: PlayerId, creditor: DebtCreditor, amount: number, reason: string) => {
    const debtor = state.game.players[debtorId];
    if (!debtor) return;
    if (amount <= 0) return;
    if (debtor.cash >= amount) {
      allocMoney(events, debtorId, -amount, reason);
      if (creditor.kind === 'player') allocMoney(events, creditor.playerId, amount, reason);
      return;
    }
    createDebt(events, { debtorId, creditor, amount, reason });
  };

  for (let guard = 0; guard < 10; guard++) {
    const game = state.game;
    const player = game.players[game.currentPlayerId];
    if (!player || player.eliminated) break;
    if (game.pendingPrompt || game.debt || game.auction || game.trade) break;

    const stepEvents: Event[] = [];
    const tile = getTile(game, player.position);
    if (tile.kind === 'goToJail') {
      allocEngine(stepEvents, 'jail/enter', { playerId: player.playerId });
      all.push(...stepEvents);
      state = applyEvents(state, stepEvents);
      break;
    }

    if (tile.kind === 'tax') {
      tryPay(stepEvents, player.playerId, { kind: 'bank' }, (tile as BoardTaxTile).amount, `tax:${player.position}`);
      all.push(...stepEvents);
      state = applyEvents(state, stepEvents);
      if (state.game.debt) break;
      break;
    }

    if (tile.kind === 'chance' || tile.kind === 'communityChest') {
      const deck: CardDeckKind = tile.kind === 'chance' ? 'chance' : 'communityChest';
      const deckState = game.decks[deck];
      const cardId = deckState.drawPile[0];
      if (!cardId) break;
      allocEngine(stepEvents, 'card/drawn', { deck, cardId, playerId: player.playerId });
      all.push(...stepEvents);
      state = applyEvents(state, stepEvents);

      const def = getAllCards(game.board).find((c) => c.cardId === cardId);
      if (!def) break;
      const eff = def.effect;

      if (eff.kind === 'money') {
        if (eff.delta >= 0) {
          const stepEvents2: Event[] = [];
          allocMoney(stepEvents2, player.playerId, eff.delta, `card:${cardId}`);
          all.push(...stepEvents2);
          state = applyEvents(state, stepEvents2);
          break;
        }
        const stepEvents2: Event[] = [];
        tryPay(stepEvents2, player.playerId, { kind: 'bank' }, -eff.delta, `card:${cardId}`);
        all.push(...stepEvents2);
        state = applyEvents(state, stepEvents2);
        if (state.game.debt) break;
        break;
      }

      if (eff.kind === 'moveTo') {
        const from = player.position;
        const to = eff.index;
        if (eff.passStart && to < from) allocMoney(stepEvents, player.playerId, rulesStartSalary(game.board), 'passStart');
        allocMove(stepEvents, player.playerId, from, to);
        all.push(...stepEvents);
        state = applyEvents(state, stepEvents);
        continue;
      }

      if (eff.kind === 'goToJail') {
        const stepEvents2: Event[] = [];
        allocEngine(stepEvents2, 'jail/enter', { playerId: player.playerId });
        all.push(...stepEvents2);
        state = applyEvents(state, stepEvents2);
        break;
      }

      break;
    }

    if (tile.kind === 'property') {
      const t = tile as BoardPropertyTile;
      if (!t.ownerPlayerId) {
        if (player.cash >= t.price) {
          allocPromptBuyOrAuction(stepEvents, player.playerId, t.propertyId, t.price);
          all.push(...stepEvents);
          state = applyEvents(state, stepEvents);
        }
        break;
      }
      if (t.ownerPlayerId !== player.playerId) {
        const rent = calcRent(game, t);
        if (rent > 0)
          tryPay(stepEvents, player.playerId, { kind: 'player', playerId: t.ownerPlayerId }, rent, `rent:${t.propertyId}`);
        all.push(...stepEvents);
        state = applyEvents(state, stepEvents);
        break;
      }
      break;
    }

    break;
  }

  return { events: all, match: m };
}

function deriveAutoDebtPayment(
  after: MatchState,
  cursor: MatchState,
  nowMs: number,
  causedBy: CausedBy,
): DeriveEventsResult {
  const debt = after.game.debt;
  if (!debt) return { events: [], match: cursor };
  const debtor = after.game.players[debt.debtorId];
  if (!debtor) return { events: [], match: cursor };
  if (debtor.cash < debt.amount) return { events: [], match: cursor };

  let m = cursor;
  const events: Event[] = [];

  {
    const r = allocEvent(m, nowMs, causedBy);
    m = r.match;
    events.push({
      ...r.base,
      type: 'game/moneyChanged',
      gameId: after.game.gameId,
      playerId: debt.debtorId,
      delta: -debt.amount,
      reason: debt.reason,
    });
  }

  if (debt.creditor.kind === 'player') {
    const r = allocEvent(m, nowMs, causedBy);
    m = r.match;
    events.push({
      ...r.base,
      type: 'game/moneyChanged',
      gameId: after.game.gameId,
      playerId: debt.creditor.playerId,
      delta: debt.amount,
      reason: debt.reason,
    });
  }

  {
    const r = allocEvent(m, nowMs, causedBy);
    m = r.match;
    events.push({
      ...r.base,
      type: 'game/engine',
      gameId: after.game.gameId,
      name: 'debt/cleared',
      data: { debtorId: debt.debtorId },
    });
  }

  return { events, match: m };
}

function deriveEndEvents(after: MatchState, cursor: MatchState, nowMs: number): DeriveEventsResult {
  const game = after.game;
  const active = activePlayerIds(game);
  if (active.length > 1) return { events: [], match: cursor };

  const winnerPlayerId = active[0];
  const events: Event[] = [];
  let m = cursor;
  const r = allocEvent(m, nowMs, undefined);
  m = r.match;
  const ended: Event = (() => {
    const e: {
      roomId: RoomId;
      createdAtMs: number;
      eventId: EventId;
      seq: EventSeq;
      causedBy?: { commandId?: CommandId; playerId?: PlayerId };
      type: 'game/ended';
      gameId: GameId;
      winnerPlayerId?: PlayerId;
    } = { ...r.base, type: 'game/ended', gameId: game.gameId };
    if (winnerPlayerId) e.winnerPlayerId = winnerPlayerId;
    return e as Event;
  })();
  events.push(ended);
  return { events, match: m };
}

export function applyEvent(match: MatchState, event: Event): MatchState {
  const next = structuredClone(match) as MatchState;
  const game = next.game;

  if (event.type === 'room/gameStarted') return next;

  if (event.type === 'game/turnStarted') {
    if (event.gameId !== game.gameId) return next;
    clearTurnTransient(game);
    delete game.pendingPrompt;
    delete game.auction;
    delete game.trade;
    game.currentPlayerId = event.currentPlayerId;
    game.round = event.round;
    game.phase = (event.phase as RulesPhase) ?? 'await_roll';
    delete game.debt;
    return next;
  }

  if (event.type === 'game/diceRolled') {
    if (event.gameId !== game.gameId) return next;
    game.lastDice = event.dice;
    game.rngStep += 2;
    game.phase = 'await_end_turn';
    return next;
  }

  if (event.type === 'game/playerMoved') {
    if (event.gameId !== game.gameId) return next;
    const p = game.players[event.playerId];
    if (!p) return next;
    p.position = event.to;
    return next;
  }

  if (event.type === 'game/prompted') {
    if (event.gameId !== game.gameId) return next;
    if (event.prompt.kind === 'buyOrAuction') {
      const data = event.prompt.data as { propertyId: string; price: number };
      const pending: PendingPrompt = {
        kind: 'buyOrAuction',
        promptId: event.prompt.promptId,
        playerId: event.prompt.playerId,
        propertyId: data.propertyId,
        price: data.price,
      };
      game.pendingPrompt = pending;
      game.phase = 'await_prompt';
      return next;
    }
    if (event.prompt.kind === 'auctionBid') {
      const data = event.prompt.data as {
        propertyId: string;
        minBid: number;
        highestBid: number;
        highestBidderId?: PlayerId | null;
      };
      const pending: PendingPrompt = {
        kind: 'auctionBid',
        promptId: event.prompt.promptId,
        playerId: event.prompt.playerId,
        propertyId: data.propertyId,
        minBid: data.minBid,
        highestBid: data.highestBid,
        ...(data.highestBidderId ? { highestBidderId: data.highestBidderId } : {}),
      };
      game.pendingPrompt = pending;
      game.phase = 'await_prompt';
      return next;
    }
    return next;
  }

  if (event.type === 'game/engine') {
    if (event.gameId !== game.gameId) return next;
    if (event.name === 'property/bought') {
      const data = event.data as { playerId: PlayerId; propertyId: string };
      const tile = getPropertyTile(game, data.propertyId);
      if (tile) {
        tile.ownerPlayerId = data.playerId;
        tile.mortgaged = false;
        tile.buildings = 0;
      }
      const p = game.players[data.playerId];
      if (p && !p.properties.includes(data.propertyId)) p.properties.push(data.propertyId);
      delete game.pendingPrompt;
      game.phase = 'await_end_turn';
      return next;
    }
    if (event.name === 'property/mortgaged') {
      const data = event.data as { propertyId: string };
      const tile = getPropertyTile(game, data.propertyId);
      if (tile) tile.mortgaged = true;
      return next;
    }
    if (event.name === 'property/redeemed') {
      const data = event.data as { propertyId: string };
      const tile = getPropertyTile(game, data.propertyId);
      if (tile) tile.mortgaged = false;
      return next;
    }
    if (event.name === 'building/built') {
      const data = event.data as { propertyId: string };
      const tile = getPropertyTile(game, data.propertyId);
      if (!tile) return next;
      const before = tile.buildings ?? 0;
      const after = before + 1;
      tile.buildings = after;
      if (before === 4) {
        game.bank.hotels -= 1;
        game.bank.houses += 4;
      } else {
        game.bank.houses -= 1;
      }
      return next;
    }
    if (event.name === 'building/sold') {
      const data = event.data as { propertyId: string };
      const tile = getPropertyTile(game, data.propertyId);
      if (!tile) return next;
      const before = tile.buildings ?? 0;
      if (before <= 0) return next;
      if (before === 5) {
        tile.buildings = 4;
        game.bank.hotels += 1;
        game.bank.houses -= 4;
      } else {
        tile.buildings = before - 1;
        game.bank.houses += 1;
      }
      return next;
    }
    if (event.name === 'jail/enter') {
      const data = event.data as { playerId: PlayerId };
      const p = game.players[data.playerId];
      if (p) {
        p.inJail = true;
        p.jailTurns = 0;
        p.position = game.board.jailIndex;
      }
      delete game.pendingPrompt;
      delete game.auction;
      delete game.trade;
      game.phase = 'await_end_turn';
      return next;
    }
    if (event.name === 'jail/turn') {
      const data = event.data as { playerId: PlayerId };
      const p = game.players[data.playerId];
      if (p) p.jailTurns += 1;
      game.phase = 'await_end_turn';
      return next;
    }
    if (event.name === 'jail/release') {
      const data = event.data as { playerId: PlayerId };
      const p = game.players[data.playerId];
      if (p) {
        p.inJail = false;
        p.jailTurns = 0;
      }
      return next;
    }
    if (event.name === 'auction/started') {
      const data = event.data as { propertyId: string };
      game.auction = {
        propertyId: data.propertyId,
        activeBidders: activePlayerIds(game),
        currentBidderIndex: 0,
        highestBid: 0,
      };
      delete game.pendingPrompt;
      game.phase = 'await_prompt';
      return next;
    }
    if (event.name === 'auction/updated') {
      game.auction = event.data as AuctionState;
      delete game.pendingPrompt;
      game.phase = 'await_prompt';
      return next;
    }
    if (event.name === 'auction/ended') {
      delete game.auction;
      delete game.pendingPrompt;
      game.phase = 'await_end_turn';
      return next;
    }
    if (event.name === 'trade/offered') {
      game.trade = event.data as TradeState;
      delete game.pendingPrompt;
      game.phase = 'await_prompt';
      return next;
    }
    if (event.name === 'trade/resolved') {
      delete game.trade;
      delete game.pendingPrompt;
      game.phase = 'await_end_turn';
      return next;
    }
    if (event.name === 'property/transferred') {
      const data = event.data as { propertyId: string; fromPlayerId: PlayerId; toPlayerId: PlayerId };
      const tile = getPropertyTile(game, data.propertyId);
      if (tile) tile.ownerPlayerId = data.toPlayerId;
      const from = game.players[data.fromPlayerId];
      if (from) from.properties = from.properties.filter((x) => x !== data.propertyId);
      const to = game.players[data.toPlayerId];
      if (to && !to.properties.includes(data.propertyId)) to.properties.push(data.propertyId);
      return next;
    }
    if (event.name === 'debug/propertyAssigned') {
      const data = event.data as { propertyId: string; ownerPlayerId: PlayerId | null };
      const tile = getPropertyTile(game, data.propertyId);
      if (!tile) return next;
      const beforeOwner = tile.ownerPlayerId ?? null;
      const beforeBuildings = Math.max(0, Math.floor(tile.buildings ?? 0));

      if (beforeOwner) {
        const from = game.players[beforeOwner];
        if (from) from.properties = from.properties.filter((x) => x !== data.propertyId);
      }
      if (data.ownerPlayerId) {
        const to = game.players[data.ownerPlayerId];
        if (to && !to.properties.includes(data.propertyId)) to.properties.push(data.propertyId);
        tile.ownerPlayerId = data.ownerPlayerId;
      } else {
        delete tile.ownerPlayerId;
      }

      if (beforeBuildings > 0) {
        applyBuildingsDeltaToBank(game, beforeBuildings, 0);
        tile.buildings = 0;
      } else {
        tile.buildings = 0;
      }
      tile.mortgaged = false;
      return next;
    }
    if (event.name === 'debug/buildingsSet') {
      const data = event.data as { propertyId: string; buildings: number };
      const tile = getPropertyTile(game, data.propertyId);
      if (!tile) return next;
      const before = Math.max(0, Math.floor(tile.buildings ?? 0));
      const after = Math.max(0, Math.min(5, Math.floor(data.buildings)));
      if (before !== after) {
        applyBuildingsDeltaToBank(game, before, after);
        tile.buildings = after;
      }
      return next;
    }
    if (event.name === 'card/drawn') {
      const data = event.data as { deck: CardDeckKind; cardId: string; playerId: PlayerId };
      const deck = game.decks[data.deck];
      if (deck.drawPile[0] !== data.cardId) {
        deck.drawPile = deck.drawPile.filter((x) => x !== data.cardId);
      } else {
        deck.drawPile.shift();
      }
      const def = getAllCards(game.board).find((c) => c.cardId === data.cardId);
      if (def?.effect.kind === 'getOutOfJail') {
        const p = game.players[data.playerId];
        if (p) {
          if (data.deck === 'chance') p.getOutOfJailChance += 1;
          else p.getOutOfJailCommunity += 1;
        }
      } else {
        deck.discardPile.push(data.cardId);
      }
      return next;
    }
    if (event.name === 'card/usedGetOutOfJail') {
      const data = event.data as { playerId: PlayerId; deck: CardDeckKind };
      const p = game.players[data.playerId];
      if (p) {
        if (data.deck === 'chance') p.getOutOfJailChance = Math.max(0, p.getOutOfJailChance - 1);
        else p.getOutOfJailCommunity = Math.max(0, p.getOutOfJailCommunity - 1);
      }
      return next;
    }
    if (event.name === 'card/transferredGetOutOfJail') {
      const data = event.data as { deck: CardDeckKind; fromPlayerId: PlayerId; toPlayerId: PlayerId; count: number };
      const from = game.players[data.fromPlayerId];
      const to = game.players[data.toPlayerId];
      if (from && to) {
        if (data.deck === 'chance') {
          from.getOutOfJailChance -= data.count;
          to.getOutOfJailChance += data.count;
        } else {
          from.getOutOfJailCommunity -= data.count;
          to.getOutOfJailCommunity += data.count;
        }
      }
      return next;
    }
    if (event.name === 'debt/created') {
      game.debt = event.data as DebtState;
      delete game.pendingPrompt;
      delete game.auction;
      delete game.trade;
      game.phase = 'await_debt';
      return next;
    }
    if (event.name === 'debt/cleared') {
      delete game.debt;
      game.phase = 'await_end_turn';
      return next;
    }
    if (event.name === 'bankruptcy/declared') {
      const debt = event.data as DebtState;
      const debtor = game.players[debt.debtorId];
      if (!debtor) return next;

      let liquidation = 0;
      for (const pid of [...debtor.properties]) {
        const tile = getPropertyTile(game, pid);
        if (!tile) continue;
        const buildings = tile.buildings ?? 0;
        if (buildings > 0) {
          liquidation += buildings * Math.floor(tile.houseCost / 2);
          if (buildings === 5) {
            game.bank.hotels += 1;
            game.bank.houses += 4;
          } else {
            game.bank.houses += buildings;
          }
        }
        tile.buildings = 0;
      }

      debtor.cash += liquidation;
      const cashTransfer = debtor.cash;
      debtor.cash = 0;

      if (debt.creditor.kind === 'player') {
        const creditor = game.players[debt.creditor.playerId];
        if (creditor) creditor.cash += cashTransfer;
      }

      for (const pid of [...debtor.properties]) {
        const tile = getPropertyTile(game, pid);
        if (!tile) continue;
        if (debt.creditor.kind === 'player') {
          tile.ownerPlayerId = debt.creditor.playerId;
          const creditor = game.players[debt.creditor.playerId];
          if (creditor && !creditor.properties.includes(pid)) creditor.properties.push(pid);
        } else {
          delete tile.ownerPlayerId;
          tile.mortgaged = false;
          tile.buildings = 0;
        }
      }

      debtor.properties = [];
      debtor.eliminated = true;
      delete game.debt;
      delete game.pendingPrompt;
      delete game.auction;
      delete game.trade;
      game.phase = 'await_end_turn';
      return next;
    }
    return next;
  }

  if (event.type === 'game/moneyChanged') {
    if (event.gameId !== game.gameId) return next;
    const p = game.players[event.playerId];
    if (!p) return next;
    p.cash += event.delta;
    return next;
  }

  if (event.type === 'game/ended') {
    if (event.gameId !== game.gameId) return next;
    game.status = 'ended';
    game.phase = 'ended';
    return next;
  }

  return next;
}

export function applyEvents(match: MatchState, events: Event[]): MatchState {
  return events.reduce((s, e) => applyEvent(s, e), match);
}

export function replay(initial: MatchState, events: Event[]): MatchState {
  return applyEvents(initial, events);
}

export function toGameSnapshot(match: MatchState): GameSnapshot {
  const game = match.game;
  const players = gamePlayersInOrder(game).map((p) => {
    const s: {
      playerId: PlayerId;
      cash: number;
      position: number;
      inJail?: boolean;
      jailTurns?: number;
      properties?: string[];
      eliminated?: boolean;
    } = { playerId: p.playerId, cash: p.cash, position: p.position };
    if (p.inJail) {
      s.inJail = true;
      s.jailTurns = p.jailTurns;
    }
    if (p.properties.length > 0) s.properties = [...p.properties];
    if (p.eliminated) s.eliminated = true;
    return s;
  });

  return {
    gameId: game.gameId,
    status: game.status,
    seed: game.seed,
    rngStep: game.rngStep,
    round: game.round,
    phase: game.phase,
    currentPlayerId: game.currentPlayerId,
    players,
    engineState: {
      board: game.board,
      pendingPrompt: game.pendingPrompt ?? null,
      auction: game.auction ?? null,
      trade: game.trade ?? null,
      debt: game.debt ?? null,
      bank: game.bank,
      decks: game.decks,
      lastDice: game.lastDice ?? null,
      turnOrder: [...game.turnOrder],
    },
  };
}
