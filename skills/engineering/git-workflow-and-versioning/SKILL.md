---
name: git-workflow-and-versioning
description: Disciplines git and release hygiene. Use when committing, branching, or organizing work across parallel streams. Use when cutting a release, choosing a semantic version bump, tagging, or writing a changelog.
---

# Git Workflow and Versioning

Git is your safety net. **Commits are save points**, **branches are sandboxes**,
**history is documentation**. Agents generate code fast; disciplined version
control is what keeps that flood reviewable, reversible, and legible. Every rule
below serves those three roles.

## Trunk-based by default

Keep `main` always deployable. Work in **short-lived branches** that merge back
within 1-3 days. A branch is a cost that compounds every day it lives: it
diverges, it breeds conflicts, it delays integration. Long-lived development
branches are the anti-pattern - not branching itself.

- Branch from `main`, one concern per branch: `feature/task-import`,
  `fix/tz-drift`, `chore/bump-deps`, `refactor/auth`.
- Delete the branch after merge.
- **Feature flags beat long branches.** Ship incomplete work behind a flag
  rather than parking it on a branch for weeks.
- Release branches are fine when you must stabilize a release while `main`
  moves.
- Never force-push a shared branch.

For parallel agent work, `git worktree add ../proj-feat feature/x` gives each
branch its own directory - no switching, and a failed experiment is one
`git worktree remove` away from gone.

## Commit as save points

Commit each working increment: **implement a slice, test, verify, commit, next
slice.** Never let large uncommitted changes pile up. A save point means you
never lose more than one increment - if the next change breaks something,
`git
reset --hard HEAD` returns you to known-good.

**Atomic.** One commit does one logical thing. This is what makes history a
usable tool: you can review it, revert it, and `git bisect` it. A commit that
"adds the feature, fixes the sidebar, bumps deps, refactors utils" is none of
those things.

**Separate concerns.** Formatting apart from behavior. Refactor apart from
feature. Each is a different change - ideally a different PR. A trivial rename
can ride along at reviewer discretion; a real refactor cannot.

**Size.** Target ~100 lines per commit or PR, ~300 is the ceiling for one
logical change, past ~1000 split before submitting, not after.

## Commit messages are documentation

Explain the _why_; the diff already shows the _what_.

```
feat: add email validation to registration endpoint

Rejects malformed addresses at the route handler with a Zod schema,
matching the existing validation pattern in auth.ts. Prevents invalid
data reaching the database.
```

Format: `<type>: <short imperative>`, blank line, optional body. Types: `feat`,
`fix`, `refactor`, `test`, `docs`, `chore`.

**NEVER auto-add an agent name as a co-author or trailer.** No `Co-authored-by`
for the agent, no tool-signature footer. This is a hard rule for this repo, no
exceptions.

## Before every commit

- `git diff --staged` - read exactly what you are about to commit, and scan it
  for secrets (passwords, API keys, tokens). Never commit `.env`.
- Run tests, lint, and type-check. Automate with a pre-commit hook
  (`lint-staged` + `husky`) so it is not optional; wire the same checks into CI
  via `ci-cd-and-automation`.
- Confirm no build artifacts (`dist/`, `.next/`, `node_modules/`) are staged. A
  `.gitignore` covering these plus `.env*` and `*.pem` belongs in the repo from
  commit one.

Commit generated files only when the project expects them (`package-lock.json`,
migrations). **Never hand-edit `CHANGELOG.md` or any file marked
auto-generated** - regenerate it through its tool. Editing the artifact desyncs
it from its source; hard rule here.

## Report the change

After a modification, give a structured summary - it catches wrong assumptions
early and maps the change for review. `CHANGED:` files touched, one line each on
what and why. `DIDN'T TOUCH:` nearby things left alone on purpose - this section
is the point, it proves you resisted the unsolicited renovation. `CONCERNS:`
assumptions to confirm, new deps, risky calls.

## Versioning is a contract with consumers

Commits track change for _you_; a **version** tracks it for _consumers_. The
moment anything depends on your code - another team, a published package, a
deployed client - "latest on main" stops answering "what am I running, and is it
safe to upgrade?" A version number and a changelog are that answer.

**Semantic versioning** `MAJOR.MINOR.PATCH`, and the number is a promise:

| Bump  | Meaning                          | Consumer action  |
| ----- | -------------------------------- | ---------------- |
| MAJOR | Breaking change                  | Must change code |
| MINOR | New, backward-compatible feature | Safe to upgrade  |
| PATCH | Backward-compatible bug fix      | Safe to upgrade  |

Make the code match the number. A "patch" that alters behavior consumers relied
on is a major change in disguise. When unsure whether a change is breaking,
assume it is - a surprise major is far cheaper than a broken consumer.

**Tag the release; let the tag be the source of truth.** A release is an
immutable point in history, not a moving branch.

```bash
git tag -a v1.4.0 -m "Release 1.4.0"
git push origin v1.4.0
```

Derive the shipped version from the tag rather than hand-editing it into
scattered files, so artifact, tag, and changelog can never disagree.

**Keep a changelog for humans.** Not `git log` - the curated answer to "what
changed and do I care?" Group by
`Added / Changed / Fixed / Deprecated /
Removed / Security`, newest on top, each
entry phrased around user impact.

```markdown
## [1.4.0] - 2025-06-12

### Added

- Bulk task import via CSV

### Fixed

- Timezone drift in recurring task due dates

### Deprecated

- `GET /v1/tasks/all` - use paginated `GET /v1/tasks` (removed in 2.0)
```

Write the entry in the same change that earns it, while the impact is fresh -
not reconstructed at release time. If the changelog is tool-generated, update it
through the tool. Shipping the tagged release is `shipping-and-launch`'s job;
this is the contract that feeds it.

## Rationalizations

| Excuse                                | Reality                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "I'll commit when the feature's done" | One giant commit can't be reviewed, bisected, or reverted. Commit each slice.                      |
| "The message doesn't matter"          | It's the documentation the next agent reads. Explain the why.                                      |
| "Branches add overhead"               | Short-lived branches are free; long-lived ones are the cost. Merge in 1-3 days.                    |
| "Just a small fix, bump the patch"    | Check what consumers observe. A behavior change they relied on is a major, whatever the diff size. |
| "The changelog is the commit log"     | Commits are for you; the changelog is curated for consumers by impact.                             |
| "I'll write the changelog at release" | By then the impact is half-remembered. Write it with the change.                                   |

## Red flags

- Uncommitted changes piling up; messages like "fix", "update", "misc".
- Formatting mixed with behavior in one commit.
- `node_modules/`, `.env`, or build output committed; no `.gitignore`.
- A `Co-authored-by` agent trailer or tool-signature footer on any commit.
- A long-lived branch diverging from `main`; a force-push to a shared branch.
- A breaking change shipped under a minor or patch bump.
- A release with no tag, or a version hand-edited out of sync with it.
- A user-facing release with no changelog entry, or `CHANGELOG.md` edited by
  hand.

When a merge goes sideways, hand off to `resolving-merge-conflicts`.
