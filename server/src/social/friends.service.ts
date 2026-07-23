import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

export interface FriendInfo {
  id: string;
  name: string;
  online: boolean;
}

/**
 * 会话内好友系统（内存实现）。
 * 玩家以 socket 连接为身份（无账号体系），断线即离线；
 * 后续接入账号/持久化时只需替换本服务的存储层，协议不变：
 *   friend:request {toId} → 对方收到 friend:incoming {id,name}
 *   friend:respond {fromId,accept} → 双方收到 friend:list
 */
@Injectable()
export class FriendsService {
  private server: Server | null = null;
  /** socketId -> 昵称（在线玩家） */
  private names = new Map<string, string>();
  /** 双向好友表 */
  private friends = new Map<string, Set<string>>();
  /** 待处理申请：toId -> fromId 集合 */
  private pending = new Map<string, Set<string>>();
  /** 离线好友的昵称留存（用于展示） */
  private lastNames = new Map<string, string>();

  setServer(server: Server) {
    this.server = server;
  }

  hello(id: string, name: string) {
    this.names.set(id, name);
    this.lastNames.set(id, name);
    this.pushList(id);
  }

  request(fromId: string, toId: string) {
    if (fromId === toId) throw new Error('不能添加自己为好友');
    const fromName = this.names.get(fromId);
    if (!fromName) throw new Error('请先设置昵称');
    if (!this.names.has(toId)) throw new Error('对方不在线');
    if (this.friends.get(fromId)?.has(toId)) throw new Error('你们已经是好友了');
    const box = this.pending.get(toId) ?? new Set<string>();
    if (box.has(fromId)) throw new Error('申请已发送，等待对方处理');
    box.add(fromId);
    this.pending.set(toId, box);
    this.emitTo(toId, 'friend:incoming', { id: fromId, name: fromName });
  }

  respond(toId: string, fromId: string, accept: boolean) {
    const box = this.pending.get(toId);
    if (!box?.has(fromId)) throw new Error('该申请不存在或已处理');
    box.delete(fromId);
    if (accept) {
      this.link(fromId, toId);
      this.pushList(fromId);
      this.pushList(toId);
      this.emitTo(fromId, 'friend:accepted', {
        id: toId,
        name: this.names.get(toId) ?? '玩家',
      });
    }
  }

  list(id: string): FriendInfo[] {
    return [...(this.friends.get(id) ?? [])].map((fid) => ({
      id: fid,
      name: this.names.get(fid) ?? this.lastNames.get(fid) ?? '玩家',
      online: this.names.has(fid),
    }));
  }

  disconnect(id: string) {
    this.names.delete(id);
    this.pending.delete(id);
    for (const box of this.pending.values()) box.delete(id);
    // 通知其好友该玩家已离线
    for (const fid of this.friends.get(id) ?? []) this.pushList(fid);
  }

  private link(a: string, b: string) {
    if (!this.friends.has(a)) this.friends.set(a, new Set());
    if (!this.friends.has(b)) this.friends.set(b, new Set());
    this.friends.get(a)!.add(b);
    this.friends.get(b)!.add(a);
  }

  private pushList(id: string) {
    this.emitTo(id, 'friend:list', { friends: this.list(id) });
  }

  private emitTo(id: string, event: string, payload: unknown) {
    this.server?.sockets.sockets.get(id)?.emit(event, payload);
  }
}
