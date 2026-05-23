import type {
  EventSeq,
  GameId,
  PlayerId,
  ProtocolVersion,
  RoomCode,
  RoomId,
  UserId,
} from './ids.js';

export type RoomConfigSnapshot = {
  maxPlayers: number;
  turnTimeMs?: number;
  rulesetVersionId?: string;
  boardVersionId?: string;
  boardPreset?: 'default' | 'full' | 'e2e_fast';
};

export type RoomMemberSnapshot = {
  playerId: PlayerId;
  userId?: UserId;
  displayName: string;
  isSpectator: boolean;
  connected: boolean;
  ready: boolean;
  seatIndex?: number;
  joinedAtMs: number;
};

export type RoomSnapshot = {
  roomId: RoomId;
  roomCode: RoomCode;
  status: 'lobby' | 'playing' | 'ended';
  hostPlayerId: PlayerId;
  createdAtMs: number;
  closedAtMs?: number;
  config: RoomConfigSnapshot;
  members: RoomMemberSnapshot[];
};

export type GamePlayerStateSnapshot = {
  playerId: PlayerId;
  cash: number;
  position: number;
  inJail?: boolean;
  jailTurns?: number;
  properties?: string[];
  eliminated?: boolean;
};

export type GameSnapshot = {
  gameId: GameId;
  status: 'playing' | 'ended';
  seed: string;
  rngStep: number;
  round: number;
  phase: string;
  currentPlayerId: PlayerId;
  deadlineAtMs?: number;
  players: GamePlayerStateSnapshot[];
  engineState: Record<string, unknown>;
};

export type MatchSnapshot = {
  protocolVersion: ProtocolVersion;
  serverTimeMs: number;
  room: RoomSnapshot;
  game: GameSnapshot | null;
  cursor: {
    lastEventSeq: EventSeq;
  };
};
