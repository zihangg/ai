import { join } from "@std/path";

export interface SyncConfig {
  /** Provider ids to install for. */
  providers: string[];
  /** Default install target. */
  target: "global" | "project";
}

const DEFAULT_CONFIG: SyncConfig = {
  providers: ["claude", "codex", "opencode"],
  target: "global",
};

/** Load `config.json` from the repo root, merged over defaults. */
export async function loadConfig(root: string): Promise<SyncConfig> {
  const path = join(root, "config.json");
  try {
    const raw = JSON.parse(await Deno.readTextFile(path)) as Partial<
      SyncConfig
    >;
    return {
      providers: raw.providers ?? DEFAULT_CONFIG.providers,
      target: raw.target ?? DEFAULT_CONFIG.target,
    };
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return { ...DEFAULT_CONFIG };
    throw err;
  }
}
