# Keycloak requirements

This is the setup guide for the first supported identity provider (`IDENTITY_PROVIDER=keycloak`, the
default). AccessDesk does not create or configure anything in Keycloak. Your realm needs the following.

**Issuer URL.** Set `IDENTITY_ISSUER_URL` (and the "Issuer URL" in the desktop setup wizard) to
`<server>/realms/<realm>`, for example `https://sso.example.com/realms/company`. The API derives the
Admin API address and the realm from it, and refuses to start if the URL does not end in
`/realms/<realm>`. Signing keys are found through the issuer's standard discovery document.

1. **A public client** (default id `accessdesk`): Client authentication **off**, Standard flow **on**,
   PKCE method **S256**. Valid redirect URI: `http://127.0.0.1/callback`. The desktop app picks a random
   free port, and Keycloak ignores the port for loopback addresses (RFC 8252 section 7.3). If your
   Keycloak version rejects the redirect, check the exact redirect URI it reports in the login error.
2. **An audience claim.** The API requires `aud` to contain the client ID. Add an _Audience_ mapper to
   the client's dedicated scope with "Included Client Audience" set to the client ID, and add it to the
   access token. Set `IDENTITY_AUDIENCE` if you use a different audience value.
3. **Realm roles** `super-admin` and `hr-admin`, assigned to the people who may use AccessDesk. The API
   refuses everyone else. To use other role names, set `AUTH_ADMIN_ROLES` (and `AUTH_ROLES_CLAIM_PATH` if
   the roles are not in `realm_access.roles`) in the `.env` file. The API and the desktop app both read
   them from there. Only the role named by `AUTH_SUPER_ADMIN_ROLE` (default `super-admin`) may give a
   new employee a privileged role during onboarding, and that role itself can never be given through
   onboarding (see "Who may be given which role" below).
4. **Admin API permissions.** The API calls Keycloak with the logged-in admin's own token, so that admin
   needs the relevant `realm-management` client roles:
   - `view-users`: the Employees list, the manager search, and the names shown on checklists (a user
     looked up by ID).
   - `manage-users`: onboarding (create the user, add them to a group, assign a role).
   - `query-groups`: list the groups (the departments, and the groups a template names).
   - `view-realm`: look up a realm role by name, and list the realm's roles (a template's roles are
     checked before they are assigned).

   Without them the app shows Keycloak's "forbidden" answer. These onboarding permissions have not yet
   been checked against a real Keycloak (see "Checks to run" below).

5. **For Onboarding: groups and realm roles.**
   - The Onboard screen lists the realm's groups as departments, so create one group per department.
   - Create the realm roles `member`, `manager` and `admin`: onboarding assigns one of them by name, and a
     missing role makes that step fail.
   - The temporary password must meet your realm's password policy (a rule such as "one special
     character" makes `create_user` fail, because the generated password has only letters and digits).
6. **For templates: the groups and roles they name must exist.** A template names a department (a
   group path such as `/Engineering`), extra groups and realm roles. The seeded templates use the
   groups `/Engineering`, `/Sales` and `/HR` and the realm roles `developer`, `sales` and `hr-admin`.
   - Only **top-level groups** and **realm roles** are matched. A nested group path or a client role is
     not found.
   - A name that does not exist makes that one step fail with a clear message, the result is `207`, and
     Retry finishes it after you create the group or role.
7. **Token signing** with RS256, PS256 or ES256 (Keycloak's default is RS256).

## Who may be given which role

One rule covers the role chosen on the form and every role a template names. The API enforces it before
it creates anything, and the screens only show it:

| Role                                                 | Who may give it through onboarding                      |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `member`, `manager`, other ordinary roles            | any admin                                               |
| `admin`, and every role in `AUTH_ADMIN_ROLES`        | only someone who holds the `AUTH_SUPER_ADMIN_ROLE` role |
| `owner`, and the `AUTH_SUPER_ADMIN_ROLE` role itself | nobody: give it in Keycloak                             |

Names are compared without regard to case. The seeded HR template assigns `hr-admin`, which is an admin
role, so only a super-admin can apply it.

## Start date and manager

- The manager is saved on the checklist by ID. Their name is looked up from Keycloak each time it is
  shown, and never stored. They must exist and be enabled when onboarding is submitted.
- The start date is **information only**. The account is created and **enabled immediately**. Nothing in
  Keycloak is scheduled, so the account does not unlock on that date.

## Checks to run on a real Keycloak

AccessDesk has been tested against fakes and a mock identity provider only. These are the checks that
have not been run against a real Keycloak. Use a test user and a throwaway group, and delete them after.

**Onboarding (part 1)**

1. **Retry runs only the missing step.** Delete a realm role that nobody uses (`member`, `manager` or
   `admin`). Onboard a user with that role: `create_user` and `add_to_group` are done and `assign_role`
   fails. Recreate the role and click Retry: only `assign_role` runs. In the audit log (`select created_at,
action, outcome from app_audit_log order by created_at desc limit 10;`) Retry adds exactly one row.
2. **Admin events carry the signed-in admin.** Turn on Realm settings, Events, Admin events, "Save events".
   Onboard a user, then open the `CREATE` event: the user ID is the signed-in admin's own, and the client
   is `accessdesk`.
3. **Admin role.** As `hr-admin` only, the `admin` option is disabled with "Only a super-admin can assign
   the admin role". As `super-admin` it can be used.
4. **Duplicate username.** Onboarding the same username again shows "Username already exists" on the
   Username field and creates nothing.
5. **Temporary password.** The new user has a temporary credential and the "Update Password" required
   action, and must set a new password at first sign-in.

**Onboarding (part 2)**

6. **Template.** Onboard with the Developer template: the user gets `/Engineering` and the `developer` role
   (both must exist).
7. **Missing role.** Use a template that names a missing role: that step fails with the clear message and
   Retry works after you create the role.
8. **Privileged template.** As `hr-admin`, the HR template (or any template with `admin`) is disabled and
   the API refuses it. As `super-admin` it works.
9. **Checklist.** Tick and untick a task, and see the audit row. A checklist with a manager and a start date
   and no tasks stays in the Open list until you mark it as done.
10. **Manager.** The manager's name shows on the checklist, the start-date text says the account is not
    delayed, and a disabled manager cannot be chosen.

## Why the admin's own token

Keycloak's admin events record who made a change. Forwarding the logged-in admin's own token (instead of
using a shared service account) means those events name the real person.
