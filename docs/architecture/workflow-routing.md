# 创作工作流路由（Workflow Routing）

> ADR Status: Accepted（Phase 1 + 3 + 3.5 + router-memory inspector 已实现，见 §12）
> Date: 2026-04-18 / Updated 2026-04-19
> Scope: 决定「输入素材走哪条创作路径」的 Router 子系统
> Layer: **Workflow**（区别于 Plan 层 / Pipeline 层）

**术语约定**（避免与 L0-L4 路径分级混淆）：
- **L0-L4**（本文 §3）：**路径级别**，指"输入→输出"走哪条创作模板
- **Tier A/B/C**（本文 §4）：**决策层级**，指 Router 内部的三段决策漏斗（规则 → LLM → 用户）

---

## 1. 背景

Neko Suite 已覆盖从素材到视频的完整创作链路（`neko-preview → neko-sketch/neko-story → neko-canvas → neko-agent → neko-cut`），但不同创作场景对这条链路的使用方式差异巨大：

- 「一句话生成 15 秒视频」不需要剧本/分镜
- 「小说改编短剧」需要完整链路
- 「漫画改编动画」需要视觉优先的特殊路径

**Workflow 层的职责**：给定输入（素材/文本/项目文件），决定这次创作应该走哪条**路径模板**（L0-L4 之一）。

**Workflow 层不关心**：
- 「具体用 alice_casual.png 还是 alice_formal.png」— 这是 **Plan 层** 的事
- 「如何把 text 切分成 tokens 发给 LLM」— 这是 **Pipeline 层** 的事

## 2. 必要 vs 可选步骤

只有**输入**和**输出**是真正必要的，中间所有步骤都应当**可选 + 可跳过 + 可升级**。

| 步骤 | 必要性 | 可跳过条件 |
|------|--------|-----------|
| 输入 | **必需** | — |
| 素材解析/结构化 | 可选 | 输入已结构化（Fountain / JSON / 已有分镜） |
| 剧本 | 可选 | 短视频 / MV / 单镜头；用户直接给 prompt |
| 分镜 | 可选 | 单镜头生成；素材本身即分镜（漫画） |
| 角色/风格锚定 | 可选 | 单镜头；不要求跨镜头一致性 |
| AI 生成 | 可选 | 已有素材库，只做剪辑 |
| 剪辑后期 | 可选 | 单镜头直出；生成即最终稿 |
| 输出 | **必需** | — |

**反直觉结论**：全链路只适用于 < 5% 的场景。Router 默认应当选**最短必要路径**。

## 3. L0-L4 路径分级

```
[L0] prompt → agent 直出 → 导出
     场景: 一句话 / 表情包 / 短卡点

[L1] prompt → 分镜列表 → batch gen → cut 拼接
     场景: MV / 短视频 / 同风格连镜

[L2] 素材 → agent 解析 → 分镜 → 参考锚定 → gen → cut
     场景: 广告片 / 预告片 / 多风格混剪

[L3] 长文本 → story 剧本 → canvas 分镜 → 角色表 → gen → cut
     场景: 短剧 / 微电影 / 剧情向

[L4] 漫画/绘本 → 视觉解析 → sketch 重绘 → 分镜 → gen → cut
     场景: 动漫改编 / 绘本动画
```

**素材类型 → 默认入口**：

| 素材类型 | 默认路径 | 默认跳过 |
|---------|---------|---------|
| prompt 字符串 | L0 | story / canvas / sketch |
| 短文（<500 字）| L1 | story |
| Word / 小说 | L3 | — |
| Fountain 剧本 | L2 | story（已结构化）|
| 漫画 / 绘本 | L4 | story |
| 已有素材库 | 仅剪辑 | 全部生成链 |
| 多图 drop | L1 | story |
| `.nkc` 画布 | L2 | preview / story |
| `.nkv` 时间线 | 仅后期 | 全部上游 |

## 4. 三层混合路由

**为什么不能纯 LLM 自主路由**：

| 问题 | 后果 |
|------|-----|
| 非确定性 | 同一输入两次路由不同，用户困惑 |
| 隐式成本 | 每次创作先烧 tokens 做路由，长期不经济 |
| 延迟 | 额外一次 LLM 调用 |
| 黑盒决策 | 用户无法理解「为什么走了 L3」，失去信任 |
| 幻觉风险 | LLM 可能编造不存在的路径或跳过必要阶段 |

**为什么纯规则也不够**：

| 问题 | 场景 |
|------|-----|
| 语义盲区 | "500 字文本" 是诗歌还是微小说？ |
| 结构模糊 | 小说散文对白 vs 场景转换 |
| 意图识别 | 用户想要 MV 风格还是剧情片？ |

**结论：规则兜底 + LLM 补位 + 用户可见可推翻**。

```
输入 → [Tier A FastProbe 规则]     ← 90% 明确情况直接命中
     → [Tier B LLM Router 工具链]   ← 模糊 10% 补位（Haiku）
     → [Tier C 用户确认/覆盖]        ← 始终可见可推翻
     → 交付给 Plan 层（见 plan-mode.md）
```

**注意**：Tier A/B/C 是 Router 内部三段漏斗，与 §3 的 L0-L4 **路径级别**无关——别混。

## 5. Router 架构

```
Router (packages/neko-agent/packages/platform/src/workflow/router/)
├── InputProbe          → 素材类型 + 元数据提取（文件嗅探、MIME、计数）
├── FastProbe           → 规则层（纯函数，100% 确定性）
├── LLMRouter           → Haiku 4.5 + tool-using（模糊兜底）
├── RouteRegistry       → L0-L4 → {flowId, skipStages, defaultStageParams}
└── RouteMemory         → 用户偏好持久化
```

### FastProbe 规则命中示例

```
input is prompt string, len < 200     → L0
input is .fountain file                → L2 skip story
input is .nkc canvas                   → 从 canvas 起步
input is 10+ images drop               → L1 batch
input is .nkv                          → 仅 cut
已有 project prefs（.neko/settings.json
  或 .nkproj.workflow.pinnedRouteLevel）→ 锁定路径
用户 drag-drop 到特定扩展              → 意图显式，锁定入口
```

### RouteRegistry recipe 示例

`RouteLevel → { flowId, skipStages, defaultStageParams }`（[route-registry.ts](packages/neko-agent/packages/platform/src/workflow/router/route-registry.ts)）：

```typescript
// L0：prompt 直出
{
  flowId: 'flowA',
  skipStages: ['readDocument', 'parseStoryboard', 'generatePrompts',
               'importStoryboardToCanvas', 'batchGenerate', 'arrangeOnTimeline'],
  defaultStageParams: { generatePilot: { useRaw: true } },
}

// L2：素材结构化 → 分镜 → 生成 → 拼接
{
  flowId: 'flowB',
  skipStages: ['readDocument'],                    // 输入已结构化
  defaultStageParams: {
    parseStoryboard: { respectExisting: true },    // 保留已有分镜
    batchGenerate: { unit: 'shot' },
  },
}

// L3：长文本全链路
{
  flowId: 'flowB',
  skipStages: [],                                  // 全 stage 跑
  defaultStageParams: {
    readDocument: { chunkSize: 3200 },
    batchGenerate: { unit: 'scene' },
  },
}
```

### LLM Router：Tool-Using Agent（非黑盒分类器）

给 LLM 工具让它**多步推理**。实现落在 [llm-router-tools.ts](packages/neko-agent/packages/platform/src/workflow/router/llm-router-tools.ts)：

```typescript
type RouteLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
type AssetKind = 'character' | 'style' | 'prop' | 'scene' | 'audio';
type ExtensionId = 'agent' | 'story' | 'canvas' | 'sketch' | 'cut';
type Stage =
  | 'readDocument' | 'parseStoryboard' | 'generatePrompts'
  | 'importStoryboardToCanvas' | 'generatePilot' | 'batchGenerate'
  | 'arrangeOnTimeline' | 'renderEngine' | 'qualityGate';

const routerTools = [
  // 纯函数：跑本地启发式（段落数/对白密度/场景切换词）
  { name: 'analyze_text_structure',
    args: { excerpt: string } },

  // 读 AssetLibrary：不拉全表，返回 count + 样本 id
  { name: 'check_existing_assets',
    args: { kind?: AssetKind } },

  // 复用 cost-estimator：返回 per-stage token/credit 预测
  { name: 'estimate_duration',
    args: { level: RouteLevel } },

  // Phase 3.5：经 RouterAskBroker 接 webview modal；budget 自动暂停
  { name: 'ask_user',
    args: { question: string, options?: string[] } },

  // 终结工具：LLM 必须调用此工具才算 commit，否则走 fallback
  { name: 'commit_route',
    args: {
      level: RouteLevel,
      reason: string,                       // 必填：人类可读路由理由
      skipStages?: Stage[],                 // 可选覆盖 RouteRegistry 的默认
      entryExtension?: ExtensionId,         // 可选：入口扩展 override
    }},
];
```

**实现约束**（见 [llm-router.ts](packages/neko-agent/packages/platform/src/workflow/router/llm-router.ts)）：
- **Budget**: 2s 硬墙钟 via `AbortController`；ask_user 期间**自动暂停**，返回后恢复剩余预算
- **Iterations**: 最多 5 轮 tool-use；超过则降级
- **Cache**: 会话内 Map 缓存 `hashInput(input, workDir) → LLMRouterResult`
- **Memory**: 提交后 fire-and-forget 写 `.neko/memory.md` 的 `workflow-router` H2 section
- **Ask broker**: Phase 3.5 `RouterAskBroker` 通过 webview `RouterAskModal` 交互式问用户（60s 超时→dismissed→LLM 自行决策），无 webview 时返回 `deferred`

**Fallback 分级**（facade 统一降级到 FastProbe）：

| 失败分类 | 触发条件 | 处理 |
|---------|---------|------|
| network | model 调用抛 / timeout | budget 记已耗尽；cache miss 标记；fallback 到 FastProbe |
| parse | tool 返回 JSON schema 不符 | 该 tool 视为失败，LLM 可继续尝试其他 tool（不立即降级）|
| iterations | 5 轮未调 `commit_route` | 视为无结论，fallback |
| budget exhausted | 2s 预算耗尽且未 commit | fallback |
| hallucinated level | `commit_route.args.level` ∉ L0-L4 | 校验失败，fallback |
| no commit at end | model 正常停止但没调 `commit_route` | fallback |
| user dismissed ask_user | 60s 超时 | LLM 继续决策但上下文里注入 "user dismissed"，可再试一轮 |

### 路由作为对话（非黑盒决策）

```
用户: [拖入 novel.txt]
Agent: 识别到 3,200 字短篇，4 个场景、2 个角色。
      建议路径: L3「剧本→分镜→生成→剪辑」
      理由: 场景切换多 + 需要角色一致性
      [开始] [改走 L1 批量生成] [我自己编辑]
```

## 6. 路由决策表

| 情况 | 使用层 |
|------|-------|
| 用户 drag-drop 到明确目标 | L1 规则（意图显式）|
| 用户在 chat 里粘贴文本 | L1 优先，fallback L2 |
| 用户说"帮我做 MV" | 跳过路由，按 hint 锁定 |
| 用户说"帮我规划下" | 直接 L2 + 主动对话 |
| 会话内重复操作 | 缓存上次决策 |
| 已有 project prefs | 读 `.neko/settings.json` 或 `.nkproj.workflow.pinnedRouteLevel` |

## 7. 路由记忆

用户偏好沉淀到 `<workDir>/.neko/memory.md`（已有 `FileProjectMemoryManager`）：

```
user 习惯长文本也走 L1 → 下次 L2 Router 收到长文本时优先建议 L1
user 曾推翻过某次 L3 决策 → 记住理由
user 特定项目偏好 L4 视觉路径 → 项目级偏好 > 全局偏好
```

**关键原则**：学习结果始终可见可编辑，用户能读能删。

## 8. 成本与延迟优化

| 优化 | 收益 |
|------|-----|
| Haiku 4.5 做路由，Opus 做生成 | 路由成本降 90% |
| 输入 hash 缓存决策 | 同一输入不重算 |
| FastProbe 先行 | 90% 场景 0 LLM 调用 |
| 路由预算 < 2s | 超时降级 |
| 会话内决策复用 | 不重复路由 |

## 9. 与其他层的集成

```
Workflow 层 (本 ADR)
    ↓ 输出 Route {level, flowId, skipStages, stageParams, reason}
Plan 层 (plan-mode.md)
    ↓ PlanBuilder 接管，生成 LitePlan/.nkplan
Pipeline 层 (pipeline-execution.md，基于已有 PipelineExecutor)
    ↓ 按 Plan 指定执行
```

**Router 不直接调用 PipelineExecutor**。Router 只产出 `Route` 对象交给 Plan Builder。

## 10. 反对的做法

- ❌ 纯 LLM 路由（非确定性 + 成本 + 黑盒）
- ❌ 纯规则路由（语义盲区）
- ❌ 路由决策对用户不可见（失去信任）
- ❌ Router 自动执行 pipeline（越权到 Plan/Pipeline 层）
- ❌ Router 做素材匹配（越权到 Matching 层）

## 11. 相关 ADR

| 文档 | 关系 |
|------|-----|
| [workflow-orchestration.md](./workflow-orchestration.md) | 三层 umbrella，本 ADR 是 Workflow 层 |
| [plan-mode.md](./plan-mode.md) | Router 输出 Route 的下游消费者 |
| [pipeline-execution.md](./pipeline-execution.md) | Plan 翻译后交付 Pipeline 执行 |
| [asset-knowledge-graph.md](./asset-knowledge-graph.md) | LLMRouter 的 `check_existing_assets` 工具查询对象 |
| [creative-context-compression.md](./creative-context-compression.md) | Router 的文本结构分析可复用其语义分类 |
| [ablation-experiment-framework.md](./ablation-experiment-framework.md) | Router 功能通过 AblationToggles 灰度发布 |
| [format-strategy.md](./format-strategy.md) §六 | `.nkproj` / `.neko/` 分层，FastProbe 读 project prefs 的位置 |

## 12. 实现状态（更新于 2026-04-18）

### Phase 1 — FastProbe 规则层（已完成）
- [router/input-probe.ts](../../packages/neko-agent/packages/platform/src/workflow/router/input-probe.ts) — 纯 ProbeContext 提取
- [router/fast-probe.ts](../../packages/neko-agent/packages/platform/src/workflow/router/fast-probe.ts) — 表驱动规则层
- [router/route-registry.ts](../../packages/neko-agent/packages/platform/src/workflow/router/route-registry.ts) — L0-L4 recipe
- [router/index.ts](../../packages/neko-agent/packages/platform/src/workflow/router/index.ts) — facade

### Phase 3 MVP — LLMRouter + Memory（已完成）
- [router/llm-router.ts](../../packages/neko-agent/packages/platform/src/workflow/router/llm-router.ts) — 有界 tool-use 循环、2s 可暂停 budget、cache
- [router/llm-router-tools.ts](../../packages/neko-agent/packages/platform/src/workflow/router/llm-router-tools.ts) — 5 个 tool 定义 + 4 个 runner
- [router/input-hash.ts](../../packages/neko-agent/packages/platform/src/workflow/router/input-hash.ts) — 稳定 sha256 hasher
- [router/cost-estimator.ts](../../packages/neko-agent/packages/platform/src/workflow/router/cost-estimator.ts) — per-level 成本聚合
- [memory/router-memory.ts](../../packages/neko-agent/packages/platform/src/workflow/memory/router-memory.ts) — `.neko/memory.md` H2 section `workflow-router`
- Feature flag: `neko.workflow.router.llm.enabled`（默认关）

### Phase 3 — Router memory inspector UI（已完成 2026-04-19）
- `RouterMemory` 新增 `deleteByHash(hash)` / `clearAll()` / `count()` API（[router-memory.ts](../../packages/neko-agent/packages/platform/src/workflow/memory/router-memory.ts)）
- 新 wire 消息：`workflow/routerMemoryRequest` / `workflow/routerMemory` / `workflow/routerMemoryDelete`（[workflow-plan.ts](../../packages/neko-agent/packages/agent-types/src/workflow-plan.ts)）
- Handler 方法：`handleRouterMemoryRequest` / `handleRouterMemoryDelete`（[workflow-plan-handler.ts](../../packages/neko-agent/packages/extension/src/workflow/workflow-plan-handler.ts)）— 过滤 level/source/limit、hash 删除或清空，删后自动重 post
- Orchestrator 暴露 `routerMemory` 实例便于 handler 访问
- Webview `RouterMemoryView.tsx` — level/source chips 过滤 + 逐条 Forget + Clear all，支持 `plan` 存在与不存在两种布局
- `useWorkflowPlan.routerMemory` 状态 + `openRouterMemory / closeRouterMemory` 操作；`workflow/planPreview` 保留现有 routerMemory 不清零
- WorkflowPlanPanel terminal state 增加 **Router history** 按钮打开 drawer

### Phase 3.5 — ask_user 交互兜底（已完成）
- [extension/src/workflow/router-ask-broker.ts](../../packages/neko-agent/packages/extension/src/workflow/router-ask-broker.ts) — `RouterAskBroker` 实现 platform `AskUserBroker`：posts `workflow/routerAsk` + 等 `routerAskResponse`，支持 signal/timeout
- [webview `RouterAskModal`](../../packages/neko-agent/packages/webview/src/components/ChatView/RouterAskModal.tsx) — 多选按钮 + 自由输入 + 倒计时 + Skip
- LLMRouter budget 在 ask 期间自动 pause/resume，避免用户思考时间蚕食 LLM 思考时间
- 默认超时 60s（`neko.workflow.router.askTimeoutMs`），超时按 `dismissed` 处理

### Router facade 决策优先级（实现版）
```
user-override > memory lookup > FastProbe committable > LLMRouter (ambiguous) > 低置信 fallback
```

### 设置集中化（已完成）
- [extension/src/workflow/workflow-settings.ts](../../packages/neko-agent/packages/extension/src/workflow/workflow-settings.ts) — 7 个 flag 统一读取 + clamping + 默认值
- package.json `contributes.configuration` 已注册全部 flag（用户可在 VSCode 设置 UI 中配置）
- Flags 列表：`orchestrator.enabled` / `router.llm.enabled` / `router.llm.budgetMs` / `router.askTimeoutMs` / `plan.autoApproveThreshold` / `consistency.enabled` / `matching.continuity.enabled`

## 13. 下一步展望

Router 层核心功能（规则 + LLM + 记忆 + 交互兜底）已 terminal。下一步方向按优先级：

| 优先级 | 方向 | 说明 |
|-------|------|------|
| P1 | **Flag 默认开** | 对新工作区默认 `orchestrator.enabled = true`；老工作区 opt-in |
| P1 | **Legacy 命令 deprecation** | `neko.pipeline.start` / `neko.agent.generateForNode` JSDoc `@deprecated` + 遥测漏斗 |
| P1 | **Router golden tests 固化** | FastProbe 决策固化为表驱动 golden；LLM fallback 各失败模式单测 |
| P2 | **视觉相似度补强 `check_existing_assets`** | Phase 4.2 CLIP 落地后，工具可返回 top-k 视觉相似资产，减少用户重复上传 |
| P2 | **Consistency 前置校验** | LLMRouter 提交前跑 ConsistencyChecker dry-run，提前 flag 可能的跨镜冲突 |
| P3 | **Route Telemetry Dashboard** | 采集决策 provenance 比例（rules/memory/LLM/ask/fallback），用于判断灰度 rollout 是否可推全 |
| P3 | **多工作区并发 RouterMemory** | 当前 `FileProjectMemoryManager` 单写锁；若并发增多需乐观并发 / 文件锁升级 |
| 观察 | **`.nkproj` 读写频率** | `.neko/settings.json` vs `.nkproj.workflow` 的实际使用占比，决定 `.nkproj.workflow` 是否迁移到 `.neko/` |
