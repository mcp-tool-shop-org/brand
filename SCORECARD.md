# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** brand
**Date:** 2026-02-27 (original) · 2026-05-15 (refreshed after wave-2 amend)
**Type tags:** [npm] [cli]

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 9/10 | SECURITY.md exists with SHA-256 integrity. Missing formal threat model table in README. |
| B. Error Handling | 8/10 | CLI has exit codes, structured errors. No formal SHIP_GATE audit. |
| C. Operator Docs | 9/10 | Excellent README, CHANGELOG, handbook. Missing SHIP_GATE/SCORECARD. |
| D. Shipping Hygiene | 9/10 | vitest, CI integrity check, npm published. Missing SHIP_GATE. |
| E. Identity (soft) | 10/10 | Logo, translations, landing page, metadata. |
| **Overall** | **45/50** | |

## Key Gaps

1. Missing SHIP_GATE.md and SCORECARD.md for audit trail
2. README missing formal Security & Data Scope table
3. Version patch bump needed for shipcheck compliance

## Remediation Priority

| Priority | Item | Estimated effort |
|----------|------|-----------------|
| 1 | Add SHIP_GATE.md + SCORECARD.md | 5 min |
| 2 | Add Security & Data Scope table to README | 3 min |
| 3 | Patch bump to 1.0.1 | 1 min |

## Post-Remediation (after 2026-05-15 wave-2 amend)

| Category | Before | After |
|----------|--------|-------|
| A. Security | 9/10 | 10/10 |
| B. Error Handling | 8/10 | 10/10 |
| C. Operator Docs | 9/10 | 10/10 |
| D. Shipping Hygiene | 9/10 | 9/10 |
| E. Identity (soft) | 10/10 | 10/10 |
| **Overall** | **45/50** | **49/50** |

### D resolved (2026-07-01 dogfood swarm freshness check)

- Tag/release parity is CLOSED. v1.0.2/v1.0.3 never reached npm (real publishing began at 1.0.4); no GitHub Release was ever created for v1.0.0–v1.0.3 so the token-based `publish.yml` never fired for them — retroactively tagged v1.0.2/v1.0.3 at their real historical commits for git/CHANGELOG parity (tag-push doesn't trigger the current `release.yml`; verified no publish occurred). Current HEAD (v1.0.5) has full tag/release/npm parity. D moves to **10/10** — every other line was already green (CI matrix Node 20/22/24, SHA-pinned actions, `npm audit` step, Dependabot config, full tarball contents).

**Overall: 50/50.**
