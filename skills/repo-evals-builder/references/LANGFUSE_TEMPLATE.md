# Langfuse Eval Data Template

Use when `eval_target=langfuse`.

## Required Artifacts

1. Dataset JSON
2. Score Config JSON
3. Python runner script (`run_experiment`)
4. Optional Python dataset runner (`dataset.run_experiment`)

## Dataset JSON Shape

```json
{
  "datasetName": "<suite-name>",
  "description": "<what this validates>",
  "items": [
    {
      "id": "<task_id>",
      "input": { "prompt": "...", "target": "..." },
      "expectedOutput": { "rule": "..." },
      "metadata": { "category": "regression|capability" }
    }
  ]
}
```

## Score Config JSON Shape

```json
{
  "scores": [
    { "name": "task_pass", "dataType": "BOOLEAN" },
    { "name": "latency_ms", "dataType": "NUMERIC", "minValue": 0 },
    { "name": "token_total", "dataType": "NUMERIC", "minValue": 0 },
    { "name": "estimated_cost_usd", "dataType": "NUMERIC", "minValue": 0 }
  ]
}
```

## Metadata Contract

Attach to runs/items where possible:

- `task_id`
- `category`
- `git_sha`
- `branch`
- `model`
- `prompt_version`
