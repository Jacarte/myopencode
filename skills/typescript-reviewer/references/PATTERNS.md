# TypeScript Code Patterns

Complete reference of TypeScript patterns used in backend services and shared packages.

## 1. Project Structure

### Service Layout (example backend service)

```
services/example-service/
├── src/
│   ├── __generated__/          # GraphQL generated types
│   ├── __tests__/              # Test files
│   ├── channels/               # Feature modules
│   ├── core/
│   │   └── errors.ts           # ApplicationError definitions
│   ├── engine/
│   ├── modules/
│   │   └── api/
│   ├── plugins/
│   ├── services/
│   ├── utils/
│   │   ├── errorHandler.ts     # Fastify error handler
│   │   └── handleError.ts      # Sentry integration
│   ├── app.ts                  # Fastify app factory
│   ├── config.ts               # Environment configuration
│   ├── index.ts                # Entry point
│   ├── logManager.ts           # Logger setup
│   └── tracing.ts              # DataDog tracer init
├── dist/                       # Compiled output
├── tsconfig.json
├── tsconfig.production.json
├── vitest.config.ts
└── package.json
```

### Package Layout (shared packages)

```
packages/core/
├── src/
│   ├── client/                 # Main exports
│   ├── models/                 # Data models
│   ├── util/                   # Utilities
│   └── index.ts                # Barrel export
├── dist/
├── tsconfig.json
└── package.json
```

## 2. TypeScript Configuration

### Backend Service (tsconfig.json)

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "./"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Production Config (tsconfig.production.json)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  }
}
```

## 3. Error Handling

### Custom Error Class

```typescript
// src/core/errors.ts
export enum ErrorCode {
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  BOT_NOT_FOUND = "BOT_NOT_FOUND",
  CHANNEL_NOT_FOUND = "CHANNEL_NOT_FOUND",
  VALIDATION = "VALIDATION",
  EXECUTOR_INFINITE_LOOP = "EXECUTOR_INFINITE_LOOP",
}

interface BaseErrorParams<C extends ErrorCode, P = undefined> {
  code: C;
  params: P;
}

export type BotNotFoundErrorParams = BaseErrorParams<
  ErrorCode.BOT_NOT_FOUND,
  { id: string }
>;

export type ErrorParams =
  | BaseErrorParams<ErrorCode.AUTHENTICATION>
  | BaseErrorParams<ErrorCode.AUTHORIZATION>
  | BotNotFoundErrorParams
  | BaseErrorParams<ErrorCode.VALIDATION, { message: string }>;

export class ApplicationError extends Error {
  constructor(
    public error: ErrorParams,
    message?: string,
  ) {
    super(error.code + (message ? `: ${message}` : ""));
  }
}
```

### Fastify Error Handler

```typescript
// src/utils/errorHandler.ts
import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { ApplicationError, ErrorCode } from "../core/errors";
import logger from "@org/logger";

export const errorHandler = async (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  logger.error("[errorHandler]: " + JSON.stringify(error));

  if (error instanceof ApplicationError) {
    const statusCodeMap: Partial<Record<ErrorCode, StatusCodes>> = {
      [ErrorCode.AUTHENTICATION]: StatusCodes.UNAUTHORIZED,
      [ErrorCode.AUTHORIZATION]: StatusCodes.FORBIDDEN,
      [ErrorCode.BOT_NOT_FOUND]: StatusCodes.NOT_FOUND,
      [ErrorCode.CHANNEL_NOT_FOUND]: StatusCodes.NOT_FOUND,
      [ErrorCode.VALIDATION]: StatusCodes.BAD_REQUEST,
    };

    const statusCode =
      statusCodeMap[error.error.code] ?? StatusCodes.BAD_REQUEST;
    await reply.status(statusCode).send({
      code: error.error.code,
      params: error.error.params,
    });
    return;
  }

  if (
    !error.statusCode ||
    error.statusCode === StatusCodes.INTERNAL_SERVER_ERROR
  ) {
    // Report to Sentry
  }
  await reply
    .status(error.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR)
    .send(error);
};
```

### Sentry Integration

```typescript
// src/utils/handleError.ts
import * as Sentry from "@sentry/node";
import { logManager } from "../logManager";

const log = logManager.getLogger("root");

const handleError = (error: any) => {
  if (config.NODE_ENV === "test") return;
  if (error.request) Sentry.setExtra("request", error.request);
  if (error.response) Sentry.setExtra("response", error.response);
  log.error({ err: error });
  Sentry.captureException(error);
};

export default handleError;
```

### Error with Sentry Scope

```typescript
try {
  await operation();
} catch (ex) {
  log.error({ err: ex });
  Sentry.configureScope((scope) =>
    scope.setTag("conversationId", id).setExtra("Message", item),
  );
  Sentry.captureException(ex);
  throw ex;
}
```

## 4. Logging

### Logger Setup

```typescript
// src/logManager.ts
import logger, { logManager } from "@org/logger";

const REDACTION_PATHS = [
  "outcome.error.cause.config.headers.Authorization",
  "outcome.error.response.req.headers.Authorization",
  "variables.options.body.apikey",
];

const log = logger.child({}, { redact: REDACTION_PATHS });

export { log, logManager };
export default log;
```

### Usage Patterns

```typescript
// Named logger
import { logManager } from "./logManager";
const log = logManager.getLogger("root.engine");

// Basic logging
log.debug({ incomingMessage: message }, "handling incoming message");
log.info({ botId, sessionId }, "session started");
log.warn({ botId, version }, "bot not found");
log.error({ err, botId, version }, "failed to process");

// With child context
const childLog = log.child({ context: { botId: "8" } });
childLog.info("message"); // Output: [bot:8] message
```

## 5. Tracing (DataDog)

### Tracer Initialization

```typescript
// src/tracing.ts
import tracer from "@org/tracer";
import config from "./config";

tracer.init({
  env: config.ENVIRONMENT,
  version: process.env.RELEASE_TAG,
  service: "example-service",
  startupLogs: true,
  logInjection: true,
  logLevel: "error",
  runtimeMetrics: true,
  dogstatsd: {
    hostname: config.STATSD_HOST,
    port: parseInt(config.STATSD_PORT),
  },
  experimental: { b3: true },
  ingestion: { sampleRate: 1.0 },
});

// Disable noisy tracing
tracer.use("jest", false);
tracer.use("dns", false);
tracer.use("http", {
  blocklist: ["/", "/metrics", /sentry\.io/, /cdn-eu\.configcat\.com/],
});

tracer.use("mongodb-core", {
  queryInResourceName: true,
});
```

### Function Wrapping

```typescript
// Wrap async functions for tracing
const processMessage = tracer.wrap(
  "engine.processMessage",
  async (message: Message) => {
    // implementation
  },
);

// Add tags to active span
tracer.scope().active()?.addTags({
  version,
  botId,
  sessionId,
  channelType: message.channelType,
});
```

## 6. Fastify Application

### App Factory

```typescript
// src/app.ts
import Fastify, { FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import formbody from "@fastify/formbody";
import { errorHandler } from "./utils/errorHandler";
import routes from "./routes";

export const createFastifyApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });

  // Register plugins
  await app.register(sensible);
  await app.register(helmet);
  await app.register(cors, { origin: true });
  await app.register(multipart);
  await app.register(formbody);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get("/", async () => ({ status: "ok" }));

  // Routes
  await app.register(routes, { prefix: "/api/v1" });

  return app;
};
```

### Entry Point

```typescript
// src/index.ts
import "./tracing"; // Must be first
import { createFastifyApp } from "./app";
import config from "./config";
import log from "./logManager";

const start = async () => {
  const app = await createFastifyApp();

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    log.info(`Server running on port ${config.PORT}`);
  } catch (err) {
    log.error({ err }, "Failed to start server");
    process.exit(1);
  }
};

start();
```

## 7. Configuration

### Config Pattern

```typescript
// src/config.ts
const parseBoolean = (value: string | undefined): boolean => {
  return value === "true" || value === "1";
};

const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  ENVIRONMENT: process.env.ENVIRONMENT || "local",

  // MongoDB
  MONGODB_URL: process.env.MONGODB_URL || "mongodb://localhost:27017/chatlayer",

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10),

  // Feature flags
  FEATURE_ENABLED: parseBoolean(process.env.FEATURE_ENABLED),

  // Observability
  STATSD_HOST: process.env.STATSD_HOST || "localhost",
  STATSD_PORT: process.env.STATSD_PORT || "8125",
  SENTRY_DSN: process.env.SENTRY_DSN,
};

export default config;
```

## 8. Validation

### Joi Schema

```typescript
import Joi from "@hapi/joi";

const buttonPayloadSchema = Joi.object<ButtonPayload>({
  nextDialogstateId: Joi.string().required(),
  sessionDataToSet: Joi.array()
    .items(
      Joi.object({
        key: Joi.string().required(),
        value: Joi.any().required(),
      }),
    )
    .required(),
});

// Validation helper
export const validateRequest = <T>(
  objectSchema: Required<Joi.SchemaMap<T>>,
  object: any,
) => {
  const schema = Joi.object(objectSchema).required();
  const { value, error } = schema.validate(object, {
    stripUnknown: true,
    abortEarly: false,
  });
  if (error) {
    throw new httpErrors.BadRequest(error.message);
  }
  return value;
};
```

### Zod Schema

```typescript
import { z } from "zod";

const IncomingTextMessageSchema = z.object({
  text: z.string(),
});

const IncomingLocationMessageSchema = z.object({
  coordinates: z.object({
    lat: z.number().optional(),
    long: z.number().optional(),
  }),
});

const IncomingWebhookMessageSchema = z.union([
  z.object({
    type: z.literal("text"),
    textMessage: IncomingTextMessageSchema,
  }),
  z.object({
    type: z.literal("location"),
    locationMessage: IncomingLocationMessageSchema,
  }),
]);

// Type inference
export type IncomingWebhookMessage = z.infer<
  typeof IncomingWebhookMessageSchema
>;
```

## 9. Import Organization

### Standard Order

```typescript
// 1. Node.js built-ins
import path from "path";
import fs from "fs";

// 2. External packages
import { FastifyInstance } from "fastify";
import Joi from "@hapi/joi";
import * as Sentry from "@sentry/node";

// 3. Internal packages (@org/*)
import { AppClient } from "@org/core";
import logger from "@org/logger";
import tracer from "@org/tracer";

// 4. Local imports (relative paths)
import config from "./config";
import { ApplicationError, ErrorCode } from "./core/errors";
import { createApp } from "./app";
import { processMessage } from "./engine/processor";
```

## 10. Common Patterns

### Async Error Handling

```typescript
// With .catch() for fire-and-forget
markAsRead(channel, message.sender).catch(handleError);

// With try/catch for recoverable errors
try {
  const result = await riskyOperation();
  return result;
} catch (err) {
  log.error({ err }, "Operation failed, using fallback");
  return fallbackValue;
}

// With finally for cleanup
let startTime = Date.now();
try {
  return await operation();
} finally {
  metrics.timing("operation.duration", Date.now() - startTime);
}
```

### Optional Chaining & Nullish Coalescing

```typescript
// Preferred
const name = user?.profile?.name ?? "Anonymous";
const port = config.PORT ?? 3000;

// Avoid
const name = (user && user.profile && user.profile.name) || "Anonymous";
const port = config.PORT || 3000; // 0 would be falsy
```

### Destructuring

```typescript
// Preferred
const { botId, version, sessionId } = req.params;
const { data, errors } = await graphqlClient.query({ ... });

// Avoid
const botId = req.params.botId;
const version = req.params.version;
```

### Type Guards

```typescript
function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

function hasProperty<K extends string>(
  obj: unknown,
  key: K,
): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && key in obj;
}
```
