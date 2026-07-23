import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameAction } from '../games/game.interface';
import { RoomMode } from './room.types';
import { RoomManager } from './room.manager';

interface Ack<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  data?: T;
}

function sanitizeName(name: unknown): string {
  const s = String(name ?? '').trim().slice(0, 16);
  return s || '玩家';
}

/**
 * 通信层：只做参数清洗与转发，业务在 RoomManager / 各玩法 Match 中。
 * game:action 是通用透传通道，新增玩法无需改动网关。
 */
@WebSocketGateway({ cors: { origin: true } })
export class RoomsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly manager: RoomManager) {}

  afterInit(server: Server) {
    this.manager.setServer(server);
  }

  handleConnection(socket: Socket) {
    socket.emit('lobby:rooms', { rooms: this.manager.listRooms() });
  }

  handleDisconnect(socket: Socket) {
    this.manager.onDisconnect(socket.id);
  }

  private run<T>(fn: () => T): Ack<T> {
    try {
      return { ok: true, data: fn() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '操作失败' };
    }
  }

  @SubscribeMessage('lobby:rooms')
  onListRooms(): Ack {
    return this.run(() => ({ rooms: this.manager.listRooms() }));
  }

  @SubscribeMessage('room:create')
  onCreateRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: { gameId?: string; roomName?: string; mode?: RoomMode; playerName?: string },
  ): Ack {
    return this.run(() => {
      const mode: RoomMode = body?.mode === 'single' ? 'single' : 'multi';
      const room = this.manager.createRoom(
        socket.id,
        sanitizeName(body?.playerName),
        String(body?.gameId ?? ''),
        String(body?.roomName ?? ''),
        mode,
      );
      return { roomId: room.id };
    });
  }

  @SubscribeMessage('room:join')
  onJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId?: string; playerName?: string },
  ): Ack {
    return this.run(() => {
      const room = this.manager.joinRoom(
        socket.id,
        sanitizeName(body?.playerName),
        String(body?.roomId ?? ''),
      );
      return { roomId: room.id };
    });
  }

  @SubscribeMessage('room:leave')
  onLeaveRoom(@ConnectedSocket() socket: Socket): Ack {
    return this.run(() => {
      this.manager.leaveRoom(socket.id);
      return {};
    });
  }

  @SubscribeMessage('room:addBot')
  onAddBot(@ConnectedSocket() socket: Socket): Ack {
    return this.run(() => ({ roomId: this.manager.addBot(socket.id).id }));
  }

  @SubscribeMessage('room:removeBot')
  onRemoveBot(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { seat?: number },
  ): Ack {
    return this.run(() => ({
      roomId: this.manager.removeBot(socket.id, Number(body?.seat)).id,
    }));
  }

  @SubscribeMessage('room:start')
  onStart(@ConnectedSocket() socket: Socket): Ack {
    return this.run(() => ({ roomId: this.manager.startMatch(socket.id).id }));
  }

  @SubscribeMessage('room:again')
  onAgain(@ConnectedSocket() socket: Socket): Ack {
    return this.run(() => ({ roomId: this.manager.resetRoom(socket.id).id }));
  }

  @SubscribeMessage('room:sync')
  onSync(@ConnectedSocket() socket: Socket): Ack {
    return this.run(() => {
      this.manager.sync(socket.id);
      return {};
    });
  }

  @SubscribeMessage('game:action')
  onGameAction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { action?: GameAction },
  ): Ack {
    return this.run(() => {
      if (!body?.action || typeof body.action.type !== 'string') {
        throw new Error('无效的动作');
      }
      this.manager.handleAction(socket.id, body.action);
      return {};
    });
  }

  @SubscribeMessage('game:hint')
  onHint(@ConnectedSocket() socket: Socket): Ack {
    return this.run(() => ({ action: this.manager.hint(socket.id) }));
  }
}
