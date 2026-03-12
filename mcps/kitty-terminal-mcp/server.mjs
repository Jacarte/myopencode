import { execFileSync } from "node:child_process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "kitty-terminal-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

function requireListenOn() {
  const value = process.env.KITTY_LISTEN_ON;
  if (!value || !value.trim()) {
    throw new Error(
      "KITTY_LISTEN_ON is required. Example: unix:/tmp/kitty-opencode.sock",
    );
  }
  return value.trim();
}

function runKitty(args) {
  const listenOn = requireListenOn();
  const kittyArgs = ["@", "--to", listenOn, ...args];
  const out = execFileSync("kitty", kittyArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
  return out;
}

function parseObject(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
}

function getArgString(args, key, defaultValue = "") {
  const v = args[key];
  return typeof v === "string" ? v : defaultValue;
}

function getArgNumber(args, key, defaultValue) {
  const v = args[key];
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  return defaultValue;
}

function getArgBoolean(args, key, defaultValue = false) {
  const v = args[key];
  if (typeof v === "boolean") {
    return v;
  }
  return defaultValue;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "kitty_list_windows",
        description:
          "List kitty OS windows/tabs/windows as JSON (kitty @ ls).",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "kitty_get_text",
        description:
          "Get text from kitty terminal windows (kitty @ get-text).",
        inputSchema: {
          type: "object",
          properties: {
            extent: {
              type: "string",
              description: "screen | all | selection",
              enum: ["screen", "all", "selection"],
            },
            match: {
              type: "string",
              description:
                "Optional kitty window match expression, e.g. 'id:3'.",
            },
            ansi: {
              type: "boolean",
              description: "Include ANSI escapes.",
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: "kitty_get_last_lines",
        description:
          "Get the last N lines from kitty text output for quick log tailing.",
        inputSchema: {
          type: "object",
          properties: {
            lines: {
              type: "number",
              description: "Number of lines to return (default 200).",
              minimum: 1,
              maximum: 5000,
            },
            extent: {
              type: "string",
              description: "screen | all | selection",
              enum: ["screen", "all", "selection"],
            },
            match: {
              type: "string",
              description:
                "Optional kitty window match expression, e.g. 'title:server'.",
            },
          },
          additionalProperties: false,
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = parseObject(request.params.arguments);

  try {
    if (name === "kitty_list_windows") {
      const output = runKitty(["ls"]);
      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    }

    if (name === "kitty_get_text") {
      const extent = getArgString(args, "extent", "all");
      const match = getArgString(args, "match", "");
      const ansi = getArgBoolean(args, "ansi", false);

      const cmd = ["get-text", "--extent", extent];
      if (ansi) {
        cmd.push("--ansi");
      }
      if (match) {
        cmd.push("--match", match);
      }

      const output = runKitty(cmd);
      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    }

    if (name === "kitty_get_last_lines") {
      const lines = Math.max(1, Math.min(5000, getArgNumber(args, "lines", 200)));
      const extent = getArgString(args, "extent", "all");
      const match = getArgString(args, "match", "");

      const cmd = ["get-text", "--extent", extent];
      if (match) {
        cmd.push("--match", match);
      }

      const output = runKitty(cmd);
      const chunks = output.split(/\r?\n/);
      const tail = chunks.slice(Math.max(0, chunks.length - lines)).join("\n");

      return {
        content: [
          {
            type: "text",
            text: tail,
          },
        ],
      };
    }

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
