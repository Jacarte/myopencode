# Promptfoo Eval Data Template

Use when `eval_target=promptfoo`.

## Required Artifacts

1. `promptfoo/promptfooconfig.yaml`
2. Test cases mapped from failure modes (inline or separate file)
3. Assertion strategy (deterministic first, LLM rubric where needed)
4. CI command examples

## Minimal `promptfooconfig.yaml` Shape

```yaml
description: <suite-name>
prompts:
  - "{{input}}"
providers:
  - id: <provider-id>
tests:
  - vars:
      input: <scenario input>
    assert:
      - type: contains
        value: <expected>
```

## Mapping Rules

- Each `task_id` becomes one or more `tests` entries.
- `regression` tasks should use strict deterministic assertions where possible.
- `capability` tasks may use rubric-style assertions with explicit thresholds.
- Preserve traceability: include `task_id` and `category` in test metadata.

## CI Examples

```bash
promptfoo eval -c promptfoo/promptfooconfig.yaml
promptfoo eval -c promptfoo/promptfooconfig.yaml --output json
```
