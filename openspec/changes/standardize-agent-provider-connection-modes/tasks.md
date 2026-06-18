## 1. Shared Contract

- [ ] 1.1 Add provider connection, protocol profile, support level, and API-key requirement fields to shared provider configuration types.
- [ ] 1.2 Keep the new fields optional so existing user-owned provider config remains readable.

## 2. NewAPI MVP Defaults

- [ ] 2.1 Replace official-direct default Agent providers with NewAPI-compatible gateway, custom NewAPI-compatible gateway, and local Ollama provider profiles.
- [ ] 2.2 Update default LLM and generation model records to use gateway/local provider IDs and canonical model IDs.
- [ ] 2.3 Ensure default media model configuration references canonical model IDs that route directly.

## 3. Runtime Projection And Adapters

- [ ] 3.1 Treat `requiresApiKey: false` providers as configured in Assistant provider projections and default selection.
- [ ] 3.2 Register OneAPI-compatible LLM adapter coverage through the existing generic adapter path.
- [ ] 3.3 Preserve Ollama local model refresh behavior with the local provider profile.

## 4. Roadmap And Verification

- [ ] 4.1 Update Roadmap/docs to mark official direct APIs, additional proxy protocols, broad LLM families, and broad generation provider coverage as future work.
- [ ] 4.2 Add or update focused tests for provider grouping, local no-key configuration, adapter registration, Ollama refresh, and canonical media defaults.
- [ ] 4.3 Run OpenSpec status and focused validation commands, then record remaining residual risk.
