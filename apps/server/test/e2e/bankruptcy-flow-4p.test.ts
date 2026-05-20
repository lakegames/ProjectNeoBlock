import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GameSnapshot, MatchSnapshot } from '@neoblock/shared';

import { startServer, type RunningServer } from '../../src/server.js';
import { WsHarnessClient } from './ws-harness.js';

function snapshotGame(snapshot: MatchSnapshot) {
  const game = snapshot.game;
  if (!game) throw new Error('NO_GAME');
  return game as GameSnapshot;
}

async function stepOnce(input: { clientByPlayerId: Map<string, WsHarnessClient>; snapshot: MatchSnapshot }) {
  const game = snapshotGame(input.snapshot);
  if (game.status === 'ended') return;
  const current = game.currentPlayerId;

  const waitApplied = async (
    sender: WsHarnessClient,
    command: Parameters<WsHarnessClient['sendCommand']>[0],
    observer: WsHarnessClient,
  ) => {
    const prevSeq = observer.lastEventSeq;
    const sent = sender.sendCommand(command as any);
    await Promise.race([
      observer.waitForSnapshot({ predicate: (s) => s.cursor.lastEventSeq > prevSeq }),
      sender
        .waitForError({ predicate: (e) => e.commandId === sent.commandId })
        .then((e) => Promise.reject(new Error(`SERVER_ERROR:${e.code}:${e.message}`))),
    ]);
  };

  if (game.phase === 'await_roll') {
    const client = input.clientByPlayerId.get(current);
    assert.ok(client, `missing client for playerId=${current}`);
    await waitApplied(
      client,
      {
        type: 'game/rollDice',
        roomId: input.snapshot.room.roomId,
        gameId: game.gameId,
        playerId: current,
      },
      input.clientByPlayerId.get('u1')!,
    );
    return;
  }

  if (game.phase === 'await_prompt') {
    const pending = game.engineState.pendingPrompt;
    assert.ok(pending, 'missing pendingPrompt');
    const actor = pending.playerId;
    const client = input.clientByPlayerId.get(actor);
    assert.ok(client, `missing client for playerId=${actor}`);
    if (pending.kind === 'buyOrAuction') {
      await waitApplied(
        client,
        {
          type: 'game/respondPrompt',
          roomId: input.snapshot.room.roomId,
          gameId: game.gameId,
          playerId: actor,
          promptId: pending.promptId,
          choice: { action: 'buy' },
        },
        input.clientByPlayerId.get('u1')!,
      );
      return;
    }
    if (pending.kind === 'auctionBid') {
      await waitApplied(
        client,
        {
          type: 'game/respondPrompt',
          roomId: input.snapshot.room.roomId,
          gameId: game.gameId,
          playerId: actor,
          promptId: pending.promptId,
          choice: { pass: true },
        },
        input.clientByPlayerId.get('u1')!,
      );
      return;
    }
    throw new Error(`UNSUPPORTED_PROMPT:${pending.kind}`);
  }

  if (game.phase === 'await_debt') {
    const client = input.clientByPlayerId.get(current);
    assert.ok(client, `missing client for playerId=${current}`);
    await waitApplied(
      client,
      {
        type: 'game/declareBankruptcy',
        roomId: input.snapshot.room.roomId,
        gameId: game.gameId,
        playerId: current,
      },
      input.clientByPlayerId.get('u1')!,
    );
    return;
  }

  if (game.phase === 'await_end_turn') {
    const client = input.clientByPlayerId.get(current);
    assert.ok(client, `missing client for playerId=${current}`);
    await waitApplied(
      client,
      {
        type: 'game/endTurn',
        roomId: input.snapshot.room.roomId,
        gameId: game.gameId,
        playerId: current,
      },
      input.clientByPlayerId.get('u1')!,
    );
    return;
  }

  throw new Error(`UNSUPPORTED_PHASE:${game.phase}`);
}

describe('e2e: bankruptcy settlement flow (4 players)', () => {
  let server: RunningServer;
  const roomCode = 'E2E9F';

  before(async () => {
    server = await startServer({
      port: 0,
      boardPreset: 'e2e_fast',
      fixedGameSeed: 'e2e-fast-4p-seed',
      reconnectWindowMs: 2_000,
      maxEvents: 3_000,
      initialCash: 200,
    });
  });

  after(async () => {
    await server.close();
  });

  it('4 players play until game ended (at least 1 eliminated)', async () => {
    const url = `ws://localhost:${server.port}/ws`;

    const p1 = new WsHarnessClient({ url, roomCode, userId: 'u1', displayName: 'P1', mode: 'player' });
    const p2 = new WsHarnessClient({ url, roomCode, userId: 'u2', displayName: 'P2', mode: 'player' });
    const p3 = new WsHarnessClient({ url, roomCode, userId: 'u3', displayName: 'P3', mode: 'player' });
    const p4 = new WsHarnessClient({ url, roomCode, userId: 'u4', displayName: 'P4', mode: 'player' });

    const cleanup: (() => void)[] = [];
    try {
      await p1.connect();
      cleanup.push(() => p1.disconnect());
      await p2.connect();
      cleanup.push(() => p2.disconnect());
      await p3.connect();
      cleanup.push(() => p3.disconnect());
      await p4.connect();
      cleanup.push(() => p4.disconnect());

      const roomId = p1.lastSnapshot!.room.roomId;

      for (const playerId of ['u1', 'u2', 'u3', 'u4'] as const) {
        const c = { u1: p1, u2: p2, u3: p3, u4: p4 }[playerId];
        const prev = c.lastEventSeq;
        c.sendCommand({ type: 'room/setReady', roomId, playerId, ready: true });
        await c.waitForSnapshot({ predicate: (s) => s.cursor.lastEventSeq > prev });
      }

      {
        const c = p1.sendCommand({ type: 'room/startGame', roomId, playerId: 'u1' });
        await Promise.race([
          p1.waitForSnapshot({ predicate: (s) => s.room.status === 'playing' && s.game !== null }),
          p1.waitForError({ predicate: (e) => e.commandId === c.commandId }).then((e) => Promise.reject(new Error(e.code))),
        ]);
      }

      const clientByPlayerId = new Map<string, WsHarnessClient>([
        ['u1', p1],
        ['u2', p2],
        ['u3', p3],
        ['u4', p4],
      ]);

      let snapshot: MatchSnapshot = p1.lastSnapshot!;
      for (let i = 0; i < 300; i++) {
        await stepOnce({ clientByPlayerId, snapshot });
        snapshot = p1.lastSnapshot!;
        const g = snapshotGame(snapshot);
        if (g.status === 'ended') break;
      }

      const final = p1.lastSnapshot!;
      const game = snapshotGame(final);
      assert.equal(game.status, 'ended');
      const eliminated = game.players.filter((p) => p.eliminated);
      assert.ok(eliminated.length >= 1);
    } finally {
      for (const fn of cleanup.reverse()) fn();
    }
  });
});
