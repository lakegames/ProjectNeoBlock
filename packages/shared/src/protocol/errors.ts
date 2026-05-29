export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  GAME_NOT_FOUND: "GAME_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  GAME_ALREADY_STARTED: "GAME_ALREADY_STARTED",
  GAME_NOT_STARTED: "GAME_NOT_STARTED",
  NOT_HOST: "NOT_HOST",
  NOT_IN_ROOM: "NOT_IN_ROOM",
  NOT_A_PLAYER: "NOT_A_PLAYER",
  NOT_YOUR_TURN: "NOT_YOUR_TURN",
  INVALID_COMMAND: "INVALID_COMMAND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  DUPLICATE_COMMAND: "DUPLICATE_COMMAND",
  OUT_OF_ORDER: "OUT_OF_ORDER",
  VERSION_MISMATCH: "VERSION_MISMATCH",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ProtocolError = {
  code: ErrorCode;
  message: string;
  commandId?: string;
  details?: unknown;
};

export function createProtocolError(input: ProtocolError): ProtocolError {
  return input;
}
