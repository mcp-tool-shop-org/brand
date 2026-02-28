# Changelog

## 1.0.1 — 2026-02-27

### Added

- SHIP_GATE.md and SCORECARD.md for product audit trail
- Security & Data Scope section in README

## 1.0.0 — 2026-02-27

First stable release.

### What's included

- **CLI** (`brand verify | manifest | audit | migrate`) — full brand asset lifecycle
- **SHA-256 manifest** — integrity verification for all logo assets
- **117 logos** across the mcp-tool-shop-org GitHub org
- **29 tests** covering manifest generation, verification, and README parsing
- **CI** — typecheck + test + build + manifest integrity check on every push
- **Landing page** via @mcptoolshop/site-theme
- **7 translations** (ja, zh, es, fr, hi, it, pt-BR)
- **Handbook** — migration lessons learned from 80+ repos

### Breaking changes from 0.x

None — the CLI interface is unchanged.

## 0.1.2 — 2026-02-23

- Publish workflow fix for npm republish

## 0.1.1 — 2026-02-22

- Version bump + workflow fix

## 0.1.0 — 2026-02-22

- Initial release: verify, manifest, audit, migrate commands
- SHA-256 integrity manifest
- README parser for badge/logo detection
- Landing page and translations
