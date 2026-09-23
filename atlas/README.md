# brand: how it works

Mapped at 2026-09-23 from commit 82d3e54.

## What this is

11 parts, mostly TypeScript (40 files). Work enters through 5 doors; the busiest is Sync org logos, which reaches 2 parts and commits into the repository (CI reaches 4 but commits nothing). It publishes to npm. People run brand.

## What changed since the last map

This is the first map.

## What comes in

1. **CI.** On a pull request touching 15 paths; on a push touching 15 paths; or by hand. Runs scripts/check-audit-allowlist.mjs, tests/add-gallery.test.ts, tests/add-model.test.ts and 17 more; checks src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs tests/add-gallery.test.ts, tests/add-model.test.ts, tests/audit.test.ts and 16 more; checks src/.
3. **Deploy site to GitHub Pages.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs site/astro.config.mjs and site/src/; checks src/.
4. **Sync org logos.** On a schedule (`0 6 * * *`); or by hand. Runs scripts/sync-org-logos.sh; checks src/.
5. **brand** (a command people run). Runs src/cli.ts.

## What happens through Sync org logos

1. The workflow runs scripts/sync-org-logos.sh in scripts; it checks src/ in src.
2. It writes to logos/ and manifest.json.
3. It commits logos/ and manifest.json, then pushes.
4. It opens an issue.
5. It opens a pull request.

## Who reads the results

- **logos/** is read by .claude/context/current-priorities.md (found by text), .github/SECURITY-CONTROLS.md (found by text), site/integrations/model-passthrough.mjs, site/scripts/check-deployed-bytes.mjs, site/src/content/docs/handbook/reference.md (found by text) and src (4 files).
- **manifest.json** is read by .github/workflows/ci.yml, site/integrations/model-passthrough.mjs, site/scripts/check-deployed-bytes.mjs, src/commands/add-gallery.ts, src/commands/audit.ts and src/commands/remove.ts.

## The other doors

**CI** runs scripts/check-audit-allowlist.mjs, tests/add-gallery.test.ts, tests/add-model.test.ts and 17 more, checks src/, reaches the site, and writes to logos/.

**Release** runs tests/add-gallery.test.ts, tests/add-model.test.ts, tests/audit.test.ts and 16 more, checks src/, reaches the site, writes to logos/, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, checks src/, and deploys the site.

**brand** (a command people run) runs src/cli.ts and writes to logos/.

## What breaks what

- **src** is imported by 1 part (the site), and by 1 more only from tests; it sits on the path of 5 doors.
- **the site** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.
- **logos/** is written by .github and src, and read by the site and src; a hand edit reaches every reader.
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

- **logos/** is written by .github/workflows/sync.yml and src/commands/remove.ts.
- **manifest.json** is written by .github/workflows/sync.yml.

## Hand-authored

People write .claude/, .githooks/, .github/, assets/, docs/ and site/; 20 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → scripts/check-audit-allowlist.mjs → site/integrations/model-passthrough.mjs → logos/

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 file uses syntax the parser cannot read, so what it imports is not known: a NUL character inside a string (1).
- 20 writes and 57 reads use paths built at run time and are not named here.
- 8 reads go to the directory the command is run in or the home directory, not to this repository.
- 8 commands are built at run time and not followed, 6 of them in tests.
- Readers marked (found by text) come from scanning unparsed files.
- Statistics confidence is low: fewer than 20 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
