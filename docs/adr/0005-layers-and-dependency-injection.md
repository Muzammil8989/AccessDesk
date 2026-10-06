# 0005. API layers with dependency injection

Date: 2026-10-06. Status: accepted

## Context

Early routes built Keycloak clients and queried Prisma themselves. That mixed HTTP, business rules and
infrastructure, and made tests depend on the shape of Prisma and `fetch`.

## Decision

Each feature is a module with up to three layers: routes (HTTP only: validate, call, respond), a service
(use cases, depends on interfaces) and a repository or client (talks to the outside). Modules depend on
interfaces (`KeycloakClient`, `TemplateRepository`). `server.ts` is the composition root and the only
place that picks real implementations. Tests plug in fakes through the same `AppDeps`.

## Consequences

- Services and routes are tested without a database, a network or Prisma.
- A new storage or identity backend means a new implementation, not edits to the routes.
- A little more ceremony for small features. Keep a layer out when it would only forward calls.
