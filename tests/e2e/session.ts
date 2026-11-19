import type { Page } from '@playwright/test';

/** Mocked JWT session for API-intercepted browser tests. No real credentials. */
export async function mockSession(page: Page, id: string): Promise<void> {
  const jwt = (sub: string) =>
    [
      Buffer.from('{"alg":"RS256"}').toString('base64url'),
      Buffer.from(JSON.stringify({ sub, exp: 4000000000 })).toString('base64url'),
      'signature',
    ].join('.');
  const token = { access: jwt(id), refresh: jwt(`${id}-refresh`), id: jwt(`${id}-id`) };
  await page.addInitScript(
    ({ id, token }) => {
      localStorage.setItem('genfactory.keycloak.tokens', JSON.stringify({ id, token }));
      localStorage.setItem('genfactory.session', id);
    },
    { id, token },
  );
}
