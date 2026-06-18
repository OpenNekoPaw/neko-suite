## Why

Neko Agent provider configuration currently mixes vendor identity, connection path, protocol compatibility, and model modality in the same provider type list. This makes the default experience hard to reason about: official direct APIs have plan, entitlement, endpoint, and parameter differences, while local models and NewAPI-compatible gateways need different configuration and validation rules.

This change defines the complete provider grouping up front, then implements a narrow MVP: NewAPI-compatible gateway configuration plus private local model configuration. Official direct providers and broad LLM/generation model catalogs remain future roadmap items until each path is verified.

## What Changes

- Introduce provider connection grouping for `gateway`, `custom-gateway`, `local`, and future `direct` providers.
- Add protocol/support metadata so provider type can continue selecting adapters while UI/config can distinguish NewAPI-compatible gateways from local private models and future direct official APIs.
- Make NewAPI-compatible gateway the MVP cloud/proxy path instead of defaulting to official direct vendor APIs.
- Preserve local model configuration, including API-key-free local providers such as Ollama.
- Fix default media model references so configured defaults use canonical model IDs.
- Document official direct LLM providers, broader LLM model catalogs, and generation model provider expansion as roadmap work rather than MVP guarantees.

Non-goals for this change:

- No official direct provider API validation, entitlement probing, or plan mapping.
- No guarantee that every upstream LLM or generation model exposed by a compatible gateway supports every model-specific parameter.
- No new Webview settings redesign beyond consuming the existing provider/model projections.
- No local generation model runtime integration beyond preserving the local provider contract.

## Capabilities

### New Capabilities

- `agent-provider-connection-modes`: Classifies Agent providers by connection mode and protocol support, and defines MVP behavior for NewAPI-compatible gateways and local model configuration.

### Modified Capabilities

- None.

## Impact

- Shared configuration contracts in `packages/neko-types/src/types/config.ts`.
- Agent default configuration in `packages/neko-agent/packages/platform/src/config/default-config.ts`.
- Agent provider/model projection helpers in `packages/neko-agent/packages/platform/src/config/assistant-config.ts`.
- LLM adapter registry in `packages/neko-agent/packages/platform/src/llm/adapter/adapter-registry.ts`.
- Media routing defaults in `packages/neko-agent/packages/platform/src/media/routing/media-routing-manager.ts`.
- Focused tests for default config, local provider configuration, adapter registration, Ollama refresh, and media defaults.
- Roadmap/docs updates for future official direct providers, OneAPI/OpenRouter/SubAPI, broader LLM families, and generation model support.
