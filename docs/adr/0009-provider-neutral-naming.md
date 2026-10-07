# 0009. Provider-neutral naming

Date: 2026-10-07. Status: accepted. Builds on [0007](0007-identity-provider-interface.md), which it
partly supersedes (where the interface lives, and the names and settings it used).

## Context

[0007](0007-identity-provider-interface.md) put the API behind an `IdentityProvider` interface, but
the first provider's name was still everywhere else: in environment variables (`KEYCLOAK_URL`,
`KEYCLOAK_REALM`), the desktop settings (a server URL plus a realm), the database (`keycloak_user_id`,
a role kind named after realm roles), the HTTP error code, UI text, test fakes and docs. Supporting a
second provider would have meant renaming all of that, and each rename would have been a breaking
change. Names also shape what people assume: a field called `realm` invites code that only works for
one provider.

## Decision

**One vocabulary.** The general word is "identity". A user's ID is a `subjectId` (the OIDC `sub`),
roles are "roles", groups are "groups", and the provider's URL is the "issuer".

**Package layout.**

- `packages/identity` (`@accessdesk/identity`): the `IdentityProvider` interface, `IdentityUser`,
  `IdentityGroup`, `IdentityRole`, `IdentityProviderError`, the access policy (admin roles and roles
  claim path) and the contract test helper. `packages/shared` re-exports none of it.
- `packages/identity-<provider>`: one adapter per provider. The first is `packages/identity-keycloak`
  (`@accessdesk/identity-keycloak`). Inside it, only `src/keycloak-api.ts` has raw provider names (HTTP
  paths and raw response shapes). Mapping, helpers and tests use neutral names such as `mapUser`.

**Where the provider's name may appear.** Only in the places listed in
`scripts/naming-allowlist.json`: that file and its tests, the adapter's package name and factory
(`createKeycloakIdentityProvider`), the provider's setup guide, existing ADRs, the changelog, the
Docker files, applied migrations, and two files that must read the old saved-settings shape. Everything
else says "identity provider". `pnpm check` and CI run `scripts/check-naming.mjs`, which fails on any
other occurrence, in file contents and in file paths.

**Configuration.** `IDENTITY_PROVIDER` (default `keycloak`, validated; only that value exists),
`IDENTITY_ISSUER_URL` (the OIDC issuer), `IDENTITY_CLIENT_ID` and `IDENTITY_AUDIENCE` replace the
`KEYCLOAK_*` variables. The adapter derives its admin API base URL and realm from the issuer URL and
the API refuses to start, naming `IDENTITY_ISSUER_URL`, if it cannot. The desktop settings are an
issuer URL and a client ID. Settings saved by older versions are converted automatically, or the setup
wizard shows again if they cannot be.

**Same policy in UI and API.** Admin role names (`AUTH_ADMIN_ROLES`) and the roles claim path
(`AUTH_ROLES_CLAIM_PATH`) are read by both the API and the desktop app from the same `.env`, with the
same validation code from `@accessdesk/identity`, and tokens are read with the same function.

**Standard OIDC.** The API finds the token signing keys through discovery
(`/.well-known/openid-configuration`, then `jwks_uri`) instead of a provider-specific path. Issuer,
audience, algorithm and expiry are still checked.

**Wire and database names.** The API's error code for identity provider failures is `identity_error`.
Database columns are `subject_id` and `target_subject_id` (see [0008](0008-subject-id-and-append-only-audit-log.md)),
and the item kind `REALM_ROLE` is now `ROLE`, by a migration that renames the enum value and keeps
every row.

## Consequences

- Adding a provider is a new `packages/identity-<provider>` package, an entry in `IDENTITY_PROVIDERS`
  and a `case` in `apps/api/src/infra/identity.ts`. No other file should need to change.
- The guard makes the rule hold without relying on review. The allowlist is explicit and every entry
  has a reason, so adding to it is a visible decision.
- This is a breaking change for anyone running the previous version: rename the environment variables
  and run the migrations. The changelog says how.
- Not yet provider-neutral, on purpose: the default roles claim path `realm_access.roles` and the
  default admin role names follow the first provider's conventions; the issuer-to-admin-API derivation
  lives in the adapter; the desktop reads the policy from environment variables, so a packaged app
  without a `.env` uses its defaults unless the variables are set for it; employee IDs in API routes are
  validated as UUIDs; the old-settings migration needs the first provider's issuer layout; and
  `realm_roles` remains a snapshot column name.
