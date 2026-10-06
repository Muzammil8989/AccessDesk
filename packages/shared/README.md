# @accessdesk/shared

Zod schemas and TypeScript types used by both the desktop app and the API, so both sides validate the
same shapes.

```
src/employee.ts   employee view, list query, pagination limits
src/template.ts   onboarding template and items
src/settings.ts   local desktop settings (public values only)
src/error.ts      API error shape, the allowed admin roles
test/unit/        schema tests
```

Consumed as TypeScript source (`exports` points at `src/index.ts`), so there is no build step.
