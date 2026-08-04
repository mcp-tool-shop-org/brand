# Changelog

## 1.1.1 — 2026-08-04

### Fixed

- **`brand remove` no longer claims a restore it did not perform.** The swap deletes by rename-away → regenerate manifest → delete-or-restore. On the double-failure path — regeneration throws *and* the rename back also throws — the content survives under the reserved `.brand-backup-*` name, but the error message said "the original content has been restored" unconditionally, asserting an outcome it never checked. On the one path where an operator most needs the truth about their data, they were pointed at a location the content was not in. The message now reports what actually happened and, when the restore failed, names the exact path to recover from.

Found post-release by the wave-6 cross-family jury: one seat dissented on `AC-remove-swap-restore-on-failure` (3 pass / 1 fail). The majority was right about the letter of the criterion — the rename-back *is* wired — and the dissenter was right that something was wrong beside it. Now covered by two tests, including an isolated `vi.mock` file forcing the second rename to fail, proven red before green.

## 1.1.0 — 2026-08-04

Feature pass from the dogfood swarm's feature audit, plus an honesty pass on the security claims. Tests **362 → 421**.

The audit turned up a number worth leading with: **134 of 194 registry slugs (69%) matched no repo in any of the three orgs**, and `logos/original_voice-soundboard/` sat next to `logos/voice-soundboard/` — a rename that rotted silently. `stats` reported "manifest and disk are in sync", which was true and useless, because nothing ever compared the registry to the org. Three of the four additions below exist to close that.

### Added

- **`brand remove <slug> [--gallery <name>]`** — there was no removal path at all; deleting a slug meant a hand-run `rm -rf` plus a remembered `brand manifest`, with none of the safety `add-gallery` already had. Requires an explicit `--yes` (the refusal names the file count, byte total, and exact re-run command), offers a "did you mean" hint on an unknown slug, validates the slug before any path join, and deletes via rename-away → regenerate manifest → delete-or-restore-on-failure. `--dry-run` is proven inert by test, not just by inspection.
- **`brand history <slug>`** — answers "when did this logo change, and to what?" from git, newest first: sha, date, author, subject, and each asset's hash before → after, classified added/changed/removed. `--limit`, `--gallery`, `--json`. Git is invoked with argument arrays, never a shell string; a missing git, a non-repo, and a repo with zero commits are all clean exit-2 operator errors.
- **`brand audit --remote --org <org>`** — audits a whole org without cloning it, reusing the same README checks as local mode (one implementation, two sources). Adds org reconciliation: `org-repo-renamed` resolves GitHub's redirect and reports the **new** name rather than a false orphan, alongside `org-repo-archived` and `org-repo-not-found`. Nothing is auto-deleted — every hint points at `brand remove`. Degrades per-repo on failure, backs off on rate limits, and exits 2 naming the env var when no token is set.
- **Divergence tripwire in the daily sync** — when a registry logo differs from its upstream repo, the sync now asks whether the last commit to touch that file was its own, and reports a mismatch as suspicious via a deduplicated labelled issue instead of silently overwriting it. It never auto-reverts; destroying the evidence would defeat the point.
- **`.github/CODEOWNERS`** covering `logos/**`, `manifest.json`, `.github/**`, `scripts/**` — advisory until branch protection requires code-owner review, and the file says so rather than implying protection it doesn't have.
- **`.github/SECURITY-CONTROLS.md`** — the operator-facing threat model, with a measured enabled/not-enabled table.

### Changed — honesty

- **The README and SECURITY.md no longer claim the manifest stops tampering.** It doesn't: anyone with write access can swap a logo, run `brand manifest`, and commit both, after which `verify` passes. The hash proves the tree is internally consistent, not that its contents were approved. Both documents now say exactly that, name what does close the gap (repository controls plus the tripwire), and record why cosign/sigstore was deliberately declined — consumers fetch from `raw.githubusercontent.com` at HEAD and verify nothing, so a signature nobody checks is decoration until consumer-side verification ships.
- **"No network calls / fully offline" is corrected.** It was true and is no longer: `brand audit --remote` reaches the network. The claim is now "none by default", with the one opt-in exception named and every other command listed as offline.

### Fixed

- `audit`'s full-skip exit-2 guard assumed local mode's "0 inspected implies 0 issues" invariant, which is false in remote mode — an orphaned slug has 0 READMEs inspected and 1 genuine finding.
- **`stats` no longer implies health it cannot verify.** Its success line read "✓ Manifest and disk are in sync" — accurate, and the reason 69% org drift went unnoticed, because it compares the manifest to the local filesystem and nothing else. The success path now names its own blind spot and points at `brand audit --remote`. Two tests pin it, including one asserting the caveat never leaks into `--json`.

### Docs

- New handbook page: **Security** — what the manifest proves, what it does not, the divergence tripwire and its limits, the repository controls that actually close the gap and which are currently off, and why signing was declined.
- Handbook reference expanded with `brand remove`, `brand history`, and `audit --remote` including the org-reconciliation finding table.
- Landing page copy corrected — the "Tamper detection" feature card claimed the manifest catches "compromised logos"; it is now "Drift detection", with an "Org reconciliation" card replacing filler.
- All 7 translations regenerated from the corrected English source (ja, zh, es, fr, hi, it, pt-BR).

## 1.0.8 — 2026-08-04

Second full dogfood swarm on the shipped v1.0.7 product. Two audit/amend cycles (Stage A bug/security, Stage B/C proactive + humanization) across five domains in isolated worktrees, each finding severity-triaged by the coordinator and the wave-2 artifact corroborated by a five-seat non-Claude jury (18/18 criteria, 0 fails). Tests **237 → 362**. Both waves cleared the deterministic floor (lint + typecheck + tests + build).

The headline is that a mature, previously-swarmed repo still had a command that destroyed its own integrity record and reported success.

### Fixed — integrity

- **`brand manifest` no longer wipes the manifest on a mistyped `--logos`.** With a non-existent path it wrote `{"assets": {}}` over an existing manifest, printed `✓ Manifest written (0 assets)` in green, and exited **0** — a one-character typo in a CI script silently destroyed the repo's entire tamper-detection record. It now exits 2 naming the bad path, mirroring the guard `audit`/`stats`/`migrate` already had. (v1.0.7 fixed exactly this class in those three commands and missed `manifest` — the only one of the four that *writes*.) A companion guard refuses to overwrite a non-empty manifest with a zero-asset result even when the path does exist.
- **`generateManifest` no longer absorbs symlinked content from outside the logos root.** `follow: false` was believed to prevent this, but that option only governs `**` traversal and the code uses `*/` and `*`; a directory junction under `logos/` had its contents hashed in as legitimate assets and verified clean forever after. Replaced with a real `lstatSync` + `realpathSync` containment check at all four scan sites. The comment that claimed protection now describes what is actually enforced.
- **`add-gallery`'s swap scratch directories are no longer adopted as a phantom gallery.** A crash mid-swap left a sibling directory that `generateManifest` then recorded as a second gallery, corrupting `manifest.json` and breaking `brand sync` with "ambiguous gallery" until a human deleted it by hand. Scratch dirs now use reserved dot-prefixed names, stale ones self-heal when their owning process is confirmed dead, and `getGalleryFolders` carries an explicit denylist so the exclusion does not rest on a `glob` default.
- **`manifest --check` and `verify` now agree on exit codes** — 2 for a missing or malformed manifest, 1 reserved for genuine drift. The test that had been loosened to `expect([1,2]).toContain(...)` is tightened to the single correct value.

### Fixed — content safety

- **`brand sync` rejects a `--slug` that is not a single safe path segment.** `--slug ../..` escaped `--repos` entirely and could rewrite a README outside the intended tree; `add-gallery` had a `validateSlug` guard and `sync` did not. The implementation is now shared rather than duplicated, so the two cannot drift apart again.
- **`brand migrate --dry-run --resume` is actually dry.** The resume block never consulted `opts.dryRun`, so a "preview" overwrote every journaled README and deleted the journal.
- **`migrate --resume` no longer discards journal entries whose restore failed** — the journal is the only backup of pre-migration content, and it was being wiped unconditionally, invisibly under `--json`/`--quiet`.
- **`--brand-base` is HTML-attribute-escaped** before being spliced into an `<img src>`, closing an injection into every README a migration touches.
- **Concurrent `sync` runs on one README, and concurrent `migrate` runs sharing one journal, no longer silently lose a write** — per-README and per-journal atomic lockfiles with stale-lock self-healing; live contention fails loudly instead of clobbering.

### Fixed — parser correctness

- **Markers inside fenced or indented code blocks are no longer treated as live.** The tool misparsed its own README, whose ` ```html ` example shows the marker syntax.
- **An unclosed fence no longer suppresses every marker after it.** Closing the bug above introduced this one: a README whose install snippet was missing its closing fence made every later marker invisible, and `sync` reported "no marker found" — indistinguishable from never having written one. An unclosed fence is now treated as never having opened a code region, a deliberate divergence from CommonMark rendering documented in the module (this is a classifier, not a renderer).
- **Multi-line indented code blocks suppress every line, not just the first.** The gate was `prevLineBlank && isIndented(line)`, and "after a blank line" describes where a run *starts*, not every line in it. In an indented marker example the `start` was suppressed while the `end` below it stayed live — a dangling end with no matching start.
- **A suppressed marker can now explain itself.** `findMarkerBlocksVerbose` reports `{reason, fenceOpenLine, line, slug}`, so "your marker is inside a code block opened at line 8" replaces a silent no-op.
- **Catastrophic backtracking in the marker regex** — 7.57s on a 5,000-char adversarial input, past 60s at 10,000 — replaced with a fixed-width anchor plus a linear scan. Same input now resolves in 0ms.
- `syncMarkerBlock` splices by character offset, so a start+end pair on one physical line no longer duplicates the marker line and orphans content.
- A commented-out `<img>` is no longer resurrected and rewritten.

### Fixed — CI and supply chain

- **Two high-severity advisories were failing every CI run.** `npm audit --audit-level=high` runs before typecheck/build/test, so `brace-expansion` (3 DoS advisories) and `postcss` (path traversal / arbitrary `.map` disclosure) aborted the job and made **every PR in the repo unmergeable**, including 31 accumulated auto-sync PRs. Bumped to 5.0.9 and 8.5.25 within existing semver ranges; `package.json` unchanged.
- **The daily sync no longer opens a new PR every day.** It minted `auto/sync-logos-<date>-<run_id>` and called `gh pr create` unconditionally, with no "is one already open?" check — while the issue-creation step in the same file deduped by label. It now force-pushes a stable branch and checks for an open PR first.
- **The sync workflow no longer deletes an open PR's head ref.** Under the stable-branch scheme, `gh pr create` failing for *any* reason — including a transient API error — severed the branch. `--force-with-lease` replaces `--force` so a human's fixup commit is not silently destroyed.
- `issues: write` added to the sync job (its failure-alerting step 403'd in the documented `GITHUB_TOKEN` fallback), and the `SYNC_PAT` scope documentation updated to match.
- **The coverage gate was decorative and now fires.** `vitest.config.ts` declared thresholds and claimed to "close the coverage threshold gate", but no workflow ever passed `--coverage`. Wired into a single matrix leg (coverage cost paid once, not three times) and *verified red* under a forced-unattainable threshold before shipping.
- **`npm audit` gained a reviewed-exception valve instead of an all-or-nothing wall** — `.github/audit-allowlist.json` (empty) plus a checker that fails closed on every ambiguous path and expires entries automatically, so a future advisory is escalated through a reviewed PR rather than by disabling the step under time pressure.
- Compensators documented for `release.yml`'s two irreversible actions (`npm publish`, `gh release create`), per the workflow standards.
- `.gitattributes` declares every tracked asset format binary, including `logos/**/*.svg` — SVG is text, and under `core.autocrlf=true` a checkout would rewrite its line endings, changing its SHA-256 and failing `brand verify` on a clean clone of an untampered repo.

### Fixed — operator experience

- `stats` counts gallery-only slugs as present on disk, stops leaking human text to stderr in `--json` mode, gained the `ok` field every sibling already had, and honours `--quiet` (previously a no-op).
- `audit` exits 2 instead of reporting success when `--repos` matched no clones at all — a broken CI checkout read as a clean audit — and its brand-base check is anchored rather than an unanchored substring that failed open on an empty value.
- Usage errors exit 2 rather than Commander's default 1; `process.exitCode` replaces `process.exit()` so `--json` payloads cannot be truncated on a piped stdout.

### Repository

31 stale auto-sync PRs consolidated into one (verified lossless: the union of all 31 was exactly the 4 logos the newest carried), an obsolete OIDC PR closed as already-implemented, and merged branches pruned — 41 open PRs down to 8. Registry now at 220 verified assets.

Full 10-phase dogfood swarm on the shipped v1.0.6 product — bug/security (Stage A) + proactive/humanization/visual (Stage B/C/D) + feature pass, each finding adversarially cross-verified. **0 CRITICAL / 0 HIGH survived** (mature repo; verifiers deflated 6 over-rated severities). Tests **205 → 237**; scorecard holds **50/50**.

### Fixed

- **`readManifest` now validates `assets`.** A valid-JSON manifest missing/garbage `assets` was accepted and crashed `verify` / `manifest --check` / `audit` with a raw `TypeError` routed to exit 3 (the contract requires exit 2 for a malformed manifest), and `assets: [...]` produced phantom "Removed" drift. It now throws a `ManifestParseError` that flows to the exit-2 path across all four call-sites.
- **`writeManifest` is atomic** (temp file + rename), matching the `sync`/`migrate` write helpers — the integrity trust-root can no longer be observed half-written by a concurrent reader. The previously-vacuous "atomic contract" test now proves the temp+rename mechanism.
- **README `<img>` src detection no longer mis-targets `data-src`.** The parser anchored `src` with a `\b` word boundary, which also matched inside `data-src`/`data-lazy-src`; a lazy-loaded image tag made `migrate` rewrite the wrong attribute and leave the real logo stale. Anchored with a lookbehind for a real attribute separator.
- **`audit` / `stats` / `migrate` exit 2 on a missing/mistyped `--logos`/`--repos`** instead of a cheerful "0 repos checked / in sync / Repos scanned: 0" no-op that silently inspected nothing on a release gate.
- **`audit` survives one unreadable README** — it records a `readme-unreadable` finding and keeps walking (mirroring `migrate`'s per-file resilience) rather than a raw exit-3 that discarded every finding already collected.
- **`audit` reports "N of M repos inspected (K had no local clone)"** — the old "N repos checked" counted logo slugs, not repos actually read, so a wrong `--repos` read as full coverage. `--json` adds `reposChecked`/`reposTotal`/`skippedNoClone`.
- **`renderGalleryBlock` HTML-escapes gallery url/alt** — a `&` or `"` in an image filename no longer emits malformed markup or closes the attribute early.
- **`sync` preserves the document's line endings** — regenerating a gallery block in a CRLF-authored consuming README no longer produces mixed CRLF/LF output; `findMarkerBlocks` strips stray `\r` from inner content.
- The marker missing-`slug` error names the recognized attributes and the offending typo'd key.
- **Config hygiene**: `data/` (repo-knowledge SQLite DB) and `rk.config.json` (placeholder owner) are gitignored — both were committable by a blanket `git add -A`. `package.json` `files[]` now lists `README.*.md` so the manifest reflects reality (npm force-includes every `README*` regardless of `files[]`, so the 7 translations ship).
- **CI**: the daily "Sync org logos" job degrades gracefully when GitHub-Actions PR creation is denied — it warns with the exact remediation and deletes the just-pushed branch instead of failing red and orphaning a dated branch every day. A PR-gated site build was added to `pages.yml` so a build-breaking `site/**` change fails on the PR, not post-merge.
- **Docs**: landing-page scorecard refreshed to the shipped reality (50/50, D=10/10, 237 tests); Node floor corrected to 20 in the handbook (matches `engines`); fixed a broken internal handbook link (missing `/brand` base); completed the `verify` exit-code table (0/1/2/3); documented `migrate --resume` / `--json` and `BRAND_DEBUG`.

### Added

- **`brand stats` surfaces the primary/gallery role split** — "Primary logos: N" and "Gallery images: M (across K galleries)", a `--verbose` per-gallery listing, and `primaryCount`/`galleryCount`/`galleries` in `--json`. Closes the confusing gap between "Logos on disk" (primaries only) and "Manifest entries" (all assets) once galleries exist.

## 1.0.6 — 2026-07-01

Feature pass: first-class galleries + dynamic README sync. Dogfood swarm, grounded in a 4-question study-swarm + retrieval-verified citation recovery.

### Added

- **`brand add-gallery <slug> <source-dir>`** — explicit, idempotent registration of a directory of images as a named gallery collection for a slug. Full resync on re-run (adds/updates/removes to match `source-dir`, content-hash compared, never mtime), natural-sort default order, `--order` for explicit ordering via numeric-prefix renaming, `--dry-run`. Auto-regenerates `manifest.json`.
- **`brand sync --slug <slug> [--check]`** — regenerates a consuming repo's README gallery block from the manifest, via a new `<!-- brand:gallery:start slug="..." -->` / `<!-- brand:gallery:end -->` marker convention (namespaced so future block types don't collide). `--check` reports drift without writing (CI-gatable, exit 1 on drift). Pure function of the local manifest + local README — no network calls. Deterministic output: byte-identical across runs with unchanged inputs.
- **Manifest asset entries now carry an explicit `role: "primary" | "gallery"`** (plus `gallery: "<folder>"` for gallery entries). `generateManifest()` moved from an unscoped recursive glob to a bounded two-level scan (`<slug>/readme.<ext>` = primary, `<slug>/<oneFolder>/<file>` = gallery) — zero migration needed, every existing slug's file coverage is unchanged.
- **`brand audit` is role-aware.** The `multiple-logo-matches` check no longer false-flags a legitimate gallery as a badge collision; a README with unmanaged gallery `<img>` tags gets a new informational `unmanaged-gallery` finding pointing at `brand sync` instead.
- `docs/handbook.md` §10 "Galleries & Dynamic READMEs" — the design rationale and prior-art grounding (doctoc, terraform-docs, Kubernetes' verify-codegen.sh, Bazel's bare-glob warning, Storybook/Astro's readdir-order caution).

### Fixed

- Retroactively tagged `v1.0.2`/`v1.0.3` at their real historical commits — they were documented in this CHANGELOG but never reached npm (no GitHub Release was ever created for them, so the release workflow never fired). Tag/git/CHANGELOG parity closed; current releases were never affected.

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
