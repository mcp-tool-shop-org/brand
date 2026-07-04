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

**Checks performed:**
- Broken `raw.githubusercontent.com` logo URLs
- shields.io badge URLs that match brand logo patterns (badge collision)
- Markdown indentation traps (4+ leading spaces)

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

**Exit codes:** 0 success (synced, or `--check` found no drift); 1 drift detected (`--check` mode only); 2 operator error (missing README, missing marker, ambiguous gallery); 3 unexpected IO error.
