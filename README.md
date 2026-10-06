# AccessDesk

[![CI](https://github.com/Muzammil8989/AccessDesk/actions/workflows/ci.yml/badge.svg)](https://github.com/Muzammil8989/AccessDesk/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Muzammil8989/AccessDesk/actions/workflows/codeql.yml/badge.svg)](https://github.com/Muzammil8989/AccessDesk/actions/workflows/codeql.yml)
[![Security gate](https://github.com/Muzammil8989/AccessDesk/actions/workflows/security.yml/badge.svg)](https://github.com/Muzammil8989/AccessDesk/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Muzammil8989/AccessDesk/badge)](https://scorecard.dev/viewer/?uri=github.com/Muzammil8989/AccessDesk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Open source desktop app (a web build will follow) that lets an HR or IT admin **onboard and offboard
employees** using [Keycloak](https://www.keycloak.org/).

- **Keycloak** is the source of truth for identity: users, roles, groups, sessions and login events.
- **AccessDesk's own PostgreSQL database** holds app data only: onboarding templates, checklists,
  scheduled actions, offboarding snapshots and the app's audit log. Employees are referenced by their
  Keycloak user ID (`sub`). Names and emails are never copied.

> **Status: starting project.** Login, a protected app shell, the Employees list and the first-run
> settings wizard work end to end. Onboarding, offboarding and the other screens are stubs. See
> [What works and what is stubbed](#what-works-and-what-is-stubbed).

## Quick start

You need Node.js 22.22.1+, [pnpm](https://pnpm.io/) 12, Docker, and a running Keycloak
([what it needs](docs/keycloak-setup.md)).

```bash
pnpm install
pnpm setup      # creates .env, starts PostgreSQL, applies migrations, seeds templates
pnpm dev:all    # starts the database, then the API and the desktop app together
```

On first launch the desktop app opens a **setup wizard** for the Keycloak URL, realm, client ID and
API URL. These are public values saved locally. No secret is asked for.

| Command              | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `pnpm setup`         | One-time setup: `.env`, PostgreSQL, migrations, seed             |
| `pnpm dev:all`       | Database, migrations, then API + desktop app                     |
| `pnpm dev`           | API + desktop app only (database already running)                |
| `pnpm check`         | Everything CI runs: lint, format, typecheck, test, build         |
| `pnpm test:coverage` | Tests with a coverage report and minimum thresholds              |
| `pnpm test`          | Unit and integration tests in every package                      |
| `pnpm test:e2e`      | Build, then an end-to-end test (mock Keycloak, real API and app) |

The full list is in [docs/development.md](docs/development.md).

## Architecture

```
   Admin's computer
  ┌───────────────────────────────────────────────────────────────────┐
  │ AccessDesk desktop app (Electron)                                 │
  │                                                                   │
  │  Renderer (React, sandboxed)        Main process (Node)           │
  │  ┌────────────────────────┐  IPC   ┌──────────────────────────┐   │
  │  │ screens, forms, cache  │◄──────►│ OIDC login (PKCE)        │   │
  │  │ NO tokens, NO Node     │ preload│ token store (safeStorage)│   │
  │  └────────────────────────┘ (typed)│ API client + bearer token│   │
  │                                    └───────┬──────────┬───────┘   │
  └────────────────────────────────────────────┼──────────┼───────────┘
        system browser (login page) ◄──────────┘          │
                  │                                       │ HTTPS
                  ▼                                       │ Authorization: Bearer <admin's token>
        ┌──────────────────┐                              ▼
        │     Keycloak     │◄──────────────────┌──────────────────────┐
        │ users, roles,    │  Admin REST API   │ AccessDesk API       │
        │ groups, sessions,│  (admin's own     │ (Fastify)            │
        │ login events     │   token)          │ - verify JWT (JWKS)  │
        └──────────────────┘                   │ - require admin role │
                                               └──────────┬───────────┘
                                                          │ Prisma
                                                          ▼
                                               ┌──────────────────────┐
                                               │ PostgreSQL 16        │
                                               │ app data only        │
                                               └──────────────────────┘
```

## Repository layout

```
apps/
  api/                  Fastify API        src/ (config, infra, modules, plugins)  test/ (unit, integration, helpers)  prisma/
  desktop/              Electron + React   src/ (main, preload, renderer, shared)   test/ (unit, e2e)
packages/
  shared/               Zod schemas and types for desktop and API        src/  test/
  keycloak-client/      ALL Keycloak Admin REST calls, one typed interface   src/  test/
docs/                   development guide, Keycloak setup, security rules
scripts/                repo automation (setup, dev:all, clean)
```

Every app and package keeps its tests in its own `test/` folder. The annotated tree and the testing
conventions are in [docs/development.md](docs/development.md). Each app and package has its own README.

## Documentation

- [Development guide](docs/development.md): commands, layout, testing, adding a feature
- [Coding standards](docs/coding-standards.md): code style, SOLID, design patterns, system design
- [Keycloak requirements](docs/keycloak-setup.md): what your realm needs
- [Security rules](docs/security.md): the rules, API hardening, supply chain, and where each is tested
- [Architecture decisions](docs/adr/README.md): why the project is built this way
- [Project as a prompt](docs/project-prompt.md): everything in the code, written so it can be rebuilt or extended
- [Contributing](CONTRIBUTING.md) and [Security policy](SECURITY.md)

## What works and what is stubbed

**Works**

- Setup wizard, with a "Test connection" check against Keycloak discovery
- Login with PKCE through the system browser, token refresh, sign-out (also ends the Keycloak session),
  session restore after restart
- Protected layout and sidebar (Employees, Onboard, Offboard, Access Review, Audit Log, Settings)
- Employees list: search, pagination, loading, empty and error states (desktop to API to Keycloak)
- API: `GET /health`, `GET /templates`, `GET /employees`, `GET /employees/:id`
- PostgreSQL schema, first migration and seed
- `packages/keycloak-client` with unit tests (mocked `fetch`)

**Stubbed or not built yet**

- Onboard, Offboard, Access Review and Audit Log screens ("not built yet" placeholders)
- Employee detail and edit screens (the API route for one employee exists)
- Using the Keycloak client's write functions (create, disable, logout sessions, groups, roles) from
  the API. They are implemented and tested, but no route calls them yet.
- pg-boss scheduled jobs (`apps/api/src/infra/jobs.ts` is a stub). **Open design question:** a job that
  runs later has no logged-in admin token to forward. Decide between stored offline tokens and running
  the action when an admin next opens the app before building scheduled actions.
- Playwright specs (a config and one end-to-end smoke script exist), packaging and installers, the web
  build

## Troubleshooting

- **`pnpm` is not recognized:** add npm's global folder to your `PATH` (for a default install,
  `%APPDATA%\npm`) and open a new terminal.
- **Electron crashes on start with `Cannot read properties of undefined (reading 'enableSandbox')`:**
  the variable `ELECTRON_RUN_AS_NODE` is set (editors built on Electron, such as VS Code, can leak it).
  `pnpm dev` clears it for you in `electron.vite.config.ts`. If you start Electron some other way,
  unset it.
- **`pnpm setup` says Docker failed:** start Docker Desktop and run it again.
- **Login fails with an issuer message in the wizard:** Keycloak reports a different URL than the one
  you typed (for example behind a proxy). Use the URL Keycloak is configured with, and the same value
  in `KEYCLOAK_URL`.
- **`403` on the Employees list:** the token is valid but the admin lacks a Keycloak `realm-management`
  role such as `view-users`, or lacks `super-admin` / `hr-admin`.
- **Linux:** secure storage needs a running keyring (libsecret). Without it the session lasts until
  you quit the app.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: fork, branch, run
`pnpm check`, open a pull request. For anything big, open an issue before you start. Look for issues
labeled `good first issue`.

- Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Need help? See [SUPPORT.md](SUPPORT.md).
- Every pull request goes through automatic checks (lint, tests, CodeQL, a secret scan and a
  dependency review). A pull request from an outside contributor that leaks a secret or adds a
  vulnerable dependency is closed automatically with an explanation.

## Security

Do not report vulnerabilities in public issues. Use GitHub's private vulnerability reporting. See
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
