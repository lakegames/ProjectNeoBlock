import type { GameId, PlayerId, RoomId } from '@neoblock/shared';

export type RulesPhase =
  | 'await_roll'
  | 'await_prompt'
  | 'await_debt'
  | 'await_end_turn'
  | 'ended';

export type BoardStartTile = {
  kind: 'start';
};

export type BoardPropertyTile = {
  kind: 'property';
  propertyId: string;
  groupId: string;
  price: number;
  houseCost: number;
  rents: [number, number, number, number, number, number];
  ownerPlayerId?: PlayerId;
  mortgaged?: boolean;
  buildings?: number;
};

export type BoardJailTile = {
  kind: 'jail';
};

export type BoardGoToJailTile = {
  kind: 'goToJail';
};

export type BoardTaxTile = {
  kind: 'tax';
  amount: number;
};

export type BoardChanceTile = {
  kind: 'chance';
};

export type BoardCommunityChestTile = {
  kind: 'communityChest';
};

export type BoardTile =
  | BoardStartTile
  | BoardPropertyTile
  | BoardJailTile
  | BoardGoToJailTile
  | BoardTaxTile
  | BoardChanceTile
  | BoardCommunityChestTile;

export type CardDeckKind = 'chance' | 'communityChest';

export type CardEffect =
  | { kind: 'money'; delta: number }
  | { kind: 'moneyFromEachPlayer'; amount: number }
  | { kind: 'moveTo'; index: number; passStart: boolean }
  | { kind: 'goToJail' }
  | { kind: 'getOutOfJail' };

export type CardDef = {
  cardId: string;
  deck: CardDeckKind;
  text: string;
  effect: CardEffect;
};

export type DeckState = {
  drawPile: string[];
  discardPile: string[];
};

export type BoardConfig = {
  tiles: BoardTile[];
  jailIndex: number;
  startSalary?: number;
  jailFine?: number;
  mortgageInterestRate?: number;
  bankHouses?: number;
  bankHotels?: number;
  cards?: CardDef[];
};

export type GamePlayerState = {
  playerId: PlayerId;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  getOutOfJailChance: number;
  getOutOfJailCommunity: number;
  properties: string[];
  eliminated: boolean;
};

export type PendingPrompt =
  | {
      kind: 'buyOrAuction';
      promptId: string;
      playerId: PlayerId;
      propertyId: string;
      price: number;
    }
  | {
      kind: 'auctionBid';
      promptId: string;
      playerId: PlayerId;
      propertyId: string;
      minBid: number;
      highestBid: number;
      highestBidderId?: PlayerId;
    }
  | {
      kind: 'tradeOffer';
      promptId: string;
      playerId: PlayerId;
      tradeId: string;
      fromPlayerId: PlayerId;
      offer: TradeOffer;
      request: TradeOffer;
    }
  | {
      kind: 'resolveDebt';
      promptId: string;
      playerId: PlayerId;
      amount: number;
      reason: string;
      creditor: DebtCreditor;
    };

export type AuctionState = {
  propertyId: string;
  activeBidders: PlayerId[];
  currentBidderIndex: number;
  highestBid: number;
  highestBidderId?: PlayerId;
};

export type TradeOffer = {
  cash: number;
  properties: string[];
  getOutOfJailChance?: number;
  getOutOfJailCommunity?: number;
};

export type TradeState = {
  tradeId: string;
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  offer: TradeOffer;
  request: TradeOffer;
};

export type DebtCreditor = { kind: 'bank' } | { kind: 'player'; playerId: PlayerId };

export type DebtState = {
  debtorId: PlayerId;
  creditor: DebtCreditor;
  amount: number;
  reason: string;
};

export type GameBankState = {
  houses: number;
  hotels: number;
};

export type GameDecksState = {
  chance: DeckState;
  communityChest: DeckState;
};

export type GameState = {
  roomId: RoomId;
  gameId: GameId;
  status: 'playing' | 'ended';
  seed: string;
  rngStep: number;
  round: number;
  phase: RulesPhase;
  currentPlayerId: PlayerId;
  turnOrder: PlayerId[];
  players: Record<PlayerId, GamePlayerState>;
  board: BoardConfig;
  pendingPrompt?: PendingPrompt;
  auction?: AuctionState;
  trade?: TradeState;
  debt?: DebtState;
  bank: GameBankState;
  decks: GameDecksState;
  lastDice?: [number, number];
};

export type MatchState = {
  nextSeq: number;
  game: GameState;
};
