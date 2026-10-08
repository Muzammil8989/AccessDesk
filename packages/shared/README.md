# @accessdesk/shared

Zod schemas and TypeScript types used by both the desktop app and the API, so both sides validate the
same shapes. The provider-neutral identity interface is in `@accessdesk/identity`, not here.

```
src/employee.ts   employee view, list query, pagination limits
src/template.ts   onboarding template and items
src/settings.ts   local desktop settings: issuer URL, client ID, API URL (public values only)
src/error.ts      API error shape
src/onboarding.ts   onboarding input, options and result schemas, and the assignable-role policy
src/permissions.ts  which features need an admin or the super-admin role (the role names are configuration)
test/unit/        schema tests
```

Consumed as TypeScript source (`exports` points at `src/index.ts`), so there is no build step.
