# AccessDesk: the project as a prompt

This document describes everything that exists in the code today, written as a prompt. Give it to an
engineer or an AI assistant and they can rebuild the same project, or extend it without breaking its
rules. It is the follow-up to the original starting prompt: that one said what to build, this one
says what was built, how it is structured and what was learned on the way.

If the code and this document disagree, the code wins. Please fix this document.

---

## Role

You are a senior full-stack engineer. Build and maintain **AccessDesk**: an open source Electron desktop
app (a web build will follow) that lets an HR or IT admin **onboard and offboard employees** using
Keycloak.

## Context

- Keycloak is **already set up and running**. Do not create or configure Keycloak and do not add it to
  `docker-compose.yml`. Read its settings from environment variables (API) or the first-run wizard
  (desktop app).
- Keycloak is the source of truth for identity: users, roles, groups, sessions and login events.
- AccessDesk's own PostgreSQL database holds only app data: onboarding templates, checklists,
  scheduled actions, offboarding snapshots and the app's own audit log. Employees are referenced only
  by their Keycloak user ID (`sub`). Names and emails are never copied.
- MVP scope: login, onboarding, offboarding, employee list, detail and edit.

## Tech stack (exact versions are pinned, no `^` or `~`)

- TypeScript 6.0.3 everywhere, strict mode, `noUncheckedIndexedAccess`. (Not 7: typescript-eslint
  8.71.1 supports TypeScript below 6.1.)
- Monorepo: pnpm 12.9.1 workspaces + Turborepo 2.11.7. Node 22.22.1 or newer (`.nvmrc` says 24).
- `apps/desktop`: Electron 44.5.1, electron-vite 5.0.0, Vite 7.3.7 (electron-vite 5 does not support
  Vite 8), React 19.3.0, `@vitejs/plugin-react` 5.2.0, Tailwind 4.3.3, shadcn/ui-style components
  (hand-written: Radix Slot and Label, class-variance-authority, clsx, tailwind-merge, lucide-react),
  React Hook Form 7.89.0 with `@hookform/resolvers`, Zod 4.6.5, TanStack Query 5.104.1, React Router
  8.4.0 (hash router).
- `apps/api`: Node.js, Fastify 5.12.5, `@fastify/helmet`, `@fastify/rate-limit`, Prisma **7.10.0**
  (stable; npm's `latest` tag is an 8.0 release candidate) with `@prisma/adapter-pg`, pg-boss 12.37.0
  (stub), jose 6.2.12, pino (through Fastify) with pino-pretty in development, tsup for the build.
- `packages/shared`: Zod schemas, TypeScript types and role permissions used by desktop and API.
- `packages/keycloak-client`: **all** Keycloak Admin REST calls, behind one small typed interface.
- Tests: Vitest 5.0.3 (with v8 coverage), Testing Library and jsdom for React, Playwright 1.63.0
  (`_electron`) for end to end.
- Tooling: ESLint 10 (flat config, type-aware, jsx-a11y, react-hooks), Prettier, Husky, lint-staged,
  GitHub Actions (CI, CodeQL, scheduled audit), Dependabot.
- License: MIT.

## Security rules (must hold at all times)

1. **No client secret or admin password anywhere in the desktop app.** It is a public OIDC client.
2. **Login is Authorization Code + PKCE (S256)** in the **system browser**, never an embedded window.
   The redirect is a loopback listener `http://127.0.0.1:<random port>/callback` run by the Electron
   main process.
3. **Electron hardening:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict
   Content Security Policy, navigation and new windows blocked, webviews blocked, all permission
   requests refused, a minimal typed preload API, IPC handlers that answer only the app's own top-level
   page.
4. **Tokens are stored with Electron `safeStorage`** (OS secure storage), never in plain files or
   `localStorage`. Without secure storage they stay in memory only. The renderer never sees a token.
5. **The API verifies the access token on every request** (signature via JWKS, issuer, audience,
   expiry, pinned algorithms RS256/PS256/ES256) and requires the realm role `super-admin` or
   `hr-admin`. Only the health probes are public.
6. **The API calls Keycloak with the logged-in admin's own access token**, forwarded as is. No service
   account, so Keycloak's admin events show the real person.
7. **Validate all input with Zod on both sides.** Never log tokens or passwords. Authorization headers
   are redacted, error messages never include tokens, and the UI never shows raw validation output.
8. `.env` files are git-ignored. Only `.env.example` is committed.

## Repository structure

```
accessdesk/
├── apps/
│   ├── api/
│   │   ├── prisma/                 schema.prisma, migrations/, seed.ts
│   │   ├── prisma.config.ts        datasource only when DATABASE_URL is set (generate needs none)
│   │   ├── src/
│   │   │   ├── config/             env parsing and validation (Zod)
│   │   │   ├── infra/              db.ts (Prisma + pg adapter), keycloak.ts (client factory), jobs.ts (stub)
│   │   │   ├── modules/
│   │   │   │   ├── employees/      routes, service, mapper
│   │   │   │   ├── health/         /health and /ready
│   │   │   │   └── templates/      routes, repository interface, Prisma repository
│   │   │   ├── plugins/            auth.ts (JWT + role guard), error-handler.ts
│   │   │   ├── app.ts              builds the app from its dependencies
│   │   │   └── server.ts           composition root and process lifecycle
│   │   └── test/                   helpers/, integration/, unit/
│   └── desktop/
│       ├── src/
│       │   ├── main/               index, window, ipc, security, apiClient, auth/ (pkce, oidc,
│       │   │                       loopback, service), store/ (tokenStore, settingsStore)
│       │   ├── preload/            index.ts: the typed bridge
│       │   ├── renderer/           index.html and src/ (components, pages, hooks, lib, router, styles)
│       │   └── shared/             ipc.ts: channel names and types
│       └── test/                   unit/main/, unit/renderer/, e2e/smoke.mjs
├── packages/
│   ├── shared/                     src/ (employee, template, settings, error, permissions), test/unit/
│   └── keycloak-client/            src/ (types, client), test/unit/
├── docs/                           development, keycloak-setup, security, adr/, this file
├── scripts/                        lib.mjs, setup.mjs, dev-all.mjs, clean.mjs
├── .github/                        workflows (ci, codeql, audit-schedule), templates, dependabot
├── docker-compose.yml              PostgreSQL 16.15 only, named volume
└── .env.example, eslint.config.js, turbo.json, pnpm-workspace.yaml, tsconfig.base.json, ...
```

Every app and package keeps its tests in its own `test/` folder, separate from `src/`.

## What the code does

### Database (Prisma, PostgreSQL 16)

Seven tables, snake_case through `@@map`: `onboarding_templates`, `template_items`,
`employee_checklists`, `checklist_items`, `scheduled_actions`, `offboarding_snapshots`,
`app_audit_log`. Employees are referenced by `keycloak_user_id` (text). No name or email columns. One
migration (`init`). The seed creates the templates Developer, Sales and HR, each with a few items (it is
safe to run again). Generator: `prisma-client`, output `apps/api/src/generated/prisma` (git-ignored).

### API (`apps/api`)

- Routes: `GET /health` (liveness), `GET /ready` (readiness, 503 with no detail if the database does
  not answer), `GET /templates`, `GET /employees` (query: `search`, `first`, `max` up to 100, returns
  items plus `total`), `GET /employees/:id` (UUID only).
- **Layers and dependency injection.** Routes only handle HTTP. `EmployeesService` depends on the
  `KeycloakClient` interface. Templates use a `TemplateRepository` interface with a Prisma
  implementation. `buildApp(deps)` takes `{ config, templates, keycloakFor, checkDatabase, keyResolver? }`.
  `server.ts` is the only place that picks real implementations. Tests pass fakes.
- **Auth plugin** runs in the `preParsing` hook. This is deliberate: `@fastify/rate-limit` works per
  route in `onRequest`, and Fastify runs global `onRequest` hooks first, so an `onRequest` auth check
  would reject bad tokens before the limiter counted them.
- **Hardening:** helmet headers, rate limit per IP (default 300 per minute, registered before auth),
  100 kB body limit, 30 s timeouts, `x-request-id` on every response, `trustProxy` off by default,
  loopback bind by default, one error shape `{ error, message }` (4xx from Fastify and plugins stay 4xx,
  unexpected errors are a generic 500), Keycloak 401/403/404 pass through and other Keycloak failures
  become 502.
- **Process:** graceful shutdown with a 10 s hard timeout, logging of unhandled rejections and
  exceptions, then exit.
- Environment variables: `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, optional
  `KEYCLOAK_AUDIENCE` (defaults to the client ID), `DATABASE_URL`, `API_PORT`, optional `API_HOST`,
  `API_TRUST_PROXY`, `RATE_LIMIT_PER_MINUTE`, `LOG_LEVEL`, and `POSTGRES_PASSWORD` for compose.

### Keycloak client (`packages/keycloak-client`)

`createKeycloakClient({ baseUrl, realm, getToken, fetch? })` returns: `listUsers`, `countUsers`,
`getUser`, `createUser`, `disableUser`, `logoutAllSessions`, `getUserGroups`, `addUserToGroup`,
`removeUserFromGroup`, `getUserRealmRoles`, `addUserRealmRoles`, `removeUserRealmRoles` (role names
are resolved to representations internally). Responses are validated with Zod. Failures throw
`KeycloakError` with the status and never the token. The write functions exist and are tested, but no
API route uses them yet.

### Desktop app (`apps/desktop`)

- **Main process.**
  - `auth/pkce.ts`: verifier, S256 challenge, state.
  - `auth/oidc.ts`: discovery with an issuer check, authorization URL, code exchange, refresh, back
    channel logout, display-only claim reading.
  - `auth/loopback.ts`: one-shot listener on `127.0.0.1`, random port, serves only `GET /callback`,
    checks `state` and the `Host` header, ignores wrong-state requests without ending the login,
    closes after the first valid response, answers late requests on a reused connection with 410, takes
    the port from the socket (`server.address()` is null after close), never lets an error escape.
  - `auth/service.ts`: login, cancel, logout (also ends the Keycloak session), status, access token
    with a 30 s refresh margin, single-flight refresh, session cleared on `invalid_grant` but kept on
    network errors.
  - `store/tokenStore.ts` (encrypted with an injected `SecretCipher`, atomic write, corrupt file
    discarded, memory only without secure storage) behind a `TokenStorage` interface.
  - `store/settingsStore.ts`: plain JSON with public values only.
  - `apiClient.ts`: GET through to the API with the bearer token, one retry after a 401 with a fresh
    token, `redirect: 'error'`, path allowlist regex, friendly errors that never contain the token.
  - `security.ts`: `app://accessdesk` origin helpers, CSP builder (production: `default-src 'none'`,
    scripts and styles from `self`, `connect-src 'none'`), path-traversal-safe file resolver.
  - `index.ts`, `window.ts`, `ipc.ts`: Electron wiring: single instance lock, sandbox, `app://` protocol
    handler that adds the CSP header, dev-server CSP, permission denial, trusted-sender checks on IPC.
- **Preload** exposes `window.accessdesk` with `settings`, `auth` and `api.get` only.
- **Renderer.** Hash routes: `/setup` (first-run wizard), `/login`, `/no-access`, and under the app
  layout `/employees`, `/onboard`, `/offboard`, `/access-review`, `/audit-log`, `/settings`. Only
  Employees and Settings do real work, the rest are placeholders. Employees has debounced search,
  pagination, loading, empty and error states, and retries only network and 5xx errors. The settings
  form (Keycloak URL, realm, client ID, API URL) is validated with Zod and has a "Test connection"
  button. API responses are validated against the shared schemas, and a bad shape becomes a plain
  message, never raw validation output.
- **Role-based visibility.** `packages/shared/src/permissions.ts` says which roles may use which
  feature. The sidebar hides what a user cannot use, `RequireFeature` guards each screen, and a signed-in
  user with no AccessDesk role sees only the no-access page (their roles, a troubleshooting list, sign
  out). This is a convenience: the API is the real gatekeeper, and any restriction added to
  `permissions.ts` must also be enforced by the API.

### Repo automation

`pnpm setup` (env file, PostgreSQL, migrations, seed), `pnpm dev:all` (database, migrations, then API and
app), `pnpm dev`, `pnpm check` (lint, format check, typecheck, tests, build), `pnpm test:coverage`,
`pnpm test:e2e`, `pnpm clean`, `pnpm db:up`, `pnpm db:down`, `pnpm db:migrate`. Git hooks: pre-commit runs
lint-staged, pre-push runs typecheck and tests.

## Quality rules

- **Lint enforces architecture:** the renderer cannot import main-process code, `electron` or Node;
  main and preload cannot import renderer code; the API cannot import the desktop app; packages cannot
  import apps; Keycloak Admin paths (`/admin/realms`) may only appear in `packages/keycloak-client`.
  Also: type-aware rules (no floating promises), accessibility rules for JSX, `eqeqeq`, no `console` in
  production code.
- **Tests never need a real Keycloak or database.** API tests sign real JWTs with a local key set. The
  e2e test starts a mock Keycloak (discovery, JWKS, PKCE-verifying token endpoint, a few admin
  endpoints), the **real built API** and the **real built Electron app**, and drives it with Playwright
  (35 checks, including the no-access scenario, session restore after restart and CSP enforcement).
- **Coverage thresholds** are a floor in each `vitest.config.ts` (95% lines, statements and functions
  for the API and packages, 90/88/85 for the desktop app, 75% branches). Electron glue is excluded from
  unit coverage and exercised by the e2e test.
- When a bug is found, add a test that fails without the fix. Several tests in the repo exist for that
  reason (see the gotchas below).
- Comments explain **why**, never what. Decisions are recorded in `docs/adr`.

## Gotchas learned the hard way

- **pnpm 12** blocks dependency install scripts. Allow them with an `allowBuilds` map in
  `pnpm-workspace.yaml` (`electron`, `esbuild`, `prisma`, `@prisma/client`, `@prisma/engines`). It also
  adds `minimumReleaseAgeExclude` entries for very new releases. Patched transitive dependencies
  (`mysql2`, `deepmerge-ts`, `esbuild`) are forced with `overrides` after `pnpm audit` flagged them.
- **`ELECTRON_RUN_AS_NODE=1`** leaks into terminals started from Electron-based editors and makes
  Electron run as plain Node, which crashes with "Cannot read properties of undefined (reading
  'enableSandbox')". `electron.vite.config.ts` deletes it before launching.
- **Prisma 7:** needs `prisma.config.ts`, a driver adapter and the `prisma-client` generator.
  `prisma generate` must work without `DATABASE_URL`, so the datasource is only set when the variable
  exists. electron-vite 5 only externalizes `dependencies`, so the desktop package lists everything as
  `devDependencies` to bundle it all.
- **`tsx watch` hangs when run under Turborepo** (stdin is an open pipe). The API dev script is
  `node --watch --import tsx src/server.ts`.
- **Auth hook order** (see the API section) decides whether invalid tokens are rate limited. A test
  covers it.
- **Loopback listener:** a browser may reuse its connection after sign-in finished. The handler must not
  call `server.address()` then. A regression test sends two requests on one raw connection.
- **Windows:** repo scripts run commands through one command string with a shell, because an args array
  plus `shell` is deprecated and `pnpm.cmd` needs a shell. npm's global bin folder must be on `PATH` for
  `pnpm` to be found.
- **Playwright and navigation:** a navigation that the app blocks leaves Playwright waiting, so that
  check runs last in the e2e script.

## Known gaps and open questions

- Onboard, Offboard, Access Review and Audit Log screens, and employee detail and edit screens, are not
  built. No API route uses the Keycloak client's write functions yet.
- **Scheduled actions (pg-boss):** a job that runs later has no logged-in admin token to forward.
  Decide between stored offline tokens and running the action when an admin next opens the app, before
  building them (ADR 0003, `apps/api/src/infra/jobs.ts`).
- Not yet verified against a real Keycloak: that it accepts the loopback redirect
  `http://127.0.0.1/callback` for any port. See `docs/keycloak-setup.md`.
- Packaging and installers, the web build, an API Dockerfile and Playwright specs (one end-to-end
  script exists) are not done. The e2e test is not in CI because it needs a display.

## Working style

- Pin dependency versions. Check current docs and the installed package's types instead of guessing
  APIs, because versions here are newer than most training data.
- Keep code simple. Add comments only where the reason is not obvious.
- After each major step run lint, typecheck and tests, and fix errors before moving on. Prove that a
  new guardrail works (make it fail once) before trusting it.
- Report faithfully: what works, what is stubbed, what was not verified.
- Explain decisions in simple, professional English.

## Acceptance checklist

- `pnpm check` and `pnpm test:coverage` pass.
- `pnpm test:e2e` passes (35 checks).
- `pnpm audit` reports no known vulnerabilities.
- `pnpm setup` then `pnpm dev:all` starts the database, the API and the app. The first launch shows the
  setup wizard.
- An account with `hr-admin` or `super-admin` sees the full app. An account without either sees only
  the no-access page.
