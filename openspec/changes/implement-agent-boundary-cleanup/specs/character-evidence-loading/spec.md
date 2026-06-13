## ADDED Requirements

### Requirement: Evidence strategy is runtime-owned
The system SHALL keep character evidence strategy in host-agnostic Agent runtime contracts. Evidence strategy includes locator collection, story-scene locator derivation, freshness handling, relevance scoring, deduplication, budget trimming, and omission metadata.

#### Scenario: Story scene locator is derived without VSCode
- **WHEN** story indexes, script roles, entity locators, and query tokens are supplied through injected reader ports
- **THEN** runtime evidence strategy can derive story-scene locators without importing VSCode commands, workspace APIs, Webview code, or Extension-only services

#### Scenario: Evidence trimming is deterministic in runtime tests
- **WHEN** candidate evidence chunks exceed the configured evidence budget
- **THEN** runtime evidence strategy ranks, trims, and records omissions deterministically in a pure unit test

### Requirement: Extension evidence loader remains a host adapter
The Extension evidence loader SHALL keep VSCode workspace reads, VSCode command calls, Extension API discovery, URI/path mediation, and host lifecycle wiring. It MUST delegate reusable evidence policy to runtime/domain services through typed request and reader ports.

#### Scenario: Extension supplies command reader
- **WHEN** evidence loading needs Dashboard detail, Story indexes, or project search results exposed through VSCode commands
- **THEN** the Extension loader calls the host command and passes typed results into runtime strategy rather than deriving final evidence policy in Extension code

#### Scenario: Extension file reader is injected
- **WHEN** runtime evidence strategy needs bounded source text for a safe locator
- **THEN** it calls an injected reader port implemented by the Extension file reader instead of reading VSCode workspace files directly

### Requirement: ProjectSearch shim imports are not used by evidence loading
Character evidence loading SHALL consume project search through `@neko/search` host integration or shared contracts, not through Agent Extension `services/projectSearch/*` compatibility shims.

#### Scenario: Evidence loader imports search command from canonical host package
- **WHEN** the evidence loader needs the project search query command or host adapter
- **THEN** it imports from `@neko/search/host-vscode` or another canonical shared search entry rather than `packages/neko-agent/packages/extension/src/services/projectSearch`

#### Scenario: Shim deletion leaves evidence tests passing
- **WHEN** Agent `services/projectSearch/*` shim files are deleted
- **THEN** character evidence loader tests still pass using canonical search contracts and fake host readers
