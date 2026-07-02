#!/usr/bin/env bash
# Resolve the second-brain vault root on THIS device. Never hardcode the path:
# iCloud syncs the same vault across devices, but the absolute path differs
# ($HOME changes, and iCloud may nest the vault under a Documents/ container).
# A vault is any directory holding a `.obsidian/` folder; the second-brain vault
# additionally holds a `.second-brain` marker at its root, which iCloud syncs —
# so every device self-identifies it regardless of depth.
#
# Exit codes:
#   0  printed the resolved vault root to stdout
#   3  iCloud Obsidian base directory not found
#   4  more than one initialized vault (ambiguous — caller must disambiguate)
#   5  no initialized vault; candidate vaults printed to stderr for `init-vault.sh`
set -eu

BASE="${SECOND_BRAIN_BASE:-$HOME/Library/Mobile Documents/iCloud~md~obsidian}"
DEPTH="${SECOND_BRAIN_MAXDEPTH:-4}"

# Explicit override wins (e.g. a non-iCloud vault).
if [ -n "${SECOND_BRAIN_VAULT:-}" ] && [ -d "$SECOND_BRAIN_VAULT" ]; then
  printf '%s\n' "$SECOND_BRAIN_VAULT"
  exit 0
fi

if [ ! -d "$BASE" ]; then
  echo "ERROR: iCloud Obsidian base not found: $BASE" >&2
  echo "Grant the terminal Full Disk Access, or set SECOND_BRAIN_VAULT=/path/to/vault." >&2
  exit 3
fi

# Initialized vault = has our marker at its root (found at any depth).
count=0
resolved=""
while IFS= read -r marker; do
  [ -z "$marker" ] && continue
  count=$((count + 1))
  resolved="${marker%/.second-brain}"
done <<EOF
$(find "$BASE" -maxdepth "$DEPTH" -name '.second-brain' -type f 2>/dev/null)
EOF

if [ "$count" -eq 1 ]; then
  printf '%s\n' "$resolved"
  exit 0
fi

if [ "$count" -gt 1 ]; then
  echo "ERROR: multiple initialized vaults; set SECOND_BRAIN_VAULT to pick one:" >&2
  find "$BASE" -maxdepth "$DEPTH" -name '.second-brain' -type f 2>/dev/null | sed 's#/.second-brain$##' >&2
  exit 4
fi

# None initialized — list candidate vaults (parents of a .obsidian/ dir).
echo "UNINITIALIZED: no second-brain vault yet. Candidate Obsidian vaults:" >&2
find "$BASE" -maxdepth "$DEPTH" -name '.obsidian' -type d 2>/dev/null | sed 's#/.obsidian$##' >&2
exit 5
