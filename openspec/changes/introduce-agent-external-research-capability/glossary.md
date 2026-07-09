# Glossary: Agent External Research

## External Research

An opt-in Agent capability for retrieving cited information from outside the local project. Its product center is creative reference gathering, with developer documentation lookup as a secondary path.

## Project Search

Search over local Neko project entities, assets, documents, and indexes. Project search is not public web search and must not call external research providers.

## WebSearch

An Agent tool that searches external sources through `ExternalResearchProvider.search` and returns cited `ResearchSource` metadata.

## WebFetch

An Agent tool that fetches a specific external URL through `ExternalResearchProvider.fetch` under URL safety, redirect, content budget, permission, and domain policy.

## ExternalResearchProvider

The provider interface behind `WebSearch` and `WebFetch`. Concrete adapters may use hosted model search, MCP, or a search API, but Agent tools depend only on this port.

## MCP-backed External Research

The first real provider path. Neko adapts user-configured MCP search/fetch capabilities into `ExternalResearchProvider`. The MCP server, not Neko core, owns the underlying web search service or local search implementation.

## MCP External Research Binding

Machine-readable configuration that selects the MCP server, search/fetch tool names, argument names, and output schema ids used by the MCP-backed `ExternalResearchProvider`. Neko does not infer this binding from MCP tool names or descriptions.

## Adapter-only MCP Tool

An MCP tool bound to external research that is callable by the `ExternalResearchProvider` adapter but is not exposed as an ordinary model-visible `mcp__...` tool by default.

## ResearchSource

Source/provenance metadata returned by external research. It includes at least URL, provider id, mode, and searched/fetched time, plus title/snippet/citation fields when available.

## ResearchNote

User-confirmed local research material saved from selected external sources into a user-selected Markdown project document or research-note artifact. A research note remains reference material unless a separate explicit workflow promotes it into canonical project data.

## External Research Schema

The structured result shape required from MCP-backed search/fetch tools, such as `neko.externalResearch.search.v1` and `neko.externalResearch.fetch.v1`. Prose-only MCP output is not a valid external research result.

## Canonical Project Fact

Project-owned truth such as character setting, worldbuilding, entity metadata, or durable memory. External research cannot become a canonical project fact automatically.

## Indexed Mode

External research mode where the provider uses a maintained index rather than live page retrieval through Neko's runtime. It is still an external provider call and is not an offline/private-cache guarantee. `WebFetch` is not available in indexed mode.

## Live Mode

External research mode where Agent may perform live provider-backed search or URL fetches after permission and approval policy allow the call.

## Project Context Enrichment

Runtime-added local project snippets, file contents, memory entries, entity fields, asset metadata, or search results appended to an outgoing external query. This is disabled by default.

## Provider-enforced Domain Policy

Domain allow/block behavior applied by the external research provider or MCP tool before or during search. Filtering returned results in Neko after a broad search does not satisfy this safety policy.
