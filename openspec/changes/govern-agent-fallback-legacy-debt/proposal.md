## Why

Fallback and legacy surfaces in the Agent stack now mix legitimate VS Code/client resilience with hidden compatibility behavior that can mask missing providers, missing permission metadata, and degraded AI results. Because Neko Suite is still prelaunch, the project can tighten internal contracts now while preserving user-visible local client boundaries and current media provider functionality.

## What Changes

- Make Agent fallback/legacy execution paths fail-visible or explicitly observable instead of silently returning success.
- Keep the AI SDK legacy media bridge for currently dependent providers, but mark bridge-sourced execution and require tests that prove new native paths do not accidentally hit the bridge.
- Change Agent permission auto mode so missing tool traits metadata asks the user or fails closed instead of allowing every tool.
- Rename Agent runtime precondition results away from `fallback` to a contract that reflects setup/runtime prerequisites not being met.
- Add structured provenance/degraded metadata to summarization and asset classification results produced without the intended LLM path.
- Remove Canvas' typed-API fallback to the older `neko.assets.getAllEntities` command while leaving the command available for other callers until they migrate.
- Document and validate naming-debt cleanup for benign `fallback*` identifiers without changing React/ErrorBoundary terminology.

## Capabilities

### New Capabilities
- `agent-fallback-legacy-governance`: Defines observable legacy bridge use, fail-visible preconditions, permission fail-closed behavior, degraded-result provenance, and command fallback retirement rules for Agent-related local-client flows.

### Modified Capabilities

## Impact

- Agent runtime contracts in `packages/neko-agent/packages/agent/src/runtime/*` and their tests.
- Permission checks in `packages/neko-agent/packages/agent/src/permission/*` and tests that currently assert backward-compatible auto allow.
- AI SDK media provider resolution in `packages/neko-agent/packages/ai-sdk/src/*` and platform media task execution in `packages/neko-agent/packages/platform/src/media/*`.
- Shared summarization and asset classification result types in `packages/neko-types/src/types/*` plus Agent/Assets callers.
- Canvas extension asset lookup in `packages/neko-canvas/packages/extension/src/extension.ts`.
- ADR and OpenSpec validation evidence for `fallback`/`legacy` governance.
