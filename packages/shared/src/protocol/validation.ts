import { ErrorCode, createProtocolError } from "./errors.js";
import type { Command } from "./command.js";
import type { Event } from "./event.js";
import type { ClientMessage, ServerMessage } from "./message.js";
import type { MatchSnapshot } from "./snapshot.js";

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(issues: ValidationIssue[]): ValidationResult<T> {
  return { ok: false, issues };
}

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function hasLiteral<T extends string | number | boolean | null>(
  value: unknown,
  expected: T,
): value is T {
  return value === expected;
}

function validateCommandId(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is string {
  if (!isString(value) || value.length === 0) {
    issues.push(issue(path, "commandId 必须为非空字符串"));
    return false;
  }
  return true;
}

function validateClientSeq(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is number {
  if (!isNumber(value) || value < 0) {
    issues.push(issue(path, "clientSeq 必须为非负数"));
    return false;
  }
  return true;
}

export function validateCommand(input: unknown): ValidationResult<Command> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return fail([issue("", "command 必须为对象")]);

  const type = input.type;
  if (!isString(type)) issues.push(issue("type", "type 必须为字符串"));
  validateCommandId(input.commandId, "commandId", issues);
  validateClientSeq(input.clientSeq, "clientSeq", issues);

  if (!isString(type) || issues.length > 0) return fail(issues);

  const baseOk = issues.length === 0;
  if (!baseOk) return fail(issues);

  const requireString = (key: string) => {
    const v = input[key];
    if (!isString(v) || v.length === 0)
      issues.push(issue(key, `${key} 必须为非空字符串`));
    return v;
  };

  const requireBoolean = (key: string) => {
    const v = input[key];
    if (!isBoolean(v)) issues.push(issue(key, `${key} 必须为 boolean`));
    return v;
  };

  const requireUnknown = (key: string) => input[key];

  switch (type) {
    case "room/join": {
      requireString("roomCode");
      const userId = input.userId;
      if (!(userId === undefined || (isString(userId) && userId.length > 0)))
        issues.push(issue("userId", "userId 必须为非空字符串"));
      requireString("displayName");
      const mode = input.mode;
      if (mode !== "player" && mode !== "spectator")
        issues.push(issue("mode", "mode 必须为 player 或 spectator"));
      const resume = input.resumeFromSeqExclusive;
      if (!(resume === undefined || (isNumber(resume) && resume >= 0)))
        issues.push(
          issue(
            "resumeFromSeqExclusive",
            "resumeFromSeqExclusive 必须为非负数",
          ),
        );
      break;
    }
    case "room/leave": {
      requireString("roomId");
      break;
    }
    case "room/setReady": {
      requireString("roomId");
      requireString("playerId");
      requireBoolean("ready");
      break;
    }
    case "room/sendChat": {
      requireString("roomId");
      requireString("playerId");
      const text = input.text;
      if (!isString(text) || text.length === 0)
        issues.push(issue("text", "text 必须为非空字符串"));
      else if (text.length > 400)
        issues.push(issue("text", "text 最大长度为 400"));
      const toPlayerId = input.toPlayerId;
      if (
        !(
          toPlayerId === undefined ||
          (isString(toPlayerId) && toPlayerId.length > 0)
        )
      )
        issues.push(issue("toPlayerId", "toPlayerId 必须为非空字符串"));
      break;
    }
    case "room/startGame": {
      requireString("roomId");
      requireString("playerId");
      break;
    }
    case "room/setConfig": {
      requireString("roomId");
      requireString("playerId");
      const config = input.config;
      if (!isRecord(config)) {
        issues.push(issue("config", "config 必须为对象"));
        break;
      }
      const maxPlayers = config.maxPlayers;
      if (
        !(
          maxPlayers === undefined ||
          (isNumber(maxPlayers) && maxPlayers >= 2 && maxPlayers <= 16)
        )
      ) {
        issues.push(
          issue("config.maxPlayers", "maxPlayers 必须为 2-16 的整数"),
        );
      }
      const boardPreset = config.boardPreset;
      if (
        !(
          boardPreset === undefined ||
          boardPreset === "default" ||
          boardPreset === "full" ||
          boardPreset === "e2e_fast"
        )
      ) {
        issues.push(
          issue(
            "config.boardPreset",
            "boardPreset 必须为 default/full/e2e_fast",
          ),
        );
      }
      break;
    }
    case "game/rollDice": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      break;
    }
    case "game/buyProperty": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("propertyId");
      break;
    }
    case "game/endTurn": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      break;
    }
    case "game/respondPrompt": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("promptId");
      requireUnknown("choice");
      break;
    }
    case "game/payJailFine": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      break;
    }
    case "game/useGetOutOfJailCard": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      const deck = input.deck;
      if (deck !== "chance" && deck !== "communityChest")
        issues.push(issue("deck", "deck 必须为 chance 或 communityChest"));
      break;
    }
    case "game/mortgageProperty": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("propertyId");
      break;
    }
    case "game/redeemProperty": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("propertyId");
      break;
    }
    case "game/build": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("propertyId");
      break;
    }
    case "game/sellBuilding": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("propertyId");
      break;
    }
    case "game/proposeTrade": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("toPlayerId");
      requireUnknown("offer");
      requireUnknown("request");
      break;
    }
    case "game/respondTrade": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireBoolean("accept");
      break;
    }
    case "game/declareBankruptcy": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      break;
    }
    case "game/forfeit": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      break;
    }
    case "debug/addCash": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("targetPlayerId");
      const delta = input.delta;
      if (!isNumber(delta)) issues.push(issue("delta", "delta 必须为 number"));
      break;
    }
    case "debug/assignProperty": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("propertyId");
      const owner = input.ownerPlayerId;
      if (!(owner === null || (isString(owner) && owner.length > 0)))
        issues.push(
          issue("ownerPlayerId", "ownerPlayerId 必须为 playerId 字符串或 null"),
        );
      break;
    }
    case "debug/setBuildings": {
      requireString("roomId");
      requireString("gameId");
      requireString("playerId");
      requireString("propertyId");
      const buildings = input.buildings;
      if (!isNumber(buildings))
        issues.push(issue("buildings", "buildings 必须为 number"));
      break;
    }
    default:
      issues.push(issue("type", `未知 command type: ${type}`));
  }

  if (issues.length > 0) return fail(issues);
  return ok(input as Command);
}

export function validateEvent(input: unknown): ValidationResult<Event> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return fail([issue("", "event 必须为对象")]);
  if (!isString(input.type)) issues.push(issue("type", "type 必须为字符串"));
  if (!isString(input.eventId) || input.eventId.length === 0)
    issues.push(issue("eventId", "eventId 必须为非空字符串"));
  if (!isNumber(input.seq) || input.seq < 0)
    issues.push(issue("seq", "seq 必须为非负数"));
  if (!isString(input.roomId) || input.roomId.length === 0)
    issues.push(issue("roomId", "roomId 必须为非空字符串"));
  if (!isNumber(input.createdAtMs) || input.createdAtMs <= 0)
    issues.push(issue("createdAtMs", "createdAtMs 必须为正数"));
  if (issues.length > 0) return fail(issues);
  return ok(input as Event);
}

export function validateMatchSnapshot(
  input: unknown,
): ValidationResult<MatchSnapshot> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return fail([issue("", "snapshot 必须为对象")]);
  if (!hasLiteral(input.protocolVersion, 1))
    issues.push(issue("protocolVersion", "protocolVersion 必须为 1"));
  if (!isNumber(input.serverTimeMs) || input.serverTimeMs <= 0)
    issues.push(issue("serverTimeMs", "serverTimeMs 必须为正数"));
  if (!isRecord(input.room)) issues.push(issue("room", "room 必须为对象"));
  if (!(input.game === null || isRecord(input.game)))
    issues.push(issue("game", "game 必须为对象或 null"));
  if (
    !isRecord(input.cursor) ||
    !isNumber(input.cursor.lastEventSeq) ||
    input.cursor.lastEventSeq < 0
  ) {
    issues.push(
      issue("cursor.lastEventSeq", "cursor.lastEventSeq 必须为非负数"),
    );
  }
  if (issues.length > 0) return fail(issues);
  return ok(input as MatchSnapshot);
}

export function validateClientMessage(
  input: unknown,
): ValidationResult<ClientMessage> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) return fail([issue("", "message 必须为对象")]);

  if (input.kind === "command") {
    const r = validateCommand(input.command);
    if (!r.ok)
      return fail(
        r.issues.map((i) => ({
          path: i.path ? `command.${i.path}` : "command",
          message: i.message,
        })),
      );
    return ok({ kind: "command", command: r.value });
  }

  if (input.kind === "ping") {
    if (!isNumber(input.clientTimeMs) || input.clientTimeMs <= 0)
      issues.push(issue("clientTimeMs", "clientTimeMs 必须为正数"));
    if (issues.length > 0) return fail(issues);
    return ok({ kind: "ping", clientTimeMs: input.clientTimeMs as number });
  }

  return fail([issue("kind", "kind 必须为 command 或 ping")]);
}

export function validateServerMessage(
  input: unknown,
): ValidationResult<ServerMessage> {
  if (!isRecord(input)) return fail([issue("", "message 必须为对象")]);

  if (input.kind === "snapshot") {
    const r = validateMatchSnapshot(input.snapshot);
    if (!r.ok)
      return fail(
        r.issues.map((i) => ({
          path: i.path ? `snapshot.${i.path}` : "snapshot",
          message: i.message,
        })),
      );
    return ok({ kind: "snapshot", snapshot: r.value });
  }

  if (input.kind === "events") {
    const issues: ValidationIssue[] = [];
    if (!isString(input.roomId) || input.roomId.length === 0)
      issues.push(issue("roomId", "roomId 必须为非空字符串"));
    if (!(input.gameId === null || isString(input.gameId)))
      issues.push(issue("gameId", "gameId 必须为字符串或 null"));
    if (!isNumber(input.fromSeqExclusive) || input.fromSeqExclusive < 0)
      issues.push(issue("fromSeqExclusive", "fromSeqExclusive 必须为非负数"));
    if (!isArray(input.events))
      issues.push(issue("events", "events 必须为数组"));
    if (issues.length > 0) return fail(issues);
    return ok(input as ServerMessage);
  }

  if (input.kind === "error") {
    const issues: ValidationIssue[] = [];
    if (!isRecord(input.error))
      return fail([issue("error", "error 必须为对象")]);
    if (!isString(input.error.code))
      issues.push(issue("error.code", "error.code 必须为字符串"));
    if (!isString(input.error.message))
      issues.push(issue("error.message", "error.message 必须为字符串"));
    if (issues.length > 0) return fail(issues);
    return ok(input as ServerMessage);
  }

  if (input.kind === "pong") {
    const issues: ValidationIssue[] = [];
    if (!isNumber(input.serverTimeMs) || input.serverTimeMs <= 0)
      issues.push(issue("serverTimeMs", "serverTimeMs 必须为正数"));
    if (issues.length > 0) return fail(issues);
    return ok({ kind: "pong", serverTimeMs: input.serverTimeMs as number });
  }

  return fail([issue("kind", "kind 必须为 snapshot/events/error/pong")]);
}

export function issuesToProtocolError(issues: ValidationIssue[]) {
  return createProtocolError({
    code: ErrorCode.VALIDATION_FAILED,
    message: "协议校验失败",
    details: { issues },
  });
}
