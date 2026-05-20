import { z } from "zod";

// ─── Environment toggle ──────────────────────────────────────────────────────
export const EnvironmentSchema = z.enum(["sandbox", "production"]).describe(
  "Target environment: 'sandbox' or 'production'"
);

export const ToggleEnvironmentSchema = z.object({
  environment: EnvironmentSchema,
});

// ─── SOQL Query ──────────────────────────────────────────────────────────────
export const SoqlQuerySchema = z.object({
  soql: z
    .string()
    .min(10)
    .refine(
      (q) => !/(INSERT|UPDATE|DELETE|UPSERT|MERGE)\s/i.test(q),
      "DML statements are not allowed – this server is read-only (except Case creation)"
    )
    .describe("SOQL SELECT query, e.g. 'SELECT Id, Name FROM Account LIMIT 10'"),
  fetch_all_pages: z
    .boolean()
    .default(false)
    .describe("Auto-paginate to fetch all results"),
  response_format: z
    .enum(["json", "markdown"])
    .default("markdown")
    .describe("Output format"),
});

// ─── SOSL Search ─────────────────────────────────────────────────────────────
export const SoslSearchSchema = z.object({
  search_term: z.string().min(2).describe("Text to search across Salesforce objects"),
  objects: z
    .array(z.string())
    .optional()
    .describe("Optional list of object types to scope search, e.g. ['Account','Contact']"),
});

// ─── Describe ────────────────────────────────────────────────────────────────
export const DescribeObjectSchema = z.object({
  object_name: z.string().min(1).describe("API name of the SObject, e.g. Account, Case"),
  include_fields: z.boolean().default(true).describe("Include the fields table"),
});

export const ListObjectsSchema = z.object({
  queryable_only: z.boolean().default(true).describe("Only return queryable objects"),
  filter: z.string().optional().describe("Case-insensitive substring filter on name/label"),
});

// ─── Get Record ──────────────────────────────────────────────────────────────
export const GetRecordSchema = z.object({
  object_name: z.string().min(1).describe("API name of the SObject"),
  record_id: z.string().min(15).describe("15 or 18-character Salesforce record ID"),
  fields: z.array(z.string()).optional().describe("Specific fields to retrieve"),
  response_format: z.enum(["json", "markdown"]).default("markdown"),
});

// ─── Create Case ─────────────────────────────────────────────────────────────
export const CreateCaseSchema = z.object({
  subject: z.string().min(1).max(255).describe("Case subject / title (required)"),
  description: z.string().max(32_000).optional().describe("Detailed description"),
  status: z
    .enum(["New", "Working", "Escalated", "Closed"])
    .default("New")
    .describe("Case status"),
  priority: z
    .enum(["High", "Medium", "Low"])
    .default("Medium")
    .describe("Case priority"),
  origin: z.enum(["Phone", "Email", "Web"]).optional().describe("Case origin channel"),
  account_id: z.string().optional().describe("Related Account record ID"),
  contact_id: z.string().optional().describe("Related Contact record ID"),
  type: z.string().optional().describe("Case Type picklist value"),
  reason: z.string().optional().describe("Case Reason picklist value"),
  custom_fields: z
    .record(z.unknown())
    .optional()
    .describe("Additional custom field name/value pairs"),
});

// ─── Who Am I (no params) ────────────────────────────────────────────────────
export const WhoAmISchema = z.object({});
