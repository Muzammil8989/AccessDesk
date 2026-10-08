# @accessdesk/desktop

Electron + React desktop app (electron-vite, Tailwind, shadcn/ui-style components, React Hook Form,
Zod, TanStack Query, React Router).

```
src/main/       main process: OIDC login (auth/), token + settings stores (store/), API client,
                IPC handlers, window and security (CSP, navigation rules)
src/preload/    the minimal typed bridge exposed to the UI as window.accessdesk
src/renderer/   React UI: components/, pages/, hooks/, lib/
src/shared/     the IPC contract (types and channel names)
test/unit/main/ unit tests for the main process, mirroring src/main
test/e2e/       smoke.mjs: mock identity provider + real API + real Electron app
```

Settings are an issuer URL, a client ID and the API URL, entered in the setup wizard. Who counts as an
admin (`AUTH_ADMIN_ROLES`) and where roles are in the token (`AUTH_ROLES_CLAIM_PATH`) come from the
same `.env` variables as the API, validated by the same code, so the UI and the API agree.

The renderer is sandboxed and never sees a token. It asks the main process for data through the preload
bridge, and the main process adds the bearer token. The bridge has `api.get` for reads and, for writes,
only `api.onboarding.create` and `api.onboarding.retry`: the main process builds those two paths itself
and validates the input. See [docs/security.md](../../docs/security.md).

| Command (from the repo root)             | What it does                              |
| ---------------------------------------- | ----------------------------------------- |
| `pnpm --filter @accessdesk/desktop dev`  | Run the app with hot reload               |
| `pnpm --filter @accessdesk/desktop test` | Run the unit tests                        |
| `pnpm test:e2e`                          | Build, then run the end-to-end smoke test |

`test:e2e` opens the app window briefly and writes screenshots to `apps/desktop/test-results/`.
