import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response, NextFunction } from "express";

import { SERVER_PORT, getActiveEnvironment } from "./config.js";
import { registerEnvironmentTools } from "./tools/environment.js";
import { registerQueryTools } from "./tools/query.js";
import { registerDescribeTools } from "./tools/describe.js";
import { registerCaseTools } from "./tools/cases.js";
import { authContext } from "./auth-context.js";
import { createOAuthRouter, resolveBearerToken } from "./oauth.js";

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

// ─── HTTP transport with OAuth ────────────────────────────────────────────────
async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ extended: true }));

  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${SERVER_PORT}`;

  // Info / health
  app.get("/", (_req: Request, res: Response) => {
    res.json({
      name: "salesforce-mcp-server",
      version: "1.0.0",
      environment: getActiveEnvironment(),
      mcp_endpoint: `${publicBaseUrl}/mcp`,
      docs: "https://github.com/satyachandransoftchoice/salesforcemcpclaude",
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", environment: getActiveEnvironment() });
  });

  // OAuth routes (.well-known, /oauth/authorize, /oauth/callback, /oauth/token, /oauth/register)
  app.use(createOAuthRouter(publicBaseUrl));

  // Bearer token middleware for /mcp – resolves caller's Salesforce credentials
  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.header("authorization") || req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      // Standard MCP 401 with WWW-Authenticate pointing at our auth server metadata
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="${publicBaseUrl}", resource_metadata="${publicBaseUrl}/.well-known/oauth-protected-resource"`
      );
      res.status(401).json({ error: "unauthorized", error_description: "Bearer token required" });
      return;
    }
    const token = authHeader.slice("Bearer ".length).trim();
    const resolved = resolveBearerToken(token);
    if (!resolved) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="${publicBaseUrl}", error="invalid_token"`
      );
      res.status(401).json({ error: "invalid_token", error_description: "Token expired or unknown" });
      return;
    }
    // Stash the user's SF credentials into AsyncLocalStorage for tool handlers
    authContext.run(
      { accessToken: resolved.sfAccessToken, instanceUrl: resolved.sfInstanceUrl },
      () => next()
    );
  }

  // MCP endpoint – stateless: a fresh server + transport per request
  app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
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
    console.error(`[salesforce-mcp] HTTP transport on ${publicBaseUrl}`);
    console.error(`[salesforce-mcp] MCP endpoint: ${publicBaseUrl}/mcp`);
    console.error(`[salesforce-mcp] Active environment: ${getActiveEnvironment()}`);
  });
}

// ─── stdio transport (local dev / Claude Desktop) ─────────────────────────────
// In stdio mode the user provides tokens via env vars and we set them once.
async function runStdio(): Promise<void> {
  const sfAccessToken = process.env.SF_ACCESS_TOKEN;
  const sfInstanceUrl = process.env.SF_INSTANCE_URL;
  if (!sfAccessToken || !sfInstanceUrl) {
    console.error(
      "[salesforce-mcp] stdio mode requires SF_ACCESS_TOKEN and SF_INSTANCE_URL env vars."
    );
    process.exit(1);
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  authContext.run(
    { accessToken: sfAccessToken, instanceUrl: sfInstanceUrl },
    async () => {
      await server.connect(transport);
      console.error(
        `[salesforce-mcp] stdio ready. Active environment: ${getActiveEnvironment()}`
      );
    }
  );
}

const mode = (process.env.TRANSPORT || "http").toLowerCase();
if (mode === "stdio") {
  runStdio().catch((err) => {
    console.error("[salesforce-mcp] Fatal error:", err);
    process.exit(1);
  });
} else {
  runHttp().catch((err) => {
    console.error("[salesforce-mcp] Fatal error:", err);
    process.exit(1);
  });
}
