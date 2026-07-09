## Why

Neko Agent currently has local file/project search and optional MCP tools, but it has no built-in, auditable way to gather current external references for creative work. At the same time, `WebSearch` and `WebFetch` already appear in tool metadata and permission code without executable tools, creating contract drift that can make the model believe an unavailable capability exists.

This change introduces an opt-in external research capability for cited creative research and developer documentation lookup while preserving Neko Suite's local VSCode client boundary, project-search semantics, and user-controlled project memory.

## What Changes

- Add an `external-research` Agent capability that registers `WebSearch` and `WebFetch` only when external research is explicitly enabled.
- Add an `ExternalResearchProvider` contract so Agent runtime can call provider adapters without binding to a specific web search vendor, MCP server, or hosted model API.
- Use a user-configured MCP-backed adapter as the first real provider path; Neko supplies the adapter boundary, while the configured MCP server owns the actual external search/fetch service.
- Add cited research artifact contracts: `ResearchSource` for source/provenance metadata and `ResearchNote` for user-confirmed local research material.
- Require explicit machine-readable MCP tool binding for external research; Neko must not infer search/fetch tools from MCP tool names or descriptions.
- Require MCP-backed search/fetch results to conform to Neko external research schemas; unstructured natural-language MCP output must not count as successful external research.
- Treat MCP tools bound to external research as adapter-only by default so the model cannot bypass `WebSearch`/`WebFetch` policy by calling raw `mcp__...` tools.
- Add external research configuration with conservative defaults:
  - `mode: 'disabled'`
  - `providerId: undefined`
  - `requireApprovalForLive: true`
  - `allowProjectContextInQuery: false`
  - `maxResults: 5`
  - `maxFetchContentTokens: 12000`
- Support research modes `disabled`, `indexed`, and `live`.
- Treat external research as a cited intake path for creative references, not as automatic project knowledge.
- Require explicit user intent before saving web search results into local research notes, project memory, character settings, worldbuilding facts, or entity metadata.
- Wire `WebSearch` and `WebFetch` through permission/approval gates, domain policy, URL safety checks, cancellation, budgets, and timeline/source provenance.
- Require `WebSearch` domain filters to be enforced by the provider/MCP capability itself; result post-filtering alone is not a safety boundary.
- Keep `QueryProjectSearch` and `@neko/search` project-local; public web research must not be folded into project search semantics.
- Fix the existing `WebSearch`/`WebFetch` contract drift by either registering executable tools when enabled or removing unavailable tool metadata from resident/core injection paths.
- Save first-version `ResearchNote` artifacts as explicit user-selected Markdown research documents with source provenance.

### Non-Goals

- Do not make public web search a default always-on Agent capability.
- Do not present external research as a general upgrade to the model's knowledge.
- Do not let web results automatically become canonical project facts, project memory, character settings, worldbuilding, or entity metadata.
- Do not let Webview code directly perform network access or provider calls.
- Do not replace MCP; user-configured MCP servers remain a separate external capability path.
- Do not bundle, operate, or require a Neko-owned third-party web search service in the first implementation.
- Do not add cloud multi-tenant research infrastructure, remote indexing services, or distributed provider governance for this local product boundary.
- Do not implement image search, deep research reports, or automatic research-note-to-asset ingestion in the first implementation.

## Capabilities

### New Capabilities

- `agent-external-research-capability`: Defines opt-in external research behavior for `WebSearch`, `WebFetch`, provider adapters, configuration defaults, permission/domain policy, cited source metadata, user-confirmed research notes, and separation from project search and project memory.

### Modified Capabilities

- `agent-fallback-legacy-governance`: External research implementation must remove or fail-close unavailable `WebSearch` resident/core metadata rather than leaving a tool name that can appear available without an executable handler.

## Impact

- Shared contracts:
  - `packages/neko-types/src/types/` for external research config, provider input/output DTOs, `ResearchSource`, `ResearchNote`, and tool names/category metadata.
- Agent runtime:
  - Capability provider registration, `ToolRegistry` registration, permission matching, confirmation prompts, tool injection, timeline/tool result projection, and cancellation/budget handling.
- Agent platform/config:
  - User/workspace config normalization for `externalResearch`, provider id resolution, and conservative defaults.
- CLI/TUI and VSCode Extension host adapters:
  - Host-owned provider adapter registration and approval prompts for live external access.
- Search boundary:
  - `@neko/search` remains project-local; no public web provider is added to project search partitions.
- Documentation and quality:
  - Architecture/ADR notes for external research as cited intake, OpenSpec specs/tasks, contract tests, permission tests, provider fake tests, and strict OpenSpec validation.
