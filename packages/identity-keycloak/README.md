# @accessdesk/identity-keycloak

The adapter for the first supported identity provider. It implements `IdentityProvider` from
`@accessdesk/identity`. **The only place in the repository that calls this provider's admin REST API.**

```ts
const identity = createKeycloakIdentityProvider({
  issuerUrl: 'https://sso.example.com/realms/company-platform',
  getToken: () => adminAccessToken, // the logged-in admin's own token
});
const users = await identity.listUsers({ search: 'ann', first: 0, max: 20 });
```

Operations: `listUsers`, `countUsers`, `findUsers` (exact username or email), `getUser`, `createUser`
(optionally with `emailVerified` and a temporary `initialPassword`), `disableUser`, `endAllSessions`,
`listGroups`, `getUserGroups`, `addUserToGroup`, `removeUserFromGroup`, `getUserRoles`,
`addUserRoles`, `removeUserRoles`. Failures throw `IdentityProviderError` (with the HTTP status, never
the token).

**What is specific to this provider, and only in `src/keycloak-api.ts`:**

- The admin API's base URL and realm are derived from the issuer URL, which must end in
  `/realms/<realm>` (an optional path prefix before `/realms` is kept). The factory throws at once, with
  a message that says what is wrong, when it does not.
- The admin API paths, and the raw JSON shapes of users, groups and roles.
- Roles are realm roles, and are looked up by name to get their IDs before assigning or removing them.
- Creation timestamps are epoch milliseconds, converted to a `Date` in `identity-provider.ts`.

```
src/keycloak-api.ts       raw admin API: paths, raw shapes, issuer parsing
src/identity-provider.ts  maps raw shapes to the neutral types (mapUser and friends)
test/unit/                keycloak-api.test.ts (exact calls on the wire), identity-provider.test.ts (mapping)
test/integration/         the shared IdentityProvider contract, against an in-memory fake of the admin API
test/helpers/             the fake admin API (a stateful fetch) and mock-fetch helpers
```

Consumed as TypeScript source, so there is no build step.

## Adding another identity provider

Create a sibling package `packages/identity-<name>` that implements `IdentityProvider`, with a test that
calls `runIdentityProviderContract` (see `test/integration/` here). Then add it in
`apps/api/src/infra/identity.ts`.
