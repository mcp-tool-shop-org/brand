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

117 logos across the org. PNGs stay PNGs. JPEGs stay JPEGs. Format is a brand decision, not a build target.

## CLI

```bash
npm install -g @mcptoolshop/brand

# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones
```

## Adding a New Logo

1. Drop the file into `logos/<slug>/readme.png` (or `.jpg`)
2. Run `brand manifest` to update integrity hashes
3. Commit both the logo and `manifest.json` together
4. CI verifies the manifest on push

## Security

Every logo is tracked by SHA-256 hash in `manifest.json`. CI runs `brand manifest --check` on every push that touches `logos/` or `manifest.json`. Any mismatch — accidental overwrite, tampering, drift — fails the build.

See [SECURITY.md](SECURITY.md) for the full security policy and [docs/handbook.md](docs/handbook.md) for the migration handbook.

## Security & Data Scope

| Aspect | Detail |
|--------|--------|
| **Data touched** | Logo files in `logos/` (read), `manifest.json` (read/write), README files (read/write during migration) |
| **Data NOT touched** | No telemetry, no analytics, no network calls, no code execution from logo files |
| **Permissions** | Read: logo files, manifest, READMEs. Write: manifest.json, READMEs (migration only) |
| **Network** | None — fully offline CLI tool |
| **Telemetry** | None collected or sent |

See [SECURITY.md](SECURITY.md) for vulnerability reporting and SHA-256 integrity features.

## Scorecard

| Category | Score |
|----------|-------|
| A. Security | 10 |
| B. Error Handling | 10 |
| C. Operator Docs | 10 |
| D. Shipping Hygiene | 10 |
| E. Identity (soft) | 10 |
| **Overall** | **50/50** |

> Full audit: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## License

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
