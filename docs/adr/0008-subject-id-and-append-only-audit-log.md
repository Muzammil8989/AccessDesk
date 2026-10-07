# 0008. Subject IDs, and an append-only audit log

Date: 2026-10-07. Status: accepted. Builds on [0001](0001-keycloak-is-the-source-of-identity.md) and
[0007](0007-identity-provider-interface.md).

## Context

The schema named its employee references after Keycloak (`keycloak_user_id`), although the code no
longer assumes Keycloak ([0007](0007-identity-provider-interface.md)). Onboarding will start writing
checklists, snapshots and audit rows, so this is the cheapest moment to fix the names. The audit log
is also the record we point to when asked who did what, but nothing stopped a bug, or a careless
query, from changing or deleting its rows. And an audit row could not say whether the action worked.

## Decision

- **Neutral subject ID.** Employees and admins are referenced by their identity provider subject ID,
  the OIDC `sub` claim: `subjectId` / `subject_id`, and `targetSubjectId` / `target_subject_id` in the
  audit log. The migration uses `RENAME COLUMN` and `ALTER INDEX ... RENAME`, so no data is lost. The
  value is unchanged for Keycloak, where `sub` is the user ID.
- **Append-only audit log.** A `BEFORE UPDATE OR DELETE` trigger on `app_audit_log` raises an
  exception, in the same migration. A statement-level `BEFORE TRUNCATE` trigger does the same for
  `TRUNCATE`, which a row-level trigger never sees (a later migration). Corrections are made by
  adding a new row. Rows also record an `outcome` (`SUCCESS` or `FAILURE`, required) and the API's
  `requestId`, to tie them to the application log.
- **Richer snapshots.** `offboarding_snapshots` gain `client_roles` (client ID and role name only) and
  `was_enabled`.
- The new required columns had to be added to tables that could already hold rows, so existing rows
  get `SUCCESS` and `true` through a temporary default that the migration drops again. Nothing wrote
  to these tables before this change, so no real row is affected.

## Consequences

- Changing identity systems later does not need another schema change for references.
- The trigger is enforced by the database for every client, not only our code. A test
  (`apps/api/test/integration/database-migrations.test.ts`) applies the migrations to a scratch
  database and checks that UPDATE, DELETE and TRUNCATE fail and that the rows remain.
- **Known limit.** This is tamper-resistance, not tamper-proofing. The database owner (or a
  superuser) can still drop the triggers (`DROP TRIGGER`), disable them (`ALTER TABLE ... DISABLE
TRIGGER`) or bypass them for a session (`session_replication_role = replica`), and then change or
  remove rows. The application's database role should not own the tables, and an audit trail that
  must withstand an administrator needs more: for example copying rows to a separate write-once store.
- Trigger errors reach callers as a plain database error whose message says the table is append-only.
  The code is the default `raise_exception` on purpose, because Prisma turns `restrict_violation` into
  a misleading foreign key error.
- Retention is now a deliberate act (a migration or a privileged job), never a casual `DELETE`.
