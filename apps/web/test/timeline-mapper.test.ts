import test from 'node:test';
import assert from 'node:assert/strict';

import type { Event } from '@neoblock/shared';

import {
  eventToTimelineEntry,
  eventsToTimelineEntries,
  humanizeMoneyReason,
  type BoardLike,
} from '../app/room/[code]/timeline-mapper';

const board: BoardLike = {
  tiles: [
    { kind: 'start' },
    { kind: 'property', propertyId: 'p1', name: '旧金山' },
    { kind: 'tax', amount: 200 },
    { kind: 'jail' },
  ],
  cards: [{ cardId: 'c1', text: '获得 200' }],
};

const members = [
  { playerId: 'pA', displayName: 'Alice' },
  { playerId: 'pB', displayName: 'Bob' },
];

test('eventToTimelineEntry: move', () => {
  const e = {
    eventId: 'e1',
    seq: 1,
    roomId: 'r1',
    createdAtMs: 1,
    type: 'game/playerMoved',
    gameId: 'g1',
    playerId: 'pA',
    from: 0,
    to: 1,
  } satisfies Event;

  const entry = eventToTimelineEntry({ event: e, members, board });
  assert.ok(entry);
  assert.equal(entry.kind, 'move');
  assert.equal(entry.to, 1);
  assert.match(entry.subtitle, /旧金山/);
});

test('eventToTimelineEntry: moneyChanged reason buy', () => {
  const e = {
    eventId: 'e2',
    seq: 2,
    roomId: 'r1',
    createdAtMs: 2,
    type: 'game/moneyChanged',
    gameId: 'g1',
    playerId: 'pA',
    delta: -60,
    reason: 'buy:p1',
  } satisfies Event;

  const entry = eventToTimelineEntry({ event: e, members, board });
  assert.ok(entry);
  assert.equal(entry.kind, 'charge');
  assert.equal(entry.delta, -60);
  assert.equal(entry.reasonLabel, '购买地产：旧金山');
});

test('humanizeMoneyReason: fallback', () => {
  const label = humanizeMoneyReason({
    reason: 'unknown:xxx',
    delta: -1,
    propertyLabel: () => 'X',
    tileLabel: () => null,
    cardTextById: () => null,
  });
  assert.equal(label, '资金变化（unknown:xxx）');
});

test('eventToTimelineEntry: engine property/bought', () => {
  const e = {
    eventId: 'e3',
    seq: 3,
    roomId: 'r1',
    createdAtMs: 3,
    type: 'game/engine',
    gameId: 'g1',
    name: 'property/bought',
    data: { playerId: 'pB', propertyId: 'p1', price: 120 },
  } satisfies Event;

  const entry = eventToTimelineEntry({ event: e, members, board });
  assert.ok(entry);
  assert.equal(entry.kind, 'purchase');
  assert.match(entry.subtitle, /旧金山/);
  assert.match(entry.subtitle, /¥120/);
});

test('eventsToTimelineEntries: dedupe buy (prefer purchase)', () => {
  const events = [
    {
      eventId: 'e1',
      seq: 1,
      roomId: 'r1',
      createdAtMs: 1,
      causedBy: { commandId: 'c1', playerId: 'pA' },
      type: 'game/engine',
      gameId: 'g1',
      name: 'property/bought',
      data: { playerId: 'pA', propertyId: 'p1', price: 60 },
    },
    {
      eventId: 'e2',
      seq: 2,
      roomId: 'r1',
      createdAtMs: 1,
      causedBy: { commandId: 'c1', playerId: 'pA' },
      type: 'game/moneyChanged',
      gameId: 'g1',
      playerId: 'pA',
      delta: -60,
      reason: 'buy:p1',
    },
  ] satisfies Event[];

  const entries = eventsToTimelineEntries({ events, members, board });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, 'purchase');
});

test('eventsToTimelineEntries: dedupe even if charge comes first', () => {
  const events = [
    {
      eventId: 'e2',
      seq: 2,
      roomId: 'r1',
      createdAtMs: 1,
      causedBy: { commandId: 'c1', playerId: 'pA' },
      type: 'game/moneyChanged',
      gameId: 'g1',
      playerId: 'pA',
      delta: -60,
      reason: 'buy:p1',
    },
    {
      eventId: 'e1',
      seq: 1,
      roomId: 'r1',
      createdAtMs: 1,
      causedBy: { commandId: 'c1', playerId: 'pA' },
      type: 'game/engine',
      gameId: 'g1',
      name: 'property/bought',
      data: { playerId: 'pA', propertyId: 'p1', price: 60 },
    },
  ] satisfies Event[];

  const entries = eventsToTimelineEntries({ events, members, board });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, 'purchase');
});

test('eventsToTimelineEntries: dedupe auction (prefer purchase)', () => {
  const events = [
    {
      eventId: 'e1',
      seq: 1,
      roomId: 'r1',
      createdAtMs: 1,
      causedBy: { commandId: 'c2', playerId: 'pB' },
      type: 'game/engine',
      gameId: 'g1',
      name: 'property/bought',
      data: { playerId: 'pB', propertyId: 'p1', price: 200 },
    },
    {
      eventId: 'e2',
      seq: 2,
      roomId: 'r1',
      createdAtMs: 1,
      causedBy: { commandId: 'c2', playerId: 'pB' },
      type: 'game/moneyChanged',
      gameId: 'g1',
      playerId: 'pB',
      delta: -200,
      reason: 'auction:p1',
    },
  ] satisfies Event[];

  const entries = eventsToTimelineEntries({ events, members, board });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, 'purchase');
});

test('eventsToTimelineEntries: keep buy charge when purchase event missing', () => {
  const events = [
    {
      eventId: 'e1',
      seq: 1,
      roomId: 'r1',
      createdAtMs: 1,
      type: 'game/moneyChanged',
      gameId: 'g1',
      playerId: 'pA',
      delta: -60,
      reason: 'buy:p1',
    },
  ] satisfies Event[];

  const entries = eventsToTimelineEntries({ events, members, board });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, 'charge');
});
