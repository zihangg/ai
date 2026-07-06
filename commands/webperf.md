---
description: Run a web performance audit via the web-performance-auditor agent, in deep mode when real metrics are available or quick mode from source.
argument-hint: "[optional: URL, artifact path, or paths to audit]"
---

Run a web performance audit. `/webperf` targets web applications only - do not
use it for libraries, CLIs, or server-only code with no browser output.

## Pick the mode

**Deep mode** - use when any of these is available (from the argument or the
environment):

- a Lighthouse JSON report
  (`npx lighthouse <url> --output json --output-path
  ./report.json`),
- a PageSpeed Insights or CrUX response,
- a DevTools performance trace,
- a live URL plus a browser-driving tool (Chrome DevTools MCP or Playwright).

**Quick mode** - the default when no artifact is available. Scan source for
structural anti-patterns; label every finding `potential impact`.

## Run it

Spawn the `web-performance-auditor` subagent (exposed as a tool of the same
name). Pass it explicitly:

- the files, components, or diff under review,
- any artifact paths or pasted JSON,
- the target URL or page name when known,
- which mode you expect, so it flags missing inputs if Deep was intended.

The agent returns a scorecard (sourced values only - unmeasured fields marked
`not measured`, never fabricated), findings ranked by user impact, positive
observations, and recommendations.

## Output

Return the full audit report. No merge step - this is a single-persona command.
