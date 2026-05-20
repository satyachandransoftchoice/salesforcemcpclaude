import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSoqlQuery, executeSoslSearch } from "../services/salesforce.js";
import { toJson, recordsToMarkdownTable, truncate } from "../services/formatting.js";
import { SoqlQuerySchema, SoslSearchSchema } from "../schemas/index.js";
import { getAuthContext } from "../auth-context.js";
import { McpToolResponse } from "../types.js";

export function registerQueryTools(server: McpServer): void {
  server.registerTool(
    "sf_query",
    {
      title: "Execute Salesforce SOQL Query",
      description: `Execute a read-only SOQL SELECT query against any object the connected user can access.
The query runs under the authenticated user's permissions – field-level security and sharing rules apply.
DML statements (INSERT/UPDATE/DELETE/UPSERT/MERGE) are blocked.

Args:
  - soql (required): SELECT statement, e.g. "SELECT Id, Name FROM Account LIMIT 10"
  - fetch_all_pages (default false): Auto-paginate
  - response_format ("markdown" | "json", default "markdown")

Examples:
  - "Show me all open cases" → soql: "SELECT Id, CaseNumber, Subject, Status FROM Case WHERE Status != 'Closed' LIMIT 100"
  - "Get contacts at Acme" → soql: "SELECT Id, Name, Email FROM Contact WHERE Account.Name = 'Acme Corp'"
  - "Recent opportunities" → soql: "SELECT Id, Name, StageName, Amount FROM Opportunity ORDER BY CreatedDate DESC LIMIT 20"`,
      inputSchema: SoqlQuerySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ soql, fetch_all_pages, response_format }): Promise<McpToolResponse> => {
      const auth = getAuthContext();
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

  server.registerTool(
    "sf_search",
    {
      title: "Salesforce SOSL Full-Text Search",
      description: `Execute a SOSL full-text search across one or more Salesforce objects.
Useful for keyword searches across multiple object types.

Args:
  - search_term (required): Text to search, e.g. "Acme" or "billing issue"
  - objects (optional): Restrict to specific types, e.g. ["Account","Contact","Case"]

Examples:
  - "Find everything about Contoso" → search_term: "Contoso"
  - "Search for billing issues" → search_term: "billing", objects: ["Case", "Account"]`,
      inputSchema: SoslSearchSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ search_term, objects }): Promise<McpToolResponse> => {
      const auth = getAuthContext();
      const escaped = search_term.replace(/['"\\]/g, "\\$&");
      const objectClause =
        objects && objects.length > 0
          ? ` RETURNING ${objects.map((o) => `${o}(Id, Name)`).join(", ")}`
          : "";
      const sosl = `FIND {${escaped}} IN ALL FIELDS${objectClause}`;
      const result = await executeSoslSearch(auth, sosl);
      return {
        content: [{ type: "text", text: toJson(result) }],
        structuredContent: result,
      };
    }
  );
}
