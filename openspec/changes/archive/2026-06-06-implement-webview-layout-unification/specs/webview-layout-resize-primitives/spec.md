## ADDED Requirements

### Requirement: Resize State Persists In Webview State
The system SHALL provide a persisted resize-state helper for Webview layout panels that stores panel size and collapsed state through Webview `getState` / `setState` without writing project files, workspace settings, or absolute paths.

#### Scenario: Resize state survives Webview tab switch
- **WHEN** a Webview panel uses the persisted resize helper and the user resizes the panel before switching away and back
- **THEN** the panel restores the last persisted size from Webview state

#### Scenario: Invalid persisted size is clamped
- **WHEN** persisted state contains a size outside the configured min/max bounds
- **THEN** the helper returns a size clamped to the configured bounds

#### Scenario: Collapsed state persists
- **WHEN** a resizable panel supports collapse and the user collapses it
- **THEN** the helper persists and restores the collapsed state for the panel id

#### Scenario: Persistence is scoped by panel id
- **WHEN** two panels in the same Webview use different panel ids
- **THEN** resizing one panel does not overwrite or restore the other panel's state

### Requirement: Persisted Resize Composes With Existing Resize Primitives
The system SHALL layer resize persistence on top of existing `useResizable` and `ResizeHandle` behavior without changing pointer capture, controlled/uncontrolled ownership, or separator accessibility semantics.

#### Scenario: Controlled panel remains controlled
- **WHEN** a domain panel owns size through store state and uses the persisted resize helper
- **THEN** pointer movement still emits size changes through the existing controlled callback and persistence follows the committed size

#### Scenario: Pointer lifecycle is unchanged
- **WHEN** a persisted panel is resized with pointer down, pointer move, pointer cancel, pointer up, or lost pointer capture
- **THEN** the behavior remains consistent with the existing shared resize primitive requirements

#### Scenario: Accessibility remains static in P0
- **WHEN** a persisted resize handle renders
- **THEN** it keeps the existing static separator semantics and does not advertise keyboard-adjustable value semantics unless keyboard resizing is implemented
