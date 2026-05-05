import test from "node:test";
import assert from "node:assert/strict";

import { __test__ } from "../plugins/mem0-functional.ts";

test("normalizeGitRepoIdentifier handles ssh and https remotes", () => {
  assert.equal(__test__.normalizeGitRepoIdentifier("git@github.com:acme/widgets.git"), "github.com/acme/widgets");
  assert.equal(__test__.normalizeGitRepoIdentifier("https://gitlab.com/acme/widgets.git"), "gitlab.com/acme/widgets");
});

test("mergeAnchorContexts preserves explicit file intent while filling git metadata", () => {
  const merged = __test__.mergeAnchorContexts(
    {
      type: "commit",
      repo: "github.com/acme/widgets",
      ref: "feature/anchors",
      commit_sha: "abc123def456",
    },
    {
      path: "plugins/mem0-functional.ts",
    }
  );

  assert.deepEqual(merged, {
    type: "file",
    repo: "github.com/acme/widgets",
    path: "plugins/mem0-functional.ts",
    ref: "feature/anchors",
    commit_sha: "abc123def456",
  });
});

test("mergeAnchorContexts preserves explicit pr intent when git metadata is present", () => {
  const merged = __test__.mergeAnchorContexts(
    {
      type: "commit",
      repo: "github.com/acme/widgets",
      ref: "feature/anchors",
      commit_sha: "abc123def456",
    },
    {
      pr_number: "123",
    }
  );

  assert.deepEqual(merged, {
    type: "pr",
    repo: "github.com/acme/widgets",
    ref: "feature/anchors",
    commit_sha: "abc123def456",
    pr_number: "123",
  });
});

test("inferAutomaticAnchorContext returns commit context only when repo and commit are available", () => {
  const calls: string[] = [];
  const runGit = (directory: string, args: string[]): string | undefined => {
    calls.push(`${directory}::${args.join(" ")}`);

    const joined = args.join(" ");
    if (joined === "rev-parse --show-toplevel") return "/workspace/repo";
    if (joined === "remote get-url origin") return "git@github.com:acme/widgets.git";
    if (joined === "rev-parse HEAD") return "abc123def456";
    if (joined === "rev-parse --abbrev-ref HEAD") return "feature/anchors";
    return undefined;
  };

  const inferred = __test__.inferAutomaticAnchorContext("/workspace/repo", {
    enabled: true,
    env: {},
    runGit,
  });

  assert.deepEqual(inferred, {
    type: "commit",
    repo: "github.com/acme/widgets",
    ref: "feature/anchors",
    commit_sha: "abc123def456",
  });
  assert.ok(calls.length >= 3);
});

test("inferAutomaticAnchorContext stays off when commit or repo cannot be proven", () => {
  const inferred = __test__.inferAutomaticAnchorContext("/workspace/repo", {
    enabled: true,
    env: {},
    runGit: (_directory, args) => {
      const joined = args.join(" ");
      if (joined === "rev-parse --show-toplevel") return "/workspace/repo";
      if (joined === "rev-parse HEAD") return "abc123def456";
      return undefined;
    },
  });

  assert.equal(inferred, undefined);
});

test("buildCompactionMemoryBlock returns undefined when there are no memories", () => {
  assert.equal(__test__.buildCompactionMemoryBlock([]), undefined);
});

test("buildCompactionMemoryBlock formats high-signal project memories", () => {
  const block = __test__.buildCompactionMemoryBlock([
    { content: "Keep session summaries deterministic" },
    { content: "Preserve durable project decisions" },
  ]);

  assert.equal(
    block,
    [
      "## Mem0 High-Signal Project Memory",
      "- Keep session summaries deterministic",
      "- Preserve durable project decisions",
      "Keep these durable facts in the continuation summary.",
    ].join("\n")
  );
});

test("buildReplaceCompactionPrompt still produces a prompt when no memories are retrieved", () => {
  const prompt = __test__.buildReplaceCompactionPrompt([]);

  assert.match(prompt, /You are generating a continuation summary/);
  assert.match(prompt, /## Mem0 High-Signal Project Memory/);
  assert.match(prompt, /Do not omit the Mem0 section/);
  assert.match(prompt, /No verified Mem0 project memory was retrieved for this compaction\./);
});

test("buildReplaceCompactionPrompt embeds retrieved memories when available", () => {
  const prompt = __test__.buildReplaceCompactionPrompt([
    { content: "Project compaction must carry forward durable facts" },
  ]);

  assert.match(prompt, /## Mem0 High-Signal Project Memory/);
  assert.match(prompt, /- Project compaction must carry forward durable facts/);
  assert.match(prompt, /reproduce the provided bullet list verbatim/);
  assert.doesNotMatch(prompt, /No verified Mem0 project memory was retrieved for this compaction\./);
});

test("shouldRetrieveForMessage triggers on first turn", () => {
  const decision = __test__.shouldRetrieveForMessage(
    {
      turn: 1,
      lastInjectionTurn: 0,
      topicSignature: "",
    },
    "hello there"
  );

  assert.equal(decision.firstTurn, true);
  assert.equal(decision.shouldRetrieve, true);
});

test("shouldRetrieveForMessage triggers on recall intent", () => {
  const decision = __test__.shouldRetrieveForMessage(
    {
      turn: 2,
      lastInjectionTurn: 1,
      topicSignature: "stable previous topic",
    },
    "what did we decide earlier about mem0?"
  );

  assert.equal(decision.recallIntent, true);
  assert.equal(decision.shouldRetrieve, true);
});

test("shouldRetrieveForMessage triggers on periodic refresh", () => {
  const decision = __test__.shouldRetrieveForMessage(
    {
      turn: 8,
      lastInjectionTurn: 2,
      topicSignature: "same topic",
    },
    "same topic repeated"
  );

  assert.equal(decision.periodicRefresh, true);
  assert.equal(decision.shouldRetrieve, true);
});

test("shouldRetrieveForMessage detects topic shift", () => {
  const initial = __test__.shouldRetrieveForMessage(
    {
      turn: 2,
      lastInjectionTurn: 2,
      topicSignature: "",
    },
    "mailgun webhook delivery retries"
  );

  const shifted = __test__.shouldRetrieveForMessage(
    {
      turn: 3,
      lastInjectionTurn: 2,
      topicSignature: initial.signature,
    },
    "kitten colors and gardening tips"
  );

  assert.equal(shifted.topicShift, true);
  assert.equal(shifted.shouldRetrieve, true);
});
