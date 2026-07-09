## 1. Shared Contracts

- [x] 1.1 Add Layer 0 Agent profile identity, source, kind, diagnostic, and registry interface contracts in `packages/neko-types`.
- [x] 1.2 Define Artifact Profile descriptor contracts for durable artifact/table shape, fields, schema refs, resource modality constraints, operation requirements, validators, and suggested actions.
- [x] 1.3 Define Creation Profile descriptor contracts for stages, transitions, stage persona Skill ids, approval policy, review policy, recovery policy, and lifecycle constraints.
- [x] 1.4 Align ProviderCard with the provider/model expression profile contract without broad rename churn; document any compatibility alias retained.
- [x] 1.5 Extend Skill metadata with typed profile references for consumes, produces, requires, and prefers relationships while preserving existing `mediaWorkflow.artifactProfiles` shorthand.
- [x] 1.6 Add shared validators and tests for malformed profile descriptors, unsupported versions, invalid source/kind, unsafe `skill-local` persistence, and duplicate ids.

## 2. Runtime Registries

- [x] 2.1 Implement Artifact Profile, Creation Profile, and provider/model expression profile registries with deterministic source-layer and duplicate diagnostics.
- [x] 2.2 Register built-in profiles through the new registry contribution path instead of direct hardcoded lookup paths.
- [x] 2.3 Extend Agent capability registration to collect profile contributions alongside tools, Skills, tool groups, prompt fragments, ProviderCards, lifecycle descriptors, and artifact facets.
- [x] 2.4 Ensure unregister removes only the contributing source/layer and does not delete unrelated market/project/profile overrides for the same profile id.
- [x] 2.5 Add runtime tests proving built-in, package, market/project, and duplicate profile contributions use the canonical registry path.

## 3. Skill And Profile Composition

- [x] 3.1 Validate Skill profile references during activation and turn assembly, returning visible diagnostics for unknown or incompatible profile ids.
- [x] 3.2 Compose active Skill records, selected Creation Profile, resolved Artifact Profiles, provider/model expression profiles, policy, and context budget during Agent turn assembly.
- [x] 3.3 Project profile prompt/schema/tool-policy sections without injecting profile content at registration time.
- [x] 3.4 Reject persisted artifacts that reference `skill-local` profiles and fail closed on missing or unsupported shared profile versions.
- [x] 3.5 Add tests proving Skills can ship profiles in the same package while still referencing registered profile ids.

## 4. Distribution And Host Wiring

- [x] 4.1 Add profile-only package manifest and install target handling for market/personal/project profile packages.
- [x] 4.2 Enforce trust, signature, verified publisher, and host requirement checks before profile-only package registration.
- [x] 4.3 Wire profile registries into VSCode Extension capability bootstrap, CLI/TUI runtime bootstrap, and shared runtime bindings.
- [x] 4.4 Add profile catalog projection for non-runnable profile packages without creating runnable Skill catalog entries.
- [x] 4.5 Add tests for Extension and TUI profile contribution loading, host requirement filtering, and diagnostics.

## 5. Model Config Boundary

- [x] 5.1 Add model/catalog metadata support for referencing provider/model expression profile ids without allowing TOML-authored profile schemas.
- [x] 5.2 Validate missing or incompatible expression profile references with visible diagnostics.
- [x] 5.3 Add config normalization tests proving user TOML cannot define Artifact Profile, Creation Profile, or provider/model expression profile schemas.

## 6. Migration And Cleanup

- [x] 6.1 Audit existing built-in Artifact Profiles, Creation Profile guidance, ProviderCards, and profile-like descriptors for canonical registry registration.
- [x] 6.2 Remove or fail-close obsolete direct built-in lookup paths once the registry path is covered by tests.
- [x] 6.3 Preserve existing durable artifacts with known profile ids, and add diagnostics for missing or unsupported profile versions instead of silent generic fallback.
- [x] 6.4 Update architecture docs and package docs describing Skill/Profile ownership, profile-only packages, and ProviderCard as model expression profile.

## 7. Validation

- [x] 7.1 Run targeted shared contract tests for profile descriptors, validators, Skill profile references, and artifact profile persistence.
- [x] 7.2 Run targeted Agent runtime tests for profile registration, capability contribution, Skill activation diagnostics, turn assembly projection, and ProviderCard compatibility.
- [x] 7.3 Run targeted Extension and CLI/TUI bootstrap tests for profile registries and host requirement filtering.
- [x] 7.4 Run config tests for model expression profile references and TOML profile-definition rejection.
- [x] 7.5 Run `pnpm check` and the relevant focused `pnpm test` filters; record any residual risk if full `pnpm test` is deferred.
