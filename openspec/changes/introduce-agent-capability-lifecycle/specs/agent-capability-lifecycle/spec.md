## ADDED Requirements

### Requirement: Providers expose lifecycle descriptors
The system SHALL allow Agent capability providers to expose typed lifecycle descriptors for local MCP-like creative capabilities without requiring Agent to import provider implementation modules.

#### Scenario: Provider registers lifecycle descriptors
- **WHEN** a provider registers a lifecycle-enabled capability
- **THEN** Agent MUST receive a descriptor that includes capability id, provider id, lifecycle phases, input schema id, result schema id, accepted artifact kinds, produced artifact kinds, risk, approval requirement, and target requirements

#### Scenario: Descriptor references an unregistered handler
- **WHEN** Agent attempts to invoke a lifecycle descriptor whose owning handler is unavailable
- **THEN** the invocation MUST fail visibly with a typed diagnostic instead of falling back to a legacy command, empty success, or no-op

### Requirement: Lifecycle invocation results use a shared envelope
Lifecycle capability invocation SHALL return a shared result envelope containing status, phase, diagnostics, review artifact refs, changed refs, actions, and optional schema-guarded domain data.

#### Scenario: Validation returns diagnostics
- **WHEN** a lifecycle capability validates invalid input
- **THEN** the result MUST use the shared envelope with `status: "blocked"` or `status: "needs-review"` and diagnostics that identify the invalid contract, field, token, or target where available

#### Scenario: Review creates a draft artifact
- **WHEN** a lifecycle capability creates a review-first draft or preview artifact
- **THEN** the result MUST include a review artifact ref or changed ref and MUST NOT require Agent to parse domain-private node JSON to render generic success, diagnostics, or next actions

#### Scenario: Domain data is returned
- **WHEN** a lifecycle capability returns domain-specific data in the result
- **THEN** the result MUST identify the result schema through the descriptor and generic Agent runtime MUST NOT depend on unguarded `unknown` fields for lifecycle behavior

### Requirement: Lifecycle phases are enforced
The system SHALL distinguish validation, review, apply, and execute phases so non-mutating previews and mutating domain writes follow different approval and context rules.

#### Scenario: Validate phase is invoked
- **WHEN** a caller invokes a validate phase
- **THEN** the provider MUST NOT create production domain nodes, modify durable project files, or enqueue media generation as part of validation

#### Scenario: Review phase is invoked
- **WHEN** a caller invokes a review phase
- **THEN** the provider MAY create a draft/review artifact with diagnostics and follow-up actions, but MUST NOT create production nodes unless the descriptor explicitly classifies the review artifact as the intended durable result

#### Scenario: Apply phase is invoked without approval
- **WHEN** a mutating apply phase requires approval and no user confirmation, workflow apply context, or equivalent approval token is present
- **THEN** the invocation MUST return a blocked or waiting-approval result instead of performing the mutation

### Requirement: Actions are executable contracts
Lifecycle result actions SHALL contain enough typed information for a later approved invocation without requiring Agent to reinterpret rendered Markdown or domain UI state.

#### Scenario: Review result offers an apply action
- **WHEN** a review result offers an action to create production domain nodes
- **THEN** the action MUST include an action id, target capability id, target lifecycle phase, approval requirement, and source artifact or draft reference sufficient for the provider to revalidate before applying

#### Scenario: Action is invoked after source changes
- **WHEN** a follow-up action is invoked and its source artifact, resource binding, table profile, or target no longer matches the reviewed state
- **THEN** the provider MUST revalidate and return diagnostics instead of silently applying stale assumptions

### Requirement: Webview shortcuts share the lifecycle invocation path
Agent Webview shortcuts such as "Send to Canvas" SHALL use the same lifecycle invocation backend as Agent tool calls for capability validation, permission, approval, diagnostics, and result handling.

#### Scenario: Webview sends Markdown to Canvas
- **WHEN** the Agent Webview sends Markdown content to Canvas through a shortcut
- **THEN** the Extension MUST route the request through the shared lifecycle invocation backend or an equivalent facade that enforces the same descriptor, permission, approval, and diagnostic behavior

#### Scenario: Shortcut would hit a legacy transfer path
- **WHEN** Markdown authoring content matches a lifecycle-enabled Canvas capability
- **THEN** the shortcut MUST NOT return success through legacy `canvasStoryboard`, `canvasStructuredContent`, direct import command, or compiler transfer fallback paths

### Requirement: Canvas Markdown uses lifecycle capabilities
Canvas Markdown note, table, storyboard draft, storyboard creation, resource attachment, and validation behaviors SHALL be represented as lifecycle-enabled Canvas capabilities.

#### Scenario: Markdown storyboard draft is reviewed
- **WHEN** Agent or Webview submits a Markdown storyboard table for review
- **THEN** Canvas MUST own table parsing, resource binding, profile validation, draft/review node creation, diagnostics, and follow-up action creation

#### Scenario: Markdown storyboard production nodes are applied
- **WHEN** Agent or Webview requests production storyboard node creation from Markdown
- **THEN** Canvas MUST require the apply phase and approval context, revalidate the source, and return created node refs or diagnostics through the lifecycle result envelope

### Requirement: Table profiles are domain-owned and extensible
Canvas SHALL provide domain-owned table profiles for Markdown table interpretation, with storyboard as one profile rather than a hardcoded shared protocol.

#### Scenario: Storyboard profile validates a table
- **WHEN** Canvas receives a Markdown table with a storyboard profile hint or matching user action
- **THEN** Canvas MUST apply storyboard profile aliases, required or recommended field rules, resource field hints, unknown-column preservation, review actions, and diagnostics inside Canvas-owned code

#### Scenario: Unknown columns are present
- **WHEN** a Markdown table contains columns not consumed by the selected profile
- **THEN** Canvas MUST preserve those columns as review/display metadata unless the selected profile explicitly rejects them with diagnostics

#### Scenario: Generic table is sent
- **WHEN** a Markdown table does not select a storyboard or other specialized profile
- **THEN** Canvas MUST treat it as a generic table capability rather than guessing production storyboard semantics from narrow Webview-only header matching

### Requirement: Resource identity remains stable
Lifecycle inputs, actions, and results SHALL use stable resource identities and MUST NOT persist runtime-only projection handles.

#### Scenario: Runtime-only resource handle is submitted
- **WHEN** an invocation input, action, or result attempts to use a Webview URI, blob URL, cache path, temp absolute path, localhost runtime URL, or provider-private runtime handle as resource identity
- **THEN** validation MUST reject it with diagnostics instead of converting it into durable project or draft state

#### Scenario: Resource is projected for display
- **WHEN** Agent Webview or Canvas Webview displays a resource thumbnail for a lifecycle result
- **THEN** the rendered URI MUST remain presentation-only and MUST NOT be written back into the invocation payload, action payload, draft metadata, or durable domain node state

### Requirement: Legacy Canvas Markdown authoring paths are fail-closed
Markdown authoring drafts that have a lifecycle-enabled Canvas path SHALL NOT succeed through legacy plugin transfer or compiler paths.

#### Scenario: New authoring request reaches plugin transfer
- **WHEN** a Markdown authoring draft request reaches a legacy Canvas plugin transfer path
- **THEN** the path MUST return a fail-closed diagnostic or be unreachable by default, and tests MUST prove it did not create Canvas nodes for the new request

#### Scenario: Validated structured tool result remains
- **WHEN** a non-authoring validated structured tool result still uses an existing transfer path during migration
- **THEN** it MUST be documented as retained structured-result behavior and MUST NOT be used as acceptance evidence for lifecycle-enabled Markdown authoring paths

### Requirement: Capability lifecycle validation proves canonical path usage
Implementation validation SHALL assert that lifecycle-enabled requests use the canonical lifecycle descriptors, invocation backend, and provider handlers rather than only asserting final successful output.

#### Scenario: Lifecycle invocation succeeds
- **WHEN** a test verifies successful lifecycle invocation
- **THEN** the test MUST assert that the lifecycle descriptor/backend/provider path was invoked or that legacy paths were poisoned and not hit

#### Scenario: Provider-specific table profile is tested
- **WHEN** a test verifies storyboard or future table profile behavior
- **THEN** the test MUST assert the selected profile and provider-owned validation path rather than relying only on final node count
