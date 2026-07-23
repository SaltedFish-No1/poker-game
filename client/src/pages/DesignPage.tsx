import { useState } from 'react';
import { CardBack, CardRow, PlayingCard } from '../components/PlayingCard';
import { Badge, Button, Input, Modal, Panel, Segmented } from '../ui';

/**
 * 设计规范展示页（#/design）
 * 对应设计文件：《基础控件展示页.dc.html》《扑克牌牌面.dc.html》
 * 规范文档：docs/UI-UX-SPEC.md
 */
export function DesignPage() {
  const [seg, setSeg] = useState<'single' | 'multi'>('single');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set([16]));

  const toggle = (c: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });

  const tokens: Array<[string, string]> = [
    ['--color-bg', '页面底色'],
    ['--color-surface', '面板'],
    ['--color-surface-2', '面板悬浮'],
    ['--color-primary', '主操作 · 金'],
    ['--color-accent', '成功 · 绿'],
    ['--color-danger', '危险 · 红'],
    ['--color-info', '信息 · 蓝'],
    ['--suit-red', '红花色'],
    ['--card-face', '牌面底色'],
  ];

  return (
    <div className="page">
      <h2>UI/UX 设计规范</h2>
      <p style={{ color: 'var(--color-text-dim)' }}>
        设计令牌见 <code>client/src/design/tokens.css</code>，完整规范见{' '}
        <code>docs/UI-UX-SPEC.md</code>。
      </p>

      {/* ===== 基础控件展示页 ===== */}
      <div className="section-title">基础控件展示页</div>

      <div className="design-section">
        <h4>色彩令牌</h4>
        <div className="design-row">
          {tokens.map(([token, label]) => (
            <div key={token} className="swatch">
              <div className="chip" style={{ background: `var(${token})` }} />
              <div className="label">{label}</div>
              <div className="value">{token}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="design-section">
        <h4>Button 按钮</h4>
        <div className="design-row">
          <Button variant="primary">主操作</Button>
          <Button variant="secondary">次操作</Button>
          <Button variant="ghost">幽灵按钮</Button>
          <Button variant="danger">危险操作</Button>
          <Button variant="primary" disabled>
            禁用态
          </Button>
        </div>
        <div className="design-row" style={{ marginTop: 12 }}>
          <Button variant="primary" size="sm">
            小 32
          </Button>
          <Button variant="primary" size="md">
            中 40
          </Button>
          <Button variant="primary" size="lg">
            大 48
          </Button>
        </div>
      </div>

      <div className="design-section">
        <h4>Input 输入框</h4>
        <div className="design-row">
          <div style={{ width: 240 }}>
            <Input placeholder="占位文字…" />
          </div>
          <div style={{ width: 240 }}>
            <Input defaultValue="已输入内容" />
          </div>
        </div>
      </div>

      <div className="design-section">
        <h4>Badge 徽章</h4>
        <div className="design-row">
          <Badge>默认</Badge>
          <Badge tone="gold">房主</Badge>
          <Badge tone="green">在线</Badge>
          <Badge tone="red">地主</Badge>
        </div>
      </div>

      <div className="design-section">
        <h4>Segmented 分段选择</h4>
        <Segmented
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'single', label: '单人（与 AI 对战）' },
            { value: 'multi', label: '多人（好友联机）' },
          ]}
        />
      </div>

      <div className="design-section">
        <h4>Panel 面板 / Modal 弹窗</h4>
        <div className="design-row">
          <Panel>
            <b>面板标题</b>
            <p style={{ color: 'var(--color-text-dim)', margin: '8px 0 0' }}>
              面板正文内容，圆角 16、描边 + 阴影。
            </p>
          </Panel>
          <Button onClick={() => setModalOpen(true)}>打开 Modal</Button>
        </div>
        <Modal open={modalOpen} title="示例弹窗" onClose={() => setModalOpen(false)}>
          <p style={{ color: 'var(--color-text-dim)' }}>
            遮罩 55% 黑 + 8px 模糊；点击遮罩关闭。
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              确认
            </Button>
          </div>
        </Modal>
      </div>

      {/* ===== 扑克牌牌面 ===== */}
      <div className="section-title">扑克牌牌面</div>

      <div className="design-section">
        <h4>点数与花色（同点四花色 + 王）</h4>
        <div className="design-row">
          {/* A 的四种花色：suit 顺序 ♦ ♣ ♥ ♠ */}
          {[44, 45, 46, 47].map((id) => (
            <PlayingCard key={id} id={id} />
          ))}
          <PlayingCard id={52} />
          <PlayingCard id={53} />
          <CardBack />
        </div>
      </div>

      <div className="design-section">
        <h4>全点数一览（♠）</h4>
        <CardRow
          size="sm"
          cards={[3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51]}
        />
      </div>

      <div className="design-section">
        <h4>尺寸（sm 46 / md 68 / lg 80）</h4>
        <div className="design-row">
          <PlayingCard id={47} size="sm" />
          <PlayingCard id={47} size="md" />
          <PlayingCard id={47} size="lg" />
        </div>
      </div>

      <div className="design-section">
        <h4>手牌扇形与选中态（点击试试）</h4>
        <div className="hand" style={{ justifyContent: 'flex-start' }}>
          {[0, 4, 8, 12, 16, 20, 24, 28].map((id) => (
            <PlayingCard
              key={id}
              id={id}
              selected={selected.has(id)}
              onClick={() => toggle(id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
