import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const servicePort = (process.env.SERVICE_PORT || "8080").trim();
const baseUrl = `http://127.0.0.1:${servicePort}`;

const server = new Server(
  {
    name: "gitlab-mr-service-mcp-node",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

let serviceProc = null;
let serviceStderr = "";

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function resolveServiceDir() {
  const explicit = process.env.GITLAB_MR_SERVICE_DIR;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const home = process.env.HOME;
  if (!home || !home.trim()) {
    throw new Error(
      "GITLAB_MR_SERVICE_DIR or HOME must be set to locate tools/gitlab-mr-service",
    );
  }

  return path.join(home.trim(), ".config", "opencode", "tools", "gitlab-mr-service");
}

function parseObject(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
}

function getArgString(args, key, defaultValue = "") {
  const value = args[key];
  return typeof value === "string" ? value : defaultValue;
}

function getArgNumber(args, key, defaultValue = 0) {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return defaultValue;
}

function getArgBoolean(args, key, defaultValue = false) {
  const value = args[key];
  if (typeof value === "boolean") {
    return value;
  }
  return defaultValue;
}

function formatResult(data) {
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(data, null, 2);
}

function startService() {
  const cwd = resolveServiceDir();
  const env = {
    ...process.env,
    SERVER_PORT: servicePort,
  };

  const proc = spawn("go", ["run", "./main.go"], {
    cwd,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });

  proc.stderr?.on("data", (chunk) => {
    serviceStderr += String(chunk);
    if (serviceStderr.length > 16000) {
      serviceStderr = serviceStderr.slice(-16000);
    }
  });

  return proc;
}

async function waitForHealth(timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (serviceProc && serviceProc.exitCode !== null) {
      const suffix = serviceStderr
        ? `\nService stderr:\n${serviceStderr.trimEnd()}`
        : "";
      throw new Error(`gitlab-mr-service exited before health check${suffix}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }

    await sleep(250);
  }

  const suffix = serviceStderr ? `\nLast stderr:\n${serviceStderr.trimEnd()}` : "";
  throw new Error(`gitlab-mr-service did not become healthy in time${suffix}`);
}

async function serviceCall(method, endpointPath, query = null, body = null) {
  const url = new URL(endpointPath, baseUrl);

  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {};
  let payload;
  if (body !== null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function resolveGitLabApiBaseUrl() {
  const rawBase = (process.env.GITLAB_URL || "https://gitlab.com").trim();
  const base = rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;

  if (base.endsWith("/api/v4")) {
    return base;
  }

  return `${base}/api/v4`;
}

async function gitlabApiCall(method, endpointPath, body = null) {
  const token = requireEnv("GITLAB_TOKEN");
  const url = `${resolveGitLabApiBaseUrl()}${endpointPath}`;
  const headers = {
    "PRIVATE-TOKEN": token,
  };

  let payload;
  if (body !== null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function cleanupService() {
  if (!serviceProc || serviceProc.exitCode !== null) {
    return;
  }

  serviceProc.kill("SIGTERM");
  setTimeout(() => {
    if (serviceProc && serviceProc.exitCode === null) {
      serviceProc.kill("SIGKILL");
    }
  }, 5000).unref();
}

function registerCleanupHooks() {
  process.on("exit", cleanupService);
  process.on("SIGINT", () => {
    cleanupService();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanupService();
    process.exit(0);
  });
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
  const args = parseObject(request.params.arguments);
  const name = request.params.name;

  try {
    if (name === "mr_list") {
      const projectId = getArgString(args, "project_id");
      const perPage = getArgNumber(args, "per_page", 0);
      const page = getArgNumber(args, "page", 0);
      const result = await serviceCall(
        "GET",
        `/projects/${encodeURIComponent(projectId)}/merge_requests`,
        {
          state: getArgString(args, "state", ""),
          order_by: getArgString(args, "order_by", ""),
          sort: getArgString(args, "sort", ""),
          source_branch: getArgString(args, "source_branch", ""),
          target_branch: getArgString(args, "target_branch", ""),
          per_page: perPage > 0 ? perPage : null,
          page: page > 0 ? page : null,
        },
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "mr_get") {
      const projectId = getArgString(args, "project_id");
      const mrIid = getArgNumber(args, "mr_iid", 0);
      const result = await serviceCall(
        "GET",
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}`,
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "mr_create") {
      const projectId = getArgString(args, "project_id");
      const assigneeId = getArgNumber(args, "assignee_id", 0);
      const targetProjectId = getArgNumber(args, "target_project_id", 0);
      const result = await serviceCall(
        "POST",
        `/projects/${encodeURIComponent(projectId)}/merge_requests`,
        null,
        {
          source_branch: getArgString(args, "source_branch"),
          target_branch: getArgString(args, "target_branch"),
          title: getArgString(args, "title"),
          description: getArgString(args, "description", ""),
          assignee_id: assigneeId > 0 ? assigneeId : null,
          target_project_id: targetProjectId > 0 ? targetProjectId : null,
          remove_source_branch: getArgBoolean(args, "remove_source_branch", false),
          squash: getArgBoolean(args, "squash", false),
        },
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "mr_add_note") {
      const projectId = getArgString(args, "project_id");
      const mrIid = getArgNumber(args, "mr_iid", 0);
      const result = await serviceCall(
        "POST",
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/notes`,
        null,
        {
          body: getArgString(args, "body"),
        },
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "mr_get_diffs") {
      const projectId = getArgString(args, "project_id");
      const mrIid = getArgNumber(args, "mr_iid", 0);
      const includeChanges = getArgBoolean(args, "include_changes", false);
      const result = await serviceCall(
        "GET",
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/diffs`,
        {
          include_changes: String(includeChanges),
        },
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "mr_get_jobs") {
      const projectId = getArgString(args, "project_id");
      const mrIid = getArgNumber(args, "mr_iid", 0);
      const result = await serviceCall(
        "GET",
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/jobs`,
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "pipeline_get_jobs") {
      const projectId = getArgString(args, "project_id");
      const pipelineId = getArgNumber(args, "pipeline_id", 0);
      const result = await serviceCall(
        "GET",
        `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}/jobs`,
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "mr_get_discussions") {
      const projectId = getArgString(args, "project_id");
      const mrIid = getArgNumber(args, "mr_iid", 0);
      const result = await serviceCall(
        "GET",
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/discussions`,
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    if (name === "mr_get_participants") {
      const projectId = getArgString(args, "project_id");
      const mrIid = getArgNumber(args, "mr_iid", 0);
      const result = await serviceCall(
        "GET",
        `/projects/${encodeURIComponent(projectId)}/merge_requests/${mrIid}/participants`,
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    };
  }
});

async function main() {
  requireEnv("GITLAB_TOKEN");

  serviceProc = startService();
  registerCleanupHooks();
  await waitForHealth();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  cleanupService();
  process.exit(1);
});
