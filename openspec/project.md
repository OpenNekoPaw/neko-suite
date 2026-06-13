# Project Context

## Purpose

Neko Suite is a VSCode-integrated creative workspace monorepo. It combines
React Webviews, VSCode Extension Host adapters, a Rust media/rendering sidecar,
shared contracts, AI Agent workflows, asset/market infrastructure, and multiple
creative editors.

OpenSpec changes in this repository must preserve the product direction:

- Keep VSCode as the integrated host while respecting Webview sandbox limits.
- Keep Rust `neko-engine` as the authority for local binary media, rendering,
  device I/O, heavy computation, and engine-owned state.
- Keep TypeScript focused on UI, orchestration, host adapters, shared contracts,
  and typed projections.
- Favor creator-facing, end-to-end workflows over isolated feature surfaces.
- Maintain clear package boundaries so individual creative domains can evolve
  without cross-extension coupling.

## Tech Stack

- Frontend: React 18, Zustand, Tailwind CSS, Vite, `@neko/ui`.
- Extension host: VSCode Extension API, TypeScript, esbuild.
- Engine: Rust, wgpu, FFmpeg, axum, tokio, bevy_ecs, napi-rs.
- Streaming: H.264, PCM, fMP4, WebSocket, WebCodecs.
- AI: Vercel AI SDK, MCP, provider adapters, Neko Agent IDC workflows.
- Contracts: Protobuf for engine communication; JSON Schema/typed validators for
  durable `nk*` project files.
- Build/test: pnpm 10, Turborepo 2, Vitest, cargo test, dependency-cruiser,
  Knip, GitHub Actions.

Core shared packages:

- `packages/neko-engine`: Rust sidecar, host HTTP/WS/N-API/CLI, runtime crates.
- `packages/neko-types`: `@neko/shared`, Layer 0 contracts and utilities.
- `packages/neko-client`: `@neko/neko-client`, EngineClient and stream clients.
- `packages/neko-proto`: Protobuf IDL, engine communication SSOT.
- `packages/neko-ui`: shared Webview React UI primitives and creative controls.

## OpenSpec Artifact Rules

Every non-trivial change should use OpenSpec artifacts before implementation.
Artifacts are living design constraints, not ceremonial paperwork.

### Proposal

Proposals must explain:

- Why the change is needed now.
- What user path or architecture risk it improves.
- What capabilities are created or modified.
- What packages, contracts, file formats, commands, Webviews, engine actions, or
  marketplace surfaces are affected.
- Explicit non-goals for broad or ambiguous feature requests.
- Compatibility and rollback expectations for public contracts, project formats,
  runtime paths, and user workflows.

For user-facing creative workflow changes, include success criteria that describe
the complete path from entry to observable result.

### Design

Designs must start from architecture boundaries before implementation details.
For multi-module changes, include the five-layer analysis:

- Responsibility: who owns data, behavior, lifecycle, and cleanup?
- Dependency: are Layer 0/1/2, Webview/Extension, TS/Rust, and package
  boundaries respected?
- Interface: are DTOs, messages, schemas, Proto contracts, commands, and
  extension APIs minimal, stable, and testable?
- Extension: can the next similar feature be added without copy-paste or broad
  caller edits?
- Testing: what is covered by unit tests, contract tests, integration tests,
  CLI smoke, Webview runtime smoke, VSCode smoke, fixture smoke, or benchmarks?

Designs must record rejected alternatives when they avoid a tempting but unsafe
shortcut, especially around Engine authority, Webview sandboxing, runtime handles,
market trust, or Agent tool injection.

### Specs

Specs must express externally meaningful behavior with SHALL/MUST requirements
and scenarios. Specs should not encode implementation details unless the behavior
is a public contract or architecture boundary.

Use specs for:

- Public DTOs, Proto/schema behavior, project file behavior, command protocols,
  capability contracts, marketplace manifests, Agent tool/skill contracts, and
  cross-package runtime behavior.
- Migration and compatibility rules for existing project files and user data.
- Failure and degraded states users or callers can observe.

### Tasks

Tasks must be implementation-sized and evidence-oriented. Each task should make
clear which artifact, package, behavior, or test closes the requirement.

Include dedicated validation tasks for:

- New public contracts or adapters.
- Webview/Extension message paths.
- Engine actions, streams, file access, or runtime state.
- Project file migrations.
- UI layout, keyboard/focus, i18n, and accessibility when UI changes.
- Smoke or manual VSCode validation for L3/L4 or runtime-sensitive changes.

Do not mark a task complete solely because code was written. It is complete when
the intended behavior is implemented and the planned validation is run or an
explicit residual risk is recorded.

## Architecture Principles

### Contract First

Define or update contracts before implementation:

1. Types, DTOs, Proto/schema, commands, messages, or service interfaces.
2. Abstract ports, registries, provider interfaces, or adapters.
3. Concrete implementation.
4. Tests and documentation.

File organization should generally flow from abstract to concrete: types and
interfaces, abstract services/ports, concrete implementations, helpers, exports.

### Layering

Respect the dependency direction:

- Layer 0: host-agnostic contracts and pure utilities. No VSCode, React, DOM, or
  feature-package dependencies.
- Layer 1: VSCode/Extension Host adapters, commands, StatusBar, TreeView,
  Webview lifecycle, file/URI mediation.
- Layer 2: Webview React/DOM UI. No direct Node.js or VSCode API access.
- Rust engine: authoritative compute, render, media, file, device, and runtime
  execution.

Layer 0 packages such as `@neko/shared`, `@neko/neko-client`, Proto, market core,
and auth core must not depend on feature packages. Feature extensions should not
directly depend on other feature extensions; use shared contracts, command/API
facades, registries, or capability providers instead.

### VSCode And Webview Boundaries

- Webviews must not import `vscode`, Node APIs, or extension-only modules.
- Extension host code must not import React/ReactDOM or Webview implementation.
- Webview resources must be exposed through `webview.asWebviewUri(...)` and
  authorized `localResourceRoots`.
- Extension Host and Webview communicate through typed `postMessage` protocols.
- Every `vscode.Disposable` must be explicitly owned and disposed.
- Editor-bound panels belong inside the editor Webview when they depend on the
  active document/editor instance. Global/cross-editor surfaces should use VSCode
  native containers such as Activity Bar, Panel, TreeView, QuickPick, or
  StatusBar.

### Engine First

The Rust sidecar is the authority for:

- Source media/model/puppet/document/subtitle binary reads.
- Range reads, container entries, sibling model resources, and file tokens.
- GPU rendering, media decode/encode, stream lifecycle, device I/O, and heavy
  compute.
- Scene/runtime state, selection, transform, viewport control, preview modes,
  playback state, and authoritative deltas where an engine path exists.

TypeScript must not duplicate engine-owned computation as durable business logic.
Webviews may render UI, overlays, local predictions, and bounded previews, but
must reconcile with engine acknowledgements, deltas, snapshots, or diagnostics.

### Runtime Handles Are Not Persistent Identity

Persistent project data, Agent durable payloads, Canvas nodes, package manifests,
and export inputs must store stable refs, not runtime handles.

Allowed durable identities include:

- `ResourceRef` / `ResourceVariantRef`.
- `ContentFileSourceRef` using workspace-relative paths or `${VAR}/path`.
- `ContentDocumentSourceRef` plus locator and entry path.
- Promoted generated asset refs.
- Project-format-owned JSON data validated by the relevant SDK.

Do not persist:

- Absolute cache paths.
- Webview URIs.
- blob/object URLs.
- Engine tokens, stream ids, range URLs, preview token URLs, or WebSocket URLs.
- Legacy `cachePath` as source identity.

If a runtime handle has a stable source, resolve/register the source again on
resume. If it only has a token or cache path, report `missing-source`,
`non-portable`, or `unrecoverable` rather than guessing.

### Intent-Aware Content Access

Any cross-package content read must declare intent before choosing source,
cache, proxy, bytes, engine token, or Webview URI.

Common intents:

- `interactive-preview`: cache-first, preview variants, Webview projection.
- `agent-context`: bounded cache/preprocess-first with source/locator preserved.
- `edit-playback`: proxy or runtime stream allowed for responsiveness.
- `cache-materialize`: source to cache artifact.
- `final-export`: source-first, original file or engine source token.
- `package`: source-first, original file or container entry bytes.
- `verify`: source-first, original bytes/token for hash/probe/validation.

All content that becomes a durable project asset, generated result, package
entry, or media-library item must go through ingest/import/promotion. Export
outputs do not automatically replace project sources.

### Project Formats

Neko custom formats use the `nk*` JSON family. Durable files are human-readable,
Git-friendly, AI-readable JSON with explicit versioning and validation.

- Use JSON Schema/typed validators for durable project formats.
- Use Protobuf for engine communication, not for project file persistence.
- Standard media formats are read-only by default; editing creates or updates a
  project file and must not mutate the original media file.
- Migrations are immutable, versioned transforms. Higher-version files must fail
  clearly in older SDKs.
- New format fields should be optional during migration unless the change is a
  deliberate breaking format revision with migration strategy.

## Domain Principles

### Viewports And Streaming

Viewport architecture is H.264 video stream plus frame metadata plus independent
scene-control. Video frames show pixels; scene-control owns interaction
semantics.

For selection, transform, camera, preview mode, playback, bone/blendshape, live
compositor, or lookdev work:

- Do not infer authoritative semantics from pixels.
- Do not gate high-frequency visible feedback on ACKs.
- Hot paths such as camera orbit, drag, light move, wheel, keyboard camera, and
  continuous sliders must update local intent first and send latest-only updates.
- Hot paths must not restart streams, reset/recreate WebCodecs, suppress frames
  already submitted to hardware decode, or trigger encoder/GOP reconfiguration.
- Low-frequency authoring commands must return ack/reject and reconcile through
  deltas, snapshots, or frame metadata.
- Tests must prove control-state changes, not only video frame changes.

### Webview UI

Use `@neko/ui` primitives, creative controls, viewport shell, icons, hooks, and
test utilities when they fit the domain. Keep package-specific adapters in the
owning package.

Shared UI constraints:

- `@neko/ui` is React/DOM only and must not depend on feature packages.
- UI primitives own accessibility, keyboard behavior, theme integration, and
  stable public APIs.
- Domain packages own store wiring, command dispatch, engine/client calls,
  package-specific i18n, and specialized creative behavior.
- Keep Workbench-style creative editors consistent: left rail for common tools
  and panel toggles, main panel for creative surface, right panel for inspector
  or local sections, VSCode StatusBar for passive status.
- Agent conversation Header/Input is a separately guarded surface; do not migrate
  it into shared UI without a dedicated redesign change.

### Agent And AI Workflows

Neko Agent uses IDC: Draft, Plan, Apply, with Control as a cross-cutting layer,
not a fourth user stage.

Agent boundaries:

- Webview owns UI and projection only.
- Extension owns VSCode commands, Webview messages, workspace/file/URI access,
  lifecycle, and host adapters.
- Agent runtime owns turn assembly, workflow, skill/capability injection,
  prompt/schema generation, task/subagent orchestration, evaluation, and
  recovery policy.
- Platform owns provider/tool/capability bindings and media/perception routing.
- AI SDK owns provider-specific model and message projection.

Capabilities use Registration and Injection as separate phases. Registration
makes capabilities discoverable; injection decides when they enter model context.
Trust levels, host requirements, permissions, tool allowlists, workflow node
requirements, and ablation/policy gates must be explicit.

Skills are prompt-chain packages, not hidden workflow DAGs. Keep deterministic
metadata for cataloging, permissions, trust, and allowed tools. Keep creative
ordering and guidance in Markdown unless a separate runtime workflow contract is
explicitly designed.

Generated binary assets should be stored on disk or in managed resource cache and
passed as JSON refs/projections. Do not move base64 payloads through chat,
Webview messages, Canvas nodes, or package manifests as durable data.

### Entity, Search, And Cache

Creative entity, project search, and cache responsibilities must stay separate.

Entity constraints:

- `@neko/entity/core` owns confirmed creative entity facts, candidate lifecycle,
  entity-asset bindings, requirements, visual drafts, representation resolution,
  and entity change events.
- Confirmed entity facts, bindings, requirements, visual drafts, semantic
  evidence identities, and asset-library facts are Git-trackable project facts,
  not cache data.
- Entity identity is semantic and stable. Do not downgrade an entity into a
  plain asset file, thumbnail, cache row, search item, or Webview projection.
- Agent, Story, Assets, Dashboard, Search, Canvas, and Webviews may propose,
  project, display, or request entity changes, but confirmed entity mutations
  must go through entity-owned commands/services and review paths.
- AI may suggest entity, memory, evidence, binding, or representation updates,
  but must not silently overwrite user-confirmed facts.

Search constraints:

- `neko-search` owns derived search/index orchestration, provider fan-out,
  freshness, deterministic ranking, cache manifests, and Webview-safe search
  projections.
- Search does not own entity, asset, story, document, semantic evidence, memory,
  or generated-asset facts.
- Agent, Dashboard, Assets UI, Story UI, Preview, Canvas, and Webviews should
  query project search or host-mediated projections rather than parsing
  provider-specific JSON, semantic-index sidecars, or `.neko/.cache` files.
- `@neko/search/core` must stay host-agnostic and must not import VSCode, Agent,
  Story, Assets, Dashboard, React, Webview, or feature package implementations.

Cache constraints:

- `.neko/.cache/` is rebuildable derived storage. Deleting it must not delete or
  corrupt confirmed entities, bindings, requirements, memories, semantic
  evidence identities, asset libraries, story/document facts, or user-confirmed
  choices.
- Cache databases, search indexes, embeddings, thumbnails, document page images,
  generated previews, projected Canvas layout caches, and media metadata are
  accelerators or projections, never the source of truth.
- Resource cache owns cache identity, materialization, variants, projection
  readiness, freshness, quota, and garbage collection for cache-backed resources.
  Consumers pass `ResourceRef`/`ResourceVariantRef` and host APIs, not cache file
  paths or cache manifests.
- Webviews must not scan `.neko/.cache`, read resource cache manifests, or treat
  cache paths as portable identity.

### Marketplace, Plugins, And Trust

`neko-market` client installs, describes, manages, validates, and broadcasts. It
does not publish, review, sign, charge users, or own the server-side registry.

Market and plugin changes must preserve:

- Server-authoritative manifests, signatures, payments, publisher workflows, and
  review state.
- Client-side integrity verification, trust level handling, quota/conflict
  middleware, install target registry, reversible EffectsManifest uninstall, and
  cache invalidation.
- HTTP-only registry/client boundary.
- Explicit trust levels: `core`, `community`, `untrusted`.
- Untrusted or irreversible capabilities require explicit policy/approval and
  must not be injected or executed by default.

### Assets, Documents, And Local Resources

Webview local resource access must use the shared `LocalResourceAccessService`.
Do not hand-roll `localResourceRoots` or direct file URI projection in business
providers.

System temp directories are scratch only, not Webview preview roots. Previewable
temporary outputs must live under `globalStorageUri` or workspace `.neko/.cache`
and be projected through the unified service. Cross-package visual resources
should pass stable `ResourceRef` or source/locator refs.

Documents and archive entries must retain semantic source and locator. Preview
page images or extracted document cache images are derived evidence, not original
package/export sources.

## Quality Gates

Classify each change before implementation:

- L0: docs, copy, low-risk single-file fix.
- L1: local component, hook, service, or state logic.
- L2: Webview/Extension message path, shared package, public type, EngineClient,
  imports/exports, cross-package contract.
- L3: Rust engine, Proto, media streams, rendering, project format, AI workflow,
  packaging, marketplace trust, file/resource access.
- L4: release, installation, major UX, core creative workflow.

Before review, answer:

1. Does this fit the existing architecture?
2. How does this reduce coupling?
3. Is it easy to extend and test?

Validation expectations:

- L0: focused check, screenshot, or doc review as appropriate.
- L1: focused unit tests and minimal build/typecheck for touched package.
- L2: contract tests, message/schema tests, dependency-boundary checks, and
  relevant package builds.
- L3: architecture review, unit/contract/integration tests, smoke or fixture
  validation, performance or UX evidence where relevant.
- L4: full local/CI gate, install/package smoke, runtime smoke, UX evidence, and
  explicit residual risk.

Recommended commands by impact:

- TypeScript/Webview/Extension: `pnpm ci:local` or narrower package tests/builds.
- Rust engine: `pnpm ci:local:rust` or targeted `cargo test`/`cargo clippy`.
- Proto: `pnpm ci:local:proto`.
- Architecture: `pnpm check`, plus `pnpm check:agent-boundaries` for Agent work.
- Smoke: `pnpm smoke:engine`, `pnpm smoke:webview`, or focused VSCode debugger
  smoke when runtime behavior, Webview lifecycle, or UX is affected.

When validation cannot be run, record why, what risk remains, and what follow-up
will close it.

## Coding Standards

- Keep TypeScript `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride`.
- Do not introduce production `any`; use `unknown` and type guards.
- Avoid unsafe `as Type` assertions.
- Use project Logger APIs instead of `console.log` for production logging.
- Handle async errors, cancellation, timeouts, resource disposal, and race
  boundaries.
- Use configuration, constants, schemas, or settings for variable behavior; do
  not hard-code user paths, ports, thresholds, or environment-specific state.
- Store relative paths or `${VAR}/path` in durable project data.
- Prefer dependency injection, small interfaces, registries, strategies, and
  event-driven communication over direct package coupling.
- Keep comments concise and useful; explain non-obvious constraints rather than
  restating code.

## Documentation Rules

Update documentation when behavior, public contracts, package entry points,
architecture constraints, file formats, configuration, install behavior, or user
workflows change.

Prefer Chinese documentation updates for user/project-facing docs when a Chinese
version exists. Keep English docs in sync when semantics change.

New architecture decisions should either update the relevant ADR or create a new
ADR/OpenSpec change that links to the affected ADRs.

## Important References

- `ARCHITECTURE_CN.md`: system architecture overview.
- `README_CN.md`: package maturity and validation commands.
- `docs/architecture/adr-code-review-quality-gates.md`: review, risk, and
  validation model.
- `docs/architecture/vscode-constraints.md`: VSCode panel and device boundaries.
- `docs/architecture/engine-runtime-layering.md`: engine host/runtime split.
- `docs/architecture/engine-file-access.md`: engine-owned binary file boundary.
- `docs/architecture/intent-aware-content-access.md`: content access and ingest.
- `docs/architecture/local-resource-access.md`: Webview local resource roots.
- `docs/architecture/project-cache-search-service.md`: project search, cache,
  and host-mediated projections.
- `docs/architecture/neko-entity.md`: neutral creative entity runtime and fact
  ownership.
- `docs/architecture/creative-entity-asset-composition.md`: entity, asset,
  binding, and representation boundaries.
- `docs/architecture/format-strategy.md`: `nk*` JSON format strategy.
- `docs/architecture/adr-viewport-stream-control-boundary.md`: viewport stream
  and control invariants.
- `docs/architecture/adr-webview-ui-design-system.md`: shared Webview UI system.
- `docs/architecture/adr-webview-layout-unification.md`: creative workbench
  layout contracts.
- `docs/architecture/agent-unified-workflow.md`: Agent IDC workflow and runtime
  boundaries.
- `docs/architecture/adr-capability-protocol.md`: capability registration,
  injection, and trust.
- `docs/architecture/agent-media-architecture.md`: generated assets and rich
  media handoff.
- `docs/architecture/marketplace.md`: market client/server boundary.
