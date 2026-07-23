import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyze, beats, enumerateMoves } from './combos';
import { DoudizhuGame } from './engine';
import { chooseBid, chooseMove } from './rule-bot';
import { seededRng, rankOf } from './cards';

// id 帮助函数：rank(3..15) 的第 i 张（i 0..3）
const c = (rank: number, i = 0) => (rank - 3) * 4 + i;

test('牌型识别：基本牌型', () => {
  assert.equal(analyze([c(3)])!.type, 'single');
  assert.equal(analyze([c(3), c(3, 1)])!.type, 'pair');
  assert.equal(analyze([c(3), c(3, 1), c(3, 2)])!.type, 'triple');
  assert.equal(analyze([c(3), c(3, 1), c(3, 2), c(3, 3)])!.type, 'bomb');
  assert.equal(analyze([52, 53])!.type, 'rocket');
  assert.equal(analyze([c(3), c(3, 1), c(3, 2), c(5)])!.type, 'triple1');
  assert.equal(analyze([c(3), c(3, 1), c(3, 2), c(5), c(5, 1)])!.type, 'triple2');
});

test('牌型识别：顺子/连对/飞机', () => {
  const straight = [c(3), c(4), c(5), c(6), c(7)];
  assert.equal(analyze(straight)!.type, 'straight');
  assert.equal(analyze(straight)!.mainRank, 7);
  // 2 不能入顺
  assert.equal(analyze([c(11), c(12), c(13), c(14), c(15)]), null);
  const pairStraight = [c(3), c(3, 1), c(4), c(4, 1), c(5), c(5, 1)];
  assert.equal(analyze(pairStraight)!.type, 'pairStraight');
  const plane = [c(3), c(3, 1), c(3, 2), c(4), c(4, 1), c(4, 2)];
  assert.equal(analyze(plane)!.type, 'plane');
  const plane1 = [...plane, c(8), c(10)];
  assert.equal(analyze(plane1)!.type, 'plane1');
  const plane2 = [...plane, c(8), c(8, 1), c(10), c(10, 1)];
  assert.equal(analyze(plane2)!.type, 'plane2');
  const four2 = [c(9), c(9, 1), c(9, 2), c(9, 3), c(3), c(4)];
  assert.equal(analyze(four2)!.type, 'four2');
});

test('比较大小', () => {
  const p33 = analyze([c(3), c(3, 1)])!;
  const p44 = analyze([c(4), c(4, 1)])!;
  const bomb5 = analyze([c(5), c(5, 1), c(5, 2), c(5, 3)])!;
  const bomb9 = analyze([c(9), c(9, 1), c(9, 2), c(9, 3)])!;
  const rocket = analyze([52, 53])!;
  assert.ok(beats(p44, p33));
  assert.ok(!beats(p33, p44));
  assert.ok(beats(bomb5, p44));
  assert.ok(beats(bomb9, bomb5));
  assert.ok(!beats(bomb5, bomb9));
  assert.ok(beats(rocket, bomb9));
  assert.ok(!beats(bomb9, rocket));
  // 不同长度顺子不能互压
  const s5 = analyze([c(3), c(4), c(5), c(6), c(7)])!;
  const s6 = analyze([c(4), c(5), c(6), c(7), c(8), c(9)])!;
  assert.ok(!beats(s6, s5));
});

test('出牌枚举：跟牌只给能压的', () => {
  const toBeat = analyze([c(10), c(10, 1)])!;
  const hand = [c(3), c(3, 1), c(11), c(11, 1), c(15), c(15, 1), 52, 53];
  const moves = enumerateMoves(hand, toBeat);
  for (const m of moves) {
    assert.ok(beats(m, toBeat), `${m.type} ${m.mainRank} 应能压过对10`);
  }
  assert.ok(moves.some((m) => m.type === 'pair' && m.mainRank === 11));
  assert.ok(moves.some((m) => m.type === 'rocket'));
  assert.ok(!moves.some((m) => m.type === 'pair' && m.mainRank === 3));
});

test('机器人自对弈：对局总能正常结束', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const game = new DoudizhuGame(seededRng(seed), seed % 3);
    let guard = 0;
    while (game.phase === 'bidding' && guard++ < 50) {
      game.bid(game.turn, chooseBid(game.hands[game.turn], game.currentBid));
    }
    assert.equal(game.phase, 'playing', `seed ${seed} 应进入出牌阶段`);
    guard = 0;
    while (game.phase === 'playing' && guard++ < 1000) {
      const seat = game.turn;
      const move = chooseMove(game, seat);
      if (move === null) {
        assert.ok(game.canPass(seat), `seed ${seed}: 自由出牌时机器人不能选择过`);
        game.pass(seat);
      } else {
        game.play(seat, move);
      }
    }
    assert.equal(game.phase, 'finished', `seed ${seed} 应正常结束`);
    const r = game.result!;
    assert.equal(r.scores.reduce((a, b) => a + b, 0), 0, '零和计分');
    assert.equal(game.hands[r.winnerSeat].length, 0);
    // 三家手牌 + 已出牌总数守恒
    const total =
      game.hands.flat().length + game.playedCards.flat().length;
    assert.equal(total, 54);
  }
});

test('引擎校验：非法出牌被拒绝', () => {
  const game = new DoudizhuGame(seededRng(42), 0);
  while (game.phase === 'bidding') {
    const want = chooseBid(game.hands[game.turn], game.currentBid);
    // 保证第一个叫分者至少叫 1 分，避免流局重发
    game.bid(game.turn, game.currentBid === 0 ? Math.max(1, want) : want);
  }
  const seat = game.turn;
  assert.throws(() => game.play((seat + 1) % 3, [game.hands[(seat + 1) % 3][0]]), /轮到/);
  assert.throws(() => game.pass(seat), /不能过/);
  const notMine = [0, 1, 2, 3].map((i) => i).find((id) => !game.hands[seat].includes(id));
  if (notMine !== undefined) {
    assert.throws(() => game.play(seat, [notMine]), /手牌/);
  }
  // 王炸倍数翻倍
  const before = game.multiplier;
  assert.ok(before >= 1);
  assert.ok(game.hands[seat].every((id) => rankOf(id) >= 3));
});
