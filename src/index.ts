import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response } from "express";

import { SERVER_PORT, getActiveEnvironment } from "./config.js";
import { registerEnvironmentTools } from "./tools/environment.js";
import { registerQueryTools } from "./tools/query.js";
import { registerDescribeTools } from "./tools/describe.js";
import { registerCaseTools } from "./tools/cases.js";

// ─── Build the MCP server ─────────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({
    name: "salesforce-mcp-server",
    version: "1.0.0",
  });

  registerEnvironmentTools(server);
  registerQueryTools(server);
  registerDescribeTools(server);
  registerCaseTools(server);

  return server;
}

// ─── HTTP transport (for remote / org deployment) ────────────────────────────

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Health / info endpoint
  app.get("/", (_req: Request, res: Response) => {
    res.json({
      name: "salesforce-mcp-server",
      version: "1.0.0",
      environment: getActiveEnvironment(),
      status: "ok",
      transport: "streamable-http",
      mcp_endpoint: "/mcp",
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", environment: getActiveEnvironment() });
  });

  // MCP endpoint – stateless: a fresh server + transport per request
  // so each caller's access_token is isolated and never shared
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => transport.close());

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: String(err) });
      }
    }
  });

  app.listen(SERVER_PORT, () => {
    console.error(
      `[salesforce-mcp-server] HTTP transport listening on http://localhost:${SERVER_PORT}/mcp`
    );
    console.error(
      `[salesforce-mcp-server] Active environment: ${getActiveEnvironment()}`
    );
  });
}

// ─── stdio transport (for local Claude Desktop / claude.ai claude-code use) ───

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[salesforce-mcp-server] stdio transport ready. Active environment: ${getActiveEnvironment()}`
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const mode = (process.env.TRANSPORT || "stdio").toLowerCase();

if (mode === "http") {
  runHttp().catch((err) => {
    console.error("[salesforce-mcp-server] Fatal error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    console.error("[salesforce-mcp-server] Fatal error:", err);
    process.exit(1);
  });
}
