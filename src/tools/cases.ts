import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createCase } from "../services/salesforce.js";
import { CreateCaseSchema } from "../schemas/index.js";
import { McpToolResponse, CaseRecord } from "../types.js";
import { getActiveEnvironment } from "../config.js";

export function registerCaseTools(server: McpServer): void {
  server.registerTool(
    "sf_create_case",
    {
      title: "Create Salesforce Case",
      description: `Create a new Case record in Salesforce.
⚠️  This is the ONLY write operation permitted by this MCP server. All other operations are read-only.
The Case is created under the authenticated user's identity, respecting their org permissions.

Args:
  - access_token (required): Salesforce OAuth access token of the user creating the case
  - instance_url (required): Salesforce instance URL
  - subject (required): Case subject / title (max 255 chars)
  - description (optional): Detailed description of the issue (max 32,000 chars)
  - status (optional, default "New"): "New" | "Working" | "Escalated" | "Closed"
  - priority (optional, default "Medium"): "High" | "Medium" | "Low"
  - origin (optional): "Phone" | "Email" | "Web"
  - account_id (optional): 18-char Account record ID to link the case to
  - contact_id (optional): 18-char Contact record ID to link the case to
  - type (optional): Case Type picklist value (org-specific)
  - reason (optional): Case Reason picklist value (org-specific)
  - custom_fields (optional): Object with additional custom field API names and values

Returns:
{
  "id": string,          // New Case record ID (18-char)
  "success": boolean,
  "case_number": string, // Auto-generated CaseNumber
  "environment": string  // Which environment was used
}

Examples:
  - "Create a high-priority web case for billing issue" →
      subject: "Billing Issue", priority: "High", origin: "Web"
  - "Log a case for account 001xx..." →
      subject: "Support Request", account_id: "001xx..."

Errors:
  - REQUIRED_FIELD_MISSING: subject is required
  - INVALID_ID: account_id or contact_id is not a valid record ID`,
      inputSchema: CreateCaseSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      access_token,
      instance_url,
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
      const auth = { accessToken: access_token, instanceUrl: instance_url };

      // Build the Case payload
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
        ...(custom_fields ? custom_fields : {}),
      };

      const result = await createCase(auth, caseData);
      const environment = getActiveEnvironment();

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create Case: ${result.errors.join("; ")}`,
            },
          ],
          structuredContent: { success: false, errors: result.errors },
        };
      }

      const output = {
        id: result.id,
        success: true,
        subject,
        environment,
        instance_url,
        view_url: `${instance_url}/${result.id}`,
      };

      return {
        content: [
          {
            type: "text",
            text: [
              `✅ **Case Created Successfully** (${environment})`,
              `**ID:** \`${result.id}\``,
              `**Subject:** ${subject}`,
              `**Priority:** ${priority ?? "Medium"} | **Status:** ${status ?? "New"}`,
              `**View in Salesforce:** ${instance_url}/${result.id}`,
            ].join("\n"),
          },
        ],
        structuredContent: output,
      };
    }
  );
}
