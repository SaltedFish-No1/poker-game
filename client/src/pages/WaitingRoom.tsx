import { Badge, Button, Panel } from '../ui';
import type { RoomInfo } from '../types';

export function WaitingRoom({
  room,
  myId,
  onAddBot,
  onRemoveBot,
  onStart,
  onLeave,
}: {
  room: RoomInfo;
  myId: string;
  onAddBot: () => void;
  onRemoveBot: (seat: number) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const isHost = room.hostId === myId;
  const seats = Array.from({ length: room.maxPlayers }, (_, seat) =>
    room.players.find((p) => p.seat === seat) ?? null,
  );

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>{room.name}</h3>
          <Badge tone="gold">{room.gameName}</Badge>
          <Badge>{room.mode === 'single' ? '单人' : '多人'}</Badge>
        </div>

        <div className="wait-seats">
          {seats.map((p, seat) =>
            p ? (
              <div key={seat} className="wait-seat">
                <div className="avatar">{p.isBot ? '🤖' : '🧑'}</div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.id === room.hostId && <Badge tone="gold">房主</Badge>}
                  {p.isBot ? (
                    <Badge>AI</Badge>
                  ) : p.connected ? (
                    <Badge tone="green">在线</Badge>
                  ) : (
                    <Badge tone="red">断线</Badge>
                  )}
                </div>
                {isHost && p.isBot && (
                  <Button size="sm" variant="ghost" onClick={() => onRemoveBot(seat)}>
                    移除
                  </Button>
                )}
              </div>
            ) : (
              <div key={seat} className="wait-seat empty">
                <div className="avatar" style={{ opacity: 0.5 }}>💺</div>
                <div>等待玩家…</div>
                {isHost && (
                  <Button size="sm" variant="secondary" onClick={onAddBot}>
                    + 添加 AI
                  </Button>
                )}
              </div>
            ),
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button variant="ghost" onClick={onLeave}>
            离开房间
          </Button>
          {isHost && (
            <Button variant="primary" size="lg" onClick={onStart}>
              开始游戏{room.players.length < room.maxPlayers ? '（空位自动补 AI）' : ''}
            </Button>
          )}
        </div>
        {!isHost && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', marginBottom: 0 }}>
            等待房主开始游戏…
          </p>
        )}
      </Panel>
    </div>
  );
}
