# Brand Handbook

Lessons learned from centralizing brand assets across 80+ repos in a GitHub org. Everything in this handbook was discovered the hard way.

---

## 1. Why Centralize Brand Assets

When every repo carries its own copy of the logo, you end up with:

- **Duplication**: 50%+ of some repos is just the logo file, duplicated in root, assets/, site/, docs/
- **Drift**: Logos get out of sync when you rebrand — some repos have the old version for months
- **Inconsistency**: Different repos use different sizes, formats, or even different logos entirely

The fix: one repo holds all logos. Every README points to it. Update once, update everywhere.

## 2. Why Not Symlinks

Symlinks feel like the obvious answer. They're not.

- **GitHub web UI**: Shows symlinks as tiny text files, not the image they point to
- **GitHub ZIP downloads**: Symlinks degrade into plain text files containing the link target
- **Windows clones**: Symlinks may require admin/developer mode; otherwise they check out weirdly
- **npm publish**: Tarballs contain the symlink entry, but consumers don't have your monorepo's target path

Symlinks optimize filesystem layout. Links (URLs) optimize distribution and rendering. For brand assets, distribution wins.

## 3. Format Is a Brand Decision

Never convert a logo's format to save bytes. A PNG is a PNG because someone designed it at that resolution with that rendering in mind. A JPEG is a JPEG because that's what looks right on a dark background.

- Don't convert PNG to SVG "because it's smaller"
- Don't compress JPEGs "because the file is too big"
- Don't suggest format changes as optimization

The format is a product decision, not a build target.

## 4. Markdown Rendering Traps

GitHub's markdown renderer has specific behaviors that will break your images:

### 4+ spaces = code block

Any line indented by 4 or more spaces becomes a code block. Your `<img>` tag renders as literal text.

```
BAD (renders as code):
    <img src="logo.png" alt="Logo" width="400">

GOOD (renders as image):
  <img src="logo.png" alt="Logo" width="400">
```

### Blank lines inside HTML blocks

A blank line inside a `<p>` block can end the HTML context. The indented `<img>` on the next line then becomes a code block.

```
BAD:
<p align="center">

            <img src="logo.png">
</p>

GOOD:
<p align="center">
  <img src="logo.png" alt="Logo" width="400">
</p>
```

### Multi-line tag splits

Splitting an `<img>` tag across lines with misaligned attributes can break rendering. Keep it on one line.

## 5. Badge Collision Patterns

shields.io badge URLs often contain `&logo=` parameters (e.g., `&logo=dotnet`, `&logo=python`). Any regex that matches "logo" in an `<img>` src will hit these badges too.

### The `<a>` guard and its limits

Most badges are wrapped in `<a>` tags (they're clickable links). Excluding lines with `<a ` catches most badges. But some badges are standalone `<img>` tags — not linked anywhere. These slip through the `<a>` guard.

### Full exclusion list

To safely identify logos (not badges), skip any line containing:

- `<a ` (linked badge)
- `shields.io` (badge service)
- `/badge` (badge path)
- `actions/workflows` (CI status badge)
- `badge.svg` (badge file)

### The safe approach

Match on multiple signals, not just "contains logo":

1. Line has `<img` with `src="..."`
2. Line does NOT contain any badge pattern
3. The `src` value contains `logo` (brand indicator)

## 6. Migration Safety Protocol

Never run a mass migration without these steps:

1. **Dry run first**: Preview every change before touching any file
2. **Spot-check**: After dry run, manually verify 3-5 repos with different README patterns
3. **Test the regex**: Verify against known edge cases (badges, same-line `<p><img>`, JPEG logos)
4. **Single-line replacement**: The replacement must produce exactly one line of diff per file — one insertion, one deletion. If you see multi-line diffs, the replacement is injecting whitespace.
5. **Push incrementally**: Consider pushing a batch of 5 repos first, verify on GitHub, then push the rest

### The perl trap

When writing perl substitutions in bash scripts, **never** format the replacement string across multiple lines:

```perl
# BAD — injects literal newlines into the output
perl -i -pe "
  s{(pattern)}{
    replacement
  }gi
" file

# GOOD — single line, no whitespace injection
perl -i -pe 's{(pattern)}{replacement}gi' file
```

## 7. Git Operations at Scale

### Revert vs Reset

- **`git revert`**: Creates a new commit that undoes a previous commit. Safe for pushed commits. Preserves history.
- **`git reset --hard HEAD~1`**: Removes the last commit entirely. Only safe for **unpushed** commits. Rewrites history.

Never reset a pushed commit. Always revert.

### Branch protection awareness

Some repos have branch protection rules requiring PRs. A mass push will fail silently on these repos. Check for `push declined due to repository rule violations` in the output and create PRs for those repos.

### Commit messages

Use descriptive, searchable commit messages. If you need to revert a migration later, you'll search by commit message across 80+ repos.

## 8. Integrity Verification

The `manifest.json` file maps every logo to its SHA-256 hash. This protects against:

- **Accidental overwrites**: Someone replaces a logo without realizing it
- **Tampering**: A compromised CI or contributor swaps a logo for something malicious
- **Drift**: Logos change without anyone noticing

### How to verify

```
brand verify
```

This recomputes every hash and compares against the manifest. Any mismatch fails the check.

### How to rotate a logo safely

1. Replace the file in `logos/<slug>/`
2. Run `brand manifest` to update the manifest
3. Commit both the logo and the updated manifest together
4. CI will verify the manifest matches on push

### CI enforcement

The CI workflow runs `brand manifest --check` on every push that touches `logos/` or `manifest.json`. If the manifest is out of date, CI fails.

## 9. Serving Assets

### Phase 1: raw.githubusercontent.com

GitHub serves raw files from `raw.githubusercontent.com`. This works for most use cases but:

- Not a CDN — can be slow or throttled under heavy traffic
- 5-minute cache (Cache-Control: max-age=300)
- No custom headers or CORS control

Fine for README images across an org. Not suitable for a public-facing website with thousands of visitors.

### Phase 2: GitHub Pages

Serve the brand repo as a GitHub Pages site. Same files, but:

- CDN-backed (Fastly)
- Custom domain support
- Better caching
- CORS headers

Set up when you see flaky image loads or need branded URLs like `brand.yoursite.com/logos/...`.
