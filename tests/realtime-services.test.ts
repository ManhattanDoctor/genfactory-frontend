import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import * as api from '../src/lib/api';
import { RealtimeService } from '../src/features/realtime/RealtimeService';
import { QueryRefreshService } from '../src/features/realtime/QueryRefreshService';
import {
  getQueryRefreshService,
  scheduleRefresh,
  disposeRefresh,
} from '../src/features/realtime/queryRefresh';

const socket = vi.hoisted(() => {
  class Events {
    listeners = new Set<(event?: any) => void>();
    subscribe(listener: (event?: any) => void) {
      this.listeners.add(listener);
      return { unsubscribe: () => this.listeners.delete(listener) };
    }
    emit(event?: any) {
      this.listeners.forEach((listener) => listener(event));
    }
  }
  const connections: any[] = [],
    transports: any[] = [];
  const connect = vi.fn(async () => {});
  class Connection {
    settings = { auth: {} };
    connected = new Events();
    disconnected = new Events();
    connectedError = new Events();
    reconnectedFailed = new Events();
    disconnect = vi.fn();
    destroy = vi.fn();
    constructor() {
      connections.push(this);
    }
  }
  class Transport {
    events = new Map<string, Events>();
    roomAdd = vi.fn(async () => {});
    roomRemove = vi.fn(async () => {});
    connect = connect;
    destroy = vi.fn();
    constructor() {
      transports.push(this);
    }
    getDispatcher(name: string) {
      if (!this.events.has(name)) this.events.set(name, new Events());
      return this.events.get(name)!;
    }
  }
  return { connections, transports, Connection, Transport, connect };
});
vi.mock('../src/features/realtime/socketTransport', () => ({
  TransportSocketClient: socket.Connection,
  TransportSocket: socket.Transport,
}));

let client: QueryClient;
let session: string;
let tab: EventTarget & { hidden: boolean };
const cleanup: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient();
  session = 'first';
  vi.spyOn(api, 'getSession').mockImplementation(() => session);
  vi.spyOn(api.sessionService, 'access').mockImplementation(async () => session);
  vi.spyOn(api.sessionService, 'getTokens').mockReturnValue({ access: 'access' });
  tab = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', tab);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('location', { origin: 'http://localhost' });
  socket.connections.length = 0;
  socket.transports.length = 0;
  socket.connect.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  disposeRefresh(client, 'first');
  disposeRefresh(client, 'second');
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function start(service: RealtimeService) {
  service.start();
  await vi.dynamicImportSettled();
}
function service() {
  const value = new RealtimeService(client, 7, session);
  cleanup.push(() => value.stop());
  return value;
}
it('reference-counts rooms and makes each release idempotent', async () => {
  const realtime = service();
  const first = realtime.join('conversation101');
  const second = realtime.join('conversation101');
  await start(realtime);
  expect(socket.transports).toHaveLength(1);
  const transport = socket.transports[0];
  expect(transport.roomAdd).toHaveBeenCalledExactlyOnceWith('conversation101');
  first();
  first();
  expect(transport.roomRemove).not.toHaveBeenCalled();
  second();
  expect(transport.roomRemove).toHaveBeenCalledExactlyOnceWith('conversation101');
});
it('handles a StrictMode start-stop-start while the transport import is pending', async () => {
  const realtime = service();
  const leave = realtime.join('conversation101');
  realtime.start();
  realtime.stop();
  await start(realtime);
  expect(socket.connections).toHaveLength(1);
  expect(socket.transports[0].roomAdd).toHaveBeenCalledExactlyOnceWith('conversation101');
  leave();
});
it('disposes subscriptions and ignores callbacks from an old connection after restart', async () => {
  const realtime = service();
  await start(realtime);
  const first = socket.connections[0];
  const connected = [...first.connected.listeners][0] as () => void;
  const events = socket.transports[0].getDispatcher('TaskProgressedEvent');
  const receive = [...events.listeners][0] as (event: unknown) => void;
  first.connected.emit();
  expect(realtime.getSnapshot()).toBe(true);
  realtime.stop();
  expect(realtime.getSnapshot()).toBe(false);
  expect(first.disconnect).toHaveBeenCalledOnce();
  expect(first.destroy).toHaveBeenCalledOnce();
  expect(events.listeners.size).toBe(0);
  await start(realtime);
  connected();
  receive({ name: 'TaskProgressedEvent', data: { session: 'conversation101' } });
  expect(realtime.getSnapshot()).toBe(false);
  expect(client.getQueryData(['conversation-progress', 7, 101])).toBeUndefined();
  socket.connections[1].connected.emit();
  expect(realtime.getSnapshot()).toBe(true);
});
it('does not process events or delayed imports for a replaced login session', async () => {
  const realtime = service();
  await start(realtime);
  session = 'second';
  socket.transports[0]
    .getDispatcher('TaskProgressedEvent')
    .emit({ name: 'TaskProgressedEvent', data: { session: 'conversation101' } });
  expect(client.getQueryData(['conversation-progress', 7, 101])).toBeUndefined();
  realtime.stop();
  realtime.start();
  await vi.dynamicImportSettled();
  expect(socket.connections).toHaveLength(1);
});
it('keeps socket retries alive after the first failure and stops polling on recovery', async () => {
  socket.connect.mockRejectedValueOnce(new Error('Server temporarily unavailable'));
  const realtime = service();
  const refresh = getQueryRefreshService(client, 7, session);
  const schedule = vi.spyOn(refresh, 'schedule').mockImplementation(() => {});
  await start(realtime);
  const connection = socket.connections[0];
  const transport = socket.transports[0];
  expect(realtime.getSnapshot()).toBe(false);
  expect(connection.disconnect).not.toHaveBeenCalled();
  expect(transport.destroy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(schedule).toHaveBeenCalledOnce();

  connection.connected.emit();
  expect(realtime.getSnapshot()).toBe(true);
  schedule.mockClear();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(schedule).not.toHaveBeenCalled();
  transport.getDispatcher('TaskProgressedEvent').emit({
    name: 'TaskProgressedEvent',
    data: { session: 'conversation101', id: 'task' },
  });
  expect(client.getQueryData(['conversation-progress', 7, 101])).toBeDefined();

  realtime.stop();
  expect(connection.disconnect).toHaveBeenCalledOnce();
  expect(transport.destroy).toHaveBeenCalledOnce();
});

it('shares a single cache service between mutations and the socket lifecycle', () => {
  const refresh = getQueryRefreshService(client, 7, session);
  const enqueue = vi.spyOn(refresh, 'enqueue');
  scheduleRefresh(client, 7, session, ['files']);
  expect(getQueryRefreshService(client, 7, session)).toBe(refresh);
  expect(enqueue).toHaveBeenCalledOnce();
  refresh.start();
  refresh.start();
  expect(vi.getTimerCount()).toBe(2); // one queued update and one fallback interval
  disposeRefresh(client, session);
  expect(vi.getTimerCount()).toBe(0);
});
it('keeps fallback and tab-return rules in the service and removes them on disposal', async () => {
  const refresh = new QueryRefreshService(client, 7, () => true, session);
  cleanup.push(() => refresh.dispose());
  const schedule = vi.spyOn(refresh, 'schedule').mockImplementation(() => {});
  refresh.start();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(schedule).toHaveBeenCalledTimes(1);
  refresh.setConnected(true);
  schedule.mockClear();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(schedule).not.toHaveBeenCalled();
  tab.hidden = true;
  tab.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(59_999);
  tab.hidden = false;
  tab.dispatchEvent(new Event('visibilitychange'));
  expect(schedule).not.toHaveBeenCalled();
  tab.hidden = true;
  tab.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60_000);
  tab.hidden = false;
  tab.dispatchEvent(new Event('visibilitychange'));
  expect(schedule).toHaveBeenCalledTimes(1);
  refresh.setConnected(false);
  schedule.mockClear();
  refresh.dispose();
  window.dispatchEvent(new Event('online'));
  tab.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(schedule).not.toHaveBeenCalled();
});
it('preserves scoped progress and task completion notices without refreshing unrelated progress', () => {
  const refresh = new QueryRefreshService(client, 7, () => true, session);
  cleanup.push(() => refresh.dispose());
  refresh.receive({ name: 'TaskProgressedEvent', data: { session: 'conversation101', id: 'task' } });
  expect(client.getQueryData(['conversation-progress', 7, 101])).toBeDefined();
  expect(client.getQueryData(['conversation-progress', 7, 102])).toBeUndefined();
  const item = { id: 'task', model: 'VIDEO', createdDate: '2026-11-17', session: 'conversation101' };
  refresh.receive({ name: 'TaskStartedEvent', data: { id: 'task', item } });
  refresh.receive({
    name: 'TaskFinishedEvent',
    data: { id: 'task', item, result: 'COMPLETED', fileIds: [12] },
  });
  expect(client.getQueryData(['active-tasks', 7])).toEqual([]);
  expect(client.getQueryData<any[]>(['task-notices', 7])?.[0]).toMatchObject({
    id: 'task',
    result: 'COMPLETED',
    fileIds: [12],
  });
});
