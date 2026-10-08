# Architecture decision records

Short notes on why the project is built the way it is. Each one states the situation, the decision and
what follows from it, so a new contributor does not have to guess or re-argue it.

To add one, copy [template.md](template.md), number it, and add it to the list. Do not rewrite an old
record when a decision changes: add a new one that supersedes it.

| #                                                                      | Decision                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| [0001](0001-keycloak-is-the-source-of-identity.md)                     | Keycloak holds identity; our database holds only app data       |
| [0002](0002-pkce-with-system-browser.md)                               | Sign in with PKCE through the system browser                    |
| [0003](0003-forward-the-admins-own-token.md)                           | Call Keycloak with the logged-in admin's own token              |
| [0004](0004-custom-app-scheme-for-the-renderer.md)                     | Serve the UI from a custom `app://` scheme                      |
| [0005](0005-layers-and-dependency-injection.md)                        | API layers with dependency injection                            |
| [0006](0006-ui-visibility-is-not-authorization.md)                     | Hiding features in the UI is a convenience, not security        |
| [0007](0007-identity-provider-interface.md)                            | Reach the identity system through an `IdentityProvider`         |
| [0008](0008-subject-id-and-append-only-audit-log.md)                   | Neutral subject IDs, and an append-only audit log               |
| [0009](0009-provider-neutral-naming.md)                                | Provider-neutral naming, enforced by a check                    |
| [0010](0010-onboarding-no-rollback-guarded-retry-one-time-password.md) | Onboarding: no rollback, audit-guarded retry, one-time password |
