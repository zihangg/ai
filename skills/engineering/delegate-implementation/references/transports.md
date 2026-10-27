# Subagent transports

Each transport starts one subagent per story in the story's worktree and gets
its report back. The installed CLI decides the syntax. When a command here
fails, read that CLI's help before you change the command.

Every brief tells the subagent to write its final report to a file next to the
brief, such as `<brief-dir>/<story>-report.md`. Read that file, not terminal
output, so every transport returns results the same way.

## Provider subagent tool

Use the provider's own tool, such as the Claude Code `Agent` tool or Codex
subagents. Set the model when the tool accepts one. Run it in the background
when the provider supports that, and wait for its completion notice. A Claude
Code subagent cannot change its working directory, so give it absolute paths
under the worktree.

## bb

Use bb when `BB_THREAD_ID` is set. Run `bb status` first to get the project ID.

```text
bb thread spawn --project <project-id> --parent-self \
  --environment <worktree-path> --model <model-id> \
  --title "<story>" --prompt-file <brief-path>
```

`--parent-self` wakes this thread when the child finishes, fails, or gets stuck,
so do not poll. Use `bb thread wait <thread-id>` only when you must block. For a
fix round, spawn a new thread. Do not use `bb thread tell` to reuse a finished
thread.

## Herdr

Use Herdr when `HERDR_ENV=1`. Invoking this skill is the user's request to start
agents. Keep the user's focus in the calling pane.

```text
herdr pane split --current --direction right --cwd <worktree-path> --no-focus
herdr agent start <story-name> --kind claude --pane <new-pane-id> -- --model <model-id>
herdr agent prompt <story-name> "Read <brief-path> and follow it." --wait --timeout 1800000
```

Read the new pane ID from `.result.pane.pane_id` in the split output. Use
`--direction down` when the calling pane is narrow. Agent names must match
`[a-z][a-z0-9_-]{0,31}`. If a wait returns `blocked`, run
`herdr agent read <story-name> --source recent-unwrapped --lines 120` and ask
the user before you answer an approval prompt. A timeout does not prove the
prompt failed, so do not send it again without reading the pane. Close only the
panes you created, and only after you read the report.
