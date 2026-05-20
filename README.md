# Salesforce MCP Server for Claude

A production-ready **Model Context Protocol (MCP) server** that lets Claude.ai users in your org get insights from Salesforce using their own credentials.

- **Full OAuth** — users click "Connect Salesforce" in Claude.ai, sign in with their Salesforce account, done
- **Per-user permissions** — every query runs under the user's profile, FLS, and sharing rules
- **Read-only by default** — only `sf_create_case` writes; everything else is read
- **Sandbox/Production toggle** — switch environments at runtime

---

## Architecture

```
┌─────────────────┐         ┌────────────────────────┐         ┌──────────────┐
│  Claude.ai User │         │  Salesforce MCP Server │         │  Salesforce  │
│                 │         │   (Railway/Azure/etc)  │         │              │
└────────┬────────┘         └───────────┬────────────┘         └──────┬───────┘
         │                              │                              │
         │ 1. Click "Connect"           │                              │
         ├─────────────────────────────▶│                              │
         │                              │  2. Redirect to SF login     │
         │◀─────────────────────────────┼─────────────────────────────▶│
         │                              │                              │
         │  3. User logs in to SF       │                              │
         ├──────────────────────────────┼─────────────────────────────▶│
         │                              │  4. Callback w/ code         │
         │                              │◀─────────────────────────────┤
         │  5. Token issued             │                              │
         │◀─────────────────────────────┤                              │
         │                              │                              │
         │  6. MCP calls w/ Bearer      │                              │
         ├─────────────────────────────▶│  7. API calls w/ user token  │
         │                              ├─────────────────────────────▶│
         │  8. Results (user-scoped)    │                              │
         │◀─────────────────────────────┤◀─────────────────────────────┤
```

---

## Tools (9)

| Tool | Type | Purpose |
|---|---|---|
| `sf_get_environment` | Read | Show active environment |
| `sf_toggle_environment` | Config | Sandbox ↔ Production |
| `sf_whoami` | Read | Verify connected user |
| `sf_list_objects` | Read | List accessible SObjects |
| `sf_describe_object` | Read | Get schema for any object |
| `sf_query` | Read | Execute SOQL (DML blocked) |
| `sf_search` | Read | SOSL full-text search |
| `sf_get_record` | Read | Fetch one record by ID |
| `sf_create_case` | **Write** | Create a Case |

---

## Step-by-Step Setup

### 1. Create Salesforce Connected Apps (one per environment)

In **Salesforce Setup → App Manager → New Connected App**:

| Field | Value |
|---|---|
| Connected App Name | `Claude MCP Sandbox` (or Production) |
| API Name | `Claude_MCP` |
| Contact Email | your email |
| Enable OAuth Settings | ✅ |
| Callback URL | `https://YOUR-DEPLOYMENT-URL/oauth/callback` |
| Selected OAuth Scopes | `Access and manage your data (api)`, `Perform requests at any time (refresh_token, offline_access)` |
| Require Secret for Web Server Flow | ✅ |

After saving:
- Wait 5-10 min for propagation
- Copy the **Consumer Key** (client_id) and **Consumer Secret** (client_secret)

Repeat for both sandbox (`test.salesforce.com`) and production (`login.salesforce.com`).

### 2. Deploy to Railway

1. Sign up at [railway.app](https://railway.app) (GitHub login works)
2. **New Project → Deploy from GitHub repo → satyachandransoftchoice/salesforcemcpclaude**
3. Railway auto-detects Node.js and starts building
4. Once deployed, click **Settings → Networking → Generate Domain** to get your public URL
5. In **Variables**, add:
   ```
   PUBLIC_BASE_URL=https://your-app.up.railway.app
   SF_ENVIRONMENT=sandbox
   SF_SANDBOX_URL=https://test.salesforce.com
   SF_SANDBOX_CLIENT_ID=<from your sandbox Connected App>
   SF_SANDBOX_CLIENT_SECRET=<from your sandbox Connected App>
   SF_PROD_URL=https://login.salesforce.com
   SF_PROD_CLIENT_ID=<from your prod Connected App>
   SF_PROD_CLIENT_SECRET=<from your prod Connected App>
   ```
6. **Go back to your Salesforce Connected App** and update the Callback URL to:
   `https://your-app.up.railway.app/oauth/callback`

### 3. Register in Claude.ai

1. Open Claude.ai → **Settings → Integrations → Add custom integration**
2. **Integration name:** `Salesforce`
3. **MCP server URL:** `https://your-app.up.railway.app/mcp`
4. Save
5. Click **Connect** next to the Salesforce integration
6. You'll be redirected to Salesforce → log in → approve → back to Claude
7. You're connected! Try asking Claude:
   - *"What's my Salesforce username?"*
   - *"Show me my open opportunities"*
   - *"How many cases were created this week?"*

---

## Switching Environments

In Claude:

> *"Switch to production"* → Claude calls `sf_toggle_environment`
>
> *"Reconnect Salesforce"* → Re-runs OAuth against the new environment

The toggle changes which Connected App OAuth flow uses on the next sign-in. Already-issued tokens for the old environment continue to work until they expire.

---

## Security

- **No service account** — the server never has admin access. It only acts as whichever user is signed in.
- **Tokens scoped per request** — each MCP call runs in its own AsyncLocalStorage context.
- **Tokens never logged** — only opaque session IDs appear in logs.
- **In-memory token store** — for single-instance deployments. For multi-instance, swap `oauth.ts` storage maps for Redis.
- **Read-only by default** — only `sf_create_case` can write. SOQL DML statements are blocked at the schema level.

---

## Local Development

```bash
git clone https://github.com/satyachandransoftchoice/salesforcemcpclaude.git
cd salesforcemcpclaude
npm install
cp .env.example .env
# Edit .env with your Connected App credentials and a public URL (use ngrok for local OAuth)

npm run dev    # tsx watch mode
# or
npm run build && npm start
```

For local OAuth testing, use **ngrok**: `ngrok http 3000` → set `PUBLIC_BASE_URL` to the ngrok URL and update your SF Connected App callback to match.

---

## Stdio Mode (Claude Desktop only)

For local single-user usage without OAuth, set up Claude Desktop with a pre-fetched token:

```json
{
  "mcpServers": {
    "salesforce": {
      "command": "node",
      "args": ["/path/to/salesforcemcpclaude/dist/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "SF_ENVIRONMENT": "sandbox",
        "SF_ACCESS_TOKEN": "00D...",
        "SF_INSTANCE_URL": "https://yourorg.my.salesforce.com"
      }
    }
  }
}
```

Get a token via Salesforce CLI:
```bash
sf org login web --instance-url https://test.salesforce.com
sf org display --verbose
```

---

## Repository

https://github.com/satyachandransoftchoice/salesforcemcpclaude
