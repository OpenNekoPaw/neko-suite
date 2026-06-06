## ADDED Requirements

### Requirement: Agent can query active Canvas context
The system SHALL expose Agent-accessible Canvas context queries for active document identity, selected nodes, viewport insertion point, focused container, and compact node summaries. These queries MUST be read-only and MUST return stable IDs suitable for follow-up mutations.

#### Scenario: Query selected Canvas node
- **WHEN** Agent requests active Canvas context while exactly one node is selected
- **THEN** Canvas returns the selected node ID, node type, preset or policy metadata when available, and a compact generation-relevant summary

#### Scenario: Query insertion fallback
- **WHEN** Agent requests active Canvas context while no node is selected
- **THEN** Canvas returns a viewport insertion point or reports that no deterministic insertion target is available

### Requirement: Agent can apply text and prompt content to Canvas targets
The system SHALL expose a target-aware Canvas operation for importing or applying Agent-generated text, optimized prompts, and structured content. The operation MUST validate the target node, container, slot, field path, and mutation mode before committing changes.

#### Scenario: Apply prompt to Shot node
- **WHEN** Agent sends an optimized prompt to a Shot node's generation prompt field
- **THEN** Canvas updates only the validated prompt field and preserves unrelated Shot data

#### Scenario: Insert text as new Canvas node
- **WHEN** Agent sends text content with insert mode and a viewport insertion point
- **THEN** Canvas creates an appropriate text, annotation, document, or script node at that insertion point

#### Scenario: Invalid target is rejected
- **WHEN** Agent sends structured content to a node that does not accept the requested slot or field path
- **THEN** Canvas rejects the operation with a typed error and does not partially mutate the canvas

### Requirement: Agent content imports use shared Canvas mutation services
The system SHALL route target-aware Agent content imports through the same Canvas domain services used by Webview buttons, command handlers, and Agent tools. Implementations MUST NOT maintain separate patching logic for Agent-only content application.

#### Scenario: Webview and Agent produce same mutation
- **WHEN** a user sends a prompt to the selected Canvas node from the Agent Webview and Agent later calls the equivalent tool directly
- **THEN** both paths validate the same target constraints and produce the same Canvas change event shape

### Requirement: Canvas query results are compact by default
The system SHALL keep Agent-facing Canvas query results compact by default. Detailed node data, child expansion, visual thumbnails, and generated asset metadata MUST require explicit request options.

#### Scenario: List nodes returns summaries
- **WHEN** Agent lists active Canvas nodes without detail options
- **THEN** Canvas returns stable IDs, types, labels, parent/container references, and brief summaries without serializing large preview data

#### Scenario: Detail request expands target node
- **WHEN** Agent requests a specific node with detail options
- **THEN** Canvas returns the requested editable fields and binding metadata needed for a follow-up mutation
