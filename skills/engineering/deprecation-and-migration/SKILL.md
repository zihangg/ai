---
name: deprecation-and-migration
description: Retire old code and move its users to the new path safely. Use when removing a system/API/feature, replacing one implementation with another, or deciding whether to keep or sunset legacy code.
---

# Deprecation and Migration

**Code is a liability, not an asset.** Every line costs tests, patches,
dependency bumps, and onboarding forever; its only value is the behaviour it
delivers. When the same behaviour costs less code, the old code should go.
Deleting it is the achievement, not the regret.

Two jobs, in order. **Migration** moves users from old to new. **Deprecation**
deletes the old path once nobody is on it. You cannot safely do the second
without finishing the first, and you cannot prove the first is finished without
telemetry. That is the whole discipline.

## The one rule that makes it safe: prove no traffic before you delete

Do not remove code because you _believe_ it is unused. Remove it because you
_measured_ zero traffic. Every removal is gated on a signal from
`observability-and-instrumentation`: a request counter, a log line, an access
metric on the old path that has read **zero over a full usage cycle** (a cycle
long enough to catch the monthly batch job and the quarterly report).

If the old path is not instrumented, instrument it _first_ and wait. No signal,
no delete. This single gate is what separates a clean deprecation from an
outage.

**Hyrum's Law** is why belief is worthless here: with enough users, every
observable behaviour - including bugs, timing, and undocumented side effects -
is depended on by someone. You will not guess who. The counter will tell you.

## Expand / contract (parallel-change)

Never swap old for new in one commit. Split every migration into three phases
that each ship and revert independently:

1. **Expand** - add the new path _alongside_ the old. Both work. New callers use
   new; old callers untouched. Additive only, so it is trivially reversible.
2. **Migrate** - move callers from old to new, one at a time, verifying
   behaviour parity at each step (tests, differential checks). The old path
   stays as a working fallback the entire time.
3. **Contract** - once telemetry shows the old path at zero, delete it: code,
   tests, docs, config, feature flags, and the deprecation notice itself.

The value of expand/contract is **reversibility**. At every point before the
final delete you can route back to the old path in one config change. Design the
migration so each step is individually revertible; a migration you cannot roll
back is a launch you cannot ship - see `shipping-and-launch`.

## The deprecation lifecycle

The old path walks a one-way ramp. Each stage is a smaller commitment to the old
behaviour, and each is reversible until the last.

| Stage           | What changes                                                                                                                            | Reversible?                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Announce**    | Docs + notice mark it deprecated. Name the replacement, link the migration guide, give a reason. Code unchanged.                        | Trivially                           |
| **Warn**        | Old path emits a runtime deprecation warning (logged, rate-limited) naming the caller. Still fully functional.                          | Trivially                           |
| **Default-off** | New behaviour becomes the default; old path reachable only via an explicit opt-in flag. Flips the burden of proof onto remaining users. | One flag flip                       |
| **Remove**      | Delete the old path. **Gated on zero telemetry.**                                                                                       | No - this is the point of no return |

Do not skip **warn**: the warning is instrumentation. It converts "who still
uses this?" from a guess into a log query, and it is often the very signal that
gates **remove**.

Advisory vs compulsory is a knob on this ramp, not a separate track.
**Advisory** (old path is stable, migration optional) can sit at _warn_
indefinitely. **Compulsory** (security hole, unsustainable cost) sets a hard
removal date and must ship migration tooling - a codemod, an adapter, a script -
not just a deadline. Default to advisory; escalate only when the maintenance
cost or risk justifies forcing the move.

## Do the migration yourself

If you own the thing being deprecated, you own moving its users off it - or you
ship a backward-compatible change that needs no migration at all. "Users will
migrate on their own" is false; they will not until the old path breaks. Provide
the codemod, land the PRs, or keep the old path. Announcing a deadline and
walking away is how you get a permanently-stuck _warn_ stage.

Two tools that let you migrate the backend without touching callers:

- **Adapter** - the old interface, reimplemented on top of the new one.
  Consumers keep their imports; you swap what runs underneath. Pairs with clean
  interfaces from `api-and-interface-design`.
- **Feature flag** - route caller-by-caller from old to new, giving you a
  per-user rollback and a canary. This _is_ the default-off mechanism above.

## Design for removal up front

The cheapest deprecation is the one you planned when you built the thing. When
adding a system, ask "how do we delete this in three years?" A narrow interface,
a feature flag around it, and no leaked implementation details make later
removal a config change instead of an archaeology dig. Deprecation planning
starts at design time, in `api-and-interface-design`, not when the replacement
finally ships.

## Zombie code

Code nobody owns but everybody depends on: no commits in months, no maintainer,
failing tests nobody fixes, vulnerable deps nobody bumps. It cannot stay in
limbo. Either assign an owner and maintain it, or start the lifecycle with a
concrete migration plan. Instrument it first so you learn who the "everybody"
is.

## Rationalizations

| Excuse                                        | Reality                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "It still works, why touch it?"               | Working code nobody maintains accrues security debt silently. Cost grows even when the code doesn't run. |
| "Someone might need it later."                | If it is needed later it can be rebuilt. Dead code kept "just in case" costs more than the rebuild.      |
| "Migration is too expensive."                 | Compare it to two-to-three years of maintaining both. Migration is almost always cheaper long-term.      |
| "We'll deprecate after the new system ships." | By then you have new priorities and two systems. Plan the removal now.                                   |
| "It's obviously unused, just delete it."      | Obvious is a guess. Hyrum's Law says you are wrong about someone. Measure zero, then delete.             |

## Red flags

- Deleting code without a zero-traffic signal from telemetry.
- Deprecation announced with no replacement, or with no migration tooling.
- A _warn_ stage that has sat advisory for years with no owner driving it.
- New features shipped onto a deprecated path.
- A migration step you cannot revert in one action.
- Old and new maintained in parallel with no plan to ever contract.
