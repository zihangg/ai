---
name: jira-ticket
description: File a well-formed Jira ticket — pin the project's real field values, sweep for duplicates, draft, confirm, create. Use when the user wants to raise/create/file a Jira issue, bug, story, task or spike, or to turn a conversation, bug report, or review finding into a ticket.
---

# Jira Ticket

A ticket is read by someone who was not in this conversation, months from now.
Everything below serves that reader.

Creating a ticket is **outward-facing** — it lands in a queue other people work
from. Nothing is created before the user approves the draft (step 5).

Needs the Atlassian MCP server. If its tools aren't available, tell the user to
connect it (`/mcp` → `atlassian`) and stop — don't hand-roll REST calls or
invent credentials.

Breaking a whole plan or PRD into many tickets is `to-issues`; come back here to
file each one.

## Process

### 1. Pin the target

Every Jira tool needs a `cloudId`. Get it once from
`getAccessibleAtlassianResources` and reuse it.

Then the **project key**, in order of cheapness:

1. What the user said.
2. Repo convention — ticket keys in recent history:
   `git log --oneline -30 | grep -oE '[A-Z][A-Z0-9]+-[0-9]+'`, plus the current
   branch name and `CLAUDE.md`.
3. `getVisibleJiraProjects` and ask.

Then the **issue type** from `getJiraProjectIssueTypesMetadata` — match the work
to a type the project actually offers, not the one you expected it to have.

Done when `cloudId`, project key, and issue type id are all values a tool
returned. Never guess an id.

### 2. Read the create screen

`getJiraIssueTypeMetaWithFields` for that project + issue type. This is the step
people skip and creates fail on: projects carry mandatory custom fields (team,
component, severity, sprint) that vary per issue type.

- Every **required** field gets a value.
- Select and option fields take only their **allowed values** — copy them
  verbatim from the metadata, don't paraphrase.
- Anything required that you can't derive from context, ask for. One batched
  question, not a drip.

Done when every required field maps to a concrete value or a pending question.

### 3. Sweep for duplicates

Two or three JQL searches on the distinctive nouns before creating anything:

```
project = ABC AND statusCategory != Done AND text ~ "checkout timeout"
  ORDER BY updated DESC
```

Report near-matches with keys and titles. If one already covers this, propose
commenting on it (`addCommentToJiraIssue`) or linking to it instead of filing a
second ticket — and let the user decide.

### 4. Draft

**Title** — the outcome, not the activity, and searchable by someone who only
remembers the symptom. Lead with the affected thing.

- `Checkout fails with 504 when cart exceeds 50 items` — not `Fix checkout bug`
- `Add idempotency key to refund endpoint` — not `Refund work`

**One ticket, one deliverable.** If the title needs an "and", it's two tickets.

**Body** — use the template for the issue type in
[`TEMPLATES.md`](TEMPLATES.md).

Rules that hold for every type:

- **Acceptance criteria are checkable.** A reviewer must be able to say done or
  not-done without asking the author. "Handles errors gracefully" fails;
  "returns 422 with the field name when the SKU is unknown" passes.
- **State what's out of scope** whenever the title could reasonably be read
  wider than intended.
- **Don't paste file paths, line numbers, or code** — they go stale before the
  ticket is picked up. Link a repo permalink pinned to a commit SHA instead.
  Exception: a schema, type, or state machine that pins a decision more
  precisely than prose can.
- **Evidence over assertion.** Error text, log excerpt, request id, screenshot,
  the JQL of the related tickets — whatever lets the reader verify without you.
- **Write the description in the format the tool takes.** Check
  `createJiraIssue`'s schema for the description field first: if it wants
  Atlassian Document Format, build that structure; if it takes a plain string,
  Jira wiki markup renders (`h2.`, `*bold*`, `#` ordered, `*` bullets) and
  GitHub markdown largely does not.

### 5. Confirm

Show the user the whole thing before it exists: title, issue type, project, the
rendered body, and a list of every field you're setting — including the ones you
inferred rather than were told. Name anything you're leaving unset.

Wait for explicit approval. Revise and re-show on any correction.

### 6. Create, then wire it up

`createJiraIssue` with the approved fields. Then, only if they apply:

- **Links** — `getIssueLinkTypes` for the exact name, then `createIssueLink` for
  blocks / is blocked by / relates to / duplicates.
- **Parent** — epic or subtask parentage goes in the `parent` field at create
  time, not as a link.
- **Attachments and long evidence** — `addCommentToJiraIssue` rather than
  bloating the description.
- **Status** — never set at create. `getTransitionsForJiraIssue` then
  `transitionJiraIssue` if it shouldn't sit in the default column.

Report back the issue key and its browse URL, plus anything you deliberately
left unset for the user to fill in.

## Field gotchas

- **assignee / reporter** take an `accountId`, not a name or email — resolve via
  `lookupJiraAccountId` and confirm the match if more than one lands.
- **labels** can't contain spaces; check what the project already uses rather
  than minting a new vocabulary.
- **priority / severity** — the project's own scale, from step 2's metadata.
  Don't import a scale from another tracker.
- **story points** live on a custom field whose id differs per site; take it
  from the metadata, never a remembered `customfield_*` number.
- A create that fails on a field is a step 2 failure. Re-read the metadata
  rather than retrying with a guess.
