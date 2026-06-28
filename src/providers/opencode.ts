import { join } from "@std/path";
import type { Artifact, PlannedFile, Provider, SyncContext } from "../types.ts";
import { frontmatterLines, str, toList, withFrontmatter } from "../util.ts";

/**
 * OpenCode. Installs into `~/.config/opencode` (global) or `<repo>/.opencode`
 * (project):
 *   agents   -> agent/<name>.md   (frontmatter: description, mode, model, tools)
 *   commands -> command/<name>.md (frontmatter: description)
 *   skills   -> skill/<name>/     (directory copy)
 *
 * Note: OpenCode model ids are namespaced (e.g. `anthropic/claude-sonnet-4-6`).
 * Generic aliases like `sonnet` are passed through unchanged — adjust the
 * source frontmatter or extend this adapter if your setup needs full ids.
 */
export const opencode: Provider = {
  id: "opencode",
  label: "OpenCode",

  baseDir(ctx: SyncContext): string {
    return ctx.target === "global"
      ? join(ctx.home, ".config", "opencode")
      : join(ctx.cwd, ".opencode");
  },

  plan(artifacts: Artifact[], ctx: SyncContext): PlannedFile[] {
    const base = this.baseDir(ctx);
    const planned: PlannedFile[] = [];

    for (const a of artifacts) {
      const fm = a.frontmatter;
      if (a.kind === "agent") {
        const lines = frontmatterLines([
          ["description", str(fm.description)],
          ["mode", str(fm.mode) ?? "subagent"],
          ["model", str(fm.model)],
        ]);
        const tools = toList(fm.tools);
        const toolsBlock = tools.length
          ? `\ntools:\n${tools.map((t) => `  ${t}: true`).join("\n")}`
          : "";
        planned.push({
          path: join(base, "agent", `${a.name}.md`),
          contents: withFrontmatter(lines + toolsBlock, a.body),
        });
      } else if (a.kind === "command") {
        const lines = frontmatterLines([["description", str(fm.description)]]);
        planned.push({
          path: join(base, "command", `${a.name}.md`),
          contents: withFrontmatter(lines, a.body),
        });
      } else if (a.kind === "skill" && a.dir) {
        planned.push({ path: join(base, "skill", a.name), copyDir: a.dir });
      }
    }

    return planned;
  },
};
