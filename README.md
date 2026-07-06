# ai

A single source of truth for AI **agents**, **skills**, and **commands**, with
an interactive installer that adds them to each provider you use (Claude Code,
Codex CLI, OpenCode) — and removes them again on demand.

Author each artifact once as provider-agnostic markdown; pick what goes where
through a menu.

```bash
deno task start    # interactive menu: New · Sync · Desync · List
deno task new      # scaffold a new agent / skill / command (guided)
deno task sync     # jump straight to the install picker
deno task desync   # jump straight to the removal picker
deno task list     # show source artifacts + what's installed
```

Every picker shows its key bindings beneath the prompt
(`↑/↓ move · space toggle · ctrl+a toggle all · enter confirm`).

## How it works

The installer is **additive**:

- **Sync** — pick providers, pick a target (global or project), then check the
  agents/skills/commands to install. Selected items are _added_; nothing you
  leave unchecked is touched.
- **Desync** — pick from what's actually installed (read back from the manifest)
  and remove exactly those files, tidying up empty directories afterward.

Everything installed is recorded in `.sync/manifest.json`, so Desync always
knows precisely what to remove and never deletes anything it didn't create.

```
┌─ Sync ──────────────────────────────────────────────┐
│ Which providers?         [x] Claude  [x] Codex  [ ] OpenCode
│ Install where?            Global / Project
│ Select what to install:
│   ▸ Version Control
│     [x] pr-describer    [agent]
│     [x] git-helper      [skill]
│   ▸ Research
│     [x] deep-dive       [skill]
└─────────────────────────────────────────────────────┘
```

## Layout

```
agents/      <name>.md                      one agent per file
commands/    <name>.md                      one slash-command / prompt per file
skills/      [<category>/]<name>/SKILL.md   one skill per directory (+ any assets)
config.json                                 default providers + target (pre-selected in the picker)
src/                              the installer
  cli.ts                          interactive menu (Cliffy prompts)
  engine.ts                       install / remove / prune
  providers/                      one adapter per provider
.sync/manifest.json               install record (git-ignored, auto-managed)
```

## Authoring a new artifact

`deno task new` walks you through it — pick a kind, enter
name/description/category (and model/tools for agents), and it scaffolds the
file or skill directory with valid frontmatter. Then edit the body and
`deno task sync`.

Prefer to do it by hand? Drop a file in `agents/` or `commands/`, or a directory
with a `SKILL.md` in `skills/` — the format is below.

## Source format

Every artifact is markdown with optional YAML frontmatter:

| Field           | Used by           | Notes                                                                                                                                                                  |
| --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | all               | Defaults to the file/dir name.                                                                                                                                         |
| `category`      | all               | Groups the artifact in the picker. For skills, the parent folder name is used automatically (e.g. `skills/engineering/tdd/` → `Engineering`); this field overrides it. |
| `description`   | all               | Shown in the picker; providers use it for relevance.                                                                                                                   |
| `model`         | agents            | Generic alias (e.g. `sonnet`) — see caveat below.                                                                                                                      |
| `tools`         | agents            | List or comma string; mapped per provider.                                                                                                                             |
| `argument-hint` | commands (Claude) | Shown in the slash-command UI.                                                                                                                                         |
| `mode`          | agents (OpenCode) | Defaults to `subagent`.                                                                                                                                                |

Run `deno task new` to scaffold one with the right fields.

## Where each artifact lands

| Source  | Claude Code       | Codex CLI                | OpenCode         |
| ------- | ----------------- | ------------------------ | ---------------- |
| agent   | `agents/<n>.md`   | `prompts/<n>.md`         | `agent/<n>.md`   |
| command | `commands/<n>.md` | `prompts/<n>.md`         | `command/<n>.md` |
| skill   | `skills/<n>/`     | _(unsupported, skipped)_ | `skill/<n>/`     |

Install roots, by target:

| Target    | Claude           | Codex           | OpenCode             |
| --------- | ---------------- | --------------- | -------------------- |
| `global`  | `~/.claude`      | `~/.codex`      | `~/.config/opencode` |
| `project` | `<repo>/.claude` | `<repo>/.codex` | `<repo>/.opencode`   |

## Non-interactive (scripting / CI)

```bash
deno task sync --yes                               # install everything (config defaults)
deno task sync --yes --providers=claude,codex --target=project
```

`--yes` skips all prompts and installs every source artifact. Without a TTY and
without `--yes`, the installer exits with guidance instead of hanging.

## Configuration

`config.json` only sets what's **pre-selected** in the picker:

```json
{
  "providers": ["claude", "codex", "opencode"],
  "target": "global"
}
```

## Adding a provider

1. Create `src/providers/<id>.ts` exporting a `Provider` (see `claude.ts`).
2. Register it in `src/providers/mod.ts`.
3. Optionally add its id to `config.json` so it's pre-checked.

## Caveats

- **Model ids.** Aliases like `sonnet` pass through unchanged. OpenCode expects
  namespaced ids (e.g. `anthropic/claude-sonnet-4-6`); set the right value in
  source frontmatter or extend `src/providers/opencode.ts`.
- **Desync keeps base dirs.** Empty provider roots (`~/.claude`, `./.claude`, …)
  are left in place on removal so shared config is never deleted.
- Provider directory conventions can change upstream; the adapters are small and
  meant to be edited.

## Acknowledgements

We stand on the shoulders of giants. Several skills here were taken from, or
inspired by, the work of others, with thanks to:

- **Addy Osmani** - [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- **Matt Pocock** - [mattpocock/skills](https://github.com/mattpocock/skills)

## License

MIT — see [`LICENSE`](LICENSE).
