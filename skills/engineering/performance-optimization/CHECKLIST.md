# Performance Checklist

Reference for `performance-optimization`. Triage in IDENTIFY, fixes in FIX,
commands in MEASURE and GUARD.

## Triage: what is slow points at what to measure

```
First page load
  Large bundle?          -> measure bundle size, check code splitting
  Slow server (TTFB)?    -> Network waterfall, then the TTFB breakdown below
  Render-blocking?       -> waterfall for CSS/JS blocking the critical path
Interaction feels sluggish
  UI freezes on click?   -> Performance trace, long tasks (> 50ms)
  Input lag?             -> re-renders, controlled-component overhead
  Animation jank?        -> layout thrashing, forced reflow
After navigation
  Data loading?          -> API response times, request waterfalls
  Client rendering?      -> component render time, N+1 fetches
Backend / API
  One endpoint slow?     -> query plan, indexes
  All endpoints slow?    -> connection pool, CPU, memory
  Intermittent?          -> lock contention, GC pauses, external deps
```

### TTFB breakdown (> 800ms)

Read each segment in the DevTools Network waterfall:

- **DNS** slow -> `<link rel="dns-prefetch">` / `preconnect` for known origins
- **TCP/TLS** slow -> HTTP/2 or /3, edge deployment, verify keep-alive
- **Server (waiting)** slow -> profile backend, slow queries, add caching

## Anti-pattern fixes

### N+1 queries (backend)

```typescript
// BAD: one query per row for the owner
const tasks = await db.tasks.findMany();
for (const task of tasks) {
  task.owner = await db.users.findUnique({ where: { id: task.ownerId } });
}
// GOOD: single query with join/include
const tasks = await db.tasks.findMany({ include: { owner: true } });
```

### Unbounded fetch (backend)

```typescript
// BAD: every row into memory
const all = await db.tasks.findMany();
// GOOD: paginate, always
const tasks = await db.tasks.findMany({
  take: 20,
  skip: (page - 1) * 20,
  orderBy: { createdAt: "desc" },
});
```

### Images (frontend)

Hero / LCP image: art direction (`<picture>` + `media`) plus resolution
switching (`srcset` + `sizes`), explicit `width`/`height` to hold layout,
`fetchpriority="high"`, no lazy load.

```html
<picture>
  <source
    media="(max-width: 767px)"
    srcset="/hero-m-400.avif 400w, /hero-m-800.avif 800w"
    sizes="100vw"
    width="800"
    height="1000"
    type="image/avif"
  />
  <source
    srcset="/hero-800.avif 800w, /hero-1200.avif 1200w, /hero-1600.avif 1600w"
    sizes="(max-width: 1200px) 100vw, 1200px"
    width="1200"
    height="600"
    type="image/avif"
  />
  <img
    src="/hero.jpg"
    width="1200"
    height="600"
    fetchpriority="high"
    alt="..."
  />
</picture>
```

Below the fold: `loading="lazy" decoding="async"`, still with dimensions.

### Unnecessary re-renders (React)

```tsx
// BAD: new object every render forces children to re-render
<TaskFilters options={{ sortBy: "date", order: "desc" }} />;
// GOOD: stable reference
const DEFAULT_OPTIONS = { sortBy: "date", order: "desc" } as const;
<TaskFilters options={DEFAULT_OPTIONS} />;
```

`React.memo` for components that re-render with identical props; `useMemo` for
genuinely expensive computation. Both only where a profile shows the win.

### Bundle size (frontend)

Modern bundlers tree-shake named imports when the dep ships ESM and marks
`sideEffects: false`. The real gains are splitting and lazy loading:

```typescript
const Chart = lazy(() => import("./ChartLibrary")); // heavy, rare feature
const Settings = lazy(() => import("./pages/Settings")); // route split
// wrap in <Suspense fallback={<Spinner />}>
```

### Caching (backend)

```typescript
// in-memory for read-often, change-rarely data (TTL)
// HTTP: static assets `Cache-Control: public, max-age=31536000, immutable`
//       (content-hashed filenames); API responses `max-age=300` where safe
```

## Frontend checklist

**Images**

- [ ] Modern format (WebP/AVIF), responsively sized (`srcset` + `sizes`)
- [ ] Explicit `width`/`height` on `<img>` and `<source>` (prevents CLS)
- [ ] Below-fold `loading="lazy" decoding="async"`; hero `fetchpriority="high"`,
      no lazy

**JavaScript**

- [ ] Initial bundle < 200KB gzipped; route + heavy-feature code splitting
- [ ] No blocking JS in `<head>` (`defer`/`async`)
- [ ] Long tasks (> 50ms) broken up - the main INP lever
- [ ] `scheduler.yield()` (or `yieldToMain`) inside long loops;
      `isInputPending()` to yield on demand
- [ ] `requestIdleCallback` for deferrable work; analytics/logging out of the
      event handler
- [ ] Third-party scripts `async`/`defer`, size-audited, fronted by a facade
      when heavy
- [ ] Heavy computation offloaded to a Web Worker where applicable

**CSS / fonts**

- [ ] Critical CSS inlined/preloaded; no render-blocking non-critical CSS
- [ ] No CSS-in-JS runtime cost in prod (use extraction)
- [ ] WOFF2 only, self-hosted, 2-3 families; LCP-critical fonts preloaded
- [ ] `font-display: swap` (or `optional`); subset via `unicode-range`
- [ ] Fallback metrics tuned (`size-adjust`, `ascent-override`) to cut swap CLS
- [ ] System font stack considered before any custom font

**Network / rendering**

- [ ] Static assets long `max-age` + content hashing; API `Cache-Control` where
      safe
- [ ] HTTP/2 or /3; `preconnect` for known origins; `fetchpriority` on critical
      preloads
- [ ] No layout thrashing (batch reads, then writes); animate
      `transform`/`opacity` only
- [ ] Long lists virtualized; off-screen `content-visibility: auto` +
      `contain-intrinsic-size`
- [ ] No `unload` handlers, no `Cache-Control: no-store` on HTML (keeps bfcache)

## Backend checklist

**Database**

- [ ] No N+1 (eager load / join); indexes on filtered/sorted columns
- [ ] List endpoints paginated, never `SELECT *` unbounded
- [ ] Connection pooling; slow-query logging on

**API / infra**

- [ ] p95 < 200ms; no synchronous heavy work in handlers; bulk over per-row
      calls
- [ ] Response compression (gzip/brotli); caching (in-memory, Redis, CDN)
- [ ] CDN for static; server/edge near users; health check for the LB

## Measurement commands

```bash
npx lighthouse https://localhost:3000 --output json --output-path ./report.json
npx webpack-bundle-analyzer stats.json   # or: npx vite-bundle-visualizer
npx bundlesize
```

```typescript
import { onCLS, onINP, onLCP } from "web-vitals";
onLCP(console.log);
onINP(console.log);
onCLS(console.log);

// interaction-level INP detail
import { onINP } from "web-vitals/attribution";
onINP(({ value, attribution }) => {
  const {
    interactionTarget,
    inputDelay,
    processingDuration,
    presentationDelay,
  } = attribution;
  console.log({
    value,
    interactionTarget,
    inputDelay,
    processingDuration,
    presentationDelay,
  });
});
```

INP workflow: check CrUX/RUM field data first, record a Performance trace while
interacting to find the slow interaction, and test on a mid-range Android or
under 4x-6x CPU throttling - INP problems often surface only on slow hardware.

## Anti-pattern reference

| Anti-pattern         | Impact                   | Fix                                 |
| -------------------- | ------------------------ | ----------------------------------- |
| N+1 queries          | Linear DB load growth    | Joins, includes, batch loading      |
| Unbounded queries    | Memory blowup, timeouts  | Paginate, add LIMIT                 |
| Missing indexes      | Reads slow as data grows | Index filtered/sorted columns       |
| Layout thrashing     | Jank, dropped frames     | Batch reads, then batch writes      |
| Unoptimized images   | Slow LCP, wasted bytes   | WebP/AVIF, responsive, lazy         |
| Large bundles        | Slow TTI                 | Code split, tree shake, audit deps  |
| Blocking main thread | Poor INP                 | Chunk long tasks, Web Workers       |
| Memory leaks         | Growth, eventual crash   | Clean up listeners, intervals, refs |
