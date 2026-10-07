# Contributing to AccessDesk

Thanks for helping. This is the short version. See [docs/development.md](docs/development.md) for details.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Questions go to
[SUPPORT.md](SUPPORT.md).

## Ways to help

- Report a bug or suggest a feature with an [issue](../../issues/new/choose). Search first.
- Fix a bug or build something. For anything bigger than a small fix, **open an issue first** so we can agree on the approach before you spend time on it.
- Improve the docs, or add tests.
- Look for issues labeled `good first issue` or `help wanted`.

## Getting set up

1. [Fork](../../fork) the repository and clone your fork.
2. Create a branch from `main` (for example `fix/employee-search`).
3. Install and run:

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
- Identity provider admin API calls live only in an adapter package (`packages/identity-*`), and the
  provider name appears only where `scripts/naming-allowlist.json` allows. `pnpm check` enforces both.
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
- Open the pull request against `main` from your fork's branch and fill in the template.
- A maintainer reviews every pull request. `main` is protected, so a pull request needs passing checks
  and an approval before it is merged. Expect requests for changes. They are normal.
- Resolve review conversations and keep the branch up to date with `main`.
- Never commit secrets (passwords, tokens, keys, `.env` files). Use `.env.example` for placeholders.

### Automatic security checks

Every pull request runs a security gate:

- **Secret scan** ([gitleaks](https://github.com/gitleaks/gitleaks)) on the pull request's commits.
- **Dependency review** that fails if you add a dependency with a known high or critical vulnerability.
- **CodeQL** code scanning and **`pnpm audit`** (in CI).

If the secret scan or dependency review fails, a pull request from an outside contributor is labeled
`security-risk` and **closed automatically** with an explanation. Fix the problem and push, or ask a
maintainer to reopen it if you think it is a false alarm. If you committed a real secret, **rotate it
immediately**. Deleting it in a new commit does not remove it from the history.

## Reporting security problems

Do not open a public issue. See [SECURITY.md](SECURITY.md).
