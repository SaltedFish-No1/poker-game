import { Combo, enumerateMoves } from './combos';
import { DoudizhuGame, handStrength } from './engine';

/** 规则 AI 叫分 */
export function chooseBid(hand: number[], currentBid: number): number {
  const s = handStrength(hand);
  let want = 0;
  if (s >= 11) want = 3;
  else if (s >= 8) want = 2;
  else if (s >= 5.5) want = 1;
  return want > currentBid ? want : 0;
}

/** 规则 AI 加倍决策：手牌强才加倍（地主门槛更高，输赢都翻倍） */
export function chooseDouble(hand: number[], isLandlord: boolean): boolean {
  const s = handStrength(hand);
  return isLandlord ? s >= 11 : s >= 8;
}

/**
 * 规则 AI 出牌。返回要出的牌，null 表示过。
 * 策略（简化版）：
 * - 自由出牌：优先出能清空手牌的一手；否则优先长序列（顺子/连对/飞机），再出最小的散牌组合；炸弹留到关键时刻。
 * - 跟牌：能用非炸弹压就用最小的压；队友（农民之间）出的大牌不抢；对手快走完或自己快赢时才动炸弹。
 */
export function chooseMove(game: DoudizhuGame, seat: number): number[] | null {
  const moves = game.legalMoves(seat);
  if (moves.length === 0) return null;
  const hand = game.hands[seat];
  const toBeat = game.toBeat;
  const landlord = game.landlord!;
  const isLandlord = seat === landlord;

  // 一手清空直接赢
  const winning = moves.find((m) => m.cards.length === hand.length);
  if (winning) return winning.cards;

  const nonBomb = moves.filter((m) => m.type !== 'bomb' && m.type !== 'rocket');
  const bombs = moves.filter((m) => m.type === 'bomb' || m.type === 'rocket');

  const opponents = [0, 1, 2].filter((s) =>
    isLandlord ? s !== seat : s === landlord,
  );
  const opponentClose = opponents.some((s) => game.hands[s].length <= 2);

  if (toBeat === null) {
    // 自由出牌
    const pick = pickLead(nonBomb.length ? nonBomb : moves, hand.length);
    return pick.cards;
  }

  // 跟牌：队友出的牌（农民之间）从宽放过
  const fromTeammate = !isLandlord && toBeat.seat !== landlord;
  if (fromTeammate) {
    const teammateHand = game.hands[toBeat.seat].length;
    // 队友大牌（A 以上）或快走完时不抢
    if (toBeat.combo.mainRank >= 14 || teammateHand <= 4) return null;
    // 只用很小的牌顺势压
    const cheap = nonBomb.find((m) => m.mainRank <= 12);
    return cheap ? cheap.cards : null;
  }

  if (nonBomb.length > 0) {
    // 手上快出完 or 对手快赢时用较大的压制，否则用最小的压
    const m = opponentClose ? nonBomb[nonBomb.length - 1] : nonBomb[0];
    // 避免为压一张小单牌拆掉炸弹以外的大结构：粗略judge——若压牌会拆掉手中的三张/对子结构且局势不紧则过
    return m.cards;
  }
  if (bombs.length > 0 && (opponentClose || hand.length <= 6)) {
    return bombs[0].cards;
  }
  return null;
}

/** 自由出牌时挑选：优先长序列，其次带牌的三张，再最小散牌 */
function pickLead(moves: Combo[], handSize: number): Combo {
  const seq = moves
    .filter((m) => ['straight', 'pairStraight', 'plane', 'plane1', 'plane2'].includes(m.type))
    .sort((a, b) => b.cards.length - a.cards.length || a.mainRank - b.mainRank);
  if (seq.length > 0 && seq[0].cards.length <= handSize - 1) return seq[0];

  const triple = moves
    .filter((m) => ['triple2', 'triple1', 'triple'].includes(m.type))
    .sort((a, b) => a.mainRank - b.mainRank);
  if (triple.length > 0) return triple[0];

  const small = moves
    .filter((m) => ['pair', 'single'].includes(m.type))
    .sort((a, b) => a.mainRank - b.mainRank || b.cards.length - a.cards.length);
  if (small.length > 0) return small[0];
  return moves[0];
}
