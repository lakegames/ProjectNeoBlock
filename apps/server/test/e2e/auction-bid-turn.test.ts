import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GameSnapshot, MatchSnapshot } from "@neoblock/shared";

import { startServer, type RunningServer } from "../../src/server.js";
import { WsHarnessClient } from "./ws-harness.js";

function snapshotGame(snapshot: MatchSnapshot) {
  const game = snapshot.game;
  if (!game) throw new Error("NO_GAME");
  return game as GameSnapshot;
}

async function waitApplied(input: {
  client: WsHarnessClient;
  command: Parameters<WsHarnessClient["sendCommand"]>[0];
  observer: WsHarnessClient;
}) {
  const prevSeq = input.observer.lastEventSeq;
  const sent = input.client.sendCommand(input.command as any);
  await Promise.race([
    input.observer.waitForSnapshot({
      predicate: (s) => s.cursor.lastEventSeq > prevSeq,
    }),
    input.client
      .waitForError({ predicate: (e) => e.commandId === sent.commandId })
      .then((e) =>
        Promise.reject(new Error(`SERVER_ERROR:${e.code}:${e.message}`)),
      ),
  ]);
}

describe("e2e: auction bid rotation", () => {
  let server: RunningServer;
  const roomCode = "E2EAU";

  before(async () => {
    server = await startServer({
      port: 0,
      boardPreset: "e2e_fast",
      fixedGameSeed: "e2e-auction-seed",
      reconnectWindowMs: 2_000,
      maxEvents: 1_000,
      initialCash: 200,
    });
  });

  after(async () => {
    await server.close();
  });

  it("second bidder can bid and prompt rotates correctly", async () => {
    const url = `ws://localhost:${server.port}/ws`;

    const p1 = new WsHarnessClient({
      url,
      roomCode,
      userId: "u1",
      displayName: "P1",
      mode: "player",
    });
    const p2 = new WsHarnessClient({
      url,
      roomCode,
      userId: "u2",
      displayName: "P2",
      mode: "player",
    });

    try {
      await p1.connect();
      await p2.connect();

      const roomId = p1.lastSnapshot!.room.roomId;

      await waitApplied({
        client: p1,
        observer: p1,
        command: { type: "room/setReady", roomId, playerId: "u1", ready: true },
      });
      await waitApplied({
        client: p2,
        observer: p1,
        command: { type: "room/setReady", roomId, playerId: "u2", ready: true },
      });
      await waitApplied({
        client: p1,
        observer: p1,
        command: { type: "room/startGame", roomId, playerId: "u1" },
      });

      let snapshot = p1.lastSnapshot!;
      let auctionStarter: string | null = null;
      for (let i = 0; i < 20; i++) {
        const game = snapshotGame(snapshot);
        if (
          game.phase === "await_prompt" &&
          game.engineState.pendingPrompt?.kind === "buyOrAuction"
        )
          break;
        if (game.phase === "await_roll") {
          const current = game.currentPlayerId;
          const client = current === "u1" ? p1 : p2;
          await waitApplied({
            client,
            observer: p1,
            command: {
              type: "game/rollDice",
              roomId,
              gameId: game.gameId,
              playerId: current,
            },
          });
        } else if (game.phase === "await_end_turn") {
          const current = game.currentPlayerId;
          const client = current === "u1" ? p1 : p2;
          await waitApplied({
            client,
            observer: p1,
            command: {
              type: "game/endTurn",
              roomId,
              gameId: game.gameId,
              playerId: current,
            },
          });
        } else {
          throw new Error(`UNEXPECTED_PHASE:${game.phase}`);
        }
        snapshot = p1.lastSnapshot!;
      }

      {
        const game = snapshotGame(p1.lastSnapshot!);
        assert.equal(game.phase, "await_prompt");
        const pending = game.engineState.pendingPrompt;
        assert.ok(pending && pending.kind === "buyOrAuction");
        auctionStarter = pending.playerId;
        await waitApplied({
          client: pending.playerId === "u1" ? p1 : p2,
          observer: p1,
          command: {
            type: "game/respondPrompt",
            roomId,
            gameId: game.gameId,
            playerId: pending.playerId,
            promptId: pending.promptId,
            choice: { action: "auction" },
          },
        });
      }

      {
        const game = snapshotGame(p1.lastSnapshot!);
        assert.equal(game.phase, "await_prompt");
        const pending = game.engineState.pendingPrompt;
        assert.ok(pending && pending.kind === "auctionBid");
        assert.ok(auctionStarter, "missing auctionStarter");
        assert.equal(pending.playerId, auctionStarter);
        await waitApplied({
          client: pending.playerId === "u1" ? p1 : p2,
          observer: p1,
          command: {
            type: "game/respondPrompt",
            roomId,
            gameId: game.gameId,
            playerId: pending.playerId,
            promptId: pending.promptId,
            choice: { bid: pending.minBid },
          },
        });
      }

      {
        const game = snapshotGame(p1.lastSnapshot!);
        assert.equal(game.phase, "await_prompt");
        const pending = game.engineState.pendingPrompt;
        assert.ok(pending && pending.kind === "auctionBid");
        assert.ok(auctionStarter, "missing auctionStarter");
        const expectedSecond = auctionStarter === "u1" ? "u2" : "u1";
        assert.equal(pending.playerId, expectedSecond);
        await waitApplied({
          client: pending.playerId === "u1" ? p1 : p2,
          observer: p1,
          command: {
            type: "game/respondPrompt",
            roomId,
            gameId: game.gameId,
            playerId: pending.playerId,
            promptId: pending.promptId,
            choice: { bid: pending.minBid },
          },
        });
      }

      {
        const game = snapshotGame(p1.lastSnapshot!);
        assert.equal(game.phase, "await_prompt");
        const pending = game.engineState.pendingPrompt;
        assert.ok(pending && pending.kind === "auctionBid");
        assert.equal(pending.highestBid >= 2, true);
      }
    } finally {
      p1.disconnect();
      p2.disconnect();
    }
  });
});
