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
      `Missing ${built}. Run "pnpm test:e2e": it builds the API and the app first, which running this file directly does not.`,
    );
    process.exit(2);
  }
}

const SCRATCH_DATABASE_NAME = /^accessdesk_e2e_[0-9a-f]{8}$/;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;
if (E2E_DATABASE_URL && !SCRATCH_DATABASE_NAME.test(new URL(E2E_DATABASE_URL).pathname.slice(1))) {
  console.error('E2E_DATABASE_URL must name a scratch database called accessdesk_e2e_<8 hex>.');
  process.exit(2);
}
const HAS_DATABASE = Boolean(E2E_DATABASE_URL);
const API_DATABASE_URL =
  E2E_DATABASE_URL ?? 'postgresql://e2e:e2e@127.0.0.1:1/accessdesk_e2e_unused';

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

const ADMIN_PREFIX = '/admin/realms/company-platform';
const groups = [
  { id: 'g-eng', name: 'Engineering', path: '/Engineering' },
  { id: 'g-sales', name: 'Sales', path: '/Sales' },
];
const roles = new Map(
  ['member', 'manager', 'admin', 'developer'].map((name) => [name, { id: randomUUID(), name }]),
);
const memberships = new Map();
const roleMappings = new Map();
const onboarding = {
  created: [],
  groupPuts: [],
  roleMappingPosts: [],
  failNextRoleMapping: false,
};

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
  if (p.startsWith(`${ADMIN_PREFIX}/`)) {
    stats.adminCalls++;
    try {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      await jose.jwtVerify(token, publicKey, { issuer: ISSUER });
    } catch {
      stats.adminBadAuth++;
      return sendJson(res, 401, { error: 'HTTP 401 Unauthorized' });
    }
    const [collection, id, sub, subId] = p
      .slice(ADMIN_PREFIX.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const first = Number(url.searchParams.get('first') ?? 0);
    const max = Number(url.searchParams.get('max') ?? 100);

    if (collection === 'groups' && !id && req.method === 'GET') {
      return sendJson(res, 200, groups.slice(first, first + max));
    }
    if (collection === 'roles' && !id && req.method === 'GET') {
      return sendJson(res, 200, [...roles.values()].slice(first, first + max));
    }
    if (collection === 'roles' && id && !sub && req.method === 'GET') {
      return roles.has(id)
        ? sendJson(res, 200, roles.get(id))
        : sendJson(res, 404, { errorMessage: 'Role not found' });
    }
    if (collection !== 'users') return sendJson(res, 404, { error: 'not found' });

    if (!id && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (users.some((u) => u.username === String(body.username).toLowerCase())) {
        return sendJson(res, 409, { errorMessage: 'User exists with same username' });
      }
      if (body.email && users.some((u) => u.email === String(body.email).toLowerCase())) {
        return sendJson(res, 409, { errorMessage: 'User exists with same email' });
      }
      const created = {
        id: randomUUID(),
        username: String(body.username).toLowerCase(),
        email: body.email ? String(body.email).toLowerCase() : null,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        enabled: body.enabled ?? true,
        emailVerified: body.emailVerified ?? false,
        createdTimestamp: Date.now(),
      };
      users.push(created);
      onboarding.created.push({ id: created.id, body });
      res.writeHead(201, { Location: `${IDP}${ADMIN_PREFIX}/users/${created.id}` });
      return res.end();
    }

    if (!id && req.method === 'GET') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const exact = url.searchParams.get('exact') === 'true';
      const field = (value, wanted) =>
        wanted === null ||
        (exact
          ? value?.toLowerCase() === wanted.toLowerCase()
          : Boolean(value?.toLowerCase().includes(wanted.toLowerCase())));
      const found = users.filter(
        (u) =>
          (!search || JSON.stringify(u).toLowerCase().includes(search)) &&
          field(u.username, url.searchParams.get('username')) &&
          field(u.email, url.searchParams.get('email')),
      );
      return sendJson(res, 200, found.slice(first, first + max));
    }
    if (id === 'count' && req.method === 'GET') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      return sendJson(
        res,
        200,
        users.filter((u) => !search || JSON.stringify(u).toLowerCase().includes(search)).length,
      );
    }

    const user = users.find((u) => u.id === id);
    if (!user) return sendJson(res, 404, { errorMessage: 'User not found' });
    if (!sub && req.method === 'GET') return sendJson(res, 200, user);
    if (sub === 'groups') {
      const joined = memberships.get(id) ?? new Set();
      if (!subId && req.method === 'GET') {
        return sendJson(
          res,
          200,
          groups.filter((g) => joined.has(g.id)),
        );
      }
      if (subId && req.method === 'PUT') {
        if (!groups.some((g) => g.id === subId)) {
          return sendJson(res, 404, { errorMessage: 'Group not found' });
        }
        onboarding.groupPuts.push({ userId: id, groupId: subId });
        memberships.set(id, joined.add(subId));
        res.writeHead(204);
        return res.end();
      }
    }
    if (sub === 'role-mappings' && subId === 'realm') {
      const assigned = roleMappings.get(id) ?? new Set();
      if (req.method === 'GET') {
        return sendJson(
          res,
          200,
          [...assigned].map((name) => roles.get(name)),
        );
      }
      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '[]');
        if (onboarding.failNextRoleMapping) {
          onboarding.failNextRoleMapping = false;
          return sendJson(res, 500, { errorMessage: 'Simulated failure' });
        }
        onboarding.roleMappingPosts.push({ userId: id, names: body.map((r) => r.name) });
        for (const role of body) assigned.add(role.name);
        roleMappings.set(id, assigned);
        res.writeHead(204);
        return res.end();
      }
    }
    return sendJson(res, 404, { error: 'not found' });
  }
  sendJson(res, 404, { error: 'not found' });
});
await new Promise((r) => idp.listen(IDP_PORT, '127.0.0.1', r));

const ACCESS_POLICY = {
  AUTH_ADMIN_ROLES: 'hr-admin,super-admin',
  AUTH_SUPER_ADMIN_ROLE: 'super-admin',
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
    DATABASE_URL: API_DATABASE_URL,
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
let onboardedPassword = '';
let templatePassword = '';

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
    bridgeOnboarding: Object.keys(window.accessdesk.api.onboarding),
    bridgeChecklists: Object.keys(window.accessdesk.api.checklists),
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
  check(
    'the only write calls on the bridge are onboarding create and retry, ticking a checklist task and closing one',
    env.bridgeApi.sort().join() === 'checklists,get,onboarding' &&
      env.bridgeOnboarding.sort().join() === 'create,retry' &&
      env.bridgeChecklists.sort().join() === 'setClosed,setItem',
    `${env.bridgeApi.join()} / ${env.bridgeOnboarding.join()} / ${env.bridgeChecklists.join()}`,
  );
  const refusedRead = await win.evaluate(() => window.accessdesk.api.get('/audit-log'));
  check(
    'a read path that is not on the allowlist is refused, without calling the API',
    refusedRead.ok === false && refusedRead.status === 400,
    JSON.stringify(refusedRead),
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

  for (const name of ['Offboard', 'Access Review', 'Audit Log']) {
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

  await win.getByRole('link', { name: 'Onboard' }).click();
  await win.getByRole('heading', { name: 'Onboard' }).waitFor({ timeout: 5000 });
  await win.getByLabel('First name').waitFor({ timeout: 10000 });
  check(
    'onboard form lists the departments from the identity provider',
    (await win.getByLabel('Department').locator('option').allInnerTexts()).join() ===
      'Select a department,Engineering,Sales',
  );
  const adminOption = win.getByLabel('Role').locator('option', { hasText: 'Admin' });
  check('admin role is disabled for an hr-admin', await adminOption.isDisabled());
  check(
    'owner role is never offered',
    (await win.getByLabel('Role').locator('option', { hasText: 'Owner' }).count()) === 0,
  );
  await win.getByRole('button', { name: 'Onboard employee' }).click();
  await win.getByText('Enter a first name').waitFor({ timeout: 5000 });
  check('onboard form explains missing fields in plain language', true);

  const fillOnboardForm = async (username, email) => {
    await win.getByLabel('First name').fill('Nina');
    await win.getByLabel('Last name').fill('Novak');
    await win.getByLabel('Email').fill(email);
    await win.getByLabel('Username').fill(username);
    await win.getByLabel('Department').selectOption({ label: 'Engineering' });
    await win.getByLabel('Role').selectOption({ label: 'Member' });
    await win.getByRole('button', { name: 'Onboard employee' }).click();
  };

  await fillOnboardForm('ann', 'nina@example.com');
  await win.getByText('Username already exists').waitFor({ timeout: 10000 });
  check(
    'a taken username is reported next to the username field',
    (await win.getByLabel('Username').getAttribute('aria-invalid')) === 'true',
  );
  check('nothing was created for the duplicate', onboarding.created.length === 0);

  await fillOnboardForm('nina.novak', 'nina@example.com');
  await win.getByText('Employee onboarded').waitFor({ timeout: 15000 });
  onboardedPassword = (await win.getByLabel('Temporary password').innerText()).trim();
  check(
    'onboarding shows a 16 character one-time password',
    /^[A-Za-z0-9]{16}$/.test(onboardedPassword),
  );
  check(
    'success screen warns the password will not be shown again',
    await win.getByText(/will not be shown again/).isVisible(),
  );
  const createdUser = onboarding.created.find((c) => c.body.username === 'nina.novak');
  check(
    'the identity provider got a verified, enabled user with a temporary password',
    createdUser?.body.emailVerified === true &&
      createdUser.body.enabled === true &&
      createdUser.body.credentials?.[0]?.temporary === true &&
      createdUser.body.credentials[0].value === onboardedPassword,
  );
  check(
    'the user was added to the department and given the role',
    createdUser !== undefined &&
      onboarding.groupPuts.some((g) => g.userId === createdUser.id && g.groupId === 'g-eng') &&
      onboarding.roleMappingPosts.some(
        (r) => r.userId === createdUser.id && r.names.join() === 'member',
      ),
  );
  check(
    'every onboarding call used a token the identity provider accepted',
    stats.adminBadAuth === 0,
  );
  await win.screenshot({ path: path.join(SHOTS, '6-onboarded.png') });

  // Copy needs the one clipboard-write permission the app grants. Read the real system clipboard
  // from the main process; never print its content.
  await app.evaluate(({ clipboard }) => clipboard.writeText('stale clipboard text'));
  await win.getByRole('button', { name: 'Copy' }).click();
  await win.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 5000 });
  check(
    'Copy puts the one-time password on the system clipboard',
    (await app.evaluate(({ clipboard }) => clipboard.readText())) === onboardedPassword,
  );
  check(
    'Copy shows a toast and no "could not copy" message',
    (await win.getByText('Password copied to the clipboard').isVisible()) &&
      (await win.getByText(/Could not copy automatically/).count()) === 0,
  );
  await win.screenshot({ path: path.join(SHOTS, '6b-copied.png') });
  const stillDenied = await win.evaluate(async () => {
    const denied = async (run) => {
      try {
        await run();
        return false;
      } catch {
        return true;
      }
    };
    return {
      clipboardRead: await denied(() => navigator.clipboard.readText()),
      geolocation: await new Promise((resolve) =>
        navigator.geolocation.getCurrentPosition(
          () => resolve(false),
          () => resolve(true),
          { timeout: 3000 },
        ),
      ),
      notifications: (await Notification.requestPermission()) === 'denied',
    };
  });
  check(
    'reading the clipboard, location and notifications are still refused',
    stillDenied.clipboardRead && stillDenied.geolocation && stillDenied.notifications,
  );
  await app.evaluate(({ clipboard }) => clipboard.clear()); // do not leave the password behind

  await win.getByRole('button', { name: 'Onboard another' }).click();
  await win.getByLabel('First name').waitFor({ timeout: 5000 });
  check(
    '"Onboard another" clears the form and the password',
    (await win.getByLabel('First name').inputValue()) === '' &&
      !(await win.locator('body').innerText()).includes(onboardedPassword),
  );

  if (HAS_DATABASE) {
    onboarding.failNextRoleMapping = true;
    await fillOnboardForm('second.hire', 'second.hire@example.com');
    await win.getByText('Onboarding is not finished').waitFor({ timeout: 15000 });
    const partialPassword = (await win.getByLabel('Temporary password').innerText()).trim();
    check(
      'a failed step shows the partial screen with the password still visible',
      /^[A-Za-z0-9]{16}$/.test(partialPassword) && (await win.getByText('Failed').isVisible()),
    );
    await win.screenshot({ path: path.join(SHOTS, '7-partial.png') });
    const secondUser = onboarding.created.find((c) => c.body.username === 'second.hire');
    const groupPutsBefore = onboarding.groupPuts.filter((g) => g.userId === secondUser?.id).length;

    await win.getByRole('button', { name: 'Retry' }).click();
    await win.getByText('Employee onboarded').waitFor({ timeout: 15000 });
    check(
      'retry finishes the remaining step and skips the one that was already done',
      onboarding.roleMappingPosts.some((r) => r.userId === secondUser?.id) &&
        onboarding.groupPuts.filter((g) => g.userId === secondUser?.id).length ===
          groupPutsBefore &&
        groupPutsBefore === 1,
    );
    check(
      'the password stays visible after a retry',
      (await win.getByLabel('Temporary password').innerText()).trim() === partialPassword,
    );
    check(
      'the user was never deleted or created twice',
      onboarding.created.filter((c) => c.body.username === 'second.hire').length === 1,
    );
    await win.getByRole('button', { name: 'Onboard another' }).click();
    await win.getByLabel('First name').waitFor({ timeout: 5000 });
  } else {
    console.log(
      'SKIP  retry and template scenarios: no scratch database (run "pnpm test:e2e" with TEST_DATABASE_URL set)',
    );
  }

  if (HAS_DATABASE) {
    const pg = apiReq('pg');
    const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
    await db.connect();
    try {
      const templateSelect = win.getByLabel('Template (optional)');
      await templateSelect.waitFor({ timeout: 10000 });
      const templateOptions = await templateSelect.locator('option').allInnerTexts();
      check(
        'the form offers the seeded templates',
        templateOptions.join() === 'No template,Developer,HR,Sales',
        templateOptions.join(),
      );
      check(
        'a template with an admin-level role is disabled for an hr-admin, with the reason',
        (await templateSelect.locator('option', { hasText: 'HR' }).isDisabled()) &&
          (await win.getByText(/Not available to you: HR/).isVisible()),
      );

      await win.getByLabel('First name').fill('Tina');
      await win.getByLabel('Last name').fill('Templ');
      await win.getByLabel('Email').fill('tina.templ@example.com');
      await win.getByLabel('Username').fill('tina.templ');
      await templateSelect.selectOption({ label: 'Developer' });
      check(
        'choosing a template fills in the department and the role',
        (await win.getByLabel('Department').inputValue()) === 'g-eng' &&
          (await win.getByLabel('Role').inputValue()) === 'member' &&
          (await win.getByText(/Department set to Engineering/).isVisible()),
      );
      check(
        'the form lists what the template will also do',
        (await win.getByText('Assign the role developer').isVisible()) &&
          (await win.getByText('Add the task "Order laptop" to their checklist').isVisible()),
      );
      await win.screenshot({ path: path.join(SHOTS, '8-template.png') });
      await win.getByRole('button', { name: 'Onboard employee' }).click();
      await win.getByText('Employee onboarded').waitFor({ timeout: 15000 });
      templatePassword = (await win.getByLabel('Temporary password').innerText()).trim();

      const tina = onboarding.created.find((c) => c.body.username === 'tina.templ');
      check(
        'the user got the form role and the template role, and the department group once',
        tina !== undefined &&
          onboarding.roleMappingPosts
            .filter((r) => r.userId === tina.id)
            .map((r) => r.names.join())
            .join('|') === 'member|developer' &&
          onboarding.groupPuts.filter((g) => g.userId === tina.id).length === 1,
      );
      check(
        'the result lists the template role step and the checklist step as done',
        (await win.getByText('Assign the template role').isVisible()) &&
          (await win.getByText('Create the checklist').isVisible()),
      );

      const laptop = win.getByRole('checkbox', { name: 'Order laptop' });
      await laptop.waitFor({ timeout: 10000 });
      check(
        'the checklist is shown on the result screen with the template tasks, none ticked',
        (await win.getByRole('checkbox').count()) === 2 &&
          !(await laptop.isChecked()) &&
          (await win.getByText('0 of 2 tasks done', { exact: true }).isVisible()),
      );
      await laptop.click();
      await win.getByText('1 of 2 tasks done', { exact: true }).waitFor({ timeout: 10000 });
      check('ticking a task saves it and updates the progress', await laptop.isChecked());
      await win.screenshot({ path: path.join(SHOTS, '8b-checklist.png') });

      const auditFor = async () =>
        (
          await db.query(
            `SELECT action, outcome, actor_id, details::text AS details FROM app_audit_log
             WHERE target_subject_id = $1 ORDER BY created_at, action`,
            [tina.id],
          )
        ).rows;
      const actions = (await auditFor()).map((row) => row.action);
      check(
        'every step and the tick wrote an audit row',
        [
          'onboarding.create_user',
          'onboarding.add_to_group',
          'onboarding.assign_role',
          'onboarding.template_assign_role',
          'onboarding.create_checklist',
          'checklist.item_done',
        ].every((action) => actions.includes(action)),
        actions.join(),
      );
      const auditText = JSON.stringify(await auditFor());
      check(
        'no audit row holds the password, a name, the email or the username',
        ![templatePassword, 'Tina', 'Templ', 'tina.templ'].some((secret) =>
          auditText.includes(secret),
        ),
      );
      const stored = await db.query(
        `SELECT row_to_json(c)::text AS checklist,
                (SELECT string_agg(row_to_json(i)::text, ' ') FROM checklist_items i
                 WHERE i.checklist_id = c.id) AS items
         FROM employee_checklists c WHERE c.subject_id = $1`,
        [tina.id],
      );
      const storedText = JSON.stringify(stored.rows);
      check(
        'the saved checklist is tied to the subject id only: no name, email or username',
        stored.rows.length === 1 &&
          ![templatePassword, 'Tina', 'Templ', 'tina.templ'].some((secret) =>
            storedText.includes(secret),
          ),
      );

      await win.getByRole('link', { name: 'Open checklists' }).click();
      await win.getByRole('heading', { name: 'Onboarding checklists' }).waitFor({ timeout: 10000 });
      const row = win.getByRole('row', { name: /Tina Templ/ });
      await row.waitFor({ timeout: 10000 });
      check(
        'the open checklists list shows the live name and the progress',
        (await row.getByText('1 of 2 tasks done', { exact: true }).isVisible()) &&
          (await row.getByText('tina.templ').isVisible()),
      );
      check(
        'leaving the page cleared the temporary password',
        !(await win.locator('body').innerText()).includes(templatePassword),
      );
      check(
        'the page heading has keyboard focus when the screen opens',
        await win
          .getByRole('heading', { name: 'Onboarding checklists' })
          .evaluate((element) => element === document.activeElement),
      );
      await win.screenshot({ path: path.join(SHOTS, '9-checklists.png') });

      await row.getByRole('link', { name: /Open the checklist for Tina Templ/ }).click();
      await win
        .getByRole('heading', { name: 'Checklist for Tina Templ' })
        .waitFor({ timeout: 10000 });
      const again = win.getByRole('checkbox', { name: 'Order laptop' });
      await again.waitFor({ timeout: 10000 });
      check('the checklist screen shows the saved tick', await again.isChecked());
      await again.click();
      await win.getByText('0 of 2 tasks done', { exact: true }).waitFor({ timeout: 10000 });
      const afterUntick = (await auditFor()).map((entry) => entry.action);
      check(
        'unticking a task writes its own audit row',
        afterUntick.includes('checklist.item_undone'),
        afterUntick.join(),
      );

      await win.getByRole('link', { name: 'Onboard', exact: true }).click();
      await win.getByLabel('First name').waitFor({ timeout: 10000 });
      check(
        'the form is empty again after the checklist screens, with no password',
        (await win.getByLabel('First name').inputValue()) === '' &&
          !(await win.locator('body').innerText()).includes(templatePassword),
      );

      // ---- a manager and a start date, and no tasks: the checklist stays open until it is closed
      const ann = users.find((u) => u.username === 'ann');
      await win.getByLabel('First name').fill('Max');
      await win.getByLabel('Last name').fill('Mgr');
      await win.getByLabel('Email').fill('max.mgr@example.com');
      await win.getByLabel('Username').fill('max.mgr');
      await win.getByLabel('Department').selectOption({ label: 'Engineering' });

      await win.getByLabel('Search for a manager').fill('user07');
      const disabledChoice = win.getByRole('radio', { name: /User 07/ });
      await disabledChoice.waitFor({ timeout: 10000 });
      check(
        'a person with a disabled account is listed but cannot be chosen as manager',
        (await disabledChoice.isDisabled()) &&
          (await win.getByText(/account disabled, cannot be chosen/).isVisible()),
      );
      await win.getByLabel('Search for a manager').fill('ann');
      await win.getByRole('radio', { name: /Ann Lee/ }).click();
      check(
        'moving to a person does not pick them until the button is pressed',
        await win.getByRole('button', { name: 'Use this person as manager' }).isEnabled(),
      );
      await win.getByRole('button', { name: 'Use this person as manager' }).click();
      check(
        'the chosen manager is shown with a Remove button',
        await win.getByRole('button', { name: 'Remove Ann Lee as manager' }).isVisible(),
      );
      await win.getByLabel('Start date (optional)').fill('2026-10-20');
      check(
        'the form says the start date is information only',
        await win
          .getByText(
            'Information only. The account is created and enabled now. It does not unlock on this date.',
          )
          .isVisible(),
      );
      await win.screenshot({ path: path.join(SHOTS, '10-manager.png') });
      await win.getByRole('button', { name: 'Onboard employee' }).click();
      await win.getByText('Employee onboarded').waitFor({ timeout: 15000 });

      const max = onboarding.created.find((c) => c.body.username === 'max.mgr');
      check(
        'the account was created and enabled at once, whatever the start date',
        max?.body.enabled === true,
      );
      check(
        'the result shows the manager by name and the start date with its note',
        (await win.getByText('Ann Lee', { exact: true }).first().isVisible()) &&
          (await win.getByText('Oct 20, 2026').isVisible()) &&
          (await win.getByText(/It does not unlock on this date/).isVisible()),
      );
      await win.getByText('This checklist has no tasks.').waitFor({ timeout: 10000 });
      check(
        'a checklist with no tasks offers "Mark as done" and says it stays open',
        (await win.getByRole('button', { name: 'Mark as done' }).isVisible()) &&
          (await win.getByText('It stays in the Open list until you mark it as done.').isVisible()),
      );

      const saved = await db.query(
        `SELECT status, completed_at, manager_subject_id, start_date::text AS start_date,
                (SELECT count(*)::int FROM checklist_items i WHERE i.checklist_id = c.id) AS tasks
         FROM employee_checklists c WHERE c.subject_id = $1`,
        [max.id],
      );
      check(
        'the saved checklist is open, not done, with the manager id and the start date only',
        saved.rows.length === 1 &&
          saved.rows[0].status === 'OPEN' &&
          saved.rows[0].completed_at === null &&
          saved.rows[0].manager_subject_id === ann.id &&
          saved.rows[0].start_date === '2026-10-20' &&
          saved.rows[0].tasks === 0,
        JSON.stringify(saved.rows),
      );
      const maxStored = JSON.stringify(
        (
          await db.query(
            `SELECT row_to_json(c)::text AS c FROM employee_checklists c WHERE c.subject_id = $1
             UNION ALL SELECT details::text FROM app_audit_log WHERE target_subject_id = $1`,
            [max.id],
          )
        ).rows,
      );
      check(
        'no saved row or audit row holds a name, an email, a username or the manager name',
        !['Max', 'Mgr', 'max.mgr', 'Ann', 'Lee', 'ann@example.com'].some((secret) =>
          maxStored.includes(secret),
        ),
      );

      await win.getByRole('link', { name: 'Open checklists' }).click();
      await win.getByRole('heading', { name: 'Onboarding checklists' }).waitFor({ timeout: 10000 });
      const maxRow = win.getByRole('row', { name: /Max Mgr/ });
      await maxRow.waitFor({ timeout: 10000 });
      check(
        'it shows in the Open list with "No tasks", the manager name and the start date',
        (await maxRow.getByText('No tasks').isVisible()) &&
          (await maxRow.getByText('Ann Lee').isVisible()) &&
          (await maxRow.getByText('Oct 20, 2026').isVisible()),
      );
      await win.screenshot({ path: path.join(SHOTS, '11-open-empty.png') });

      await maxRow.getByRole('link', { name: /Open the checklist for Max Mgr/ }).click();
      await win.getByRole('heading', { name: 'Checklist for Max Mgr' }).waitFor({ timeout: 10000 });
      check(
        'the checklist screen shows the manager and the start date',
        await win.getByText(/Manager Ann Lee · Start date Oct 20, 2026/).isVisible(),
      );
      await win.getByRole('button', { name: 'Mark as done' }).click();
      await win.getByText('Marked as done', { exact: true }).waitFor({ timeout: 10000 });
      const closed = await db.query(
        `SELECT status, completed_at FROM employee_checklists WHERE subject_id = $1`,
        [max.id],
      );
      const closeActions = (
        await db.query(
          `SELECT action FROM app_audit_log WHERE target_subject_id = $1 ORDER BY created_at, action`,
          [max.id],
        )
      ).rows.map((row) => row.action);
      check(
        'closing it saves the status and writes an audit row',
        closed.rows[0].status === 'COMPLETED' &&
          closed.rows[0].completed_at !== null &&
          closeActions.includes('checklist.close'),
        closeActions.join(),
      );

      await win.getByRole('link', { name: /All checklists/ }).click();
      await win.getByRole('heading', { name: 'Onboarding checklists' }).waitFor({ timeout: 10000 });
      const leftOpen = await win
        .getByRole('row', { name: /Max Mgr/ })
        .waitFor({ state: 'detached', timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      check('it has left the Open list', leftOpen);
      await win.getByRole('radio', { name: 'Done' }).click();
      const doneRow = win.getByRole('row', { name: /Max Mgr/ });
      await doneRow.waitFor({ timeout: 10000 });
      check(
        'and it is in the Done list as "Marked as done", still showing its manager and start date',
        (await doneRow.getByText('Marked as done', { exact: true }).isVisible()) &&
          (await doneRow.getByText('Ann Lee').isVisible()) &&
          (await doneRow.getByText('Oct 20, 2026').isVisible()),
      );
    } finally {
      await db.end().catch(() => {});
    }
  }

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
check(
  'API logs never contain the temporary password',
  onboardedPassword !== '' && !apiText.includes(onboardedPassword),
);
if (HAS_DATABASE) {
  check(
    'API logs never contain the temporary password of the template onboarding',
    templatePassword !== '' && !apiText.includes(templatePassword),
  );
}
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
