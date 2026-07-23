import { io, Socket } from 'socket.io-client';
import type { Ack } from './types';

export const socket: Socket = io({ transports: ['websocket', 'polling'] });

/** 带确认回执的请求；服务器返回 { ok, error, data } */
export function request<T = Record<string, unknown>>(
  event: string,
  payload?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('请求超时，请重试')), 10000);
    socket.emit(event, payload ?? {}, (ack: Ack<T>) => {
      clearTimeout(timer);
      if (ack?.ok) resolve((ack.data ?? {}) as T);
      else reject(new Error(ack?.error ?? '操作失败'));
    });
  });
}
