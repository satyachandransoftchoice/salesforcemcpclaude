import { Router, Request, Response } from "express";
import axios from "axios";
import crypto from "crypto";
import { getActiveConfig, getActiveEnvironment } from "./config.js";

// ─── In-memory stores (replace with Redis/DB for multi-instance prod) ─────────
// PKCE verifiers keyed by state, used to validate the callback
const stateStore = new Map<string, { clientState: string; clientRedirect: string; codeChallenge?: string; codeChallengeMethod?: string }>();
// Authorization codes we issued, mapping → { sfAccessToken, sfInstanceUrl, sfRefreshToken, clientId, codeChallenge? }
const authCodes = new Map<string, { sfAccessToken: string; sfInstanceUrl: string; sfRefreshToken?: string; clientId: string; codeChallenge?: string; codeChallengeMethod?: string; expiresAt: number }>();
// Access tokens we issued to MCP clients → { sfAccessToken, sfInstanceUrl, sfRefreshToken }
const issuedTokens = new Map<string, { sfAccessToken: string; sfInstanceUrl: string; sfRefreshToken?: string; expiresAt: number }>();
// Dynamically registered clients (per MCP spec, Claude registers itself)
const registeredClients = new Map<string, { clientId: string; clientSecret: string; redirectUris: string[] }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomId(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function verifyPkce(verifier: string, challenge: string, method = "S256"): boolean {
  if (method === "plain") return verifier === challenge;
  const hash = crypto.createHash("sha256").update(verifier).digest("base64url");
  return hash === challenge;
}

// ─── Router ───────────────────────────────────────────────────────────────────
export function createOAuthRouter(publicBaseUrl: string): Router {
  const router = Router();

  // ── 1. OAuth Protected Resource Metadata (MCP discovery) ────────────────────
  router.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => {
    res.json({
      resource: publicBaseUrl,
      authorization_servers: [publicBaseUrl],
      scopes_supported: ["api", "refresh_token", "offline_access"],
      bearer_methods_supported: ["header"],
    });
  });

  // ── 2. OAuth Authorization Server Metadata (RFC 8414) ───────────────────────
  router.get("/.well-known/oauth-authorization-server", (_req: Request, res: Response) => {
    res.json({
      issuer: publicBaseUrl,
      authorization_endpoint: `${publicBaseUrl}/oauth/authorize`,
      token_endpoint: `${publicBaseUrl}/oauth/token`,
      registration_endpoint: `${publicBaseUrl}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      scopes_supported: ["api", "refresh_token", "offline_access"],
    });
  });

  // ── 3. Dynamic Client Registration (RFC 7591) ───────────────────────────────
  router.post("/oauth/register", (req: Request, res: Response) => {
    const { redirect_uris, client_name } = req.body || {};
    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris required" });
    }
    const clientId = `mcp_${randomId(16)}`;
    const clientSecret = randomId(32);
    registeredClients.set(clientId, { clientId, clientSecret, redirectUris: redirect_uris });
    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: client_name || "MCP Client",
      redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  // ── 4. /oauth/authorize – redirect user to Salesforce ───────────────────────
  router.get("/oauth/authorize", (req: Request, res: Response) => {
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query as Record<string, string>;
    if (!client_id || !redirect_uri) {
      return res.status(400).send("Missing client_id or redirect_uri");
    }
    const client = registeredClients.get(client_id);
    if (!client) {
      return res.status(400).send(`Unknown client_id: ${client_id}`);
    }
    if (!client.redirectUris.includes(redirect_uri)) {
      return res.status(400).send("redirect_uri not registered for this client");
    }

    // Generate our own state to track this auth request
    const sfState = randomId(16);
    stateStore.set(sfState, {
      clientState: state || "",
      clientRedirect: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    });

    // Forward to Salesforce
    const sfConfig = getActiveConfig();
    const sfAuthUrl = new URL(`${sfConfig.loginUrl}/services/oauth2/authorize`);
    sfAuthUrl.searchParams.set("response_type", "code");
    sfAuthUrl.searchParams.set("client_id", sfConfig.clientId);
    sfAuthUrl.searchParams.set("redirect_uri", `${publicBaseUrl}/oauth/callback`);
    sfAuthUrl.searchParams.set("state", sfState);
    sfAuthUrl.searchParams.set("scope", scope || "api refresh_token offline_access");

    res.redirect(sfAuthUrl.toString());
  });

  // ── 5. /oauth/callback – Salesforce redirects back here ─────────────────────
  router.get("/oauth/callback", async (req: Request, res: Response) => {
    const { code, state, error, error_description } = req.query as Record<string, string>;

    if (error) {
      return res.status(400).send(`Salesforce returned error: ${error} – ${error_description || ""}`);
    }
    if (!code || !state) {
      return res.status(400).send("Missing code or state in callback");
    }

    const stateEntry = stateStore.get(state);
    if (!stateEntry) {
      return res.status(400).send("Invalid or expired state");
    }
    stateStore.delete(state);

    // Exchange code for Salesforce token
    const sfConfig = getActiveConfig();
    try {
      const tokenResp = await axios.post(
        `${sfConfig.loginUrl}/services/oauth2/token`,
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: sfConfig.clientId,
          client_secret: sfConfig.clientSecret,
          redirect_uri: `${publicBaseUrl}/oauth/callback`,
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const sf = tokenResp.data as { access_token: string; instance_url: string; refresh_token?: string };

      // Mint our own short-lived auth code to give back to the MCP client
      const ourCode = randomId(32);
      // Find which client this was for (look up via state's redirect_uri)
      const client = [...registeredClients.values()].find((c) => c.redirectUris.includes(stateEntry.clientRedirect));
      authCodes.set(ourCode, {
        sfAccessToken: sf.access_token,
        sfInstanceUrl: sf.instance_url,
        sfRefreshToken: sf.refresh_token,
        clientId: client?.clientId || "",
        codeChallenge: stateEntry.codeChallenge,
        codeChallengeMethod: stateEntry.codeChallengeMethod,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
      });

      // Redirect back to Claude with our code
      const redirectUrl = new URL(stateEntry.clientRedirect);
      redirectUrl.searchParams.set("code", ourCode);
      if (stateEntry.clientState) redirectUrl.searchParams.set("state", stateEntry.clientState);
      res.redirect(redirectUrl.toString());
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message?: string };
      res.status(500).send(`Token exchange failed: ${JSON.stringify(e.response?.data || e.message)}`);
    }
  });

  // ── 6. /oauth/token – MCP client exchanges code for access token ─────────────
  router.post("/oauth/token", (req: Request, res: Response) => {
    const { grant_type, code, code_verifier, client_id, refresh_token } = req.body || {};

    if (grant_type === "authorization_code") {
      if (!code) return res.status(400).json({ error: "invalid_request", error_description: "code required" });
      const entry = authCodes.get(code);
      if (!entry || entry.expiresAt < Date.now()) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Code expired or unknown" });
      }
      if (entry.clientId && client_id && entry.clientId !== client_id) {
        return res.status(400).json({ error: "invalid_client" });
      }
      if (entry.codeChallenge && code_verifier) {
        if (!verifyPkce(code_verifier, entry.codeChallenge, entry.codeChallengeMethod || "S256")) {
          return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
        }
      }
      authCodes.delete(code);

      const ourAccessToken = randomId(32);
      issuedTokens.set(ourAccessToken, {
        sfAccessToken: entry.sfAccessToken,
        sfInstanceUrl: entry.sfInstanceUrl,
        sfRefreshToken: entry.sfRefreshToken,
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
      });

      return res.json({
        access_token: ourAccessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: entry.sfRefreshToken ? `rt_${ourAccessToken}` : undefined,
        scope: "api refresh_token offline_access",
      });
    }

    if (grant_type === "refresh_token") {
      // For simplicity: re-issue using stored SF refresh token
      if (!refresh_token) return res.status(400).json({ error: "invalid_request" });
      const oldAccessToken = refresh_token.replace(/^rt_/, "");
      const stored = issuedTokens.get(oldAccessToken);
      if (!stored?.sfRefreshToken) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Unknown refresh token" });
      }
      // Refresh against Salesforce
      const sfConfig = getActiveConfig();
      axios
        .post(
          `${sfConfig.loginUrl}/services/oauth2/token`,
          new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: stored.sfRefreshToken,
            client_id: sfConfig.clientId,
            client_secret: sfConfig.clientSecret,
          }).toString(),
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        )
        .then((sfResp) => {
          const sf = sfResp.data as { access_token: string; instance_url: string };
          const newToken = randomId(32);
          issuedTokens.set(newToken, {
            sfAccessToken: sf.access_token,
            sfInstanceUrl: sf.instance_url,
            sfRefreshToken: stored.sfRefreshToken,
            expiresAt: Date.now() + 60 * 60 * 1000,
          });
          issuedTokens.delete(oldAccessToken);
          res.json({
            access_token: newToken,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: `rt_${newToken}`,
          });
        })
        .catch((err) => {
          res.status(400).json({ error: "invalid_grant", error_description: String(err?.message || err) });
        });
      return;
    }

    res.status(400).json({ error: "unsupported_grant_type" });
  });

  return router;
}

// ─── Resolve a Bearer token to user's Salesforce credentials ─────────────────
export function resolveBearerToken(bearer: string): { sfAccessToken: string; sfInstanceUrl: string } | null {
  const entry = issuedTokens.get(bearer);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return { sfAccessToken: entry.sfAccessToken, sfInstanceUrl: entry.sfInstanceUrl };
}

// Periodic cleanup of expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of issuedTokens.entries()) if (v.expiresAt < now) issuedTokens.delete(k);
  for (const [k, v] of authCodes.entries()) if (v.expiresAt < now) authCodes.delete(k);
}, 60_000);
