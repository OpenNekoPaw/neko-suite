## ADDED Requirements

### Requirement: Entity memory and semantic index facets are capability metadata
The capability registry SHALL expose entity provider, entity memory contributor, media text extractor, perception provider, semantic index provider, review surface, and representation resolver support as typed facets of the existing Capability Protocol registry. These facets MUST NOT create a parallel registry and MUST NOT require immediate injection into LLM context.

#### Scenario: Semantic facet is discoverable without injection
- **WHEN** a package registers a semantic index provider facet
- **THEN** Agent and Dashboard can discover the package support during capability introspection
- **THEN** the provider implementation is not injected into LLM context solely because the facet exists

#### Scenario: Missing semantic provider degrades safely
- **WHEN** Agent receives an `EntityMemoryContribution` that references a semantic-index action with no available provider
- **THEN** capability discovery reports the action as unavailable
- **THEN** Agent can still render the contribution and diagnostics without executing the action

### Requirement: Entity memory facets respect trust and approval policy
The capability registry SHALL apply existing host availability, trust level, risk, approval, and injection policy to entity memory and semantic index facets. A Skill or profile reference to an entity/memory/semantic action MUST NOT make an unregistered or unavailable provider executable.

#### Scenario: Skill references unavailable contributor
- **WHEN** a Skill asks Agent to extract media text through a package that is not registered or unavailable in the current host
- **THEN** the capability registry reports a skip reason
- **THEN** Agent does not fabricate provider execution or persist contribution output as if the provider ran

#### Scenario: Review surface is registered but unavailable
- **WHEN** Dashboard contributes a review surface facet that requires VSCode host services
- **THEN** the facet remains registered but unavailable in CLI or unsupported hosts
- **THEN** Agent falls back to a safe artifact diagnostic or another available review surface

### Requirement: Entity memory write authority remains delegated
The capability registry SHALL distinguish contribution facets from write-authority facets. Entity memory contributors MAY emit reviewable evidence, but confirmed entity, asset binding, accepted observation, or semantic sidecar writes MUST be performed through explicit delegated operations with declared risk and approval metadata.

#### Scenario: Contributor cannot write accepted memory directly
- **WHEN** a media text extractor contributes high-confidence dialogue evidence
- **THEN** the contribution is treated as reviewable evidence
- **THEN** accepted character memory writes require a registered delegated write capability or explicit user approval path

#### Scenario: Delegated write declares risk
- **WHEN** a provider registers an operation that accepts or supersedes character observations
- **THEN** capability metadata declares target requirements, risk level, approval requirement, and host availability before the operation can execute
