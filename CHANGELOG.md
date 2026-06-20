# Changelog

## 1.0.5 — 2026-06-20

CI hardening + npm trusted-publishing migration.

### Fixed

- **CI**: `lint-test-build`'s `npm audit --audit-level=high` step had been failing on a high-severity `vite` advisory (GHSA-fx2h-pf6j-xcff `server.fs.deny` bypass + GHSA-v6wh-96g9-6wx3 launch-editor NTLMv2) and a moderate `brace-expansion` DoS — both transitive dev/build deps. `npm audit fix` bumped 8 lockfile packages (no direct-dep change); re-audit reports 0 vulnerabilities. Unblocks the required check so logo-asset PRs merge through the gate again.

### Changed

- **Publishing migrated to npm Trusted Publishing (OIDC).** New `release.yml` publishes `@mcptoolshop/brand` on a `v*` tag push via OIDC (`--provenance`, no `NPM_TOKEN`), bound to the npm Trusted Publisher. The token-based `publish.yml` is retired.

## 1.0.4 — 2026-05-15

10-phase dogfood swarm pass. 170+ findings closed across A/B/C/D stages; test suite grew from 31 to 137 tests (+342%).

### Fixed

- **CRITICAL**: `brand stats` was shipped-broken — read `manifest.logos` but real shape is `manifest.assets`. Live output reported "Manifest entries: 4" instead of 187. Now correct.
- **CRITICAL**: Windows slug extraction in stats normalized backslashes (`f.split('/')[0]` failed on Windows paths).
- **HIGH**: `migrate` silently collapsed multi-logo READMEs (every `<img>` rewritten to same URL) — now skips with a warning naming the distinct local srcs.
- **HIGH**: Migrate + audit only probed `.png`/`.jpg` — now probe all 5 supported extensions via shared `findLogoFile()` helper.
- **HIGH**: `rewriteLogoSrc` replacement-string injection — `$&`, `$1`, `$$` in new src no longer interpreted as regex backrefs (splice-by-index fix).
- **HIGH**: Parser only matched double-quoted `src` — now handles single-quoted and unquoted variants.
- **HIGH**: Per-line gates dropped real logos on the same line as a badge — gates are now per-`<img>`.
- **HIGH**: `isLogoSrc` rejected `logos/` (plural) paths — entire brand URL structure was excluded.

### Added

- `--json` flag on `verify`, `audit`, `migrate`, `manifest --check` (joining `stats`).
- `--quiet` / `--verbose` global flags.
- Differentiated exit codes: 0 = success, 1 = drift/mismatch, 2 = operator error, 3 = unexpected.
- `brand migrate` is now transactional: per-file atomic write (temp + rename), per-repo journal at `<repo>/.brand-migrate.journal.json`, `--resume` flag to recover from a partial run, per-repo try/catch, TTY progress indicator.
- Parser code-block awareness: fenced (` ``` ` / `~~~`) and 4-space-indented `<img>` tags are now correctly skipped.
- Parser rejection-reason channel: `findAllImgTags()` returns matches + rejected (`{reason: 'in-anchor' | 'badge' | 'not-logo' | 'in-code-block'}`).
- 5 MB README size guard at parser entry.
- Soft manifest version check — warns on unknown future versions.
- `SUPPORTED_FORMATS` single source of truth for image format support; `FORMAT_MAP`, `IMAGE_EXTENSIONS`, `IMAGE_EXTENSION_ORDER`, and `getFormatGlob()` derive from it.
- `findLogoFile(slug, baseDir)` shared helper probes extensions in order.
- `ManifestIOError` / `ManifestParseError` typed errors carry path + node error code.
- Symlink guard in `generateManifest` (`follow: false`).
- Coverage thresholds via `vitest.config.ts` (85% lines, 80% branches).
- `pretest: npm run build` script ensures stats CLI test runs against fresh dist.
- 4 new test files (`audit.test.ts`, `migrate.test.ts`, `manifest-cmd.test.ts`, `verify.test.ts`) + 60+ new tests across `manifest.test.ts`, `readme-parser.test.ts`, new `json-output.test.ts`, `exit-codes.test.ts`, `migrate-journal.test.ts`.
- `.gitattributes` to lock fixture line endings.
- Site logo (`site/src/assets/logo.svg`) + favicon (`site/public/favicon.svg`); light-mode accent tokens.

### Security

- Pinned every workflow `uses:` action to a 40-char commit SHA with `# vX.Y.Z` comment (ci.yml, pages.yml, publish.yml, sync.yml). Mitigates floating-tag supply-chain risk on the npm-publishing workflow.
- Added `npm audit --audit-level=high` step to ci.yml.
- Added `.github/dependabot.yml` with weekly cadence for npm (root + site/) and github-actions ecosystems; minor/patch updates grouped to avoid major-bump bundling. Reviewers + assignees configured.
- `scripts/sync-org-logos.sh` now enforces `--max-time 30`, `--max-filesize 10485760` (10 MB), and a `file --mime-type` magic-byte check rejecting non-images. Added `gh auth status` preflight, non-empty repo-list assertion, and portable hash shim (sha256sum + shasum fallback).
- SECURITY.md now directs sensitive reports to GitHub's private vulnerability advisory channel with a 72-hour acknowledgment SLA. Added Incident Response section covering poisoned-sync revert and `npm deprecate` flows.
- `publish.yml`: `checkout` pinned to `release.tag_name`; version-match assertion blocks tag/package drift; `NPM_TOKEN` missing now hard-fails with operator hint; `environment: production-npm` gate.
- `timeout-minutes` set explicitly on every workflow job.

### Changed

- ci.yml: matrix expanded to Node 18, 20, 22 (was 22 only). Added workflow-scope `permissions: contents: read` baseline. `$GITHUB_STEP_SUMMARY` emits test count + integrity status.
- publish.yml: removed `continue-on-error: true` from the npm publish step (silent-failure hazard). Removed `if [ -f package-lock.json ]` conditional — always `npm ci`. Added `cache: npm`. Step summary emits version + sha + npm URL.
- pages.yml: added `cache: npm` + `cache-dependency-path: site/package-lock.json`.
- sync.yml: branch name now `auto/sync-logos-YYYYMMDD-${{ github.run_id }}` (was YYYYMMDD only — collided on same-day re-runs). Added `git diff --cached --quiet` short-circuit before commit. Moved workflow write permissions down to the sync job. Documented the org/repo setting + `SYNC_PAT` fallback; uses `${{ secrets.SYNC_PAT || secrets.GITHUB_TOKEN }}`. Added `node dist/cli.js verify` step after manifest regen. Set `cancel-in-progress: false`. Auto-creates a `sync-failure` issue on verify failure (deduplicated). Step summary emits per-run counts.
- tsconfig.json: enabled `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- package.json: added `bugs.url`, `publishConfig.access` + `publishConfig.provenance`. Added `CHANGELOG.md` + `SECURITY.md` to `files`. Bumped `@types/node` to `^22.0.0`.
- README.md: removed stale "148 logos" hard count (manifest has 187 — softened to "Hundreds"). Merged duplicate Security sections. Honest scorecard now 49/50 (one D follow-up open). Auto-Sync Setup + Troubleshooting subsections added.
- SHIP_GATE.md, SCORECARD.md: aligned with actual state. D = 9/10 pending git-tag parity follow-up.
- docs/handbook.md: softened stale count claims ("80+ repos" → "across the org").
- `site/src/site-config.ts`: zod-validated `SiteConfig` schema, `npmUrl` field added, scorecard rows reconciled with README.
- `site/package.json`: pinned `@mcptoolshop/site-theme` exactly to `0.2.6` (was caret on 0.x — silent-breakage risk).
- CLI output: consistent 2-space indentation, header envelope, and chalk palette across all commands. Verify shows a TTY pre-walk count.

## 1.0.3 — 2026-03-25

### Added

- `brand stats` command — logo counts, format breakdown, manifest sync status
- `--json` flag for machine-readable stats output
- 2 tests for stats command (31 total)

## 1.0.2 — 2026-03-19

### Added

- Daily auto-sync workflow — scans all org repos for logos, opens a PR when changes detected
- Sync script (`scripts/sync-org-logos.sh`) for local and CI use
- Image-extension allowlist in manifest generator (only `.png/.jpg/.jpeg/.svg/.webp` tracked)

### Fixed

- Manifest drift that broke CI for 5 consecutive runs (GlyphStudio + repo-knowledge logos missing)
- Removed non-image file (`logos/claude-rpg/USAGE.md`) from asset tree
- `brand audit` now exits with code 1 when issues are found (CI-gatable)
- CLI header comment no longer lists unimplemented commands
- All workflows aligned to Node 22

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
