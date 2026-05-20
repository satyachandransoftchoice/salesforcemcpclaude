import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createCase } from "../services/salesforce.js";
import { CreateCaseSchema } from "../schemas/index.js";
import { getAuthContext } from "../auth-context.js";
import { getActiveEnvironment } from "../config.js";
import { McpToolResponse, CaseRecord } from "../types.js";

export function registerCaseTools(server: McpServer): void {
  server.registerTool(
    "sf_create_case",
    {
      title: "Create Salesforce Case",
      description: `Create a new Case record in Salesforce.
⚠️ This is the ONLY write operation in this MCP server. All other tools are read-only.
The Case is created under the authenticated user's identity, respecting their org permissions.

Args:
  - subject (required): Case title, max 255 chars
  - description (optional): Detailed text, max 32k chars
  - status (default "New"): "New" | "Working" | "Escalated" | "Closed"
  - priority (default "Medium"): "High" | "Medium" | "Low"
  - origin (optional): "Phone" | "Email" | "Web"
  - account_id / contact_id (optional): Link to a related record
  - type / reason (optional): Org-specific picklist values
  - custom_fields (optional): Map of API name → value for any custom fields

Returns: New Case ID, CaseNumber, and a deep link to view it in Salesforce.

Examples:
  - "Log a high-priority web case for a billing problem"
  - "Create a support case linked to account 001xx..."`,
      inputSchema: CreateCaseSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      subject,
      description,
      status,
      priority,
      origin,
      account_id,
      contact_id,
      type,
      reason,
      custom_fields,
    }): Promise<McpToolResponse> => {
      const auth = getAuthContext();
      const caseData: CaseRecord = {
        Subject: subject,
        ...(description ? { Description: description } : {}),
        ...(status ? { Status: status } : {}),
        ...(priority ? { Priority: priority } : {}),
        ...(origin ? { Origin: origin } : {}),
        ...(account_id ? { AccountId: account_id } : {}),
        ...(contact_id ? { ContactId: contact_id } : {}),
        ...(type ? { Type: type } : {}),
        ...(reason ? { Reason: reason } : {}),
        ...(custom_fields || {}),
      };
      const result = await createCase(auth, caseData);
      const environment = getActiveEnvironment();
      if (!result.success) {
        return {
          content: [
            { type: "text", text: `❌ Failed to create Case: ${result.errors.join("; ")}` },
          ],
          structuredContent: { success: false, errors: result.errors },
        };
      }
      return {
        content: [
          {
            type: "text",
            text: [
              `✅ **Case Created Successfully** (${environment})`,
              `**ID:** \`${result.id}\``,
              `**Subject:** ${subject}`,
              `**Priority:** ${priority ?? "Medium"} | **Status:** ${status ?? "New"}`,
              `**View in Salesforce:** ${auth.instanceUrl}/${result.id}`,
            ].join("\n"),
          },
        ],
        structuredContent: {
          id: result.id,
          success: true,
          subject,
          environment,
          view_url: `${auth.instanceUrl}/${result.id}`,
        },
      };
    }
  );
}
