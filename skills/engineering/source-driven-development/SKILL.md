---
name: source-driven-development
description: Ground framework-specific code in official docs for the installed version, cited so the user can check it. Use when writing framework or library code where the current, correct pattern matters.
---

# Source-Driven Development

Never write framework-specific code from memory. Your training data is a
snapshot: APIs deprecate, defaults flip, and the pattern you "know" may have
been replaced two versions back. **Ground** every framework-specific decision in
the official docs for the version actually installed, then **cite** the source
so the user can open it and check.

The spine is one loop, in order:

```
DETECT ──▶ FETCH ──▶ IMPLEMENT ──▶ CITE
 stack     official   to the        sources the
 + version docs page   documented    user can open
                       pattern
```

## When NOT to use

Skip the loop when a source can't change the answer:

- **Version-agnostic logic** - loops, conditionals, data structures, renames,
  moving files, fixing typos. No framework API in play.
- **The user wants speed over verification** - "just rough it in". Honour that,
  but say the code is unverified.

Everything else that touches a framework API - routing, forms, data fetching,
auth, state, config - runs the loop.

## DETECT - stack and versions

Read the dependency file. The version is the whole point: it decides which
pattern is correct.

| File                                 | Stack                                 |
| ------------------------------------ | ------------------------------------- |
| `package.json` + lockfile            | Node / React / Vue / Svelte / Angular |
| `pyproject.toml`, `requirements.txt` | Python / Django / Flask               |
| `go.mod`                             | Go                                    |
| `Cargo.toml`                         | Rust                                  |
| `composer.json`                      | PHP / Laravel / Symfony               |
| `Gemfile.lock`                       | Ruby / Rails                          |

Prefer the **lockfile** - it holds the resolved version, not a `^` range. State
what you found plainly ("React 19.1, Vite 6.2"). If the version is missing or
ambiguous and the pattern turns on it, ask. Don't guess a major version.

## FETCH - the official page

Fetch the **specific page** for the feature and version, not the homepage, not a
search result. `react.dev/reference/react/useActionState`, not "react hooks".

Authority order: official docs and changelog first, then web-standards
references (MDN, the relevant spec), then runtime/browser support (caniuse,
node.green). **Not** authoritative, never the primary source: Stack Overflow,
tutorials, blog posts, and your own memory - verifying that memory is the entire
exercise.

When official sources disagree (a migration guide contradicts the API
reference), surface it and settle it against the installed version rather than
picking silently.

## IMPLEMENT - to the documented pattern

Match the docs: their signatures, their current approach, no deprecated calls.
If the docs don't cover it, the code is **unverified** - flag it, don't paper
over the gap.

When the documented pattern conflicts with existing project code, don't silently
pick. Name both and let the user choose:

```
CONFLICT: existing code uses useState for form-pending state;
React 19 docs recommend useActionState (react.dev/reference/react/useActionState).
  A) modern pattern, matches current docs
  B) match the codebase
Which?
```

## CITE - sources the user can open

Every framework-specific decision carries a citation. This is what makes the
work checkable and separates it from confident guessing.

- **Full URLs**, deep-linked to the anchor (`/useActionState#usage`) - anchors
  survive doc restructuring better than bare pages.
- In code, a one-line comment above the pattern with the source URL.
- **Quote the passage** when the decision is non-obvious or contradicts what a
  reader would expect.
- Include support data (caniuse, runtime version) when recommending a platform
  feature.
- Couldn't find docs? Say so verbatim:
  `UNVERIFIED - based on memory, may be
  stale, verify before shipping.`
  Honesty about the gap beats false confidence.

## Rationalizations

| Excuse                         | Reality                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| "I'm confident about this API" | Confidence isn't evidence. Stale patterns look right and break against the installed version.                 |
| "Fetching wastes tokens"       | One fetch is cheaper than the user debugging a changed signature for an hour.                                 |
| "It's a simple task"           | Simple wrong patterns get copied. Your deprecated form handler lands in ten components before anyone notices. |
| "I'll just add a disclaimer"   | Hedging is the worst option. Verify and cite, or flag `UNVERIFIED`. Nothing in between.                       |

## Handoffs

- When the doubt is about your own recall generally, not one framework call, run
  `doubt-driven-development` - this skill is its framework-specific arm.
- Fold this loop into `implement`: DETECT and FETCH before you write, CITE as
  you go.
