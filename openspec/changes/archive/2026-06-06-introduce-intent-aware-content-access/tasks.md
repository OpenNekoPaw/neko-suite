## 1. Contracts

- [x] 1.1 Add `ContentAccessIntent`, `ContentAccessTarget`, `ContentIngestMode`, source ref, role, materialization policy, destination policy, result, status, diagnostic, and provider contract types in `packages/neko-types`.
- [x] 1.2 Add type guards that classify preview-like intents, offline intents, runtime-only refs, legacy `cachePath` refs, Webview URIs, blob URLs, object URLs, preview tokens, proxy roles, and engine runtime tokens.
- [x] 1.3 Add request validation that rejects cache/runtime-only refs for `final-export`, `package`, and `verify` unless an explicit draft/proxy quality mode is present.
- [x] 1.4 Add ingest/write validation that rejects private cache paths as durable source outputs and requires path contraction for persistent source refs.
- [x] 1.5 Add contract tests for intent parsing, offline guard behavior, draft/proxy exceptions, ingest modes, path contraction requirements, and durable source-ref serialization without `cachePath`.

## 2. Core Services

- [x] 2.1 Implement a host-side `ContentAccessService` registry in the shared VSCode extension layer with dependency-injected providers and deterministic provider selection.
- [x] 2.2 Implement a host-side `ContentIngestService` registry in the shared VSCode extension layer with dependency-injected providers and deterministic provider selection.
- [x] 2.3 Implement structured result statuses for ready, missing-cache, missing-source, stale-source, unsupported-intent, unsupported-source, unsupported-destination, unauthorized, non-portable, unrecoverable, and failed outcomes.
- [x] 2.4 Implement diagnostics that record selected provider id, source identity, variant role, destination policy, quality mode, materialization action, ingest action, and rejection reason without leaking private cache paths into durable payloads.
- [x] 2.5 Add fake-provider unit tests for provider ordering, no-provider failure, missing-cache materialization, offline rejection, ingest rejection, path contraction, and diagnostics.

## 3. Read Providers

- [x] 3.1 Add a resource-cache preview provider that serves `interactive-preview` and `agent-context` through `ResourceCacheService` and `LocalResourceAccessService` projection.
- [x] 3.2 Add a source file and media-library provider that resolves workspace-relative and `${VAR}` paths through `PathResolver` before source reads, engine registration, export, package, or verify.
- [x] 3.3 Add a document source and entry provider that uses cached page or entry variants for preview intents and original document/container entries for `package`, `final-export`, and `verify`.
- [x] 3.4 Add a video proxy and edit-playback provider that allows proxy or stream outputs for `interactive-preview` and `edit-playback` while defaulting `final-export` to original media.
- [x] 3.5 Add preview-variant and generated-asset adapters where existing preview APIs already expose thumbnails, posters, screenshots, or generated media.
- [x] 3.6 Add provider tests for missing preview cache recovery, original archive entry packaging, PDF page export from source, original video export despite ready proxy, and unsupported source kinds.

## 4. Write And Ingest Providers

- [x] 4.1 Add an import-source provider that copies or registers external images, documents, models, audio, and video according to an explicit destination policy.
- [x] 4.2 Add a register-existing-source provider that validates workspace, media-library, and `${VAR}` paths and contracts them through `PathResolver` before persistence.
- [x] 4.3 Add a generated-output provider that writes promoted Agent or tool-generated media to the configured generated-assets scope and returns stable generated source refs.
- [x] 4.4 Add an export-staging provider that records final export and package outputs without treating them as cache artifacts or rewriting project source refs.
- [x] 4.5 Add a cache-artifact delegation provider that routes thumbnails, document page images, preview variants, decompressed preview entries, proxy artifacts, and bounded Agent media to `ResourceCacheService`.
- [x] 4.6 Add ingest provider tests for external import, existing-source registration, Agent generated image promotion, preview prewarm hints, cache-artifact delegation, and export output re-import.

## 5. Canvas And Agent Migration

- [x] 5.1 Migrate Canvas node, card, storyboard, and media preview resolution to request `interactive-preview` content instead of reading or saving resolved cache paths.
- [x] 5.2 Ensure Canvas unavailable preview states are tied to the requested resource ref and never reuse a previous sequential thumbnail when resolution fails.
- [x] 5.3 Migrate Canvas import and paste/drop flows to use the ingest boundary and save stable source refs.
- [x] 5.4 Migrate Agent document image, storyboard, and model-context display to request `agent-context` or `interactive-preview` content while retaining source and locator metadata.
- [x] 5.5 Migrate Agent generated image and media handoff to Canvas through generated-output ingest before sending stable refs plus preview role metadata.
- [x] 5.6 Stop emitting new durable Agent and Canvas payload fields that contain `cachePath`, Webview URI, blob URL, object URL, preview token, runtime image path, or engine token.
- [x] 5.7 Add Canvas and Agent tests that multiple selected shots send stable refs plus preview roles and that each shot preview binds to its own resolved resource.

## 6. Export And Package Migration

- [x] 6.1 Migrate asset export, package, bundle, dependency validation, and hash flows to request `package`, `final-export`, or `verify` content.
- [x] 6.2 Migrate Canvas-driven export and package flows to resolve node media through source-first intents rather than card preview URLs or thumbnails.
- [x] 6.3 Migrate Cut final export inputs to resolve original source paths or engine source tokens and exclude video proxies by default.
- [x] 6.4 Add explicit draft/proxy export quality mode support that records diagnostics when proxy or derived media is intentionally used.
- [x] 6.5 Route final export and package outputs through export staging instead of cache storage.
- [x] 6.6 Add tests that legacy-only `cachePath` records report missing-source or unrecoverable for export/package and are not silently copied as original assets.

## 7. Engine And Runtime Boundaries

- [x] 7.1 Route engine file token registration for export, package, verify, range, and container-entry operations through source-intent resolution.
- [x] 7.2 Ensure engine tokens, stream ids, range URLs, and preview token URLs are treated as runtime handles and are never stored as durable content refs.
- [x] 7.3 Add tests that package entry reads use original container tokens and resumed offline operations with expired tokens report missing-source when no stable source ref exists.

## 8. Guardrails And Documentation

- [x] 8.1 Add architecture guard tests that offline intents reject thumbnail, preview, proxy, Webview URI, blob URL, object URL, cache-only, and legacy `cachePath` inputs by default.
- [x] 8.2 Add architecture guard tests that durable ingest results reject private cache paths, scratch paths, and runtime URLs as source identity.
- [x] 8.3 Update storage, local resource access, document preview, agent media, content ingest, and export/preview orchestration docs to describe intent-aware content access, ingest/write boundaries, and path variable handling.
- [x] 8.4 Document the migration rule that legacy `cachePath` is input-only and must be converted to a stable source ref or surfaced as missing-source/unrecoverable.
- [x] 8.5 Run the Neko quality self-review gate for the final implementation and record remaining risks.

## 9. Validation

- [x] 9.1 Run targeted `neko-types` contract, resource access, and ingest tests.
- [x] 9.2 Run Agent document, generated-media, storyboard presenter, and media transfer tests.
- [x] 9.3 Run Canvas preview protocol, materialization, import/paste/drop, multi-select send, and save/load tests.
- [x] 9.4 Run asset import/export/package/dependency validation tests and Cut proxy/final-export tests.
- [x] 9.5 Run affected extension builds and repository checks, including `pnpm check` and the smallest necessary package builds.
