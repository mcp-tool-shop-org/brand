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
