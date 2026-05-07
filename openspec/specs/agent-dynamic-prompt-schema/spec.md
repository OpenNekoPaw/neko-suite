# agent-dynamic-prompt-schema Specification

## Purpose
TBD - created by archiving change unify-neko-agent-runtime-workflow-boundaries. Update Purpose after archive.
## Requirements
### Requirement: Runtime generates prompts from layered context
The system SHALL generate system prompts and workflow prompts through a runtime prompt/schema generator. The generator MUST consume base prompt, locale, AGENTS.md overlays, settings, IDC stage, plan mode, active skill, workflow node, capability prompt fragments, provider expression fragments, memory/context summaries, multimodal context summaries, and ablation toggles.

#### Scenario: Plan mode changes prompt profile
- **WHEN** a turn runs in PlanMode
- **THEN** the generated prompt includes the IDC Draft/Plan/Apply constraints required by the active workflow stage

#### Scenario: Active skill injects prompt fragment
- **WHEN** a skill is active and injection policy allows its prompt fragment
- **THEN** the generated prompt contains that fragment in the skill/capability layer

### Requirement: Runtime generates tool schemas and allowlists
The system SHALL generate the tool schema set and tool allowlist per turn or workflow node. The generated schema set MUST reflect active skill constraints, workflow node type, model/provider capability, permission mode, host availability, trust policy, dynamic tool sets, and ablation toggles.

#### Scenario: Workflow node limits tools
- **WHEN** a workflow node declares an allowed tool group
- **THEN** the generated tool schema set contains only tools allowed by that node plus required resident tools

#### Scenario: Provider without tool calling receives compatible prompt
- **WHEN** the selected provider does not support native tool calling
- **THEN** the AI SDK adapter receives a provider-compatible prompt/schema projection or runtime rejects the configuration with a typed error

### Requirement: Runtime generates structured output schemas
The system SHALL generate structured output schemas for IDC artifacts, workflow node outputs, evaluator outputs, tool arguments, and recovery decisions. Schemas MUST be versioned and testable with fixtures.

#### Scenario: Draft node uses draft schema
- **WHEN** a workflow run enters a Draft node
- **THEN** runtime supplies the schema needed to produce or validate a draft artifact

#### Scenario: Evaluator output is schema-bound
- **WHEN** an evaluator node runs
- **THEN** runtime supplies a structured output schema for score, pass/fail, reasons, metrics, and evidence references

### Requirement: Prompt and schema snapshots are testable
The system SHALL provide deterministic prompt/schema snapshot tests for representative combinations of IDC stage, plan mode, skill activation, capability injection, provider capability, and multimodal context.

#### Scenario: Snapshot detects accidental prompt drift
- **WHEN** a developer changes a prompt fragment or generation order
- **THEN** the targeted snapshot test shows the changed generated prompt/schema output

### Requirement: Extension and Webview do not build core prompts
The system SHALL prevent Extension and Webview from constructing core system prompts, workflow prompts, tool schemas, or structured output schemas. They MAY pass user text, settings, selected mode, active skill id, model selection, and host context to runtime.

#### Scenario: Extension delegates prompt command message construction
- **WHEN** Extension receives a command that needs an agent prompt
- **THEN** it delegates prompt command message construction or prompt generation to runtime helpers rather than embedding core prompt text

### Requirement: Prompt generation supports dynamic evolution
The system SHALL allow new prompt fragments, schemas, capability cards, provider expression cards, and evaluator hints to be added through registry entries without editing `AgentTurnBridge` or Webview UI logic.

#### Scenario: New provider card affects prompt without bridge change
- **WHEN** a provider expression card is registered and selected by policy
- **THEN** runtime includes its prompt fragment without requiring changes to Extension bridge code

