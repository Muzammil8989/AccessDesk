# Contributing to AccessDesk

Thanks for helping. This is the short version. See [docs/development.md](docs/development.md) for details.

## Getting set up

```bash
pnpm install
pnpm setup      # .env, PostgreSQL, migrations, seed
pnpm dev:all    # API + desktop app
```

## Before you open a pull request

Run `pnpm check`. It runs the same steps as CI: lint, format check, typecheck, tests and build.
Git hooks (Husky) help: pre-commit lints and formats staged files, and pre-push runs typecheck and tests.

## Rules

- TypeScript strict mode. No `any` without a comment explaining why.
- Keycloak Admin API calls live only in `packages/keycloak-client`.
- Validate all external input with Zod (API requests, IPC payloads, settings, API responses).
- Never log or store tokens or passwords. See [docs/security.md](docs/security.md).
- New behavior needs a test in the `test/` folder of the app or package you changed. Fixing a bug starts
  with a test that fails without the fix. Coverage must stay above the thresholds (`pnpm test:coverage`).
- Follow the layers described in [docs/development.md](docs/development.md): routes only handle HTTP,
  services hold the rules and depend on interfaces, and real implementations are chosen in `server.ts`.
- Follow the style, SOLID and design-pattern rules in [docs/coding-standards.md](docs/coding-standards.md).
- Respect the architecture boundaries. ESLint enforces them, so a violation fails `pnpm lint`.
- Record significant decisions as an ADR in [docs/adr](docs/adr/README.md).
- Pin dependency versions exactly (no `^` or `~`). `.npmrc` does this for `pnpm add`.
- Keep comments for the "why", not the "what".

## Commits and pull requests

- Small, focused pull requests. Describe what changed and why, and how you tested it.
- Use clear commit messages in the imperative: "Add employee detail route".

## Reporting security problems

Do not open a public issue. See [SECURITY.md](SECURITY.md).
