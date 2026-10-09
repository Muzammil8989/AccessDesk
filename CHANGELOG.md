# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- **Sidebar.** The collapse button sits at the top next to the logo, `Ctrl+B` toggles it (not while
  typing), and the choice is remembered on this device. Collapsed icons, the theme button and Sign out
  show a styled tooltip on hover and on keyboard focus (`@radix-ui/react-tooltip`, a new
  `components/ui/tooltip.tsx`) instead of the browser's `title`. Neighbouring sidebar tooltips open at
  once, and collapsed links keep their hover and active styles.
- **Onboard screen.** The form is split into four titled cards, with a live summary of what will be
  created and a "What happens next" list beside it on wide windows. On wide windows the summary stays in view
  while the form scrolls and holds the "Onboard employee" and new "Clear form" buttons, so nothing floats
  over the fields. The manager search shows avatars and a
  "Disabled" badge. The result shows the password, checklist and a step timeline on the left and the
  details on the right. Accessible names, focus behaviour and API calls are unchanged.
- **Which roles onboarding may assign is now one shared rule** (ADR 0011). `canAssignRole` and
  `roleOptions` take a policy (`{ adminRoles, superAdminRole }`), and `roleViolation` is the single
  function behind them. It applies to the form's role on create and on retry. A role in
  `AUTH_ADMIN_ROLES` (for example `manager`, if you list it) now needs a super-admin even on the form,
  and the super-admin role can no longer be given through onboarding. The `403` message names the role.
- **The desktop's read allowlist is now six fixed paths** instead of any path of a certain shape:
  `/employees`, `/employees/<uuid>`, `/templates`, `/onboarding/options`, `/checklists` and
  `/checklists/<uuid>`.
- `GET /templates` returns each template's `departmentRef`, `defaultRole` and, per item, the `kind` (an
  enum) and `targetRef`. `GET /onboarding/options` returns each department's group `path`.
- The step result of onboarding has an optional `label`, and the step names include
  `template_add_to_group`, `template_assign_role` and `create_checklist`.
- **Database (three new migrations; run `pnpm --filter @accessdesk/api db:deploy` on existing databases).**
  Templates gain `department_ref` and `default_role`, and checklists are unique on
  `(subject_id, type)`. A narrow data migration moves a template's department out of its items, only
  for a template with no department and exactly one group item (others are left as they are, and a
  notice lists them). Checklists gain `manager_subject_id` and `start_date`. Until these are applied the
  new screens fail with "Internal server error".
- The end-to-end runner now seeds its throwaway database. `ci.yml` is unchanged.

- `pnpm test:e2e` now builds the API and the desktop app itself, every time, then runs
  `apps/desktop/test/e2e/run.mjs`. Do not run `smoke.mjs` directly. The root script no longer runs
  `pnpm build` first.
- The IPC wiring (`ipc.ts` and the preload) is no longer excluded from unit coverage. A new contract
  test checks that every IPC channel has a handler and a preload function.
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

- **Onboarding, part 2** (ADR 0011).
  - **Templates:** an optional template on the Onboard form pre-fills the department and role, says so,
    lists in plain words what it will also do, and is disabled with a reason for someone who may not use
    it. Template groups and roles run as extra steps (`template_add_to_group`, `template_assign_role`),
    each with an audit row. A group or role that does not exist fails only its own step, and Retry
    finishes it. `MANUAL_TASK` items become a checklist.
  - **Checklists:** `GET /checklists`, `GET /checklists/:subjectId`,
    `PATCH /checklists/:subjectId/items/:itemId` and `PATCH /checklists/:subjectId`
    (`409 checklist_has_tasks`). A tick or a close and its audit row are one transaction, after locking
    the checklist row. A checklist is never created as done; one with no tasks stays open until it is
    closed. Desktop screens: the checklist on the result screen, `/onboard/checklists` and
    `/onboard/checklists/:subjectId`.
  - **Manager and start date:** optional. The manager is picked with the Employees search, checked
    before anything is created (`unknown_manager`, `manager_disabled`) and saved by `subjectId` only.
    The start date is saved as a calendar date and is **information only**: the account is enabled at
    once.
  - `IdentityProvider.listRoles()`, implemented by the in-memory provider and the adapter.
  - The bridge gains `api.checklists.setItem` and `api.checklists.setClosed`.
  - Tests: a real-database test for the tick and close transactions and the row lock, migration tests
    for every case of the data migration, and an end-to-end scenario for templates, checklists, manager
    and start date.

- **Onboarding, part 1** (ADR 0010). Desktop: a real Onboard screen (first name, last name, email,
  username, department, role) with a success screen that shows a one-time temporary password, and a
  partial-failure screen with Retry. API: `GET /onboarding/options`, `POST /onboarding` (`201`, or
  `207` when a step after creating the user fails) and `POST /onboarding/:subjectId/retry`, all limited
  to 20 requests a minute per IP and sent with `Cache-Control: no-store`. Every step writes an audit
  row. The retry only works for a user the same admin created in the last 24 hours.
  - Identity: `IdentityProvider` gains `listGroups` and an exact `findUsers`, and `createUser` accepts
    `emailVerified` and a temporary `initialPassword`. A new in-memory provider for tests runs the
    same contract as the adapter.
  - Configuration: new optional `AUTH_SUPER_ADMIN_ROLE` (default `super-admin`). Only that role can
    assign `admin`. The desktop reads it the same way as `AUTH_ADMIN_ROLES`.
  - Desktop: the bridge gains `api.onboarding.create` and `api.onboarding.retry`. HTTP `207` is a
    success with a body, and API errors carry their `code`.
  - API error codes `username_exists` and `email_exists` (`409`).
  - End-to-end test: an onboarding scenario. `pnpm test:e2e` creates a throwaway database when
    `TEST_DATABASE_URL` points at a PostgreSQL server, and drops it afterwards.
  - Permissions: new feature `onboard-assign-admin`, which needs the super-admin role. `canAccess`
    takes an optional `superAdminRole`, and a super-admin feature is denied without it.
  - `@accessdesk/identity/testing` now also exports `createInMemoryIdentityProvider`, a full in-memory
    provider with failure injection (`failNext`).
- **Desktop UI redesign.** A new design system ([design-system/accessdesk/MASTER.md](design-system/accessdesk/MASTER.md)):
  slate and blue tokens, Inter bundled locally (no CDN, the CSP allows `font-src 'self'`), a light, dark
  or system theme that is saved locally, a sidebar that collapses, toast messages, loading skeletons,
  inline alerts, an error summary on forms, and a redesigned Employees page. The placeholder screens
  now show an icon and a short description.
- Desktop: the only permission the app grants is writing text to the clipboard (for "Copy" on the
  one-time password), for its own top-level page. Everything else stays denied. See `docs/security.md`.
- Monorepo with pnpm workspaces and Turborepo: `apps/desktop`, `apps/api`, `packages/shared`,
  `packages/keycloak-client`.
- Desktop: setup wizard, OIDC login (Authorization Code + PKCE, system browser, loopback redirect),
  encrypted token storage, protected layout, Employees list.
- API: JWT verification, role guard, `/health`, `/templates`, `/employees`, `/employees/:id`.
- PostgreSQL schema, first migration and seed.
- Tests in a `test/` folder for every app and package, plus an end-to-end smoke test.
- `pnpm setup`, `pnpm dev:all` and `pnpm check` scripts.
- Role-based visibility: users see only the features their role allows; accounts without an AccessDesk role get a "no access" page.
