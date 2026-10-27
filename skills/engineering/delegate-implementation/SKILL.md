---
name: delegate-implementation
description: Approves the current plan and hands implementation to subagents that the orchestrator steers and reviews, without writing code itself. Use only when the user invokes it after a plan.
disable-model-invocation: true
argument-hint: "[--via subagent|bb|herdr] [--model <id>] [extra instructions]"
---

# Delegate implementation

The user approves the plan in this conversation. Do not write production or test
code yourself. Steer the subagents, review every result, and own the outcome.
Read `$ARGUMENTS` for a transport, a model, or extra instructions.

## Prepare

1. Restate the user's goal and the problem in two or three sentences. Stop and
   ask if the plan leaves a material choice open.
2. Run `git fetch origin`. Create a worktree branched from
   `origin/<default-branch>`, through the repository's worktree workflow when
   one exists. Record the base SHA. Never pull into the user's main checkout.
3. Split the plan into stories. Give each story the files it may change, its
   acceptance criteria, and the commands that prove them. Run stories in
   sequence when they touch the same files or depend on an unfinished interface.
4. Read every `AGENTS.md` or `CLAUDE.md` on the paths the plan touches, and the
   guides and rule sets they link to. Collect the rules that apply. You review
   against them later.

## Delegate

5. Select the transport. Use `--via` when the user gave it. Otherwise use bb
   when `BB_THREAD_ID` is set, Herdr when `HERDR_ENV=1`, and the provider's own
   subagent tool in every other case. Read
   [references/transports.md](references/transports.md) for the commands. If the
   selected transport fails, say so and use the provider's subagent tool.
6. Choose the model per story. Default `claude-sonnet-5-5`. Use
   `claude-opus-5-5` for a story with concurrency, state-machine, money, or
   cross-cutting design risk. `--model` overrides the default.
7. Write one brief per story to a file. It contains the worktree path, the base
   SHA, the story, the files in scope, the acceptance criteria, the proof
   commands, the rules from step 4, the test rules from step 10, and the path
   for its final report. Pass file paths, not pasted file contents.
8. Tell the subagent to reply first with its own restatement of the story and
   the files it will touch, and then to wait. Correct any drift from the
   approved plan before it writes code.

## Review each story

9. Read the diff yourself. A subagent's summary or "tests pass" claim is not
   evidence.
10. Judge every new or changed test with two edits:
    - Break the behavior: revert the production change, or make it return a
      wrong value. The test must fail.
    - Restructure the internals and keep every observable result. The test must
      still pass.

    Run the first edit for real, never in the story worktree. Make a scratch
    copy with `git clone --no-local` at the story commit, edit and test there,
    then delete the copy. Reject tests whose expected value comes from the code
    under test, that assert on data the test built itself, that only check an
    internal call, or that restate a constant without running the code that
    reads it.
11. Check the diff against the rules from step 4.
12. Run the module's tests and formatter yourself and keep the output.
13. For a fix round, spawn a fresh subagent with the original brief, every later
    directive, the previous report, and the branch. Resume an existing subagent
    only when it holds state you cannot move, such as a running process. After 3
    failed rounds on one story, stop and ask the user.

## Finish

14. After the last story, run `/review-gate` on the branch diff when it is
    installed. Treat its blockers as a fix round.
15. Do not push or open a pull request. Leave the branch in its worktree for the
    next round.
16. Report the worktree path, the branch, and the base SHA. Then give each
    story's status, the test commands and their results, the two-edit result for
    each new test, the rules you checked, and open questions.

Stop and ask the user before any change outside the approved plan, any
destructive action, or any push.
