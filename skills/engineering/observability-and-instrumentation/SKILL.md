---
name: observability-and-instrumentation
description: Instruments a feature so its production behavior is visible and diagnosable. Use when building anything that runs in production, adding logs, metrics, or traces, or setting up alerts. Use when an incident took too long to diagnose because the data wasn't there.
---

# Observability and Instrumentation

Code you can't observe is code you can't operate. Instrumentation is not a
post-launch chore, it is written **alongside the feature, the same way you write
tests**. Ship a feature without telemetry and its first incident becomes
archaeology instead of a query. `tdd` gives you a loop that proves the code
works on your machine; this gives you the loop that proves it works in
production.

## Start from the questions, not the signals

Telemetry without a question is noise. Before adding anything, write down the
2-4 questions an on-call engineer will ask about this feature at 3am:

```
FEATURE: checkout payment retry
ON-CALL WILL ASK:
1. What fraction of payments succeed first try vs after retry?
2. When one fails for good, why? (provider error? timeout? validation?)
3. Is the payment provider slower than usual right now?
-> every signal below must answer one of these.
```

If you can't name the questions, you'll log everything and learn nothing.

## The three pillars, in one line each

Each question maps to the cheapest signal that answers it.

| Pillar     | Answers                                   | Reach for it when                            |
| ---------- | ----------------------------------------- | -------------------------------------------- |
| **Metric** | "How often / how fast, in aggregate?"     | You need to know **that** something is wrong |
| **Trace**  | "Where did the time go across services?"  | You need to know **where** it broke          |
| **Log**    | "What exactly happened in this one case?" | You need to know **why** it broke            |

Metrics page you, traces narrow it to a hop, logs tell you the reason. Don't
reach for a heavier pillar than the question needs.

## Structured logging

Log **events, not prose**. Every line is a machine-readable object with a stable
event name, so it can be filtered, counted, and alerted on:

```typescript
// BAD: interpolated string - unqueryable, inconsistent, un-aggregatable
logger.info(`Payment ${id} failed for user ${userId} after ${n} retries`);

// GOOD: stable event name + structured fields
logger.warn({
  event: "payment_failed",
  paymentId: id,
  provider: "stripe",
  errorCode: err.code,
  attempt: n,
}, "payment failed");
```

**Correlation ID is mandatory.** Generate or accept a request ID at the system
boundary, attach it to every log line, span, and outbound call. Without it you
cannot reconstruct one request from interleaved logs, and the whole edifice is
orphaned lines.

```typescript
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  req.log = logger.child({ requestId: req.id }); // child logger per request
  res.setHeader("x-request-id", req.id);
  next();
});
```

**Levels, used consistently:** `error` = invariant broken, someone may act;
`warn` = degraded but handled (retry succeeded, fallback used); `info` =
significant business event (order placed); `debug` = diagnostic, off in prod.

**Never log secrets, tokens, passwords, or unredacted PII.** Telemetry pipelines
are a classic leak path. Allowlist fields, never log whole request bodies.

## What to instrument

Instrument every place the system talks to something it doesn't control, and
every place work waits. These are where failures hide and where "it worked
locally" tells you nothing:

- **I/O and cross-service calls** - endpoint, status, latency, attempt count. A
  remote call that isn't measured is a latency mystery waiting to happen.
- **Retries and fallbacks** - log each retry at `warn`; a request that succeeds
  on attempt 4 looks healthy in the success count but is a smell.
- **Queues and background jobs** - depth, age of oldest item, processing
  duration. A silent queue backing up is invisible until customers notice.
- **Boundaries you own** - the meaningful internal units (`applyDiscounts`,
  `chargeProvider`), so a trace has named spans to break time down by.

## Metrics: RED, USE, and cardinality

For request-driven paths instrument **RED** on every endpoint and every external
dependency: **R**ate, **E**rrors, **D**uration. For resources (queues, pools,
hosts) instrument **USE**: **U**tilization, **S**aturation, **E**rrors.

```typescript
const httpDuration = new Histogram({
  name: "http_request_duration_seconds",
  labelNames: ["method", "route", "status_class"], // '2xx', never '200'
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
```

**Cardinality is the failure mode.** Every unique label combination is its own
time series. Labels must come from small fixed sets. A user ID as a label melts
your metrics backend; that detail belongs in logs and traces.

```
OK as a label:    route="/api/tasks/:id"   status_class="5xx"   provider="stripe"
NEVER a label:    user_id   email   request_id   full URL   error message text
```

**Percentiles always, averages never.** An average hides the 1% of users having
a terrible time. Track latency as a histogram and read p50/p95/p99.

## Tracing

Use **OpenTelemetry**, the vendor-neutral standard. Auto-instrumentation covers
HTTP, gRPC, and common DB clients with near-zero code; initialize it before any
other import. Add manual spans only around the boundaries you own, and
**propagate context across every async gap** - HTTP headers, queue message
metadata - or the trace dies at the seam. Sample low by default, keep 100% of
errors if your backend supports tail sampling.

## Alert on symptoms, not causes

Page a human only for things a **user can feel**. Causes go to dashboards.

```
SYMPTOM (page-worthy):          CAUSE (dashboard, not a page):
error rate > 1% for 5 min       CPU at 85%
p99 latency > 2s                a pod restarted
queue age > 10 min              disk at 70%
```

Cause-based alerts fire when nothing is wrong and stay silent for failures you
didn't predict. Symptom-based alerts fire exactly when users hurt, whatever the
cause. Every alert you create:

1. **Actionable** - if the answer is "ignore it, it self-heals", delete it.
2. **Links a runbook** - three lines minimum: what it means, first query, who to
   escalate to.
3. **Threshold justified** by an SLO or historical data, not a guess.
4. **Two severities only** - `page` (act now) and `ticket` (act this week). A
   third tier trains people to ignore all of them.

## Verify the telemetry itself

Instrumentation is code, and it can be wrong. Before you call it done, trigger
the paths and look at the real output:

- [ ] The on-call questions are written down and every signal maps to one.
- [ ] Logs are structured JSON with a correlation ID on every line - spot-check
      actual output, not `[object Object]`.
- [ ] No secret, token, or unredacted PII in any log line.
- [ ] RED exists for every new endpoint and dependency; labels are bounded.
- [ ] Latency is a histogram; p95/p99 are queryable.
- [ ] One request follows end-to-end in the trace UI with no broken spans.
- [ ] Force an error in staging - find it in the logs by request ID.
- [ ] Fire each new alert once (drop the threshold) - it reaches the right
      channel and the runbook link works.
- [ ] An induced failure was diagnosed from telemetry alone, without reading the
      source.

That last box is the real bar: if you couldn't diagnose it blind, the feature
isn't observable yet.

## Red flags

- A PR with retries, queues, or external calls and zero new telemetry.
- Log lines built by string interpolation instead of structured fields.
- No correlation ID - every log line is an orphan.
- Metrics labeled with user IDs, raw URLs, or error text (cardinality bomb).
- Latency tracked as an average with no percentiles.
- Alerts on causes (CPU, memory) paging humans while user-facing error rate is
  unwatched.
- Alerts that fire daily and get acknowledged without action.
- "It works on my machine" as the only evidence a production feature is healthy.

## Rationalizations

| Excuse                                  | Reality                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| "I'll add logging after it works."      | "After" becomes "after the first incident", the most expensive moment to discover you're blind. Instrument as you build. |
| "More logs = more observability."       | Unstructured noise makes incidents slower. Three queryable events beat three hundred prose lines.                        |
| "Tracing is overkill for two services." | Two services already means cross-service latency questions logs can't answer. Auto-instrumentation makes it trivial.     |
| "Alert on everything, tune later."      | A noisy pager trains people to ignore it. The tuning never happens; the missed real page does.                           |

## Handoffs

- Diagnosing a live failure now, not building for the next one:
  `diagnosing-bugs`. Good instrumentation is what makes that loop fast.
- Profiling and fixing measured slowness: `performance-optimization`. This skill
  produces the percentiles and traces it reads.
- Launch-day monitoring sequence and rollback triggers: `shipping-and-launch`.
  This skill builds the telemetry those gates check.
