# Brand Rules — @mcptoolshop/brand

## Tone

Integrity-first. The system stores, tracks, and distributes canonical brand assets. It does not generate, design, or assess visual quality. It ensures what is claimed to be the official logo actually is the official logo.

## Domain language

| Term | Meaning | Must not be confused with |
|------|---------|--------------------------|
| Canonical | The file at `logos/<slug>/readme.{png,jpg}` tracked in manifest.json | "Any logo file in the repo" |
| Manifest | SHA-256 hash index of all canonical assets, verified by CI | A "list of files" or "directory listing" |
| Migrate | Rewriting README logo references from local/old URLs to brand repo URLs | "Updating" or "refreshing" the logo itself |
| Sync | Daily automated collection of logos from org repos (root-only scan) | "Backup" or "mirror" |
| Audit | Scanning repos for broken logo references, missing assets, indentation traps | "Quality check" or "design review" |
| Verify | Comparing actual files to manifest hashes — detects tampering and drift | "Browsing" or "spot-checking" |

## Enforcement bans

- "all logos synced" without qualifying that sync only checks repo root (not assets/)
- "logo verified" when only manifest integrity was checked (not reference correctness)
- "brand-compliant" as a verdict (the system checks integrity, not visual compliance)
- "automatically distributed" when migrate requires explicit execution

### Contamination risks

1. **Completeness pretense** — implying sync captures all logos when it only checks repo root
2. **Reference pretense** — generating URLs to logos that don't exist (migrate without existence check)
3. **Verification scope pretense** — CI verifies manifest integrity but not README reference correctness (audit is manual)
4. **Canonical contamination** — non-image files under logos/ silently ignored, could confuse
5. **Collection strategy divergence** — sync (remote, root-only) and collect (local, assets-aware) can produce different sets
