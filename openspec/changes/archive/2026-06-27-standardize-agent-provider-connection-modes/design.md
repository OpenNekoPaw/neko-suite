## Context

Neko Agent currently represents providers primarily through `ProviderType`. That type now includes official LLM vendors, OpenAI-compatible proxy protocols, local runtimes, and media generation vendors. The result is unclear configuration semantics: a provider may be an official direct API, a NewAPI gateway, a user-provided proxy, or a private local runtime, but callers can only infer this from loosely named IDs and provider types.

The requested product direction is to plan the full grouping now, implement NewAPI MVP first, preserve local model configuration, and place broader LLM/generation provider support on the roadmap. This fits Neko Suite's local VSCode client boundary: the local product should keep provider contracts explicit and testable without introducing cloud service governance or pretending every upstream provider plan/API variant is validated.

Five-layer analysis:

- Responsibility: `@neko/shared` owns provider/model configuration contracts. `neko-agent` platform owns default provider/model configuration, model discovery, adapter registry selection, and media routing. Webview code consumes projected settings only.
- Dependency: Layer 0 shared types remain host-agnostic. Platform imports shared contracts. Webview projections do not import provider SDKs or Extension APIs.
- Interface: Keep `ProviderConfig.type` as the adapter-selection key for compatibility, and add optional metadata for `connectionKind`, `protocolProfile`, `supportLevel`, and `requiresApiKey`. These fields describe configuration semantics without forcing a broad migration of every existing provider path.
- Extension: Future OneAPI/OpenRouter/SubAPI/direct official providers can be added as protocol profiles or provider presets without changing the provider/model projection shape. Generation models use the same provider/model contract and can be routed through NewAPI gateways first, with local generation profiles added later.
- Testing: Cover default provider grouping, local no-key provider selection, NewAPI/OneAPI-compatible adapter registration, Ollama refresh, and canonical default media model routing. Roadmap documentation covers support that is intentionally not implemented in the MVP.

## Goals / Non-Goals

**Goals:**

- Distinguish direct, local, and gateway provider connection paths. Custom endpoints are represented by provider identity, protocol profile, and support level, not by a separate connection mode.
- Make NewAPI gateway the MVP proxy/cloud path.
- Preserve local LLM configuration, especially API-key-free Ollama.
- Keep generation model defaults compatible with the same gateway contract while avoiding claims that every upstream generation provider is verified.
- Fix default media model references to canonical model IDs.
- Document official direct providers, additional proxy protocols, and expanded generation/local model support as roadmap work.

**Non-Goals:**

- Implement official direct API verification or plan/entitlement detection.
- Implement separate OneAPI/OpenRouter/SubAPI product-specific flows in this change.
- Build a Webview settings redesign.
- Implement local generation model execution.
- Guarantee all NewAPI endpoints support all vendor-specific model parameters.

## Decisions

1. Add connection metadata instead of replacing `ProviderType`.

   `ProviderType` still selects adapters and keeps existing configs readable. New optional fields describe configuration grouping:

   - `connectionKind`: `gateway`, `local`, or `direct`.
   - `protocolProfile`: `newapi`, `ollama`, `openai-chat`, `openai-responses`, `anthropic`, `google`, or other verified profiles.
   - `supportLevel`: `verified`, `compatible`, `experimental`, or `custom`.
   - `requiresApiKey`: explicit credential requirement for provider projections and selection.

   Alternative considered: split provider types into separate enums for vendor, protocol, and transport immediately. That is cleaner long term but too broad for an MVP because many existing platform and AI SDK paths already key off `type`.

2. Make the MVP provider set gateway/local-first.

   Defaults move away from official direct Anthropic/OpenAI/Google/DeepSeek providers. The MVP includes:

   - `neko-gateway`: built-in NewAPI gateway profile.
   - `custom-newapi`: disabled custom NewAPI endpoint profile using `connectionKind: "gateway"` and `supportLevel: "custom"`.
   - `ollama-local`: enabled local Ollama profile with `requiresApiKey: false`.

   Alternative considered: keep official direct providers enabled and add NewAPI beside them. That preserves familiar vendor labels but keeps the current ambiguity and creates false confidence around plan-specific direct APIs.

3. Keep NewAPI as the only proxy protocol implemented in MVP.

   OneAPI remains adapter-compatible where existing code already supports it, but product configuration defaults and docs focus on NewAPI behavior. OpenRouter/SubAPI/direct official providers stay as roadmap profiles until there are verified API mappings, model parameters, and tests.

4. Treat LLM vision as a capability, not a hard requirement.

   LLM models do not need `vision` to be selectable for text chat. Workflows that require visual understanding must request models with the `vision` capability. This prevents local text-only models from being excluded from the MVP.

5. Route generation defaults through canonical model IDs.

   Media routing resolves configured default model IDs directly. Defaults must therefore store model IDs, not API names or display names. UI alias normalization can remain for user-facing option selection, but routing should not depend on aliases.

## Risks / Trade-offs

- [Risk] NewAPI gateways differ in supported upstream models and parameters. → Mitigation: mark custom endpoints as `custom` support, avoid claiming broad upstream guarantees, and make unsupported generation/direct paths roadmap work.
- [Risk] A built-in Neko gateway URL/key may not be configured in local development. → Mitigation: expose the provider as a gateway profile but require credentials through existing config/env resolution; missing credentials remains visible instead of silently falling back to direct vendors.
- [Risk] Existing user configs may still contain direct provider entries. → Mitigation: optional metadata keeps existing configs structurally valid; this change changes defaults but does not delete user-owned persisted provider entries.
- [Risk] Local Ollama may be offline. → Mitigation: the provider remains selectable/configurable without an API key; model discovery reports provider failures without throwing the whole settings flow.
- [Risk] Generation model entries may look broader than the verified MVP. → Mitigation: only provide gateway-backed default model records and document broader vendor-specific support in Roadmap.

## Migration Plan

- Update shared provider config types with optional grouping fields.
- Update default Agent config to use gateway/local defaults and canonical default media model IDs.
- Keep existing adapter-selection behavior through `type`; add OneAPI-compatible LLM registry coverage if missing.
- Update provider configured/selection logic so `requiresApiKey: false` providers count as configured.
- Add focused tests for the new defaults and local no-key behavior.
- Update Roadmap documents with future direct provider and generation-provider support.

No durable project format migration is required. Existing user configuration entries remain readable because the new metadata fields are optional.
