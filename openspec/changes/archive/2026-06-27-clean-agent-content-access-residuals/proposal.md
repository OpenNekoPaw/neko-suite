## Why

`unify-agent-content-access-cache` 已经把 Agent 主要工具路径迁到统一内容访问和透明缓存边界，但仍有一些残留实现属于 host adapter、兼容桥、输出持久化或命名层面的债务。现在需要把这些残留显式收敛，避免 Agent/Platform 再次把缓存路径、Webview 运行时句柄或 platform-local 文件逻辑当成稳定业务契约。

## What Changes

- 清理 Agent/Platform/Webview/TUI 中仍暴露或扫描 `cachePath`、`runtimePath`、`localPaths`、`webviewUri`、`ForWebview`、`.neko/.cache` 的残留成功路径。
- 将 `platform/src/files`、`platform/src/document`、`platform/src/media` 中仍承担 Host IO、缓存布局、generated output path 或 Webview projection 的代码改为领域 DTO/plan/provider adapter，具体 IO 通过注入的共享服务执行。
- 将 Agent Extension 中的 document/resource cache builder、Agent content runtime builder 中可复用的非 Agent 规则移出 Agent 私有实现，或明确降级为薄 adapter。
- 移除或隔离 Webview presenter 中的 legacy payload 展示逻辑，确保新路径只接受 stable refs、source refs、asset/entity IDs 或 host-neutral render descriptors。
- 将 generated media output 的物理路径保持在 Host 内部；Agent-visible 结果只暴露 generated asset ref、resource ref、用户选择的正式保存位置或诊断。
- **BREAKING**: 新的 Agent/Canvas/Storyboard/composite 成功路径不再接受 legacy cache/runtime fields 作为可恢复输入；旧字段只允许在迁移/拒绝/诊断测试中出现。

## Capabilities

### New Capabilities

- `agent-content-access-residual-cleanup`: Defines residual cleanup rules for Agent content access, host-neutral contracts, cache-hidden generated outputs, and migration-only legacy fields.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/agent`: runtime exports, message/resource projection, working memory, task projection, builtin skill guidance.
  - `packages/neko-agent/packages/agent-types`: work item and generated asset contracts that must stay host-neutral.
  - `packages/neko-agent/packages/platform`: `files`, `document`, `media` directories; generated asset output persistence; media delivery/result/progress plans.
  - `packages/neko-agent/packages/extension`: Agent content runtime assembly, document resource cache service, local resource projection, media delivery host, tool bridges.
  - `packages/neko-agent/packages/webview`: presenters and transfer payload builders for tool calls, composite content, storyboard, clipboard, and work items.
  - `packages/neko-agent/packages/cli-tui`: generated media progress/result display.
  - `scripts/check-neko-agent-boundaries.mjs` and quality ledgers for residual guardrails.
- Non-goals:
  - Do not redesign cross-domain content access for Canvas/Cut/Preview/Model/Sketch in this change; that is covered by `unify-cross-domain-content-access-runtime`.
  - Do not delete `platform/src/files`, `platform/src/document`, or `platform/src/media` wholesale. Keep domain orchestration, contracts, and provider-independent policies.
  - Do not make Engine read pure text/config/project facts.
  - Do not preserve cache-path fallback as a convenience path.
