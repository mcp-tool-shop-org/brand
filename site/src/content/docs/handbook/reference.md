---
title: CLI Reference
description: Complete reference for every Brand CLI command and option.
sidebar:
  order: 2
---

## brand verify

Verify logo integrity against the stored manifest.

```bash
brand verify [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--manifest <path>` | `manifest.json` | Path to the manifest file |
| `--logos <path>` | `logos` | Path to the logos directory |
| `--json` | `false` | Emit a single JSON object describing the verification result |

**Exit codes:** `0` all hashes match · `1` integrity mismatch (changed / added / removed) · `2` operator error (missing or malformed manifest) · `3` unexpected runtime / IO error.

**Output:** Lists verified, changed, added, and removed files.

---

## brand manifest

Regenerate `manifest.json` from current logo files.

```bash
brand manifest [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--logos <path>` | `logos` | Path to the logos directory |
| `--output <path>` | `manifest.json` | Output path for the manifest |
| `--check` | `false` | Check mode — exit 1 if manifest would change (for CI) |

**Tracked formats:** `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`. All other files under `logos/` are ignored.

**Manifest structure:**

```json
{
  "version": "1.0",
  "generated": "2026-01-15T10:30:00.000Z",
  "algorithm": "sha256",
  "assets": {
    "logos/my-tool/readme.png": {
      "hash": "sha256:abc123...",
      "size": 24576,
      "format": "png",
      "role": "primary"
    },
    "logos/my-tool/gallery/side.png": {
      "hash": "sha256:def456...",
      "size": 51200,
      "format": "png",
      "role": "gallery",
      "gallery": "gallery"
    }
  }
}
```

Every asset carries an explicit `role`: `"primary"` for the one canonical `readme.<ext>` at a slug's root, `"gallery"` for a file inside a direct subfolder of the slug (plus `gallery`, the subfolder name). The scan is bounded to these two levels — nesting deeper than one subfolder is not tracked. See [brand add-gallery](#brand-add-gallery) and [brand sync](#brand-sync) below.

---

## brand audit

Scan repos for broken logo references and common Markdown issues.

```bash
brand audit [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--repos <path>` | `.` | Parent directory containing repo clones |
| `--logos <path>` | `logos` | Path to the logos directory |
| `--brand-base <url>` | `https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main` | Base URL for brand assets |
| `--remote` | `false` | Audit against the live GitHub org over the network instead of local clones |
| `--org <org>` | `mcp-tool-shop-org` | Org(s) to check when `--remote` is set — comma-separated |

**Checks performed:**
- Broken `raw.githubusercontent.com` logo URLs
- shields.io badge URLs that match brand logo patterns (badge collision)
- Markdown indentation traps (4+ leading spaces)

### Auditing without clones

`--repos` expects local clones. Nobody clones a hundred repos to check their READMEs. `--remote` reads each repo over the GitHub API instead, running exactly the same checks against the same parser — one audit implementation, two sources.

```bash
export GH_TOKEN=...            # or GITHUB_TOKEN
brand audit --remote --org my-org
brand audit --remote --org org-one,org-two,my-user
```

**Network access is strictly opt-in.** Without `--remote`, `audit` makes no network call at all — this is the only command in the tool that can reach the network, and only when you ask it to. A missing token exits 2 and names both accepted environment variables. One repo failing degrades to a finding and the run continues; rate-limit responses stop further requests rather than hammering the API.

### Org reconciliation

`--remote` also answers a question nothing else in the tool could: **is this registry still describing reality?** Repos get renamed, archived, and deleted, and a registry quietly rots against them. Three findings come out of the comparison:

| Finding | Meaning |
|---------|---------|
| `org-repo-renamed` | The repo still exists under a new name — GitHub's redirect is followed and the **new** name is reported. This is not an orphan and is never reported as one. |
| `org-repo-archived` | The repo is archived. Its logo may still be wanted; that is your call. |
| `org-repo-not-found` | No repo under any given org. This is the real orphan. |

Nothing is deleted for you. Every finding points at `brand remove <slug>` as the follow-up, and the decision stays yours — automatic pruning of a registry against a partial view of an org is exactly how you lose an asset you meant to keep.

---

## brand migrate

Rewrite README logo references to point at the centralized brand repo.

```bash
brand migrate [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--repos <path>` | `.` | Parent directory containing repo clones |
| `--logos <path>` | `logos` | Path to the logos directory |
| `--brand-base <url>` | `https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos` | Base URL for brand logos |
| `--dry-run` | `false` | Preview changes without writing files |
| `--resume` | `false` | Restore any half-applied migration from a prior interrupted run before proceeding |
| `--json` | `false` | Emit a single JSON object describing the migration result |

**Safety:** Always use `--dry-run` first. The migration uses multi-gate regex to skip shields.io badges and other non-brand image references.

**Crash recovery:** `migrate` journals the original content of every README it touches to `.brand-migrate.journal.json` (under `--repos`) before writing, and drops the entry on success. If a run is interrupted (Ctrl-C, crash, power loss), re-run with `--resume` to restore the originals from the journal. On the next run after an interrupt, `migrate` prints a reminder when it finds a leftover journal.

**Debugging:** set `BRAND_DEBUG=1` to surface full stack traces on unexpected errors (exit 3) instead of the friendly one-line message.

---

## brand stats

Show brand asset registry summary.

```bash
brand stats [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--logos <path>` | `logos` | Path to the logos directory |
| `--manifest <path>` | `manifest.json` | Path to the manifest file |
| `--json` | `false` | Output as JSON instead of human-readable table |
| `--verbose` | `false` | List each gallery and its image count |

**Output:** Logo count, format breakdown, manifest sync status, and — when galleries exist — the primary/gallery role split (`Primary logos` vs `Gallery images (across N galleries)`). JSON adds `primaryCount`, `galleryCount`, and `galleries` (a `slug/gallery → count` map).

---

## brand add-gallery

Register a directory of images as a named gallery collection for a slug — explicit and idempotent, never inferred.

```bash
brand add-gallery <slug> <source-dir> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--gallery-name <name>` | `gallery` | Gallery subfolder name |
| `--order <files>` | — | Comma-separated original filenames in desired display order (must cover every image in `source-dir`) |
| `--dry-run` | `false` | Preview added/updated/removed files without modifying anything |
| `--logos <path>` | `logos` | Path to the logos directory |
| `--json` | `false` | Emit a single JSON object describing the result |

**Idempotent full resync:** re-running after `source-dir` changes reconciles the target folder to match — new files are added, changed files updated (compared by content hash, never file modification time), and files removed from `source-dir` are removed from the gallery too. Not append-only.

**Ordering:** defaults to a natural (numeric-aware) filename sort — never trusts directory-read order, which is platform-dependent. `--order` pins an explicit order via zero-padded numeric-prefix renaming, so the target folder's natural sort durably reproduces the requested order with no extra state file.

**Manifest:** regenerated automatically at the end of every real run — no separate `brand manifest` step needed.

---

## brand sync

Regenerate a consuming repo's README gallery block from the manifest.

```bash
brand sync --slug <slug> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--slug <slug>` | *(required)* | Slug whose gallery should be synced |
| `--gallery <name>` | auto-detected | Gallery subfolder name (required only if the slug has more than one) |
| `--repos <path>` | `.` | Parent directory containing repo clones |
| `--logos <path>` | `logos` | Path to the logos directory |
| `--manifest <path>` | `manifest.json` | Path to the manifest file |
| `--brand-base <url>` | `https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos` | Base URL for brand gallery images |
| `--check` | `false` | Check mode — report drift without writing (exit 1 on drift, for CI) |
| `--json` | `false` | Emit a single JSON object describing the result |

**Marker convention:** the consuming README needs a marker pair somewhere in it —

```html
<!-- brand:gallery:start slug="my-tool" -->
<!-- brand:gallery:end -->
```

`sync` regenerates everything between the markers from the manifest — deterministic, byte-identical output on every run with unchanged inputs. Hand-authored content outside the markers is untouched. No network calls: `sync` is a pure function of the local manifest plus the local README.

A marker inside a fenced or indented code block is documentation, not a live block, and is skipped. If that happens, `sync` tells you which line the marker was on and which line opened the code block — a marker that is present but ignored should never look identical to a marker you forgot to write.

---

## brand remove

Remove a slug's logo directory, or one gallery inside it.

```bash
brand remove <slug> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--gallery <name>` | *(none)* | Remove only this gallery, leaving the primary logo in place |
| `--yes` | `false` | Required to actually delete. Without it the command refuses and prints what it would have removed |
| `--dry-run` | `false` | Print exactly what would be removed and exit without touching anything |
| `--logos <path>` | `logos` | Path to the logos directory |
| `--json` | `false` | Emit a single JSON object describing the result |
| `--quiet` | `false` | Suppress human-readable output |

This is the only command that destroys assets, so it is deliberately awkward. `--yes` is mandatory for a real run, and the refusal message names the file count, the total bytes, and the exact command to re-run:

```bash
brand remove old-tool --dry-run     # see what would go
brand remove old-tool --yes         # actually remove it
```

The deletion is staged: the directory is renamed aside, the manifest is regenerated, and only then is the renamed copy deleted. If manifest regeneration fails, the original is restored. An unknown slug exits 2 and suggests near-matches rather than silently doing nothing.

**Exit codes:** `0` removed · `1` refused (missing `--yes`, or nothing to remove) · `2` operator error (unknown slug, invalid slug, bad `--logos`) · `3` unexpected.

---

## brand history

Show a slug's asset history from git — what changed, when, and to what.

```bash
brand history <slug> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--gallery <name>` | *(none)* | Narrow to one gallery's assets |
| `--limit <n>` | `20` | Maximum number of commits to show |
| `--logos <path>` | `logos` | Path to the logos directory |
| `--json` | `false` | Emit a single JSON object describing the result |
| `--quiet` | `false` | Summary only, no per-commit detail |

Each entry carries the short sha, ISO date, author, subject, and the asset's hash before → after, classified added / changed / removed. The hashes are `sha256:` values computed from the git blob, so they compare directly against `manifest.json`.

```bash
brand history my-tool
brand history my-tool --limit 5 --json
```

This is the fastest way to answer "when did this logo change, and to what?" without hand-reading `git log`. It reads local git only — no network.

**Exit codes:** `0` success · `2` operator error (unknown slug, not a git repository, git not installed, repository with no commits) · `3` unexpected.

**Exit codes:** 0 success (synced, or `--check` found no drift); 1 drift detected (`--check` mode only); 2 operator error (missing README, missing marker, ambiguous gallery); 3 unexpected IO error.
