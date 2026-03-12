---
name: typescript-reviewer
description: "Review TypeScript code against Chatlayer team conventions and TypeScript best practices. Use when: (1) reviewing TypeScript code changes, (2) checking TS PRs/MRs, (3) validating TS patterns, (4) ensuring Node.js/Fastify idioms. Triggers: 'review typescript', 'ts code review', 'check ts code', 'typescript patterns', 'review *.ts'."
compatibility: opencode
---

# TypeScript Code Reviewer

Review TypeScript code against Chatlayer team conventions derived from actual codebase patterns in bot-engine, dialogstates, and shared packages.

## Quick Review Checklist

### Project Configuration

| Pattern                 | Correct                | Incorrect                       |
| ----------------------- | ---------------------- | ------------------------------- |
| Module system (backend) | `CommonJS`             | `ESNext` (for Node.js services) |
| Target (backend)        | `ES2022`               | `ES5` (too old for Node 22)     |
| Import style            | Relative paths         | Path aliases `@/*` (for now)    |
| Strict mode             | Enabled in base config | `strict: false`                 |

### Import Organization

```typescript
// CORRECT: Grouped with relative paths
import { FastifyInstance } from "fastify";

import { Chatlayer } from "@chatlayer/core";
import { log } from "@chatlayer/logger";

import { config } from "../config";
import { createApp } from "./app";

// INCORRECT: Mixed grouping, unordered
import { config } from "../config";
import { FastifyInstance } from "fastify";
import { log } from "@chatlayer/logger";
```

### Error Handling

```typescript
// CORRECT: Typed ApplicationError
throw new ApplicationError(
  {
    code: ErrorCode.BOT_NOT_FOUND,
    params: { id: botId },
  },
  "Bot not found",
);

// INCORRECT: Generic Error
throw new Error("Bot not found");

// CORRECT: Error handler mapping
const statusCodeMap: Partial<Record<ErrorCode, StatusCodes>> = {
  [ErrorCode.AUTHENTICATION]: StatusCodes.UNAUTHORIZED,
  [ErrorCode.BOT_NOT_FOUND]: StatusCodes.NOT_FOUND,
};
```

### Logging

```typescript
// CORRECT: Named logger with context
import { logManager } from "../logManager";
const log = logManager.getLogger("root.engine");

log.info({ botId, sessionId }, "Processing message");
log.error({ err, context }, "Operation failed");

// INCORRECT: Console or unnamed logger
console.log("Processing message");
log.info("Processing message for bot " + botId);
```

## Review Categories

### 1. Type Safety

- [ ] No `as any` type assertions (use proper types or generics)
- [ ] No `@ts-ignore` or `@ts-expect-error` without justification
- [ ] Proper interface definitions for API responses
- [ ] Zod/Joi schemas for runtime validation
- [ ] Generic types for reusable components

### 2. Error Handling

- [ ] Custom `ApplicationError` with typed `ErrorCode` enum
- [ ] Error codes mapped to HTTP status in error handler
- [ ] Sentry integration with context (tags, extras)
- [ ] Try/catch with proper logging before rethrowing
- [ ] No empty catch blocks

### 3. Logging & Observability

- [ ] Using `@chatlayer/logger` (Pino-based)
- [ ] Named loggers: `logManager.getLogger('root.module')`
- [ ] Structured logging: `log.info({ data }, 'message')`
- [ ] Redaction paths for sensitive data (Authorization, API keys)
- [ ] Tracer wrapping for key functions: `tracer.wrap('span.name', fn)`

### 4. Fastify Patterns

- [ ] Factory function: `export const createApp = async () => {}`
- [ ] Plugin registration order: sensible, helmet, cors, custom
- [ ] Error handler registered: `app.setErrorHandler(errorHandler)`
- [ ] Health check at root: `app.get('/', healthCheck)`
- [ ] Request decoration for extensions

### 5. Validation

- [ ] Joi for API request schemas with `stripUnknown: true`
- [ ] Zod for type-safe runtime validation
- [ ] Validation errors throw `httpErrors.BadRequest`
- [ ] Schema type inference: `z.infer<typeof Schema>`

### 6. Testing

- [ ] Vitest (not Jest) for newer services
- [ ] Test files: `*.spec.ts` in `__tests__/` or alongside source
- [ ] Setup file: `setupTestFramework.ts` with lifecycle hooks
- [ ] Mocking: `vi.fn()`, `vi.mock()`, `vi.spyOn()`
- [ ] HTTP mocking: `nock` with `nock.cleanAll()` cleanup

## Anti-Patterns to Flag

### Critical (Block MR)

```typescript
// FORBIDDEN: Type suppression
const data = response as any;
// @ts-ignore
unsafeOperation();

// FORBIDDEN: Unhandled promise
dangerousAsyncOperation(); // Missing await or .catch()

// FORBIDDEN: Secrets in code
const apiKey = "sk-live-xxx"; // Use env vars
```

### High Priority

```typescript
// BAD: Empty catch
try {
  await operation();
} catch (e) {
  // Silent failure
}

// BAD: console.log in production
console.log('Debug:', data);

// BAD: Magic strings
if (status === 'AUTHENTICATION') {  // Use ErrorCode enum
```

### Medium Priority

```typescript
// PREFER: Destructuring
const { botId, version } = req.params;
// OVER
const botId = req.params.botId;
const version = req.params.version;

// PREFER: Optional chaining
const name = user?.profile?.name ?? 'Anonymous';
// OVER
const name = user && user.profile && user.profile.name || 'Anonymous';

// PREFER: Async/await
const data = await fetchData();
// OVER
fetchData().then(data => { ... });
```

## Comment Format

```
(AI assisted) **[Category]**: Issue description.

**Current**:
`problematic_code()`

**Suggested**:
`improved_code()`

**Why**: Brief explanation of the improvement.
```

Categories: `Type Safety`, `Error Handling`, `Logging`, `Performance`, `Testing`, `Style`, `Security`

## Reference Files

For detailed patterns, see:

- [PATTERNS.md](references/PATTERNS.md) - Complete code patterns with examples
- [TESTING.md](references/TESTING.md) - Testing conventions and examples
