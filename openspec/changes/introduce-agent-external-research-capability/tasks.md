## 1. Contract and Configuration

- [ ] 1.1 Record MCP-backed adapter as the first real provider path and document that Neko does not bundle or operate the underlying web search service.
- [ ] 1.2 Add `ExternalResearchMode`, external research config, `ResearchSource`, `ResearchNote`, search/fetch input, and search/fetch result DTOs in the shared contract layer.
- [ ] 1.3 Add `ExternalResearchProvider` and provider capability flags without importing provider SDKs into shared contracts.
- [ ] 1.4 Add config normalization defaults for `externalResearch` with disabled mode, undefined provider id, live approval enabled, project-context query enrichment disabled, max results 5, and fetch content budget 12000.
- [ ] 1.5 Add explicit MCP-backed mapping config for server id, search/fetch tool name, argument names, output schema ids, and adapter-only raw MCP exposure behavior.
- [ ] 1.6 Add validators/type guards for external research config, MCP mapping config, tool inputs, provider outputs, `ResearchSource`, `ResearchNote`, and unsupported mode diagnostics.

## 2. Tool Metadata Drift Cleanup

- [ ] 2.1 Remove `WebSearch` from unconditional resident/core tool metadata, or make it conditional on executable external research capability registration.
- [ ] 2.2 Ensure disabled external research sessions do not inject `WebSearch` or `WebFetch` into model-visible resident/core tools.
- [ ] 2.3 Ensure permission metadata mentioning `WebSearch`, `WebFetch`, or `WebFetch(domain:...)` cannot make an unregistered tool executable.
- [ ] 2.4 Add poison-path tests proving disabled or provider-missing external research cannot return success through project search, MCP, or model-only fallback.
- [ ] 2.5 Add poison-path tests proving MCP tools bound to external research are not exposed as ordinary model-visible `mcp__...` tools by default.

## 3. Capability Provider and Tool Registration

- [ ] 3.1 Implement an `external-research` Agent capability provider that registers `WebSearch` when config and provider resolution succeed, and registers `WebFetch` only for `live` mode.
- [ ] 3.2 Wire the capability provider into TUI/CLI and VSCode Extension host adapter composition without Webview-side network access.
- [ ] 3.3 Add tests for disabled mode, enabled indexed mode, enabled live mode, missing provider diagnostics, and unsupported provider mode diagnostics.
- [ ] 3.4 Ensure plan/read-only mode treats external research tools as read-only external tools only when they are registered and permitted.

## 4. Provider and Tool Execution

- [ ] 4.1 Implement a deterministic fake `ExternalResearchProvider` for unit and runtime tests.
- [ ] 4.2 Implement `WebSearch` execution through `ExternalResearchProvider.search`, including max results, provider id, mode metadata, citation/source validation, and cancellation.
- [ ] 4.3 Implement `WebFetch` execution through `ExternalResearchProvider.fetch`, including URL validation, redirects, domain policy, content budget behavior, source metadata, and cancellation.
- [ ] 4.4 Add the MCP-backed provider adapter behind `ExternalResearchProvider` using explicit tool mapping rather than name/description inference.
- [ ] 4.5 Add structured MCP search/fetch output schema normalization for `neko.externalResearch.search.v1` and `neko.externalResearch.fetch.v1`.
- [ ] 4.6 Add provider mismatch tests proving unsupported domain filters, unsupported indexed/live mode, missing citations, and unstructured prose-only MCP results fail visibly.
- [ ] 4.7 Add focused MCP adapter integration or harness tests gated away from default unit tests.

## 5. Permission, Approval, and Safety

- [ ] 5.1 Add or reuse a safety classification for read-only external calls that remains distinct from local read-only project/file queries.
- [ ] 5.2 Reuse and extend `WebFetch(domain:...)` permission matching for external fetch calls.
- [ ] 5.3 Add configured allowed/blocked domain policy for `WebSearch` and `WebFetch`.
- [ ] 5.4 Add live approval prompts that show final outgoing query or URL, mode, provider id, and domain before provider execution.
- [ ] 5.5 Add URL safety tests for unsupported schemes, Webview/blob/data URIs, localhost, loopback, private-network, link-local, blocked domains, and unsafe redirects.
- [ ] 5.6 Add tests proving `allowProjectContextInQuery: false` prevents runtime-added hidden project context in provider requests.
- [ ] 5.7 Add tests proving `WebSearch` allowed/blocked domain policy requires provider-native enforcement and cannot be satisfied by result post-filtering.

## 6. Trace, Artifacts, and Persistence Boundary

- [ ] 6.1 Project `WebSearch` and `WebFetch` results into Agent trace/timeline with mode, provider id, query or URL, approval state, and source metadata.
- [ ] 6.2 Add session-level `ResearchSource` rendering/projection without writing project memory or canonical project facts.
- [ ] 6.3 Add explicit user-confirmed `ResearchNote` persistence action or facade that saves to a user-selected Markdown project document or research-note artifact and retains source provenance.
- [ ] 6.4 Add tests proving external research results do not automatically write project memory, character settings, worldbuilding, entity metadata, asset metadata, or project files.
- [ ] 6.5 Add tests proving saved `ResearchNote` remains research material unless a separate explicit promotion workflow is invoked.
- [ ] 6.6 Add tests proving Markdown `ResearchNote` includes source provenance and does not write `.neko` project memory.

## 7. Project Search Separation

- [ ] 7.1 Add boundary tests proving `QueryProjectSearch` does not call `ExternalResearchProvider`.
- [ ] 7.2 Add tests proving unsaved external results do not become project search items in future sessions.
- [ ] 7.3 Keep `@neko/search` provider partitions project-local and document any explicit research-note indexing behavior if saved notes are later projected into local search.

## 8. Prompt, Documentation, and UX Copy

- [ ] 8.1 Add capability-level prompt guidance that frames external research as cited creative research intake and developer lookup, not default model knowledge repair.
- [ ] 8.2 Ensure builtin/custom skill content does not include provider-specific tool protocol tutorials or runtime parameter tables.
- [ ] 8.3 Document external research config, modes, approval behavior, citation requirements, and project-memory separation in the appropriate Agent/package docs.
- [ ] 8.4 Add prompt/content regression tests proving skills do not instruct models to auto-save external sources into project memory or canonical project facts.

## 9. Validation

- [ ] 9.1 Run focused shared contract and validator tests for external research DTOs/config.
- [ ] 9.2 Run Agent capability registration, tool injection, permission, and runtime tests.
- [ ] 9.3 Run provider fake tests and selected real provider harness tests if credentials/config are available.
- [ ] 9.4 Run project search boundary tests.
- [ ] 9.5 Run memory/persistence boundary tests.
- [ ] 9.6 Run relevant package typecheck/build commands for shared contracts, `neko-agent`, platform/config, CLI/TUI, and Extension host surfaces.
- [ ] 9.7 Run `pnpm check:legacy-debt` or the repository's narrower legacy/fallback guardrails covering tool metadata drift.
- [ ] 9.8 Run `openspec validate introduce-agent-external-research-capability --strict`.
