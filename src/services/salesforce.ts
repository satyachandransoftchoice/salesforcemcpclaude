import axios, { AxiosInstance, AxiosError } from "axios";
import {
  SoqlQueryResult,
  SObjectDescribe,
  GlobalDescribeResult,
  CreateCaseResult,
  CaseRecord,
  SalesforceError,
  UserAuthContext,
} from "../types.js";
import { API_VERSION } from "../config.js";

// ─── Error Helpers ────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const sfErrors = err.response?.data as SalesforceError[] | undefined;
    if (Array.isArray(sfErrors) && sfErrors.length > 0) {
      return sfErrors.map((e) => `[${e.errorCode}] ${e.message}`).join("; ");
    }
    return err.response?.data?.message || err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ─── API Client factory – one per request, using caller's token ───────────────

function makeClient(auth: UserAuthContext): AxiosInstance {
  return axios.create({
    baseURL: `${auth.instanceUrl}/services/data/${API_VERSION}`,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 30_000,
  });
}

// ─── SOQL Query ───────────────────────────────────────────────────────────────

export async function executeSoqlQuery<T = Record<string, unknown>>(
  auth: UserAuthContext,
  soql: string,
  allPages = false
): Promise<SoqlQueryResult<T>> {
  const client = makeClient(auth);
  try {
    const response = await client.get<SoqlQueryResult<T>>("/query", {
      params: { q: soql },
    });
    const result = response.data;

    if (allPages && !result.done && result.nextRecordsUrl) {
      while (!result.done && result.nextRecordsUrl) {
        const nextUrl: string = result.nextRecordsUrl.replace(
          `/services/data/${API_VERSION}`,
          ""
        );
        const nextResp = await client.get<SoqlQueryResult<T>>(nextUrl);
        result.records.push(...nextResp.data.records);
        result.done = nextResp.data.done;
        result.nextRecordsUrl = nextResp.data.nextRecordsUrl;
      }
    }

    return result;
  } catch (err) {
    throw new Error(`SOQL query failed: ${extractErrorMessage(err)}`);
  }
}

// ─── Describe ─────────────────────────────────────────────────────────────────

export async function describeSObject(
  auth: UserAuthContext,
  objectName: string
): Promise<SObjectDescribe> {
  const client = makeClient(auth);
  try {
    const response = await client.get<SObjectDescribe>(
      `/sobjects/${objectName}/describe`
    );
    return response.data;
  } catch (err) {
    throw new Error(
      `Failed to describe ${objectName}: ${extractErrorMessage(err)}`
    );
  }
}

export async function describeGlobal(
  auth: UserAuthContext
): Promise<GlobalDescribeResult> {
  const client = makeClient(auth);
  try {
    const response = await client.get<GlobalDescribeResult>("/sobjects");
    return response.data;
  } catch (err) {
    throw new Error(`Global describe failed: ${extractErrorMessage(err)}`);
  }
}

// ─── Generic Record Read ──────────────────────────────────────────────────────

export async function getRecord(
  auth: UserAuthContext,
  objectName: string,
  recordId: string,
  fields?: string[]
): Promise<Record<string, unknown>> {
  const client = makeClient(auth);
  try {
    const params = fields ? { fields: fields.join(",") } : {};
    const response = await client.get<Record<string, unknown>>(
      `/sobjects/${objectName}/${recordId}`,
      { params }
    );
    return response.data;
  } catch (err) {
    throw new Error(
      `Failed to get ${objectName}/${recordId}: ${extractErrorMessage(err)}`
    );
  }
}

// ─── Case Create ─────────────────────────────────────────────────────────────
// This is the ONLY write operation permitted.

export async function createCase(
  auth: UserAuthContext,
  caseData: CaseRecord
): Promise<CreateCaseResult> {
  const client = makeClient(auth);
  try {
    const response = await client.post<CreateCaseResult>(
      "/sobjects/Case",
      caseData
    );
    return response.data;
  } catch (err) {
    throw new Error(`Failed to create Case: ${extractErrorMessage(err)}`);
  }
}

// ─── User Info (who am I) ─────────────────────────────────────────────────────

export async function getCurrentUser(
  auth: UserAuthContext
): Promise<Record<string, unknown>> {
  const axiosInstance = axios.create({
    baseURL: auth.instanceUrl,
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    timeout: 10_000,
  });
  try {
    const idUrl = `${auth.instanceUrl}/services/oauth2/userinfo`;
    const response = await axiosInstance.get<Record<string, unknown>>(idUrl);
    return response.data;
  } catch (err) {
    throw new Error(`Failed to get current user: ${extractErrorMessage(err)}`);
  }
}

// ─── Search (SOSL) ────────────────────────────────────────────────────────────

export async function executeSoslSearch(
  auth: UserAuthContext,
  soslQuery: string
): Promise<Record<string, unknown>> {
  const client = makeClient(auth);
  try {
    const response = await client.get<Record<string, unknown>>("/search", {
      params: { q: soslQuery },
    });
    return response.data;
  } catch (err) {
    throw new Error(`SOSL search failed: ${extractErrorMessage(err)}`);
  }
}
