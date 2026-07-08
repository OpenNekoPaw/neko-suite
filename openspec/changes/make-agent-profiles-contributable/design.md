## Context

Neko Agent already has several profile-like contracts:

- Artifact and table profiles describe durable generated structures such as storyboard tables and composite artifacts.
- Creation guidance and IDC stage tracking describe how Agent organizes Draft, Plan, Apply, review, and approval.
- ProviderCard describes provider/model expression behavior for media generation.
- Model config describes provider/model availability, credentials, token limits, and adapter/protocol metadata.

The current shape is useful, but the ownership boundary is uneven. Some profiles are built-in descriptors, some are package-local descriptors, and ProviderCard already has a registry. If Artifact Profiles and Creation Profiles remain code-owned presets, new Skills can only adapt to built-ins. If profiles move inside Skills, durable contracts become private to a prompt package and other Skills, UI surfaces, validators, and project writers must depend on that Skill. The change should make profiles independently registrable while keeping Skills as task strategies.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Profiles own object/stage/model contracts. Skills own task strategy and may reference profile ids. Capability runtime owns registration, diagnostics, and injection. Domain packages own durable project facts. Market/Extension/TUI only load and trust-check contributions. |
| Dependency | Descriptor contracts live in `@neko/shared` Layer 0. Registries and prompt/schema composition live in `@neko/agent`. Extension/TUI wire registries into runtime but do not interpret profile semantics. Webview receives projections only and does not import runtime registries. |
| Interface | Add typed descriptors, validation diagnostics, registry interfaces, and `AgentCapabilityProvider` contribution methods. Skill metadata references profile ids and versions instead of embedding shared descriptors. Profile packages expose manifests and descriptors, not executable runtime handles. |
| Extension | New profile kinds can be added by registry/type extension and validation adapters, without modifying every Skill. Built-ins, market packages, project packages, and Skill packages use the same registration path. |
| Testing | Contract tests validate descriptors, duplicate handling, source layering, version diagnostics, Skill profile references, profile-only package loading, prompt/schema projection, and fail-visible missing-profile behavior. Integration tests prove the canonical registry path is hit. |
| Proportionality | Registries are justified because profiles become cross-package contracts and market/project contributions. The design stays local-client scoped: no remote registry service, tenant policy service, or distributed orchestration is introduced. |
| Fail-visible behavior | Unknown profile ids, malformed descriptors, unsupported versions, duplicate ids without allowed override, missing validators, unsafe host requirements, and untrusted market packages return diagnostics or throw in tests; they do not silently fall back to built-ins or empty profiles. |

## Goals / Non-Goals

**Goals:**

- Treat built-in profiles as standard-library contributions rather than hardcoded limits.
- Allow Skills, domain packages, market packages, project packages, and profile-only packages to contribute Artifact Profiles, Creation Profiles, and Provider/Model Expression Profiles.
- Allow Skills to declare `consumes`, `produces`, `requires`, and `prefers` profile ids.
- Support profile-only distribution packages so teams can share table structures, creation lifecycles, or model expression profiles without shipping a Skill.
- Keep durable profiles independently registered, versioned, validated, and diagnosable.
- Keep ProviderCard behavior aligned with the broader profile model while preserving the existing ProviderCard registry semantics.

**Non-Goals:**

- Do not make Profile descriptors execute tools, write project facts, or replace domain services.
- Do not turn Creation Profiles into arbitrary workflow runtimes.
- Do not restore Extension/Webview natural-language Skill candidate routing.
- Do not put provider credentials, pricing secrets, or wire adapter mapping into Provider/Model Expression Profiles.
- Do not let user TOML define workflow/profile schemas as the source of truth.
- Do not require all temporary Skill-internal reasoning shapes to become shared profiles.

## Decisions

### Decision 1: Profiles are independent capability contributions

Introduce shared descriptor families:

```ts
type AgentProfileKind = 'artifact' | 'creation' | 'provider-expression';

interface AgentProfileIdentity {
  readonly profileId: string;
  readonly version: string;
  readonly kind: AgentProfileKind;
  readonly source: 'builtin' | 'package' | 'market' | 'project' | 'personal' | 'skill-local';
}
```

Each concrete profile kind extends this identity with its own contract:

- Artifact Profile: artifact kind/protocol, field descriptors, schema refs, resource modality constraints, operation requirements, validators, and suggested actions.
- Creation Profile: stage descriptors, transition rules, default stage, stage persona Skill ids, approval/review/recovery policy descriptors, and lifecycle constraints.
- Provider/Model Expression Profile: provider id, optional model id, generation capabilities, input/output modalities, syntax profile, style/concept coverage, and expression warnings.

Rationale: This keeps Skill and Profile composable. A Skill can ship a profile, but after registration the profile is a first-class contract.

Rejected alternative: keep profiles as built-in enum-like presets. That blocks new Skills from defining durable shapes or creation lifecycles without changing core code.

Rejected alternative: embed profiles inside Skill bodies. That makes durable contracts private prompt text, prevents independent validation, and couples other Skills/UI/domain packages to a Skill implementation.

### Decision 2: Profile registries mirror existing capability registration

Add registry interfaces for each profile family plus a combined projection surface:

```ts
interface IArtifactProfileRegistry {
  register(profile: ArtifactProfileDescriptor): void;
  unregister(profileId: string, source?: AgentProfileSource): void;
  get(profileId: string, version?: string): ArtifactProfileDescriptor | undefined;
  list(filter?: ArtifactProfileFilter): readonly ArtifactProfileDescriptor[];
}
```

Creation and Provider Expression registries follow the same pattern. Existing ProviderCardRegistry can either remain as the provider-expression registry implementation or be renamed behind an adapter in a later cleanup. This change should avoid broad rename churn unless needed for the contract.

Registration sources:

- Built-in: standard-library profiles registered at runtime bootstrap.
- Package: domain package or Agent capability provider contribution.
- Market/personal/project: installed descriptors loaded from canonical profile package locations.
- Skill-local: allowed only for temporary non-durable descriptors; it must not satisfy persisted artifact load or cross-Skill profile references.

Rationale: Registration and injection stay separate, matching the existing Agent capability model.

Rejected alternative: resolve profiles lazily by scanning Skill folders during each Agent turn. That repeats I/O, hides validation failures until prompt generation, and breaks host parity between Extension and TUI.

### Decision 3: Extend AgentCapabilityProvider with profile methods

Add optional contribution methods:

```ts
interface AgentCapabilityProvider {
  getArtifactProfiles?(context: AgentCapabilityContext): ArtifactProfileDescriptor[];
  getCreationProfiles?(context: AgentCapabilityContext): CreationProfileDescriptor[];
  getProviderExpressionProfiles?(context: AgentCapabilityContext): ProviderCard[];
}
```

`getProviderExpressionProfiles` may initially delegate to existing `getProviderCards` for compatibility. Contributions must be filtered by host requirements and trust before registration, like tools, Skills, tool groups, and provider cards.

Rationale: Domain packages and profile-only packages need the same capability path as Skills without introducing direct cross-package imports.

Rejected alternative: make each registry read from package-specific folders directly. That spreads discovery logic and trust checks across registries.

### Decision 4: Skills reference profile ids instead of owning durable profile definitions

Extend Skill metadata with typed profile references:

```ts
interface SkillProfileReference {
  readonly profileId: string;
  readonly versionRange?: string;
  readonly relationship: 'consumes' | 'produces' | 'requires' | 'prefers';
  readonly kind: AgentProfileKind;
}
```

Existing `mediaWorkflow.artifactProfiles` can remain as a shorthand for artifact profile ids, but the canonical contract should support kind, relationship, and optional version. A Skill package may contribute profiles in the same package and reference them by id. Runtime validation checks references during activation/injection and reports missing or incompatible profile diagnostics.

Rationale: The Skill stays a task strategy. Profiles stay contracts that can be reused by other Skills, UI surfaces, and validators.

Rejected alternative: let Skill prompt text name arbitrary profile-like structures without registration. That gives the Agent text guidance but no typed validation or UI/domain interoperability.

### Decision 5: Profile-only packages are allowed

Market/project/personal packages may contain only profiles. Their manifests declare contribution kinds, profile ids, versions, trust requirements, host requirements, and install targets. Installing a profile-only package does not activate a Skill.

Profile-only packages are useful for:

- Studio-standard storyboard or review table schemas.
- Shared creation lifecycles such as `research-outline-generate-review`.
- Provider/model expression profile updates independent from task Skills.

Rationale: Some contracts need team or market distribution without a task prompt.

Rejected alternative: require every profile package to include at least one Skill. That creates dummy Skills and muddles catalog UX.

### Decision 6: Profile composition happens during prompt/schema/tool-policy assembly

Runtime composition consumes:

```text
active Skill records
selected Creation Profile
profile refs from Skill metadata
selected provider/model expression profile
artifact profiles required by expected outputs
policy and context budget
```

Outputs:

- Prompt fragments for active Skill and provider/model expression guidance.
- Structured schema sections for artifact profiles and creation outputs.
- Tool allowlist/policy projections constrained by active Skill, Creation Profile, trust, and approval.
- Diagnostics for missing/incompatible profiles.

Profile descriptors do not directly mutate session state. They become prompt/schema/policy projections through the same request-time assembly boundary used for Skills and capability prompt fragments.

Rationale: This preserves deterministic turn assembly and avoids cleanup bugs from incremental prompt mutation.

Rejected alternative: inject profile prompts immediately when registered. Registration should not imply LLM injection.

### Decision 7: Creation Profiles are extensible but not workflow engines

Creation Profiles define stage semantics and policy descriptors. They may declare stage persona Skill ids, but those Skills activate through the Skill lifecycle runtime. Creation Profiles do not own tool execution, workflow runs, project writes, or domain side effects.

Example:

```text
creation profile: studio.research-generate-review
  stages: research -> outline -> generate -> critique -> revise
  stage personas: stage ids map to Skill ids
  policies: approval/review/recovery descriptors
```

Rationale: This gives new Skills room to define creative lifecycles without bypassing Agent runtime, Tool approval, or domain services.

Rejected alternative: treat Creation Profile stages as executable workflow nodes. That duplicates workflow engines and breaks the Agent-native creation boundary.

### Decision 8: Artifact Profiles are durable when persisted or shared

Artifact Profiles that affect persisted artifacts, project writes, UI rendering, or cross-Skill exchange must be registered shared/domain profiles. Skill-local artifact profiles are allowed only for temporary intermediate reasoning shapes that are not persisted and not exposed as reusable contracts.

Persisted artifacts store `profileId` and `profileVersion` when the profile requires version pinning. Unsupported or missing profile versions fail with diagnostics instead of silently accepting the artifact as generic data.

Rationale: Durable creative data needs stable validation and render semantics beyond a Skill body.

Rejected alternative: allow persisted artifacts to reference a Skill-local profile. That makes historical artifacts unreadable if the Skill is renamed, removed, or upgraded.

### Decision 9: Model config may reference but not define expression profiles

Model catalog/config may reference a provider/model expression profile id or allow the runtime to resolve by `providerId + modelId + capability`. User TOML remains for selecting providers/models and safe scalar options. It does not become the authoring format for workflow/profile definitions.

Rationale: This keeps model config focused on availability and adapter parameters while allowing profile packages to update expression guidance independently.

Rejected alternative: place prompt syntax, concept coverage, or workflow profile definitions directly in TOML. That would make user config a second profile DSL with weak validation and difficult migration.

## Risks / Trade-offs

- [Risk] Registry proliferation makes Agent bootstrap feel heavier. -> Mitigation: keep descriptor registries lightweight, host-agnostic, and loaded through existing capability bootstrap; do not introduce services or daemons.
- [Risk] Profile-only packages could confuse users in the Skill catalog. -> Mitigation: project profile packages in a separate capability/profile catalog surface, not as runnable Skills.
- [Risk] Duplicate profile ids from market/project packages can shadow built-ins unexpectedly. -> Mitigation: require source-layer diagnostics and explicit override rules; unknown duplicate policy fails visibly.
- [Risk] Creation Profiles can drift toward workflow engines. -> Mitigation: descriptors cannot execute tools; tests assert execution remains in Tool/domain services and Skill lifecycle.
- [Risk] Existing ProviderCard terminology differs from the broader profile model. -> Mitigation: keep ProviderCard as the compatibility type initially and document it as the provider/model expression profile implementation.
- [Risk] Skill-local profiles may leak into durable artifacts. -> Mitigation: validators reject persisted artifacts that reference `skill-local` profiles.

## Migration Plan

1. Add shared profile descriptor and registry contracts without removing existing built-in descriptors.
2. Register built-in Artifact Profiles, Creation Profiles, and ProviderCards through the new contribution path.
3. Extend capability provider registration to collect profiles and produce diagnostics.
4. Extend Skill metadata/profile reference validation while preserving existing `mediaWorkflow.artifactProfiles` shorthand.
5. Wire prompt/schema/tool-policy composition to resolve profile references through registries.
6. Add profile-only package install/load paths and market trust validation.
7. Add tests proving old built-in direct paths are not the default acceptance path once registry registration exists.

Rollback is local and prelaunch: remove the new registry wiring and return built-ins to direct registration. Persisted artifacts created during the change must either use existing built-in ids or fail with missing-profile diagnostics; no valuable user data should be silently rewritten.

## Open Questions

- Should ProviderCard be renamed to `ProviderExpressionProfile` now, or kept as the public compatibility name until a later cleanup?
- Should Creation Profile descriptors live under `@neko/shared` only, or should some runtime-only projection helpers remain in `@neko/agent`?
- What source-layer override order should profile registries use for built-in, market, project, personal, package, and skill-local profiles?
- Should profile-only packages appear in the existing Market capability list or a dedicated Profile catalog section?
