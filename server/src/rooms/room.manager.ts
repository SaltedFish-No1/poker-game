import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { GamesRegistry } from '../games/games.registry';
import { GameAction } from '../games/game.interface';
import { Room, RoomInfo, RoomMode, RoomPlayer } from './room.types';

const BOT_NAMES = ['AI·豆包', 'AI·小满', 'AI·阿福', 'AI·棋圣', 'AI·卧龙', 'AI·凤雏'];
const BOT_MOVE_DELAY_MS = 800;

@Injectable()
export class RoomManager {
  private readonly logger = new Logger(RoomManager.name);
  private server: Server | null = null;
  private rooms = new Map<string, Room>();
  /** socketId -> roomId */
  private memberOf = new Map<string, string>();
  private roomSeq = 1;

  constructor(private readonly registry: GamesRegistry) {}

  setServer(server: Server) {
    this.server = server;
  }

  // ---------- 大厅 ----------

  listRooms(): RoomInfo[] {
    return [...this.rooms.values()].map((r) => this.toInfo(r));
  }

  private toInfo(room: Room): RoomInfo {
    return {
      id: room.id,
      name: room.name,
      gameId: room.gameId,
      gameName: this.registry.get(room.gameId)?.name ?? room.gameId,
      mode: room.mode,
      status: room.status,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      players: room.players.map(({ id, name, seat, isBot, ready, connected }) => ({
        id, name, seat, isBot, ready, connected,
      })),
    };
  }

  // ---------- 建房 / 进出 ----------

  createRoom(
    socketId: string,
    playerName: string,
    gameId: string,
    roomName: string,
    mode: RoomMode,
  ): Room {
    if (this.memberOf.has(socketId)) throw new Error('你已在其他房间中');
    const def = this.registry.get(gameId);
    if (!def || !def.available) throw new Error('该玩法暂未开放');
    const id = `r${this.roomSeq++}`;
    const room: Room = {
      id,
      name: roomName?.trim() || `${def.name}房间 ${id}`,
      gameId,
      mode,
      status: 'waiting',
      hostId: socketId,
      players: [],
      maxPlayers: def.maxPlayers,
      match: null,
      ai: null,
      matchEpoch: 0,
    };
    this.rooms.set(id, room);
    this.seatPlayer(room, {
      id: socketId, name: playerName, seat: -1, isBot: false, ready: true, connected: true,
    });
    this.memberOf.set(socketId, id);
    this.socketJoin(socketId, id);

    if (mode === 'single') {
      this.fillWithBots(room);
      this.startMatch(room);
    }
    this.broadcastLobby();
    this.broadcastRoom(room);
    return room;
  }

  joinRoom(socketId: string, playerName: string, roomId: string): Room {
    if (this.memberOf.has(socketId)) throw new Error('你已在其他房间中');
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');
    if (room.mode === 'single') throw new Error('单人房间不可加入');
    if (room.status !== 'waiting') throw new Error('对局已开始，无法加入');
    if (room.players.length >= room.maxPlayers) {
      // 若有机器人则顶替一个机器人
      const bot = room.players.find((p) => p.isBot);
      if (!bot) throw new Error('房间已满');
      room.players = room.players.filter((p) => p !== bot);
    }
    this.seatPlayer(room, {
      id: socketId, name: playerName, seat: -1, isBot: false, ready: true, connected: true,
    });
    this.memberOf.set(socketId, roomId);
    this.socketJoin(socketId, roomId);
    this.broadcastLobby();
    this.broadcastRoom(room);
    return room;
  }

  leaveRoom(socketId: string) {
    const roomId = this.memberOf.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    this.memberOf.delete(socketId);
    this.socketLeave(socketId, roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return;

    if (room.status === 'playing') {
      // 对局中离开：标记断线，AI 接管其座位继续打完
      player.connected = false;
      this.pump(room);
    } else {
      room.players = room.players.filter((p) => p !== player);
    }

    const humansLeft = room.players.some((p) => !p.isBot && p.connected);
    if (!humansLeft) {
      this.rooms.delete(roomId);
    } else if (room.hostId === socketId) {
      const nextHost = room.players.find((p) => !p.isBot && p.connected);
      if (nextHost) room.hostId = nextHost.id;
    }
    this.broadcastLobby();
    if (this.rooms.has(roomId)) this.broadcastRoom(room);
  }

  onDisconnect(socketId: string) {
    this.leaveRoom(socketId);
  }

  private seatPlayer(room: Room, player: RoomPlayer) {
    const used = new Set(room.players.map((p) => p.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    if (seat >= room.maxPlayers) throw new Error('房间已满');
    player.seat = seat;
    room.players.push(player);
    room.players.sort((a, b) => a.seat - b.seat);
  }

  // ---------- 机器人 ----------

  addBot(socketId: string): Room {
    const room = this.requireRoom(socketId);
    this.requireHost(room, socketId);
    if (room.status !== 'waiting') throw new Error('对局已开始');
    if (room.players.length >= room.maxPlayers) throw new Error('房间已满');
    this.fillWithBots(room, 1);
    this.broadcastLobby();
    this.broadcastRoom(room);
    return room;
  }

  removeBot(socketId: string, seat: number): Room {
    const room = this.requireRoom(socketId);
    this.requireHost(room, socketId);
    if (room.status !== 'waiting') throw new Error('对局已开始');
    const bot = room.players.find((p) => p.seat === seat && p.isBot);
    if (!bot) throw new Error('该座位不是机器人');
    room.players = room.players.filter((p) => p !== bot);
    this.broadcastLobby();
    this.broadcastRoom(room);
    return room;
  }

  private fillWithBots(room: Room, count = Infinity) {
    let added = 0;
    while (room.players.length < room.maxPlayers && added < count) {
      const usedNames = new Set(room.players.map((p) => p.name));
      const name =
        BOT_NAMES.find((n) => !usedNames.has(n)) ?? `AI·${room.players.length + 1}号`;
      this.seatPlayer(room, {
        id: `bot:${room.id}:${room.players.length}:${added}:${Math.floor(Math.random() * 1e6)}`,
        name, seat: -1, isBot: true, ready: true, connected: true,
      });
      added++;
    }
  }

  // ---------- 开局与动作 ----------

  startMatch(roomOrSocketId: Room | string): Room {
    let room: Room;
    if (typeof roomOrSocketId === 'string') {
      room = this.requireRoom(roomOrSocketId);
      this.requireHost(room, roomOrSocketId);
    } else {
      room = roomOrSocketId;
    }
    if (room.status === 'playing') throw new Error('对局已在进行中');
    const def = this.registry.get(room.gameId)!;
    this.fillWithBots(room);
    if (room.players.length < def.minPlayers) throw new Error('人数不足');

    room.match = def.createMatch({ playerCount: room.players.length });
    room.ai = def.createAi();
    room.status = 'playing';
    room.matchEpoch += 1;
    this.broadcastLobby();
    this.broadcastRoom(room);
    this.broadcastGameState(room);
    this.pump(room);
    return room;
  }

  handleAction(socketId: string, action: GameAction) {
    const room = this.requireRoom(socketId);
    if (room.status !== 'playing' || !room.match) throw new Error('对局未开始');
    const player = room.players.find((p) => p.id === socketId);
    if (!player) throw new Error('你不在本局中');
    room.match.act(player.seat, action);
    this.afterAction(room);
  }

  hint(socketId: string): GameAction | null {
    const room = this.requireRoom(socketId);
    if (room.status !== 'playing' || !room.match) return null;
    const player = room.players.find((p) => p.id === socketId);
    if (!player) return null;
    return room.match.hint(player.seat);
  }

  private afterAction(room: Room) {
    if (room.match!.finished()) {
      room.status = 'finished';
      this.broadcastLobby();
      this.broadcastRoom(room);
    }
    this.broadcastGameState(room);
    void this.pump(room);
  }

  private pumping = new Set<string>();

  /** 驱动机器人（含断线玩家的 AI 接管）连续行动，直到轮到在线人类或对局结束 */
  private async pump(room: Room) {
    if (this.pumping.has(room.id)) return;
    this.pumping.add(room.id);
    try {
      while (room.status === 'playing' && room.match && room.ai) {
        const epoch = room.matchEpoch;
        const seat = room.match.currentSeat();
        if (seat === null) break;
        const player = room.players.find((p) => p.seat === seat);
        if (!player || (!player.isBot && player.connected)) break;

        await sleep(BOT_MOVE_DELAY_MS);
        if (room.matchEpoch !== epoch || room.status !== 'playing' || !room.match) break;
        if (room.match.currentSeat() !== seat) continue;

        try {
          const action = await room.ai.decide(room.match, seat);
          if (room.matchEpoch !== epoch || room.status !== 'playing' || !room.match) break;
          if (room.match.currentSeat() !== seat) continue;
          room.match.act(seat, action);
        } catch (err) {
          this.logger.error(`机器人行动失败（座位 ${seat}）：${String(err)}`);
          // 兜底：尝试提示动作，防止对局卡死
          const fallback = room.match.hint(seat);
          if (!fallback) break;
          try {
            room.match.act(seat, fallback);
          } catch {
            break;
          }
        }
        if (room.match.finished()) {
          room.status = 'finished';
          this.broadcastLobby();
          this.broadcastRoom(room);
        }
        this.broadcastGameState(room);
      }
    } finally {
      this.pumping.delete(room.id);
    }
  }

  // ---------- 广播 ----------

  private requireRoom(socketId: string): Room {
    const roomId = this.memberOf.get(socketId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room) throw new Error('你不在任何房间中');
    return room;
  }

  private requireHost(room: Room, socketId: string) {
    if (room.hostId !== socketId) throw new Error('只有房主可以执行该操作');
  }

  private socketJoin(socketId: string, roomId: string) {
    this.server?.sockets.sockets.get(socketId)?.join(`room:${roomId}`);
  }

  private socketLeave(socketId: string, roomId: string) {
    this.server?.sockets.sockets.get(socketId)?.leave(`room:${roomId}`);
  }

  broadcastLobby() {
    this.server?.emit('lobby:rooms', { rooms: this.listRooms() });
  }

  private broadcastRoom(room: Room) {
    this.server?.to(`room:${room.id}`).emit('room:update', { room: this.toInfo(room) });
  }

  private broadcastGameState(room: Room) {
    if (!room.match) return;
    for (const p of room.players) {
      if (p.isBot || !p.connected) continue;
      this.server?.sockets.sockets
        .get(p.id)
        ?.emit('game:state', { roomId: room.id, view: room.match.viewFor(p.seat) });
    }
  }

  /** 客户端进房后主动拉取当前房间与对局状态（防止错过进房前的广播） */
  sync(socketId: string) {
    const room = this.requireRoom(socketId);
    const sock = this.server?.sockets.sockets.get(socketId);
    if (!sock) return;
    sock.emit('room:update', { room: this.toInfo(room) });
    const player = room.players.find((p) => p.id === socketId);
    if (room.match && player) {
      sock.emit('game:state', { roomId: room.id, view: room.match.viewFor(player.seat) });
    }
  }

  /** 再来一局：重置为等待状态（保留座位） */
  resetRoom(socketId: string): Room {
    const room = this.requireRoom(socketId);
    this.requireHost(room, socketId);
    if (room.status === 'playing') throw new Error('对局进行中');
    room.match = null;
    room.ai = null;
    room.status = 'waiting';
    room.matchEpoch += 1;
    // 清理断线玩家
    room.players = room.players.filter((p) => p.isBot || p.connected);
    this.broadcastLobby();
    this.broadcastRoom(room);
    if (room.mode === 'single') this.startMatch(room);
    return room;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
