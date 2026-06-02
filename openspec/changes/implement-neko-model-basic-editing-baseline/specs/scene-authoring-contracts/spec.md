## ADDED Requirements

### Requirement: Baseline Object Transform Commands Are Reliable
Scene authoring contracts SHALL support reliable Transform editing for ordinary scene nodes. Transform commands MUST use the standard scene command envelope, MUST be acknowledged or rejected by Engine, and MUST reconcile Webview state through SceneDelta, snapshot, or compatible render metadata.

#### Scenario: Ordinary node transform applies
- **WHEN** Webview sends a Transform command for an ordinary mesh node with a compatible base revision
- **THEN** Engine applies or rejects the command through the scene command acknowledgement path
- **THEN** Webview updates committed Transform state only after acknowledgement and compatible scene reconciliation

#### Scenario: Transform rejection preserves previous state
- **WHEN** Engine rejects a Transform command because of stale revision or invalid target
- **THEN** Webview restores the last acknowledged Transform state and shows the structured rejection diagnostic

### Requirement: Baseline Hot Updates Are Distinct From Reliable Commits
Scene authoring contracts SHALL distinguish high-frequency hot updates from reliable authoring commits. Camera, drag, light-position, transform-drag preview, and continuous slider updates MAY use latest-only, no-ack messages for responsiveness, while commit operations MUST still reconcile through acknowledgement, SceneDelta, snapshot, or compatible frame metadata.

#### Scenario: Drag preview is latest-only
- **WHEN** Webview sends a high-frequency drag preview update
- **THEN** Engine may apply only the latest update and omit per-frame acknowledgement
- **THEN** Webview keeps the preview non-authoritative until a commit, SceneDelta, snapshot, or compatible frame metadata confirms the final state

#### Scenario: Commit remains reliable
- **WHEN** the user completes a transform drag or light-position edit
- **THEN** Webview sends a reliable commit command when the edit changes authoring state
- **THEN** Engine acknowledges or rejects the commit with structured diagnostics

### Requirement: Baseline Scene Commands Produce User-visible Diagnostics
Scene authoring command handling SHALL return structured diagnostics for baseline command failures, including unsupported capability, invalid target, stale revision, missing selection, asset incompatibility, and resource loading failure. Diagnostics MUST be machine-readable enough for Webview to map them to localized disabled or degraded reasons.

#### Scenario: Unsupported light command returns diagnostic
- **WHEN** Webview sends a baseline light command to an Engine that does not support authored lights
- **THEN** Engine rejects the command with an unsupported-capability diagnostic
- **THEN** Webview can disable or degrade the related Light control with a localized reason

#### Scenario: Invalid target returns diagnostic
- **WHEN** Webview sends a Transform or visibility command for a missing node id
- **THEN** Engine rejects the command with an invalid-target diagnostic
- **THEN** Webview keeps its mirrored scene state consistent with the last acknowledged snapshot or delta

### Requirement: Baseline Light And Background State Participate In Scene Revisions
Authored lights and background or environment state used by baseline editing SHALL participate in scene revisions, snapshots, deltas, stream rendering, and capture rendering when the Engine advertises support.

#### Scenario: Added light appears in snapshot
- **WHEN** the user adds an authored light through a scene command
- **THEN** Engine creates a light node or light component at a new scene revision
- **THEN** a subsequent SceneDelta or SceneSnapshot exposes the light so Outliner and Inspector can reconcile it

#### Scenario: Background state changes render output
- **WHEN** the user changes baseline background color or clears environment state
- **THEN** Engine applies the scene state change at a new revision
- **THEN** stream or capture rendering reflects the acknowledged background state

### Requirement: Baseline Selection Mirrors Ordinary Scene Nodes
Scene authoring state SHALL expose ordinary scene nodes and available material targets in snapshots or queries so Object and Inspect workflows can operate without semantic character region data.

#### Scenario: Snapshot exposes ordinary nodes
- **WHEN** Engine loads an ordinary GLB or VRM with mesh nodes
- **THEN** SceneSnapshot contains stable node identifiers, transforms, visibility, names where available, and enough hierarchy data for Outliner selection

#### Scenario: Material data is inspectable when available
- **WHEN** Engine can identify material slots for an ordinary mesh
- **THEN** snapshot or query data exposes material slot identities and supported material properties for read-only Inspect or editable material panels according to capability
