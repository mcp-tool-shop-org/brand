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

**Exit codes:** 0 if all hashes match, 1 if any mismatch found.

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
      "format": "png"
    }
  }
}
```

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

**Safety:** Always use `--dry-run` first. The migration uses multi-gate regex to skip shields.io badges and other non-brand image references.

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

**Output:** Total logo count, format breakdown, and manifest sync status.
