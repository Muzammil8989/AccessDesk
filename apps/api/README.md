# @accessdesk/api

Fastify API. It verifies the admin's access token on every request, requires the realm role
`super-admin` or `hr-admin`, and calls Keycloak with that same token.

```
src/config/     environment parsing and validation (Zod)
src/infra/      real implementations: database client (Prisma + pg adapter), Keycloak client factory,
                job queue stub (pg-boss)
src/modules/    one folder per feature (employees, health, templates), each with its own layers
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
`GET /employees/:id`.

Each module has its own layers (routes, service, repository or client). `server.ts` is the only place
that chooses real implementations, and tests pass fakes through the same `AppDeps`. See
[ADR 0005](../../docs/adr/0005-layers-and-dependency-injection.md).
Environment variables are listed in [`.env.example`](../../.env.example).
