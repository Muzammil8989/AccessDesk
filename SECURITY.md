# Security policy

AccessDesk manages access to other systems, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting
("Security" tab, "Report a vulnerability") on this repository, and include:

- what you found and where,
- steps to reproduce,
- the impact you expect.

We aim to acknowledge reports within 3 working days and to agree a fix and disclosure plan with you.

## Scope and design

The security model (public OIDC client with PKCE, hardened Electron renderer, encrypted token storage,
JWT verification and role checks in the API) is described in [docs/security.md](docs/security.md).
Reports that show one of those guarantees can be bypassed are especially welcome.

## Supported versions

The project is pre-release. Only the `main` branch is supported.
