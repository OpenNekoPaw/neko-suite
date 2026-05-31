## ADDED Requirements

### Requirement: Model LookDev Controls Use Engine Render Modes
The Neko Model Webview SHALL provide LookDev controls for Engine-backed render modes including PBR, Clay, Wireframe, Normal, Depth, and Light Complexity. The controls MUST update authoritative visual output through Engine viewport descriptors or viewport settings commands and MUST NOT render an alternate Webview-local 3D model scene.

#### Scenario: User switches to wireframe mode
- **WHEN** the user selects Wireframe in the Neko Model LookDev controls
- **THEN** Webview requests an Engine viewport render mode change
- **THEN** the visible model remains the decoded Engine stream rather than a Webview-rendered mesh

#### Scenario: Clay is shown as lookdev state
- **WHEN** the user selects Clay mode
- **THEN** the UI labels the state as a LookDev render mode
- **THEN** no material slot or asset material parameter is changed solely because Clay is active

### Requirement: Stream Restart LookDev Switching Has Explicit UX State
When LookDev switching requires restarting the Engine stream, the Webview SHALL keep the previous confirmed frame visible, track requested/pending/applied/failed render modes, and reconcile the UI through stream descriptor acknowledgement or compatible frame metadata.

#### Scenario: Restart keeps last frame
- **WHEN** the user changes render mode and the stream is reconnecting
- **THEN** the Webview keeps the last confirmed frame visible instead of clearing the viewport to blank

#### Scenario: Slow restart shows retry state
- **WHEN** a render mode switch does not receive a compatible first frame within the configured retry budget
- **THEN** the UI shows a retry or cancel affordance while preserving the last confirmed mode and selection state

#### Scenario: Failed restart rolls back mode
- **WHEN** the Engine stream fails to restart for the requested render mode
- **THEN** the Webview restores the last confirmed render mode in UI state and keeps selection/overlay state compatible with the previous frame

### Requirement: Light Authoring Controls Compile To Scene Commands
The Neko Model Webview SHALL expose light authoring controls for adding, deleting, selecting, transforming, toggling, and editing light properties. These controls MUST compile to Engine scene commands and MUST NOT persist authored light facts only in Webview state.

#### Scenario: Add point light
- **WHEN** the user creates a point light from the Light tool
- **THEN** Webview sends a reliable `node-add` scene command with `kind='light'`, light data, transform data, and base revision
- **THEN** the light appears in Outliner only after Engine acknowledgement, delta, or snapshot reconciliation

#### Scenario: Edit light intensity
- **WHEN** the user changes a selected light's intensity in the Light inspector
- **THEN** Webview sends a `light-update` scene command
- **THEN** the committed inspector value reflects the Engine-acknowledged scene revision

#### Scenario: Delete light uses safe remove
- **WHEN** the user deletes a light from the Inspector or Outliner
- **THEN** Webview sends `node-remove` with default `cascade=false`
- **THEN** the UI shows Engine rejection diagnostics instead of removing the light locally if the node cannot be safely removed

### Requirement: Environment Controls Compile To Engine Environment Commands
The Neko Model Webview SHALL expose environment/background controls for background color, LDR panorama, environment mode, rotation, intensity, exposure, background visibility, and clearing. These controls MUST send Engine environment commands using Engine file access tokens or asset handles for sources.

#### Scenario: Select panorama environment
- **WHEN** the user selects an environment panorama through the Model UI or `neko.model.useEnvironment`
- **THEN** Extension Host obtains or references an Engine-readable file token or asset handle
- **THEN** Webview or Extension sends an Engine-backed `environment-set` command rather than storing only `EnvironmentPlacement` in Webview state

#### Scenario: Environment loading is pending
- **WHEN** Engine reports that environment loading is pending
- **THEN** the UI keeps the previous environment or default background visible and shows a pending environment state

#### Scenario: Environment load fails
- **WHEN** Engine rejects or times out environment loading
- **THEN** the UI shows a structured diagnostic and allows the user to clear or retry without corrupting scene environment state

### Requirement: Selection Mode Controls Request Typed Picking
The Neko Model Webview SHALL provide selection modes that request typed Engine picking candidates according to the active workflow. Selection mode masks MUST include Object, Face Region, Bone/Pose, Light, Animation, and Export/Inspect workflows.

#### Scenario: Object mode prefers mesh structure
- **WHEN** Object selection mode is active and the user clicks a mesh
- **THEN** Webview requests typed picking candidates that can include node, submesh, and materialSlot targets
- **THEN** the Inspector opens the appropriate Transform or Material view based on the selected target

#### Scenario: Light mode selects authored lights
- **WHEN** Light selection mode is active and the user clicks a light helper or light node
- **THEN** Webview requests light/node candidates and opens the Light inspector for the acknowledged selection

#### Scenario: Export inspect mode is read-only
- **WHEN** Export/Inspect selection mode is active
- **THEN** Webview may select node, materialSlot, or environment targets for diagnostics
- **THEN** the Inspector does not issue destructive scene commands unless the user switches to an editing mode

### Requirement: Model LookDev UI Preserves Workbench Shell Responsibilities
Neko Model LookDev UI SHALL use the existing Workbench Shell responsibilities: left toolbar for tools, viewport HUD for compact mode controls, right Dock for Outliner/Properties, and StatusBar for passive state. It MUST NOT restore a generic horizontal viewport toolbar or place long-lived scene truth in transient local UI controls.

#### Scenario: LookDev controls use HUD or inspector
- **WHEN** LookDev controls are rendered in Neko Model
- **THEN** they appear in viewport HUD, left toolbar, right Dock, or StatusBar according to Workbench Shell responsibilities
- **THEN** no removed generic top viewport toolbar is restored for this feature

#### Scenario: StatusBar reflects passive state
- **WHEN** a LookDev mode or selection target is applied by Engine
- **THEN** Model status projection may show passive render mode, selected target, revision, or pending-command state without becoming the source of truth
