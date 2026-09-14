import { deepStrictEqual, equal, rejects, throws } from "node:assert/strict";
import { join } from "@std/path";
import { parse } from "@std/toml";
import { codex } from "./providers/codex.ts";
import {
  installProvider,
  migrateCodexPrompts,
  pruneEmptyDirs,
  removePaths,
} from "./engine.ts";
import { loadArtifacts } from "./load.ts";
import { updateMcp } from "./mcp.ts";
import type { Artifact, SyncContext } from "./types.ts";

const agent: Artifact = {
  kind: "agent",
  name: "reviewer",
  sourcePath: "/source/reviewer.md",
  frontmatter: {
    description: "Review code",
    model: "sonnet",
    tools: ["Read"],
    codex: { model: "gpt-5.6", sandbox_mode: "read-only" },
  },
  body: 'Review "quotes", \\paths, and\nmultiple lines.\n',
};
const mcp = (name: string, config: Record<string, unknown>): Artifact => ({
  kind: "mcp",
  name,
  sourcePath: "/source/mcps.json",
  body: "",
  frontmatter: config,
});
async function fixture(run: (ctx: SyncContext) => Promise<void>) {
  const root = await Deno.makeTempDir();
  try {
    await run({
      target: "global",
      home: join(root, "home"),
      cwd: join(root, "project"),
      dryRun: false,
    });
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("Codex emits native agents, preserves instructions, and uses explicit Codex model overrides", () => {
  const ctx: SyncContext = {
    target: "global",
    home: "/home/me",
    cwd: "/repo",
    dryRun: true,
    codexHome: "/custom/codex",
  };
  const [file] = codex.plan([agent], ctx);
  equal(file.path, "/custom/codex/agents/reviewer.toml");
  deepStrictEqual(parse(file.contents!), {
    name: "reviewer",
    description: "Review code",
    developer_instructions: agent.body.trim(),
    model: "gpt-5.6",
    sandbox_mode: "read-only",
  });
  const [inherited] = codex.plan([{
    ...agent,
    frontmatter: { description: "Review", model: "sonnet" },
  }], ctx);
  equal(parse(inherited.contents!).model, undefined);
  equal(
    codex.plan([agent], { ...ctx, target: "project" })[0].path,
    "/repo/.codex/agents/reviewer.toml",
  );
});

for (const target of ["global", "project"] as const) {
  Deno.test(`Codex ${target} sync copies skill assets and safely desyncs`, () =>
    fixture(async (ctx) => {
      ctx.target = target;
      const source = join(ctx.cwd, "skills", "sample");
      await Deno.mkdir(join(source, "references"), { recursive: true });
      await Deno.writeTextFile(
        join(source, "SKILL.md"),
        "---\nname: sample\ndescription: Example\n---\nInstructions\n",
      );
      await Deno.writeTextFile(join(source, "references", "guide.md"), "asset");
      const artifacts = await loadArtifacts(ctx.cwd);
      const paths = await installProvider(codex, [...artifacts, agent], ctx);
      const skillRoot = join(
        target === "global" ? ctx.home : ctx.cwd,
        ".agents",
        "skills",
      );
      equal(
        await Deno.readTextFile(
          join(skillRoot, "sample", "references", "guide.md"),
        ),
        "asset",
      );
      await removePaths(paths, false);
      await pruneEmptyDirs(paths, [codex.baseDir(ctx), skillRoot], false);
      equal((await Deno.stat(skillRoot)).isDirectory, true);
      equal((await Deno.stat(codex.baseDir(ctx))).isDirectory, true);
    }));
}

Deno.test("MCP sync preserves comments/settings, updates idempotently, and desync removes only selected blocks", () =>
  fixture(async (ctx) => {
    const configPath = join(codex.baseDir(ctx), "config.toml");
    await Deno.mkdir(codex.baseDir(ctx), { recursive: true });
    const original =
      '# personal settings\nmodel = "personal-model"\n\n[mcp_servers.personal]\nurl = "https://personal.example/mcp"\n';
    await Deno.writeTextFile(configPath, original);
    const a = mcp("local", {
      command: "npx",
      args: ["-y", "example"],
      env: { SAMPLE: 'quoted"value' },
      env_vars: ["TOKEN"],
    });
    const b = mcp("remote", {
      url: "https://remote.example/mcp",
      bearer_token_env_var: "TOKEN",
    });
    const paths = await installProvider(codex, [a, b], ctx);
    equal(paths.includes(configPath), false);
    const first = await Deno.readTextFile(configPath);
    equal(first.startsWith(original), true);
    await installProvider(codex, [a, b], ctx);
    equal(await Deno.readTextFile(configPath), first);
    await installProvider(codex, [mcp("local", { command: "updated" })], ctx);
    const servers = parse(await Deno.readTextFile(configPath))
      .mcp_servers as Record<string, unknown>;
    deepStrictEqual(servers.local, { command: "updated" });
    await removePaths([paths[0]], false);
    equal(
      (parse(await Deno.readTextFile(configPath)).mcp_servers as Record<
        string,
        unknown
      >).local,
      undefined,
    );
    await removePaths([paths[1]], false);
    equal(await Deno.readTextFile(configPath), original);
    await removePaths(paths, false);
    equal(await Deno.readTextFile(configPath), original);
  }));

Deno.test("MCP conflicts fail before any artifact writes; malformed blocks and config are rejected", () =>
  fixture(async (ctx) => {
    const configPath = join(codex.baseDir(ctx), "config.toml");
    await Deno.mkdir(codex.baseDir(ctx), { recursive: true });
    const original = '[mcp_servers.existing]\ncommand = "personal"\n';
    await Deno.writeTextFile(configPath, original);
    await rejects(
      () =>
        installProvider(codex, [
          agent,
          mcp("existing", { command: "replacement" }),
        ], ctx),
      /already exists/,
    );
    equal(await Deno.readTextFile(configPath), original);
    await rejects(
      () => Deno.stat(join(codex.baseDir(ctx), "agents")),
      Deno.errors.NotFound,
    );
    throws(() => updateMcp("[broken", "server", { command: "test" }));
    throws(
      () =>
        updateMcp("# BEGIN ai-sync MCP server\n", "server", {
          command: "test",
        }),
      /Malformed/,
    );
    const block = updateMcp("", "server", { command: "test" });
    throws(
      () =>
        updateMcp(
          block.replace("# END", "[unrelated]\nvalue = 1\n# END"),
          "server",
        ),
      /unexpected settings/,
    );
  }));

Deno.test("dry run changes neither config nor files", () =>
  fixture(async (ctx) => {
    ctx.dryRun = true;
    const paths = await installProvider(codex, [
      agent,
      mcp("server", { command: "test" }),
    ], ctx);
    equal(paths.length, 2);
    await rejects(() => Deno.stat(ctx.home), Deno.errors.NotFound);
  }));

Deno.test("legacy migration only removes tracked, unmodified agent prompts, preserving commands", () =>
  fixture(async (ctx) => {
    const path = join(codex.baseDir(ctx), "prompts", "reviewer.md");
    await Deno.mkdir(join(codex.baseDir(ctx), "prompts"), { recursive: true });
    await Deno.writeTextFile(path, `${agent.body.trim()}\n`);
    deepStrictEqual(await migrateCodexPrompts(codex, [agent], ctx, []), []);
    deepStrictEqual(
      await migrateCodexPrompts(
        codex,
        [agent, { ...agent, kind: "command" }],
        ctx,
        [path],
      ),
      [],
    );
    await Deno.writeTextFile(path, "");
    deepStrictEqual(await migrateCodexPrompts(codex, [agent], ctx, [path]), []);
    await Deno.writeTextFile(path, "user modified");
    deepStrictEqual(await migrateCodexPrompts(codex, [agent], ctx, [path]), []);
    await Deno.writeTextFile(path, `${agent.body.trim()}\n`);
    deepStrictEqual(await migrateCodexPrompts(codex, [agent], ctx, [path]), [
      path,
    ]);
    await rejects(() => Deno.stat(path), Deno.errors.NotFound);
  }));

Deno.test("loader discovers MCPs, rejects malformed sources and path traversal names", () =>
  fixture(async (ctx) => {
    await Deno.mkdir(ctx.cwd, { recursive: true });
    const path = join(ctx.cwd, "mcps.json");
    await Deno.writeTextFile(
      path,
      JSON.stringify({
        local: { command: "npx", args: ["example"] },
        remote: { url: "https://example.com/mcp" },
      }),
    );
    deepStrictEqual(
      (await loadArtifacts(ctx.cwd)).map((a) => [a.kind, a.name]),
      [["mcp", "local"], ["mcp", "remote"]],
    );
    for (
      const invalid of [
        [],
        { bad: {} },
        { bad: { command: 3, url: "https://example.com" } },
        { bad: { command: "test", args: "bad" } },
        { bad: { command: "test", env: { TOKEN: 123 } } },
        {
          bad: { command: "test", url: "https://example.com" },
        },
        { "../escape": { command: "test" } },
      ]
    ) {
      await Deno.writeTextFile(path, JSON.stringify(invalid));
      await rejects(() => loadArtifacts(ctx.cwd));
    }
  }));
