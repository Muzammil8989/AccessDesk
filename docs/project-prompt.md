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
  8.4.0 (hash router). Inter Variable is bundled locally (`@fontsource-variable/inter`): the CSP is
  `font-src 'self'` and the app must work offline. Design tokens and rules are in
  `design-system/accessdesk/MASTER.md`.
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
9. **`hr-admin` never gets `realm-admin` or `manage-realm`** in the identity provider, directly or
   through a composite role. It gets only the narrower admin roles that onboarding needs, so an HR
   admin cannot change the realm's own settings.
10. **Provider-neutral naming:** the vendor name appears only where `scripts/naming-allowlist.json`
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
│   │   │   ├── errors.ts           AppError (status, code, message)
│   │   │   ├── modules/
│   │   │   │   ├── audit/          audit repository interface and Prisma implementation
│   │   │   │   ├── checklists/     routes, service, repository interface, Prisma repository, live names
│   │   │   │   ├── employees/      routes, service, mapper
│   │   │   │   ├── health/         /health and /ready
│   │   │   │   ├── onboarding/     routes, service, steps, template steps, runner, audit observer,
│   │   │   │   │                   errors, temporary-password
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
│       └── test/                   unit/main/, unit/renderer/, e2e/ (run.mjs, smoke.mjs)
├── packages/
│   ├── shared/                     src/ (employee, template, settings, error, onboarding,
│   │                               role-policy, checklist, permissions), test/unit/
│   ├── identity/                   src/ (identity, access, index, testing/), test/unit/
│   └── identity-keycloak/          src/ (keycloak-api, identity-provider, index), test/ (unit,
│                                   integration, helpers)
├── design-system/accessdesk/       MASTER.md: UI tokens, typography, motion, interaction rules
├── docs/                           development, coding-standards, keycloak-setup.md, security, adr/, this file
├── scripts/                        lib.mjs, setup.mjs, dev-all.mjs, clean.mjs, check-naming.mjs,
│                                   naming-allowlist.json
├── .github/                        workflows (ci, security, security-enforce, codeql, scorecard,
│                                   audit-schedule, labeler, stale), templates, dependabot, CODEOWNERS
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
`GROUP_MEMBERSHIP`, `ROLE` and `MANUAL_TASK`.

- **Templates.** `onboarding_templates` has `department_ref` (a top-level group path such as
  `/Engineering`) and `default_role` (`member`, `manager` or `admin`), which pre-fill the form. A
  template's items name an extra group path (`GROUP_MEMBERSHIP`), a realm role name (`ROLE`) or a manual
  task (`MANUAL_TASK`) in `target_ref`. The seed creates Developer, Sales and HR in this shape and is safe
  to run again.
- **Checklists.** `employee_checklists` is unique on `(subject_id, type)`. It has a `status` (`OPEN`,
  `COMPLETED`, `CANCELLED`), `manager_subject_id` (text) and `start_date` (a `DATE`, information only).
  `checklist_items` are the template's manual tasks, copied in.
- **Audit log.** `app_audit_log` is append-only (triggers block updates, deletes and truncation) and
  records an `outcome` and a `request_id`. `offboarding_snapshots` keep `client_roles` and `was_enabled`.
- **Migrations** (older ones are history and are never edited): `init`; a subject-ID and audit-log
  migration; a role-kind migration; a migration that blocks `TRUNCATE` on the audit log; one that adds
  the template department and default role and the unique checklist constraint; a narrow data
  migration that moves a template's department out of its items (only when `department_ref` is empty
  and the template has exactly one group item; others are left alone and listed in a notice); and one
  that adds the checklist manager and start date. After pulling, apply new migrations to an existing
  database with `pnpm --filter @accessdesk/api db:deploy`.
- Generator: `prisma-client`, output `apps/api/src/generated/prisma` (git-ignored).

### API (`apps/api`)

- Routes: `GET /health` (liveness), `GET /ready` (readiness, 503 with no detail if the database does
  not answer), `GET /templates` (each template with its department, default role and items),
  `GET /employees` (query: `search`, `first`, `max` up to 100, returns items plus `total`),
  `GET /employees/:id` (UUID only), the onboarding routes (ADR 0010 and 0011): `GET /onboarding/options`
  (departments from the provider's groups with their path, and the roles with an `allowed` flag),
  `POST /onboarding` (`201`, or `207` with `status: 'partial'` when a step after `create_user` failed) and
  `POST /onboarding/:subjectId/retry` (`200` or `207`), and the checklist routes: `GET /checklists`
  (`status=open|done`, `first`, `max` at most 20), `GET /checklists/:subjectId`,
  `PATCH /checklists/:subjectId/items/:itemId` (body `{ done }`) and `PATCH /checklists/:subjectId` (body
  `{ closed }`). Only the three onboarding routes (`GET /onboarding/options`, `POST /onboarding`,
  `POST /onboarding/:subjectId/retry`) are limited to 20 requests a minute per IP, per route. The
  checklist routes have no limit of their own and fall under the global limit (default 300 a minute).
  Both groups answer with `Cache-Control: no-store`. Error codes: `username_exists` and `email_exists`
  (`409`), `unknown_manager` and `manager_disabled` (`400`), `checklist_has_tasks` (`409`).
- **Onboarding.** `OnboardingService` builds a list of step objects and runs them through `runSteps`; an
  observer writes one audit row per step. The steps are `create_user`, `add_to_group`, `assign_role`, then
  `template_add_to_group` and `template_assign_role` (one per template item, with a `label`) and
  `create_checklist`. There is no automatic rollback. A retry needs a `SUCCESS` audit row for
  `onboarding.create_user` for that subject, by the same actor, in the last 24 hours, and skips what is
  already in place. The temporary password is generated on the server (`crypto.randomInt`, 16
  characters), sent to the provider as a temporary credential and returned once. It is never stored,
  logged or audited.
- **Role rule (ADR 0011).** One shared function, `roleViolation` in `packages/shared/src/role-policy.ts`,
  decides which roles onboarding may assign. It covers the role chosen on the form (on create and on
  retry) and every role a template names, and it runs before anything is created (`403`). `owner` and the
  super-admin role (`AUTH_SUPER_ADMIN_ROLE`) are never assigned. `admin` and every `AUTH_ADMIN_ROLES` role
  need a super-admin. Names are compared without regard to case. The seeded HR template assigns
  `hr-admin`, so it needs a super-admin.
- **Templates.** A template only pre-fills the department and role (editable) and adds items. A group
  equal to the department, and duplicates, are skipped. A group or role that does not exist in the
  identity provider fails only its own step with a clear message (`207`), and Retry finishes it once the
  name exists. Only top-level groups and realm roles can be matched. `MANUAL_TASK` items are never run.
- **Checklists.** The `create_checklist` step creates one onboarding checklist when the template has
  manual tasks, or a manager is given, or a start date is given. A checklist is never created as done. It
  is `open` until it is closed: with tasks it closes itself when the last task is ticked and reopens if one
  is unticked; with no tasks it stays in the Open list until `PATCH /checklists/:subjectId` closes it
  (`409 checklist_has_tasks` for one that has tasks). A tick or a close and its audit row
  (`checklist.item_done`, `checklist.item_undone`, `checklist.close`, `checklist.reopen`) are written in one
  database transaction, after locking the checklist row. Names, the manager's included, are looked up
  live (five at a time) and show as unknown when a lookup fails. They are never saved.
- **Manager and start date.** The manager is optional. The API checks them in the identity provider
  before creating anything (`unknown_manager`, `manager_disabled`) and saves only their `subjectId`. Retry
  checks the manager again only while the checklist does not exist. The start date is optional and
  **information only**: the account is created and enabled at once, and nothing is scheduled (see the
  open question on scheduled actions below).
- **Layers and dependency injection.** Routes only handle HTTP. `EmployeesService` depends on the
  `IdentityProvider` interface. Templates use a `TemplateRepository` interface with a Prisma
  implementation. `buildApp(deps)` takes `{ config, templates, audit, identityFor, checkDatabase,
keyResolver?, fetch?, clock?, generatePassword?, logStream? }`, where `identityFor` is an `IdentityProviderFactory`: `(adminAccessToken) => IdentityProvider`.
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
  `AUTH_SUPER_ADMIN_ROLE` (default `super-admin`), `AUTH_ROLES_CLAIM_PATH` (default `realm_access.roles`), `DATABASE_URL`, `API_PORT`, optional
  `API_HOST`, `API_TRUST_PROXY`, `RATE_LIMIT_PER_MINUTE`, `LOG_LEVEL`, and `POSTGRES_PASSWORD` for
  compose.

### Identity provider adapter (`packages/identity` and `packages/identity-keycloak`)

`packages/identity` (`@accessdesk/identity`) holds the provider-neutral `IdentityProvider` interface:
`listUsers`, `countUsers`, `findUsers` (exact username or email), `getUser`, `createUser` (with
optional `emailVerified` and a temporary `initialPassword`), `disableUser`, `endAllSessions`,
`listGroups`, `getUserGroups`, `addUserToGroup`, `removeUserFromGroup`, `listRoles`, `getUserRoles`,
`addUserRoles`, `removeUserRoles`. It also
holds the neutral types (`IdentityUser` with `subjectId`, `username`, `email`, `firstName`,
`lastName`, `enabled`, `emailVerified`, `createdAt`; `IdentityGroup`; `IdentityRole`), the
`IdentityProviderError` (carries an HTTP-style status), the access policy (`DEFAULT_ADMIN_ROLES`,
`DEFAULT_SUPER_ADMIN_ROLE`, `DEFAULT_ROLES_CLAIM_PATH`, `loadAccessPolicy`, `readRolesFromClaims`)
and, exported from `@accessdesk/identity/testing`, the contract test helper
`runIdentityProviderContract` and `createInMemoryIdentityProvider` (a full in-memory provider with
failure injection that passes the same contract).

`packages/identity-keycloak` (`@accessdesk/identity-keycloak`) is the adapter for the first supported
provider. Only `src/keycloak-api.ts` knows its admin REST paths and raw response shapes.
`src/identity-provider.ts` maps those shapes to the neutral types and exports
`createKeycloakIdentityProvider({ issuerUrl, getToken, fetch? })`. It derives the admin API base URL
and the realm from the issuer URL and throws a clear error when it cannot. Role names are resolved to
representations internally. Responses are validated with Zod. Failures throw `IdentityProviderError`
with the status and never the token. The onboarding and checklist routes use `createUser`, `findUsers`,
`getUser`, `listGroups`, `addUserToGroup`, `getUserGroups`, `listRoles`, `getUserRoles` and `addUserRoles`. The other write
functions exist and are tested, but no API route uses them yet.

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
  - `apiClient.ts`: `get` (15 s timeout) and four fixed writes, `createOnboarding`, `retryOnboarding`,
    `setChecklistItem` and `setChecklistClosed` (30 s timeout; the paths are built here from validated
    UUIDs and the input is validated with the shared schemas). `get` only accepts six fixed paths
    (`/employees`, `/employees/<uuid>`, `/templates`, `/onboarding/options`, `/checklists`,
    `/checklists/<uuid>`). The bearer token is added here. One retry after a 401 with a fresh token, never
    after a network error or timeout (a write may already have been applied). `redirect: 'error'`, friendly
    errors that never contain the token. API errors carry their `code`, and `207` counts as a success
    with a body.
  - `security.ts`: `app://accessdesk` origin helpers, CSP builder (production: `default-src 'none'`,
    scripts and styles from `self`, `connect-src 'none'`), path-traversal-safe file resolver.
  - `index.ts`, `window.ts`, `ipc.ts`: Electron wiring: single instance lock, sandbox, `app://` protocol
    handler that adds the CSP header, dev-server CSP, permission denial (only clipboard write is
    allowed, for the app's own page), trusted-sender checks on IPC.
- **Preload** exposes `window.accessdesk` with `settings`, `auth` and `api`: `api.get`, the two onboarding
  writes (`api.onboarding.create`, `api.onboarding.retry`) and the two checklist writes
  (`api.checklists.setItem`, `api.checklists.setClosed`). `ipc-contract.test.ts` checks every channel has a
  handler and a preload function.
- **Renderer.** Hash routes: `/setup` (first-run wizard), `/login`, `/no-access`, and under the app
  layout `/employees`, `/onboard`, `/onboard/checklists`, `/onboard/checklists/:subjectId`, `/offboard`,
  `/access-review`, `/audit-log`, `/settings`. The checklist screens use the existing `onboard` feature.
  Employees, Onboard (with its checklist screens) and Settings do real work, the rest are placeholders.
  Employees has debounced search, pagination, loading, empty and error states, and retries only network
  and 5xx errors; its query (`lib/employees-api.ts`) is reused by the manager picker. The settings form
  (Issuer URL, Client ID, AccessDesk API URL; no realm field) is validated with Zod and has a "Test
  connection" button, and the settings page card is titled "Identity provider connection". The login
  button says "Sign in". API responses are validated against the shared schemas, and a bad shape becomes
  a plain message, never raw validation output.
- **Look and feel** (see `design-system/accessdesk/MASTER.md`). A Light, Dark or System theme
  (`lib/theme.ts`, saved in `localStorage`, the `.dark` class on `<html>`), a sidebar that collapses
  (automatically on narrow windows, or by hand with its header button or `Ctrl+B`, remembered in
  `localStorage`; collapsed icons get Radix tooltips, never `title`), toast messages (`lib/toast.ts`, errors stay until
  dismissed), loading skeletons, inline alerts, and forms that show an error summary linking to each
  invalid field. Colours come only from semantic tokens in `styles.css`.
- **Onboard screen.** A form (first name, last name, email, username, an optional template, department,
  role, an optional manager and an optional start date) that loads its options from
  `GET /onboarding/options` and the templates from `GET /templates`. Choosing a template fills in the
  department and role, says so in a status message and lists in plain words what the template will also
  do. A template with a role the person may not assign is disabled with the reason (the API enforces it).
  The role options use the same shared rule (`roleViolation`). The manager is chosen with a search, a
  native radio group (arrow keys do not pick anyone) and a confirm button; a disabled account is listed
  but cannot be chosen. The start date field always says: "Information only. The account is created and
  enabled now. It does not unlock on this date." A complete result shows the one-time temporary
  password with a Copy button and a reminder that it is shown once, then the checklist (native
  checkboxes, polite announcements; a checklist with no tasks offers "Mark as done"). A partial result
  lists each step and offers Retry. The password lives only in component state and is cleared when the
  admin leaves the page. If the response to a create is lost, the screen tells the admin to check the
  Employees list.
- **Checklist screens.** `/onboard/checklists` has an Open/Done radio filter, a table of 20 per page with
  the employee, manager, start date and progress, and links to the detail screen.
  `/onboard/checklists/:subjectId` shows the person, the manager, the start date and the tasks. A name that
  cannot be looked up shows as unknown. The page heading takes focus on arrival, controls are native and
  at least 40px, and after a failed save the list is loaded again, because a request that timed out may
  still have been applied.
- **Role-based visibility.** `packages/shared/src/permissions.ts` says which roles may use which
  feature (`hasAdminAccess(roles, adminRoles)`,
  `canAccess(roles, feature, adminRoles, superAdminRole?)`; a `super-admin` feature such as
  `onboard-assign-admin` is denied without `superAdminRole`). The main process reads
  `AUTH_ADMIN_ROLES`, `AUTH_SUPER_ADMIN_ROLE` and `AUTH_ROLES_CLAIM_PATH` from the same repo-root `.env`
  as the API, with the same validation code (`loadAccessPolicy`), so the UI and the API cannot disagree. The
  sidebar hides what a user cannot use, `RequireFeature` guards each screen, and a signed-in
  user with no AccessDesk role sees only the no-access page (their roles, a troubleshooting list, sign
  out). This is a convenience: the API is the real gatekeeper, and any restriction added to
  `permissions.ts` must also be enforced by the API.

### Repo automation

`pnpm setup` (env file, PostgreSQL, migrations, seed), `pnpm dev:all` (database, migrations, then API and
app), `pnpm dev`, `pnpm check` (lint, naming check, format check, typecheck, tests, build; coverage floors run in
`pnpm test:coverage` and in CI), `pnpm test:coverage`,
`pnpm test:e2e`, `pnpm clean`, `pnpm db:up`, `pnpm db:down`, `pnpm db:migrate` (creates a migration), and `pnpm --filter @accessdesk/api db:deploy`
(applies existing migrations to a database). Git hooks: pre-commit runs
lint-staged, pre-push runs typecheck and tests.

## Quality rules

- **Lint enforces architecture:** the renderer cannot import main-process code, `electron` or Node;
  main and preload cannot import renderer code; the API cannot import the desktop app; packages cannot
  import apps; only `server.ts` and `infra/identity.ts` in the API may import an adapter package
  (`@accessdesk/identity-*`); the identity provider admin path (`/admin/realms`) may only appear in
  `packages/identity-*`. The naming check (`scripts/check-naming.mjs`) is part of `pnpm check`. Also: type-aware rules (no floating promises), accessibility rules for JSX, `eqeqeq`, no `console` in
  production code.
- **Tests never need a real identity provider. They need a database only in three places** (each is skipped
  without `TEST_DATABASE_URL`, and CI sets it): the migration tests, the real-database checklist repository
  tests (the tick and close transactions, the row lock) and the end-to-end test. API tests sign real JWTs with a local key
  set, and every adapter must pass the shared contract test (`runIdentityProviderContract`). The
  e2e test starts a mock identity provider (discovery, JWKS, PKCE-verifying token endpoint, a few admin
  endpoints including the role list and one user), the **real built API** and the **real built Electron
  app**, and drives it with Playwright (including the no-access scenario, session restore after restart,
  CSP enforcement, the onboarding scenario, and with a database the retry, template and checklist, and
  manager and start date scenarios). `pnpm test:e2e` rebuilds the API and the app each time. Without
  `TEST_DATABASE_URL` the database scenarios are skipped; with it, `e2e/run.mjs` creates a throwaway
  `accessdesk_e2e_<hex>` database, migrates it, seeds the templates, runs the test and drops it. It never
  touches the development database.
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

- **Pending migrations look like a 500.** A screen that suddenly shows "Internal server error" after you
  pull can simply mean the development database has not had the new migrations. Run
  `pnpm --filter @accessdesk/api db:deploy` (`pnpm dev:all` does it for you).
- **Concurrent ticks.** Two tasks ticked at the same moment used to leave a finished checklist marked
  open. The tick and the close lock the checklist row first, and a real-database test fails without it.
- **`$$` in generated SQL.** `String.replace` turns `$$` into `$` in its replacement text, so a script that
  writes a PL/pgSQL body can corrupt it. Write such files directly.
- **Playwright and live regions.** `locator.check()` expects the box to flip at once, but the app only
  changes it after the server accepts, so click and wait. `getByText` matches substrings, so a visible
  "1 of 2 tasks done" also matches its screen-reader announcement; use `exact: true`.

## Known gaps and open questions

- Onboarding part 2 is built (templates, checklists, manager, start date). Not built: bulk import (CSV),
  email, and a template editor (templates are applied, but created and edited only in the database or the
  seed). Offboard, Access Review and Audit Log screens, and employee detail and edit screens, are not
  built. Only the onboarding and checklist routes use the identity provider's write functions.
- Onboarding part 1 (create, department, role, retry, one-time password) and the role rule were checked
  on a real instance of the first supported identity provider on 9 October 2026. Templates,
  checklists, the manager and the start date have not been checked on a real one yet; so far they are
  tested against fakes only (an in-memory provider, a fake admin API and a mock identity provider in the
  e2e test). See ADR 0010 and 0011. The checks to run are listed in `docs/keycloak-setup.md`.
- **Scheduled actions (pg-boss):** a job that runs later has no logged-in admin token to forward.
  Decide between stored offline tokens and running the action when an admin next opens the app, before
  building them (ADR 0003, `apps/api/src/infra/jobs.ts`). This is why the start date is only
  information.
- The loopback redirect `http://127.0.0.1/callback` with any port is verified on the identity
  provider version in use. Other versions are untested. See `docs/keycloak-setup.md`.
- Packaging and installers, the web build, an API Dockerfile and Playwright specs (one end-to-end
  script exists) are not done. The e2e test is not in CI because it needs a display.

## Current status

- Built: login, the employee list, onboarding part 1 and part 2 (templates, checklists, manager, start
  date) and the checklist screens.
- Checked on a real identity provider (9 October 2026): onboarding part 1, the role rule and the loopback
  redirect. Everything else is tested against fakes only.
- Placeholders: Offboard, Access Review, Audit Log, and employee detail and edit.

## Next work

In this order:

1. **Phase 0 checks:** run the remaining real-provider checks in `docs/keycloak-setup.md` for templates,
   checklists, the manager and the start date, and fix what they find.
2. **Offboarding** (ADR 0012, to be written before building).
3. **Audit log** screen.
4. **Employee detail and edit.**
5. **Template editor**, so templates no longer have to be changed in the database or the seed.

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
- `pnpm test:e2e` passes (with `TEST_DATABASE_URL` set, so the onboarding retry scenario runs too).
- `pnpm audit` reports no known vulnerabilities.
- `pnpm setup` then `pnpm dev:all` starts the database, the API and the app. The first launch shows the
  setup wizard.
- An account with `hr-admin` or `super-admin` sees the full app. An account without either sees only
  the no-access page.
