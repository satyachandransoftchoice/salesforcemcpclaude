// ─── OAuth Token ────────────────────────────────────────────────────────────
export interface OAuthToken {
  access_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
  id: string;
  refresh_token?: string;
}

// ─── Per-request auth context passed down from HTTP headers ─────────────────
export interface UserAuthContext {
  accessToken: string;
  instanceUrl: string;
}

// ─── SOQL Query Response ─────────────────────────────────────────────────────
export interface SoqlQueryResult<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

// ─── Salesforce Describe ─────────────────────────────────────────────────────
export interface SObjectField {
  name: string;
  label: string;
  type: string;
  updateable: boolean;
  createable: boolean;
  nillable: boolean;
  length?: number;
  referenceTo?: string[];
  relationshipName?: string | null;
}

export interface SObjectDescribe {
  name: string;
  label: string;
  labelPlural: string;
  keyPrefix: string | null;
  queryable: boolean;
  updateable: boolean;
  createable: boolean;
  fields: SObjectField[];
  urls: Record<string, string>;
}

export interface GlobalDescribeEntry {
  name: string;
  label: string;
  labelPlural: string;
  keyPrefix: string | null;
  queryable: boolean;
  createable: boolean;
  updateable: boolean;
}

export interface GlobalDescribeResult {
  sobjects: GlobalDescribeEntry[];
}

// ─── Case ────────────────────────────────────────────────────────────────────
export interface CaseRecord {
  Id?: string;
  CaseNumber?: string;
  Subject: string;
  Description?: string;
  Status?: string;
  Priority?: string;
  Origin?: string;
  AccountId?: string;
  ContactId?: string;
  OwnerId?: string;
  Type?: string;
  Reason?: string;
  [key: string]: unknown;
}

export interface CreateCaseResult {
  id: string;
  success: boolean;
  errors: string[];
}

// ─── Error ───────────────────────────────────────────────────────────────────
export interface SalesforceError {
  message: string;
  errorCode: string;
  fields?: string[];
}

// ─── Tool Response ───────────────────────────────────────────────────────────
// Re-export the SDK's CallToolResult so all tool handlers use a compatible type
export type { CallToolResult as McpToolResponse } from "@modelcontextprotocol/sdk/types.js";
