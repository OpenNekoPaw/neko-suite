## ADDED Requirements

### Requirement: FrameScheduler degradation is applied by production rendering
The system SHALL consume `FrameScheduler` schedule and degradation decisions in the production scene stream or render loop. Degradation steps MUST change active viewport quality, auxiliary viewport work, post-process quality, fps, or resolution rather than remaining as unused advisory data.

#### Scenario: Overload lowers viewport quality
- **WHEN** Engine observes GPU frame time, encode time, or dropped frame samples above the configured budget
- **THEN** production rendering applies the ordered degradation steps and reports the active quality tier

#### Scenario: Control ack path remains protected by runtime state
- **WHEN** viewport rendering is degraded under overload
- **THEN** Engine keeps `/v1/scenes/control` ack processing below its budget and reports ack queue health instead of hardcoding control preservation

### Requirement: Production PBR rendering runs through RenderGraph
The system SHALL execute existing PBR forward, post-process, GPU color convert, and encoder copy work through RenderGraph passes in the production Engine viewport path. RenderGraph pass descriptors MUST be connected to executable pass callbacks or equivalent typed executors.

#### Scenario: PBR viewport frame uses graph execution
- **WHEN** Engine renders a Route A viewport frame
- **THEN** the frame is produced by a compiled RenderGraph that includes PBR forward and the required output passes for that viewport descriptor

#### Scenario: RenderGraph variant controls stream output
- **WHEN** a viewport descriptor changes render mode, debug view, post-process, or output kind
- **THEN** Engine selects or recompiles the corresponding RenderGraph variant and applies it to production rendering

### Requirement: Viewport queries use camera and geometry
The system SHALL implement hit-test, projected bounds, and gizmo anchor queries using viewport-specific camera state and scene geometry or acceleration structures. Query results MUST NOT be derived by simply returning the first pickable snapshot node.

#### Scenario: Hit-test respects click position
- **WHEN** the user clicks empty space in a viewport
- **THEN** hit-test returns no node instead of the first pickable node in the scene snapshot

#### Scenario: Projected bounds use viewport camera
- **WHEN** the same node is queried from perspective and orthographic viewports
- **THEN** projected bounds differ according to each viewport camera and carry the matching viewport id and revision

### Requirement: Multi-viewport streams share simulation and extraction per revision
The system SHALL share simulation tick and Render World extraction for multiple viewports of the same scene revision. Per-viewport rendering MAY differ by camera, resolution, work mode, render target, post-process, and stream descriptor, but MUST use a consistent extracted scene input for the same revision.

#### Scenario: Two viewports share extracted revision
- **WHEN** two viewport streams render the same scene revision
- **THEN** Engine performs simulation/extract once for that revision and renders both viewports from the shared Render World input

### Requirement: Animation export pose source is verified
The system SHALL verify that current-pose export uses Engine-authored playback state and evaluated pose rather than only static animation clip data or Webview R3F animation state.

#### Scenario: Current animation pose exports
- **WHEN** the scene playback state is at clip `walk` time `0.25s` and export requests current pose
- **THEN** the exported transform, skeleton pose, or morph weights match the Engine-evaluated pose for that playback state
