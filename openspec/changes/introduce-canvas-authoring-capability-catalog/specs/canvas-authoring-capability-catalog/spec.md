## ADDED Requirements

### Requirement: Canvas exposes an authoring capability catalog
Canvas SHALL expose a read-only authoring capability catalog that Agent can query on demand before choosing Canvas authoring tools.

#### Scenario: Agent queries the catalog
- **WHEN** Agent invokes the Canvas authoring catalog query
- **THEN** Canvas MUST return a versioned, bounded description of supported node types, presets, container policies, connection types/rules, targetable fields, resource identity rules, operation descriptors, recommended recipes, risk levels, and confirmation requirements
- **AND** the catalog MUST be owned by Canvas rather than Agent runtime or Agent Webview code

#### Scenario: Agent requests a catalog subset
- **WHEN** Agent requests a subset such as node types, presets, connections, recipes, or operations
- **THEN** Canvas MUST return only the requested supported sections when possible
- **AND** Canvas MUST report unsupported catalog sections with typed diagnostics rather than returning misleading empty success

#### Scenario: Catalog version is unsupported
- **WHEN** a caller requests an unsupported catalog version
- **THEN** Canvas MUST fail visibly with a typed diagnostic
- **AND** Canvas MUST NOT silently downgrade to an incompatible schema that Agent could misinterpret

### Requirement: Canvas provides a general authoring Skill
Canvas SHALL provide a general Canvas authoring Skill for Agent reasoning instead of relying on a storyboard-specific Skill as the primary Canvas entry point.

#### Scenario: Agent discovers Canvas Skills
- **WHEN** Agent queries registered Skills or Canvas contributes Skills
- **THEN** Canvas MUST expose a `canvas-authoring` Skill or equivalent general Canvas Skill
- **AND** the Skill MUST describe query-before-mutate strategy, node/preset/container/connection semantics, Markdown/table routing, media/resource binding, prompt writing before generation, and diagnostic repair loops

#### Scenario: Storyboard guidance is needed
- **WHEN** Agent needs to create or review storyboard content in Canvas
- **THEN** the general Canvas authoring Skill MUST describe storyboard as a Canvas recipe using Canvas-owned capabilities such as Markdown ingest or `scene.basic` plus `shot.basic` composites
- **AND** Agent MUST NOT need a specialized storyboard-table Skill to understand Canvas authoring

#### Scenario: Old storyboard Skill remains temporarily available
- **WHEN** a compatibility alias for `canvas-markdown-storyboard` is retained
- **THEN** it MUST route to or reference the general Canvas authoring guidance
- **AND** tests MUST prove new Agent-to-Canvas authoring behavior does not depend on the old Skill as the canonical path

### Requirement: Canvas owns declarative field and profile descriptors
Canvas SHALL own field and profile authority through validated descriptors that can be extended without requiring Agent runtime changes.

#### Scenario: Profile contributes new fields
- **WHEN** a Canvas profile contributes fields such as scene information, character appearance, voice cues, prompt spans, or execution refs
- **THEN** Canvas MUST validate descriptor ids, namespaces, aliases, value types, roles, cardinality, storage targets, and optional capability bindings before accepting the profile
- **AND** Agent or Skill text MUST NOT become authoritative field schema without a Canvas-validated descriptor

#### Scenario: Skill outputs unknown fields
- **WHEN** Agent or a Skill outputs table columns or prompt spans that do not match a registered Canvas field descriptor
- **THEN** Canvas MUST preserve those values as custom review metadata or return diagnostics
- **AND** Canvas MUST NOT write them into semantic node fields or expose execution actions as successful

#### Scenario: Field binds to an owning domain capability
- **WHEN** a field descriptor binds to an owning domain capability such as entity binding, TTS generation, image generation, video generation, or asset attachment
- **THEN** Canvas MUST verify that the capability exists, requires approval when mutating or expensive, and receives stable refs
- **AND** Canvas MUST block execution with diagnostics if the capability is missing, untrusted, or lacks required approval

### Requirement: Storyboard uses semantic prompts with field projections
Canvas SHALL support storyboard rows as semantic prompt documents or prompt blocks with field-backed projections for review.

#### Scenario: Prompt block contains semantic spans
- **WHEN** a storyboard image, video, or voice prompt contains semantic spans for scene, character, action, style, camera movement, dialogue, resource refs, or voice cues
- **THEN** Canvas MUST preserve the prompt text, span descriptors, stable refs, provenance, and prompt target
- **AND** Canvas MUST be able to project the spans into review fields or table columns without making the table the only source of truth

#### Scenario: User edits a bound prompt span
- **WHEN** a user or Agent updates a prompt span that is bound to a Canvas field descriptor
- **THEN** Canvas MUST update the corresponding field projection or return a diagnostic if the edit violates the descriptor
- **AND** Canvas MUST preserve provenance that the prompt was edited directly

#### Scenario: User edits free-form prompt text
- **WHEN** a user or Agent edits prompt text outside recognized semantic spans
- **THEN** Canvas MUST preserve the prompt override and mark field alignment state as prompt-overridden, fields-changed, conflict, or an equivalent explicit state when relevant
- **AND** Canvas MUST NOT silently reverse-parse and overwrite structured fields without an explicit apply operation

### Requirement: Canvas validates prompt-field alignment
Canvas SHALL provide validation or diagnostics for alignment between semantic prompts and their field projections.

#### Scenario: Fields change after prompt generation
- **WHEN** fields used by a prompt change after the prompt was generated or synchronized
- **THEN** Canvas MUST report prompt-field alignment diagnostics identifying changed fields when possible
- **AND** Canvas MUST offer a safe next action such as keep prompt, regenerate prompt, merge fields into prompt, or ask Agent to propose a merge

#### Scenario: Prompt adds field-like information
- **WHEN** prompt text appears to add scene, character, media, voice, or camera information that is not represented by known field spans
- **THEN** Canvas MAY return field suggestion diagnostics
- **AND** those suggestions MUST require explicit apply intent before changing structured fields

#### Scenario: Prompt references unresolved entities or media
- **WHEN** a prompt span or projection references an unresolved `@` mention, missing media token, ambiguous resource, or runtime-only handle
- **THEN** Canvas MUST return diagnostics and block durable binding or execution
- **AND** Canvas MUST NOT bind by display text, row order, or raw file name guessing

### Requirement: Canvas command surface supports query, mutation, and feedback
Canvas SHALL expose Agent-facing authoring commands as explicit query and mutation operations with structured feedback.

#### Scenario: Agent plans before mutation
- **WHEN** Agent intends to mutate Canvas without an explicit node or field target from the user
- **THEN** Agent MUST be able to query active Canvas context, catalog data, and relevant node or connection details before mutation
- **AND** Canvas mutation tools MUST advertise preferred query tools or target requirements where applicable

#### Scenario: Agent creates a composite
- **WHEN** Agent uses a Canvas composite creation command for a container such as `scene.basic`
- **THEN** Canvas MUST validate the container preset, child presets/types, child placement, and connection specs according to Canvas-owned policies
- **AND** Canvas MUST return stable refs for the created container, children, and connections

#### Scenario: Agent creates a connection
- **WHEN** Agent uses a Canvas connection creation command
- **THEN** Canvas MUST validate source/target nodes, endpoint scopes, connection type, subsystem rules, and resource-safe extension data
- **AND** Canvas MUST return the created connection ref or typed diagnostics that identify the invalid endpoint or rule

#### Scenario: Destructive operations are unavailable
- **WHEN** Canvas cannot provide confirmation-gated, undo-aware, validated delete or update behavior for a node or connection operation
- **THEN** the authoring catalog MUST omit that operation or mark it unavailable
- **AND** Canvas MUST NOT advertise a destructive command that can no-op or mutate without structured feedback

### Requirement: Canvas authoring results are structured and repairable
Canvas authoring mutation commands SHALL return structured result envelopes that let Agent explain, repair, retry, or ask for user approval.

#### Scenario: Mutation succeeds
- **WHEN** a Canvas authoring mutation succeeds
- **THEN** the result MUST include status, changed entity refs, and enough summary data for Agent to reference the created or updated Canvas objects
- **AND** the result MUST NOT require Agent to infer success by parsing opaque strings

#### Scenario: Mutation is blocked
- **WHEN** a Canvas authoring mutation is rejected because of an invalid node type, preset, container policy, connection endpoint, field path, missing resource, missing approval, or stale ref
- **THEN** the result MUST include a machine-readable diagnostic code, safe message, target ref when known, expected/received details when safe, and suggested next actions or required query when available
- **AND** Agent MUST be able to decide whether to retry with corrected arguments, query more context, ask the user, or stop

#### Scenario: Runtime-only resource identity is provided
- **WHEN** an authoring command receives a Webview URI, blob URL, cache path, system temp path, Engine token, provider runtime handle, or raw chat attachment order as durable resource identity
- **THEN** Canvas MUST reject or diagnose the value before persisting it
- **AND** Canvas MUST NOT recover success by reverse-looking-up a stable resource from that runtime handle

### Requirement: Canvas remains the authority for durable Canvas state
Canvas SHALL remain the authority for durable Canvas node, connection, resource binding, and project-file mutations.

#### Scenario: Agent attempts direct Canvas JSON authoring
- **WHEN** Agent output or Webview handoff contains raw `CanvasNode[]`, raw `.nkc` document JSON, or direct project-file patches as an authoring request
- **THEN** Canvas MUST reject that as a canonical Agent authoring input unless it is routed through a dedicated validated import/migration path
- **AND** normal Agent authoring MUST use Canvas tools and capability contracts

#### Scenario: Active editor state is required
- **WHEN** an authoring operation depends on active editor selection, viewport insertion point, focused container, undo/history, or Webview-side Canvas state
- **THEN** the operation MUST be mediated by the Canvas Extension Host and active Canvas editor bridge
- **AND** a standalone external server MUST NOT claim successful canonical mutation without that mediation

#### Scenario: Future MCP server is introduced
- **WHEN** a future Canvas MCP server exposes Canvas authoring to external clients
- **THEN** it MUST adapt the same typed Canvas authoring API and respect active editor/resource/undo boundaries
- **AND** it MUST NOT duplicate Canvas state ownership or become a parallel command implementation
