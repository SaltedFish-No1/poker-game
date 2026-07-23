import type { CSSProperties } from 'react';
import { RANK_LABELS, SUIT_LABELS, rankOf, suitOf } from '../types';

export type CardSize = 'sm' | 'md' | 'lg';

/**
 * 扑克牌牌面组件（规范见 docs/UI-UX-SPEC.md §4）。
 * - 普通牌：左上角竖排点数+花色，右下角大花色符号
 * - 王牌：竖排「大王/小王」+ ★
 * - back 模式渲染牌背
 */
export function PlayingCard({
  id,
  size = 'md',
  selected = false,
  onClick,
  style,
}: {
  id: number;
  size?: CardSize;
  selected?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const rank = rankOf(id);
  const isJoker = rank >= 16;
  const red = isJoker ? rank === 17 : suitOf(id) === 2 || suitOf(id) === 0;
  const colorCls = red ? 'pcard--red' : 'pcard--black';
  return (
    <div
      className={`pcard pcard--${size} ${colorCls} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={style}
    >
      {isJoker ? (
        <>
          <span className="pcard__joker">{RANK_LABELS[rank]}</span>
          <span className="pcard__star">★</span>
        </>
      ) : (
        <>
          <span className="pcard__corner">
            {RANK_LABELS[rank]}
            <span className="suit">{SUIT_LABELS[suitOf(id)]}</span>
          </span>
          <span className="pcard__pip">{SUIT_LABELS[suitOf(id)]}</span>
        </>
      )}
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: CardSize }) {
  return <div className={`pcard pcard--${size} pcard--back`} />;
}

/** 一排紧凑展示的牌（他人出牌、底牌等） */
export function CardRow({ cards, size = 'sm' }: { cards: number[]; size?: CardSize }) {
  return (
    <div className="cardrow">
      {cards.map((c) => (
        <PlayingCard key={c} id={c} size={size} />
      ))}
    </div>
  );
}
