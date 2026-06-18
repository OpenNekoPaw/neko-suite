## 1. Contracts

- [x] 1.1 Add provider source metadata to AI SDK resolved provider contracts.
- [x] 1.2 Add optional provenance/degraded fields to summarization and classification result contracts.
- [x] 1.3 Rename Agent runtime unmet-precondition result status away from `fallback`.

## 2. P0 Behavior Changes

- [x] 2.1 Mark legacy media bridge usage in AI SDK provider resolution and platform task output metadata.
- [x] 2.2 Change permission auto mode with missing traits registry from allow to ask/fail-closed behavior.
- [x] 2.3 Update Agent runtime missing-provider/platform/manager paths and tests to use unmet-precondition status.

## 3. P1 Degraded Result Provenance

- [x] 3.1 Mark LLM summarizer and creative summarizer fallback summaries as degraded/fallback sourced.
- [x] 3.2 Mark LLMClassifier rule fallback results as degraded/fallback sourced.

## 4. Low-Risk Fallback Removal

- [x] 4.1 Remove Canvas `neko.assets.getAllEntities` command fallback and require typed Neko Assets API.

## 5. Validation

- [x] 5.1 Add or update focused tests for AI SDK bridge provenance, permission auto mode, runtime preconditions, summarizer/classifier provenance, and Canvas typed API behavior.
- [x] 5.2 Run focused validation commands and record residual risk.
