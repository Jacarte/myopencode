# mem0-functional Plugin Architecture (Why-First)

This document explains why the plugin is designed the way it is, not just what each function does.

File: `~/.config/opencode/plugins/mem0-functional.ts`

## Reference backend implementation

This plugin is wired to a local reference server implementation at:

- `~/.config/opencode/plugins/mem0server/`
- Server docs: `~/.config/opencode/plugins/mem0server/README.md`

Runtime endpoint contract expected by this plugin:

- `POST /memories`
- `POST /search`
- `GET /memories`
- `DELETE /memories/{memory_id}`

By default, the plugin resolves `MEM0_SERVER_URL` to `http://localhost:8000`.

## Why this plugin exists

OpenCode sessions are excellent at short-term reasoning, but they need help with durable continuity across sessions.

This plugin adds a practical memory model:

- Tier 1 (Core): static guidance from `AGENTS.md` (outside this plugin)
- Tier 2 (Working): session-local, temporary memory control in plugin state
- Tier 3 (Long-term): searchable mem0 persistence

The core principle is: **inject less, retrieve smarter, persist only high-signal facts** the implementation of the mem0 plugin is inspired by the opencode-supermemory plugin.

## Why these design choices

### 1) Session working state (Tier 2)

The plugin keeps session-local state (`SessionState`) to avoid repeated noisy injections and to adapt retrieval timing.

Why:

- Without working state, memory injection repeats and token cost grows quickly.
- Session-local state lets us detect topic shifts and refresh only when useful.
- It keeps temporary coordination data out of long-term memory.

Key fields and why they matter:

- `turn`: lets refresh policy be deterministic
- `lastInjectionTurn`: prevents over-injection
- `topicSignature`: enables topic-shift detection
- `injectedMemoryIdsLRU`: suppresses repeated memories
- `workingSet`: tracks the current selected context
- `lastGoodContextSnippet`: fallback when mem0 is temporarily unavailable

### 2) Triggered retrieval, not constant retrieval

Retrieval is triggered on:

- first turn (optional)
- explicit recall intent
- periodic refresh (every N turns)
- topic shift

Why:

- Always retrieving on every turn is expensive and noisy.
- Never refreshing causes stale context in longer sessions.
- Triggered policy balances relevance and cost.

### 3) Cross-scope ranking + dedupe before injection

Candidates from user/project/agent/environment are pooled and ranked, then deduped.

Why:

- Scope-by-scope injection can over-represent one scope and duplicate facts.
- A unified ranking chooses globally best memories for this turn.
- Dedupe protects context quality and reduces prompt bloat.

Current weighting intention:

- semantic relevance is primary
- recency prevents stale dominance
- type weight favors durable facts/decisions
- scope boost gives project context mild priority

### 4) Hard injection budget

The plugin enforces char/token-like bounds and item count limits.

Why:

- Unlimited context growth degrades model quality and cost.
- Hard budgets make behavior predictable and tunable.

### 5) Lifecycle metadata on writes (Tier 3)

Writes include metadata such as `created_at`, `last_used_at`, `access_count`, `fingerprint`, `decay_half_life_days`, and `tier`.

Why:

- Long-term memory without lifecycle becomes stale and noisy.
- Metadata enables better ranking and future cleanup.
- Fingerprints support dedupe and supersession workflows.

### 6) Supersession detection

New memories can mark similar old entries as superseded.

Why:

- Decisions evolve; old decisions should not be equally ranked forever.
- Supersession keeps history while reducing retrieval confusion.

### 7) Circuit breaker + retries + fallback

The plugin retries mem0 calls, then opens a circuit breaker after repeated failures, and can inject last-known-good context.

Why:

- Memory backend instability should never break chat flow.
- Retries handle transient network errors.
- Breaker avoids repeated expensive failures.
- Fallback maintains continuity during outages.

### 8) Optional cold compaction archival

Compaction summaries can be stored as cold context (`inject: false`).

Why:

- Full summaries are useful for audit/recovery.
- They are usually too broad for default prompt injection.
- Keeping them cold preserves recall without polluting active context.

## Why high-signal-only persistence

The plugin intentionally stores only:

- decisions
- problems + fixes
- stable facts
- reusable procedures

Why:

- Raw transcripts degrade retrieval precision.
- High-signal filtering keeps memory useful over time.
- It reduces storage and retrieval cost.

## Operational tuning (why these knobs exist)

Important env vars:

- `MEM0_REFRESH_EVERY_TURNS`: controls refresh frequency (quality vs token cost)
- `MEM0_MAX_INJECT_CHARS`: hard cap for injected context size
- `MEM0_SIMILARITY_DEDUPE_THRESHOLD`: aggressiveness of near-duplicate suppression
- `MEM0_SUPERSEDES_THRESHOLD`: aggressiveness of supersession linking
- `MEM0_BREAKER_THRESHOLD` / `MEM0_BREAKER_COOLDOWN_MS`: backend failure tolerance
- `MEM0_LOG_INJECTION` / `MEM0_LOG_INJECTION_CONTENT`: observability vs verbosity/privacy

Tuning philosophy:

- If context feels stale -> refresh more often
- If cost/noise is high -> reduce injection budget and increase dedupe strictness
- If backend is flaky -> lower breaker threshold or increase cooldown

## Failure behavior (intentional)

When mem0 is unavailable:

1. retries are attempted
2. breaker may open temporarily
3. chat keeps running without hard failure
4. fallback snippet may be injected if available

Why:

- Availability of conversation flow is prioritized over memory freshness.

## Evolution path

Near-term improvements should prioritize:

1. better confidence-based retrieval gating
2. stronger supersession semantics (active/inactive memory views)
3. periodic lifecycle maintenance (demotion/expiry)
4. evaluation harness for memory precision/recall quality

Why:

- These improve memory quality without increasing prompt size.
