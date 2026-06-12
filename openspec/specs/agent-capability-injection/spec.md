# agent-capability-injection Specification

## Purpose
TBD - created by archiving change unify-neko-agent-runtime-workflow-boundaries. Update Purpose after archive.
## Requirements
### Requirement: Capability registration and injection are separate phases
The system SHALL distinguish capability registration from capability injection. Registered capabilities MUST be discoverable and queryable without automatically entering LLM context. Injection MUST be decided per turn or workflow node by runtime policy.

#### Scenario: Installed skill is registered but not injected
- **WHEN** a market skill is installed and discovered
- **THEN** it appears in the capability registry but its prompt/tool fragments are not injected until activation or policy selection

#### Scenario: Ablation disables injection only
- **WHEN** an experiment disables skill injection but leaves skill discovery enabled
- **THEN** skills remain discoverable while their prompt/tool/rule fragments are omitted from the LLM context

### Requirement: Market and local skills use one normalized schema
The system SHALL normalize market-installed skills, workspace-local skills, plugin-contributed skills, and built-in skills into one skill/capability schema. The schema MUST include identity, source, trust level, manifest version, prompt fragments, allowed tools/tool groups, slash commands, workflow fragments, host requirements, and optional media capabilities.

#### Scenario: Market skill installs into registry
- **WHEN** `neko-market` installs a skill package
- **THEN** agent platform discovers the installed files and registers a normalized capability contribution

#### Scenario: Local skill uses same runtime path
- **WHEN** a workspace-local skill is saved or rescanned
- **THEN** runtime normalizes it through the same schema path used by market skills

### Requirement: Capability conflicts are deterministic
The system SHALL define deterministic conflict handling for tool names, slash commands, skill ids, prompt fragment ids, and workflow fragment ids. Core capabilities MUST outrank community capabilities, community MUST outrank untrusted capabilities, and same-priority conflicts MUST require explicit namespace or alias.

#### Scenario: Slash command collision preserves builtin command
- **WHEN** a skill or plugin contributes a slash command with the same short name as a builtin command
- **THEN** the builtin command remains canonical and the contributed command requires namespace or disambiguation

#### Scenario: Tool short-name conflict is rejected or disambiguated
- **WHEN** two same-priority capabilities contribute the same short tool name
- **THEN** runtime does not inject an ambiguous short name and requires a fully qualified name or configured alias

### Requirement: Injection policy respects trust and host requirements
The system SHALL enforce trust level, permission policy, host requirements, workflow node requirements, active skill constraints, and tool budget before injecting tools or prompt fragments.

#### Scenario: Untrusted irreversible operation requires approval
- **WHEN** an untrusted capability contributes an irreversible operation
- **THEN** runtime does not auto-inject or auto-execute it without explicit policy approval

#### Scenario: Missing host requirement prevents activation
- **WHEN** a capability requires VSCode Extension API but the host is CLI
- **THEN** runtime keeps the capability registered but marks it unavailable for injection in that host

### Requirement: Slash command catalog is a projection
The system SHALL build Webview slash command catalog entries from runtime-normalized builtin, skill, and plugin command metadata. Webview MUST NOT decide command semantics beyond filtering, display, and sending typed invocation messages.

#### Scenario: Skill command appears after registration
- **WHEN** a skill with a slash command is registered and enabled
- **THEN** Webview receives a projected command catalog item with display metadata and command id

### Requirement: Capability runtime exposes introspection
The system SHALL expose runtime introspection for registered capabilities, injected capabilities, skipped capabilities, and skip reasons. The introspection MUST support debugging and evaluation without leaking host-only objects into core runtime.

#### Scenario: Skipped capability reports reason
- **WHEN** a capability is not injected due to trust, host requirement, workflow node, or ablation policy
- **THEN** runtime can report the skip reason in diagnostics or experiment output

### Requirement: Native Puppet Agent Tools
The Agent capability system SHALL expose native puppet tools for creation, expression control, direct component edits, driver edits, and animation generation.

#### Scenario: Register native puppet tools
- **WHEN** neko-puppet activates in a host where Agent is available
- **THEN** it registers native puppet tools for create, set expression, set BlendShape, set bone, set ControlDriver, play animation, auto-rig, and generate animation operations

#### Scenario: Preset tool uses native capabilities
- **WHEN** Agent invokes `puppet:set_expression`
- **THEN** the tool resolves the expression against native puppet presets and implemented BlendShapes before sending commands

#### Scenario: Creation tool produces draft artifact
- **WHEN** Agent invokes native puppet creation for PSD, PNG, or Live2D input
- **THEN** the tool returns a draft `.nkp` or `.nkentity` reference plus diagnostics and confidence metadata rather than directly hiding generation quality concerns

### Requirement: Native Puppet Tool Safety Metadata
Native puppet Agent tools SHALL declare target requirements, safety kind, and query-before-mutate guidance.

#### Scenario: Bone mutation declares target
- **WHEN** a bone editing tool is registered
- **THEN** it declares required target fields such as puppet id and bone id/name and points query-before-mutate guidance to a puppet capability query tool

#### Scenario: Generation is marked non-trivial
- **WHEN** an auto-rig or animation generation tool is registered
- **THEN** it declares generation safety metadata and reports diagnostics or preview requirements before committing generated authoring state

#### Scenario: Missing native capability fails safely
- **WHEN** Agent requests a native puppet operation for a legacy-only MOC3 puppet
- **THEN** the tool reports that native conversion or migration is required instead of mutating legacy parameter state as if it were native data

### Requirement: Model Scene Capability Provider
The Agent capability system SHALL accept `neko-model` as a domain capability provider for 3D scene query and editing tools.

#### Scenario: Model provider registers tools
- **WHEN** `neko-model` activates in a host where Agent is available
- **THEN** it registers model scene query, node manipulation, and animation control tools through the existing capability registration flow

#### Scenario: Query tool remains read-only
- **WHEN** the model scene query tool is registered
- **THEN** capability metadata marks it with `isReadOnly: true`, `isConcurrencySafe: true`, and `safetyKind: 'read-only-query'` so injection policy can treat it differently from editing operations

#### Scenario: Editing tools respect host availability
- **WHEN** model editing tools require VSCode Extension Host state or an active model editor
- **THEN** injection or execution reports unavailable status when those requirements are not met

#### Scenario: Mutation tools declare targets and query guidance
- **WHEN** model editing tools are registered
- **THEN** each mutation tool declares `targetRequirements` and `queryBeforeMutate` guidance that points to the model scene query tool before execution

#### Scenario: Canvas transfer remains out of scope
- **WHEN** Agent needs target-aware Canvas active-context query or Canvas content application
- **THEN** those tools and contracts are provided by `targeted-agent-plugin-transfer-and-query-apis`, while this change only aligns model/asset providers to the shared metadata fields

### Requirement: Agent tools declare query and mutation safety
The system SHALL require Agent-facing tools that access editor state to declare whether they are read-only queries, non-destructive mutations, destructive mutations, or confirmation-gated operations. Runtime injection and execution policy MUST use this metadata when deciding whether a tool can be called automatically.

#### Scenario: Structured query tool is injected safely
- **WHEN** a Canvas capability provider contributes a selection query tool marked read-only and concurrency-safe
- **THEN** runtime may inject and execute it without mutation confirmation according to normal read-only tool policy

#### Scenario: Destructive mutation requires approval
- **WHEN** a capability provider contributes a delete, replace, overwrite, or cross-container move operation
- **THEN** runtime treats the tool as confirmation-gated and does not auto-execute it without explicit user intent or policy approval

### Requirement: Capability metadata exposes target requirements
The system SHALL allow Agent tools and transfer commands to declare target requirements such as required node ID, container ID, slot ID, field path, selection fallback, or viewport insertion fallback. Runtime MUST use these declarations to avoid invoking mutation tools with ambiguous destinations.

#### Scenario: Tool requires explicit target node
- **WHEN** Agent wants to apply an optimized prompt to an existing Canvas node and the tool declares `nodeId` as required for replace mode
- **THEN** runtime first obtains or asks for a target node rather than calling the mutation with only natural-language context

#### Scenario: Tool allows selection fallback
- **WHEN** a tool declares that current selection is an allowed target fallback and the active editor reports exactly one selected node
- **THEN** runtime may pass that selected node as the resolved target and records that fallback in trace metadata

### Requirement: Capability introspection includes query-before-mutate guidance
The system SHALL expose provider guidance that identifies preferred query tools for each mutation tool. Agent planning SHOULD use this introspection to gather stable IDs, summaries, and context before calling mutations.

#### Scenario: Canvas prompt update advertises query dependency
- **WHEN** Canvas registers a prompt-application mutation tool
- **THEN** capability introspection identifies Canvas selection and node query tools as preferred preflight tools

#### Scenario: Planner sees missing query tool
- **WHEN** a mutation tool has target requirements but no provider query tool can satisfy them
- **THEN** runtime marks the mutation as requiring user-specified target input instead of relying on OCR or screenshots

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

