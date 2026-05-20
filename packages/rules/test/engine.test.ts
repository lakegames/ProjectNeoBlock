import assert from 'node:assert/strict';
import test from 'node:test';

import { createGame, handleCommand, replay } from '../src/engine.js';
import { rollDice } from '../src/rng.js';
import type { BoardConfig } from '../src/types.js';

function findSeed(predicate: (dice1: [number, number], dice2: [number, number]) => boolean) {
  for (let i = 0; i < 5000; i++) {
    const seed = `seed-${i}`;
    const d1 = rollDice(seed, 0).dice;
    const d2 = rollDice(seed, 2).dice;
    if (predicate(d1, d2)) return seed;
  }
  throw new Error('SEED_NOT_FOUND');
}

function diceSum(seed: string, step: number) {
  const d = rollDice(seed, step).dice;
  return d[0] + d[1];
}

function findSeed4(predicate: (d1: number, d2: number, d3: number, d4: number) => boolean) {
  for (let i = 0; i < 20000; i++) {
    const seed = `seed-${i}`;
    const d1 = diceSum(seed, 0);
    const d2 = diceSum(seed, 2);
    const d3 = diceSum(seed, 4);
    const d4 = diceSum(seed, 6);
    if (predicate(d1, d2, d3, d4)) return seed;
  }
  throw new Error('SEED_NOT_FOUND');
}

function findSeed3(predicate: (d1: number, d2: number, d3: number) => boolean) {
  for (let i = 0; i < 20000; i++) {
    const seed = `seed-${i}`;
    const d1 = diceSum(seed, 0);
    const d2 = diceSum(seed, 2);
    const d3 = diceSum(seed, 4);
    if (predicate(d1, d2, d3)) return seed;
  }
  throw new Error('SEED_NOT_FOUND');
}

test('确定性随机：相同 seed 与 step 产出一致骰子', () => {
  const a0 = rollDice('deterministic', 0);
  const a1 = rollDice('deterministic', 0);
  assert.deepStrictEqual(a0, a1);

  const b0 = rollDice('deterministic', 2);
  const b1 = rollDice('deterministic', 2);
  assert.deepStrictEqual(b0, b1);
});

test('事件驱动：买地、成套双倍租金 + 回放一致性', () => {
  const board: BoardConfig = {
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'A', groupId: 'g1', price: 100, houseCost: 50, rents: [10, 50, 150, 450, 625, 750] },
      { kind: 'property', propertyId: 'B', groupId: 'g1', price: 100, houseCost: 50, rents: [10, 50, 150, 450, 625, 750] },
    ],
    jailIndex: 0,
    startSalary: 0,
  };

  const seed = findSeed4((d1, d2, d3, d4) => d1 % 3 === 1 && d2 % 3 === 0 && d3 % 3 === 1 && d4 % 3 === 2);

  const g0 = createGame({
    roomId: 'room-1',
    gameId: 'game-1',
    seed,
    playerIds: ['p1', 'p2'],
    board,
    nowMs: 1,
    initialCash: 500,
  });

  let state = g0.state;
  const events: unknown[] = [...g0.events];

  const r1 = handleCommand(state, { type: 'game/rollDice', commandId: 'c1', clientSeq: 1, roomId: 'room-1', gameId: 'game-1', playerId: 'p1' }, 2);
  state = r1.state;
  events.push(...r1.events);
  assert.equal(state.game.phase, 'await_prompt');
  assert.equal(state.game.pendingPrompt?.kind, 'buyOrAuction');
  assert.equal(state.game.pendingPrompt?.propertyId, 'A');

  const buyA = handleCommand(state, { type: 'game/buyProperty', commandId: 'c2', clientSeq: 2, roomId: 'room-1', gameId: 'game-1', playerId: 'p1', propertyId: 'A' }, 3);
  state = buyA.state;
  events.push(...buyA.events);
  assert.deepStrictEqual(state.game.players.p1.properties, ['A']);

  const end1 = handleCommand(state, { type: 'game/endTurn', commandId: 'c3', clientSeq: 3, roomId: 'room-1', gameId: 'game-1', playerId: 'p1' }, 4);
  state = end1.state;
  events.push(...end1.events);
  assert.equal(state.game.currentPlayerId, 'p2');

  const r2 = handleCommand(state, { type: 'game/rollDice', commandId: 'c4', clientSeq: 4, roomId: 'room-1', gameId: 'game-1', playerId: 'p2' }, 5);
  state = r2.state;
  events.push(...r2.events);
  assert.equal(state.game.players.p2.position, 0);

  const end2 = handleCommand(state, { type: 'game/endTurn', commandId: 'c5', clientSeq: 5, roomId: 'room-1', gameId: 'game-1', playerId: 'p2' }, 6);
  state = end2.state;
  events.push(...end2.events);
  assert.equal(state.game.currentPlayerId, 'p1');

  const r3 = handleCommand(state, { type: 'game/rollDice', commandId: 'c6', clientSeq: 6, roomId: 'room-1', gameId: 'game-1', playerId: 'p1' }, 7);
  state = r3.state;
  events.push(...r3.events);
  assert.equal(state.game.pendingPrompt?.kind, 'buyOrAuction');
  assert.equal(state.game.pendingPrompt?.propertyId, 'B');

  const buyB = handleCommand(state, { type: 'game/buyProperty', commandId: 'c7', clientSeq: 7, roomId: 'room-1', gameId: 'game-1', playerId: 'p1', propertyId: 'B' }, 8);
  state = buyB.state;
  events.push(...buyB.events);
  assert.deepStrictEqual(state.game.players.p1.properties.sort(), ['A', 'B']);

  const end3 = handleCommand(state, { type: 'game/endTurn', commandId: 'c8', clientSeq: 8, roomId: 'room-1', gameId: 'game-1', playerId: 'p1' }, 9);
  state = end3.state;
  events.push(...end3.events);

  const beforeCashP1 = state.game.players.p1.cash;
  const beforeCashP2 = state.game.players.p2.cash;
  const r4 = handleCommand(state, { type: 'game/rollDice', commandId: 'c9', clientSeq: 9, roomId: 'room-1', gameId: 'game-1', playerId: 'p2' }, 10);
  state = r4.state;
  events.push(...r4.events);

  assert.equal(state.game.players.p2.position, 2);
  assert.equal(state.game.players.p2.cash, beforeCashP2 - 20);
  assert.equal(state.game.players.p1.cash, beforeCashP1 + 20);

  const base = structuredClone(g0.state);
  const replayed = replay(base, [...r1.events, ...buyA.events, ...end1.events, ...r2.events, ...end2.events, ...r3.events, ...buyB.events, ...end3.events, ...r4.events]);
  assert.deepStrictEqual(replayed, state);
});

test('抵押：抵押地产后免收租金', () => {
  const board: BoardConfig = {
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'A', groupId: 'g1', price: 100, houseCost: 50, rents: [10, 50, 150, 450, 625, 750] },
    ],
    jailIndex: 0,
    startSalary: 0,
  };

  const seed = findSeed((d1, d2) => (d1[0] + d1[1]) % 2 === 1 && (d2[0] + d2[1]) % 2 === 1);

  const g0 = createGame({
    roomId: 'room-2',
    gameId: 'game-2',
    seed,
    playerIds: ['p1', 'p2'],
    board,
    nowMs: 1,
    initialCash: 500,
  });

  let state = g0.state;
  const r1 = handleCommand(state, { type: 'game/rollDice', commandId: 'c1', clientSeq: 1, roomId: 'room-2', gameId: 'game-2', playerId: 'p1' }, 2);
  state = r1.state;
  assert.equal(state.game.pendingPrompt?.kind, 'buyOrAuction');
  state = handleCommand(state, { type: 'game/buyProperty', commandId: 'c2', clientSeq: 2, roomId: 'room-2', gameId: 'game-2', playerId: 'p1', propertyId: 'A' }, 3).state;
  state = handleCommand(state, { type: 'game/mortgageProperty', commandId: 'c3', clientSeq: 3, roomId: 'room-2', gameId: 'game-2', playerId: 'p1', propertyId: 'A' }, 4).state;
  state = handleCommand(state, { type: 'game/endTurn', commandId: 'c4', clientSeq: 4, roomId: 'room-2', gameId: 'game-2', playerId: 'p1' }, 5).state;

  const beforeCashP1 = state.game.players.p1.cash;
  const beforeCashP2 = state.game.players.p2.cash;

  const r2 = handleCommand(state, { type: 'game/rollDice', commandId: 'c5', clientSeq: 5, roomId: 'room-2', gameId: 'game-2', playerId: 'p2' }, 6);
  state = r2.state;
  assert.equal(state.game.players.p2.position, 1);
  assert.equal(state.game.players.p2.cash, beforeCashP2);
  assert.equal(state.game.players.p1.cash, beforeCashP1);
});

test('建房：必须均衡建造，且支持升级旅馆', () => {
  const board: BoardConfig = {
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'A', groupId: 'g1', price: 100, houseCost: 50, rents: [10, 50, 150, 450, 625, 750] },
      { kind: 'property', propertyId: 'B', groupId: 'g1', price: 100, houseCost: 50, rents: [10, 50, 150, 450, 625, 750] },
    ],
    jailIndex: 0,
    bankHouses: 32,
    bankHotels: 12,
    startSalary: 0,
  };

  const seed = findSeed3((d1, d2, d3) => d1 % 3 === 1 && d2 % 3 === 0 && d3 % 3 === 1);

  const g0 = createGame({ roomId: 'room-3', gameId: 'game-3', seed, playerIds: ['p1', 'p2'], board, nowMs: 1, initialCash: 1000 });
  let state = g0.state;
  state = handleCommand(state, { type: 'game/rollDice', commandId: 'c1', clientSeq: 1, roomId: 'room-3', gameId: 'game-3', playerId: 'p1' }, 2).state;
  state = handleCommand(state, { type: 'game/buyProperty', commandId: 'c2', clientSeq: 2, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'A' }, 3).state;
  state = handleCommand(state, { type: 'game/endTurn', commandId: 'c3', clientSeq: 3, roomId: 'room-3', gameId: 'game-3', playerId: 'p1' }, 4).state;
  state = handleCommand(state, { type: 'game/rollDice', commandId: 'c4', clientSeq: 4, roomId: 'room-3', gameId: 'game-3', playerId: 'p2' }, 5).state;
  state = handleCommand(state, { type: 'game/endTurn', commandId: 'c5', clientSeq: 5, roomId: 'room-3', gameId: 'game-3', playerId: 'p2' }, 6).state;
  state = handleCommand(state, { type: 'game/rollDice', commandId: 'c6', clientSeq: 6, roomId: 'room-3', gameId: 'game-3', playerId: 'p1' }, 7).state;
  state = handleCommand(state, { type: 'game/buyProperty', commandId: 'c7', clientSeq: 7, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'B' }, 8).state;

  state = handleCommand(state, { type: 'game/build', commandId: 'c8', clientSeq: 8, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'A' }, 9).state;
  assert.throws(() => {
    handleCommand(state, { type: 'game/build', commandId: 'c9', clientSeq: 9, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'A' }, 10);
  });

  state = handleCommand(state, { type: 'game/build', commandId: 'c10', clientSeq: 10, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'B' }, 11).state;

  for (let i = 0; i < 3; i++) {
    state = handleCommand(state, { type: 'game/build', commandId: `cA${i}`, clientSeq: 11 + i * 2, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'A' }, 12 + i * 2).state;
    state = handleCommand(state, { type: 'game/build', commandId: `cB${i}`, clientSeq: 12 + i * 2, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'B' }, 13 + i * 2).state;
  }

  const tileA = state.game.board.tiles[1] as any;
  const tileB = state.game.board.tiles[2] as any;
  assert.equal(tileA.buildings, 4);
  assert.equal(tileB.buildings, 4);

  state = handleCommand(state, { type: 'game/build', commandId: 'cHotelA', clientSeq: 20, roomId: 'room-3', gameId: 'game-3', playerId: 'p1', propertyId: 'A' }, 30).state;
  assert.equal((state.game.board.tiles[1] as any).buildings, 5);
});

test('拍卖：放弃购买会进入拍卖，最高价赢得资产', () => {
  const board: BoardConfig = {
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'A', groupId: 'g1', price: 100, houseCost: 50, rents: [10, 50, 150, 450, 625, 750] },
    ],
    jailIndex: 0,
    startSalary: 0,
  };

  const seed = findSeed((d1) => (d1[0] + d1[1]) % 2 === 1);
  const g0 = createGame({ roomId: 'room-4', gameId: 'game-4', seed, playerIds: ['p1', 'p2'], board, nowMs: 1, initialCash: 500 });
  let state = handleCommand(g0.state, { type: 'game/rollDice', commandId: 'c1', clientSeq: 1, roomId: 'room-4', gameId: 'game-4', playerId: 'p1' }, 2).state;

  const prompt = state.game.pendingPrompt as any;
  assert.equal(prompt.kind, 'buyOrAuction');

  state = handleCommand(state, { type: 'game/respondPrompt', commandId: 'c2', clientSeq: 2, roomId: 'room-4', gameId: 'game-4', playerId: 'p1', promptId: prompt.promptId, choice: { action: 'auction' } }, 3).state;
  assert.ok(state.game.auction);
  assert.equal(state.game.pendingPrompt?.kind, 'auctionBid');

  const p1Prompt = state.game.pendingPrompt as any;
  state = handleCommand(state, { type: 'game/respondPrompt', commandId: 'c3', clientSeq: 3, roomId: 'room-4', gameId: 'game-4', playerId: p1Prompt.playerId, promptId: p1Prompt.promptId, choice: { bid: 10 } }, 4).state;

  const p2Prompt = state.game.pendingPrompt as any;
  state = handleCommand(state, { type: 'game/respondPrompt', commandId: 'c4', clientSeq: 4, roomId: 'room-4', gameId: 'game-4', playerId: p2Prompt.playerId, promptId: p2Prompt.promptId, choice: { pass: true } }, 5).state;
  assert.equal((state.game.board.tiles[1] as any).ownerPlayerId, 'p1');
});

test('破产：无法支付租金时进入债务并可宣布破产清算', () => {
  const board: BoardConfig = {
    tiles: [
      { kind: 'start' },
      { kind: 'property', propertyId: 'A', groupId: 'g1', price: 100, houseCost: 50, rents: [1000, 0, 0, 0, 0, 0] },
    ],
    jailIndex: 0,
    startSalary: 0,
  };

  const seed = findSeed((d1, d2) => (d1[0] + d1[1]) % 2 === 1 && (d2[0] + d2[1]) % 2 === 1);
  const g0 = createGame({ roomId: 'room-5', gameId: 'game-5', seed, playerIds: ['p1', 'p2'], board, nowMs: 1, initialCash: 200 });
  let state = handleCommand(g0.state, { type: 'game/rollDice', commandId: 'c1', clientSeq: 1, roomId: 'room-5', gameId: 'game-5', playerId: 'p1' }, 2).state;
  state = handleCommand(state, { type: 'game/buyProperty', commandId: 'c2', clientSeq: 2, roomId: 'room-5', gameId: 'game-5', playerId: 'p1', propertyId: 'A' }, 3).state;
  state = handleCommand(state, { type: 'game/endTurn', commandId: 'c3', clientSeq: 3, roomId: 'room-5', gameId: 'game-5', playerId: 'p1' }, 4).state;

  const r2 = handleCommand(state, { type: 'game/rollDice', commandId: 'c4', clientSeq: 4, roomId: 'room-5', gameId: 'game-5', playerId: 'p2' }, 5);
  state = r2.state;
  assert.equal(state.game.phase, 'await_debt');
  assert.equal(state.game.debt?.debtorId, 'p2');

  state = handleCommand(state, { type: 'game/declareBankruptcy', commandId: 'c5', clientSeq: 5, roomId: 'room-5', gameId: 'game-5', playerId: 'p2' }, 6).state;
  assert.equal(state.game.players.p2.eliminated, true);
  assert.equal(state.game.status, 'ended');
});
