/** The three kinds of artifact this repo can author and install. */
export type ArtifactKind = "agent" | "skill" | "command";

/** A single source artifact, parsed from `agents/`, `skills/`, or `commands/`. */
export interface Artifact {
  kind: ArtifactKind;
  /** Stable identifier — derived from frontmatter `name` or the file/dir name. */
  name: string;
  /** Optional grouping label (frontmatter `category`); used by the picker. */
  category?: string;
  /** Parsed YAML frontmatter (empty object when none present). */
  frontmatter: Record<string, unknown>;
  /** Markdown body (everything after the frontmatter block). */
  body: string;
  /** Absolute path of the source file (SKILL.md for skills). */
  sourcePath: string;
  /** For skills only: absolute path of the skill directory (holds SKILL.md + assets). */
  dir?: string;
}

/** Where a sync run installs to and the environment it resolves paths against. */
export interface SyncContext {
  /** `global` installs into the user's home config dirs; `project` into the repo. */
  target: "global" | "project";
  /** Resolved home directory. */
  home: string;
  /** Repo root (used for `project` target and the manifest). */
  cwd: string;
  /** When true, plan and report but write nothing. */
  dryRun: boolean;
}

/** One file (or directory copy) a provider wants written to disk. */
export interface PlannedFile {
  /** Absolute destination path. */
  path: string;
  /** Text contents to write. Mutually exclusive with `copyDir`. */
  contents?: string;
  /** Source directory to recursively copy to `path`. Used for skills with assets. */
  copyDir?: string;
}

/** A provider adapter: knows where and how each artifact kind is installed. */
export interface Provider {
  /** Stable id used in config and the manifest (e.g. "claude"). */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Resolve the base directory this provider installs into. */
  baseDir(ctx: SyncContext): string;
  /** Turn the source artifacts into a concrete set of files to write. */
  plan(artifacts: Artifact[], ctx: SyncContext): PlannedFile[];
}
