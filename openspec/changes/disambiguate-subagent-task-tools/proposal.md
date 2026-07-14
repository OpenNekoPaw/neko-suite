## Why

SubAgent runs and asynchronous media Tasks have distinct runtime ownership, but the model-facing SubAgent output tool still accepts a generic `task_id`. This allowed a real DeepSeek image-generation turn to pass a media `taskId` into the SubAgent registry and receive `SubAgent not found`, despite the media Task later completing normally.

## What Changes

- **BREAKING** Rename the SubAgent output tool from `task_output` to `subagent_output` and its identifier parameter from `task_id` to `subagent_id`.
- **BREAKING** Rename the SubAgent creation tool from the generic `task` name to `subagent`, preserving `subAgentId` as its result identity.
- Remove the old tool names and parameter field without aliases or fallback routing.
- Make SubAgent control reject non-SubAgent identifiers with a precise fail-visible diagnostic before registry lookup.
- Clarify media generation contracts so their `taskId` is delivered through the Task observation/continuation path and must not be queried through SubAgent tools.
- Add deterministic contract/path tests and a focused real Agent evaluation covering media generation routing and background SubAgent result collection.

## Capabilities

### New Capabilities

- `agent-child-run-tool-contract`: Defines distinct model-facing tools, identifiers, runtime scopes, and result-delivery paths for SubAgents and asynchronous Tasks.

### Modified Capabilities

None.

## Impact

- `packages/neko-agent/packages/agent`: SubAgent tool schemas, implementations, types, registry tests, and exported tool names.
- `packages/neko-agent/packages/platform`: media generation tool descriptions and contract tests.
- Agent tool catalogs, prompt/evaluation fixtures, and tests that reference `task` or `task_output` as SubAgent operations.
- No persisted user data, generated assets, provider contracts, or media Task lifecycle is migrated or discarded. The breaking surface is an unreleased internal Agent tool contract.
