# Compiling a Graph

You fixed the **lane** at step 0. This is the mechanics for each.

## Lane A - Workflow script

The `Workflow` tool's own description is the API reference. This file is only
the part that is easy to get wrong.

**Write the script to a file first.** Invoking with an inline script runs it -
so a graph compiled that way has already spent its budget before step 5 reads
it. Author the file yourself and invoke with `{ scriptPath }`, so the dry-run
happens before the first node does. Every invocation also persists its script
and returns the path, which is what you edit on the next round.

**Iterate by resuming.** Edit the file and re-invoke with
`{ scriptPath, resumeFromRunId }` - the unchanged prefix of nodes replays from
cache and only the edited node onward runs live. Never re-send a full script to
change one prompt, and never re-run from zero to change one line.

**`meta` is a pure literal.** No variables, calls, spreads, or interpolation.
Titles in `meta.phases` are matched against the `phase` values your nodes
actually carry - including the `phase` **opt**, which is what the sketches use.
A value with no matching `meta` entry still runs; it just gets its own group.

**Scripts are JavaScript, not TypeScript.** Type annotations, interfaces and
generics fail to parse. `Date.now()`, `new Date()` and `Math.random()` throw -
they would break resume. Pass timestamps in through `args`; get variation across
nodes from the index, not from randomness. No filesystem, no Node APIs.

**Schemas are the contract, enforced.** A node with `schema` is forced to call a
structured-output tool and returns a validated object; the model retries on
mismatch. This is where step 2's **output** field lands. Without it you get a
string, and step 5's "no output shape" smell is real.

**Nulls are normal, and a dead node reaches the next stage.** A skipped or dead
node returns `null`, and `parallel()` never rejects - a failed thunk becomes
`null` in the array. A stage that _throws_ drops that item to `null` and skips
its remaining stages, but a stage-1 node that merely _returns_ `null` still
calls stage 2 with it, so guard the stage entry. Always `.filter(Boolean)`
before use, **count what you filtered**, and keep a dead node structurally
distinct from an empty-but-live result - `[]` and `{}` are truthy and will be
counted as live.

**`opts`, in the order they matter.** `schema` first. `phase` explicitly inside
`pipeline()` / `parallel()` stages, since the global `phase()` state races.
`tools` and `agentType` next - step 2 rule 4 makes read-only the default, and
this is where it is enforced. `label` for anything you will need to find in the
journal. `effort` down to `low` for mechanical stages and up only for the
hardest judgement. `model` only when you are confident a different tier fits -
omitting it inherits the session model, which is nearly always right.
`isolation: 'worktree'` **only** when nodes mutate files concurrently; it costs
setup time and disk per node, and it isolates the working tree **only** - not
databases, caches, global installs, or anything remote.

**Width is capped for you.** Concurrent nodes are limited to roughly the core
count regardless of how many items you pass, so a wide `parallel()` queues
rather than failing. The cap that will actually bite you is step 1's.

**Budget is a stop, not a bound.** `budget.total` is the user's token target or
`null`, and `budget.remaining()` returns `Infinity` when no target was set, so
no budget expression alone terminates a loop. Give every loop a round limit that
does not depend on budget state, use the budget check to end a run early, and
return which one stopped it.

**Diagnose from the journal.** `journal.jsonl` in the transcript directory
records each node's actual return value. Read it before concluding a graph
returned nothing - a cached empty result and a dead node are indistinguishable
from the outside.

## Lane B - Hand-orchestrated fan-out

No script. You are the runtime, and the artifact is a written plan: every node,
its brief, and which turn it runs in.

**One turn is one stage.** Issue every node in a stage as parallel tool calls in
a **single** message. Sequential calls in separate turns are the same graph with
the parallelism deleted.

**Cap stage width yourself.** Nothing queues for you here. Keep a stage to about
8 nodes and chunk a longer work-list into sequential batches - and say in the
report that you batched.

**Scope tools by agent type.** There is no per-call tool list, so step 2 rule 4
is honoured by which agent type you spawn. Pick a read-only type for finders,
screeners and verifiers; if the provider offers none, say so in the plan rather
than assuming the default is safe.

**Schemas become templates.** With no structured-output enforcement, put the
exact return shape in the brief as a fenced block and tell the node to return
that and nothing else. Then validate what comes back yourself; a node that
returned prose gets re-asked, not silently reinterpreted.

**Keep a ledger.** There is no journal and no resume. After each stage, write
the node results into the conversation in a compact table - node, status,
result. That ledger is the only record that a node ran at all, and it is what
step 6 reconciles and step 7 adjudicates against.

**Nesting is unavailable.** A subagent cannot spawn subagents, so every node is
a leaf and the orchestration stays in the main context. A graph designed with
sub-graphs flattens to stages here.

**Serialize anything that touches shared state.** No worktree isolation. Give
concurrent nodes disjoint paths **and** keep shared repo state to one node per
stage: at most one node may run git, a package install, a build, or a fixed
port. Disjoint file paths still contend on `.git/index`, lockfiles, and build
output. Anything remote - push, MR or ticket creation, a deploy - is serialized
regardless of lane.

**Say which lane ran.** Step 7's header names it, and lane B's Coverage line
comes from your ledger rather than a journal. The reader should know which.
