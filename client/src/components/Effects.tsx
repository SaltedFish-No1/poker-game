import { useEffect, useRef, useState } from 'react';
import type { ComboType, DoudizhuView } from '../types';

/**
 * 牌桌特效层：监听对局视图变化，触发对应全屏特效。
 * 特效样式见 styles/effects.css（对应各《斗地主××特效》设计文件）。
 */

export type FxKind =
  | 'landlord'     // 叫地主成功
  | 'double'       // 加倍
  | 'straight'     // 顺子
  | 'pairStraight' // 连对
  | 'triple'       // 三带一/三带二
  | 'plane'        // 飞机
  | 'bomb'         // 炸弹
  | 'rocket';      // 王炸

export interface FxEvent {
  id: number;
  kind: FxKind;
  text: string;
}

const COMBO_FX: Partial<Record<ComboType, { kind: FxKind; text: string }>> = {
  straight: { kind: 'straight', text: '顺子' },
  pairStraight: { kind: 'pairStraight', text: '连对' },
  triple1: { kind: 'triple', text: '三带一' },
  triple2: { kind: 'triple', text: '三带二' },
  plane: { kind: 'plane', text: '飞机' },
  plane1: { kind: 'plane', text: '飞机' },
  plane2: { kind: 'plane', text: '飞机' },
  bomb: { kind: 'bomb', text: '炸弹' },
  rocket: { kind: 'rocket', text: '王炸' },
};

let fxSeq = 0;

/** 根据视图 diff 计算要触发的特效；返回值供 FxLayer 渲染 */
export function useTableEffects(view: DoudizhuView, landlordName: string) {
  const [fx, setFx] = useState<FxEvent | null>(null);
  const [shaking, setShaking] = useState(false);
  const prev = useRef<DoudizhuView | null>(null);

  const trigger = (kind: FxKind, text: string) => {
    setFx({ id: ++fxSeq, kind, text });
    if (kind === 'bomb') {
      setShaking(true);
      setTimeout(() => setShaking(false), 550);
    }
  };

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    // 叫地主揭晓
    if (p.landlord === null && view.landlord !== null) {
      trigger('landlord', `${landlordName} 当上地主`);
      return;
    }
    // 加倍表态
    for (let seat = 0; seat < 3; seat++) {
      if (p.doubles[seat] === null && view.doubles[seat] === true) {
        trigger('double', '加倍 ×2');
        return;
      }
    }
    // 出牌特效：找出 lastMoves 变化的座位
    for (let seat = 0; seat < 3; seat++) {
      const before = p.lastMoves[seat];
      const after = view.lastMoves[seat];
      if (!after?.combo) continue;
      const changed =
        !before?.combo ||
        before.combo.cards.join(',') !== after.combo.cards.join(',');
      if (!changed) continue;
      const conf = COMBO_FX[after.combo.type];
      if (conf) trigger(conf.kind, conf.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => setFx(null), 1700);
    return () => clearTimeout(t);
  }, [fx]);

  return { fx, shaking, trigger };
}

export function FxLayer({ fx }: { fx: FxEvent | null }) {
  if (!fx) return null;
  return (
    <div className="fx-layer" key={fx.id}>
      {fx.kind === 'plane' && <span className="fx-plane">✈️</span>}
      {fx.kind === 'rocket' && <span className="fx-rocket">🚀</span>}
      <FxBanner fx={fx} />
    </div>
  );
}

function FxBanner({ fx }: { fx: FxEvent }) {
  const cls: Record<FxKind, string> = {
    landlord: 'fx-banner--landlord',
    double: 'fx-banner--bounce',
    straight: 'fx-banner--sweep',
    pairStraight: 'fx-banner--sweep',
    triple: 'fx-banner--bounce',
    plane: 'fx-banner--bounce',
    bomb: 'fx-banner--bomb',
    rocket: 'fx-banner--bomb',
  };
  const emoji: Partial<Record<FxKind, string>> = {
    landlord: '👑',
    double: '💰',
    bomb: '💥',
    rocket: '🃏',
    triple: '🎯',
    straight: '⚡',
    pairStraight: '🔗',
  };
  return (
    <div className={`fx-banner ${cls[fx.kind]}`}>
      {emoji[fx.kind] && <span className="fx-emoji">{emoji[fx.kind]}</span>}
      {fx.text}
    </div>
  );
}

/** 胜利彩带（结算弹窗内） */
export function Confetti() {
  const colors = ['#e8b93c', '#3ecf8e', '#5ea8ff', '#e05a4e', '#f5cc5e', '#ffffff'];
  const pieces = Array.from({ length: 20 }, (_, i) => ({
    left: `${(i * 53) % 100}%`,
    background: colors[i % colors.length],
    animationDelay: `${(i % 8) * 0.25}s`,
    animationDuration: `${2 + ((i * 7) % 10) / 8}s`,
  }));
  return (
    <div className="confetti">
      {pieces.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}
