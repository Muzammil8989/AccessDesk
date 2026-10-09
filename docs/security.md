# Security rules

These are enforced in code and covered by tests where possible. Report vulnerabilities as described in
[SECURITY.md](../SECURITY.md).

1. **No client secret or admin password anywhere in the desktop app.** It is a public OIDC client.
2. **Login is Authorization Code + PKCE (S256)** as a public client, opened in the **system browser**
   (never an embedded window). The redirect is a loopback listener on
   `http://127.0.0.1:<random port>/callback`, run by the Electron main process. It serves only
   `/callback`, checks `state` and the `Host` header, and closes after the first valid response.
3. **Electron hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. A strict
   Content Security Policy (production: scripts and styles from `self` only, no network access from the
   page). Navigation is limited to the app's own origin, new windows are denied, webviews are blocked,
   and every permission request is refused except one: writing text to the clipboard (Chromium's
   `clipboard-sanitized-write`), from the app's own top-level page only, so that "Copy" works on the
   one-time password. Reading the clipboard, location, notifications and the rest stay denied. The
   preload exposes a small typed API, and IPC handlers
   accept calls from the app's own top-level page only. In production the UI is served from a custom
   `app://` scheme so that the CSP and origin checks apply.
4. **Tokens are stored with Electron `safeStorage`** (Windows DPAPI, macOS Keychain, Linux libsecret),
   never in plain files or `localStorage`. If secure storage is unavailable, tokens stay in memory
   only. The renderer never sees a token: the main process attaches it to API calls.
5. **The API verifies the access token on every request** (signature, issuer, audience, expiry, pinned
   algorithms RS256/PS256/ES256) and requires one of the configured admin roles (`AUTH_ADMIN_ROLES`,
   default `super-admin` and `hr-admin`, read from the token at `AUTH_ROLES_CLAIM_PATH`). The signing
   keys are found through standard OIDC discovery: the issuer URL plus
   `/.well-known/openid-configuration`, then its `jwks_uri`. Only the two health probes, `/health` and `/ready`, are public.
6. **The API calls the identity provider with the admin's own access token**, forwarded as is. There is
   no service account, so the provider's admin events show the real person.
7. **All input is validated with Zod** on both sides: API query and params, IPC payloads, settings, and
   API responses in the renderer. Tokens and passwords are never logged (`authorization` headers are
   redacted, and error messages never include tokens). Passwords and personal data never go into an audit
   row either: audit details are IDs, role and group names, counts and dates. Checklists are saved with a
   `subjectId` only (the manager too), so no name or email is copied into AccessDesk's database; names are
   looked up live when a screen needs them.
8. **`.env` files are git-ignored.** Only `.env.example` is committed.
9. **The desktop's reach into the API is narrow.** The renderer gets typed bridge methods only. The main
   process reads six fixed paths (`/employees`, `/employees/<uuid>`, `/templates`,
   `/onboarding/options`, `/checklists`, `/checklists/<uuid>`) and has four fixed writes (onboarding
   create and retry, ticking a checklist task, closing a checklist), each building its path from
   validated UUIDs and sending only what the shared schema keeps. A write is sent again only after a 401,
   once, with a fresh token, and never after a network error or a timeout, because it may already have
   been applied.
10. **Which roles onboarding may assign is one shared rule, enforced by the API.** See "Role-based
    visibility" below.
11. **A change and its audit row are one transaction.** Ticking a checklist task and closing or reopening
    a checklist write their audit row in the same database transaction, so neither exists without the
    other, and a failed audit write rolls the change back.

## Where each rule lives

| Rule                  | Code                                                              | Tests                                                                                                     |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| PKCE, loopback        | `apps/desktop/src/main/auth/`                                     | `apps/desktop/test/unit/main/auth/`                                                                       |
| Hardening, CSP        | `apps/desktop/src/main/security.ts`, `window.ts`, `index.ts`      | `apps/desktop/test/unit/main/security.test.ts`, `test/e2e/smoke.mjs`                                      |
| Encrypted tokens      | `apps/desktop/src/main/store/tokenStore.ts`                       | `apps/desktop/test/unit/main/store/store.test.ts`                                                         |
| JWT check, role guard | `apps/api/src/plugins/auth.ts`                                    | `apps/api/test/integration/auth.test.ts`                                                                  |
| Forwarded admin token | `apps/api/src/modules/employees/employees.routes.ts`              | `apps/api/test/integration/employees.test.ts`                                                             |
| One-time password     | `apps/api/src/modules/onboarding/` (ADR 0010)                     | `apps/api/test/integration/onboarding.test.ts`                                                            |
| Role rule             | `packages/shared/src/role-policy.ts`, onboarding service          | `packages/shared/test/unit/role-policy.test.ts`, `apps/api/test/integration/onboarding.templates.test.ts` |
| Checklist transaction | `apps/api/src/modules/checklists/prisma-checklists.repository.ts` | `apps/api/test/integration/checklists.prisma.test.ts` (real database)                                     |
| Desktop write path    | `apps/desktop/src/main/apiClient.ts`, `ipc.ts`                    | `apps/desktop/test/unit/main/apiClient.test.ts`, `ipc-contract.test.ts`                                   |
| Input validation      | `packages/shared/src/`                                            | `packages/shared/test/unit/`                                                                              |

## Role-based visibility

The desktop app shows each user only what their role allows. `packages/shared/src/permissions.ts` says
which roles may use which feature (`canAccess`, `hasAdminAccess`). The desktop main process reads
`AUTH_ADMIN_ROLES`, `AUTH_SUPER_ADMIN_ROLE` and `AUTH_ROLES_CLAIM_PATH` from the same `.env` as the
API, with the same validation code, so the UI and the API cannot disagree about who is an admin. The sidebar hides entries the
user cannot use, each screen is guarded against direct navigation, and a signed-in user with no AccessDesk
role sees only a "no access" page with no menu and no data requests.

This is a convenience, not a security boundary: the renderer reads roles from the token for display only.
The API checks the real token on every request. If you restrict a feature to one role in
`permissions.ts`, make the API enforce the same rule for the matching routes. Today the case is
assigning roles during onboarding (ADR 0010 and 0011). One shared function, `roleViolation`, decides it
for the role chosen on the form and for every role a template names. The UI disables the options and
templates it refuses, and the API refuses them before it creates anything: `owner` and the super-admin
role are never assigned, and `admin` and every `AUTH_ADMIN_ROLES` role need the super-admin role.

## API hardening

- **Security headers** on every response (`@fastify/helmet`: `nosniff`, frame denial and more).
- **Rate limiting** per client IP (`RATE_LIMIT_PER_MINUTE`, default 300). It runs before authentication,
  so attempts with invalid tokens are counted and throttled too. Health probes are exempt.
- **Request limits:** 100 kB body limit, 30 s request and connection timeouts.
- **Proxy trust is off by default** (`API_TRUST_PROXY`). Turn it on only behind a reverse proxy you
  control, otherwise clients could fake their IP address and dodge the rate limit.
- **Request IDs:** every response carries `x-request-id`, which is also in the logs, so a user's report
  can be matched to a log line.
- **Errors:** one shape, `{ error, message }`. Client mistakes (bad JSON, too many requests) are 4xx.
  Unexpected errors are a generic 500 with no internal detail.
- **Probes:** `/health` (the process is up) and `/ready` (the database answers, 503 otherwise, with no
  detail in the body).

## Supply chain

- Dependencies are pinned to exact versions and installs use a frozen lockfile in CI.
- `pnpm audit` runs in CI and on a weekly schedule. Patched versions of vulnerable transitive
  dependencies are forced through `overrides` in `pnpm-workspace.yaml`, each with a comment saying why.
- CodeQL scans the code for vulnerability patterns, and Dependabot proposes updates.
