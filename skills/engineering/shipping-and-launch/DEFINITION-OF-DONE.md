# Definition of Done

The standing bar every change clears before it counts as done. Fixed across the
project, reused unchanged. A Definition of Done renegotiated each sprint is not
one.

It is not the same as **acceptance criteria**. Acceptance criteria are written
per task and answer "did we build the right thing?"; the Definition of Done is
constant and answers "is it finished to our standard?". A change is done only
when both are satisfied - skip either and the work looks finished but is not.

|         | Acceptance criteria                   | Definition of Done                         |
| ------- | ------------------------------------- | ------------------------------------------ |
| Scope   | one task or spec                      | every change                               |
| Varies  | per item                              | fixed and reused                           |
| Answers | "did we build _this_?"                | "is it _ready_?"                           |
| Set     | when planning the task                | once for the project                       |
| Example | "user resets password via email link" | "tests pass, no regressions, docs current" |

## The checklist

Apply all of it before declaring any change done.

### Correctness

- [ ] Every acceptance criterion for the task is met.
- [ ] Behaviour verified at runtime, not just compiled or typechecked.
- [ ] New behaviour covered by a test that fails without the change, passes with
      it.
- [ ] Existing tests still pass. No regressions.
- [ ] Error paths and edge cases handled, not only the happy path.

### Quality

- [ ] Names and structure reveal intent; no comment needed to explain _what_.
- [ ] No duplicated logic, dead code, debug output, or commented-out blocks.
- [ ] Change is scoped to the task. No unrelated refactors smuggled in.
- [ ] Lint and formatting pass.

### Integration

- [ ] Works with the rest of the system, not just in isolation.
- [ ] Migrations, config changes, and feature flags accounted for.
- [ ] Backward compatibility considered for any public interface or API change.

### Documentation

- [ ] Public interfaces, APIs, and user-facing behaviour documented.
- [ ] Decisions worth preserving are recorded.
- [ ] Docs describe the current state in timeless language, not the change
      history.

### Observability

- [ ] New critical paths emit logs, metrics, or traces (see
      `observability-and-instrumentation`).

### Security

- [ ] Untrusted input, auth, and data handling reviewed (see
      `security-and-hardening`).

### Ship-readiness

- [ ] A rollback path exists for anything risky (see `shipping-and-launch`).
- [ ] The human has reviewed and approved before merge or deploy.

## How to apply

- **Per task** - Correctness and Quality before the task is checked off.
- **Per feature** - add Integration and Documentation.
- **Per release** - the whole list is the floor; `shipping-and-launch` stacks
  the deploy gates on top.

## Red flags

- "Done, just haven't run it yet." Unverified is not done.
- "Tests pass" standing in for done while docs, regressions, or runtime checks
  are skipped.
- A bar that moves with deadline pressure.
- Acceptance criteria treated as the whole bar, with no standing quality floor.
