import { newDeck, shuffle, sortCards, rankOf } from './cards';
import { Combo, analyze, beats, enumerateMoves } from './combos';

export type Phase = 'bidding' | 'playing' | 'finished';

/**
 * 斗地主规则参数（变体扩展点）。
 * - classic：经典玩法（当前实现）
 * - laizi：癞子场——发牌后随机指定一个点数为癞子，可替代任意非王牌型组合
 * - tiandilai：天地癞——天癞（翻牌）+ 地癞（底牌）双癞子
 * 癞子变体接入方式：注册新的 GameDefinition（doudizhu-laizi 等），
 * 复用本引擎并在 combos 分析时携带 wildRanks 做通配展开。
 */
export interface DoudizhuRules {
  variant: 'classic' | 'laizi' | 'tiandilai';
  /** 癞子点数（发牌后确定），classic 为空 */
  wildRanks?: number[];
}

export const CLASSIC_RULES: DoudizhuRules = { variant: 'classic' };

export interface MoveRecord {
  seat: number;
  /** null 表示过牌 */
  combo: Combo | null;
}

export interface BidRecord {
  seat: number;
  /** 0 表示不叫 */
  score: number;
}

export interface GameResult {
  winnerSeat: number;
  landlordWon: boolean;
  spring: boolean;      // 春天：农民一张未出
  antiSpring: boolean;  // 反春：地主只出过一手
  baseScore: number;
  multiplier: number;
  /** 每个座位的得分（地主 ±2x，农民 ±1x） */
  scores: number[];
}

/** 单个玩家可见的对局视图 */
export interface PlayerView {
  phase: Phase;
  seat: number;
  turn: number;
  landlord: number | null;
  baseScore: number;
  multiplier: number;
  hand: number[];
  handCounts: number[];
  bottom: number[] | null;
  /** 当前需要压过的牌（若为 null 则自由出牌） */
  toBeat: { seat: number; combo: Combo } | null;
  /** 每个座位最近一次动作（用于桌面展示），null=还没动作，combo null=过 */
  lastMoves: (MoveRecord | null)[];
  bids: BidRecord[];
  canPass: boolean;
  result: GameResult | null;
  playedCards: number[][];
}

export class DoudizhuGame {
  phase: Phase = 'bidding';
  hands: number[][] = [[], [], []];
  bottom: number[] = [];
  turn = 0;
  landlord: number | null = null;
  baseScore = 0;
  multiplier = 1;
  bids: BidRecord[] = [];
  private redeals = 0;

  /** 当前回合需要压的牌 */
  toBeat: { seat: number; combo: Combo } | null = null;
  private passStreak = 0;
  history: MoveRecord[] = [];
  playsBySeat = [0, 0, 0];
  playedCards: number[][] = [[], [], []];
  result: GameResult | null = null;

  readonly rules: DoudizhuRules;

  constructor(
    private rng: () => number = Math.random,
    firstBidder = 0,
    rules: DoudizhuRules = CLASSIC_RULES,
  ) {
    this.rules = rules;
    this.deal(firstBidder);
  }

  private deal(firstBidder: number) {
    const deck = shuffle(newDeck(), this.rng);
    this.hands = [
      sortCards(deck.slice(0, 17)),
      sortCards(deck.slice(17, 34)),
      sortCards(deck.slice(34, 51)),
    ];
    this.bottom = sortCards(deck.slice(51));
    this.turn = firstBidder;
    this.phase = 'bidding';
    this.bids = [];
  }

  get currentBid(): number {
    return this.bids.reduce((m, b) => Math.max(m, b.score), 0);
  }

  /** 叫分：score 0=不叫 1/2/3=叫分，必须高于当前最高分 */
  bid(seat: number, score: number): void {
    if (this.phase !== 'bidding') throw new Error('当前不在叫分阶段');
    if (seat !== this.turn) throw new Error('还没轮到你叫分');
    if (![0, 1, 2, 3].includes(score)) throw new Error('无效的叫分');
    if (score !== 0 && score <= this.currentBid) throw new Error('叫分必须高于当前最高分');

    this.bids.push({ seat, score });

    if (score === 3) {
      this.assignLandlord(seat, 3);
      return;
    }
    if (this.bids.length === 3) {
      const best = this.bids.reduce((a, b) => (b.score > a.score ? b : a));
      if (best.score === 0) {
        // 三家都不叫：重新发牌；连续多次流局则强制第一个叫分者当地主（保证对局能开始）
        this.redeals += 1;
        if (this.redeals >= 3) {
          this.assignLandlord(this.turn === 2 ? 0 : this.turn + 1, 1);
        } else {
          this.deal((this.turn + 1) % 3);
        }
        return;
      }
      this.assignLandlord(best.seat, best.score);
      return;
    }
    this.turn = (this.turn + 1) % 3;
  }

  private assignLandlord(seat: number, score: number) {
    this.landlord = seat;
    this.baseScore = score;
    this.hands[seat] = sortCards([...this.hands[seat], ...this.bottom]);
    this.phase = 'playing';
    this.turn = seat;
    this.toBeat = null;
    this.passStreak = 0;
  }

  /** 当前玩家的合法出牌（不含过牌） */
  legalMoves(seat: number): Combo[] {
    if (this.phase !== 'playing' || seat !== this.turn) return [];
    return enumerateMoves(this.hands[seat], this.toBeat?.combo ?? null);
  }

  canPass(seat: number): boolean {
    return this.phase === 'playing' && seat === this.turn && this.toBeat !== null;
  }

  pass(seat: number): void {
    if (this.phase !== 'playing') throw new Error('当前不在出牌阶段');
    if (seat !== this.turn) throw new Error('还没轮到你出牌');
    if (this.toBeat === null) throw new Error('轮到你先出牌，不能过');
    this.history.push({ seat, combo: null });
    this.passStreak += 1;
    if (this.passStreak >= 2) {
      // 另外两家都过：由上一手的出牌者自由出牌
      this.turn = this.toBeat.seat;
      this.toBeat = null;
      this.passStreak = 0;
    } else {
      this.turn = (this.turn + 1) % 3;
    }
  }

  play(seat: number, cardIds: number[]): Combo {
    if (this.phase !== 'playing') throw new Error('当前不在出牌阶段');
    if (seat !== this.turn) throw new Error('还没轮到你出牌');
    const hand = this.hands[seat];
    const set = new Set(hand);
    if (cardIds.length === 0) throw new Error('请选择要出的牌');
    for (const c of cardIds) {
      if (!set.has(c)) throw new Error('所出的牌不在你的手牌中');
    }
    if (new Set(cardIds).size !== cardIds.length) throw new Error('出牌重复');
    const combo = analyze(cardIds);
    if (!combo) throw new Error('不是合法牌型');
    if (this.toBeat && !beats(combo, this.toBeat.combo)) {
      throw new Error('这手牌压不过上家');
    }

    this.hands[seat] = hand.filter((c) => !cardIds.includes(c));
    this.playedCards[seat] = sortCards([...this.playedCards[seat], ...cardIds]);
    this.history.push({ seat, combo });
    this.playsBySeat[seat] += 1;
    if (combo.type === 'bomb' || combo.type === 'rocket') this.multiplier *= 2;

    if (this.hands[seat].length === 0) {
      this.finish(seat);
      return combo;
    }
    this.toBeat = { seat, combo };
    this.passStreak = 0;
    this.turn = (this.turn + 1) % 3;
    return combo;
  }

  private finish(winnerSeat: number) {
    this.phase = 'finished';
    const landlord = this.landlord!;
    const landlordWon = winnerSeat === landlord;
    const farmers = [0, 1, 2].filter((s) => s !== landlord);
    const spring = landlordWon && farmers.every((s) => this.playsBySeat[s] === 0);
    const antiSpring = !landlordWon && this.playsBySeat[landlord] === 1;
    let multiplier = this.multiplier;
    if (spring || antiSpring) multiplier *= 2;
    const unit = this.baseScore * multiplier;
    const scores = [0, 0, 0];
    scores[landlord] = landlordWon ? 2 * unit : -2 * unit;
    for (const s of farmers) scores[s] = landlordWon ? -unit : unit;
    this.multiplier = multiplier;
    this.result = {
      winnerSeat, landlordWon, spring, antiSpring,
      baseScore: this.baseScore, multiplier, scores,
    };
  }

  viewFor(seat: number): PlayerView {
    const lastMoves: (MoveRecord | null)[] = [null, null, null];
    // 只回放本轮之内最近的动作：从后向前找每个座位最近一次动作
    for (let i = this.history.length - 1, found = 0; i >= 0 && found < 3; i--) {
      const m = this.history[i];
      if (lastMoves[m.seat] === null) {
        lastMoves[m.seat] = m;
        found++;
      }
    }
    return {
      phase: this.phase,
      seat,
      turn: this.turn,
      landlord: this.landlord,
      baseScore: this.baseScore,
      multiplier: this.multiplier,
      hand: this.hands[seat],
      handCounts: this.hands.map((h) => h.length),
      bottom: this.phase === 'bidding' ? null : this.bottom,
      toBeat: this.toBeat,
      lastMoves,
      bids: this.bids,
      canPass: this.canPass(seat),
      result: this.result,
      playedCards: this.playedCards,
    };
  }
}

/** 手牌强度估算（叫分用）：王、2、A、炸弹计分 */
export function handStrength(hand: number[]): number {
  let s = 0;
  const counts = new Map<number, number>();
  for (const c of hand) {
    const r = rankOf(c);
    counts.set(r, (counts.get(r) ?? 0) + 1);
    if (r === 17) s += 3;
    else if (r === 16) s += 2;
    else if (r === 15) s += 1.5;
    else if (r === 14) s += 0.8;
  }
  for (const [r, n] of counts) {
    if (n === 4) s += 4;
    if (r <= 15 && n === 3) s += 0.8;
  }
  if (counts.has(16) && counts.has(17)) s += 3; // 王炸额外加成
  return s;
}
