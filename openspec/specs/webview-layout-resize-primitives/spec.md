# webview-layout-resize-primitives Specification

## Purpose
Define the shared Layer 2 Webview resize primitives used by editors that expose draggable layout splits or panel edges.

## Requirements
### Requirement: Shared resize primitives are exposed only from the Layer 2 component surface

The system SHALL provide shared Webview layout resize primitives from `@neko/shared/components` without exporting React-dependent APIs from the `@neko/shared` main entrypoint.

#### Scenario: Webview imports resize primitives

- **WHEN** a Webview package imports `useResizable` or `ResizeHandle` from `@neko/shared/components`
- **THEN** the import resolves through the existing components subpath

#### Scenario: Main shared entrypoint remains host-neutral

- **WHEN** a non-Webview consumer imports from `@neko/shared`
- **THEN** the resize primitives are not exported from the main entrypoint

### Requirement: Resize behavior supports edge-relative pixel and ratio sizing

The system SHALL support pointer-driven resizing with `edge: left | right | top | bottom` and `mode: pixel | ratio`, clamping values to configured bounds in the active unit.

#### Scenario: Right edge pixel resize

- **WHEN** a resize handle is configured with `edge: right`, `mode: pixel`, a container rect, and a pointer move at `clientX`
- **THEN** the computed size is measured from `containerRect.right - clientX` and clamped to the configured pixel bounds

#### Scenario: Top edge ratio resize

- **WHEN** a resize handle is configured with `edge: top`, `mode: ratio`, a container rect, and a pointer move at `clientY`
- **THEN** the computed size is measured as a ratio of `clientY - containerRect.top` over the container height and clamped to the configured ratio bounds

#### Scenario: Custom size calculation

- **WHEN** a caller provides a custom `calculateSize` function
- **THEN** the hook uses the custom calculation result before clamping instead of the built-in edge and mode calculation

### Requirement: Resize behavior supports controlled and uncontrolled ownership

The system SHALL allow resize size ownership to be either external through controlled props or internal through initial state.

#### Scenario: Controlled resize

- **WHEN** a caller provides a controlled size and resize callback
- **THEN** pointer movement emits the next size through the callback without making internal state the source of truth

#### Scenario: Uncontrolled resize

- **WHEN** a caller provides an initial size without a controlled size
- **THEN** pointer movement updates the hook-owned size returned to the caller

### Requirement: Pointer capture lifecycle is robust

The system SHALL manage the resize interaction through Pointer Events with pointer capture, active pointer tracking, idempotent end handling, and cleanup for interruption paths.

#### Scenario: Pointer down starts resize

- **WHEN** the user presses a resize handle with a pointer event
- **THEN** the handle captures the pointer, records the active pointer ID, and marks resizing active

#### Scenario: Stale pointer events are ignored

- **WHEN** `pointermove`, `pointerup`, `pointercancel`, or `lostpointercapture` occurs for a pointer ID that is not active
- **THEN** the resize state and size remain unchanged

#### Scenario: Pointer cancel stops resize

- **WHEN** the active pointer emits `pointercancel`
- **THEN** resizing becomes inactive and subsequent pointer moves do not update size

#### Scenario: Lost pointer capture stops resize

- **WHEN** the active pointer emits `lostpointercapture`
- **THEN** resizing becomes inactive and subsequent pointer moves do not update size

#### Scenario: Duplicate end events are safe

- **WHEN** multiple end events occur for the same resize interaction
- **THEN** the end handling is idempotent and does not throw or emit duplicate final updates

#### Scenario: Unmount during resize cleans up state

- **WHEN** a component using the resize hook unmounts during an active resize
- **THEN** the hook does not leak listeners or update state after unmount

### Requirement: Resize handle remains presentational

The system SHALL provide `ResizeHandle` as a thin component that renders a handle element from hook-provided props while leaving size calculation and domain layout to callers.

#### Scenario: Consumer keeps local styling

- **WHEN** a caller passes class names for width, height, color, hover, or border styling to `ResizeHandle`
- **THEN** the component applies those classes without replacing them with domain-specific layout styles

#### Scenario: Consumer bypasses ResizeHandle

- **WHEN** a caller spreads hook-provided handle props onto its own element instead of using `ResizeHandle`
- **THEN** the resize behavior remains available

### Requirement: P0 accessibility exposes static separator semantics only

The system SHALL expose P0 resize handles as static separators with orientation metadata and SHALL NOT advertise keyboard-adjustable value semantics until keyboard resizing is implemented.

#### Scenario: Horizontal split handle accessibility

- **WHEN** a handle separates top and bottom regions
- **THEN** the handle exposes `role="separator"` and `aria-orientation="horizontal"` without `tabIndex` or `aria-valuenow`

#### Scenario: Vertical split handle accessibility

- **WHEN** a handle separates left and right regions
- **THEN** the handle exposes `role="separator"` and `aria-orientation="vertical"` without `tabIndex` or `aria-valuenow`

### Requirement: Existing editor behavior is preserved during migration

The system SHALL migrate `neko-cut` and `neko-sketch` to the shared primitives without changing their visible layout, min/max constraints, or store-owned state semantics.

#### Scenario: neko-cut vertical split keeps ratio bounds

- **WHEN** the `neko-cut` preview/timeline split is migrated
- **THEN** it preserves the existing preview ratio behavior and the 0.2 to 0.8 bounds

#### Scenario: neko-cut property panel keeps store ownership

- **WHEN** the `neko-cut` property panel resize is migrated
- **THEN** the property panel width remains owned by the existing editor store action

#### Scenario: neko-sketch sidebar keeps store ownership

- **WHEN** the `neko-sketch` right sidebar resize is migrated
- **THEN** the sidebar width remains owned by the existing sketch store action
