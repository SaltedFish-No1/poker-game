import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, request } from './socket';
import { Badge, Button, Input, Modal, ToastStack, ToastItem } from './ui';
import { Lobby } from './pages/Lobby';
import { WaitingRoom } from './pages/WaitingRoom';
import { DesignPage } from './pages/DesignPage';
import { DoudizhuTable } from './games/doudizhu/DoudizhuTable';
import type {
  DoudizhuView,
  GameAction,
  GameCatalogItem,
  RoomInfo,
  RoomMode,
} from './types';

function randomName() {
  const names = ['小满', '阿豆', '飞飞', '大牛', '铁蛋', '桃子', '球球', '大圣'];
  return `${names[Math.floor(Math.random() * names.length)]}${Math.floor(Math.random() * 90 + 10)}`;
}

export default function App() {
  const [hashRoute, setHashRoute] = useState(location.hash);
  const [connected, setConnected] = useState(socket.connected);
  const [name, setName] = useState(
    () => localStorage.getItem('playerName') ?? randomName(),
  );
  const [editingName, setEditingName] = useState(false);
  const [games, setGames] = useState<GameCatalogItem[]>([]);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null);
  const [myRoom, setMyRoom] = useState<RoomInfo | null>(null);
  const [gameView, setGameView] = useState<DoudizhuView | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const myRoomId = useRef<string | null>(null);

  const toast = useCallback((text: string, tone: ToastItem['tone'] = 'error') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    localStorage.setItem('playerName', name);
  }, [name]);

  useEffect(() => {
    const onHash = () => setHashRoute(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    fetch('/api/games')
      .then((r) => r.json())
      .then((d) => setGames(d.games ?? []))
      .catch(() => toast('无法连接服务器，请确认后端已启动'));
    fetch('/api/status')
      .then((r) => r.json())
      .then((d) => setLlmEnabled(Boolean(d.llm)))
      .catch(() => undefined);
  }, [toast]);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      // 断线即被移出房间（服务端同样处理）
      myRoomId.current = null;
      setMyRoom(null);
      setGameView(null);
    };
    const onRooms = (d: { rooms: RoomInfo[] }) => setRooms(d.rooms ?? []);
    const onRoomUpdate = (d: { room: RoomInfo }) => {
      if (d.room.id === myRoomId.current) setMyRoom(d.room);
    };
    const onGameState = (d: { roomId: string; view: DoudizhuView }) => {
      if (d.roomId === myRoomId.current) setGameView(d.view);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby:rooms', onRooms);
    socket.on('room:update', onRoomUpdate);
    socket.on('game:state', onGameState);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby:rooms', onRooms);
      socket.off('room:update', onRoomUpdate);
      socket.off('game:state', onGameState);
    };
  }, []);

  const enterRoom = (roomId: string) => {
    myRoomId.current = roomId;
    const found = rooms.find((r) => r.id === roomId);
    if (found) setMyRoom(found);
    // 拉取当前房间与对局状态（单人模式建房即开局，广播先于 ack 到达会被丢弃）
    request('room:sync').catch(() => undefined);
  };

  const handleCreate = async (gameId: string, roomName: string, mode: RoomMode) => {
    try {
      const d = await request<{ roomId: string }>('room:create', {
        gameId,
        roomName,
        mode,
        playerName: name,
      });
      enterRoom(d.roomId);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const handleJoin = async (roomId: string) => {
    try {
      const d = await request<{ roomId: string }>('room:join', {
        roomId,
        playerName: name,
      });
      enterRoom(d.roomId);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const handleLeave = async () => {
    try {
      await request('room:leave');
    } catch {
      /* 离开失败也回大厅 */
    }
    myRoomId.current = null;
    setMyRoom(null);
    setGameView(null);
  };

  const handleAction = async (action: GameAction) => {
    try {
      await request('game:action', { action });
    } catch (e) {
      toast((e as Error).message);
      throw e;
    }
  };

  const handleHint = async (): Promise<GameAction | null> => {
    try {
      const d = await request<{ action: GameAction | null }>('game:hint');
      return d.action;
    } catch {
      return null;
    }
  };

  const wrap = (fn: () => Promise<unknown>) => () => {
    fn().catch((e: Error) => toast(e.message));
  };

  const isDesign = hashRoute.startsWith('#/design');

  let content;
  if (isDesign) {
    content = <DesignPage />;
  } else if (myRoom && myRoom.status !== 'waiting' && gameView) {
    content = (
      <DoudizhuTable
        room={myRoom}
        view={gameView}
        myId={socket.id ?? ''}
        onAction={handleAction}
        onHint={handleHint}
        onAgain={wrap(() => request('room:again'))}
        onLeave={handleLeave}
      />
    );
  } else if (myRoom) {
    content = (
      <WaitingRoom
        room={myRoom}
        myId={socket.id ?? ''}
        onAddBot={wrap(() => request('room:addBot'))}
        onRemoveBot={(seat) => wrap(() => request('room:removeBot', { seat }))()}
        onStart={wrap(() => request('room:start'))}
        onLeave={handleLeave}
      />
    );
  } else {
    content = (
      <Lobby
        games={games}
        rooms={rooms}
        llmEnabled={llmEnabled}
        onCreate={handleCreate}
        onJoin={handleJoin}
      />
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="logo">
          🃏 牌局<em>大厅</em>
          {isDesign && <Badge>设计规范</Badge>}
        </div>
        <div className="right">
          {llmEnabled !== null &&
            (llmEnabled ? (
              <Badge tone="gold">大模型 AI</Badge>
            ) : (
              <Badge>规则 AI</Badge>
            ))}
          {connected ? <Badge tone="green">已连接</Badge> : <Badge tone="red">连接中…</Badge>}
          <Button size="sm" variant="ghost" onClick={() => setEditingName(true)}>
            🧑 {name}
          </Button>
          <a
            href={isDesign ? '#/' : '#/design'}
            style={{ color: 'var(--color-text-dim)', fontSize: 13 }}
          >
            {isDesign ? '返回大厅' : '设计规范'}
          </a>
        </div>
      </header>
      {content}
      <Modal open={editingName} title="修改昵称" onClose={() => setEditingName(false)}>
        <div className="field">
          <Input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={() => setEditingName(false)}>
            确定
          </Button>
        </div>
      </Modal>
      <ToastStack toasts={toasts} />
    </>
  );
}
