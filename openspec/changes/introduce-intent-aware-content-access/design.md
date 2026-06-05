## Context

Neko Suite has converged on several useful foundations:

- `PathResolver` expands portable path variables to local paths before host or engine reads and contracts local paths before durable storage.
- `ResourceCacheService` owns derived resource identity, materialization, manifest state, quota, and Webview projection composition.
- `LocalResourceAccessService` owns Webview allowed roots and `asWebviewUri(...)` projection.
- `DocumentAccessService` owns semantic document manifest, range, cursor, and locator reads.
- Engine file access owns tokenized local file registration, byte ranges, and container entry reads where engine support exists.

The remaining gaps are operation intent and write/import consistency. A `ResourceRef` can represent the same source in both a thumbnail preview and a final export workflow, but those workflows must not resolve to the same bytes. Realtime preview benefits from cached thumbnails, page images, video proxies, and preview variants. Offline operations such as final export, packaging, hashing, dependency validation, and archive assembly need original sources or original container entries so they do not ship downscaled thumbnails, stale cache files, Agent scratch images, or timeline proxies. Imports and generated outputs have the opposite risk: without a shared write boundary, callers may persist private cache paths instead of creating stable source refs.

Five-layer analysis:

- Responsibility: `PathResolver` converts durable paths, `ResourceCacheService` owns derived artifacts, `ContentAccessService` chooses read material by intent, `ContentIngestService` writes/imports durable sources, and `LocalResourceAccessService` only projects authorized runtime paths.
- Dependency: shared intent and ingest contracts live in `neko-types`; VSCode path projection remains Extension Host; engine binary access remains behind engine file access; Webviews consume runtime URIs only.
- Interface: callers pass stable refs, variant roles, target transport, and intent; write callers pass external/generated content plus destination policy; neither path passes private `cachePath` or asks low-level readers to guess.
- Extension: new read providers and ingest providers can support resource kinds or output targets without changing Agent, Canvas, Assets, Cut, or Preview consumers.
- Testing: each intent and write mode can be tested independently with fake source resolvers, fake resource cache, fake engine file access, fake storage layout, and fake Webview projection.

## Goals / Non-Goals

**Goals:**

- Introduce an intent-aware `ContentAccessService` contract for host-side content resolution.
- Introduce a narrow `ContentIngestService`/write contract for imported files, generated media, and staged outputs.
- Keep `PathResolver`, `ResourceCacheService`, `ContentAccessService`, and the write boundary as separate services with one shared ref model.
- Make preview-like flows cache-first and offline flows source-first.
- Keep `cachePath`, Webview URIs, blob URLs, engine runtime tokens, thumbnails, and proxies out of durable export/package inputs.
- Resolve variable and relative source paths through `PathResolver` before original reads.
- Contract source paths through `PathResolver` before durable writes.
- Support document/container entry reads from original source for package/export while using cache variants for preview.
- Support video proxy use for editing/preview while excluding proxies from final export by default.
- Support optional cache prewarming after imports or generated outputs without persisting prewarmed cache paths.
- Provide explicit statuses and diagnostics when source, cache, provider, or authorization is missing.

**Non-Goals:**

- Replacing `ResourceCacheService`, `LocalResourceAccessService`, or `DocumentAccessService`.
- Collapsing path conversion, cache lifecycle, source reads, and writes into one monolithic file service.
- Moving every binary read to Rust in the first implementation.
- Rewriting all export, packaging, and preview code in one pass.
- Making cache manifests the source of truth for original assets.
- Making low-level `readFile`, `writeFile`, `readRange`, or `readEntry` choose cache automatically.
- Persisting runtime URLs, object URLs, Webview URIs, engine stream IDs, or preview tokens.
- Removing all legacy `cachePath` readers in the same batch; legacy values remain migration input only.

## Decisions

### Decision 1: Model operation intent explicitly

Add a small shared intent model:

```typescript
type ContentAccessIntent =
  | 'interactive-preview'
  | 'agent-context'
  | 'edit-playback'
  | 'cache-materialize'
  | 'final-export'
  | 'package'
  | 'verify';

type ContentAccessTarget =
  | 'webview-uri'
  | 'local-path'
  | 'bytes'
  | 'engine-source'
  | 'runtime-stream';
```

`ContentAccessService.resolve(request)` receives a stable ref, intent, target, optional role, and materialization policy. Callers must state the operation rather than relying on path shape or available cache state.

Alternatives considered:

- Infer from target only. Rejected because `local-path` may mean preview cache path or original source path depending on operation.
- Add booleans such as `useCache`. Rejected because combinations become ambiguous for document entries, video proxies, and agent model payloads.

### Decision 2: Keep path conversion, cache, content reads, and content writes as separate unified boundaries

Use four cooperating boundaries rather than one all-purpose file service:

```text
Consumer request
  |
  +-- PathResolver            durable path expansion/contraction
  +-- ResourceCacheService    derived cache identity, materialization, GC
  +-- ContentAccessService    intent-aware read/materialization orchestration
  +-- ContentIngestService    import/generated-output write orchestration
```

`PathResolver` is required before source reads and before durable source writes. `ResourceCacheService` is required for thumbnails, document/page image variants, decompressed preview artifacts, proxies, repair, and quota. `ContentAccessService` decides which read boundary to use for an operation. `ContentIngestService` creates or updates durable source refs and may request cache materialization as a side effect.

Alternatives considered:

- One unified content filesystem. Rejected because it would blur source identity with cache acceleration and make export correctness harder to prove.
- Let every package compose the three services directly. Rejected because Agent, Canvas, Assets, Cut, and Preview would continue to drift.

### Decision 3: Keep cache as acceleration, not content truth

For preview-like intents, the service can call `ResourceCacheService.ensure/resolve/project`, preview APIs, thumbnail providers, or proxy providers. For offline intents, the service must resolve the original source through `PathResolver`, `AssetRefResolver`, `DocumentAccessService`, or engine file access.

Intent policy:

| Intent | Default policy |
|---|---|
| `interactive-preview` | cache-first, project to Webview when requested |
| `agent-context` | cache/preprocess with bounded size and source metadata retained |
| `edit-playback` | proxy/stream allowed for responsiveness |
| `cache-materialize` | source-to-cache provider path |
| `final-export` | original source by default |
| `package` | original source or original container entry |
| `verify` | original source for hash/probe |

Alternatives considered:

- Always prefer cache when present. Rejected because export/package would ship thumbnails/proxies.
- Always read original source. Rejected because previews would be slow, unauthorized, and harder to display in Webviews.

### Decision 4: Low-level file reads and writes remain literal

Low-level `readFile`, `writeFile`, `readRange`, `readEntry`, and engine file access methods should operate on exactly the requested original path/token/entry. They should not silently fall through to cache or silently contract paths for persistence. Cache selection belongs to the intent-aware read orchestration layer. Durable source writes belong to the ingest/write orchestration layer.

Alternatives considered:

- Embed cache fallback into `readFile`. Rejected because the caller would lose control over export correctness and source fingerprint semantics.
- Embed source-ref creation into `writeFile`. Rejected because plain file writes cannot know whether the output is a project asset, generated media, package artifact, scratch file, or cache artifact.

### Decision 5: Source refs remain durable; runtime outputs remain ephemeral

Persisted project files, Canvas nodes, Agent tool results, and package manifests should store stable refs:

- `ResourceRef`
- `DocumentSourceRef + DocumentLocator/entryPath`
- asset refs and media-library variable paths
- package ids or source descriptors

They must not persist `cachePath`, Webview URI, object URL, blob URL, preview token, stream id, or engine token as durable identity.

Legacy `cachePath` can be accepted only as migration input. If a legacy record lacks enough source and locator metadata to reconstruct a source ref, the content access result should be `unrecoverable` or `missing-source` instead of guessing a nearby image.

Alternatives considered:

- Store both source and cache path permanently. Rejected because consumers will eventually rely on the wrong one and reintroduce cross-extension cache leaks.

### Decision 6: Writes and imports produce stable refs, not cache refs

Add a write/import boundary for content that becomes part of a project, package, or durable asset graph:

```typescript
interface ContentIngestService {
  ingest(request: ContentIngestRequest): Promise<ContentIngestResult>;
}
```

Initial write modes:

- `import-source`: copy or link an external file into the selected source scope and return a stable source ref.
- `register-existing-source`: validate and contract an existing workspace/media-library path into a stable source ref.
- `generated-output`: write generated media to the configured generated-assets scope and return a stable generated source ref.
- `stage-export`: write export/package outputs without treating them as cache or preview sources.
- `cache-artifact`: delegate derived artifacts to `ResourceCacheService` rather than project source storage.

The ingest result may include preview hints or a cache prewarm request, but it must not expose the cache path as durable identity.

Alternatives considered:

- Let Agent and Canvas write directly to their extension storage and share absolute paths. Rejected because other packages cannot reliably access, rebuild, or package those paths.
- Always copy all imports into the workspace. Rejected because media-library and external-source policies need to support link/register workflows.

### Decision 7: Document entries use different materialization paths by intent

Document and archive entries need source-level locators:

```text
preview: source + locator/entryPath -> ResourceCache document-entry/page-image -> Webview URI
package: source + entryPath -> original container entry bytes
export: source + locator -> render/extract at export target quality
verify: source + entryPath/source file -> original bytes/hash
```

For EPUB/CBZ/CBR, packaging should read the original archive entry. For PDF page images, preview can use cached rendered page images, while export should render from the original PDF at requested output quality. For Office documents, embedded images should be traced to original document entries when stable; otherwise packaging should include the source document or mark the entry unsupported.

Alternatives considered:

- Treat extracted cache images as the document entry. Rejected because extracted cache can be missing, downscaled, stale, or extension-private.

### Decision 8: Video proxies are intent-scoped

Video proxy files are valid for `interactive-preview` and `edit-playback`. Final export, package, verify, and hash workflows must use original media sources unless an explicit draft/proxy export mode is requested and recorded in the request.

This keeps responsive editing separate from final output quality.

Alternatives considered:

- Let final export use proxy if it is already generated. Rejected because it silently lowers quality.
- Never use proxies. Rejected because timeline interaction and preview responsiveness suffer.

### Decision 9: Introduce narrow provider registries

The service should route by source kind and intent using small providers:

```typescript
interface ContentAccessProvider {
  id: string;
  supports(request: ContentAccessRequest): boolean;
  resolve(request: ContentAccessProviderRequest): Promise<ContentAccessResult>;
}
```

The write boundary uses a similarly narrow registry:

```typescript
interface ContentIngestProvider {
  id: string;
  supports(request: ContentIngestRequest): boolean;
  ingest(request: ContentIngestProviderRequest): Promise<ContentIngestResult>;
}
```

Initial providers:

- resource-cache preview provider
- document source/entry provider
- asset/media source provider
- preview variant provider
- video proxy/playback provider
- generated asset source provider
- import/source writer provider
- generated media writer provider
- export staging writer provider

Providers should receive injected dependencies and should not import feature extensions directly. Cross-extension functionality should be accessed through existing API/capability surfaces.

Alternatives considered:

- One monolithic resolver. Rejected because it would couple Agent, Canvas, Assets, Preview, Cut, and engine details.

## Risks / Trade-offs

- [Risk] Callers choose the wrong intent. -> Mitigation: define enum names narrowly, add tests around export/package not using preview roles, and add code guards for offline targets.
- [Risk] Legacy `cachePath` records become unrecoverable. -> Mitigation: migrate when source/locator exists; otherwise show explicit missing-source remediation instead of using sequential thumbnails.
- [Risk] More indirection makes simple previews feel heavier. -> Mitigation: keep `interactive-preview` fast path cache-first and support synchronous Webview projection after host preload.
- [Risk] Engine file access is not implemented for every source type. -> Mitigation: support source local path fallback behind the same intent result and mark engine-source unsupported when required.
- [Risk] Provider matrix grows. -> Mitigation: keep provider interface small and prefer source-kind/intent registration over branching in callers.
- [Risk] Draft/proxy export is a legitimate user workflow. -> Mitigation: allow explicit `qualityMode: 'draft-proxy'` while defaulting final export to original.
- [Risk] A write boundary may look like a second cache service. -> Mitigation: define write modes around durable source creation and delegate cache artifacts back to `ResourceCacheService`.
- [Risk] Import policy may differ by project, media library, and generated asset scope. -> Mitigation: keep destination policy explicit and contract resulting paths through `PathResolver`.

## Migration Plan

1. Add shared content access intent, ingest/write mode, request, result, status, and provider contracts.
2. Implement a host `ContentAccessService` skeleton with provider registry and fake-provider tests.
3. Implement a host `ContentIngestService` skeleton with provider registry and fake-provider tests.
4. Add a preview/cache provider that composes with `ResourceCacheService` for `interactive-preview` and `agent-context`.
5. Add source providers for files, documents, media-library assets, generated assets, and document/container entries.
6. Add ingest providers for imports, existing-source registration, generated media, export staging, and cache-artifact delegation.
7. Add video proxy/edit-playback provider and final-export guardrails that reject proxy unless explicitly requested.
8. Migrate Canvas preview and node-card preview resolution to use `interactive-preview`.
9. Migrate Agent document image/storyboard presentation and generated media output to use content access/ingest and emit stable refs only.
10. Migrate Assets export/package flows and Cut final export flows to request `final-export`, `package`, or `verify`.
11. Add architecture guard tests that offline intents never accept `thumbnail`, `preview`, `proxy`, Webview URI, blob URL, engine runtime token, or legacy `cachePath` as durable input.
12. Update architecture docs for storage strategy, local resource access, document preview, agent media, content ingest, and export/preview orchestration.

Rollback strategy:

- Keep existing `ResourceCacheService` and source readers untouched behind adapters.
- Keep existing package-specific import/write paths as fallback adapters until the shared ingest boundary covers them.
- Migrate callers one surface at a time.
- If a provider is incomplete, return an explicit unsupported status and let the caller use its current source-specific path until migrated.

## Open Questions

- Should `draft-proxy` export be a separate intent or a `qualityMode` on `final-export`?
- Should `ContentAccessService` live entirely in `neko-types/vscode/extension` first, or should package-specific providers live in each extension and register through extension APIs?
- Should package/export flows receive bytes directly, staged local paths, or engine file tokens by default?
- How aggressively should legacy `cachePath` be stripped from Agent and Canvas payloads during this change versus the no-cachePath cleanup change?
- Should `ContentIngestService` copy external imports into project storage by default, or should media-library registration remain the default for large media?
- Should generated Agent images be written under a project generated-assets scope immediately, or only when the user promotes them from scratch output?
