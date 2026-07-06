---
name: performance-optimization
description: Optimizes performance against measured evidence. Use when a performance budget or SLA is at risk, when you suspect a regression, or when Core Web Vitals or load times miss their thresholds.
---

# Performance Optimization

Measure before you optimize. Performance work without a measurement is a guess,
and a guess buys complexity you cannot pay back. **No evidence of a problem, no
change.** Profile first, find the one bottleneck the numbers indict, fix that,
measure again, then guard the win so it cannot silently regress.

The loop:

```
MEASURE  -> baseline with real data, synthetic and field both
IDENTIFY -> the one bottleneck the numbers indict, not the one you assume
FIX      -> address that bottleneck, nothing else
VERIFY   -> measure again; confirm the number actually moved
GUARD    -> a budget in CI so the win cannot regress
```

This shares its spine with `diagnosing-bugs`: a perf regression is a bug whose
symptom is a number. Same discipline - build a signal that moves on the problem,
change one variable, verify against the signal. Hand off to it when a regression
appeared between two known states and you need to bisect.

## Core Web Vitals thresholds

| Metric                              | Good     | Needs work | Poor    |
| ----------------------------------- | -------- | ---------- | ------- |
| **LCP** (Largest Contentful Paint)  | <= 2.5s  | <= 4.0s    | > 4.0s  |
| **INP** (Interaction to Next Paint) | <= 200ms | <= 500ms   | > 500ms |
| **CLS** (Cumulative Layout Shift)   | <= 0.1   | <= 0.25    | > 0.25  |

"Good" is a p75 bar: the threshold must hold at the 75th percentile of real
users, not on your laptop.

## MEASURE

Two lenses, and you need both:

- **Synthetic** (Lighthouse, DevTools Performance panel, CI): controlled and
  reproducible. Best for isolating a specific issue and catching regressions in
  CI. It is a lab, not the field - it will not tell you what users feel.
- **RUM / field** (`web-vitals`, CrUX): real users, real devices, real networks.
  The only proof a fix improved actual experience. Optimize against field data;
  a synthetic win the field never confirms is not a win.

Establish the baseline before touching anything. Test on representative hardware

- a mid-range Android under 4x-6x CPU throttling, not your machine. See
  `observability-and-instrumentation` for wiring `web-vitals` and server timing
  into a durable signal instead of a one-off console log.

## IDENTIFY

Let the symptom pick the measurement, then let the measurement indict the
bottleneck. Do not skip to a fix because the cause feels obvious - if you did
not measure, you do not know.

- Slow **LCP** -> network waterfall: image weight, render-blocking CSS/JS, TTFB.
- Poor **INP** -> Performance trace: long tasks (> 50ms) on the main thread.
- High **CLS** -> layout-shift attribution: unsized media, late content, font
  swap.
- Slow **API** -> query log: N+1, missing index, unbounded fetch.

`CHECKLIST.md` holds the full frontend and backend triage, the anti-pattern
fixes (N+1, image, re-render, bundle, cache), and the measurement commands.

## FIX

Address the one bottleneck the numbers indicted, and only that. Tie every change
to a hypothesis: "the trace shows a 300ms long task in X; breaking it up should
drop INP under 200ms." One variable at a time, so VERIFY can attribute the
movement to it.

Resist prophylactic optimization. `React.memo` and `useMemo` sprinkled without a
profile are as much a smell as the slowness they pretend to prevent - they add
cost and cognitive load to code the numbers never indicted.

## VERIFY

Re-measure with the same lens you baselined. Confirm the specific number moved,
in the field and not only in the lab. If it did not move, the fix missed and the
bottleneck was elsewhere - revert and return to IDENTIFY rather than stack a
second speculative change on top.

## GUARD

A win you cannot defend regresses the next sprint. Encode the target as a
**budget** enforced in CI, so a regression fails the build instead of reaching
users.

```
JS bundle: < 200KB gzipped (initial)    API: < 200ms p95
CSS: < 50KB gzipped                     LCP: <= 2.5s field p75
Lighthouse Performance: >= 90           INP: <= 200ms field p75
```

```bash
npx lhci autorun         # Lighthouse CI, asserts CWV + score
npx bundlesize           # bundle budget
```

## Rationalizations

| Excuse                                 | Reality                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| "We'll optimize later."                | Anti-patterns compound. Fix N+1s and oversized payloads now; defer micro-tuning. |
| "It's fast on my machine."             | Your machine is not the field. Throttle, test mid-range, read RUM.               |
| "This one's obviously the bottleneck." | If you did not measure, you do not know. Profile first.                          |
| "Users won't notice 100ms."            | They do - it surfaces in conversion.                                             |
| "The framework handles perf."          | Frameworks do not fix your N+1 or your bundle.                                   |

## Red flags

- A change justified by intuition, with no before/after number.
- N+1 queries, or list endpoints with no pagination.
- Images with no dimensions; bundle size growing unreviewed.
- No field monitoring in production - you are blind to what users feel.
- Memoization everywhere, profiled nowhere.
