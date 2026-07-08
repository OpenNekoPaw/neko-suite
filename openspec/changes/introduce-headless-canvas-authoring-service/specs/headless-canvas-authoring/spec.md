## ADDED Requirements

### Requirement: Host-side Canvas production authoring

The system SHALL support production Canvas `.nkc` authoring from Extension Host without requiring an active or visible Canvas Webview.

#### Scenario: Create production nodes without open Webview

- **WHEN** a host caller requests production Canvas node or composite creation and no Canvas Webview is open
- **THEN** the system MUST resolve or create a `.nkc` target, apply the requested document facts through the headless Canvas authoring path, and save the `.nkc` file
- **AND** it MUST NOT require `CanvasEditorProvider.activeWebviewPanel` before the write can succeed

#### Scenario: Webview executor is not used for headless production write

- **WHEN** a production headless Canvas authoring test poisons the legacy Webview executor methods so they throw if called
- **THEN** creating nodes, composites, or storyboard scene/shot nodes through the headless service MUST still succeed
- **AND** the test MUST fail if the legacy Webview executor participates in the production write

### Requirement: Explicit Canvas target resolution

The system SHALL resolve Canvas authoring targets explicitly before mutating `.nkc` project facts.

#### Scenario: Explicit document target

- **WHEN** a Canvas authoring request includes a valid `documentUri`
- **THEN** the system MUST load and mutate that `.nkc` file
- **AND** it MUST NOT write to a different active or background Canvas editor

#### Scenario: Active Canvas target

- **WHEN** a Canvas authoring request has no explicit `documentUri` and a selected active Canvas document exists
- **THEN** the system MUST mutate the selected active Canvas document
- **AND** it MUST NOT create a new `.nkc` file for that request

#### Scenario: No target creates a new Canvas

- **WHEN** a Canvas authoring request has no explicit target and no selected active Canvas document exists
- **THEN** the system MUST create a new `.nkc` file in an authorized workspace location and mutate that file
- **AND** the result MUST include the created document URI

#### Scenario: Reveal is optional

- **WHEN** a Canvas authoring request completes with `reveal` unset or `false`
- **THEN** the system MUST NOT open or reveal a Canvas Webview as a side effect of the write
- **AND** when `reveal` is `true`, the system MAY open or focus the target Canvas Webview after the file write succeeds

### Requirement: Project-file IO backed persistence

The system SHALL persist headless Canvas authoring results through the shared project-file IO lifecycle and the Canvas `.nkc` codec.

#### Scenario: Saved headless mutation is reopenable

- **WHEN** a host-side Canvas authoring request adds nodes, connections, storyboard scene/shot data, prompt documents, or stable resource refs to a `.nkc` file
- **THEN** closing and reopening the same file MUST recover those durable project facts from the `.nkc` content
- **AND** recovery MUST NOT depend on VS Code editor state, Webview memory, cache files, runtime handles, or an open Canvas panel

#### Scenario: Invalid canvas data blocks save

- **WHEN** a host-side Canvas authoring operation would produce invalid `.nkc` data
- **THEN** the system MUST return diagnostics or throw a fail-visible error before writing
- **AND** it MUST NOT silently save a partial, empty, or fallback Canvas document as success

### Requirement: Stable resource identity in Canvas facts

The system SHALL persist only durable resource identity in Canvas project facts produced by headless authoring.

#### Scenario: Stable references are saved

- **WHEN** a Canvas authoring request includes `ResourceRef`, `DocumentArchiveResourceRef`, workspace-relative path, `${VAR}/path`, asset/entity ID, prompt document, or provenance data
- **THEN** the system MAY persist those stable references in `.nkc` project facts
- **AND** runtime display projections MUST remain separate from the saved project facts

#### Scenario: Runtime handle is rejected

- **WHEN** a Canvas authoring request attempts to persist a Webview URI, blob URL, object URL, temp path, cache path, Engine token, stream id, preview URL, or legacy `cachePath` as source identity
- **THEN** the system MUST block the write with machine-readable diagnostics
- **AND** it MUST NOT write that runtime or cache handle into `.nkc` project facts

#### Scenario: Asset import creates media facts without Webview execution

- **WHEN** `neko.canvas.importAsset` or `NekoCanvasAPI.importAsset()` receives a workspace-relative path, `${VAR}/path`, `ResourceRef`, or `DocumentArchiveResourceRef`
- **THEN** the system MUST create or mutate the resolved `.nkc` target through the headless Canvas authoring path
- **AND** it MUST persist a `media.basic` node with stable source identity and return the target document URI plus media node id
- **AND** it MUST NOT send a Webview-only import message or require an active Canvas Webview before writing

### Requirement: Storyboard markdown production creation

The system SHALL create production Canvas storyboard nodes from validated storyboard markdown through the headless Canvas authoring path.

#### Scenario: Storyboard markdown creates scene and shot nodes

- **WHEN** `canvas.createStoryboardFromMarkdown` receives a valid storyboard creative table with `profileHint=storyboard`, `mode=create-nodes`, stable resources, and lifecycle approval
- **THEN** the system MUST create production `scene.basic` and `shot.basic` Canvas nodes in the resolved `.nkc` target
- **AND** the result MUST include created node IDs and the target document URI

#### Scenario: Missing approval blocks production creation

- **WHEN** storyboard markdown creation requests production `create-nodes` mode without lifecycle approval
- **THEN** the system MUST return a blocked result with an approval diagnostic
- **AND** it MUST NOT create review table nodes, production scene/shot nodes, or fallback success output

#### Scenario: Review ingestion is not production creation

- **WHEN** storyboard markdown is sent to `canvas.ingestMarkdown` or another review-only operation
- **THEN** the system MAY create review/table/note content according to that capability
- **AND** it MUST NOT report that production `scene.basic` or `shot.basic` nodes were created unless `canvas.createStoryboardFromMarkdown` succeeded

### Requirement: Open Webview synchronization after headless writes

The system SHALL synchronize already-open Canvas Webviews after host-side headless writes without requiring Webviews before those writes.

#### Scenario: Open Webview receives host mutation

- **WHEN** the headless service mutates a `.nkc` document that is currently open in a Canvas Webview
- **THEN** the system MUST notify that Webview with an operation-applied, revision, or reload message
- **AND** the Webview MUST update its rendered state from the host-applied document facts

#### Scenario: No open Webview requires no synchronization

- **WHEN** the headless service mutates a `.nkc` document with no open Canvas Webview and `reveal` is false
- **THEN** the system MUST complete the write without sending Webview messages
- **AND** a later open of the `.nkc` file MUST render the saved project facts

### Requirement: Interactive Canvas operations remain explicitly editor-bound

The system SHALL distinguish document-authoring operations from interactive editor operations.

#### Scenario: Selection-dependent command is editor-bound

- **WHEN** a Canvas command depends on current selection, keyboard focus, viewport state, drag state, or immediate inspector interaction
- **THEN** the command MAY require an active Canvas Webview
- **AND** it MUST fail visibly or report an interactive-editor-required diagnostic when invoked without the required Webview state

#### Scenario: Document-authoring command is not editor-bound

- **WHEN** a Canvas command can be expressed as durable `.nkc` project facts without relying on current selection or viewport state
- **THEN** the command MUST use the headless Canvas authoring path by default
- **AND** it MUST NOT require opening the Webview unless the caller explicitly requests reveal
