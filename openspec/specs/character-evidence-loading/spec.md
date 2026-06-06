# character-evidence-loading Specification

## Purpose
Define Agent character evidence loading contracts, project-scoped evidence discovery, freshness, ranking, trimming, and fallback behavior.
## Requirements
### Requirement: Agent owns character evidence loading contracts
The system SHALL define Character Evidence Loader contracts in the Agent runtime layer and SHALL keep concrete VSCode, Dashboard, Story, project search, and file-reading integration in the Agent Extension layer.

#### Scenario: Runtime contracts are host-agnostic
- **WHEN** the Agent runtime package is type-checked without VSCode host APIs
- **THEN** the Character Evidence Loader request, bundle, chunk, source-ref, budget, and ranking helper types compile without importing `vscode`, React, Webview modules, Dashboard Webview modules, or concrete entity stores

#### Scenario: Extension supplies host readers
- **WHEN** a Character Evidence Loader implementation needs Dashboard detail, Story indexes, project search, or script text
- **THEN** the Extension implementation obtains that data through injected host readers, VSCode commands, or VSCode workspace APIs rather than placing those dependencies in Agent runtime

### Requirement: Entity and project search act as evidence locators
The system SHALL use creative entity projections, Dashboard details, Story occurrences, and project search results as locators for character evidence. These locator systems MUST NOT become owners of turn-scoped prompt evidence text.

#### Scenario: Project search item identifies a candidate source
- **WHEN** project search returns a `ProjectSearchItem` for a character, entity candidate, script role, or story scene
- **THEN** the Character Evidence Loader may use its source refs, navigation data, file path, entity metadata, or project root as locator signals for loading evidence chunks

#### Scenario: Search result remains lightweight
- **WHEN** project search returns mention or picker results
- **THEN** the returned `ProjectSearchItem` records do not need to include full script text, prompt-ready evidence bundles, or role-session token budget decisions

### Requirement: Loader returns turn-scoped evidence bundles
The system SHALL return a bounded Character Evidence Bundle for a selected character and current role-session query. The bundle MUST include loaded chunks, source refs, line ranges where applicable, freshness, relevance metadata, and omissions caused by budget, unavailable source, or safety filters.

#### Scenario: Character dialogue turn receives relevant evidence
- **WHEN** a user sends a message inside Character Dialogue for a selected project character
- **THEN** the controller requests a Character Evidence Bundle using the selected character ref, current user message, recent transcript, role mode, project root, and evidence budget before invoking the no-tool character responder

#### Scenario: Embody turn receives feedback evidence
- **WHEN** a user sends a message inside Embody Character
- **THEN** the controller requests a Character Evidence Bundle and injects its chunk text into the feedback prompt so the responder can classify claims against project evidence

#### Scenario: Bundle records omitted evidence
- **WHEN** relevant candidate chunks exceed the configured budget or are unavailable
- **THEN** the bundle includes omission records that identify the source and reason without causing the role responder to claim hidden access to omitted project files

### Requirement: Evidence loading preserves role-session isolation
The system SHALL load character evidence through host-side controller or Skill primitive ports while keeping Character Dialogue and Embody Character responders no-tool and separate from ordinary Agent conversation context.

#### Scenario: Role responder receives no tools
- **WHEN** a Character Dialogue or Embody Character responder is invoked with a loaded evidence bundle
- **THEN** it still receives no project-read, project-search, file-write, shell, skill activation, media-generation, task-mutation, or entity-mutation tools

#### Scenario: Ordinary Agent history is not polluted
- **WHEN** evidence is loaded for a character role session turn
- **THEN** the evidence text and role-session system prompt are not appended to ordinary Agent conversation history, global memory, `.neko/memory.md`, or standard creative chat records

#### Scenario: Validation skill composes the loader
- **WHEN** a character validation or improvement Skill needs project evidence
- **THEN** it may call the Character Evidence Loader through Agent-owned primitive ports without importing Dashboard Webview modules or granting evidence tools to a live roleplay responder

### Requirement: Evidence source reads are project-scoped and safe
The Character Evidence Loader SHALL read source text only from project-local, allowlisted source refs derived from trusted project indexes or Dashboard/entity detail. It MUST reject absolute, out-of-project, unsupported, or malformed file paths.

#### Scenario: Script occurrence reads project-local text
- **WHEN** Dashboard or Story detail reports a script occurrence with a project-relative supported script path
- **THEN** the loader may resolve that path inside the project root and read the bounded scene or line range needed for the evidence chunk

#### Scenario: Out-of-project path is rejected
- **WHEN** an occurrence or search metadata points to an absolute path outside the project root or a relative path that escapes the project root
- **THEN** the loader omits that source and records a safety omission instead of reading the file

#### Scenario: Unsupported file type is rejected
- **WHEN** a candidate source path has an unsupported extension for character evidence loading
- **THEN** the loader omits that source and does not include its contents in the evidence bundle

### Requirement: Loader ranks and trims evidence deterministically
The system SHALL rank and trim candidate evidence chunks deterministically using structured signals before applying optional semantic providers. The default implementation MUST work without embeddings or remote model calls.

#### Scenario: Late-scene evidence can be selected
- **WHEN** a character appears in more than six script occurrences and the user asks about content from a later scene
- **THEN** the loader can include evidence from the later occurrence or its containing scene instead of only the first occurrences

#### Scenario: Budget trimming is stable
- **WHEN** candidate evidence exceeds the configured token or character budget
- **THEN** the loader orders chunks by deterministic relevance, trims to budget, and records omitted lower-ranked chunks

#### Scenario: Duplicate evidence is deduplicated
- **WHEN** the same script range is reachable from Dashboard detail, entity occurrences, and Story indexes
- **THEN** the loader emits one evidence chunk for that range and records combined source metadata rather than duplicating prompt text

### Requirement: Evidence freshness and fallback are explicit
The system SHALL report freshness and fallback status for loaded character evidence. The role prompt MUST distinguish confirmed loaded evidence from missing, stale, or unavailable evidence.

#### Scenario: Fresh evidence is available
- **WHEN** Dashboard, entity, Story, and search sources report fresh data for the selected character
- **THEN** the bundle marks evidence freshness as fresh and includes source refs for loaded chunks

#### Scenario: Source is stale or unavailable
- **WHEN** one evidence source is stale, failed, or unavailable
- **THEN** the loader uses available alternative sources where possible and records the stale or unavailable source in bundle metadata or omissions

#### Scenario: Missing evidence stays bounded
- **WHEN** no relevant evidence can be loaded for a user query
- **THEN** Character Dialogue and Embody Character prompts require the responder to express uncertainty or provide feedback based only on the assembled profile and current conversation
