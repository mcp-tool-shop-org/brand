---
title: For Beginners
description: New to Brand? Start here for a gentle introduction.
sidebar:
  order: 99
---

## What is this tool?

Brand is a CLI tool that keeps all your GitHub organization's logos in one place. Instead of each repo having its own copy of the logo (which leads to outdated logos, inconsistencies, and painful rebrands), Brand stores every logo centrally and uses SHA-256 hashes to make sure nothing gets accidentally changed or tampered with.

Think of it like a shared folder for logos — except it also checks that every logo is exactly what it should be, every time you push code.

## Who is this for?

- **Org maintainers** who manage multiple GitHub repos and want consistent branding
- **DevOps engineers** who want to automate brand asset management in CI
- **Anyone** who has tried to rebrand across dozens of repos and never wants to do it manually again

## Prerequisites

Before you start, you need:

- **Node.js 18 or later** — check with `node --version`
- **npm** — comes with Node.js
- **A GitHub org** with repos that have logos in their READMEs
- **Basic terminal skills** — you'll run commands in a terminal/command prompt

## Your first 5 minutes

### 1. Install Brand

```bash
npm install -g @mcptoolshop/brand
```

### 2. Check if it works

```bash
brand --version
```

You should see a version number like `1.0.3`.

### 3. Look at the logo registry

If you're in the brand repo directory:

```bash
brand stats
```

This shows how many logos are tracked, what formats they use, and whether the manifest is in sync.

### 4. Verify integrity

```bash
brand verify
```

This checks every logo against its stored SHA-256 hash. If everything matches, you'll see all green. If something changed, it tells you exactly which files are different.

### 5. Try an audit

Clone a few of your org's repos into a folder, then:

```bash
brand audit --repos /path/to/your/clones
```

This scans their READMEs for broken logo links, badge collisions, and Markdown formatting issues.

## Common mistakes

1. **Forgetting to update the manifest after adding a logo.** If you drop a new file into `logos/` but don't run `brand manifest`, CI will fail because the manifest is stale. Always run `brand manifest` after adding or replacing logos.

2. **Editing manifest.json by hand.** The manifest is generated — don't edit it manually. Use `brand manifest` to regenerate it. Hand-editing can introduce mismatched hashes that are hard to debug.

3. **Confusing shields.io badges with brand logos.** README badge URLs (like `img.shields.io/badge/...&logo=...`) look similar to brand logo URLs. The audit and migrate commands handle this automatically with multi-gate filtering, but be aware of it if you're manually inspecting results.

4. **Running migrate without --dry-run first.** The migrate command rewrites README files. Always preview with `--dry-run` before applying changes to avoid unexpected edits.

5. **Using non-image files in logos/.** Only image files (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) are tracked. Other file types in the `logos/` directory are silently ignored.

## Next steps

- [Getting Started](/brand/handbook/getting-started/) — detailed install and usage walkthrough
- [CLI Reference](/brand/handbook/reference/) — every command, option, and exit code

## Glossary

- **Manifest** — A JSON file (`manifest.json`) that maps every logo file to its SHA-256 hash, size, and format. Used for integrity verification.
- **SHA-256** — A cryptographic hash function. Brand uses it to create a unique fingerprint for each logo file so changes can be detected.
- **Badge collision** — When a shields.io badge URL contains `&logo=` parameters that look like brand logo references. Brand's filters distinguish these from actual logos.
- **Dry run** — Running a command in preview mode (`--dry-run`) to see what would change without actually modifying any files.
- **Slug** — The directory name under `logos/` for a specific repo's logo (e.g., `logos/my-tool/readme.png` — the slug is `my-tool`).
