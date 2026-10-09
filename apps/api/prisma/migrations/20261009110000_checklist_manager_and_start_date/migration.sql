-- The manager is saved as a subject ID only; the name is looked up live. The start date is
-- information only: the account is created and enabled at once (ADR 0011).
ALTER TABLE "employee_checklists"
  ADD COLUMN "manager_subject_id" TEXT,
  ADD COLUMN "start_date" DATE;
