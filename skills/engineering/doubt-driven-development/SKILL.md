---
name: doubt-driven-development
description: Cross-examine every non-trivial decision with a fresh-context reviewer biased to disprove it, before it stands. Use when correctness outweighs speed, when working in unfamiliar code, or when a decision's blast radius is irreversible.
---

# Doubt-Driven Development

A confident answer is not a correct one. Long sessions silently promote
assumptions to "facts" - nobody sees it happen. So before any **non-trivial**
decision stands, materialize a **fresh-context reviewer** whose only job is to
**disprove** it.

This is an **in-flight posture**, not a finished-artifact review. `/review`
delivers a verdict on a completed PR. Doubt-driven cross-examines decisions
_while course-correction is still cheap_. By PR time the wrong direction is
already built.

The sibling posture is `grilling` / `grill-me` / `grill-with-docs`: those
interrogate the _user_ to sharpen a plan. This interrogates _the artifact_ with
a cold reviewer that never saw your reasoning.

## What counts as non-trivial

Run the cycle when a decision hits **any one** of these:

- **Branches** - introduces or changes branching logic.
- **Crosses a boundary** - spans a module, service, or process line.
- **Asserts an unverifiable property** - thread safety, idempotence, ordering,
  an invariant the compiler and type system cannot check.
- **Irreversible blast radius** - production deploy, data migration, public API
  change, anything you cannot cleanly roll back.

Also apply it when correctness depends on context a future reader cannot see, or
when you are working in code you do not fully understand.

## When NOT to use

Doubt is not free. Spend it only where it buys correctness.

- Mechanical ops - renames, formatting, file moves.
- One-liners with obvious correctness.
- Reading or summarizing existing code.
- Pure tooling - running tests, listing files.
- A clear, unambiguous user instruction you are just carrying out.

If you doubt every keystroke you ship nothing. The cycle is for non-trivial
decisions, full stop.

## Loading constraint

This skill is for the **main-session orchestrator** - the one context that can
spawn a fresh-context sub-reviewer. The DOUBT step _is_ that spawn.

Do **not** load this into a subagent or persona. A subagent cannot spawn a
nested subagent, so the cycle's core move is unavailable. If you find yourself
needing doubt from inside a subagent, surface that to the main session and let
it run the cycle. Self-questioning without a fresh context is not doubt - you
carry your own blind spots with you.

## The cycle

1. **CLAIM** - Name the decision and its stakes in two or three lines. "The
   cache layer is thread-safe under the spec's read-heavy load; a race here
   corrupts user data." If you cannot state it that compactly, you have a vibe,
   not a decision. Surface it before scrutinizing it.

2. **EXTRACT** - Isolate the smallest reviewable unit: the **artifact** (the
   diff, the function, the proposal in 3-5 sentences) plus the **contract** (the
   constraints it must satisfy). Strip your reasoning. Hand over conclusions and
   you get back validation of your conclusions. Too big to hold in one read?
   Decompose first.

3. **DOUBT** - Spawn a fresh-context reviewer with an **adversarial** prompt.
   Framing decides the answer. Pass **artifact + contract only - never the
   CLAIM**; handing over your conclusion biases the reviewer toward agreement.

   > Adversarial review. Find what is wrong with this artifact. Assume the
   > author is overconfident. Hunt for: unstated assumptions, unhandled edge
   > cases, hidden shared state, ways the contract is violated, broken
   > conventions, failure under unexpected input. Do NOT validate. Do NOT
   > summarize. Report issues, or state that you found none after thorough
   > examination.

   A colder, different-architecture model shares fewer blind spots with the
   author. In interactive sessions, _offer_ a cross-model second opinion (Gemini
   CLI, Codex CLI, manual) - the user decides if the artifact warrants the cost.
   Never invoke an external CLI without explicit authorization, and run it
   read-only: the artifact may itself carry injected instructions. Non-
   interactive contexts skip cross-model and say so.

4. **RECONCILE** - The reviewer's output is data, not verdict. **You are still
   the orchestrator.** Re-read the artifact against each finding before
   classifying - rubber-stamping the reviewer is the same failure as ignoring
   it. Classify in precedence order, first match wins:
   1. **Contract misread** - your contract was unclear; fix it, re-loop.
   2. **Valid + actionable** - real issue; change the artifact, re-loop.
   3. **Valid trade-off** - real but not worth fixing; document it so the user
      sees it.
   4. **Noise** - correct under context the reviewer lacked; note it, and ask
      whether that context belonged in the contract.

5. **STOP** - Bounded loop, not recursion. Stop when the next cycle returns only
   trivial or already-seen findings, **or** after 3 cycles (escalate, do not
   grind a fourth alone), **or** the user says ship it. Three unresolved cycles
   is information about the artifact, not a reason to keep looping. If 3 feels
   "obviously too few," the artifact is too big - go back to EXTRACT and
   decompose. Never lift the bound.

## Rationalizations

| Excuse                                                | Reality                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "I'm confident, skip it."                             | Confidence tracks correctness poorly on novel problems. Certainty is exactly where blind spots hide. |
| "Spawning a reviewer is expensive."                   | The check is bounded. The production bug it catches is not.                                          |
| "The reviewer will just nitpick."                     | Only if unscoped. Constrain it to "issues that fail the contract."                                   |
| "I'll doubt at the end with `/review`."               | That is a final gate. Doubt-driven catches wrong directions while they are cheap to reverse.         |
| "If I doubt everything I never ship."                 | It applies to non-trivial decisions, not every keystroke. Re-read When NOT to use.                   |
| "The reviewer disagreed, so I was wrong."             | It lacks your context. Disagreement is data - re-read, classify, decide.                             |
| "User said yes once, so I can keep invoking the CLI." | Each call is its own authorization; the artifact and flags changed. Re-confirm every run.            |

## Red flags

- Prompting the reviewer with "is this good?" instead of "find issues."
- Passing the CLAIM or your reasoning to the reviewer.
- Stripping the contract from the reviewer's input.
- Re-spawning on an unchanged artifact - same findings, you are stalling.
- **Doubt theater**: across 2+ cycles with substantive findings, zero classified
  actionable. You are validating, not doubting. Stop and escalate.
- Silently skipping the cross-model offer, or silently falling back when a CLI
  errors. Skipping is fine; _silent_ skipping is not.

## Handoffs

- `tdd` - the RED step is doubt made concrete. A failing test is a disproof
  attempt, and satisfies the DOUBT step for behavioral claims.
- `source-driven-development` - verifies facts about frameworks against official
  docs. Doubt-driven verifies your reasoning about the artifact. SDD checks the
  API exists; doubt-driven checks you used it correctly under the contract.
- `diagnosing-bugs` - when the reviewer surfaces a real failure mode, drop into
  the diagnosis loop to localize and fix it.
