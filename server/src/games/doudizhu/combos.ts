import { BIG_JOKER, SMALL_JOKER, rankOf, sortCardsAsc } from './cards';

export type ComboType =
  | 'single'        // 单张
  | 'pair'          // 对子
  | 'triple'        // 三张
  | 'triple1'       // 三带一
  | 'triple2'       // 三带对
  | 'straight'      // 顺子（>=5 连张）
  | 'pairStraight'  // 连对（>=3 连对）
  | 'plane'         // 飞机不带翅膀（>=2 连三张）
  | 'plane1'        // 飞机带单
  | 'plane2'        // 飞机带对
  | 'four2'         // 四带二（两张单）
  | 'four2pairs'    // 四带两对
  | 'bomb'          // 炸弹
  | 'rocket';       // 王炸

export interface Combo {
  type: ComboType;
  /** 主牌点数（比较大小用） */
  mainRank: number;
  /** 序列长度：顺子张数 / 连对对数 / 飞机组数，其余为 1 */
  length: number;
  cards: number[];
}

export const COMBO_NAMES: Record<ComboType, string> = {
  single: '单张', pair: '对子', triple: '三张', triple1: '三带一', triple2: '三带对',
  straight: '顺子', pairStraight: '连对', plane: '飞机', plane1: '飞机带单',
  plane2: '飞机带对', four2: '四带二', four2pairs: '四带两对', bomb: '炸弹', rocket: '王炸',
};

function countByRank(cards: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) {
    const r = rankOf(c);
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return m;
}

function isConsecutive(ranks: number[]): boolean {
  if (ranks.length === 0) return false;
  if (ranks[ranks.length - 1] > 14) return false; // 2 和王不能参与连续牌型
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

/** 识别一手牌的牌型；非法组合返回 null */
export function analyze(cards: number[]): Combo | null {
  const n = cards.length;
  if (n === 0) return null;
  const counts = countByRank(cards);
  const distinct = [...counts.keys()].sort((a, b) => a - b);
  const make = (type: ComboType, mainRank: number, length = 1): Combo => ({
    type, mainRank, length, cards: [...cards],
  });

  if (n === 2 && counts.has(16) && counts.has(17)) return make('rocket', 17);

  if (distinct.length === 1) {
    const r = distinct[0];
    if (n === 1) return make('single', r);
    if (n === 2) return make('pair', r);
    if (n === 3) return make('triple', r);
    if (n === 4) return make('bomb', r);
    return null;
  }

  const countVals = [...counts.values()].sort((a, b) => b - a);
  const max = distinct[distinct.length - 1];

  // 顺子
  if (n >= 5 && countVals[0] === 1 && isConsecutive(distinct)) {
    return make('straight', max, n);
  }
  // 连对
  if (n >= 6 && n % 2 === 0 && distinct.length === n / 2 && countVals[0] === 2 && isConsecutive(distinct)) {
    return make('pairStraight', max, n / 2);
  }
  // 三带一 / 三带对
  if (n === 4 && countVals[0] === 3) {
    const r = distinct.find((x) => counts.get(x) === 3)!;
    return make('triple1', r);
  }
  if (n === 5 && countVals[0] === 3 && countVals[1] === 2) {
    const r = distinct.find((x) => counts.get(x) === 3)!;
    return make('triple2', r);
  }
  // 四带二 / 四带两对
  if (n === 6 && countVals[0] === 4) {
    const r = distinct.find((x) => counts.get(x) === 4)!;
    // 带的两张不能是王炸
    if (!(counts.has(16) && counts.has(17))) return make('four2', r);
  }
  if (n === 8 && distinct.length === 3 && countVals[0] === 4 && countVals[1] === 2 && countVals[2] === 2) {
    const r = distinct.find((x) => counts.get(x) === 4)!;
    if (r <= 15 && !counts.has(16) && !counts.has(17)) return make('four2pairs', r);
  }
  // 飞机（含带翅膀）：找连续三张的最长段
  const tripleRanks = distinct.filter((r) => (counts.get(r) ?? 0) >= 3 && r <= 14);
  for (let i = 0; i < tripleRanks.length; i++) {
    for (let j = tripleRanks.length - 1; j > i; j--) {
      const run = tripleRanks.slice(i, j + 1);
      if (!isConsecutive(run)) continue;
      const k = run.length;
      const top = run[k - 1];
      if (n === 3 * k && distinct.length === k) return make('plane', top, k);
      if (n === 4 * k) {
        // 翅膀为 k 张任意单牌（不能包含王炸整对，普通规则从宽处理）
        const wings = n - 3 * k;
        if (wings === k) return make('plane1', top, k);
      }
      if (n === 5 * k) {
        // 翅膀必须是 k 个对子
        const rest = new Map(counts);
        for (const r of run) {
          const left = (rest.get(r) ?? 0) - 3;
          if (left === 0) rest.delete(r); else rest.set(r, left);
        }
        const restVals = [...rest.values()];
        if (restVals.length === k && restVals.every((v) => v === 2)) return make('plane2', top, k);
      }
    }
  }
  return null;
}

/** candidate 是否能压过 target */
export function beats(candidate: Combo, target: Combo): boolean {
  if (candidate.type === 'rocket') return true;
  if (target.type === 'rocket') return false;
  if (candidate.type === 'bomb') {
    return target.type !== 'bomb' || candidate.mainRank > target.mainRank;
  }
  if (target.type === 'bomb') return false;
  return (
    candidate.type === target.type &&
    candidate.length === target.length &&
    candidate.mainRank > target.mainRank
  );
}

interface HandIndex {
  byRank: Map<number, number[]>; // rank -> 牌 id 列表（升序）
  ranksAsc: number[];
}

function indexHand(hand: number[]): HandIndex {
  const byRank = new Map<number, number[]>();
  for (const c of sortCardsAsc(hand)) {
    const r = rankOf(c);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(c);
  }
  return { byRank, ranksAsc: [...byRank.keys()].sort((a, b) => a - b) };
}

function take(idx: HandIndex, rank: number, n: number): number[] {
  return idx.byRank.get(rank)!.slice(0, n);
}

/** 从手牌中挑 n 个最小的“散单”做翅膀（避开 exclude 的点数，优先拆最少） */
function pickSingles(idx: HandIndex, n: number, exclude: Set<number>): number[] | null {
  const pool: number[] = [];
  // 优先用数量少的点数（1 张 > 2 张 > 3 张），同数量按点数从小到大
  const ranks = idx.ranksAsc
    .filter((r) => !exclude.has(r))
    .sort((a, b) => idx.byRank.get(a)!.length - idx.byRank.get(b)!.length || a - b);
  for (const r of ranks) {
    for (const c of idx.byRank.get(r)!) {
      pool.push(c);
      if (pool.length === n) return pool;
    }
  }
  return null;
}

function pickPairs(idx: HandIndex, n: number, exclude: Set<number>): number[] | null {
  const out: number[] = [];
  const ranks = idx.ranksAsc.filter((r) => !exclude.has(r) && idx.byRank.get(r)!.length >= 2 && r <= 15);
  for (const r of ranks) {
    out.push(...take(idx, r, 2));
    if (out.length === 2 * n) return out;
  }
  return null;
}

/**
 * 枚举合法出牌。
 * toBeat 为 null 表示自由出牌（枚举所有牌型）；否则只枚举能压过 toBeat 的牌。
 * 返回结果按“代价”从小到大排序（先小牌、后炸弹），供规则 AI 直接取首个。
 */
export function enumerateMoves(hand: number[], toBeat: Combo | null): Combo[] {
  const idx = indexHand(hand);
  const moves: Combo[] = [];
  const push = (cards: number[]) => {
    const combo = analyze(cards);
    if (combo) moves.push(combo);
  };

  const hasRocket = idx.byRank.has(16) && idx.byRank.has(17);
  const bombRanks = idx.ranksAsc.filter((r) => idx.byRank.get(r)!.length === 4);

  const genOfType = (type: ComboType, minRank: number, length: number) => {
    switch (type) {
      case 'single':
        for (const r of idx.ranksAsc) if (r > minRank) push(take(idx, r, 1));
        break;
      case 'pair':
        for (const r of idx.ranksAsc)
          if (r > minRank && r <= 15 && idx.byRank.get(r)!.length >= 2) push(take(idx, r, 2));
        break;
      case 'triple':
        for (const r of idx.ranksAsc)
          if (r > minRank && idx.byRank.get(r)!.length >= 3) push(take(idx, r, 3));
        break;
      case 'triple1':
        for (const r of idx.ranksAsc) {
          if (r <= minRank || idx.byRank.get(r)!.length < 3) continue;
          const wing = pickSingles(idx, 1, new Set([r]));
          if (wing) push([...take(idx, r, 3), ...wing]);
        }
        break;
      case 'triple2':
        for (const r of idx.ranksAsc) {
          if (r <= minRank || idx.byRank.get(r)!.length < 3) continue;
          const wing = pickPairs(idx, 1, new Set([r]));
          if (wing) push([...take(idx, r, 3), ...wing]);
        }
        break;
      case 'straight': {
        for (let top = Math.max(minRank + 1, 3 + length - 1); top <= 14; top++) {
          const seq: number[] = [];
          let ok = true;
          for (let r = top - length + 1; r <= top; r++) {
            if (!idx.byRank.has(r)) { ok = false; break; }
            seq.push(take(idx, r, 1)[0]);
          }
          if (ok) push(seq);
        }
        break;
      }
      case 'pairStraight': {
        for (let top = Math.max(minRank + 1, 3 + length - 1); top <= 14; top++) {
          const seq: number[] = [];
          let ok = true;
          for (let r = top - length + 1; r <= top; r++) {
            if ((idx.byRank.get(r)?.length ?? 0) < 2) { ok = false; break; }
            seq.push(...take(idx, r, 2));
          }
          if (ok) push(seq);
        }
        break;
      }
      case 'plane':
      case 'plane1':
      case 'plane2': {
        for (let top = Math.max(minRank + 1, 3 + length - 1); top <= 14; top++) {
          const runRanks: number[] = [];
          let ok = true;
          for (let r = top - length + 1; r <= top; r++) {
            if ((idx.byRank.get(r)?.length ?? 0) < 3) { ok = false; break; }
            runRanks.push(r);
          }
          if (!ok) continue;
          const base = runRanks.flatMap((r) => take(idx, r, 3));
          const exclude = new Set(runRanks);
          if (type === 'plane') push(base);
          if (type === 'plane1') {
            const wings = pickSingles(idx, length, exclude);
            if (wings) push([...base, ...wings]);
          }
          if (type === 'plane2') {
            const wings = pickPairs(idx, length, exclude);
            if (wings) push([...base, ...wings]);
          }
        }
        break;
      }
      case 'four2':
        for (const r of bombRanks) {
          if (r <= minRank) continue;
          const wings = pickSingles(idx, 2, new Set([r]));
          if (wings) push([...take(idx, r, 4), ...wings]);
        }
        break;
      case 'four2pairs':
        for (const r of bombRanks) {
          if (r <= minRank) continue;
          const wings = pickPairs(idx, 2, new Set([r]));
          if (wings) push([...take(idx, r, 4), ...wings]);
        }
        break;
      default:
        break;
    }
  };

  if (toBeat === null) {
    // 自由出牌：枚举所有牌型
    const types: Array<[ComboType, number]> = [
      ['single', 1], ['pair', 1], ['triple', 1], ['triple1', 1], ['triple2', 1],
      ['four2', 1], ['four2pairs', 1],
    ];
    for (const [t] of types) genOfType(t, 0, 1);
    for (let len = 5; len <= 12; len++) genOfType('straight', 0, len);
    for (let len = 3; len <= 10; len++) genOfType('pairStraight', 0, len);
    for (let len = 2; len <= 6; len++) {
      genOfType('plane', 0, len);
      genOfType('plane1', 0, len);
      genOfType('plane2', 0, len);
    }
    for (const r of bombRanks) push(take(idx, r, 4));
    if (hasRocket) push([SMALL_JOKER, BIG_JOKER]);
  } else if (toBeat.type === 'rocket') {
    // 无解
  } else if (toBeat.type === 'bomb') {
    for (const r of bombRanks) if (r > toBeat.mainRank) push(take(idx, r, 4));
    if (hasRocket) push([SMALL_JOKER, BIG_JOKER]);
  } else {
    genOfType(toBeat.type, toBeat.mainRank, toBeat.length);
    for (const r of bombRanks) push(take(idx, r, 4));
    if (hasRocket) push([SMALL_JOKER, BIG_JOKER]);
  }

  const cost = (c: Combo) =>
    (c.type === 'rocket' ? 2000 : c.type === 'bomb' ? 1000 : 0) + c.mainRank;
  moves.sort((a, b) => cost(a) - cost(b));
  // 去重（同型同主牌同张数保留一个）
  const seen = new Set<string>();
  return moves.filter((m) => {
    const key = `${m.type}:${m.mainRank}:${m.cards.length}:${sortCardsAsc(m.cards).join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
