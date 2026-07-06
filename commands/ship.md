---
description: Run the pre-launch review by fanning out to specialist agents in parallel, then synthesize a go/no-go decision with a rollback plan.
argument-hint: "[optional: commit range or paths to review]"
---

Invoke the `shipping-and-launch` skill, then run this as a fan-out orchestrator.

`/ship` runs three specialist reviewers in parallel against the current change,
merges their reports, and produces one go/no-go decision. Use the argument as
the review scope if given; otherwise review the staged changes, or the last
commit if nothing is staged. State the scope up front.

## Phase A - Parallel fan-out

Spawn three subagents concurrently. Each custom agent is exposed as a tool of
the same name. **Issue all three calls in a single turn so they run in
parallel** - sequential calls defeat the purpose.

1. `code-reviewer` - five-axis review (correctness, readability, architecture,
   security, performance) of the change.
2. `security-auditor` - vulnerability and threat-model pass: input handling,
   authn/authz, secrets, dependency CVEs, integration risks.
3. `test-engineer` - coverage analysis: gaps in happy path, edge cases, error
   paths, concurrency.

Keep the fan-out flat: the reviewers do not call each other. If custom subagents
are unavailable in the current tool, run each persona's brief sequentially in
the main context and treat the outputs as if returned together. If the user has
their own `code-reviewer` / `security-auditor` / `test-engineer` defined, those
take precedence.

## Phase B - Merge

Once all three reports return, synthesize in the main context (not a subagent):

- Aggregate Critical/Important findings; resolve duplicates across reviewers.
- Promote any Critical/High security finding to a launch blocker.
- Fold in failing tests, lint, or build output.
- Verify directly what no persona covered: accessibility, env vars and
  migrations, monitoring and feature flags, docs and changelog.

## Phase C - Decision

Produce one output:

```markdown
## Ship decision: GO | NO-GO

### Blockers (must fix before ship)

- [source persona: finding + file:line]

### Recommended fixes (should fix before ship)

- [source persona: finding + file:line]

### Acknowledged risks (shipping anyway)

- [risk + mitigation]

### Rollback plan

- Trigger conditions: [signals that prompt rollback]
- Procedure: [exact steps]
- Recovery time objective: [target]
```

## Rules

1. Phase A runs in parallel, never sequentially.
2. Personas do not call each other; the main agent merges in Phase B.
3. A rollback plan is mandatory before any GO.
4. Any Critical finding defaults the verdict to NO-GO unless the user explicitly
   accepts the risk.
5. Skip the fan-out only if all are true: the change touches <= 2 files, the
   diff is under 50 lines, and it does not touch auth, payments, data access, or
   config. Otherwise fan out even when the diff looks small.
