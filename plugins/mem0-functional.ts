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
const REQUEST_TIMEOUT_MS = 8_000;
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

async function mem0Request(path: string, init: RequestInit): Promise<unknown> {
  if (!MEM0_SERVER_URL) {
    throw new Error("MEM0_SERVER_URL is not set");
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MEM0_API_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

  throw new Error(`mem0 request failed after ${MEM0_API_MAX_ATTEMPTS} attempts: ${lastError?.message || "unknown error"}`);
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

function formatContextSection(title: string, rows: Array<{ content: string; score?: number }>): string {
  if (rows.length === 0) return "";
  const lines = rows.map((row) => {
    const score = typeof row.score === "number" ? ` [${Math.round(row.score * 100)}%]` : "";
    return `- ${score} ${row.content}`.replace(/\s+/g, " ").trim();
  });
  return `\n${title}:\n${lines.join("\n")}`;
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
  const injectedSessions = new Set<string>();
  const coldCompactionPending = new Set<string>();

  async function logInjection(message: string, extra?: JsonRecord): Promise<void> {
    if (!MEM0_LOG_INJECTION) return;
    try {
      await ctx.client.app.log({
        body: {
          service: "mem0-functional-plugin",
          level: "info",
          message,
          extra,
        },
        query: { directory: ctx.directory },
      });
    } catch {
      return;
    }
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
            cold_context: true,
            inject: false,
            session_id: sessionID,
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

      const textParts = output.parts.filter(
        (part): part is Part & { type: "text"; text: string } => part.type === "text" && typeof part.text === "string"
      );
      if (textParts.length === 0) return;

      const userMessage = textParts.map((part) => part.text).join("\n").trim();
      if (!userMessage) return;

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

      if (injectedSessions.has(input.sessionID)) return;
      injectedSessions.add(input.sessionID);

      try {
        // WHY: First-turn injection restores durable memory context early,
        // so the agent does not need to rediscover established constraints.
        const [userMemories, projectMemories, agentMemories, environmentMemories] = await Promise.all([
          searchScope(userMessage, "user", ctx.directory, input.agent),
          searchScope(userMessage, "project", ctx.directory, input.agent),
          searchScope(userMessage, "agent", ctx.directory, input.agent),
          searchScope(userMessage, "environment", ctx.directory, input.agent),
        ]);

        const sections = [
          formatContextSection("User Context", userMemories),
          formatContextSection("Project Context", projectMemories),
          formatContextSection("Agent Context", agentMemories),
          formatContextSection("Environment Context", environmentMemories),
        ].filter(Boolean);

        if (sections.length === 0) return;

        const contextPart: Part = {
          id: createPartID("context"),
          sessionID: input.sessionID,
          messageID: output.message.id,
          type: "text",
          text: `[MEM0 CONTEXT]\n${sections.join("\n")}`,
          synthetic: true,
        };
        output.parts.unshift(contextPart);
        await logInjection("memory context injected", {
          sessionID: input.sessionID,
          messageID: output.message.id,
          partID: contextPart.id,
          sections: sections.length,
          memories: {
            user: userMemories.length,
            project: projectMemories.length,
            agent: agentMemories.length,
            environment: environmentMemories.length,
          },
          text: MEM0_LOG_INJECTION_CONTENT ? preview(contextPart.text) : undefined,
        });
      } catch {
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

              const payload = await mem0Request("/memories", {
                method: "POST",
                body: JSON.stringify({
                  messages: [{ role: "user", content: sanitized }],
                  ...ids,
                  metadata: {
                    source: "opencode-plugin",
                    scope,
                    type: quality.type,
                    project_id: resolveProjectID(toolContext.directory),
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
              });
            }

            if (mode === "search") {
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
              const query = new URLSearchParams();
              query.set("user_id", ids.user_id);
              query.set("agent_id", ids.agent_id);
              const payload = await mem0Request(`/memories?${query.toString()}`, { method: "GET" });

              const results = normalizeResults(payload).slice(0, args.limit || 20);
              return JSON.stringify({ success: true, scope, count: results.length, results });
            }

            if (mode === "forget") {
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

      if (MEM0_SAVE_COLD_COMPACTION) {
        coldCompactionPending.add(_input.sessionID);
      }

      try {
        const projectMemories = await searchScope(
          "recent decisions fixes constraints procedures",
          "project",
          ctx.directory,
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
          injectedSessions.delete(sessionID);
          coldCompactionPending.delete(sessionID);
        }
      }
    },
  };
};
