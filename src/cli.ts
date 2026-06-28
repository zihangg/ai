import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";
import { parseArgs } from "@std/cli/parse-args";
import { join, relative } from "@std/path";
import { loadConfig } from "./config.ts";
import { loadArtifacts } from "./load.ts";
import {
  installProvider,
  makeContext,
  pruneEmptyDirs,
  removePaths,
} from "./engine.ts";
import {
  type Manifest,
  readManifest,
  recordInstall,
  recordRemoval,
  writeManifest,
} from "./manifest.ts";
import { PROVIDERS, resolveProviders } from "./providers/mod.ts";
import type { Artifact, SyncContext } from "./types.ts";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const root = Deno.cwd();

/** Key-binding hints shown beneath each prompt. */
const HINT = {
  checkbox: "↑/↓ move · space toggle · ctrl+a toggle all · enter confirm",
  select: "↑/↓ move · enter select",
};

const key = (a: Artifact) => `${a.kind}:${a.name}`;
const categoryOf = (a: Artifact) =>
  a.category ?? `${a.kind[0].toUpperCase()}${a.kind.slice(1)}s`;

function providerLabel(id: string): string {
  return PROVIDERS[id]?.label ?? id;
}

function providerBaseDir(id: string, ctx: SyncContext): string {
  return PROVIDERS[id]?.baseDir(ctx) ?? "";
}

/** Group artifacts by category for display. */
function groupByCategory(artifacts: Artifact[]): Map<string, Artifact[]> {
  const groups = new Map<string, Artifact[]>();
  for (const a of artifacts) {
    const cat = categoryOf(a);
    (groups.get(cat) ?? groups.set(cat, []).get(cat)!).push(a);
  }
  return new Map([...groups].sort((a, b) => a[0].localeCompare(b[0])));
}

// ── Sync ────────────────────────────────────────────────────────────────────

async function runSync(): Promise<void> {
  const artifacts = await loadArtifacts(root);
  if (!artifacts.length) {
    console.log(
      c.yellow(
        "No source artifacts found under agents/, commands/, or skills/.",
      ),
    );
    return;
  }
  const config = await loadConfig(root);

  const providerIds = await Checkbox.prompt({
    message: "Which providers do you want to install for?",
    hint: HINT.checkbox,
    options: Object.values(PROVIDERS).map((p) => ({
      name: p.label,
      value: p.id,
      checked: config.providers.includes(p.id),
    })),
    minOptions: 1,
  });

  const target = await Select.prompt<string>({
    message: "Install where?",
    hint: HINT.select,
    default: config.target,
    options: [
      {
        name: "Global — your home config dirs (~/.claude, ~/.codex, …)",
        value: "global",
      },
      {
        name: "Project — this repo's dot-dirs (./.claude, …)",
        value: "project",
      },
    ],
  }) as SyncContext["target"];

  // Build a grouped, pre-checked artifact picker.
  const options: Array<
    { name: string; value: string; checked?: boolean } | { name: string }
  > = [];
  for (const [cat, items] of groupByCategory(artifacts)) {
    options.push(Checkbox.separator(c.cyan(`▸ ${cat}`)));
    for (const a of items) {
      const desc = typeof a.frontmatter.description === "string"
        ? c.dim(" — " + a.frontmatter.description.slice(0, 60))
        : "";
      options.push({
        name: `${a.name} ${c.dim(`[${a.kind}]`)}${desc}`,
        value: key(a),
        checked: true,
      });
    }
  }

  const selectedKeys = await Checkbox.prompt({
    message: "Select what to install",
    hint: HINT.checkbox,
    options,
    minOptions: 1,
  });
  const selected = artifacts.filter((a) => selectedKeys.includes(key(a)));

  console.log(
    `\nAbout to install ${c.bold(String(selected.length))} item(s) to ` +
      `${c.bold(providerIds.map(providerLabel).join(", "))} ${
        c.dim(`(${target})`)
      }.`,
  );
  if (!(await Confirm.prompt({ message: "Proceed?", default: true }))) {
    console.log(c.dim("Cancelled."));
    return;
  }

  await applySync(providerIds, selected, target);
}

async function applySync(
  providerIds: string[],
  artifacts: Artifact[],
  target: SyncContext["target"],
): Promise<void> {
  const ctx = makeContext(target, root);
  const providers = resolveProviders(providerIds);
  const manifest = await readManifest(root);

  for (const provider of providers) {
    const written = await installProvider(provider, artifacts, ctx);
    recordInstall(manifest, target, provider.id, written);
    const skillSkips = provider.id === "codex" &&
      artifacts.some((a) => a.kind === "skill");
    console.log(
      `\n${c.bold(provider.label)} ${c.dim("→ " + provider.baseDir(ctx))}`,
    );
    for (const p of written) {
      console.log(`  ${c.green("+")} ${relative(provider.baseDir(ctx), p)}`);
    }
    if (!written.length) console.log(c.dim("  (no compatible artifacts)"));
    if (skillSkips) {
      console.log(c.dim("  (skills skipped — Codex has no skill support)"));
    }
  }

  await writeManifest(root, manifest);
  console.log(`\n${c.green("Sync complete.")}`);
}

// ── Desync ────────────────────────────────────────────────────────────────────

async function runDesync(): Promise<void> {
  const manifest = await readManifest(root);
  const targets = Object.keys(manifest).filter((t) =>
    Object.values(manifest[t]).some((paths) => paths.length)
  );
  if (!targets.length) {
    console.log(
      c.yellow("Nothing is installed — no manifest entries to remove."),
    );
    return;
  }

  const target =
    (targets.length === 1 ? targets[0] : await Select.prompt<string>({
      message: "Remove from which target?",
      hint: HINT.select,
      options: targets.map((t) => ({ name: t, value: t })),
    })) as SyncContext["target"];
  const ctx = makeContext(target, root);

  const installed = Object.entries(manifest[target]).filter(([, paths]) =>
    paths.length
  );
  const options: Array<
    { name: string; value: string; checked?: boolean } | { name: string }
  > = [];
  for (const [pid, paths] of installed) {
    options.push(Checkbox.separator(c.cyan(`▸ ${providerLabel(pid)}`)));
    for (const path of paths) {
      options.push({
        name: relative(providerBaseDir(pid, ctx), path),
        value: `${pid}::${path}`,
        checked: true,
      });
    }
  }

  const toRemove = await Checkbox.prompt({
    message: "Select items to remove (all pre-checked)",
    hint: HINT.checkbox,
    options,
    minOptions: 1,
  });

  console.log(
    `\nAbout to remove ${c.bold(String(toRemove.length))} item(s) from ${
      c.dim(target)
    }.`,
  );
  if (!(await Confirm.prompt({ message: "Proceed?", default: true }))) {
    console.log(c.dim("Cancelled."));
    return;
  }

  await applyDesync(toRemove, target, ctx, manifest);
}

async function applyDesync(
  entries: string[],
  target: SyncContext["target"],
  ctx: SyncContext,
  manifest: Manifest,
): Promise<void> {
  const byProvider = new Map<string, string[]>();
  for (const entry of entries) {
    const sep = entry.indexOf("::");
    const pid = entry.slice(0, sep);
    const path = entry.slice(sep + 2);
    (byProvider.get(pid) ?? byProvider.set(pid, []).get(pid)!).push(path);
  }

  for (const [pid, paths] of byProvider) {
    await removePaths(paths, false);
    await pruneEmptyDirs(paths, [providerBaseDir(pid, ctx)], false);
    recordRemoval(manifest, target, pid, paths);
    console.log(`\n${c.bold(providerLabel(pid))}`);
    for (const p of paths) {
      console.log(`  ${c.red("-")} ${relative(providerBaseDir(pid, ctx), p)}`);
    }
  }

  await writeManifest(root, manifest);
  console.log(`\n${c.green("Desync complete.")}`);
}

// ── List ────────────────────────────────────────────────────────────────────

async function runList(): Promise<void> {
  const artifacts = await loadArtifacts(root);
  console.log(c.bold("Source artifacts"));
  for (const [cat, items] of groupByCategory(artifacts)) {
    console.log(`  ${c.cyan(cat)}`);
    for (const a of items) console.log(`    ${a.name} ${c.dim(`[${a.kind}]`)}`);
  }

  const manifest = await readManifest(root);
  console.log(`\n${c.bold("Installed")}`);
  let any = false;
  for (const [target, providers] of Object.entries(manifest)) {
    for (const [pid, paths] of Object.entries(providers)) {
      if (!paths.length) continue;
      any = true;
      console.log(
        `  ${c.cyan(providerLabel(pid))} ${
          c.dim(`(${target})`)
        }: ${paths.length} file(s)`,
      );
    }
  }
  if (!any) console.log(c.dim("  (nothing installed yet)"));
}

// ── New (scaffold) ───────────────────────────────────────────────────────────

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Assemble a frontmatter + body markdown document from ordered fields. */
function scaffold(
  fields: Array<[string, string | undefined]>,
  body: string,
): string {
  const lines = fields
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${lines}\n---\n\n${body}\n`;
}

async function runNew(): Promise<void> {
  const kind = await Select.prompt<string>({
    message: "What do you want to create?",
    hint: HINT.select,
    options: [
      { name: "Agent   — a subagent with a system prompt", value: "agent" },
      {
        name: "Skill   — a directory of instructions + assets",
        value: "skill",
      },
      { name: "Command — a slash-command / prompt", value: "command" },
    ],
  });

  const name = await Input.prompt({
    message: "Name (kebab-case)",
    hint: "lowercase, digits, and dashes — becomes the file/folder name",
    validate: (v) =>
      /^[a-z0-9][a-z0-9-]*$/.test(v.trim()) ||
      "Use lowercase letters, digits, and dashes (e.g. pr-describer).",
  });
  const slug = name.trim();

  const description = await Input.prompt({
    message: "Description",
    hint: "one line — providers use this to decide when it's relevant",
    validate: (v) => v.trim().length > 0 || "A description is required.",
  });

  const category = (await Input.prompt({
    message: "Category (optional)",
    hint: "groups it in the picker, e.g. 'Version Control' — blank to skip",
  })).trim();

  let dest: string;
  let contents: string;

  if (kind === "agent") {
    const model = (await Input.prompt({
      message: "Model (optional)",
      hint: "e.g. sonnet / opus — blank to leave unset",
    })).trim();
    const tools = (await Input.prompt({
      message: "Tools (optional, comma-separated)",
      hint: "e.g. Read, Grep, Bash — blank to leave unset",
    })).trim();
    dest = join(root, "agents", `${slug}.md`);
    contents = scaffold(
      [
        ["name", slug],
        ["category", category || undefined],
        ["description", JSON.stringify(description)],
        ["model", model || undefined],
        [
          "tools",
          tools
            ? `[${tools.split(",").map((t) => t.trim()).join(", ")}]`
            : undefined,
        ],
      ],
      "You are ...\n\nDescribe the agent's role and instructions here.",
    );
  } else if (kind === "command") {
    dest = join(root, "commands", `${slug}.md`);
    contents = scaffold(
      [
        ["category", category || undefined],
        ["description", JSON.stringify(description)],
        ["argument-hint", '""'],
      ],
      "Describe what this command should do. Reference the argument as needed.",
    );
  } else {
    dest = join(root, "skills", slug, "SKILL.md");
    const title = slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
    contents = scaffold(
      [
        ["name", slug],
        ["category", category || undefined],
        ["description", JSON.stringify(description)],
      ],
      `# ${title}\n\n## When to use\n\nDescribe the trigger conditions.\n\n` +
        `## Steps\n\n1. ...\n2. ...\n\n` +
        `<!-- Add supporting files in this directory and reference them by relative path. -->`,
    );
  }

  if (await pathExists(dest)) {
    console.log(c.red(`Already exists: ${relative(root, dest)} — aborting.`));
    return;
  }

  await Deno.mkdir(join(dest, ".."), { recursive: true });
  await Deno.writeTextFile(dest, contents);
  console.log(`\n${c.green("Created")} ${relative(root, dest)}`);
  console.log(
    c.dim("Edit the body, then run ") + "deno task sync" +
      c.dim(" to install it."),
  );
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function mainMenu(): Promise<void> {
  while (true) {
    const action = await Select.prompt<string>({
      message: "ai — what would you like to do?",
      hint: HINT.select,
      options: [
        {
          name: "New      — scaffold a new agent / skill / command",
          value: "new",
        },
        {
          name: "Sync     — install agents / skills / commands",
          value: "sync",
        },
        { name: "Desync   — remove installed items", value: "desync" },
        { name: "List     — show source + installed", value: "list" },
        Select.separator(""),
        { name: "Exit", value: "exit" },
      ],
    });
    if (action === "exit") return;
    if (action === "new") await runNew();
    if (action === "sync") await runSync();
    if (action === "desync") await runDesync();
    if (action === "list") await runList();
    console.log("");
  }
}

/** Non-interactive sync for scripting/CI: install everything (or a filtered set). */
async function nonInteractiveSync(
  providers: string[],
  target: SyncContext["target"],
): Promise<void> {
  const artifacts = await loadArtifacts(root);
  console.log(
    c.dim(
      `Non-interactive sync: ${artifacts.length} item(s) → ${
        providers.join(", ")
      } (${target})`,
    ),
  );
  await applySync(providers, artifacts, target);
}

async function main(): Promise<void> {
  const flags = parseArgs(Deno.args, {
    boolean: ["yes", "help"],
    string: ["providers", "target"],
    alias: { h: "help", y: "yes" },
  });
  const command = String(flags._[0] ?? "menu");

  if (flags.help) {
    console.log(
      `agents — install AI agents, skills, and commands across providers.

Usage: deno task start            # interactive menu
       deno task new              # scaffold a new agent / skill / command
       deno task sync             # interactive install
       deno task desync           # interactive removal
       deno task list             # show source + installed

Non-interactive (scripting/CI):
       deno task sync --yes [--providers=claude,codex] [--target=global|project]

Options:
  -y, --yes         Skip prompts; install all artifacts
  --providers=a,b   Providers for --yes (default: config.json)
  --target=...      global | project (default: config.json)
  -h, --help        Show this help`,
    );
    return;
  }

  const config = await loadConfig(root);
  const target = (flags.target ?? config.target) as SyncContext["target"];
  if (target !== "global" && target !== "project") {
    console.error(
      c.red(`Invalid target "${target}" (expected global|project).`),
    );
    Deno.exit(1);
  }

  // Non-interactive path.
  if (flags.yes && (command === "sync" || command === "menu")) {
    const providers = flags.providers
      ? flags.providers.split(",").map((s) => s.trim()).filter(Boolean)
      : config.providers;
    await nonInteractiveSync(providers, target);
    return;
  }

  if (command === "list") {
    await runList();
    return;
  }

  if (!Deno.stdin.isTerminal()) {
    console.error(
      c.red("No interactive terminal detected.") +
        " Use `deno task sync --yes` for non-interactive installs.",
    );
    Deno.exit(1);
  }

  try {
    if (command === "new") await runNew();
    else if (command === "sync") await runSync();
    else if (command === "desync") await runDesync();
    else await mainMenu();
  } catch (err) {
    // Cliffy throws on Ctrl-C / aborted prompt — exit cleanly.
    if (err instanceof Error && /cancel|abort/i.test(err.message)) {
      console.log(c.dim("\nCancelled."));
      return;
    }
    throw err;
  }
}

if (import.meta.main) {
  await main();
}
