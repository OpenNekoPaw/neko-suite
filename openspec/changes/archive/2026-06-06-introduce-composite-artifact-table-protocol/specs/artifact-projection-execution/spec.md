## ADDED Requirements

### Requirement: Artifact actions are layered by side effect
The system SHALL classify artifact actions as view, review, transform, or execute. Execute actions MUST be treated as side-effecting operations requiring validation, provider lookup, and approval according to risk metadata.

#### Scenario: Review action records no package mutation
- **WHEN** a user marks a table row as reviewed or rejected
- **THEN** the system may update artifact review state
- **THEN** it does not mutate Canvas, Cut, media assets, or project files unless an execute provider is invoked

#### Scenario: Execute action requires provider
- **WHEN** an artifact suggests importing storyboard shots into Canvas
- **THEN** the action is executable only if a registered Canvas capability provider accepts the projected payload

### Requirement: Projectors convert artifacts into domain payloads deterministically
The system SHALL use registered projectors or adapters to convert reviewed generic artifacts or domain blocks into domain payloads such as `StoryboardTable`, Canvas storyboard payloads, Cut storyboard payloads, or `EditOperation` plans.

#### Scenario: Generic shot table projects to storyboard
- **WHEN** a `GenericTable(profile="comic-shot-plan")` passes profile validation and a projector accepts it
- **THEN** the projector can produce a `StoryboardTable` domain payload
- **THEN** the projection result includes diagnostics for unmapped or invalid rows

#### Scenario: Missing projector disables transform
- **WHEN** a generic table has no registered projector to the requested domain payload
- **THEN** transform and execute actions depending on that projection are disabled
- **THEN** the artifact remains viewable and reviewable

### Requirement: Canvas and Cut support generic rendering plus directed imports
Canvas and Cut SHALL be able to render generic artifact/table surfaces when available, while directed imports or timeline writes remain gated by package-owned projectors and providers.

#### Scenario: Canvas renders table without import support
- **WHEN** Canvas receives a generic artifact table for which no Canvas import projector is registered
- **THEN** Canvas may render it as a table node or preview surface
- **THEN** Canvas does not create Scene/Shot nodes from it

#### Scenario: Canvas imports projected storyboard
- **WHEN** a composite artifact contains or projects to a valid `StoryboardTable` accepted by Canvas
- **THEN** Canvas can convert it to `CanvasStoryboardPayload` through the registered projector/provider path
- **THEN** Canvas reports an execution summary with created node ids or diagnostics

#### Scenario: Cut imports projected storyboard
- **WHEN** a composite artifact contains or projects to a valid storyboard payload accepted by Cut
- **THEN** Cut can import timeline clips, cues, or placeholders through its registered provider
- **THEN** Cut reports execution summary data rather than relying on Agent to infer timeline state

### Requirement: EditOperation remains deterministic execution data
The system SHALL keep `EditOperation` separate from composite artifacts and generic tables. Artifacts MAY lead to `EditOperation` plans after validation and approval, but MUST NOT use generic table rows as direct undoable edits.

#### Scenario: Artifact becomes edit operation after approval
- **WHEN** a user approves an artifact action that modifies an editor document
- **THEN** the provider or adapter can produce deterministic `EditOperation` data
- **THEN** apply/invert/undo behavior remains owned by the operation system

#### Scenario: Planning table is not undo command
- **WHEN** a generic table describes candidate changes or shot plans
- **THEN** the table is treated as planning/review data
- **THEN** it is not placed directly into the undo stack as an `EditOperation`

### Requirement: Execution summaries write back to artifact state
The system SHALL return structured execution summaries after side-effecting artifact actions. Summaries MUST identify action id, provider, input artifact id, result status, created or updated refs, diagnostics, and recoverable failure details when available.

#### Scenario: Provider returns partial success
- **WHEN** Canvas imports five projected shots and one row fails validation
- **THEN** the execution summary reports partial success, created node refs for successful rows, and diagnostics for the failed row
- **THEN** Agent/Webview can update the artifact display without fabricating missing nodes

#### Scenario: Provider unavailable is summarized
- **WHEN** an execute action is requested but the target package provider is unavailable
- **THEN** the system returns an unavailable execution summary or diagnostic
- **THEN** no side effect is performed

### Requirement: Approval gate is mandatory for risky artifact execution
The system SHALL route medium, high, destructive, expensive, or provider-side-effecting artifact execution through the approval policy before provider invocation.

#### Scenario: Expensive generation requires approval
- **WHEN** an artifact suggests generating video clips or TTS assets
- **THEN** Agent requests approval according to provider risk and cost metadata before execution

#### Scenario: Destructive replacement requires approval
- **WHEN** an artifact action would replace existing Canvas/Cut content
- **THEN** the approval gate must confirm the target and operation before provider execution
