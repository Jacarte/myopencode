# kitty-terminal-mcp

MCP server that exposes read-oriented tools for Kitty terminal output.

## Required environment

- `KITTY_LISTEN_ON`, for example: `unix:/tmp/kitty-opencode.sock`

## Build

```bash
docker build -t kitty-terminal-mcp:local .
```

## Local run (stdio)

```bash
docker run -i --rm \
  -e KITTY_LISTEN_ON="unix:/tmp/kitty-opencode.sock" \
  -v /tmp:/tmp \
  kitty-terminal-mcp:local
```
