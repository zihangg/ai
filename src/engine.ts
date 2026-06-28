import { copy } from "@std/fs/copy";
import { dirname } from "@std/path";
import type { Artifact, PlannedFile, Provider, SyncContext } from "./types.ts";

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
  return { target, home: homeDir(), cwd, dryRun };
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
  for (const file of planned) await writePlanned(file, ctx.dryRun);
  return planned.map((p) => p.path);
}

/** Remove the given paths (files or directories). Missing paths are ignored. */
export async function removePaths(
  paths: string[],
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  for (const path of paths) {
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
