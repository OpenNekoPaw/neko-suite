## ADDED Requirements

### Requirement: Runtime directory has explicit ownership
The Agent runtime directory SHALL contain only host-neutral Agent runtime ownership code: long-lived session/conversation runtime management, runtime session bootstrap/projection, per-turn orchestration, runner ports, Agent capability consumption/binding, and runtime stream state.

#### Scenario: Runtime-owned file is added
- **WHEN** a new file is added under `packages/neko-agent/packages/agent/src/runtime`
- **THEN** the file MUST match one documented runtime-owned category
- **AND** the file MUST remain independent of VSCode, React, Webview, and Extension modules

#### Scenario: Non-runtime owner already exists
- **WHEN** a new concern has an existing owner directory such as `session`, `context`, `memory`, `artifact`, `workspace`, `prompt`, `skill`, `permission`, `plan`, `task`, or `commands`
- **THEN** the implementation MUST place the concern in that owner directory instead of the runtime root

### Requirement: Runtime root rejects presenter projector service and store drift
The Agent runtime root SHALL NOT become a generic bucket for presenters, projectors, services, stores, or concrete domain adapters when those concerns have clearer owners.

#### Scenario: Presenter is proposed under runtime root
- **WHEN** a file matching a host or Webview presenter role is introduced under the runtime root
- **THEN** architecture validation MUST fail unless the file is an explicitly documented transitional exception

#### Scenario: Projector or persistence service is proposed under runtime root
- **WHEN** a file matching a resource projector, artifact store, workspace store, or broad service role is introduced under the runtime root
- **THEN** architecture validation MUST fail unless the file is an explicitly documented transitional exception

#### Scenario: Concrete domain adapter is proposed under Agent runtime
- **WHEN** a concrete Canvas, Cut, Model, Sketch, Puppet, Story, Audio, or Engine operation adapter is introduced under Agent runtime
- **THEN** architecture validation MUST fail

### Requirement: Runtime subdirectories are narrow and documented
Agent runtime subdirectories SHALL be limited to documented Agent-runtime-owned subdomains. New subdirectories MUST be introduced only when an existing owner directory does not already own the concern.

#### Scenario: Runner code is organized
- **WHEN** runner port or session-runner code is moved out of the runtime root
- **THEN** it SHALL live under a documented runner runtime subdomain or an equivalent documented owner
- **AND** it SHALL continue to expose execution, cancel, confirmation, queue, history, and runtime event contracts without owning per-turn provider selection

#### Scenario: Turn code is organized
- **WHEN** turn orchestration code is moved out of the runtime root
- **THEN** it SHALL live under a documented turn runtime subdomain or an equivalent documented message/turn owner
- **AND** it SHALL own per-message provider/model selection, context packet assembly, runner configuration, stream processing, and assistant message persistence

#### Scenario: ReAct code is evaluated
- **WHEN** executor ReAct loop code is considered for runtime placement
- **THEN** it MUST remain under the executor owner unless a design update proves the executor no longer owns think-act-observe semantics

### Requirement: Session context and memory remain distinct
Agent session, context, and memory SHALL remain distinct ownership concepts in code placement and documentation.

#### Scenario: Session collaborator is added
- **WHEN** a collaborator owns one configured conversation execution object, live executor collaborators, journal/event bus wiring, prompt facade, validation bridge, or Skill projection
- **THEN** it SHALL be placed under `session` or a documented runtime session bootstrap subdomain according to whether it is the session owner or host-neutral session factory/bootstrap code

#### Scenario: Context budget logic is added
- **WHEN** a collaborator owns token budgets, context layers, compression, summarization, auto-compact, or model-input working set management
- **THEN** it SHALL be placed under `context` instead of `runtime` or `memory`

#### Scenario: Durable memory logic is added
- **WHEN** a collaborator owns persisted project facts, memory file loading/writing, memory recall, or shared scratch memory
- **THEN** it SHALL be placed under `memory` instead of `runtime` or `context`

### Requirement: Agent capability runtime consumes shared provider contracts
Agent capability runtime SHALL consume Agent-facing capability providers and project their contributions into Agent registries. It MUST NOT claim ownership of generic monorepo capability concepts or concrete domain provider implementations.

#### Scenario: Domain package contributes Agent capabilities
- **WHEN** a domain package contributes Agent tools, skills, tool groups, prompt fragments, provider cards, artifact facets, lifecycle descriptors, or reference contributors
- **THEN** the shared `AgentCapabilityProvider` contract SHALL remain the cross-package protocol
- **AND** the concrete provider implementation SHALL remain in the contributing package

#### Scenario: Agent runtime binds provider contributions
- **WHEN** Agent runtime registers or refreshes provider contributions for a session
- **THEN** it MAY own host-neutral registry, binding, refresh, and projection code
- **AND** it MUST NOT import concrete domain extension internals

#### Scenario: Non-Agent capability is encountered
- **WHEN** a capability concept belongs to market, Engine/device, model UI control, asset federation, effect rendering, or another non-Agent subsystem
- **THEN** it MUST NOT be moved into Agent runtime merely because it is named capability

### Requirement: Runtime bootstrap planes do not become governance
Runtime bootstrap planes SHALL remain projection conveniences for session creation. Lifecycle governance, prompt composition, permission policy, tool policy, and activation progress MUST remain in their specific owner modules.

#### Scenario: Prompt composition behavior is added
- **WHEN** a change adds prompt section composition, prompt module orchestration, PromptLayer ordering, or prompt file loading
- **THEN** the behavior SHALL be owned by `prompt` or the session prompt facade
- **AND** it MUST NOT be added to a generic runtime governance plane

#### Scenario: Skill lifecycle behavior is added
- **WHEN** a change adds Skill activation, lifecycle records, projection, stage persona binding, or Skill runtime bootstrap behavior
- **THEN** the behavior SHALL remain under `skill` or the specific session adapter that consumes Skill projection
- **AND** it MUST NOT be moved into generic runtime lifecycle governance

#### Scenario: Permission or tool policy behavior is added
- **WHEN** a change adds permission decisions, tool trait evaluation, ToolGuard policy, or approval strategy behavior
- **THEN** the behavior SHALL remain under `permission`, `approval`, `tools`, or `skill` according to the enforcing owner
- **AND** runtime bootstrap MAY only thread stable ports into session configuration

### Requirement: Migration preserves behavior with visible transitional exports
Runtime boundary normalization SHALL preserve public package behavior while making transitional compatibility visible and removable.

#### Scenario: File move changes import paths
- **WHEN** a runtime file is moved to an owner directory or runtime subdirectory
- **THEN** package exports and internal imports SHALL be updated
- **AND** any transitional re-export MUST be documented in tasks or implementation notes with a removal condition

#### Scenario: Boundary migration is validated
- **WHEN** a migration slice completes
- **THEN** focused Agent tests, architecture-boundary tests, and TypeScript/package checks MUST prove the canonical owner path works
- **AND** validation MUST NOT rely solely on final behavior while old misplaced paths can still return success
