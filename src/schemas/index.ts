import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const UserAuthSchema = z.object({
  access_token: z
    .string()
    .min(1, "access_token is required – pass the Salesforce OAuth access token"),
  instance_url: z
    .string()
    .url("instance_url must be a valid URL, e.g. https://yourorg.my.salesforce.com"),
});

// ─── Environment ──────────────────────────────────────────────────────────────

export const EnvironmentSchema = z.enum(["sandbox", "production"]).describe(
  "Target environment: 'sandbox' (test.salesforce.com) or 'production'"
);

// ─── SOQL ─────────────────────────────────────────────────────────────────────

export const SoqlQuerySchema = z.object({
  access_token: z.string().min(1).describe("Salesforce OAuth access token"),
  instance_url: z.string().url().describe("Salesforce instance URL"),
  soql: z
    .string()
    .min(10, "SOQL must be at least 10 characters")
    .refine(
      (q) => !/(INSERT|UPDATE|DELETE|UPSERT|MERGE)/i.test(q),
      "DML statements are not allowed – this server is read-only (except Case creation)"
    )
    .describe("SOQL SELECT query, e.g. SELECT Id, Name FROM Account LIMIT 10"),
  fetch_all_pages: z
    .boolean()
    .default(false)
    .describe("If true, automatically fetches all result pages"),
  response_format: z
    .enum(["json", "markdown"])
    .default("markdown")
    .describe("Output format"),
});

// ─── SOSL ─────────────────────────────────────────────────────────────────────

export const SoslSearchSchema = z.object({
  access_token: z.string().min(1).describe("Salesforce OAuth access token"),
  instance_url: z.string().url().describe("Salesforce instance URL"),
  search_term: z
    .string()
    .min(2)
    .describe("Text to search for across Salesforce objects"),
  objects: z
    .array(z.string())
    .optional()
    .describe("Optional list of objects to scope the search, e.g. ['Account','Contact']"),
});

// ─── Describe ─────────────────────────────────────────────────────────────────

export const DescribeObjectSchema = z.object({
  access_token: z.string().min(1).describe("Salesforce OAuth access token"),
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_name: z
    .string()
    .min(1)
    .describe("API name of the SObject, e.g. Account, Contact, Opportunity"),
  include_fields: z
    .boolean()
    .default(true)
    .describe("Include field definitions in the response"),
});

export const ListObjectsSchema = z.object({
  access_token: z.string().min(1).describe("Salesforce OAuth access token"),
  instance_url: z.string().url().describe("Salesforce instance URL"),
  queryable_only: z
    .boolean()
    .default(true)
    .describe("If true, only return queryable objects"),
  filter: z
    .string()
    .optional()
    .describe("Optional case-insensitive substring filter on object name/label"),
});

// ─── Get Record ───────────────────────────────────────────────────────────────

export const GetRecordSchema = z.object({
  access_token: z.string().min(1).describe("Salesforce OAuth access token"),
  instance_url: z.string().url().describe("Salesforce instance URL"),
  object_name: z.string().min(1).describe("API name of the SObject"),
  record_id: z.string().min(15).describe("18-character Salesforce record ID"),
  fields: z
    .array(z.string())
    .optional()
    .describe("Optional list of fields to retrieve. Omit to get all fields."),
  response_format: z
    .enum(["json", "markdown"])
    .default("markdown")
    .describe("Output format"),
});

// ─── Create Case ─────────────────────────────────────────────────────────────

export const CreateCaseSchema = z.object({
  access_token: z.string().min(1).describe("Salesforce OAuth access token"),
  instance_url: z.string().url().describe("Salesforce instance URL"),
  subject: z
    .string()
    .min(1)
    .max(255)
    .describe("Case subject / title (required)"),
  description: z
    .string()
    .max(32_000)
    .optional()
    .describe("Detailed case description"),
  status: z
    .enum(["New", "Working", "Escalated", "Closed"])
    .default("New")
    .describe("Case status"),
  priority: z
    .enum(["High", "Medium", "Low"])
    .default("Medium")
    .describe("Case priority"),
  origin: z
    .enum(["Phone", "Email", "Web"])
    .optional()
    .describe("Case origin channel"),
  account_id: z.string().optional().describe("Related Account record ID"),
  contact_id: z.string().optional().describe("Related Contact record ID"),
  type: z.string().optional().describe("Case Type picklist value"),
  reason: z.string().optional().describe("Case Reason picklist value"),
  custom_fields: z
    .record(z.unknown())
    .optional()
    .describe("Any additional custom field key/value pairs to set on the Case"),
});

// ─── Who Am I ─────────────────────────────────────────────────────────────────

export const WhoAmISchema = z.object({
  access_token: z.string().min(1).describe("Salesforce OAuth access token"),
  instance_url: z.string().url().describe("Salesforce instance URL"),
});

// ─── Toggle Environment ───────────────────────────────────────────────────────

export const ToggleEnvironmentSchema = z.object({
  environment: EnvironmentSchema,
});
