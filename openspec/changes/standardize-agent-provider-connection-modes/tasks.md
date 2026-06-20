## 1. Shared Contract

- [x] 1.1 Add provider connection, protocol profile, support level, and API-key requirement fields to shared provider configuration types.
- [x] 1.2 Keep the new fields optional so existing user-owned provider config remains readable.

## 2. NewAPI MVP Defaults

- [x] 2.1 Replace official-direct default Agent providers with NewAPI gateway, custom NewAPI gateway, and local Ollama provider profiles.
- [x] 2.2 Update default LLM and generation model records to use gateway/local provider IDs and canonical model IDs.
- [x] 2.3 Ensure default media model configuration references canonical model IDs that route directly.

## 3. Runtime Projection And Adapters

- [x] 3.1 Treat `requiresApiKey: false` providers as configured in Assistant provider projections and default selection.
- [x] 3.2 Register OneAPI-compatible LLM adapter coverage through the existing generic adapter path.
- [x] 3.3 Preserve Ollama local model refresh behavior with the local provider profile.

## 4. Roadmap And Verification

- [x] 4.1 Update Roadmap/docs to mark official direct APIs, additional proxy protocols, broad LLM families, and broad generation provider coverage as future work.
- [x] 4.2 Add or update focused tests for provider grouping, local no-key configuration, adapter registration, Ollama refresh, and canonical media defaults.
- [x] 4.3 Run OpenSpec status and focused validation commands, then record remaining residual risk.

## 5. Conversation Fail-Visible Selection

- [x] 5.1 Require an explicit chat provider/model selection for Agent conversation turns.
- [x] 5.2 Reject missing, disabled, unconfigured, or provider/model-mismatched chat selections before runner configuration.
- [x] 5.3 Add focused runtime and extension tests proving the conversation path does not fall back to another provider/model.
