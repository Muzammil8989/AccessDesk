# 0002. Sign in with PKCE through the system browser

Date: 2026-10-06. Status: accepted

## Context

The desktop app cannot keep a secret: anything shipped in the app can be extracted. Signing in inside
an embedded window would let the app see the user's password and would train users to type it into a
window they cannot verify.

## Decision

The app is a public OIDC client using Authorization Code with PKCE (S256). Login opens the user's
system browser. The redirect goes to a one-shot listener on `http://127.0.0.1:<random port>/callback`
run by the Electron main process (RFC 8252). There is no client secret anywhere in the app.

## Consequences

- The app never sees a password. The user signs in where their password manager and SSO already work.
- Keycloak must allow the loopback redirect for the public client (see `docs/keycloak-setup.md`).
- The listener is a small attack surface, so it serves only `/callback`, checks `state` and the `Host`
  header, and closes after the first valid response.
