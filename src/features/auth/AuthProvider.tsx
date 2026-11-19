import { PermissionService } from '../../lib/PermissionService';
import type { IOpenIdTokenRefreshable } from '@ts-core/openid-common';
import { sessionService, TOKEN_KEY } from '../../lib/SessionService';
import type { ReactElement } from 'react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getSession, setSession, SESSION_KEY } from '../../lib/api';
import type { IInitResponse } from '../../lib/types';
interface IAuth {
  session: string | null;
  hasPermission: (name: string, scope: string) => boolean;
  user?: IInitResponse['user'];
  balances: Record<string, string>;
  loading: boolean;
  error: Error | null;
  signIn: () => Promise<void>;
  signInError: string;
  signingIn: boolean;
  acceptSession: (token: IOpenIdTokenRefreshable) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<boolean>;
}
const Context = createContext<IAuth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [session, changeSession] = useState(getSession);
  const client = useQueryClient();
  const permissions = PermissionService.get(client);
  useQuery(permissions.options(session));
  const currentSession = useRef(session);
  currentSession.current = session;
  const signInStarted = useRef(false);
  const [signInError, setSignInError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const query = useQuery({
    queryKey: ['account', session],
    queryFn: api.init,
    enabled: !!session,
    retry: false,
  });
  const acceptSession = (token: IOpenIdTokenRefreshable) => {
    client.clear();
    changeSession(sessionService.accept(token));
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
      if (event.storageArea !== localStorage || (event.key !== TOKEN_KEY && event.key !== null)) return;
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem('genfactory.idToken');
      const next = getSession();
      if (currentSession.current !== next) client.clear();
      currentSession.current = next;
      changeSession(next);
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
    const token = sessionService.getTokens();
    const idToken = token?.id;
    setSession(null);
    changeSession(null);
    sessionStorage.removeItem('genfactory.idToken');
    sessionStorage.removeItem('genfactory.oauth');
    client.clear();
    // Finish both sessions: a failed API logout must not leave browser SSO active.
    const [config] = await Promise.all([api.config(), api.logout(token?.refresh).catch(() => undefined)]);
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
        hasPermission: (name, scope) => permissions.has(session, name, scope),
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
