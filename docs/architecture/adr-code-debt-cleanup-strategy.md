# ADR: Prelaunch Legacy, Fallback, Deprecated, and Dead-Code Cleanup Strategy

## 状态

Proposed (2026-06-01, updated 2026-06-13, prelaunch cleanup reset 2026-06-13, stage-two baseline 2026-06-13)

## 范围

本文记录 `packages/` 下 dead code、deprecated / legacy surface、fallback surface 和冗余代码的清理策略。

本次更新采用新的前提：**Neko Suite 当前没有上线服务，也没有必须兼容的旧用户数据 / 旧协议窗口。旧格式、旧字段、旧 shim 和旧 runtime 兼容分支不再默认保护。**

因此，清理目标从“谨慎保留旧格式兼容”调整为：

1. 旧格式 / 旧协议默认迁移或删除。
2. runtime / domain 内部只认 canonical model。
3. fallback 只允许处理当前运行时失败或当前能力缺失。
4. 仍在执行当前功能的 bridge 必须有 owner、replacement、removeAfter 和 tests。
5. 静态分析误报必须用精确 entry / ignore 建模，而不是把目录整体排除。

## 背景

此前 ADR 的判断是“没有大面积死代码腐烂”，这个方向仍成立，但表达过于保守：仓库里确实存在大量 `legacy`、`fallback`、`deprecated` 命中。它们不能直接等同于死代码，但也不能再被“未来兼容”一概保护。

当前清理需要区分两件事：

| 问题 | 处理 |
|------|------|
| 旧格式 / 旧协议 / 旧 shim | prelaunch 阶段默认删除或迁移到 canonical path |
| 当前 provider / 网络 / GPU / media / model 失败降级 | 保留为 runtime resilience，但必须有测试或 smoke 依据 |

目标架构仍是：

```text
Webview
  UI, local view state, typed user intent, projection
        |
        v
Extension Host
  VSCode commands, postMessage, fs/URI/workspace adapters, lifecycle
        |
        v
Runtime / domain packages
  canonical model, business rules, provider/search/entity/evidence policy
        |
        v
Platform / provider / engine
  concrete adapters and current runtime fallback
```

## 阶段说明

`cleanup-prelaunch-legacy-surfaces` 是第一阶段：它完成了 Agent projectSearch shim、Agent Webview shim、Agent message legacy projection、platform deprecated re-export、`neko-types` config 旧格式 reader、Agent 边界 register 等局部清理。它不是仓库级 legacy / fallback / deprecated / dead-code 清理完成信号。

第二阶段由 OpenSpec change `cleanup-remaining-legacy-debt-surfaces` 跟踪，目标是把剩余数千个词面命中拆成可执行批次，而不是继续靠大量 runtime 兜底代码维持旧模型。

机器可读来源：

- Agent LCD：`docs/architecture/agent-code-debt-lcd-register.json`
- 非 Agent cleanup ledger：`docs/architecture/code-debt-surface-ledger.json`
- 复现扫描：`pnpm check:legacy-debt`
- ledger 校验：`pnpm check:legacy-debt:ledger`

## 审计口径

审计时间：2026-06-13。

### 第二阶段 scanner 口径

大小写不敏感，按 occurrence 计数，范围为所有 `*.ts` / `*.tsx`，排除 `node_modules`、`dist`、`target`、`.turbo`、`coverage`、`out`：

```bash
pnpm check:legacy-debt
```

| Scope | files scanned | files with matches | `legacy` | `fallback` | `deprecated` | total occurrence |
|-------|---------------|--------------------|----------|------------|--------------|------------------|
| all TS/TSX | 3523 | 403 | 346 | 929 | 64 | 1339 |
| non-test TS/TSX | 2569 | 258 | 140 | 677 | 58 | 875 |

### 非测试源码口径

非测试源码额外排除 `*.test.ts`、`*.test.tsx`、`*.spec.ts`、`*.spec.tsx`、`__tests__`、`__mocks__`。

非测试源码语义分类基线：

| semanticClass | occurrence | 判断 |
|---------------|------------|------|
| `delete-now` | 0 | 词面 delete-now 已清零；knip unused files 也已清零 |
| `migrate-now` | 60 | 旧 schema / deprecated alias / legacy reader 主清理池；不得用重命名替代调用链判断 |
| `current-bridge` | 154 | 仍服务当前功能的桥接面，需 owner / removal trigger / tests |
| `runtime-resilience` | 315 | 当前 provider/model/GPU/media/network/file/capability 失败韧性路径 |
| `boundary-canonicalizer` | 37 | 输入边界 canonicalizer；不得扩散成 runtime 旧字段兼容 |
| `presentation-default` | 132 | UI copy、placeholder、default value 命名；不按旧格式兼容处理 |
| `needs-review` | 137 | 待拆分的 fallback 语义命中，需逐包进入 ledger 或重命名 |
| `domain-status` | 33 | 当前产品状态命名，如 deprecated entity/market state |
| `generated-source` | 7 | 源 IDL/schema 批次处理，不手改 generated output |
| `test-only` | 0 | 当前非测试口径无 test-only 命中 |
| `false-positive-word` | 0 | 当前非测试口径无 false-positive-word 命中 |

### TODO / FIXME / HACK

当前命中 21 处。历史文档中“`neko-agent` projectSearch shim 仍占 8 处”的说法已过时；Agent `projectSearch` shim 已删除。

### knip

执行：

```bash
pnpm exec knip --reporter json
```

当前仍失败，但文件 / 依赖漂移基线已清零，剩余项是 unused exports：

| 类别 | 当前状态 |
|------|----------|
| 未引用文件 | 0 个 |
| 已消除误报 | `neko-tools` AssetDiff Vite entry、`neko-canvas` narrative preview media runtime entry、Agent Webview 3 个 re-export shim |
| 已消除依赖漂移 | Agent Extension 的 `@neko/ai-sdk` 未声明；Agent AI SDK 的 `undici`、`@neko/shared`、`@neko-agent/types` 未声明；`neko-market` unused `@neko/neko-client`；`neko-tools` root unused devDeps `@neko/neko-client` / `@neko/shared`; `neko-ui` unused `@vitejs/plugin-react`; `jsdom` 测试依赖未声明 |
| 仍剩 unused exports | 157 个，分布在 60 个文件；Top packages: Agent Webview 70、Canvas Webview 56、Sketch Webview 8、Dashboard 6、Engine scripts 5 |
| 仍剩 knip 配置提示 | 10 条；其中包含冗余 ignore、缺失 package entry file 等，需要后续静态分析配置批次处理 |

已处理的 `knip` 未引用文件：

| 包 / 目录 | 文件 |
|-----------|------|
| `scripts` | `check-3d-route-a-boundaries.mjs`, `scene-render-diagnostics.mjs` 已建模为 root scripts |
| `neko-agent/packages/cli-tui` | `build-neko.ts` 已建模为 `build:exe` 入口 |
| `neko-puppet/packages/extension` | `export/index.ts`, `market/PuppetMotionInstallTarget.ts` 已删除 |
| `neko-dashboard/packages/webview` | `ContextStrip.tsx`, `ProjectTable.tsx`, `QuickActions.tsx`, `RecentActivity.tsx`, `utils/logger.ts` 已删除 |
| `neko-canvas/packages/webview` | `InlineControls.tsx`, `components/content/index.ts`, `ImageViewer.tsx` 已删除 |
| `neko-puppet/packages/webview` | `utils/inp-parser.ts` 已删除 |
| `neko-sketch/packages/webview` | `gradient-shaders.ts`, `psd-import.ts` 已删除 |
| `neko-story/packages/webview` | `tailwind.config.js`, `sceneBreakdown.ts` 已删除 |

## 清理分类

`legacy` / `fallback` / `deprecated` 词命中必须进入以下语义分类，不得直接按词删除，也不得再用“可能兼容旧数据”笼统保留。

| semanticClass | 默认动作 | 例子 |
|---------------|----------|------|
| `delete-now` | 无当前调用方时直接删除 | 无引用 re-export shim、已迁移 projectSearch shim |
| `migrate-now` | 迁调用方到 canonical API 后删除旧面 | deprecated re-export module、旧 message 字段 |
| `current-bridge` | 当前功能仍依赖时保留，但必须 sunset | AI SDK bridge for fal.ai / DashScope / Kling |
| `runtime-resilience` | 保留，覆盖当前运行失败或能力缺失 | provider/network/GPU/model/media fallback |
| `boundary-canonicalizer` | 只允许在输入边界集中存在 | 当前多来源输入统一成 canonical shape |
| `presentation-default` | 改名为 default/placeholder/emptyState | UI label / default dimensions |
| `generated-source` | 需改源 schema/IDL 后生成 | `*.engine.ts` legacy/deprecated fields |
| `test-only` | 只保留仍验证当前迁移/guard 的测试 | resolver bridge tests |
| `domain-status` | 当前业务状态，不按 cleanup 删除 | marketplace/entity `deprecated` status |
| `false-positive-word` | 不是 legacy 代码，只是词面命中 | dynamic import false positive 说明 |

## 当前 Agent 事实

| 项 | 当前判断 |
|----|----------|
| `projectSearch` shim | 已删除；`rg services/projectSearch packages/neko-agent` 无残留 |
| Webview durable `EntityMemoryContribution` inference | 已迁到 `@neko/agent/artifact`；Webview 只渲染 runtime projection 和发送 user intent |
| Agent Webview helper shim | `message-helpers.ts`、`media-extractors.ts`、`tool-constants.ts` 已删除；`check:agent-boundaries` 增加纯 re-export shim guard |
| AI SDK legacy bridge | 当前仍是 fal.ai / DashScope / Kling 的执行路径，按 `current-bridge` 保留并 sunset |
| `Message.toolCalls?` / `Message.thinking?` legacy projection | 已从 `agent-types/src/message.ts` 删除；Webview / runtime / persisted conversation projection 使用 `contentBlocks[].toolCall` 和 thinking content block |
| platform deprecated re-export / `LegacyToolCall` / `triggerKeywords()` | 已迁移调用方并删除旧 surface；`platform/src/types/index.ts` 不再导出已删除的 `prompt` / `task` / `tool` re-export module |
| Agent runtime legacy workflow / artifact / document / capability / IDC state path | 已删除 `createLegacyWorkflowUsageRecorder()` / `AgentLegacyWorkflow*`、artifact restore `.neko/cache` fallback、document read legacy wording、capability registry `legacyToolNames`、IDC runtime string `feedback.pendingGuidance` reader；`LCD-014` 记录 removed 防回流 |
| SkillInjection Track A legacy fallback | 已删除 coordinator 内 optional `SkillInjectionModule` 和 direct `composer.setSection` 旧写入路径；Track A 统一由 required `SkillInjectionModule` 投影 |
| `.hook` directory hook runtime | 已删除未接入的 `.hook/<name>/HOOK.ts\|js` runtime、Extension `HookManager` 和 `hookSource` bridge；保留当前 `.neko/settings.json` SettingsHookLoader 与 `.neko/hooks/*.md` catalog |
| IDC projected task payload mirror | 已删除 `IdcProjectedTaskPayload.content` 旧持久化 mirror；当前 serializer 只写 canonical `payload.name`，guard 拒绝带 `content` 的旧 payload |
| IDC projected task cleanup provenance fallback | 已删除 run cleanup 对损坏 payload binding 和缺 `runStartedAt` payload 的旧兜底；带 `runStartedAt` 的 cleanup 只匹配 canonical `runId + runStartedAt` provenance |
| SubAgent tool access compatibility | 已删除 `SubAgentConfig.allowedTools` / `SpecializedAgentPreset.allowedTools` 和空数组 allow-all 语义；SubAgent 只接受显式 `AgentToolPolicy`，Skill `allowedTools` 仍是独立当前契约 |
| Agent stage / prompt migration-era wording | 已清理 `ModuleOrchestrator`、StageMode、StageTaskShape、stage planner 的迁移期 `legacy/deprecated` 文案和测试 fixture 命名；无行为改动 |
| document parser deps | `epub2`、`fast-xml-parser`、`node-fetch`、`node-unrar-js`、`xlsx` 是 runtime `import()` 使用的静态分析假阳性，不是 dead code |

## LCD Register

Agent 机器可读来源：`docs/architecture/agent-code-debt-lcd-register.json`。

该 register 现在同时记录：

| 字段 | 含义 |
|------|------|
| `kind` | 生命周期债务类型，如 `migration-adapter`、`runtime-fallback-resilience` |
| `semanticClass` | prelaunch cleanup 语义分类，如 `delete-now`、`migrate-now`、`current-bridge` |
| `owner` | 负责包 / 子系统 |
| `replacement` | canonical replacement |
| `removeAfter` | 删除条件 |
| `tests` | 保护或删除验证 |

关键 Agent 条目：

| id | surface | kind | semanticClass | 状态 |
|----|---------|------|---------------|------|
| LCD-001 | Extension `services/projectSearch/*` | migration-adapter | delete-now | removed |
| LCD-002 | legacy centralized domain-tool registration path | stray-surface | current-bridge | active guardrail |
| LCD-009 | AI SDK bridge wrappers | migration-adapter | current-bridge | active with provider sunset |
| LCD-010 | message legacy fields、platform type re-export、`triggerKeywords()` | canonical-compatibility | migrate-now | removed |
| LCD-011 | Webview entity memory inference | misplaced-domain-logic | delete-now | removed |
| LCD-012 | dynamic document parser dependencies | static-analysis-false-positive | false-positive-word | active |
| LCD-013 | runtime fallback / provider degradation | runtime-fallback-resilience | runtime-resilience | active |
| LCD-014 | Agent remaining legacy runtime compatibility paths | canonical-compatibility | migrate-now | removed |
| LCD-017 | SkillInjection Track A direct writer fallback | canonical-compatibility | migrate-now | removed |
| LCD-018 | unwired `.hook` directory runtime / HookManager bridge | confirmed-dead-code | delete-now | removed |
| LCD-019 | IDC projected task payload `content` mirror | canonical-compatibility | migrate-now | removed |
| LCD-020 | SubAgent `allowedTools` compatibility entrypoint | canonical-compatibility | migrate-now | removed |
| LCD-021 | Agent prompt/stage migration-era wording | canonical-compatibility | migrate-now | removed |
| LCD-022 | platform `types/tool.ts` deprecated re-export | canonical-compatibility | migrate-now | removed |
| LCD-023 | IDC projected task cleanup provenance fallback | canonical-compatibility | migrate-now | removed |

`pnpm check:agent-boundaries` 会校验 LCD metadata、provider sunset rows、semantic classes、测试文件引用和 Webview re-export shim guard。

## Non-Agent Cleanup Ledger

非 Agent 机器可读来源：`docs/architecture/code-debt-surface-ledger.json`。

`pnpm check:legacy-debt:ledger` 会校验：

1. semanticClass 是否来自统一枚举；
2. active / planned / removed 状态是否合法；
3. package、surface、action、owner、replacement、removeCondition、validation.commands 是否齐全；
4. 非 Agent ledger 不得登记 Agent 路径；
5. requiredCoverage 指向的热点必须有 ledger entry；
6. removed entry 的 stalePatterns 不得重新命中。

当前 seed 条目覆盖：

| id | package | semanticClass | surface |
|----|---------|---------------|---------|
| LCDR-001 | `@neko/types` | `migrate-now` | storyboard table legacy sections / media refs |
| LCDR-002 | `@neko/types` | `migrate-now` | asset manifest legacy type migration |
| LCDR-003 | `@neko/types` | `boundary-canonicalizer` | storage deprecated aliases |
| LCDR-004 | `@neko/types` | `migrate-now` | Canvas shared legacy fields / playback route fallback |
| LCDR-005 | `@neko-canvas/webview` | `migrate-now` | legacy anchors / cells / group / renderer |
| LCDR-006 | `neko-assets` | `migrate-now` | character asset `legacyFallbackRef` 已删除，改用 optional `live2d` binding |
| LCDR-007 | `@neko-market/core` | `migrate-now` | installed registry old-version / legacy package type 已删除 |
| LCDR-008 | `@neko-puppet/webview` | `delete-now` | INP / puppet static-analysis candidates |
| LCDR-009 | `@neko/types` | `generated-source` | generated engine/proto legacy fields |
| LCDR-010 | `neko-preview` | `presentation-default` | Preview fallback display defaults |
| LCDR-011 | `neko-entity` | `domain-status` | entity deprecated status |
| LCDR-012 | `@neko-dashboard/webview` | `delete-now` | Dashboard unused-file candidates |
| LCDR-013 | `@neko/client` | `runtime-resilience` | engine/socket fallback handling |
| LCDR-014 | `@neko/shared` | `boundary-canonicalizer` | VSCode document resource cache canonical boundary |
| LCDR-015 | `@neko/shared` | `boundary-canonicalizer` | NKC migrator legacy versions |
| LCDR-016 | `@neko/shared` | `boundary-canonicalizer` | workspace media path variants |
| LCDR-017 | `@neko-story/webview` | `presentation-default` | ScriptTable fallback display defaults |
| LCDR-024 | `@neko/shared` | `migrate-now` | legacy resource cache provider / `legacyCachePath` 已删除 |
| LCDR-025 | `neko-preview` | `migrate-now` | document preview `document:data` base64 旧 reader 已删除 |
| LCDR-026 | `@neko-model` | `migrate-now` | `environmentCommand.legacyPlacement` 旧消息字段已迁到 `placement` |
| LCDR-027 | `neko-preview` | `migrate-now` | document preview context-only locator 旧 reader 已删除 |

## 决策

### 1. Prelaunch 阶段不默认保旧格式

没有上线服务和旧用户数据兼容窗口时，旧 schema、旧 message 字段、旧 re-export shim、旧 adapter path 默认不保护。保留必须证明当前功能仍依赖它。

### 2. Runtime 内部只认 canonical model

不允许在 runtime/domain 内部继续扩散：

```ts
value.newField ?? value.oldField ?? value.legacyField
```

如果当前输入来源还不统一，应在输入边界做一次 canonicalization，内部只传 canonical shape。

### 3. Fallback 只服务当前运行时韧性

允许的 fallback：

- provider 不可用或能力缺失；
- network / file / media / GPU / model 失败；
- 当前 bridge 仍是 provider 执行路径；
- 当前多来源输入需要边界归一化。

不允许的 fallback：

- 只为旧 unpublished schema 字段兜底；
- 在多个业务函数里重复读取旧字段；
- 用宽泛 `catch { fallback }` 吞掉结构错误。

### 4. 当前 bridge 必须 sunset

AI SDK bridge 名字里有 `legacy`，但 fal.ai / DashScope / Kling 仍在当前路径上使用它。因此它不是 dead code。它必须保留 provider 级 sunset 表，并通过 resolver / bridge tests 证明保留理由。

### 5. Dead code 先删低风险 shim

低风险标准：

1. `rg` 无 import / require / dynamic reference；
2. 文件只 re-export canonical module；
3. 删除后 package tests/build 通过；
4. guard 防止回流。

Agent Webview 三个 re-export shim 已按此标准删除。

## 清理路线

### Phase 0: 静态分析基线修正

已完成：

1. `knip.config.ts` 建模 `neko-tools` AssetDiff Vite entry。
2. `knip.config.ts` 建模 `neko-canvas` narrative preview media runtime entry。
3. Agent Extension package 声明 `@neko/ai-sdk`。
4. Agent AI SDK package 声明 `undici`、`@neko/shared`、`@neko-agent/types`。
5. document parser dynamic imports 继续作为精确 false positive 记录。

剩余：

- `pnpm check:unused` 仍因 157 个 unused exports 和 10 条 knip 配置提示失败；未引用文件和依赖漂移已清零。
- 剩余 unused exports 不是旧格式兼容分支，按后续 API / barrel export surface 收缩批次处理，不能用新增 re-export 或 fallback 代码掩盖。

### Phase 1: 立即删除项

已完成：

| 包 | 删除项 | 验证 |
|----|--------|------|
| `neko-agent/packages/webview` | `message-helpers.ts`、`media-extractors.ts`、`tool-constants.ts` | 无 import；Webview shim guard；targeted tests/build |
| `neko-agent/packages/extension` | `services/projectSearch/*` | `rg services/projectSearch packages/neko-agent` 无结果 |
| `neko-dashboard/packages/webview` | `ContextStrip.tsx`、`ProjectTable.tsx`、`QuickActions.tsx`、`RecentActivity.tsx`、`utils/logger.ts` | `pnpm check:unused` files 清零；LCDR-012 removed |
| `neko-canvas/packages/webview` | `InlineControls.tsx`、`components/content/index.ts`、`ImageViewer.tsx` | `pnpm check:unused` files 清零；LCDR-018 removed |
| `neko-puppet` | `extension/src/export/index.ts`、`extension/src/market/PuppetMotionInstallTarget.ts`、`webview/src/utils/inp-parser.ts` | 当前 `PuppetMotionInstallTarget` 类保留在 `PuppetMediaInstallTarget.ts`；LCDR-008 removed |
| `neko-sketch/packages/webview` | `engine/gradient-shaders.ts`、`utils/psd-import.ts` | `pnpm check:unused` files 清零；LCDR-019 removed |
| `neko-story/packages/webview` | `tailwind.config.js`、`src/utils/sceneBreakdown.ts` | `pnpm check:unused` files 清零；LCDR-020 removed |

已建模入口：

| 范围 | 入口 | 处理 |
|------|------|------|
| repo scripts | `check-3d-route-a-boundaries.mjs`、`scene-render-diagnostics.mjs` | 新增 root scripts；LCDR-021 active |
| Agent CLI | `build-neko.ts` | `knip.config.ts` 将 `packages/neko-agent/packages/cli-tui/build-neko.ts` 建模为 entry；实际由 `scripts/build-exe.sh` 执行 |

### Phase 1.5: Low-risk deprecated alias cleanup

已完成：

| 包 | 处理 | 原因 |
|----|------|------|
| `neko-types/src/utils/animation.ts` | 删除 | 无当前调用方；`neko-cut/webview` 已有包内 UI animation helper |
| `neko-types/src/types/animation.ts` | 移除误导性 `@deprecated` 头注 | 仍是 `@neko/shared` host-agnostic contract；不能反向依赖 `neko-cut/webview` |
| `neko-types/src/types/keyframe.ts` | 移除误导性 `@deprecated` 头注 | `neko-types/src/operations/*` 仍消费该契约 |
| `neko-types/src/types/mask.ts` | 移除误导性 `@deprecated` 头注 | `neko-types/src/operations/*` 仍消费该契约 |
| `neko-types/src/types/colorCorrection.ts` | 移除误导性 `@deprecated` 头注 | `colorCorrectionMapping.ts` 仍消费该契约 |
| `neko-types/src/types/ui-state.ts` | 移除误导性 `@deprecated` 头注 | 仍作为 shared editor operation state，而非 Webview 实现 |

设计判断：这些 `types/*` 文件不是纯 re-export shim。把 `neko-types` 调用方迁到 `neko-cut/webview` 会破坏 L0 shared package 不依赖 L2 Webview package 的方向。因此本批次只删除无调用工具副本，并把仍活跃的 shared contracts 从 deprecated 候选中移出。

### Phase 1.6: Shared schema/type old-format cleanup

已完成：

| surface | 处理 | 验证 |
|---------|------|------|
| Storyboard pre-schema `template + sections[]` reader | 删除 `normalizeLegacyStoryboardSections()`、`LegacyStoryboardMediaRef` / `LegacyStoryboardSection`、旧 media role normalization；`normalizeStoryboardTable()` 只接受 schema v1 / `scenes[]` root；测试改为拒绝 pre-schema section payload | `pnpm --dir packages/neko-types exec vitest run src/types/__tests__/storyboard-table.test.ts`；stale scan 无旧 symbol |
| Asset manifest legacy type migration | 删除 `LegacyAssetType`、`getLegacyAssetTypeMigration()`、旧 type mapping 表；manifest contract 保持 canonical `AssetType`；Market installed registry 读盘只接受 `version: 1` 且 `packageId` / type / manifest 均为 canonical 的记录，缺 version 旧 registry 不再迁移 | `pnpm --dir packages/neko-types exec vitest run src/types/asset/__tests__/manifest-contract.test.ts`；`pnpm --dir packages/neko-market/packages/core exec vitest run src/registry/installed-registry.test.ts` |
| Storage deprecated project aliases | 删除 `IProjectStorageLayout` 的平铺 `project.root` / `assetLibrary` / `cache` 等 alias；调用方迁到 `project.facts.*` 或 `project.local.cache.*`；一时本地目录迁移仍集中在 `migrateStorageLayout()` 边界 | `pnpm --dir packages/neko-types test`；stale scan 无 `.project.cache` / `.project.assetLibrary` 等旧 alias 调用 |
| Generated/proto legacy fields | 不手改生成物；确认 `neko-proto/timeline.proto` 仍生成 `packages/neko-types/src/generated/timeline.engine.ts` 的 legacy field 注释，保持 LCDR-009 `generated-source` active | 需单独 proto/source schema cleanup，执行生成和 diff validation |

仍保留到后续批次：

| surface | 原因 |
|---------|------|
| Canvas shared legacy mirrors | 与 Canvas Webview 连接、container、renderer 迁移强耦合，归入 Canvas 数据路径 cleanup；`CanvasPlaybackPlan.routeCandidates` 已收紧为必填并删除 legacy entry route 派生 |
| Workspace media path legacy document-relative fallback | 当前属于输入边界 canonicalizer，需与 Canvas/document resource path 迁移一起收口 |
| Storage one-time local migration | 仍是集中边界迁移，不再包含 deprecated API alias；删除条件是本地 layout 冻结并确认不再需要旧目录重命名 |

### Phase 2: Agent deprecated surface 迁移

`LCD-010` 不再等待“下一次 breaking change”，已按 prelaunch cleanup 完成：

| surface | 当前发现 | 处理 |
|---------|----------|------|
| `Message.toolCalls?` | 顶层 Webview projection 旧字段；不同于 LLM / session `ChatMessage.toolCalls` 当前模型 | 已删除；Webview presenter、MessageList、MessageItem、Agent message persistence、conversation save/resume 投影全部从 `contentBlocks` 派生 |
| `Message.thinking?` | 顶层 Webview projection 旧字段；thinking content block 是 canonical UI model | 已删除；streaming thinking 只写 `ContentBlock(type: 'thinking')` |
| `platform/src/types/prompt.ts` | 仅测试 import | 测试改从 `@neko/shared` 导入后删除 |
| `platform/src/types/task.ts` | 仅测试 import | 测试改从 `@neko/shared` 导入后删除；`platform/src/types/index.ts` 同步移除 re-export |
| `LegacyToolCall` alias | 当前无 repo 命中 | 已删除；`ChatMessage.toolCalls` 使用 `LLMToolCall[]` |
| `triggerKeywords()` / `ToolGroupMatch` | 无 current caller | 已从共享接口、实现和 mock 删除 |

保留说明：`platform/src/types/adapter.ts`、Agent session / executor / LLM adapter 中的 `toolCalls` 是当前 LLM/tool execution 模型，不属于 `Message.toolCalls?` legacy projection。

验证：

```bash
pnpm --dir packages/neko-agent/packages/webview exec vitest run \
  src/presenters/__tests__/message-presenter.test.ts \
  src/presenters/__tests__/work-item-message-presenter.test.ts \
  src/presenters/__tests__/message-list-presenter.test.ts \
  src/components/__tests__/types.test.ts

pnpm --dir packages/neko-agent exec vitest run \
  packages/agent/src/session/__tests__/conversation-manager.test.ts \
  packages/agent/src/session/__tests__/conversation-record-projector.test.ts \
  packages/agent/src/runtime/__tests__/message-runtime.test.ts \
  packages/agent/src/runtime/__tests__/message-resource-projector.test.ts
```

以上两组分别通过 49 / 68 个测试。

### Phase 2.5: Agent fallback / bridge 分类

当前 Agent 非测试源码中的 `fallback` / `legacy` 命中按语义分类处理：

| 类别 | 代表 surface | 处理 |
|------|--------------|------|
| `current-bridge` | `@neko/ai-sdk/src/bridge/*`、`media-task-executor.ts` 中的 AI SDK legacy bridge route | 保留；fal.ai / DashScope / Kling 仍由 resolver 测试证明进入 `createLegacyBridgeProvider()` |
| `runtime-resilience` | media routing provider fallback、model selector fallback、LLM summarizer fallback、permission approval fallback、task delivery fallback | 保留；这是当前 provider/network/model/task 能力缺失韧性 |
| `boundary-canonicalizer` | Webview config presenter fallback context window、composite media type fallback、plugin transfer fallback target | 保留在 UI/host 边界；不得扩散成 runtime 旧字段兼容 |
| `delete-now` / `migrate-now` | `Message.toolCalls?`、`Message.thinking?`、platform prompt/task re-export、ToolGroup deprecated match API、Agent legacy workflow recorder、artifact restore legacy index、read document legacy wording、capability registry legacy names、IDC runtime string guidance reader | 已删除或迁移；`LCD-010` / `LCD-014` 保留 removed entry 和 stale scan |
| 待拆分旧格式 | composite storyboard legacy projection | SkillInjection fallback 和 SubAgent `allowedTools` compatibility 已删除；剩余项需要单独 package-specific 数据迁移、当前能力判断或 ledger 更新 |
| 已删除非 Agent 旧边界 | document legacy resource cache provider、`legacy-cache-path` content ref、`legacyCachePath` metadata；Preview `document:data` base64 旧 reader；Preview context-only locator 旧 reader；Model `environmentCommand.legacyPlacement` 旧字段 | 已迁到 canonical document resource provider、required `payload.url`、required semantic `DocumentLocator`、`environmentCommand.placement`；`LCDR-024` / `LCDR-025` / `LCDR-026` / `LCDR-027` 保留 stale scan 防回流 |

### Phase 2.6: fallback 命名硬化结果

本轮没有用新兼容层兜底，而是把非 schema fallback 拆成三类处理：

| 类别 | 处理结果 |
|------|----------|
| Presentation default rename | `MentionMenu` i18n label `fallback` 改为 `defaultText`；`ScriptTableView` 角色展示 fallback 改为 `default*`；`config-message-presenter` `fallbackContextWindow` 改为 `defaultContextWindow`；`audioEffects` 默认参数 fallback 改为 `defaults/defaultValue` |
| Runtime resilience preserve | `EngineClient` / scene socket、Agent media routing / turn fallback、Live compositor `fallbackPolicy` / `local-fallback`、Puppet local canvas preview 保留；通过 targeted tests 和 ledger 记录保护 |
| Classification hardening | `knip.config.ts` Sharp WASM fallback、Live compositor fallback policy 从 `needs-review` 改判为 `runtime-resilience`；`LCDR-022` / `LCDR-023` 记录当前 Live/Puppet fallback surface |

追加复核（2026-06-13 后续批次）继续坚持“先定位调用链，再删除或保留”，本批次处理：

| surface | 处理 | 判断 |
|---------|------|------|
| Agent media progress `fallbackTask` naming | 改为 `recoveryTask` / `recoveryProgress` | 当前恢复投影，不是旧格式兼容 |
| `SkillRegistryPopulator` managed disk skill fallback | 改为 restore 命名 | 表达“恢复被磁盘 skill 覆盖前的 registry 项”，无兼容旧数据 |
| i18n `fallbackLocale`、preview flat fallback、storyboard fallback image resolver、tool/default helper 参数 | 改为 `default` / `placeholder` / `flatPreview` 等命名 | presentation/default value，不是 runtime 旧协议 |
| Autoheal L3 event `fallback` 字段 | 改为 `substitute` | channel 已是 `execution.autoheal.l3.substitute`，字段只在当前源码内 emit/read，无上线旧协议约束 |
| Canvas gallery reference projection | 删除 shared `reference-resolution.ts` 对旧 `data.cells` 的投影，改为 canonical `container.childPlacements` | 真实旧路径残留；由 `reference-resolution.test.ts` 和 node-card policy test 覆盖 |
| AI SDK `legacy` bridge、Agent `RetryHooks` model fallback、EngineClient / SceneControlSocket fallback readers | 保留 | 前者仍是 fal.ai / DashScope / Kling 当前 provider bridge；后两者是当前 runtime resilience 或公开 API，不用“直接替换 legacy/fallback”掩盖真实语义 |

当前 `pnpm check:legacy-debt:ledger` 已不再提示 Canvas `canvasLayered.ts` / `galleryMigration.ts` 盲区；`packages/neko-types/src/vscode/extension/creative-entity-composition.ts` 已并入 LCDR-011，按当前 creative entity 表现资源解析 fallback 管理，而非 dead code 删除项。

AI SDK bridge 验证：

```bash
pnpm --dir packages/neko-agent exec vitest run \
  packages/ai-sdk/src/resolve.test.ts \
  packages/ai-sdk/src/bridge/legacy-video-model.test.ts
```

该组通过 4 个测试；resolver 明确证明 fal.ai / DashScope / Kling 仍走 legacy bridge，OpenAI / newapi / oneapi / generic 走 native-compatible path。

### Phase 3: 跨包旧格式删除

没有上线兼容压力后，以下不再进入默认“不删除清单”，而是需要 package-specific cleanup：

| 包 | 类型 | 处理原则 |
|----|------|----------|
| `neko-types` | config legacy fields / provider object migrator | 已删除 `migrateLegacyFields()`、`UnifiedConfig.provider/model/apiKey/baseUrl` 和旧格式测试；`processConfig()` 只合并 canonical `defaultProvider/defaultModel/providers[]/models[]` |
| `neko-types` | storyboard / asset manifest / storage alias / Canvas contract / document resource cache | storyboard pre-schema reader、asset legacy type migration、storage deprecated aliases 已删除；Canvas connection/group/gallery 旧字段已迁到 canonical endpoint/container/child placement；Canvas `.legacy` presets 与 `creationMode: 'legacy'` 已删除；document legacy cache path/provider 已删除；workspace media / generated-source 仍按 ledger 追踪 |
| `neko-canvas` | legacy anchors / group childIds / gallery cells / renderer naming | `LegacyNodeRenderer` / `renderLegacy` / `FallbackNode` 展示命名已删除；`sourceAnchor` / `targetAnchor`、`GroupCanvasNode.data.childIds`、`GalleryCell` / `data.cells` / `galleryMigration` 旧路径已删除 |
| `neko-assets` / `neko-market` | legacy manifest / legacy package type / character asset fallback metadata | Market installed registry old-version / legacy package type migration 已删除，读盘只接受 canonical v1 record；`legacyFallbackRef` 已从 asset export contract 和 export service 删除，optional Live2D 关系通过 canonical `bindings[]` 表达 |
| `neko-proto` | legacy fields | 需单独 proto cleanup，跑 generated type diff |
| `neko-engine` | legacy CPU / encode-only path | 若是当前 runtime fallback，仍按 Engine ADR 保留；若只为旧格式，删除 |

Canvas inventory 结论：

| surface | 当前状态 | 下一步 |
|---------|----------|--------|
| `LegacyNodeRenderer` / `renderLegacy` / `FallbackNode` | 已改为 `DefaultNodeRenderer` / `renderDefaultNode` / `UnsupportedNode`；测试文案改为 default / unsupported | 保持 stale scan，禁止用 legacy/fallback 命名回流 |
| Scene/gallery table `fallback` 文案 prop、未知 block renderer helper、连接 label/nodeFactory/narrative 默认值 helper | 已改为 `placeholder` / `default` 命名 | 剩余 `fallback` 仅保留 React API、preview current bridge、timeout/input/CSS runtime 或平台语义 |
| connection anchors | `CanvasConnection.sourceAnchor` / `targetAnchor` 已删除；共享契约要求 `sourceEndpoint` / `targetEndpoint`，Webview 几何从 endpoint/port 解析 | 保持 stale scan，后续只允许端口 / 节点 endpoint |
| group child ids | `GroupCanvasNode.data.childIds` 已删除；`getContainerChildIds()` 只读 `container.childIds`；NKC migrator 不再从旧 data mirror 反推 parent/container | 保持 canonical container tests |
| gallery cells | `GalleryCell` / `data.cells` / `migrateGalleryV1ToContainer()` 已删除；`CanvasApp` 生成/编辑回写改到 media child node + `container.childPlacements.metadata` | 保持 gallery child media tests，禁止旧 cells path 回流 |
| Canvas `.legacy` presets | `annotation.legacy`、`text.legacy`、`storyboard.legacy`、`script.legacy`、`document.legacy`、`model.legacy`、`canvas-embed.legacy` 已删除；默认 preset 只从 canonical `.basic` / container presets 选择 | 保持 `nodeFactory` 和 agent capability schema tests，禁止 `creationMode: 'legacy'` 回流 |
| document legacy cache path | `LegacyResourceCacheProvider`、`legacy-cache-path` content ref、`legacyCachePath` metadata materialization/preview reads 已删除 | canonical path 为 `DocumentArchiveResourceRef -> createDocumentResourceRefFromArchiveRef -> DocumentResourceCacheProvider(entryReader/rangeReader) -> ResourceCache` |

## 不删除条件

以下内容只有满足条件才保留，不再无条件保护：

| 类型 | 保留条件 |
|------|----------|
| Proto / schema legacy field | 当前生成类型、runtime route 或 canonical fixture 仍依赖 |
| `.nk*` migrator | 当前测试数据或用户创建流程仍可能产生旧 shape |
| VSCode contributes / custom editor entry | manifest 或 command activation 真实引用 |
| Vite multi-entry | HTML / rollup input / extension webview provider 真实引用 |
| Provider bridge | 当前 provider resolver 仍会进入该路径 |
| Runtime fallback | 当前失败模式有测试或 smoke 依据 |

## 验证门禁

| 改动 | 验证 |
|------|------|
| Agent LCD / boundary cleanup | `pnpm check:agent-boundaries` |
| Repo-wide legacy/fallback/deprecated scan | `pnpm check:legacy-debt` |
| Non-Agent cleanup ledger | `pnpm check:legacy-debt:ledger` |
| Webview shim 删除 | `rg "message-helpers|media-extractors|tool-constants" packages/neko-agent/packages/webview/src`；targeted Webview tests/build |
| `knip.config.ts` / dependency cleanup | `pnpm check:unused` |
| Deprecated import migration | `rg` stale import scan + targeted package tests |
| Shared/proto/schema cleanup | contract tests + generated type diff where relevant |
| Engine runtime fallback cleanup | `cd packages/neko-engine && cargo test` |

仓库级清理完成后再跑：

```bash
pnpm check
pnpm test
pnpm build
```

### 本轮验证结果（2026-06-13）

| 命令 | 结果 |
|------|------|
| `pnpm --dir packages/neko-agent/packages/webview build` | 通过；仅 Vite chunk size / Browserslist 提示 |
| `pnpm --dir packages/neko-agent/packages/webview exec vitest run src/presenters/__tests__/message-presenter.test.ts src/presenters/__tests__/work-item-message-presenter.test.ts src/presenters/__tests__/message-list-presenter.test.ts src/components/__tests__/types.test.ts` | 通过，49 tests |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/session/__tests__/conversation-manager.test.ts packages/agent/src/session/__tests__/conversation-record-projector.test.ts packages/agent/src/runtime/__tests__/message-runtime.test.ts packages/agent/src/runtime/__tests__/message-resource-projector.test.ts` | 通过，68 tests |
| `pnpm --dir packages/neko-agent exec vitest run packages/platform/src/service/__tests__/prompt-manager.test.ts packages/platform/src/media/__tests__/media-generation-service.test.ts packages/agent/src/skill/__tests__/tool-group-registry-tier.test.ts packages/agent/src/tools/core/__tests__/meta-tools.test.ts packages/agent/src/session/__tests__/conversation-manager.test.ts packages/agent/src/session/__tests__/conversation-record-projector.test.ts packages/agent/src/runtime/__tests__/message-runtime.test.ts packages/agent/src/runtime/__tests__/message-resource-projector.test.ts packages/ai-sdk/src/resolve.test.ts packages/ai-sdk/src/bridge/legacy-video-model.test.ts` | 通过，95 tests |
| `node scripts/check-neko-agent-boundaries.mjs --self-test` | 通过，16 cases |
| `pnpm check:agent-boundaries` | 通过，1216 files checked |
| `node scripts/check-legacy-debt-surfaces.mjs --self-test` | 通过，5 cases |
| `pnpm check:legacy-debt -- --json` | 通过；all TS/TSX 1339 occurrence（legacy 346 / fallback 929 / deprecated 64），非测试源码 875 occurrence（legacy 140 / fallback 677 / deprecated 58） |
| `pnpm check:legacy-debt:ledger` | 通过；27 个非 Agent ledger entries checked；剩余 warnings 为 4 个历史 required coverage pattern 当前无命中 |
| `rg "utils/animation\\|Canonical source moved to neko-cut/webview\\|@deprecated Canonical source moved" packages/neko-types packages/neko-cut -n` | 无 `neko-types` 旧 alias 命中；剩余为 `neko-cut/webview` 包内当前 helper imports |
| `pnpm --dir packages/neko-types exec vitest run src/operations/__tests__/apply-keyframe.test.ts src/__tests__/config.test.ts` | 通过，34 tests |
| `rg "migrateLegacyFields\|LegacyProviderConfig\|isLegacyProvidersFormat\|convertLegacyProviders\|Legacy Fields\|@deprecated Use defaultProvider\|@deprecated Use defaultModel\|providers object\|old format\|backward compatibility" packages/neko-types/src/config packages/neko-types/src/__tests__/config.test.ts -n` | 无命中；`neko-types` config 旧格式 reader / fixtures 已删除 |
| `rg "\b(provider\|model\|apiKey\|baseUrl)\?: string" packages/neko-types/src/config/types.ts packages/neko-types/src/config/config-normalizer.ts packages/neko-types/src/__tests__/config.test.ts -n` | 无命中；`UnifiedConfig` 不再暴露旧字段 |
| `pnpm --dir packages/neko-types exec vitest run src/__tests__/config.test.ts` | 通过，25 tests |
| `pnpm --dir packages/neko-types test -- --run src/__tests__/config.test.ts` | 通过，117 files / 1055 tests |
| `pnpm --dir packages/neko-types exec vitest run src/types/__tests__/storyboard-table.test.ts` | 通过，28 tests；pre-schema `template + sections[]` 被拒绝 |
| `pnpm --dir packages/neko-types exec vitest run src/types/asset/__tests__/manifest-contract.test.ts` | 通过，21 tests；旧 AssetType 不再有 migration helper |
| `pnpm --dir packages/neko-market/packages/core exec vitest run src/registry/installed-registry.test.ts` | 通过，17 tests；缺 version 旧 registry 不再迁移，v1 非 canonical package/type 记录被跳过 |
| `pnpm --dir packages/neko-types test` | 通过，117 files / 1055 tests |
| `pnpm --dir packages/neko-assets exec vitest run src/services/CharacterAssetExportService.test.ts` | 通过，8 tests；`legacyFallbackRef` 不再输出，optional Live2D binding 仍保留 |
| `pnpm --dir packages/neko-types exec vitest run src/types/__tests__/asset-export-contract.test.ts src/types/asset/__tests__/manifest-contract.test.ts` | 通过，25 tests；`.nkentity` nativePuppet metadata contract 不再接受 legacy fallback ref 字段 |
| `rg -i "legacyFallbackRef\|legacy_fallback_ref\|fallbackRef" packages/neko-assets packages/neko-types/src/types/asset-export.ts packages/neko-types/src/types/asset/entity.ts` | 无命中 |
| `pnpm --dir packages/neko-canvas/packages/webview exec vitest run src/components/content/NodeContentDispatcher.test.ts src/components/nodes/nodeRendererRegistry.test.ts src/utils/nodeFactory.test.ts src/subsystems/narrative.test.ts` | 通过，59 tests；Canvas presentation default / unsupported renderer rename 保持行为 |
| `pnpm --dir packages/neko-types exec vitest run src/vscode/extension/__tests__/document-resource-cache-provider.test.ts src/vscode/extension/__tests__/resource-cache-service.test.ts src/types/__tests__/content-access.test.ts src/types/__tests__/project-cache-search.test.ts` | 通过，53 tests；document legacy cache provider / `legacy-cache-path` 删除后 canonical resource cache path 正常 |
| `pnpm --dir packages/neko-canvas/packages/webview exec vitest run src/utils/nodeFactory.test.ts src/utils/importedGeneratedAsset.test.ts` | 通过，28 tests；Canvas `.legacy` presets 和 `legacyCachePath` fixture 已移除 |
| `pnpm --dir packages/neko-canvas/packages/extension exec vitest run src/__tests__/protocol.test.ts src/editor/narrativePreviewBridge.test.ts` | 通过，90 tests；Extension 不再注册 `LegacyResourceCacheProvider`，preview 不再读取 `legacyCachePath` |
| `pnpm --dir packages/neko-agent exec vitest run packages/extension/src/services/__tests__/documentResourceCacheProvider.test.ts packages/extension/src/tools/__tests__/readDocumentImageTool.test.ts packages/extension/src/tools/__tests__/readDocumentTool.test.ts packages/extension/src/tools/__tests__/semanticCoverageTool.test.ts` | 通过，37 tests；Agent document tools 不再输出 legacy cache metadata |
| `pnpm --dir packages/neko-agent exec vitest run packages/platform/src/document/__tests__/document-reader.test.ts` | 通过，25 tests；document reader 删除 pdf-parse function/default 旧 parser 与 officeparser `parseOfficeAsync` reader，保留当前 `PDFParse` / `parseOffice` API |
| `pnpm --dir packages/neko-agent exec vitest run packages/ai-sdk/src/bridge/legacy-video-model.test.ts packages/ai-sdk/src/resolve.test.ts` | 通过，4 tests；AI SDK legacy bridge 仍为 fal.ai / DashScope / Kling 当前路径，不做直接改名 |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/skill/__tests__/skill-injection-coordinator.test.ts packages/agent/src/prompt/__tests__/skill-injection-module.test.ts packages/agent/src/__tests__/executor-integration.test.ts` | 通过，44 tests；SkillInjection Track A 删除 direct writer fallback 后统一走 required `SkillInjectionModule` |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/hook-loader/__tests__/hook-file-runtime.test.ts packages/agent/src/hook-loader/__tests__/hook-file-projector.test.ts packages/agent/src/__tests__/standalone.test.ts packages/agent/src/runtime/__tests__/runtime-host-bindings.test.ts` | 通过，38 tests；未接入 `.hook` directory runtime / Extension `HookManager` 删除，当前 settings hooks 与 `.neko/hooks/*.md` catalog 仍保留 |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/task/__tests__/idc-projected-task.test.ts packages/agent/src/task/__tests__/task-manager.test.ts packages/agent/src/task/__tests__/task-manager-persistence.test.ts packages/agent/src/task/__tests__/idc-task-projection.test.ts` | 通过，64 tests；IDC projected task payload 只接受 canonical `name`，旧 `content` mirror 被拒绝 |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/subagent/__tests__/subagent-manager.test.ts packages/agent/src/subagent/__tests__/creative-presets.test.ts` | 通过，42 tests；SubAgent tool access 从 `allowedTools` 旧入口收敛到 explicit `AgentToolPolicy` |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/prompt/__tests__/module-orchestrator.test.ts packages/agent/src/skill/__tests__/stage-planner.test.ts` | 通过，35 tests；Agent prompt/stage 迁移期 legacy/deprecated 文案和 fixture 命名清理后行为保持 |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/task/__tests__/task-manager.test.ts packages/agent/src/task/__tests__/task-manager-persistence.test.ts packages/agent/src/task/__tests__/idc-projected-task.test.ts packages/agent/src/task/__tests__/idc-task-projection.test.ts` | 通过，64 tests；IDC projected task cleanup 不再靠损坏 payload 或缺 `runStartedAt` 的旧 payload fallback 匹配 |
| `pnpm --dir packages/neko-types test -- --run src/nkc/__tests__/validator.test.ts src/nkc/__tests__/codec.test.ts src/nkc/__tests__/migrator.test.ts src/nkc/__tests__/layered-canvas.test.ts src/utils/__tests__/storyboardPlanner.test.ts src/types/__tests__/canvas-narrative-validation.test.ts src/types/__tests__/canvas-flow-traversal.test.ts src/types/__tests__/canvas-narrative-agent.test.ts src/types/__tests__/canvas-playback.test.ts` | 通过，117 files / 1055 tests；Canvas shared contract 只接受 canonical endpoint/container；`CanvasPlaybackPlan.routeCandidates` 为必填 |
| `pnpm --dir packages/neko-types exec vitest run src/types/__tests__/canvas-playback.test.ts` | 通过，17 tests；legacy `entryUnitIds` route fallback 已删除 |
| `pnpm --dir packages/neko-canvas/packages/webview exec vitest run src/components/playback/CanvasPlaybackController.test.tsx` | 通过，7 tests；Webview playback 手写 plan 使用 required routeCandidates |
| `pnpm --dir packages/neko-canvas exec vitest run packages/extension/src/editor/narrativePreviewBridge.test.ts` | 通过，31 tests；Preview bridge 不再派生 legacy entry route |
| `pnpm --dir packages/neko-canvas/packages/webview exec vitest run src/utils/connectionProjection.test.ts src/stores/__tests__/canvasStore.test.ts src/stores/__tests__/clipboardStore.test.ts src/utils/canvasAgentOperations.test.ts src/utils/containerActions.test.ts src/utils/nodeFactory.test.ts src/components/content/NodeContentDispatcher.test.ts src/components/playback/CanvasPlaybackController.test.tsx src/utils/renderRefreshTiering.test.ts` | 通过，139 tests；Webview store/geometry/clipboard/agent operations 已迁到 endpoint/container/childPlacement |
| `pnpm --dir packages/neko-canvas exec vitest run packages/extension/src/editor/narrativePreviewBridge.test.ts` | 通过，31 tests；Canvas extension preview fixture 已迁到 canonical connection endpoint |
| `pnpm --dir packages/neko-agent/packages/webview exec vitest run src/components/ChatView/InputArea/MentionMenu.test.tsx src/presenters/__tests__/config-message-presenter.test.ts` | 通过，18 tests；Agent Webview presentation fallback 命名改为 default |
| `pnpm --dir packages/neko-story/packages/webview exec vitest run src/__tests__/scriptTableView.test.tsx` | 通过，12 tests；ScriptTableView presentation fallback 命名已清零 |
| `pnpm --dir packages/neko-audio/packages/webview exec vitest run src/types/__tests__/audioEffects.test.ts` | 通过，34 tests；audio effect 默认参数 fallback 命名改为 defaults/defaultValue |
| `pnpm --dir packages/neko-puppet/packages/webview exec vitest run src/layout/puppetResizeLayout.test.ts` | 通过，5 tests；Puppet local fallback preview 保持为当前非权威预览 surface |
| `pnpm --dir packages/neko-live/packages/webview exec vitest run src/rendererMigration.test.ts src/viewport/LiveController.test.ts` | 通过，12 tests；Live local fallback/compositor path 仍被隔离 |
| `pnpm --dir packages/neko-live exec vitest run packages/extension/src/LiveSessionService.test.ts` | 通过，4 tests；Live recording local fallback diagnostics 保留 |
| `pnpm --dir packages/neko-agent exec vitest run packages/platform/src/media/__tests__/media-generation-service.test.ts packages/platform/src/media/routing/__tests__/media-routing-manager.test.ts packages/agent/src/runtime/__tests__/agent-turn-runtime.test.ts` | 通过，24 tests；Agent provider/model/media fallback 为当前 runtime resilience |
| `pnpm --dir packages/neko-client test -- --run` | 通过，16 files / 164 tests；engine/socket fallback 为当前 runtime resilience |
| `pnpm --dir packages/neko-agent exec vitest run packages/agent/src/autoheal/__tests__/autoheal-chain.test.ts packages/agent/src/autoheal/__tests__/example-handlers.test.ts packages/agent/src/narrator/__tests__/milestone-tracker.test.ts packages/agent/src/hooks/__tests__/executor-hooks-factory.test.ts packages/platform/src/media/__tests__/media-generation-service.test.ts packages/extension/src/services/storyboardDeliveryService.test.ts packages/extension/src/tools/__tests__/readDocumentTool.test.ts packages/extension/src/tools/__tests__/readDocumentImageTool.test.ts packages/extension/src/tools/__tests__/readImageTool.test.ts` | 通过，8 files / 79 tests；Autoheal L3 改为 substitute 字段，Agent fallback/default helper 命名收敛 |
| `pnpm --dir packages/neko-types exec vitest run src/types/__tests__/storyboard-table.test.ts src/nka/__tests__/codec.test.ts src/types/__tests__/reference-resolution.test.ts` | 通过，3 files / 64 tests；storyboard placeholder resolver、NKA default helper、Canvas gallery `container.childPlacements` reference projection 正常 |
| `pnpm --dir packages/neko-canvas/packages/webview exec vitest run src/components/content/node-card/nodeCardPolicy.test.ts src/preview/PreviewRendererRegistry.test.tsx src/components/content/NodeContentDispatcher.test.ts` | 通过，2 files / 42 tests；node-card default policy rename 与 gallery reference badge 走 canonical container placement |
| `pnpm --dir packages/neko-preview/packages/webview build` | 通过；panorama flat preview 命名收敛，保留 WebGL 不可用时的当前 runtime preview |
| `pnpm --dir packages/neko-canvas/packages/webview build` | 通过；仅 Browserslist 过期和 Vite chunk size 提示 |
| `rg -n "LegacyNodeRenderer\|renderLegacy\|Legacy path\|legacy-node\|FallbackNode\|FallbackNodeProps\|fallback card\|fallback cards\|renderFallbackBlock\|fallback=\|fallback: string\|fallbackExt\|fallbackLabel" packages/neko-canvas/packages/webview/src` | 仅剩 React `Suspense fallback` API 命中；presentation legacy/fallback naming 已清理 |
| `rg -n "sourceAnchor\|targetAnchor\|GalleryCell\|data\\.cells\|galleryMigration\|migrateGalleryV1ToContainer\|legacy anchor\|Legacy cells path\|getLegacyAnchorPoint\|legacy-group-childIds\|getLegacyContainerChildIds" packages/neko-canvas/packages/webview/src packages/neko-types/src/types/canvas.ts packages/neko-types/src/utils/canvasLayered.ts packages/neko-types/src/nkc/migrator.ts` | 无命中；Canvas anchor/cells/group mirror 旧路径已删除 |
| `rg -n "legacyCachePath\|legacy-cache-path\|LegacyResourceCacheProvider\|legacy-resource-cache-provider\|readLegacyCachePath\|LEGACY_RESOURCE_CACHE_PROVIDER_ID\|ContentLegacyCachePathRef\|isLegacyCachePathContentRef\|creationMode: 'legacy'\|creationMode === 'legacy'\|CanvasPresetCreationMode\|annotation\\.legacy\|text\\.legacy\|storyboard\\.legacy\|script\\.legacy\|document\\.legacy\|model\\.legacy\|canvas-embed\\.legacy" packages/neko-types packages/neko-canvas packages/neko-agent -g "*.ts" -g "*.tsx" --glob '!**/__tests__/**' --glob '!**/*.test.ts' --glob '!**/*.test.tsx'` | 无命中；document legacy cache path 和 Canvas `.legacy` preset 生产代码已清零 |
| `pnpm --dir packages/neko-model/packages/webview build` | 通过；`environmentCommand` 使用 canonical `placement` 字段，保留 Webview store 同步 |
| `pnpm --dir packages/neko-model/packages/extension build` | 通过；Extension producer 不再发送 `legacyPlacement` |
| `pnpm --dir packages/neko-preview/packages/webview build` | 通过；DOCX/CBZ/EPUB/PDF viewers 只接受 `payload.url` |
| `pnpm --dir packages/neko-preview compile:extension` | 通过；Extension 端 document provider 不再用 context-only payload 反推 locator |
| `pnpm --dir packages/neko-preview exec vitest run packages/extension/src/__tests__/documentProtocol.test.ts` | 通过，19 tests；document protocol 仍正常 |
| `rg -n "memory/context\|Context Management - Legacy module\|legacyPlacement\|loadDocx\\(\|loadCbz\\(\|loadEpub\\(\|loadPdf\\(\|payload\\.data\|Base64-encoded file content\|Legacy: load DOCX\|Load CBZ from base64\|load EPUB from base64" packages/neko-agent packages/neko-model packages/neko-preview -g "*.ts" -g "*.tsx"` | 无目标旧 surface 命中；Agent 空 legacy stub、Model 旧消息字段、Preview base64 document reader 已清零 |
| `rg -n "getGlobalConfigDir\|getGlobalConfigPath\|getProjectConfigPath" packages/neko-agent/packages/cli-tui packages/neko-agent/packages/agent -g "*.ts" -g "*.tsx"` | 无命中；CLI global/project config path legacy alias 已删除 |
| `rg -n "buildLegacyLocator\|locator\\?: DocumentLocator\|payload\\.locator\\?" packages/neko-preview/packages/extension/src/providers/document/documentProviderHelper.ts packages/neko-preview/packages/extension/src/types/document-messages.ts packages/neko-preview/packages/webview/src/shared/document-types.ts` | 无命中；Preview Webview→Extension 文档上下文 contract 要求 semantic locator |
| `rg -n "legacyParser\|parseOfficeAsync\|numpages" packages/neko-agent/packages/platform/src/document packages/neko-agent/packages/platform/src/document/__tests__` | 无生产/测试旧 parser 命中；剩余命中仅在 Agent LCD 文档 stale scan |
| `rg -i "normalizeLegacyStoryboardSections\|LegacyStoryboardMediaRef\|LegacyStoryboardSection\|MAX_LEGACY\|normalizeLegacyMediaRef\|normalizeLegacyMediaRole\|ambiguous-legacy-media-ref\|fallbackTitle" packages/neko-types/src/types/storyboard-table.ts packages/neko-types/src/types/__tests__/storyboard-table.test.ts` | 无命中 |
| `rg -i "LegacyAssetType\|LegacyMetadataPatch\|LegacyAssetTypeMigration\|LEGACY_TYPE_MIGRATIONS\|getLegacyAssetTypeMigration\|isLegacyAssetType\|mediaPatch\|modelPatch\|migrates legacy installed AssetType" packages/neko-types/src/types/asset packages/neko-market/packages/core/src/registry` | 无命中 |
| `rg -n "\\.project\\.(root\|assetLibrary\|memory\|settings\|settingsLocal\|config\|providerCards\|cache)\\b" packages scripts docs -g "*.ts" -g "*.tsx" -g "*.mjs" -g "*.md"` | 无命中；调用方已迁到 `project.facts` / `project.local.cache` |
| `pnpm --dir packages/neko-types exec tsc --noEmit --pretty false` | 失败于既有跨包 moduleResolution / JSX / monorepo baseline；不作为本批次有效门禁 |
| `pnpm check:unused --reporter json` | 仍失败于 unused exports；未引用文件 0、依赖问题 0、unused exports 157 / 60 files；没有新增 Canvas geometry helper export 噪音 |
| `pnpm check` | 失败于 `pnpm check:unused` 当前基线；未进入 `check:deps`，不表示 legacy debt scanner 或 Canvas build 失败 |

## 更新规则

每次新增或保留 legacy / fallback / deprecated surface 时，必须同步：

1. 语义分类：`delete-now` / `migrate-now` / `current-bridge` / `runtime-resilience` 等。
2. owner、replacement、removeAfter。
3. 保护测试或删除验证。
4. 如果是 Agent surface，更新 `docs/architecture/agent-code-debt-lcd-register.json` 并通过 `pnpm check:agent-boundaries`。

## 结论

仓库确实有大量 `legacy`、`fallback`、`deprecated` 命中，但这些命中不是同一种问题。新的 prelaunch 策略是：

**旧格式和旧协议默认删除或迁移；当前 bridge 和 runtime resilience 可以保留，但必须被分类、测试和 sunset；raw search count 只作为 triage，不作为保留或删除理由。**

本 ADR 的后续工作应继续优先清掉剩余 `migrate-now`、`needs-review` 和 unused export / barrel API 面，再处理 proto/generated、resource/entity canonicalizer 与其他 package-specific current-bridge sunset。`delete-now` 词面和 knip unused files 当前已清零。

## 变更日志

### 2026-06-13 prelaunch cleanup reset

1. 明确“当前未上线，不默认保旧格式 / 旧协议”。
2. 用 VSCode 同口径记录 `legacy` 1057、`fallback` 1467、`deprecated` 110 occurrence。
3. 用非测试源码口径记录 `legacy` 636、`fallback` 1145、`deprecated` 100 occurrence。
4. 将 LCD register 增加 `semanticClass`，并由 `pnpm check:agent-boundaries` 校验。
5. 将 `LCD-010` 从“未来 breaking change”改为 prelaunch `migrate-now`。
6. 删除 Agent Webview 三个 re-export shim，并增加防回流 guard。
7. 修正 `knip` Vite/runtime entry 误报与 Agent 依赖漂移；`pnpm check:unused` 当前仍有 18 个未引用文件和若干跨包依赖漂移。
8. 删除 `Message.toolCalls?` / `Message.thinking?` 顶层 legacy projection；Agent/Webview 改用 `contentBlocks`。
9. 删除 Agent platform prompt/task deprecated re-export modules、`LegacyToolCall` alias、ToolGroup `triggerKeywords()` / `ToolGroupMatch` compatibility API。
10. 将 Agent fallback 命中分类为 current bridge、runtime resilience、boundary canonicalizer、已删除 migrate-now 和 Phase 3 package-specific 旧格式候选。
11. 删除 `neko-types` config 旧格式迁移面：`migrateLegacyFields()`、旧 `UnifiedConfig.provider/model/apiKey/baseUrl` 字段、providers object 转数组 reader 和对应旧格式测试；canonical config 测试已改为 `defaultProvider/defaultModel/providers[]/models[]`。

### 2026-06-13 stage-two cleanup baseline

1. 明确 `cleanup-prelaunch-legacy-surfaces` 只是第一阶段，不代表仓库级 legacy / fallback / deprecated / dead-code 清理完成。
2. 新增 `scripts/check-legacy-debt-surfaces.mjs`，统一 all-source / non-test-source 扫描口径、热点、示例、semanticClass 和 ledger validation。
3. 新增根脚本 `pnpm check:legacy-debt` 与 `pnpm check:legacy-debt:ledger`。
4. 新增 `docs/architecture/code-debt-surface-ledger.json`，作为非 Agent cleanup ledger，首批登记 17 个高优先级非 Agent surfaces。
5. 当前第二阶段基线：all TS/TSX 1662 occurrence，其中 `legacy` 431、`fallback` 1151、`deprecated` 80；非测试源码 1147 occurrence，其中 `legacy` 201、`fallback` 876、`deprecated` 70。
6. 当前非测试源码语义分类：`migrate-now` 112、`runtime-resilience` 357、`presentation-default` 205、`needs-review` 210、`current-bridge` 158、`boundary-canonicalizer` 65、`domain-status` 33、`generated-source` 7、`delete-now` 0。
7. 静态分析第二批处理：删除 15 个确认 unused files；将 2 个 repo scripts 和 Agent CLI `build-neko.ts` 建模为 entry；清理 `neko-market`、`neko-tools`、`neko-ui` 依赖漂移并补 `jsdom` 测试依赖。
8. `pnpm check:unused` 基线降为未引用文件 0、依赖问题 0，剩余 157 个 unused exports 和 10 条配置提示作为后续 API/export surface 与 knip 配置批次处理。
9. 低风险 deprecated alias cleanup：删除 `neko-types/src/utils/animation.ts` 无调用旧副本；移除 `neko-types` 仍活跃 shared contracts 上误导性的 `@deprecated canonical moved to neko-cut/webview` 标记，避免 L0 反向依赖 L2。
10. Shared schema/type old-format cleanup：删除 storyboard pre-schema sections reader、asset manifest legacy type migration helper、storage layout deprecated aliases；Market installed registry 改为 canonical-only v1 读盘；generated/proto legacy fields 按 `generated-source` 延期到源 IDL/schema 批次。
11. Canvas legacy data path cleanup：删除 `LegacyNodeRenderer` / `renderLegacy` / `FallbackNode` 误导性命名；共享契约和 Webview 已迁到 `CanvasConnection.sourceEndpoint/targetEndpoint`、`container.childIds`、gallery child media node + `container.childPlacements.metadata`，并删除 `sourceAnchor` / `targetAnchor`、`GroupCanvasNode.data.childIds`、`GalleryCell` / `data.cells` / `galleryMigration` 旧路径；进一步删除 `.legacy` built-in presets 和 `creationMode: 'legacy'` 选择逻辑；`CanvasPlaybackPlan.routeCandidates` 改为 required，删除 legacy `entryUnitIds` route fallback。
12. Asset/Market manifest cleanup 尾项：删除 character asset export 的 `legacyFallbackRef` / `legacy_fallback_ref` / `fallbackRef` surface；`.nkentity` 可选 Live2D 资源不再复制到 nativePuppet metadata，而是由 canonical `bindings[]` 中 `role: 'live2d'` 且 `optional: true` 的 binding 表达。
13. Runtime resilience / presentation default hardening：清理 Agent MentionMenu、ScriptTableView、config-message presenter、audioEffects 的 presentation fallback 命名；保留并登记 Live compositor、Puppet local preview、Agent media turn、Neko client engine/socket 的当前 fallback 韧性路径。
14. 删除 document legacy resource cache provider、`legacy-cache-path` content ref、`legacyCachePath` metadata materialization 和 preview reads；canonical 路径统一为 DocumentArchiveResourceRef / DocumentResourceCacheProvider / ResourceCache。
15. 撤销“直接把 legacy bridge 改名”的错误方向：AI SDK legacy bridge 经调用链验证仍是当前 provider bridge，继续以 `LCD-009 current-bridge` 保留，后续按 provider native AI SDK 支持逐个 sunset。
16. 继续删除已证实无当前生产者的旧消息/reader：Agent `memory/context.ts` 空 legacy stub 删除；Agent CLI `getGlobalConfig*` / `getProjectConfigPath` 兼容 alias 删除；Agent document reader 删除 pdf-parse function/default 旧 parser 与 officeparser `parseOfficeAsync` reader；Model `environmentCommand.legacyPlacement` 迁到 canonical `placement` 字段；Preview DOCX/CBZ/EPUB/PDF `document:data` base64 旧 reader删除，协议收窄为 required `payload.url`；Preview `document:sendToAi` 不再从旧 `context` 反推 locator，改为 required semantic `DocumentLocator`。
17. Agent 追加清理：`SkillInjectionCoordinator` Track A 删除 optional module + direct `composer.setSection` fallback，统一 required `SkillInjectionModule`；未接入 `.hook/<name>/HOOK.ts|js` directory runtime、Extension `HookManager`、`hookSource` bridge 已删除，当前 hook 功能保留 `.neko/settings.json` SettingsHookLoader 与 `.neko/hooks/*.md` catalog。
18. Agent 继续收敛 canonical contract：删除 `IdcProjectedTaskPayload.content` 旧持久化 mirror，payload guard 只接受 canonical `name`；删除 SubAgent `allowedTools` 旧配置入口和空数组 allow-all 语义，基础/创意 presets 与配置覆盖统一为 explicit `AgentToolPolicy`。
19. Agent 小批量清理：删除 prompt/stage 迁移期 `legacy/deprecated` 文案和 `legacy:foo` fixture 命名；删除无仓库调用方的 `platform/src/types/tool.ts` deprecated re-export；收窄 IDC projected task run cleanup，带 `runStartedAt` 的清理不再通过损坏 payload 或缺 startedAt payload 兜底匹配。
20. 后续复核批次将 raw count 推进到 all TS/TSX 1339 occurrence（legacy 346 / fallback 929 / deprecated 64），非测试源码 875 occurrence（legacy 140 / fallback 677 / deprecated 58）；`delete-now` 仍为 0，`needs-review` 降至 137。
21. 明确反对“直接替换 legacy/fallback 名称”：AI SDK legacy bridge、Agent RetryHooks model fallback、EngineClient / SceneControlSocket fallback readers 因当前调用链或公开 API 保留；只对已验证为默认值、placeholder、restore、substitute 的局部命名做收敛。
22. 删除真实旧路径残留：`reference-resolution.ts` 的 gallery reference projection 不再读取旧 `data.cells`，改为 canonical `container.childPlacements`，并把 LCDR-005 stale scan 扩展到 shared reference projector。

### 2026-06-13 agent-boundary cleanup 实施

1. 新增 `docs/architecture/agent-code-debt-lcd-register.json`。
2. 删除 Agent `projectSearch` shim；LCD-001 为 removed。
3. Webview durable entity memory contribution inference 迁到 `@neko/agent/artifact`；LCD-011 为 removed。
4. LCD-009 保留 AI SDK bridge，并新增 provider 级 sunset metadata。
5. Capability registry 和 `toolBootstrap.ts` 增加 duplicate / legacy path guardrail。
6. 删除 Agent legacy workflow recorder、artifact restore legacy index fallback、document read legacy wording、capability registry legacy names、IDC runtime string guidance reader；LCD-014 为 removed。
