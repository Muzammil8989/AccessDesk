# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Monorepo with pnpm workspaces and Turborepo: `apps/desktop`, `apps/api`, `packages/shared`,
  `packages/keycloak-client`.
- Desktop: setup wizard, OIDC login (Authorization Code + PKCE, system browser, loopback redirect),
  encrypted token storage, protected layout, Employees list.
- API: JWT verification, role guard, `/health`, `/templates`, `/employees`, `/employees/:id`.
- PostgreSQL schema, first migration and seed.
- Tests in a `test/` folder for every app and package, plus an end-to-end smoke test.
- `pnpm setup`, `pnpm dev:all` and `pnpm check` scripts.
- Role-based visibility: users see only the features their role allows; accounts without an AccessDesk role get a "no access" page.
