# 0010. Onboarding: no automatic rollback, a retry guarded by the audit log, a one-time password

Date: 2026-10-08. Status: accepted. Builds on [0003](0003-forward-the-admins-own-token.md),
[0006](0006-ui-visibility-is-not-authorization.md), [0007](0007-identity-provider-interface.md) and
[0008](0008-subject-id-and-append-only-audit-log.md).

## Context

Onboarding changes the identity provider in three separate calls: create the user, add them to a
department group, assign a role. None of them can be made atomic, because the provider has no
transaction across them. Any later call can fail (a missing permission, a network fault, a provider
restart) after the user already exists. The admin also has to hand the new employee a first password.

## Decision

- **No automatic rollback.** When the second or third step fails, the user is not deleted and nothing
  is undone. The API answers `207` with `status: 'partial'` and the result of each step. A rollback
  would itself be a call that can fail, and it could delete an account that someone has already
  started to use. The admin sees which steps finished and decides. If creating the user fails, nothing
  exists, and the error goes through the normal error handler.
- **Retry guarded by the audit log.** `POST /onboarding/:subjectId/retry` finishes a partial
  onboarding. It only runs when the append-only audit log holds a `SUCCESS` row for
  `onboarding.create_user` for that subject, written by the same actor, within the last 24 hours.
  Without the guard, the route would let any admin assign groups and roles to any subject ID. The
  retry reads the user's current groups and roles and skips what is already in place, so it is
  idempotent. It never returns or regenerates a password.
- **Server-generated one-time password.** The API creates the temporary password with
  `crypto.randomInt`: 16 characters, at least one lowercase letter, one uppercase letter and one digit,
  with no easily confused characters. It is sent to the provider as a temporary credential (the
  employee must change it at first sign-in) and returned once in the response with
  `Cache-Control: no-store`. It is never stored, logged or written to the audit log. The desktop keeps
  it only in component state and clears it when the admin leaves the page.
- **Roles.** Only `member`, `manager` and `admin` can be assigned, and `owner` is rejected by the
  schema. `admin` needs the super-admin role, whose name is configuration
  (`AUTH_SUPER_ADMIN_ROLE`, default `super-admin`, read by the API and the desktop through the same
  `loadAccessPolicy`). The API enforces it. The UI only disables the option (ADR 0006).
- **Narrow write path in the desktop.** The renderer gets two typed bridge methods,
  `api.onboarding.create` and `api.onboarding.retry`. The main process builds the two fixed paths
  itself and validates the input with the shared schemas. A write is never retried automatically
  after a network failure or a timeout, because it may already have been applied. Only a `401` is
  sent again, once, with a fresh token.

## Consequences

- A partial onboarding is visible and fixable, and a failed attempt never destroys data.
- If the `create_user` audit row cannot be written (the API logs this with the request id), the user
  exists but the retry is refused with `403`. This is the safe direction. The admin can finish the
  steps by hand in the identity provider.
- The audit row for `create_user` is written as soon as the step succeeds, because the retry depends
  on it.
- If the response to a create request is lost (a timeout), the admin is told to check the Employees
  list, and a second attempt with the same username gets `409`.
- The temporary password is shown once. Losing it means resetting the password in the identity
  provider.
- The onboarding routes are limited to 20 requests a minute per client IP, separately for each route
  (the rate limiter keeps one counter per route, so the limit is not shared across the three).
- A password policy at the provider that this password does not meet (for example a required special
  character) shows up as a failed `create_user`.
- Everything was tested against fakes: an in-memory `IdentityProvider`, a fake admin API server and a
  mock identity provider in the end-to-end test. It has not been run against a real Keycloak.
