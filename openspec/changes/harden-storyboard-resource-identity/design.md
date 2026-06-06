## Context

`unify-resource-cache-service` and `introduce-intent-aware-content-access` established the right host-side foundations: `ResourceRef` is stable identity, `ResourceCacheService` owns derived artifact materialization and lifecycle, `ContentAccessService` chooses source or cache by operation intent, and `LocalResourceAccessService` owns Webview projection. The current Agent/Canvas storyboard path now displays document images, but several business-layer surfaces still treat runtime cache paths as first-class data.

Current gaps:

- Agent document tools still expose `imagePaths` and write materialized cache locations back into `imageInfo.path` and `resourceRef.cachePath`.
- Agent still has a scratch `document-image-cache` root in addition to `.neko/.cache/resources/`.
- Agent storyboard assembly can infer image refs by row order or unscope aliases such as `page_1`.
- Canvas correctly prefers resource refs but still has legacy `cachePath` projection fallback.
- Storyboard and documentation still allow models to think local cache paths are acceptable Canvas transfer identity.

Five-layer analysis:

- Responsibility: Agent creates scoped media evidence, presenters assemble storyboard references, Canvas imports stable refs, content access materializes runtime handles, resource cache owns cache files.
- Dependency: Agent/Canvas depend on shared contracts, not each other's cache folders. Webviews receive projected URIs and compact refs only.
- Interface: Durable payloads use `ResourceRef`, `DocumentArchiveResourceRef`, `StoryboardMediaRefV1`, and scoped aliases. Runtime payloads use explicit preview/read handles.
- Extension: Future document, generated-media, proxy, and package-entry providers can add variants without changing storyboard business identity.
- Testing: Unit tests can fake tool calls, resource refs, and content access statuses; integration tests can verify save/load and multi-request alias behavior.

## Goals / Non-Goals

**Goals:**

- Make new Agent-to-Canvas storyboard payloads independent from cache paths.
- Give Agent `page_1`/`P1` aliases an explicit request or batch scope.
- Keep local paths available where they are truly runtime handles: Agent Webview display, `ReadImage` local byte reads, and legacy migration.
- Ensure Canvas previews and save/load round trips use `ContentAccessService` and stable refs.
- Remove or quarantine legacy `document-image-cache` code once all supported project-bound document images materialize through `.neko/.cache/resources/`.
- Update skill/documentation guidance so models produce `sourceMediaRefs` instead of cache paths.

**Non-Goals:**

- Removing every `cachePath` field from shared types in one change. Existing data and legacy sessions still need parse compatibility.
- Rewriting the document reader runtime to never use scratch files internally. Internal extraction may still use scratch paths before promotion/materialization.
- Replacing `ResourceCacheService`, `ContentAccessService`, or `PathResolver`.
- Solving final export/package implementations beyond ensuring storyboard refs are source-capable and cache paths are not treated as source.

## Decisions

### Decision 1: Stable identity is required for cross-surface storyboard media

New storyboard transfers from Agent to Canvas SHALL carry `referenceResourceRef` or enough `tool-result` information to resolve to a stable `ResourceRef`. `referenceImagePath` is allowed only for portable external URLs, data URLs, explicit workspace/source assets, or legacy fallback.

Alternatives considered:

- Keep sending both path and ref forever. Rejected because consumers eventually rely on the path again.
- Remove all path fields immediately. Rejected because Agent model context and legacy Canvas files still need a migration window.

### Decision 2: Split stable refs from runtime handles in Agent tool results

Agent document/image tool results should expose:

- stable fields: `resourceRef`, `cacheResourceRef`, `source`, `locator`, `entryPath`, `aliasScope`, `alias`
- runtime fields: `runtimePath`, `webviewUri`, optional compatibility `path`/`imagePaths`

During migration, old `path` and `imagePaths` may remain, but presenters and transfer code must prefer stable refs. Documentation should describe `path` as a runtime read handle rather than a Canvas identity.

Alternatives considered:

- Rename existing fields only. Rejected because old consumers would break without a transition.
- Keep current names and rely on comments. Rejected because skill prompts and model outputs continue to misuse them.

### Decision 3: Aliases are scoped, not global

Agent may display and prompt with aliases such as `page_1`, `P1`, or `image_1`, but every alias must resolve through an alias scope tied to a tool call, tool result batch, source document, or explicit batch id. Model-authored `sourcePage` / `sourceImage` fields are converted through that scoped alias map before transfer.

Resolution order:

1. Explicit `sourceMediaRefs` with `tool-result` locator.
2. Scoped alias map match: `aliasScope + alias`.
3. Source locator match: document source identity + page/entry locator.
4. Row-order fallback only when there is exactly one eligible image batch.

Alternatives considered:

- Keep global page-number matching. Rejected because multiple requests commonly contain `page_1`.
- Force models to output only tool call ids. Rejected because readable aliases help prompting and review.

### Decision 4: Canvas legacy path fallback becomes observable migration behavior

Canvas should continue to read old files, but fallback from resource ref to `cachePath` must be logged, statused, and bounded. New Agent transfers should not trigger fallback. Tests should assert that stable refs delete `referenceImagePath` on save and rematerialize missing cache artifacts through content access.

Alternatives considered:

- Delete fallback immediately. Rejected because existing `.nkc` data can still contain legacy refs.
- Keep silent fallback. Rejected because it masks broken materialization and reintroduces stale images.

### Decision 5: `document-image-cache` is internal scratch only, then removable

Project-bound document images used outside Agent should end in `.neko/.cache/resources/`. The old `document-image-cache` root should be:

1. Retained only for current read scratch and old-session migration.
2. Excluded from new cross-package transfer payloads.
3. Removed from default Webview root registration once presenters no longer need it for new results.
4. Kept behind explicit legacy tests until a migration cleanup removes it.

Alternatives considered:

- Move all document reader extraction directly into resource cache now. Preferable long-term, but higher risk because document reader APIs currently return concrete image files for `ReadImage` and model preprocessing.
- Keep scratch cache permanently. Rejected because it duplicates GC, authorization, and lifecycle.

### Decision 6: Profile policy tightens manga/storyboard document refs

For `manga-to-video` and image-sequence storyboard payloads, source-backed shots using `reuse-original`, `use-as-reference`, or `transform-original` must have `sourceMediaRefs`. Cache paths, absolute local paths, Webview URIs, blob URLs, and fabricated tool call ids are invalid. If no stable ref can be resolved, the UI should show a diagnostic and block Send to Canvas for that media rather than silently assigning images by sequence.

Alternatives considered:

- Let Canvas repair missing refs after transfer. Rejected because Canvas lacks Agent tool-call history and alias context.

## Risks / Trade-offs

- [Risk] Some old conversations or Canvas files only contain cache paths. -> Keep a migration fallback with visible status, then remove after tests and user-facing migration are in place.
- [Risk] Adding alias scopes may make prompt output slightly more verbose. -> Keep aliases readable, but attach scope in structured JSON and Webview metadata.
- [Risk] Removing `imagePaths` too quickly breaks `ReadImage` and model context flows. -> Keep compatibility fields while making transfer code and documentation prefer stable refs.
- [Risk] Direct scratch extraction still duplicates disk usage. -> First prevent cross-package identity leakage, then move extraction internals to resource cache in a later cleanup if needed.
- [Risk] Stricter validation may block Send to Canvas for malformed model output. -> Provide repair/backfill from real tool results when unambiguous and surface clear diagnostics otherwise.

## Migration Plan

1. Add scoped alias/resource identity helpers and tests without removing legacy paths.
2. Change Agent presenters and transfer assembly to prefer refs and scoped aliases; legacy paths become fallback only.
3. Change tool result DTOs/documentation to mark paths as runtime handles and add explicit stable-ref fields where missing.
4. Harden Canvas import/save/load tests so new storyboard nodes persist refs and not runtime paths.
5. Add diagnostics for any new transfer that would rely on cache paths.
6. Remove default `document-image-cache` root usage for new project-bound results once tests show Webview display uses projected resource URIs.
7. Delete remaining legacy root helpers/tests after a migration window or keep them under explicit legacy-only modules.

Rollback: keep compatibility parsing for `cachePath`, `imagePaths`, and `referenceImagePath`; if strict ref transfer regresses, toggle the stricter validation while preserving the ref-producing code path.

## Open Questions

- Should the public `DocumentImageInfo.path` field be renamed in a future breaking contract, or should a parallel `runtimePath` be introduced and `path` deprecated?
- Should scoped aliases live in `StoryboardTableV1.extensions` or in Webview-only transfer metadata? The safer first step is transfer metadata plus normalized `sourceMediaRefs`.
- How long should Canvas support legacy `cachePath` fallback before showing migration-only repair UI?
