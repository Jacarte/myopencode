# kitty-terminal-mcp

MCP server that exposes read-oriented tools for [Kitty](https://sw.kovidgoyal.net/kitty/) terminal output. Lets AI agents list windows/tabs, read terminal text, and tail logs via the Kitty remote control protocol.

Repository-level local plugin references (including Mem0 server integration) are documented in `~/.config/opencode/README.md`.

## Prerequisites

Kitty must have remote control enabled. Add to your `kitty.conf` or `macos-launch-services-cmdline`:

```
allow_remote_control yes
--listen-on unix:/tmp/kitten
```

See the [Kitty remote control docs](https://sw.kovidgoyal.net/kitty/remote-control/) for details.

## Tools

| Tool | Description |
|------|-------------|
| `kitty_list_windows` | List all OS windows, tabs, and terminal windows as JSON |
| `kitty_get_text` | Get text content from a terminal window (screen, all, or selection) |
| `kitty_get_last_lines` | Tail the last N lines from a terminal window |

## Required environment

| Variable | Description | Example |
|----------|-------------|---------|
| `KITTY_LISTEN_ON` | Kitty remote control socket address | `unix:/tmp/kitten` |

## Run with Node (recommended on macOS)

Docker on macOS cannot share Unix sockets with the host due to the Linux VM layer. Run natively instead:

```bash
npm install
KITTY_LISTEN_ON="unix:/tmp/kitten" node server.mjs
```

### OpenCode config

```json
{
  "kitty_terminal": {
    "type": "local",
    "enabled": true,
    "command": ["node", "{env:HOME}/.config/opencode/mcps/kitty-terminal-mcp/server.mjs"],
    "environment": {
      "KITTY_LISTEN_ON": "unix:/tmp/kitten"
    }
  }
}
```

## Run with Docker (Linux only)

Unix socket sharing via `-v /tmp:/tmp` only works on Linux where Docker runs natively (no VM).

### Build

```bash
docker build -t kitty-terminal-mcp:local .
```

### Run

```bash
docker run -i --rm \
  -e KITTY_LISTEN_ON="unix:/tmp/kitten" \
  -v /tmp:/tmp \
  kitty-terminal-mcp:local
```
