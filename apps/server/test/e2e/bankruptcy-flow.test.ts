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
  const client = input.clientByPlayerId.get(current);
  assert.ok(client, `missing client for playerId=${current}`);

  const waitApplied = async (command: Parameters<WsHarnessClient['sendCommand']>[0], observer: WsHarnessClient) => {
    const prevSeq = observer.lastEventSeq;
    const sent = client.sendCommand(command as any);
    await Promise.race([
      observer.waitForSnapshot({ predicate: (s) => s.cursor.lastEventSeq > prevSeq }),
      client
        .waitForError({ predicate: (e) => e.commandId === sent.commandId })
        .then((e) => Promise.reject(new Error(`SERVER_ERROR:${e.code}`))),
    ]);
  };

  if (game.phase === 'await_roll') {
    await waitApplied(
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
    if (pending.kind === 'buyOrAuction') {
      await waitApplied(
        {
          type: 'game/respondPrompt',
          roomId: input.snapshot.room.roomId,
          gameId: game.gameId,
          playerId: current,
          promptId: pending.promptId,
          choice: { action: 'buy' },
        },
        input.clientByPlayerId.get('u1')!,
      );
      return;
    }
    if (pending.kind === 'auctionBid') {
      await waitApplied(
        {
          type: 'game/respondPrompt',
          roomId: input.snapshot.room.roomId,
          gameId: game.gameId,
          playerId: current,
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
    await waitApplied(
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
    await waitApplied(
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

describe('e2e: bankruptcy settlement flow', () => {
  let server: RunningServer;
  const roomCode = 'E2E9A';

  before(async () => {
    server = await startServer({
      port: 0,
      boardPreset: 'e2e_fast',
      fixedGameSeed: 'e2e-fast-seed',
      reconnectWindowMs: 2_000,
      maxEvents: 1_000,
      initialCash: 200,
    });
  });

  after(async () => {
    await server.close();
  });

  it('2 players play until debt -> declareBankruptcy -> game ended', async () => {
    const url = `ws://localhost:${server.port}/ws`;

    const p1 = new WsHarnessClient({ url, roomCode, userId: 'u1', displayName: 'P1', mode: 'player' });
    const p2 = new WsHarnessClient({ url, roomCode, userId: 'u2', displayName: 'P2', mode: 'player' });

    try {
      await p1.connect();
      await p2.connect();

      const roomId = p1.lastSnapshot!.room.roomId;

      {
        const prev = p1.lastEventSeq;
        const c = p1.sendCommand({ type: 'room/setReady', roomId, playerId: 'u1', ready: true });
        await Promise.race([
          p1.waitForSnapshot({ predicate: (s) => s.cursor.lastEventSeq > prev }),
          p1.waitForError({ predicate: (e) => e.commandId === c.commandId }).then((e) => Promise.reject(new Error(e.code))),
        ]);
      }
      {
        const prev = p2.lastEventSeq;
        const c = p2.sendCommand({ type: 'room/setReady', roomId, playerId: 'u2', ready: true });
        await Promise.race([
          p2.waitForSnapshot({ predicate: (s) => s.cursor.lastEventSeq > prev }),
          p2.waitForError({ predicate: (e) => e.commandId === c.commandId }).then((e) => Promise.reject(new Error(e.code))),
        ]);
      }

      {
        const c = p1.sendCommand({ type: 'room/startGame', roomId, playerId: 'u1' });
        await Promise.race([
          p1.waitForSnapshot({ predicate: (s) => s.room.status === 'playing' && s.game !== null }),
          p1.waitForError({ predicate: (e) => e.commandId === c.commandId }).then((e) => Promise.reject(new Error(e.code))),
        ]);
      }
      const started = p1.lastSnapshot!;

      const clientByPlayerId = new Map<string, WsHarnessClient>([
        ['u1', p1],
        ['u2', p2],
      ]);

      let snapshot: MatchSnapshot = started;
      for (let i = 0; i < 100; i++) {
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
      p1.disconnect();
      p2.disconnect();
    }
  });
});
