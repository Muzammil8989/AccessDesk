# 0006. Hiding features in the UI is a convenience, not security

Date: 2026-10-06. Status: accepted

## Context

Users without an AccessDesk role should not see screens they cannot use. But the renderer reads roles
from the token only to display them, and anything in a client can be changed by the person using it.

## Decision

`packages/shared/src/permissions.ts` states who may use which feature, and the desktop app uses it to
hide menu entries, guard screens and show a "no access" page. The API independently verifies the real
token and role on every request. It is the only authority.

## Consequences

- Users see a clean, role-appropriate app.
- If a feature is restricted to one role in `permissions.ts`, the matching API routes must enforce the
  same rule, or the restriction is cosmetic. This is stated next to the rule.
