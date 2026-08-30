# Ticket Body Templates

One per issue type. Drop sections that would be empty — an omitted section reads
better than a heading followed by "N/A". Keep the headings, though: the
consistency is what makes a queue skimmable.

## Bug

The reproduction is the ticket. Everything else is supporting material.

```
h2. Summary

One or two sentences: what breaks, for whom, since when.

h2. Steps to reproduce

# Step
# Step
# Step

h2. Expected

What should happen.

h2. Actual

What happens instead — with the error text, status code, or log excerpt
verbatim.

h2. Environment

Env (prod/staging), version or release, browser/client, affected user or
account id, first observed.

h2. Impact

Who is affected and how many, whether there is a workaround, whether data is
wrong or merely unavailable.

h2. Evidence

Links: log query, trace/request id, dashboard, screenshot, related tickets.
```

If you cannot reproduce it, say so explicitly and record what you tried — a bug
marked "intermittent, 4 occurrences in 24h, see query" is actionable; one
silently missing its steps is not.

## Story

User-visible behaviour. Written so a reviewer can accept it without reading the
implementation.

```
h2. Context

Why this is worth doing — the user problem or business driver. Link the PRD,
design, or conversation it came from.

h2. What to build

The end-to-end behaviour, described from the outside in. Not a layer-by-layer
implementation plan.

h2. Acceptance criteria

* Criterion
* Criterion
* Criterion

h2. Out of scope

What a reader might reasonably assume is included but isn't.

h2. Blocked by

Ticket keys, or omit the section.
```

Each acceptance criterion is one observable outcome, phrased so it can only be
true or false.

## Task

Engineering work with no direct user-visible behaviour — migration, upgrade,
cleanup, infrastructure.

```
h2. Why

The forcing function: what breaks, costs, or stays blocked if this isn't done.

h2. What to do

The change, at the level of intent.

h2. Done when

* Checkable outcome
* Checkable outcome

h2. Risk

Blast radius and rollback, if the change touches production behaviour.
```

## Spike

Time-boxed investigation. A spike that can't name its question is a task in
disguise.

```
h2. Question

The single question this spike answers.

h2. Why we need the answer

The decision that is blocked until we have it.

h2. Time box

e.g. 2 days. Non-negotiable — report findings at the box regardless.

h2. Done when

A written recommendation is posted as a comment here, with the options
considered and the trade-offs, and any follow-up tickets are filed.
```

Spikes produce a decision, not code. If the prototype survives, that's a
separate ticket.
