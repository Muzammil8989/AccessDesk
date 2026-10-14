-- The default template supplies the manual tasks of an onboarding checklist when the chosen
-- template (or none) has none (ADR 0011). Only the flag is added here: existing templates get
-- false and nothing else is touched. The seed creates the default template itself.
ALTER TABLE "onboarding_templates"
  ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;
