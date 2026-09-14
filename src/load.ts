import { basename, dirname, join, relative } from "@std/path";
import { walk } from "@std/fs/walk";
import type { Artifact } from "./types.ts";
import { parseFrontmatter, str } from "./util.ts";

/** "in-progress" -> "In Progress", "engineering" -> "Engineering". */
function titleCase(segment: string): string {
  return segment
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdown(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".md")) {
      files.push(join(dir, entry.name));
    }
  }
  return files.sort();
}

async function loadFlat(
  dir: string,
  kind: Artifact["kind"],
): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];
  for (const sourcePath of await listMarkdown(dir)) {
    const text = await Deno.readTextFile(sourcePath);
    const { frontmatter, body } = parseFrontmatter(text);
    const name = str(frontmatter.name) ?? basename(sourcePath, ".md");
    const category = str(frontmatter.category);
    artifacts.push({ kind, name, category, frontmatter, body, sourcePath });
  }
  return artifacts;
}

/**
 * A skill is any directory containing a `SKILL.md`, found at any depth under
 * `skills/`. The directory name is the skill name; intermediate path segments
 * (e.g. `skills/engineering/tdd/`) become the category, unless overridden by a
 * `category` frontmatter field. Assets beside `SKILL.md` ride along on install.
 */
async function loadSkills(dir: string): Promise<Artifact[]> {
  if (!(await exists(dir))) return [];
  const artifacts: Artifact[] = [];
  for await (
    const entry of walk(dir, {
      includeDirs: false,
      match: [/(^|\/)SKILL\.md$/],
    })
  ) {
    const sourcePath = entry.path;
    const skillDir = dirname(sourcePath);
    const { frontmatter, body } = parseFrontmatter(
      await Deno.readTextFile(sourcePath),
    );
    const name = str(frontmatter.name) ?? basename(skillDir);
    // Path between skills/ and the skill's own directory → category.
    const between = relative(dir, dirname(skillDir));
    const dirCategory = between
      ? between.split(/[\\/]/).map(titleCase).join(" / ")
      : undefined;
    artifacts.push({
      kind: "skill",
      name,
      category: str(frontmatter.category) ?? dirCategory,
      frontmatter,
      body,
      sourcePath,
      dir: skillDir,
    });
  }
  return artifacts.sort((a, b) => a.name.localeCompare(b.name));
}

/** Load every artifact under the repo's source directories. */
export async function loadArtifacts(root: string): Promise<Artifact[]> {
  const [agents, commands, skills, mcps] = await Promise.all([
    loadFlat(join(root, "agents"), "agent"),
    loadFlat(join(root, "commands"), "command"),
    loadSkills(join(root, "skills")),
    loadMcps(join(root, "mcps.json")),
  ]);
  const artifacts = [...agents, ...commands, ...skills, ...mcps];
  const seen = new Set<string>();
  for (const a of artifacts) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(a.name)) {
      throw new Error(
        `Invalid artifact name ${JSON.stringify(a.name)} in ${a.sourcePath}`,
      );
    }
    const key = `${a.kind}:${a.name}`;
    if (seen.has(key)) throw new Error(`Duplicate artifact ${key}`);
    seen.add(key);
  }
  return artifacts;
}

/** MCP entries use Codex's native config keys. */
async function loadMcps(sourcePath: string): Promise<Artifact[]> {
  let text: string;
  try {
    text = await Deno.readTextFile(sourcePath);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    throw err;
  }
  const servers: unknown = JSON.parse(text);
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error(
      `${sourcePath} must contain an object of named MCP servers`,
    );
  }
  return Object.entries(servers).map(([name, config]) => {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`Invalid MCP server ${name}`);
    }
    const fm = config as Record<string, unknown>;
    const command = str(fm.command);
    const url = str(fm.url);
    if (
      !!command === !!url || ("command" in fm && !command) ||
      ("url" in fm && !url)
    ) {
      throw new Error(`MCP server ${name} needs exactly one of command or url`);
    }
    for (const key of ["args", "env_vars", "enabled_tools", "disabled_tools"]) {
      if (
        key in fm &&
        (!Array.isArray(fm[key]) ||
          !(fm[key] as unknown[]).every((v) => typeof v === "string"))
      ) {
        throw new Error(
          `MCP server ${name}: ${key} must be an array of strings`,
        );
      }
    }
    for (const key of ["env", "http_headers", "env_http_headers"]) {
      const value = fm[key];
      if (
        key in fm &&
        (!value || typeof value !== "object" || Array.isArray(value) ||
          !Object.values(value).every((v) => typeof v === "string"))
      ) {
        throw new Error(
          `MCP server ${name}: ${key} must be an object of strings`,
        );
      }
    }
    return {
      kind: "mcp",
      name,
      category: "MCP Servers",
      frontmatter: fm,
      body: "",
      sourcePath,
    };
  });
}
