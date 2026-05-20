import { AsyncLocalStorage } from "async_hooks";
import { UserAuthContext } from "./types.js";

export const authContext = new AsyncLocalStorage<UserAuthContext>();

export function getAuthContext(): UserAuthContext {
  const ctx = authContext.getStore();
  if (!ctx) {
    throw new Error(
      "No authentication context. Connect to Salesforce via OAuth before using this tool."
    );
  }
  return ctx;
}
