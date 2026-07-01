---
title: Getting Started
description: Install Brand and run your first integrity check.
sidebar:
  order: 1
---

## Install

```bash
npm install -g @mcptoolshop/brand
```

Requires Node.js 18 or later.

## Verify your logos

If you already have a `logos/` directory and `manifest.json`:

```bash
brand verify
```

This computes SHA-256 hashes for every image file under `logos/` and compares them against the stored manifest. You'll see a summary of verified, changed, added, and removed files.

## Generate a manifest

Starting fresh or added new logos? Regenerate the manifest:

```bash
brand manifest
```

This scans `logos/` for image files (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`), computes their hashes, and writes `manifest.json`.

## Run in CI

Use check mode to fail the build if the manifest is stale:

```bash
brand manifest --check
```

This is the recommended CI gate — it ensures every logo change is accompanied by a manifest update.

## Audit other repos

Point Brand at a directory of cloned repos to find broken logo references:

```bash
brand audit --repos /path/to/clones
```

The audit checks for:
- Broken `raw.githubusercontent.com` logo URLs
- shields.io badge URLs that look like brand logos (badge collision)
- Markdown indentation traps (4+ spaces creating code blocks)

## Migrate READMEs

Rewrite logo URLs in other repos to point at the brand repo:

```bash
# Preview changes first
brand migrate --repos /path/to/clones --dry-run

# Apply changes
brand migrate --repos /path/to/clones
```

The migration uses multi-gate regex to distinguish actual brand logos from shields.io badges and other image references. Always dry-run first.

## View registry stats

```bash
brand stats
brand stats --json
```

Shows total logo count, format breakdown (PNG vs JPEG vs SVG), and sync status.

## Register a gallery

Some products need more than one showcase image per slug (a sprite pack's character turnarounds, a tool's screenshot set). Register a directory of images as a gallery:

```bash
brand add-gallery <slug> /path/to/turnarounds --dry-run  # preview
brand add-gallery <slug> /path/to/turnarounds             # register + regenerate manifest
```

Re-run any time the source directory changes — `add-gallery` reconciles the gallery folder to match (adds, updates, and removes files) rather than only ever appending.

## Wire the gallery into a consuming README

Drop a marker pair anywhere in the consuming repo's README:

```html
<!-- brand:gallery:start slug="<slug>" -->
<!-- brand:gallery:end -->
```

Then regenerate the content between the markers from the manifest:

```bash
brand sync --slug <slug> --repos /path/to/clones --check   # CI gate: exit 1 on drift
brand sync --slug <slug> --repos /path/to/clones            # write it
```

See the [CLI Reference](/handbook/reference/#brand-add-gallery) for the full option list.
