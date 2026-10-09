# 0011. Onboarding part 2: templates, checklists, manager and start date

Date: 2026-10-09. Status: accepted. Builds on [0003](0003-forward-the-admins-own-token.md),
[0006](0006-ui-visibility-is-not-authorization.md), [0008](0008-subject-id-and-append-only-audit-log.md)
and [0010](0010-onboarding-no-rollback-guarded-retry-one-time-password.md). Offboarding will be
recorded in 0012.

## Context

Part 1 of onboarding creates the user, adds them to one department group and assigns one role. HR
also wants a template that fills in the work for a kind of hire, a checklist of manual tasks for the
new employee, an optional manager and an optional start date. The tables for templates and checklists
exist, but a template stores its groups and roles in one free-text column (`target_ref`) and has no
department or default role. A template can name any role, including roles that give access to
AccessDesk itself, so applying templates is a way to raise someone's access.

## Decision

- **A template pre-fills the form and adds items.** The department and role on the form stay the source
  of truth and the admin can change them. Choosing a template fills them from the template's
  `department_ref` (a group path) and `default_role` (`member`, `manager` or `admin`), and adds more
  work. The API does not require the submitted department to match the template.
- **Item handling.** `GROUP_MEMBERSHIP` and `ROLE` items become extra steps after the three existing
  ones, run by `runSteps` with one object per step, and each step writes one audit row. A template group
  equal to the chosen department is skipped, so no step is duplicated. `MANUAL_TASK` items are never
  run: they are copied into the employee's checklist. New step names: `template_add_to_group`,
  `template_assign_role` and `create_checklist`. The step result carries an optional `label` (a group
  path or a role name, never personal data). Audit details are strings only. A password never appears in
  an audit row.
- **Failure and retry.** A failed template step gives `207`, and Retry skips what is done. There is no
  automatic rollback. The retry rule is unchanged: it needs a `SUCCESS` audit row for
  `onboarding.create_user` for that subject, by the same actor, in the last 24 hours. Retry repeats the
  template, the manager and the start date, and checks every safeguard again against the current actor
  and the current state of the identity provider. The one exception is the manager: it is checked again
  only while the checklist does not exist yet. Once the checklist exists the manager is already saved,
  and a manager whose account was disabled since then must not stop an admin from finishing the
  other steps.
- **Safeguards, enforced by the API when a template is applied.** One shared function decides them, so
  applying a template, the role chosen on the form (on create and on retry) and, later, saving a
  template cannot disagree. `owner` is never assigned. The super-admin role itself is never assigned
  through onboarding, from a template or from the form: it is promoted only in the identity provider.
  `admin` and every role in `AUTH_ADMIN_ROLES` are assigned only by an actor who holds the super-admin
  role. Names are compared without regard to case. These checks run before anything is created and
  answer `403`. A group or role that the template names but that does not exist in the identity provider
  makes that one step fail with a clear message, so the result is `207` and Retry works after someone
  creates it. This closes the route where an `hr-admin` applies the seeded HR template and creates
  another `hr-admin`. That template now needs a super-admin.
- **Checklists.** The `create_checklist` step creates one onboarding checklist per subject when the
  template has manual tasks, or a manager is given, or a start date is given. It works without a
  template. The table keeps `subject_id` only: no names and no emails. A unique constraint on
  `(subject_id, type)` makes the step safe to run again. Names, including the manager's, are looked up
  live from the identity provider (five at a time) and shown as "unknown" when the lookup fails.
- **Checklist status.** A checklist is **never created as done**. It is `open` until it is closed.
  With tasks it closes itself when the last task is ticked, and opens again if one is unticked. A
  checklist with no tasks (a manager or a start date only) stays in the Open list, with "No tasks", its
  manager and its start date, until someone closes it with
  `PATCH /checklists/:subjectId` and `{ "closed": true }` ("Mark as done" on the screen). It can be
  reopened the same way. This is refused with `409 checklist_has_tasks` for a checklist that has tasks,
  because those close themselves. Closing and reopening write an audit row
  (`checklist.close`, `checklist.reopen`) in the same transaction as the status change. A tick and a
  close lock the checklist row inside their transaction, so two admins acting at the same moment cannot
  leave a finished checklist marked open.
- **Ticking a task.** `PATCH /checklists/:subjectId/items/:itemId` takes the wanted state and is
  idempotent. The item update and its audit row (`checklist.item_done` or `checklist.item_undone`) are
  written in one database transaction, so a tick never exists without its audit row.
- **Manager.** Optional. The manager's `subjectId` is saved on the checklist. When onboarding is
  submitted, the API checks the person in the identity provider and refuses an unknown account with
  `400 unknown_manager` and a disabled one with `400 manager_disabled`, before anything is created. Any
  other failure of the identity provider is passed on as it is, not reported as an unknown manager. The
  name is looked up live and never saved. The desktop picks the manager with the Employees search; a
  person with a disabled account is listed but cannot be chosen.
- **Start date.** Optional and saved on the checklist. For version 1 it is information only. The
  account is created and enabled immediately. Nothing is scheduled, because a later job has no logged-in
  admin token (the open question in [0003](0003-forward-the-admins-own-token.md) stays open). It is saved as a plain
  calendar date (`YYYY-MM-DD`, a `DATE` column), so it never shifts with a time zone. The form, the
  result screen, the lists and the checklist all say in plain words that it is information only.
- **Existing template rows.** Two new migrations add the columns and the unique constraint, then move the
  department out of the items. The data migration is separate, so it can be run again, and it is
  narrow. It changes a template only when its `department_ref` is empty and it has exactly one
  `GROUP_MEMBERSHIP` item. For such a template it copies that item's `target_ref` into `department_ref`,
  sets `default_role` to `member` when it is empty, and deletes that item. Templates with no group item
  or with several are left unchanged with an empty `department_ref`, and the migration prints a notice
  that lists the ones it skipped. Where an order matters, items are ordered by `position`, then `id`. No other row is
  touched, and the seed writes the same shape.

## Consequences

- A template is a convenience with a hard safety net: the API, not the form, decides which roles a
  template may assign, and the same rule covers the form's own role field.
- Because the super-admin role is never assignable here, one person cannot create another super-admin
  through AccessDesk. Giving that role is a manual step in the identity provider.
- A template that was fine when it was saved is checked again every time it is applied.
- Known limits:
  - Template groups match top-level groups only, because the interface lists only those.
  - Template roles match realm roles only, not client roles.
  - `subjectId` is assumed to be a UUID, as in the API routes and the desktop path allowlist. That is
    true for the first supported provider.
  - A checklist is created after the template steps, so a partial result has no checklist until Retry
    finishes the work.
  - If the manager's account is disabled between a failed attempt and its Retry, and the checklist was
    not created yet, Retry is refused with `manager_disabled` until the manager is enabled again.
- The start date can mislead if read as "the account unlocks that day". The screens say it does not.
- A tick that cannot write its audit row is rolled back, and the admin sees an error and can try again.
