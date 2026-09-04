---
name: review-gate
description: Fan a change out to parallel specialist reviewers, adjudicate every finding against the code, and return one PASS/FAIL verdict with blockers separated from dismissed noise. Use before opening an MR or PR, when the user asks for a full or multi-reviewer review, or when another skill needs a merge gate.
---

# Review Gate

Four reviewers, one verdict. The gate exists so that a change faces adversarial,
structural, security and correctness scrutiny in parallel - and so that **raw
reviewer output never reaches the author unfiltered**. Reviewers are wrong often
enough that an unadjudicated finding list costs more time than it saves.

The gate is the reusable unit. `mr-prep` runs it before opening a merge request;
any future `mr-review` or `code-review` skill runs the same gate and does
something different with the verdict. Nothing in this skill knows about GitLab,
GitHub, or what happens after PASS.

## Loading constraint

This skill is for the **main-session orchestrator** - the one context that can
spawn subagents. Phase A is that spawn; a subagent cannot nest another.

If you need the gate from inside a subagent, surface that to the main session
and let it run the gate.

## Scope

Establish the scope before spawning anything, and state it in one line:

1. What the caller or user named (a commit range, a branch, paths).
2. Otherwise the branch's own work: `git merge-base HEAD origin/<base>` then the
   diff from there to `HEAD`, plus uncommitted changes.
3. Otherwise the staged changes; if nothing is staged, the last commit.

Every reviewer gets the **same** scope, stated the same way. If the diff is
large, say so and pass paths rather than silently letting each reviewer pick a
different subset.

**Skip the gate only if all of these hold**: the change touches ≤ 2 files, the
diff is under 50 lines, and it does not touch auth, payments, data access,
migrations, or config. Otherwise run it even when the diff looks small.

## Phase A - Fan out

Spawn all four reviewers **in a single turn** so they run in parallel.
Sequential calls defeat the point. Each is exposed as a subagent of the same
name; a user-defined agent of that name takes precedence.

| Agent                    | Asks                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `adversarial-reviewer`   | What is wrong with this? Assume the author is overconfident |
| `thermonuclear-reviewer` | Is this the shape the code should have had?                 |
| `security-auditor`       | What here is exploitable?                                   |
| `code-reviewer`          | Correctness, readability, architecture, performance         |

Each brief carries: the scope, the base branch, the change's intent in two or
three sentences, and any contract it must satisfy (ticket acceptance criteria,
API guarantees, migration constraints).

When the intent is a **bug fix**, say so and describe the failing behavior. Add
one contract line: _the change must include a regression test that fails without
the fix and passes with it_. This is the reviewers' cue to check that the fix is
provable, not just plausible.

**Do not pass your own conclusions.** Handing a reviewer "I think this is fine
because X" buys you agreement with X. Give them the artifact and the contract.

Keep the fan-out flat: reviewers do not call each other, and none of them fix
anything. If subagents are unavailable, run each brief sequentially in the main
context and say that you did.

## Phase B - Adjudicate

You are the parent. Reviewer output is **input to a decision, not the
decision**. Nothing goes to the user before this phase completes.

1. **Merge.** Collect every finding into one list keyed by `file:line` + claim.
   Collapse duplicates, keeping the clearest statement and recording which
   reviewers raised it. Independent agreement is weak evidence of validity, not
   proof - two reviewers can share a blind spot.

2. **Verify each finding against the code.** Open the cited file, read the
   function and its callers, and reconstruct the path the finding claims. Assign
   one verdict:

   - **confirmed** - you traced it; cite the line that makes it true.
   - **rejected** - false, or unreachable in this code. Cite the guard, type,
     caller, or framework behavior that refutes it.
   - **uncertain** - needs runtime data, a repro, product intent, or knowledge
     of an external system. State exactly what would settle it.

   Rubber-stamping a reviewer is the same failure as ignoring one. If you wrote
   the code under review, your judgment on it is compromised: send those
   findings to `review-adjudicator` instead of settling them yourself.

   For a **bug fix**, "does this actually fix it?" is uncertain until a test
   proves it. If the change ships a regression test, run it at the parent commit
   and at `HEAD`: failing-then-passing **confirms** the fix; passing at both
   means the test does not exercise the bug (**confirmed** finding - the test is
   theatre). This is verification, not authoring - do not write the missing test
   here; its absence is a finding for Phase C.

3. **Delegate the ones you cannot settle cheaply.** Spawn `review-adjudicator`
   (in parallel, one call per batch) when: you authored the code, the finding
   count is large enough that verifying serially would burn the context you need
   for the fix, or the claim spans files you have not read. Pass the claim and
   its citation only - not your opinion of it.

4. **Correct severity.** Reviewers inflate. Re-rate every confirmed finding on
   the shared scale (Critical / Important / Minor / Nit) and note where you
   moved it. A thermonuclear "Important" that deletes 3 lines of duplication is
   a Minor; a `security-auditor` "Medium" that leaks a token is Critical.

## Phase C - Verdict

Gate rule:

- **FAIL** - one or more **confirmed** Critical or Important findings.
- **PASS** - everything else. Confirmed Minor/Nit, rejected, and uncertain
  findings never block.

**Bug-fix rule.** A change whose intent is a bug fix but which ships **no
regression test** is a confirmed **Important** finding - it blocks. The one
exception: a repro is genuinely infeasible (a race, an external system, a manual
UI path). Then it is **uncertain**, not a blocker, and you must state _why_ a
test cannot cheaply exist and what would settle it. "It's obvious" is not
infeasibility.

Rejected and uncertain findings are still reported. They are the cheapest signal
in the whole run: a finding four reviewers-worth of context got wrong is usually
pointing at code that is hard to read, or at a contract that is not written down
anywhere.

Output exactly this, and nothing else:

```markdown
## Review gate: PASS | FAIL

Scope: <what was reviewed> · Reviewers: 4 · Findings: N confirmed, N dismissed,
N uncertain

### Blockers (confirmed, must fix)

- **Critical** · file:line · finding — fix. _(adversarial, security)_

### Non-blocking (confirmed, worth doing)

- **Minor** · file:line · finding — fix. _(thermonuclear)_

### Dismissed (raised but not valid)

- file:line · claim — why it does not hold, with the code that refutes it.
  _(code-reviewer)_

### Uncertain (could not be settled)

- file:line · claim — what would settle it.
```

Then stop. **Do not fix anything.** The gate reports; the caller decides. If the
user asks you to fix the blockers, that is a new instruction - do it, then
re-run the gate.

## Re-running after fixes

Re-run only the reviewers whose blockers you addressed, on the new diff, and
carry the dismissed list forward so the same rejected claim does not get
re-litigated. Bounded at **3 rounds**: three rounds of unresolved blockers is
information about the change, not a reason to grind a fourth. Escalate to the
user instead, and consider that the change is too big and wants splitting.

## Rationalizations

| Excuse                                            | Reality                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| "Four reviewers is expensive for this diff."      | They run in parallel and the gate has an explicit skip rule. Use it, or run the gate.       |
| "I'll just forward the findings to the user."     | Unadjudicated findings make the author debug the reviewer. Adjudication is the whole point. |
| "Two reviewers agreed, so it's real."             | Correlated blind spots agree too. Read the code.                                            |
| "It's only a Minor, I'll batch it into blockers." | Inflating severity trains everyone to ignore the gate.                                      |
| "The finding is wrong, so drop it silently."      | Report it as dismissed. Wrong findings mark unreadable code.                                |
| "Round four will get it."                         | Three rounds means the change is too big. Split it.                                         |
| "The fix is obviously right, it needs no test."   | A fix without a failing-first test is unproven. Either write the repro or justify why one can't cheaply exist. |

## Red flags

- Spawning reviewers in separate turns instead of one.
- Passing your own reasoning, or the fix you already have in mind, into a brief.
- A finding list handed to the user with no verdict attached to each item.
- Every finding confirmed, or every finding rejected - you are not adjudicating.
- The gate fixing code. It reports.
- Reviewers given different scopes, so the verdict covers nothing consistently.

## Handoffs

- `mr-prep` - runs this gate, then opens the merge request once it passes.
- `doubt-driven-development` - the in-flight version of the same posture. Use it
  while decisions are still cheap to reverse; this gate is the final check.
- `diagnosing-bugs` - when a confirmed blocker is a real failure you cannot
  localize, drop into the diagnosis loop.
- `git-workflow-and-versioning` - if the gate keeps failing on size, the change
  wants splitting into atomic commits.
