import { join } from "@std/path";
import type { Artifact, PlannedFile, Provider, SyncContext } from "../types.ts";
import { frontmatterLines, str, toList, withFrontmatter } from "../util.ts";

/**
 * Claude Code. Installs into `~/.claude` (global) or `<repo>/.claude` (project):
 *   agents   -> agents/<name>.md   (frontmatter: name, description, model, tools)
 *   commands -> commands/<name>.md (frontmatter: description, argument-hint)
 *   skills   -> skills/<name>/     (directory copy, incl. SKILL.md + assets)
 */
export const claude: Provider = {
  id: "claude",
  label: "Claude Code",

  baseDir(ctx: SyncContext): string {
    return ctx.target === "global"
      ? join(ctx.home, ".claude")
      : join(ctx.cwd, ".claude");
  },

  plan(artifacts: Artifact[], ctx: SyncContext): PlannedFile[] {
    const base = this.baseDir(ctx);
    const planned: PlannedFile[] = [];

    for (const a of artifacts) {
      const fm = a.frontmatter;
      if (a.kind === "agent") {
        const tools = toList(fm.tools);
        const frontmatter = frontmatterLines([
          ["name", a.name],
          ["description", str(fm.description)],
          ["model", str(fm.model)],
          ["tools", tools.length ? tools.join(", ") : undefined],
        ]);
        planned.push({
          path: join(base, "agents", `${a.name}.md`),
          contents: withFrontmatter(frontmatter, a.body),
        });
      } else if (a.kind === "command") {
        const frontmatter = frontmatterLines([
          ["description", str(fm.description)],
          ["argument-hint", str(fm["argument-hint"])],
          ["model", str(fm.model)],
        ]);
        planned.push({
          path: join(base, "commands", `${a.name}.md`),
          contents: withFrontmatter(frontmatter, a.body),
        });
      } else if (a.kind === "skill" && a.dir) {
        planned.push({ path: join(base, "skills", a.name), copyDir: a.dir });
      }
    }

    return planned;
  },
};
