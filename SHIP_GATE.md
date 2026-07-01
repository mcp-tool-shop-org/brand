# Ship Gate

> No repo is "done" until every applicable line is checked.
> Copy this into your repo root. Check items off per-release.

**Tags:** `[all]` every repo · `[npm]` `[pypi]` `[vsix]` `[desktop]` `[container]` published artifacts · `[mcp]` MCP servers · `[cli]` CLI tools

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (private report channel, supported versions, response SLA) (2026-02-27, refreshed 2026-05-15)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-02-27)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-02-27)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-02-27)

### Default safety posture

- [ ] `[cli|mcp|desktop]` SKIP: CLI operates on local brand assets only — no destructive actions
- [x] `[cli|mcp|desktop]` File operations constrained to known directories (logos/, manifest.json, README files) (2026-02-27)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server

## B. Error Handling

- [x] `[all]` Errors follow the Structured Error Shape: `code`, `message`, `hint`, `cause?`, `retryable?` (2026-02-27)
- [x] `[cli]` Exit codes: 0 ok · 1 user error · 2 runtime error · 3 partial success (2026-02-27)
- [x] `[cli]` No raw stack traces without `--debug` (2026-02-27)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[desktop]` SKIP: not a desktop application
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-02-27)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-02-27)
- [x] `[all]` LICENSE file present and repo states support status (2026-02-27)
- [x] `[cli]` `--help` output accurate for all commands and flags (verify, manifest, audit, migrate, stats) (2026-02-27)
- [ ] `[cli|mcp|desktop]` SKIP: CLI tool — no logging levels needed
- [ ] `[mcp]` SKIP: not an MCP server
- [x] `[complex]` Handbook exists (docs/handbook.md — migration lessons learned) (2026-02-27)

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (vitest) (2026-02-27)
- [x] `[all]` Version in manifest matches git tag (2026-07-01) — RESOLVED: investigated the v1.0.2/v1.0.3 follow-up. They never reached npm — `npm view @mcptoolshop/brand versions` returns only `1.0.4`/`1.0.5`; real npm publishing began at 1.0.4 (2026-05-15), and the token-based `publish.yml` (retired 2026-06-20) only ever fired on `release: published`, but no GitHub Release was ever created for v1.0.0–v1.0.3. Retroactively tagged `v1.0.2` (`d1e8be1`) and `v1.0.3` (`78f9b84`) at their real historical bump commits for git/CHANGELOG parity — tag-push does not trigger the current `release.yml` (verified: no new Release run fired, npm `dist-tags.latest` unchanged at 1.0.5). Current HEAD (v1.0.5) has full parity: tag, GitHub Release, and npm all agree.
- [x] `[all]` Dependency scanning runs in CI (`npm audit --audit-level=high` in ci.yml) (2026-05-15)
- [x] `[all]` Automated dependency update mechanism exists (`.github/dependabot.yml` covers npm root, npm site/, github-actions) (2026-05-15)
- [x] `[all]` Workflow `uses:` actions pinned to commit SHA with `# vX.Y.Z` comment (2026-05-15)
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, LICENSE, CHANGELOG.md, SECURITY.md (2026-05-15)
- [x] `[npm]` `engines.node` set (>=20) and CI matrix covers 20, 22, 24 (2026-05-15)
- [ ] `[npm]` SKIP: no lockfile needed — CLI published to npm
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop application

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-02-27)
- [x] `[all]` Translations (polyglot-mcp, 7 languages) (2026-02-27)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) (2026-02-27)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-02-27)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."
