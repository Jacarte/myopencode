import { createHash } from "node:crypto";
import type { Part } from "@opencode-ai/sdk";
import { tool, type Plugin } from "@opencode-ai/plugin";

const MEM0_SERVER_URL = (process.env.MEM0_SERVER_URL || "http://192.168.0.160:18000").replace(/\/+$/, "");
const MEM0_COMPACTION_MODE = process.env.MEM0_COMPACTION_MODE === "replace" ? "replace" : "append";
const MEM0_SAVE_COLD_COMPACTION = process.env.MEM0_SAVE_COLD_COMPACTION === "1";
const MEM0_LOG_INJECTION = process.env.MEM0_LOG_INJECTION === "1";
const MEM0_LOG_INJECTION_CONTENT = process.env.MEM0_LOG_INJECTION_CONTENT === "1";
const MEM0_COLD_MAX_CHARS = Number(process.env.MEM0_COLD_MAX_CHARS || 6000);
const MEM0_API_MAX_ATTEMPTS = 3;
const MEM0_API_RETRY_DELAY_MS = 250;
const MEM0_REFRESH_EVERY_TURNS = Number(process.env.MEM0_REFRESH_EVERY_TURNS || 6);
const MEM0_AUTO_RETRIEVE_FIRST_TURN = process.env.MEM0_AUTO_RETRIEVE_FIRST_TURN !== "0";
const MEM0_MAX_INJECT_CHARS = Number(process.env.MEM0_MAX_INJECT_CHARS || 2200);
const MEM0_MAX_RECENT_IDS = Number(process.env.MEM0_MAX_RECENT_IDS || 40);
const MEM0_SIMILARITY_DEDUPE_THRESHOLD = Number(process.env.MEM0_SIMILARITY_DEDUPE_THRESHOLD || 0.92);
const MEM0_SUPERSEDES_THRESHOLD = Number(process.env.MEM0_SUPERSEDES_THRESHOLD || 0.88);
const MEM0_BREAKER_THRESHOLD = Number(process.env.MEM0_BREAKER_THRESHOLD || 3);
const MEM0_BREAKER_COOLDOWN_MS = Number(process.env.MEM0_BREAKER_COOLDOWN_MS || 20_000);
const MEM0_READ_TIMEOUT_MS = Number(process.env.MEM0_READ_TIMEOUT_MS || 8_000);
const MEM0_WRITE_TIMEOUT_MS = Number(process.env.MEM0_WRITE_TIMEOUT_MS || 45_000);
const MAX_CONTEXT_ITEMS = 6;

type Scope = "user" | "project" | "agent" | "environment";
type MemoryType = "decision" | "problem-fix" | "stable-fact" | "procedure" | "noise";
type JsonRecord = Record<string, unknown>;

interface MemoryResult {
  id: string;
  content: string;
  score?: number;
  metadata?: JsonRecord;
}

interface MemoryCandidate extends MemoryResult {
  scope: Scope;
  type: string;
  fingerprint: string;
  createdAt?: number;
  ttlExpiresAt?: number;
  decayHalfLifeDays?: number;
  inject: boolean;
  semantic: number;
  rankScore: number;
}

interface SessionState {
  turn: number;
  lastInjectionTurn: number;
  topicSignature: string;
  injectedMemoryIdsLRU: string[];
  workingSet: MemoryCandidate[];
  lastGoodContextSnippet: string;
}

interface PluginMetrics {
  retrievalAttempts: number;
  retrievalHits: number;
  dedupeDrops: number;
  budgetDrops: number;
  breakerOpens: number;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? (value as JsonRecord) : null;
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      const row = asRecord(part);
      if (!row || row.type !== "text") return "";
      return typeof row.text === "string" ? row.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[TRUNCATED]`;
}

function preview(text: string, maxChars = 220): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return undefined;
}

function normalizeText(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(content: string): string[] {
  return normalizeText(content)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function tokenSimilarity(left: string, right: string): number {
  const leftSet = new Set(tokenize(left));
  const rightSet = new Set(tokenize(right));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }
  const union = leftSet.size + rightSet.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

function contentFingerprint(content: string): string {
  return sha(normalizeText(content));
}

function topicSignature(content: string): string {
  const ignored = new Set(["this", "that", "with", "from", "have", "what", "when", "where", "which", "would", "could", "should"]);
  const counts = new Map<string, number>();
  for (const token of tokenize(content)) {
    if (ignored.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([token]) => token)
    .sort()
    .join(" ");
}

function shouldRefreshForTopicShift(previousSignature: string, currentSignature: string): boolean {
  if (!previousSignature || !currentSignature) return false;
  return tokenSimilarity(previousSignature, currentSignature) < 0.35;
}

function deriveHalfLifeDays(type: string): number {
  if (type === "decision" || type === "stable-fact") return 120;
  if (type === "procedure") return 60;
  if (type === "problem-fix") return 45;
  return 30;
}

function computeRecencyScore(candidate: MemoryCandidate): number {
  const createdAt = candidate.createdAt;
  if (!createdAt) return 0.5;
  const ageDays = Math.max(0, (Date.now() - createdAt) / 86_400_000);
  const halfLife = candidate.decayHalfLifeDays || deriveHalfLifeDays(candidate.type);
  const decay = 0.5 ** (ageDays / halfLife);
  const ttlExpired = candidate.ttlExpiresAt && Date.now() > candidate.ttlExpiresAt;
  return ttlExpired ? decay * 0.25 : decay;
}

function typeWeight(type: string): number {
  if (type === "decision") return 1;
  if (type === "stable-fact") return 0.95;
  if (type === "procedure") return 0.9;
  if (type === "problem-fix") return 0.8;
  return 0.6;
}

function scopeBoost(scope: Scope): number {
  if (scope === "project") return 1;
  if (scope === "user") return 0.9;
  if (scope === "agent") return 0.8;
  return 0.75;
}

const RECALL_INTENT_PATTERN = /\b(recall|what\s+did\s+we\s+decide|what\s+did\s+i\s+say|previously|earlier|past\s+decision|history|refresh\s+memory)\b/i;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createPartID(kind: string): string {
  return `prt-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;
const MEMORY_KEYWORD_PATTERN = /\b(remember|save\s+this|don't\s+forget|dont\s+forget|store\s+this|note\s+this|memorize)\b/i;

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function removeCodeParts(text: string): string {
  return text.replace(CODE_BLOCK_PATTERN, "").replace(INLINE_CODE_PATTERN, "");
}

function stripPrivateContent(content: string): string {
  return content.replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]");
}

function isFullyPrivate(content: string): boolean {
  const stripped = stripPrivateContent(content).trim();
  return stripped === "" || stripped === "[REDACTED]";
}

function resolveUserID(): string {
  const explicit = process.env.MEM0_USER_ID || process.env.OPENCODE_USER_ID;
  if (explicit) return explicit;

  // WHY: A stable fallback keeps personal memory usable across sessions
  // even when explicit identity env vars are missing.
  const fallbackIdentity = `${process.env.USER || process.env.USERNAME || "anonymous"}@local`;
  return `oc-user-${sha(fallbackIdentity)}`;
}

function resolveProjectID(directory: string): string {
  // WHY: Hashing the absolute project path mirrors supermemory's deterministic
  // project scoping and prevents cross-project leakage.
  return `oc-project-${sha(directory)}`;
}

function resolveAgentID(agent?: string): string {
  return `oc-agent-${sha(agent || "default-agent")}`;
}

function scopeIdentifiers(scope: Scope, directory: string, agent?: string): { user_id: string; agent_id: string } {
  const userID = resolveUserID();
  const projectID = resolveProjectID(directory);
  const agentID = resolveAgentID(agent);

  if (scope === "user") {
    return { user_id: userID, agent_id: "oc-scope-user" };
  }
  if (scope === "project") {
    return { user_id: userID, agent_id: `oc-scope-project-${projectID}` };
  }
  if (scope === "agent") {
    return { user_id: userID, agent_id: `oc-scope-agent-${agentID}` };
  }

  return { user_id: userID, agent_id: `oc-scope-environment-${projectID}` };
}

function classifyHighSignal(content: string, explicitType?: MemoryType): { shouldSave: boolean; type: MemoryType; reason: string } {
  if (explicitType && explicitType !== "noise") {
    return { shouldSave: true, type: explicitType, reason: "Explicit high-signal type requested" };
  }

  const text = content.toLowerCase();

  const decision = /(decid(e|ed)|choose|selected|trade-?off|architecture|we will|going with)/i;
  const problemFix = /(bug|error|issue|fix|workaround|resolved|edge case|root cause)/i;
  const stableFact = /(preference|always|never|constraint|requires|must use|environment|stack|runtime|version)/i;
  const procedure = /(run this|steps|procedure|deploy|playbook|how to|checklist)/i;
  const noisy = /(thinking out loud|maybe|perhaps|temporary|for now|draft)/i;

  // WHY: The classifier intentionally biases toward precision over recall
  // to prevent low-value memory accumulation.
  if (decision.test(text)) return { shouldSave: true, type: "decision", reason: "Detected durable decision signal" };
  if (problemFix.test(text)) return { shouldSave: true, type: "problem-fix", reason: "Detected reusable problem-fix knowledge" };
  if (stableFact.test(text)) return { shouldSave: true, type: "stable-fact", reason: "Detected stable preference/constraint" };
  if (procedure.test(text)) return { shouldSave: true, type: "procedure", reason: "Detected reusable procedure" };
  if (noisy.test(text)) return { shouldSave: false, type: "noise", reason: "Detected temporary/noisy content" };

  return { shouldSave: false, type: "noise", reason: "No high-signal pattern detected" };
}

function normalizeResults(payload: unknown): MemoryResult[] {
  const parsed = asRecord(payload);
  const list = parsed?.results || parsed?.memories || parsed?.data || [];
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const row = asRecord(item);
      return {
        id: String(row?.id || row?.memory_id || ""),
        content: String(row?.memory || row?.content || row?.text || row?.summary || row?.chunk || "").trim(),
        score: typeof row?.score === "number" ? row.score : typeof row?.similarity === "number" ? row.similarity : undefined,
        metadata: asRecord(row?.metadata) || undefined,
      };
    })
    .filter((item: { id: string; content: string }) => item.id && item.content);
}

let mem0BreakerFailures = 0;
let mem0BreakerOpenUntil = 0;
let mem0BreakerOpenCount = 0;

function timeoutForRequest(path: string, init: RequestInit): number {
  const method = String(init.method || "GET").toUpperCase();
  if (path === "/search" && method === "POST") {
    return MEM0_READ_TIMEOUT_MS;
  }
  if (method === "GET") {
    return MEM0_READ_TIMEOUT_MS;
  }
  return MEM0_WRITE_TIMEOUT_MS;
}

async function mem0Request(path: string, init: RequestInit): Promise<unknown> {
  if (!MEM0_SERVER_URL) {
    throw new Error("MEM0_SERVER_URL is not set");
  }

  if (Date.now() < mem0BreakerOpenUntil) {
    throw new Error(`mem0 circuit breaker open until ${new Date(mem0BreakerOpenUntil).toISOString()}`);
  }

  let lastError: Error | null = null;
  let lastTimeoutMs = MEM0_READ_TIMEOUT_MS;

  for (let attempt = 1; attempt <= MEM0_API_MAX_ATTEMPTS; attempt += 1) {
    const timeoutMs = timeoutForRequest(path, init);
    lastTimeoutMs = timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${MEM0_SERVER_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });

      const bodyText = await response.text();
      const parsed: unknown = bodyText ? JSON.parse(bodyText) : null;
      const parsedObj = asRecord(parsed);

      if (!response.ok) {
        throw new Error(String(parsedObj?.detail || parsedObj?.error || `mem0 request failed (${response.status})`));
      }

      mem0BreakerFailures = 0;
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= MEM0_API_MAX_ATTEMPTS) {
        break;
      }

      await sleep(MEM0_API_RETRY_DELAY_MS * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  mem0BreakerFailures += 1;
  if (mem0BreakerFailures >= MEM0_BREAKER_THRESHOLD) {
    mem0BreakerOpenUntil = Date.now() + MEM0_BREAKER_COOLDOWN_MS;
    mem0BreakerFailures = 0;
    mem0BreakerOpenCount += 1;
  }

  throw new Error(
    `mem0 request failed after ${MEM0_API_MAX_ATTEMPTS} attempts (timeout=${lastTimeoutMs}ms): ${lastError?.message || "unknown error"}`
  );
}

async function searchScope(
  query: string,
  scope: Scope,
  directory: string,
  agent: string | undefined,
  limit = MAX_CONTEXT_ITEMS
): Promise<MemoryResult[]> {
  const ids = scopeIdentifiers(scope, directory, agent);
  const payload = await mem0Request("/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      ...ids,
      filters: { scope },
    }),
  });

  return normalizeResults(payload).slice(0, limit);
}

function asScope(value: unknown): Scope | undefined {
  if (value === "user" || value === "project" || value === "agent" || value === "environment") return value;
  return undefined;
}

function toCandidate(scope: Scope, row: MemoryResult): MemoryCandidate {
  const metadata = row.metadata || {};
  const metadataScope = asScope(metadata.scope);
  const createdAt = parseTimestamp(metadata.created_at || metadata.createdAt);
  const ttlExpiresAt = parseTimestamp(metadata.ttl_expires_at || metadata.ttlExpiresAt);
  const decayHalfLifeDays = typeof metadata.decay_half_life_days === "number"
    ? metadata.decay_half_life_days
    : typeof metadata.decayHalfLifeDays === "number"
      ? metadata.decayHalfLifeDays
      : undefined;
  const type = typeof metadata.type === "string" ? metadata.type : "unknown";
  const inject = metadata.inject !== false;
  const semantic = typeof row.score === "number" ? row.score : 0.5;

  return {
    ...row,
    scope: metadataScope || scope,
    type,
    fingerprint: typeof metadata.fingerprint === "string" ? metadata.fingerprint : contentFingerprint(row.content),
    createdAt,
    ttlExpiresAt,
    decayHalfLifeDays,
    inject,
    semantic,
    rankScore: 0,
  };
}

function rankCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
  return candidates
    .map((candidate) => {
      const recency = computeRecencyScore(candidate);
      const weighted = 0.6 * candidate.semantic + 0.2 * recency + 0.15 * typeWeight(candidate.type) + 0.05 * scopeBoost(candidate.scope);
      return {
        ...candidate,
        rankScore: weighted,
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore);
}

function updateLRU(list: string[], id: string): string[] {
  const filtered = list.filter((item) => item !== id);
  filtered.push(id);
  if (filtered.length <= MEM0_MAX_RECENT_IDS) return filtered;
  return filtered.slice(filtered.length - MEM0_MAX_RECENT_IDS);
}

const MEMORY_NUDGE = `[MEM0 MEMORY TRIGGER]
The user is asking you to remember something.
Use the \`mem0\` tool with \`mode: "add"\` and save only high-signal knowledge:
- decisions
- problems + fixes
- stable facts
- reusable procedures
Do NOT save raw conversations or temporary reasoning.`;

export const Mem0FunctionalPlugin: Plugin = async (ctx) => {
  const sessionState = new Map<string, SessionState>();
  const sessionDirectory = new Map<string, string>();
  const coldCompactionPending = new Set<string>();
  const metrics: PluginMetrics = {
    retrievalAttempts: 0,
    retrievalHits: 0,
    dedupeDrops: 0,
    budgetDrops: 0,
    breakerOpens: 0,
  };

  function getSessionState(sessionID: string): SessionState {
    const existing = sessionState.get(sessionID);
    if (existing) return existing;
    const created: SessionState = {
      turn: 0,
      lastInjectionTurn: 0,
      topicSignature: "",
      injectedMemoryIdsLRU: [],
      workingSet: [],
      lastGoodContextSnippet: "",
    };
    sessionState.set(sessionID, created);
    return created;
  }

  function setSessionDirectory(sessionID: string, directory?: string): void {
    if (!directory) return;
    sessionDirectory.set(sessionID, directory);
  }

  function getSessionDirectory(sessionID: string): string {
    return sessionDirectory.get(sessionID) || ctx.directory;
  }

  async function logInjection(message: string, extra?: JsonRecord): Promise<void> {
    if (!MEM0_LOG_INJECTION) return;
    try {
      await ctx.client.app.log({
        body: {
          service: "mem0-functional-plugin",
            level: "info",
            message,
            extra: {
              ...extra,
              metrics,
              breakerOpenCount: mem0BreakerOpenCount,
            },
          },
          query: { directory: ctx.directory },
      });
    } catch {
      return;
    }
  }

  async function detectSupersedes(content: string, type: string, scope: Scope, directory: string): Promise<string[]> {
    const related = await searchScope(content.slice(0, 220), scope, directory, undefined, 12);
    const supersedes: string[] = [];
    for (const row of related) {
      const existingType = typeof row.metadata?.type === "string" ? row.metadata.type : undefined;
      if (existingType && existingType !== type) continue;
      if (tokenSimilarity(content, row.content) >= MEM0_SUPERSEDES_THRESHOLD) {
        supersedes.push(row.id);
      }
    }
    return supersedes;
  }

  async function retrieveRankedCandidates(query: string, directory: string, agent?: string): Promise<MemoryCandidate[]> {
    metrics.retrievalAttempts += 1;
    const [userMemories, projectMemories, agentMemories, environmentMemories] = await Promise.all([
      searchScope(query, "user", directory, agent, MAX_CONTEXT_ITEMS),
      searchScope(query, "project", directory, agent, MAX_CONTEXT_ITEMS),
      searchScope(query, "agent", directory, agent, MAX_CONTEXT_ITEMS),
      searchScope(query, "environment", directory, agent, MAX_CONTEXT_ITEMS),
    ]);

    const candidates = [
      ...userMemories.map((row) => toCandidate("user", row)),
      ...projectMemories.map((row) => toCandidate("project", row)),
      ...agentMemories.map((row) => toCandidate("agent", row)),
      ...environmentMemories.map((row) => toCandidate("environment", row)),
    ].filter((candidate) => candidate.inject && candidate.type !== "noise" && candidate.content.length > 0);

    if (candidates.length > 0) {
      metrics.retrievalHits += 1;
    }

    return rankCandidates(candidates);
  }

  function buildContextText(candidates: MemoryCandidate[]): string {
    const grouped: Record<Scope, MemoryCandidate[]> = {
      user: [],
      project: [],
      agent: [],
      environment: [],
    };

    for (const candidate of candidates) {
      grouped[candidate.scope].push(candidate);
    }

    const sections = [
      { scope: "user" as const, title: "User Context" },
      { scope: "project" as const, title: "Project Context" },
      { scope: "agent" as const, title: "Agent Context" },
      { scope: "environment" as const, title: "Environment Context" },
    ]
      .map(({ scope, title }) => {
        const rows = grouped[scope];
        if (rows.length === 0) return "";
        const lines = rows.map((row) => `- [${row.type}] ${row.content}`);
        return `${title}:\n${lines.join("\n")}`;
      })
      .filter(Boolean);

    return `[MEM0 CONTEXT]\n${sections.join("\n\n")}`;
  }

  function selectForInjection(ranked: MemoryCandidate[], session: SessionState): MemoryCandidate[] {
    const selected: MemoryCandidate[] = [];
    const seenFingerprints = new Set<string>();
    let usedChars = "[MEM0 CONTEXT]\n".length;

    for (const candidate of ranked) {
      if (selected.length >= MAX_CONTEXT_ITEMS) {
        metrics.budgetDrops += 1;
        break;
      }
      if (session.injectedMemoryIdsLRU.includes(candidate.id)) {
        metrics.dedupeDrops += 1;
        continue;
      }
      if (seenFingerprints.has(candidate.fingerprint)) {
        metrics.dedupeDrops += 1;
        continue;
      }
      const nearDuplicate = selected.some((row) => tokenSimilarity(row.content, candidate.content) >= MEM0_SIMILARITY_DEDUPE_THRESHOLD);
      if (nearDuplicate) {
        metrics.dedupeDrops += 1;
        continue;
      }
      const nextCost = candidate.content.length + 40;
      if (usedChars + nextCost > MEM0_MAX_INJECT_CHARS) {
        metrics.budgetDrops += 1;
        continue;
      }

      usedChars += nextCost;
      seenFingerprints.add(candidate.fingerprint);
      selected.push(candidate);
    }

    return selected;
  }

  async function saveColdCompactionMemory(sessionID: string, messageID: string, directoryHint?: string): Promise<void> {
    if (!MEM0_SAVE_COLD_COMPACTION) return;

    try {
      const messageResult = await ctx.client.session.message({
        path: { id: sessionID, messageID },
        query: { directory: directoryHint || ctx.directory },
      });

      const data = asRecord(messageResult?.data);
      const summaryText = textFromParts(data?.parts);
      if (!summaryText) return;

      const boundedSummary = clampText(summaryText, Number.isFinite(MEM0_COLD_MAX_CHARS) ? MEM0_COLD_MAX_CHARS : 6000);
      const ids = scopeIdentifiers("project", directoryHint || ctx.directory, undefined);

      await mem0Request("/memories", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "assistant", content: `[Compaction Summary]\n${boundedSummary}` }],
          ...ids,
          metadata: {
            source: "opencode-plugin",
            scope: "project",
            type: "compaction-archive",
            tier: "long-term",
            cold_context: true,
            inject: false,
            session_id: sessionID,
            created_at: new Date().toISOString(),
            last_used_at: new Date().toISOString(),
            access_count: 0,
            fingerprint: contentFingerprint(boundedSummary),
            decay_half_life_days: deriveHalfLifeDays("compaction-archive"),
          },
        }),
      });

      await logInjection("cold compaction archived", {
        sessionID,
        summaryChars: boundedSummary.length,
        coldContext: true,
      });
    } catch {
      return;
    }
  }

  return {
    "chat.message": async (input, output) => {
      if (!MEM0_SERVER_URL) return;

      const activeDirectory = getSessionDirectory(input.sessionID);

      const textParts = output.parts.filter(
        (part): part is Part & { type: "text"; text: string } => part.type === "text" && typeof part.text === "string"
      );
      if (textParts.length === 0) return;

      const userMessage = textParts.map((part) => part.text).join("\n").trim();
      if (!userMessage) return;

      const state = getSessionState(input.sessionID);
      state.turn += 1;

      if (MEMORY_KEYWORD_PATTERN.test(removeCodeParts(userMessage))) {
        const nudgePart: Part = {
          id: createPartID("nudge"),
          sessionID: input.sessionID,
          messageID: output.message.id,
          type: "text",
          text: MEMORY_NUDGE,
          synthetic: true,
        };
        output.parts.push(nudgePart);
        await logInjection("memory nudge injected", {
          sessionID: input.sessionID,
          messageID: output.message.id,
          partID: nudgePart.id,
          text: MEM0_LOG_INJECTION_CONTENT ? preview(MEMORY_NUDGE) : undefined,
        });
      }

      const signature = topicSignature(userMessage);
      const recallIntent = RECALL_INTENT_PATTERN.test(removeCodeParts(userMessage));
      const firstTurn = state.turn === 1 && MEM0_AUTO_RETRIEVE_FIRST_TURN;
      const periodicRefresh = state.lastInjectionTurn > 0 && state.turn - state.lastInjectionTurn >= MEM0_REFRESH_EVERY_TURNS;
      const topicShift = shouldRefreshForTopicShift(state.topicSignature, signature);
      const shouldRetrieve = firstTurn || recallIntent || periodicRefresh || topicShift;

      state.topicSignature = signature;
      if (!shouldRetrieve) return;

      try {
        const ranked = await retrieveRankedCandidates(userMessage, activeDirectory, input.agent);
        const selected = selectForInjection(ranked, state);
        if (selected.length === 0) return;
        const contextText = buildContextText(selected);

        const contextPart: Part = {
          id: createPartID("context"),
          sessionID: input.sessionID,
          messageID: output.message.id,
          type: "text",
          text: contextText,
          synthetic: true,
        };
        output.parts.unshift(contextPart);

        state.lastInjectionTurn = state.turn;
        state.workingSet = selected;
        state.lastGoodContextSnippet = contextText;
        for (const memory of selected) {
          state.injectedMemoryIdsLRU = updateLRU(state.injectedMemoryIdsLRU, memory.id);
        }

        await logInjection("memory context injected", {
          sessionID: input.sessionID,
          messageID: output.message.id,
          partID: contextPart.id,
          reason: { firstTurn, recallIntent, periodicRefresh, topicShift },
          selected: selected.length,
          text: MEM0_LOG_INJECTION_CONTENT ? preview(contextPart.text) : undefined,
        });
      } catch (error) {
        if (state.lastGoodContextSnippet) {
          const fallbackPart: Part = {
            id: createPartID("fallback-context"),
            sessionID: input.sessionID,
            messageID: output.message.id,
            type: "text",
            text: `[MEM0 CONTEXT FALLBACK]\n${state.lastGoodContextSnippet}`,
            synthetic: true,
          };
          output.parts.unshift(fallbackPart);
          await logInjection("memory fallback context injected", {
            sessionID: input.sessionID,
            messageID: output.message.id,
            partID: fallbackPart.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        // WHY: Memory retrieval must degrade gracefully; chat flow should never fail
        // just because the memory server is unavailable.
        return;
      }
    },

    tool: {
      mem0: tool({
        description: "Persist and query high-signal memory via mem0 REST.",
        args: {
          mode: tool.schema.enum(["add", "search", "list", "forget", "help"]).optional(),
          content: tool.schema.string().optional(),
          query: tool.schema.string().optional(),
          scope: tool.schema.enum(["user", "project", "agent", "environment"]).optional(),
          type: tool.schema.enum(["decision", "problem-fix", "stable-fact", "procedure", "noise"]).optional(),
          memoryId: tool.schema.string().optional(),
          limit: tool.schema.number().optional(),
        },
        async execute(args: {
          mode?: "add" | "search" | "list" | "forget" | "help";
          content?: string;
          query?: string;
          scope?: Scope;
          type?: MemoryType;
          memoryId?: string;
          limit?: number;
        }, toolContext) {
          if (!MEM0_SERVER_URL) {
            return JSON.stringify({
              success: false,
              error: "MEM0_SERVER_URL is not set. Example: export MEM0_SERVER_URL=http://localhost:8000",
            });
          }

          const mode = args.mode || "help";
          const scope = args.scope || "project";
          const ids = scopeIdentifiers(scope, toolContext.directory, undefined);

          try {
        if (mode === "help") {
              return JSON.stringify({
                success: true,
                modes: ["add", "search", "list", "forget", "help"],
                scopes: ["user", "project", "agent", "environment"],
                note: "Only high-signal memories should be stored.",
              });
            }

            if (mode === "add") {
              setSessionDirectory(toolContext.sessionID, toolContext.directory);
              if (!args.content) {
                return JSON.stringify({ success: false, error: "content is required for add mode" });
              }

              if (isFullyPrivate(args.content)) {
                return JSON.stringify({ success: false, error: "Cannot store fully private content" });
              }

              const sanitized = stripPrivateContent(args.content);
              const quality = classifyHighSignal(sanitized, args.type);
              if (!quality.shouldSave) {
                return JSON.stringify({ success: true, skipped: true, reason: quality.reason });
              }

              const supersedes = await detectSupersedes(sanitized, quality.type, scope, toolContext.directory);

              const payload = await mem0Request("/memories", {
                method: "POST",
                body: JSON.stringify({
                  messages: [{ role: "user", content: sanitized }],
                  ...ids,
                  metadata: {
                    source: "opencode-plugin",
                    scope,
                    type: quality.type,
                    tier: "long-term",
                    project_id: resolveProjectID(toolContext.directory),
                    created_at: new Date().toISOString(),
                    last_used_at: new Date().toISOString(),
                    access_count: 0,
                    fingerprint: contentFingerprint(sanitized),
                    decay_half_life_days: deriveHalfLifeDays(quality.type),
                    inject: true,
                    supersedes,
                  },
                }),
              });

              const payloadData = asRecord(payload);
              return JSON.stringify({
                success: true,
                scope,
                type: quality.type,
                reason: quality.reason,
                id: payloadData?.id,
                identifiers: ids,
                project_id: resolveProjectID(toolContext.directory),
                supersedes,
              });
            }

            if (mode === "search") {
              setSessionDirectory(toolContext.sessionID, toolContext.directory);
              if (!args.query) {
                return JSON.stringify({ success: false, error: "query is required for search mode" });
              }

              const payload = await mem0Request("/search", {
                method: "POST",
                body: JSON.stringify({
                  query: args.query,
                  ...ids,
                  filters: { scope },
                }),
              });

              const results = normalizeResults(payload).slice(0, args.limit || 10);
              return JSON.stringify({
                success: true,
                scope,
                count: results.length,
                results,
              });
            }

            if (mode === "list") {
              setSessionDirectory(toolContext.sessionID, toolContext.directory);
              const query = new URLSearchParams();
              query.set("user_id", ids.user_id);
              query.set("agent_id", ids.agent_id);
              const payload = await mem0Request(`/memories?${query.toString()}`, { method: "GET" });

              const results = normalizeResults(payload).slice(0, args.limit || 20);
              return JSON.stringify({ success: true, scope, count: results.length, results });
            }

            if (mode === "forget") {
              setSessionDirectory(toolContext.sessionID, toolContext.directory);
              if (!args.memoryId) {
                return JSON.stringify({ success: false, error: "memoryId is required for forget mode" });
              }

              await mem0Request(`/memories/${encodeURIComponent(args.memoryId)}`, { method: "DELETE" });
              return JSON.stringify({ success: true, deleted: args.memoryId });
            }

            return JSON.stringify({ success: false, error: `Unknown mode: ${mode}` });
          } catch (error) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      }),
    },

    "experimental.session.compacting": async (_input, output) => {
      if (!MEM0_SERVER_URL) return;

      const activeDirectory = getSessionDirectory(_input.sessionID);

      if (MEM0_SAVE_COLD_COMPACTION) {
        coldCompactionPending.add(_input.sessionID);
      }

      try {
        const projectMemories = await searchScope(
          "recent decisions fixes constraints procedures",
          "project",
          activeDirectory,
          undefined,
          8
        );

        if (projectMemories.length === 0) return;

        // WHY: Compaction is where context is compressed; injecting only high-signal
        // project memory avoids losing durable decisions across long sessions.
        const memoryBlock = [
          "## Mem0 High-Signal Project Memory",
          ...projectMemories.map((m) => `- ${m.content}`),
          "Keep these durable facts in the continuation summary.",
        ].join("\n");

        if (MEM0_COMPACTION_MODE === "replace") {
          // WHY: Some teams want deterministic compaction output and prefer
          // owning the entire summary template. This mode is opt-in because
          // replacing defaults can remove useful built-in continuity guidance.
          output.prompt = [
            "You are generating a continuation summary for an OpenCode session.",
            "Preserve only durable, actionable context.",
            "",
            "Required sections:",
            "1) Final Goal",
            "2) Completed Work",
            "3) Remaining Tasks",
            "4) Critical Constraints",
            "5) High-Signal Memory to Carry Forward",
            "",
            memoryBlock,
          ].join("\n");
          return;
        }

        output.context.push(memoryBlock);
      } catch {
        return;
      }
    },

    event: async ({ event }) => {
      if (!MEM0_SERVER_URL) return;

      if (event.type === "message.updated" && MEM0_SAVE_COLD_COMPACTION) {
        // WHY: OpenCode emits `message.updated` for many message states, but only
        // summary assistant messages (`summary=true` and finished) represent the
        // compaction output we want to archive as cold context.
        const props = asRecord(event.properties);
        const info = asRecord(props?.info);
        const sessionID = typeof info?.sessionID === "string" ? info.sessionID : undefined;
        const messageID = typeof info?.id === "string" ? info.id : undefined;
        const role = info?.role;
        const summary = info?.summary;
        const finish = info?.finish;
        const pathInfo = asRecord(info?.path);
        const directoryHint = typeof pathInfo?.cwd === "string" ? pathInfo.cwd : undefined;

        if (sessionID) {
          setSessionDirectory(sessionID, directoryHint);
        }

        if (
          sessionID &&
          messageID &&
          coldCompactionPending.has(sessionID) &&
          role === "assistant" &&
          summary === true &&
          Boolean(finish)
        ) {
          // WHY: We remove the session from the pending set before the write to
          // enforce at-most-once archival per compaction cycle.
          coldCompactionPending.delete(sessionID);
          await saveColdCompactionMemory(sessionID, messageID, directoryHint);
        }
      }

      if (event.type === "session.deleted") {
        // WHY: Prevent unbounded growth in session tracking.
        const props = asRecord(event.properties);
        const sessionInfo = asRecord(props?.info);
        const sessionID = typeof sessionInfo?.id === "string" ? sessionInfo.id : undefined;
        if (sessionID) {
          sessionState.delete(sessionID);
          sessionDirectory.delete(sessionID);
          coldCompactionPending.delete(sessionID);
        }
      }
    },
  };
};
