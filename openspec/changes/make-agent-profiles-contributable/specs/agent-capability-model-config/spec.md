## MODIFIED Requirements

### Requirement: Workflow Profiles Out Of User TOML MVP
Neko Agent user TOML configuration SHALL NOT be the MVP source of truth for validation workflows, alias mappings, profile descriptor definitions, or multi-step generation-check orchestration. Those behaviors SHALL be implemented through code-owned presets, contributed profile descriptors, internal registries, provider adapters, and UI affordances. User TOML MAY select providers/models and safe scalar options, and model/catalog metadata MAY reference contributed provider/model expression profile ids, but TOML SHALL NOT define Artifact Profile, Creation Profile, or Provider/Model Expression Profile schemas.

#### Scenario: Validation workflow needs multiple checks
- **WHEN** a future video validation workflow needs local probing, video understanding, safety moderation, and LLM judging
- **THEN** the workflow SHALL be defined by Neko-owned presets/registries, contributed profile descriptors, and provider adapters
- **AND** user TOML SHALL only select models/defaults exposed by known purposes or reference supported profile ids when that reference field is explicitly part of the schema
- **AND** user TOML SHALL NOT define the workflow steps.

#### Scenario: User TOML tries to define workflow semantics
- **WHEN** user TOML includes a workflow/validation profile schema that is not supported by the MVP
- **THEN** the system SHALL ignore unsupported future-only sections only if they are outside the current schema contract, or reject them once schema validation owns unknown sections
- **AND** the MVP SHALL NOT route runtime behavior from those user-authored workflow definitions.

#### Scenario: Model metadata references expression profile
- **WHEN** a model catalog or normalized model descriptor references a provider/model expression profile id
- **THEN** the runtime SHALL resolve that id through the provider/model expression profile registry
- **AND** missing or incompatible profile references SHALL produce a visible diagnostic instead of inlining TOML-authored prompt guidance.
