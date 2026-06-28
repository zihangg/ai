import { dirname, join } from "@std/path";

/** Maps `target -> providerId -> list of installed destination paths`. */
export type Manifest = Record<string, Record<string, string[]>>;

function manifestPath(root: string): string {
  return join(root, ".sync", "manifest.json");
}

export async function readManifest(root: string): Promise<Manifest> {
  try {
    return JSON.parse(await Deno.readTextFile(manifestPath(root))) as Manifest;
  } catch {
    return {};
  }
}

export async function writeManifest(
  root: string,
  manifest: Manifest,
): Promise<void> {
  const path = manifestPath(root);
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(manifest, null, 2) + "\n");
}

/** Add installed paths for a target+provider, de-duplicating (additive sync). */
export function recordInstall(
  manifest: Manifest,
  target: string,
  providerId: string,
  paths: string[],
): void {
  manifest[target] ??= {};
  const prev = manifest[target][providerId] ?? [];
  manifest[target][providerId] = [...new Set([...prev, ...paths])];
}

/** Drop installed paths for a target+provider after a desync. */
export function recordRemoval(
  manifest: Manifest,
  target: string,
  providerId: string,
  removed: string[],
): void {
  const drop = new Set(removed);
  const remaining = (manifest[target]?.[providerId] ?? []).filter((p) =>
    !drop.has(p)
  );
  if (manifest[target]) manifest[target][providerId] = remaining;
}
