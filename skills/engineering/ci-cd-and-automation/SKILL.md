---
name: ci-cd-and-automation
description: Automate the quality gates that guard production. Use when setting up or debugging a CI/CD pipeline, wiring checks into a merge gate, or designing a deployment and rollback strategy.
---

# CI/CD and Automation

CI/CD is the **enforcement mechanism** for every other skill. A check a human
runs sometimes protects nothing; a check the pipeline runs on every change
protects always. Your job is to make the gate automatic, fast, and impossible to
bypass - then no change reaches production without passing everything the team
agreed it must.

Two principles set every decision:

- **Shift left.** Catch each problem at the earliest stage that can catch it.
  Static analysis before tests, tests before staging, staging before prod. A bug
  caught in lint costs minutes; the same bug in prod costs hours and an
  incident. Ordering the gates _is_ shifting left - cheap-and-broad first, so
  expensive stages only ever run on code that already passed the cheap ones.
- **Faster is safer.** Small batches lower risk, they do not raise it. Three
  changes are easier to debug than thirty, and frequent releases keep the deploy
  path warm and trusted. This is why the pipeline must stay fast: a slow gate
  pushes people toward bigger, riskier batches. Pairs with
  `git-workflow-and-versioning` (small, frequent, reversible commits) and
  `shipping-and-launch` (staged rollout).

## Gate ordering

One pass, cheapest-and-most-likely-to-fail first, so a failure stops the
pipeline before you spend a runner-minute on anything downstream:

| # | Gate                             | Why here                                                |
| - | -------------------------------- | ------------------------------------------------------- |
| 1 | **Format + lint**                | Seconds. Catches the most, costs the least.             |
| 2 | **Type check**                   | Fast, whole-program, no runtime needed.                 |
| 3 | **Unit tests**                   | Fast feedback on logic. Feeds `tdd`'s red-green loop.   |
| 4 | **Build**                        | Proves it compiles/bundles before you spin up services. |
| 5 | **Integration tests**            | Needs a DB/services; slower, so gated behind 1-4.       |
| 6 | **E2E**                          | Slowest and flakiest. Run last, on the built artifact.  |
| 7 | **Security audit + bundle size** | Dependency and budget guards.                           |

Run independent gates as **parallel jobs** for wall-clock speed, but keep the
_conceptual_ order: never let an expensive stage be the first thing that could
have failed on a cheap one.

**No gate is skipped by disabling it.** Lint fails - fix the code, do not delete
the rule. Test fails - fix the code, do not `skip` the test. A silenced gate is
a gate that protects nothing.

## Required vs advisory

Every check is one or the other. Decide deliberately; the distinction is the
whole contract of the merge gate.

- **Required** - blocks merge via branch protection. Deterministic, fast,
  meaningful. Gates 1-4 plus any integration suite you trust. If it is required,
  it must be trustworthy, because a flaky required check trains people to re-run
  until green, which is the same as having no gate.
- **Advisory** - reports but does not block. Coverage deltas, bundle-size
  warnings, a still-stabilizing E2E suite, slow security scans. Use advisory as
  the on-ramp: a new check earns required status only after it has proven fast
  and stable in advisory mode.

## Keep it fast and deterministic

**A flaky pipeline is worse than none.** No pipeline makes people careful; a
flaky one teaches them that red means "hit re-run," so real failures sail
through behind the noise. Treat every flake as a bug, not an annoyance.

Determinism:

- Pin versions - runtime, dependencies (`npm ci`, lockfiles), base images,
  action SHAs. No `latest`.
- Kill the usual flake sources: unseeded RNG, real wall-clock/timezone,
  unawaited async, shared mutable test state, order-dependent tests, live
  network. `diagnosing-bugs` covers driving an intermittent failure to a fixed
  repro - a flaky CI job is exactly that.
- Quarantine, do not ignore. A test that flakes moves to advisory _and_ gets a
  ticket. It comes back to required only when fixed. Deleting the assertion is
  not fixing it.

Speed (apply in order of impact when the pipeline crosses ~10 min):

1. **Cache** dependencies and build output between runs.
2. **Parallelize** independent gates into separate jobs.
3. **Only run what changed** - path filters skip E2E on a docs-only PR.
4. **Shard** slow suites across runners with a test matrix.
5. **Move the truly slow** off the critical path onto a schedule (nightly),
   leaving the merge gate lean.

## Deployment and rollback

- **Decouple deploy from release.** Ship code dark behind a **feature flag**,
  enable it when ready. Roll back by flipping the flag, not reverting a commit.
  Flags are debt - set a removal date when you create one.
- **Stage the rollout.** Merge -> auto-deploy to staging -> verify -> promote to
  prod -> watch errors for a fixed window -> clean or roll back. Detail lives in
  `shipping-and-launch`.
- **Every deploy is reversible.** A one-command rollback (or flag flip) must
  exist before you deploy. No rollback path, no deploy.
- **Secrets live in a manager**, never in code or workflow YAML. CI holds test
  secrets only; prod secrets never touch the CI environment.

## Feed failures back to the agent

The CI feedback loop is the automation payoff. On failure, hand the agent the
_specific_ output and let it close the loop: `lint --fix` and commit; read the
type error's location and fix it; route a failing test through
`diagnosing-bugs`; check config and deps on a build break. Then push and let CI
re-run. Fix locally and confirm green before pushing again - do not use the
shared pipeline as your personal test runner.

## Red flags

- No pipeline, or one that runs but blocks nothing (all checks advisory).
- Re-running CI until it passes. Tests disabled or `skip`ped to get to green.
- Deploying straight to prod with no staging and no rollback.
- Secrets in the repo or in workflow files.
- A 30-minute pipeline nobody has tried to speed up - it is quietly pushing the
  team toward big-bang merges.

## Verify

- [ ] Gates run in cost order (lint -> types -> unit -> build -> integration ->
      e2e), independent ones parallelized.
- [ ] Required checks are fast, deterministic, and enforced by branch
      protection; advisory checks report without blocking.
- [ ] No flaky check sits in the required set.
- [ ] Merge gate runs on every PR and every push to the main branch.
- [ ] A rollback path (command or flag) exists and has been exercised.
- [ ] All secrets come from a manager, not from code or CI config.
