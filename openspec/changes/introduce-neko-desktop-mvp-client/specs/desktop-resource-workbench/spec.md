## ADDED Requirements

### Requirement: Thumbnail-capable resource nodes
The system SHALL model desktop resources as source-owned nodes that can include thumbnail descriptors, preview descriptors, badges, metadata, and actions.

#### Scenario: Resource node includes thumbnail projection
- **WHEN** a resource source returns a node for a visual asset, media item, package, skill, or generated output
- **THEN** the node can include a thumbnail descriptor without exposing cache paths, Webview URIs, Engine tokens, or absolute temp paths as durable identity

#### Scenario: Resource node is not only a file path
- **WHEN** a resource source returns an asset, entity, skill, package, or generation output
- **THEN** the node identifies the resource with a stable source ref rather than requiring an OS filesystem path

### Requirement: Separate desktop management surfaces
The system SHALL keep Explorer, Assets, Market/Packages, Skills, Search, and Generations as distinct workbench surfaces while allowing them to share resource primitives.

#### Scenario: Workbench surfaces are listed
- **WHEN** the desktop renderer receives the desktop snapshot
- **THEN** it can display separate entries for Explorer, Assets, Generations, Market, Skills, and Search

#### Scenario: Market and Skills are not collapsed into Explorer
- **WHEN** the workbench renders project resources
- **THEN** Market/Packages install/update/trust flows and Skill enable/diagnostic flows appear as separate management surfaces rather than ordinary project directory nodes

### Requirement: Resource Explorer source boundary
The system SHALL treat each resource category as a source boundary owned by the appropriate domain or host adapter.

#### Scenario: MVP static source
- **WHEN** the MVP desktop client starts without domain-backed source adapters
- **THEN** it displays contract fixture resources that identify their owning source and make missing live adapters explicit

#### Scenario: Future domain-backed source
- **WHEN** a domain package later contributes a desktop resource source
- **THEN** it can provide nodes and actions through the shared source contract without importing desktop renderer internals
