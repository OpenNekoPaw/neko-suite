## Context

Neko Agent currently has one real AI provider source: the user-owned config file path. The recent provider connection mode work added explicit provider grouping (`gateway`, `local`, `direct`), NewAPI gateway defaults, local Ollama support without API keys, canonical media model defaults, and fail-visible conversation selection. OAuth exists through `neko-auth`, but it only projects login/session state into Agent Webviews; `getCloudToken` remains a stub and no AI catalog or entitlement snapshot is injected into Agent provider/model resolution.

The final product path needs two AI API configuration sources:

```text
Explicit local user configuration
  ~/.neko/config.toml / env / runtime imported credentials
  supports direct, gateway, local
  highest priority when it explicitly selects AI provider/model

OAuth Neko official account gateway
  neko-auth session
  Neko official AI catalog + entitlement APIs
  runtime-only account provider/model snapshot
  default path when explicit AI config is absent
```

This design stays inside the local VS Code client boundary. Neko official APIs are external provider/trust boundaries, but the local extension still owns provider resolution, diagnostics, caching, and Webview projection. It must not introduce cloud multi-tenant service architecture into the client.

Five-layer analysis:

- Responsibility: `neko-auth` owns OAuth session lifecycle and secret storage. A narrow account AI API/client owns fetching catalog/entitlement from Neko official APIs. Agent Platform owns merging explicit config snapshots with runtime-only account provider snapshots. Extension Host owns refresh triggers, cache lifecycle, and Webview broadcasts. Webview only displays projected account/config state and sends login/logout/refresh intent.
- Dependency: Layer 0 shared contracts may define DTOs and diagnostics. `neko-auth` core remains host-agnostic. VS Code SecretStorage and extension activation stay in L1. Webview receives no secrets and imports no Extension or auth implementation.
- Interface: Keep `ProviderConfig.type` for adapter selection and `connectionKind` for grouping. Add small DTOs for account AI catalog snapshots, entitlement metadata, source priority, and projected diagnostics. Do not expose raw OAuth access tokens, gateway bearer tokens, internal routing URLs, or provider-specific upstream secrets through public Webview messages.
- Extension: Future direct providers, OpenRouter/SubAPI/OneAPI presets, and generation provider setup can be added as config/provider profiles or account catalog entries without changing the two-source resolver. Local generation providers can be added as `local` profiles with explicit capabilities later.
- Testing: Unit tests cover resolver priority, account snapshot projection, source-grouped model projection, cache refresh policy, secret redaction, and fail-visible invalid selections. Extension/runtime tests cover session changes and new Agent tab startup. Webview tests cover projected state handling and model grouping. Manual VS Code Extension Development Host smoke validates login/config/onboarding/model-selector behavior when UI changes are implemented.

## Goals / Non-Goals

**Goals:**

- Make explicit user AI config the highest-priority provider source when the config contains explicit AI provider/model selection.
- Make OAuth Neko official API the default provider source when explicit AI config is unavailable or absent.
- Fetch and cache Neko official AI catalog/entitlement into a runtime-only provider/model snapshot.
- Keep OAuth-derived secrets out of local config files, workspace files, Webview state, logs, and prompts.
- Preserve current fail-visible behavior for missing, invalid, disabled, unauthorized, or mismatched provider/model selection.
- Support LLM and generation model records in the account catalog as capability-scoped models, without claiming broad vendor-direct support.
- Project Webview model lists by source/provider while keeping LLM models and domain models such as image, video, audio, and music distinct.
- Keep user config capable of representing `direct`, `gateway`, and `local` providers for roadmap compatibility.

**Non-Goals:**

- Implementing official direct vendor setup or API verification for Gemini, Grok, Claude, GPT, DeepSeek, GLM, Suno, Seedance, Kling, or similar providers.
- Guaranteeing that every NewAPI gateway supports every upstream vendor-specific parameter.
- Persisting Neko account gateway API secrets into `~/.neko/config.toml`.
- Replacing the existing local config format or rewriting existing user config files.
- Building a new cloud service governance layer in the local client.
- Redesigning the full settings UI beyond the projected account gateway/config state required for this path.

## Decisions

1. Use a two-source AI provider resolver.

   Provider/model resolution will first inspect explicit user AI configuration, then account gateway snapshot.

   ```text
   resolveAiProviderSource()
     1. explicit config source
        - valid config read result
        - explicit defaultProvider/defaultModel or explicit request selection
        - selected provider/model exists and is configured
     2. account gateway source
        - active OAuth session
        - fresh or refreshable account catalog snapshot
        - selected/default account model is entitled
     3. fail-visible diagnostic
   ```

   Alternative considered: merge account gateway into `~/.neko/config.toml` as a normal provider. Rejected because OAuth-derived credentials and entitlement are session-scoped and should not become user-editable config facts.

2. Treat config file priority as explicit, not merely present.

   A config file that only contains MCP, auth, UI settings, or non-AI settings must not disable the OAuth default path. A config file with explicit AI provider/model selection, explicit AI provider entries, or explicit chat model request owns provider resolution and should fail visibly if invalid.

   Alternative considered: any existing `~/.neko/config.toml` disables OAuth. Rejected because it makes unrelated local settings unexpectedly break the default account gateway path.

3. Represent OAuth as a runtime-only `neko-account-gateway` provider source.

   The account catalog will project an internal provider such as:

   ```text
   id: neko-account-gateway
   connectionKind: gateway
   protocolProfile: newapi
   supportLevel: verified
   requiresApiKey: false for user configuration purposes
   source: account
   ```

   The provider is "configured" only when an active session and entitled catalog snapshot exist. `requiresApiKey: false` means the user does not supply an API key; it does not mean the Extension Host may call without account authorization.

   Alternative considered: reuse `neko-gateway` from config defaults for OAuth. Rejected because user-owned Neko Gateway credentials and account-derived gateway entitlement have different lifecycles and secret boundaries.

4. Add a small account AI API surface instead of expanding `getCloudToken`.

   `getCloudToken(provider)` is cloud-provider oriented and returns a raw token-like value. The account gateway needs catalog, entitlement, usage, refresh metadata, and a secret-safe call path. The exported auth/API surface should provide a higher-level account AI snapshot or a dedicated account AI client contract rather than leaking gateway tokens to consumers.

   Alternative considered: make Agent call `getCloudToken('ai')` and construct the provider itself. Rejected because it exposes token plumbing and misses entitlement/catalog semantics.

5. Cache account catalog snapshots with explicit refresh triggers.

   New Agent sessions should use a current snapshot from memory or VS Code global state, then refresh asynchronously when needed. Refresh should occur on:

   - Extension activation or Agent panel open when no usable snapshot exists.
   - OAuth login/logout/session refresh.
   - TTL expiry, ETag/version mismatch, or manual refresh.
   - 401/403 from Neko official API or account gateway call.
   - Catalog/entitlement version mismatch reported by the official API.

   Alternative considered: fetch catalog synchronously for every new conversation. Rejected because it adds avoidable latency and creates unnecessary network coupling to each local conversation turn.

6. Project only secret-free account state to Webview.

   Webview may receive provider/model IDs, display names, capabilities, context windows, availability, entitlement status, usage summaries, plan labels, and diagnostics. It must not receive OAuth access tokens, refresh tokens, gateway API keys, internal routing secrets, or real gateway authorization headers.

   Alternative considered: reuse configured provider projection with `apiKey`. Rejected for the account source because it would break the Webview secret boundary and confuse account-owned credentials with user config.

7. Keep conversation runtime fail-visible and path-level testable.

   Conversation runtime must reject missing provider/model, unavailable account catalog, unauthorized selected model, provider/model mismatch, disabled provider, and stale invalid account snapshot before configuring the runner. Tests should assert the chosen source (`explicit-config` or `account-gateway`) so success cannot accidentally pass through fallback behavior.

   Alternative considered: silently use account gateway if explicit config selection fails. Rejected because user-selected wrong config should be visible and actionable.

8. Treat vision and generation as model capabilities.

   Account catalog models can include `vision`, `text_to_image`, `text_to_video`, `text_to_audio`, `text_to_music`, and similar capabilities. Text chat must not require vision. Workflows that require image understanding or generation must validate the required capability on the selected model.

   Alternative considered: require all LLMs to support vision for Agent use. Rejected because it would unnecessarily exclude local text-only and gateway text-only models.

9. Project model selectors by source first, then capability/type.

   The Webview should not flatten official, configured, and local models into a single list. Provider source and model purpose are separate axes:

   ```text
   Neko Official
     LLM
     Image
     Video
     Audio / Music

   Config Provider: <provider display name>
     LLM
     Image / Video / Audio when configured

   Local Provider: <provider display name>
     LLM
     future local domain models when supported
   ```

   When OAuth catalog succeeds, the Neko official group appears first. Config-file providers follow in user config order. Local providers are still config providers, but UI may badge or label them as local using `connectionKind: local`. Without OAuth catalog, the selector shows only user-configured provider groups. If neither source has selectable models, the Webview shows the setup/onboarding state instead of empty model categories.

   The conversation model selector should hide empty source/type groups because it is an action surface. Settings/config views may show configured-but-empty groups with diagnostics such as missing credentials, no enabled models, no entitlement, unsupported capability, or provider unavailable. Future domain model types should be added through model `type` and capabilities, not hard-coded UI branches, but unimplemented or unsupported types should remain hidden from the conversation selector.

   Alternative considered: group only by model type (`LLM`, `Image`, `Video`, `Audio`) and encode source in labels. Rejected because it hides the important trust/config distinction between Neko official account models, user-owned gateways/direct providers, and local runtimes.

## Runtime Shape

The intended runtime flow:

```text
Agent tab/session open
  -> ConfigManager reads ~/.neko/config.toml result
  -> AccountGatewayCatalogService checks auth session + cached catalog
  -> AiProviderSourceResolver builds provider source snapshot
  -> ConfigBridge projects providers/models/diagnostics to Webview

User sends message
  -> requested chat model from UI or persisted explicit selection
  -> resolver validates source + provider + model + entitlement
  -> Agent runner config receives selected provider/model
  -> no source or invalid selection returns visible precondition error
```

Suggested minimal contracts:

```ts
type AiProviderSourceKind = 'explicit-config' | 'account-gateway';

interface AccountAiCatalogSnapshot {
  source: 'account-gateway';
  provider: ProviderConfig;
  models: ModelConfig[];
  defaults?: {
    chat?: string;
    image?: string;
    video?: string;
    audio?: string;
    music?: string;
  };
  entitlement: {
    plan?: string;
    allowedModelIds: string[];
    disabledModelIds?: string[];
    usage?: { tokens?: number; limit?: number; resetAt?: string };
  };
  version?: string;
  expiresAt: number;
}

interface AiProviderSourceResolution {
  source: AiProviderSourceKind;
  providers: Map<string, ProviderConfig>;
  models: Map<string, ModelConfig>;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  diagnostics?: AssistantConfigDiagnostic[];
}
```

The concrete implementation can adjust names, but the contract should preserve: source identity, secret-free projection, entitlement-aware model availability, expiration metadata, and explicit selected provider/model.

Suggested Webview projection shape:

```ts
interface ModelSourceGroup {
  source: 'account-gateway' | 'explicit-config';
  providerId: string;
  providerLabel: string;
  connectionKind?: 'gateway' | 'local' | 'direct';
  priority: number;
  modelsByType: Partial<Record<ModelType, ChatModelOption[]>>;
  diagnostics?: AssistantConfigDiagnostic[];
}
```

This shape lets the Webview render source/provider groups while still deriving LLM and domain model controls from the same capability-scoped model records.

## Risks / Trade-offs

- [Risk] Account catalog API shape changes while the extension has cached data. -> Mitigation: include catalog version/ETag, TTL, and fail-visible stale/invalid diagnostics; refresh on version mismatch.
- [Risk] Users expect an invalid local config to fall back to OAuth. -> Mitigation: document explicit config priority and show a diagnostic that the selected local config must be fixed or cleared.
- [Risk] NewAPI generation endpoints differ by provider. -> Mitigation: catalog declares capabilities and support level; unsupported workflows fail with capability diagnostics rather than provider fallback.
- [Risk] Webview currently has paths that display configured provider secrets. -> Mitigation: introduce account provider projection without secrets and add redaction tests for account state messages.
- [Risk] Auth extension is unavailable or not activated when Agent opens. -> Mitigation: resolve account source as unavailable with a clear diagnostic and refresh when auth extension/session becomes available.
- [Risk] Local config missing currently reports `missingConfig`; OAuth default path changes that user-visible behavior. -> Mitigation: distinguish "no explicit AI config" from "invalid explicit AI config" and only use OAuth for the former.
- [Risk] Cached account catalog can become unauthorized after logout or token rejection. -> Mitigation: clear account snapshot on logout and invalidate on 401/403/token invalidation.
- [Risk] Showing all possible domain model categories creates noisy empty controls. -> Mitigation: hide empty groups in conversation selectors and show configured-but-empty groups only in settings/config views with diagnostics.

## Migration Plan

1. Introduce shared source/catalog/diagnostic contracts while keeping existing config file contracts readable.
2. Add account AI catalog API/client behind `neko-auth` or a small auth-adjacent service; keep raw tokens internal.
3. Add runtime account gateway snapshot cache and refresh triggers in the Agent Extension Host.
4. Add a provider source resolver in Agent Platform that merges explicit config and account gateway according to the priority rules.
5. Update ConfigBridge/Webview projection to show account gateway provider/model availability without secrets.
6. Update model selector projections to group Neko official account models first when available, then user config providers, while keeping LLM and domain model categories distinct.
7. Update conversation assembly/runtime provider source to carry source identity and reject invalid selections before runner configuration.
8. Add focused tests and VS Code smoke validation for account login, config priority, model grouping, cache refresh, and fail-visible errors.

Rollback is local and non-destructive: disable the account gateway source resolver path and retain existing explicit config behavior. No user project data migration is required because OAuth-derived account gateway snapshots are runtime/cache state only.

## Open Questions

- What exact Neko official API endpoints and response schema will provide account AI catalog, entitlement, usage, and catalog version?
- Should the account catalog cache live only in memory for MVP, or also in VS Code globalState with a short TTL for faster cold panel open?
- What default account model should Neko official API return for chat and each generation category when entitlement allows multiple models?
- Should manual refresh be exposed as a Webview button in MVP, or only as a command/diagnostic action?
