# OpenAgents Fallback UI

Visual editor for `oh-my-opencode.json` / `oh-my-openagent` fallback chains.

## What it does

- Reads your local config from `../../oh-my-opencode.json`
- Loads available models by running `opencode models --refresh`
- Lets you edit each agent/category fallback sequence as a draggable block graph
- Exports either:
  - fallback-only JSON snippet
  - full merged config JSON

## Run

```bash
cd tools/openagents-fallback-ui
npm install
npm run dev
```

## Refresh benchmark snapshot

```bash
cd tools/openagents-fallback-ui
# Optional but recommended for coding/intelligence indexes
export ARTIFICIAL_ANALYSIS_API_KEY="..."
npm run benchmarks:update
```

This updates `data/benchmark-snapshot.json`, which the UI uses for category/agent suggestions.

The Vite dev server includes local API endpoints:

- `GET /api/models` -> shells out to `opencode models --refresh`
- `GET /api/config` -> reads `../../oh-my-opencode.json`
- `GET /api/benchmarks` -> reads `./data/benchmark-snapshot.json`
- `GET /api/benchmarks/refresh` -> runs `npm run benchmarks:update` then reloads snapshot

If those endpoints fail, make sure:

- `opencode` is available in your shell PATH
- you run the app from `tools/openagents-fallback-ui`
- `oh-my-opencode.json` exists in the repo root
