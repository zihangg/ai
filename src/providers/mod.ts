import type { Provider } from "../types.ts";
import { claude } from "./claude.ts";
import { codex } from "./codex.ts";
import { opencode } from "./opencode.ts";

/** All known provider adapters, keyed by id. Add new providers here. */
export const PROVIDERS: Record<string, Provider> = {
  [claude.id]: claude,
  [codex.id]: codex,
  [opencode.id]: opencode,
};

/** Resolve a list of provider ids to adapters, throwing on unknown ids. */
export function resolveProviders(ids: string[]): Provider[] {
  return ids.map((id) => {
    const provider = PROVIDERS[id];
    if (!provider) {
      const known = Object.keys(PROVIDERS).join(", ");
      throw new Error(`Unknown provider "${id}". Known providers: ${known}`);
    }
    return provider;
  });
}
