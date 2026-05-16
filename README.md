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
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Hundreds of logos across the org. PNGs stay PNGs. JPEGs stay JPEGs. Format is a brand decision, not a build target.

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

## Adding a Logo Manually

1. Drop the file into `logos/<slug>/readme.png` (or `.jpg`)
2. Run `brand manifest` to update integrity hashes
3. Commit both the logo and `manifest.json` together
4. CI verifies the manifest on push

## Security

| Aspect | Detail |
|--------|--------|
| **Data touched** | Logo files in `logos/` (read), `manifest.json` (read/write), README files (read/write during migration) |
| **Data NOT touched** | No telemetry, no analytics, no network calls, no code execution from logo files |
| **Permissions** | Read: logo files, manifest, READMEs. Write: manifest.json, READMEs (migration only) |
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
| D. Shipping Hygiene | 9 |
| E. Identity (soft) | 10 |
| **Overall** | **49/50** |

D is 9/10 pending one follow-up: remote git tags only reach v1.0.1, but CHANGELOG documents v1.0.2 + v1.0.3 published. Every other D line is green — Node 20/22/24 matrix, SHA-pinned actions, `npm audit` step, Dependabot, tarball contents.

> Full audit: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## License

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
