# opencode-config

Personal [OpenCode](https://opencode.ai) configuration. Custom MCP servers, agent skills, model routing via [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode), and tool integrations for Chatlayer monorepo workflows.

## Structure

```
~/.config/opencode/
├── opencode.json               # MCP servers, plugins, theme
├── oh-my-opencode.json         # Agent/category ↔ model routing
├── plugins/
│   ├── mem0-functional.ts          # Mem0 memory plugin loaded by OpenCode
│   ├── mem0-functional.md          # Architecture notes for the plugin
│   └── mem0server/                 # Reference Mem0 REST backend implementation
├── mcps/
│   ├── gitlab-mr-service-mcp-py/   # GitLab MR operations (Python + Go, Docker)
│   └── kitty-terminal-mcp/         # Kitty terminal read access (Node)
├── tools/
│   └── gitlab-mr-service/          # Go HTTP API backing the GitLab MCP
├── skills/                     # 7 agent skills
│   ├── go-reviewer/            # Go code review against team conventions
│   ├── typescript-reviewer/    # TypeScript code review against team conventions
│   ├── remote-mr-review/       # GitLab MR review workflow
│   ├── visual-explainer/       # HTML visual explanations and diagrams
│   ├── javier-writing-style/   # Technical blog post writing style
│   ├── repo-evals-builder/     # AI eval suite generation from repo behavior
│   └── skill-creator/          # Guide for authoring new skills
├── agent/                      # Custom agent definitions (.gitignored)
├── commands/                   # Custom slash commands
└── package.json                # Plugin dependency: @opencode-ai/plugin
```

## MCP servers

| Server | Type | Transport | Purpose |
|--------|------|-----------|---------|
| `gitlab_mr_service` | custom | Docker | GitLab MR list/get/create/diff/review |
| `kitty_terminal` | custom | Node (native) | Read Kitty terminal windows and logs |
| `slack` | custom | Python | Slack channel read/post |
| `atlassian` | remote | OAuth | Confluence + Jira |
| `context7` | remote | HTTPS | Library documentation lookup |
| `datadog` | remote | HTTPS | Monitoring metrics and logs |
| `prometheus` | public | Docker | PromQL queries |
| `playwright` | public | npx | Browser automation |
| `browsermcp` | public | npx | Browser automation (alternative) |
| `anytype` | public | npx | Anytype knowledge base |

## Model routing

The `oh-my-opencode` plugin routes agents and task categories to specific models:

**Agents**

| Agent | Model | Role |
|-------|-------|------|
| sisyphus, prometheus, metis | claude-opus-4-6 | Orchestration, planning |
| hephaestus | gpt-5.3-codex | Implementation |
| oracle, momus | gpt-5.2 | Consultation, review |
| librarian, explore, atlas | claude-haiku-4-5 | Search, exploration |
| multimodal-looker | gemini-3-flash-preview | Vision tasks |

**Categories**

| Category | Model |
|----------|-------|
| ultrabrain, deep | gpt-5.3-codex |
| visual-engineering, artistry | gemini-3-pro-preview |
| quick | claude-haiku-4-5 |
| unspecified-low | claude-sonnet-4-6 |
| unspecified-high | claude-opus-4-6 |
| writing | gemini-3-flash-preview |

## Mem0 Reference Implementation

The repository includes a local Mem0 stack for the memory plugin:

- Plugin: `plugins/mem0-functional.ts`
- Backend reference server: `plugins/mem0server/README.md`
- Default backend URL used by the plugin: `MEM0_SERVER_URL` (defaults to `http://localhost:8000`)

Quick start:

```bash
cd ~/.config/opencode/plugins/mem0server
cp .env.example .env
# set OPENAI_API_KEY in .env
./start.sh

export MEM0_SERVER_URL="http://localhost:8000"
```

## Security

No secrets are committed. All credentials use `{env:...}` substitution:

| Variable | Server |
|----------|--------|
| `GITLAB_TOKEN` | gitlab_mr_service |
| `SLACK_BOT_TOKEN` | slack |
| `CONTEXT7_API_KEY` | context7 |
| `OPENAPI_MCP_HEADERS` | anytype |

## Setup

```bash
# Install plugin dependency
cd ~/.config/opencode && npm install

# Build Docker-based MCPs
docker build -t gitlab-mr-service-mcp-py:local -f mcps/gitlab-mr-service-mcp-py/Dockerfile .

# Kitty MCP runs natively (macOS can't share Unix sockets with Docker)
cd mcps/kitty-terminal-mcp && npm install

# Set required env vars
export GITLAB_TOKEN="..."
export SLACK_BOT_TOKEN="..."
export CONTEXT7_API_KEY="..."
```

Kitty requires remote control enabled. See [mcps/kitty-terminal-mcp/README.md](mcps/kitty-terminal-mcp/README.md).
