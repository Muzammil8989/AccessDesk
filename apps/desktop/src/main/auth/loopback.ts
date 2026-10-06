import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export class LoginCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'LoginCancelledError';
  }
}

export interface LoopbackSession {
  /** http://127.0.0.1:<random port>/callback */
  redirectUri: string;
  /** Resolves with the authorization code. */
  result: Promise<string>;
  /** Stops listening and rejects `result` with LoginCancelledError. */
  cancel(): void;
}

const PAGE_STYLE =
  'body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#222}';

function page(title: string, message: string): string {
  // Static text only. Nothing from the request is echoed back into the page.
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>${PAGE_STYLE}</style><main><h1>${title}</h1><p>${message}</p></main>`;
}

/**
 * One-shot HTTP listener on 127.0.0.1 for the OAuth redirect (RFC 8252, loopback redirect).
 * The OS picks a free port, only GET /callback is served, and the server closes after the first
 * valid response. Requests with the wrong `state` are refused without ending the login, so a
 * stray local request cannot cancel it.
 */
export async function startLoopback(options: {
  expectedState: string;
  timeoutMs?: number;
}): Promise<LoopbackSession> {
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  let settle!: { resolve: (code: string) => void; reject: (error: Error) => void };
  const result = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The caller may only attach a handler later. Avoid an unhandled rejection in between.
  result.catch(() => undefined);

  // `handle` and `timer` are declared below. They are only used after the server starts, so
  // referencing them from these callbacks is safe.
  const server: Server = createServer((req, res) => handle(req, res));
  let finished = false;

  const finish = (outcome: { code: string } | { error: Error }) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    // Let the browser receive the response, then drop idle connections.
    server.close();
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 1000).unref();
    if ('code' in outcome) settle.resolve(outcome.code);
    else settle.reject(outcome.error);
  };

  const send = (res: ServerResponse, status: number, html: string) => {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // The URL carries the auth code, so keep it out of any Referer header.
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
    res.end(html);
  };

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    try {
      route(req, res);
    } catch {
      // This runs inside the main process: whatever goes wrong must never become an uncaught
      // exception (it would show an error dialog and could take the app down).
      if (!res.headersSent) send(res, 500, page('Something went wrong', ''));
      else res.end();
    }
  };

  const route = (req: IncomingMessage, res: ServerResponse) => {
    // A browser can reuse its connection for another request (favicon, retry) after we finished
    // and closed the server. By then `server.address()` is null, so take the port from the socket.
    if (finished) return send(res, 410, page('Already done', 'You can close this tab.'));
    const port = req.socket.localPort;
    // Reject unexpected Host headers (DNS rebinding).
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 400, page('Bad request', ''));

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (req.method !== 'GET' || url.pathname !== '/callback') {
      return send(res, 404, page('Not found', ''));
    }
    if (url.searchParams.get('state') !== options.expectedState) {
      return send(res, 400, page('Invalid request', 'This sign-in link is not valid.'));
    }

    const oauthError = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    if (oauthError || !code) {
      send(res, 400, page('Sign-in failed', 'Return to AccessDesk and try again.'));
      return finish({
        error: new Error(`Sign-in failed: ${oauthError ?? 'no authorization code'}`),
      });
    }

    send(res, 200, page('Signed in', 'You can close this tab and return to AccessDesk.'));
    finish({ code });
  };

  const timer = setTimeout(() => finish({ error: new Error('Sign-in timed out') }), timeoutMs);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }

  const { port } = server.address() as AddressInfo;
  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    result,
    cancel: () => finish({ error: new LoginCancelledError() }),
  };
}
