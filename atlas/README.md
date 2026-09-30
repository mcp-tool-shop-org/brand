# brand: how it works

Mapped at 2026-09-30 from commit b3a0324 by Atlas 1.24.0.

## What this is

11 parts, mostly images (256 files) and Markdown (60); code in TypeScript (40), JavaScript (8), Astro (2), CSS (2) and shell (1). Work enters through 5 doors; the busiest is CI, which reaches 4 parts. It publishes to npm. It deploys a site to GitHub Pages. People run brand.

## What changed since 2026-09-23 (82d3e54)

- CI's pull request trigger now also names `atlas/**` and `codecov.yml`.
- CI's push trigger now also names `atlas/**` and `codecov.yml`.
- CI now also runs src/cli.ts.
- And 1 more change to a door.
- README.ja.md is now read by tests/migrate.test.ts.
- README.md is now also read by tests/audit.test.ts, tests/json-output.test.ts, tests/migrate-journal.test.ts and tests/migrate.test.ts.
- README.zh.md is now read by tests/migrate.test.ts.
- And 244 more new writers and readers of places.
- logos was generated and is now authored.
- src/cli.ts now starts at `main`; it started at `withGlobals`.
- 6 files added and 100 changed content, across 9 parts.

## What comes in

1. **CI.** On a pull request touching 17 paths; on a push touching 17 paths; or by hand. Runs scripts/check-audit-allowlist.mjs, src/cli.ts, tests/add-gallery.test.ts and 18 more; builds src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs tests/add-gallery.test.ts, tests/add-model.test.ts, tests/audit.test.ts and 16 more; builds src/.
3. **Deploy site to GitHub Pages.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs site/astro.config.mjs and site/src/; builds src/.
4. **Sync org logos.** On a schedule (`0 6 * * *`); or by hand. Runs scripts/sync-org-logos.sh and src/cli.ts; builds src/.
5. **brand** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs scripts/check-audit-allowlist.mjs in scripts, src/cli.ts in src, and 19 files in tests; it builds src/ in src.
2. That reaches the site (1 file).
3. It runs git.
4. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs tests/add-gallery.test.ts, tests/add-model.test.ts, tests/audit.test.ts and 16 more, builds src/, reaches the site, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, builds src/, and deploys the site on a push to main or by hand.

**Sync org logos** runs scripts/sync-org-logos.sh and src/cli.ts, builds src/, writes to manifest.json, commits logos/ (written by people) and manifest.json, then pushes to a branch for review, never to main, runs git, opens an issue, and opens a pull request.

**brand** (a command people run) runs src/cli.ts and runs git.

## What breaks what

- **src** is imported by 1 part (the site), and by 1 more only from tests; it sits on the path of 5 doors.
- **the site** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.
- **manifest.json** is written by .github and read by .github, the site and src; a hand edit reaches every reader.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

2 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Every tracked place code writes here is edited by people too; see Hand-authored.

## Hand-authored

People write .claude/, .githooks/, .github/, assets/, docs/, logos/ and site/. Nothing in this repository writes to them.

- **manifest.json** is written by .github/workflows/sync.yml, and by people: 45 of its 46 commits in the window are theirs.

## Where to start

.github/workflows/ci.yml → src/cli.ts → src/commands/verify.ts → src/manifest.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 6 reads use paths built at run time and are not named here.
- 24 writes and 66 reads go to a path their caller passes, not to this repository.
- 8 reads go to the directory the command is run in (README.md, logos/ and manifest.json), not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
