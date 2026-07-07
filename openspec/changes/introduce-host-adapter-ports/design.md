## Context

Neko currently has several host-shaped boundaries, but they are not expressed as a shared host contract. VSCode extension code owns many concrete host concerns, TUI owns a partial Node shell, and domain packages such as content, assets, entity, and search already have local ports but no shared vocabulary for workspace roots, filesystem, path variables, secrets, external opening, diagnostics, or access policy.

The immediate symptoms are visible in the Agent TUI:

- TUI can run Agent core tools but cannot register extension-owned `ReadDocument` and `ReadImage`.
- TUI cannot reliably expose assets, entity, search, cache-aware projections, or `.neko` workspace data without importing VSCode-shaped implementations.
- Agent-facing generic file tools risk perceiving `.neko` internals unless access is denied at a host/client policy boundary.
- The TUI skill lifecycle provider still accepts a legacy string activation input while `ActivateSkill` now calls the provider with `{ name, reason }`.

This change introduces an explicit host contract layer while preserving the existing product boundary: Neko is a local client plus local Rust Engine, not a distributed platform. Host ports are local machine primitives. Domain runtimes remain the owners of `.neko` semantics and creative capability behavior.

## Goals / Non-Goals

**Goals:**

- Establish `@neko/host` as a Layer 0 contract package for host primitives only.
- Make VSCode, TUI, and future standalone clients implement the same host port vocabulary at their composition roots.
- Let domain packages consume host ports and expose capability providers without importing concrete VSCode, Node, or native APIs.
- Make TUI a headless full client for non-graphical capabilities: content, assets, entity, search, config, cache-aware projections, auth/market, and Engine headless operations.
- Ensure Agent tools cannot directly read, list, or mutate `.neko` internals; Agent sees only sanitized domain projections or mutation proposals.
- Restore TUI skill activation by honoring the structured `ActivateSkill` provider contract.

**Non-Goals:**

- Do not move content, assets, entity, search, market, auth, or Engine implementations into `@neko/host`.
- Do not make `@neko/agent` a top-level aggregator for domain implementations.
- Do not make TUI emulate graphical Webview behavior such as Canvas interaction, Timeline drag editing, Webview URI projection, or visual preview panes.
- Do not migrate every existing VSCode adapter in one step; the first implementation should be incremental and path-level tested.
- Do not expose `.neko` files, cache paths, index files, runtime tokens, or Webview URIs as Agent durable context.

## Decisions

### Decision: `@neko/host` owns only primitive contracts

`@neko/host` defines interfaces for environment, workspace, filesystem, paths, secrets, external opening, diagnostics, and access policy. It may reference `@neko/shared` types such as `IStorageLayout`, `PathVariableMap`, and `ResolvedPath`, but it must not depend on VSCode, Node, React, Agent, Engine client, Content, Assets, Entity, or Search packages.

Alternative considered: keep host contracts inside `@neko/shared`. Rejected because `@neko/shared` is already broad and adding host ports there makes it easier to blur infrastructure utilities with client composition contracts.

Alternative considered: put host contracts in `@neko/agent`. Rejected because Agent would become a top-level package that all domain capabilities orbit around.

### Decision: Implementations live at host composition roots first

The first Node implementation should live under the TUI composition root, for example `packages/neko-agent/packages/cli-tui/src/host`. Existing VSCode host implementation can remain in extension services while gradually adapting to `@neko/host` contracts. A reusable `neko-host-node` implementation package is deferred until a second non-VSCode client needs it.

Alternative considered: create `@neko/host-node` and `@neko/host-vscode` immediately. Rejected for now because one reusable Node implementation and a full VSCode migration are not yet proven; starting near composition roots keeps the blast radius smaller.

### Decision: `.neko` is client-owned domain data, not Agent-readable workspace content

TUI/client code may modify `.neko` through owning domain runtimes. Agent tools must not directly perceive, enumerate, read, or mutate `.neko`. Generic tools should deny direct `.neko` access for the `agent` actor, while domain providers can project sanitized assets, entity facts, search hits, memory summaries, content refs, and diagnostics.

Alternative considered: let Agent generic file tools read `.neko` and rely on prompting. Rejected because cache manifests, entity stores, search indexes, logs, and runtime data would leak implementation details and create durable path misuse.

### Decision: Domain packages own capability providers

Content owns document reading and image resource exposure. Assets owns asset library visibility. Entity and Search own facts and indexes. Each domain composes host ports into its own runtime and exposes Agent capability providers or host APIs. VSCode and TUI both register those providers; neither imports the other host's internals.

Alternative considered: move `ReadDocument` and `ReadImage` factories into `@neko/agent`. Rejected because content semantics, document refs, and resource materialization belong to `@neko/content`, not Agent.

### Decision: TUI aligns on headless capability, not graphical interaction

TUI must register the same non-graphical domain capabilities as VSCode: read documents, expose images to native multimodal turns, search assets/entities, query project search, write project outputs through approved client/domain paths, and use Engine headless operations. It does not need Webview URI projection or interactive graphical editing.

Alternative considered: make TUI depend on Webview-style projection. Rejected because terminal output and future standalone clients need host-neutral resource identities and saved outputs, not short-lived Webview display handles.

### Decision: Structured skill lifecycle requests are required

The TUI skill provider must accept the same structured activation request as the Agent meta tool: `{ name, reason }`. Legacy string-only provider paths must not be used for Agent-driven activation.

Alternative considered: make `ActivateSkill` support both string and object provider inputs. Rejected because that would preserve the bug class and hide contract drift between Agent tools and host adapters.

## Five-Layer Analysis

Responsibility:

- `@neko/host` owns only host primitive contracts.
- Host composition roots own concrete VSCode, Node, Electron, Tauri/Rust, or test implementations.
- Domain packages own `.neko` semantics, capability providers, projections, and mutations.
- Agent owns orchestration, tool execution, and mutation proposals, not direct storage mutation.
- Webview owns graphical UI and consumes projected DTOs only.

Dependency:

- Layer 0 contracts depend only on other Layer 0 contracts.
- Webview does not import `@neko/host`, `vscode`, or Node APIs for direct filesystem access.
- TUI can use Node implementations but only inside its host adapter/composition root.
- Extension can use VSCode APIs but only inside host adapters and Extension Host services.

Interface:

- Host ports stay small and capability-neutral.
- Domain capability providers expose tools, prompt fragments, reference contributors, and diagnostics through existing Agent capability contracts.
- Access policy distinguishes `client`, `domain-runtime`, `agent`, and `test` actors so `.neko` behavior is explicit and testable.

Extension:

- Adding Electron or Tauri should require a new host adapter implementation, not new domain runtimes.
- Adding a domain capability should require a domain provider plus host port use, not direct TUI/VSCode coupling.
- Future shared Node adapter extraction can happen after TUI and another non-VSCode client prove the common surface.

Testing:

- `@neko/host` boundary tests prevent concrete host and domain imports.
- Node host adapter tests cover workspace resolution, path variables, storage layout, and `.neko` access policy.
- TUI registration tests assert `ReadDocument`, `ReadImage`, assets, entity, and search tools are registered through providers.
- Agent isolation tests assert generic file tools reject `.neko` paths for the `agent` actor.
- Content tests assert `ReadDocument.imageInfo[].resourceRef -> ReadImage.images[].resourceRef` works without cache path or Webview URI fallback.

## Risks / Trade-offs

- [Risk] `@neko/host` grows into a new top-level domain aggregator. → Mitigation: boundary tests forbid imports from Agent, Content, Entity, Search, Engine client, React, VSCode, and Node; docs state host ports are primitive contracts only.
- [Risk] TUI Node adapter duplicates VSCode adapter behavior inconsistently. → Mitigation: domain runtimes consume the same host ports and tests assert canonical provider paths, not final output only.
- [Risk] `.neko` access policy blocks legitimate client maintenance actions. → Mitigation: deny direct Agent access only; allow `client` and `domain-runtime` actors through owning runtimes with explicit operation and scope.
- [Risk] Existing extension-only content tools drift while TUI provider is added. → Mitigation: move ownership to content boundary or a content-owned capability subpath and make both hosts register the same provider.
- [Risk] The first pass over-abstracts before a standalone client exists. → Mitigation: keep implementation local to TUI and VSCode roots until reuse is proven; `@neko/host` remains interfaces only.

## Migration Plan

1. Keep the newly introduced `@neko/host` package as the contract source and enforce its boundary test.
2. Implement TUI `NodeHostAdapter` under `cli-tui/src/host`.
3. Add TUI access policy so generic Agent tools fail visibly for `.neko` internals while client/domain runtimes can write through owning APIs.
4. Fix TUI skill lifecycle activation to accept `{ name, reason }`.
5. Move or recreate `ReadDocument`/`ReadImage` capability ownership in the content domain and register it from both VSCode and TUI composition roots.
6. Add assets, entity, and search TUI providers incrementally using host ports and domain runtimes.
7. Gradually adapt existing VSCode host services to consume or implement `@neko/host` ports where it reduces duplication.

Rollback strategy: if a domain provider migration fails, keep the existing VSCode provider path active while disabling the new TUI provider for that domain. Do not roll back `@neko/host`; it is a contract-only package and does not change runtime behavior by itself.

## Open Questions

- Should `HostProcessPort` be introduced now for Engine sidecar lifecycle, or should Engine host control stay in `@neko/neko-client`/extension services until headless Engine tasks are implemented?
- Should secrets in the initial TUI adapter be unavailable, file-backed, or delegated to an OS keychain package?
- Which asset/entity/search APIs should become Agent capability providers first, and which should remain client commands until their mutation policy is defined?
