#!/usr/bin/env bash
# sync-org-logos.sh — Pull logos from all org repos into logos/
#
# Usage:  ./scripts/sync-org-logos.sh [--org NAME] [--dry-run]
#
# For each repo in the org:
#   1. Check if it has a logo file (readme.png, readme.jpg, logo.png, logo.jpg)
#   2. Download it to logos/<repo-name>/readme.<ext>
#   3. Report new/changed/unchanged/no-logo/rejected/network-errors
#
# Portability: prefers GNU `sha256sum` (Linux runners) and falls back to
# `shasum -a 256` (macOS). At least one must be on PATH.
#
# Requires: gh CLI authenticated with repo scope, curl, file.

set -euo pipefail

ORG="mcp-tool-shop-org"
DRY_RUN=false
LOGOS_DIR="logos"
CHANGED=0
ADDED=0
UNCHANGED=0
SKIPPED=0
REJECTED=0
NETWORK_ERRORS=0

# Download caps — non-image rejection + size/time bounds
CURL_MAX_TIME=30
CURL_MAX_FILESIZE=10485760  # 10 MB

# gh repo list pagination — well above current ~187 logos with headroom
GH_REPO_LIMIT=1000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)      ORG="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    *)          echo "Unknown option: $1"; exit 2 ;;
  esac
done

# Preflight: ensure gh CLI is authenticated
gh auth status >/dev/null 2>&1 || { echo "ERROR: gh CLI not authenticated — run 'gh auth login' or set GH_TOKEN" >&2; exit 1; }

# Portability shim: pick a sha256 binary. macOS contributors running the
# script locally hit `sha256sum: command not found` without this fallback.
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    echo "ERROR: neither sha256sum nor shasum found on PATH" >&2
    exit 2
  fi
}

echo "Syncing logos from org: $ORG"
echo ""

# List all non-archived, non-fork repos in the org. We pass --limit
# GH_REPO_LIMIT (currently 1000) — well above the present ~187 repos but
# guarded with an explicit overflow check below.
repos=$(gh repo list "$ORG" --no-archived --source --json name --jq '.[].name' --limit "$GH_REPO_LIMIT")

if [[ -z "$repos" ]]; then
  echo "ERROR: no repos returned for org '$ORG' — check auth scope / org name" >&2
  exit 1
fi

# Overflow warning: if we hit the cap exactly, we may be truncating. Log
# loudly to stderr so a daily sync run page makes the warning visible.
repo_count=$(echo "$repos" | grep -c '^' || true)
if [[ "$repo_count" -ge "$GH_REPO_LIMIT" ]]; then
  echo "WARNING: gh repo list returned $repo_count repos — equal to --limit $GH_REPO_LIMIT cap." >&2
  echo "WARNING: some repos may have been silently truncated. Raise GH_REPO_LIMIT or switch to --paginate." >&2
fi

while IFS= read -r repo; do
  [[ -z "$repo" ]] && continue
  # Try known logo paths in priority order
  logo_found=false
  network_error=false
  for candidate in "readme.png" "readme.jpg" "logo.png" "logo.jpg"; do
    # Check if file exists in repo root via raw.githubusercontent.com.
    # We capture curl's exit code separately so a network failure (DNS
    # blip, timeout, TLS error) is not silently lumped in with a clean
    # 404. The 'set +e / set -e' guard keeps `set -e` from killing us on
    # a non-zero curl exit.
    url="https://raw.githubusercontent.com/$ORG/$repo/main/$candidate"
    set +e
    http_code=$(curl -sL --max-time "$CURL_MAX_TIME" -o /dev/null -w "%{http_code}" "$url")
    curl_rc=$?
    set -e

    if [[ "$curl_rc" -ne 0 ]]; then
      # Transient: DNS / TLS / timeout. Do not count this as "no logo".
      echo "  ! $repo/$candidate (network error — curl exit $curl_rc, http=$http_code)" >&2
      network_error=true
      continue
    fi

    if [[ "$http_code" == "200" ]]; then
      # Normalize target extension
      ext="${candidate##*.}"
      target_name="readme.$ext"
      target_dir="$LOGOS_DIR/$repo"
      target_path="$target_dir/$target_name"

      if $DRY_RUN; then
        if [[ -f "$target_path" ]]; then
          echo "  ~ $repo/$target_name (would check for changes)"
        else
          echo "  + $repo/$target_name (would download)"
        fi
        logo_found=true
        break
      fi

      # Download to temp, verify content-type, compare hash
      mkdir -p "$target_dir"
      tmp=$(mktemp)
      if ! curl -sL --max-time "$CURL_MAX_TIME" --max-filesize "$CURL_MAX_FILESIZE" -o "$tmp" "$url"; then
        echo "  ! $repo/$candidate (download failed or exceeded size cap)" >&2
        rm -f "$tmp"
        REJECTED=$((REJECTED + 1))
        logo_found=true
        break
      fi

      # Reject non-images: verify magic-byte / mime-type starts with image/
      if command -v file >/dev/null 2>&1; then
        mime=$(file --mime-type -b "$tmp" 2>/dev/null || echo "unknown")
        if [[ "$mime" != image/* ]]; then
          echo "  ! $repo/$candidate (rejected — not an image, mime=$mime)" >&2
          rm -f "$tmp"
          REJECTED=$((REJECTED + 1))
          logo_found=true
          break
        fi
      fi

      if [[ -f "$target_path" ]]; then
        old_hash=$(hash_file "$target_path")
        new_hash=$(hash_file "$tmp")
        if [[ "$old_hash" == "$new_hash" ]]; then
          rm "$tmp"
          UNCHANGED=$((UNCHANGED + 1))
        else
          mv "$tmp" "$target_path"
          echo "  ~ $repo/$target_name (updated)"
          CHANGED=$((CHANGED + 1))
        fi
      else
        mv "$tmp" "$target_path"
        echo "  + $repo/$target_name (new)"
        ADDED=$((ADDED + 1))
      fi

      logo_found=true
      break
    fi
    # http_code is a non-200, non-network value (404, 403, etc.) — try next candidate.
  done

  if $network_error && ! $logo_found; then
    NETWORK_ERRORS=$((NETWORK_ERRORS + 1))
  elif ! $logo_found; then
    SKIPPED=$((SKIPPED + 1))
  fi
done <<< "$repos"

echo ""
echo "Sync complete:"
echo "  New:            $ADDED"
echo "  Updated:        $CHANGED"
echo "  Unchanged:      $UNCHANGED"
echo "  No logo:        $SKIPPED"
echo "  Rejected:       $REJECTED"
echo "  Network errors: $NETWORK_ERRORS"

# Emit counts to GITHUB_OUTPUT when running inside a GitHub Action so the
# wrapping workflow can surface them in the run summary. Safe no-op when
# GITHUB_OUTPUT is unset (local run).
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "added=$ADDED"
    echo "changed_count=$CHANGED"
    echo "unchanged=$UNCHANGED"
    echo "skipped=$SKIPPED"
    echo "rejected=$REJECTED"
    echo "network_errors=$NETWORK_ERRORS"
  } >> "$GITHUB_OUTPUT"
fi

# If more than 10% of repos returned a network error, the run is misleading
# — most "no logo" results may actually be "we couldn't check". Fail loud.
if [[ "$repo_count" -gt 0 && "$NETWORK_ERRORS" -gt 0 ]]; then
  threshold=$(( repo_count / 10 ))
  [[ "$threshold" -lt 1 ]] && threshold=1
  if [[ "$NETWORK_ERRORS" -ge "$threshold" ]]; then
    echo "ERROR: $NETWORK_ERRORS / $repo_count repos failed with network errors (>=10% threshold)." >&2
    echo "ERROR: refusing to open a sync PR — coverage may be incomplete." >&2
    exit 3
  fi
fi

# Exit 0 if nothing changed, 10 if there are changes (for CI to detect)
if [[ $((ADDED + CHANGED)) -gt 0 ]]; then
  exit 10
fi
exit 0
