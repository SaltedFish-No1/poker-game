/**
 * 游戏插件化抽象层。
 *
 * 大厅 / 房间 / 网关只依赖本文件中的接口；每种玩法（斗地主、跑得快、
 * 德州扑克……）在 src/games/<game>/ 下实现 GameDefinition 并注册到
 * GamesRegistry 即可接入，无需改动房间与通信层。
 */

/** 玩家在对局中的动作（各玩法自定义 type 与负载） */
export interface GameAction {
  type: string;
  [key: string]: unknown;
}

/** 一局进行中的对局实例 */
export interface Match {
  /** 当前轮到的座位；对局结束返回 null */
  currentSeat(): number | null;
  finished(): boolean;
  /**
   * 座位 seat 的脱敏视图（不含他人手牌等隐藏信息），
   * 直接下发给对应客户端渲染。
   */
  viewFor(seat: number): unknown;
  /** 执行动作；非法动作抛出带用户可读信息的 Error */
  act(seat: number, action: GameAction): void;
  /** 给玩家的提示（如可出的一手牌）；无提示返回 null */
  hint(seat: number): GameAction | null;
}

/** 玩法的 AI 决策器（内部可自行组合 LLM 与规则策略） */
export interface MatchAi {
  decide(match: Match, seat: number): Promise<GameAction>;
}

/** 一种玩法的完整定义 */
export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** false 时在大厅展示为“敬请期待”，不可建房 */
  available: boolean;
  createMatch(options: { playerCount: number; rng?: () => number }): Match;
  createAi(): MatchAi;
}

/** 大厅展示用的玩法元信息 */
export interface GameCatalogItem {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  available: boolean;
}
