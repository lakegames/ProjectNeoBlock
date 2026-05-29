import type { Command } from "./command.js";
import type { Event } from "./event.js";
import type { ProtocolError } from "./errors.js";
import type { MatchSnapshot } from "./snapshot.js";
import type { EventSeq, GameId, RoomId } from "./ids.js";

export type ClientMessage =
  | {
      kind: "command";
      command: Command;
    }
  | {
      kind: "ping";
      clientTimeMs: number;
    };

export type ServerMessage =
  | {
      kind: "snapshot";
      snapshot: MatchSnapshot;
    }
  | {
      kind: "events";
      roomId: RoomId;
      gameId: GameId | null;
      fromSeqExclusive: EventSeq;
      events: Event[];
    }
  | {
      kind: "error";
      error: ProtocolError;
    }
  | {
      kind: "pong";
      serverTimeMs: number;
    };
