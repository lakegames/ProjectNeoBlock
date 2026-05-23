import type { CommandId, EventId, EventSeq, GameId, PlayerId, RoomId } from './ids.js';

export type EventBase = {
  eventId: EventId;
  seq: EventSeq;
  roomId: RoomId;
  createdAtMs: number;
  causedBy?: {
    commandId?: CommandId;
    playerId?: PlayerId;
  };
};

export type PlayerJoinedEvent = EventBase & {
  type: 'room/playerJoined';
  player: {
    playerId: PlayerId;
    displayName: string;
    isSpectator: boolean;
    connected: boolean;
    joinedAtMs: number;
  };
};

export type PlayerConnectionChangedEvent = EventBase & {
  type: 'room/playerConnectionChanged';
  playerId: PlayerId;
  connected: boolean;
};

export type PlayerLeftEvent = EventBase & {
  type: 'room/playerLeft';
  playerId: PlayerId;
};

export type PlayerReadyChangedEvent = EventBase & {
  type: 'room/playerReadyChanged';
  playerId: PlayerId;
  ready: boolean;
};

export type ChatMessageEvent = EventBase & {
  type: 'room/chatMessage';
  fromPlayerId: PlayerId;
  text: string;
  toPlayerId?: PlayerId;
};

export type RoomConfigChangedEvent = EventBase & {
  type: 'room/configChanged';
  config: {
    maxPlayers: number;
    boardPreset?: 'default' | 'full' | 'e2e_fast';
    turnTimeMs?: number;
    rulesetVersionId?: string;
    boardVersionId?: string;
  };
};

export type GameStartedEvent = EventBase & {
  type: 'room/gameStarted';
  gameId: GameId;
};

export type TurnStartedEvent = EventBase & {
  type: 'game/turnStarted';
  gameId: GameId;
  currentPlayerId: PlayerId;
  round: number;
  phase: string;
  deadlineAtMs?: number;
};

export type DiceRolledEvent = EventBase & {
  type: 'game/diceRolled';
  gameId: GameId;
  playerId: PlayerId;
  dice: [number, number];
};

export type PlayerMovedEvent = EventBase & {
  type: 'game/playerMoved';
  gameId: GameId;
  playerId: PlayerId;
  from: number;
  to: number;
};

export type MoneyChangedEvent = EventBase & {
  type: 'game/moneyChanged';
  gameId: GameId;
  playerId: PlayerId;
  delta: number;
  reason: string;
};

export type PromptedEvent = EventBase & {
  type: 'game/prompted';
  gameId: GameId;
  prompt: {
    promptId: string;
    playerId: PlayerId;
    kind: string;
    data: unknown;
    deadlineAtMs?: number;
  };
};

export type GameEndedEvent = EventBase & {
  type: 'game/ended';
  gameId: GameId;
  winnerPlayerId?: PlayerId;
};

export type EngineEvent = EventBase & {
  type: 'game/engine';
  gameId: GameId;
  name: string;
  data: unknown;
};

export type Event =
  | PlayerJoinedEvent
  | PlayerConnectionChangedEvent
  | PlayerLeftEvent
  | PlayerReadyChangedEvent
  | ChatMessageEvent
  | RoomConfigChangedEvent
  | GameStartedEvent
  | TurnStartedEvent
  | DiceRolledEvent
  | PlayerMovedEvent
  | MoneyChangedEvent
  | PromptedEvent
  | GameEndedEvent
  | EngineEvent;

export type EventType = Event['type'];
