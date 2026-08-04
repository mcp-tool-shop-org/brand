---
title: Security
description: What the SHA-256 manifest actually proves, what it does not, and the controls that cover the difference.
sidebar:
  order: 5
---

This page is deliberately blunt about the limits of the integrity model, because a security claim that is slightly too strong is worse than no claim at all — it stops people asking for the control that would actually help.

## What the manifest proves

`manifest.json` maps every tracked asset to a SHA-256 of its bytes. `brand verify` recomputes each hash and compares. `brand manifest --check` does the same as a CI gate, and the workflow runs it on every push touching `logos/` or `manifest.json`.

That reliably catches:

- **Accidental overwrite** — someone replaces a logo without realising it
- **Corruption** — a truncated or mangled file, a bad copy, a partial upload
- **Drift** — disk and manifest disagreeing after a half-finished change
- **A bad upstream image** — the daily sync pulls a corrupted or wrong-content logo from a source repo

These are the everyday failures, and they are the ones that actually happen. The manifest handles them well.

## What the manifest does not prove

**It cannot stop someone who can also regenerate it.**

Anyone with write access to this repository can swap a logo, run `brand manifest`, commit both changes together, and `brand verify` will pass. Nothing is broken — the tree really is internally consistent. That is the whole point: the hash proves *these bytes are the bytes the manifest records*, not *these bytes were approved by a maintainer*.

Integrity is not provenance. Conflating them is the most common way a hash-based control gets over-trusted.

So the honest statement of the threat model is:

> The manifest defends the registry against mistakes. It does not, by itself, defend it against anyone who holds write access — including a compromised CI token.

## What covers the difference

### The divergence tripwire

The daily sync workflow downloads every upstream repo's logo in order to compare it with the registry. That makes it an **independent witness**.

If a registry logo differs from its upstream source, the sync asks whether the last commit to touch that file was its own. A mismatch is reported — a labelled, deduplicated GitHub issue plus a line in the run summary — and is never silently overwritten and never auto-reverted, because destroying the evidence would defeat the purpose.

The property that matters: the comparison source is the org's repos, not this one. **Someone holding write access to this repository alone cannot suppress the signal.** Silencing it means compromising the upstream repos too.

Its limit, equally plainly: git commit author and message are self-reported and this repo does not require signed commits, so the "was it the bot?" check can be spoofed by anyone with write access. It raises the cost of the attack. It does not close the gap.

### Repository controls

These are the controls that genuinely close it, and none of them are cryptographic:

| Control | What it buys |
|---|---|
| `CODEOWNERS` + required review | A second human must approve any change to `logos/`, `manifest.json`, the workflows, or the scripts |
| `enforce_admins` | Nobody, including an administrator, pushes to `main` alone |
| Required signed commits | A commit is bound to a key rather than a self-reported name |

`.github/CODEOWNERS` exists in this repo. It is **advisory** until branch protection is configured to require code-owner review, and the file says so rather than implying protection it does not have. `.github/SECURITY-CONTROLS.md` tracks which of these are enabled, measured rather than assumed.

## Why there is no signature

Cosign and sigstore were considered and deliberately declined.

Consumers reference logos as `raw.githubusercontent.com/.../main/logos/<slug>/readme.png` — they fetch whatever is at `HEAD` and verify nothing. A signature that nobody checks does not protect anyone; it just moves the trust question somewhere less visible while looking like progress.

Signing becomes worth its complexity the moment there is consumer-side verification to consume it. Until that ships, it would be decoration. If you are evaluating this tool and signed provenance is a hard requirement for you, that is a real gap and this page is the honest place to find it.

## Reporting

Vulnerability reports go to GitHub's [private advisory channel](https://github.com/mcp-tool-shop-org/brand/security/advisories/new). Full policy, including incident response and the revert procedure, is in [`SECURITY.md`](https://github.com/mcp-tool-shop-org/brand/blob/main/SECURITY.md).
