import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getActiveEnvironment,
  setActiveEnvironment,
  ENVIRONMENTS,
  SalesforceEnvironment,
} from "../config.js";
import { getCurrentUser } from "../services/salesforce.js";
import { toJson } from "../services/formatting.js";
import { ToggleEnvironmentSchema, WhoAmISchema } from "../schemas/index.js";
import { McpToolResponse } from "../types.js";

export function registerEnvironmentTools(server: McpServer): void {
  // ── Get current environment status ──────────────────────────────────────────
  server.registerTool(
    "sf_get_environment",
    {
      title: "Get Active Salesforce Environment",
      description: `Returns the currently active Salesforce environment (sandbox or production) and its login URL.
Use this to confirm which environment you are operating against before executing queries.

Returns:
{
  "active": "sandbox" | "production",
  "login_url": string,       // The OAuth login URL for the active environment
  "available": { "sandbox": { "login_url": string }, "production": { "login_url": string } }
}`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (): Promise<McpToolResponse> => {
      const active = getActiveEnvironment();
      const output = {
        active,
        login_url: ENVIRONMENTS[active].loginUrl,
        available: {
          sandbox: { login_url: ENVIRONMENTS.sandbox.loginUrl },
          production: { login_url: ENVIRONMENTS.production.loginUrl },
        },
      };
      return {
        content: [
          {
            type: "text",
            text: `**Active Environment:** \`${active}\`\n**Login URL:** ${output.login_url}\n\nSandbox URL: ${ENVIRONMENTS.sandbox.loginUrl}\nProduction URL: ${ENVIRONMENTS.production.loginUrl}`,
          },
        ],
        structuredContent: output,
      };
    }
  );

  // ── Toggle environment ───────────────────────────────────────────────────────
  server.registerTool(
    "sf_toggle_environment",
    {
      title: "Toggle Salesforce Environment",
      description: `Switch the active Salesforce environment between sandbox and production.
⚠️  All subsequent tool calls will use the newly selected environment's login URL.

Args:
  - environment (required): "sandbox" | "production"

Returns:
  Confirmation message with the new active environment and login URL.`,
      inputSchema: ToggleEnvironmentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ environment }): Promise<McpToolResponse> => {
      const prev = getActiveEnvironment();
      setActiveEnvironment(environment as SalesforceEnvironment);
      const config = ENVIRONMENTS[environment as SalesforceEnvironment];
      return {
        content: [
          {
            type: "text",
            text: `✅ Environment switched **${prev} → ${environment}**\nLogin URL: ${config.loginUrl}`,
          },
        ],
        structuredContent: { previous: prev, active: environment, login_url: config.loginUrl },
      };
    }
  );

  // ── Who am I ─────────────────────────────────────────────────────────────────
  server.registerTool(
    "sf_whoami",
    {
      title: "Get Current Salesforce User",
      description: `Returns information about the Salesforce user whose access_token is provided.
Useful for verifying authentication and confirming user identity before running queries.

Args:
  - access_token (required): The user's Salesforce OAuth access token
  - instance_url (required): The user's Salesforce instance URL

Returns: User profile data including Id, Username, Email, Name, and org details.`,
      inputSchema: WhoAmISchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ access_token, instance_url }): Promise<McpToolResponse> => {
      const auth = { accessToken: access_token, instanceUrl: instance_url };
      const user = await getCurrentUser(auth);
      return {
        content: [{ type: "text", text: toJson(user) }],
        structuredContent: user as Record<string, unknown>,
      };
    }
  );
}
