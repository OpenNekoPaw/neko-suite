# engine-domain-routing-foundation Specification

## Purpose
TBD - created by archiving change implement-2d3d-unified-engine-foundation. Update Purpose after archive.
## Requirements
### Requirement: Domain Tags Are Orchestration Metadata
The system SHALL represent creative engine domains as serializable metadata consumed by orchestration, not as direct runtime implementation knowledge in the Intent layer.

#### Scenario: Intent carries domain as data
- **WHEN** an IntentDescriptor includes a domain value
- **THEN** the value describes the creative domain of the requested work
- **THEN** it does not name a concrete runtime service or ECS world implementation

#### Scenario: Orchestration consumes domain
- **WHEN** orchestration receives an IntentDescriptor with a domain value
- **THEN** DomainRouter or equivalent orchestration logic uses that value with capability metadata to choose a service port or execution plan

### Requirement: Tool Definitions Expose A Unified Domain Projection
The system SHALL provide a normalized domain projection for LLM-facing tool definitions and operation tools.

#### Scenario: Operation adapter domain is projected
- **WHEN** an operation tool adapter declares an existing operation domain such as `model`, `puppet`, or `sketch`
- **THEN** the LLM-facing tool projection can include an equivalent normalized domain value

#### Scenario: Non-operation tool can declare domain
- **WHEN** a non-operation tool contributes a creative engine capability
- **THEN** it can declare the same normalized domain metadata without depending on operation adapter internals

#### Scenario: Engine provider tools declare domains
- **WHEN** the engine `AgentCapabilityProvider` registers tools whose creative domain is known
- **THEN** those tools include normalized `CreativeDomainMetadata`
- **THEN** the metadata identifies the creative domain and stable service-port identity without exposing concrete service objects

#### Scenario: Scene and puppet tools are registered
- **WHEN** engine scene and puppet capabilities are exposed to the Agent tool registry
- **THEN** scene tools use the `scene` creative domain
- **THEN** puppet tools use the `puppet` creative domain

#### Scenario: Tool projection remains serializable
- **WHEN** a tool definition is sent to an LLM provider or policy layer
- **THEN** the domain projection is serializable metadata
- **THEN** it does not include closures, runtime service objects, or ECS entity references

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
