import { useEffect, useMemo, useState } from 'react';
import { CardRow, PlayingCard } from '../../components/PlayingCard';
import { Badge, Button, Modal } from '../../ui';
import {
  COMBO_NAMES,
  DoudizhuView,
  GameAction,
  RoomInfo,
  sortCardsDesc,
} from '../../types';

/**
 * 斗地主牌桌。座位映射：右侧为下家 (seat+1)，左侧为上家 (seat+2)。
 */
export function DoudizhuTable({
  room,
  view,
  myId,
  onAction,
  onHint,
  onAgain,
  onLeave,
}: {
  room: RoomInfo;
  view: DoudizhuView;
  myId: string;
  onAction: (action: GameAction) => Promise<void>;
  onHint: () => Promise<GameAction | null>;
  onAgain: () => void;
  onLeave: () => void;
}) {
  const me = view.seat;
  const rightSeat = (me + 1) % 3;
  const leftSeat = (me + 2) % 3;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [resultOpen, setResultOpen] = useState(true);

  const myTurn = view.phase !== 'finished' && view.turn === me;
  const hand = useMemo(() => sortCardsDesc(view.hand), [view.hand]);

  useEffect(() => {
    // 新对局/手牌变化时清掉无效选择
    setSelected((prev) => {
      const next = new Set([...prev].filter((c) => view.hand.includes(c)));
      return next.size === prev.size ? prev : next;
    });
  }, [view.hand]);

  useEffect(() => {
    if (view.phase === 'finished') setResultOpen(true);
  }, [view.phase]);

  const toggle = (card: number) => {
    if (view.phase !== 'playing') return;
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

  const playerAt = (seat: number) => room.players.find((p) => p.seat === seat);

  const bidOf = (seat: number) => {
    for (let i = view.bids.length - 1; i >= 0; i--) {
      if (view.bids[i].seat === seat) return view.bids[i];
    }
    return null;
  };

  const seatBlock = (seat: number, side: 'left' | 'right') => {
    const p = playerAt(seat);
    const move = view.lastMoves[seat];
    const bid = bidOf(seat);
    const isTurn = view.phase !== 'finished' && view.turn === seat;
    return (
      <div className={`seat ${side === 'right' ? 'seat--right' : ''}`}>
        <div className="seat__head">
          <div className={`avatar ${isTurn ? 'turn' : ''}`}>{p?.isBot ? '🤖' : '🧑'}</div>
          <div>
            <div className="seat__name">
              {p?.name ?? '…'}
              {view.landlord === seat && <Badge tone="red">地主</Badge>}
              {p && !p.isBot && !p.connected && <Badge tone="red">AI接管</Badge>}
            </div>
            <div className="seat__count">剩 {view.handCounts[seat]} 张</div>
          </div>
        </div>
        <div className="seat__lastmove">
          {view.phase === 'bidding' ? (
            isTurn ? (
              <Thinking text="叫分中" />
            ) : bid ? (
              <span className="bid-bubble">{bid.score === 0 ? '不叫' : `${bid.score} 分`}</span>
            ) : null
          ) : isTurn ? (
            <Thinking text={p?.isBot || !p?.connected ? 'AI 思考中' : '出牌中'} />
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
  const landlordName = view.landlord !== null ? playerAt(view.landlord)?.name : '';

  return (
    <div className="table-page">
      <div className="table-top">
        {seatBlock(leftSeat, 'left')}
        {seatBlock(rightSeat, 'right')}
      </div>

      <div className="table-center">
        {view.bottom ? (
          <>
            <CardRow cards={view.bottom} />
            <div className="center-info">
              <span>底牌</span>
              <span>
                底分 <b className="mult">{view.baseScore}</b>
              </span>
              <span>
                倍数 <b className="mult">×{view.multiplier}</b>
              </span>
            </div>
          </>
        ) : (
          <div className="center-info">
            <span>叫分阶段</span>
            {view.bids.length > 0 && (
              <span>
                当前最高：
                <b className="mult">
                  {Math.max(...view.bids.map((b) => b.score)) || '—'}
                </b>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="table-bottom">
        <div className="my-area">
          <div className="my-lastmove">
            {view.phase === 'bidding' && myBid && !myTurn ? (
              <span className="bid-bubble">{myBid.score === 0 ? '不叫' : `${myBid.score} 分`}</span>
            ) : view.phase !== 'bidding' && !myTurn && myMove ? (
              myMove.combo ? (
                <CardRow cards={sortCardsDesc(myMove.combo.cards)} />
              ) : (
                <span className="pass-bubble">不出</span>
              )
            ) : null}
          </div>

          <div className="action-bar">
            {view.phase === 'bidding' && myTurn && (
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
                <Button variant="ghost" onClick={doHint}>
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
                <Button variant="primary" disabled={selected.size === 0} onClick={doPlay}>
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
          </div>

          <div className={`hand ${myTurn && view.phase === 'playing' ? '' : 'disabled'}`}>
            {hand.map((c) => (
              <PlayingCard
                key={c}
                id={c}
                selected={selected.has(c)}
                onClick={() => toggle(c)}
              />
            ))}
          </div>

          <div className="my-info">
            <span>
              {playerAt(me)?.name}
              {view.landlord === me ? '（地主）' : view.landlord !== null ? '（农民）' : ''}
            </span>
            <Button size="sm" variant="ghost" onClick={onLeave}>
              离开
            </Button>
          </div>
        </div>
      </div>

      <Modal open={view.phase === 'finished' && result !== null && resultOpen}>
        {result && (
          <>
            <div className="result-title">
              {result.scores[me] > 0 ? '🎉 胜利' : '💔 失败'}
            </div>
            <div className="result-sub">
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
                    {seat === me && <Badge tone="gold">我</Badge>}
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
          </>
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
