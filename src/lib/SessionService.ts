import './transport-polyfills';
import {
  KeycloakTokenManager,
  OpenIdTokenRefreshableTransport,
  type IOpenIdTokenRefreshable,
} from '@ts-core/openid-common';

export const SESSION_KEY = 'genfactory.session';
export const TOKEN_KEY = 'genfactory.keycloak.tokens';
const base = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

interface ISession {
  id: string;
  token: IOpenIdTokenRefreshable;
}

/** One token manager and refresh operation per browser tab. Session identity survives refresh. */
export class SessionService extends OpenIdTokenRefreshableTransport {
  private session?: ISession;
  private serialized: string | null = null;

  public constructor() {
    super({ log() {}, warn() {}, error() {}, debug() {}, verbose() {} });
    this.token = new KeycloakTokenManager();
  }

  public synchronize(): void {
    const serialized = localStorage.getItem(TOKEN_KEY);
    if (serialized === this.serialized) return;
    this.serialized = serialized;
    try {
      const item = JSON.parse(serialized || 'null') as ISession | null;
      if (!item?.id || typeof item.token?.access !== 'string' || !item.token.access.includes('.'))
        throw new Error();
      // A refresh in this tab commits the tokens after acquiring the shared lock.
      if (!this.refreshing || this.session?.id !== item.id) this.token.value = item.token;
      this.session = item;
    } catch {
      this.token.value = null!;
      this.session = undefined;
    }
  }

  public getSession(): string | null {
    this.synchronize();
    return this.session?.id ?? null;
  }

  public accept(token: IOpenIdTokenRefreshable): string {
    // Parse before persisting to reject malformed login responses.
    const manager = new KeycloakTokenManager(token);
    if (!manager.access?.content?.sub) throw new Error('Некорректный ответ входа.');
    const id = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ id, token }));
    localStorage.setItem(SESSION_KEY, id);
    sessionStorage.removeItem(SESSION_KEY);
    this.synchronize();
    return id;
  }

  public clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    this.serialized = null;
    this.session = undefined;
    this.token.value = null!;
  }

  public getTokens(): IOpenIdTokenRefreshable | undefined {
    this.synchronize();
    return this.session?.token;
  }

  public async access(session: string): Promise<string> {
    if (this.getSession() !== session) throw new DOMException('Сессия изменилась.', 'AbortError');
    try {
      const token = await this.getToken();
      if (this.getSession() !== session) throw new DOMException('Сессия изменилась.', 'AbortError');
      return token.access;
    } catch (error) {
      if (error instanceof SessionExpiredError && this.getSession() === session)
        window.dispatchEvent(new Event('genfactory:unauthorized'));
      throw error;
    }
  }

  protected isSkipCheckRefreshable(): boolean {
    return false;
  }

  protected async getRefreshable(): Promise<IOpenIdTokenRefreshable> {
    const session = this.session;
    if (!session?.token.refresh) throw new SessionExpiredError();
    // Web Locks serialize rotating refresh tokens across tabs where supported.
    const execute = async () => {
      const current = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as ISession | null;
      if (current?.id !== session.id) throw new DOMException('Сессия изменилась.', 'AbortError');
      if (current.token.refresh !== session.token.refresh) {
        this.session = current;
        this.serialized = JSON.stringify(current);
        return current.token;
      }
      const response = await fetch(`${base}/openId/getTokenByRefreshToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.token.refresh }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) throw new SessionExpiredError();
        throw new Error('Не удалось обновить сессию. Повторите попытку.');
      }
      const result = (await response.json()) as IOpenIdTokenRefreshable;
      const manager = new KeycloakTokenManager(result);
      if (!manager.access?.content?.sub || !manager.refresh)
        throw new Error('Некорректный ответ обновления сессии.');
      if (this.getSession() !== session.id) throw new DOMException('Сессия изменилась.', 'AbortError');
      // The base transport commits token.value after this method returns.
      this.session = { id: session.id, token: result };
      this.serialized = JSON.stringify(this.session);
      localStorage.setItem(TOKEN_KEY, this.serialized);
      return result;
    };
    return navigator.locks ? navigator.locks.request('genfactory-token-refresh', execute) : execute();
  }
}

export class SessionExpiredError extends Error {}
export const sessionService = new SessionService();
