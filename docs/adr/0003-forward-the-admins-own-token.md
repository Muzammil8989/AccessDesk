# 0003. Call Keycloak with the logged-in admin's own token

Date: 2026-10-06. Status: accepted

## Context

The API changes things in Keycloak on behalf of an admin. A shared service account would make every
change look like it came from "accessdesk" in Keycloak's admin events, and would give the API standing
power over the whole realm.

## Decision

The API verifies the admin's access token, then forwards that same token to the Keycloak Admin API.
There is no service account.

## Consequences

- Keycloak's admin events name the real person. The admin can only do what Keycloak lets them do.
- Each admin needs the relevant `realm-management` roles in Keycloak.
- Work that runs later (scheduled offboarding) has no live admin token to forward. This is an open
  question recorded in `apps/api/src/infra/jobs.ts`. It must be settled before scheduled actions are built.
