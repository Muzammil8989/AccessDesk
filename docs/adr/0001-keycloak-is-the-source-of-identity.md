# 0001. Keycloak holds identity; our database holds only app data

Date: 2026-10-06. Status: accepted

## Context

AccessDesk manages employees who already exist in Keycloak (users, roles, groups, sessions, login
events). Copying that data into our own database would create a second source of truth that drifts, and
would put personal data in one more place.

## Decision

Keycloak is the only store of identity. Our PostgreSQL database holds only things Keycloak does not:
onboarding templates, checklists, scheduled actions, offboarding snapshots and our audit log. Employees
are referenced by their Keycloak user ID (`sub`). We never store names or emails.

## Consequences

- Names and emails are always current and never leak from our database.
- Listing employees needs a live Keycloak call, so the Employees screen depends on Keycloak being up.
- Offboarding snapshots store group paths and role names only, not personal data.
