## ADDED Requirements

### Requirement: Domain tools do not use new legacy centralized registration
The Agent capability system SHALL reject or report newly added domain tools that register through legacy centralized tool paths when a package `AgentCapabilityProvider` path is available. Legacy centralized registration MAY remain only for explicitly documented agent-owned meta-tools or compatibility bridges with LCD metadata.

#### Scenario: New domain tool is registered through provider
- **WHEN** a package adds a new domain tool for search, entity, media, story, canvas, model, puppet, asset, or document behavior
- **THEN** it exposes the tool through the package capability provider with metadata instead of adding it to a legacy centralized registration list

#### Scenario: Legacy exception needs LCD metadata
- **WHEN** a tool must temporarily remain on a legacy centralized path
- **THEN** the registration includes or references LCD metadata with owner, replacement path, removal condition, and protecting tests

### Requirement: Capability registry reports duplicate tools and providers
The capability registry SHALL diagnose duplicate tool names, duplicate provider ids, conflicting short names, and ambiguous capability metadata. Diagnostics MUST be available in tests or validation output and MUST identify the conflicting providers or registration paths.

#### Scenario: Duplicate tool name is diagnosed
- **WHEN** two capability providers register the same canonical tool name without an approved alias or namespace rule
- **THEN** the registry reports a duplicate tool diagnostic naming both providers

#### Scenario: Legacy and provider path conflict is diagnosed
- **WHEN** a legacy centralized registration and a package capability provider expose the same domain tool
- **THEN** validation reports the duplicate registration and identifies which path should be removed

### Requirement: Boundary migration does not create new tool-registration debt
Runtime services introduced for boundary migration SHALL use existing capability provider registration paths when they expose Agent tools or tool-like facets. They MUST NOT reintroduce legacy centralized domain-tool registration as a side effect of moving logic out of Extension or Webview.

#### Scenario: Migrated service exposes no legacy registration
- **WHEN** character dialogue, evidence, search, or entity contribution logic moves into runtime/domain packages
- **THEN** any new executable capability or facet is registered through `AgentCapabilityProvider` or remains an internal runtime service with no legacy centralized tool entry

#### Scenario: Guardrail can run in parallel with boundary migration
- **WHEN** boundary migration and capability guardrail cleanup are implemented in separate batches
- **THEN** validation still prevents newly migrated services from adding new legacy domain-tool registrations
