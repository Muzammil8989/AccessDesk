# AccessDesk: the project as a prompt

This document describes everything that exists in the code today, written as a prompt. Give it to an
engineer or an AI assistant and they can rebuild the same project, or extend it without breaking its
rules. It is the follow-up to the original starting prompt: that one said what to build, this one
says what was built, how it is structured and what was learned on the way.

If the code and this document disagree, the code wins. Please fix this document.

---

## Role

You are a senior full-stack engineer. Build and maintain **AccessDesk**: an open source Electron desktop
app (a web build will follow) that lets an HR or IT admin **onboard and offboard employees** using an
OpenID Connect identity provider. The first supported provider has its own adapter package; the rest
of the code only knows a provider-neutral interface.

## Context

- The identity provider is **already set up and running**. Do not create or configure it and do not
  add it to `docker-compose.yml`. Read its settings from environment variables (API) or the first-run
  wizard (desktop app).
- The identity provider is the source of truth for identity: users, roles, groups, sessions and login
  events.
- AccessDesk's own PostgreSQL database holds only app data: onboarding templates, checklists,
  scheduled actions, offboarding snapshots and the app's own audit log. Employees are referenced only
  by their subject ID (`subjectId`, the OIDC `sub`). Names and emails are never copied.
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
- `packages/identity`: the provider-neutral `IdentityProvider` interface, its neutral types and the
  access policy.
- `packages/identity-keycloak`: the adapter for the first supported provider. **All** of its admin REST
  calls live here, behind the `IdentityProvider` interface.
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
   Content Security Policy, navigation and new windows blocked, webviews blocked, every permission
   request refused except clipboard write for the app's own page, a minimal typed preload API, IPC handlers that answer only the app's own top-level
   page.
4. **Tokens are stored with Electron `safeStorage`** (OS secure storage), never in plain files or
   `localStorage`. Without secure storage they stay in memory only. The renderer never sees a token.
5. **The API verifies the access token on every request** (signature via the provider's signing keys,
   found through OIDC discovery; issuer, audience, expiry, pinned algorithms RS256/PS256/ES256) and
   requires any one configured admin role (default `super-admin` or `hr-admin`). Only the health
   probes are public.
6. **The API calls the identity provider with the logged-in admin's own access token**, forwarded as
   is. No service account, so the provider's admin events show the real person.
7. **Validate all input with Zod on both sides.** Never log tokens or passwords. Authorization headers
   are redacted, error messages never include tokens, and the UI never shows raw validation output.
8. `.env` files are git-ignored. Only `.env.example` is committed.
9. **Provider-neutral naming:** the vendor name appears only where `scripts/naming-allowlist.json`
   allows; `pnpm check` runs `scripts/check-naming.mjs` (ADR 0009).

## Repository structure

```
accessdesk/
├── apps/
│   ├── api/
│   │   ├── prisma/                 schema.prisma, migrations/, seed.ts
│   │   ├── prisma.config.ts        datasource only when DATABASE_URL is set (generate needs none)
│   │   ├── src/
│   │   │   ├── config/             env parsing and validation (Zod)
│   │   │   ├── infra/              db.ts (Prisma + pg adapter), identity.ts (provider factory),
│   │   │   │                       jobs.ts (stub)
│   │   │   ├── modules/
│   │   │   │   ├── employees/      routes, service, mapper
│   │   │   │   ├── health/         /health and /ready
│   │   │   │   └── templates/      routes, repository interface, Prisma repository
│   │   │   ├── plugins/            auth.ts (JWT + role guard), jwks.ts (signing keys through
│   │   │   │                       OIDC discovery), error-handler.ts
│   │   │   ├── app.ts              builds the app from its dependencies
│   │   │   └── server.ts           composition root and process lifecycle
│   │   └── test/                   helpers/, integration/, unit/
│   └── desktop/
│       ├── src/
│       │   ├── main/               index, window, ipc, security, apiClient, auth/ (pkce, oidc,
│       │   │                       loopback, service), store/ (tokenStore, settingsStore,
│       │   │                       legacy-settings)
│       │   ├── preload/            index.ts: the typed bridge
│       │   ├── renderer/           index.html and src/ (components, pages, hooks, lib, router, styles)
│       │   └── shared/             ipc.ts: channel names and types
│       └── test/                   unit/main/, unit/renderer/, e2e/smoke.mjs
├── packages/
│   ├── shared/                     src/ (employee, template, settings, error, permissions), test/unit/
│   ├── identity/                   src/ (identity, access, index, testing/), test/unit/
│   └── identity-keycloak/          src/ (keycloak-api, identity-provider, index), test/ (unit,
│                                   integration, helpers)
├── docs/                           development, keycloak-setup.md, security, adr/, this file
├── scripts/                        lib.mjs, setup.mjs, dev-all.mjs, clean.mjs, check-naming.mjs,
│                                   naming-allowlist.json
├── .github/                        workflows (ci, codeql, audit-schedule), templates, dependabot
├── docker-compose.yml              PostgreSQL 16.15 only, named volume
└── .env.example, eslint.config.js, turbo.json, pnpm-workspace.yaml, tsconfig.base.json, ...
```

Every app and package keeps its tests in its own `test/` folder, separate from `src/`.

## What the code does

### Database (Prisma, PostgreSQL 16)

Seven tables, snake_case through `@@map`: `onboarding_templates`, `template_items`,
`employee_checklists`, `checklist_items`, `scheduled_actions`, `offboarding_snapshots`,
`app_audit_log`. Employees are referenced by `subject_id` (text, the OIDC `sub`), and the audit log by
`target_subject_id`. No name or email columns. The item kind enum `ItemKind` has the values
`GROUP_MEMBERSHIP`, `ROLE` and `MANUAL_TASK`. `app_audit_log` is append-only (triggers block updates,
deletes and truncation) and records an `outcome` and a `request_id`. `offboarding_snapshots` keep `client_roles`
and `was_enabled`. Four migrations: `init`, a subject-ID and audit-log migration, a role-kind
migration and a migration that blocks `TRUNCATE` on the audit log (older migrations are history and are never edited). The seed creates the templates
Developer, Sales and HR, each with a few items (it is safe to run again). Generator: `prisma-client`,
output `apps/api/src/generated/prisma` (git-ignored).

### API (`apps/api`)

- Routes: `GET /health` (liveness), `GET /ready` (readiness, 503 with no detail if the database does
  not answer), `GET /templates`, `GET /employees` (query: `search`, `first`, `max` up to 100, returns
  items plus `total`), `GET /employees/:id` (UUID only).
- **Layers and dependency injection.** Routes only handle HTTP. `EmployeesService` depends on the
  `IdentityProvider` interface. Templates use a `TemplateRepository` interface with a Prisma
  implementation. `buildApp(deps)` takes `{ config, templates, identityFor, checkDatabase, keyResolver? }`,
  where `identityFor` is an `IdentityProviderFactory`: `(adminAccessToken) => IdentityProvider`.
  `server.ts` is the only place that picks real implementations (through
  `createIdentityProviderFactory` in `infra/identity.ts`, which chooses the adapter by
  `IDENTITY_PROVIDER` and validates it at startup). Only those two files may import an adapter
  package. Tests pass fakes.
- **Auth plugin** runs in the `preParsing` hook. This is deliberate: `@fastify/rate-limit` works per
  route in `onRequest`, and Fastify runs global `onRequest` hooks first, so an `onRequest` auth check
  would reject bad tokens before the limiter counted them. It reads roles with `readRolesFromClaims`
  at the configured claim path. `plugins/jwks.ts` finds the signing keys through standard OIDC
  discovery (issuer plus `/.well-known/openid-configuration`, then `jwks_uri`), lazily on the first
  token.
- **Hardening:** helmet headers, rate limit per IP (default 300 per minute, registered before auth),
  100 kB body limit, 30 s timeouts, `x-request-id` on every response, `trustProxy` off by default,
  loopback bind by default, one error shape `{ error, message }` (4xx from Fastify and plugins stay 4xx,
  unexpected errors are a generic 500), identity provider 401/403/404 pass through and other
  failures become 502 with the error code `identity_error` (the thrown class is
  `IdentityProviderError`).
- **Process:** graceful shutdown with a 10 s hard timeout, logging of unhandled rejections and
  exceptions, then exit.
- Environment variables: `IDENTITY_PROVIDER` (default is the first supported provider's ID,
  validated), `IDENTITY_ISSUER_URL` (required, the OIDC issuer; for the first provider
  `http://host/realms/<realm>`), `IDENTITY_CLIENT_ID` (required), optional `IDENTITY_AUDIENCE`
  (defaults to the client ID), `AUTH_ADMIN_ROLES` (default `super-admin,hr-admin`),
  `AUTH_ROLES_CLAIM_PATH` (default `realm_access.roles`), `DATABASE_URL`, `API_PORT`, optional
  `API_HOST`, `API_TRUST_PROXY`, `RATE_LIMIT_PER_MINUTE`, `LOG_LEVEL`, and `POSTGRES_PASSWORD` for
  compose.

### Identity provider adapter (`packages/identity` and `packages/identity-keycloak`)

`packages/identity` (`@accessdesk/identity`) holds the provider-neutral `IdentityProvider` interface:
`listUsers`, `countUsers`, `getUser`, `createUser`, `disableUser`, `endAllSessions`, `getUserGroups`,
`addUserToGroup`, `removeUserFromGroup`, `getUserRoles`, `addUserRoles`, `removeUserRoles`. It also
holds the neutral types (`IdentityUser` with `subjectId`, `username`, `email`, `firstName`,
`lastName`, `enabled`, `emailVerified`, `createdAt`; `IdentityGroup`; `IdentityRole`), the
`IdentityProviderError` (carries an HTTP-style status), the access policy (`DEFAULT_ADMIN_ROLES`,
`DEFAULT_ROLES_CLAIM_PATH`, `loadAccessPolicy`, `readRolesFromClaims`) and the contract test helper
`runIdentityProviderContract`, exported from `@accessdesk/identity/testing`.

`packages/identity-keycloak` (`@accessdesk/identity-keycloak`) is the adapter for the first supported
provider. Only `src/keycloak-api.ts` knows its admin REST paths and raw response shapes.
`src/identity-provider.ts` maps those shapes to the neutral types and exports
`createKeycloakIdentityProvider({ issuerUrl, getToken, fetch? })`. It derives the admin API base URL
and the realm from the issuer URL and throws a clear error when it cannot. Role names are resolved to
representations internally. Responses are validated with Zod. Failures throw `IdentityProviderError`
with the status and never the token. The write functions exist and are tested, but no API route uses
them yet.

### Desktop app (`apps/desktop`)

- **Main process.**
  - `auth/pkce.ts`: verifier, S256 challenge, state.
  - `auth/oidc.ts`: standard OIDC discovery from the configured issuer URL (with an issuer check),
    authorization URL, code exchange, refresh, back channel logout, display-only claim reading.
  - `auth/loopback.ts`: one-shot listener on `127.0.0.1`, random port, serves only `GET /callback`,
    checks `state` and the `Host` header, ignores wrong-state requests without ending the login,
    closes after the first valid response, answers late requests on a reused connection with 410, takes
    the port from the socket (`server.address()` is null after close), never lets an error escape.
  - `auth/service.ts`: login, cancel, logout (also ends the identity provider session), status, access token
    with a 30 s refresh margin, single-flight refresh, session cleared on `invalid_grant` but kept on
    network errors.
  - `store/tokenStore.ts` (encrypted with an injected `SecretCipher`, atomic write, corrupt file
    discarded, memory only without secure storage) behind a `TokenStorage` interface.
  - `store/settingsStore.ts`: plain JSON with public values only (`issuerUrl`, `clientId`, `apiUrl`).
    `store/legacy-settings.ts` migrates older saved settings automatically.
  - `apiClient.ts`: GET through to the API with the bearer token, one retry after a 401 with a fresh
    token, `redirect: 'error'`, path allowlist regex, friendly errors that never contain the token.
  - `security.ts`: `app://accessdesk` origin helpers, CSP builder (production: `default-src 'none'`,
    scripts and styles from `self`, `connect-src 'none'`), path-traversal-safe file resolver.
  - `index.ts`, `window.ts`, `ipc.ts`: Electron wiring: single instance lock, sandbox, `app://` protocol
    handler that adds the CSP header, dev-server CSP, permission denial (only clipboard write is
    allowed, for the app's own page), trusted-sender checks on IPC.
- **Preload** exposes `window.accessdesk` with `settings`, `auth` and `api`: `api.get` plus the two
  onboarding write calls, `api.onboarding.create` and `api.onboarding.retry` (ADR 0010).
- **Renderer.** Hash routes: `/setup` (first-run wizard), `/login`, `/no-access`, and under the app
  layout `/employees`, `/onboard`, `/offboard`, `/access-review`, `/audit-log`, `/settings`. Only
  Employees, Onboard (part 1) and Settings do real work, the rest are placeholders. Employees has debounced search,
  pagination, loading, empty and error states, and retries only network and 5xx errors. The settings
  form (Issuer URL, Client ID, AccessDesk API URL; no realm field) is validated with Zod and has a
  "Test connection" button, and the settings page card is titled "Identity provider connection". The
  login button says "Sign in". API responses are validated against the shared schemas, and a bad shape becomes a plain
  message, never raw validation output.
- **Role-based visibility.** `packages/shared/src/permissions.ts` says which roles may use which
  feature (`hasAdminAccess(roles, adminRoles)`, `canAccess(roles, feature, adminRoles)`). The main
  process reads `AUTH_ADMIN_ROLES` and `AUTH_ROLES_CLAIM_PATH` from the same repo-root `.env` as the
  API, with the same validation code (`loadAccessPolicy`), so the UI and the API cannot disagree. The
  sidebar hides what a user cannot use, `RequireFeature` guards each screen, and a signed-in
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
  import apps; only `server.ts` and `infra/identity.ts` in the API may import an adapter package
  (`@accessdesk/identity-*`); the identity provider admin path (`/admin/realms`) may only appear in
  `packages/identity-*`. The naming check (`scripts/check-naming.mjs`) is part of `pnpm check`. Also: type-aware rules (no floating promises), accessibility rules for JSX, `eqeqeq`, no `console` in
  production code.
- **Tests never need a real identity provider or database.** API tests sign real JWTs with a local key
  set, and every adapter must pass the shared contract test (`runIdentityProviderContract`). The
  e2e test starts a mock identity provider (discovery, JWKS, PKCE-verifying token endpoint, a few admin
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
  built. No API route uses the identity provider's write functions yet.
- **Scheduled actions (pg-boss):** a job that runs later has no logged-in admin token to forward.
  Decide between stored offline tokens and running the action when an admin next opens the app, before
  building them (ADR 0003, `apps/api/src/infra/jobs.ts`).
- Not yet verified against a real identity provider: that it accepts the loopback redirect
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
