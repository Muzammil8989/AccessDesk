-- Neutral subject IDs, richer audit and snapshot rows, and an append-only audit log.
-- Written by hand: Prisma would turn the renames into DROP + ADD and lose the data.

-- 1. Employees are referenced by their identity provider subject ID (OIDC `sub`), not a
--    Keycloak-specific field. Renames keep every existing value.
ALTER TABLE "employee_checklists" RENAME COLUMN "keycloak_user_id" TO "subject_id";
ALTER INDEX "employee_checklists_keycloak_user_id_idx" RENAME TO "employee_checklists_subject_id_idx";

ALTER TABLE "scheduled_actions" RENAME COLUMN "keycloak_user_id" TO "subject_id";
ALTER INDEX "scheduled_actions_keycloak_user_id_idx" RENAME TO "scheduled_actions_subject_id_idx";

ALTER TABLE "offboarding_snapshots" RENAME COLUMN "keycloak_user_id" TO "subject_id";
ALTER INDEX "offboarding_snapshots_keycloak_user_id_idx" RENAME TO "offboarding_snapshots_subject_id_idx";

ALTER TABLE "app_audit_log" RENAME COLUMN "target_keycloak_user_id" TO "target_subject_id";
ALTER INDEX "app_audit_log_target_keycloak_user_id_idx" RENAME TO "app_audit_log_target_subject_id_idx";

-- 2. Audit rows record whether the action worked, and which API request caused it.
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- The new column is required, so existing rows need a value. Nothing has written to this table
-- before this migration, so the temporary default only keeps the statement valid on a non-empty
-- table. It is dropped right away: new rows must say their outcome.
ALTER TABLE "app_audit_log" ADD COLUMN "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "app_audit_log" ALTER COLUMN "outcome" DROP DEFAULT;
ALTER TABLE "app_audit_log" ADD COLUMN "request_id" TEXT;

-- 3. Offboarding snapshots also keep client roles (client ID and role name only) and whether the
--    account was still enabled. Same temporary-default pattern as above for existing rows.
ALTER TABLE "offboarding_snapshots" ADD COLUMN "client_roles" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "offboarding_snapshots" ADD COLUMN "was_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "offboarding_snapshots" ALTER COLUMN "was_enabled" DROP DEFAULT;

-- 4. The audit log is append-only. This runs after the column changes above, which need to
--    touch existing rows.
CREATE FUNCTION "app_audit_log_reject_change"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- The default error code (P0001) is deliberate: Prisma maps restrict_violation (23001) to a
  -- foreign key error and drops this message.
  RAISE EXCEPTION 'app_audit_log is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "app_audit_log_append_only"
BEFORE UPDATE OR DELETE ON "app_audit_log"
FOR EACH ROW EXECUTE FUNCTION "app_audit_log_reject_change"();
