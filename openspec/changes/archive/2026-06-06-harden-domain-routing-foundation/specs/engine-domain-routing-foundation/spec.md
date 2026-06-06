## MODIFIED Requirements

### Requirement: DomainRouter Is Independent From Runtime Cores
DomainRouter or equivalent Layer 2 routing logic SHALL depend on Intent, capability metadata, and service-port contracts rather than runtime-scene, runtime-puppet, Bevy, or `engine-ecs-core`.

#### Scenario: Router avoids ECS dependencies
- **WHEN** architecture checks inspect the routing implementation
- **THEN** the router does not import runtime-scene, runtime-puppet, Bevy ECS types, or ECS world handles

#### Scenario: Router returns a plan or service port identity
- **WHEN** routing succeeds
- **THEN** the router produces serializable plan data or selects an injected service port identity
- **THEN** it does not execute runtime mutations inside the routing step

#### Scenario: Router failure is explainable
- **WHEN** routing cannot produce a plan
- **THEN** the router returns a serializable failure result with a stable reason
- **THEN** missing intent domain, empty capability sets, capability-filter misses, and domain mismatches are distinguishable

#### Scenario: Full routing policy remains deferred
- **WHEN** engine tools expose normalized domain metadata in this foundation change
- **THEN** the system does not require full Agent-side route selection, Rust `ActionRequest` domain hints, or runtime execution policy to be implemented in the same change
- **THEN** those execution-routing concerns are captured as follow-up work

### Requirement: Domain Taxonomy Is Explicit And Mappable
The system SHALL document the mapping between user-facing operation domains and engine-facing creative domains.

#### Scenario: Model operation maps to scene domain
- **WHEN** a tool uses the existing `model` operation domain for 3D scene editing
- **THEN** the domain routing metadata maps it to the engine scene service domain without changing existing operation adapter names

#### Scenario: Puppet operation maps to puppet domain
- **WHEN** a tool uses the existing `puppet` operation domain
- **THEN** the domain routing metadata maps it to the puppet service domain without requiring the Intent layer to know puppet runtime internals

#### Scenario: Service port identities come from a registry
- **WHEN** operation tools or engine provider tools need known scene, puppet, media, or audio service-port identities
- **THEN** they use shared domain-routing constants or a registry instead of repeating ad hoc string literals
- **THEN** the registry remains serializable metadata and does not expose concrete service objects
