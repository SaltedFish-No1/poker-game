/** 与服务端协议对应的类型（server/src 中同名结构的镜像） */

export type ComboType =
  | 'single' | 'pair' | 'triple' | 'triple1' | 'triple2'
  | 'straight' | 'pairStraight' | 'plane' | 'plane1' | 'plane2'
  | 'four2' | 'four2pairs' | 'bomb' | 'rocket';

export interface Combo {
  type: ComboType;
  mainRank: number;
  length: number;
  cards: number[];
}

export const COMBO_NAMES: Record<ComboType, string> = {
  single: '单张', pair: '对子', triple: '三张', triple1: '三带一', triple2: '三带对',
  straight: '顺子', pairStraight: '连对', plane: '飞机', plane1: '飞机带单',
  plane2: '飞机带对', four2: '四带二', four2pairs: '四带两对', bomb: '炸弹', rocket: '王炸',
};

export type Phase = 'bidding' | 'playing' | 'finished';

export interface MoveRecord { seat: number; combo: Combo | null; }
export interface BidRecord { seat: number; score: number; }

export interface GameResult {
  winnerSeat: number;
  landlordWon: boolean;
  spring: boolean;
  antiSpring: boolean;
  baseScore: number;
  multiplier: number;
  scores: number[];
}

export interface DoudizhuView {
  phase: Phase;
  seat: number;
  turn: number;
  landlord: number | null;
  baseScore: number;
  multiplier: number;
  hand: number[];
  handCounts: number[];
  bottom: number[] | null;
  toBeat: { seat: number; combo: Combo } | null;
  lastMoves: (MoveRecord | null)[];
  bids: BidRecord[];
  canPass: boolean;
  result: GameResult | null;
  playedCards: number[][];
}

export type RoomMode = 'single' | 'multi';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomPlayerInfo {
  id: string;
  name: string;
  seat: number;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  gameId: string;
  gameName: string;
  mode: RoomMode;
  status: RoomStatus;
  hostId: string;
  maxPlayers: number;
  players: RoomPlayerInfo[];
}

export interface GameCatalogItem {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  available: boolean;
}

export interface GameAction {
  type: string;
  [key: string]: unknown;
}

export interface Ack<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** 牌面工具 */
export const SUIT_LABELS = ['♦', '♣', '♥', '♠'];
export const RANK_LABELS: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王',
};

export function rankOf(id: number): number {
  if (id === 52) return 16;
  if (id === 53) return 17;
  return Math.floor(id / 4) + 3;
}
export function suitOf(id: number): number {
  return id < 52 ? id % 4 : -1;
}
export function sortCardsDesc(ids: number[]): number[] {
  return [...ids].sort((a, b) => rankOf(b) - rankOf(a) || b - a);
}
