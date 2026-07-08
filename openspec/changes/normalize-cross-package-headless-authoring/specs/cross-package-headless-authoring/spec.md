## ADDED Requirements

### Requirement: Durable authoring does not require an open Webview

The system SHALL execute host-originated durable authoring operations for migrated `nk*` project formats through Extension Host/package authoring services without requiring an active Webview, visible custom editor, or Webview snapshot as the production executor.

#### Scenario: Explicit target is written with no editor open
- **WHEN** a migrated Cut, Sketch, Audio, or Model durable authoring operation receives an explicit `documentUri` and no editor Webview for that document is open
- **THEN** the owning package MUST load or create the target project through its project-file path
- **AND** it MUST apply the domain mutation and save recoverable project facts
- **AND** it MUST NOT open a Webview or post to a Webview as a prerequisite for success

#### Scenario: Host-originated write reports saved document
- **WHEN** a migrated host or Agent authoring operation succeeds
- **THEN** the result MUST include the written document URI and any created domain refs such as clip, layer, track, model, or operation IDs
- **AND** the result MUST NOT report success solely because an editor was opened, a UI command was posted, or a preview was shown

### Requirement: Authoring target resolution is explicit

The system SHALL resolve durable authoring targets using explicit target semantics: file target, active document target, create-new target, or fail-visible missing target diagnostics.

#### Scenario: File target wins over active editor
- **WHEN** a migrated authoring request includes `target.documentUri`
- **THEN** the owning package MUST write that document
- **AND** it MUST NOT write to a different active or background editor for the same package

#### Scenario: Create-new target creates a project file
- **WHEN** a migrated authoring request uses a create-new target and the operation allows new project creation
- **THEN** the owning package MUST create a new project file in the configured workspace or project authoring location
- **AND** it MUST write the requested domain facts before returning success

#### Scenario: Missing target fails visibly
- **WHEN** a migrated durable authoring request has no explicit target, no safe active document target, and create-new is not allowed
- **THEN** the operation MUST return a machine-readable missing-target diagnostic
- **AND** it MUST NOT silently open a temporary editor, mutate an arbitrary background document, or return a no-op success

### Requirement: UI reveal is separate from mutation

The system SHALL treat opening or revealing a Webview as an optional post-write projection step, not as part of durable mutation execution.

#### Scenario: Reveal false keeps UI closed
- **WHEN** a migrated durable authoring request succeeds with `reveal` unset or false
- **THEN** the system MUST save the project facts without opening or focusing the package Webview

#### Scenario: Reveal true happens after save
- **WHEN** a migrated durable authoring request succeeds with `reveal` true
- **THEN** the system MAY open or focus the relevant custom editor after the write completes
- **AND** reveal failure MUST be reported separately from the durable write result

### Requirement: Package services own domain mutations

Each migrated package SHALL keep durable mutation logic in an owning package authoring service or equivalent domain gateway while using shared project-file IO, content access, and diagnostics for cross-cutting rules.

#### Scenario: Cut authoring service writes timeline facts
- **WHEN** Cut receives a migrated generated clip, storyboard import, canvas draft import, or source insertion request
- **THEN** Cut MUST update `.nkv` timeline/project facts through its owning authoring service
- **AND** saving and reopening the `.nkv` file MUST recover the inserted clips or project records without Webview state

#### Scenario: Sketch authoring service writes sketch facts
- **WHEN** Sketch receives a migrated image, PSD, layer, or generated image insertion request
- **THEN** Sketch MUST update `.nks` document facts through its owning authoring service
- **AND** the saved `.nks` file MUST recover the added layers or document records without an active Webview snapshot

#### Scenario: Audio authoring service writes unopened project
- **WHEN** Audio receives a migrated project edit request with a valid `.nka` `documentUri` that is not open in the editor cache
- **THEN** Audio MUST load the `.nka` file, apply the project operation, save it, and return the updated document URI
- **AND** it MUST NOT fail only because no audio editor Webview is open

#### Scenario: Model authoring service imports asset
- **WHEN** Model receives a migrated asset import or durable `.nkm` project update request
- **THEN** Model MUST update `.nkm` project facts through a host-side document path
- **AND** it MUST NOT require opening a Model Webview before persisting the import

### Requirement: Authoring entry points are client-neutral

The system SHALL expose migrated durable authoring through client-neutral package services or typed package APIs that can be adapted by VSCode, TUI, Electron, Agent, and Assets without embedding Webview or VSCode UI lifecycle into the core authoring implementation.

#### Scenario: VSCode command adapts to authoring service
- **WHEN** a VSCode command performs a migrated durable authoring operation
- **THEN** the command MUST convert VSCode-specific URI/reveal inputs into the package authoring target contract
- **AND** it MUST call the package authoring service or typed API as the production executor
- **AND** it MUST keep Webview reveal and synchronization as post-write adapter behavior

#### Scenario: TUI or Electron uses the same authoring contract
- **WHEN** TUI or Electron performs a migrated durable authoring operation for the same package
- **THEN** it MUST pass the same target, source, reveal, and provenance semantics to the package authoring service or typed API
- **AND** it MUST NOT reimplement package-local file IO, path policy, cache/source identity rules, or Webview command routing

#### Scenario: Authoring core avoids UI dependencies
- **WHEN** a package authoring service is used by multiple host clients
- **THEN** its core implementation MUST NOT import VSCode window APIs, Webview panels, React, DOM, terminal UI components, or Electron window state
- **AND** host-specific UI dependencies MUST remain in client adapters

### Requirement: Interactive editor operations remain explicit

The system SHALL keep runtime-only, selection-dependent, focus-dependent, viewport-dependent, or Engine stream-dependent operations active-editor-only unless they are redesigned as explicit durable authoring operations with stable inputs.

#### Scenario: Runtime command has no active editor
- **WHEN** an interactive-editor command such as playback, viewport camera control, focused selection action, active sketch selection inpaint, model animation playback, or live stream control is invoked without the required active editor/runtime
- **THEN** the command MUST return an `interactive-editor-required` diagnostic or equivalent typed failure
- **AND** it MUST NOT create or mutate a project file to simulate missing runtime state

#### Scenario: Durable and runtime modes are split
- **WHEN** a user feature has both a durable project mutation mode and an interactive runtime mode
- **THEN** the package MUST expose distinct contracts or request modes
- **AND** callers MUST be able to determine whether a target document is required, an active editor is required, or create-new is allowed

### Requirement: Durable source identity is resolved before save

The system SHALL resolve and validate source-bearing authoring requests through shared content access, path policy, generated asset promotion, and project-file source normalization before saving durable project facts.

#### Scenario: Stable source is persisted
- **WHEN** a migrated authoring request references workspace media, media-library media, document entries, generated assets, or asset/entity records
- **THEN** the owning package MUST persist stable refs, `ContentFileSourceRef`, `ContentDocumentSourceRef`, `ResourceRef`, asset/entity IDs, workspace-relative paths, `${VAR}/path`, or project-owned JSON facts
- **AND** runtime projections MUST remain separate from durable source identity

#### Scenario: Runtime handle is rejected
- **WHEN** a migrated authoring request attempts to persist a Webview URI, blob URL, temp path, cache path, Engine token, range URL, stream id, preview URL, or unpromoted generated cache artifact as source identity
- **THEN** the operation MUST fail with source diagnostics before saving
- **AND** it MUST NOT write that runtime handle into the `nk*` project file

### Requirement: Agent and asset transfer use canonical authoring capabilities

Agent transfer, Skill guidance, and Assets import dispatch SHALL target canonical package authoring capabilities for durable writes instead of old UI-bound command IDs.

#### Scenario: Agent sends generated media to an editor
- **WHEN** Agent or plugin transfer routes a generated image, video, audio, storyboard, model, or source bundle to a migrated package
- **THEN** the transfer planner MUST select the package's canonical authoring capability or command
- **AND** it MUST pass stable source refs, target semantics, reveal policy, and provenance as structured input

#### Scenario: Assets dispatch imports to a migrated package
- **WHEN** Assets dispatches a model, media, or creative source into a migrated package project
- **THEN** it MUST call the canonical package authoring entry point
- **AND** it MUST NOT call an old UI-bound import command as the default durable-write path

#### Scenario: Authoring capability is unavailable
- **WHEN** the required package authoring capability is not registered or cannot satisfy the target/source contract
- **THEN** Agent or Assets MUST report a typed diagnostic to the user or caller
- **AND** it MUST NOT fall back to opening a Webview and claiming durable delivery

#### Scenario: Canonical command or API name describes authoring
- **WHEN** a migrated durable authoring entry point is exposed as a command or capability
- **THEN** its canonical name or metadata MUST identify it as package authoring rather than UI import/preview behavior
- **AND** Agent and Assets MUST target that canonical entry point instead of old UI-bound command IDs

### Requirement: Open editors synchronize after host writes

The system SHALL update or reload already-open editors for the same document after a successful headless authoring write, while keeping closed editors closed unless reveal is requested.

#### Scenario: Matching editor is open
- **WHEN** a headless authoring service writes a document that is already open in the owning package editor
- **THEN** the package MUST synchronize the open editor through provider cache update, typed reload message, or typed operation-applied message
- **AND** the Webview MUST render from the saved or provider-authoritative state rather than stale pre-write state

#### Scenario: No matching editor is open
- **WHEN** a headless authoring service writes a document with no matching open editor and reveal is false
- **THEN** the package MUST complete the write without creating a Webview
- **AND** reopening the file later MUST show the written facts

### Requirement: Legacy UI-bound success paths are removed or fail closed

The system SHALL remove or fail-close migrated production paths that depend on active Webview mutation, hidden editor opening, compatibility command aliases, or old message handlers as default success routes.

#### Scenario: Legacy command is invoked after migration
- **WHEN** a migrated legacy command or message path is invoked for a durable authoring request
- **THEN** it MUST either delegate to the canonical authoring service without using the old Webview executor or return a fail-closed diagnostic
- **AND** it MUST NOT post a Webview mutation and report success as the durable result

#### Scenario: Path-level validation poisons old route
- **WHEN** tests verify a migrated durable authoring flow
- **THEN** the old Webview executor, old command ID, or old message route MUST be poisoned, removed, or asserted unused
- **AND** the test MUST prove the canonical authoring service was hit instead of asserting only the final output

#### Scenario: Legacy fixture is used only for rejection or migration
- **WHEN** a test intentionally covers an old request shape, command ID, or fixture
- **THEN** it MUST be labeled as migration, rejection, or diagnostic coverage
- **AND** it MUST NOT be counted as default acceptance evidence for the canonical authoring path
