import { parse, stringify } from "@std/toml";

/** Manifest references identify sections, never the shared config file itself. */
export function mcpReference(path: string, name: string): string {
  return `${path}#mcp:${encodeURIComponent(name)}`;
}

export function parseMcpReference(
  ref: string,
): { path: string; name: string } | undefined {
  const index = ref.lastIndexOf("#mcp:");
  if (index < 0) return;
  return {
    path: ref.slice(0, index),
    name: decodeURIComponent(ref.slice(index + 5)),
  };
}

/** Keep all user text intact; refuse collisions with servers outside our block. */
export function updateMcp(
  text: string,
  name: string,
  config?: Record<string, unknown>,
): string {
  parse(text); // Never modify an already-invalid configuration.
  const id = encodeURIComponent(name);
  const start = `# BEGIN ai-sync MCP ${id}\n`;
  const end = `# END ai-sync MCP ${id}\n`;
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  let unmanaged = text;
  if (from >= 0 || to >= 0) {
    if (
      from < 0 || to < from || text.indexOf(start, from + start.length) >= 0 ||
      text.indexOf(end, to + end.length) >= 0
    ) {
      throw new Error(`Malformed managed MCP block for ${name}`);
    }
    // Confirm markers enclose only this server, not unrelated user settings.
    const block = parse(text.slice(from + start.length, to));
    const servers = block.mcp_servers as Record<string, unknown> | undefined;
    if (
      Object.keys(block).length !== 1 || !servers ||
      Object.keys(servers).length !== 1 || !Object.hasOwn(servers, name)
    ) {
      throw new Error(
        `Managed MCP block for ${name} contains unexpected settings`,
      );
    }
    unmanaged = text.slice(0, from) + text.slice(to + end.length);
  }
  const parsed = parse(unmanaged);
  if (config === undefined) return unmanaged;
  const servers = parsed.mcp_servers;
  if (
    servers && (typeof servers !== "object" || Object.hasOwn(servers, name))
  ) {
    throw new Error(
      `MCP server ${name} already exists outside ai-sync; rename the source or move the existing entry before syncing`,
    );
  }
  const block = start + stringify({ mcp_servers: { [name]: config } }) + end;
  const result = from >= 0
    ? text.slice(0, from) + block + text.slice(to + end.length)
    : unmanaged + (unmanaged && !unmanaged.endsWith("\n") ? "\n" : "") + block;
  parse(result);
  return result;
}
