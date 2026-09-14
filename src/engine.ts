import { copy } from "@std/fs/copy";
import { dirname, join } from "@std/path";
import type { Artifact, PlannedFile, Provider, SyncContext } from "./types.ts";
import { mcpReference, parseMcpReference, updateMcp } from "./mcp.ts";

/** Resolve the home directory, supporting both POSIX and Windows. */
export function homeDir(): string {
  const h = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (!h) {
    throw new Error(
      "Could not resolve home directory (HOME / USERPROFILE unset).",
    );
  }
  return h;
}

/** Build a sync context for a given target. */
export function makeContext(
  target: SyncContext["target"],
  cwd: string,
  dryRun = false,
): SyncContext {
  return {
    target,
    home: homeDir(),
    cwd,
    dryRun,
    codexHome: Deno.env.get("CODEX_HOME") || undefined,
  };
}

async function readOptional(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return "";
    throw err;
  }
}

async function writePlanned(file: PlannedFile, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  await Deno.mkdir(dirname(file.path), { recursive: true });
  if (file.copyDir) {
    await copy(file.copyDir, file.path, { overwrite: true });
  } else {
    await Deno.writeTextFile(file.path, file.contents ?? "");
  }
}

/**
 * Install `artifacts` for a single provider. Returns the absolute paths written.
 * This is additive — it never removes anything; use {@link removePaths} for that.
 */
export async function installProvider(
  provider: Provider,
  artifacts: Artifact[],
  ctx: SyncContext,
): Promise<string[]> {
  const planned = provider.plan(artifacts, ctx);
  // Validate all shared-config merges before writing any artifact.
  const configs = new Map<string, string>();
  for (const file of planned) {
    if (!file.mcp) continue;
    const text = configs.get(file.path) ?? await readOptional(file.path);
    configs.set(file.path, updateMcp(text, file.mcp.name, file.mcp.config));
  }
  for (const file of planned) {
    if (!file.mcp) await writePlanned(file, ctx.dryRun);
  }
  for (const [path, contents] of configs) {
    await writePlanned({ path, contents }, ctx.dryRun);
  }
  return planned.map((p) => p.mcp ? mcpReference(p.path, p.mcp.name) : p.path);
}

/** Retire legacy agent prompts only when tracked and still match the source. */
export async function migrateCodexPrompts(
  provider: Provider,
  artifacts: Artifact[],
  ctx: SyncContext,
  installed: string[],
): Promise<string[]> {
  if (provider.id !== "codex") return [];
  const commands = new Set(
    artifacts.filter((a) => a.kind === "command").map((a) => a.name),
  );
  const removed: string[] = [];
  for (const a of artifacts) {
    if (a.kind !== "agent" || commands.has(a.name)) continue;
    const path = join(provider.baseDir(ctx), "prompts", `${a.name}.md`);
    if (!installed.includes(path)) continue;
    try {
      const contents = await Deno.readTextFile(path);
      if (contents !== `${a.body.trim()}\n`) continue;
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
    await removePaths([path], ctx.dryRun);
    removed.push(path);
  }
  return removed;
}

/** Remove the given paths (files or directories). Missing paths are ignored. */
export async function removePaths(
  paths: string[],
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  for (const path of paths) {
    const mcp = parseMcpReference(path);
    if (mcp) {
      const before = await readOptional(mcp.path);
      const after = updateMcp(before, mcp.name);
      if (after !== before) await Deno.writeTextFile(mcp.path, after);
      continue;
    }
    try {
      await Deno.remove(path, { recursive: true });
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
    }
  }
}

/**
 * Best-effort removal of directories left empty after a desync. Walks up from
 * each removed path, stopping at (and never deleting) any of `stopRoots`.
 */
export async function pruneEmptyDirs(
  removed: string[],
  stopRoots: string[],
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  const stops = new Set(stopRoots);
  const seen = new Set<string>();
  for (const path of removed) {
    if (parseMcpReference(path)) continue;
    let dir = dirname(path);
    while (dir && !stops.has(dir) && !seen.has(dir)) {
      seen.add(dir);
      try {
        await Deno.remove(dir); // non-recursive: throws if not empty
      } catch {
        break; // not empty, or gone — stop climbing this branch
      }
      dir = dirname(dir);
    }
  }
}
