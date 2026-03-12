# gitlab-mr-service-mcp-py

Python MCP wrapper around `tools/gitlab-mr-service`.

This image starts:
- `gitlab-mr-service` (Go HTTP API on `127.0.0.1:8080`)
- `server.py` (Python MCP stdio server exposing MR tools)

## Required environment

- `GITLAB_TOKEN` (required)
- `GITLAB_URL` (optional, defaults to `https://gitlab.com`)

## Build

Run from `~/.config/opencode`:

```bash
docker build -t gitlab-mr-service-mcp-py:local -f mcps/gitlab-mr-service-mcp-py/Dockerfile .
```

## Run

```bash
docker run -i --rm -e GITLAB_TOKEN -e GITLAB_URL gitlab-mr-service-mcp-py:local
```
