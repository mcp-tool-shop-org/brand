# Workflow: Protect Brand Truth

**Repo:** @mcptoolshop/brand
**Seam:** Identity truth — the boundary where canonical assets, approved variants, and derived/referenced outputs must be unambiguous. No draft, variant, stale, or derived asset may share the same surface as the official brand asset unless it is actually official.

## What this workflow protects

The contract that canonical identity is unambiguous (one file per logo, one manifest for integrity), that references to canonical assets are valid (URLs point to existing files), and that the collection/distribution pipeline cannot silently produce wrong or missing identity.

## Automatic reject criteria (9)

A proposed change MUST be rejected if it:

1. **Makes canonical and derived assets share the same naming or placement** — puts non-canonical files in `logos/<slug>/` without manifest tracking, or puts canonical assets outside `logos/`
2. **Makes transparent/background-specific variants ambiguous** — introduces variants without clear naming that distinguishes them from the canonical `readme.{png,jpg}`
3. **Makes preview/export/mockup assets storable as official deliverables** — allows generated or temporary assets to be committed to `logos/` without going through the manifest pipeline
4. **Makes stale or superseded assets still read as current** — removes a logo without updating references, or changes a logo without manifest regeneration
5. **Makes usage rules exist only in prose without structural enforcement** — adds documentation about "use this logo for X" without audit/CI checks that enforce it
6. **Makes the migrate command generate references to non-existent assets** — produces URLs that 404 because the target file doesn't exist in the brand repo
7. **Makes the two collection strategies diverge without documentation** — changes sync or collect behavior without updating docs about their different scopes
8. **Makes asset bundles omit provenance** — publishes or distributes logo sets without manifest, version info, or hash verification
9. **Makes human-facing reassurance stronger while leaving machine-facing semantics unchanged** — e.g., audit says "all logos verified" when it only checked manifest integrity, not reference correctness (org-wide reassurance drift rule)

## The key question this workflow answers

**Can this pipeline cause draft, variant, stale, derived, or wrong-context brand assets to look canonical?**

### Currently: mostly no, with specific gaps

The manifest + CI verification pipeline is strong. The gaps are:
- Migrate can generate 404 URLs (no existence check)
- Audit is not in CI (broken references persist)
- Dual collection strategies can diverge

### Must maintain
- One canonical file per logo per repo
- Manifest as the only integrity contract
- CI verification on every push to logos/ or manifest.json
- Badge filtering that never false-matches shields.io as a logo

### Must never imply
- That "manifest verified" means "all README references are correct" (manifest checks files, not references)
- That sync captured all logos (it only checks repo root)
- That migrate rewrites are safe without checking target existence

## When to re-prove

Re-prove this workflow when:
- Logo naming conventions change
- Manifest schema changes
- New collection strategies are added
- Migrate URL pattern changes
- CI verification scope changes
