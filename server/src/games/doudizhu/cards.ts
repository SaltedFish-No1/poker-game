/**
 * 牌的编码：
 *  0..51  普通牌：rank = floor(id/4) + 3（3,4,...,10,J=11,Q=12,K=13,A=14,2=15），suit = id % 4
 *  52     小王（rank 16）
 *  53     大王（rank 17）
 */

export const SMALL_JOKER = 52;
export const BIG_JOKER = 53;

export const SUIT_LABELS = ['♦', '♣', '♥', '♠'];

export const RANK_LABELS: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王',
};

export function rankOf(id: number): number {
  if (id === SMALL_JOKER) return 16;
  if (id === BIG_JOKER) return 17;
  return Math.floor(id / 4) + 3;
}

export function suitOf(id: number): number {
  return id < 52 ? id % 4 : -1;
}

export function cardLabel(id: number): string {
  const r = rankOf(id);
  if (r >= 16) return RANK_LABELS[r];
  return SUIT_LABELS[suitOf(id)] + RANK_LABELS[r];
}

export function cardsLabel(ids: number[]): string {
  return sortCards(ids).map(cardLabel).join(' ');
}

export function newDeck(): number[] {
  return Array.from({ length: 54 }, (_, i) => i);
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从大到小排序（手牌展示习惯） */
export function sortCards(ids: number[]): number[] {
  return [...ids].sort((a, b) => rankOf(b) - rankOf(a) || b - a);
}

/** 从小到大排序 */
export function sortCardsAsc(ids: number[]): number[] {
  return [...ids].sort((a, b) => rankOf(a) - rankOf(b) || a - b);
}

/** 可复现的伪随机数生成器（mulberry32），用于测试 */
export function seededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
