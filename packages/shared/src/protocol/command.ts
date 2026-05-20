import type { CommandId, EventSeq, GameId, PlayerId, RoomCode, RoomId, UserId } from './ids.js';

export type CommandBase = {
  commandId: CommandId;
  clientSeq: number;
};

export type JoinRoomCommand = CommandBase & {
  type: 'room/join';
  roomCode: RoomCode;
  userId?: UserId;
  displayName: string;
  mode: 'player' | 'spectator';
  resumeFromSeqExclusive?: EventSeq;
};

export type LeaveRoomCommand = CommandBase & {
  type: 'room/leave';
  roomId: RoomId;
};

export type SetReadyCommand = CommandBase & {
  type: 'room/setReady';
  roomId: RoomId;
  playerId: PlayerId;
  ready: boolean;
};

export type StartGameCommand = CommandBase & {
  type: 'room/startGame';
  roomId: RoomId;
  playerId: PlayerId;
};

export type RollDiceCommand = CommandBase & {
  type: 'game/rollDice';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
};

export type BuyPropertyCommand = CommandBase & {
  type: 'game/buyProperty';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  propertyId: string;
};

export type EndTurnCommand = CommandBase & {
  type: 'game/endTurn';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
};

export type RespondPromptCommand = CommandBase & {
  type: 'game/respondPrompt';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  promptId: string;
  choice: unknown;
};

export type PayJailFineCommand = CommandBase & {
  type: 'game/payJailFine';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
};

export type UseGetOutOfJailCardCommand = CommandBase & {
  type: 'game/useGetOutOfJailCard';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  deck: 'chance' | 'communityChest';
};

export type MortgagePropertyCommand = CommandBase & {
  type: 'game/mortgageProperty';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  propertyId: string;
};

export type RedeemPropertyCommand = CommandBase & {
  type: 'game/redeemProperty';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  propertyId: string;
};

export type BuildCommand = CommandBase & {
  type: 'game/build';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  propertyId: string;
};

export type SellBuildingCommand = CommandBase & {
  type: 'game/sellBuilding';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  propertyId: string;
};

export type TradeOffer = {
  cash: number;
  properties: string[];
  getOutOfJailChance?: number;
  getOutOfJailCommunity?: number;
};

export type ProposeTradeCommand = CommandBase & {
  type: 'game/proposeTrade';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  toPlayerId: PlayerId;
  offer: TradeOffer;
  request: TradeOffer;
};

export type RespondTradeCommand = CommandBase & {
  type: 'game/respondTrade';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
  accept: boolean;
};

export type DeclareBankruptcyCommand = CommandBase & {
  type: 'game/declareBankruptcy';
  roomId: RoomId;
  gameId: GameId;
  playerId: PlayerId;
};

export type Command =
  | JoinRoomCommand
  | LeaveRoomCommand
  | SetReadyCommand
  | StartGameCommand
  | RollDiceCommand
  | BuyPropertyCommand
  | EndTurnCommand
  | RespondPromptCommand
  | PayJailFineCommand
  | UseGetOutOfJailCardCommand
  | MortgagePropertyCommand
  | RedeemPropertyCommand
  | BuildCommand
  | SellBuildingCommand
  | ProposeTradeCommand
  | RespondTradeCommand
  | DeclareBankruptcyCommand;

export type CommandType = Command['type'];
