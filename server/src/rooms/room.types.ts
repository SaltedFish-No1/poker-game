import { Match, MatchAi } from '../games/game.interface';

export type RoomMode = 'single' | 'multi';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  id: string;          // 人类为 socket 连接绑定的玩家 id；机器人为 bot:xxx
  name: string;
  seat: number;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
}

export interface Room {
  id: string;
  name: string;
  gameId: string;
  mode: RoomMode;
  status: RoomStatus;
  hostId: string;
  players: RoomPlayer[];
  maxPlayers: number;
  match: Match | null;
  ai: MatchAi | null;
  /** 防止过期的机器人回调写入新对局 */
  matchEpoch: number;
}

/** 下发给客户端的房间信息（去掉 match 等内部字段） */
export interface RoomInfo {
  id: string;
  name: string;
  gameId: string;
  gameName: string;
  mode: RoomMode;
  status: RoomStatus;
  hostId: string;
  maxPlayers: number;
  players: Array<Pick<RoomPlayer, 'id' | 'name' | 'seat' | 'isBot' | 'ready' | 'connected'>>;
}
