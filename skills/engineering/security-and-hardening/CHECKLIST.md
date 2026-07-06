# Security Checklist

Per-surface lookup for `security-and-hardening`. The skill drives the process
(threat-model, then tier controls); this file is the reference you consult while
hardening a specific surface. Checklists use allowlists over denylists
throughout.

## Pre-commit

- [ ] No secrets staged
      (`git diff --cached | grep -i "password\|secret\|api_key\|token"`)
- [ ] `.gitignore` covers `.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.key`
- [ ] `.env.example` holds placeholders, not real values
- [ ] Any secret that ever reached a remote is rotated, then purged from history

## Authentication

- [ ] Passwords hashed with bcrypt (≥12 rounds), scrypt, or argon2
- [ ] Session cookies `httpOnly`, `secure`, `sameSite: 'lax'`
- [ ] Session expiration set (reasonable max-age)
- [ ] Login rate-limited (≤10 attempts / 15 min)
- [ ] Password reset tokens time-limited (≤1 hour) and single-use
- [ ] MFA available for sensitive operations (recommended)

## Authorization

- [ ] Every protected endpoint checks authentication
- [ ] Every resource access checks ownership or role (prevents IDOR)
- [ ] Admin endpoints verify admin role
- [ ] API keys scoped to minimum permissions
- [ ] JWTs validated for signature, expiration, and issuer

## Input validation

- [ ] Validated at system boundaries (routes, form handlers), with allowlists
- [ ] String lengths and numeric ranges constrained
- [ ] Email, URL, and date formats validated with real libraries
- [ ] File uploads: type restricted, size limited, magic bytes verified
- [ ] SQL/NoSQL queries parameterized (no concatenation)
- [ ] HTML output encoded via framework auto-escaping
- [ ] Redirect targets validated (prevent open redirect)
- [ ] Server-side URL fetches allowlisted; private/reserved IPs blocked (SSRF)

### Schema validation at the boundary

```typescript
const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.string().datetime().optional(),
});

const result = CreateTaskSchema.safeParse(req.body);
if (!result.success) {
  return res.status(422).json({ error: { code: "VALIDATION_ERROR" } });
}
// result.data is typed and validated
```

### Parameterized query, not concatenation

```typescript
// BAD:  `SELECT * FROM users WHERE id = '${userId}'`
const user = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
```

### Authorization, not just authentication

```typescript
const task = await taskService.findById(req.params.id);
if (task.ownerId !== req.user.id) {
  return res.status(403).json({ error: { code: "FORBIDDEN" } });
}
```

### SSRF-safe outbound fetch

```typescript
// Allowlist scheme + host, reject any resolved private/reserved IP, no redirects.
const ALLOWED_HOSTS = new Set(["hooks.example.com"]);

async function assertSafeUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("https only");
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error("host not allowed");
  const addrs = await lookup(url.hostname, { all: true }); // resolve ALL records
  if (addrs.some((a) => ipaddr.parse(a.address).range() !== "unicast")) {
    throw new Error("private/reserved IP"); // covers loopback, 169.254.169.254, RFC1918, ULA
  }
  return url;
}
await fetch(await assertSafeUrl(req.body.webhookUrl), { redirect: "error" });
```

`range() !== 'unicast'` blocks the cloud-metadata endpoint (`169.254.169.254`),
the #1 SSRF target. Note the DNS-rebinding TOCTOU gap: `fetch` re-resolves after
the check. For high-risk surfaces, pin the resolved IP or front with a filtering
agent.

## Security headers

```
Content-Security-Policy: default-src 'self'; script-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0            (rely on CSP)
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## CORS

```typescript
// Recommended: explicit origin allowlist.
cors({ origin: ["https://yourdomain.com"], credentials: true });

// NEVER in production:
cors({ origin: "*" });
```

## Data protection

- [ ] Sensitive fields (`passwordHash`, `resetToken`) excluded from API
      responses
- [ ] Sensitive data never logged
- [ ] PII encrypted at rest where regulation or asset value demands
- [ ] HTTPS for all external communication; backups encrypted

## Error handling

```typescript
// Production: generic, no internals.
res.status(500).json({
  error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
});

// NEVER: err.message / err.stack / err.sql leaked to the client.
```

## Dependency and supply chain

`npm audit` catches known CVEs; it will not catch a malicious or typosquatted
package.

- [ ] Lockfile committed; CI installs with `npm ci` (not `npm install`)
- [ ] Critical/high findings fixed if reachable; deferrals get a review date
- [ ] New dependencies reviewed (maintenance, downloads, `postinstall` scripts)
- [ ] No typosquats (`cross-env` vs `crossenv`, `react-dom` vs `reactdom`)

### Triaging `npm audit`

- Reachable in a production code path + fix available -> update now.
- Reachable, no fix -> workaround, replace the dependency, or allowlist with a
  review date.
- Dev-only or unreachable -> fix soon, not a release blocker.
- Moderate/low -> next release cycle or regular dependency updates.

## AI / LLM (any feature calling a model)

- [ ] Model output treated as untrusted - never into
      `eval`/SQL/shell/`innerHTML`/file paths
- [ ] Prompt injection assumed; permissions enforced in code, not the system
      prompt
- [ ] Secrets, cross-tenant data, and full system prompts kept out of the
      context window
- [ ] Tool/agent permissions scoped; destructive actions require confirmation
- [ ] Token, rate, and loop/recursion limits set
- [ ] RAG embeddings partitioned per tenant; documents validated before indexing

### Model output is data, not a command

```typescript
// BAD: trusting output as a command or as markup
await db.query(await llm.generate(`SQL for: ${q}`)); // arbitrary query
container.innerHTML = await llm.reply(msg); // stored XSS via the model

// GOOD: parse defensively -> validate -> encode
let intent;
try {
  intent = CommandSchema.parse(JSON.parse(await llm.replyJson(msg)));
} catch {
  throw new ValidationError("unexpected model output");
}
await runAllowlistedAction(intent.action, intent.params);
container.textContent = await llm.reply(msg);
```

## OWASP Top 10 (2021) quick reference

| #  | Vulnerability             | Prevention                                          |
| -- | ------------------------- | --------------------------------------------------- |
| 1  | Broken Access Control     | Auth checks every endpoint, ownership verification  |
| 2  | Cryptographic Failures    | HTTPS, strong hashing, no secrets in code           |
| 3  | Injection                 | Parameterized queries, input validation             |
| 4  | Insecure Design           | Threat modeling, abuse cases                        |
| 5  | Security Misconfiguration | Security headers, minimal permissions, audited deps |
| 6  | Vulnerable Components     | `npm audit`, updated + minimal deps                 |
| 7  | Auth Failures             | Strong hashing, rate limiting, session management   |
| 8  | Data Integrity Failures   | Verify updates/dependencies, signed artifacts       |
| 9  | Logging Failures          | Log security events, never log secrets              |
| 10 | SSRF                      | Validate/allowlist URLs, block private IPs          |

## OWASP Top 10 for LLMs (2025) quick reference

See the [OWASP GenAI Security Project](https://genai.owasp.org/llm-top-10/).

| ID    | Risk                        | Prevention                                                         |
| ----- | --------------------------- | ------------------------------------------------------------------ |
| LLM01 | Prompt Injection            | System prompt is not a boundary; enforce permissions in code       |
| LLM02 | Sensitive Info Disclosure   | Keep secrets/PII out of prompts; filter outputs                    |
| LLM03 | Supply Chain                | Vet models, datasets, and plugins like any dependency              |
| LLM04 | Data and Model Poisoning    | Trusted sources; verify integrity; vet fine-tuning and RAG data    |
| LLM05 | Improper Output Handling    | Treat output as untrusted; validate, parameterize, encode          |
| LLM06 | Excessive Agency            | Scope tool permissions; confirm destructive actions                |
| LLM07 | System Prompt Leakage       | Assume it leaks; put no secrets in it                              |
| LLM08 | Vector/Embedding Weaknesses | Partition RAG per tenant; validate docs before indexing            |
| LLM09 | Misinformation              | Ground with citations; validate critical claims; human in the loop |
| LLM10 | Unbounded Consumption       | Cap tokens, request rate, loop/recursion depth                     |
