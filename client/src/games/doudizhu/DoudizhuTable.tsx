import { useEffect, useMemo, useRef, useState } from 'react';
import { CardRow, PlayingCard } from '../../components/PlayingCard';
import { Confetti, FxLayer, useTableEffects } from '../../components/Effects';
import { Badge, Button, Modal } from '../../ui';
import {
  COMBO_NAMES,
  DoudizhuView,
  GameAction,
  RoomInfo,
  sortCardsDesc,
} from '../../types';

const DOUBLE_COUNTDOWN_S = 10;
const MUST_PASS_AUTO_MS = 1500;

/**
 * 斗地主牌桌。座位映射：右侧为下家 (seat+1)，左侧为上家 (seat+2)。
 */
export function DoudizhuTable({
  room,
  view,
  myId,
  onAction,
  onHint,
  onAutoPlay,
  onAgain,
  onLeave,
  canAddFriend,
  onAddFriend,
}: {
  room: RoomInfo;
  view: DoudizhuView;
  myId: string;
  onAction: (action: GameAction) => Promise<void>;
  onHint: () => Promise<GameAction | null>;
  onAutoPlay: (enabled: boolean) => void;
  onAgain: () => void;
  onLeave: () => void;
  canAddFriend: (playerId: string) => boolean;
  onAddFriend: (playerId: string) => void;
}) {
  const me = view.seat;
  const rightSeat = (me + 1) % 3;
  const leftSeat = (me + 2) % 3;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [resultOpen, setResultOpen] = useState(true);
  const [surrenderOpen, setSurrenderOpen] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [countdown, setCountdown] = useState(DOUBLE_COUNTDOWN_S);
  const actingRef = useRef(false);
  const prevPhase = useRef<string>('');

  const playerAt = (seat: number) => room.players.find((p) => p.seat === seat);
  const myPlayer = playerAt(me);
  const autoPlay = myPlayer?.autoPlay ?? false;
  const myTurn = view.phase !== 'finished' && view.turn === me && !autoPlay;
  const hand = useMemo(() => sortCardsDesc(view.hand), [view.hand]);
  const landlordName =
    view.landlord !== null ? playerAt(view.landlord)?.name ?? '' : '';

  const { fx, shaking } = useTableEffects(view, landlordName);

  // 发牌动画：进入叫分阶段时触发
  useEffect(() => {
    if (view.phase === 'bidding' && prevPhase.current !== 'bidding') {
      setDealing(true);
      const t = setTimeout(() => setDealing(false), 1400);
      return () => clearTimeout(t);
    }
    prevPhase.current = view.phase;
  }, [view.phase]);
  useEffect(() => {
    prevPhase.current = view.phase;
  }, [view.phase]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((c) => view.hand.includes(c)));
      return next.size === prev.size ? prev : next;
    });
  }, [view.hand]);

  useEffect(() => {
    if (view.phase === 'finished') setResultOpen(true);
  }, [view.phase]);

  // 加倍倒计时：超时自动不加倍
  const doublingMyTurn = view.phase === 'doubling' && view.turn === me && !autoPlay;
  useEffect(() => {
    if (!doublingMyTurn) return;
    setCountdown(DOUBLE_COUNTDOWN_S);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          if (!actingRef.current) {
            actingRef.current = true;
            onAction({ type: 'double', double: false })
              .catch(() => undefined)
              .finally(() => (actingRef.current = false));
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doublingMyTurn]);

  // 要不起：短暂展示后自动过牌
  useEffect(() => {
    if (!(myTurn && view.phase === 'playing' && view.mustPass)) return;
    const t = setTimeout(() => {
      if (actingRef.current) return;
      actingRef.current = true;
      onAction({ type: 'pass' })
        .catch(() => undefined)
        .finally(() => (actingRef.current = false));
      setSelected(new Set());
    }, MUST_PASS_AUTO_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, view.phase, view.mustPass, view.turn]);

  const toggle = (card: number) => {
    if (view.phase !== 'playing' || autoPlay) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(card)) next.delete(card);
      else next.add(card);
      return next;
    });
  };

  const doPlay = async () => {
    await onAction({ type: 'play', cards: [...selected] });
    setSelected(new Set());
  };

  const doHint = async () => {
    const action = await onHint();
    if (action?.type === 'play' && Array.isArray(action.cards)) {
      setSelected(new Set(action.cards as number[]));
    } else if (action?.type === 'pass') {
      await onAction({ type: 'pass' });
      setSelected(new Set());
    }
  };

  const bidOf = (seat: number) => {
    for (let i = view.bids.length - 1; i >= 0; i--) {
      if (view.bids[i].seat === seat) return view.bids[i];
    }
    return null;
  };

  const addFriendBtn = (seat: number) => {
    const p = playerAt(seat);
    if (!p || !canAddFriend(p.id)) return null;
    return (
      <Button size="sm" variant="ghost" onClick={() => onAddFriend(p.id)}>
        ＋好友
      </Button>
    );
  };

  const seatBlock = (seat: number, side: 'left' | 'right') => {
    const p = playerAt(seat);
    const move = view.lastMoves[seat];
    const bid = bidOf(seat);
    const doubled = view.doubles[seat];
    const isTurn = view.phase !== 'finished' && view.turn === seat;
    const aiControlled = p && (p.isBot || !p.connected || p.autoPlay);
    return (
      <div className={`seat ${side === 'right' ? 'seat--right' : ''}`}>
        <div className="seat__head">
          <div className={`avatar ${isTurn ? 'turn' : ''}`}>{p?.isBot ? '🤖' : '🧑'}</div>
          <div>
            <div className="seat__name">
              {p?.name ?? '…'}
              {view.landlord === seat && <Badge tone="red">地主</Badge>}
              {doubled === true && <Badge tone="gold">加倍</Badge>}
              {p && !p.isBot && !p.connected && <Badge tone="red">AI接管</Badge>}
              {p && !p.isBot && p.connected && p.autoPlay && (
                <Badge tone="gold">托管中</Badge>
              )}
              {addFriendBtn(seat)}
            </div>
            <div className="seat__count">剩 {view.handCounts[seat]} 张</div>
          </div>
        </div>
        <div className="seat__lastmove">
          {view.phase === 'bidding' ? (
            isTurn ? (
              <Thinking text="叫分中" />
            ) : bid ? (
              <span className="bid-bubble" key={`bid-${bid.score}`}>
                {bid.score === 0 ? '不叫' : `${bid.score} 分`}
              </span>
            ) : null
          ) : view.phase === 'doubling' ? (
            isTurn ? (
              <Thinking text="考虑加倍中" />
            ) : doubled !== null ? (
              <span className="bid-bubble" key={`dbl-${doubled}`}>
                {doubled ? '加倍！' : '不加倍'}
              </span>
            ) : null
          ) : isTurn ? (
            <Thinking text={aiControlled ? 'AI 思考中' : '出牌中'} />
          ) : move ? (
            move.combo ? (
              <CardRow cards={sortCardsDesc(move.combo.cards)} />
            ) : (
              <span className="pass-bubble">不出</span>
            )
          ) : null}
        </div>
      </div>
    );
  };

  const myBid = bidOf(me);
  const myMove = view.lastMoves[me];
  const result = view.result;
  const iAmLandlord = view.landlord === me;
  const roleName = iAmLandlord ? '地主' : view.landlord !== null ? '农民' : '';

  return (
    <div className={`table-page ${shaking ? 'shake' : ''}`}>
      <FxLayer fx={fx} />

      <div className="table-top">
        {seatBlock(leftSeat, 'left')}
        {seatBlock(rightSeat, 'right')}
      </div>

      <div className="table-center">
        {view.bottom ? (
          <>
            <CardRow cards={view.bottom} size="sm" />
            <div className="center-info">
              <span>底牌</span>
              <span>
                底分 <b className="mult">{view.baseScore}</b>
              </span>
              <span>
                倍数 <b className="mult">×{view.multiplier}</b>
              </span>
              {view.doubles[me] === true && <Badge tone="gold">我已加倍</Badge>}
            </div>
          </>
        ) : (
          <div className="center-info">
            <span>叫分阶段</span>
            {view.bids.length > 0 && (
              <span>
                当前最高：
                <b className="mult">{Math.max(...view.bids.map((b) => b.score)) || '—'}</b>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="table-bottom">
        <div className="my-area">
          <div className="my-lastmove">
            {view.phase === 'playing' && myTurn && view.mustPass ? (
              <span className="mustpass">要不起</span>
            ) : view.phase === 'bidding' && myBid && view.turn !== me ? (
              <span className="bid-bubble">{myBid.score === 0 ? '不叫' : `${myBid.score} 分`}</span>
            ) : view.phase === 'doubling' && view.doubles[me] !== null ? (
              <span className="bid-bubble">{view.doubles[me] ? '加倍！' : '不加倍'}</span>
            ) : view.phase !== 'bidding' && view.turn !== me && myMove ? (
              myMove.combo ? (
                <CardRow cards={sortCardsDesc(myMove.combo.cards)} />
              ) : (
                <span className="pass-bubble">不出</span>
              )
            ) : null}
          </div>

          <div className="action-bar">
            {autoPlay && view.phase !== 'finished' ? (
              <span className="auto-banner">
                <Badge tone="gold">托管中</Badge> AI 正在为你代打
                <Button size="sm" variant="secondary" onClick={() => onAutoPlay(false)}>
                  取消托管
                </Button>
              </span>
            ) : (
              <>
                {view.phase === 'bidding' && view.turn === me && (
                  <>
                    <Button onClick={() => onAction({ type: 'bid', score: 0 })}>不叫</Button>
                    {[1, 2, 3].map((s) => (
                      <Button
                        key={s}
                        variant={s === 3 ? 'primary' : 'secondary'}
                        disabled={s <= Math.max(0, ...view.bids.map((b) => b.score))}
                        onClick={() => onAction({ type: 'bid', score: s })}
                      >
                        {s} 分
                      </Button>
                    ))}
                  </>
                )}
                {view.phase === 'playing' && myTurn && (
                  <>
                    <Button variant="ghost" onClick={doHint} disabled={view.mustPass}>
                      提示
                    </Button>
                    <Button
                      disabled={!view.canPass}
                      onClick={async () => {
                        await onAction({ type: 'pass' });
                        setSelected(new Set());
                      }}
                    >
                      过
                    </Button>
                    <Button
                      variant="primary"
                      disabled={selected.size === 0 || view.mustPass}
                      onClick={doPlay}
                    >
                      出牌
                    </Button>
                  </>
                )}
                {view.phase === 'playing' && !myTurn && (
                  <span style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>
                    {view.toBeat
                      ? `需压过：${COMBO_NAMES[view.toBeat.combo.type]}`
                      : '等待对方出牌…'}
                  </span>
                )}
                {view.phase === 'doubling' && !doublingMyTurn && (
                  <span style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>
                    等待各家决定是否加倍…
                  </span>
                )}
              </>
            )}
          </div>

          <div
            className={`hand ${dealing ? 'dealing' : ''} ${
              myTurn && view.phase === 'playing' ? '' : 'disabled'
            }`}
          >
            {hand.map((c, i) => (
              <PlayingCard
                key={c}
                id={c}
                selected={selected.has(c)}
                onClick={() => toggle(c)}
                style={dealing ? { animationDelay: `${i * 45}ms` } : undefined}
              />
            ))}
          </div>

          <div className="my-info">
            <span>
              {myPlayer?.name}
              {roleName && `（${roleName}）`}
            </span>
            {view.phase === 'playing' && !autoPlay && (
              <>
                <Button size="sm" variant="ghost" onClick={() => onAutoPlay(true)}>
                  托管
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSurrenderOpen(true)}>
                  认输
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={onLeave}>
              离开
            </Button>
          </div>
        </div>
      </div>

      {/* 加倍确认弹窗 */}
      <Modal open={doublingMyTurn} title="是否加倍？">
        <div className="dlg-double__role">
          你是<b style={{ color: 'var(--color-primary)' }}>{roleName}</b>
          {iAmLandlord ? '，加倍后与两位农民的输赢都将翻倍' : '，加倍只影响你与地主的输赢'}
        </div>
        <div className="dlg-double__mult">
          <div className="cell">
            当前倍数
            <b>×{view.baseScore * view.multiplier}</b>
          </div>
          <span className="arrow">➜</span>
          <div className="cell up">
            加倍后
            <b>×{view.baseScore * view.multiplier * 2}</b>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          <span className="countdown">{countdown}</span>
          <Button
            onClick={() => onAction({ type: 'double', double: false })}
          >
            不加倍
          </Button>
          <Button
            variant="primary"
            onClick={() => onAction({ type: 'double', double: true })}
          >
            加倍 ×2
          </Button>
        </div>
      </Modal>

      {/* 认输确认弹窗 */}
      <Modal open={surrenderOpen} title="确认认输？" onClose={() => setSurrenderOpen(false)}>
        <p style={{ color: 'var(--color-text-dim)', marginTop: 0 }}>
          认输后本局立即按当前倍数结算，你所在阵营判负。
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setSurrenderOpen(false)}>
            再想想
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setSurrenderOpen(false);
              await onAction({ type: 'surrender' }).catch(() => undefined);
            }}
          >
            认输
          </Button>
        </div>
      </Modal>

      {/* 结算弹窗 */}
      <Modal open={view.phase === 'finished' && result !== null && resultOpen}>
        {result && (
          <div style={{ position: 'relative' }}>
            {result.scores[me] > 0 && <Confetti />}
            {result.surrenderSeat !== null && (
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <span className="stamp">认输</span>
              </div>
            )}
            <div className={`result-title ${result.scores[me] > 0 ? 'win' : 'lose'}`}>
              {result.scores[me] > 0 ? '🎉 胜利' : '💔 失败'}
            </div>
            <div className="result-sub">
              {result.surrenderSeat !== null &&
                `${playerAt(result.surrenderSeat)?.name} 认输 · `}
              {result.landlordWon ? `地主 ${landlordName} 获胜` : '农民获胜'}
              {result.spring && ' · 春天 ×2'}
              {result.antiSpring && ' · 反春 ×2'}
              {' · '}底分 {result.baseScore} × 倍数 {result.multiplier}
            </div>
            <div className="result-rows">
              {[0, 1, 2].map((seat) => {
                const p = playerAt(seat);
                const score = result.scores[seat];
                return (
                  <div key={seat} className="result-row">
                    <span>{p?.isBot ? '🤖' : '🧑'}</span>
                    <span>{p?.name}</span>
                    {view.landlord === seat && <Badge tone="red">地主</Badge>}
                    {result.doubles[seat] === true && <Badge tone="gold">加倍</Badge>}
                    {seat === me && <Badge tone="gold">我</Badge>}
                    {p && canAddFriend(p.id) && (
                      <Button size="sm" variant="ghost" onClick={() => onAddFriend(p.id)}>
                        ＋好友
                      </Button>
                    )}
                    <span className="spacer" />
                    <span className={score >= 0 ? 'score-pos' : 'score-neg'}>
                      {score > 0 ? `+${score}` : score}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button variant="ghost" onClick={onLeave}>
                返回大厅
              </Button>
              <Button variant="secondary" onClick={() => setResultOpen(false)}>
                查看牌桌
              </Button>
              {room.hostId === myId && (
                <Button variant="primary" onClick={onAgain}>
                  再来一局
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  return (
    <span className="thinking">
      {text}
      <i />
      <i />
      <i />
    </span>
  );
}
