## ADDED Requirements

### Requirement: Semantic Prompt Documents are storyboard shot authority
Canvas SHALL persist storyboard shot creative text as semantic prompt documents rather than treating a plain `generationPrompt` string as the authoring source of truth. A shot MAY contain separate image, video, and voice prompt documents, each with prompt text, semantic spans, durable references, field projections, diagnostics, and prompt-field alignment state.

#### Scenario: Shot stores prompt documents
- **WHEN** a storyboard shot is created or updated through the canonical prompt-first authoring path
- **THEN** Canvas persists image, video, or voice prompt content as semantic prompt documents with spans and alignment metadata

#### Scenario: Legacy prompt is not authoritative
- **WHEN** a shot contains a legacy `generationPrompt` but no semantic prompt document
- **THEN** Canvas treats the legacy prompt as migration or import input and does not mark it as the canonical authoring source

#### Scenario: Free-form prompt edits do not overwrite fields
- **WHEN** a user edits untagged prompt text inside a semantic prompt document
- **THEN** Canvas preserves the edit and records suggestions or alignment diagnostics instead of silently overwriting bound field projections

### Requirement: Storyboard table is scene-scoped review projection
Canvas SHALL render long-video storyboards as scenes containing shot tables. Each scene table SHALL project the current shot state into the primary columns: shot number, reference media, image prompt, video prompt, duration, dialogue, current state, and next action.

#### Scenario: Scene table projects shots
- **WHEN** Canvas opens a scene containing storyboard shots
- **THEN** the scene displays one row per shot with the primary review columns derived from semantic prompt documents, reference media, parameters, and next creative state

#### Scenario: Prompt spans provide optional review facts
- **WHEN** a prompt contains semantic spans for scene, character, action, camera, style, or voice emotion
- **THEN** Canvas can display those facts in details or optional review projections without requiring them as fixed primary table columns

#### Scenario: Plan and execution fields stay out of primary content columns
- **WHEN** a shot has task refs, result refs, execution status, action ids, or review diagnostics
- **THEN** Canvas shows them through state, next action, result panels, or execution history rather than adding them as primary storyboard content columns

### Requirement: Reference media and prompt requirements are capability aware
Canvas SHALL distinguish directly usable reference media from media that needs prompt-driven preparation. Image prompt documents SHALL be optional and used only when reference media must be prepared, repaired, transformed, or generated. Video prompt documents SHALL be the core input for video generation or video editing.

#### Scenario: Reference image can be used directly
- **WHEN** a shot has usable reference image media and no required image preparation
- **THEN** Canvas does not require an image prompt document before the shot can move to video prompt or video generation readiness

#### Scenario: Reference image needs preparation
- **WHEN** a shot reference image requires splitting, coloring, cleanup, outpainting, inpainting, redraw, keyframe generation, or style normalization
- **THEN** Canvas marks the image prompt or reference processing step as the next relevant creative action

#### Scenario: Video reference is an extension
- **WHEN** the active video generation capability supports video reference input
- **THEN** Canvas may expose video reference controls in the shot details or advanced parameter surface without making video reference a required primary table column

#### Scenario: Audio reference is an extension
- **WHEN** the active audio or video capability supports audio reference input
- **THEN** Canvas may expose audio reference controls in the shot details or advanced parameter surface without making audio reference a required primary table column

### Requirement: Current state describes next creative operation
Canvas SHALL use the storyboard table state column to answer what the shot currently needs, not to report background generation progress. The state projection SHALL include a label, severity, optional blocker, next action id, and target area such as reference media, image prompt, video prompt, dialogue, approval, result review, or prompt alignment.

#### Scenario: State shows blocker
- **WHEN** a shot lacks required reference media, prompt text, duration, dialogue, approval, or alignment for the next creative step
- **THEN** Canvas displays the most relevant blocker and next action for that shot

#### Scenario: State does not show provider progress
- **WHEN** an Agent async task is generating image, video, or audio media for a shot
- **THEN** Canvas does not use the primary state column as a progress bar or provider log display

#### Scenario: Completed task updates next state
- **WHEN** an Agent async generation or review task completes and writes back results or diagnostics
- **THEN** Canvas updates the shot next creative state to result review, retry, accept, fix alignment, or another next action

### Requirement: Storyboard action buttons dispatch Agent action intents
Canvas SHALL expose fixed next-action buttons as structured creative intents. Mutating or provider-consuming actions SHALL route through Agent reasoning, capability approval, async task management, and structured writeback instead of directly invoking media providers from the Canvas table.

#### Scenario: Prompt optimization action
- **WHEN** a user clicks an action such as optimize image prompt, optimize video prompt, or fix alignment
- **THEN** Canvas sends an Agent action intent with the shot target, prompt document refs, reference media refs, current parameters, and expected next state

#### Scenario: Generation action requires Agent
- **WHEN** a user clicks generate image, generate video, generate audio, retry, or batch process
- **THEN** Agent validates context and capability requirements, requests approval when required, and creates an async task rather than Canvas directly calling the provider

#### Scenario: Pure navigation stays in Canvas
- **WHEN** a user clicks view details, locate shot, open prompt editor, reveal reference media, or view Agent queue
- **THEN** Canvas handles the UI navigation locally without requiring Agent execution

#### Scenario: Agent workers are internal
- **WHEN** Agent decides to parallelize scene or long-video work with workers or subagents
- **THEN** Canvas only observes action intent refs, task refs, diagnostics, result refs, and next state, not internal worker identity

### Requirement: Agent async tasks own generation progress
Agent SHALL own generation progress, provider logs, queue position, cost-related events, and batch execution progress for storyboard media tasks. Canvas SHALL link to task refs and consume final or intermediate structured results only where they update creative state.

#### Scenario: Task progress appears in Agent UI
- **WHEN** a shot video generation task is running
- **THEN** Agent displays progress, logs, queue state, provider metadata, and cancellation/retry affordances in async task UI

#### Scenario: Canvas shows task link only
- **WHEN** a shot has a running task
- **THEN** Canvas may show a compact task link or "view Agent queue" affordance without duplicating the progress timeline in the storyboard table

#### Scenario: Task writeback is structured
- **WHEN** an Agent task finishes, fails, or produces diagnostics
- **THEN** the writeback includes stable result refs, diagnostics, and next-state updates that Canvas can validate before persisting

### Requirement: Model capability controls advanced parameters
Canvas SHALL expose only core storyboard authoring fields in the primary table and SHALL surface model-specific parameters as capability-driven details. Unsupported model parameters MUST produce diagnostics or stay hidden rather than becoming inert primary table fields.

#### Scenario: Unsupported parameter is not primary
- **WHEN** the active image or video model does not support a parameter such as seed, negative prompt, camera control, motion strength, video reference, or audio reference
- **THEN** Canvas does not display that parameter as a primary table field and does not send it as an executable input

#### Scenario: Supported parameter appears in details
- **WHEN** the active model supports an advanced parameter relevant to a shot action
- **THEN** Canvas may expose it in the shot details, prompt editor side panel, or action confirmation surface

#### Scenario: Agent checks capability before action
- **WHEN** Agent receives a storyboard action intent
- **THEN** Agent queries or uses Canvas/model capability descriptors before deciding whether to optimize, generate, ask for missing inputs, or block the action

### Requirement: Migration is explicit and fail-visible
Canvas SHALL provide a prelaunch migration or rebuild path for existing storyboard shots that use legacy prompt fields. The migration SHALL be explicit, testable, and fail-visible when legacy data cannot be mapped safely.

#### Scenario: Legacy shot can be migrated
- **WHEN** a shot has legacy `generationPrompt`, `promptSlots`, `visualDescription`, `characters`, `dialogue`, or `duration` fields that map safely to semantic prompt documents and review projections
- **THEN** Canvas migrates or rebuilds semantic prompt documents and records migration provenance

#### Scenario: Legacy shot cannot be migrated safely
- **WHEN** legacy shot fields are ambiguous, inconsistent, or reference runtime-only media identities
- **THEN** Canvas returns diagnostics and preserves user-visible data without reporting semantic prompt migration success

#### Scenario: New path cannot pass through legacy projection
- **WHEN** tests exercise the prompt-first storyboard table path
- **THEN** they prove the canonical semantic prompt document projection was hit and that legacy `generationPrompt` projection did not produce successful acceptance
