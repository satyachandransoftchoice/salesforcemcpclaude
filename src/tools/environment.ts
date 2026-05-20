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
import { getAuthContext } from "../auth-context.js";
import { McpToolResponse } from "../types.js";

export function registerEnvironmentTools(server: McpServer): void {
  server.registerTool(
    "sf_get_environment",
    {
      title: "Get Active Salesforce Environment",
      description: `Returns the currently active Salesforce environment (sandbox or production) and login URL.`,
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
      return {
        content: [
          {
            type: "text",
            text: `**Active Environment:** \`${active}\`\n**Login URL:** ${ENVIRONMENTS[active].loginUrl}\n\nSandbox URL: ${ENVIRONMENTS.sandbox.loginUrl}\nProduction URL: ${ENVIRONMENTS.production.loginUrl}`,
          },
        ],
        structuredContent: {
          active,
          login_url: ENVIRONMENTS[active].loginUrl,
        },
      };
    }
  );

  server.registerTool(
    "sf_toggle_environment",
    {
      title: "Toggle Salesforce Environment",
      description: `Switch the active Salesforce environment between sandbox and production.
⚠️ All subsequent connections (new OAuth flows) will use the newly selected environment.`,
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
      return {
        content: [
          {
            type: "text",
            text: `✅ Environment switched **${prev} → ${environment}**\nLogin URL: ${ENVIRONMENTS[environment as SalesforceEnvironment].loginUrl}`,
          },
        ],
        structuredContent: { previous: prev, active: environment },
      };
    }
  );

  server.registerTool(
    "sf_whoami",
    {
      title: "Get Current Salesforce User",
      description: `Returns information about the connected Salesforce user (the one who authenticated via OAuth).
Use this to confirm authentication and identity.`,
      inputSchema: WhoAmISchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (): Promise<McpToolResponse> => {
      const auth = getAuthContext();
      const user = await getCurrentUser(auth);
      return {
        content: [{ type: "text", text: toJson(user) }],
        structuredContent: user as Record<string, unknown>,
      };
    }
  );
}
