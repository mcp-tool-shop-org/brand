<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/brand"><img src="https://img.shields.io/npm/v/@mcptoolshop/brand" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">
  Centralized brand asset registry for the <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop-org</a> GitHub org.<br>
  One repo holds every logo. Every README points here. Update once, update everywhere.
</p>

---

## Why

When every repo carries its own copy of the logo, you get duplication, drift, and inconsistency. A rebrand means hunting through 100+ repos. This repo fixes that — logos live here, READMEs reference them via `raw.githubusercontent.com` URLs.

## Structure

```
logos/
  <slug>/
    readme.png       # THE logo — one canonical image, format preserved as-is
    gallery/          # optional — a named collection of N extra showcase images
      side.png
      back.png
manifest.json     # SHA-256 integrity hashes for every asset, tagged role: primary | gallery
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Hundreds of logos across the org. PNGs stay PNGs. JPEGs stay JPEGs. Format is a brand decision, not a build target.

A slug's `readme.<ext>` is always the one canonical logo. A slug MAY also have one subfolder of additional showcase images (a sprite pack's character turnarounds, a tool's screenshot set) — the manifest tags each asset's `role` explicitly rather than treating every image file the same way. See [Galleries & Dynamic READMEs](#galleries--dynamic-readmes) below.

## CLI

```bash
npm install -g @mcptoolshop/brand

# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Show registry summary — counts, formats, sync status
brand stats
brand stats --json

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones

# Register a directory of images as a named gallery for a slug
brand add-gallery <slug> /path/to/turnarounds --dry-run
brand add-gallery <slug> /path/to/turnarounds

# Sync a consuming repo's README gallery block from the manifest
brand sync --slug <slug> --repos /path/to/clones --check
brand sync --slug <slug> --repos /path/to/clones
```

## Auto-Sync

A daily GitHub Action (`sync.yml`) scans every repo in the org for logos, downloads new or changed assets, regenerates the manifest, and opens a PR. You can also trigger it manually via `workflow_dispatch`.

The sync script lives at `scripts/sync-org-logos.sh` and can be run locally:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Setup (one-time, per fork)

The sync workflow opens a PR, so it needs permission to do that. Pick one of these in repo Settings:

1. **Enable Actions PR creation.** Settings -> Actions -> General -> "Allow GitHub Actions to create and approve pull requests" -> ON. Simplest path; no extra secrets to manage. ([GitHub docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Provide a `SYNC_PAT` repository secret.** Personal access token with `contents:write` + `pull-requests:write` scopes. This path also triggers downstream CI on the auto-PR (the default `GITHUB_TOKEN` does not).

Without one of these the daily workflow fails every morning at `gh pr create` with a permissions error.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `gh pr create` 403 | Neither setup option above is configured | Pick option 1 or 2 above |
| Daily workflow opens no PR, nothing changes | All org repos either have no logo, or the logos already match | Expected — no-op runs are healthy |
| Manifest verify failed | Logos downloaded but manifest hash mismatch | A `sync-failure` issue is auto-created; re-run `brand manifest && brand verify` locally |
| A sync PR introduces a bad logo | Upstream repo published a corrupted or wrong-content image | Revert the merge: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. See [SECURITY.md](SECURITY.md#incident-response) |

## Galleries & Dynamic READMEs

Some products need more than one showcase image per slug — a sprite pack's 8-direction character turnarounds, a tool's screenshot set. `brand` treats these as a first-class **gallery**, distinct from the one canonical logo, instead of an anonymous pile of extra files:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

To render that gallery into a **consuming repo's README** and keep it in sync as the gallery changes, drop a marker pair anywhere in the README:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Then run:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` regenerates everything between the markers from the manifest — deterministic, byte-identical output on every run with unchanged inputs, so it composes cleanly with CI. `--check` reports drift without writing (exit 1 if the README is stale, 0 if it's current) — wire it into a consuming repo's CI the same way `brand manifest --check` gates this one. This is a **dynamic README** section: hand-authored content around the markers is untouched; everything between them is machine-owned and safe to regenerate at any time. The `brand:gallery:` prefix is namespaced so future block types (badges, stats) can share a README without collision.

`brand audit` understands the difference too — a README with several gallery `<img>` tags for one slug is no longer flagged as a possible badge collision; if it isn't wired up to a marker block yet, `audit` nudges toward `brand sync` instead.

## Adding a Logo Manually

1. Drop the file into `logos/<slug>/readme.png` (or `.jpg`)
2. Run `brand manifest` to update integrity hashes
3. Commit both the logo and `manifest.json` together
4. CI verifies the manifest on push

## Security

| Aspect | Detail |
|--------|--------|
| **Data touched** | Logo and gallery image files in `logos/` (read), `manifest.json` (read/write), README files (read/write during migration and sync — `sync` only ever rewrites content between `brand:gallery:start`/`end` markers) |
| **Data NOT touched** | No telemetry, no analytics, no network calls (including `sync` — it's a pure function of the local manifest + local README), no code execution from logo/gallery files |
| **Permissions** | Read: logo/gallery files, manifest, READMEs. Write: manifest.json, READMEs (migrate/sync only) |
| **Network** | None — fully offline CLI tool |
| **Telemetry** | None collected or sent |

Every logo is tracked by SHA-256 hash in `manifest.json`. CI runs `brand manifest --check` on every push that touches `logos/` or `manifest.json`. Any mismatch — accidental overwrite, tampering, drift — fails the build. Only image files (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) are tracked; non-image files under `logos/` are ignored.

Vulnerability reports go to GitHub's [private advisory channel](https://github.com/mcp-tool-shop-org/brand/security/advisories/new). See [SECURITY.md](SECURITY.md) for the full policy and [docs/handbook.md](docs/handbook.md) for the migration handbook.

## Scorecard

| Category | Score |
|----------|-------|
| A. Security | 10 |
| B. Error Handling | 10 |
| C. Operator Docs | 10 |
| D. Shipping Hygiene | 10 |
| E. Identity (soft) | 10 |
| **Overall** | **50/50** |

Every D line is green — Node 20/22/24 matrix, SHA-pinned actions, `npm audit` step, Dependabot, tarball contents, and full tag/release/npm parity (resolved 2026-07-01 — v1.0.2/v1.0.3 never reached npm; retroactively tagged for git/CHANGELOG parity).

> Full audit: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## License

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
