# GitLab MCP Node.js Implementation

Native Node.js Model Context Protocol (MCP) server for GitLab merge request operations. Direct implementation of GitLab REST API v4 with no external HTTP wrappers or Go service dependencies.

## Architecture

```
MCP Client (OpenCode)
    ↓ (stdio)
MCP Server (server.mjs)
    ↓
GitLabHandlers (src/handlers.js)    ← Validates MCP tool arguments
    ↓
GitLabClient (src/gitlab-client.js) ← Native GitLab API HTTP client
    ↓ (native fetch)
GitLab REST API v4
```

**Design Decision**: Single-process, no external services. Unlike the previous Go HTTP wrapper, this implementation bundles the API client directly in the MCP server for simplicity and reliability.

## Quick Start

```bash
# Install dependencies
npm install

# Run with GitLab token
export GITLAB_TOKEN="glpat-xxxxxxxxxxxx"
node server.mjs
```

The server accepts stdio transport. OpenCode CLI automatically routes calls to this server.

## Files

| File | Purpose | Size |
|------|---------|------|
| `server.mjs` | MCP server entry point, tool definitions, request routing | 263 lines |
| `src/gitlab-client.js` | Native GitLab API HTTP client, 11 methods | 367 lines |
| `src/handlers.js` | MCP tool argument validation, 10 handlers | 195 lines |
| `src/gitlab-client.d.ts` | **NEW** TypeScript definitions for IDE support | 440 lines |
| `package.json` | Dependencies: @modelcontextprotocol/sdk v1.27.1 | — |

## 10 MCP Tools

Each tool maps 1:1 to a GitLabClient method.

### Core MR Operations

1. **`mr_list`** — List merge requests
   - Args: `project_id`, `state?`, `order_by?`, `sort?`, `source_branch?`, `target_branch?`, `per_page?`, `page?`
   - Returns: Array of MR objects

2. **`mr_get`** — Get single MR details
   - Args: `project_id`, `mr_iid`
   - Returns: Complete MR object

3. **`mr_create`** — Create new MR
   - Args: `project_id`, `source_branch`, `target_branch`, `title`, `description?`, `assignee_id?`, `target_project_id?`, `remove_source_branch?`, `squash?`
   - Returns: Created MR object

4. **`mr_update_description`** — Update MR description
   - Args: `project_id`, `mr_iid`, `description`
   - Returns: Updated MR object

5. **`mr_add_note`** — Add comment to MR
   - Args: `project_id`, `mr_iid`, `body`
   - Returns: Created note object

### MR Analysis

6. **`mr_get_diffs`** — Get file changes
   - Args: `project_id`, `mr_iid`, `include_changes?`
   - Returns: Array of diff objects with file paths, additions/deletions

7. **`mr_get_discussions`** — Get comment threads
   - Args: `project_id`, `mr_iid`
   - Returns: Array of discussion threads

8. **`mr_get_participants`** — Get involved users
   - Args: `project_id`, `mr_iid`
   - Returns: Array of participant user objects

### CI/CD Integration

9. **`mr_get_jobs`** — Get CI jobs for MR
   - Args: `project_id`, `mr_iid`
   - Returns: Array of job objects with statuses

10. **`pipeline_get_jobs`** — Get jobs for specific pipeline
    - Args: `project_id`, `pipeline_id`
    - Returns: Array of job objects

## TypeScript Support

IDE support provided via `src/gitlab-client.d.ts` (new in Phase 6).

### Usage in TypeScript Projects

```bash
# Copy the definition file to your project
cp src/gitlab-client.d.ts /path/to/your/project/types/

# Or generate definitions via npm
npm run types  # (if build script available)
```

### IntelliSense Features

- ✅ Method signatures with full parameter docs
- ✅ Return type annotations
- ✅ JSDoc parameter descriptions (type, required/optional, defaults)
- ✅ Usage examples for each method
- ✅ Error documentation (@throws)

### Example

```typescript
import type { GitLabClient } from './types/gitlab-client';

const client: GitLabClient = new GitLabClient('glpat-...', 'https://gitlab.com');

// IDE shows:
// - Required parameters: projectID, mrIID
// - Optional parameters: opts
// - Return type: Promise<any[]>
// - Full JSDoc with examples
const mrs = await client.listMergeRequests('123', { state: 'opened' });
```

## HTTP Method Support

The client implements native HTTP methods for GitLab REST API:

- **GET** (`_get()`) — Fetch data with query parameters
- **POST** (`_post()`) — Create/modify with JSON body
- **PUT** (`_put()`) — Update with JSON body

All requests include:
- `PRIVATE-TOKEN` header (authentication)
- `User-Agent: gitlab-mcp-node/1.0` (Cloudflare bypass)
- Proper error handling with response parsing

## Error Handling

All errors are caught and returned as MCP text responses:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: [error description]\n[detailed error info if available]"
    }
  ]
}
```

Error sources:
- Missing required arguments → validation error
- Invalid GitLab token → 401 Unauthorized
- Project/MR not found → 404 Not Found
- Network issues → connection error
- GitLab API errors → HTTP error + response body

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GITLAB_TOKEN` | (required) | GitLab private token for API authentication |
| `GITLAB_URL` | `https://gitlab.com` | GitLab instance base URL (optional, for self-hosted) |

### OpenCode Configuration

The MCP is registered in `~/.config/opencode/opencode.json`:

```json
{
  "mcp": [
    {
      "name": "gitlab",
      "type": "local",
      "command": "node",
      "args": [
        "~/.config/opencode/mcps/gitlab-mr-service-mcp-node/server.mjs"
      ],
      "environment": {
        "GITLAB_TOKEN": "{env:GITLAB_TOKEN}",
        "GITLAB_URL": "{env:GITLAB_URL}"
      }
    }
  ]
}
```

## Development

### Running Tests Manually

```bash
# Validate all modules load
node --check server.mjs
node --check src/gitlab-client.js
node --check src/handlers.js

# Start server and test with curl
export GITLAB_TOKEN="glpat-..."
node server.mjs &

# In another terminal, test with OpenCode
opencode "List merge requests for project 123" --use-mcp gitlab
```

### Performance Notes

- **Direct HTTP**: No intermediate process overhead (unlike Go wrapper)
- **Native Fetch**: Uses Node.js built-in HTTP client (Node.js 18+)
- **Single Process**: No IPC, cleaner error handling
- **Response Parsing**: Streams JSON responses, no buffering overhead

### Known Limitations

- **GitLab.com Rate Limits**: API has rate limits. Add backoff for bulk operations.
- **Self-Hosted GitLab**: Requires valid GITLAB_URL. Cloudflare bypass may need tuning.
- **Pagination**: Max 100 results per page per GitLab API limits.

## Troubleshooting

### "Missing GITLAB_TOKEN"
```bash
export GITLAB_TOKEN="glpat-xxxxxxxxxxxx"
```

### "Unauthorized (401)"
- Token is invalid or expired
- Token lacks required scopes (api, read_repository, read_user)

### "Cloudflare Challenge / 403 Forbidden"
- May occur on GitLab.com under heavy load
- User-Agent header mitigation already applied
- Try again or use self-hosted GitLab instance

### MCP Server Won't Start
```bash
# Check for syntax errors
node --check server.mjs

# Check dependencies
npm list @modelcontextprotocol/sdk

# Check environment
env | grep GITLAB
```

## Comparison to Previous Implementation

| Aspect | Go Wrapper (Old) | Node.js Native (New) |
|--------|-----------------|---------------------|
| **Transport** | HTTP service + stdio | Direct stdio |
| **Process Count** | 2 (Go + Node) | 1 (Node only) |
| **HTTP Client** | Go http package | Native fetch |
| **Deployment** | Docker container | NPM + Node.js |
| **Debugging** | Complex (IPC) | Simple (stdio logs) |
| **Maintenance** | Multiple languages | Single language |
| **Type Support** | None | TypeScript .d.ts |

## Migration from Old Implementation

If you were using the old Python/Go wrapper (`mcps/gitlab-mr-service-mcp-py/`):

1. ✅ **Already done**: opencode.json updated to use new Node.js server
2. ✅ **Already done**: Old Go service (`tools/gitlab-mr-service/`) removed
3. No breaking changes to MCP tool signatures
4. Tool arguments and response formats remain identical

## Future Enhancements

- [ ] Multipart form-data support for markdown file uploads
- [ ] Debug logging mode (`DEBUG=gitlab-mcp`)
- [ ] Performance profiling under high load
- [ ] Additional GitLab features (pipelines, environments, tags)

## License

Personal configuration. Part of OpenCode setup.
