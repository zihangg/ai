---
name: security-and-hardening
description: Harden code by threat-modeling trust boundaries, then applying tiered controls. Use when handling untrusted input, authentication, or secrets; integrating third-party services or file uploads; or passing LLM output into code.
---

# Security and Hardening

Security is a property of design, not a phase you bolt on. Controls stacked
without a threat model are guesses - you harden the doors an attacker was never
going to use and leave the window open. Threat-model first, then tier your
controls to the surface you actually have.

## Phase 1 - Threat-model first (five minutes, before any control)

Think like an attacker before you think like a defender. Cheap, and it catches
the design flaws no downstream control can patch (OWASP **A04: Insecure
Design** - most breaches begin in design, not code).

1. **Map the trust boundaries.** Every point where untrusted data crosses into
   your system is attack surface: HTTP requests, form fields, file uploads,
   webhooks, third-party API responses, message queues, and **LLM output**. If
   you can't name a feature's boundaries, you're not ready to secure it.
2. **Name the assets.** What's worth stealing or breaking? Credentials, PII,
   payment data, admin actions, money movement. No asset behind a boundary means
   the boundary is low-stakes - spend effort where the assets are.
3. **Run STRIDE over each boundary.** A lens, not a ceremony:

| Threat                     | Ask                                        | Typical mitigation                             |
| -------------------------- | ------------------------------------------ | ---------------------------------------------- |
| **S**poofing               | Can someone impersonate a user or service? | Authentication, signature verification         |
| **T**ampering              | Can data be altered in transit or at rest? | Integrity checks, parameterized queries, HTTPS |
| **R**epudiation            | Can an action be denied later?             | Audit logging of security events               |
| **I**nformation disclosure | Can data leak?                             | Encryption, field allowlists, generic errors   |
| **D**enial of service      | Can it be overwhelmed?                     | Rate limiting, input size caps, timeouts       |
| **E**levation of privilege | Can a user gain rights they shouldn't?     | Authorization checks, least privilege          |

4. **Write abuse cases next to use cases.** For each feature, ask "how would I
   misuse this?" - then make that misuse your first test. This is the same
   instinct as `doubt-driven-development`: assume the code is exploitable and go
   prove it isn't, rather than assuming it's fine.

The output of this phase is a short list: boundaries, the assets behind each,
and the STRIDE threats that actually apply. That list drives Phase 2.

## Phase 2 - Tier the controls

Not every control belongs on every surface. Sort the threats from Phase 1 into
three tiers. Full per-domain checklists and OWASP lookup tables live in
[`CHECKLIST.md`](CHECKLIST.md) - consult it when hardening a specific surface.

### Always do (no exceptions, every surface)

- **Validate all external input at the boundary** - schema-validate with
  allowlists (min/max, enums, formats), not denylists.
- **Parameterize every query** - never concatenate untrusted input into SQL,
  NoSQL, or a shell command.
- **Encode output** - rely on framework auto-escaping; never `eval`,
  `innerHTML`, or a raw file path built from untrusted data.
- **Hash passwords** with bcrypt (≥12 rounds), scrypt, or argon2. Never
  plaintext.
- **HTTPS** for all external communication.
- **Never commit secrets.** `.env` gitignored, `.env.example` with placeholders,
  grep staged diffs for `password|secret|api_key|token`. If a secret ever hits a
  remote, it is compromised - rotate first, then purge history.
- **Never log sensitive data** (passwords, tokens, full card numbers) and never
  expose stack traces or internal errors to users.
- **Authorize, not just authenticate.** Every protected endpoint checks that the
  authenticated user owns the resource (prevents IDOR). Authentication asks who
  you are; authorization asks whether you may.

### Do by default (override only with a written reason)

- **Security headers** - CSP, HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy` (use `helmet` or equivalent).
- **Session cookies** `httpOnly`, `secure`, `sameSite`. Never keep auth tokens
  in `localStorage`.
- **CORS restricted** to a known origin allowlist. Wildcard `*` is not a
  default.
- **Rate-limit** auth endpoints hard (≤10/15min) and the API generally.
- **Reproducible installs** - lockfile committed, CI installs with `npm ci`, and
  `npm audit` runs before release (a `shipping-and-launch` gate).

### Do when relevant (surface-specific, driven by Phase 1)

- **File uploads** - restrict type and size, verify magic bytes, never trust the
  extension.
- **Server-side URL fetch** (webhooks, "import from URL", image proxies) -
  **SSRF** risk. Allowlist scheme and host, reject any resolved private/reserved
  IP (loopback, `169.254.169.254` cloud metadata, RFC1918, unique-local), forbid
  redirects. Beware the DNS-rebinding TOCTOU gap: for high-risk surfaces resolve
  once and connect to the pinned IP, or front it with a filtering agent.
- **PII at rest** - encrypt where regulation or the asset value demands it.
- **LLM features** - see below; the model is a trust boundary.
- **New auth flows, new PII stores, new integrations, CORS changes, permission
  grants** - route through human security review before merge, not after.

## LLM output is a trust boundary

If your app calls a model - chatbot, summarizer, agent, RAG - the model's output
crosses a trust boundary exactly like a raw HTTP body does. Map it to the OWASP
Top 10 for LLMs (full table in [`CHECKLIST.md`](CHECKLIST.md)). The
non-negotiables:

- **Model output is untrusted input (LLM05).** Never pass it straight into
  `eval`, SQL, a shell, `innerHTML`, or a file path. Parse defensively, validate
  against a schema, encode - same as any user input. That "text" can be a SQL
  statement, a script tag, or a shell command.
- **Prompts get hijacked (LLM01).** Untrusted text in the context window - a
  user message, a fetched page, a PDF - can carry instructions. The system
  prompt is **not** a security boundary; enforce permissions in code.
- **Keep secrets and cross-tenant data out of the context (LLM02/LLM07).**
  Anything in the window can be echoed back.
- **Scope agency (LLM06).** Minimum tool permissions, confirm destructive
  actions, validate every tool argument.
- **Bound consumption (LLM10).** Cap tokens, request rate, and loop depth.
- **Partition RAG per tenant (LLM08).** Treat the vector store as a boundary;
  one user must not retrieve another's embeddings.

## Red flags / Rationalizations

Stop when you catch yourself here.

| Excuse                                    | Reality                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| "Internal tool, security doesn't matter." | Internal tools get compromised; attackers target the weakest link.                    |
| "We'll add security later."               | Retrofitting is 10x the cost of building it in. The threat model is five minutes now. |
| "No one would try to exploit this."       | Automated scanners try everything. Obscurity is not a control.                        |
| "The framework handles it."               | Frameworks give tools, not guarantees. You still have to use them correctly.          |
| "It's just a prototype."                  | Prototypes become production. Habits from day one.                                    |
| "It's just LLM output, it's only text."   | That text can be a query, a script tag, or a shell command.                           |

Code-level red flags - each is a boundary with no control:

- Untrusted input reaching a query, shell, or the DOM unparameterized.
- Secrets in source or commit history.
- An endpoint with authentication but no ownership/role check.
- Wildcard (`*`) CORS origins, or missing CORS entirely.
- No rate limit on auth endpoints.
- Stack traces or internal errors returned to the client.
- Server fetching a user-supplied URL with no allowlist (SSRF).
- Model output flowing into a query, the DOM, a shell, or `eval`.
- Secrets, PII, or the full system prompt sitting inside an LLM context window.

## Verify before done

Re-run Phase 1's list and confirm each boundary has its tier of controls, then:

- [ ] `npm audit` (or equivalent) clean of critical/high, or deferrals
      documented with a review date.
- [ ] No secrets in source or git history.
- [ ] All external input validated at the boundary; queries parameterized.
- [ ] Every protected endpoint checks authentication **and** ownership.
- [ ] Security headers present (verify in DevTools), CORS restricted, errors
      generic.
- [ ] Rate limiting active on auth endpoints.
- [ ] Server-side URL fetches allowlisted (no SSRF), if any.
- [ ] LLM output validated and encoded before use, if AI features present.

Security work is a release gate - fold this verification into
`shipping-and-launch`.
