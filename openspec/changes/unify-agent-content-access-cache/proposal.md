## Why

Agent 当前的图片、文档、附件和感知资产读取路径仍分散在工具、服务和预处理器里，部分二进制/媒体数据直接由 Extension `fs.readFile` 读取，部分缓存物化由工具层直接调用 `ResourceCacheService`。这会让 Agent 感知缓存实现细节，绕过 `neko-engine` 二进制/媒体权威入口，也让权限、路径转换和缓存重建规则难以统一验证。

现在已经明确系统边界：`neko-engine` 负责二进制/媒体读取与派生计算，`ResourceCacheService` 负责透明缓存和重建，`ProjectFileStore`/Host fs 负责纯文本和项目事实，`ContentAccessService` 负责编排。Agent 需要收敛到这条边界，避免后续 `ReadImage`、`ReadDocument`、Canvas 交接和 provider multimodal 输入继续复制局部实现。

## What Changes

- Introduce an Agent-owned content access runtime/facade that routes Agent tools and provider asset loading through `ContentAccessService` semantics.
- Route binary/media reads for `ReadImage`, `ReadDocumentImage`, document page images, perception assets, image attachments, and media preprocessing through Engine file access or content-access providers instead of direct tool-level `fs.readFile`.
- Preserve pure text/project fact reads outside Engine: text documents, Markdown, JSON/YAML/TOML configuration, and `nk*` project files continue through Host text/project-file services.
- Make document/cache materialization transparent to Agent tools: tools pass source refs, document refs, `ResourceRef`s, intent, target, and caller, but do not branch on cache paths or call cache directory rules directly.
- Keep `ResourceCacheService` as the owner of cache path, variant, fingerprint, MD5/content de-duplication, rebuild, invalidation, projection, and GC behavior.
- Remove default success paths that treat `.neko/.cache/resources` materialized paths, old `cachePath`, runtime scratch paths, Webview URIs, blob URLs, or Engine tokens as durable Agent/Canvas/Storyboard identity.
- Keep Webview/TUI/Extension projection out of host-agnostic Agent/Platform contracts: `webviewUri`, `WebviewGeneratedAsset`, `ForWebview` runtime APIs, and cache-path display helpers must be replaced by stable refs plus host-specific projection adapters.
- Keep `platform/src/files`, `platform/src/document`, and `platform/src/media` as domain orchestration surfaces only: they may define plans, DTOs, parsers, request shaping, generated asset metadata, and delivery policy, but they must not own binary/media file services, cache layout, Webview URI projection, or Agent-visible cache/local path identity.
- Make Extension bridge projection fail-visible: converting local/cache/generated resources to Webview URIs must not fall back to raw local paths or cache paths when authorization/projection fails.
- Keep TUI output and CLI save flows from exposing `.neko/.cache/...` as the user-facing success contract; cache remains transparent and rebuildable behind content access.
- Expose generated media outputs to Agent/Webview as stable generated asset refs such as `generated-assets/<asset-id>.<ext>` plus host render projections; physical generated/cache paths remain Host-only for projection, indexing, and explicit open/reveal side effects.
- Add path-level tests proving Agent tools hit the canonical content-access/Engine/cache path and do not pass by direct binary reads or cache-path fallback.
- **BREAKING**: Prelaunch Agent tool inputs and internal transfer payloads that rely on cache paths, runtime paths, old `cachePath`, `runtimePath`, `cacheResourceRef`, Webview URI, blob URL, or scratch path as durable identity are rejected or diagnosed instead of being silently accepted.

## Capabilities

### New Capabilities

- `agent-content-access-cache`: Defines how Agent tools, attachments, perception assets, document images, binary/media reads, transparent cache materialization, path conversion, and permissions are routed through unified content access boundaries.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/extension`: `ReadImage`, `ReadDocument`, `ReadDocumentImage`, document tool runtime, media capability provider, document capability provider, perception asset loader, attachment processor, media preprocessor, local resource access integration, and focused tests.
  - `packages/neko-agent/packages/agent`: message resource projection, working memory sanitization, tool result contracts, perception cards, Webview-named runtime projection APIs, and builtin skill guidance where they reference tool resource semantics.
  - `packages/neko-agent/packages/agent-types`: work item and media result contracts that currently allow Webview-specific generated asset payloads.
  - `packages/neko-agent/packages/platform`: document reader/runtime access boundaries, media vision preprocessing where binary bytes are currently read outside Engine/content access, and media task projection APIs that currently accept Webview-specific asset DTOs.
  - `packages/neko-agent/packages/cli-tui`: terminal media save/progress output that currently exposes managed cache paths as user-facing success paths.
  - `packages/neko-types`: `ContentAccessService`, `ResourceCacheService`, document resource refs, resource cache provider contracts, content access providers, local resource projection, and related tests.
  - `packages/neko-client` / `packages/neko-engine`: no new broad Engine feature is expected, but implementation may need to use existing `EngineClient.registerFile`, `readFileRange`, `readFileEntry`, preview APIs, and file access allowed-root policy consistently.
- Affected systems:
  - Agent tool contracts for `ReadImage`, `ReadDocument`, and `ReadDocumentImage`.
  - Native multimodal provider asset loading.
  - Document image materialization and transfer to Canvas/Storyboard/composite payloads.
  - Webview resource projection through `LocalResourceAccessService` and `webview.asWebviewUri(...)`.
  - Webview/TUI adapter boundaries for runtime messages, work item projection, generated asset projection, and local resource display.
  - `.neko/.cache/resources` documents/media/preview variants and extension-private cache behavior.
- Non-goals:
  - Do not make `neko-engine` read or write pure text/config/project fact files.
  - Do not redesign the full resource cache manifest format beyond what is needed for Agent routing.
  - Do not introduce a cloud/distributed file service or remote tenancy abstraction.
  - Do not make Webviews read local files or cache manifests.
  - Do not preserve old cache-path success behavior except in explicit migration/rejection/diagnostic tests.
