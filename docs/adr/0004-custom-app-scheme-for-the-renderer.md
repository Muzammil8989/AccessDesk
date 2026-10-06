# 0004. Serve the UI from a custom `app://` scheme

Date: 2026-10-06. Status: accepted

## Context

A packaged Electron app usually loads its UI from `file://`. Files have no meaningful origin, and a
Content Security Policy is easier to attach to a real response than to a file.

## Decision

In production the UI is served from `app://accessdesk` by the main process, which adds a strict CSP
header to each response. In development the Vite dev server is used, with a looser CSP for hot reload.
Navigation and IPC callers are checked against that origin.

## Consequences

- The CSP is enforced (scripts and styles from `self` only, no network access from the page) and tested.
- The main process needs a small protocol handler with path-traversal protection (unit tested).
- Routing uses hash URLs so it works the same under both origins.
