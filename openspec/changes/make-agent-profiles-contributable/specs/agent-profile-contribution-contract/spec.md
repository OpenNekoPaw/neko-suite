## ADDED Requirements

### Requirement: Profiles are first-class Agent capability contributions
The system SHALL support Agent profile descriptors as first-class capability contributions for artifact, creation, and provider/model expression profile kinds.

#### Scenario: Capability provider contributes profiles
- **WHEN** a registered Agent capability provider returns artifact, creation, or provider/model expression profiles
- **THEN** the capability runtime SHALL validate and register those profiles through the corresponding profile registry
- **AND** it SHALL record contribution diagnostics without activating any Skill.

#### Scenario: Built-in profiles use the contribution path
- **WHEN** built-in Agent profiles are available
- **THEN** the runtime SHALL register them through the same profile registry path used by package, market, project, and personal contributions
- **AND** built-in profiles SHALL NOT be the only accepted profile definitions.

### Requirement: Profile descriptors carry stable identity and version metadata
Every shared Agent profile descriptor SHALL declare a stable `profileId`, `version`, `kind`, and source metadata before it can satisfy Skill, artifact, creation, or provider/model expression references.

#### Scenario: Valid profile descriptor
- **WHEN** a profile descriptor declares a valid profile id, supported kind, supported version, source metadata, and kind-specific shape
- **THEN** the profile registry SHALL accept the descriptor and expose it by profile id.

#### Scenario: Malformed profile descriptor
- **WHEN** a profile descriptor omits profile id, omits version, declares an unknown kind, or fails kind-specific validation
- **THEN** the runtime SHALL reject the descriptor with a visible diagnostic
- **AND** it SHALL NOT silently substitute a built-in profile.

### Requirement: Skills reference profiles without owning durable profile definitions
Skills SHALL reference shared profiles by id and relationship instead of privately owning durable profile definitions inside prompt text.

#### Scenario: Skill references produced artifact profile
- **WHEN** a Skill declares that it produces an artifact profile id
- **THEN** the runtime SHALL resolve that id through the profile registry during activation or turn assembly
- **AND** missing or incompatible profiles SHALL produce a visible diagnostic before the profile is used for persisted artifact validation.

#### Scenario: Skill package contributes and references its own profile
- **WHEN** a Skill package contributes a profile descriptor and the Skill metadata references that profile id
- **THEN** the runtime SHALL register the profile independently
- **AND** the Skill SHALL reference the registered profile by id rather than embedding a private copy.

#### Scenario: Skill-local profile remains temporary
- **WHEN** a Skill uses a `skill-local` profile for temporary reasoning only
- **THEN** that profile MAY affect the active Skill prompt or temporary schema projection
- **AND** it SHALL NOT be accepted as the profile id for a persisted artifact, project fact, or cross-Skill contract.

### Requirement: Profile-only packages are distributable
The system SHALL allow packages that contribute only profiles and no runnable Skill.

#### Scenario: Install profile-only package
- **WHEN** a trusted package declares only artifact, creation, or provider/model expression profile contributions
- **THEN** the market or project installer SHALL install it as a profile package
- **AND** the Agent runtime SHALL load its profiles without creating a runnable Skill catalog entry.

#### Scenario: Untrusted profile-only package
- **WHEN** a profile-only package is untrusted or lacks required signature/verified-publisher metadata for its source policy
- **THEN** installation or loading SHALL fail with a visible trust diagnostic
- **AND** none of its profiles SHALL be registered.

### Requirement: Artifact Profiles define durable artifact contracts
Artifact Profiles SHALL define durable artifact shape, field, schema, resource modality, validation, operation requirement, and suggested-action contracts when artifacts are persisted, rendered, transferred, or shared across Skills.

#### Scenario: Persisted artifact references profile
- **WHEN** a persisted artifact references a profile id and profile version
- **THEN** the artifact validator SHALL resolve the profile through the artifact profile registry
- **AND** it SHALL validate the artifact against the resolved profile.

#### Scenario: Missing persisted artifact profile
- **WHEN** a persisted artifact references an unknown or unsupported artifact profile version
- **THEN** validation SHALL fail closed with a machine-readable diagnostic
- **AND** the artifact SHALL NOT be silently accepted as an unprofiled generic artifact.

### Requirement: Creation Profiles define Agent lifecycle semantics
Creation Profiles SHALL define Agent creation stage semantics, transition constraints, stage persona Skill references, approval policy, review policy, and recovery policy without executing tools or writing project facts.

#### Scenario: Runtime activates creation profile
- **WHEN** an Agent session selects a creation profile
- **THEN** the runtime SHALL resolve the profile through the creation profile registry
- **AND** it SHALL project stage guidance, stage persona Skill references, approval policy, and review policy through the normal Agent turn assembly.

#### Scenario: Creation profile does not execute side effects
- **WHEN** a creation profile declares stages or transitions
- **THEN** those descriptors SHALL NOT execute tools, mutate projects, or create workflow runs by themselves
- **AND** side effects SHALL still occur only through Tools, domain services, approval, and diagnostics.

#### Scenario: Unknown creation profile
- **WHEN** a session or Skill references an unknown creation profile id
- **THEN** the runtime SHALL report a visible diagnostic
- **AND** it SHALL NOT silently fall back to `idc.default` unless the caller explicitly selected that fallback.

### Requirement: Provider/model expression profiles are model expression contracts
Provider/model expression profiles SHALL describe provider/model prompt expression behavior, modalities, generation capabilities, syntax preferences, style affinities, concept coverage, and failure/bias guidance without owning credentials or adapter wire mapping.

#### Scenario: Selected media model resolves expression profile
- **WHEN** a turn has selected media provider/model targets
- **THEN** the runtime SHALL resolve matching provider/model expression profiles by provider id, model id, and generation capability
- **AND** it SHALL inject the selected expression guidance before the Agent writes generation tool arguments.

#### Scenario: Expression profile unavailable
- **WHEN** no provider/model expression profile matches the selected target
- **THEN** the runtime SHALL continue only with explicit missing-profile diagnostics or provider-neutral prompt guidance
- **AND** it SHALL NOT fabricate provider-specific guidance.

#### Scenario: Expression profile omits credentials
- **WHEN** a provider/model expression profile is registered
- **THEN** the descriptor SHALL NOT contain provider secrets, account tokens, runtime handles, or adapter wire request mapping
- **AND** those concerns SHALL remain in model config, provider adapters, and host-secret storage.

### Requirement: Profile composition occurs during Agent turn assembly
The system SHALL compose active Skill state, selected creation profile, resolved artifact profiles, provider/model expression profiles, policy, and context budget during Agent turn assembly.

#### Scenario: Turn assembly includes profiles
- **WHEN** an Agent turn is assembled with an active Skill and selected profile references
- **THEN** the prompt, schema, and tool-policy projections SHALL be built from registered profile descriptors and active Skill records
- **AND** registration alone SHALL NOT inject profile content into the LLM context.

#### Scenario: Profile diagnostics block unsafe projection
- **WHEN** profile resolution produces missing, malformed, unsupported-version, or trust diagnostics that make a projection unsafe
- **THEN** the runtime SHALL omit or block the unsafe projection with visible diagnostics
- **AND** it SHALL NOT return an empty successful projection that hides the profile error.

### Requirement: Duplicate and layered profile registration is deterministic
Profile registries SHALL apply deterministic duplicate and source-layer behavior for profiles with the same id and kind.

#### Scenario: Duplicate profile without override policy
- **WHEN** two sources register the same profile id and kind and no explicit override policy permits replacement or layering
- **THEN** the registry SHALL produce a visible duplicate-profile diagnostic
- **AND** it SHALL NOT select a winner silently.

#### Scenario: Explicit project override
- **WHEN** a project profile explicitly overrides a built-in or market profile according to the registry source-layer policy
- **THEN** the resolved profile SHALL include source metadata identifying the override
- **AND** diagnostics SHALL remain available for auditing the selected profile source.
