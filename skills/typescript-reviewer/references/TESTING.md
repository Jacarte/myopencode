# TypeScript Testing Conventions - Chatlayer

Complete reference for testing patterns in Chatlayer TypeScript services.

## 1. Testing Frameworks

### Vitest (Primary - Modern Services)

Used in: bot-engine, dialogstates, app-integrations, webchat, storage, channels

```bash
# Run tests
yarn test

# CI mode with coverage
yarn test-ci

# With memory optimization
NODE_OPTIONS='--max_old_space_size=8192' vitest
```

### Jest (Legacy - Older Packages)

Used in: events, app-platform, response-maker, fastify-oidc

```bash
yarn test
```

## 2. Configuration

### Vitest Config (vitest.config.ts)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
  test: {
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    globals: true,
    environment: "node",
    reporters: ["default", "junit"],
    outputFile: { junit: "./test-results/junit.xml" },
    testTimeout: 5000, // 10000 for services with Docker deps
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.spec.ts",
        "src/**/__tests__/*",
        "src/__generated__/*",
      ],
      reporter: ["cobertura", "lcov"],
      reportsDirectory: "./test-results/coverage",
    },
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
```

### Jest Config (jest.config.js)

```javascript
module.exports = {
  testEnvironment: "node",
  transform: {
    ".(ts|tsx)$": require.resolve("ts-jest/dist"),
  },
  testMatch: ["<rootDir>/**/*.(spec|test).{ts,tsx,js,jsx}"],
  collectCoverageFrom: ["src/**/*.{ts,tsx,js,jsx}"],
};
```

## 3. Test File Organization

### Naming Conventions

- Unit/integration tests: `*.spec.ts` (preferred)
- Alternative: `*.test.ts`
- Seed files: `*.seed.ts`

### Directory Structure

```
services/bot-engine/src/
├── channels/
│   └── common/
│       ├── transformers.ts
│       └── __tests__/
│           ├── transformers.spec.ts
│           └── sendMessages.spec.ts
├── test/
│   ├── jest.globalSetup.ts
│   ├── setupTestFramework.ts
│   ├── fixtures/
│   │   ├── bot.ts
│   │   └── index.ts
│   └── helpers/
│       └── sessions.ts
```

## 4. Test Setup

### Global Setup (jest.globalSetup.ts)

```typescript
import "dotenv-flow/config";
import config from "../config";

export default async () => {
  console.log("Running tests with config:\n", config);
  return;
};
```

### Framework Setup (setupTestFramework.ts)

```typescript
import mongoose from "mongoose";
import nock from "nock";
import { createModels } from "../models";
import { createLoaders } from "../loaders";

export interface TestContext {
  models: ReturnType<typeof createModels>;
  loaders: ReturnType<typeof createLoaders>;
  connection: mongoose.Connection;
}

export const setupTestFramework = (seedFunction?: SeedFunction) => {
  const ctx: TestContext = {} as TestContext;

  beforeAll(async () => {
    // Mock external services
    nock(process.env.OPA_AUTHZ_MANAGEMENT_URL)
      .persist()
      .post("/v1/authorize")
      .reply(200, { result: { authorized: true } });

    // Connect to test database
    ctx.connection = await mongoose
      .createConnection(process.env.MONGODB_URL, { maxPoolSize: 20 })
      .asPromise();

    ctx.models = createModels({ mongoConnection: ctx.connection });
    ctx.loaders = createLoaders({ models: ctx.models });
  }, 10000);

  afterAll(async () => {
    await ctx.connection?.close(true);
    nock.cleanAll();
  }, 5000);

  beforeEach(async () => {
    // Clear collections
    await Promise.all([
      ctx.models.bot.deleteMany({}),
      ctx.models.conversation.deleteMany({}),
      ctx.models.message.deleteMany({}),
    ]);

    // Run seed function
    if (seedFunction) {
      await seedFunction(ctx.models);
    }
  }, 5000);

  return ctx;
};
```

## 5. Test Patterns

### Basic Test Structure (AAA Pattern)

```typescript
describe("Feature", () => {
  const ctx = setupTestFramework();

  describe("when condition", () => {
    it("should do something", async () => {
      // Arrange
      const input = { botId: "8", message: "hello" };

      // Act
      const result = await processMessage(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.response).toBe("Hello!");
    });
  });
});
```

### Table-Driven Tests

```typescript
describe("transformer", () => {
  const cases = [
    { input: "hello", expected: "HELLO", name: "uppercase" },
    { input: "WORLD", expected: "WORLD", name: "already uppercase" },
    { input: "", expected: "", name: "empty string" },
  ];

  it.each(cases)("should handle $name", async ({ input, expected }) => {
    const result = transform(input);
    expect(result).toBe(expected);
  });
});
```

## 6. Mocking Patterns

### Function Mocking (vi.fn)

```typescript
import { vi } from "vitest";

// Basic mock
const mockFn = vi.fn();
const mockFnWithReturn = vi.fn().mockReturnValue("result");
const mockAsyncFn = vi.fn().mockResolvedValue({ data: "test" });

// Assertions
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledTimes(1);
expect(mockFn).toHaveBeenCalledWith("arg1", "arg2");
expect(mockFn).toHaveBeenCalledOnce();
```

### Module Mocking (vi.mock)

```typescript
// Must be at top of file, hoisted automatically
vi.mock("@chatlayer/azure-openai", () => ({
  createAzureChatOpenAI: vi.fn(),
  isEnvironmentReady: vi.fn(() => true),
}));

// Access mocked module
import { createAzureChatOpenAI } from "@chatlayer/azure-openai";
const mocked = vi.mocked(createAzureChatOpenAI);
mocked.mockReturnValue(mockInstance);
```

### Spying (vi.spyOn)

```typescript
import * as module from "./module";

const spy = vi.spyOn(module, "functionName");
spy.mockResolvedValue(result);
spy.mockImplementation(async () => customResult);

// Restore original
spy.mockRestore();
```

### HTTP Mocking (nock)

```typescript
import nock from "nock";

beforeAll(() => {
  // Mock external API
  nock("https://api.example.com")
    .persist()
    .get("/users/123")
    .reply(200, { id: "123", name: "Test" });

  nock("https://api.example.com")
    .post("/users", { name: "New User" })
    .reply(201, { id: "456", name: "New User" });
});

afterAll(() => {
  nock.cleanAll();
});
```

## 7. Test Data

### Fixtures

```typescript
// test/fixtures/bot.ts
export const botConfig = {
  id: "8",
  defaultLanguage: "en",
  name: "Test Bot",
  settings: {
    llmEntityRecognitionEnabled: true,
  },
};

// test/fixtures/index.ts
export * from "./bot";
export * from "./templates";
```

### Seed Functions

```typescript
// modules/flow/__tests__/flows.seed.ts
import { faker } from "@faker-js/faker";
import { Models } from "../../../models";

export const flows = {
  flow1: { id: faker.string.uuid(), name: faker.lorem.word() },
  flow2: { id: faker.string.uuid(), name: faker.lorem.word() },
};

export const seed: SeedFunction = async (models: Models) => {
  // Clear existing data
  await models.bot.deleteMany({});
  await models.flow.deleteMany({});

  // Create test data
  const bot = await models.bot.create({
    id: "8",
    name: "Test Bot",
  });

  await models.flow.create({
    id: flows.flow1.id,
    name: flows.flow1.name,
    botId: bot.id,
  });
};
```

### Test Helpers

```typescript
// test/helpers/sessions.ts
import { faker } from "@faker-js/faker";
import fp from "lodash/fp";

export const generateMockSession = (
  sessionStore: SessionStore,
  idOverrides = {},
  overrides = {},
) => {
  const session: ChatSession = {
    id: faker.string.uuid(),
    botId: "8",
    language: "en",
    ...idOverrides,
  };

  return sessionStore.upsertSession(
    { botId: session.botId, id: session.id },
    fp.merge(session, overrides),
  );
};
```

## 8. Integration Tests

### Docker Dependencies

```yaml
# test-scripts/docker-compose.yml
services:
  mongodb:
    image: mongo:8.0.17
    ports: ["27222:27017"]
    entrypoint: ["/usr/bin/mongod", "--bind_ip_all", "--replSet", "rs0"]
  redis:
    image: redis
    ports: ["${REDIS_PORT}:6379"]
  opa:
    image: openpolicyagent/opa:0.59.0-static
    ports: ["127.0.0.1:${OPA_PORT}:8181"]
  clickhouse:
    image: clickhouse/clickhouse-server:25.3
    ports: ["29000:9000", "28123:8123"]
```

### Test Scripts

```bash
# Start containers
yarn test:up

# Run tests
yarn test

# Stop containers
yarn test:down

# All-in-one
yarn test:run-once
```

### GraphQL Integration Tests

```typescript
import { createGraphQLTestClient } from "./testUtils";

describe("Flows API", () => {
  const ctx = setupTestFramework(seed);

  it("should return flows", async () => {
    const { data, errors } = await ctx.apolloTestClient.query({
      query: GET_FLOWS,
      variables: { version: "DRAFT", botId: "8" },
    });

    expect(errors).toBeUndefined();
    expect(data.botById.flows).toEqual([
      { name: flows.flow1.name, id: flows.flow1.id },
    ]);
  });
});
```

### Fastify API Tests

```typescript
import { createFastifyApp } from "../app";

describe("API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createFastifyApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return apps", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/apps",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().apps).toHaveLength(0);
  });
});
```

## 9. Assertions Reference

### Equality

```typescript
expect(result).toBe(value); // Strict equality
expect(result).toEqual(expectedObject); // Deep equality
expect(result).toStrictEqual(expected); // Deep + type equality
```

### Truthiness

```typescript
expect(result).toBeDefined();
expect(result).toBeUndefined();
expect(result).toBeNull();
expect(result).toBeTruthy();
expect(result).toBeFalsy();
```

### Numbers

```typescript
expect(value).toBeGreaterThan(3);
expect(value).toBeGreaterThanOrEqual(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(0.3, 5); // Floating point
```

### Strings

```typescript
expect(text).toMatch(/pattern/);
expect(text).toContain("substring");
expect(text).toHaveLength(5);
```

### Arrays

```typescript
expect(array).toContain(item);
expect(array).toContainEqual({ id: "1" }); // Deep equality
expect(array).toHaveLength(3);
expect(array).toEqual(expect.arrayContaining([item1, item2]));
```

### Objects

```typescript
expect(obj).toHaveProperty("key");
expect(obj).toHaveProperty("key", value);
expect(obj).toMatchObject({ key: value });
expect(obj).toEqual(expect.objectContaining({ key: value }));
```

### Errors

```typescript
expect(() => fn()).toThrow();
expect(() => fn()).toThrow(Error);
expect(() => fn()).toThrow("message");
expect(promise).rejects.toThrow();
```

### Async

```typescript
await expect(promise).resolves.toEqual(value);
await expect(promise).rejects.toThrow();
```

## 10. Best Practices

### Test Isolation

```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Clear mock call history
  vi.resetModules(); // Reset module cache
});

afterEach(() => {
  vi.restoreAllMocks(); // Restore original implementations
});
```

### Timeout Management

```typescript
// Service-level timeout
test: {
  testTimeout: 10000, // For services with Docker deps
}

// Per-test timeout
it('slow test', async () => {
  // ...
}, 15000);
```

### Coverage Exclusions

```typescript
coverage: {
  exclude: [
    'src/**/*.spec.ts',
    'src/**/__tests__/*',
    'src/__generated__/*',
    'src/**/*.stories.ts',
  ],
}
```

### Cleanup

```typescript
afterAll(async () => {
  // Close database connections
  await mongoose.connection.close(true);

  // Close other clients
  if (ctx.clients.chClient) {
    await ctx.clients.chClient.close();
  }

  // Clear HTTP mocks
  nock.cleanAll();

  // Clear Prometheus metrics
  client.register.clear();
});
```
