## Context

Agent currently has several file/content access paths:

- `ReadImage` resolves a path, authorizes it, and reads image bytes directly in the tool.
- `ReadDocument` delegates parsing to `DocumentReaderService`, but whole-file binary reads still use Extension `fs.readFile`.
- `ReadDocument` and `ReadDocumentImage` directly receive `ResourceCacheService` and materialize document entries from tool code.
- Perception asset loading, attachment processing, and image media preprocessing read local binary bytes directly before sending provider-ready payloads.
- Document image outputs have mostly been sanitized so cache paths are not public results, but the implementation still lets tools reason about cache service and sometimes recover refs from cache paths.

The stable architecture now states:

- `neko-engine` owns binary/media source reads, Range, container entry, sibling resource, decode, probe, preview/proxy/thumbnail derivation.
- `ProjectFileStore` / Host text adapters own pure text, configuration, and JSON `nk*` project facts.
- `ResourceCacheService` owns transparent cache paths, variants, fingerprint, MD5/content de-duplication, materialization, rebuild, invalidation, projection, and GC.
- `ContentAccessService` owns intent-based orchestration between source files, Engine file access, cache, bytes, local paths, engine sources, and Webview projection.
- Agent, Skill, Webview presenter, Canvas, Storyboard, and composite payloads must not rely on cache paths, runtime scratch paths, Webview URIs, blob URLs, or Engine tokens as durable identity.

This is an L3 Agent/AI + shared foundation + Engine file access change. It touches tool contracts, Extension Host services, platform document/media services, shared content/cache adapters, and provider multimodal input paths.

### Current layering findings to address

The boundary audit found that hard import rules are mostly respected, but several host-specific projection concepts still leak into host-agnostic Agent/Platform contracts:

- `agent-types` and `platform` expose `WebviewGeneratedAsset` / `webviewUri` in work item and media task result contracts. These are runtime Webview handles, not durable resource identity.
- `agent/runtime` exports `runAgentTurnForWebviewRuntime`, `AgentStreamWebviewMessage`, `runAgentMediaTurnForWebview`, and Webview-named presenter APIs. They do not import VS Code or React, but they make the Webview protocol a first-class runtime concept and force TUI/other hosts to share Webview naming.
- Extension media delivery currently has a projection fallback that can return a raw local path when Webview URI conversion fails. This hides authorization/projection failure and makes local/cache paths look renderable.
- `message-resource-projector` still scans arbitrary result shapes for local media paths, `image_paths`, `cachePath`, and related runtime/cache fields, then injects `webviewUri` or diagnostics. That keeps cache/Webview projection policy inside Agent runtime instead of the unified content-access boundary.
- `cli-tui` media save output still surfaces `.neko/.cache/generated/` as the successful user-facing location. Cache paths must remain transparent implementation details, even in TUI.
- Existing tests still assert old cache-path/Webview projection behavior, including `documentResourceRef.cachePath` and `imagePathWebviewUris` derived from `.neko/.cache/resources/...`. These fixtures must be migrated to stable refs or explicit rejection/diagnostic tests.

These findings are in scope for this change because they block the same architectural goal: Agent and upper-layer UI code should operate on source refs, `ResourceRef`s, asset/entity IDs, and host-neutral projection DTOs, while cache paths and runtime handles are decided by Host-side content access and projection services.

### Agent platform directory boundary

`packages/neko-agent/packages/platform/src` can contain `files`, `document`, and `media` directories only when they model Agent platform domain orchestration, request/response DTOs, validation, planning, and provider-independent task policies. The directory names are not themselves a violation. They become a violation when the platform package owns binary/media IO, cache directory layout, Webview URI projection, or long-lived local path identity.

Allowed responsibilities:

- `platform/src/files`: file-operation plans for Agent/platform settings, text/config creation, and host-executed file operations. It may describe a plan and accept an injected Host filesystem executor, but it must not become the Agent binary/media file service.
- `platform/src/document`: document-domain parsing contracts, manifests, ranges, locators, image metadata, and document access abstractions. Low-level binary/container bytes, sibling resources, and page image materialization must be injected from Engine/content access/cache services. Parser scratch, when unavoidable, is internal implementation state and must not leave the service boundary.
- `platform/src/media`: provider request shaping, generation task orchestration, progress/result planning, generated asset metadata, and delivery plans. It may build stable asset refs and host-neutral render projections, but Extension/TUI own Webview URI conversion, notifications, terminal formatting, and file-opening side effects.

Forbidden responsibilities:

- deciding public cache paths such as `.neko/.cache/resources`, `.neko/.cache/generated`, or document-reader scratch directories;
- directly reading binary/media input files from Agent-facing request assets;
- exposing `localPaths`, `cachePath`, `runtimePath`, `webviewUri`, `WebviewGeneratedAsset`, blob URLs, Engine tokens, or cache-derived `${WORKSPACE}/.neko/.cache/...` values as Agent/Platform/Webview stable identity;
- using Webview projection failure to fall back to raw filesystem paths;
- requiring Agent tools, skills, memory, Canvas transfer, Storyboard transfer, or Webview presenters to understand cache rebuild or cache directory rules.

This means the current `files`, `document`, and `media` directories should be retained only for domain-level contracts and orchestration. Any code in those directories that performs host IO must do so through injected services and must be classified as one of: Host text/config IO, Engine/content-access binary IO, resource cache materialization, or host presentation side effect.

### Residual legacy/debt audit

The current implementation still has residual surfaces that are not the desired long-term boundary:

- `platform/src/media/generated-asset-index.ts`, `media-file-downloader.ts`, `media-task-result.ts`, and `media-task-delivery-settings.ts` still implement generated-output persistence under a managed workspace cache/output directory. This is Host output persistence debt, not Agent tool input access. The Agent-visible result must expose stable generated asset refs such as `generated-assets/<asset-id>.<ext>` and render projections, while the physical file path remains Host-only for indexing, projection, and "Show in Folder" side effects. Long-term, this should sit behind a generated asset/content cache service rather than platform-local path helpers.
- `platform/src/media/media-generation-service.ts` and delivery plans still use local path arrays internally to coordinate save/projection/notification. These arrays must not cross into Agent work item results, Webview stable DTOs, TUI success text, or persisted skill/tool contracts.
- `platform/src/document/document-reader.ts` can still require parser/runtime scratch for third-party document libraries. That scratch is parser-private and rebuildable; it must not be exposed as `runtimePath`, `runtimeKind`, cache identity, or transfer payload. A future cleanup can inject a scoped scratch/temp provider from the Host boundary.
- Webview presenters can still display legacy payloads for migration/diagnostic purposes, but new successful paths must use `renderUri`, source refs, document refs, or `assetRef`; they must not promote legacy `localPath`, `imagePaths`, `cachePath`, or `webviewUri` fields into durable handoff payloads.
- Boundary exceptions for `qualityCheckTools.ts` and `consistencyCheckTools.ts` remain tracked compatibility bridges with renewal metadata. They must not hide direct binary reads, cache-path recovery, or new content-access bypasses.

Residual code is therefore not classified by filename alone. `legacy`, `deprecated`, or dead-code cleanup should remove or quarantine behavior that violates the boundary above; code that remains must be either active domain orchestration, Host-side adapter behavior, migration-only diagnostics, or explicitly tracked debt with replacement criteria.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Agent tools own user-facing tool contracts and diagnostics, not cache path rules or binary file IO. `AgentContentAccessRuntime` owns Agent-specific content-access wiring and callers. `ContentAccessService` owns intent routing. `ResourceCacheService` owns cache lifecycle. Engine owns binary/media reads and media-derived artifacts. Text/project-file services own pure text and `nk*` facts. |
| Dependency | Agent runtime stays independent of VS Code, React, Webview, Extension, and TUI renderers. Extension Host builds the concrete content-access runtime using VS Code, EngineClient, local resource access, resource cache, path resolver, and document providers. Webview and TUI adapters receive host-neutral runtime events/DTOs and convert them to UI-specific protocol/rendering. Layer 0 shared services remain feature-package agnostic. |
| Interface | Introduce narrow Agent-facing methods for `resolveImageMetadata`, `resolveDocumentContent`, `resolveDocumentImages`, `loadProviderAsset`, and `projectResource`, or a small request/response API around `ContentAccessRequest`. Tool inputs/outputs keep stable refs, source refs, metadata, attachments, and perception cards; they do not expose cache paths, raw local display paths, `webviewUri`, or Webview-specific generated asset DTOs. |
| Extension | Future Agent tools for audio, video, OCR, ASR, thumbnails, generated assets, or document snippets should add content-access intents/providers instead of adding direct `fs.readFile`, local cache lookup, or tool-local path resolver branches. |
| Testing | Add unit tests with poisoned direct-read deps, spy content-access providers, fake Engine file access, fake resource cache provider, and legacy cache-path rejection tests. Keep focused TypeScript builds and relevant shared/extension/agent/webview tests. Runtime Webview smoke is only needed if projection UI behavior changes. |

## Goals / Non-Goals

**Goals:**

- Provide a single Agent content-access runtime/facade for Agent tools, perception assets, and attachment/media preprocessing.
- Route binary/media source reads through Engine file access or content-access providers rather than tool-local `fs.readFile`.
- Keep pure text/config/project fact reads outside Engine and explicit in the runtime.
- Keep document image cache materialization transparent to tools and payloads.
- Prevent cache paths, scratch paths, Webview URIs, blob URLs, Engine tokens, and legacy `cachePath` fields from succeeding as durable Agent resource identity.
- Remove Webview/TUI-specific projection DTOs and naming from host-agnostic Agent/Platform contracts, keeping UI protocol conversion in owning adapters.
- Ensure Extension bridge projection fails visibly instead of returning raw local/cache paths as display URIs.
- Ensure TUI terminal output does not present managed cache paths as the successful stable output location.
- Preserve fail-visible diagnostics when required services are absent, unsupported, unauthorized, stale, missing, or non-portable.
- Keep implementation proportional to a local VS Code client plus local Rust Engine: no cloud file service, no distributed cache abstraction, no speculative multi-tenant policy layer.

**Non-Goals:**

- Do not replace `ResourceCacheService`; reuse it behind content-access orchestration.
- Do not make Engine read pure text/config/project facts.
- Do not redesign every package's media preview stack in this change.
- Do not introduce new public Engine file APIs unless current `EngineClient.registerFile`, range, entry, probe, and preview APIs cannot satisfy a required path.
- Do not preserve old cache-path fallback behavior for new requests.

## Decisions

1. **Introduce an Agent content-access runtime in Extension Host.**

   The runtime is built once per Agent capability/session boundary and injected into tools and provider asset loading. It wraps:

   - `ContentAccessService` for intent routing,
   - `ResourceCacheService` for provider-backed cache materialization and projection,
   - `EngineClient` file access for binary/media source reads,
   - `PathResolver` and media library root policy,
   - `LocalResourceAccessService` for Webview URI projection,
   - document reader/access services for text, manifest, range, cursor, and document entries.

   Rationale: tools need a small, stable contract; direct injection of `ResourceCacheService`, file policies, path resolver, Engine client, and `fs` into each tool repeats policy and makes cache paths observable.

   Alternative considered: keep passing `ResourceCacheService` and `readFile` to each tool. Rejected because it preserves the current coupling and cannot prove tools avoid cache-path and binary direct-read fallback.

2. **Use content-access intents instead of path-shape decisions.**

   Agent callers must declare intent and target:

   - `agent-context` for bounded model context and provider-ready assets,
   - `interactive-preview` for Webview/tool result display,
   - `cache-materialize` for cache variants,
   - `verify` for metadata/probe/fingerprint,
   - `final-export`/`package` only when a future Agent workflow explicitly needs source-first export behavior.

   The implementation may expose typed convenience methods, but internally they map to intent-based requests.

   Rationale: a local path, `ResourceRef`, or document source can validly resolve to different targets depending on intent. Guessing from file extension or path prefix reintroduces hidden fallbacks.

   Alternative considered: create separate `ImageFileReader`, `DocumentCacheResolver`, and `ProviderAssetReader` services. Rejected because those services would duplicate routing policy and diverge as new source types are added.

3. **Keep Engine binary authority separate from cache authority.**

   Engine file access is used for binary/media source bytes, range, container entries, sibling resources, probe, decode, and preview derivation. `ResourceCacheService` remains the only owner of cache paths and cache lifecycle. Engine-produced preview/proxy/thumbnail artifacts can become cache provider outputs, but Engine does not decide long-term resource cache layout or manifest entries.

   Rationale: this matches the product boundary and avoids turning Engine into a project/cache database.

   Alternative considered: make Engine the universal file service for both binary and text. Rejected because pure text/project facts need schema diagnostics, path contraction, atomic write, and host lifecycle behavior owned by Extension/shared project-file services.

4. **Split document access by source type while keeping tool output stable.**

   `ReadDocument` uses text/project-file service for text-like formats. For binary/container formats it uses document access backed by Engine file access for range/entry/whole-file binary needs. Document images are returned as semantic metadata plus stable `DocumentArchiveResourceRef`; any materialized path is internal to cache/content access.

   Rationale: document formats span plain text and binary containers. A single "always Engine" or "always fs" path would violate one side of the boundary.

   Alternative considered: require every document parse through Engine. Rejected because text documents do not need Engine, and adding Engine dependency to simple text reads would reduce reliability.

5. **Remove cache-path recovery as a default success path.**

   New tool requests must use source refs, document refs, `ResourceRef`, workspace-relative paths, `${VAR}/path`, or asset/entity IDs. If a request provides `.neko/.cache/resources`, `document-reader` scratch, legacy `cachePath`, `runtimePath`, `cacheResourceRef`, Webview URI, blob URL, or Engine token as durable identity, the runtime returns a diagnostic. Migration-only tests may still observe legacy fields as rejected input.

   Rationale: allowing cache paths to recover refs encourages upper layers to depend on cache layout and breaks rebuild/GC semantics.

   Alternative considered: keep `resourceCache.findByLocalPath()` for convenience. Rejected for new-path success because it makes cache paths a hidden API.

6. **Use fail-visible service availability.**

   If binary/media access requires Engine and Engine is unavailable, the Agent tool returns a diagnostic such as `engine-file-access-unavailable`, `unsupported-source`, or `unauthorized`, rather than silently falling back to direct `fs.readFile`. Local text reads can continue through text/project-file services.

   Rationale: hidden fallback masks the canonical path and makes path-level acceptance impossible.

   Alternative considered: fallback to Extension `fs.readFile` when Engine is down. Rejected for binary/media paths because it violates the Engine boundary and lets tests pass without the required service.

7. **Migrate tests to path-level acceptance.**

   Tests should assert the canonical runtime path was hit using spies/counters and poisoned legacy direct-read functions. Example assertions:

   - `ReadImage` calls Agent content access / Engine-backed provider for image bytes.
   - `ReadDocument` binary/container range and entry reads use Engine-backed document access.
   - document image materialization happens behind content access/cache providers, not in tool code.
   - provider asset loading uses content access and rejects cache-path identity.
   - legacy fields fail closed and cannot return success for new requests.

   Rationale: result-only tests can pass through fallback and hide architecture regressions.

8. **Keep runtime events host-neutral and project at the adapter edge.**

   Agent runtime should produce host-neutral turn, stream, media task, context, skill, and conversation events or DTOs. Webview-specific message names and schemas are built by the Extension/Webview bridge. TUI-specific formatting is built by `cli-tui`. Runtime exports may keep temporary compatibility aliases only when tracked with owner, replacement, expiry, and boundary tests.

   Rationale: Webview protocol is one consumer of Agent runtime, not the runtime contract itself. Keeping the runtime host-neutral avoids forcing TUI, tests, and future hosts to depend on Webview semantics.

   Alternative considered: keep `ForWebview` helpers in runtime because they are pure functions. Rejected for new APIs because pure functions can still encode the wrong dependency direction and keep cache/Webview projection policy in the wrong layer.

9. **Use stable generated asset contracts below the host projection layer.**

   `GeneratedAsset`, `ResourceRef`, content source refs, and asset/entity IDs are allowed in `agent-types`, `agent`, and `platform`. `WebviewGeneratedAsset` and `webviewUri` are only allowed in Extension/Webview projection adapters or short-lived Webview UI state. Platform media task projection must accept host-provided projection results without owning Webview DTO types.

   Rationale: generated asset identity is durable; Webview URI is a runtime handle derived from host authorization and current Webview instance.

   Alternative considered: keep `WebviewGeneratedAsset` as a convenient shared type. Rejected because it lets host-agnostic packages accidentally persist or reason about runtime handles.

10. **Extension projection must not fallback to raw paths.**

   When `LocalResourceAccessService` or `ResourceCacheService.project()` cannot produce a Webview-safe URI, Extension bridge code must return a typed diagnostic or omit the renderable projection. It must not set `webviewUri` to a local path, cache path, or unverified source URL.

   Rationale: raw-path fallback bypasses authorization, hides projection bugs, and contradicts Webview sandbox rules.

   Alternative considered: keep raw path fallback for local debugging. Rejected for production paths; debug output can live in diagnostics/logs, not renderable DTO fields.

## Risks / Trade-offs

- [Risk] The first content-access facade becomes too broad. -> Mitigation: start with Agent-specific methods for current callers and map them to shared `ContentAccessService`; do not build a universal file manager.
- [Risk] Engine unavailability blocks image attachment paths that previously worked by direct file read. -> Mitigation: return clear diagnostics and keep pure text paths independent of Engine; add tests for unavailable Engine behavior.
- [Risk] Document parsing libraries still need full file bytes for some binary formats. -> Mitigation: implement an Engine-backed whole-binary provider or scoped temp materialization behind document access, not in tool code.
- [Risk] Removing cache-path recovery breaks unreleased sessions or fixtures. -> Mitigation: prelaunch cleanup rejects or rebuilds old cache-only payloads; add migration/rejection tests and update fixtures.
- [Risk] Multiple existing runtimes create duplicate cache/service instances. -> Mitigation: centralize creation in Agent capability/session bootstrap and inject the same runtime into document/media tools and perception loader.
- [Risk] Some media preview/thumbnail code outside Agent remains unconverted. -> Mitigation: keep this change scoped to Agent call paths, but document follow-up work for broader package convergence.
- [Risk] Renaming Webview-specific runtime APIs creates churn across Extension tests and bridge code. -> Mitigation: migrate behind compatibility aliases only when tracked, and add boundary tests that prevent new host-specific runtime APIs.
- [Risk] Removing raw-path projection fallback reveals previously hidden local preview failures. -> Mitigation: surface actionable diagnostics and assert projection failure paths in tests.
- [Risk] TUI users lose an immediately visible cache output path. -> Mitigation: display stable saved asset/output identity or configured output location, not managed cache internals.

## Migration Plan

1. Add Agent content-access runtime interfaces and fake implementations for tests without changing tool behavior.
2. Wire the Extension Host concrete runtime using existing `ContentAccessService`, `ResourceCacheService`, EngineClient file access, document access, local resource access, and path resolver.
3. Migrate `ReadImage` to call the runtime for image metadata/provider-ready assets and remove direct binary `fs.readFile` from the tool.
4. Migrate `ReadDocument` and `ReadDocumentImage` so document binary/container reads and document image materialization go through the runtime; keep text reads on text/project-file access.
5. Migrate perception asset loader, attachment processor, and media preprocessor image paths to the same runtime.
6. Remove or quarantine `resourceCache.findByLocalPath()` cache-path recovery from default new-path flow.
7. Replace Webview-specific Agent/Platform DTOs with host-neutral generated asset/resource projection contracts; move `webviewUri` enrichment to Extension/Webview adapters.
8. Rename or quarantine `ForWebview` runtime exports behind host-neutral runtime APIs and adapter-layer Webview message builders.
9. Remove Extension projection fallbacks that return raw local/cache paths as `webviewUri`.
10. Update TUI media save/progress output so managed cache directories are not the user-facing success contract.
11. Update tool contracts, builtin skill guidance, Webview presenters, working memory sanitizers, and tests so only stable refs/source refs are accepted as durable identity.
12. Run focused tests and TypeScript builds, then broader legacy debt and boundary checks.

Rollback strategy:

- Keep the new runtime injectable. If a migrated tool path fails, the tool can be reverted independently while keeping the runtime contracts and diagnostics tests.
- Do not re-enable cache-path success fallback as rollback. Rollback should restore a previous tool implementation only temporarily and record residual risk.

## Open Questions

- Should the Agent runtime expose typed methods per current tool, or should tools construct raw `ContentAccessRequest` objects directly?
- Should image metadata probing happen in Engine for every image, or can a content-access provider return bytes to a shared metadata parser for small image headers while still using Engine-backed source authorization?
- Which diagnostics should be surfaced to the user verbatim in tool results versus logged as developer diagnostics?
- Does `ContentAccessService` need a provider-ready target, or should provider asset loading remain a thin Agent adapter over bytes/local-path/webview-uri targets?
