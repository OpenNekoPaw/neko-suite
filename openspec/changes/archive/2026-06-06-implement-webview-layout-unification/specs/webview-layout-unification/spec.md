## ADDED Requirements

### Requirement: Webview Layout Prototypes Are Classified
The system SHALL classify Webview editor and panel layouts into Workbench, Studio, Conversation, or Dashboard prototypes and preserve domain-specific placement differences that are justified by workflow semantics.

#### Scenario: Editor maps to prototype
- **WHEN** a Webview package participates in layout migration
- **THEN** the implementation documents or encodes its prototype mapping and keeps required regions such as center viewport, right inspector, bottom timeline, messages, input, tabs, or dashboard content explicit

#### Scenario: Reasonable layout differences remain
- **WHEN** Canvas keeps a left NodeLibrary while Model and Puppet keep right-side hierarchy/inspector panels
- **THEN** the system treats Canvas NodeLibrary as a creation panel and does not force it into the right hierarchy-panel convention

### Requirement: Native VSCode UI Owns Pure Informational State
The system SHALL move pure informational Webview state into native VSCode StatusBar items when that state does not require editor-space interaction.

#### Scenario: Model status is projected natively
- **WHEN** a model editor is active and selected node, object count, or engine status changes
- **THEN** native StatusBar items update with the current model information and non-active model items are hidden

#### Scenario: Canvas status leaves the drawing surface
- **WHEN** a canvas editor reports subsystem or projection status
- **THEN** the existing CanvasStatusBar displays that information and the Webview lower-left status badge is removed or no longer overlays the canvas

#### Scenario: Interactive status remains in Webview
- **WHEN** a status UI includes previews, progress controls, Apply/Discard, or editor-space interaction
- **THEN** it remains in the Webview instead of being converted to a native StatusBar item

### Requirement: StatusBar Projection Uses Imperative Visibility Management
The system SHALL manage programmatically created StatusBarItem visibility through Extension-side managers rather than assuming declaration-time `when` clause behavior.

#### Scenario: Active custom editor changes
- **WHEN** the active tab or active editor changes from a model editor to another surface
- **THEN** the model StatusBar manager calls hide for model-only items and does not rely on a native declarative `when` condition

#### Scenario: Visibility condition is readable metadata
- **WHEN** a `StatusBarItemSpec` includes `visibilityCondition`
- **THEN** the condition is treated as business-readable metadata used by the manager or tests, not as a VSCode contribution `when` clause

### Requirement: Agent Stays A Side-panel Conversation Surface
The system SHALL keep `neko-agent` as a side-panel WebviewViewProvider conversation surface and SHALL NOT migrate it into a CustomEditor or file-backed editor tab as part of this layout change.

#### Scenario: Agent remains beside editors
- **WHEN** users open or focus the AI assistant
- **THEN** the assistant remains available as a side panel or panel view that can be visible alongside editors

#### Scenario: Conversation tabs remain visible
- **WHEN** multiple conversations are open
- **THEN** the Webview tab bar remains available and is not replaced by a single dropdown

### Requirement: Agent Webview Design Remains Unchanged In This Change
The system SHALL leave the current Agent Webview Header, conversation tabs, session/model selectors, account chrome, and generation controls in the Webview for this change.

#### Scenario: Header actions remain in Webview
- **WHEN** the AI assistant view is rendered after this layout migration
- **THEN** New Chat, History, account status, and the conversation tab row remain available through the existing Webview Header design

#### Scenario: Input selectors remain in Webview
- **WHEN** the user changes Agent session mode, chat model, media model, or generation parameters
- **THEN** the existing Webview InputArea controls own that interaction without a native StatusBar/QuickPick synchronization protocol

#### Scenario: Agent redesign is deferred
- **WHEN** future work revisits Agent Header or InputArea space usage
- **THEN** it is proposed as a dedicated Agent redesign rather than being bundled into this layout migration

### Requirement: Model WorkbenchTopBar Is Removed Only After Status Projection
The system SHALL create and validate model native StatusBar items before removing the model Webview `WorkbenchTopBar`.

#### Scenario: Status exists before topbar removal
- **WHEN** `WorkbenchTopBar` is still present
- **THEN** model StatusBar items for selected/object/engine information can already be shown and hidden based on active editor state

#### Scenario: Topbar removal preserves status
- **WHEN** `WorkbenchTopBar` is removed
- **THEN** selected node, object count, and engine status remain visible through native StatusBar items and the viewport gains the reclaimed height

### Requirement: Canvas Status Badge Is Removed From Canvas Surface
The system SHALL remove or retire the Canvas lower-left subsystem/projection status badge after native StatusBar projection is active.

#### Scenario: Canvas surface is not obstructed
- **WHEN** the canvas editor is active after migration
- **THEN** subsystem and projection status no longer occupy absolute-positioned drawing surface space in the lower-left canvas area

#### Scenario: Projection status is still available
- **WHEN** projection status changes
- **THEN** the CanvasStatusBar displays the updated projection state or an equivalent compact native item

### Requirement: Model Workbench Panels Are Resizable
The system SHALL make model Right Dock width, Outliner/Properties split, and Timeline height resizable with min/max constraints and persisted Webview state.

#### Scenario: Right Dock width persists
- **WHEN** the user resizes the model Right Dock, leaves the tab, and returns
- **THEN** the Right Dock restores the resized width within min/max bounds

#### Scenario: Timeline height persists
- **WHEN** the user resizes the model Timeline Dock height, leaves the tab, and returns
- **THEN** the Timeline Dock restores the resized height within min/max bounds

### Requirement: Puppet Right Panels Are Resizable
The system SHALL replace the fixed puppet right-panel width with a resizable panel using min/max constraints and persisted Webview state.

#### Scenario: Puppet panel width persists
- **WHEN** the user resizes the puppet right panel between 200px and 400px, leaves the tab, and returns
- **THEN** the panel width is restored and remains clamped to the configured bounds

### Requirement: Cut Preview Controls Collapse Low-frequency Actions
The system SHALL prevent Cut preview controls from overflowing narrow layouts by moving low-frequency actions to an overflow menu and enforcing property panel width bounds.

#### Scenario: Low-frequency preview actions overflow
- **WHEN** the Cut preview control row does not have enough width for all actions
- **THEN** low-frequency actions such as PiP, Screenshot, and FPS are available from an overflow menu instead of squeezing primary playback controls

#### Scenario: Property panel respects bounds
- **WHEN** the Cut property panel is resized
- **THEN** it cannot be dragged below 200px or above the configured maximum width

### Requirement: Layout Edits Respect Design Token Boundary
The system SHALL use existing `--neko-*` tokens and shared icons for new or touched layout code and SHALL NOT introduce new package-specific token prefixes as part of layout migration.

#### Scenario: New layout CSS uses shared tokens
- **WHEN** a migration PR adds or modifies layout styles
- **THEN** the new styles use `--neko-*` or existing VSCode theme variables instead of creating new `--agent-*`, `--model-*`, `--canvas-*`, or other package-specific prefixes

#### Scenario: Full token migration is deferred
- **WHEN** unrelated custom token prefixes remain outside the touched layout code
- **THEN** this change does not require a full-package token rewrite and leaves broad token/icon convergence to the UI design system change
