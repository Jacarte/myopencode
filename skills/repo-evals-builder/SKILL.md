---
name: repo-evals-builder
description: "Analyze AI usage in the current repository and convert real behavior from code plus provided logs into an actionable eval suite. Use when: (1) bootstrapping evals for an existing AI feature, (2) turning incidents/regressions into eval tasks, (3) generating task, grader, and metric specs from repo evidence. Triggers: 'create evals for this repo', 'analyze AI usage here', 'build eval tasks from logs', 'eval-driven development for agent'."
compatibility: opencode
metadata:
  audience: developers
  workflow: eval-design
---

# Repo Evals Builder

Build evaluation tasks from repository evidence, not guesswork.

Use this skill to inspect the folder where the user launched the session, identify where AI is used, mine logs for real failures, and output a practical eval suite plan.

## Core Principles

Follow Anthropic's eval guidance:
- Start small and concrete (20-50 tasks is enough to begin).
- Favor deterministic graders where possible, LLM graders where needed.
- Grade outcomes first; avoid over-constraining the exact path.
- Separate capability tasks (hard, improvement-focused) from regression tasks (must stay green).
- Treat tasks as living artifacts and keep adding failures from production logs.

## Inputs

Collect these inputs before task synthesis:
- Repository code in current working directory.
- Existing tests, CI, and quality checks.
- User-provided logs or traces (app logs, agent transcripts, failures, support tickets).
- Optional: incident notes or bug tracker links.

If logs are not provided, still produce a repo-only draft suite and flag missing evidence.

## Workflow

### 1) Map AI Surface Area

Identify where AI is actually used:
- Model/provider SDK usage (OpenAI, Anthropic, Braintrust, etc.).
- Agent loops and tool-call orchestration.
- Prompt templates, system prompts, and routing logic.
- Output parsers, validators, and post-processing.
- Side-effecting actions (writes, state updates, external APIs).

Produce a short component map:
- `Component`
- `User-visible behavior`
- `Failure impact`
- `Evidence path`

### 2) Extract Failure Modes from Logs

From logs/traces, cluster events into failure modes:
- Incorrect outcome (wrong answer/action).
- Tool misuse (wrong tool, bad params, missing call).
- Hallucinated claims or ungrounded output.
- Reliability issues (timeouts, retries, nondeterministic regressions).
- Cost/latency spikes.
- Safety/policy failures.

For each mode, keep concrete evidence:
- Log snippet ID or timestamp.
- Affected endpoint/feature.
- Observed impact.

### 3) Turn Failure Modes into Tasks

Create one task per behavior to validate. Task quality rules:
- Unambiguous input and expected success condition.
- Solvable by a correct agent/harness.
- Includes both positive and negative cases where relevant.
- Avoid hidden grader assumptions.

Every task must include:
- `task_id`
- `category`: `capability` or `regression`
- `scenario`
- `inputs` and environment/setup
- `pass_criteria`
- `graders`
- `tracked_metrics`

### 4) Choose Graders Correctly

Use mixed graders based on evidence:
- Deterministic first: unit/integration checks, state checks, schema checks, static analysis.
- LLM rubric second: communication quality, nuanced correctness, policy tone.
- Human calibration optional: only for high-subjectivity tasks.

Grading policy:
- Prefer outcome checks over rigid step-by-step tool sequence checks.
- Use partial credit only when product requirements justify it.
- Add anti-bypass checks for known loopholes.

### 5) Add Metrics and Trial Strategy

For each task define:
- Trial count (`k`) and why.
- Success metric to report: `pass@k` and/or `pass^k`.
- Operational metrics: latency, token usage, cost, turns, tool-call count.

Use defaults if missing:
- Regression: low variance, stricter consistency target.
- Capability: lower initial pass rate is acceptable.

### 6) Output Artifacts

Always return these artifacts:
1. AI usage analysis summary.
2. Failure-mode catalog with evidence.
3. Eval task list in YAML using the template in `references/TASK_TEMPLATE.md`.
4. Prioritized rollout plan:
   - Immediate regression set (ship blocker)
   - Capability set (hill-climbing)
   - Missing instrumentation to add

## Output Format

When responding, use this order:
1. `AI Usage Map`
2. `Failure Modes from Logs`
3. `Proposed Eval Suite`
4. `Top 5 Tasks to Implement First`
5. `Instrumentation Gaps`

Keep tasks concrete enough that an engineer can implement them directly in an eval harness.

## Guardrails

- Do not invent behavior not supported by repo or logs.
- Do not claim coverage for flows with no evidence.
- Do not output only capability tasks; include regression tasks.
- Do not rely only on LLM graders when deterministic checks are available.
- Do not stop at generic advice; produce actual task specs.

## Reference

For schema and examples, read:
- [TASK_TEMPLATE.md](references/TASK_TEMPLATE.md)
