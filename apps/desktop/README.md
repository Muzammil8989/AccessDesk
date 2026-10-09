# @accessdesk/desktop

Electron + React desktop app (electron-vite, Tailwind, shadcn/ui-style components, React Hook Form,
Zod, TanStack Query, React Router). The look follows the
[design system](../../design-system/accessdesk/MASTER.md): light, dark or system theme, Inter bundled
locally.

```
src/main/       main process: OIDC login (auth/), token + settings stores (store/), API client,
                IPC handlers, window and security (CSP, navigation rules)
src/preload/    the minimal typed bridge exposed to the UI as window.accessdesk
src/renderer/   React UI: components/, pages/, hooks/, lib/
src/shared/     the IPC contract (types and channel names)
test/unit/main/ unit tests for the main process, mirroring src/main
test/unit/renderer/ React screens, with Testing Library
test/e2e/       run.mjs (scratch database) and smoke.mjs: mock identity provider + real API + real
                Electron app
```

Settings are an issuer URL, a client ID and the API URL, entered in the setup wizard. Who counts as an
admin (`AUTH_ADMIN_ROLES`), who may assign admin-level roles (`AUTH_SUPER_ADMIN_ROLE`) and where roles
are in the token (`AUTH_ROLES_CLAIM_PATH`) come from the same `.env` variables as the API, validated by
the same code, so the UI and the API agree.

The renderer is sandboxed and never sees a token. It asks the main process for data through the preload
bridge, and the main process adds the bearer token. The bridge has `api.get` for reads (six fixed paths
only) and, for writes, `api.onboarding.create`, `api.onboarding.retry`, `api.checklists.setItem` and
`api.checklists.setClosed`: the main process builds those paths itself from validated UUIDs and validates
the input. See [docs/security.md](../../docs/security.md).

Screens: Employees, Onboard (template, manager and start date, the result with its checklist),
`/onboard/checklists` (Open/Done list) and `/onboard/checklists/:subjectId`, plus Settings. Offboard,
Access Review and Audit Log are placeholders.

| Command (from the repo root)             | What it does                        |
| ---------------------------------------- | ----------------------------------- |
| `pnpm --filter @accessdesk/desktop dev`  | Run the app with hot reload         |
| `pnpm --filter @accessdesk/desktop test` | Run the unit tests                  |
| `pnpm test:e2e`                          | Build, then run the end-to-end test |

`test:e2e` rebuilds the API and the app, opens the app window briefly and writes screenshots to
`apps/desktop/test-results/`. With `TEST_DATABASE_URL` set it also runs the retry, template and checklist, and manager and start date
scenarios against a throwaway, seeded database (see the [development guide](../../docs/development.md)).
