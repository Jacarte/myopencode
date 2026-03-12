# OPENCODE CONFIGURATION KNOWLEDGE BASE

**Generated:** 2026-02-16

## OVERVIEW

Personal OpenCode CLI configuration. Defines AI providers, MCP integrations, custom agents for Chatlayer monorepo workflows (code review, releases, QA), and the oh-my-opencode plugin for agent/category model routing.

## STRUCTURE

```
~/.config/opencode/
├── opencode.json           # Core config: providers, MCP servers, plugins
├── oh-my-opencode.json     # Agent ↔ model + category ↔ model mappings
├── agent/                  # 7 custom agent definitions (→ see agent/AGENTS.md)
├── skills/                 # Installed skills (currently: skill-creator)
├── commands/               # Custom slash commands (empty)
├── .opencode/              # Internal runtime state (SQLite DB, do NOT touch)
├── package.json            # Dependency: @opencode-ai/plugin 1.2.5
└── logs.txt                # Runtime logs
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add/change AI provider or model | `opencode.json` → `provider` | Format: `provider/model-name` |
| Add/configure MCP server | `opencode.json` → `mcp` | Types: `local` (command) or `remote` (URL) |
| Change agent model assignment | `oh-my-opencode.json` → `agents` | Agent names must match plugin expectations |
| Change category model | `oh-my-opencode.json` → `categories` | 8 categories: visual-engineering, ultrabrain, deep, artistry, quick, unspecified-low/high, writing |
| Create/edit custom agent | `agent/<name>.md` | YAML frontmatter required (see agent/AGENTS.md) |
| Create/edit skill | `skills/<name>/SKILL.md` | See skill-creator skill for full guide |
| Debug runtime state | `.opencode/opencode.db` | SQLite. Stores conversation history + state |

## CONVENTIONS

- **Config schema**: Both JSON configs reference `$schema` for validation
- **Trailing commas**: Present in oh-my-opencode.json (non-standard JSON, accepted by parser)
- **Model format**: Always `provider/model-name` (e.g., `anthropic/claude-opus-4-6`)
- **MCP environment vars**: Stored inline in config under `environment` key
- **Plugin system**: Plugins listed in `opencode.json` → `plugin` array, versioned with `@latest` or pinned

## ANTI-PATTERNS

- **DO NOT** manually edit `.opencode/` — managed by runtime
- **DO NOT** commit `opencode.json` with credentials to public repos — contains API keys and tokens inline
- **DO NOT** add extraneous files to skill directories — no README.md, CHANGELOG.md, etc.

## INTEGRATIONS (MCP Servers)

| MCP | Type | Purpose | Used By |
|-----|------|---------|---------|
| atlassian | remote (OAuth) | Confluence + Jira access | remote_reviewer, ai_newsletter |
| slack | local (Python) | Channel read/post | ai_newsletter |
| context7 | remote | Library documentation | librarian agent |
| gitlab | local (npx) | MR/branch/review operations | remote_releaser, remote_reviewer, code-checker |
| datadog | local (npx) | Monitoring metrics/logs | ad-hoc |
| chrome-mcp | local (npx) | Browser automation | disabled by default |

## AGENT/MODEL TOPOLOGY

```
oh-my-opencode.json
├── agents (named)
│   ├── sisyphus, prometheus, metis  → claude-opus-4-6
│   ├── hephaestus                   → gpt-5.3-codex
│   ├── oracle, momus                → gpt-5.2
│   ├── librarian, explore, atlas    → claude-haiku-4-5
│   └── multimodal-looker            → gemini-3-flash-preview
└── categories (task-based)
    ├── ultrabrain, deep             → gpt-5.3-codex
    ├── visual-engineering, artistry → gemini-3-pro-preview
    ├── quick                        → claude-haiku-4-5
    ├── unspecified-low              → claude-sonnet-4-5
    ├── unspecified-high             → claude-opus-4-6
    └── writing                      → gemini-3-flash-preview
```

## NOTES

- `opencode.json.bak` is identical to `opencode.json` — manual backup
- GitLab MCP has `GITLAB_ALLOWED_PROJECT_IDS` restricting access to 4 projects (Chatlayer repos)
- `GITLAB_PROJECT_ID` is empty — set per-session or per-project
- Slack channels: `C09E290234Y` (ai-guild), `C040UE8CU3U` (secondary newsletter target)
