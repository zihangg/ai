import { join } from "@std/path";
import { stringify } from "@std/toml";
import type { Artifact, PlannedFile, Provider, SyncContext } from "../types.ts";
import { str } from "../util.ts";

/** Codex skills use .agents/skills; agents and MCP config use .codex. */
export const codex: Provider = {
  id: "codex",
  label: "Codex CLI",

  baseDir(ctx: SyncContext): string {
    return ctx.target === "global"
      ? ctx.codexHome ?? join(ctx.home, ".codex")
      : join(ctx.cwd, ".codex");
  },

  plan(artifacts: Artifact[], ctx: SyncContext): PlannedFile[] {
    const base = this.baseDir(ctx);
    const skills = join(
      ctx.target === "global" ? ctx.home : ctx.cwd,
      ".agents",
      "skills",
    );
    const planned: PlannedFile[] = [];

    for (const a of artifacts) {
      if (a.kind === "agent") {
        const overrides = a.frontmatter.codex ?? {};
        if (
          !overrides || typeof overrides !== "object" ||
          Array.isArray(overrides)
        ) {
          throw new Error(
            `Agent ${a.name}: codex frontmatter must be an object`,
          );
        }
        const description = str(a.frontmatter.description);
        if (!description) {
          throw new Error(`Agent ${a.name} needs a description for Codex`);
        }
        planned.push({
          path: join(base, "agents", `${a.name}.toml`),
          contents: stringify({
            ...overrides,
            name: a.name,
            description,
            developer_instructions: a.body.trim(),
          }),
        });
      } else if (a.kind === "command") {
        planned.push({
          path: join(base, "prompts", `${a.name}.md`),
          contents: `${a.body.trim()}\n`,
        });
      } else if (a.kind === "skill" && a.dir) {
        planned.push({ path: join(skills, a.name), copyDir: a.dir });
      } else if (a.kind === "mcp") {
        planned.push({
          path: join(base, "config.toml"),
          mcp: { name: a.name, config: a.frontmatter },
        });
      }
    }

    return planned;
  },
};
