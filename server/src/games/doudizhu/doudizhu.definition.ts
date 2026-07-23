import { Logger } from '@nestjs/common';
import { GameAction, GameDefinition, Match, MatchAi } from '../game.interface';
import { LlmService } from '../../ai/llm.service';
import { cardsLabel } from './cards';
import { Combo, COMBO_NAMES } from './combos';
import { DoudizhuGame } from './engine';
import { chooseBid, chooseDouble, chooseMove } from './rule-bot';

/** 斗地主动作协议 */
export type DoudizhuAction =
  | { type: 'bid'; score: number }
  | { type: 'double'; double: boolean }
  | { type: 'play'; cards: number[] }
  | { type: 'pass' }
  | { type: 'surrender' };

/** 将引擎包装为通用 Match 接口 */
export class DoudizhuMatch implements Match {
  readonly game: DoudizhuGame;

  constructor(rng?: () => number) {
    this.game = new DoudizhuGame(rng ?? Math.random, Math.floor(Math.random() * 3));
  }

  currentSeat(): number | null {
    return this.game.phase === 'finished' ? null : this.game.turn;
  }

  finished(): boolean {
    return this.game.phase === 'finished';
  }

  viewFor(seat: number): unknown {
    return this.game.viewFor(seat);
  }

  act(seat: number, action: GameAction): void {
    const a = action as DoudizhuAction;
    switch (a.type) {
      case 'bid':
        this.game.bid(seat, Number(a.score));
        return;
      case 'double':
        this.game.double(seat, Boolean(a.double));
        return;
      case 'surrender':
        this.game.surrender(seat);
        return;
      case 'play': {
        if (!Array.isArray(a.cards) || a.cards.some((c) => !Number.isInteger(c))) {
          throw new Error('无效的出牌数据');
        }
        this.game.play(seat, a.cards.map(Number));
        return;
      }
      case 'pass':
        this.game.pass(seat);
        return;
      default:
        throw new Error(`未知动作：${(a as GameAction).type}`);
    }
  }

  hint(seat: number): GameAction | null {
    if (this.game.turn !== seat) return null;
    if (this.game.phase === 'doubling') {
      return {
        type: 'double',
        double: chooseDouble(this.game.hands[seat], seat === this.game.landlord),
      };
    }
    if (this.game.phase !== 'playing') return null;
    const move = chooseMove(this.game, seat);
    return move ? { type: 'play', cards: move } : { type: 'pass' };
  }
}

/**
 * 斗地主 AI：优先用 LLM（Vercel AI SDK -> Ark）决策，
 * 未配置或失败时降级为规则策略。
 */
export class DoudizhuAi implements MatchAi {
  private readonly logger = new Logger('DoudizhuAi');

  constructor(private readonly llm: LlmService) {}

  async decide(match: Match, seat: number): Promise<GameAction> {
    const game = (match as DoudizhuMatch).game;
    if (game.phase === 'bidding') {
      return { type: 'bid', score: await this.decideBid(game, seat) };
    }
    if (game.phase === 'doubling') {
      // 加倍是简单的期望收益判断，规则策略即可，不必消耗 LLM 调用
      return {
        type: 'double',
        double: chooseDouble(game.hands[seat], seat === game.landlord),
      };
    }
    const cards = await this.decideMove(game, seat);
    return cards ? { type: 'play', cards } : { type: 'pass' };
  }

  private async decideBid(game: DoudizhuGame, seat: number): Promise<number> {
    const fallback = () => chooseBid(game.hands[seat], game.currentBid);
    const options = [0, 1, 2, 3].filter((s) => s === 0 || s > game.currentBid);
    const bidsDesc = game.bids.length
      ? game.bids.map((b) => `座位${b.seat}: ${b.score === 0 ? '不叫' : `${b.score}分`}`).join('，')
      : '你是第一个叫分的';
    const text = await this.llm.complete(
      [
        '你在打斗地主，现在是叫分阶段。叫分越高，当地主后的输赢分数越大；手牌强（大牌、炸弹、王多）才值得叫高分。',
        `你的手牌：${cardsLabel(game.hands[seat])}`,
        `之前的叫分：${bidsDesc}`,
        `你可以选择：${options.map((o) => (o === 0 ? '0(不叫)' : o)).join(' / ')}`,
        '只输出一个 JSON，格式：{"bid": 数字}，不要输出其他内容。',
      ].join('\n'),
    );
    if (text !== null) {
      const parsed = this.llm.parseIntField(text, 'bid');
      if (parsed !== null && options.includes(parsed)) return parsed;
      this.logger.warn(`LLM 叫分输出无法解析，降级规则 AI：${text.slice(0, 120)}`);
    }
    return fallback();
  }

  private async decideMove(game: DoudizhuGame, seat: number): Promise<number[] | null> {
    const moves = game.legalMoves(seat);
    const canPass = game.canPass(seat);
    if (moves.length === 0) return null;
    const text = await this.llm.complete(this.movePrompt(game, seat, moves, canPass));
    if (text !== null) {
      const parsed = this.llm.parseIntField(text, 'move');
      if (parsed !== null) {
        if (parsed === -1 && canPass) return null;
        if (parsed >= 0 && parsed < moves.length) return moves[parsed].cards;
      }
      this.logger.warn(`LLM 出牌输出无法解析，降级规则 AI：${text.slice(0, 120)}`);
    }
    return chooseMove(game, seat);
  }

  private movePrompt(
    game: DoudizhuGame,
    seat: number,
    moves: Combo[],
    canPass: boolean,
  ): string {
    const landlord = game.landlord!;
    const role = seat === landlord ? '地主' : '农民';
    const others = [0, 1, 2]
      .filter((s) => s !== seat)
      .map((s) => `座位${s}（${s === landlord ? '地主' : '农民'}）剩 ${game.hands[s].length} 张`)
      .join('，');
    const recent = game.history
      .slice(-6)
      .map((m) =>
        m.combo
          ? `座位${m.seat} 出 ${COMBO_NAMES[m.combo.type]} ${cardsLabel(m.combo.cards)}`
          : `座位${m.seat} 过`,
      )
      .join('；');
    const toBeat = game.toBeat
      ? `需要压过 座位${game.toBeat.seat} 的 ${COMBO_NAMES[game.toBeat.combo.type]} ${cardsLabel(game.toBeat.combo.cards)}`
      : '你自由出牌（先手）';
    const candidates = moves
      .slice(0, 40)
      .map((m, i) => `${i}: ${COMBO_NAMES[m.type]} ${cardsLabel(m.cards)}`)
      .join('\n');
    return [
      `你在打斗地主，你是${role}（座位${seat}）。农民两人协作对抗地主：农民之间不要互相压大牌，要配合让队友走牌；地主要压制农民。`,
      `你的手牌：${cardsLabel(game.hands[seat])}`,
      `其他玩家：${others}`,
      `底牌：${cardsLabel(game.bottom)}`,
      `最近动作：${recent || '无'}`,
      `当前局面：${toBeat}`,
      `倍数：${game.multiplier}（炸弹/王炸会翻倍，不要浪费）`,
      '候选出牌（编号: 牌型 牌）：',
      candidates,
      canPass ? '你也可以过牌（编号 -1）。' : '你必须出牌，不能过。',
      '权衡后选择一个编号。只输出一个 JSON，格式：{"move": 编号}，不要输出其他内容。',
    ].join('\n');
  }
}

export function createDoudizhuDefinition(llm: LlmService): GameDefinition {
  return {
    id: 'doudizhu',
    name: '斗地主',
    description: '经典三人扑克：叫分抢地主，农民协作对抗地主。',
    minPlayers: 3,
    maxPlayers: 3,
    available: true,
    createMatch: ({ rng }) => new DoudizhuMatch(rng),
    createAi: () => new DoudizhuAi(llm),
  };
}
