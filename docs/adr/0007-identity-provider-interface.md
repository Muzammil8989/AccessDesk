# 0007. Reach the identity system through an `IdentityProvider` interface

Date: 2026-10-07. Status: accepted, partly superseded by [0009](0009-provider-neutral-naming.md) (the
interface now lives in `packages/identity`, and the names and settings changed). Refines
[0005](0005-layers-and-dependency-injection.md).

## Context

The API depended on a `KeycloakClient` interface whose types were Keycloak's own: `KeycloakUser` with
`createdTimestamp`, "realm roles", Keycloak's error class. The admin role names and the claim that
holds roles (`realm_access.roles`) were fixed in code. That ties every module to Keycloak, even though
only a few details are really Keycloak's. We want to support other identity systems later, with
Keycloak staying the first and recommended one ([0001](0001-keycloak-is-the-source-of-identity.md)
still holds: the identity system is the source of identity).

## Decision

- `@accessdesk/shared` defines `IdentityProvider` (list, count, get, create, disable, end all sessions,
  groups, roles) with neutral types (`IdentityUser`, `IdentityGroup`, `IdentityRole`) and one error
  class, `IdentityProviderError`, carrying an HTTP-style status.
- `packages/keycloak-client` is the Keycloak adapter. It implements `IdentityProvider` and keeps
  everything Keycloak-specific inside: Admin REST paths, realm roles, role IDs, epoch-millisecond
  timestamps. Its error class `KeycloakError` extends `IdentityProviderError`.
- `apps/api` depends only on `IdentityProvider`, through an injected `identityFor(adminToken)`
  factory. Only `server.ts` picks the Keycloak adapter; lint forbids importing the adapter package
  from any other file in `apps/api/src`.
- The admin role names (`AUTH_ADMIN_ROLES`, default `super-admin,hr-admin`) and the path of the roles
  claim in the access token (`AUTH_ROLES_CLAIM_PATH`, default `realm_access.roles`) are configuration,
  validated at startup.
- `runIdentityProviderContract` (in `@accessdesk/shared/testing`) is a test every implementation must
  pass. The Keycloak adapter runs it against an in-memory fake Admin API behind a mocked `fetch`.

## Consequences

- A new identity system means a new adapter package, a factory in `server.ts` and a contract test. No
  route or service changes.
- Anything that cannot be expressed with these types is a deliberate change to the interface, not a
  quiet leak of provider details.
- Not yet provider-neutral: sign-in and token verification still assume an OIDC provider laid out like
  Keycloak (the JWKS URL, the issuer format), the API answers provider errors with the code
  `keycloak_error` (kept so clients do not break), the desktop app reads roles from `realm_access.roles`
  and takes its admin role names from `ADMIN_ROLES` in `@accessdesk/shared`, and onboarding template
  item kinds still say `REALM_ROLE`. These follow when a second provider exists.
- Changing the role names or claim path for the API alone leaves the desktop UI hiding features from
  those admins until the desktop is made configurable too.
