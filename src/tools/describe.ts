import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describeSObject, describeGlobal, getRecord } from "../services/salesforce.js";
import {
  toJson,
  fieldsToMarkdownTable,
  truncate,
} from "../services/formatting.js";
import {
  DescribeObjectSchema,
  ListObjectsSchema,
  GetRecordSchema,
} from "../schemas/index.js";
import { McpToolResponse } from "../types.js";

export function registerDescribeTools(server: McpServer): void {
  // ── List all objects ──────────────────────────────────────────────────────────
  server.registerTool(
    "sf_list_objects",
    {
      title: "List Salesforce Objects",
      description: `List all SObjects available in the Salesforce org that the authenticated user can access.
Returns metadata about each object including its API name, label, and capabilities.

Args:
  - access_token (required): Salesforce OAuth access token
  - instance_url (required): Salesforce instance URL
  - queryable_only (boolean, default true): Filter to only queryable objects
  - filter (optional): Case-insensitive substring to filter on object name or label

Returns: Table with columns: Name | Label | Queryable | Createable | Updateable

Examples:
  - "What objects are available?" → queryable_only: true
  - "Find custom objects" → filter: "__c"
  - "Is there a Contract object?" → filter: "contract"`,
      inputSchema: ListObjectsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      access_token,
      instance_url,
      queryable_only,
      filter,
    }): Promise<McpToolResponse> => {
      const auth = { accessToken: access_token, instanceUrl: instance_url };
      const global = await describeGlobal(auth);
      let objects = global.sobjects;

      if (queryable_only) objects = objects.filter((o) => o.queryable);
      if (filter) {
        const lc = filter.toLowerCase();
        objects = objects.filter(
          (o) =>
            o.name.toLowerCase().includes(lc) ||
            o.label.toLowerCase().includes(lc)
        );
      }

      const header = `**Total objects:** ${objects.length}`;
      const table = [
        "| Name | Label | Queryable | Createable | Updateable |",
        "| --- | --- | --- | --- | --- |",
        ...objects.map(
          (o) =>
            `| ${o.name} | ${o.label} | ${o.queryable ? "✅" : "❌"} | ${
              o.createable ? "✅" : "❌"
            } | ${o.updateable ? "✅" : "❌"} |`
        ),
      ].join("\n");

      return {
        content: [{ type: "text", text: truncate(`${header}\n\n${table}`) }],
        structuredContent: {
          total: objects.length,
          objects,
        } as unknown as Record<string, unknown>,
      };
    }
  );

  // ── Describe a single object ──────────────────────────────────────────────────
  server.registerTool(
    "sf_describe_object",
    {
      title: "Describe Salesforce Object Schema",
      description: `Get the full schema definition for a Salesforce SObject, including all fields, types, and permissions.
Use this before writing SOQL queries to confirm field API names and types.

Args:
  - access_token (required): Salesforce OAuth access token
  - instance_url (required): Salesforce instance URL
  - object_name (required): API name of the object, e.g. "Account", "Case", "MyObject__c"
  - include_fields (boolean, default true): Include the fields table

Returns:
  - Object metadata: name, label, keyPrefix, queryable, createable, updateable
  - Fields table: Name | Label | Type | Createable | Updateable | Nillable

Examples:
  - "What fields does Case have?" → object_name: "Case"
  - "Show Account schema" → object_name: "Account"`,
      inputSchema: DescribeObjectSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      access_token,
      instance_url,
      object_name,
      include_fields,
    }): Promise<McpToolResponse> => {
      const auth = { accessToken: access_token, instanceUrl: instance_url };
      const describe = await describeSObject(auth, object_name);

      const meta = [
        `## ${describe.label} (\`${describe.name}\`)`,
        `**Label Plural:** ${describe.labelPlural}`,
        `**Key Prefix:** ${describe.keyPrefix ?? "N/A"}`,
        `**Queryable:** ${describe.queryable ? "✅" : "❌"}  |  **Createable:** ${
          describe.createable ? "✅" : "❌"
        }  |  **Updateable:** ${describe.updateable ? "✅" : "❌"}`,
        `**Total Fields:** ${describe.fields.length}`,
      ].join("\n");

      const fieldsMarkdown = include_fields
        ? `\n\n### Fields\n${fieldsToMarkdownTable(describe.fields)}`
        : "";

      return {
        content: [{ type: "text", text: truncate(meta + fieldsMarkdown) }],
        structuredContent: {
          name: describe.name,
          label: describe.label,
          fieldCount: describe.fields.length,
        },
      };
    }
  );

  // ── Get a single record by ID ─────────────────────────────────────────────────
  server.registerTool(
    "sf_get_record",
    {
      title: "Get Salesforce Record by ID",
      description: `Retrieve a single Salesforce record by its record ID from any object the authenticated user can access.

Args:
  - access_token (required): Salesforce OAuth access token
  - instance_url (required): Salesforce instance URL
  - object_name (required): API name of the object, e.g. "Account", "Case"
  - record_id (required): 15 or 18-character Salesforce record ID
  - fields (optional): Specific fields to retrieve. Omit for all readable fields.
  - response_format ("markdown" | "json", default "markdown")

Returns: Record as key-value list (markdown) or JSON object.

Examples:
  - "Get Case 5003..." → object_name: "Case", record_id: "5003..."
  - "Show Account 001..." → object_name: "Account", record_id: "001..."`,
      inputSchema: GetRecordSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      access_token,
      instance_url,
      object_name,
      record_id,
      fields,
      response_format,
    }): Promise<McpToolResponse> => {
      const auth = { accessToken: access_token, instanceUrl: instance_url };
      const record = await getRecord(auth, object_name, record_id, fields);

      if (response_format === "json") {
        return {
          content: [{ type: "text", text: toJson(record) }],
          structuredContent: record,
        };
      }

      const lines = Object.entries(record)
        .filter(([k]) => k !== "attributes")
        .map(
          ([k, v]) => `**${k}:** ${v === null || v === undefined ? "_null_" : String(v)}`
        );

      return {
        content: [
          {
            type: "text",
            text: truncate(
              `## ${object_name} Record: \`${record_id}\`\n\n${lines.join("\n")}`
            ),
          },
        ],
        structuredContent: record,
      };
    }
  );
}
