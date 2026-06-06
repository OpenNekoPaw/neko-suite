# ADR: Dead Code, Deprecated Code, and Redundancy Cleanup Strategy

## 状态

Proposed (2026-06-01, updated 2026-06-06)

## 范围

本文记录 `packages/` 下死代码、deprecated / legacy 代码和冗余代码的审计结果与清理策略。

本 ADR 不直接决定删除具体功能代码；它定义清理口径、分级规则、验证门禁和后续拆分顺序。具体删除或迁移应按包提交小 PR，并补对应测试。

## 背景

Neko Suite 已进入多包并行演进阶段。当前仓库同时存在：

1. 新架构入口与 legacy compatibility surface 并存。
2. 部分功能已迁移到共享包或独立 provider，但旧 shim 仍保留。
3. 多个 Webview / Extension 包重复实现 logger、error handler、HTML / nonce、local runtime helpers。
4. `knip` 已作为 unused code / dependency drift 检查工具接入，但仍有 Vite multi-entry、runtime-loaded module、barrel export 等静态分析假阳性。

清理目标不是简单减少行数，而是降低维护分叉、避免重复注册、减少错误 auto-import 路径，并让清理动作可验证、可回滚。

## 审计口径

审计时间：2026-06-06（第二次审计，首次 2026-06-01）。

使用命令：

```bash
pnpm exec knip --reporter json
rg -n "@deprecated|deprecated|deprecation|legacy|obsolete" packages \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/target/**' \
  --glob '!**/*.test.ts' \
  --glob '!**/*.test.tsx' \
  --glob '!**/__tests__/**' \
  --glob '!**/*.spec.ts'
rg -n "TODO\\(P[0-2]\\)|FIXME|HACK" packages \
  --glob '!**/node_modules/**' \
  --glob '!**/dist/**' \
  --glob '!**/target/**'
```

`knip` 只作为静态线索。以下情况必须人工复核：

| 类型 | 原因 | 处理 |
|------|------|------|
| Vite 多入口 | HTML entry 可能不被 workspace entry 自动识别 | 在 `knip.config.ts` 补 entry |
| VSCode manifest / command contribution | command、view、custom editor 可能由 manifest 激活 | 查 `package.json` contributes 和 Extension 代码 |
| runtime `import()` / dynamic require | 静态图不一定可见 | 查运行时 loader 与 tests |
| package public exports | 类型契约或外部 API surface 可能未被本仓库引用 | 查 package `exports`、README、架构文档 |
| migration / compatibility shim | 未被新代码引用不代表可删 | 必须确认迁移窗口和旧数据兼容要求 |

## 当前事实

### 死代码与依赖漂移

`knip` 当前报告（2026-06-06）：

| 指标 | 数量 | 与 06-01 对比 |
|------|------|---------------|
| 未引用文件 | 26 个 | -1 |
| 未引用文件行数 | 2,073 行 | +2 |
| 未使用依赖 | 6 个 | -1（`adm-zip` 已清理） |
| 未使用 devDependencies | 3 个 | 持平 |
| 未声明依赖 | 11 个 | +1（`neko-dashboard` 新增 `jsdom`） |
| 未使用导出 | 158 个 | +1 |

未引用文件按包聚合：

| 包 | 文件数 | 行数 | 说明 |
|----|--------|------|------|
| `neko-tools` | 6 | 766 | 主要是 `assetDiff` Webview；这是 Vite entry 假阳性，不应直接删除 |
| `neko-canvas` | 3 | 454 | `InlineControls`、`content/index`、`ImageViewer` 需要逐项确认 |
| `neko-dashboard` | 5 | 271 | Dashboard UI 组件候选清理（`ContextStrip`、`ProjectTable`、`QuickActions`、`RecentActivity`、`logger`）；当前 Skill Catalog 功能开发中，可能变动 |
| `scripts` | 2 | 256 | 脚本入口需确认是否被人工使用 |
| `neko-sketch` | 2 | 156 | shader / PSD import helper 候选清理 |
| `neko-agent` | 4 | 87 | 小 helper 文件候选清理（`message-helpers`、`media-extractors`、`tool-constants`、`cli-tui/build-neko`） |
| `neko-puppet` | 3 | 71 | export / market placeholder 与 INP parser 候选清理 |
| `neko-story` | 1 | 12 | webview tailwind config 候选清理 |

变化说明：`test-fixtures` 已不再被标记；`neko-agent` 行数从 68 增至 87（`cli-tui/build-neko.ts` 67 行）。

依赖与导出问题热点（2026-06-06）：

| 包 | 主要问题 |
|----|----------|
| `neko-agent` | 未使用 deps（5）：`epub2`、`fast-xml-parser`、`node-fetch`、`node-unrar-js`、`xlsx`；未声明 deps：`@neko/ai-sdk`、`undici`、`@neko/shared`、`@neko-agent/types` 等；未使用导出 24 个（AgentWorkItem barrel、presenter helpers） |
| `neko-canvas` | 未使用导出 12 个：barrel / node-card / connection helper export 未被本仓库引用 |
| `neko-sketch` | 未使用导出 7 个：tool / shader / store helper export 未被引用 |
| `neko-puppet` | `jsdom` 未声明；未使用导出 2 个（webview animation export） |
| `neko-dashboard` | `jsdom` 未声明（新增）；未使用导出 4 个（project type / i18n `t` / render guard） |
| `neko-engine` | 未使用导出 5 个：scripts export 静态图未引用 |
| `neko-tools` | parent package devDeps `@neko/neko-client`、`@neko/shared` 未使用 |
| `neko-market` | extension dependency `@neko/neko-client` 未使用 |
| `neko-ui` | devDependency `@vitejs/plugin-react` 未使用 |

### Deprecated / Legacy 分布

非测试源码命中 `deprecated / legacy / obsolete`：

| 审计日期 | 命中 | 变化 |
|----------|------|------|
| 2026-06-01 | 373 | — |
| 2026-06-06 | 427 | +54（+14.5%） |

按包分布（2026-06-06）：

| 包 | 命中 | 文件数 | 与 06-01 对比 | 主要性质 |
|----|------|--------|---------------|----------|
| `neko-types` | 177 | 43 | +29 / +5 files | 旧 schema 字段、migrator、shared UI compatibility surface、配置迁移；新增 skill SDD metadata deprecated 标记 |
| `neko-agent` | 119 | 35 | +18 / +3 files | legacy adapter、旧工具路径、compat shim、workflow deprecation metadata；新增 skill catalog / SkillFileService 相关 |
| `neko-engine` | 52 | 27 | 持平 | INP 兼容、legacy CPU / encode-only pipeline、deprecated Rust API |
| `neko-canvas` | 17 | 7 | +4 / +1 file | legacy anchor / container 兼容 |
| `neko-market` | 12 | 8 | 持平 | marketplace package deprecation 状态与 API |
| `neko-puppet` | 8 | 5 | 持平 | INP read-only / backward-compatible aliases |
| `neko-entity` | 8 | 2 | 持平 | CreativeEntity deprecated 状态 |
| `neko-cut` | 7 | 4 | 持平 | binary/base64 fallback、旧 transition 字段 |
| `neko-assets` | 6 | 2 | 持平 | `legacyFallbackRef` metadata |
| `neko-ui` | 4 | 3 | 新增 | 新建包引入的 deprecated 兼容标记 |
| `neko-dashboard` | 4 | 4 | 新增 | creative entity deprecated 状态渲染 |
| `neko-model` | 3 | 3 | 新增 | legacy 3D 兼容标记 |
| `neko-client` | 3 | 1 | 新增 | streaming client deprecated API |
| `neko-story` | 2 | 2 | 新增 | 文档 fallback |
| `neko-proto` | 2 | 2 | 新增 | proto legacy fields |
| `neko-preview` | 2 | 2 | 新增 | preview deprecated API |
| `neko-audio` | 1 | 1 | 新增 | audio deprecated API |

增长分析：+54 命中主要来自三个方向：
1. `neko-types` skill SDD metadata 新增 `@deprecated` 标注（skill 定义格式演进）。
2. `neko-agent` skill catalog + SkillFileService 重构引入新的 deprecated 兼容入口。
3. 首次审计遗漏的小包（`neko-ui`、`neko-model`、`neko-client`、`neko-proto`、`neko-preview`、`neko-audio`）现已纳入。

这些命中分三类：

| 类别 | 定义 | 例子 | 默认处理 |
|------|------|------|----------|
| Canonical compatibility | 为已发布文件格式、用户数据或跨包契约保留 | `neko-types` migrator、proto legacy fields、market deprecation status | 保留，补测试和注释 |
| Migration adapter | 新旧架构过渡期间保留 | Agent projectSearch shim、AI SDK legacy bridge、Engine legacy encode path | 设 sunset 条件，迁完删除 |
| Stray legacy surface | 已有替代入口但旧入口仍可被误用 | `@neko/shared/components` React UI、重复工具注册路径 | 建 guardrail，禁止新增，逐步删除 |

### TODO / FIXME 分布

`TODO(P*) / FIXME / HACK`（2026-06-06）共 27 处（-1）：

| 包 | 命中 | 与 06-01 对比 | 主要内容 |
|----|------|---------------|----------|
| `neko-agent` | 10 | -1 | AgentRunnerPort fallback（P1）、projectSearch compat shim（7 × P2）、skill 工具缺口（P1） |
| `neko-engine` | 8 | 持平 | preview provider / encode-only backend / legacy CPU pipeline / source model tracking（全部 P2） |
| `neko-story` | 7 | 持平 | 文档计划中的 CreativeEntityGraph / OccurrenceIndex 后续项（P1 × 5, P2 × 2） |
| `neko-live` | 1 | 持平 | TrackingService ownership 迁移（P2） |
| `neko-market` | 1 | 持平 | patch format 应用（P1） |

## 五层分析

| 层 | 职责 | 当前问题 | 清理原则 | 验证 |
|----|------|----------|----------|------|
| L0 Contracts | `@neko/shared`、proto、format migrator、公共类型 | deprecated 字段多，但大多承担兼容契约 | 不能按 unused 直接删；必须先有 schema migration 和 fixture | contract tests、fixture roundtrip |
| L1 Extension Host | commands、custom editor、provider 注册、VSCode lifecycle | 动态入口多，静态工具易误报；多个包重复 logger/error/html | 先补 entry / manifest-aware 配置，再抽共享 L1 helper | package compile、extension tests |
| L2 Webview UI | React、Zustand、Vite entry、UI primitives | Vite multi-entry 假阳性；legacy shared UI surface 尚未完全删除 | `@neko/ui` 为新入口；legacy imports 只允许 allowlist | Vite build、legacy import guard |
| Runtime / Engine | Rust pipeline、legacy format、GPU/CPU fallback | legacy path 与新 pipeline 并存，部分已标 TODO(P2) | 跟随 engine ADR 做阶段删除，不做 TS 层重复实现 | cargo test、engine route tests |
| Package adapters | 各包把领域状态投射到共享能力 | Agent 工具双轨、projectSearch shim、包内小 helper 重复 | owner-owned adapter 可保留；跨包重复收敛到 shared / provider registry | targeted tests、dependency-cruiser |

## 决策

### 1. 死代码清理采用三段式门禁

任何被 `knip` 标记的文件先进入以下三类之一：

| 分类 | 条件 | 动作 |
|------|------|------|
| Confirmed dead | 无 manifest / Vite / runtime loader / public export / fixture 依赖 | 删除并跑包内测试 |
| Static false positive | 有 HTML entry、VSCode contribution、runtime loader 或 public API 证据 | 更新 `knip.config.ts` entry / ignoreIssues |
| Deferred migration | 属于 legacy compatibility 或 planned feature shell | 建 issue / TODO，补删除条件，不在清理 PR 中删除 |

### 2. Deprecated / legacy 代码必须带删除条件

新增或保留 deprecated / legacy 入口时，应至少说明：

1. canonical replacement。
2. 保留原因。
3. 删除条件或 sunset 时间。
4. 保护测试。

示例格式：

```ts
/**
 * @deprecated Use FooRuntimePort. Kept for Extension hosts that do not expose
 * AgentRunnerPort yet. Remove after all package hosts register AgentRunnerPort.
 */
```

Rust 中使用 `#[deprecated(note = "...")]` 时，同样应说明替代路径和保留原因。

### 3. 冗余代码优先清理结构性双轨

优先级高于小函数去重：

| 优先级 | 冗余层 | 原因 |
|--------|--------|------|
| P0 | Agent 工具注册双轨：legacy centralized tools vs per-package CapabilityProvider | 可能重复注册同一工具，维护入口不清晰 |
| P1 | `@neko/shared/components` React UI compatibility surface vs `@neko/ui` | 容易产生错误 auto-import，违反 UI 迁移策略 |
| P1 | Extension logger/error/html/nonce helper 重复 | 多包重复实现安全与错误处理，易产生 CSP / logging 差异 |
| P2 | Engine legacy CPU / encode-only pipeline | 需要跟随 Engine pipeline ADR，不可零散删除 |
| P2 | Webview local wrapper 组件 | 保留 adapter owner-owned，等 UI contract 稳定后再收敛 |

## 重点清理路线

### Phase 0: 修正静态分析基线

目标：让 `pnpm check:unused` 报告更可信。

动作：

1. 在 `knip.config.ts` 为 `packages/neko-tools/packages/webview` 显式补 `src/assetDiff.tsx` / `assetDiff.html` entry，避免把 AssetDiff webview 误判为死代码。
2. 对 runtime-loaded parser / VSCode contribution / package public API 只使用精确 ignore，不扩大到整个目录。
3. 对确认为 public surface 的 barrel export 添加 `ignoreIssues`，并在注释中写明 owner。

### Phase 1: 低风险死代码和依赖清理

候选（2026-06-06 更新）：

| 包 | 候选 | 备注 |
|----|------|------|
| `neko-dashboard` | `ContextStrip.tsx`、`ProjectTable.tsx`、`QuickActions.tsx`、`RecentActivity.tsx`、webview `logger.ts` | 当前 Skill Catalog 功能开发中，确认这些组件不被新功能复用后再删除 |
| `neko-canvas` | `InlineControls.tsx`、`ImageViewer.tsx`、`components/content/index.ts` | 需逐项确认是否有 runtime loader 或动态引用 |
| `neko-sketch` | `gradient-shaders.ts`、`psd-import.ts` | `psd-import` 需确认 PSD→Puppet 路线是否仍需保留 |
| `neko-agent` | `message-helpers.ts`（6 行）、`media-extractors.ts`（7 行）、`tool-constants.ts`（7 行）、`cli-tui/build-neko.ts`（67 行） | 前三个为空壳 re-export，可直接删除 |
| `neko-story` | unused webview `tailwind.config.js` | |

依赖清理（2026-06-06 更新）：

1. 移除确认为 unused 的 package deps：`epub2`、`fast-xml-parser`、`node-fetch`、`node-unrar-js`、`xlsx`（neko-agent）、`@neko/neko-client`（neko-market）。
2. 移除确认为 unused 的 devDeps：`@neko/neko-client`、`@neko/shared`（neko-tools）、`@vitejs/plugin-react`（neko-ui）。
3. 补齐实际使用但未声明的 deps：`@neko/ai-sdk`、`undici`、`@neko/shared`、`@neko-agent/types`（neko-agent ai-sdk 子包）。
4. 对测试依赖 `jsdom`（neko-dashboard、neko-puppet、neko-types），统一到对应 package devDependencies。

### Phase 2: Deprecated / legacy debt register

建立按包 legacy 清单。每项包含：

| 字段 | 含义 |
|------|------|
| id | 稳定编号 |
| package | 所属包 |
| file | 入口文件 |
| kind | compatibility / migration-adapter / stray-surface |
| replacement | 替代入口 |
| owner | 负责包 |
| removeAfter | 日期、版本或前置条件 |
| tests | 保护测试 |

首批纳入（2026-06-06 更新）：

| id | 包 | 入口 | 分类 | 替代/删除条件 | 状态 |
|----|----|------|------|---------------|------|
| LCD-001 | `neko-agent` | `packages/extension/src/services/projectSearch/*` | migration-adapter | internal imports 全部迁到 `@neko/search` 后删除 | 开放（7 × P2 TODO 仍存在） |
| LCD-002 | `neko-agent` | legacy tool registration path / `puppetFaceTools.ts` | stray-surface | per-package CapabilityProvider 完全覆盖并通过 duplicate guard | 开放 |
| LCD-003 | `neko-types` | `src/components/index.ts` | stray-surface | Agent-safe file-drop / icon strategy 完成后删除 React UI legacy exports | 开放 |
| LCD-004 | `neko-engine` | legacy CPU / encode-only preview pipeline | migration-adapter | Engine pipeline sink / preview provider 完成后删除 | 开放（8 × P2 TODO） |
| LCD-005 | `neko-puppet` / `neko-engine` | INP metadata-only support | canonical compatibility | 明确不再支持旧文件打开或完成迁移工具后删除 | 开放 |
| LCD-006 | `neko-canvas` | legacy anchors / group childIds | canonical compatibility | `.nkc` schema migration 和 fixtures 确认后删除 fallback | 开放 |
| LCD-007 | `neko-agent` / `neko-dashboard` | `SkillFileService` + dashboard `SkillList` skill catalog 旧协议 | migration-adapter | `skillCatalogProvider` + `skillCatalogActions` 完全替代 `SkillFileService` 的 skill CRUD 后删除旧路径 | 进行中（2026-06-06 开发中） |
| LCD-008 | `neko-types` | `skill.ts` SDD metadata deprecated 字段 | canonical compatibility | 确认所有 skill 文件已迁移到新 metadata schema 后删除旧字段 | 开放 |

### Phase 3: 结构性冗余收敛

1. Agent 工具注册统一到 CapabilityProvider。
   - 新工具只允许从 package CapabilityProvider 暴露。
   - legacy centralized tools 标为 deprecated，并禁止新增。
   - Capability registry 添加 duplicate name / duplicate provider diagnostic。

2. UI legacy surface 继续执行 `adr-webview-ui-design-system.md` 与 `webview-ui-legacy-code-audit.md`。
   - 非 Agent Webview 不新增 `@neko/shared/components`。
   - Agent 单独设计 file-drop / icon / primitive 迁移。

3. Extension helper 收敛。
   - `nonce.ts`、`html.ts`、`logger.ts`、`errorHandler.ts` 优先抽到 L1 shared helper。
   - 不允许 L1 helper 引入 React / DOM。
   - Webview logger 保持 L2 package-owned 或抽到 `@neko/ui` runtime helper。

4. Engine legacy pipeline 按 Engine ADR 清理。
   - TS 层不重复实现 Rust 已定义的计算逻辑。
   - 删除 legacy path 前必须保留 route / fixture / cargo test 覆盖。

## 不删除清单

以下类型即使被静态工具标记，也不能在普通 dead-code cleanup 中删除：

1. `packages/neko-proto/*.proto` 中的 legacy 字段。
2. `@neko/shared` package public exports，除非同步更新 package exports、README、依赖包和迁移文档。
3. `.nk*` 文件格式 migrator 和旧 schema fixture。
4. VSCode `contributes`、custom editor、command handler 相关入口。
5. Rust legacy format reader / migrator，除非有明确数据迁移决策。
6. Vite HTML multi-entry 对应的 root TSX 文件。

## 验证门禁

按改动范围执行最小验证：

| 改动 | 验证 |
|------|------|
| `knip.config.ts` / dependency cleanup | `pnpm check:unused` |
| TypeScript package dead code removal | 对应 package `pnpm --filter <pkg> test` 和 `pnpm --filter <pkg> build` |
| Webview entry / UI cleanup | 对应 webview `pnpm --filter <webview-pkg> build` |
| shared contract cleanup | `pnpm test -- --run` 中相关 contract tests，或 targeted Vitest |
| dependency boundary cleanup | `pnpm check:deps` |
| Rust legacy cleanup | `cd packages/neko-engine && cargo test` |

仓库级别清理完成后再跑：

```bash
pnpm check
pnpm test
pnpm build
```

## 更新规则

每次清理 deprecated / legacy / dead code 时，应同步更新：

1. 本 ADR 的事实表或 legacy debt register。
2. 对应包的 README / architecture note，如果改变 public API 或入口。
3. `knip.config.ts`，如果新增或删除静态分析豁免。
4. 对应测试 allowlist，如 UI legacy import guard。

## 结论

当前仓库的主要技术债不是单纯死代码数量，而是迁移期双轨和兼容入口没有统一删除条件。清理顺序应先修静态分析基线，再删低风险孤立文件和依赖，最后处理 Agent 工具双轨、shared UI legacy surface、Engine legacy pipeline 等结构性冗余。

所有清理都必须维护 Neko Suite 的核心架构约束：Protobuf / Rust engine 是跨层契约与计算权威，Webview 不直接访问 VSCode / Node.js，Extension 不引 React，L0 / L1 / L2 依赖方向不反转。

## 变更日志

### 2026-06-06 第二次审计

**数据变化摘要**：

| 指标 | 06-01 | 06-06 | 变化 |
|------|-------|-------|------|
| 未引用文件 | 27 | 26 | -1（`test-fixtures` 不再标记） |
| deprecated/legacy 命中 | 373 | 427 | +54（+14.5%） |
| TODO/FIXME | 28 | 27 | -1 |
| 未使用依赖 | 7 | 6 | -1（`adm-zip` 已清理） |
| 未使用导出 | 157 | 158 | +1 |
| LCD register 条目 | 6 | 8 | +2 |

**主要变化**：

1. **Skill Catalog 功能开发中**：`neko-agent` 新增 `skillCatalogProvider` 和 `skillCatalogActions`；`neko-dashboard` 新增 `SkillList` 组件和测试。这些是活跃开发代码，引入了新的 deprecated 兼容入口（LCD-007、LCD-008）。
2. **Storyboard Resource Identity 加固**：`neko-agent` composite content / storyboard transfer presenter 更新，新增测试。
3. **deprecated 命中增长 14.5%**：主要来自 `neko-types` skill metadata 演进和 `neko-agent` skill 文件服务重构，以及首次审计遗漏的小包（`neko-ui`/`neko-model`/`neko-client`/`neko-proto`/`neko-preview`/`neko-audio`）。
4. **依赖清理进展**：`adm-zip` 已从 `neko-agent` unused deps 中清除。
5. **新增 LCD register 条目**：LCD-007（skill catalog 旧协议迁移）、LCD-008（skill SDD metadata deprecated 字段）。
