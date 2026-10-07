# @accessdesk/identity

The provider-neutral contract for the system that holds identities, plus the access policy. Nothing
here names a particular provider ([ADR 0007](../../docs/adr/0007-identity-provider-interface.md),
[ADR 0009](../../docs/adr/0009-provider-neutral-naming.md)).

```
src/identity.ts         IdentityProvider, IdentityUser, IdentityGroup, IdentityRole, IdentityProviderError
src/access.ts           admin role names and the roles claim path: defaults, validation, reading roles from claims
src/testing/            runIdentityProviderContract: the test every IdentityProvider must pass
test/unit/              tests for the above
```

- **Vocabulary:** a user's ID is a `subjectId` (the OIDC `sub`), plus "role", "group" and "issuer".
- **Adapters** live in `packages/identity-<provider>` and implement `IdentityProvider`. Failures are
  `IdentityProviderError`, which carries an HTTP-style status.
- **Access policy:** `AUTH_ADMIN_ROLES` and `AUTH_ROLES_CLAIM_PATH` are validated by `loadAccessPolicy`.
  The API and the desktop app both use it, and both read tokens with `readRolesFromClaims`, so they
  cannot disagree about who is an admin.
- **Contract test:** import `runIdentityProviderContract` from `@accessdesk/identity/testing` (a separate
  entry point, because it imports Vitest) and run it against your adapter with a fake of the provider.

Consumed as TypeScript source, so there is no build step.
