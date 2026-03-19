#!/usr/bin/env bash
# sync-org-logos.sh — Pull logos from all org repos into logos/
#
# Usage:  ./scripts/sync-org-logos.sh [--org NAME] [--dry-run]
#
# For each repo in the org:
#   1. Check if it has a logo file (readme.png, readme.jpg, logo.png, logo.jpg)
#   2. Download it to logos/<repo-name>/readme.<ext>
#   3. Report new/changed/unchanged
#
# Requires: gh CLI authenticated with repo scope

set -euo pipefail

ORG="mcp-tool-shop-org"
DRY_RUN=false
LOGOS_DIR="logos"
CHANGED=0
ADDED=0
UNCHANGED=0
SKIPPED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org)      ORG="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    *)          echo "Unknown option: $1"; exit 2 ;;
  esac
done

echo "Syncing logos from org: $ORG"
echo ""

# List all non-archived, non-fork repos in the org
repos=$(gh repo list "$ORG" --no-archived --source --json name --jq '.[].name' --limit 500)

for repo in $repos; do
  # Try known logo paths in priority order
  logo_found=false
  for candidate in "readme.png" "readme.jpg" "logo.png" "logo.jpg"; do
    # Check if file exists in repo root via GitHub API
    url="https://raw.githubusercontent.com/$ORG/$repo/main/$candidate"
    http_code=$(curl -sL -o /dev/null -w "%{http_code}" "$url")

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

      # Download to temp, compare hash
      mkdir -p "$target_dir"
      tmp=$(mktemp)
      curl -sL -o "$tmp" "$url"

      if [[ -f "$target_path" ]]; then
        old_hash=$(sha256sum "$target_path" | cut -d' ' -f1)
        new_hash=$(sha256sum "$tmp" | cut -d' ' -f1)
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
  done

  if ! $logo_found; then
    SKIPPED=$((SKIPPED + 1))
  fi
done

echo ""
echo "Sync complete:"
echo "  New:       $ADDED"
echo "  Updated:   $CHANGED"
echo "  Unchanged: $UNCHANGED"
echo "  No logo:   $SKIPPED"

# Exit 0 if nothing changed, 10 if there are changes (for CI to detect)
if [[ $((ADDED + CHANGED)) -gt 0 ]]; then
  exit 10
fi
exit 0
