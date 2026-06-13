## ADDED Requirements

### Requirement: Agent Extension does not own project search compatibility shims
The system SHALL remove Agent Extension `projectSearch` compatibility shims once internal imports have moved to canonical `@neko/search` host or shared contract entrypoints. Agent Extension MUST NOT expose new re-export shims for search coordinator, cache manifest, normalization, resolver, compatibility adapters, commands, or index coordinator modules.

#### Scenario: Internal Agent import uses canonical search package
- **WHEN** Agent Extension code needs project search commands, host adapters, or shared search DTOs
- **THEN** it imports from `@neko/search`, `@neko/search/host-vscode`, or `@neko/shared` contracts instead of Agent-local `services/projectSearch/*` shim paths

#### Scenario: Removed shim has no production consumers
- **WHEN** the compatibility shim directory is deleted
- **THEN** import scans and package tests confirm no production Agent code references the deleted paths

### Requirement: Search aggregation policy is not implemented in Agent Extension adapters
The system SHALL keep project search aggregation, deduplication, freshness priority, partition status aggregation, and entity/script candidate extraction in `@neko/search`, `@neko/entity`, or domain-owned providers. Agent Extension adapters MAY map canonical `ProjectSearchItem` results into Agent mention or picker DTOs.

#### Scenario: Freshness-aware dedupe runs in search or entity package
- **WHEN** multiple project search providers return matching creative entity, entity candidate, script role, or story scene items
- **THEN** freshness-aware dedupe and status aggregation are performed by search/entity runtime logic rather than Agent Extension adapter helpers

#### Scenario: Agent mention adapter maps results only
- **WHEN** Agent mention completion receives canonical project search results
- **THEN** the Agent adapter maps them to mention display DTOs without reparsing script syntax, rebuilding entity candidates, or applying cross-source aggregation policy

### Requirement: Script-role candidate extraction has a domain owner
The system SHALL locate script-role and `@character` candidate extraction in a domain provider or entity/search runtime helper with focused tests. Agent Extension MUST NOT be the only owner of script syntax parsing used for search results.

#### Scenario: Script character candidate test runs outside Extension
- **WHEN** tests supply Fountain or story script text containing character markers and role names
- **THEN** the domain/search extraction helper returns candidate search items without constructing VSCode commands or Agent Extension services

#### Scenario: Extension reads source but does not parse policy
- **WHEN** VSCode host integration reads a script file for project search indexing
- **THEN** it passes source text and metadata to the owning provider/helper instead of implementing Agent-local parsing rules
