import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';
import { findLogoImgTags, type LogoMatch } from '../utils/readme-parser.js';
import { findLogoFile, readManifest, type Manifest } from '../manifest.js';

interface AuditOptions {
  repos: string;
  logos: string;
  brandBase: string;
  /** Path to manifest.json, used to resolve asset roles (primary/gallery) for the multiple-logo-matches check. Defaults to 'manifest.json'. */
  manifest?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  /**
   * F-FEAT-audit-remote — audit against the live GitHub org over the
   * network instead of reading local clones under --repos. STRICTLY
   * opt-in: when this is falsy, runAudit never reads process.env for a
   * token and never calls fetchImpl/fetch — behavior is byte-identical to
   * the pre-remote implementation. This is the contract cli.ts's --remote
   * flag must preserve (no default: true, ever).
   */
  remote?: boolean;
  /**
   * F-FEAT-org-reconcile — GitHub org(s)/user(s) to check repos against
   * when `remote` is set. Comma-separated for multiple namespaces (the
   * registry spans mcp-tool-shop-org, dogfood-lab, and mcp-tool-shop) —
   * e.g. "mcp-tool-shop-org,dogfood-lab,mcp-tool-shop". Required (non-empty
   * after trimming/splitting) whenever `remote` is true; cli.ts should wire
   * a sensible default (e.g. "mcp-tool-shop-org") but runAudit itself fails
   * closed (exit 2) if it ends up empty.
   */
  org?: string;
  /**
   * Injectable fetch implementation used ONLY when `remote` is true.
   * Defaults to the runtime's global `fetch` (Node >=20 provides one — see
   * package.json engines). Tests inject a fixture-backed fake here so no
   * test in this repo ever touches the live network. NOT a CLI flag — this
   * exists purely for dependency injection / testability.
   */
  fetchImpl?: FetchLike;
}

interface AuditIssue {
  repo: string;
  file: string;
  issue: string;
  line?: number;
  detail?: string;
  severity?: 'high' | 'medium' | 'info';
  fix?: string;
}

/** Inherent severity per issue type. Consumers shouldn't have to re-derive this. */
const ISSUE_SEVERITY: Record<string, 'high' | 'medium' | 'info'> = {
  'indentation-trap': 'high',
  'multiple-logo-matches': 'high',
  'missing-brand-asset': 'high',
  'readme-unreadable': 'high',
  'local-logo-ref': 'medium',
  'no-logo-ref': 'medium',
  'no-readme': 'info',
  'unmanaged-gallery': 'info',
  // F-FEAT-org-reconcile — reconciliation findings. A confirmed miss (repo
  // truly gone/private) is the "real" orphan the audit exists to catch, so
  // it's high like missing-brand-asset. Renamed/archived are real drift
  // worth acting on but not urgent — GitHub's own redirect keeps a renamed
  // repo's old links working, and an archived repo isn't BROKEN, just
  // stale — so both are 'medium', matching local-logo-ref's precedent for
  // "should fix, not on fire."
  'org-repo-renamed': 'medium',
  'org-repo-archived': 'medium',
  'org-repo-not-found': 'high',
  // F-FEAT-audit-remote — a single repo's network call failed for reasons
  // unrelated to its actual existence (timeout, 5xx, DNS). Treated like
  // readme-unreadable: high severity, but per-repo (the run keeps going).
  'remote-fetch-failed': 'high',
};

/** One-line operator-facing fix hint per issue type. */
function fixHintFor(
  issue: string,
  ctx: { slug: string; brandUrl: string; count?: number; newName?: string },
): string {
  switch (issue) {
    case 'indentation-trap':
      return 'Fix: wrap in `<p>` to prevent markdown from rendering as code block.';
    case 'no-logo-ref':
      return `Fix: add \`<p align="center"><img src="${ctx.brandUrl}" alt="${ctx.slug}"></p>\` to README.md.`;
    case 'local-logo-ref':
      return 'Fix: run `brand migrate` to rewrite local logo references to the brand repo URL.';
    case 'missing-brand-asset':
      return 'Fix: add a `readme.<ext>` for this slug under the brand repo `logos/<slug>/` and regenerate the manifest.';
    case 'multiple-logo-matches':
      return 'Fix: keep one canonical logo `<img>` in the README; move badges to a separate row.';
    case 'no-readme':
      return 'Fix: add a `README.md` to this repo.';
    case 'readme-unreadable':
      return 'Fix: check file permissions / that the path is a regular file, then re-run.';
    case 'unmanaged-gallery':
      return `Fix: run \`brand sync --slug ${ctx.slug}\` to keep this gallery in sync automatically instead of hand-maintaining ${ctx.count ?? 'N'} individual <img> tags.`;
    case 'org-repo-renamed':
      return `Fix: GitHub redirects this to "${ctx.newName ?? '(new name unknown)'}" — not broken (yet), but the registry key is stale. Run \`brand remove ${ctx.slug}\` and re-onboard under the new name, or update your own records.`;
    case 'org-repo-archived':
      return `Fix: repo is archived — decide whether to keep tracking it, or run \`brand remove ${ctx.slug}\` to retire the registry entry.`;
    case 'org-repo-not-found':
      return `Fix: no matching repo found in the checked org(s) — confirm it's really gone (not just a typo'd --org), then run \`brand remove ${ctx.slug}\` to retire the registry entry. Never auto-deleted by audit itself.`;
    case 'remote-fetch-failed':
      return 'Fix: transient network/API failure for this repo only — re-run `brand audit --remote`; if it persists, check GH_TOKEN/GITHUB_TOKEN scope and https://www.githubstatus.com/.';
    default:
      return '';
  }
}

/** Resolved role for a single logo match, used by the multiple-logo-matches / unmanaged-gallery checks. */
type ResolvedRole = 'primary' | 'gallery' | 'unknown';

/**
 * Resolve a logo match's manifest role by stripping the brand-base prefix
 * from its src to get a manifest key (`logos/<slug>/<rest>`), then looking
 * that key up in the loaded manifest. Returns 'unknown' when the src doesn't
 * point at the brand repo (the local-logo-ref check already flags that case
 * separately) or when no manifest is available, or when the key isn't found.
 */
function resolveMatchRole(
  match: LogoMatch,
  slug: string,
  brandBase: string,
  manifest: Manifest | null,
): ResolvedRole {
  if (!manifest) return 'unknown';
  const prefix = `${brandBase}/logos/`;
  if (!match.src.startsWith(prefix)) return 'unknown';
  const tail = match.src.slice(prefix.length);
  const key = `logos/${tail}`;
  const entry = manifest.assets[key];
  if (!entry) return 'unknown';
  if (entry.role === 'primary' || entry.role === 'gallery') return entry.role;
  return 'unknown';
}

/** slug this manifest key's tail resolves to, used to confirm all gallery matches share one slug. */
function galleryGroupKey(match: LogoMatch, brandBase: string): string | null {
  const prefix = `${brandBase}/logos/`;
  if (!match.src.startsWith(prefix)) return null;
  const tail = match.src.slice(prefix.length);
  const slug = tail.split('/')[0];
  return slug ?? null;
}

// ---------------------------------------------------------------------------
// F-FEAT-audit-remote / F-FEAT-org-reconcile — GitHub network layer.
//
// Everything below is used ONLY when opts.remote is true. It is isolated
// here (rather than spread through runAudit) so the "no --remote => zero
// network code paths execute" contract is easy to verify by inspection: the
// local-clone loop in runAudit never references fetchImpl, GITHUB_API_BASE,
// or process.env.GH_TOKEN/GITHUB_TOKEN.
// ---------------------------------------------------------------------------

/** Minimal structural subset of the Fetch API's Response this file needs. Kept
 *  narrow (rather than importing DOM lib types) so tests can hand-build plain
 *  object fixtures instead of constructing real Response/Headers instances —
 *  real Response objects don't let you set `.redirected`/`.url` directly,
 *  which is exactly the signal rename-detection depends on (see
 *  checkRepoAcrossOrgs). Node's global fetch satisfies this shape as-is. */
interface MinimalResponse {
  status: number;
  /** True when the underlying fetch followed one or more redirects to get here — the rename-detection signal. */
  redirected: boolean;
  url: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

/** Fetch function shape this module depends on. `globalThis.fetch` (Node >=20) satisfies this structurally. */
type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<MinimalResponse>;

const GITHUB_API_BASE = 'https://api.github.com';

/** Per-request network timeout. GitHub's own API is fast; this bounds a hung
 *  connection so one bad repo can't stall the whole audit indefinitely. */
const DEFAULT_REMOTE_TIMEOUT_MS = 15_000;

/** Read GH_TOKEN or GITHUB_TOKEN from the environment (GH_TOKEN first, matching `gh` CLI's own precedence). */
function resolveGithubToken(): string | undefined {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || undefined;
}

/** Split a comma-separated --org value into a trimmed, de-duplicated, non-empty list. */
function parseOrgList(org: string): string[] {
  const seen = new Set<string>();
  for (const part of org.split(',')) {
    const trimmed = part.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/** GitHub's rate-limit reset header is UNIX epoch seconds; render as ISO for humans and JSON consumers alike. */
function formatRateLimitReset(header: string | null): string | null {
  if (!header) return null;
  const epochSeconds = Number(header);
  if (!Number.isFinite(epochSeconds)) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

/** True for GitHub's two rate/abuse-limiting signals: primary limit exhaustion (403) and secondary/abuse detection (429 or 403). */
function isRateLimitStatus(status: number): boolean {
  return status === 403 || status === 429;
}

/**
 * GET against the GitHub REST API with auth + the headers GitHub requires
 * (a missing User-Agent is itself a 403). Bounded by DEFAULT_REMOTE_TIMEOUT_MS
 * via AbortController so a hung connection can't stall the whole run.
 * Throws only for genuine network failures (DNS/TLS/timeout) — HTTP error
 * statuses (404/403/429/5xx) are returned normally for the caller to inspect,
 * since each status means something different here (not-found vs.
 * rate-limited vs. transient failure).
 */
async function ghFetch(
  fetchImpl: FetchLike,
  url: string,
  token: string,
  timeoutMs: number,
): Promise<MinimalResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mcptoolshop-brand-cli',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

type RepoStatus =
  | { kind: 'live'; org: string; archived: boolean }
  | { kind: 'renamed'; newFullName: string }
  | { kind: 'not-found' }
  | { kind: 'rate-limited'; resetAt: string | null }
  | { kind: 'failed'; message: string };

/**
 * Resolve a single registry slug's status against the configured org(s), in
 * order. A slug is tried against org N+1 ONLY when org N came back a clean
 * 404 ("definitely not here, but maybe over there") — a redirect, a live
 * hit, or a rate-limit signal all stop the search immediately, since those
 * are conclusive (or, for rate-limiting, make further calls pointless).
 *
 * A network/5xx failure on one org's attempt does NOT itself conclude
 * anything — it tries the remaining configured orgs before giving up. Only
 * if EVERY org either 404s or fails does this return 'failed' (if at least
 * one attempt was inconclusive) or 'not-found' (if every attempt was a clean
 * 404 — a confident classification, not a guess).
 */
async function checkRepoAcrossOrgs(
  slug: string,
  orgs: string[],
  fetchImpl: FetchLike,
  token: string,
  timeoutMs: number,
): Promise<RepoStatus> {
  let lastFailureMessage: string | null = null;

  for (const org of orgs) {
    let res: MinimalResponse;
    try {
      res = await ghFetch(fetchImpl, `${GITHUB_API_BASE}/repos/${org}/${slug}`, token, timeoutMs);
    } catch (err) {
      lastFailureMessage = `network error checking ${org}/${slug}: ${(err as Error).message}`;
      continue; // try the next configured org
    }

    if (isRateLimitStatus(res.status)) {
      return { kind: 'rate-limited', resetAt: formatRateLimitReset(res.headers.get('x-ratelimit-reset')) };
    }
    if (res.status === 404) {
      continue; // not in this org — try the next configured org
    }
    if (res.status >= 200 && res.status < 300) {
      if (res.redirected) {
        // GitHub's own rename-redirect: fetch followed it (default
        // redirect: 'follow'), so this 200 describes the NEW repo, not the
        // one we asked for by its old slug. full_name is the authoritative
        // new location — prefer it over parsing res.url.
        const body = (await res.json()) as { full_name?: string };
        return { kind: 'renamed', newFullName: body.full_name ?? `${org}/${slug} (new name unknown — API omitted full_name)` };
      }
      const body = (await res.json()) as { archived?: boolean };
      return { kind: 'live', org, archived: body.archived === true };
    }

    // Any other status (5xx, etc.) — inconclusive for this org; keep trying
    // the rest of the configured orgs before giving up.
    lastFailureMessage = `unexpected HTTP ${res.status} checking ${org}/${slug}`;
  }

  // Every configured org was tried. A leftover failure message means at
  // least one attempt was inconclusive (network/5xx) rather than a clean
  // "not here" — report that distinctly so it degrades per-repo instead of
  // being misreported as a confident orphan.
  if (lastFailureMessage) {
    return { kind: 'failed', message: lastFailureMessage };
  }
  return { kind: 'not-found' };
}

type ReadmeFetchResult =
  | { kind: 'ok'; name: string; content: string }
  | { kind: 'no-readme' }
  | { kind: 'rate-limited'; resetAt: string | null }
  | { kind: 'failed'; message: string };

/**
 * Fetch the canonical README GitHub's Contents API resolves for a repo
 * (case-insensitive README/README.md/README.rst/etc. — whatever GitHub
 * itself renders on the repo homepage), decoded from the API's base64
 * envelope. Only called after checkRepoAcrossOrgs has already confirmed the
 * repo is 'live' under a specific org, so this targets that exact (org,
 * slug) pair directly — no further org fallback here.
 */
async function fetchRemoteReadme(
  org: string,
  slug: string,
  fetchImpl: FetchLike,
  token: string,
  timeoutMs: number,
): Promise<ReadmeFetchResult> {
  let res: MinimalResponse;
  try {
    res = await ghFetch(fetchImpl, `${GITHUB_API_BASE}/repos/${org}/${slug}/readme`, token, timeoutMs);
  } catch (err) {
    return { kind: 'failed', message: `network error fetching README for ${org}/${slug}: ${(err as Error).message}` };
  }

  if (isRateLimitStatus(res.status)) {
    return { kind: 'rate-limited', resetAt: formatRateLimitReset(res.headers.get('x-ratelimit-reset')) };
  }
  if (res.status === 404) {
    return { kind: 'no-readme' };
  }
  if (res.status < 200 || res.status >= 300) {
    return { kind: 'failed', message: `unexpected HTTP ${res.status} fetching README for ${org}/${slug}` };
  }

  const body = (await res.json()) as { name?: string; content?: string; encoding?: string };
  if (!body.content) {
    return { kind: 'no-readme' };
  }
  const encoding = body.encoding ?? 'base64';
  try {
    const decoded =
      encoding === 'base64'
        ? Buffer.from(body.content.replace(/\n/g, ''), 'base64').toString('utf-8')
        : body.content;
    return { kind: 'ok', name: body.name ?? 'README.md', content: decoded };
  } catch (err) {
    return { kind: 'failed', message: `could not decode README content for ${org}/${slug}: ${(err as Error).message}` };
  }
}

/**
 * Run every per-README check the local-clone path has always run — logo
 * presence, indentation traps, stale local refs, missing brand assets,
 * badge-collision detection — against README content from ANY source. This
 * is what makes --remote "a new source for the same audit, not a second
 * audit implementation": local-clone mode and remote mode both funnel into
 * this exact function, so a fix to one of these checks fixes both sources at
 * once, and a repo whose live README has no logo reference surfaces via the
 * pre-existing 'no-logo-ref' issue below — no separate "remote no-logo"
 * concept needed.
 *
 * Mutates `issues` in place (matches this file's existing style of
 * accumulating findings into one shared array across the whole run).
 */
function runReadmeChecks(
  slug: string,
  readmeFile: string,
  content: string,
  opts: AuditOptions,
  manifest: Manifest | null,
  logosDir: string,
  issues: AuditIssue[],
): void {
  // Lines already flagged as an indentation-trap for THIS README, so the
  // raw-line scan below and the per-match scan further down never emit the
  // same trap twice. They overlap for a 4-space-indented bare <img> whose
  // previous line is non-blank: the parser's Gate 0b only treats an indented
  // line as a code block when the previous line is blank, so with a non-blank
  // predecessor the parser RETURNS the <img> as a logo match and BOTH scans
  // would otherwise fire on the same file:line.
  const trapLines = new Set<number>();

  // Independent indentation-trap scan — catches 4-space-indented <img> tags
  // that the parser correctly skips as "in a code block." Without this scan,
  // the very layout error the audit was designed to catch becomes invisible.
  const rawLines = content.split('\n');
  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    if (rawLine === undefined) continue;
    const trapMatch = rawLine.match(/^(\s{4,})<img\b/);
    if (trapMatch && !rawLine.trimStart().startsWith('<p')) {
      trapLines.add(i + 1);
      issues.push({
        repo: slug,
        file: readmeFile,
        issue: 'indentation-trap',
        line: i + 1,
        detail: `${trapMatch[1]?.length ?? 0} spaces of indentation — will render as code block`,
        severity: ISSUE_SEVERITY['indentation-trap'],
        fix: fixHintFor('indentation-trap', { slug, brandUrl: '' }),
      });
    }
  }

  // Check: does the README reference the brand repo?
  const logoMatches = findLogoImgTags(content);

  if (logoMatches.length === 0 && readmeFile === 'README.md') {
    const ext = findLogoFile(slug, logosDir)?.ext ?? 'png';
    const brandUrl = `${opts.brandBase}/logos/${slug}/readme.${ext}`;
    issues.push({
      repo: slug,
      file: readmeFile,
      issue: 'no-logo-ref',
      detail: 'No logo <img> tag found',
      severity: ISSUE_SEVERITY['no-logo-ref'],
      fix: fixHintFor('no-logo-ref', { slug, brandUrl }),
    });
    return;
  }

  for (const match of logoMatches) {
    // "Is this src already pointing at the brand repo?" must be derived
    // from the operator-settable --brand-base, not a hard-coded
    // 'brand/main/logos' literal — mirroring resolveMatchRole (above) and
    // galleryGroupKey, and matching migrate.ts's brandPrefix derivation
    // (its comment there explains this exact anti-pattern was deliberately
    // avoided). Otherwise a custom --brand-base (fork, different branch,
    // self-hosted mirror) can never be recognized as brand-pointed: its
    // README correctly points at the CUSTOM base but pointsAtBrand comes
    // back false, wrongly firing local-logo-ref AND silently disabling
    // the missing-brand-asset check below (which is gated on this flag).
    // Trailing slash on brandBase tolerated. F-d956cd15 — anchored via
    // startsWith + a trailing slash on the prefix itself, matching
    // resolveMatchRole/galleryGroupKey above exactly. The previous
    // unanchored `.includes(brandPrefix)` (no trailing slash) treated
    // brandPrefix as a substring found ANYWHERE in src, so a degenerate
    // --brand-base (empty, or short enough to coincidentally appear
    // inside an unrelated local path) could make a genuinely LOCAL
    // src="assets/logos/..." read as brand-pointed and silently suppress
    // local-logo-ref. Anchoring requires the match to appear at the
    // START of src, the same guarantee the sibling functions rely on.
    const brandPrefix = `${opts.brandBase.replace(/\/+$/, '')}/logos/`;
    const pointsAtBrand = match.src.startsWith(brandPrefix);

    // Check: is the src pointing at the brand repo?
    if (!pointsAtBrand) {
      issues.push({
        repo: slug,
        file: readmeFile,
        issue: 'local-logo-ref',
        line: match.line,
        detail: `Still points to: ${match.src}`,
        severity: ISSUE_SEVERITY['local-logo-ref'],
        fix: fixHintFor('local-logo-ref', { slug, brandUrl: '' }),
      });
    }

    // Check: indentation trap (4+ spaces before <img>). Skip if the raw-line
    // scan above already flagged this line, so a single indented <img> is
    // never double-counted.
    const lineContent = match.content;
    const leadingSpaces = lineContent.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (leadingSpaces >= 4 && !lineContent.trimStart().startsWith('<p') && !trapLines.has(match.line)) {
      trapLines.add(match.line);
      issues.push({
        repo: slug,
        file: readmeFile,
        issue: 'indentation-trap',
        line: match.line,
        detail: `${leadingSpaces} spaces of indentation — will render as code block`,
        severity: ISSUE_SEVERITY['indentation-trap'],
        fix: fixHintFor('indentation-trap', { slug, brandUrl: '' }),
      });
    }

    // Check: brand URL that 404s (format mismatch) — probe all supported extensions
    if (pointsAtBrand && !findLogoFile(slug, logosDir)) {
      issues.push({
        repo: slug,
        file: readmeFile,
        issue: 'missing-brand-asset',
        line: match.line,
        detail: `Brand asset not found for slug: ${slug}`,
        severity: ISSUE_SEVERITY['missing-brand-asset'],
        fix: fixHintFor('missing-brand-asset', { slug, brandUrl: '' }),
      });
    }
  }

  // Check: multiple logo matches (possible badge collision) — but a
  // README with N legitimate gallery images for the SAME slug is not a
  // collision. Resolve each match's manifest role and only flag when:
  //   - more than one match resolves to role "primary", OR
  //   - there's a mix of a resolvable match alongside an unresolvable/
  //     unknown-role match (the genuinely ambiguous "can't tell" case).
  // When every match beyond the first resolves cleanly to "gallery" for
  // one slug, emit the informational unmanaged-gallery nudge instead.
  //
  // Safe degrade: when the manifest itself couldn't be loaded (missing or
  // unparseable — see the try/catch above), there is no role information
  // available for ANY match, so fall back to the pre-fix behavior of
  // flagging any >1 logo matches as a possible collision, rather than
  // running the mix-detection heuristic against an all-"unknown" roles
  // array (which would incorrectly look like "no ambiguous mix").
  if (logoMatches.length > 1 && !manifest) {
    issues.push({
      repo: slug,
      file: readmeFile,
      issue: 'multiple-logo-matches',
      detail: `${logoMatches.length} logo <img> tags found — possible badge collision`,
      severity: ISSUE_SEVERITY['multiple-logo-matches'],
      fix: fixHintFor('multiple-logo-matches', { slug, brandUrl: '' }),
    });
  } else if (logoMatches.length > 1) {
    const roles = logoMatches.map(m => resolveMatchRole(m, slug, opts.brandBase, manifest));
    const primaryCount = roles.filter(r => r === 'primary').length;
    const galleryCount = roles.filter(r => r === 'gallery').length;
    const unknownCount = roles.filter(r => r === 'unknown').length;

    // Ambiguous whenever at least one match's role can't be resolved —
    // whether that unknown sits alongside a resolved match (a genuine
    // mix) or every match is unresolved (manifest loaded fine but none
    // of these srcs correspond to a known asset). Either way we can't
    // prove "this is a managed gallery," so conservatively flag it.
    const hasAmbiguousMix = unknownCount > 0;
    const isCollision = primaryCount > 1 || hasAmbiguousMix;

    if (isCollision) {
      issues.push({
        repo: slug,
        file: readmeFile,
        issue: 'multiple-logo-matches',
        detail: `${logoMatches.length} logo <img> tags found — possible badge collision`,
        severity: ISSUE_SEVERITY['multiple-logo-matches'],
        fix: fixHintFor('multiple-logo-matches', { slug, brandUrl: '' }),
      });
    } else if (galleryCount === logoMatches.length && galleryCount > 1) {
      // All matches resolve to gallery role — confirm they share one slug
      // before treating this as a managed gallery (defensive; in practice
      // resolveMatchRole already scoped the lookup to this slug's prefix).
      const slugs = new Set(logoMatches.map(m => galleryGroupKey(m, opts.brandBase)));
      if (slugs.size === 1 && slugs.has(slug)) {
        issues.push({
          repo: slug,
          file: readmeFile,
          issue: 'unmanaged-gallery',
          detail: `${logoMatches.length} logo <img> tags all resolve to gallery images for "${slug}" — hand-maintained instead of synced`,
          severity: ISSUE_SEVERITY['unmanaged-gallery'],
          fix: fixHintFor('unmanaged-gallery', { slug, brandUrl: '', count: logoMatches.length }),
        });
      } else {
        // Gallery images span more than one slug — genuinely unexpected;
        // conservatively fall back to flagging it as a collision.
        issues.push({
          repo: slug,
          file: readmeFile,
          issue: 'multiple-logo-matches',
          detail: `${logoMatches.length} logo <img> tags found — possible badge collision`,
          severity: ISSUE_SEVERITY['multiple-logo-matches'],
          fix: fixHintFor('multiple-logo-matches', { slug, brandUrl: '' }),
        });
      }
    }
    // else: e.g. exactly one primary + rest gallery, or other clean
    // combinations that aren't a collision and aren't an unmanaged
    // gallery — no issue emitted.
  }
}

export async function runAudit(opts: AuditOptions): Promise<void> {
  const logosDir = opts.logos;
  const issues: AuditIssue[] = [];

  // Guard the input directories up front. A missing/mistyped --logos or --repos
  // (defaults are the relative `logos` and `.`, so a wrong cwd triggers it) must
  // be an operator error (exit 2) — NOT a cheerful "0 repos checked, no issues"
  // green pass that silently inspected nothing on a release gate.
  //
  // F-FEAT-audit-remote: --repos is meaningless in --remote mode (no local
  // clones are ever read), so it is deliberately excluded from this guard
  // when opts.remote is set — a stale/default --repos value must never
  // block a remote run. This is the ONLY change to this guard for remote
  // mode; the --logos check (the registry itself, which IS always local)
  // still applies unconditionally.
  const dirChecks: ReadonlyArray<readonly [string, string]> = opts.remote
    ? [['--logos', logosDir]]
    : [['--logos', logosDir], ['--repos', opts.repos]];
  for (const [flag, dir] of dirChecks) {
    if (!existsSync(dir)) {
      const which = flag === '--logos' ? 'logos' : 'repos';
      const message = `${which} directory not found: ${dir} — pass ${flag} <path> or run from the brand repo root.`;
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'dir-not-found', flag, path: dir, message }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${message}\n`));
      }
      // F-f4900c6e — exitCode instead of exit() right after a stdout write
      // (see verify.ts's F-f0c1a1f8 for the full rationale: process.exit()
      // does not wait for a piped stdout write to flush). The explicit
      // return matters here too: without it, the for-loop keeps checking the
      // remaining [flag, dir] pairs and could overwrite this exitCode.
      process.exitCode = 2;
      return;
    }
  }

  // F-d956cd15 — an empty --brand-base (e.g. an unset CI template variable
  // interpolated into the flag) must fail closed, the same as a missing
  // --logos/--repos above, instead of silently letting the pointsAtBrand
  // prefix check below degrade to a near-empty fragment that matches almost
  // any src. Whitespace-only counts as empty too (trim before checking).
  if (!opts.brandBase || opts.brandBase.trim() === '') {
    const message = '--brand-base must not be empty — pass a real base URL, or omit the flag to use the default.';
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'bad-flag', flag: '--brand-base', message }, null, 2) + '\n');
    } else {
      console.error(chalk.red(`\n  ✗ ${message}\n`));
    }
    process.exitCode = 2;
    return;
  }

  // F-FEAT-audit-remote / F-FEAT-org-reconcile preflight. Only reached when
  // opts.remote is truthy — a plain `brand audit` (no --remote) never
  // executes this block, so it never reads process.env.GH_TOKEN/GITHUB_TOKEN
  // and never resolves fetchFn. This IS the "strictly opt-in, zero network
  // calls without the flag" contract.
  let orgs: string[] = [];
  let token = '';
  // Only ever read inside `if (opts.remote)` branches below, at which point
  // it is guaranteed assigned (set unconditionally at the end of this same
  // preflight block, every time opts.remote is true). Typed optional +
  // asserted at each read site, rather than a placeholder value, so there's
  // no fake "empty" FetchLike sitting around that could be called by accident.
  let fetchFn: FetchLike | undefined;
  if (opts.remote) {
    const resolvedToken = resolveGithubToken();
    if (!resolvedToken) {
      const message = '--remote requires a GitHub token — set the GH_TOKEN or GITHUB_TOKEN environment variable and retry.';
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'missing-token', message }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${message}\n`));
      }
      process.exitCode = 2;
      return;
    }
    token = resolvedToken;

    orgs = opts.org ? parseOrgList(opts.org) : [];
    if (orgs.length === 0) {
      const message = '--remote requires --org <org> (the GitHub org/user to check repos against; comma-separate for multiple).';
      if (opts.json) {
        process.stdout.write(JSON.stringify({ ok: false, error: 'bad-flag', flag: '--org', message }, null, 2) + '\n');
      } else {
        console.error(chalk.red(`\n  ✗ ${message}\n`));
      }
      process.exitCode = 2;
      return;
    }

    fetchFn = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  // Coverage accounting: `inspected` counts slugs whose clone actually existed
  // under --repos (local mode) or whose repo+README were successfully
  // confirmed live (remote mode); `skippedNoClone` counts those that did not
  // (local: no clone; remote: renamed/archived/not-found/failed/rate-limited).
  // Reporting both (instead of the raw slug count as "repos checked") stops a
  // wrong --repos/--org from reading as full coverage — see the clean-run
  // message below.
  let inspected = 0;
  let skippedNoClone = 0;

  // F-FEAT-org-reconcile reconciliation tallies (remote mode only; stay 0
  // and are omitted from output entirely in local mode).
  let renamedCount = 0;
  let archivedCount = 0;
  let notFoundCount = 0;

  // F-FEAT-audit-remote — "report clearly, don't hammer": once the API
  // signals rate/abuse-limiting (403/429), stop issuing further requests
  // entirely rather than continuing to fail identically against every
  // remaining slug. Whatever was collected before the limit hit is still
  // reported; the run is just marked incomplete (exit 3) instead of a
  // false clean/partial pass.
  let rateLimited = false;
  let rateLimitResetAt: string | null = null;
  let skippedDueToRateLimit = 0;

  // Load the manifest once per run so the multiple-logo-matches check can
  // distinguish "N legitimate gallery images" from "a real badge collision."
  // Safe degrade: if the manifest is missing or unparseable, fall back to the
  // OLD flag-everything behavior for role resolution (manifest stays null,
  // resolveMatchRole returns 'unknown' for everything) rather than crashing
  // the whole audit.
  const manifestPath = opts.manifest ?? 'manifest.json';
  let manifest: Manifest | null = null;
  try {
    manifest = readManifest(manifestPath);
  } catch {
    manifest = null;
  }

  // Get all logo slugs (include dot-prefixed dirs so .legacy/ etc. are visible to audit)
  const slugDirs = globSync('*/', { cwd: logosDir, dot: true }).map(d => d.replace(/\/$/, ''));

  for (const slug of slugDirs) {
    // F-FEAT-audit-remote — once rate-limited, every remaining slug is
    // counted as skipped without issuing another request ("don't hammer").
    if (opts.remote && rateLimited) {
      skippedNoClone++;
      skippedDueToRateLimit++;
      continue;
    }

    if (opts.remote) {
      const status = await checkRepoAcrossOrgs(slug, orgs, fetchFn!, token, DEFAULT_REMOTE_TIMEOUT_MS);

      if (status.kind === 'rate-limited') {
        rateLimited = true;
        rateLimitResetAt = status.resetAt;
        skippedNoClone++;
        skippedDueToRateLimit++;
        continue;
      }

      if (status.kind === 'renamed') {
        renamedCount++;
        skippedNoClone++;
        issues.push({
          repo: slug,
          file: '-',
          issue: 'org-repo-renamed',
          detail: `Registry slug "${slug}" now resolves to "${status.newFullName}" via GitHub's rename redirect — this is a move, not a deletion.`,
          severity: ISSUE_SEVERITY['org-repo-renamed'],
          fix: fixHintFor('org-repo-renamed', { slug, brandUrl: '', newName: status.newFullName }),
        });
        continue;
      }

      if (status.kind === 'not-found') {
        notFoundCount++;
        skippedNoClone++;
        issues.push({
          repo: slug,
          file: '-',
          issue: 'org-repo-not-found',
          detail: `No repo named "${slug}" found in ${orgs.join(', ')} (checked as both an exact match and via rename-redirect) — deleted, private, or living outside the checked org(s).`,
          severity: ISSUE_SEVERITY['org-repo-not-found'],
          fix: fixHintFor('org-repo-not-found', { slug, brandUrl: '' }),
        });
        continue;
      }

      if (status.kind === 'failed') {
        // brand-core-03's precedent (one unreadable local README must not
        // abort the run) applies identically here: one repo's network
        // failure is a finding, not a run-ending exception.
        skippedNoClone++;
        issues.push({
          repo: slug,
          file: '-',
          issue: 'remote-fetch-failed',
          detail: `Could not confirm repo status for "${slug}": ${status.message}`,
          severity: ISSUE_SEVERITY['remote-fetch-failed'],
          fix: fixHintFor('remote-fetch-failed', { slug, brandUrl: '' }),
        });
        continue;
      }

      // status.kind === 'live'
      if (status.archived) {
        archivedCount++;
        skippedNoClone++;
        issues.push({
          repo: slug,
          file: '-',
          issue: 'org-repo-archived',
          detail: `Repo "${status.org}/${slug}" is archived.`,
          severity: ISSUE_SEVERITY['org-repo-archived'],
          fix: fixHintFor('org-repo-archived', { slug, brandUrl: '' }),
        });
        continue;
      }

      inspected++;
      const readmeResult = await fetchRemoteReadme(status.org, slug, fetchFn!, token, DEFAULT_REMOTE_TIMEOUT_MS);

      if (readmeResult.kind === 'rate-limited') {
        rateLimited = true;
        rateLimitResetAt = readmeResult.resetAt;
        issues.push({
          repo: slug,
          file: '-',
          issue: 'remote-fetch-failed',
          detail: `Rate limited before the README could be fetched for "${status.org}/${slug}".`,
          severity: ISSUE_SEVERITY['remote-fetch-failed'],
          fix: fixHintFor('remote-fetch-failed', { slug, brandUrl: '' }),
        });
        continue;
      }

      if (readmeResult.kind === 'failed') {
        issues.push({
          repo: slug,
          file: '-',
          issue: 'remote-fetch-failed',
          detail: `Could not fetch README for "${status.org}/${slug}": ${readmeResult.message}`,
          severity: ISSUE_SEVERITY['remote-fetch-failed'],
          fix: fixHintFor('remote-fetch-failed', { slug, brandUrl: '' }),
        });
        continue;
      }

      if (readmeResult.kind === 'no-readme') {
        issues.push({
          repo: slug,
          file: '-',
          issue: 'no-readme',
          detail: 'No README found via the GitHub API',
          severity: ISSUE_SEVERITY['no-readme'],
          fix: fixHintFor('no-readme', { slug, brandUrl: '' }),
        });
        continue;
      }

      // readmeResult.kind === 'ok' — same per-README checks local-clone mode
      // has always run (findLogoImgTags, indentation-trap, local-logo-ref,
      // missing-brand-asset, multiple-logo-matches/unmanaged-gallery). A live
      // repo whose README has no brand logo surfaces here as the pre-existing
      // 'no-logo-ref' finding — "repo exists but has no logo" falls out of
      // reusing this function rather than needing its own issue type.
      runReadmeChecks(slug, readmeResult.name, readmeResult.content, opts, manifest, logosDir, issues);
      continue;
    }

    // ------------------------------------------------------------------
    // Local-clone mode (unchanged from pre-remote behavior).
    // ------------------------------------------------------------------
    const repoDir = join(opts.repos, slug);
    if (!existsSync(repoDir)) { skippedNoClone++; continue; }
    inspected++;

    // Find README files
    const readmes = globSync('README*.md', { cwd: repoDir });

    if (readmes.length === 0) {
      issues.push({
        repo: slug,
        file: '-',
        issue: 'no-readme',
        detail: 'No README.md found',
        severity: ISSUE_SEVERITY['no-readme'],
        fix: fixHintFor('no-readme', { slug, brandUrl: '' }),
      });
      continue;
    }

    for (const readmeFile of readmes) {
      const readmePath = join(repoDir, readmeFile);
      let content: string;
      try {
        content = readFileSync(readmePath, 'utf-8');
      } catch (err) {
        // One unreadable README (EACCES, EISDIR, or a TOCTOU removal between the
        // glob above and this read) must not vaporize the whole run and discard
        // every finding already collected — mirror migrate.ts's per-file
        // resilience. Record it as a blocking finding and keep walking.
        const e = err as NodeJS.ErrnoException;
        issues.push({
          repo: slug,
          file: readmeFile,
          issue: 'readme-unreadable',
          detail: `could not read README: ${e.message}${e.code ? ` (${e.code})` : ''}`,
          severity: ISSUE_SEVERITY['readme-unreadable'],
          fix: fixHintFor('readme-unreadable', { slug, brandUrl: '' }),
        });
        continue;
      }

      runReadmeChecks(slug, readmeFile, content, opts, manifest, logosDir, issues);
    }
  }

  // Severity-gated exit: only high/medium findings fail the audit. Pure
  // info-severity results (e.g. no-readme, unmanaged-gallery) are surfaced
  // but must not flip a clean run to exit 1 — that would defeat the point of
  // making unmanaged-gallery an informational nudge rather than a hard fail.
  const blockingIssues = issues.filter(i => i.severity !== 'info');

  // F-09eddfab — full-skip: every slug had no local clone under --repos, so
  // NOTHING was actually inspected. Previously this fell through to the same
  // ok:true / exit-0 clean-pass path as a genuinely fully-inspected run, so a
  // CI checkout step that silently failed (or a --repos pointed at the wrong
  // path) got a permanent, indistinguishable-from-clean green light on the
  // release gate — even though the reposChecked/skippedNoClone accounting
  // existed specifically to make a wrong --repos visible. Treat it as a
  // distinct operator/config error (exit 2), the same class already used for
  // a missing --logos/--repos directory above, instead of folding it into
  // the "no issues found" success path. (issues.length is guaranteed 0 here:
  // inspected === 0 means the per-slug loop `continue`d for every slug
  // before it could ever push a finding.)
  //
  // F-FEAT-audit-remote / F-FEAT-org-reconcile: local mode's invariant
  // "inspected === 0 implies issues.length === 0" (see the comment above)
  // does NOT hold in remote mode — a slug classified renamed/archived/
  // not-found never gets to the README-inspection step (inspected stays 0
  // for it) but DOES push a real, actionable reconciliation issue. Requiring
  // issues.length === 0 too keeps this guard scoped to its actual purpose —
  // "we have ZERO information, possibly because --org is a typo" — without
  // swallowing a genuinely-drifted registry's real findings (which must
  // surface via the normal severity-gated exit 1 path below, not get
  // relabeled as an exit-2 operator error just because no repo was live
  // enough to reach a README). A wrong --org still can't hide as a clean
  // pass: it produces N org-repo-not-found issues instead of silence, which
  // is the same non-silent outcome this guard exists to guarantee — it just
  // arrives via a different, already-correct path (blockingIssues > 0).
  // This conjunct is a no-op for every existing local-mode case, since a
  // missing local clone never pushes an issue (the only way inspected can
  // be 0 there).
  const fullSkip = skippedNoClone > 0 && inspected === 0 && slugDirs.length > 0 && issues.length === 0;

  // JSON mode: single object on stdout, nothing else. `reposChecked` now
  // means repos actually inspected (clone present, or in remote mode:
  // confirmed live + README fetched); `reposTotal` is the slug count and
  // `skippedNoClone` is how many were not inspected — so a wrong
  // --repos/--org reads as "0 of N inspected", not a hollow full-coverage
  // pass.
  if (opts.json) {
    const out = {
      ok: blockingIssues.length === 0 && !fullSkip && !rateLimited,
      reposChecked: inspected,
      reposTotal: slugDirs.length,
      skippedNoClone,
      issueCount: issues.length,
      issues,
      ...(opts.remote
        ? {
            remote: true as const,
            org: orgs.join(','),
            reconciliation: { renamed: renamedCount, archived: archivedCount, notFound: notFoundCount },
          }
        : {}),
      ...(rateLimited ? { rateLimited: true as const, rateLimitResetAt, skippedDueToRateLimit } : {}),
      ...(fullSkip && !rateLimited ? { error: 'no-repos-inspected' as const } : {}),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    // F-f4900c6e — exitCode instead of exit() right after this stdout write.
    // Audit's findings-JSON payload is the largest of the four commands (one
    // entry per issue across every scanned repo), making it the highest-value
    // target for the truncation risk F-f0c1a1f8 fixed in verify.ts: exit()
    // does not wait for a piped/redirected stdout write to flush.
    //
    // F-FEAT-audit-remote: rate-limited takes precedence over fullSkip/
    // blockingIssues — it's a distinct "the run did not complete" network
    // condition (exit 3, matching this CLI's documented "3 = unexpected
    // error ... network"), not an operator-config problem (2) or ordinary
    // findings (1).
    if (rateLimited) {
      process.exitCode = 3;
    } else if (fullSkip) {
      process.exitCode = 2;
    } else if (blockingIssues.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  // Human report
  if (fullSkip && !rateLimited) {
    console.error(chalk.red(`\n  ✗ 0 of ${slugDirs.length} repos inspected — every slug had no local clone under --repos (${opts.repos}). Check that --repos points at the right directory; a wrong path must not read as a clean audit.\n`));
    // F-f4900c6e — exitCode instead of exit(). The explicit return matters:
    // without it, execution falls through to the "Audit clean" message below
    // (issues.length is 0 here, same as a genuinely clean run) and prints a
    // green pass immediately after the red error above.
    process.exitCode = 2;
    return;
  }

  if (opts.remote) {
    // Always surfaced for a remote run (even a clean one) so an operator can
    // see reconciliation actually ran, not just that nothing broke.
    console.log(
      chalk.dim(
        `\n  Remote reconciliation (org: ${orgs.join(', ')}) — ${renamedCount} renamed, ${archivedCount} archived, ${notFoundCount} not found.`,
      ),
    );
  }

  if (rateLimited) {
    console.error(
      chalk.red(
        `\n  ✗ GitHub API rate limit hit${rateLimitResetAt ? ` (resets ${rateLimitResetAt})` : ''} — stopped early, ${skippedDueToRateLimit} slug(s) were never checked. Re-run once the limit resets; results below are partial.\n`,
      ),
    );
  }

  if (issues.length === 0) {
    if (rateLimited) {
      // Nothing to report yet, but the run is still incomplete — must not
      // read as a clean pass.
      process.exitCode = 3;
      return;
    }
    const skipNote = skippedNoClone > 0 ? ` (${skippedNoClone} had no local clone)` : '';
    console.log(chalk.green(`\n  ✓ Audit clean — ${inspected} of ${slugDirs.length} repos inspected${skipNote}, no issues.\n`));
    return;
  }

  console.log(chalk.yellow(`\n  Found ${issues.length} issue(s) across ${new Set(issues.map(i => i.repo)).size} repos:\n`));

  const grouped = new Map<string, AuditIssue[]>();
  for (const issue of issues) {
    const key = issue.repo;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(issue);
  }

  for (const [repo, repoIssues] of grouped) {
    console.log(chalk.bold(`  ${repo}`));
    for (const issue of repoIssues) {
      const lineRef = issue.line ? `:${issue.line}` : '';
      const color = issue.severity === 'high' ? chalk.red : issue.severity === 'info' ? chalk.dim : chalk.yellow;
      console.log(color(`    [${issue.issue}] ${issue.file}${lineRef} — ${issue.detail}`));
      if (issue.fix && opts.verbose !== false && !opts.quiet) {
        console.log(chalk.dim(`      ${issue.fix}`));
      }
    }
  }
  console.log('');
  // F-f4900c6e — exitCode instead of exit(); this is the last statement in
  // the function so there's no fallthrough risk, but the explicit style
  // keeps every exit path in this function visibly symmetric (matches
  // verify.ts's own documented reasoning, F-f0c1a1f8).
  //
  // F-FEAT-audit-remote: rate-limited still wins here too, for the same
  // "run didn't complete" reason as the JSON branch above.
  if (rateLimited) {
    process.exitCode = 3;
  } else if (blockingIssues.length > 0) {
    process.exitCode = 1;
  }
}
