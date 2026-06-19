# Neko Auth Account AI Catalog Boundary

`neko-auth` owns OAuth session lifecycle and token storage. Agent consumers must not request raw OAuth tokens, refresh tokens, account gateway API keys, or internal authorization headers for AI routing.

## API Surface

The extension export `NekoAuthAPI` exposes:

- `getSession()` for secret-owned session status.
- `login()` / `logout()` for OAuth lifecycle.
- `onDidChangeSession` for login, logout, and silent refresh changes.
- `getAccountAiCatalog()` for a secret-free Neko official AI catalog snapshot.

`getCloudToken()` remains a provider-specific stub and is not used for Agent account gateway routing.

## Catalog Fetching

`AccountAiCatalogClient` fetches `neko.auth.aiCatalogUrl` with the current OAuth access token inside the auth boundary. The returned snapshot contains provider/model IDs, model capabilities, catalog version/ETag, expiry, entitlement, usage, defaults, and diagnostics. It deliberately strips user-visible endpoint secrets:

- account provider is projected as `connectionKind: "gateway"`;
- protocol is `newapi-compatible`;
- `requiresApiKey` is `false` for user configuration because the user does not supply a key;
- `apiUrl`, `apiKey`, `accessToken`, `refreshToken`, `authorization`, and auth headers are not projected to Webview or Agent prompt/tool payloads.

`401` responses are token/session failures. `403` or an empty entitled model list are entitlement failures. Agent Extension Host invalidates its account catalog cache on those failures.

## Configuration Sources

Auth configuration is loaded from VS Code settings (`neko.auth.*`) with field-level fallback to `auth` in `~/.neko/config.toml` / workspace config. `aiCatalogUrl` is part of auth config, but OAuth-derived AI gateway credentials are never persisted to local user config.

Agent owns provider source resolution:

1. explicit local AI config wins;
2. OAuth account gateway is used only when explicit AI config is absent;
3. invalid explicit AI config remains fail-visible and does not fallback to account gateway.
