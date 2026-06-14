## ADDED Requirements

### Requirement: Storyboard tables remain creative shot content sources
The system SHALL keep StoryboardTable focused on creative shot content: scene and shot identity, visual description, character participation, dialogue, voice-over, sound cues, timing intent, style, and durable media references. StoryboardTable MUST NOT become the authority for provider-specific generation parameters, branching graph topology, async task progress, or one-off execution attempts.

#### Scenario: Animation overlay does not duplicate story fields
- **WHEN** Agent derives an AnimationPlan from a valid StoryboardTable
- **THEN** the StoryboardTable remains the source for scene order, shot order, dialogue, character participation, and source media refs
- **THEN** the AnimationPlan stores only shot-level execution intent and references storyboard shots by stable IDs

#### Scenario: Runtime generation state is external
- **WHEN** a video generation task for a storyboard shot changes from queued to running
- **THEN** StoryboardTable validation and persisted creative fields remain unchanged
- **THEN** task state is obtained from Agent async task or execution summary data

### Requirement: Storyboard tables can be rendered with execution overlays
The Agent Webview SHALL be able to render StoryboardTable together with compatible execution overlays as an enhanced storyboard view. Overlay rendering MUST be derived by stable storyboard and shot identity rather than by duplicating storyboard rows.

#### Scenario: Compatible overlay enriches storyboard row
- **WHEN** a StoryboardTable row has `shotId: "scene-1-shot-2"` and an AnimationPlan overlay includes the same `shotId`
- **THEN** the row can display animation and generation intent fields from the overlay
- **THEN** the row still obtains creative shot facts from StoryboardTable

#### Scenario: Orphan overlay is visible but not applied
- **WHEN** an AnimationPlan overlay references a shot ID that does not exist in the rendered StoryboardTable
- **THEN** the Webview shows an overlay diagnostic
- **THEN** it does not attach the overlay to a storyboard row by approximate title, shot number, or row position

### Requirement: Storyboard tables expose interaction summaries without owning interaction graphs
The system SHALL support exposing or rendering summaries of associated interactive narrative bindings alongside StoryboardTable rows, but Canvas narrative MUST remain the authority for branching nodes, choice labels, conditions, variables, and traversal order.

#### Scenario: Storyboard shows linked choice summary
- **WHEN** a storyboard shot is associated with a Canvas narrative choice point
- **THEN** the storyboard view may show a summary such as linked narrative node ID, branch count, and target shot or scene labels
- **THEN** branch conditions and variables remain owned by Canvas narrative graph metadata and connections

#### Scenario: Storyboard projection does not create narrative variables
- **WHEN** a StoryboardTable is projected to Canvas
- **THEN** the projection may create or update SceneGroupNode and ShotNode structures
- **THEN** it does not create narrative variables, choice nodes, or branch conditions unless a separate narrative graph import or Agent action explicitly requests that capability
