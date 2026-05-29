import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { ErrorCode } from "@neoblock/shared";

import { startServer, type RunningServer } from "../../src/server.js";
import { WsHarnessClient } from "./ws-harness.js";

describe("e2e: duplicate command idempotency", () => {
  let server: RunningServer;
  const roomCode = "E2E9C";

  before(async () => {
    server = await startServer({
      port: 0,
      boardPreset: "e2e_fast",
      fixedGameSeed: "e2e-dup-seed",
      initialCash: 200,
    });
  });

  after(async () => {
    await server.close();
  });

  it("sending same commandId twice returns DUPLICATE_COMMAND", async () => {
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
      const commandId = "dup-command-id";

      {
        const prev = p1.lastEventSeq;
        p1.sendCommand({
          type: "room/setReady",
          roomId,
          playerId: "u1",
          ready: true,
          commandId,
        });
        await p1.waitForSnapshot({
          predicate: (s) => s.cursor.lastEventSeq > prev,
        });
      }

      p1.sendCommand({
        type: "room/setReady",
        roomId,
        playerId: "u1",
        ready: true,
        commandId,
        clientSeq: 0,
      });
      const err = await p1.waitForError({
        predicate: (e) => e.commandId === commandId,
      });
      assert.equal(err.code, ErrorCode.DUPLICATE_COMMAND);
    } finally {
      p1.disconnect();
      p2.disconnect();
    }
  });
});
