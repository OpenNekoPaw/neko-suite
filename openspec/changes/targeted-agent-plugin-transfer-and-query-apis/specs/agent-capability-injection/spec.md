## ADDED Requirements

### Requirement: Agent tools declare query and mutation safety
The system SHALL require Agent-facing tools that access editor state to declare whether they are read-only queries, non-destructive mutations, destructive mutations, or confirmation-gated operations. Runtime injection and execution policy MUST use this metadata when deciding whether a tool can be called automatically.

#### Scenario: Structured query tool is injected safely
- **WHEN** a Canvas capability provider contributes a selection query tool marked read-only and concurrency-safe
- **THEN** runtime may inject and execute it without mutation confirmation according to normal read-only tool policy

#### Scenario: Destructive mutation requires approval
- **WHEN** a capability provider contributes a delete, replace, overwrite, or cross-container move operation
- **THEN** runtime treats the tool as confirmation-gated and does not auto-execute it without explicit user intent or policy approval

### Requirement: Capability metadata exposes target requirements
The system SHALL allow Agent tools and transfer commands to declare target requirements such as required node ID, container ID, slot ID, field path, selection fallback, or viewport insertion fallback. Runtime MUST use these declarations to avoid invoking mutation tools with ambiguous destinations.

#### Scenario: Tool requires explicit target node
- **WHEN** Agent wants to apply an optimized prompt to an existing Canvas node and the tool declares `nodeId` as required for replace mode
- **THEN** runtime first obtains or asks for a target node rather than calling the mutation with only natural-language context

#### Scenario: Tool allows selection fallback
- **WHEN** a tool declares that current selection is an allowed target fallback and the active editor reports exactly one selected node
- **THEN** runtime may pass that selected node as the resolved target and records that fallback in trace metadata

### Requirement: Capability introspection includes query-before-mutate guidance
The system SHALL expose provider guidance that identifies preferred query tools for each mutation tool. Agent planning SHOULD use this introspection to gather stable IDs, summaries, and context before calling mutations.

#### Scenario: Canvas prompt update advertises query dependency
- **WHEN** Canvas registers a prompt-application mutation tool
- **THEN** capability introspection identifies Canvas selection and node query tools as preferred preflight tools

#### Scenario: Planner sees missing query tool
- **WHEN** a mutation tool has target requirements but no provider query tool can satisfy them
- **THEN** runtime marks the mutation as requiring user-specified target input instead of relying on OCR or screenshots
