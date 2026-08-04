# Security Policy

## Reporting a Vulnerability

**For sensitive / security-impacting issues**, please use GitHub's private vulnerability reporting channel rather than public issues:

- **Private report:** [Open a security advisory](https://github.com/mcp-tool-shop-org/brand/security/advisories/new)

For **low-severity, non-sensitive bugs** (typos in docs, minor UX issues, etc.), a public [GitHub Issue](https://github.com/mcp-tool-shop-org/brand/issues) is fine.

### Response SLA

- **Acknowledgment:** within 72 hours of receipt
- **Initial assessment:** within 7 days (severity classification + scope confirmation)
- **Fix or mitigation:** target within 30 days for confirmed vulnerabilities; longer windows communicated explicitly

Please do not disclose details publicly until a fix has been released or 90 days have elapsed, whichever comes first.

**Critical disclosures (active exploitation, exposed secrets, supply-chain compromise):** 24-hour acknowledgment SLA. Use the private advisory channel above and mark the advisory as critical.

## Incident Response

If a malicious or unexpected change lands in the repo — for example, the daily auto-sync downloads a compromised logo from an upstream org repo and the resulting PR is merged before review — follow this recovery flow:

1. **Revert the offending merge.** From a clean clone of `main`:

   ```bash
   git revert <merge-sha>
   npm run build && node dist/cli.js manifest
   git add manifest.json logos/
   git commit --amend --no-edit
   git push
   ```

   Regenerating the manifest immediately after the revert keeps the integrity hashes in lockstep with the file tree on disk.

2. **Deprecate the poisoned version on npm.** If a bad release already reached the registry, mark it deprecated so installers see the warning:

   ```bash
   npm deprecate "@mcptoolshop/brand@<bad-version>" \
     "Security advisory <link-to-advisory>: do not use"
   ```

   Then cut a new patch version with the revert and publish via the normal release flow.

3. **Open a public security advisory** on this repo describing the issue, affected versions, and remediation. Link the advisory from CHANGELOG.md under the affected version with explicit "do not use" wording.

4. **Notify downstream consumers** through the security advisory channel. Consumers reference logos via `raw.githubusercontent.com` URLs at HEAD, so a revert on `main` propagates immediately for them — but consumers who installed the npm package need the deprecation notice.

5. **Post-mortem.** Every confirmed incident gets a short entry in [`docs/handbook.md`](docs/handbook.md) so the next maintainer can learn from it. Cover root cause, detection gap, and the hardening change applied.

## Scope

This is a brand asset management tool. Its threat model covers:

- **Integrity verification** — the SHA-256 manifest detects **accidental** change: an overwrite, a corrupted file, drift between disk and manifest, an upstream repo publishing a bad image. See the limit below — it does **not** stop a deliberate same-repo tamper.
- **Supply chain** — CI verifies manifest on every push; drift fails the build; workflow `uses:` pinned to commit SHAs; `npm audit --audit-level=high` runs in CI (with a time-boxed, reviewed exception file rather than an all-or-nothing wall); Dependabot tracks both npm and github-actions ecosystems
- **README migration safety** — dry-run mode, multi-gate regex filtering, badge collision guards
- **Auto-sync hardening** — `scripts/sync-org-logos.sh` enforces size cap (10 MB), timeout (30 s), and magic-byte MIME check on every downloaded asset; non-images are rejected
- **Divergence tripwire** — the daily sync compares each registry logo against its upstream repo. A registry copy that differs from upstream *without* an upstream change is reported (labelled issue + step summary), never silently overwritten. Because the comparison source is the org's repos, an attacker holding write access to **this** repo alone cannot suppress the signal.

### The limit of the manifest — read this before trusting it

**A SHA-256 manifest cannot defend against an attacker who can also regenerate it.** Anyone with write access to this repo can swap a logo, run `brand manifest`, and commit both; `brand verify` will then pass, because the hash proves the tree is *internally consistent*, not that it is *authentic*. Integrity here means "these bytes are the bytes the manifest records", not "these bytes were approved by a maintainer".

Closing that gap is a matter of repository controls, not hashing. `.github/SECURITY-CONTROLS.md` tracks which are enabled: required PR review with `CODEOWNERS`, `enforce_admins`, required signed commits, and the divergence tripwire above.

Cryptographic signing (cosign/sigstore) was deliberately **not** adopted: consumers fetch logos from `raw.githubusercontent.com` at HEAD and verify nothing, so a signature no one checks adds no protection. It becomes worthwhile only alongside consumer-side verification, which this tool does not yet ship.

## What This Project Does NOT Do

- No data collection or telemetry
- No code execution from logo files
- No network requests by default. The single exception is `brand audit --remote`, which is strictly opt-in: without that flag no network call is made, and the flag exists so an operator can audit a 100+ repo org without cloning all of it.
- No secrets or credentials in the codebase

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |
