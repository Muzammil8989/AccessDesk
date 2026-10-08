# Development guide

## Prerequisites

- Node.js 22.22.1 or newer (`.nvmrc` says 24)
- pnpm 12 (`npm install -g pnpm@12.9.1`); the `packageManager` field pins it
- Docker, for the local PostgreSQL
- A running OpenID Connect identity provider ([setup guide for the first supported one](keycloak-setup.md))

## Commands

| Command              | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `pnpm setup`         | One-time: create `.env`, start PostgreSQL, migrate, seed                     |
| `pnpm dev:all`       | Start the database, apply migrations, then run the API and the app           |
| `pnpm dev`           | Run the API and the desktop app (database must already be running)           |
| `pnpm check`         | Everything CI runs: lint, naming check, format check, typecheck, test, build |
| `pnpm test`          | Unit and integration tests in every package                                  |
| `pnpm test:coverage` | The same, with a coverage report and minimum thresholds                      |
| `pnpm test:e2e`      | Build, then run the end-to-end test (opens the app window)                   |
| `pnpm lint`          | ESLint, including type-aware, accessibility and boundary rules               |
| `pnpm check:naming`  | Fails if the provider name appears outside the allowlist (ADR 0009)          |
| `pnpm typecheck`     | TypeScript strict mode in every package                                      |
| `pnpm build`         | Build everything                                                             |
| `pnpm audit`         | Check dependencies for known vulnerabilities                                 |
| `pnpm format`        | Prettier                                                                     |
| `pnpm db:up/down`    | Start or stop PostgreSQL                                                     |
| `pnpm db:migrate`    | Create and apply a new migration after editing `schema.prisma`               |
| `pnpm clean`         | Remove build output (`pnpm clean --deps` also removes `node_modules`)        |

Git hooks (Husky): `pre-commit` lints and formats staged files, `pre-push` runs typecheck and tests.

## Configuration

`apps/api/src/config` reads and validates the environment once, and the API refuses to start with a
clear message (variable names only, never values) if something is wrong. The variables are listed in
[.env.example](../.env.example) and in the README. The identity ones:

| Variable                | Default                | Meaning                                                                 |
| ----------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `IDENTITY_PROVIDER`     | `keycloak`             | Which adapter to use. Validated against the list of adapters that exist |
| `IDENTITY_ISSUER_URL`   | (required)             | The OIDC issuer: the `iss` of tokens, and where discovery is served     |
| `IDENTITY_CLIENT_ID`    | (required)             | The public client used by the desktop app                               |
| `IDENTITY_AUDIENCE`     | the client ID          | Expected `aud` claim of access tokens                                   |
| `AUTH_ADMIN_ROLES`      | `super-admin,hr-admin` | Comma-separated role names. Any one grants access. No blank names       |
| `AUTH_SUPER_ADMIN_ROLE` | `super-admin`          | The one role that may give someone the `admin` role. No blank name      |
| `AUTH_ROLES_CLAIM_PATH` | `realm_access.roles`   | Dot-separated path to the array of role names in the access token       |

- The adapter derives what it needs from the issuer URL (for the first provider, the admin API base URL
  and the realm). If it cannot, the API stops at startup and says `IDENTITY_ISSUER_URL` is the problem.
- A role claim that is absent means "no roles" (the caller gets `403`); a claim of the wrong type makes
  the token invalid (`401`). Claim names that themselves contain a dot are not supported.
- **The desktop app reads `AUTH_ADMIN_ROLES`, `AUTH_SUPER_ADMIN_ROLE` and `AUTH_ROLES_CLAIM_PATH`
  too**, from the same `.env` at the repository root and with the same validation code
  (`loadAccessPolicy` in `@accessdesk/identity`), so the UI and the API cannot disagree. A packaged app
  has no `.env` beside it: set the three variables in its environment, or it uses the defaults.
- The desktop's own settings (issuer URL, client ID, API URL) are entered in its setup wizard and saved
  locally. Settings saved by an older version are converted automatically.

## Naming rule

The first provider's name may appear only where `scripts/naming-allowlist.json` allows. Everywhere else
the code and docs say "identity provider", "issuer", `subjectId`, "role" and "group". `pnpm check` and
CI run `scripts/check-naming.mjs`, which fails with the file and line of any other occurrence, in file
contents and in file paths. To allow a new place, add an entry with a reason; prefer a token over a
file, and a file over a folder. See [ADR 0009](adr/0009-provider-neutral-naming.md).

## Adding another identity provider

1. Create `packages/identity-<name>` implementing `IdentityProvider` from `@accessdesk/identity`. Throw
   `IdentityProviderError` for failures, with an HTTP-style status. Keep raw provider names and
   response shapes in one file, as `packages/identity-keycloak/src/keycloak-api.ts` does.
2. Add a test that calls `runIdentityProviderContract` from `@accessdesk/identity/testing`, using a fake
   of that provider (see `packages/identity-keycloak/test/integration`).
3. Add its ID to `IDENTITY_PROVIDERS` in `apps/api/src/config/index.ts`, and a `case` that builds it in
   `apps/api/src/infra/identity.ts`. Nothing else in `apps/api/src` may import an adapter package; lint
   enforces it.
4. Add the provider's name to `scripts/naming-allowlist.json` for the files that must contain it.

## Repository layout

```
accessdesk/
├── apps/
│   ├── api/                      Fastify API
│   │   ├── prisma/               schema, migrations, seed
│   │   ├── src/
│   │   │   ├── config/           environment parsing (Zod)
│   │   │   ├── infra/            real implementations of outside things: database, identity
│   │   │   │                     (identity.ts: the factory type and the adapter choice), job queue (stub)
│   │   │   ├── modules/          one folder per feature, each with its own layers
│   │   │   │   ├── audit/        audit repository interface and its Prisma implementation
│   │   │   │   ├── employees/    routes (HTTP), service (use cases), mapper
│   │   │   │   ├── health/       /health (liveness) and /ready (readiness)
│   │   │   │   ├── onboarding/   routes, service, the step pipeline (steps, runner, audit
│   │   │   │   │                 observer), password generator
│   │   │   │   └── templates/    routes, repository interface, Prisma repository
│   │   │   ├── plugins/          cross-cutting Fastify plugins: auth (JWT + role guard), jwks
│   │   │   │                     (OIDC discovery of signing keys), error handler
│   │   │   ├── app.ts            builds the app from its dependencies (used by tests too)
│   │   │   └── server.ts         composition root: picks the real implementations
│   │   └── test/
│   │       ├── helpers/          signed-token harness, fakes, app builder
│   │       ├── integration/      HTTP-level tests with app.inject(), and the migration tests
│   │       └── unit/             services, mappers, repositories, config, key discovery
│   └── desktop/                  Electron + React
│       ├── src/
│       │   ├── main/             main process: auth, stores, IPC, security
│       │   ├── preload/          the minimal typed bridge
│       │   ├── renderer/         React UI (components, pages, lib, hooks). Tokens and rules:
│       │   │                     design-system/accessdesk/MASTER.md
│       │   └── shared/           IPC contract shared by main, preload and renderer
│       └── test/
│           ├── unit/main/        main-process logic, mirrors src/main
│           ├── unit/renderer/    React screens, with Testing Library in jsdom
│           └── e2e/              end-to-end test: run.mjs (scratch database) and smoke.mjs (mock
│                                 identity provider + real API + real app)
├── packages/
│   ├── identity/                 IdentityProvider interface, neutral types, access policy, and
│   │   ├── src/                  src/testing/ (the contract test every adapter runs)
│   │   └── test/unit/
│   ├── identity-keycloak/        the adapter for the first supported provider
│   │   ├── src/                  keycloak-api.ts (raw API) and identity-provider.ts (neutral mapping)
│   │   └── test/                 unit/ (wire level, mapping), integration/ (contract), helpers/
│   └── shared/                   Zod schemas, types and feature permissions for desktop and API
│       ├── src/
│       └── test/unit/
├── docs/                         guides, security rules, architecture decision records (adr/)
├── scripts/                      repo automation: setup, dev:all, clean, naming check
└── .github/                      CI, CodeQL, PR and issue templates, Dependabot
```

## Design principles

The reasons behind these are recorded in [docs/adr](adr/README.md). Style, SOLID, design patterns and
system design are explained in full in [coding-standards.md](coding-standards.md).

- **Layers and dependency injection.** A route validates input and calls a service. A service holds
  the use case and depends on interfaces. Real implementations are chosen in one place, `server.ts`.
  Tests pass fakes through the same `AppDeps`. A layer that would only forward calls is left out.
- **Identity is behind an interface.** The API talks to `IdentityProvider` (from `packages/identity`),
  never to a particular provider. `packages/identity-<provider>` is the adapter and keeps everything
  provider-specific inside. See [ADR 0007](adr/0007-identity-provider-interface.md) and
  [ADR 0009](adr/0009-provider-neutral-naming.md).
- **Neutral names.** `subjectId` for a user's ID, "role", "group", "issuer". The provider's name stays
  in the places the allowlist names.
- **Single responsibility.** One reason to change per file: routes (HTTP), services (rules),
  repositories and clients (talking to the outside), mappers (shape conversion), plugins
  (cross-cutting concerns).
- **Depend on small interfaces.** For example `AuthService` needs a `TokenStorage`, not the
  file-based store, and the API client needs only `getAccessToken` and `forceRefresh`.
- **Architecture boundaries are lint rules.** The renderer cannot import main-process code or Node,
  main code cannot import UI code, the API cannot import the desktop app, packages cannot import apps,
  identity provider admin paths can only appear in `packages/identity-*`, and only `server.ts` (through
  `infra/identity.ts`) may import an adapter package into `apps/api/src`.
- **Validate at every boundary** with Zod, and never trust a response shape (the UI checks API
  responses against the shared schemas).
- **Fail safe.** Errors reach users as short messages. Raw validation output, stack traces, tokens and
  database errors do not.

## Testing conventions

- Every app and package keeps its tests in its own `test/` folder, separate from `src/`.
  `test/unit/` mirrors the folder structure of `src/`. `test/integration/` is for tests that wire
  several parts together. `test/helpers/` holds shared test utilities. `test/e2e/` holds end-to-end tests.
- Test files are named `<thing>.test.ts` (or `.tsx` for React).
- Tests never need a real identity provider. The API tests sign real JWTs with a local key set and use
  fake repositories and fake `IdentityProvider`s. `createInMemoryIdentityProvider` (in
  `@accessdesk/identity/testing`) is a full in-memory provider with failure injection (`failNext`); it
  runs the same contract as the real adapter. The e2e test starts a mock identity provider itself.
- **Running the e2e test.** `pnpm test:e2e` (from the repo root or from `apps/desktop`) rebuilds the
  API and the desktop app every time before it starts, so it can never test a stale `out/` or
  `dist/`. Do not run `test/e2e/smoke.mjs` directly: that skips the build. It needs a display.
  Without a database it skips the retry
  scenario, because the audit log needs one. To run all of it, point `TEST_DATABASE_URL` at a
  PostgreSQL server. The runner (`apps/desktop/test/e2e/run.mjs`) creates a throwaway database
  `accessdesk_e2e_<hex>` through the `postgres` maintenance database, applies the migrations to it,
  runs the test, and drops it. It never uses your development database, and the test refuses any
  database not named that way:

  ```
  TEST_DATABASE_URL=postgresql://accessdesk:change-me@localhost:5432/postgres pnpm test:e2e
  ```

- The one exception to "no database" is `apps/api/test/integration/database-migrations.test.ts`: the
  migrations are SQL, so it runs them on a real PostgreSQL. It creates and drops its own scratch
  database and is **skipped unless `TEST_DATABASE_URL` is set** (CI sets it). Locally, with the Docker
  database from `pnpm db:up`:

  ```
  TEST_DATABASE_URL=postgresql://accessdesk:change-me@localhost:5432/postgres pnpm --filter @accessdesk/api test
  ```

  The database user must be allowed to create databases (the Docker `accessdesk` user is).

- Test behavior that users or callers can see (a screen's states, an HTTP status), not internals.
  When a bug is found, add a test that fails without the fix.
- Coverage thresholds in each `vitest.config.ts` are a floor. Code that is only glue to Electron
  (`main/index.ts`, `window.ts`) is excluded from unit coverage and exercised by the e2e test. The
  IPC wiring (`ipc.ts` and the preload) is not excluded: `test/unit/main/ipc-contract.test.ts` checks
  that every channel in `src/shared/ipc.ts` has a handler and a preload function.

## Adding a feature (API)

1. Add or extend Zod schemas in `packages/shared/src`.
2. If it needs something new from the identity provider, add it to the `IdentityProvider` interface in
   `packages/identity/src/identity.ts` with neutral types, implement it in each adapter (never call
   the provider from elsewhere), and extend `runIdentityProviderContract` so every adapter must
   support it.
3. Create `apps/api/src/modules/<feature>/` with routes, a service, and a repository interface if it
   needs storage. Register the routes in `app.ts` and pass real implementations from `server.ts`.
4. Add tests in `apps/api/test/`.
5. If the UI needs it, add the feature to `packages/shared/src/permissions.ts` and the API route's
   role check ([ADR 0006](adr/0006-ui-visibility-is-not-authorization.md)). A feature that needs
   the super-admin role passes `superAdminRole` (from `AuthStatus` in the desktop, from `Config` in the
   API) to `canAccess`, or it is denied.
6. Run `pnpm check`.

Onboarding ([ADR 0010](adr/0010-onboarding-no-rollback-guarded-retry-one-time-password.md)) is the
worked example: `packages/shared/src/onboarding.ts` (schemas and role policy),
`apps/api/src/modules/onboarding/` (routes, service, one object per step run by `runSteps`, an
observer that audits each step) and `apps/desktop/src/renderer/src/pages/onboard-page.tsx`. A new step
is a new object in the pipeline, not a change to the runner.
