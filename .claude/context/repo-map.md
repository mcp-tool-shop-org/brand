# Repo Map — @mcptoolshop/brand

## Stack

- TypeScript CLI published to npm (@mcptoolshop/brand)
- 148+ logos stored in `logos/<slug>/readme.{png,jpg}`
- SHA-256 manifest (manifest.json)
- GitHub Actions: CI (verify), sync (daily collection), pages (site), publish (npm)
- Vitest tests for manifest and README parser

## Primary seam: Identity truth

### Three laws this seam governs

**Canonical law:** `logos/<slug>/readme.{png,jpg}` is the single canonical location per repo. `manifest.json` is the integrity contract — every canonical asset has a SHA-256 hash, size, and format entry. CI runs `brand manifest --check` to enforce agreement.

**Variant law:** PNG vs JPEG is a brand decision, not a build target. Each repo has exactly one primary image. No resizing, no format conversion in the pipeline. Social preview (`social.png`) is optional and not manifest-tracked.

**Integrity law:** Sync collects logos from org repos (daily, root-only scan). Manifest regenerates after sync. CI verifies manifest on push. README migration rewrites local references to brand repo URLs.

### Contract surfaces

| Surface | Location | What it governs | Truth concern |
|---------|----------|-----------------|---------------|
| Manifest integrity | manifest.ts, ci.yml:54-55 | SHA-256 hash agreement between files and manifest | **OK** — CI enforces |
| Migrate URL generation | migrate.ts:37 | Assumes PNG if neither format found → generates 404 URL | **HIGH** — no existence check |
| Sync collection scope | sync-org-logos.sh:40 | Only scans repo root (not assets/) | **MEDIUM** — diverges from local collect |
| Audit integration | audit.ts | Detects broken refs, missing assets, indentation traps | **MEDIUM** — not in CI, manual only |
| Badge filtering | readme-parser.ts | Multi-gate filter: shields.io, <a> tags, &logo= params | **OK** — tested thoroughly |
| Non-image contamination | manifest.ts:60 | Silently ignores non-image files under logos/ | **LOW** — could confuse |

### Liar-path surfaces

| Path | Risk | Surface lie |
|------|------|------------|
| Migrate generates 404 URL | HIGH | README references a logo that doesn't exist in brand repo |
| Dual collection strategies diverge | MEDIUM | Sync-collected and locally-collected logos differ without documentation |
| Audit not in CI | MEDIUM | Broken logo references persist until manual audit |
| Sync/manifest window | LOW | Brief period where logos/ and manifest disagree (auto-fixed by sync.yml) |

## Validation

- `npm test` — Vitest (manifest integrity + README parser with badge-exclusion fixtures)
- `npm run build` — TypeScript compilation
- CI: `brand manifest --check` on every push to logos/ or manifest.json
