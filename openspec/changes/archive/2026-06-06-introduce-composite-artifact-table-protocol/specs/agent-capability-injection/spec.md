## ADDED Requirements

### Requirement: Capability registry exposes artifact facets
The capability registry SHALL expose artifact protocol, profile, renderer, projector, and artifact capability registrations as typed facets of the existing Capability Protocol registry. These facets MUST NOT require a parallel global registry.

#### Scenario: Artifact facet is discoverable without injection
- **WHEN** a package contributes artifact protocol or profile metadata
- **THEN** Agent can discover the metadata during capability registration
- **THEN** the package renderer, projector, or provider implementation is not injected into LLM context solely because the metadata exists

#### Scenario: Missing artifact facet degrades safely
- **WHEN** Agent receives an artifact profile with no registered profile descriptor
- **THEN** the registry lookup reports the missing facet
- **THEN** Agent displays a bounded diagnostic and does not execute actions for that profile

### Requirement: Artifact registrations are lightweight and serializable
Artifact protocol/profile/renderer/projector/capability registrations SHALL be lightweight, serializable metadata suitable for registration-time introspection. Heavy implementation objects MUST be loaded or invoked through injection/provider resolution.

#### Scenario: Renderer registered lazily
- **WHEN** a package registers a renderer for a domain artifact block
- **THEN** the registration declares renderer id, accepted kinds/profiles, package id, and availability metadata
- **THEN** the renderer implementation can remain lazy until a UI needs to render that block

#### Scenario: Projector metadata is inspectable
- **WHEN** a package registers a projector from `StoryboardTable` to Canvas payload
- **THEN** registry introspection can report accepted input kind, produced output kind, provider package, and risk category without loading Canvas Webview code

### Requirement: Artifact capabilities declare risk and approval requirements
Artifact execution capabilities SHALL declare accepted artifact or payload kinds, produced kinds or refs, actions, package id, risk level, approval requirement, and host/package availability.

#### Scenario: Canvas import declares approval metadata
- **WHEN** Canvas registers `canvas.importStoryboard`
- **THEN** the capability registration declares the accepted storyboard payload, action id, risk level, and whether approval is required

#### Scenario: Generation capability declares expensive side effect
- **WHEN** a media provider registers an artifact action that generates video or audio
- **THEN** the capability registration marks the action as side-effecting and approval-gated according to cost/risk policy

### Requirement: Skill and profile declarations do not register capabilities
The capability registry SHALL distinguish Skill/Profile references to capabilities from actual provider registrations. A Skill or Profile Descriptor MUST NOT make an unregistered provider executable.

#### Scenario: Referenced capability is absent
- **WHEN** a Skill references `cut.importStoryboard` but Cut is not registered or unavailable
- **THEN** capability discovery reports the action as unavailable
- **THEN** Agent can still render and review the artifact but cannot execute the Cut import action

#### Scenario: Profile suggests action without provider
- **WHEN** a Profile Descriptor lists `canvas.createTableNode` as a suggested action
- **THEN** the action becomes executable only if the capability registry contains an available provider for that action

### Requirement: Artifact facets respect host and trust policy
Artifact renderers, projectors, and providers SHALL respect existing host requirements, trust levels, injection policy, and approval policy from Capability Protocol.

#### Scenario: VSCode-only projector unavailable in CLI
- **WHEN** a projector or provider requires VSCode Extension Host services and the host is CLI
- **THEN** the artifact facet remains registered but unavailable for execution in that host

#### Scenario: Untrusted provider cannot auto-execute
- **WHEN** an untrusted plugin contributes an artifact execution provider
- **THEN** runtime policy prevents automatic execution and requires explicit approval according to trust and risk metadata
