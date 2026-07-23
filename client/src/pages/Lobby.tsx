import { useState } from 'react';
import { Badge, Button, Input, Modal, Panel, Segmented } from '../ui';
import type { GameCatalogItem, RoomInfo, RoomMode } from '../types';

export function Lobby({
  games,
  rooms,
  llmEnabled,
  onCreate,
  onJoin,
}: {
  games: GameCatalogItem[];
  rooms: RoomInfo[];
  llmEnabled: boolean | null;
  onCreate: (gameId: string, roomName: string, mode: RoomMode) => void;
  onJoin: (roomId: string) => void;
}) {
  const [createFor, setCreateFor] = useState<GameCatalogItem | null>(null);
  const [roomName, setRoomName] = useState('');
  const [mode, setMode] = useState<RoomMode>('single');

  const joinable = (r: RoomInfo) =>
    r.mode === 'multi' && r.status === 'waiting' && r.players.length < r.maxPlayers;

  return (
    <div className="page">
      <div className="section-title">选择玩法</div>
      <div className="game-grid">
        {games.map((g) => (
          <div
            key={g.id}
            className={`game-card ${g.available ? '' : 'disabled'}`}
            onClick={() => {
              if (!g.available) return;
              setCreateFor(g);
              setRoomName('');
              setMode('single');
            }}
          >
            <h4>{g.name}</h4>
            <p>{g.description}</p>
            <div className="meta">
              <span className="players">
                {g.minPlayers === g.maxPlayers
                  ? `${g.maxPlayers} 人`
                  : `${g.minPlayers}-${g.maxPlayers} 人`}
              </span>
              {g.available ? (
                <Badge tone="gold">可开局</Badge>
              ) : (
                <Badge>敬请期待</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">
        房间列表
        <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-dim)' }}>
          （多人房间可加入）
        </span>
      </div>
      {rooms.length === 0 ? (
        <div className="empty-tip">
          还没有房间——点击上方玩法卡片，创建第一个房间吧
          {llmEnabled === false && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              未配置 ARK_API_KEY，单人模式将使用内置规则 AI
            </div>
          )}
        </div>
      ) : (
        <div className="room-list">
          {rooms.map((r) => (
            <div key={r.id} className="room-item">
              <div>
                <div className="name">{r.name}</div>
                <div className="sub">
                  {r.gameName} · {r.mode === 'single' ? '单人' : '多人'} ·{' '}
                  {r.players.filter((p) => !p.isBot).length}人{'+'}
                  {r.players.filter((p) => p.isBot).length}AI / {r.maxPlayers}
                </div>
              </div>
              <div className="spacer" />
              {r.status === 'waiting' ? (
                <Badge tone="green">等待中</Badge>
              ) : r.status === 'playing' ? (
                <Badge tone="gold">游戏中</Badge>
              ) : (
                <Badge>已结束</Badge>
              )}
              <Button
                variant="primary"
                size="sm"
                disabled={!joinable(r)}
                onClick={() => onJoin(r.id)}
              >
                加入
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createFor !== null}
        title={`创建「${createFor?.name}」房间`}
        onClose={() => setCreateFor(null)}
      >
        <div className="field">
          <label>模式</label>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: '单人（与 AI 对战）' },
              { value: 'multi', label: '多人（好友联机）' },
            ]}
          />
        </div>
        <div className="field">
          <label>房间名（可选）</label>
          <Input
            placeholder="例如：卧龙凤雏局"
            value={roomName}
            maxLength={20}
            onChange={(e) => setRoomName(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setCreateFor(null)}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (createFor) onCreate(createFor.id, roomName, mode);
              setCreateFor(null);
            }}
          >
            {mode === 'single' ? '立即开局' : '创建房间'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
