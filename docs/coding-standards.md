# Coding standards, design patterns and system design

This guide says how code in AccessDesk is written and why. It describes what the repo already does, so
every example is real code you can open. For commands, layout and testing see
[development.md](development.md). For the reasoning behind single decisions see [adr/](adr/README.md).

Contents

1. [How rules are enforced](#1-how-rules-are-enforced)
2. [System design](#2-system-design)
3. [SOLID, explained with this codebase](#3-solid-explained-with-this-codebase)
4. [Design patterns we use](#4-design-patterns-we-use)
5. [Coding style](#5-coding-style)
6. [Error handling](#6-error-handling)
7. [Security rules that shape the code](#7-security-rules-that-shape-the-code)
8. [Testing style](#8-testing-style)
9. [Other principles: KISS, YAGNI, DRY](#9-other-principles-kiss-yagni-dry)
10. [Pull request checklist](#10-pull-request-checklist)

---

## 1. How rules are enforced

A rule that depends on people remembering it will be broken. Where possible the tools enforce it, and
`pnpm check` (also run by CI) runs all of them.

| Rule                                                              | Enforced by                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Formatting: 2 spaces, single quotes, semicolons, width 100, LF    | Prettier ([.prettierrc](../.prettierrc)), `.editorconfig`         |
| `strict` types, indexed access can be `undefined`, `override`     | [tsconfig.base.json](../tsconfig.base.json)                       |
| No forgotten `await`, no unsafe `any` flows                       | typescript-eslint, type-checked rules                             |
| `import type` for type-only imports                               | `consistent-type-imports`                                         |
| Every `switch` over a union handles every case                    | `switch-exhaustiveness-check`                                     |
| `===` only, `const` by default, no `var`                          | `eqeqeq`, `prefer-const`, `no-var`                                |
| No `console.log` in production code (use the logger)              | `no-console` (`warn` and `error` allowed)                         |
| Layers do not import each other the wrong way                     | `no-restricted-imports` ([eslint.config.js](../eslint.config.js)) |
| Identity provider admin URLs appear only in `packages/identity-*` | `no-restricted-syntax`                                            |
| Only `server.ts` and `infra/identity.ts` import an adapter        | `no-restricted-imports` (pattern `@accessdesk/identity-*`)        |
| The vendor name appears only where the allowlist says             | `scripts/check-naming.mjs`, `scripts/naming-allowlist.json`       |
| Accessible JSX, hooks rules                                       | `eslint-plugin-jsx-a11y`, `eslint-plugin-react-hooks`             |
| Lint and format on commit, typecheck and tests on push            | Husky + lint-staged                                               |

If you want to add a rule, prefer a lint rule over a paragraph in this file.

---

## 2. System design

### 2.1 The big picture

AccessDesk is a desktop app for HR and admins to onboard and offboard employees. **The identity
provider is the source of identity** (ADR 0001): people, roles and groups live there. Our PostgreSQL
database holds only app data such as templates. The API talks to it only through the provider-neutral
`IdentityProvider` interface (ADR 0007).

```
┌─────────────────────────── Desktop app (Electron) ───────────────────────────┐
│                                                                              │
│  Renderer (React)        Preload                 Main process                │
│  untrusted UI     ──►    typed bridge     ──►    auth, token store, API      │
│  no Node, no tokens      window.accessdesk       client, settings, security  │
│                                                                              │
└────────────────────────────────────────┬─────────────────────────────────────┘
                                         │ HTTPS, Authorization: Bearer <admin token>
                                         ▼
                     ┌───────────────────────────────────────┐
                     │ API (Fastify)                         │
                     │ routes → service → repository/provider│
                     └───────────┬───────────────┬───────────┘
                                 │               │
                                 ▼               ▼
                     packages/identity-keycloak  PostgreSQL (Prisma)
                     (ALL admin API calls)       templates, app data
                                 │
                                 ▼
                         Identity provider

   packages/identity: the neutral IdentityProvider interface and the access policy
   packages/shared: Zod schemas, types, role permissions (used by app and API)
```

### 2.2 Trust boundaries

Most design decisions follow from one question: _who do we trust at this point?_

| Boundary                | We trust              | Rule                                                                                                                    |
| ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Renderer → main process | Nothing from the UI   | Only the typed IPC contract ([ipc.ts](../apps/desktop/src/shared/ipc.ts)); the renderer never sees a token              |
| Desktop → API           | The signed JWT        | The API verifies issuer, audience and signature on every request                                                        |
| API → identity provider | The admin's own token | We forward it ([ADR 0003](adr/0003-forward-the-admins-own-token.md)), so the provider's audit log names the real person |
| Anything → our code     | Nothing               | Validate with Zod at the boundary, including API responses in the UI                                                    |

### 2.3 Monorepo and dependency direction

```
apps/desktop ──► packages/shared, packages/identity
apps/api     ──► packages/shared, packages/identity
apps/api     ──► packages/identity-keycloak (only server.ts and infra/identity.ts)
packages/identity-keycloak ──► packages/identity
packages/*   ──► (never apps/*)
apps/api     ──► (never apps/desktop)
```

Dependencies point one way. Shared code goes **down** into `packages/`; apps never import each other.
This is checked by lint, not by good intentions.

### 2.4 Request flow (example: list employees)

1. Renderer calls `window.accessdesk.api.get('/employees', { search })`.
2. Main validates the path (`apiPathSchema`), attaches a fresh access token, calls the API, retries once
   on `401` with a refreshed token.
3. API route validates the query with `listEmployeesQuerySchema`, builds a service for this request with
   the caller's token.
4. The service asks the `IdentityProvider` interface for users and a count, and maps them with
   `toEmployee`.
5. Errors go to one error handler, which turns them into short, safe messages.
6. The renderer parses the response with the shared schema before using it.

Every step has exactly one job. That is the single-responsibility principle, which is the next section.

---

## 3. SOLID, explained with this codebase

SOLID is five habits that keep code easy to change. Each one below has a plain explanation, an example
from this repo, and what breaking it would look like.

### S: Single Responsibility Principle

> A module should have one reason to change.

If a file mixes HTTP, business rules and database access, a change to any of the three risks breaking the
other two. So each kind of file has one job:

| Kind                | Job                                | Example                                                                                                  |
| ------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Route               | HTTP only: validate, call, respond | [employees.routes.ts](../apps/api/src/modules/employees/employees.routes.ts)                             |
| Service             | The use case and its rules         | [employees.service.ts](../apps/api/src/modules/employees/employees.service.ts)                           |
| Repository / client | Talk to the outside world          | [prisma-templates.repository.ts](../apps/api/src/modules/templates/prisma-templates.repository.ts)       |
| Mapper              | Convert one shape to another       | [employees.mapper.ts](../apps/api/src/modules/employees/employees.mapper.ts)                             |
| Plugin              | A cross-cutting concern            | [error-handler.ts](../apps/api/src/plugins/error-handler.ts), [auth.ts](../apps/api/src/plugins/auth.ts) |

The route reads like a sentence and contains no rules:

```ts
app.get('/employees/:id', async (request): Promise<Employee> => {
  const { id } = employeeIdParamsSchema.parse(request.params); // validate
  return serviceFor(request).get(id); //                         delegate
});
```

**Breaking it:** a route that builds an identity provider URL, calls `fetch`, filters the result and formats the
JSON. Testing a filtering rule would then need a fake HTTP server. This is what
[ADR 0005](adr/0005-layers-and-dependency-injection.md) fixed.

### O: Open/Closed Principle

> Open for extension, closed for modification: add behaviour by adding code, not by editing working code.

- **Add a feature:** create a new folder under `modules/<feature>/` and register it in `app.ts`. The
  existing modules are untouched.
- **Add a storage backend:** write another class that implements `TemplateRepository`. No route changes.
- **Add an error type:** the error handler is a list of cases and a lookup table (`CLIENT_ERROR_CODES`).
  Extending the table does not rewrite the logic.
- **Add a permission feature:** add it to `FEATURES`. Because `FEATURE_ACCESS` is typed
  `Record<Feature, ...>`, the compiler fails until you also say who may use it, so you cannot forget.

Use types so that "forgetting to extend" is a compile error, not a production bug. That is why a
`switch` over a union must be exhaustive (`switch-exhaustiveness-check`).

**Breaking it:** an `if (kind === 'a') ... else if (kind === 'b')` chain that every new case must edit.

### L: Liskov Substitution Principle

> Anything that implements an interface must be usable wherever the interface is expected, without
> surprises.

`TokenStorage` has two implementations: the real encrypted `TokenStore` and an in-memory fake used in
tests ([memory-token-storage.ts](../apps/desktop/test/unit/main/helpers/memory-token-storage.ts)).
`AuthService` works identically with both. That is only true because both honour the same contract:

- `load()` returns `null` when there is no session, it does not throw.
- `save()` then `load()` returns what was saved.
- `clear()` always leaves `load()` returning `null`.

A fake that behaves differently from the real thing (say, one that throws where the real one returns
`null`) makes tests pass for the wrong reason. **Rule: a fake must follow the same contract as the real
implementation, including the edge cases.** The same applies to `TemplateRepository` and `IdentityProvider`; the shared contract test
(`runIdentityProviderContract`) checks it for every identity adapter.

**Breaking it:** a subclass or implementation that throws "not supported", returns a different shape, or
needs the caller to know which implementation it got.

### I: Interface Segregation Principle

> Do not force a consumer to depend on things it does not use.

Ask for the smallest thing that does the job:

```ts
// apiClient.ts: needs two methods, so it asks for two, not the whole AuthService
auth: Pick<AuthService, 'getAccessToken' | 'forceRefresh'>;

// authService.ts: needs storage, so it depends on the interface, not the file-based class
tokenStore: TokenStorage;

// employeeRoutes: needs a way to get an identity provider, not the app's whole config
export interface EmployeeRouteDeps {
  identityFor: IdentityProviderFactory;
}
```

Small interfaces make fakes tiny (a test fake for `Pick<AuthService, ...>` is two functions) and make it
obvious what a unit really needs.

**Breaking it:** passing the entire `Config` or `AppDeps` into a function that reads one field.

### D: Dependency Inversion Principle

> High-level code (business rules) should depend on abstractions, not on low-level details (Prisma,
> `fetch`, the file system). Details depend on the abstraction.

```
EmployeesService ──► IdentityProvider (interface) ◄── createKeycloakIdentityProvider (real, HTTP)
                                                  ◄── fake in tests
```

How it is wired:

1. `app.ts` declares what it needs as an interface, [`AppDeps`](../apps/api/src/app.ts).
2. [`server.ts`](../apps/api/src/server.ts) is the **composition root**: the one place that creates
   `PrismaTemplateRepository`, the identity provider factory (`createIdentityProviderFactory`) and so
   on, and passes them in.
3. Tests call `buildApp` with fakes. No database, no network, no Electron needed.

Related rule: **only the composition root uses `new` on infrastructure.** Services receive their
collaborators; they do not construct them. Time is a dependency too: `AuthService` takes `now?: () => number`
and `fetch?` so tests control the clock and the network.

**Breaking it:** a service that does `import { PrismaClient }` and queries directly. Tests now need a
database, and swapping storage means editing business rules.

---

## 4. Design patterns we use

A pattern is a named, reusable solution. We use a pattern when it solves a problem we have, not to look
sophisticated. Each entry says what problem it solves and where you can see it.

| Pattern                                 | Problem it solves                                         | Where                                                                            |
| --------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Dependency injection + composition root | Keep logic independent of infrastructure, make tests easy | [server.ts](../apps/api/src/server.ts), `AppDeps`                                |
| Layered architecture                    | Separate HTTP, rules and I/O                              | `routes → service → repository/client`                                           |
| Repository                              | Hide how data is stored behind a domain-shaped interface  | `TemplateRepository` and `PrismaTemplateRepository`                              |
| Factory                                 | Build an object that needs per-request data               | `IdentityProviderFactory`: a provider per admin token                            |
| Facade                                  | One simple entry point over a messy API                   | `packages/identity-keycloak` hides every admin REST detail                       |
| Adapter / Mapper                        | Convert between two shapes                                | `packages/identity-keycloak` (raw responses to `IdentityProvider`), `toEmployee` |
| Strategy                                | Swap behaviour behind one interface                       | `TokenStorage` (encrypted file vs memory), `SecretCipher`                        |
| Bridge / Proxy (IPC)                    | Let an untrusted caller use a privileged one safely       | preload `window.accessdesk` and the `AccessDeskApi` contract                     |
| Single-flight (promise sharing)         | Many callers need the same slow operation, do it once     | `AuthService.refresh()` shares one in-flight token refresh                       |
| Guard                                   | Block access before the protected code runs               | `requireAuth` (API), `RequireFeature` (UI)                                       |
| Schema as contract                      | One definition of a shape, used for types and validation  | Zod schemas in `packages/shared`                                                 |
| Discriminated union (result type)       | Make success and failure explicit in the type             | `LoginResult`, `ApiResponse`: `{ ok: true, ... } \| { ok: false, ... }`          |
| Plugin                                  | Add cross-cutting behaviour without touching features     | Fastify plugins: auth, error handler, helmet, rate limit                         |

### 4.1 Worked examples

**Repository.** Callers ask for what they mean, not how it is stored.

```ts
export interface TemplateRepository {
  /** All templates, by name, each with its items in order. */
  listWithItems(): Promise<Template[]>;
  findById(id: string): Promise<Template | null>;
}
```

The route never sees Prisma. A different database would be a new class implementing this interface.

**Factory.** The identity provider needs the _calling admin's_ token, which differs per request, so a plain
singleton does not work. We inject a factory:

```ts
export type IdentityProviderFactory = (adminAccessToken: string) => IdentityProvider;
```

**Single-flight.** Refresh tokens may be single use. If five requests find an expired token at once and
each refreshes, four will fail. So they share one promise:

```ts
private refresh(): Promise<TokenSet | null> {
  this.refreshInFlight ??= this.doRefresh().finally(() => {
    this.refreshInFlight = null;
  });
  return this.refreshInFlight;
}
```

**Result type instead of exceptions across a boundary.** IPC cannot send an `Error` safely, and the UI
should handle failure as a normal case:

```ts
export type ApiResponse =
  { ok: true; status: number; data: unknown } | { ok: false; status: number; message: string };
```

TypeScript then forces the caller to check `ok` before touching `data`.

### 4.2 When _not_ to use a pattern

- A layer that only forwards calls is left out ([ADR 0005](adr/0005-layers-and-dependency-injection.md)).
  The templates module has no service because there is no rule to put in one yet.
- Do not add an interface with one implementation and no test fake. An interface earns its place at a
  boundary (I/O, time, randomness) or when a second implementation really exists.
- Do not add a factory, builder or event bus "for later". Add it the day a second use appears.

---

## 5. Coding style

### 5.1 Formatting

Do not argue about formatting: run `pnpm format`. The settings are: 2 spaces, single quotes, semicolons,
trailing commas everywhere, 100 columns, LF line endings, final newline.

### 5.2 Naming

| Thing                                        | Convention                                                  | Example                                   |
| -------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Variables, functions                         | `camelCase`, verbs for functions                            | `loadConfig`, `getAccessToken`            |
| Types, interfaces, classes, React components | `PascalCase`                                                | `AuthService`, `EmployeeList`             |
| Constants that never change                  | `UPPER_SNAKE_CASE`                                          | `DEFAULT_ADMIN_ROLES`, `EXPIRY_MARGIN_MS` |
| Booleans                                     | read as a question                                          | `enabled`, `persistent`, `isAvailable()`  |
| Zod schemas                                  | `<thing>Schema`, with `type Thing = z.infer<...>` beside it | `employeeSchema` and `Employee`           |
| Interfaces for injected deps                 | `<Thing>Deps`                                               | `AppDeps`, `ApiClientDeps`                |
| Units in names                               | include the unit                                            | `EXPIRY_MARGIN_MS`, `rateLimitPerMinute`  |
| Unused parameters                            | prefix `_`                                                  | `(_request, reply) => ...`                |

File names follow the area they live in:

- **API**: `<module>.<layer>.ts`, for example `employees.service.ts`, `templates.routes.ts`.
- **Desktop renderer**: `kebab-case`, for example `employees-page.tsx`, `require-feature.tsx`.
- **Desktop main and preload**: `camelCase` where a file exports one thing, for example `apiClient.ts`,
  `tokenStore.ts`.
- **Tests**: `<thing>.test.ts` or `.test.tsx`, mirroring the path of the code under test.

When adding a file, copy the style of its neighbours. Do not rename existing files just to unify these.

**Provider-neutral naming.** Outside the adapter, name things after the concept, not the vendor:
"identity provider", "issuer", `subjectId`, "role", "group". The vendor name may appear only where
`scripts/naming-allowlist.json` allows it (the adapter package, setup docs, ADRs). `pnpm check` runs
`scripts/check-naming.mjs` and fails on any other use (ADR 0009).

### 5.3 TypeScript

- **Strict mode stays on.** `noUncheckedIndexedAccess` means `array[0]` may be `undefined`: handle it.
- **No `any`.** Use `unknown` and narrow it, usually with a Zod schema:
  `const body: unknown = await response.json().catch(() => null);`
- **Derive types from schemas** (`z.infer`) so the type and the validation can never drift.
- **Prefer `interface` for object contracts that are implemented or injected, `type` for unions and
  aliases.**
- **Use `as const` for fixed lists** and derive a union from them, as `FEATURES` does.
- **Use `import type`** for type-only imports (`verbatimModuleSyntax` and lint require it).
- **Named exports** in `src/`. Default exports are only for config files that tools require.
- **Explicit return types on exported functions** that form a contract (route handlers, services,
  mappers). Let inference work for small local helpers.
- **Narrow, do not cast.** `as` is a promise to the compiler that you cannot prove. If you must use it,
  make the reason it is safe obvious from the surrounding code, or explain it in the pull request.
- **Immutability by default:** `const`, `readonly`, `Readonly<...>`, and create new objects instead of
  mutating arguments.

### 5.4 Functions and modules

- A function does one thing, and its name says what. If you need "and" in the name, split it.
- Prefer early returns over deep nesting:

  ```ts
  if (!tokens) return null;
  if (tokens.expiresAt - this.now() > EXPIRY_MARGIN_MS) return tokens.accessToken;
  return (await this.refresh())?.accessToken ?? null;
  ```

- Keep parameter lists short. More than three related values become one options object
  (`buildAuthorizationUrl({ endpoints, clientId, ... })`).
- Name magic numbers: `const EXPIRY_MARGIN_MS = 30_000;`.
- Use `async`/`await`, not `.then` chains. Always `await` or deliberately `void` a promise
  (`process.on('SIGINT', () => void shutdown('SIGINT'))`); the linter catches the rest.
- Run independent async work in parallel with `Promise.all`, as `EmployeesService.list` does.
- Classes are for things with state and injected dependencies (`AuthService`, `TokenStore`). Pure logic
  is a plain function (`toEmployee`, `canAccess`).
- No circular imports. If two modules need each other, the shared part belongs in a third.

### 5.5 Comments

Comments are rare, and they explain **why**, never what. Most code needs none:

- Make the code say it: clear names, small functions, types that carry the contract.
- Explain a decision in an ADR (`docs/adr`), a limit or a reason in the docs, and a one-off reason in
  the commit message or pull request.
- A test name that reads as a sentence documents behaviour better than a comment does.
- Write a comment only where the reason is not obvious from the code: a rule that looks odd (the row
  lock before a tick), a trap in a library, or a contract a type cannot carry. Keep it short.
- A comment that tools read, such as `/// <reference ... />` or an `eslint-disable` directive, is fine.

Delete commented-out code; Git remembers it.

### 5.6 React and the renderer

- Function components and hooks only. Components are `PascalCase` and live in `kebab-case` files.
- **Pages** (`pages/`) fetch data and arrange the screen. **Components** (`components/`) render. Generic
  building blocks live in `components/ui/`.
- **Server data goes through TanStack Query**, not `useEffect` plus `useState`. See `authQuery` in
  `lib/session.ts`.
- **Validate every API response** against the shared Zod schema before using it.
- **Handle all four states**: loading (skeletons), error, empty and success.
- **Style with the design tokens** in `styles.css` (`bg-primary`, `text-muted-foreground`), never raw
  colours, so light and dark both work. The rules are in `design-system/accessdesk/MASTER.md`.
- **Tell the user about the result of an action** with a toast (`lib/toast.ts`) or an inline `Alert`.
  An error must not disappear on its own.
- **Secrets shown once** (like the temporary password) stay in component state, never in
  `localStorage`, the query cache, a log or a URL.
- **Accessibility is part of "done":** real `button` and `label` elements, keyboard operation, visible
  focus. `jsx-a11y` runs in lint.
- Extract a custom hook when logic is reused or hides a lifecycle (`use-debounced-value.ts`).
- Import with the `@/` alias inside the renderer, not long relative paths.
- The renderer never imports from `main/`, `electron` or Node. It uses `window.accessdesk` only.

### 5.7 API (Fastify)

- One folder per feature in `modules/`, files named `<module>.routes.ts`, `.service.ts`, and so on.
- A route function takes `(app, deps)` and registers its routes: `employeeRoutes(app, deps)`.
- Validate `params`, `query` and `body` with Zod at the top of the handler. Never read raw input.
- Handlers return plain data typed with a shared type. They do not build error responses; they throw and
  let the error handler respond.
- Log with `request.log` / `app.log` (structured), never `console.log`. Never log tokens or secrets;
  `authorization` and `cookie` headers are redacted as a safety net.

---

## 6. Error handling

1. **Fail early, at the boundary.** Bad input is rejected by Zod before any rule runs (`400`).
2. **Throw typed errors from low layers** (`IdentityProviderError`, `OidcError`) and **translate them in one
   place** ([error-handler.ts](../apps/api/src/plugins/error-handler.ts)). Services do not know about
   HTTP status codes.
3. **Fail safe.** Users get a short message and a request ID. Stack traces, raw validation output, tokens
   and database errors stay in the server log.
4. **Do not swallow errors silently.** An empty `catch` is only for an error you have decided to ignore
   (ESLint allows it for that reason). If it is not obvious why ignoring is right, handle the error or
   record the reason in an ADR or the docs.

5. **Tell failures apart when the response differs.** In `AuthService.doRefresh`, an OAuth error ends the
   session, a network error keeps the tokens so the next attempt can succeed.
6. **Across process boundaries (IPC), return a result type** rather than throwing.
7. **Clean up in `finally`:** timers, ports, in-flight markers.

---

## 7. Security rules that shape the code

The full list is in [security.md](security.md). The ones that affect how you write code day to day:

- **Hiding a button is not authorization.** The UI uses `canAccess` for convenience; the API checks the
  token on every request ([ADR 0006](adr/0006-ui-visibility-is-not-authorization.md)). When you add a
  feature, add the API check in the same change.
- **Tokens never reach the renderer.** The main process attaches them. Tokens are stored encrypted or not
  at all.
- **Never put user input into a URL path or command unvalidated.** Use a strict schema
  (`z.uuid()`, `apiPathSchema`).
- **Do not follow redirects with a bearer token** (`redirect: 'error'`).
- **Set timeouts** on every outbound request (`AbortSignal.timeout`).
- **All identity provider admin calls live in `packages/identity-*`, and `apps/api` reaches identity
  only through `IdentityProvider`.** Lint enforces both.
- **Secrets come from the environment** (`.env`, parsed and validated in `config/`). Never commit them,
  and never hard-code them in tests.

---

## 8. Testing style

The conventions and folder layout are in [development.md](development.md#testing-conventions). The style:

- **Test behaviour, not implementation.** Assert on the HTTP status, the rendered screen or the returned
  value, not on private calls.
- **Arrange, Act, Assert.** Three visible steps, one reason for the test to fail.
- **Name tests as sentences** that say the condition and the result:
  `it('returns 401 when the token is expired')`.
- **Fake at the boundary.** Fake `TokenStorage`, `IdentityProvider`, `fetch` and the clock. Do not mock the
  class under test.
- **Fakes obey the real contract** (see Liskov above).
- **Fix a bug test-first.** Add a test that fails without the fix.
- **Tests are independent.** No shared mutable state, no required order, no real network or database.
- **The test pyramid:** many unit tests, fewer integration tests (`app.inject()`), one end-to-end smoke
  test.

---

## 9. Other principles: KISS, YAGNI, DRY

- **KISS (keep it simple).** Choose the plain solution a new teammate understands in a minute. Cleverness
  costs every future reader.
- **YAGNI (you aren't gonna need it).** Do not build for imagined requirements. `infra/jobs.ts` is a stub
  on purpose, until a real job exists.
- **DRY (don't repeat yourself), applied to knowledge, not text.** The same _rule or shape_ must live in
  one place (a Zod schema, the role table). Two lines that merely look alike are fine to leave alone;
  merging them too early creates a bad abstraction that is harder to undo than the duplication.
- **Law of Demeter.** Talk to your direct collaborators. `this.identity.listUsers(...)`, not
  `this.deps.client.http.users.list(...)`.
- **Composition over inheritance.** We inject collaborators instead of extending base classes. There is
  almost no inheritance in this repo; keep it that way.
- **Make illegal states unrepresentable.** Use unions and result types so a value cannot be
  "ok and also an error".
- **Boy Scout rule.** Leave a file a little cleaner than you found it, but keep the cleanup in a separate
  commit from the behaviour change.

---

## 10. Pull request checklist

Before asking for review:

- [ ] `pnpm check` passes (lint, format, typecheck, tests, build).
- [ ] Each new file has one clear job and sits in the right layer and folder.
- [ ] New dependencies on outside things (database, network, clock, identity provider) are injected through an
      interface, and a fake is used in tests.
- [ ] Input is validated with a Zod schema at the boundary; shared shapes live in `packages/shared`.
- [ ] Any new feature has an API-side role check, not only a hidden button.
- [ ] Errors are typed, handled in one place, and never leak internals to the user.
- [ ] No tokens, secrets or personal data in logs, tests or commits.
- [ ] New behaviour has tests, including the failure path; a bug fix has a test that failed before.
- [ ] UI changes handle loading, error and empty states and work with the keyboard.
- [ ] Comments only for the "why". No dead code, no `console.log`, no unexplained `any` or `as`.
- [ ] Docs or an ADR updated if a decision or a command changed.
