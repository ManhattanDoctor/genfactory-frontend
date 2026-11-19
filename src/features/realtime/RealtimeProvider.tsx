import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { RealtimeService } from './RealtimeService';

interface IRealtime {
  connected: boolean;
  join: (room: string) => () => void;
}
const emptyJoin = (): (() => void) => () => {};
const disconnected = (): boolean => false;
const emptySubscribe = (): (() => void) => () => {};
const Context = createContext<IRealtime>({ connected: false, join: emptyJoin });

export function RealtimeProvider({ children }: { children: ReactNode }): ReactElement {
  const { user, session } = useAuth();
  const client = useQueryClient();
  const userId = user?.id;
  const service = useMemo(
    () => (userId && session ? new RealtimeService(client, userId, session) : undefined),
    [client, userId, session],
  );
  const connected = useSyncExternalStore(
    service?.subscribe ?? emptySubscribe,
    service?.getSnapshot ?? disconnected,
    disconnected,
  );
  useEffect(() => {
    service?.start();
    return () => service?.stop();
  }, [service]);
  const value = useMemo(() => ({ connected, join: service?.join ?? emptyJoin }), [connected, service]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useRealtime(): IRealtime {
  return useContext(Context);
}
export function useConversationRoom(id?: number): void {
  const { join } = useRealtime();
  useEffect(() => (id ? join(`conversation${id}`) : undefined), [id, join]);
}
