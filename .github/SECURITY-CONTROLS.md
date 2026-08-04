# Security controls — operator notes

This is an **internal, operator-facing** threat-model note: what the
integrity pipeline actually defends against, what it does not, and what
would need to change to close the gap. It is deliberately separate from
[`SECURITY.md`](../SECURITY.md), which is the public-facing vulnerability
reporting policy — edit that one for disclosure process, edit this one for
"what does our own control actually do."

State below was measured directly against this repo (branch protection API,
commit signature status, presence of CODEOWNERS), not estimated. Re-measure
before trusting a stale copy of this table.

## What the SHA-256 manifest actually defends against

`manifest.json` + `brand verify` (CI job `integrity` in
[`ci.yml`](workflows/ci.yml)) is a **consistency check**, and it is good at
exactly that:

- **Accidental overwrite or corruption** — a bad merge, a botched local edit,
  a truncated download, a disk error. Any of these change a logo's bytes
  without updating its hash in `manifest.json`, and `brand verify` catches
  the mismatch on the next CI run.
- **Drift between `logos/` and `manifest.json`** — a logo added or removed
  without regenerating the manifest. `verify` reports it as `added`/
  `removed`/`changed`, not silently.
- **An upstream org repo publishing a bad or unexpected image** — the daily
  sync ([`sync.yml`](workflows/sync.yml) +
  [`scripts/sync-org-logos.sh`](../scripts/sync-org-logos.sh)) rejects
  non-images (magic-byte / MIME check), enforces a 10 MB cap and a 30s
  timeout per download, and routes every change through a PR for human
  review before it reaches `main`.

## What it does NOT defend against

**A contributor, or CI itself, with write access to this repo.** If that
access is used to swap a logo file's bytes and then *also* regenerate
`manifest.json` (a single `brand manifest` invocation), the hash in the
manifest now matches the tampered file. `brand verify` passes. The manifest
proves internal consistency — that `logos/` agrees with `manifest.json` —
not provenance of what's actually in either one. This is true whether the
access came from a merged PR, a direct push, or a compromised CI run that
had write credentials.

This is not a hypothetical edge case being dismissed — it is the literal
scenario this document exists to name plainly, because the fix is not
"a better hash."

## Controls that would close (or narrow) that gap

| Control | Status today | What it would add |
|---|---|---|
| Required PR review | **Not enabled** — measured: 0 required reviews on the default branch | A second set of eyes on every change to `main`, including to `logos/`/`manifest.json`. Without this, a direct push (or a self-approved PR) bypasses review entirely. |
| CODEOWNERS ([`.github/CODEOWNERS`](CODEOWNERS)) | **File exists (this change), advisory only** | Scopes *whose* review matters for `/logos/**`, `/manifest.json`, `/.github/**`, `/scripts/**`. Has zero enforcement power on its own — see the file's own header. Only becomes a real gate once "Require review from Code Owners" is turned on above. |
| `enforce_admins: true` | **Not enabled** — measured: `false` | Without this, an org/repo admin (which includes anyone with direct push rights in practice) can bypass branch protection entirely, review requirements included. This is usually the actual gap, not the review rule itself. |
| Required signed commits | **Not enabled** — measured: 0 signed commits in history | Git commit `author`/`committer` fields are self-reported strings, not verified today. Anyone with write access can `git config user.name "github-actions[bot]"` and the commit looks identical to a real bot commit in `git log`, `gh api .../commits`, and the GitHub UI's non-verified view. Signed + verified commits (GPG/SSH, with "Require signed commits" enabled) would make that forgery cryptographically detectable. |
| Sync tripwire (this change) | **Enabled** — [`scripts/sync-org-logos.sh`](../scripts/sync-org-logos.sh) `last_commit_info_for_path()` + `.github/workflows/sync.yml` step `Open issue on suspicious logo divergence` | See below — an independent witness, not a replacement for the controls above. |

None of the "not enabled" rows above were turned on by this change —
enabling branch protection settings is the Director's call, and this
document only measures and reports state, per the constraint this change
shipped under. The gap is real until someone flips those settings.

### The sync tripwire, precisely

The daily sync already downloads every upstream org repo's actual logo to
compare against this registry's copy — that comparison is an **independent
witness** a same-repo tamper cannot silence, because silencing it requires
also compromising the ~87 upstream repos, not just this one.

When a registry copy differs from the freshly-downloaded upstream file, the
sync script asks: *was the most recent commit to touch this exact file on
the default branch the sync automation's own commit* (author
`github-actions[bot]`, message `chore: sync org logos ...`)? If yes, the
diff is fully explained by upstream changing again since the last sync —
normal. If no, something other than the sync workflow put the current bytes
into `logos/` before they were ever compared to upstream — flagged as
suspicious in the run summary and via a labelled, deduplicated GitHub issue
(`logo-divergence-suspicious`).

**Honestly stated limits, not hidden:**

- This is a heuristic on commit **authorship metadata**, which — per the
  "required signed commits" row above — is self-reported and not
  cryptographically verified today. A determined attacker with write access
  could set their commit's author name and message to imitate the bot and
  defeat this specific check.
- It raises the bar (the attacker must now also forge history convincingly
  across both fields) rather than closing the gap outright.
- The half of this tripwire that **cannot** be defeated by compromising only
  this repo is the upstream cross-reference itself: upstream's real content
  is what it is, independent of anything done here. The authorship check is
  the supporting, weaker signal on top of that.
- It does not auto-revert anything. A tripwire that silently "fixes" a
  suspicious divergence would destroy the evidence it exists to preserve —
  it reports, and leaves the sync PR to go through normal human review like
  any other day.

## Why cosign / sigstore was deliberately NOT adopted

Signing the manifest or the logo files with cosign/sigstore was considered
and rejected for now, for a specific reason: **consumers don't verify
anything today.** Every documented consumption path
(`raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/<slug>/...`,
referenced directly from other repos' READMEs — see
[`../SECURITY.md`](../SECURITY.md)'s incident-response section) fetches the
file at `HEAD` over plain HTTPS and uses it as-is. Nothing on the consuming
side checks a signature, a hash, or anything else.

A signature nobody checks adds no protection — it adds a signing step and a
false sense of rigor, without changing what an attacker who compromises this
repo can get a consumer to render. Signing becomes worthwhile the moment
there is a **consumer-side verification step** to pair it with (e.g. a
`brand-verify` action or library that downstream repos actually run before
trusting a fetched logo). Until that consumer-side half exists, the
cosign/sigstore investment would be pure theater. Revisit this the moment
consumer-side verification is on the roadmap, not before.
