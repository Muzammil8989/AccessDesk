-- Narrow data clean-up (ADR 0011). A template whose department is still stored as its one
-- GROUP_MEMBERSHIP item now keeps it in department_ref, so applying the template does not add the
-- department group a second time.
--
-- It changes a template only when department_ref is empty and the template has exactly one
-- GROUP_MEMBERSHIP item with a target. Every other template (no group item, several, or an item
-- without a target) is left exactly as it is. Items are ordered by position, then id.
WITH single_group AS (
  SELECT
    ti.template_id,
    (array_agg(ti.id ORDER BY ti.position, ti.id))[1] AS item_id,
    (array_agg(ti.target_ref ORDER BY ti.position, ti.id))[1] AS target_ref
  FROM "template_items" ti
  JOIN "onboarding_templates" t ON t.id = ti.template_id
  WHERE ti.kind = 'GROUP_MEMBERSHIP'
    AND (t.department_ref IS NULL OR t.department_ref = '')
  GROUP BY ti.template_id
  HAVING count(*) = 1
    AND (array_agg(ti.target_ref ORDER BY ti.position, ti.id))[1] IS NOT NULL
    AND (array_agg(ti.target_ref ORDER BY ti.position, ti.id))[1] <> ''
),
moved AS (
  UPDATE "onboarding_templates" t
  SET department_ref = s.target_ref,
      default_role = COALESCE(NULLIF(t.default_role, ''), 'member'),
      updated_at = now()
  FROM single_group s
  WHERE t.id = s.template_id
  RETURNING t.id
)
DELETE FROM "template_items"
WHERE id IN (SELECT item_id FROM single_group)
  AND template_id IN (SELECT id FROM moved);

-- Say which templates were not converted, so they can be fixed by hand.
DO $$
DECLARE
  skipped text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name) INTO skipped
  FROM "onboarding_templates"
  WHERE department_ref IS NULL OR department_ref = '';
  IF skipped IS NOT NULL THEN
    RAISE NOTICE 'Templates left unchanged with an empty department_ref: %', skipped;
  END IF;
END $$;
