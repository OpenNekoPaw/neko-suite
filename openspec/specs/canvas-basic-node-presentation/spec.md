# canvas-basic-node-presentation Specification

## Purpose

Define the low-chrome presentation and contextual interaction contract for foundational Canvas content without introducing a second project schema or renderer registry.

## Requirements

### Requirement: Foundational nodes use low-chrome presentation

Canvas SHALL render foundational file/reference, Markdown/text, script, image, audio, and video nodes as a name plus content without a persistent outer card border, shadow, footer action strip, or decorative header chrome. Content-specific readable surfaces MAY retain their own bounds.

#### Scenario: Creator views foundational content

- **WHEN** a foundational node is idle on the Canvas
- **THEN** Canvas MUST show its name and content without the global structured-node card frame

#### Scenario: Creator views a structured node

- **WHEN** Canvas contains a professional Storyboard, Scene/Shot, Gallery, Timeline, Workflow, Agent/Tool, or typed-port node
- **THEN** Canvas MUST keep that node's owning structured renderer and MUST NOT force low-chrome presentation merely because the right dock is Basic

### Requirement: Low-chrome nodes preserve explicit interaction states

Foundational presentation SHALL provide distinguishable hover, selected, keyboard-focus, editing, loading, missing, locked, and error states. Selection or focus MUST NOT be conveyed only by color or by the presence of a contextual toolbar.

#### Scenario: Node receives keyboard focus

- **WHEN** a creator navigates to a foundational node with the keyboard
- **THEN** Canvas MUST show a visible focus indicator and expose the same actions available to pointer users

#### Scenario: Node content is unavailable

- **WHEN** a foundational node cannot resolve its durable content or runtime preview
- **THEN** Canvas MUST show a named unavailable/error state with an actionable diagnostic rather than an empty borderless region

### Requirement: Selection exposes contextual actions through the canonical dispatcher

Canvas SHALL project type-appropriate actions for the current selection into a screen-space contextual toolbar and overflow menu using the canonical node/container action policy and dispatcher. The toolbar MUST remain a stable visual size across Canvas zoom and MUST stay reachable within the viewport.

#### Scenario: Creator selects one image node

- **WHEN** one foundational image node is selected
- **THEN** Canvas MUST show only the applicable priority actions and provide remaining canonical actions through the overflow menu without duplicating their handlers

#### Scenario: Creator selects several nodes

- **WHEN** multiple nodes are selected
- **THEN** Canvas MUST show a batch toolbar for valid common actions and MUST retain a visible selection boundary for every selected node

#### Scenario: Creator edits a node

- **WHEN** a creator double-clicks editable content or invokes Edit from the toolbar
- **THEN** Canvas MUST enter the owning editor while a first click continues to mean selection rather than immediate editing

### Requirement: Foundational presentation does not alter project semantics

Low-chrome rendering SHALL be derived from existing node/subsystem descriptors and MUST NOT add a persisted Basic profile, new node type, alternate renderer registry, or `.nkc` schema branch.

#### Scenario: Canvas is saved and reopened

- **WHEN** a Canvas containing foundational low-chrome nodes is saved and reopened
- **THEN** node identity and project data MUST remain ordinary `.nkc` facts with no presentation-only Basic field
