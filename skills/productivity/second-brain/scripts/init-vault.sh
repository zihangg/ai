#!/usr/bin/env bash
# One-time scaffold of the second-brain layer inside an existing Obsidian vault.
# Creates the "04 - Knowledge" content folder with raw/ and wiki/ subfolders, the
# wiki index, an ingest template in "99 - Templates", and the `.second-brain`
# marker at the vault root that makes the vault self-identifying on every device.
# Idempotent — safe to re-run.
#
# Usage: init-vault.sh <VaultName>   (folder name under the iCloud base)
set -eu

BASE="${SECOND_BRAIN_BASE:-$HOME/Library/Mobile Documents/iCloud~md~obsidian}"
KNOWLEDGE="${SECOND_BRAIN_FOLDER:-04 - Knowledge}"
TEMPLATES="${SECOND_BRAIN_TEMPLATES:-99 - Templates}"
name="${1:?usage: init-vault.sh <VaultName>}"
vault="$BASE/$name"

[ -d "$vault" ] || { echo "No such vault: $vault" >&2; exit 1; }

mkdir -p "$vault/$KNOWLEDGE/raw" "$vault/$KNOWLEDGE/wiki"
: > "$vault/.second-brain" 2>/dev/null || touch "$vault/.second-brain"

idx="$vault/$KNOWLEDGE/wiki/_index.md"
if [ ! -f "$idx" ]; then
  cat > "$idx" <<'MD'
# Second Brain — Index

Map of contents for the wiki. Curated by the LLM, not by hand: links to every
top-level note. `raw/` holds unprocessed sources; `wiki/` holds the distilled,
interlinked knowledge.

## Topics

_(none yet — grows as sources are ingested)_
MD
fi

# Ingest template — uses Obsidian core-Templates placeholders ({{title}}, {{date}}).
tpl="$vault/$TEMPLATES/Ingest - Raw Source.md"
if [ -d "$vault/$TEMPLATES" ] && [ ! -f "$tpl" ]; then
  cat > "$tpl" <<'MD'
---
title: "{{title}}"
source:
ingested: {{date}}
tags: [raw]
---

> [!info] Raw source for the second brain. Distilled notes live in `04 - Knowledge/wiki/`.

## Source


## Feeds wiki notes
-
MD
fi

printf '%s\n' "$vault"
