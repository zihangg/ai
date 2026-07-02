---
name: second-brain
description: >-
  Second brain: ingest sources into the user's Obsidian LLM-wiki — a
  Karpathy-style pile of interlinked markdown that compounds over time. Use when
  the user wants to ingest/save/clip a URL, note, transcript, file, or the
  current conversation into their vault or second brain; to answer a question
  from the wiki; or to lint/maintain it. Resolves the iCloud vault path per
  device — never hardcode it.
---

# Second brain

The user's Obsidian vault has a numbered PARA layout (`00 - Personal`,
`01 - Work`, …). The second brain lives in one content folder, `04 - Knowledge`,
split into two layers: `raw/` (verbatim sources, one file each) and `wiki/`
(distilled, `[[wikilinked]]` notes the LLM curates). Everything else in the
vault is the user's own — never touch it. Value compounds only if ingestion is
disciplined: a raw dump nobody linked is dead weight.

## Resolve the vault first — every run

Run `scripts/resolve-vault.sh`. It prints the vault root for **this** device.
Never write a hardcoded path: the vault syncs across the user's devices via
iCloud but its absolute path differs per machine. The second brain is then at
`<root>/04 - Knowledge/`.

- Exit 5 (uninitialized): it lists candidate vault paths. Confirm which vault,
  then run `scripts/init-vault.sh "<full-vault-path>"` (the full path from the
  list, since iCloud may nest the vault under `Documents/`) to scaffold
  `04 - Knowledge/` and the ingest template.
- Exit 4 (ambiguous): more than one initialized vault; ask which, then re-run
  with `SECOND_BRAIN_VAULT` set to that path.
- Exit 3 (base missing): the terminal lacks Full Disk Access to iCloud — tell
  the user to grant it (System Settings → Privacy & Security → Full Disk
  Access), or set `SECOND_BRAIN_VAULT`.

Before writing anything, read 2–3 existing notes under `04 - Knowledge/wiki/`
(or, if it's thin, the user's own notes) to match their heading, link, and tag
conventions. Integrate in their style, don't impose a new one.

## Ingest — the primary loop

For each source:

1. **Capture raw.** Write the source to `04 - Knowledge/raw/<slug>.md` using the
   `99 - Templates/Ingest - Raw Source.md` frontmatter (`title`, `source`,
   `ingested`, `tags: [raw]`). Fetch URLs first; strip boilerplate but keep the
   content verbatim. For "this conversation", capture the substance, not the
   chatter.
2. **Integrate into the wiki — the real work.** Grep/read `wiki/` for related
   notes. For every distinct concept, entity, or claim worth keeping, update an
   existing note or create an atomic new one, connected with `[[wikilinks]]`.
   Distill and cross-link; do not paste the source into `wiki/`.
3. **Link raw ↔ wiki.** Each wiki note that draws on the source links back to
   its `raw/` file; the raw file's "Feeds wiki notes" list points to them.
4. **Update the index.** Add any new top-level note to `wiki/_index.md`.

**Completion criterion:** the raw file is saved with frontmatter; every keepable
point from it lives in a wiki note (or was consciously skipped); raw and wiki
are cross-linked; the index reflects new top-level notes; and no new note is an
orphan (every note reachable by `[[link]]` from at least one other). Report what
you added, updated, and skipped.

## Query — answer from the wiki

Answer from `wiki/` notes, falling back to `raw/` only when the wiki is thin.
Cite the note filenames you used, and if a question exposes a gap, flag it as a
lint target.

## Lint — periodic maintenance

Run when the user asks to lint/tidy the second brain, or opportunistically after
a large ingest. Walk `wiki/` and fix:

- **Broken links** — `[[targets]]` with no matching note.
- **Orphans** — notes nothing links to; wire them in or fold them into a peer.
- **Duplicates** — near-identical notes on one topic; merge to one source of
  truth, redirect links.
- **Staleness** — contradictory or outdated facts; reconcile and note which
  source won.
- **Missing links** — a note names a concept that has its own note but doesn't
  link it.
- **Index drift** — `_index.md` out of sync with the top-level notes.

Report each fix; never rewrite the user's own (non-`04 - Knowledge/`) notes.
