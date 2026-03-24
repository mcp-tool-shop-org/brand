# Product Brief — @mcptoolshop/brand

## What this is

Centralized brand asset management for a GitHub org. Stores canonical logos in `logos/<slug>/readme.{png,jpg}`, tracks integrity via SHA-256 manifest, provides CLI for manifest generation, integrity verification, README logo auditing, and cross-repo README migration. Sync workflow pulls logos from org repos daily; CI verifies manifest integrity on every push.

## Type

CLI + asset repository (logos stored in git, CLI published to npm, integrity verified by CI)

## Core value

One canonical location per logo, one manifest tracking all hashes, one verification step in CI. Repos reference logos via raw.githubusercontent.com URLs — no local copies, no format ambiguity, no drift between what's in the brand repo and what READMEs reference.

## What it is not

- Not a design tool — does not generate, resize, or transform logos
- Not a style guide — stores assets and enforces integrity, not visual rules
- Not a CDN — serves via GitHub raw URLs (git-backed immutability, not edge caching)
- Not a complete brand system — covers README logos only, not app icons, social cards, or package metadata

## Anti-thesis (6 statements)

1. Must never let a derived, exported, or generated asset share the same canonical surface as an official logo — `logos/<slug>/readme.{png,jpg}` is the only canonical location
2. Must never let a stale reference persist without detection — audit must catch broken/outdated logo URLs
3. Must never generate a reference to a non-existent asset — migrate must verify the target file exists before producing a URL
4. Must never let manifest and actual files diverge silently — CI must catch drift
5. Must never have two collection strategies that produce different results without documenting the difference
6. Must never let non-image files under `logos/` go untracked — the manifest must account for everything in the canonical directory

## Highest-risk seam

**Identity truth** — the boundary where canonical assets, approved variants, and derived/referenced outputs must be unambiguous. The liar-paths are: migrate generating URLs to non-existent assets, dual collection strategies (sync vs collect) producing different logo sets, audit not running in CI (broken references persist), and manifest covering files but not non-image contaminants.
