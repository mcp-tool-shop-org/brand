---
title: Brand Handbook
description: Complete guide to the Brand centralized asset registry CLI.
sidebar:
  order: 0
---

Brand is a centralized brand asset registry for GitHub organizations. Instead of scattering logo copies across 100+ repos, Brand keeps every logo in one place with SHA-256 integrity verification.

## What Brand does

- **Collects** all org logos into a single `logos/` directory
- **Tracks** every asset with SHA-256 hashes in `manifest.json`
- **Verifies** integrity on every CI push — catches overwrites, drift, and tampering
- **Audits** repos for broken logo references, badge collisions, and Markdown traps
- **Migrates** README logo URLs to point at the brand repo

## How it works

Every logo lives under `logos/<slug>/readme.png` (or `.jpg`). The manifest maps each file to its hash, size, and format. CI runs `brand manifest --check` on every push — if any file has changed without the manifest being updated, the build fails.

When you need to update a logo across the org, you change one file and the raw.githubusercontent.com URLs that every repo references update automatically.

## Quick links

- [Getting Started](/brand/handbook/getting-started/) — install and first run
- [CLI Reference](/brand/handbook/reference/) — every command and option
- [For Beginners](/brand/handbook/beginners/) — new to Brand? start here
