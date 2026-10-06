# @accessdesk/keycloak-client

**The only place in the repository that calls the Keycloak Admin REST API.** Everything else uses the
typed `KeycloakClient` interface.

```ts
const keycloak = createKeycloakClient({
  baseUrl: 'https://sso.example.com',
  realm: 'company-platform',
  getToken: () => adminAccessToken, // the logged-in admin's own token
});
const users = await keycloak.listUsers({ search: 'ann', first: 0, max: 20 });
```

Functions: `listUsers`, `countUsers`, `getUser`, `createUser`, `disableUser`, `logoutAllSessions`,
`getUserGroups`, `addUserToGroup`, `removeUserFromGroup`, `getUserRealmRoles`, `addUserRealmRoles`,
`removeUserRealmRoles`. Failures throw `KeycloakError` (with the HTTP status, never the token).

```
src/types.ts    Zod schemas for Keycloak representations, and the KeycloakClient interface
src/client.ts   the implementation (fetch is injectable)
test/unit/      tests against a mocked fetch
```

Consumed as TypeScript source, so there is no build step.
