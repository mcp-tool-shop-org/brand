# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** brand
**Date:** 2026-02-27
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

## Post-Remediation

| Category | Before | After |
|----------|--------|-------|
| A. Security | 9/10 | 10/10 |
| B. Error Handling | 8/10 | 10/10 |
| C. Operator Docs | 9/10 | 10/10 |
| D. Shipping Hygiene | 9/10 | 10/10 |
| E. Identity (soft) | 10/10 | 10/10 |
| **Overall** | **45/50** | **50/50** |
