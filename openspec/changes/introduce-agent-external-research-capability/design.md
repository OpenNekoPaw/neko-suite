## Context

Neko Agent has local file tools, project search through `QueryProjectSearch`, optional user-configured MCP servers, and provider/model configuration for Agent conversations. It does not have an executable built-in public web research path.

The current codebase already contains partial `WebSearch`/`WebFetch` vocabulary in tool metadata, `CORE_TOOLS`, read-only permission lists, and `WebFetch(domain:...)` pattern matching. That vocabulary is useful, but it is currently ahead of the executable capability. The design must either complete the capability or remove unavailable metadata from resident injection paths so the runtime fails visibly instead of advertising a tool that cannot run.

The product target is not generic "agent internet access." The primary product scenario is creative external reference gathering before or during authoring. Developer documentation lookup is a secondary support path. Fact answering is supported only when the user asks for externally sourced context. Public web access must not become the default story for all Agent uncertainty.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Agent owns tool registration, permission checks, cancellation, tool trace, and source projection. Host/platform code owns provider adapter wiring and config resolution. External providers own search/fetch transport. Project search remains owned by `@neko/search`. Project memory/entity/worldbuilding owners decide whether a user-confirmed research note becomes canonical local data. |
| Dependency | Shared DTOs and config types live in Layer 0 contracts without VSCode, DOM, React, or feature-package dependencies. Concrete provider adapters live behind host/platform boundaries. Webview never calls external networks directly. Feature packages consume cited research artifacts or user-confirmed notes, not provider internals. |
| Interface | The stable boundary is `ExternalResearchProvider` plus `WebSearch`/`WebFetch` tool DTOs and `ResearchSource`/`ResearchNote` artifacts. Provider-specific fields stay behind adapter metadata and must not leak into project search or project memory contracts. |
| Extension | New providers can implement the provider interface. New research artifact consumers can accept `ResearchSource` or `ResearchNote` without depending on the search provider. Image search, deep research, domain presets, and research-note-to-asset workflows require explicit future changes. |
| Testing | Contract tests cover DTO guards. Tool tests cover disabled/enabled registration, domain policy, URL safety, approval, cancellation, max results, content token budgets, and citation metadata. Runtime tests prove disabled mode does not inject tools and enabled mode executes through the configured provider. Poison-path tests prove unavailable resident metadata cannot masquerade as success. |
| Proportionality | This is a local VSCode client capability with external provider calls, not a remote research service, tenant policy system, crawler, or distributed cache. The abstraction exists only at the real boundary: external provider access and auditable research artifacts. |
| Fail-visible behavior | Missing provider id, unsupported mode, disabled capability, unregistered tools, invalid URLs, blocked domains, unsafe redirects, provider schema mismatch, missing citations, and attempted automatic persistence all fail with visible diagnostics. They must not fall back to project search, MCP, model memory, empty success, or silent defaults. |

## Goals / Non-Goals

**Goals:**

- Introduce opt-in `external-research` capability for creative research.
- Expose `WebSearch` and `WebFetch` tools only when the capability is enabled and a provider is configured.
- Define `ExternalResearchProvider` as the host-agnostic provider port.
- Return cited `ResearchSource` metadata for every externally sourced claim/result.
- Define `ResearchNote` as user-confirmed local research material.
- Prevent external results from automatically mutating project memory, character settings, worldbuilding, entity metadata, or other canonical facts.
- Keep `@neko/search` project-local and semantically separate from public web research.
- Require approval for live external access by default.
- Prevent automatic project-context enrichment of outgoing web queries by default.
- Fix `WebSearch`/`WebFetch` resident metadata drift.

**Non-Goals:**

- Do not make public web research default-on.
- Do not make Webview code perform provider/network calls.
- Do not replace MCP or make MCP search look like built-in web search.
- Do not implement a crawler, durable web index, deep research job system, image search, or automatic source ingestion in this change.
- Do not let skill prompt content describe provider-specific tool protocols; capability/provider prompts and tool schemas own those details.
- Do not define a final research-note storage UI beyond the explicit user-confirmed persistence boundary.

## Decisions

### Decision 1: Model the feature as `external-research`, not `web-search`

The capability id SHALL be `external-research`. The tools SHALL be `WebSearch` and `WebFetch`. The provider port SHALL be `ExternalResearchProvider`. Artifacts SHALL be `ResearchSource` and `ResearchNote`.

Rationale: Tool names remain familiar and align with existing permission vocabulary, while the capability name keeps the domain broader than public web pages. Future providers can include documentation indexes, paper search, market feeds, or authorized research connectors without renaming the capability.

Rejected alternative: Put the feature under `@neko/search` as another project search partition. That would blur local project search with external source intake and make web results look like project-owned facts.

### Decision 2: Use explicit modes `disabled`, `indexed`, and `live`

The configuration mode SHALL be:

```ts
type ExternalResearchMode = 'disabled' | 'indexed' | 'live';
```

- `disabled`: do not register `WebSearch`/`WebFetch`, do not inject related resident tool metadata.
- `indexed`: allow provider-backed `WebSearch` over provider-maintained indexes without opening live pages through Neko's runtime.
- `live`: allow live external retrieval and URL fetches through provider/runtime policy.

`WebFetch` requires `live` mode. Fetching a concrete URL is treated as live retrieval even when a provider has indexed search support.

`cached` is intentionally not a mode. Local result caching is an implementation optimization and must not be presented as a privacy or offline guarantee.

Rejected alternative: Copy Codex's `cached` terminology directly. In Neko, it would be ambiguous because "cached" could mean provider-maintained index, local cache, previous session artifact, or offline-only result.

### Decision 3: Default configuration is conservative

The default configuration SHALL be:

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

When disabled, the capability must be absent, not merely hidden. When enabled without a valid provider, startup/session creation must produce a visible configuration diagnostic instead of silently using MCP, project search, or a model default.

Rejected alternative: Enable indexed research by default because it is read-only. Even indexed search sends user queries to an external provider and can leak project intent, so it must be explicit.

### Decision 4: External results are cited intake, not canonical knowledge

`WebSearch` and `WebFetch` results SHALL return `ResearchSource` metadata with URL, title/snippet when available, fetched/searched time, provider id, mode, and citation metadata. Results MAY produce a session artifact, but they SHALL NOT write project memory, character facts, worldbuilding, entity metadata, or durable project files automatically.

`ResearchNote` represents local saved research and requires explicit user instruction or UI action. The first persistence path is a user-selected project document or research-note artifact, not automatic `.neko` memory. A saved research note remains research material until another explicit workflow promotes it into a canonical project fact.

Rejected alternative: Let Agent automatically update project memory from search results. That would let external pages silently rewrite local creative truth and would make source trust impossible to audit.

### Decision 5: Query context is not automatically enriched with project data

When `allowProjectContextInQuery` is false, Agent/runtime code SHALL NOT append local project snippets, file contents, entity fields, memory entries, asset metadata, or hidden context to outgoing search queries. The outgoing query must be the tool argument visible in the trace/approval prompt.

This does not claim perfect semantic leakage detection for model-authored prose. The enforceable contract is that Neko runtime does not add hidden project context and live calls expose the final query for approval.

Rejected alternative: Add broad heuristic redaction of all possible project terms. That would be brittle, noisy, and likely to hide real contract issues. Real protection is no hidden enrichment plus visible approval for live access.

### Decision 6: Domain and URL policy is a real trust boundary

`WebFetch` SHALL support the existing `WebFetch(domain:...)` permission shape. The URL validator SHALL reject unsupported schemes, local files, Webview/blob/data URIs, localhost, loopback/private/link-local addresses, and redirects that resolve outside the allowed policy. Domain allow/block policy applies before provider execution and after redirects when redirects are followed.

`WebSearch` SHALL support configured allowed/blocked domains where the selected provider can enforce them. If a provider cannot enforce a requested domain policy, the call must fail visibly.

Rejected alternative: Trust provider-side filtering only. Neko still owns local trust boundaries and must reject unsafe URL targets before invoking fetch behavior.

### Decision 7: Tool injection must match executable registration

`WebSearch` SHALL NOT remain in resident/core tool metadata when external research is disabled or unavailable. If the capability is enabled, registration and injection must come from the external research capability provider. Plan/read-only mode may classify `WebSearch`/`WebFetch` as read-only external tools only when they are registered and permitted.

Rejected alternative: Keep `WebSearch` in `CORE_TOOLS` as a future hint. That violates fail-visible behavior and lets the model plan around a nonexistent tool.

### Decision 8: Provider adapters are behind a narrow port

The port shape is:

```ts
interface ExternalResearchProvider {
  readonly id: string;
  readonly supportsIndexed: boolean;
  readonly supportsLive: boolean;
  readonly supportsDomainFilters: boolean;
  search(input: ExternalResearchSearchInput, signal: AbortSignal): Promise<ExternalResearchSearchResult>;
  fetch(input: ExternalResearchFetchInput, signal: AbortSignal): Promise<ExternalResearchFetchResult>;
}
```

The first implementation must include a deterministic fake provider for tests. The first real provider adapter SHALL be MCP-backed: Neko adapts user-configured MCP search/fetch tools into `ExternalResearchProvider` instead of bundling a search vendor SDK or operating a Neko-owned web search service.

MCP-backed search still needs an actual external capability somewhere. That capability may be a user-configured MCP server backed by a third-party search API, a hosted model search tool, a local/search appliance, or another user-owned service. Neko's first-party responsibility is the adapter, permission, citation, and persistence boundary.

Rejected alternative: Put provider SDK calls directly inside `WebSearchTool`/`WebFetchTool`. That would make tests depend on network/provider behavior and make future provider swaps invasive.

Rejected alternative: Ship a built-in third-party web search service as the first provider. That would introduce vendor credentials, pricing, availability, policy, and trust decisions before the core capability boundary is proven.

### Decision 9: MCP-backed binding is explicit machine configuration

MCP-backed external research SHALL bind MCP tools through explicit configuration. Neko MUST NOT infer research tools from MCP tool names, descriptions, or model-selected `mcp__...` calls.

The configuration shape is intentionally machine-readable:

```ts
externalResearch: {
  mode: 'live',
  providerId: 'mcp:research',
  mcp: {
    serverId: 'research',
    searchTool: {
      name: 'web_search',
      queryArg: 'query',
      maxResultsArg: 'max_results',
      outputSchema: 'neko.externalResearch.search.v1',
    },
    fetchTool: {
      name: 'fetch_url',
      urlArg: 'url',
      maxContentTokensArg: 'max_content_tokens',
      outputSchema: 'neko.externalResearch.fetch.v1',
    },
  },
}
```

Only the mapping fields used by the selected tool are required. `fetchTool` is ignored unless mode is `live`.

Rejected alternative: Auto-detect MCP search/fetch tools by names such as `search`, `web_search`, or `fetch`. That would bind unrelated tools accidentally and make canonical-path tests unreliable.

### Decision 10: MCP results must be structured research results

MCP-backed external research SHALL accept only structured output matching Neko's external research schemas. Natural-language summaries without source metadata are invalid.

Search output is normalized from `neko.externalResearch.search.v1`:

```ts
interface ExternalResearchMcpSearchV1 {
  readonly sources: readonly {
    readonly url: string;
    readonly title?: string;
    readonly snippet?: string;
    readonly publishedAt?: string;
  }[];
}
```

Fetch output is normalized from `neko.externalResearch.fetch.v1`:

```ts
interface ExternalResearchMcpFetchV1 {
  readonly url: string;
  readonly finalUrl?: string;
  readonly title?: string;
  readonly content: string;
  readonly contentType?: string;
  readonly fetchedAt?: string;
  readonly truncated?: boolean;
}
```

Rejected alternative: Let the model interpret arbitrary MCP output. That would make citations non-deterministic and allow unsupported external text to masquerade as sourced research.

### Decision 11: Bound MCP tools are adapter-only by default

MCP tools bound as `external-research` search/fetch tools SHALL be called by the `ExternalResearchProvider` adapter, not injected as ordinary model-visible `mcp__server__tool` tools by default. This prevents bypassing URL safety, domain policy, citation validation, approval prompts, and research trace projection.

If a user explicitly wants the same raw MCP tools exposed separately, that must be a separate opt-in MCP exposure path and cannot count as external research acceptance evidence.

Rejected alternative: Expose both `WebSearch`/`WebFetch` and raw bound MCP tools by default. That creates dual success paths and makes tests unable to prove external research policy was enforced.

### Decision 12: WebSearch domain filters require provider-native enforcement

`WebSearch` configured `allowedDomains` or `blockedDomains` are safety controls only when the MCP/provider capability can enforce them before or during search. If the configured MCP mapping cannot pass domain filters to the provider or the provider does not declare support, the call SHALL fail visibly.

Result post-filtering may improve UI quality, but it SHALL NOT be treated as satisfying a domain safety policy because the unrestricted query has already left Neko.

Rejected alternative: Search broadly and filter results in Neko. That does not protect user intent or project context from the upstream search service.

### Decision 13: ResearchNote v1 is a Markdown artifact

The first saved `ResearchNote` format SHALL be a user-selected Markdown project document or research-note artifact. It must include source provenance in frontmatter or a sources section and remain outside `.neko` project memory.

Example shape:

```md
---
type: research-note
source: external-research
createdAt: 2026-07-10T00:00:00.000Z
---

# Research Note

...

## Sources

- [Title](https://example.com) — fetchedAt: 2026-07-10T00:00:00.000Z
```

Rejected alternative: Write saved research directly to `.neko/memory.md`. That would collapse cited research material into project memory before user-owned promotion.

## Risks / Trade-offs

- [Risk] Users may treat web results as authoritative project facts. -> Mitigation: source metadata is always shown; saving/promoting requires explicit user intent and separate workflows.
- [Risk] External query text can leak unreleased project ideas. -> Mitigation: default disabled, no hidden project-context enrichment, visible approval for live, and explicit provider configuration.
- [Risk] MCP servers and provider APIs differ on indexed/live/domain filtering/citations. -> Mitigation: provider capability flags are part of registration; unsupported requested controls fail visibly.
- [Risk] Bound MCP tools remain visible as raw MCP tools and bypass policy. -> Mitigation: bound tools are adapter-only by default and raw exposure requires explicit separate opt-in.
- [Risk] MCP tools return prose that looks useful but lacks source metadata. -> Mitigation: structured output schema is required; arbitrary text fails visibly.
- [Risk] Tool metadata drift persists. -> Mitigation: implementation starts by removing `WebSearch` from resident core metadata or making registration conditional on executable capability availability.
- [Risk] `indexed` may still involve an external provider call. -> Mitigation: documentation and UI label it as indexed external research, not offline/private cache.
- [Risk] The feature becomes a general browsing surface. -> Mitigation: product copy and prompts frame it as creative research intake and developer lookup, not default knowledge recovery.

## Migration Plan

1. Add shared external research DTOs, config defaults, and provider port contracts.
2. Remove or conditionalize current resident/core `WebSearch` metadata so disabled mode cannot advertise unavailable tools.
3. Add capability provider registration that exposes `WebSearch`/`WebFetch` only when config mode and provider resolution succeed.
4. Implement fake provider tests and permission/domain/URL safety tests before adding a real provider adapter.
5. Add the MCP-backed provider adapter behind `ExternalResearchProvider`.
6. Wire timeline/source projection and explicit `ResearchNote` persistence action.
7. Validate OpenSpec, focused contract/runtime tests, and quality checks.

Rollback is straightforward before user-facing persistence: set `externalResearch.mode = 'disabled'` and remove provider registration. Any persisted `ResearchNote` created after explicit user action remains local research material and must not be deleted by rollback.

## Open Questions

- What exact UI affordance should represent the first explicit Markdown `ResearchNote` save flow?
