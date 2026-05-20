# Salesforce MCP Server

A **Model Context Protocol (MCP) server** for Salesforce, built for native integration with Claude.

## Capabilities

| Capability | Scope |
|---|---|
| **Read** | All Salesforce objects the authenticated user can access |
| **Write** | Case creation only |
| **Permissions** | Respects the logged-in user's field-level security, sharing rules, and profile permissions |
| **Environments** | Sandbox (`test.salesforce.com`) + Production — togglable at runtime |

---

## Tools

| Tool | Type | Description |
|---|---|---|
| `sf_get_environment` | Read | Show the active environment and URLs |
| `sf_toggle_environment` | Config | Switch between sandbox and production |
| `sf_whoami` | Read | Get identity info of the authenticated user |
| `sf_list_objects` | Read | List all accessible Salesforce SObjects |
| `sf_describe_object` | Read | Get full schema/field definitions for any object |
| `sf_query` | Read | Execute SOQL SELECT queries |
| `sf_search` | Read | SOSL full-text search across objects |
| `sf_get_record` | Read | Retrieve a single record by ID |
| `sf_create_case` | **Write** | Create a new Case record (only write operation) |

---

## Prerequisites

- Node.js ≥ 18
- A Salesforce **Connected App** with OAuth 2.0 enabled
  - Required OAuth scopes: `api`, `refresh_token`, `offline_access`

### Create a Connected App in Salesforce

1. Setup → App Manager → New Connected App
2. Enable OAuth Settings
3. Add scopes: `Access and manage your data (api)`, `Perform requests on your behalf at any time (refresh_token, offline_access)`
4. Set Callback URL: `https://login.salesforce.com/services/oauth2/success`
5. Save and note the **Consumer Key** and **Consumer Secret**

---

## Installation & Setup

```bash
git clone <your-repo-url>
cd salesforce-mcp-server
npm install
cp .env.example .env
# Edit .env with your credentials
npm run build
```

---

## Configuration (`.env`)

```env
# Active environment at startup: "sandbox" or "production"
SF_ENVIRONMENT=sandbox

# Transport: "stdio" (Claude Desktop/Code) or "http" (remote deployment)
TRANSPORT=stdio
PORT=3000

# Sandbox
SF_SANDBOX_URL=https://test.salesforce.com
SF_SANDBOX_CLIENT_ID=your_sandbox_client_id
SF_SANDBOX_CLIENT_SECRET=your_sandbox_client_secret

# Production
SF_PROD_URL=https://login.salesforce.com
SF_PROD_CLIENT_ID=your_prod_client_id
SF_PROD_CLIENT_SECRET=your_prod_client_secret
```

---

## Running Locally

```bash
# stdio (for Claude Desktop / Claude Code)
npm start

# HTTP (for remote deployment)
TRANSPORT=http npm start
```

---

## Claude Desktop Integration (stdio)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "salesforce": {
      "command": "node",
      "args": ["/absolute/path/to/salesforce-mcp-server/dist/index.js"],
      "env": {
        "SF_ENVIRONMENT": "sandbox",
        "SF_SANDBOX_URL": "https://test.salesforce.com",
        "SF_SANDBOX_CLIENT_ID": "your_client_id",
        "SF_SANDBOX_CLIENT_SECRET": "your_client_secret",
        "SF_PROD_URL": "https://login.salesforce.com",
        "SF_PROD_CLIENT_ID": "your_prod_client_id",
        "SF_PROD_CLIENT_SECRET": "your_prod_client_secret"
      }
    }
  }
}
```

**Config file locations:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

---

## Claude.ai Remote (HTTP / MCP URL)

When deployed as an HTTP server, register the MCP URL in Claude.ai under **Settings → Integrations → Add MCP Server**:

```
https://your-deployment-url/mcp
```

---

## Org Deployment Options

### Option A: Deploy to any Node.js host (Heroku, Railway, Render, Azure App Service)

```bash
# Set environment variables on your host platform, then:
TRANSPORT=http npm start
```

### Option B: Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV TRANSPORT=http
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
npm run build
docker build -t salesforce-mcp-server .
docker run -p 3000:3000 \
  -e SF_ENVIRONMENT=production \
  -e SF_PROD_CLIENT_ID=... \
  -e SF_PROD_CLIENT_SECRET=... \
  salesforce-mcp-server
```

### Option C: Azure Functions / AWS Lambda (serverless)
Point the function handler at `dist/index.js` and set `TRANSPORT=http`. Each invocation is stateless.

---

## Authentication Flow

This server uses **per-request user authentication**. Each tool call requires:

- `access_token` — the caller's Salesforce OAuth access token
- `instance_url` — the caller's Salesforce instance URL (e.g. `https://yourorg.my.salesforce.com`)

The server **never stores tokens**. Every API call to Salesforce uses the token supplied in that specific tool call, ensuring user-level permission scoping.

### Getting a token (for testing)

```bash
# Device flow / Web flow – use Salesforce CLI:
sf org login web --instance-url https://test.salesforce.com
sf org display --verbose
# Copy the "Access Token" value
```

---

## Security Notes

- **Read-only by design**: The only write operation is `sf_create_case`
- **User-scoped permissions**: All queries run under the user's profile/permission sets
- **No token storage**: Tokens are passed per-request and never persisted
- **No admin-level access**: The server has no service account; it only acts as the authenticated user
- Keep `.env` out of version control (it's in `.gitignore`)

---

## Switching Environments

At runtime, tell Claude:

> *"Switch to production environment"* → Claude calls `sf_toggle_environment` with `environment: "production"`

> *"Which environment are we on?"* → Claude calls `sf_get_environment`

The toggle persists for the lifetime of the server process. On restart, it defaults back to `SF_ENVIRONMENT` in your `.env`.

---

## Development

```bash
npm run dev    # ts-node (no build step)
npm run build  # compile TypeScript → dist/
npm start      # run compiled server
```
