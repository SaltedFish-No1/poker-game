import { useCallback, useEffect, useRef, useState } from 'react';
import { socket, request } from './socket';
import { Badge, Button, Input, Modal, ToastStack, ToastItem } from './ui';
import { Lobby } from './pages/Lobby';
import { WaitingRoom } from './pages/WaitingRoom';
import { DesignPage } from './pages/DesignPage';
import { DoudizhuTable } from './games/doudizhu/DoudizhuTable';
import type {
  DoudizhuView,
  FriendInfo,
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
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [incoming, setIncoming] = useState<Array<{ id: string; name: string }>>([]);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [pendingOut, setPendingOut] = useState<Set<string>>(new Set());
  const toastSeq = useRef(0);
  const myRoomId = useRef<string | null>(null);

  const toast = useCallback((text: string, tone: ToastItem['tone'] = 'error') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    localStorage.setItem('playerName', name);
    // 向服务端注册昵称（好友系统使用）
    if (socket.connected) {
      request('player:hello', { name }).catch(() => undefined);
    }
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
    const onConnect = () => {
      setConnected(true);
      request('player:hello', {
        name: localStorage.getItem('playerName') ?? '',
      }).catch(() => undefined);
    };
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
    const onFriendList = (d: { friends: FriendInfo[] }) => setFriends(d.friends ?? []);
    const onFriendIncoming = (d: { id: string; name: string }) =>
      setIncoming((q) => (q.some((x) => x.id === d.id) ? q : [...q, d]));
    const onFriendAccepted = (d: { name: string }) =>
      toast(`${d.name} 通过了你的好友申请`, 'success');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby:rooms', onRooms);
    socket.on('room:update', onRoomUpdate);
    socket.on('game:state', onGameState);
    socket.on('friend:list', onFriendList);
    socket.on('friend:incoming', onFriendIncoming);
    socket.on('friend:accepted', onFriendAccepted);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby:rooms', onRooms);
      socket.off('room:update', onRoomUpdate);
      socket.off('game:state', onGameState);
      socket.off('friend:list', onFriendList);
      socket.off('friend:incoming', onFriendIncoming);
      socket.off('friend:accepted', onFriendAccepted);
    };
  }, [toast]);

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

  const canAddFriend = (playerId: string) =>
    playerId !== (socket.id ?? '') &&
    !playerId.startsWith('bot:') &&
    !friends.some((f) => f.id === playerId) &&
    !pendingOut.has(playerId);

  const handleAddFriend = async (playerId: string) => {
    try {
      await request('friend:request', { toId: playerId });
      setPendingOut((s0) => new Set(s0).add(playerId));
      toast('好友申请已发送', 'success');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const respondFriend = async (fromId: string, accept: boolean) => {
    setIncoming((q) => q.filter((x) => x.id !== fromId));
    try {
      await request('friend:respond', { fromId, accept });
    } catch (e) {
      toast((e as Error).message);
    }
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
        onAutoPlay={(enabled) => wrap(() => request('game:auto', { enabled }))()}
        onAgain={wrap(() => request('room:again'))}
        onLeave={handleLeave}
        canAddFriend={canAddFriend}
        onAddFriend={handleAddFriend}
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
        canAddFriend={canAddFriend}
        onAddFriend={handleAddFriend}
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
          <Button size="sm" variant="ghost" onClick={() => setFriendsOpen(true)}>
            👥 好友{friends.length > 0 ? ` (${friends.filter((f) => f.online).length}/${friends.length})` : ''}
          </Button>
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
      {/* 好友申请弹窗（对应《好友申请与加倍确认弹窗》设计文件） */}
      <Modal open={incoming.length > 0} title="好友申请">
        {incoming[0] && (
          <>
            <div className="dlg-friend__from">
              <div className="avatar">🧑</div>
              <div>
                <div className="who">{incoming[0].name}</div>
                <div className="desc">请求加你为好友，成为好友后可以互相看到在线状态</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => respondFriend(incoming[0].id, false)}>
                拒绝
              </Button>
              <Button variant="primary" onClick={() => respondFriend(incoming[0].id, true)}>
                同意
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* 好友列表 */}
      <Modal open={friendsOpen} title="我的好友" onClose={() => setFriendsOpen(false)}>
        {friends.length === 0 ? (
          <p style={{ color: 'var(--color-text-dim)' }}>
            还没有好友——在房间或结算界面对其他玩家点「＋好友」发起申请。
            （当前为会话内好友，断线后重置）
          </p>
        ) : (
          <div className="friends-list">
            {friends.map((f) => (
              <div key={f.id} className="friend-row">
                <span className={`dot ${f.online ? 'online' : ''}`} />
                <span className="fname">{f.name}</span>
                <span className="fstate">{f.online ? '在线' : '离线'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ToastStack toasts={toasts} />
    </>
  );
}
