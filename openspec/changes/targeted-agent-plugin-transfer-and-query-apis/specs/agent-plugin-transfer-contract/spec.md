## ADDED Requirements

### Requirement: Plugin transfer payloads are typed by content kind
The system SHALL represent Agent-to-plugin transfer requests with typed payload variants for media assets, asset batches, Canvas storyboards, Cut storyboards, plain text, optimized prompts, and structured content blocks. Each payload MUST include enough provenance and content metadata for the destination plugin to render or apply the content without inspecting the conversation transcript.

#### Scenario: Agent sends optimized prompt to Canvas
- **WHEN** Agent produces an optimized image prompt and the user sends it to Canvas
- **THEN** runtime emits a typed prompt transfer payload containing prompt text, optional title, provenance, and destination target metadata

#### Scenario: Existing asset transfer remains compatible
- **WHEN** Agent sends a generated image asset to Canvas through the existing single-asset path
- **THEN** runtime continues to build a command plan equivalent to the existing Canvas asset import behavior

### Requirement: Plugin transfer targets identify stable destinations
The system SHALL support optional target references on transfer payloads. A target reference MUST allow destinations to identify explicit nodes, containers, slots, fields, insertion points, and mutation modes without requiring Agent to know destination implementation details.

#### Scenario: Send content to explicit Canvas node field
- **WHEN** a transfer payload targets a Canvas node with a field path and `replace` mode
- **THEN** Canvas validates the node and field before applying the replacement and rejects invalid paths without mutating the canvas

#### Scenario: Send content to Canvas container
- **WHEN** a transfer payload targets a Canvas container with `create-child` mode
- **THEN** Canvas resolves the container policy and inserts a valid child node through generic container membership actions

### Requirement: Runtime command planning is deterministic and additive
The system SHALL map typed transfer payloads to VSCode command plans deterministically. Unsupported target/content combinations MUST return an unsupported plan instead of falling back to screenshots, OCR, or untyped command payloads.

#### Scenario: Unsupported target is reported
- **WHEN** Agent sends a prompt payload to a plugin that does not support prompt imports
- **THEN** runtime returns an unsupported transfer plan naming the target rather than executing a best-effort command

#### Scenario: Batch asset transfer expands predictably
- **WHEN** Agent sends an asset batch to Canvas
- **THEN** runtime expands the batch into ordered single-asset command plans while preserving each asset name, media type, and target metadata

### Requirement: Webview and Agent use the same transfer contract
The system SHALL use the same transfer payload contract for Webview send buttons, slash-command actions, drag/drop transfers, and Agent tool-result actions. Webview MUST send typed intent and MUST NOT embed destination-specific mutation logic.

#### Scenario: Send menu targets selected node
- **WHEN** the Agent Webview displays a send-to-Canvas action for generated text and Canvas reports an active selected node
- **THEN** the Webview sends a typed transfer payload with that node target and runtime routes it through the shared transfer planner

#### Scenario: UI does not craft Canvas patches
- **WHEN** the user chooses "send prompt to selected Canvas node" from the Agent Webview
- **THEN** the Webview does not generate Canvas node patch data and instead sends the prompt payload plus target reference

### Requirement: Transfer safety policy is explicit
The system SHALL classify transfer execution by mutation mode. Targetless writes, replace operations, destructive operations, and ambiguous destination choices MUST require explicit user intent or confirmation before execution.

#### Scenario: Targetless insert uses deterministic fallback
- **WHEN** a transfer payload has no explicit Canvas target and Canvas reports a deterministic viewport insertion point
- **THEN** runtime may execute an insert-mode command using that insertion point and records the fallback in the command result

#### Scenario: Ambiguous replace is blocked
- **WHEN** a replace-mode transfer lacks an explicit node, slot, or field target
- **THEN** runtime rejects the command plan or requests confirmation instead of applying content to an inferred destination
