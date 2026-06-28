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
  const [agents, commands, skills] = await Promise.all([
    loadFlat(join(root, "agents"), "agent"),
    loadFlat(join(root, "commands"), "command"),
    loadSkills(join(root, "skills")),
  ]);
  return [...agents, ...commands, ...skills];
}
