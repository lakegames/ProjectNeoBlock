import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { startServer, type RunningServer } from "../../src/server.js";
import { WsHarnessClient } from "./ws-harness.js";

describe("e2e: reconnect resume", () => {
  let server: RunningServer;
  const roomCode = "E2E9B";

  before(async () => {
    server = await startServer({
      port: 0,
      boardPreset: "e2e_fast",
      fixedGameSeed: "e2e-reconnect-seed",
      reconnectWindowMs: 5_000,
      maxEvents: 1_000,
      initialCash: 200,
    });
  });

  after(async () => {
    await server.close();
  });

  it("disconnect then reconnect with resumeFromSeqExclusive receives missed events", async () => {
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

    const cleanup: (() => void)[] = [];
    try {
      await p1.connect();
      cleanup.push(() => p1.disconnect());
      await p2.connect();
      cleanup.push(() => p2.disconnect());

      const roomId = p1.lastSnapshot!.room.roomId;
      {
        const prev = p1.lastEventSeq;
        p1.sendCommand({
          type: "room/setReady",
          roomId,
          playerId: "u1",
          ready: true,
        });
        await p1.waitForSnapshot({
          predicate: (s) => s.cursor.lastEventSeq > prev,
        });
      }
      {
        const prev = p2.lastEventSeq;
        p2.sendCommand({
          type: "room/setReady",
          roomId,
          playerId: "u2",
          ready: true,
        });
        await p2.waitForSnapshot({
          predicate: (s) => s.cursor.lastEventSeq > prev,
        });
      }
      {
        p1.sendCommand({ type: "room/startGame", roomId, playerId: "u1" });
        await p1.waitForSnapshot({
          predicate: (s) => s.room.status === "playing",
        });
      }

      const seqBefore = p1.lastSnapshot!.cursor.lastEventSeq;
      const p2NextSeq = p2.clientSeq;

      p2.disconnect();

      const game = p1.lastSnapshot!.game!;
      const current = game.currentPlayerId;
      p1.sendCommand({
        type: "game/rollDice",
        roomId,
        gameId: game.gameId,
        playerId: current,
      });
      await p1.waitForSnapshot({
        predicate: (s) => s.cursor.lastEventSeq > seqBefore,
      });
      const seqAfter = p1.lastSnapshot!.cursor.lastEventSeq;
      assert.ok(seqAfter > seqBefore);

      const p2r = new WsHarnessClient({
        url,
        roomCode,
        userId: "u2",
        displayName: "P2",
        mode: "player",
        nextClientSeq: p2NextSeq,
      });
      cleanup.push(() => p2r.disconnect());

      const eventsMsg = p2r.waitForMessage(
        (m) => m.kind === "events" && m.fromSeqExclusive >= seqBefore,
        5_000,
      );
      await p2r.connect({ resumeFromSeqExclusive: seqBefore });
      const events = await eventsMsg;

      assert.equal(events.kind, "events");
      assert.ok(events.events.some((e) => e.seq > seqBefore));
    } finally {
      for (const fn of cleanup.reverse()) fn();
    }
  });
});
