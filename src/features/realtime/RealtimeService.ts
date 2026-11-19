import type { QueryClient } from '@tanstack/react-query';
import type { TransportSocket } from '@ts-core/socket-client';
import type { ILogger } from '@ts-core/common';
import { getSession, sessionService } from '../../lib/api';
import { disposeRefresh, getQueryRefreshService } from './queryRefresh';
import type { IRealtimeEvent, QueryRefreshService } from './QueryRefreshService';

/** Owns one session's connection, subscriptions and reference-counted rooms. */
export class RealtimeService {
  private static transportModule?: Promise<typeof import('./socketTransport')>;

  private static loadTransport(): Promise<typeof import('./socketTransport')> {
    if (!this.transportModule) {
      this.transportModule = import('./socketTransport').catch((error) => {
        this.transportModule = undefined;
        throw error;
      });
    }
    return this.transportModule;
  }

  private readonly rooms = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private transport?: TransportSocket;
  private refresh?: QueryRefreshService;
  private disposeConnection?: () => void;
  private connected = false;
  private running = false;
  private generation = 0;

  public constructor(
    private readonly client: QueryClient,
    private readonly userId: number,
    private readonly session: string,
  ) {}

  public getSnapshot = (): boolean => this.connected;

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public start(): void {
    if (this.running || getSession() !== this.session) return;
    this.running = true;
    const generation = ++this.generation;
    this.refresh = getQueryRefreshService(this.client, this.userId, this.session);
    this.refresh.start();
    void this.connect(generation).catch(() => {
      if (!this.isCurrent(generation)) return;
      this.disposeConnection?.();
      this.disposeConnection = undefined;
      this.transport = undefined;
      this.setConnected(false);
    });
  }

  public stop(): void {
    if (!this.running) return;
    this.running = false;
    ++this.generation;
    disposeRefresh(this.client, this.session);
    this.refresh = undefined;
    this.transport = undefined;
    this.disposeConnection?.();
    this.disposeConnection = undefined;
    this.setConnected(false);
  }

  public join = (room: string): (() => void) => {
    this.rooms.set(room, (this.rooms.get(room) || 0) + 1);
    if (this.rooms.get(room) === 1) this.roomCommand(room, 'ADD');
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.rooms.get(room) || 1) - 1;
      if (remaining) this.rooms.set(room, remaining);
      else {
        this.rooms.delete(room);
        this.roomCommand(room, 'REMOVE');
      }
    };
  };

  private isCurrent(generation: number): boolean {
    return this.running && generation === this.generation && getSession() === this.session;
  }

  private setConnected(connected: boolean): void {
    this.refresh?.setConnected(connected);
    if (this.connected === connected) return;
    this.connected = connected;
    this.listeners.forEach((listener) => listener());
  }

  private roomCommand(name: string, action: 'ADD' | 'REMOVE'): void {
    const transport = this.transport;
    const generation = this.generation;
    if (!transport) return;
    void (action === 'ADD' ? transport.roomAdd(name) : transport.roomRemove(name))
      .then(() => {
        if (this.isCurrent(generation) && action === 'ADD' && this.rooms.has(name))
          this.refresh?.roomJoined(name);
      })
      .catch(() => {
        if (this.isCurrent(generation)) this.setConnected(false);
      });
  }

  private async connect(generation: number): Promise<void> {
    const { TransportSocket, TransportSocketClient } = await RealtimeService.loadTransport();
    if (!this.isCurrent(generation)) return;
    const apiBase = new URL(import.meta.env.VITE_API_BASE || '/api', location.origin);
    const logger: ILogger = {
      log: () => {},
      warn: (message) =>
        console.warn(
          '[Realtime]',
          String(message?.message || message).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'),
        ),
      error: (message) =>
        console.error(
          '[Realtime]',
          String(message?.message || message).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'),
        ),
      debug: () => {},
      verbose: () => {},
    };
    await sessionService.access(this.session);
    if (!this.isCurrent(generation)) return;
    const connection = new TransportSocketClient(logger, {
      url: apiBase.origin,
      namespace: 'gnosisai',
      auth: (callback) => {
        void sessionService
          .access(this.session)
          .then((token) => {
            if (this.isCurrent(generation)) callback({ token });
          })
          .catch(() => {
            if (this.isCurrent(generation)) callback({ token: '' });
          });
      },
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 100,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    const transport = new TransportSocket(
      logger,
      { timeout: 10000, isRestoreRoomsOnConnect: true },
      connection,
    );

    this.transport = transport;
    const subscriptions: Array<{ unsubscribe: () => void }> = [];
    this.disposeConnection = () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      connection.disconnect();
      transport.destroy();
      connection.destroy();
    };
    this.rooms.forEach((_, room) => this.roomCommand(room, 'ADD'));
    const update = (connected: boolean): void => {
      if (this.isCurrent(generation)) this.setConnected(connected);
    };
    subscriptions.push(
      connection.connected.subscribe(() => update(true)),
      connection.disconnected.subscribe(() => update(false)),
      connection.connectedError.subscribe(() => update(false)),
      connection.reconnectedFailed.subscribe(() => update(false)),
    );
    const events = [
      'TaskProgressedEvent',
      'TaskStartedEvent',
      'TaskFinishedEvent',
      'ConversationAddedEvent',
      'ConversationChangedEvent',
      'ConversationRemovedEvent',
      'ConversationErroredEvent',
      'ConversationClearedEvent',
      'ConversationMessageAddedEvent',
      'ConversationMessageRemovedEvent',
      'FileAddedEvent',
      'FileChangedEvent',
      'FileRemovedEvent',
      'FilePreviewChangedEvent',
      'CoinBalanceChangedEvent',
      'AiModelChangedEvent',
    ];

    subscriptions.push(
      ...events.map((name) =>
        transport.getDispatcher<IRealtimeEvent>(name).subscribe((event) => {
          if (this.isCurrent(generation)) this.refresh?.receive(event);
        }),
      ),
    );
    try {
      await transport.connect();
    } catch {
      // The first connection error rejects this promise, while Socket.IO keeps retrying.
      // Keep the transport and subscriptions alive until this session is stopped.
      if (this.isCurrent(generation)) this.setConnected(false);
    }
  }
}
