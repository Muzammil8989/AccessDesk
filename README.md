# AccessDesk

**Employee onboarding and offboarding on top of Keycloak, for HR and IT admins.**

[![CI](https://github.com/Muzammil8989/AccessDesk/actions/workflows/ci.yml/badge.svg)](https://github.com/Muzammil8989/AccessDesk/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Muzammil8989/AccessDesk/actions/workflows/codeql.yml/badge.svg)](https://github.com/Muzammil8989/AccessDesk/actions/workflows/codeql.yml)
[![Security gate](https://github.com/Muzammil8989/AccessDesk/actions/workflows/security.yml/badge.svg)](https://github.com/Muzammil8989/AccessDesk/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Muzammil8989/AccessDesk/badge)](https://scorecard.dev/viewer/?uri=github.com/Muzammil8989/AccessDesk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

AccessDesk is an open source desktop application (a web build will follow) that gives HR and IT admins
one place to **onboard and offboard employees** using [Keycloak](https://www.keycloak.org/) as the
identity provider. It does not replace Keycloak and does not copy its data.

> [!NOTE]
> **Status: early development (v0.1.0).** Login, a protected app shell, the Employees list and the
> first-run setup wizard work end to end. Onboarding, offboarding and the remaining screens are
> placeholders. See [Project status](#project-status).

## Contents

- [Why AccessDesk](#why-accessdesk)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Tech stack](#tech-stack)
- [Project status](#project-status)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Why AccessDesk

The data is split by ownership, so there is never a second copy of identity to keep in sync:

- **Keycloak is the source of truth for identity**: users, roles, groups, sessions and login events.
- **AccessDesk's own PostgreSQL database holds app data only**: onboarding templates, checklists,
  scheduled actions, offboarding snapshots and the app's audit log. Employees are referenced by their
  Keycloak user ID (`sub`). Names and emails are never copied.

Security properties that shape the design:

- **Actions are attributed to the real admin.** The API forwards the logged-in admin's own token to the
  Keycloak Admin API instead of using a shared service account, so Keycloak's admin events name the
  person who made the change ([ADR 0003](docs/adr/0003-forward-the-admins-own-token.md)).
- **The UI never holds a token.** The renderer is sandboxed with no Node access. Tokens live in the
  Electron main process, encrypted with the operating system's secure storage.
- **Login uses the system browser** with Authorization Code + PKCE, and no client secret is needed
  ([ADR 0002](docs/adr/0002-pkce-with-system-browser.md)).
- **Hiding a feature is not authorization.** The UI hides what a role cannot use, but the API checks
  the token on every request ([ADR 0006](docs/adr/0006-ui-visibility-is-not-authorization.md)).

## Quick start

### Prerequisites

| Requirement                                                | Notes                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) 22.22.1+                    | `.nvmrc` pins Node 24                                         |
| [pnpm](https://pnpm.io/) 12                                | The `packageManager` field pins `pnpm@12.9.1`                 |
| [Docker](https://www.docker.com/)                          | Runs the local PostgreSQL 16 database                         |
| A running Keycloak with a configured realm                 | See [Keycloak requirements](docs/keycloak-setup.md)           |
| An account with the `super-admin` or `hr-admin` realm role | Anyone else is refused by the API and sees a "no access" page |

### Install and run

```bash
pnpm install
pnpm run setup   # creates .env, starts PostgreSQL, applies migrations, seeds templates
pnpm dev:all     # starts the database, then the API and the desktop app together
```

> [!IMPORTANT]
> Use `pnpm run setup`, not `pnpm setup`. `pnpm setup` is a built-in pnpm command that configures pnpm
> itself and does not run this repository's setup script.

On first launch the desktop app opens a **setup wizard** for the Keycloak URL, realm, client ID and
API URL. These are public values saved locally. No secret is ever asked for.

## Configuration

`pnpm run setup` copies [.env.example](.env.example) to `.env`. Never commit `.env`.

| Variable                | Required | Default                 | Purpose                                                        |
| ----------------------- | -------- | ----------------------- | -------------------------------------------------------------- |
| `KEYCLOAK_URL`          | Yes      | `http://localhost:8080` | Base URL of your Keycloak server                               |
| `KEYCLOAK_REALM`        | Yes      | `company-platform`      | Realm that holds your users and roles                          |
| `KEYCLOAK_CLIENT_ID`    | Yes      | `accessdesk`            | Public client used by the desktop app                          |
| `KEYCLOAK_AUDIENCE`     | No       | `KEYCLOAK_CLIENT_ID`    | Expected `aud` claim of access tokens                          |
| `DATABASE_URL`          | Yes      | local PostgreSQL        | Connection string for AccessDesk's own database                |
| `POSTGRES_PASSWORD`     | No       | `change-me`             | Password for the Docker database. Change it outside local use  |
| `API_PORT`              | No       | `4000`                  | Port the API listens on                                        |
| `API_HOST`              | No       | `127.0.0.1`             | Bind address. Use `0.0.0.0` only behind a reverse proxy        |
| `API_TRUST_PROXY`       | No       | `false`                 | Trust `X-Forwarded-*` headers. Only behind a proxy you control |
| `RATE_LIMIT_PER_MINUTE` | No       | `300`                   | Requests per client IP per minute before the API answers `429` |
| `LOG_LEVEL`             | No       | `info`                  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |

## Commands

Run all commands from the repository root.

| Command              | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `pnpm run setup`     | One-time setup: `.env`, PostgreSQL, migrations, seed             |
| `pnpm dev:all`       | Database, migrations, then API and desktop app                   |
| `pnpm dev`           | API and desktop app only (database already running)              |
| `pnpm check`         | Everything CI runs: lint, format, typecheck, test, build         |
| `pnpm test`          | Unit and integration tests in every package                      |
| `pnpm test:coverage` | Tests with a coverage report and minimum thresholds              |
| `pnpm test:e2e`      | Build, then an end-to-end test (mock Keycloak, real API and app) |
| `pnpm db:up`         | Start the local PostgreSQL container                             |
| `pnpm db:migrate`    | Create and apply a migration after editing `schema.prisma`       |

The full list, with the Git hooks and testing conventions, is in the
[development guide](docs/development.md).

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

The reasons behind these choices are recorded as [architecture decision records](docs/adr/README.md).

## Repository layout

A pnpm workspace orchestrated with Turborepo.

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

Every app and package keeps its tests in its own `test/` folder and has its own README. The annotated
tree and the testing conventions are in the [development guide](docs/development.md).

## Tech stack

| Area     | Technology                                                                          |
| -------- | ----------------------------------------------------------------------------------- |
| Desktop  | Electron, electron-vite, React, React Router, TanStack Query, React Hook Form       |
| UI       | Tailwind CSS, shadcn/ui-style components, Radix UI                                  |
| API      | Fastify, Zod, Prisma, pg-boss (scheduled jobs, not wired up yet)                    |
| Database | PostgreSQL 16                                                                       |
| Identity | Keycloak (OIDC, Authorization Code + PKCE, Admin REST API)                          |
| Tooling  | TypeScript (strict), pnpm workspaces, Turborepo, Vitest, Playwright                 |
| Quality  | ESLint (type-aware, accessibility and architecture-boundary rules), Prettier, Husky |

## Project status

**Working**

- Setup wizard, with a "Test connection" check against Keycloak discovery
- Login with PKCE through the system browser, token refresh, sign-out (which also ends the Keycloak
  session) and session restore after a restart
- Protected layout and role-aware sidebar (Employees, Onboard, Offboard, Access Review, Audit Log,
  Settings)
- Employees list with search, pagination, and loading, empty and error states (desktop to API to
  Keycloak)
- API: `GET /health`, `GET /ready`, `GET /templates`, `GET /employees`, `GET /employees/:id`
- PostgreSQL schema, first migration and seed
- `packages/keycloak-client` with unit tests (mocked `fetch`)

**Not built yet**

- Onboard, Offboard, Access Review and Audit Log screens (placeholders today)
- Employee detail and edit screens (the API route for one employee exists)
- API routes for the Keycloak client's write functions (create, disable, log out sessions, groups,
  roles). The functions are implemented and tested, but no route calls them yet.
- Scheduled jobs. `apps/api/src/infra/jobs.ts` is a stub.
- Playwright specs (a config and one end-to-end smoke script exist), packaging and installers, and the
  web build

> [!NOTE]
> **Open design question:** a scheduled job runs later, when no admin is logged in, so there is no
> token to forward. Before building scheduled actions, decide between stored offline tokens and
> running the action when an admin next opens the app.

## Documentation

- [Development guide](docs/development.md): commands, layout, testing, adding a feature
- [Coding standards](docs/coding-standards.md): code style, SOLID, design patterns, system design
- [Keycloak requirements](docs/keycloak-setup.md): what your realm needs
- [Security rules](docs/security.md): the rules, API hardening, supply chain, and where each is tested
- [Architecture decisions](docs/adr/README.md): why the project is built this way
- [Project as a prompt](docs/project-prompt.md): everything in the code, written so it can be rebuilt or
  extended
- [Changelog](CHANGELOG.md), [Contributing](CONTRIBUTING.md) and [Security policy](SECURITY.md)

## Troubleshooting

| Symptom                                                                                        | Cause and fix                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm` is not recognized                                                                       | Add npm's global folder to your `PATH` (for a default Windows install, `%APPDATA%\npm`) and open a new terminal.                                                                                 |
| `pnpm setup` changes your shell profile or does not create `.env`                              | That is pnpm's built-in command. Run `pnpm run setup` instead.                                                                                                                                   |
| Electron crashes on start with `Cannot read properties of undefined (reading 'enableSandbox')` | `ELECTRON_RUN_AS_NODE` is set (editors built on Electron, such as VS Code, can leak it). `pnpm dev` clears it for you in `electron.vite.config.ts`. If you start Electron another way, unset it. |
| `pnpm run setup` says Docker failed                                                            | Start Docker Desktop and run it again.                                                                                                                                                           |
| Login fails with an issuer message in the wizard                                               | Keycloak reports a different URL than the one you typed (for example behind a proxy). Use the URL Keycloak is configured with, and the same value in `KEYCLOAK_URL`.                             |
| `403` on the Employees list                                                                    | The token is valid, but the admin lacks a Keycloak `realm-management` role such as `view-users`, or lacks `super-admin` / `hr-admin`.                                                            |
| Linux: the session ends when you quit the app                                                  | Secure storage needs a running keyring (libsecret). Without it the session lasts only until you quit.                                                                                            |

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: fork, branch, run
`pnpm check`, then open a pull request. For anything big, open an issue before you start. Look for
issues labeled `good first issue`.

- Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- Need help? See [SUPPORT.md](SUPPORT.md).
- Every pull request goes through automatic checks: lint, tests, CodeQL, a secret scan and a
  dependency review. A pull request from an outside contributor that leaks a secret or adds a
  vulnerable dependency is closed automatically with an explanation.

## Security

Do not report vulnerabilities in public issues. Use GitHub's private vulnerability reporting. See
[SECURITY.md](SECURITY.md).

## License

Released under the [MIT License](LICENSE).
