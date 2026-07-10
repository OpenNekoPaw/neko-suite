## ADDED Requirements

### Requirement: External research is opt-in
Agent external research capability SHALL be disabled by default. It SHALL register `WebSearch` only when external research configuration enables `indexed` or `live` mode and resolves a valid provider, and SHALL register `WebFetch` only when external research configuration enables `live` mode and resolves a valid provider.

#### Scenario: Default configuration disables external research
- **WHEN** a new Agent session is created with default configuration
- **THEN** external research mode MUST be `disabled`
- **AND** `WebSearch` and `WebFetch` MUST NOT be registered in the tool registry
- **AND** `WebSearch` and `WebFetch` MUST NOT be injected as resident/core tools

#### Scenario: Enabled configuration registers executable tools
- **WHEN** external research mode is `indexed` or `live` and the configured provider supports the selected mode
- **THEN** Agent MUST register executable `WebSearch` through the external research capability provider
- **AND** Agent MUST register `WebFetch` only when the effective mode is `live`
- **AND** the registered tools MUST execute through the configured `ExternalResearchProvider`

#### Scenario: Enabled configuration without provider fails visibly
- **WHEN** external research mode is `indexed` or `live` and no valid provider is configured
- **THEN** Agent MUST surface a configuration diagnostic
- **AND** Agent MUST NOT fall back to project search, MCP search, model memory, or empty successful tool results

### Requirement: External research modes are explicit
External research configuration SHALL use only `disabled`, `indexed`, or `live` modes. Local caching MUST NOT be exposed as a semantic mode.

#### Scenario: Indexed mode is selected
- **WHEN** external research mode is `indexed`
- **THEN** Agent MUST allow only provider-supported indexed search behavior
- **AND** Agent MUST NOT register or execute `WebFetch`
- **AND** Agent MUST fail visibly if the selected provider cannot guarantee indexed behavior for the requested call

#### Scenario: Live mode is selected
- **WHEN** external research mode is `live`
- **THEN** Agent MAY perform live provider-backed search or URL fetches only after permission and approval policy allow the call

#### Scenario: Unsupported mode is configured
- **WHEN** configuration contains a mode other than `disabled`, `indexed`, or `live`
- **THEN** Agent MUST reject the configuration with a diagnostic
- **AND** Agent MUST NOT normalize the value to a default successful mode

### Requirement: Default external research configuration is conservative
Agent default external research configuration SHALL use `mode: 'disabled'`, `providerId: undefined`, `requireApprovalForLive: true`, `allowProjectContextInQuery: false`, `maxResults: 5`, and `maxFetchContentTokens: 12000`.

#### Scenario: Default config is normalized
- **WHEN** Agent normalizes configuration without an explicit external research section
- **THEN** the normalized snapshot MUST contain the conservative external research defaults

#### Scenario: Live approval default is enforced
- **WHEN** external research mode is `live` and `requireApprovalForLive` is not explicitly disabled by trusted configuration
- **THEN** live `WebSearch` and `WebFetch` calls MUST require approval before provider execution

### Requirement: ExternalResearchProvider is the provider boundary
Agent SHALL call external research providers only through the `ExternalResearchProvider` contract. Tool implementations MUST NOT embed provider-specific network or SDK logic directly.

#### Scenario: Tool executes search through provider
- **WHEN** `WebSearch` is executed
- **THEN** the tool MUST call the configured `ExternalResearchProvider.search` implementation
- **AND** the tool result MUST include the provider id

#### Scenario: Provider cannot satisfy requested controls
- **WHEN** a search or fetch request requires mode, domain filtering, citation metadata, or content budget behavior unsupported by the provider
- **THEN** Agent MUST fail the call with a visible diagnostic
- **AND** Agent MUST NOT silently relax the requested controls

#### Scenario: MCP-backed provider is used
- **WHEN** the first real external research provider is configured
- **THEN** Agent MUST adapt user-configured MCP search/fetch capabilities through `ExternalResearchProvider`
- **AND** Agent MUST NOT require a Neko-owned third-party search service

#### Scenario: MCP search capability is absent
- **WHEN** external research mode is enabled but no configured MCP capability can satisfy external search requirements
- **THEN** Agent MUST surface a provider configuration diagnostic
- **AND** Agent MUST NOT fall back to project search or model-only answers as successful external research

### Requirement: MCP-backed binding is explicit
MCP-backed external research SHALL bind search and fetch tools through explicit machine-readable configuration. Agent MUST NOT infer external research tools from MCP tool names, descriptions, or model-selected raw MCP calls.

#### Scenario: Explicit MCP search mapping is configured
- **WHEN** external research provider id targets an MCP-backed provider and configuration names a server id, search tool name, query argument, and output schema
- **THEN** Agent MUST bind that MCP tool as the `WebSearch` provider implementation
- **AND** Agent MUST execute it only through `ExternalResearchProvider.search`

#### Scenario: Tool name looks like search but is not configured
- **WHEN** a connected MCP server exposes a tool whose name or description resembles web search but external research mapping does not explicitly select it
- **THEN** Agent MUST NOT bind that tool as `WebSearch`
- **AND** Agent MUST NOT use it as external research fallback

#### Scenario: Fetch mapping is configured in indexed mode
- **WHEN** external research mode is `indexed` and configuration contains an MCP fetch mapping
- **THEN** Agent MUST ignore or reject the fetch mapping for that session
- **AND** Agent MUST NOT register `WebFetch`

### Requirement: MCP-backed results are structured
MCP-backed external research SHALL accept only structured output matching declared Neko external research schemas. Arbitrary natural-language MCP output MUST fail visibly.

#### Scenario: MCP search returns structured sources
- **WHEN** the bound MCP search tool returns output matching `neko.externalResearch.search.v1`
- **THEN** Agent MUST normalize the sources into `ResearchSource` records

#### Scenario: MCP search returns prose only
- **WHEN** the bound MCP search tool returns a natural-language answer without structured source metadata
- **THEN** Agent MUST reject the result as invalid external research
- **AND** Agent MUST NOT return the prose as a successful `WebSearch` result

#### Scenario: MCP fetch returns structured content
- **WHEN** the bound MCP fetch tool returns output matching `neko.externalResearch.fetch.v1`
- **THEN** Agent MUST normalize the URL, final URL, title, content, content type, fetched time, and truncation metadata into a `WebFetch` result

#### Scenario: MCP fetch omits required content
- **WHEN** the bound MCP fetch tool returns output without required URL or content fields
- **THEN** Agent MUST reject the result with a visible schema diagnostic

### Requirement: Bound MCP tools are adapter-only by default
MCP tools bound to external research SHALL be called by the external research adapter and SHALL NOT be exposed as ordinary model-visible `mcp__...` tools by default.

#### Scenario: Bound search tool is registered
- **WHEN** an MCP tool is bound as the external research search tool
- **THEN** Agent MUST expose `WebSearch` as the model-visible research tool
- **AND** Agent MUST NOT expose the bound raw `mcp__server__tool` tool to the model by default

#### Scenario: Bound fetch tool is registered
- **WHEN** an MCP tool is bound as the external research fetch tool and live mode is active
- **THEN** Agent MUST expose `WebFetch` as the model-visible fetch tool
- **AND** Agent MUST NOT expose the bound raw `mcp__server__tool` tool to the model by default

#### Scenario: Raw MCP exposure is explicitly enabled separately
- **WHEN** a user explicitly enables raw exposure for the same MCP tool through a separate MCP tool exposure setting
- **THEN** raw MCP execution MUST remain separate from external research
- **AND** raw MCP execution MUST NOT count as satisfying `WebSearch` or `WebFetch` acceptance tests

### Requirement: WebSearch returns cited research sources
`WebSearch` SHALL return externally sourced results as cited `ResearchSource` metadata and SHALL NOT return uncited external claims as successful research output.

#### Scenario: Search returns sources
- **WHEN** `WebSearch` completes successfully
- **THEN** the result MUST include the original query, mode, provider id, and one or more `ResearchSource` entries
- **AND** each `ResearchSource` MUST include source URL, provider id, and searched or fetched time

#### Scenario: Provider omits citations
- **WHEN** the provider returns search text without source metadata
- **THEN** Agent MUST treat the response as invalid for external research
- **AND** the tool call MUST fail visibly instead of returning uncited claims

#### Scenario: Max results is enforced
- **WHEN** `WebSearch` receives more provider results than the configured or requested `maxResults`
- **THEN** Agent MUST return no more than the effective result limit

### Requirement: WebSearch domain policy is provider-enforced
`WebSearch` domain allow/block filters SHALL be treated as safety controls only when the configured provider or MCP tool can enforce them before or during search. Post-filtering results in Neko MUST NOT satisfy domain safety policy.

#### Scenario: Provider supports domain filters
- **WHEN** `WebSearch` is called with allowed or blocked domains and the provider declares native domain filter support
- **THEN** Agent MUST pass the domain policy to the provider request
- **AND** the trace MUST record the requested domain policy

#### Scenario: Provider cannot enforce domain filters
- **WHEN** `WebSearch` is called with allowed or blocked domains and the provider cannot enforce domain policy
- **THEN** Agent MUST fail the call with a visible diagnostic
- **AND** Agent MUST NOT run a broad search and filter results afterward as if policy were enforced

### Requirement: Project context is not automatically sent in search queries
When `allowProjectContextInQuery` is false, Agent SHALL NOT append hidden project context, file contents, entity fields, asset metadata, memory entries, or project search results to outgoing `WebSearch` queries.

#### Scenario: Hidden context is available locally
- **WHEN** an Agent turn has local project context and executes `WebSearch` with `allowProjectContextInQuery: false`
- **THEN** the provider request MUST contain only the explicit tool query and approved tool parameters
- **AND** Agent MUST NOT add local context snippets to the provider request

#### Scenario: Live approval displays query
- **WHEN** a live `WebSearch` request requires approval
- **THEN** the approval prompt MUST display the final outgoing query before provider execution

### Requirement: WebFetch enforces URL and domain safety
`WebFetch` SHALL enforce URL safety, domain policy, redirects, and content budgets before returning fetched external content.

#### Scenario: Unsafe URL is rejected
- **WHEN** `WebFetch` is called with a file, data, blob, Webview, localhost, loopback, private-network, link-local, or otherwise unsupported URL target
- **THEN** Agent MUST reject the call with a visible diagnostic
- **AND** Agent MUST NOT call the provider fetch implementation

#### Scenario: Domain rule blocks fetch
- **WHEN** `WebFetch` is called for a domain blocked by configuration or permission rules
- **THEN** Agent MUST reject the call before provider execution

#### Scenario: Redirect escapes allowed policy
- **WHEN** a fetched URL redirects to a blocked or unsafe target
- **THEN** Agent MUST reject the redirected target
- **AND** Agent MUST NOT return fetched content from the unsafe destination

#### Scenario: Content budget is enforced
- **WHEN** fetched content exceeds the effective `maxFetchContentTokens`
- **THEN** Agent MUST truncate or reject according to the tool contract
- **AND** the result metadata MUST indicate the content budget behavior

### Requirement: External research does not automatically mutate project knowledge
External research results SHALL NOT automatically write project memory, character settings, worldbuilding, entity metadata, asset metadata, or durable project files.

#### Scenario: Search result is produced
- **WHEN** `WebSearch` returns research sources
- **THEN** Agent MAY display or reference the sources in the current session
- **AND** Agent MUST NOT write those sources into local project memory or canonical project facts without explicit user intent

#### Scenario: User explicitly saves research
- **WHEN** the user explicitly asks to save selected external research locally
- **THEN** Agent MAY create a Markdown `ResearchNote` in a user-selected project document or research-note artifact
- **AND** the saved artifact MUST retain source provenance
- **AND** the saved artifact MUST remain research material rather than canonical project fact unless a separate explicit promotion workflow occurs

#### Scenario: Research note is saved as Markdown
- **WHEN** Agent saves a `ResearchNote`
- **THEN** the persisted artifact MUST be Markdown for the first implementation
- **AND** the Markdown MUST include source provenance in frontmatter or a sources section
- **AND** Agent MUST NOT write the note into `.neko` project memory

### Requirement: Project search remains local
Project search SHALL remain separate from external research. `QueryProjectSearch` MUST NOT call public web providers, and external research results MUST NOT be inserted into project search indexes unless explicitly saved through a local research artifact workflow.

#### Scenario: Project search runs
- **WHEN** Agent executes `QueryProjectSearch`
- **THEN** the search MUST use local project search providers only
- **AND** it MUST NOT call `ExternalResearchProvider`

#### Scenario: External result is not saved
- **WHEN** `WebSearch` returns external results and the user does not explicitly save them
- **THEN** those results MUST NOT become project search items in future sessions

### Requirement: External research is auditable in Agent trace
External research tool calls SHALL produce traceable metadata for the user and tests, including tool name, mode, provider id, query or URL, approval state, and source metadata.

#### Scenario: Search trace is recorded
- **WHEN** `WebSearch` executes successfully
- **THEN** the Agent trace or timeline MUST show the external research mode, provider id, query, and returned source metadata

#### Scenario: Fetch trace is recorded
- **WHEN** `WebFetch` executes successfully
- **THEN** the Agent trace or timeline MUST show the external research mode, provider id, URL, domain, and fetched source metadata
