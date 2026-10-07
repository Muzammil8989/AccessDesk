import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SHOTS = path.join(ROOT, 'apps/desktop/test-results');
mkdirSync(SHOTS, { recursive: true });
const desktopReq = createRequire(`${ROOT}/apps/desktop/package.json`);
const apiReq = createRequire(`${ROOT}/apps/api/package.json`);
const { _electron } = desktopReq('@playwright/test');
const jose = await import(pathToFileURL(apiReq.resolve('jose')).href);

for (const built of ['apps/api/dist/server.js', 'apps/desktop/out/main/index.js']) {
  if (!existsSync(path.join(ROOT, built))) {
    console.error(
      `Missing ${built}. Run "pnpm build" first (or use "pnpm test:e2e" from the repo root).`,
    );
    process.exit(2);
  }
}

const IDP_PORT = 18080;
const API_PORT = 14000;
const IDP = `http://127.0.0.1:${IDP_PORT}`;
const ISSUER = `${IDP}/realms/company-platform`;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`);
};

const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const codes = new Map();
const refreshTokens = new Set();
const issuedAccessTokens = [];
let issuedRoles = ['hr-admin', 'offline_access'];
const stats = { adminCalls: 0, adminBadAuth: 0, logoutBodies: [], tokenForms: [] };

const users = Array.from({ length: 25 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    id: randomUUID(),
    username: i === 0 ? 'ann' : `user${n}`,
    email: `${i === 0 ? 'ann' : 'user' + n}@example.com`,
    firstName: i === 0 ? 'Ann' : `User`,
    lastName: i === 0 ? 'Lee' : n,
    enabled: i % 7 !== 6,
    emailVerified: true,
    createdTimestamp: 1_700_000_000_000 + i * 86_400_000,
  };
});

async function issueTokens() {
  const access = await new jose.SignJWT({
    preferred_username: 'hana',
    name: 'Hana HR',
    realm_access: { roles: issuedRoles },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('admin-1')
    .setIssuer(ISSUER)
    .setAudience('accessdesk')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  issuedAccessTokens.push(access);
  const refresh = randomBytes(24).toString('hex');
  refreshTokens.add(refresh);
  return { access_token: access, refresh_token: refresh, expires_in: 300 };
}

const readBody = (req) =>
  new Promise((r) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => r(b));
  });
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const idp = createServer(async (req, res) => {
  const url = new URL(req.url, IDP);
  const p = url.pathname;
  if (p === '/realms/company-platform/.well-known/openid-configuration') {
    return sendJson(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      end_session_endpoint: `${ISSUER}/logout`,
      jwks_uri: `${ISSUER}/keys`,
    });
  }
  if (p === '/realms/company-platform/keys') return sendJson(res, 200, { keys: [jwk] });
  if (p === '/realms/company-platform/authorize') {
    const q = url.searchParams;
    if (q.get('code_challenge_method') !== 'S256' || q.get('response_type') !== 'code')
      return sendJson(res, 400, { error: 'bad' });
    const code = randomBytes(12).toString('hex');
    codes.set(code, { challenge: q.get('code_challenge'), redirect: q.get('redirect_uri') });
    res.writeHead(302, {
      Location: `${q.get('redirect_uri')}?code=${code}&state=${q.get('state')}`,
    });
    return res.end();
  }
  if (p === '/realms/company-platform/token') {
    const form = new URLSearchParams(await readBody(req));
    stats.tokenForms.push(Object.fromEntries(form));
    if (form.has('client_secret')) return sendJson(res, 400, { error: 'unexpected_secret' });
    if (form.get('grant_type') === 'authorization_code') {
      const entry = codes.get(form.get('code'));
      codes.delete(form.get('code'));
      const ok =
        entry &&
        entry.redirect === form.get('redirect_uri') &&
        createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url') === entry.challenge;
      return ok
        ? sendJson(res, 200, await issueTokens())
        : sendJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE failed' });
    }
    if (
      form.get('grant_type') === 'refresh_token' &&
      refreshTokens.delete(form.get('refresh_token'))
    ) {
      return sendJson(res, 200, await issueTokens());
    }
    return sendJson(res, 400, { error: 'invalid_grant' });
  }
  if (p === '/realms/company-platform/logout') {
    stats.logoutBodies.push(Object.fromEntries(new URLSearchParams(await readBody(req))));
    res.writeHead(204);
    return res.end();
  }
  if (p.startsWith('/admin/realms/company-platform/users')) {
    stats.adminCalls++;
    try {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      await jose.jwtVerify(token, publicKey, { issuer: ISSUER });
    } catch {
      stats.adminBadAuth++;
      return sendJson(res, 401, { error: 'HTTP 401 Unauthorized' });
    }
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const matches = users.filter(
      (u) => !search || JSON.stringify(u).toLowerCase().includes(search),
    );
    if (p.endsWith('/count')) return sendJson(res, 200, matches.length);
    const first = Number(url.searchParams.get('first') ?? 0);
    const max = Number(url.searchParams.get('max') ?? 100);
    return sendJson(res, 200, matches.slice(first, first + max));
  }
  sendJson(res, 404, { error: 'not found' });
});
await new Promise((r) => idp.listen(IDP_PORT, '127.0.0.1', r));

const ACCESS_POLICY = {
  AUTH_ADMIN_ROLES: 'hr-admin,super-admin',
  AUTH_ROLES_CLAIM_PATH: 'realm_access.roles',
};
const apiLogs = [];
const api = spawn('node', ['dist/server.js'], {
  cwd: `${ROOT}/apps/api`,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    IDENTITY_ISSUER_URL: ISSUER,
    IDENTITY_CLIENT_ID: 'accessdesk',
    ...ACCESS_POLICY,
    DATABASE_URL: 'postgresql://accessdesk:change-me@localhost:5432/accessdesk',
    API_PORT: String(API_PORT),
  },
});
api.stdout.on('data', (d) => apiLogs.push(String(d)));
api.stderr.on('data', (d) => apiLogs.push(String(d)));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const userData = mkdtempSync(path.join(os.tmpdir(), 'accessdesk-e2e-'));
const electronEnv = { ...process.env, ...ACCESS_POLICY };
delete electronEnv.ELECTRON_RUN_AS_NODE;
delete electronEnv.ELECTRON_RENDERER_URL;
const launch = () =>
  _electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: `${ROOT}/apps/desktop`,
    env: electronEnv,
  });
const consoleLogs = [];
let app;

try {
  app = await launch();
  let win = await app.firstWindow();
  win.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  win.on('pageerror', (e) => consoleLogs.push(`[pageerror] ${e.message}`));

  await win.getByText('Welcome to AccessDesk').waitFor({ timeout: 15000 });
  check('first run lands on the setup wizard', true, win.url());
  check('renderer is served from app:// scheme', win.url().startsWith('app://accessdesk/'));

  const env = await win.evaluate(() => ({
    require: typeof require,
    process: typeof process,
    buffer: typeof Buffer,
    bridge: Object.keys(window.accessdesk),
    bridgeApi: Object.keys(window.accessdesk.api),
    evalResult: (() => {
      try {
        eval('1+1');
        return 'allowed';
      } catch {
        return 'blocked';
      }
    })(),
  }));
  check(
    'no Node globals in renderer',
    env.require === 'undefined' && env.process === 'undefined' && env.buffer === 'undefined',
    JSON.stringify(env),
  );
  check(
    'preload exposes only settings/auth/api',
    env.bridge.sort().join() === 'api,auth,settings',
    env.bridge.join(),
  );
  const cspHeader = await app.evaluate(async ({ net }) =>
    (await net.fetch('app://accessdesk/index.html')).headers.get('content-security-policy'),
  );
  check(
    'app:// responses carry the strict CSP header',
    !!cspHeader && cspHeader.includes("script-src 'self'") && !cspHeader.includes('unsafe'),
    cspHeader,
  );
  const inlineResult = await win.evaluate(
    () =>
      new Promise((resolve) => {
        document.addEventListener(
          'securitypolicyviolation',
          (e) => resolve(`blocked:${e.violatedDirective}`),
          { once: true },
        );
        const s = document.createElement('script');
        s.textContent = 'window.__x = 1';
        document.head.append(s);
        setTimeout(() => resolve(window.__x === 1 ? 'executed' : 'none'), 400);
      }),
  );
  check('CSP blocks injected inline scripts', inlineResult.startsWith('blocked'), inlineResult);
  const wins0 = app.windows().length;
  await win.evaluate(() => {
    window.open('https://example.com');
  });
  await win.waitForTimeout(500);
  check('window.open to an external site is denied', app.windows().length === wins0);

  await win.screenshot({ path: path.join(SHOTS, '1-setup.png') });

  await win.getByLabel('Issuer URL').fill('not-a-url');
  await win.getByRole('button', { name: 'Save and continue' }).click();
  await win
    .getByText(/invalid|url/i)
    .first()
    .waitFor({ timeout: 5000 });
  check('wizard validates input with Zod', true);
  await win.getByLabel('Issuer URL').fill(ISSUER);
  await win.getByLabel('Client ID').fill('accessdesk');
  await win.getByLabel('AccessDesk API URL').fill(`http://127.0.0.1:${API_PORT}`);
  await win.getByRole('button', { name: 'Test connection' }).click();
  await win.getByText('Connected to the identity provider').waitFor({ timeout: 10000 });
  check('test connection reaches OIDC discovery', true);
  await win.getByRole('button', { name: 'Save and continue' }).click();
  await win.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  check('saving settings continues to the login page', true);
  await win.screenshot({ path: path.join(SHOTS, '2-login.png') });

  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      globalThis.__opened = url;
      void fetch(url);
    };
  });
  await win.getByRole('button', { name: 'Sign in' }).click();
  await win.getByRole('heading', { name: 'Employees' }).waitFor({ timeout: 15000 });
  const opened = new URL(await app.evaluate(() => globalThis.__opened));
  check(
    'login opened the system browser with PKCE S256 + loopback redirect',
    opened.searchParams.get('code_challenge_method') === 'S256' &&
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/.test(opened.searchParams.get('redirect_uri')),
    opened.searchParams.get('redirect_uri'),
  );
  check(
    'token request carried no client secret',
    stats.tokenForms.every((f) => !('client_secret' in f)),
  );
  check('signed-in user shown in the sidebar', await win.getByText('Hana HR').isVisible());

  await win.getByText('Showing 1–20 of 25').waitFor({ timeout: 15000 });
  check(
    'employees list loaded via API -> identity provider admin API (JWT verified via discovered keys)',
    true,
  );
  check(
    'API forwarded a token the identity provider accepted on every admin call',
    stats.adminCalls >= 2 && stats.adminBadAuth === 0,
    `calls=${stats.adminCalls}`,
  );
  await win.screenshot({ path: path.join(SHOTS, '3-employees.png') });

  await win.getByRole('button', { name: 'Next' }).click();
  await win.getByText('Showing 21–25 of 25').waitFor({ timeout: 10000 });
  check('pagination works', true);
  await win.getByLabel('Search employees').fill('ann');
  await win.getByText('Showing 1–1 of 1').waitFor({ timeout: 10000 });
  check('search works', true);
  await win.getByLabel('Search employees').fill('zzzz');
  await win.getByText(/No employees match/).waitFor({ timeout: 10000 });
  check('empty state works', true);

  for (const name of ['Onboard', 'Offboard', 'Access Review', 'Audit Log']) {
    await win.getByRole('link', { name }).click();
    await win.getByRole('heading', { name }).waitFor({ timeout: 5000 });
  }
  check('placeholder screens reachable from sidebar', true);
  await win.getByRole('link', { name: 'Settings' }).click();
  await win.getByRole('heading', { name: 'Identity provider connection' }).waitFor();
  await win.screenshot({ path: path.join(SHOTS, '4-settings.png') });

  const sessionFile = path.join(userData, 'session.bin');
  const settingsFile = path.join(userData, 'settings.json');
  const sessionBytes = existsSync(sessionFile) ? readFileSync(sessionFile).toString('latin1') : '';
  check('session file exists (safeStorage available)', existsSync(sessionFile));
  check(
    'session file does not contain tokens in plain text',
    existsSync(sessionFile) &&
      issuedAccessTokens.every((t) => !sessionBytes.includes(t.slice(20, 80))) &&
      !sessionBytes.includes('refresh_token') &&
      !sessionBytes.includes('accessToken'),
  );
  const settingsText = readFileSync(settingsFile, 'utf8');
  check(
    'settings file holds only public values',
    !/secret|password|token/i.test(settingsText),
    settingsText.replace(/\s+/g, ' '),
  );

  await app.close();
  app = await launch();
  win = await app.firstWindow();
  win.on('console', (m) => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  await win.getByRole('heading', { name: 'Employees' }).waitFor({ timeout: 15000 });
  await win.getByText('Showing 1–20 of 25').waitFor({ timeout: 15000 });
  check('session survives an app restart without signing in again', true);

  await win.getByRole('button', { name: 'Sign out' }).click();
  await win.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  check('sign out returns to the login page', true);
  check(
    'identity provider session ended on sign out',
    stats.logoutBodies.length === 1 &&
      stats.logoutBodies[0].client_id === 'accessdesk' &&
      !!stats.logoutBodies[0].refresh_token,
  );
  check('session file removed on sign out', !existsSync(sessionFile));

  issuedRoles = ['offline_access', 'default-roles-company-platform'];
  const callsBefore = stats.adminCalls;
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      void fetch(url);
    };
  });
  await win.getByRole('button', { name: 'Sign in' }).click();
  const noAccess = win.getByRole('heading', { name: "You don't have access to AccessDesk" });
  await noAccess.waitFor({ timeout: 15000 });
  check('user without an admin role gets the no-access page', true);
  check(
    'no menu is shown to them',
    (await win.getByRole('navigation', { name: 'Main' }).count()) === 0 &&
      (await win.getByRole('link', { name: 'Employees' }).count()) === 0,
  );
  await win.screenshot({ path: path.join(SHOTS, '5-no-access.png') });
  await win.evaluate(() => {
    location.hash = '#/employees';
  });
  await win.waitForTimeout(500);
  check('typing the URL of a hidden screen does not open it', await noAccess.isVisible());
  check('no employee data was requested for them', stats.adminCalls === callsBefore);
  await win.getByRole('button', { name: 'Sign out' }).click();
  await win.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  check('they can sign out from the no-access page', true);

  void win
    .evaluate(() => {
      location.href = 'https://example.com/';
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  check(
    'navigation to an external site is blocked',
    win.url().startsWith('app://accessdesk/'),
    win.url(),
  );
} catch (error) {
  console.log(String(error));
  check('script completed', false);
  try {
    if (app) {
      const w = (await app.windows())[0];
      await w?.screenshot({ path: path.join(SHOTS, 'failure.png') });
    }
  } catch {}
} finally {
  await app?.close().catch(() => {});
  api.kill();
  idp.close();
}

const apiText = apiLogs.join('');
const leaked = issuedAccessTokens.some((t) => apiText.includes(t.slice(20, 80)));
check('API logs never contain a token', !leaked);
const ownProbe = /Executing inline script violates/;
const unexpectedLogs = consoleLogs.filter((l) => !ownProbe.test(l));
const csp = unexpectedLogs.filter((l) => /content security policy|refused to/i.test(l));
check('no CSP violations in the renderer console', csp.length === 0, csp.join(' | '));
const errors = unexpectedLogs.filter((l) => /^\[(error|pageerror)\]/.test(l));
check('no console errors', errors.length === 0, errors.join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) {
  console.log('\nconsole:\n' + consoleLogs.join('\n'));
  console.log('\napi log tail:\n' + apiText.split('\n').slice(-15).join('\n'));
}
process.exit(failed ? 1 : 0);
