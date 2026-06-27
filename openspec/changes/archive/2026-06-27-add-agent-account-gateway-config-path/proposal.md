## Why

Neko Agent now has a clear local configuration contract for NewAPI gateways and local models, but OAuth login is still only an account-status projection and cannot provide the default AI API path. This change completes the final provider resolution design: explicit user configuration stays highest priority, while a logged-in Neko account can supply a runtime-only official gateway catalog when no explicit AI config is selected.

## What Changes

- Add an OAuth-backed Neko account gateway path that fetches official AI catalog, model availability, entitlement, and usage projection from Neko official APIs.
- Represent the OAuth path as a runtime-only `neko-account-gateway` provider/model snapshot owned by the Agent Extension Host and Platform layers.
- Preserve explicit local user configuration as the highest-priority AI provider source when `~/.neko/config.toml`, environment credentials, or runtime config explicitly select an AI provider/model.
- Keep user-owned config files able to represent `direct`, `gateway`, and `local` providers, while treating unverified official direct provider presets as roadmap-scoped until each API is verified.
- Keep OAuth-derived tokens, gateway credentials, and internal routing details out of `~/.neko/config.toml`, workspace files, Webview state, logs, and prompt/tool payloads.
- Reuse cached account catalog snapshots for new Agent sessions and refresh on account/session changes, TTL expiry, manual refresh, or provider authorization failures instead of blocking every new conversation on a catalog request.
- Project Webview model lists as source-grouped and capability-scoped data: Neko official account gateway models first after OAuth catalog success, then models from user config providers, with LLM and domain models kept distinct.
- Fail visibly when neither explicit config nor account gateway catalog can satisfy the selected provider/model; do not fall back to another provider, first model, or hard-coded default.
- Leave generation provider expansion as roadmap work. The account gateway catalog may expose LLM and generation models, but the MVP only guarantees NewAPI routing for catalog-backed models that Neko official APIs return.

Non-goals:

- No official direct provider API validation, plan probing, or vendor-specific parameter normalization in this change.
- No product-specific OneAPI, OpenRouter, SubAPI, Suno, Seedance, Kling, or other direct generation-provider setup flows.
- No storage of OAuth-derived AI API secrets in user config files.
- No Webview settings redesign beyond showing the projected account gateway/provider state, source-grouped model lists, and diagnostics.

## Capabilities

### New Capabilities

- `agent-account-gateway-config-path`: Defines the two-path AI configuration model, account gateway catalog behavior, priority resolution, secret boundaries, refresh policy, and fail-visible conversation semantics.

### Modified Capabilities

- None.

## Impact

- `packages/neko-auth`: exported extension API needs an account AI catalog/session capability beyond the current `getCloudToken` stub.
- `packages/neko-agent/packages/extension`: ConfigBridge and chat/session startup need to request account AI snapshots, cache them, and broadcast projected provider/model state.
- `packages/neko-agent/packages/platform`: ConfigManager/provider resolution needs to merge an explicit user config source with a runtime-only account gateway source without persisting OAuth secrets.
- `packages/neko-agent/packages/agent`: conversation runtime should continue requiring explicit provider/model selection and should reject unavailable account gateway models before runner configuration.
- `packages/neko-agent/packages/webview`: settings/onboarding/header/model selector projections need to distinguish configured file providers from account gateway availability without receiving secrets, and model lists need to group by source/provider and model capability.
- `packages/neko-types`: shared DTOs may need account catalog, entitlement, provider source, and diagnostic types if they cross package boundaries.
- Documentation and tests should record that local config is highest priority, OAuth account gateway is the default no-file path, direct/provider-family expansion remains roadmap-scoped, and invalid config remains fail-visible.
