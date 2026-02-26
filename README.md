<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/brand"><img src="https://img.shields.io/npm/v/@mcptoolshop/brand" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

Centralized brand asset registry for the [mcp-tool-shop-org](https://github.com/mcp-tool-shop-org) GitHub org. One repo holds every logo. Every README points here. Update once, update everywhere.

## Why

When every repo carries its own copy of the logo, you get duplication, drift, and inconsistency. A rebrand means hunting through 80+ repos. This repo fixes that — logos live here, READMEs reference them via `raw.githubusercontent.com` URLs.

## Structure

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 80+ repos
```

81 logos across 81 repos. PNGs stay PNGs. JPEGs stay JPEGs. Format is a brand decision, not a build target.

## CLI

```bash
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

See [docs/handbook.md](docs/handbook.md) for the full story: why symlinks don't work, how badges collide with logo detection, the markdown rendering traps that break `<img>` tags, and the migration safety protocol.

## License

[MIT](LICENSE)
