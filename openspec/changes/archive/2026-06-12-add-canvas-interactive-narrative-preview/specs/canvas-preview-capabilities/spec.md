## ADDED Requirements

### Requirement: Narrative Preview remains separate from Canvas lightweight previews
The system SHALL keep immersive interactive narrative playback in a separate Narrative Preview panel. Canvas node previews MUST remain lightweight editor affordances and MUST NOT store or own Narrative Preview runtime state such as current node, history, variable snapshots, active renderer instances, player state, resolved asset URLs, or choice hover state.

#### Scenario: Canvas scene node shows compact preview
- **WHEN** a `narrative-scene` node renders inside Canvas
- **THEN** it displays compact scene metadata such as title, Fountain excerpt, asset availability, or thumbnail preview
- **THEN** it does not mount the full Narrative Preview runtime inside the node card

#### Scenario: Canvas save omits narrative runtime state
- **WHEN** the user saves a `.nkc` document while Narrative Preview is open and mid-playthrough
- **THEN** the saved Canvas data contains stable graph, metadata, and preview descriptors
- **THEN** it does not contain the current playthrough state, runtime renderer handles, or resolved Webview URLs

### Requirement: Narrative scene nodes delegate scene editing to Story
The system SHALL treat `narrative-scene` Canvas nodes as graph nodes that reference standard `.fountain` scene content. Double-click or explicit edit actions MUST delegate scene text editing to the Story/Fountain editor, while Canvas retains branch graph editing and compact preview responsibilities.

#### Scenario: Double-click opens Fountain scene editor
- **WHEN** the user double-clicks a `narrative-scene` node with a `.fountain` scene reference
- **THEN** Canvas asks the Extension Host to open the referenced scene in the Story/Fountain editor
- **THEN** Canvas does not replace that editor with an embedded custom story-language editor

#### Scenario: Missing Fountain reference shows remediation
- **WHEN** a `narrative-scene` node has no scene reference or points to an unavailable `.fountain` file
- **THEN** Canvas shows a bounded missing-scene preview state and creation or relink actions
- **THEN** the node remains part of the graph without inventing `.nks`, `.story`, or `.nkstory` content

### Requirement: Narrative Preview uses Canvas preview descriptors only for editor summaries
The system SHALL allow Canvas card preview descriptors to summarize narrative nodes for containers, minimap-like views, Agent context, and compact node cards. Those descriptors MUST remain independent from the immersive renderer registry used by Narrative Preview.

#### Scenario: Agent extracts narrative node summary
- **WHEN** Agent requests structured content for selected narrative Canvas nodes
- **THEN** extraction can use node summary descriptors containing graph role, scene reference, choice labels, conditions, and ending metadata
- **THEN** it does not require resolved runtime Preview URLs or renderer instances

#### Scenario: Renderer choice does not alter Canvas summary data
- **WHEN** the user switches Narrative Preview from illustrated text to visual novel rendering
- **THEN** Canvas card summaries remain derived from stable node metadata
- **THEN** the renderer selection is kept in Preview state or graph metadata rather than stored as runtime card data
