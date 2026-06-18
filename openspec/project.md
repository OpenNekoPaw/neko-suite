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
- Keep design complexity proportional to a local VSCode client plus local Rust
  Engine. Do not import cloud multi-tenant, distributed-service, remote-scale, or
  speculative platform architecture unless a real external provider, release, or
  trust boundary requires it.
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
  For Extension Webview visuals/interactions, Webview runtime smoke means
  Extension Development Host plus the `vscode-extension-debugger` Skill by
  default. Chrome, the generic Browser plugin, Playwright, or a Vite dev server
  in a regular browser must not be used as the default acceptance surface unless
  the user explicitly asks for browser-compatibility validation.
- Proportionality: why is each abstraction, registry, factory, feature flag,
  config layer, fallback, retry, or guard required for this local client/engine
  boundary now?
- Fail-visible behavior: which contract mismatches, unreachable states,
  unimplemented paths, missing dependencies, illegal messages, unknown
  schema/version values, bad configuration, or unregistered handlers/renderers
  fail directly instead of falling back, returning empty data, returning success,
  or no-oping?

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

### Prelaunch Breaking Migrations

Neko Suite is prelaunch. OpenSpec changes may choose deliberate breaking
migrations for unreleased or internal project formats, DTOs, commands, runtime
payloads, and workflow contracts when doing so removes legacy debt or keeps the
canonical architecture clearer than maintaining compatibility shims.

Prelaunch status does not mean version compatibility is ignored. The default is:
break unreleased internal compatibility deliberately when it simplifies the
architecture, but keep every breaking change diagnosable, reviewable, and
recoverable.

Allowed prelaunch breaking changes:

- Replace internal APIs, DTOs, commands, Webview messages, Agent workflow
  payloads, and fixtures without long-lived compatibility shims.
- Delete old compatibility shims, legacy adapters, fallback branches,
  dual-read/dual-write paths, old field mappings, and legacy command aliases
  when a canonical replacement is introduced, so validation exercises the new
  path instead of silently falling back to the old path.
- Revise unreleased `nk*` project drafts, local test fixtures, package manifests,
  or runtime payloads when old data can be rebuilt, reimported, regenerated, or
  intentionally discarded.
- Remove legacy fallback fields, adapters, and compatibility bridges when the
  canonical path is covered by tests or the remaining debt is tracked in a
  ledger.

Not allowed under the name of prelaunch cleanup:

- Ignoring VS Code, Node, pnpm, Rust, OS, Webview sandbox, CSP, codec, Range,
  Engine, Proto, or marketplace trust boundaries.
- Silently deleting or corrupting valuable local project data, user settings,
  trust state, entitlements, plugin install records, or generated artifacts.
- Accepting higher-version durable files without fail-closed diagnostics.
- Adding broad compatibility shims without owner, replacement, validation, and
  removal criteria.
- Keeping legacy paths as default fallbacks after a canonical replacement exists,
  because this hides broken new behavior and creates conflicting sources of
  truth.

Breaking migrations must be explicit, not incidental:

- State in the proposal or design what is breaking and why prelaunch cleanup is
  the better tradeoff.
- Identify affected files, contracts, persisted state, fixtures, and user
  workflows.
- Define whether existing data is migrated, rebuilt, reimported, ignored, or
  intentionally discarded.
- Add validation tasks for load/save, contract fixtures, failure diagnostics,
  and any migration or rebuild path.
- Remove obsolete compatibility code in the same change when possible. If a shim
  remains, state the owner, replacement path, validation command, removal
  condition, and follow-up task.
- Disable compatibility fallback by default while developing and validating the
  new path. If execution reaches a legacy path, it must throw, return a
  fail-closed diagnostic, or emit assertable telemetry/log failure instead of
  returning a legacy success result. Only tests explicitly scoped to migration,
  rejection, or diagnostics may intentionally observe the legacy path.
- Do not let fallback or compatibility logic hide code defects. Missing new
  implementations, contract mismatches, illegal states, unknown messages, bad
  configuration, or unregistered handlers/renderers/adapters should fail visibly
  instead of falling back to old implementations, empty data, success defaults,
  or no-ops.
- Require path-level acceptance for new paths. Do not accept result-only tests
  that can pass through fallback behavior. Tests must assert that the canonical
  path, new handler, new renderer, new adapter, or new contract was hit, and
  prove the legacy path did not participate with a spy, counter, log assertion,
  or poisoned legacy path that throws.
- Validate that the canonical path is hit by default. If the legacy path remains
  reachable, guard it behind an explicit feature flag, migration-only entry,
  fail-closed diagnostic, or telemetry/log assertion, and add tests proving it
  cannot return success for new-path requests or mask new-path failure.
- Do not count tests that pass through legacy fixtures, old field fallback, old
  message handlers, old renderers, or legacy command aliases as acceptance
  evidence for the new path. Split those into migration/diagnostic tests.
- Avoid compatibility shims unless they protect valuable local data, an already
  documented public contract, or an external trust/runtime boundary.
- If old data is intentionally ignored or discarded, explain why it has no
  migration value and how users or tests recover.

Even before launch, do not break security or trust state, marketplace/plugin
governance, external provider contracts, published release artifacts, or durable
user data without explicit migration, rollback, or user-confirmation semantics.

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

### Shared Foundation Services

Use the repository's shared foundations for cross-cutting concerns. Do not create
package-local parallel systems for internationalization, theming, styling,
logging, errors, config, path resolution, or shared DTOs unless an ADR/OpenSpec
change explicitly introduces a replacement or extension.

Shared foundation expectations:

- Use `@neko/shared` (`packages/neko-types`) as the default source for Layer 0
  logger contracts, i18n core, theme tokens, error abstractions, config/path
  helpers, validators, and shared DTOs.
- Before implementing cross-cutting behavior, perform a shared foundation audit
  for component styling, theming, i18n, logging, errors/diagnostics, config,
  paths, project file save/load, resource authorization, cache, DTOs, and
  cross-package contracts. Decide whether to reuse an existing foundation,
  update a shared contract/adapter, or keep the logic in the owning package.
- Do not create package-local design systems, theme token sets, i18n runtimes,
  logger/error taxonomies, project file IO helpers, cache managers, path
  resolvers, Engine HTTP/WS clients, or shared DTO copies in feature packages.
- If the change intentionally does not update a shared foundation, record why,
  the owning boundary, extraction criteria, and validation command in OpenSpec,
  PR notes, or the delivery summary.
- Before implementing reusable package capability patterns, perform a
  cross-package capability reuse audit. This applies to providers, registries,
  bridges, protocols, message routers, status bars, tree views, file
  decorations, history, selection, recent items, projectors, facades, command
  routers, capability providers, store slices, workflow adapters, and similar
  package capability patterns.
- Search adjacent feature packages and shared layers for equivalent behavior,
  interaction patterns, host adapters, protocol shapes, or reusable tests. When
  two or more packages need the same pattern, prefer a neutral shared contract,
  domain service, adapter factory, registry, strategy, hook, test utility, or
  `@neko/ui` primitive.
- Do not copy another feature package implementation or import another feature
  package's internals. Reuse through shared packages, public subpaths,
  command/API facades, ports, provider registries, or domain services.
- Keep package-local implementations only when responsibility, lifecycle,
  domain semantics, dependency direction, or runtime environment is genuinely
  different. Record the audit, non-reuse reason, extraction criteria, and
  validation command.
- Use `@neko/ui` for reusable Webview React controls, creative UI primitives,
  keyboard/focus behavior, accessibility affordances, and theme-aware UI
  composition when a suitable primitive exists.
- Before adding a new Webview/React component, perform a component reuse audit:
  search `@neko/ui`, the owning package's `components/`, `hooks/`, `shared/`,
  adjacent domain packages, and existing tests. Prefer enhancing an existing
  component with props, slots, variants, composition hooks, or package-local
  adapters over generating a parallel component.
- Add a new component only when responsibility, state lifecycle, interaction
  contract, accessibility semantics, or domain boundary is genuinely different,
  and when enhancing an existing component would increase coupling or break
  existing users. Record the audit in OpenSpec, PR notes, or the delivery
  summary.
- Use the shared Tailwind preset, VSCode CSS variables, and shared theme tokens
  for Webview styling. Avoid package-local design systems, hard-coded color
  palettes, duplicated spacing scales, or one-off component styling that should
  be a shared primitive.
- User-visible strings in Webviews, VSCode commands, notifications, menus,
  errors, empty states, and status text must go through the owning package's i18n
  bundles or shared i18n services. Keep supported locales in sync when a package
  has both English and Chinese bundles.
- DTO labels from providers are data or fallback text, not permission to skip
  UI-layer translation for known chrome, actions, statuses, or validation
  messages.
- Production logging must use the project Logger abstractions and package
  logger registries. Do not use `console.log` as formal logging, and do not
  invent feature-specific logger interfaces when `ILogger` or a narrow injected
  logger port is enough.
- User-facing and cross-boundary errors should use shared error contracts such as
  `BaseError`, typed command/error DTOs, diagnostics, or `IErrorHandler`/VSCode
  error reporters as appropriate. Preserve machine-readable error codes and
  safe context; do not pass raw provider errors or stack traces directly to
  Webviews or durable artifacts.
- Respect subpath layering: Extension Host may use `@neko/shared/vscode/extension`;
  Webviews may use Webview/React-safe subpaths; Layer 0 code must not import
  DOM, React, VSCode, or Node-only foundation adapters.

### VSCode And Webview Boundaries

- Webviews must not import `vscode`, Node APIs, or extension-only modules.
- Extension host code must not import React/ReactDOM or Webview implementation.
- Webview resources must be exposed through `webview.asWebviewUri(...)` and
  authorized `localResourceRoots`.
- Webview CSP must default deny and only open explicit script/connect/media
  sources. Native `<video>`/`<audio>` use is limited by VS Code media codec
  support; unsupported or seek-heavy media must use Engine probe, file-access
  Range endpoints, compatible proxy, or stream descriptors.
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

### Engine Access Path

TypeScript packages should call `neko-engine` through `@neko/neko-client`
(`EngineClient` and stream clients) whenever an engine HTTP/WS/file/stream path
exists.

Engine access expectations:

- Extension packages obtain the shared sidecar endpoint through the engine host
  command/API, then inject the endpoint into `EngineClient`; they should not
  create package-local HTTP clients, WebSocket clients, port discovery, or file
  token protocols for engine access.
- Webviews must not discover engine ports, register engine files, or invent
  engine protocol calls directly unless a documented ADR/OpenSpec route
  explicitly allows direct Webview HTTP for a bounded preview path. Even then,
  source registration, authority, and stable refs remain Extension/EngineClient
  responsibilities.
- Engine file access must go through `ContentAccessService` and
  `EngineClient.registerFile(...)` before using file tokens, range URLs, sibling
  resource URLs, or engine source refs.
- New engine actions, stream contracts, file-access helpers, and runtime DTOs
  should update Proto/shared contracts and `@neko/neko-client` helpers before
  feature packages consume them.
- Direct calls to `neko-engine` host HTTP/WS/N-API/CLI from feature packages are
  exceptions, not the default. Record the reason, scope, lifecycle owner, and
  tests in the OpenSpec design if a direct path is required for bootstrapping,
  smoke tests, CLI tooling, or an engine host package itself.

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
- Prelaunch format revisions may break old drafts, but the change must still
  declare whether existing files are migrated, rebuilt, reimported, ignored, or
  intentionally discarded.

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
- Do not create package-local copies of existing buttons, selectors, panels,
  empty states, toolbars, lists, cards, input surfaces, Header/Input patterns, or
  creative primitives without a recorded reuse audit.
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
4. For cross-cutting behavior, which shared foundation or domain service was
   reused or updated, and why was package-local logic acceptable if not?
5. For reusable package capability patterns, which other packages and shared
   layers were audited before adding package-local capability code?
6. For Webview/React changes, which existing components, hooks, shared
   primitives, or tests were audited before adding any new component?

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
- Residual/debt terms or redundant code: `pnpm check:legacy-debt` and
  `pnpm check:unused`, or record that `pnpm ci:local` / `pnpm check:quality`
  covered them.
- Smoke: `pnpm smoke:engine`, `pnpm smoke:webview`,
  `pnpm smoke:webview:runtime`, or focused VSCode debugger Skill smoke. Use
  Webview runtime smoke by default when Extension Webview visuals,
  interactions, CSP, media, Webview lifecycle, or UX are affected.

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

New architecture decisions should update the root architecture overview or add
a concise OpenSpec/design note that captures stable boundaries, invariants,
risks, and consequences. Do not recreate implementation logs as architecture
records.

## Important References

- `ARCHITECTURE_CN.md`: system architecture overview.
- `README_CN.md`: product shape, package groups, and validation commands.
- `TODO_CN.md`: active work queue.
- `ROADMAP_CN.md`: directional product roadmap.
- `AGENTS.md`: repository working rules and quality gates.
- Package-level `README.md`, `ARCHITECTURE.md`, and `TODO.md`: local package
  entry points when they exist.
