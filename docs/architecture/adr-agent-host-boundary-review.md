# ADR: neko-agent Host Boundary Review

## 状态

Proposed (2026-06-12, updated 2026-06-13)

## 范围

本文记录 `packages/neko-agent` 最近一个月快速扩展后的职责边界审计，重点检查三层约束是否仍然成立：

1. Extension Host 只做 VSCode 宿主桥接。
2. Webview 只做 UI、状态投影和用户交互。
3. `@neko/agent` / runtime 承接 Agent 业务流程、领域规则和可复用编排。

相关文档：

- `packages/neko-agent/ARCHITECTURE.md`
- `docs/architecture/agent-architecture-review.md`
- `docs/architecture/adr-agent-runtime-bootstrap.md`
- `docs/architecture/adr-code-review-quality-gates.md`
- `docs/architecture/adr-code-debt-cleanup-strategy.md`

## 背景

从 2026-05-12 到 2026-06-12，`packages/neko-agent` 出现大规模增量：

| 指标 | 数量 |
|------|------|
| 相关提交 | 84 |
| 变更文件 | 417 |
| 行数变化 | `+59,908 / -1,585` |
| 生产代码增量 | 约 `+32,325` |
| 测试增量 | 约 `+25,701` |
| 新增文件 | 156 |

这些增量主要服务真实业务主线：CompositeArtifact、文档资源缓存、Project Search、角色对话、Skill Catalog、漫画/分镜/动画工作流、media skill、agent capability injection。测试增量较高，说明不是单纯堆实现代码。

但新增代码也暴露出边界风险：部分 Extension 文件开始承载业务编排和领域规则，超出“纯桥接层”的定位。

## 当前判断

结论：**原始审计判断成立；`implement-agent-boundary-cleanup` 已完成首批收口，当前风险从“业务逻辑已放错层”转为“防止回流并继续拆剩余 host adapter 厚度”。**

这不是全线违背架构，也不是大面积死代码问题。相关代码大多是活跃、可测试、功能正确的实现；核心风险在于业务逻辑位置错误。若继续以当前形态添加功能，Extension 会变成新的业务宿主，Webview 也可能继续进入持久化领域数据链，最终削弱 CLI / TUI / 测试运行时复用能力。

### 2026-06-13 实施更新

OpenSpec change `implement-agent-boundary-cleanup` 已完成以下边界迁移和 guardrail：

| 原风险面 | 当前实现状态 |
|----------|--------------|
| `characterDialogueController.ts` 默认业务策略 | profile enrichment、transcript evaluation、fallback report、suggestion policy、headless probe orchestration 等已迁到 `@neko/agent/runtime` 的 `character-dialogue-runtime`；Extension 保留 VSCode/Webview/tab/QuickPick/file/Platform service adapter |
| Webview `entity-memory-contribution-inference.ts` | Webview 侧文件已删除；Markdown 表格解析、实体候选/观察维度/置信度和 reviewable contribution 构造迁到 `@neko/agent/artifact`；Webview 只渲染 runtime projection |
| `characterEvidenceLoader.ts` evidence 策略 | locator collection、story-scene 派生、freshness、relevance、trimming 和 omission metadata 已迁到 runtime evidence strategy；Extension 保留 VSCode command/file/Story API reader |
| `agentProjectSearchAdapters.ts` 搜索聚合策略 | creative entity dedupe、partition status/freshness 聚合迁到 `@neko/search/core`；Dashboard row projection 和 script role candidate extraction 迁到 `@neko/entity/projections` |
| projectSearch shim | Agent Extension `services/projectSearch/*` shim 已删除，import 改到 `@neko/search/host-vscode` |
| guardrail | `pnpm check:agent-boundaries` 现在校验 Webview durable contribution、Agent-local projectSearch shim、Extension search aggregation helper、LCD register、legacy centralized tool metadata 和 compatibility exception 生命周期 |

## 证据

### Webview

Webview 目前没有明显直接导入 `vscode`、`@neko/agent`、`@neko/platform` 的越界模式，整体仍以组件、handler、presenter 和 Zustand 状态为主。

历史高危点 `packages/neko-agent/packages/webview/src/presenters/entity-memory-contribution-inference.ts` 已迁出 Webview。当前 guard 禁止 Webview 重新生成 durable `EntityMemoryContribution`、默认置信度或 review policy。

### Agent / runtime

许多新增业务已经进入 `@neko/agent/runtime` 或 `@neko/agent`：

- `CharacterDialogueSession`
- `character-evidence`
- `shot-image-prep-runtime`
- `comic-animation-indexing-runtime`
- `storyboard-image-runtime`
- `agent-capability-injection-runtime`

这符合 “Agent 做业务” 的方向。

### Extension

Extension 层出现明显偏厚文件：

| 文件 | 风险 |
|------|------|
| `packages/neko-agent/packages/extension/src/chat/characterDialogueController.ts` | 已接入 `character-dialogue-runtime`；仍需持续防止 controller 重新累积默认业务策略 |
| `packages/neko-agent/packages/extension/src/evidence/characterEvidenceLoader.ts` | 已瘦身为 VSCode command / file / Story API adapter；runtime evidence strategy 拥有 reusable policy |
| `packages/neko-agent/packages/extension/src/services/agentProjectSearchAdapters.ts` | 已瘦身为 VSCode command / file / Story API adapter composition；search/entity 包拥有聚合和候选语义 |

这些文件虽然大量使用依赖注入，测试性较好，但职责已经超过 Extension Host 的理想边界。

### 四文件复核结果

| 文件 | 行数 | 合规职责 | 越界职责 | 严重度 |
|------|------|----------|----------|--------|
| `packages/neko-agent/packages/extension/src/chat/characterDialogueController.ts` | 原 2,333 | postMessage、Disposable、QuickPick、文件读写、命令注册、Tab 状态管理 | 已迁出主要默认策略到 runtime；剩余风险是 controller 回流 | 已收口，继续 guard |
| `packages/neko-agent/packages/extension/src/evidence/characterEvidenceLoader.ts` | 原 1,021 | VSCode 文件读取、VSCode command 调用、Extension API 发现、factory 隔离 VSCode 依赖 | 已迁出 story-scene locator、裁剪、relevance、freshness | 已收口 |
| `packages/neko-agent/packages/extension/src/services/agentProjectSearchAdapters.ts` | 原 916 | VSCode command 调用、workspace 文件读取、Extension API 发现 | 已迁出 creative entity 去重、freshness/status、脚本角色候选解析 | 已收口 |
| `packages/neko-agent/packages/webview/src/presenters/entity-memory-contribution-inference.ts` | 原 347 | 无明确 UI-only 职责 | 已删除；domain/runtime 生成 reviewable contribution | 已收口 |

`characterDialogueController.ts` 的 `createSkillPrimitivePorts()` 实际暴露了 assembler、evidence、headless probe、evaluation、save、apply 等端口清单；这些端口本身说明对应能力应成为 runtime service，而不应由 Extension controller 拥有默认业务实现。

## 决策

### 1. 明确三层职责

Extension Host 允许保留：

- VSCode command 注册和调用。
- Webview `postMessage` / `onDidReceiveMessage`。
- 文件系统、URI、local resource 授权。
- `vscode.Disposable` 生命周期。
- VSCode QuickPick / warning / modal 等宿主交互。
- 对 Agent/runtime 端口的 adapter 实现。

Extension Host 不应长期拥有：

- Agent 回合、角色对话、profile enrichment、evaluation、suggestion policy 的业务规则。
- Evidence relevance、freshness、budget、locator 派生等可复用策略。
- Project search 的跨来源聚合、候选去重、状态聚合等领域规则。
- 文档、实体、Canvas、Storyboard 的稳定契约投影规则。

Webview 允许保留：

- 组件、布局、交互和本地 UI 状态。
- 协议消息 handler。
- UI presenter 和展示友好的派生字段。
- 纯显示用排序、分组、折叠、图标、标签、tooltip 文案。

Webview 不应长期拥有：

- Entity memory / artifact / workflow 的权威推断。
- Agent 工具结果的业务修复或持久格式迁移。
- 可影响 Agent 后续决策的领域规则。

Agent/runtime 应拥有：

- Agent 工作流和回合编排。
- Skill、tool、approval、memory、feedback、artifact、evidence 的领域策略。
- 可在 Extension、CLI、TUI、测试 runner 复用的业务流程。
- 对 UI 和宿主无关的契约投影。

Platform / domain packages 应拥有：

- `@neko/platform`: 文档访问、模型/Provider、媒体生成等服务能力。
- `@neko/search`: project search 查询、聚合、去重、freshness/status 策略。
- `@neko/entity`: creative entity profile、candidate、relationship、evidence projection。

### 2. 新功能默认走 Port + Runtime

新增 Agent 功能必须优先定义 runtime port：

```text
Extension VSCode adapter
  -> runtime port
  -> @neko/agent business orchestration
  -> @neko/platform / @neko/search / @neko/entity domain service
```

Extension 可以提供 adapter，但默认不写业务默认实现。若确需临时写在 Extension，必须：

1. 标注 `TODO(P1|P2)`。
2. 写明目标 owner package。
3. 写明删除条件或 sunset 日期。
4. 有测试保护当前行为。

### 3. 优先迁移目标

执行关系需与 `adr-code-debt-cleanup-strategy.md` 对齐：先完成 cleanup strategy Phase 1 中的 `projectSearch` shim 删除和相关 imports 修正，再执行以下边界迁移目标 1-4。cleanup strategy Phase 3 的 Agent 工具注册双轨收敛与这些边界迁移没有代码级阻塞依赖，可并行推进。边界迁移期间若新增 runtime service 或 tool surface，不得新增 legacy tool path 注册；应优先接入 CapabilityProvider，或带 `TODO(P1)`、owner、删除条件和测试保护。

按风险和复用价值，优先迁移：

1. `characterDialogueController.ts`
   - 保留 VSCode/Webview/tab 桥接。
   - 迁出 profile preparation、transcript evaluation、fallback report、suggestion policy、headless probe orchestration。
   - 目标：`@neko/agent/runtime` + `@neko/entity` ports。

2. `entity-memory-contribution-inference.ts`
   - 停止由 Webview 生成可持久化 `EntityMemoryContribution`。
   - 将 Markdown table parsing、entity candidate inference、observation dimension inference、confidence scoring 迁到 `@neko/agent` 或 `@neko/entity`。
   - Webview 只渲染 runtime/domain package 返回的贡献预览和用户确认状态。

3. `characterEvidenceLoader.ts`
   - 保留 VSCode command reader、file reader、Story API adapter。
   - 迁出 locator collection、freshness handling、relevance trimming、Story scene locator derivation。
   - 目标：`@neko/agent/runtime` evidence service，依赖 injected readers。

4. `agentProjectSearchAdapters.ts`
   - 保留 VSCode command adapter。
   - 迁出 adapter composition、candidate extraction、dedupe、freshness/status aggregation。
   - 目标：`@neko/search` / `@neko/entity`。

### 4. 不以行数作为唯一门禁

大文件不是自动错误，但以下组合应触发架构 review：

- Extension 文件超过 800 行且包含非 VSCode / 非 postMessage 业务规则。
- Webview presenter 生成可持久化领域数据。
- Extension 同时依赖 `vscode`、`@neko/agent/runtime`、`@neko/entity`、`@neko/search` 并包含多套默认策略。
- 同一业务规则在 Extension 和 Agent/runtime 两处存在。

## 五层分析

| 层面 | 当前问题 | 收口原则 | 验证 |
|------|----------|----------|------|
| 职责 | Extension 承担部分角色对话和 evidence 业务；Webview 生成持久化实体记忆贡献 | Extension 只保留 adapter；Webview 只保留 UI 投影；业务迁到 runtime/domain package | 文件职责 review + targeted tests |
| 依赖 | 依赖方向大体正确，但业务规则位置偏宿主 | 通过 port 注入 VSCode 能力，runtime 不依赖 VSCode | `pnpm check:agent-boundaries` |
| 接口 | 多个流程以 controller 内部接口存在 | 抽出 runtime contracts，稳定输入/输出 | contract tests |
| 扩展 | 新增角色/证据/搜索能力容易继续堆进 Extension；UI 兜底可能演变成业务权威 | 新能力先建 domain/runtime service，再接 VSCode/Webview adapter | 新功能 review checklist |
| 测试 | 测试多，但不少测试绑定 Extension 实现 | 增加 runtime 纯单测，Extension 测 adapter | package-level Vitest |

## 质量门禁

后续涉及 `packages/neko-agent` 非平凡变更时，除常规命令外，应至少检查：

```bash
pnpm check:agent-boundaries
pnpm --dir packages/neko-agent/packages/agent test -- --run
pnpm --dir packages/neko-agent/packages/extension test -- --run
```

若变更 Webview：

```bash
pnpm --dir packages/neko-agent/packages/webview test
pnpm --dir packages/neko-agent/packages/webview build
```

如果 `check:agent-boundaries` 因 compatibility exception 失败，不应仅续期日期；必须说明：

1. 为什么还不能迁移。
2. 新的 owner 和 replacement。
3. 下一次删除条件。
4. 续期期间禁止新增同类依赖或调用点。

## 残余风险

- 角色对话相关功能仍可能继续向 Extension 增长，形成新的 God Controller。
- Evidence / Project Search 已完成首批迁移；后续新增规则仍需默认进入 runtime/domain package。
- Webview durable entity memory inference 已迁出；残余风险是新 presenter 重新生成持久领域事实。
- AI SDK legacy bridge 仍需按 `adr-code-debt-cleanup-strategy.md` 的 LCD-009 provider sunset 表跟踪。

## 后续任务建议

1. 继续拆 `agentTurnBridge` / `AgentRunnerPort` 等已续期 compatibility exception，避免 2026-07-04 后阻断 `check:agent-boundaries`。
2. 新增角色、证据、搜索、实体记忆能力时，先建 runtime/domain service，再接 Extension/Webview adapter。
3. 保持 `pnpm check:agent-boundaries` 为边界和 LCD metadata 的必跑门禁。
4. AI SDK legacy bridge 按 LCD-009 provider 行逐个 sunset，不做整体删除。
