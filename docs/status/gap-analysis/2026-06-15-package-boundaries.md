# 子包边界与代码规范 Gap 分析

快照日期：2026-06-15
检查范围：`packages/` 子包结构、UI 公共层、共享代码、Extension/Webview 边界、Engine/client/proto、Agent 子包、Entity/Search 服务和现有边界守卫。

## 当前状态

- 根架构已经明确 L0/L1/L2/Engine 分层，`docs/architecture/package-boundaries.md` 已补充包级代码规范。
- `.dependency-cruiser.cjs` 已守卫循环依赖、L0 内部依赖、Webview 不导入 `vscode`、Extension 不导入 React、部分扩展间直接依赖。
- `scripts/check-neko-agent-boundaries.mjs` 已守卫 `neko-agent` 的 Webview、Extension、agent、platform、ai-sdk、agent-types 边界，并跟踪兼容桥过期信息。
- `scripts/check-3d-route-a-boundaries.mjs` 已守卫 3D Route A 中 Extension Host 不代理视频帧/PCM/高频 scene delta。
- `packages/neko-ui` 已有边界测试：禁止 `@neko/ui` import `vscode`、Node-only module、功能包和 `acquireVsCodeApi`；限制 legacy `@neko/shared/components` 扩散；保护 Agent UI isolation；保护 creative StatusBar 边界。
- `packages/neko-types` 主入口已有测试确保不导出 React UI components。
- `packages/neko-entity` 已有架构测试保护 core/providers/projections 不依赖 host、UI、Agent 或功能实现。
- `@neko/neko-client` 已作为环境无关 HTTP/WS client 和 Webview stream client 边界存在。

## 缺口

- `pnpm check:deps` 当前只覆盖一部分 TS 源目录，尚未覆盖全部 extension/webview/core 包。
- `.dependency-cruiser.cjs` 对跨扩展依赖多为 warning，部分规则仍是按扩展逐项列举，新增包时可能漏配。
- `packages/neko-agent/packages/extension/tsconfig.json` 和 `packages/neko-market/packages/extension/tsconfig.json` 当前为 `strict: false`、`strictNullChecks: false`，与仓库目标约束存在差距。
- `@neko/shared/components` 仍作为 legacy UI subpath 存在，虽然有 allowlist，但迁移未完全关闭。
- `@neko/shared` 包内仍包含 L0 主入口、VS Code subpath、React/i18n subpath 和 legacy components subpath，需要开发者明确区分入口层级。
- `neko-assets`、`neko-tools` 等包仍有历史根级 extension-ish 结构，新规范需要兼容但不应继续扩散。
- Scene stream 的 GOP 策略不是全局 GOP=1；低延迟交互路径有 GOP=1 场景，但 Timeline/Puppet/Preview 等路径存在不同目标，文档和实现需要避免过度简化。
- 领域目录目前尚未为 agent、video、audio、model、story 等创建具体领域入口，Agent 进入领域时仍主要依赖根架构和包边界文档。

## 风险

- 如果共享 UI 继续从 `@neko/shared/components` 扩散，会重新模糊 L0 共享契约和 L2 React UI 的边界。
- 如果功能包直接调用 Engine HTTP endpoint，`@neko/neko-client` 的 wire normalizer、权限和测试会被绕过。
- 如果 Extension Host 代理高频媒体帧或 scene delta，会破坏 Route A 和 zero-copy/低延迟方向。
- 如果领域架构直接写入 `docs/architecture/<domain>`，系统约束和领域细则会再次混在一起。
- 如果只依赖人工阅读文档，不扩大自动化边界守卫，新包或历史根级包容易形成新的例外。

## 建议动作

1. 扩大 `pnpm check:deps` 的扫描范围，覆盖所有 active extension/webview/core TS 包，并把新增包纳入默认规则。
2. 将跨扩展直接依赖规则从逐项枚举演进为模式化规则；条件成熟后把 warning 升级为 error。
3. 为 `neko-agent` extension 和 `neko-market` extension 建立 strict 收敛计划，适合转入 OpenSpec change。
4. 继续收敛 `@neko/shared/components` allowlist，新 UI 只进入 `@neko/ui`。
5. 为高频领域创建入口文档：`docs/domains/agent/README.md`、`docs/domains/video/README.md`、`docs/domains/audio/README.md`、`docs/domains/model/README.md`。
6. 将 Engine stream/GOP/Route A 规则在 `docs/domains/model/architecture.md` 或 Engine 领域文档中细化，系统级文档只保留不变量。

## 行动项流转

- 自动化守卫扩大、strict 收敛和 legacy UI 关闭应转入 `openspec/changes/`，因为涉及设计、实施和验收。
- 领域入口补齐可直接作为文档任务推进；若一次性覆盖多个领域，也可转入 OpenSpec change。
- 本快照不承载任务状态；后续只新建带日期的状态文档，不维护 `latest` 文件。

## 稳定结论归档

- 包边界和代码规范已归档到 `docs/architecture/package-boundaries.md`。
- 当前 gap 保留在本状态快照中。
