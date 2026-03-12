# Eval Task Template

Use this template when generating tasks from repository analysis and logs.

```yaml
task:
  id: "<stable-task-id>"
  category: "regression|capability"
  desc: "<single sentence goal>"
  scenario:
    user_intent: "<what user asked the system to do>"
    risk: "<why this matters>"
    evidence:
      source: "log|trace|code"
      ref: "<timestamp, trace id, file path, issue id>"
  inputs:
    prompt: "<task input>"
    context: "<optional retrieval or repo context>"
    fixtures:
      - "<fixture name or file>"
  environment:
    setup:
      - "<seed state>"
      - "<required mocks/services>"
    isolation: "fresh|sandbox|shared"
  graders:
    - type: deterministic_tests
      required:
        - "<test_file_or_check_1>"
    - type: state_check
      expect:
        "<resource>": "<expected final state>"
    - type: llm_rubric
      rubric: "<path/to/rubric.md>"
      assertions:
        - "<assertion 1>"
        - "<assertion 2>"
  pass_criteria:
    mode: "binary|weighted"
    rule: "<e.g. all deterministic pass AND llm_score >= 0.8>"
  trials:
    k: 3
    report:
      - pass@k
      - pass^k
  tracked_metrics:
    - type: transcript
      metrics: [n_turns, n_toolcalls, n_total_tokens]
    - type: latency
      metrics: [time_to_first_token, time_to_last_token]
    - type: cost
      metrics: [input_tokens, output_tokens, estimated_cost]
```

## Task Generation Rules

1. Every task must trace back to observed behavior (code path or logs).
2. Prefer deterministic checks for correctness and state mutation.
3. Use LLM rubrics only for nuance not captured by code checks.
4. Include at least one negative case for each major behavior.
5. Keep one core behavior per task to ease debugging.

## Minimal Starter Suite (20 tasks)

- 8 regression tasks from top production failures in logs.
- 8 regression tasks for core happy paths users rely on.
- 4 capability tasks for currently weak but important scenarios.

## Prioritization Heuristic

Sort tasks by:
1. User impact severity
2. Failure frequency in logs
3. Revenue or trust impact
4. Ease of deterministic grading
5. Coverage gap versus existing tests
