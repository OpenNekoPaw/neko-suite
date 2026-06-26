## 1. Audit and Contract Baseline

- [x] 1.1 Audit Agent binary/media and document access call sites, including `ReadImage`, `ReadDocument`, `ReadDocumentImage`, perception asset loader, attachment processor, media preprocessor, message projection, working memory, and Canvas/Storyboard transfer presenters.
- [x] 1.2 Classify each call site as pure text/project fact, binary/media source, document container/range/entry, cache materialization, Webview projection, or migration/diagnostic cleanup.
- [x] 1.3 Define the Agent content-access runtime interface and request/response diagnostics without importing VS Code or feature-package internals into Agent runtime code.
- [x] 1.4 Add test fakes/spies for content access, Engine file access, resource cache, local resource projection, and poisoned legacy direct binary reads.
- [x] 1.5 Audit host-specific projection leaks in `agent-types`, `agent/runtime`, `platform`, `extension`, and `cli-tui`, including `WebviewGeneratedAsset`, `webviewUri`, `ForWebview` APIs, raw-path Webview URI fallbacks, and TUI cache-path output.

## 2. Agent Content Access Runtime

- [x] 2.1 Implement the Extension Host Agent content-access runtime factory using existing `ContentAccessService`, `ResourceCacheService`, EngineClient file access, document access, `PathResolver`, media library roots, and `LocalResourceAccessService`.
- [x] 2.2 Ensure the runtime exposes typed methods or narrow wrappers for image metadata/provider-ready assets, document content, document image resolution, cache-backed resource materialization, Webview projection, and provider asset loading.
- [x] 2.3 Make service availability fail-visible for binary/media paths when Engine/content access/resource cache is missing, while keeping pure text reads independent of Engine.
- [x] 2.4 Centralize runtime creation in Agent capability/session bootstrap so document tools, media tools, and perception asset loader share the same content-access boundary.

## 3. ReadImage Migration

- [x] 3.1 Replace `ReadImage` direct image `fs.readFile` with Agent content-access runtime calls for image metadata and provider-ready attachment data.
- [x] 3.2 Remove default `resourceCache.findByLocalPath()` cache-path recovery from new successful `ReadImage` requests; keep only explicit rejection/diagnostic coverage for legacy inputs.
- [x] 3.3 Preserve stable output fields for aliases, labels, dimensions, MIME type, byte size, source/document refs, attachments, and perception cards without returning cache paths.
- [x] 3.4 Add path-level tests proving `ReadImage` hits the content-access runtime and fails if legacy direct binary read paths are poisoned.

## 4. ReadDocument and ReadDocumentImage Migration

- [x] 4.1 Split `ReadDocument` source handling so pure text formats use text/project-file access and binary/container formats use Engine-backed document access for whole-file, range, entry, sibling resource, and image needs.
- [x] 4.2 Move document image materialization out of `ReadDocument` tool code and behind the Agent content-access runtime/resource cache provider.
- [x] 4.3 Move `ReadDocumentImage` image selection and materialization behind the same runtime while keeping locator/page-index behavior stable.
- [x] 4.4 Remove tool-layer dependency on cache path semantics and ensure public outputs omit `imagePaths`, `imageInfo.path`, `runtimePath`, `runtimeKind`, `cachePath`, and `cacheResourceRef`.
- [x] 4.5 Add path-level tests for text document reads, binary/container reads, range/entry reads, document image cache rebuild, and missing-resource diagnostics.

## 5. Attachments, Perception Assets, and Media Preprocessing

- [x] 5.1 Migrate perception asset loading to use the Agent content-access runtime for local assets and document refs before creating provider-ready data URLs or URLs.
- [x] 5.2 Migrate image attachment reading and resizing to obtain authorized bytes through content access instead of direct Extension `fs.readFile`.
- [x] 5.3 Migrate image media preprocessing to the same boundary; keep video preprocessing Engine-backed and fail-visible when Engine is unavailable.
- [x] 5.4 Add tests for provider asset loading, image attachments, image preprocessing, video preprocessing, unauthorized sources, and Engine-unavailable diagnostics.

## 6. Legacy Field Rejection and Sanitization

- [x] 6.1 Audit and update message resource projection, working memory, Webview presenters, Canvas transfer, Storyboard transfer, clipboard context, and builtin skill guidance for cache/runtime field rejection or sanitization.
- [x] 6.2 Ensure legacy `cachePath`, `runtimePath`, `runtimeKind`, `cacheResourceRef`, `imagePaths`, `imageInfo.path`, Webview URI, blob URL, Engine token, and document-reader scratch paths cannot produce new successful durable resource payloads.
- [x] 6.3 Add migration/rejection tests proving legacy fields are stripped, diagnosed, or fail closed and cannot mask new-path failures.
- [x] 6.4 Update `packages/neko-agent/README.md`, `DOCUMENT_FORMATS.md`, and architecture docs only if implementation changes stable user-facing contracts beyond the proposal.

## 7. Host Projection and UI Boundary Cleanup

- [x] 7.1 Replace `WebviewGeneratedAsset` / `webviewUri` in `agent-types` work item contracts and `platform` media task views with stable `GeneratedAsset`, `ResourceRef`, source ref, or host-neutral renderable-resource projection DTOs.
- [x] 7.2 Move Webview URI enrichment for generated assets and media task results to Extension/Webview adapter code backed by `LocalResourceAccessService` or `ResourceCacheService.project()`.
- [x] 7.3 Rename or quarantine `agent/runtime` Webview-specific exports (`runAgentTurnForWebviewRuntime`, `AgentStreamWebviewMessage`, `runAgentMediaTurnForWebview`, Webview presenter modules) behind host-neutral runtime APIs and adapter-layer message builders.
- [x] 7.4 Update `platform` media task delivery APIs so platform owns media delivery plans and stable resource metadata, while Extension owns Webview projection and TUI owns terminal formatting.
- [x] 7.5 Remove raw local/cache path fallbacks from Extension projection code; Webview URI conversion failure must return a diagnostic or omit renderable projection.
- [x] 7.6 Update `cli-tui` media save/progress output so it does not expose `.neko/.cache/generated` or other managed cache directories as the stable success path.
- [x] 7.7 Add or update boundary guards to reject new `WebviewGeneratedAsset`, `webviewUri`, `ForWebview`, cache-path display helper, or raw-path projection fallback usage in host-agnostic packages.

## 8. Stale Fixture and Compatibility Cleanup

- [x] 8.1 Update tests that currently expect `documentResourceRef.cachePath`, `imagePathWebviewUris`, or `.neko/.cache/resources/...` as successful projection output; convert them to stable-ref success tests or explicit legacy rejection/diagnostic tests.
- [x] 8.2 Resolve or renew with replacement criteria the expired Agent boundary exceptions for `qualityCheckTools.ts` and `consistencyCheckTools.ts`; do not let expired compatibility bridges hide new content-access migration work.
- [x] 8.3 Add tests proving Webview projection failure does not fall back to raw local/cache paths.
- [x] 8.4 Add tests proving TUI output reports stable saved output/resource identity rather than managed cache internals.

## 9. Validation and Quality Gates

- [x] 9.1 Run focused shared tests for content access, resource cache providers, document resource cache provider, document-reading types, and project path diagnostics touched by the change.
- [x] 9.2 Run focused extension tests for `ReadImage`, `ReadDocument`, `ReadDocumentImage`, document runtime, attachment/media preprocessing, perception asset loading, capability providers, and message projection.
- [x] 9.3 Run focused agent/webview tests for working memory sanitization, composite presenter, storyboard transfer, tool-call presenter, clipboard context behavior, and host projection adapters.
- [x] 9.4 Run focused `cli-tui` tests for media save/progress output if terminal behavior changes.
- [x] 9.5 Run TypeScript checks for affected packages, including `packages/neko-agent/packages/extension`, `packages/neko-agent/packages/agent`, `packages/neko-agent/packages/agent-types`, `packages/neko-agent/packages/platform`, `packages/neko-agent/packages/webview`, and `packages/neko-agent/packages/cli-tui`.
- [x] 9.6 Run `pnpm check:legacy-debt` and relevant boundary checks to ensure direct binary file reads/cache path fallbacks and host-specific projection leaks were removed or explicitly classified.
- [x] 9.7 Run `openspec validate unify-agent-content-access-cache` and record any residual risks or skipped broader checks before marking the change complete.
