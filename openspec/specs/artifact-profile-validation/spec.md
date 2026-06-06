# artifact-profile-validation Specification

## Purpose
TBD - created by archiving change introduce-composite-artifact-table-protocol. Update Purpose after archive.
## Requirements
### Requirement: Profile descriptor constrains artifact structure
The system SHALL define Profile Descriptors that constrain `CompositeArtifact` and `GenericTable` structure without becoming runtime Skills. A descriptor MUST declare profile id, protocol, version, expected columns or block composition, optional display hints, optional validator references, and optional suggested actions.

#### Scenario: Skill-local profile validates generated table
- **WHEN** a Skill defines `profiles/comic-shot-asset-prep.profile.json`
- **THEN** Agent can validate a generated `GenericTable(profile="comic-shot-asset-prep")` against that descriptor
- **THEN** the table is still a generic artifact unless a projector or provider explicitly accepts it

#### Scenario: Shared profile is reusable
- **WHEN** multiple Skills reference the same shared Profile Descriptor
- **THEN** the profile can be registered in the artifact profile registry facet
- **THEN** validators and renderers can resolve it without parsing any Skill Markdown

### Requirement: Profile validation is stricter than rendering
The system SHALL treat profile validation as authoritative for structure, while renderer profile support is advisory and visual only. Renderers MUST NOT relax validator failures or grant execute actions.

#### Scenario: Renderer cannot bypass failed validation
- **WHEN** a renderer knows how to display a profile but the profile validator reports missing required columns
- **THEN** the renderer may display the table with diagnostics
- **THEN** execution and projection actions for the invalid table are disabled

#### Scenario: Renderer uses display hints only
- **WHEN** a profile declares column labels, grouping, sorting, or compact display hints
- **THEN** the renderer may use those hints for presentation
- **THEN** the hints do not change required fields, cell types, allowed resources, or executable actions

### Requirement: Json cell profile validation is bounded
The system SHALL keep `json` cell validation bounded in the generic table validator. Profile validators MAY declare shallow shape checks and MAY reference a shared schema or domain validator for deeper validation.

#### Scenario: Shallow shape check succeeds
- **WHEN** a profile requires a `json` cell to include `layer`, `durationMs`, and `assetRef` fields with primitive types
- **THEN** the profile validator can accept the cell through shallow shape validation

#### Scenario: Missing schema ref disables execution
- **WHEN** a `json` cell requires `schemaRef` validation and the schema cannot be resolved
- **THEN** validation reports a diagnostic
- **THEN** projector and execute actions depending on that cell are disabled

### Requirement: Skill declares artifact intent without granting capability
The system SHALL allow Skill metadata to declare produced artifact kinds, artifact profiles, referenced capabilities, and suggested projectors. These declarations MUST guide Agent generation and validation only; they MUST NOT register execution providers or bypass policy.

#### Scenario: Skill references Canvas import capability
- **WHEN** a Skill manifest lists `referencedCapabilities: ["canvas.importStoryboard"]`
- **THEN** Agent can prefer artifacts that may project to that capability
- **THEN** the Canvas import action appears only if the capability provider is registered and available

#### Scenario: Skill cannot invent provider
- **WHEN** a Skill declares a suggested action for an unregistered package capability
- **THEN** Agent reports the missing capability as a diagnostic
- **THEN** the action is not executable

### Requirement: Profile is not a runtime Skill
The system SHALL keep Profile Descriptors separate from runtime Skill activation, prompt injection, tool allowlists, and workflow orchestration.

#### Scenario: Profile does not activate prompt content
- **WHEN** Agent resolves a shared Profile Descriptor
- **THEN** no prompt fragment, tool allowlist, or workflow step is injected from the profile itself

#### Scenario: Profile migration is explicit
- **WHEN** a persisted artifact references an unsupported profile version
- **THEN** renderer does not mutate the artifact to a newer version during display
- **THEN** any migration or regeneration uses an explicit migrator, projector, or Agent workflow step
