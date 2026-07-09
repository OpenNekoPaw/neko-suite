# ADR: Agent External Research Boundary

## Status

Proposed

## Context

Neko Agent needs a way to gather current external references for creative work and developer documentation lookup. The current codebase contains `WebSearch` and `WebFetch` vocabulary in metadata and permissions, but no built-in executable web research tools.

The risk is two-sided: without external research, Agent remains limited by model memory and local project context; with uncontrolled web access, Agent can leak project context, import untrusted material, and silently rewrite local creative truth.

## Decision

Introduce an opt-in `external-research` capability. The capability registers `WebSearch` and `WebFetch` only when enabled and backed by a valid `ExternalResearchProvider`.

The first real provider path is MCP-backed. Neko provides the adapter from user-configured MCP search/fetch capabilities into `ExternalResearchProvider`; it does not bundle, operate, or require a Neko-owned third-party search service. The actual search capability may still come from a third-party service, hosted model search, local search appliance, or another user-owned MCP-backed implementation.

MCP-backed search/fetch binding is explicit machine configuration. Neko does not infer research tools from MCP tool names or descriptions. Bound MCP tools are adapter-only by default and are not exposed as ordinary model-visible `mcp__...` tools unless a separate raw MCP exposure setting explicitly enables that path.

MCP-backed results must conform to Neko external research schemas. Natural-language MCP output without structured source metadata is not successful external research.

External research results are cited intake material. They do not automatically become project memory, character settings, worldbuilding facts, entity metadata, asset metadata, or durable project files. A local `ResearchNote` can be created only when the user explicitly asks to save selected research into a user-selected Markdown project document or research-note artifact.

The supported modes are `disabled`, `indexed`, and `live`. `cached` is not a mode because local caching is an implementation detail and provider-side indexing is already represented by `indexed`.

`WebFetch` is available only in `live` mode because fetching a concrete URL is live retrieval.

`WebSearch` domain allow/block policy is a provider-enforced safety control. Neko result post-filtering is not sufficient to satisfy domain policy because an unrestricted query has already left the local runtime.

Default configuration is conservative:

```ts
externalResearch: {
  mode: 'disabled',
  providerId: undefined,
  requireApprovalForLive: true,
  allowProjectContextInQuery: false,
  maxResults: 5,
  maxFetchContentTokens: 12000,
}
```

## Consequences

- Agent gains a source-cited research path for creative reference gathering.
- Project search remains local and does not become public web search.
- Tool metadata must match executable registration; unavailable `WebSearch` cannot remain resident/core.
- Live external access requires visible approval by default.
- `indexed` mode is search-only; concrete URL fetching requires `live`.
- Research persistence and fact promotion remain explicit user-owned actions.
- `ResearchNote` v1 is Markdown with source provenance, not `.neko` memory.
- Provider-specific transport is isolated behind `ExternalResearchProvider`.

## Rejected Alternatives

- **Default-on web search**: rejected because external provider calls can leak project intent and create trust ambiguity.
- **Merge web search into `@neko/search`**: rejected because project search and public research have different ownership, provenance, and persistence semantics.
- **Automatic memory updates from web results**: rejected because external sources must not silently rewrite canonical local creative truth.
- **Expose `cached` mode**: rejected because it confuses provider index behavior, local cache optimization, and privacy guarantees.
- **Ship a Neko-owned third-party search service first**: rejected because MCP-backed integration proves the capability boundary without forcing vendor, credential, pricing, or availability decisions into core Agent architecture.
- **Infer MCP search/fetch tools from names or descriptions**: rejected because names and descriptions are not stable contracts and can bind unrelated tools.
- **Accept prose-only MCP results**: rejected because external research requires source provenance and deterministic citation extraction.
- **Expose bound MCP tools by default**: rejected because raw `mcp__...` calls can bypass `WebSearch`/`WebFetch` safety, approval, trace, and citation policy.
