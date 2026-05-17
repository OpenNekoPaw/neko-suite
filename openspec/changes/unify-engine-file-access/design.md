## Context

Neko Suite has converged on neko-engine as the authority for media decoding, preview streaming, document serving, and GPU/FFmpeg-heavy workflows. The file access boundary has not fully caught up:

- Preview documents use an engine token registry with HTTP Range and ZIP entry routes.
- Video/audio preview and cut operations pass raw file paths to engine actions.
- `neko-cut` still has a Webview → Extension `readFileRange` path implemented with Node `fs.open`.
- `neko-puppet` and `neko-live` read `.inp` binaries in the Extension Host and forward base64/ArrayBuffer through Webview or client APIs.
- `neko-model` can load a model both through Webview URI/R3F and engine `scenes:load`, duplicating reads and path authority.
- Small text/config/project files are legitimately read by Extension-side CustomDocument and settings code.

The architectural goal is not to force every byte through one API shape. The goal is to centralize path resolution, authorization, token lifecycle, and on-demand binary access in engine-owned infrastructure while preserving high-performance decode/stream paths.

## Goals / Non-Goals

**Goals:**

- Provide one engine-owned file access contract for local binary media, document, model, puppet, subtitle, and agent attachment sources.
- Preserve existing engine hot paths: video/audio decode and stream actions should open source references locally in Rust instead of first copying data to TypeScript.
- Replace package-local binary read helpers with `@neko/neko-client` file access helpers.
- Maintain backward compatibility for existing preview routes and raw `source: string` action inputs during migration.
- Distinguish allowed small text/config/project reads from disallowed large binary media reads in architecture tests.
- Keep Webviews away from local absolute file paths where an engine token URL or manifest can be used instead.

**Non-Goals:**

- Replacing VSCode CustomDocument text/JSON read/write semantics for `.nks`, `.nkm`, `.nkp`, settings, preferences, or sidecar text files.
- Implementing a fully general filesystem API in engine.
- Uploading all media into engine memory before decode.
- Solving remote/cloud asset storage. The design allows future backends but the initial implementation targets local files.
- Removing existing compatibility endpoints in the first implementation batch.

## Decisions

### Decision 1: Introduce `FileAccessRegistry` as the generic owner

Create a generic registry in `host-api` that owns:

- registered token → canonical local path mapping
- allowed roots
- purpose metadata
- MIME/size metadata
- optional TTL/cleanup bookkeeping

`PreviewFileRegistry` should become a compatibility wrapper or alias around this registry rather than a separate long-term implementation.

Alternative considered: keep extending `PreviewFileRegistry`.

Rejected because preview-specific naming would keep encouraging non-preview packages to build their own file access helpers instead of sharing a common contract.

### Decision 2: Use source references, not eager bytes, for engine workflows

Add a source reference contract:

```text
FileSourceRef =
  Path { path }
  Token { token }
  Asset { assetId }       // future-compatible; optional in first batch
```

Engine actions that currently accept `source: string` should accept `sourceRef` while preserving `source` as a compatibility field. Decode-heavy actions (`videos:stream`, `audios:stream`, `videos:capture`, `audios:waveform`, `scenes:load`, `puppets:load_source`) resolve the source reference inside engine and open the file locally.

Alternative considered: make clients call `readRange` then pass bytes to domain actions.

Rejected because it would harm video/audio/model performance and recreate the base64/ArrayBuffer anti-pattern.

### Decision 3: Keep transport-specific APIs but share the same token registry

HTTP routes:

```text
POST   /v1/files/register
DELETE /v1/files/:token
GET    /v1/files/:token
GET    /v1/files/:token/entries/*path
```

Action router aliases:

```text
files:register
files:unregister
files:stat
files:resolve
```

Compatibility aliases:

```text
/v1/preview/register
/v1/preview/file/:token
/v1/preview/epub/:token/*path
previews:register-token
previews:unregister-token
```

Alternative considered: only expose HTTP and skip ActionRouter.

Rejected because extension packages already standardize around `EngineClient.dispatch`, and tests/actions benefit from a typed non-Webview control surface.

### Decision 4: Range and entry reads are for small/on-demand access, not decode pipelines

`readRange` and `readEntry` should be used for metadata prefixes, subtitles, document fragments, ZIP entries, and similar bounded reads. They should validate ranges and optionally enforce per-purpose maximums.

Video/audio playback, waveform, frame capture, model load, and puppet load should use source refs and engine-local open.

Alternative considered: a single generic `readAll` helper.

Rejected for memory and latency reasons. If needed, a future `readSmallFile(maxBytes)` can be added with explicit limits.

### Decision 5: Package migration happens through `@neko/neko-client`

Add file helpers to `EngineClient` or a small `EngineFileAccessClient` exported by `@neko/neko-client`:

```text
registerFile(source, purpose) -> RegisteredFile
unregisterFile(token)
readFileRange(token, start, end)
readFileEntry(token, entryPath)
withRegisteredFile(source, purpose, task)
```

`neko-preview` can then replace `PreviewFileServer` internals with this shared client. `neko-cut`, `neko-puppet`, `neko-live`, and `neko-model` should not each implement their own file token and range behavior.

Alternative considered: a shared utility inside `neko-preview`.

Rejected because the need is cross-package and not preview-specific.

### Decision 6: Architecture guards use allowlists, not blanket bans

It is legitimate for Extension code to read:

- project JSON CustomDocuments
- workspace settings/preferences
- small text sidecars and lyrics
- test fixtures
- generated exports

It is not legitimate for Extension/Webview paths to read large binary source data for media/model/puppet/document preview once an engine file access path exists.

Boundary tests should be path- and extension-aware rather than simply banning every `readFile`.

## Risks / Trade-offs

- [Risk] Token leakage if consumers forget to unregister. → Mitigation: provide `withRegisteredFile` helpers, TTL cleanup, and route/controller tests for unregister behavior.
- [Risk] Existing preview routes and new files routes diverge. → Mitigation: implement both aliases against the same registry and add tests that compare behavior.
- [Risk] `sourceRef` support creates duplicate input forms. → Mitigation: document `sourceRef` as preferred, keep `source` as compatibility, and add migration tasks by package.
- [Risk] Webview model loaders may still need resource URLs for glTF external textures. → Mitigation: expose token-scoped base URLs or manifest resource URLs before removing direct `webviewUri` model loading.
- [Risk] Allowed roots are configured inconsistently across hosts. → Mitigation: centralize root configuration in the engine extension startup and reuse it across HTTP, N-API, and ActionRouter paths.
- [Risk] Architecture tests produce false positives for legitimate text reads. → Mitigation: maintain explicit allowlists and classify file extensions/purposes.

## Migration Plan

1. Add generic file access DTOs and registry while keeping existing preview APIs working.
2. Add `/v1/files/*` routes and `files:*` actions backed by the same registry.
3. Add `@neko/neko-client` helpers and refactor `neko-preview` to use them internally.
4. Migrate `neko-cut` subtitle `readFileRange` to engine range reads.
5. Add `puppets:load_source` and migrate `neko-puppet`/`neko-live` off `.inp` base64 Webview transport.
6. Add `sourceRef` support to video/audio/model actions, keeping `source` compatibility.
7. Prepare `neko-model` Webview resource loading through token-scoped URLs where needed.
8. Add architecture guards, then remove obsolete package-local binary read helpers.

Rollback is straightforward for each package-level migration because compatibility routes and raw `source` inputs remain until final cleanup.

## Open Questions

- Should token TTL be enabled by default for all registered files, or only for one-shot helpers?
- Should `files:stat` include hashes, or only size/mtime/MIME in the first batch?
- Should project JSON references (`.nkm`, `.nkp`) resolve inside engine immediately, or remain Extension-owned until model/puppet source loading is migrated?
- Should agent image attachments use the same file access token path, or a separate artifact store abstraction that can delegate to file access for local files?
