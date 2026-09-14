# ai

A single source of truth for AI **agents**, **skills**, **commands**, and Codex
**MCP servers**, with an interactive installer that adds them to each provider
you use (Claude Code, Codex CLI, OpenCode) — and removes them again on demand.

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

Installed paths and managed MCP sections are recorded in `.sync/manifest.json`.
Desync removes selected artifacts and MCP sections while keeping shared Codex
configuration. Sync overwrites selected artifact files; keep local
customizations in the source repository.

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
mcps.json                                 named MCP server configurations (Codex only)
config.json                               default providers + target (pre-selected in the picker)
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

Agents, commands, and skills use markdown with optional YAML frontmatter:

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

| Source  | Claude Code       | Codex CLI                         | OpenCode         |
| ------- | ----------------- | --------------------------------- | ---------------- |
| agent   | `agents/<n>.md`   | `agents/<n>.toml`                 | `agent/<n>.md`   |
| command | `commands/<n>.md` | `prompts/<n>.md`                  | `command/<n>.md` |
| skill   | `skills/<n>/`     | `.agents/skills/<n>/` (see below) | `skill/<n>/`     |
| MCP     | unsupported       | `config.toml` sections            | unsupported      |

Install roots, by target:

| Target    | Claude           | Codex           | OpenCode             |
| --------- | ---------------- | --------------- | -------------------- |
| `global`  | `~/.claude`      | `~/.codex`      | `~/.config/opencode` |
| `project` | `<repo>/.claude` | `<repo>/.codex` | `<repo>/.opencode`   |

Codex skills use `~/.agents/skills/<name>/` globally and
`<repo>/.agents/skills/<name>/` for project installs, including supporting
assets. Global Codex agents, prompts, and configuration honor `CODEX_HOME` when
set. Commands retain the legacy `prompts/` format; use skills for project-scoped
Codex workflows.

Codex agents inherit the parent model and tools by default. Generic `model`
(e.g. `sonnet`) and Claude tool names are not passed to Codex. Use a `codex`
frontmatter object for native overrides, for example:

```yaml
codex:
  model: gpt-5.6
  model_reasoning_effort: high
  sandbox_mode: read-only
```

Sync migrates old, manifest-tracked agent prompts when they still match the
source. Modified or untracked prompts and same-name commands are preserved.
Start a fresh Codex session after syncing agents. Ask Codex to use a named role
(for example, `Use code-reviewer to review this diff`). The Subagents view lists
active or completed agent sessions, not an inventory of installed role files.

## MCP servers (Codex)

Edit `mcps.json` at the repository root. It includes Playwright and Atlassian
connection definitions imported from the existing local Claude configuration.
Each key is a server name, with native Codex MCP configuration fields:

```json
{
  "docs": {
    "url": "https://developers.openai.com/mcp"
  },
  "local-tools": {
    "command": "npx",
    "args": ["-y", "your-mcp-package"],
    "env_vars": ["API_TOKEN"]
  }
}
```

Each server needs exactly one of `command` or `url`. Prefer environment-variable
references (`env_vars`, `bearer_token_env_var`) over committing credentials. Use
`codex mcp login <name>` separately when a server requires OAuth.

Servers appear in the sync picker. Sync adds or updates marked sections in
`~/.codex/config.toml` (or `<repo>/.codex/config.toml` for a trusted project),
preserving other settings and comments. An existing unmanaged server with the
same name causes a conflict error before Codex files are written. Rename the
source entry or reconcile the existing entry explicitly. Desync removes only the
selected managed sections; it never deletes `config.toml`. Other providers
report MCP entries as unsupported.

## Non-interactive (scripting / CI)

```bash
deno task sync --dry-run --providers=codex           # preview without changes
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

## Validation

```bash
deno task check
deno task lint
deno task test
```

Tests use temporary directories to cover skill assets, native agent settings,
MCP merging/conflicts/removal, dry runs, and migration of legacy agent prompts.

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

- **Addy Osmani** -
  [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- **Matt Pocock** - [mattpocock/skills](https://github.com/mattpocock/skills)
- **HumanLayer** - [humanlayer/skills](https://github.com/humanlayer/skills)

## License

MIT — see [`LICENSE`](LICENSE).
