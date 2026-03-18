import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { GitLabClient } from "./src/gitlab-client.js";
import { GitLabHandlers } from "./src/handlers.js";

const server = new Server(
  {
    name: "gitlab-mr-service-mcp-node",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

let gitlabHandlers = null;

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function formatResult(data) {
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(data, null, 2);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mr_list",
        description: "List merge requests for a project.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            state: { type: "string" },
            order_by: { type: "string" },
            sort: { type: "string" },
            source_branch: { type: "string" },
            target_branch: { type: "string" },
            per_page: { type: "number" },
            page: { type: "number" },
          },
          required: ["project_id"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_get",
        description: "Get merge request details.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            mr_iid: { type: "number" },
          },
          required: ["project_id", "mr_iid"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_create",
        description: "Create a merge request.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            source_branch: { type: "string" },
            target_branch: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            assignee_id: { type: "number" },
            target_project_id: { type: "number" },
            remove_source_branch: { type: "boolean" },
            squash: { type: "boolean" },
          },
          required: ["project_id", "source_branch", "target_branch", "title"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_update_description",
        description: "Update the merge request description text.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            mr_iid: { type: "number" },
            description: { type: "string" },
          },
          required: ["project_id", "mr_iid", "description"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_add_note",
        description: "Add a note/comment to a merge request.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            mr_iid: { type: "number" },
            body: { type: "string" },
          },
          required: ["project_id", "mr_iid", "body"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_get_diffs",
        description: "Get merge request diffs.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            mr_iid: { type: "number" },
            include_changes: { type: "boolean" },
          },
          required: ["project_id", "mr_iid"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_get_jobs",
        description: "Get CI jobs for a merge request.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            mr_iid: { type: "number" },
          },
          required: ["project_id", "mr_iid"],
          additionalProperties: false,
        },
      },
      {
        name: "pipeline_get_jobs",
        description: "Get CI jobs for a pipeline.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            pipeline_id: { type: "number" },
          },
          required: ["project_id", "pipeline_id"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_get_discussions",
        description: "Get merge request discussions.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            mr_iid: { type: "number" },
          },
          required: ["project_id", "mr_iid"],
          additionalProperties: false,
        },
      },
      {
        name: "mr_get_participants",
        description: "Get merge request participants.",
        inputSchema: {
          type: "object",
          properties: {
            project_id: { type: "string" },
            mr_iid: { type: "number" },
          },
          required: ["project_id", "mr_iid"],
          additionalProperties: false,
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  const toolName = request.params.name;

  try {
    let result;

    switch (toolName) {
      case "mr_list":
        result = await gitlabHandlers.listMergeRequests(args);
        break;
      case "mr_get":
        result = await gitlabHandlers.getMergeRequest(args);
        break;
      case "mr_create":
        result = await gitlabHandlers.createMergeRequest(args);
        break;
      case "mr_update_description":
        result = await gitlabHandlers.updateMergeRequestDescription(args);
        break;
      case "mr_add_note":
        result = await gitlabHandlers.addMergeRequestNote(args);
        break;
      case "mr_get_diffs":
        result = await gitlabHandlers.getMergeRequestDiffs(args);
        break;
      case "mr_get_jobs":
        result = await gitlabHandlers.getMergeRequestJobs(args);
        break;
      case "pipeline_get_jobs":
        result = await gitlabHandlers.getPipelineJobs(args);
        break;
      case "mr_get_discussions":
        result = await gitlabHandlers.getMergeRequestDiscussions(args);
        break;
      case "mr_get_participants":
        result = await gitlabHandlers.getMergeRequestParticipants(args);
        break;
      default:
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        };
    }

    return { content: [{ type: "text", text: formatResult(result) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    };
  }
});

async function main() {
  const token = requireEnv("GITLAB_TOKEN");
  const baseUrl = (process.env.GITLAB_URL || "").trim();

  const client = new GitLabClient(token, baseUrl);
  gitlabHandlers = new GitLabHandlers(client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
