## ADDED Requirements

### Requirement: Narrative scenes bind to storyboard and video production artifacts
Canvas narrative scene metadata SHALL support durable production bindings to storyboard scenes, storyboard shots, Canvas scene/shot nodes, Cut clips, generated video assets, or media assets. These bindings MUST supplement existing Fountain `sceneRef` behavior and MUST NOT replace Canvas narrative graph topology.

#### Scenario: Interactive-film node references generated clip
- **WHEN** a `narrative-scene` represents an interactive-film segment produced from storyboard shots
- **THEN** its metadata can reference the source storyboard shot IDs and the generated video asset or Cut clip through durable production refs
- **THEN** Narrative Preview can resolve playable media through existing asset/content access boundaries

#### Scenario: Fountain scene reference still works
- **WHEN** a `narrative-scene` only has the existing Fountain `sceneRef`
- **THEN** narrative traversal, preview, and export continue to work as before
- **THEN** production bindings are optional

### Requirement: Narrative graph remains the branching SSOT
The system SHALL keep branching structure, choice labels, conditions, priorities, variables, entry nodes, and ending nodes authoritative in Canvas narrative nodes, connections, and metadata. StoryboardTable, AnimationPlan, Cut timelines, and generated media refs MUST NOT override narrative graph traversal.

#### Scenario: Storyboard binding does not define branch
- **WHEN** a `narrative-scene` binds to storyboard shot IDs that have linear storyboard order
- **THEN** Narrative Preview follows Canvas narrative connections and choice rules
- **THEN** it does not infer branches from StoryboardTable shot order

#### Scenario: Cut clip binding does not define condition
- **WHEN** a narrative choice transition leads to a scene bound to a Cut clip
- **THEN** the transition condition is still read from Canvas connection or playback metadata
- **THEN** the Cut clip metadata does not become the condition authority

### Requirement: Narrative production bindings use durable refs
Narrative production bindings SHALL use durable project, resource, storyboard, Canvas node, Cut clip, generated asset, or media asset references. They MUST NOT persist Webview URIs, blob URLs, object URLs, engine tokens, localhost runtime URLs, or absolute local paths.

#### Scenario: Binding resolves through host boundary
- **WHEN** Narrative Preview needs to play a bound generated video asset
- **THEN** it resolves the durable binding through injected content access or asset resolvers
- **THEN** the persisted `.nkc` graph stores only durable refs

#### Scenario: Unsafe binding is diagnosed
- **WHEN** a production binding contains a Webview URI or blob URL as its only media location
- **THEN** validation reports a non-durable production binding diagnostic
- **THEN** export does not package that runtime-only URL as source media

### Requirement: Agent can derive narrative bindings without owning Canvas graph state
Agent SHALL be able to propose or apply narrative production bindings from StoryboardTable, AnimationPlan overlays, generated assets, or Cut summaries through typed Canvas operations. Agent MUST NOT bypass Canvas narrative commands or directly mutate Canvas Webview state.

#### Scenario: Agent links generated shot to narrative scene
- **WHEN** Agent finishes generating a video segment for a storyboard shot that corresponds to a narrative scene
- **THEN** it can request a typed Canvas update that adds or refreshes a production binding on the target `narrative-scene`
- **THEN** Canvas remains the owner of the narrative graph document and validation

#### Scenario: Missing target narrative node is reported
- **WHEN** Agent attempts to bind a video segment to a narrative node ID that is absent from the active Canvas
- **THEN** the Canvas operation returns a typed diagnostic
- **THEN** Agent does not create an unvalidated hidden graph edge or mutate raw `.nkc` content directly

### Requirement: Preview and export consume production bindings consistently
Narrative Preview and interactive export SHALL consume production bindings through the same host-independent runtime semantics used for existing narrative assets. Preview and export MUST differ only by resolver intent and host adapter, not by graph traversal behavior.

#### Scenario: Preview plays interactive-film segment
- **WHEN** a narrative scene has a primary generated-video production binding and the graph genre is `interactive-film` or `hybrid`
- **THEN** Preview can render or play that segment as the scene content before presenting eligible choices
- **THEN** graph traversal remains controlled by narrative runtime state

#### Scenario: Export packages bound media
- **WHEN** the user exports an interactive narrative with production-bound video segments
- **THEN** export resolves those durable refs with package or final-export intent
- **THEN** the exported runtime follows the same graph choices and conditions as Preview
