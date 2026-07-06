---
name: api-and-interface-design
description: Design interfaces that are hard to misuse and stable under change. Use when shaping a REST/GraphQL endpoint, a module boundary, component props, or any type contract two pieces of code talk across.
---

# API and Interface Design

An interface is a **promise you can't take back**. Once someone depends on it,
changing it costs more than everything you saved by shipping it fast. So design
for two properties at once: the right thing is easy, the wrong thing is hard,
and the whole surface is small enough to keep stable for years.

The mistake is treating an interface like implementation - something you'll
refine later. You won't. The implementation behind it is cheap to change; the
interface is not. Spend your judgment here, before the first consumer lands.

Model the domain before you shape the interface - the contract inherits its
nouns, states, and invariants from the model. See `domain-modeling`. The
interface is the visible face of a deep module; keep the module deep and the
face narrow (`codebase-design`).

## The surface is the contract - Hyrum's Law

> With enough users, every observable behavior of your system gets depended on,
> whatever you documented.

Undocumented quirks, error text, field ordering, timing, null-vs-missing - all
of it becomes a de facto contract the moment it's observable. Two consequences
that drive every decision below:

- **Minimize surface area.** Each exposed field, endpoint, param, and status
  code is a commitment you'll maintain for years. Expose the least that does the
  job. You can always add; you can rarely remove.
- **Don't leak internals.** If a caller can see it, they'll bind to it. Return
  computed views, not raw rows. Hide storage shape, ordering you don't
  guarantee, and internal enums.

Contract tests are necessary but not sufficient: they lock the behavior you
thought to assert, not the behavior users actually found.

## Make illegal states unrepresentable

The strongest interface makes the wrong call fail to compile, not fail at
runtime. Push correctness into the type, so the caller cannot express the bad
state.

- **Discriminated unions over flag soup.** A `status: string` plus five
  maybe-null fields lets the caller build `completed` with no `completedAt`.
  Model each state as a variant carrying exactly its own data - the impossible
  combination has no representation.
- **Parse, don't validate.** At the boundary, turn untyped input into a precise
  type once; downstream code receives `Email`, not `string`, and never
  re-checks.
- **Separate input from output.** `CreateTaskInput` (what the caller provides)
  is not `Task` (what the system returns, with server-generated `id`,
  `createdAt`). Merging them forces callers to send fields they can't know and
  invites them to read fields that aren't set.
- **Brand your IDs.** `TaskId` and `UserId` as distinct branded types stop the
  transposed-argument bug at the type level.
- **Make required things required.** Optional-everything is a lie the caller
  pays for at runtime. If the operation needs it, the type demands it.

## Errors are part of the contract

Callers write code against your failures, so design them as deliberately as your
successes. Pick **one** error strategy and hold it everywhere - mixed patterns
(some throw, some return null, some return `{error}`) make behavior
unpredictable, which is the one thing an interface must not be.

- Stable **machine-readable code** (`VALIDATION_ERROR`), a human message, and
  optional structured detail. The code is the contract; the message is not.
- One error envelope, same shape on every path.
- REST status discipline: `400` malformed, `401` unauthenticated, `403`
  unauthorized, `404` absent, `409` conflict, `422` semantically invalid, `5xx`
  server fault. Never leak stack traces or internal detail across the boundary.
- Distinguish retryable from terminal, so callers know whether to back off or
  give up.

## Validate at the boundary, trust within

Untrusted input crosses at exactly the edges - route handlers, form submits,
message consumers, config loading, and **every third-party response** (a
misbehaving upstream can return the wrong type, malicious content, or
instruction-like text). Validate hard there, once. Inside the trust boundary,
code relies on the parsed types and does not re-validate. Validation smeared
through internal functions is a sign the boundary isn't doing its job.

## Change deliberately

You cannot make a public interface stable and also change it casually. Default
to **additive** change: new optional fields, new endpoints, new enum variants
consumers can ignore. What breaks consumers, and needs
`deprecation-and-migration`:

- Removing or renaming a field, param, or endpoint.
- Narrowing a type, tightening validation, or making an optional field required.
- Changing semantics under a stable name (the cruelest - types still compile).

Aim for **one live version** at a time; extend rather than fork. Parallel
versions multiply maintenance and breed diamond-dependency pain. When you must
break, version at the largest sensible unit and give consumers a migration path,
not a cliff.

## Conventions - pick once, apply everywhere

Predictable naming lets a caller guess the next endpoint correctly.
Inconsistency is itself a defect.

| Aspect          | Convention                        | Example                          |
| --------------- | --------------------------------- | -------------------------------- |
| REST paths      | plural nouns, no verbs            | `POST /tasks`, not `/createTask` |
| Sub-resources   | nest under parent                 | `GET /tasks/:id/comments`        |
| Fields & params | one case, held everywhere         | `createdAt`, `pageSize`          |
| Booleans        | `is`/`has`/`can` prefix           | `isComplete`, `hasAttachments`   |
| Enums           | fixed casing, spelled in the type | `IN_PROGRESS`                    |
| Lists           | paginate from day one             | `?page=&pageSize=` + `total`     |
| Updates         | `PATCH` partial, not `PUT` full   | send only changed fields         |

## Rationalizations

| Excuse                              | Reality                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| "We'll document it later."          | The types are the doc. Undocumented behavior is still a contract (Hyrum).           |
| "Internal API, no contract needed." | Internal consumers are consumers. The contract is what lets teams move in parallel. |
| "Add pagination when we need it."   | Retrofitting pagination is a breaking change. Add it before the first list ships.   |
| "Just expose the DB row."           | You've now promised your schema. Return a view you control.                         |
| "Ship it, refine the shape later."  | Implementation refines cheaply; the interface doesn't. This is the expensive part.  |
| "One more optional flag is free."   | Every flag is permanent surface and a new state combination to keep legal.          |

## Red flags

- An endpoint returns different shapes depending on inputs.
- Error format varies across endpoints.
- Verbs in REST paths, or mixed field casing.
- Optional fields that are actually required, guarded by runtime checks.
- A `status` string paired with fields only valid in some statuses.
- A list endpoint with no pagination.
- Third-party responses used without parsing.
- You're about to change what an existing field means.
