import { join } from "@std/path";
import type { Artifact, PlannedFile, Provider, SyncContext } from "../types.ts";

/**
 * OpenAI Codex CLI. Codex has no first-class "agent" concept; it exposes
 * reusable custom prompts as plain markdown under `~/.codex/prompts/`
 * (invoked as `/<name>`). We map both agents and commands to prompts.
 *
 * Skills have no Codex equivalent and are skipped (reported by the sync run).
 */
export const codex: Provider = {
  id: "codex",
  label: "Codex CLI",

  baseDir(ctx: SyncContext): string {
    return ctx.target === "global"
      ? join(ctx.home, ".codex")
      : join(ctx.cwd, ".codex");
  },

  plan(artifacts: Artifact[], ctx: SyncContext): PlannedFile[] {
    const base = this.baseDir(ctx);
    const planned: PlannedFile[] = [];

    for (const a of artifacts) {
      if (a.kind === "agent" || a.kind === "command") {
        // Codex prompts are plain markdown — no frontmatter.
        planned.push({
          path: join(base, "prompts", `${a.name}.md`),
          contents: `${a.body.trim()}\n`,
        });
      }
      // skills: unsupported by Codex — intentionally skipped.
    }

    return planned;
  },
};
