## ADDED Requirements

### Requirement: Durable Cut authoring requires an explicit project target
Every durable Cut authoring operation SHALL carry a `NekoProjectAuthoringTarget` with either `{ kind: 'file', documentUri }` for an existing `.nkv` or `{ kind: 'new', documentUri }` for an explicitly requested new `.nkv`. Cut MUST reject missing, implicit, `active`, non-file, or non-`.nkv` durable targets.

#### Scenario: Existing Cut project is targeted
- **WHEN** an Agent, TUI, Canvas handoff, command, or package API requests a mutation with a valid file target
- **THEN** Cut mutates only the identified `.nkv` through `CutProjectAuthoringService`
- **THEN** the result returns the same document identity and resulting project revision

#### Scenario: Durable request supplies active target
- **WHEN** a durable Cut authoring request uses `kind: 'active'` or omits document URI
- **THEN** Cut returns an invalid/missing authoring-target diagnostic
- **THEN** it does not inspect the active editor or recent files

### Requirement: New Cut projects require explicit create intent and destination
Creating an `.nkv` SHALL require a create-new target with a durable destination and an invocation that explicitly requests project creation. Importing or generating media alone MUST NOT create a Cut project.

#### Scenario: Creator requests a new edit
- **WHEN** the creator explicitly requests a new Cut project and supplies or confirms a valid `.nkv` destination
- **THEN** Cut creates that project and applies the requested initial authoring operation
- **THEN** no additional `.nkv` is created

#### Scenario: Media generation completes without Cut intent
- **WHEN** a media task completes without an explicit Cut file/new target
- **THEN** the result remains a generated output and may be projected to the Workspace Board
- **THEN** no `.nkv` is selected, created, or modified

### Requirement: Interactive Cut context becomes explicit before crossing boundaries
A Cut editor MAY perform interactive operations against its own instance-bound document model. Before an operation crosses to Agent, Tool, Canvas handoff, TUI, background Task, or package API, the adapter SHALL materialize that editor's stable `.nkv` document URI in the durable authoring request.

#### Scenario: Add generated clip from an open Cut editor
- **WHEN** the creator invokes Add to Timeline from a Cut editor bound to `edit.nkv`
- **THEN** the adapter sends `edit.nkv` as an explicit file target before asynchronous work starts
- **THEN** later editor focus changes cannot retarget the completion

### Requirement: Async Cut mutations freeze identity and validate owner revision
Asynchronous or stale-read-based Cut authoring SHALL freeze target document identity at submission and SHALL validate the applicable owner-specific project revision/digest before mutation. A mismatch MUST fail visibly and MUST NOT retarget or overwrite.

#### Scenario: User switches timelines during generation
- **WHEN** a clip generation completes after the creator focuses another `.nkv`
- **THEN** Cut applies only to the frozen target if its revision precondition remains valid
- **THEN** it does not mutate the newly active timeline

#### Scenario: Target timeline changed incompatibly
- **WHEN** the frozen target revision no longer satisfies the mutation precondition
- **THEN** Cut returns a stale/conflict diagnostic
- **THEN** generated media remains recoverable and no other `.nkv` is modified

### Requirement: Cut target selection never guesses among projects
Cut, Agent, and Host adapters MUST NOT select a durable `.nkv` by active/recent file, directory uniqueness, filename similarity, conversation binding, model inference, or default project creation.

#### Scenario: Workspace contains one Cut project
- **WHEN** a durable mutation request omits its target in a workspace containing exactly one `.nkv`
- **THEN** the request fails with a missing-target diagnostic
- **THEN** the unique file is not treated as implied consent

### Requirement: Cut authoring uses generic approval policy
Cut mutations and project creation SHALL use the existing Tool approval and owning capability policy. Agent core MUST NOT add Cut-specific approval state, plan authorization, or timeline routing state.

#### Scenario: Agent proposes adding a clip
- **WHEN** an Agent turn requests a consequential Cut mutation with an explicit target
- **THEN** the normal Tool/owner policy determines approval before `CutProjectAuthoringService` executes
- **THEN** no prior Board projection or plan review bypasses that approval
