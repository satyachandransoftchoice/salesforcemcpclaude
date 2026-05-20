import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSoqlQuery, executeSoslSearch } from "../services/salesforce.js";
import { toJson, recordsToMarkdownTable, truncate } from "../services/formatting.js";
import { SoqlQuerySchema, SoslSearchSchema } from "../schemas/index.js";
import { McpToolResponse } from "../types.js";

export function registerQueryTools(server: McpServer): void {
  // ── SOQL ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "sf_query",
    {
      title: "Execute Salesforce SOQL Query",
      description: `Execute a read-only SOQL SELECT query against any Salesforce object the authenticated user has access to.
The server preserves the logged-in user's field-level and object-level sharing rules – results are scoped to what the user can see.
DML statements (INSERT, UPDATE, DELETE, UPSERT, MERGE) are blocked.

Args:
  - access_token (required): Salesforce OAuth access token
  - instance_url (required): Salesforce instance URL
  - soql (required): SELECT query, e.g. "SELECT Id, Name, Status FROM Case WHERE Status = 'New' LIMIT 50"
  - fetch_all_pages (boolean, default false): Auto-paginate to fetch all results
  - response_format ("markdown" | "json", default "markdown"): Output format

Returns (json):
{
  "totalSize": number,
  "done": boolean,
  "records": [ { ...fields } ],
  "nextRecordsUrl": string | null
}

Returns (markdown): Formatted table of records.

Examples:
  - "Show me all open cases" → soql: "SELECT Id, CaseNumber, Subject, Status, Priority FROM Case WHERE Status != 'Closed' LIMIT 100"
  - "Get contacts for Acme" → soql: "SELECT Id, FirstName, LastName, Email FROM Contact WHERE Account.Name = 'Acme Corp'"
  - "Recent opportunities" → soql: "SELECT Id, Name, StageName, Amount FROM Opportunity ORDER BY CreatedDate DESC LIMIT 20"

Errors:
  - INVALID_FIELD: Check object/field API names with sf_describe_object
  - INVALID_TYPE: Object does not exist or user has no access`,
      inputSchema: SoqlQuerySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ access_token, instance_url, soql, fetch_all_pages, response_format }): Promise<McpToolResponse> => {
      const auth = { accessToken: access_token, instanceUrl: instance_url };
      const result = await executeSoqlQuery(auth, soql, fetch_all_pages);

      if (response_format === "json") {
        return {
          content: [{ type: "text", text: toJson(result) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      }

      const header = `**Total records:** ${result.totalSize} | **Fetched:** ${result.records.length} | **Done:** ${result.done}`;
      const table = recordsToMarkdownTable(result.records as Record<string, unknown>[]);
      return {
        content: [{ type: "text", text: truncate(`${header}\n\n${table}`) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );

  // ── SOSL ──────────────────────────────────────────────────────────────────────
  server.registerTool(
    "sf_search",
    {
      title: "Salesforce SOSL Full-Text Search",
      description: `Execute a Salesforce Object Search Language (SOSL) full-text search across one or more objects.
Useful when you have a keyword and want to find it across multiple object types simultaneously.

Args:
  - access_token (required): Salesforce OAuth access token
  - instance_url (required): Salesforce instance URL
  - search_term (required): Text to search, e.g. "Acme" or "billing issue"
  - objects (optional): Restrict search to specific object types, e.g. ["Account", "Contact", "Case"]

Returns: JSON with searchRecords array grouped by object type.

Examples:
  - "Find everything about Contoso" → search_term: "Contoso"
  - "Search for billing issues in Cases and Accounts" → search_term: "billing issue", objects: ["Case", "Account"]`,
      inputSchema: SoslSearchSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ access_token, instance_url, search_term, objects }): Promise<McpToolResponse> => {
      const auth = { accessToken: access_token, instanceUrl: instance_url };
      const escapedTerm = search_term.replace(/['"\\]/g, "\\$&");
      const objectClause = objects && objects.length > 0
        ? ` RETURNING ${objects.map((o) => `${o}(Id, Name)`).join(", ")}`
        : "";
      const sosl = `FIND {${escapedTerm}} IN ALL FIELDS${objectClause}`;
      const result = await executeSoslSearch(auth, sosl);
      return {
        content: [{ type: "text", text: toJson(result) }],
        structuredContent: result,
      };
    }
  );
}
