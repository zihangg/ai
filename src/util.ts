import { parse as parseYaml } from "@std/yaml";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split a markdown document into its YAML frontmatter object and body. */
export function parseFrontmatter(
  text: string,
): { frontmatter: Record<string, unknown>; body: string } {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: {}, body: text };
  const parsed = parseYaml(match[1]) ?? {};
  const frontmatter = typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  return { frontmatter, body: text.slice(match[0].length) };
}

/**
 * Render a YAML scalar, quoting only when necessary. Falls back to a
 * double-quoted JSON string, which is a valid subset of YAML double-quoting.
 */
export function yamlScalar(value: string): string {
  if (value === "") return '""';
  const safePlain = /^[\w.\-/@ ]+$/.test(value) && !/^\s|\s$/.test(value);
  return safePlain ? value : JSON.stringify(value);
}

/** Build a `key: value` frontmatter block (no surrounding `---`). */
export function frontmatterLines(
  entries: Array<[string, string | undefined]>,
): string {
  return entries
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${yamlScalar(String(v))}`)
    .join("\n");
}

/** Wrap a body with a frontmatter block. */
export function withFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return `${body.trimStart()}\n`;
  return `---\n${frontmatter}\n---\n\n${body.trimStart()}\n`;
}

/** Coerce a frontmatter value that may be a list or comma string into a string array. */
export function toList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

/** Read an optional string frontmatter field. */
export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
