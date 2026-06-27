## Why

Agent 需要安全地调用图片、视频、音频和脚本类外部处理工具，但当前任意本地命令、系统 temp 路径和未统一的资源投影会绕过 Webview CSP、`localResourceRoots`、`.neko/.cache/resources` 和项目事实路径约束。

近期文档图片先显示后失败的问题说明，Agent、Canvas、Storyboard 和外部处理器必须统一使用受管资源缓存、稳定 `ResourceRef` 和 Host 侧路径授权，而不是传递裸绝对路径或依赖 prompt 约束。

## What Changes

- Introduce a contract-first External Processor capability for Agent-visible local media/script processing.
- Add `ExternalProcessorManifest` JSON contract, root alias policy, env profile policy, processor trust projection, and fail-visible validation.
- Add `ExternalProcessorRegistry` with source-scope projection for builtin, project, personal/local, Market, and extension/plugin processors.
- Add Host-owned processor execution path that allocates output roots, applies `PathAccessPolicy`, enforces env/network/cwd/timeout policy, and returns `ResourceRef` plus diagnostics/provenance.
- Add `ProcessorResourcePort` so Agent runtime can express retention, pin/unpin, status, and promote/create-asset intents without importing VS Code or touching cache files.
- Extend ResourceCache-backed processor outputs with run/stage provenance, retention hints, pinned/debug/intermediate/promoted lifecycle, and budget-triggered GC expectations.
- Add approval and Developer Mode boundaries for high-risk processor execution without reintroducing persistent `Bash(*)` allow rules.
- Remove or quarantine legacy/default paths that let Agent-facing document images or processor outputs use system temp as displayable resources.
- **BREAKING**: Prelaunch processor, Agent resource handoff, and document/image transfer payloads that rely on naked absolute temp paths or durable `cachePath` fields are rejected in favor of `ResourceRef`, source refs, workspace-relative paths, or `${VAR}/path`.

## Capabilities

### New Capabilities

- `agent-external-processor-sandbox`: Defines processor manifest, registry, execution policy, resource output, retention, approval, and failure behavior for Agent-driven external processing.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/agent-types`: processor manifest, registry projection, resource port, diagnostics, and invocation DTOs.
  - `packages/neko-agent/packages/agent`: capability injection, tool orchestration, approval requests, processor run/stage tracking, and Developer Mode policy.
  - `packages/neko-agent/packages/extension`: Host binding, path access policy integration, processor execution adapter, local resource projection, and document/image resource handoff cleanup.
  - `packages/neko-types`: shared `ResourceRef`, `ResourceCacheService`, path/resource diagnostics, possible retention metadata extensions, and host-safe DTOs.
  - `packages/neko-market`: processor install target projection, trust mapping, entitlement/revocation diagnostics, and uninstall lifecycle integration.
  - `packages/neko-assets`: media library root resolution and explicit promote/create-asset flow for processor outputs.
- Affected systems:
  - Webview resource access via `LocalResourceAccessService` and `webview.asWebviewUri(...)`.
  - `.neko/.cache/resources` and extension `globalStorageUri/resources`.
  - Agent Skill and Capability registration/injection boundaries.
  - Market trust and install target governance.
- Non-goals:
  - Do not turn Neko Agent into a general coding agent or default shell runner.
  - Do not implement a full OS/container sandbox in P0.
  - Do not build a general workflow DAG engine in this change; chains are explicit processor invocations with run/stage provenance.
  - Do not make Webview read local files, cache manifests, or system temp directly.
