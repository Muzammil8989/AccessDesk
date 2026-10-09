# @accessdesk/api

Fastify API. It verifies the admin's access token on every request (signing keys found through OIDC
discovery), requires one of the configured admin roles (default `super-admin` or `hr-admin`, read from
`realm_access.roles`), and calls the identity provider with that same token. Modules depend only on the
`IdentityProvider` interface from `@accessdesk/identity`; `server.ts` picks the adapter named by
`IDENTITY_PROVIDER` ([ADR 0007](../../docs/adr/0007-identity-provider-interface.md),
[ADR 0009](../../docs/adr/0009-provider-neutral-naming.md)).

```
src/config/     environment parsing and validation (Zod)
src/infra/      real implementations: database client (Prisma + pg adapter), the `IdentityProviderFactory` type and the adapter choice,
                job queue stub (pg-boss)
src/modules/    one folder per feature (audit, checklists, employees, health, onboarding, templates), each with its own layers
src/plugins/    auth (JWT + role guard) and the error handler
prisma/         schema.prisma, migrations, seed
test/           unit/, integration/ (HTTP tests with app.inject()), helpers/
```

| Command (from the repo root)               | What it does                            |
| ------------------------------------------ | --------------------------------------- |
| `pnpm --filter @accessdesk/api dev`        | Run with auto-reload                    |
| `pnpm --filter @accessdesk/api test`       | Run the tests                           |
| `pnpm --filter @accessdesk/api db:migrate` | Create and apply a migration (dev)      |
| `pnpm --filter @accessdesk/api db:deploy`  | Apply existing migrations               |
| `pnpm --filter @accessdesk/api db:seed`    | Seed the Developer, Sales, HR templates |

Routes: `GET /health` and `GET /ready` (public probes), `GET /templates`, `GET /employees`,
`GET /employees/:id`, the onboarding routes `GET /onboarding/options`, `POST /onboarding` and
`POST /onboarding/:subjectId/retry` ([ADR 0010](../../docs/adr/0010-onboarding-no-rollback-guarded-retry-one-time-password.md),
[ADR 0011](../../docs/adr/0011-onboarding-part-2-templates-checklists-manager-start-date.md)), and the
checklist routes `GET /checklists`, `GET /checklists/:subjectId`,
`PATCH /checklists/:subjectId/items/:itemId` (tick a task) and `PATCH /checklists/:subjectId` (close or
reopen one that has no tasks). The onboarding routes are limited to 20 requests a minute per IP, and
both groups are sent with `Cache-Control: no-store`. `POST /onboarding` answers `201`, or `207` when a
step after creating the user failed. One shared rule decides which roles onboarding may assign: `owner`
and the `AUTH_SUPER_ADMIN_ROLE` role never, `admin` and the `AUTH_ADMIN_ROLES` roles only for a super-admin.

After pulling a change that adds a migration, run `pnpm --filter @accessdesk/api db:deploy`. Until you do,
the new screens fail with "Internal server error".

Each module has its own layers (routes, service, repository or client). `server.ts` is the only place
that chooses real implementations, and tests pass fakes through the same `AppDeps`. See
[ADR 0005](../../docs/adr/0005-layers-and-dependency-injection.md).
Environment variables are listed in [`.env.example`](../../.env.example).
