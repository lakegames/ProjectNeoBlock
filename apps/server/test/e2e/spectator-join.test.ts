import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { ErrorCode } from "@neoblock/shared";

import { startServer, type RunningServer } from "../../src/server.js";
import { WsHarnessClient } from "./ws-harness.js";

describe("e2e: spectator join mid-game", () => {
  let server: RunningServer;
  const roomCode = "E2E9D";

  before(async () => {
    server = await startServer({
      port: 0,
      boardPreset: "e2e_fast",
      fixedGameSeed: "e2e-spectator-seed",
      initialCash: 200,
    });
  });

  after(async () => {
    await server.close();
  });

  it("spectator can join and receives snapshot; cannot issue game commands", async () => {
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
    const spectator = new WsHarnessClient({
      url,
      roomCode,
      userId: "s1",
      displayName: "S1",
      mode: "spectator",
    });

    try {
      await p1.connect();
      await p2.connect();

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

      await spectator.connect();

      const snapshot = spectator.lastSnapshot!;
      assert.equal(snapshot.room.status, "playing");
      const member = snapshot.room.members.find((m) => m.playerId === "s1");
      assert.ok(member);
      assert.equal(member.isSpectator, true);

      spectator.sendCommand({
        type: "game/rollDice",
        roomId,
        gameId: snapshot.game!.gameId,
        playerId: "s1",
      });
      const err = await spectator.waitForError();
      assert.equal(err.code, ErrorCode.NOT_A_PLAYER);
    } finally {
      p1.disconnect();
      p2.disconnect();
      spectator.disconnect();
    }
  });
});
