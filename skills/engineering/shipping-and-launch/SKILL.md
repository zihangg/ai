---
name: shipping-and-launch
description: Ships changes to production safely. Use when deploying, planning a rollout, wiring launch monitoring, or writing a rollback plan.
---

# Shipping and Launch

Every launch must be **reversible**, **observable**, and **incremental**. A
deploy that cannot be undone, cannot be watched, or lands all at once is not a
launch - it is a bet. These three properties are the whole discipline; the gates
below just enforce them.

Deployment is not release. Ship code dark behind a flag, then release traffic to
it on your own schedule. This is what makes a launch incremental and reversible
at once: the kill switch is a config flip, not a redeploy.

## The go decision

Do not deploy until all four hold. This is a gate, not a checklist to revisit
later.

- [ ] **Pre-launch gate** passed (below).
- [ ] **Monitoring is live** - dashboards and alerts exist and are receiving
      data _before_ the first request hits the new path. You cannot debug what
      you cannot see, and you cannot add the eyes after the incident starts.
- [ ] **Rollback plan** written, with explicit **trigger conditions** and a
      measured time-to-revert (below). No plan, no go.
- [ ] The change clears the standing **Definition of Done** (see
      `DEFINITION-OF-DONE.md`).

## Pre-launch gate

The standing quality bar lives in `DEFINITION-OF-DONE.md` - correctness, tests,
docs, security. Clear that first. It is fixed across every change and answers
"is this finished to our standard?", distinct from this task's **acceptance
criteria** ("did we build the right thing?"), which vary per feature. A change
is shippable only when both are met.

Launch adds gates the Definition of Done does not cover, because they only exist
at the deploy boundary:

- [ ] Deploys through `ci-cd-and-automation`, not by hand. Same pipeline every
      time.
- [ ] Production config comes from code or secrets management, never set from
      memory at deploy time.
- [ ] Migrations are backward-compatible - old code runs against the new schema.
      Expand now, contract in a later deploy.
- [ ] Feature flag exists and defaults **off**. Both states tested in CI.
- [ ] Health-check endpoint responds. Security posture reviewed via
      `security-and-hardening`.

## Staged rollout

Never big-bang. Advance one stage at a time, holding at each until the metrics
clear. **Incremental** means you can always retreat one step instead of off a
cliff.

```
staging          full suite + manual smoke of critical flows
  |
production dark  deploy, flag OFF. verify health, no new errors
  |
internal         flag ON for team. 24h soak
  |
canary  5%       watch canary vs baseline. 24-48h soak
  |
percentage       25% -> 50%. same watch at each step, retreat freely
  |
full    100%     soak 1 week, then delete the flag
```

Advance only when every metric sits in the green column. One yellow: hold and
investigate. Any red: roll back now, do not debate.

| Metric           | Advance                | Hold                  | Roll back    |
| ---------------- | ---------------------- | --------------------- | ------------ |
| Error rate       | within 10% of baseline | 10-100% over          | >2x baseline |
| P95 latency      | within 20%             | 20-50% over           | >50% over    |
| Client JS errors | no new types           | new at <0.1% sessions | new at >0.1% |
| Business metric  | flat or up             | down <5% (noise)      | down >5%     |

Flags have an owner and an expiry. Delete flag and dead branch within two weeks
of full rollout. Do not nest flags - the state combinations explode.

## Monitoring in place before traffic

The dashboard exists before the deploy, not after the page. See
`observability-and-instrumentation` for how to instrument; this is what must be
watched at launch:

- **Application** - error rate (total and per endpoint), latency p50/p95/p99,
  request volume, key business metrics.
- **Infrastructure** - CPU, memory, DB connection pool, queue depth.
- **Client** - Core Web Vitals, JS errors, API errors from the client's view.

First hour after each stage, actively watch - do not walk away:

- [ ] Health check returns 200.
- [ ] No new error types on the dashboard.
- [ ] Latency has not regressed.
- [ ] Critical user flow works when you run it by hand.
- [ ] Logs are flowing and readable.

## Rollback plan

Write this **before** the go decision, never during the incident. Under pressure
you execute a plan, you do not author one. Every deploy ships with:

```markdown
## Rollback: <release>

### Triggers (any one fires -> revert)

- error rate > 2x baseline
- P95 latency > <N>ms
- data integrity issue detected
- security vulnerability discovered

### Steps

1. Flip feature flag OFF (< 1 min) -- preferred or redeploy previous version (<
   5 min)
2. Verify: health check + error dashboard back to baseline
3. Notify the team

### Data

- migration <X> reverts with: <command> (< 15 min)
- rows written by the new path: <preserved | cleaned up how>
```

The **trigger conditions** must be objective and measurable before launch, so
the call to revert is reading a number off a dashboard, not a judgment made
while the site is down. A migration with no reverse path means the deploy is not
reversible - fix that before shipping, not after.

## Rationalizations

| Excuse                            | Reality                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| "It passed in staging"            | Prod has different data, traffic, and edges. Watch it live.          |
| "Too small to flag"               | Small changes break things too. The flag is the kill switch.         |
| "We'll add monitoring after"      | Then you find out from users, not dashboards. Before, or not at all. |
| "Rolling back looks like failure" | Shipping broken and leaving it up is the failure.                    |

## Red flags

- No rollback plan, or triggers that are vibes instead of numbers.
- No one watching the first hour.
- Big-bang release, no canary.
- Flags with no owner or expiry.
- Prod config typed from memory.
- Friday-afternoon "just ship it".
