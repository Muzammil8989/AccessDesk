import { vi } from 'vitest';
import { createKeycloakIdentityProvider } from '../../src/index';

export const SUBJECT_ID = '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11';
export const ISSUER_URL = 'http://idp.test/realms/company%20platform';

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

export function setup(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  const provider = createKeycloakIdentityProvider({
    issuerUrl: ISSUER_URL,
    getToken: () => 'admin-token',
    fetch: fetchMock,
  });
  return { provider, fetchMock };
}

export function call(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index]!;
  return { url: String(url), init: init as RequestInit };
}
