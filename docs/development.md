# Development guide

## Prerequisites

- Node.js 22.22.1 or newer (`.nvmrc` says 24)
- pnpm 12 (`npm install -g pnpm@12.9.1`); the `packageManager` field pins it
- Docker, for the local PostgreSQL
- A running Keycloak ([requirements](keycloak-setup.md))

## Commands

| Command              | What it does                                                          |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm setup`         | One-time: create `.env`, start PostgreSQL, migrate, seed              |
| `pnpm dev:all`       | Start the database, apply migrations, then run the API and the app    |
| `pnpm dev`           | Run the API and the desktop app (database must already be running)    |
| `pnpm check`         | Everything CI runs: lint, format check, typecheck, test, build        |
| `pnpm test`          | Unit and integration tests in every package                           |
| `pnpm test:coverage` | The same, with a coverage report and minimum thresholds               |
| `pnpm test:e2e`      | Build, then run the end-to-end smoke test (opens the app window)      |
| `pnpm lint`          | ESLint, including type-aware, accessibility and boundary rules        |
| `pnpm typecheck`     | TypeScript strict mode in every package                               |
| `pnpm build`         | Build everything                                                      |
| `pnpm audit`         | Check dependencies for known vulnerabilities                          |
| `pnpm format`        | Prettier                                                              |
| `pnpm db:up/down`    | Start or stop PostgreSQL                                              |
| `pnpm db:migrate`    | Create and apply a new migration after editing `schema.prisma`        |
| `pnpm clean`         | Remove build output (`pnpm clean --deps` also removes `node_modules`) |

Git hooks (Husky): `pre-commit` lints and formats staged files, `pre-push` runs typecheck and tests.

## Repository layout

```
accessdesk/
├── apps/
│   ├── api/                      Fastify API
│   │   ├── prisma/               schema, migrations, seed
│   │   ├── src/
│   │   │   ├── config/           environment parsing (Zod)
│   │   │   ├── infra/            real implementations of outside things: database, Keycloak
│   │   │   │                     client factory, job queue (stub)
│   │   │   ├── modules/          one folder per feature, each with its own layers
│   │   │   │   ├── employees/    routes (HTTP), service (use cases), mapper
│   │   │   │   ├── health/       /health (liveness) and /ready (readiness)
│   │   │   │   └── templates/    routes, repository interface, Prisma repository
│   │   │   ├── plugins/          cross-cutting Fastify plugins: auth, error handler
│   │   │   ├── app.ts            builds the app from its dependencies (used by tests too)
│   │   │   └── server.ts         composition root: picks the real implementations
│   │   └── test/
│   │       ├── helpers/          signed-token harness, fakes, app builder
│   │       ├── integration/      HTTP-level tests with app.inject()
│   │       └── unit/             services, mappers, repositories, config
│   └── desktop/                  Electron + React
│       ├── src/
│       │   ├── main/             main process: auth, stores, IPC, security
│       │   ├── preload/          the minimal typed bridge
│       │   ├── renderer/         React UI (components, pages, lib, hooks)
│       │   └── shared/           IPC contract shared by main, preload and renderer
│       └── test/
│           ├── unit/main/        main-process logic, mirrors src/main
│           ├── unit/renderer/    React screens, with Testing Library in jsdom
│           └── e2e/              end-to-end smoke test (mock Keycloak + real API + real app)
├── packages/
│   ├── keycloak-client/          ALL Keycloak Admin REST calls
│   │   ├── src/
│   │   └── test/unit/
│   └── shared/                   Zod schemas, types and role permissions for desktop and API
│       ├── src/
│       └── test/unit/
├── docs/                         guides, security rules, architecture decision records (adr/)
├── scripts/                      repo automation: setup, dev:all, clean
└── .github/                      CI, CodeQL, PR and issue templates, Dependabot
```

## Design principles

The reasons behind these are recorded in [docs/adr](adr/README.md). Style, SOLID, design patterns and
system design are explained in full in [coding-standards.md](coding-standards.md).

- **Layers and dependency injection.** A route validates input and calls a service. A service holds
  the use case and depends on interfaces. Real implementations are chosen in one place, `server.ts`.
  Tests pass fakes through the same `AppDeps`. A layer that would only forward calls is left out.
- **Single responsibility.** One reason to change per file: routes (HTTP), services (rules),
  repositories and clients (talking to the outside), mappers (shape conversion), plugins
  (cross-cutting concerns).
- **Depend on small interfaces.** For example `AuthService` needs a `TokenStorage`, not the
  file-based store, and the API client needs only `getAccessToken` and `forceRefresh`.
- **Architecture boundaries are lint rules.** The renderer cannot import main-process code or Node,
  main code cannot import UI code, the API cannot import the desktop app, packages cannot import apps,
  and Keycloak Admin paths can only appear in `packages/keycloak-client`.
- **Validate at every boundary** with Zod, and never trust a response shape (the UI checks API
  responses against the shared schemas).
- **Fail safe.** Errors reach users as short messages. Raw validation output, stack traces, tokens and
  database errors do not.

## Testing conventions

- Every app and package keeps its tests in its own `test/` folder, separate from `src/`.
  `test/unit/` mirrors the folder structure of `src/`. `test/integration/` is for tests that wire
  several parts together. `test/helpers/` holds shared test utilities. `test/e2e/` holds end-to-end tests.
- Test files are named `<thing>.test.ts` (or `.tsx` for React).
- Tests never need a real Keycloak or a database. The API tests sign real JWTs with a local key set and
  use fake repositories and Keycloak clients. The e2e test starts a mock Keycloak itself.
- Test behavior that users or callers can see (a screen's states, an HTTP status), not internals.
  When a bug is found, add a test that fails without the fix.
- Coverage thresholds in each `vitest.config.ts` are a floor. Code that is only glue to Electron
  (`main/index.ts`, `window.ts`, `ipc.ts`) is excluded from unit coverage and exercised by the e2e test.

## Adding a feature (API)

1. Add or extend Zod schemas in `packages/shared/src`.
2. Add Keycloak calls to `packages/keycloak-client` if needed (never call Keycloak from elsewhere).
3. Create `apps/api/src/modules/<feature>/` with routes, a service, and a repository interface if it
   needs storage. Register the routes in `app.ts` and pass real implementations from `server.ts`.
4. Add tests in `apps/api/test/`.
5. If the UI needs it, add the feature to `packages/shared/src/permissions.ts` and the API route's
   role check ([ADR 0006](adr/0006-ui-visibility-is-not-authorization.md)).
6. Run `pnpm check`.
