import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSession, setSession } from '../../lib/api';
import type { InitResponse } from '../../lib/types';
interface Auth {
  session: string | null;
  user?: InitResponse['user'];
  balances: Record<string, string>;
  loading: boolean;
  error: Error | null;
  signIn: () => Promise<void>;
  acceptSession: (sid: string) => void;
  signOut: () => Promise<void>;
  refresh: () => void;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, changeSession] = useState(getSession);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['account', session],
    queryFn: api.init,
    enabled: !!session,
    retry: false,
    refetchInterval: session ? 60_000 : false,
  });
  const acceptSession = (sid: string) => {
    client.clear();
    setSession(sid);
    changeSession(sid);
  };
  useEffect(() => {
    const expired = () => {
      setSession(null);
      changeSession(null);
      client.clear();
    };
    window.addEventListener('genfactory:unauthorized', expired);
    return () => window.removeEventListener('genfactory:unauthorized', expired);
  }, [client]);
  const signIn = async () => {
    const { keycloak } = await api.config();
    const state = crypto.randomUUID();
    const redirectUri = `${location.origin}/auth/callback`;
    sessionStorage.setItem('genfactory.oauth', JSON.stringify({ state, createdAt: Date.now(), redirectUri }));
    const url = new URL(
      `${keycloak.url.replace(/\/$/, '')}/realms/${encodeURIComponent(keycloak.realm)}/protocol/openid-connect/auth`,
    );
    url.search = new URLSearchParams({
      client_id: keycloak.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid',
      state,
    }).toString();
    location.assign(url.href);
  };
  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      setSession(null);
      changeSession(null);
      sessionStorage.removeItem('genfactory.idToken');
      client.clear();
    }
  };
  return (
    <Context.Provider
      value={{
        session,
        user: query.data?.user,
        balances: query.data?.balances || {},
        loading: !!session && query.isPending,
        error: query.error,
        signIn,
        signOut,
        acceptSession,
        refresh: () => {
          void query.refetch();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
