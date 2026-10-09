-- A template names the department group it pre-fills (a group path such as /Engineering) and the
-- role it pre-fills (member, manager or admin). Both are checked by the API, not by the database.
ALTER TABLE "onboarding_templates"
  ADD COLUMN "department_ref" TEXT,
  ADD COLUMN "default_role" TEXT;

-- One checklist per subject and type, so creating the onboarding checklist is safe to run again.
CREATE UNIQUE INDEX "employee_checklists_subject_id_type_key"
  ON "employee_checklists"("subject_id", "type");
