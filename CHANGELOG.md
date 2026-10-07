# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- Database: `app_audit_log` also rejects `TRUNCATE` (a statement-level trigger, one more migration). The
  database owner can still drop the triggers (ADR 0008).
- **Breaking: provider-neutral naming** (ADR 0009). The `IdentityProvider` interface moved to the new
  `packages/identity`, and the adapter is now `packages/identity-keycloak` (was `packages/keycloak-client`).
  A check run by `pnpm check` and CI keeps the provider name out of everything but an explicit allowlist.
  - Environment: `KEYCLOAK_URL` and `KEYCLOAK_REALM` are replaced by one `IDENTITY_ISSUER_URL`
    (`http://host/realms/<realm>`); `KEYCLOAK_CLIENT_ID` is `IDENTITY_CLIENT_ID`; `KEYCLOAK_AUDIENCE` is
    `IDENTITY_AUDIENCE`; new optional `IDENTITY_PROVIDER` (default `keycloak`). **Update your `.env`.**
  - The API finds token signing keys through OIDC discovery instead of a hard-coded path.
  - The API error code `keycloak_error` is now `identity_error`.
  - Desktop: the setup wizard asks for an Issuer URL and a Client ID (no realm). Saved settings are
    converted automatically. Admin role names and the roles claim path come from the same `AUTH_*`
    variables as the API instead of being fixed in the UI.
  - Database: the item kind `REALM_ROLE` is now `ROLE` (one more migration; existing rows are kept).
- Database: employee references are now `subject_id` (the OIDC `sub`) instead of `keycloak_user_id`, and
  `target_subject_id` in the audit log. `app_audit_log` gains `outcome` and `request_id` and becomes
  append-only (a trigger rejects UPDATE and DELETE). `offboarding_snapshots` gain `client_roles` and
  `was_enabled`. One new migration; existing data is kept. Run `pnpm --filter @accessdesk/api db:deploy`
  on existing databases. See ADR 0008.
- The API now depends on a provider-neutral `IdentityProvider` interface (`packages/shared`). `packages/keycloak-client`
  is the Keycloak adapter; only `server.ts` picks it. Behaviour is unchanged. See ADR 0007.
- The admin role names and the roles claim path are configuration: `AUTH_ADMIN_ROLES` (default
  `super-admin,hr-admin`) and `AUTH_ROLES_CLAIM_PATH` (default `realm_access.roles`), validated at startup.

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
