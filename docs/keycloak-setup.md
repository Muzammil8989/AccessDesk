# Keycloak requirements

AccessDesk does not create or configure anything in Keycloak. Your realm needs the following.

1. **A public client** (default id `accessdesk`): Client authentication **off**, Standard flow **on**,
   PKCE method **S256**. Valid redirect URI: `http://127.0.0.1/callback`. The desktop app picks a random
   free port, and Keycloak ignores the port for loopback addresses (RFC 8252 section 7.3). If your
   Keycloak version rejects the redirect, check the exact redirect URI it reports in the login error.
2. **An audience claim.** The API requires `aud` to contain the client ID. Add an _Audience_ mapper to
   the client's dedicated scope with "Included Client Audience" set to the client ID, and add it to the
   access token. Set `KEYCLOAK_AUDIENCE` if you use a different audience value.
3. **Realm roles** `super-admin` and `hr-admin`, assigned to the people who may use AccessDesk. The API
   refuses everyone else.
4. **Admin API permissions.** The API calls Keycloak with the logged-in admin's own token, so that admin
   needs the relevant `realm-management` client roles (for the Employees list: `view-users`). Without
   them the app shows Keycloak's "forbidden" answer.
5. **Token signing** with RS256, PS256 or ES256 (Keycloak's default is RS256).

## Why the admin's own token

Keycloak's admin events record who made a change. Forwarding the logged-in admin's token (instead of
using a shared service account) means those events name the real person.
