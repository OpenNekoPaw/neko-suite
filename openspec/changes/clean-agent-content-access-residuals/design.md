## Context

The completed Agent content-access change established the canonical boundary: Agent callers declare stable refs and intent, Host-side content access chooses Engine, cache, local projection, bytes, or diagnostics. Remaining risks are mostly residual surfaces that can reintroduce the old coupling: host-specific names in host-agnostic packages, generated-output local paths crossing Agent contracts, Webview presenters accepting legacy fields as successful payloads, and platform-local helpers that know cache/output layout.

Current classification:

- `platform/src/files` may keep text/config file operation plans, but not binary/media file IO services.
- `platform/src/document` may keep document parsing contracts, locators, manifests, ranges, and parser adapters, but not public scratch/cache identity.
- `platform/src/media` may keep provider request shaping, task orchestration, delivery plans, and generated asset metadata, but not Agent-visible cache/local path identity.
- Extension Host may hold physical paths for projection, indexing, reveal/open side effects, and final user-selected saves.
- Webview/TUI adapters may render projected URIs or terminal text, but those are presentation-only.

Implementation audit updates:

- Removed: Agent host-neutral runtime exports named `*ForWebview*`; Extension/Webview bridge code remains the adapter boundary.
- Removed: Platform media successful `resultUrls`/`thumbnailUrl` values that pointed at generated-output filesystem paths. Stable generated asset URIs are Agent-visible; saved filesystem paths are `hostOutputPaths` for Host reveal/open side effects only.
- Removed: Webview tool-call presenter success projection of `localPath`/`localPaths`; expanded result JSON strips cache/runtime/Webview fields before display.
- Removed: Extension-local `documentResourceCacheProvider` re-export and duplicate tests. Document resource cache rules now live in `@neko/shared/vscode/extension`; Agent Extension imports the shared provider directly and only wires Host-specific readers and targets.
- Removed: Platform media generated-output directory resolvers. Platform `GeneratedAssetIndex` now accepts an injected directory, while Extension Host decides the default generated cache directory through `resolveStorageLayout(...)`.
- Host-internal only: `GeneratedAsset.path`, media delivery notification `filePath`, and CLI saved output paths. These are used for local index/reveal/save side effects and are not stable Agent payload identity.
- Parser-private only: document `imagePaths` inside Platform document parsing remains an internal extraction detail; Extension tools sanitize public results to `resourceRef`/locator metadata.
- Adapter-only: Webview URI projection and generated asset render handles are created by Extension/Webview adapters through `LocalResourceAccessService` or `ResourceCacheService.project()`. Missing projection is diagnostic/empty display data, not cache-path fallback.
- Migration-only diagnostic: `cachePath`, `runtimePath`, `cacheResourceRef`, `imagePaths`, `imageInfo.path`, `webviewUri`, blob URL, object URL, scratch path, and Engine token may appear only in rejection, sanitizer, boundary, or legacy poison tests.

## Goals / Non-Goals

**Goals:**

- Remove residual successful paths that expose cache, scratch, local, Webview, or Engine runtime identity across Agent/Platform/Agent-types boundaries.
- Convert remaining Agent-specific builder logic that encodes general content/cache rules into shared-service usage or thin Agent adapters.
- Keep platform `files`, `document`, and `media` directories as domain orchestration surfaces only.
- Make legacy handling fail-visible and migration-only.
- Strengthen boundary checks so future changes cannot reintroduce host-specific projection or cache-path success.

**Non-Goals:**

- Do not redesign every creative domain's content access stack.
- Do not remove Host-internal physical paths needed for actual file writes, Webview projection, indexing, or reveal/open commands.
- Do not replace `ResourceCacheService`, `ContentAccessService`, `ProjectFileStore`, or `EngineClient`.
- Do not introduce cloud/distributed file services or tenant abstractions.

## Decisions

1. **Classify residuals by behavior, not filename.**

   A file named `media`, `document`, or `file` is acceptable when it contains domain contracts, plans, DTOs, provider adapters, or parser orchestration. It is not acceptable when it owns cache layout, binary/media source reading, Webview projection, or Agent-visible local path identity.

   Alternative considered: delete or move whole directories. Rejected because it would mix useful domain orchestration with boundary violations and create churn without improving contracts.

2. **Generated output paths stay Host-internal.**

   Platform media task result/progress/delivery APIs should expose generated asset refs, renderable resource descriptors, user-facing saved outputs, and diagnostics. Physical paths may remain in Host-only persistence/index/reveal code, but must be stripped before Agent work items, Webview stable DTOs, TUI success text, and skill/tool contracts. Platform code must not decide the generated cache directory layout; Host adapters inject the output/index directory selected by shared storage/cache services.

   Alternative considered: keep `localPaths` as a convenient internal field and trust callers. Rejected because previous regressions came from "internal" fields becoming display and transfer contracts.

3. **Legacy cache/runtime fields are poison for new success paths.**

   New-path tests should poison legacy fields and direct local/cache reads. Migration tests may assert rejection or diagnostic behavior, but must not allow `cachePath`, `.neko/.cache`, `webviewUri`, blob URL, Engine token, or scratch path to produce success.

   Alternative considered: best-effort recovery from cache manifest. Rejected because it turns cache layout into a hidden public API and conflicts with transparent cache rebuild.

4. **Host-neutral runtime naming replaces Webview-named APIs.**

   Agent runtime exports should model turns, streams, tasks, resources, and projections without `ForWebview` or Webview message schemas. Extension/Webview bridge code owns `postMessage` payload construction. Temporary aliases require owner, replacement, removal condition, and boundary tests.

   Alternative considered: keep Webview names because implementations are pure functions. Rejected because pure functions can still encode the wrong dependency direction.

5. **Agent-private runtime builders become thin adapters.**

   Agent Extension may keep `createAgentContentAccessRuntime(...)` only as Agent-specific wiring over shared content/cache/Engine services. General cache target selection, document provider setup, and source/content provider composition should move to shared factories in the cross-domain change or be called from shared services when available. Local re-export shells that make Extension appear to own shared cache rules should be deleted once imports can point at the shared entry directly.

   Alternative considered: leave Agent builder as the reference implementation. Rejected because Canvas/Cut/Preview already need the same composition and would keep copying it.

## Risks / Trade-offs

- [Risk] Removing legacy display fields can break unreleased fixtures. -> Mitigation: update fixtures to stable refs or explicit rejection/diagnostic cases.
- [Risk] Host-internal physical paths are still needed and could leak again. -> Mitigation: encode boundary guards and projection sanitizers around Agent/Platform/Webview/TUI outputs.
- [Risk] Generated output persistence cleanup overlaps cross-domain content access. -> Mitigation: in this change, clean Agent-visible contracts; shared factory extraction belongs to `unify-cross-domain-content-access-runtime`.
- [Risk] Parser libraries may still need scratch files. -> Mitigation: keep scratch behind parser-private temp providers and prohibit scratch identity in public payloads.

## Migration Plan

1. Inventory residual fields and classify them as remove, Host-internal, migration-only diagnostic, or tracked compatibility shim.
2. Remove new-path success usage of cache/runtime/Webview/local path fields.
3. Replace host-specific API names and DTOs with host-neutral names or adapter-layer builders.
4. Update tests and boundary guards to poison legacy fields and assert canonical paths.
5. Run focused Agent/Platform/Extension/Webview/TUI tests plus legacy-debt and boundary checks.

Rollback strategy: revert individual call-site cleanups only if they break a valuable user data migration path. Do not re-enable cache-path fallback as a general success path.

## Follow-up Questions

- Should temporary parser scratch be standardized as a shared scoped temp provider after more non-Agent document providers adopt the same document reader path?
- Cross-domain generated asset persistence factories remain part of `unify-cross-domain-content-access-runtime`; this change only removes Agent/Platform-visible cache identity and platform-owned directory decisions.
