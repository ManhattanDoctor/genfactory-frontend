import type { ReactElement } from 'react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSession, setSession, SESSION_KEY } from '../../lib/api';
import type { IInitResponse } from '../../lib/types';
interface IAuth {
  session: string | null;
  user?: IInitResponse['user'];
  balances: Record<string, string>;
  loading: boolean;
  error: Error | null;
  signIn: () => Promise<void>;
  signInError: string;
  signingIn: boolean;
  acceptSession: (sid: string) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<boolean>;
}
const Context = createContext<IAuth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, changeSession] = useState(getSession);
  const client = useQueryClient();
  const signInStarted = useRef(false);
  const [signInError, setSignInError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const query = useQuery({
    queryKey: ['account', session],
    queryFn: api.init,
    enabled: !!session,
    retry: false,
  });
  const acceptSession = (sid: string) => {
    client.clear();
    setSession(sid);
    changeSession(sid);
  };
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      signInStarted.current = false;
      setSigningIn(false);
      sessionStorage.removeItem('genfactory.oauth');
    };
    const expired = () => {
      setSession(null);
      changeSession(null);
      client.clear();
    };
    const synchronize = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== SESSION_KEY && event.key !== null)) return;
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem('genfactory.idToken');
      changeSession(localStorage.getItem(SESSION_KEY));
      client.clear();
    };
    window.addEventListener('genfactory:unauthorized', expired);
    window.addEventListener('storage', synchronize);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('genfactory:unauthorized', expired);
      window.removeEventListener('storage', synchronize);
      window.removeEventListener('pageshow', restore);
    };
  }, [client]);
  const signIn = async () => {
    if (signInStarted.current) return;
    signInStarted.current = true;
    setSigningIn(true);
    setSignInError('');
    try {
      sessionStorage.removeItem('genfactory.oauth');
      const { keycloak } = await api.config();
      const state = crypto.randomUUID();
      const redirectUri = `${location.origin}/auth/callback`;
      sessionStorage.setItem(
        'genfactory.oauth',
        JSON.stringify({ state, createdAt: Date.now(), redirectUri }),
      );
      const url = new URL(
        `${keycloak.url.replace(/\/$/, '')}/realms/${encodeURIComponent(keycloak.realm)}/protocol/openid-connect/auth`,
      );
      url.search = new URLSearchParams({
        client_id: keycloak.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid',
        state,
        theme: 'genfactory',
      }).toString();
      location.assign(url.href);
    } catch {
      try {
        sessionStorage.removeItem('genfactory.oauth');
      } catch {
        /* Storage may be unavailable. */
      }
      setSignInError('Не удалось открыть вход. Проверьте подключение и попробуйте снова.');
    } finally {
      signInStarted.current = false;
      setSigningIn(false);
    }
  };
  const signOut = async () => {
    const sid = session;
    const idToken = sessionStorage.getItem('genfactory.idToken');
    setSession(null);
    changeSession(null);
    sessionStorage.removeItem('genfactory.idToken');
    sessionStorage.removeItem('genfactory.oauth');
    client.clear();
    // Finish both sessions: a failed API logout must not leave browser SSO active.
    const [config] = await Promise.all([api.config(), api.logout(sid).catch(() => undefined)]);
    const { keycloak } = config;
    const url = new URL(
      `${keycloak.url.replace(/\/$/, '')}/realms/${encodeURIComponent(keycloak.realm)}/protocol/openid-connect/logout`,
    );
    url.search = new URLSearchParams({
      client_id: keycloak.clientId,
      post_logout_redirect_uri: `${location.origin}/account`,
      ...(idToken ? { id_token_hint: idToken } : {}),
    }).toString();
    location.assign(url.href);
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
        signInError,
        signingIn,
        signOut,
        acceptSession,
        refresh: async () => {
          const result = await query.refetch();
          return !result.isError;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth(): IAuth {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
