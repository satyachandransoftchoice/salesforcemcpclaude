import * as dotenv from "dotenv";
dotenv.config();

export type SalesforceEnvironment = "sandbox" | "production";

export interface EnvironmentConfig {
  loginUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const SANDBOX_URL = process.env.SF_SANDBOX_URL || "https://test.salesforce.com";
const PROD_URL = process.env.SF_PROD_URL || "https://login.salesforce.com";

export const ENVIRONMENTS: Record<SalesforceEnvironment, EnvironmentConfig> = {
  sandbox: {
    loginUrl: SANDBOX_URL,
    clientId: process.env.SF_SANDBOX_CLIENT_ID || process.env.SF_CLIENT_ID || "",
    clientSecret: process.env.SF_SANDBOX_CLIENT_SECRET || process.env.SF_CLIENT_SECRET || "",
    redirectUri: process.env.SF_REDIRECT_URI || "https://login.salesforce.com/services/oauth2/success",
  },
  production: {
    loginUrl: PROD_URL,
    clientId: process.env.SF_PROD_CLIENT_ID || process.env.SF_CLIENT_ID || "",
    clientSecret: process.env.SF_PROD_CLIENT_SECRET || process.env.SF_CLIENT_SECRET || "",
    redirectUri: process.env.SF_REDIRECT_URI || "https://login.salesforce.com/services/oauth2/success",
  },
};

// Active environment – can be toggled at runtime via the toggle_environment tool
let activeEnvironment: SalesforceEnvironment =
  (process.env.SF_ENVIRONMENT as SalesforceEnvironment) || "sandbox";

export function getActiveEnvironment(): SalesforceEnvironment {
  return activeEnvironment;
}

export function setActiveEnvironment(env: SalesforceEnvironment): void {
  activeEnvironment = env;
}

export function getActiveConfig(): EnvironmentConfig {
  return ENVIRONMENTS[activeEnvironment];
}

export const SERVER_PORT = parseInt(process.env.PORT || "3000", 10);
export const API_VERSION = process.env.SF_API_VERSION || "v59.0";
export const CHARACTER_LIMIT = 50_000;
