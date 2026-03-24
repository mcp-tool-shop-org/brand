# Current Priorities — @mcptoolshop/brand

## Status

Locked (Role OS lockdown 2026-03-24). Primary seam: identity truth.

## Classification

Lock candidate → locked.

## Seam family

Identity truth — same family as any system where canonical, derived, variant, and deprecated identity must be unambiguous.

## Must-preserve invariants (7)

1. **One canonical location per logo** — `logos/<slug>/readme.{png,jpg}`. No alternatives, no duplicates.
2. **Manifest is the integrity contract** — every canonical asset has a SHA-256 hash entry. CI enforces agreement.
3. **Distributed via immutable URL** — `raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/<slug>/readme.<ext>`. Git-backed immutability.
4. **Badge filtering is multi-gate** — README parser uses 3+ gates to distinguish logos from shields.io badges. No false rewrites.
5. **Format is a brand decision** — PNG vs JPEG is chosen per repo, not auto-converted. No format transformation in the pipeline.
6. **Sync is daily, automated, PR-based** — sync.yml pulls logos, regenerates manifest, opens PR. Never pushes directly to main.
7. **npm publish excludes logos** — published package includes CLI only, not the 148+ logo files.

## Banned detours

- Adding logo generation/transformation to the pipeline (the system stores and distributes, it does not create)
- Making manifest.json hand-editable for hash values (hashes must always be computed, never typed)
- Adding a second canonical location for logos (one location, one manifest)
- Removing CI manifest verification (the only automated integrity check)
- Making sync push directly to main (PR-based is the safety layer)
