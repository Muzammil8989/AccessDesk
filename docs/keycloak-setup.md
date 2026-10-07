# Keycloak requirements

This is the setup guide for the first supported identity provider (`IDENTITY_PROVIDER=keycloak`, the
default). AccessDesk does not create or configure anything in Keycloak. Your realm needs the following.

**Issuer URL.** Set `IDENTITY_ISSUER_URL` (and the "Issuer URL" in the desktop setup wizard) to
`<server>/realms/<realm>`, for example `https://sso.example.com/realms/company`. The API derives the
Admin API address and the realm from it, and refuses to start if the URL does not end in
`/realms/<realm>`. Signing keys are found through the issuer's standard discovery document.

1. **A public client** (default id `accessdesk`): Client authentication **off**, Standard flow **on**,
   PKCE method **S256**. Valid redirect URI: `http://127.0.0.1/callback`. The desktop app picks a random
   free port, and Keycloak ignores the port for loopback addresses (RFC 8252 section 7.3). If your
   Keycloak version rejects the redirect, check the exact redirect URI it reports in the login error.
2. **An audience claim.** The API requires `aud` to contain the client ID. Add an _Audience_ mapper to
   the client's dedicated scope with "Included Client Audience" set to the client ID, and add it to the
   access token. Set `IDENTITY_AUDIENCE` if you use a different audience value.
3. **Realm roles** `super-admin` and `hr-admin`, assigned to the people who may use AccessDesk. The API
   refuses everyone else. To use other role names, set `AUTH_ADMIN_ROLES` (and `AUTH_ROLES_CLAIM_PATH` if
   the roles are not in `realm_access.roles`) in the `.env` file. The API and the desktop app both read
   them from there.
4. **Admin API permissions.** The API calls Keycloak with the logged-in admin's own token, so that admin
   needs the relevant `realm-management` client roles (for the Employees list: `view-users`). Without
   them the app shows Keycloak's "forbidden" answer.
5. **Token signing** with RS256, PS256 or ES256 (Keycloak's default is RS256).

## Why the admin's own token

Keycloak's admin events record who made a change. Forwarding the logged-in admin's token (instead of
using a shared service account) means those events name the real person.
