# ADR: 通用复合产物与动态表协议

**状态**: Proposed (2026-06-06)
**关联**: `adr-agent-storyboard-table-schema.md` · `adr-skill-as-prompt-chains.md` · `story-agent-canvas-boundary.md` · `agent-media-architecture.md` · `agent-rich-content-delivery-analysis.md` · `adr-agent-multimodal-perception.md` · `adr-agent-async-task-lifecycle.md` · `agent-unified-workflow.md` · `adr-capability-protocol.md`
**范围**: `@neko/shared` · `@neko/agent-types` · `neko-agent` · `neko-story` · `neko-canvas` · `neko-cut` · `neko-dashboard` · 后续创意子包

---

## 一、背景

`StoryboardTable` 已经解决了 Agent 输出语义分镜表、校验媒体引用、投影到 Canvas/Cut 的第一批核心问题。它适合表达分镜领域的 `scene -> shot` 语义，也适合继续作为 Canvas/Cut 可执行链路的强语义输入。

但后续 Skill 和多模态工作流会产生更多表格型和复合型产物：

- 漫画镜头资产准备表。
- 角色设定检查表。
- 配音角色分配表。
- 动画关键帧/分层需求表。
- 生成候选对比表。
- 导出 QC 报告。
- Dashboard 任务/技能/资产表。
- Model、Sketch、Audio 等子包的参数表和资源表。

如果所有结构化表格都继续围绕 `StoryboardTable` 扩展，分镜表会被迫承载非分镜语义，最终变成难以校验、难以投影、难以维护的万能 JSON。相反，如果每个 Skill 或子包各自发明一套表结构，Agent、Canvas、Cut、Dashboard 又会回到 Markdown 解析和硬编码 kind 分支。

因此需要从 `Storyboard-first` 升级为 `Artifact-first`：

```text
Skill
  -> Agent 生成 CompositeArtifact
  -> GenericTable 展示 / 审阅 / 选择
  -> Adapter / Projector 转领域协议
  -> Capability Provider 执行
  -> 子包回写 ExecutionSummary
```

---

## 二、架构决策

### 2.1 决策摘要

引入通用复合产物与动态表协议：

- `CompositeArtifact` 是跨 Agent、Story、Canvas、Cut、Dashboard 等子包流通的通用结构化产物信封。
- `GenericTable` 是通用动态表结构，用于展示、审阅、筛选、选择、批注和轻量状态回写。
- `StoryboardTable` 保留为分镜领域的强语义协议，不再作为所有表格能力的中心。
- 各子包在通用协议基础上声明定向支持：能渲染什么、能接收什么、能投影什么、能执行什么。
- Agent 支持小型协议内核，通过 registry 动态发现 validator、renderer、projector、capability，不内置所有领域协议细节。
- Skill 可以约束 Agent 输出倾向、表结构建议、profile、推荐操作和所需能力，但不能动态提升子包能力或绕过权限/审批/校验。
- Profile 是产物结构约束，默认随 Skill 就近管理，可提升为共享 Profile Descriptor，但不作为另一种运行时 Skill。
- Profile 是校验约束优先、渲染提示其次；renderer 不能用 profile 放宽校验或授予执行能力。
- Artifact 相关 protocol/profile/renderer/projector/capability registry 是 `adr-capability-protocol.md` 下的 typed facets，不另建并行注册地基。
- 执行副作用必须经过 validator、adapter/projector、capability registry、approval gate 和 provider。

### 2.2 三个架构问题

1. **是否符合现有架构？**

   符合。该方案延续现有职责边界：Story 负责剧本事实和 scene-level 审阅；Agent 负责语义决策、结构化产物生成和编排；Canvas/Cut/Audio/Model/Sketch 等子包负责领域执行、深度编辑、预览和长期事实源。

2. **如何进一步降低耦合？**

   将通用展示/审阅能力收敛到 `CompositeArtifact` 和 `GenericTable`，将领域执行收敛到显式注册的 projector 和 provider。Agent 不再硬编码每种表 profile 或目标子包动作；子包也不解析 Agent Markdown。

3. **是否易于扩展与测试？**

   是。新增 Skill 多数只需 Markdown + manifest；新增表 profile 多数只需 schema/profile/mapping；只有新增真实副作用能力、资源类型或复杂领域编辑时才需要子包代码注册 provider/adapter。

---

## 三、职责与依赖

### 3.1 职责分层

| 层 | 职责 |
|---|---|
| Skill | 描述工作流、表结构建议、输出规则、推荐操作、能力需求 |
| Agent | 生成 composite artifact、校验、修复、选择能力、请求确认、编排执行 |
| CompositeArtifact | 通用结构化产物信封，承载多模态 blocks、来源、诊断、建议动作 |
| GenericTable | 通用动态表，支持多模态 cell、行列状态、审阅和选择 |
| DomainPayload | 强语义领域协议，例如 `StoryboardTable`、`CanvasStoryboardPayload`、Cut payload、未来 `AnimationPlan` |
| Protocol/Profile Registry Facet | 在 Capability Protocol Registry 下注册 artifact kind、profile、validator、renderer、projector |
| Capability Registry | 注册子包能力、风险、审批规则、输入/输出 artifact |
| Adapter / Projector | 将通用表或领域表确定性转换为目标 payload 或 `EditOperation` |
| Provider | 子包真实执行能力，负责写入、生成、导入、回写 summary |

### 3.2 依赖方向

```text
@neko/shared
  ├─ CompositeArtifact
  ├─ GenericTable
  ├─ ArtifactCapabilityRegistration
  ├─ ArtifactExecutionSummary
  ├─ StoryboardTable
  └─ pure validators / projectors

@neko/agent-types
  └─ Webview / plugin transfer 展示适配，不拥有领域语义

neko-agent
  ├─ 生成和修复 artifact
  ├─ 查 registry
  ├─ 编排 capability
  └─ 不直接持有子包事实源

neko-canvas / neko-cut / neko-story / neko-dashboard / ...
  ├─ 通用协议轻量渲染
  ├─ 定向协议支持
  └─ 子包内部事实源和执行能力
```

禁止方向：

- Canvas/Cut 不解析 Agent Markdown 或 Skill Markdown 执行副作用。
- Skill 不发明未注册的子包能力。
- Agent 核心不硬编码每种领域协议。
- 通用表不直接执行写入、生成、删除、替换等副作用。
- 持久协议不保存 base64、blob URL、webview URI、localhost URL、私有 cache path 或绝对本地路径。

### 3.3 与 Capability Protocol 的关系

本 ADR 不新增一套并行 registry 地基。`Protocol Registry`、`Profile Registry`、`Renderer Registry`、`Projector Registry` 和 artifact capability 都是 `adr-capability-protocol.md` 中 `CapabilityContribution` / `IReadOnlyCapabilityRegistry` 的 typed facets 或查询视图。

```text
Capability Protocol Registry
  ├─ tool / toolGroup / skill / provider facets
  └─ artifact facets
       ├─ protocol registrations
       ├─ profile descriptors
       ├─ renderer registrations
       ├─ projector registrations
       └─ artifact capability registrations
```

Registration 阶段只声明轻量、可序列化、可审计的元数据；Injection 阶段再解析具体 renderer、projector、provider 实现。若 P0 需要扩展 `CapabilityContribution`，应增加 artifact 相关 contribution 字段或命名空间，而不是让各子包维护私有全局注册表。

边界：

- Protocol/Profile/Renderer facet 可以说明“如何识别、校验、展示、转换”。
- Capability facet 才能说明“是否可以执行、风险等级、是否需要审批”。
- 缺少 capability 时，artifact 仍可展示和审阅，但所有副作用动作必须禁用。

---

## 四、协议设计

### 4.1 `CompositeArtifact`

`CompositeArtifact` 是通用复合产物信封，用于跨子包传递结构化结果：

```typescript
interface CompositeArtifact {
  readonly schemaVersion: 1;
  readonly kind: 'composite-artifact';
  readonly artifactId: string;
  readonly profile?: string;
  readonly title: string;
  readonly blocks: readonly CompositeArtifactBlock[];
  readonly provenance?: ArtifactProvenance;
  readonly diagnostics?: readonly ArtifactDiagnostic[];
  readonly suggestedActions?: readonly ArtifactAction[];
  readonly extensions?: Readonly<Record<`neko.${string}`, JsonValue>>;
}
```

它解决的问题是“这是一个什么结构化产物、由哪些 block 组成、来自哪里、有什么诊断、有哪些可建议动作”。它不保证某个动作一定可执行；可执行性必须由 registry 和 capability provider 决定。

### 4.2 多模态 block

`CompositeArtifact` 支持多模态 block，而不是只支持表：

```text
text        说明、摘要、旁白、诊断说明
table       GenericTable
media       单个 image / video / audio / model ref
gallery     多候选、多版本、多参考
comparison  候选对比
timeline    时长、字幕、旁白、音效 cue 预览
domain      StoryboardTable、AnimationPlan 等强语义 payload
diagnostic  校验、能力、资源、安全问题
```

当前核心 block type 应视为封闭集合。原因是基础 renderer、validator 和安全降级需要稳定穷举；新增顶层 block kind 应通过 schema version 或 registry version 明确引入。

开放性通过两条路径处理：

- `domain` block 承载强语义 payload，例如 `StoryboardTable`、`AnimationPlan`、未来领域协议。
- `extensions` 承载命名空间扩展元数据，但不能承载未校验的可执行命令。

当旧客户端收到未来版本或未知 block type 时，必须：

- 保留原始 payload 或引用，避免数据丢失。
- 渲染为 placeholder / raw JSON / diagnostic。
- 禁用该 block 产生的 execute action。
- 不把未知 block 投影为领域 payload。

通用协议只保存稳定资源引用，例如：

- `ResourceRef`
- `DocumentArchiveResourceRef`
- `GeneratedAssetRef`
- tool-result locator
- `CanvasNodeRef`
- `StorySourceRef`

渲染时由 host 或目标子包解析为 webview-safe URI。

### 4.3 `GenericTable`

`GenericTable` 是通用动态表：

```typescript
interface GenericTable {
  readonly schemaVersion: 1;
  readonly kind: 'generic-table';
  readonly tableId: string;
  readonly profile?: string;
  readonly title: string;
  readonly columns: readonly GenericTableColumn[];
  readonly rows: readonly GenericTableRow[];
  readonly actions?: readonly ArtifactAction[];
  readonly diagnostics?: readonly ArtifactDiagnostic[];
  readonly extensions?: Readonly<Record<`neko.${string}`, JsonValue>>;
}
```

支持的 cell 类型至少包括：

```text
string
number
boolean
enum
tags
status
diagnostic
resource-ref
media-preview
duration
timecode
json
action
```

当前 cell type 也应视为封闭基础词表；复杂领域数据优先放入 `json`、`resource-ref` 或 `domain` payload，并由 profile validator 约束其结构。

`json` cell 在当前版本中只做 bounded validation：

- 基础 validator 只校验 JSON 可序列化、大小上限、禁止 function/blob/base64/webview URI 等不安全值。
- profile validator 可以声明浅层 shape check，例如必需 key、字段类型、枚举、数组长度上限。
- 复杂嵌套结构应使用 `schemaRef` 指向共享 JSON Schema 或领域 payload validator，不在通用表 validator 中递归实现完整领域校验。
- 若 `schemaRef` 无法解析，应降级为诊断，不允许由该 cell 触发投影或执行动作。

Profile 的语义是“校验约束优先、渲染提示其次”：

- `GenericTable` 基础 validator 校验表格形状、列 ID、行 ID、cell type、资源引用安全性。
- profile validator 校验列集合、必填字段、枚举值、资源模态、行级 action、字段映射和 suggested action 是否符合 profile descriptor。
- renderer 可以使用 profile 决定标签、列宽、排序、分组、紧凑视图和领域增强预览。
- renderer 不能使用 profile 放宽 validator 结果，也不能让未注册 action 变为可执行。
- 没有 profile 的通用表只能走基础校验和通用展示；除非存在显式 projector，否则不能投影为领域 payload。

它适合展示和审阅：

- 表格列动态定义。
- 行级状态和诊断。
- 多模态预览。
- 行选择、批量选择。
- 批注、确认、驳回。
- 推荐动作。

它默认不适合直接执行副作用。执行必须通过 adapter/capability。

### 4.4 领域协议继续存在

通用协议不替代领域协议：

| 协议 | 角色 |
|---|---|
| `GenericTable` | 通用展示、审阅、动态表结构 |
| `StoryboardTable` | 分镜语义计划 |
| `CanvasStoryboardPayload` | Canvas 分镜导入 sink |
| Cut storyboard payload | Cut 时间线导入 sink |
| `EditOperation` | 已确认的确定性编辑操作，可 apply/invert/undo |

关系：

```text
GenericTable
  -> optional projector
  -> StoryboardTable / AnimationPlan / DomainPayload
  -> optional provider
  -> EditOperation 或子包 command payload
```

---

## 五、子包支持与渲染

### 5.1 通用支持与定向支持

各子包应在通用协议基础上添加定向支持。

```text
通用协议
  所有子包都能看懂、展示、选择、审阅

定向支持
  子包声明自己能把哪些 artifact/profile 转成原生对象

私有实现
  子包内部怎么编辑、保存、渲染、执行
```

| 子包 | 通用支持 | 定向支持 |
|---|---|---|
| Agent | 渲染/解释 `CompositeArtifact`、通用表、图集、诊断 | 编排 adapter/capability |
| Story | 显示 scene/readiness 通用表 | 提供 `ScriptIndex / SceneContext / CharacterIndex` |
| Canvas | 显示表格节点、图集、媒体引用预览 | `StoryboardTable -> CanvasStoryboardPayload`、创建 Scene/Shot |
| Cut | 显示 shot/cue 表、导入预览 | `StoryboardTable -> Cut payload`、写 timeline |
| Dashboard | 任意任务/技能/资产表 | 管理动作 |
| Sketch/Model/Audio | 资源表、参数表、预览块 | 各自 provider 操作 |

缺少定向支持时，artifact 仍可展示和审阅，但执行动作必须禁用并显示诊断。

### 5.2 Renderer Registry

渲染应由 renderer registry 分派，而不是由 Agent 或某个 Webview 硬编码所有 block：

```text
Artifact block
  -> Renderer Registry
  -> 通用 renderer
  -> 可选领域增强 renderer
```

例如：

- 所有子包可用通用表 renderer 展示 `GenericTable`。
- Canvas 可用更强的 storyboard renderer 展示 `StoryboardTable`。
- Cut 可用 timeline cue renderer 展示字幕/旁白/音效。
- Model 可用模型预览 renderer 展示 model refs。

Renderer registration 同样归属于 Capability Protocol 的 artifact facet。通用 renderer 可以常驻或 eager injection；大型领域 renderer 应 lazy injection，并在缺失时回退到通用 placeholder / diagnostic。

---

## 六、Agent 生成与协议膨胀控制

### 6.1 Agent 只支持协议内核

Agent 不应内置支持所有领域协议。Agent 核心只稳定支持：

```text
CompositeArtifact
GenericTable
MediaRef / ResourceRef
Diagnostics
SuggestedActions
Capability discovery
Validation dispatch
Renderer dispatch
Adapter dispatch
Approval gate
ExecutionSummary
```

Agent 收到未知 profile 时：

1. 如果有 validator，先校验。
2. 如果有 renderer，渲染。
3. 如果有 projector/capability，显示可执行动作。
4. 如果缺少支持，只显示摘要、原始 JSON 或诊断，不执行副作用。

### 6.2 Agent 生成复合协议数据

Agent 输出不应只生成 Markdown 表，也不应只生成 `StoryboardTable`。更合理的是：

```text
简短说明文本
CompositeArtifact
  ├─ GenericTable
  ├─ media/gallery/comparison blocks
  ├─ optional domain payload
  ├─ diagnostics
  └─ suggestedActions
```

comic-to-animation 示例：

```text
CompositeArtifact(profile="comic-to-animation-plan")
  blocks:
    - table(profile="comic-shot-plan")
    - table(profile="comic-shot-asset-prep")
    - gallery(role="source-panels")
    - domain(kind="storyboard-table", payload=StoryboardTable)
```

Agent 生成时不得：

- 嵌入二进制、base64、blob URL、webview URI 或私有 cache path。
- 声称未执行的生成结果已经生成。
- 跳过 validator。
- 直接写 Canvas/Cut。
- 绕过用户确认执行昂贵或破坏性动作。

### 6.3 Agent Webview Transfer

`@neko/agent-types` 需要为 `CompositeArtifact` 增加 webview / plugin transfer 适配，但该层只负责序列化、投递、恢复和展示消息类型，不拥有 artifact 领域语义。

transfer 规则：

- 小型 artifact 可以作为完整 snapshot 随 `toolResult` / `toolResultBackfill` 投递。
- 大型 artifact 应以 `artifactId` + manifest + block summaries 投递，具体 block payload 通过按需读取或分页消息加载。
- media/gallery/comparison block 只传 stable refs 和 metadata，不传二进制或 webview URI。
- Webview 重建后，应通过与 `adr-agent-async-task-lifecycle.md` 一致的投影源恢复 artifact snapshot 或 block cursor。
- 后台任务完成后生成的 artifact，应通过 backfill message 合并到既有 conversation，而不是依赖初始 tool result 一次性送达。

建议新增 transfer 事件族：

```text
artifactSnapshot
artifactBlockPage
artifactBackfill
artifactExecutionSummary
```

P1 实施时应优先把这些事件作为现有 `toolResult` / `toolResultBackfill` 的 artifact payload 子类型承载，避免让 Webview 同时维护两套消息合并路径。只有当 artifact 需要跨 conversation、跨工具调用或独立于工具生命周期存在时，才提升为独立顶层 postMessage 类型。

这些事件只承载 `CompositeArtifact` / block payload / summary 的传输语义；执行动作仍必须回到 capability provider 和 approval gate。

---

## 七、操作模型

### 7.1 操作分层

协议支持的操作分为四类：

| 操作类型 | 示例 | 是否副作用 |
|---|---|---|
| view | 排序、筛选、分组、展开、选择 | 否 |
| review | 批注、确认、驳回、标记缺失 | 通常否，可写审阅状态 |
| transform | 投影成 `StoryboardTable`、prompt、Cut payload | 否或低风险 |
| execute | 发送 Canvas、写 Cut、生成图片/视频/TTS、替换内容 | 是 |

`execute` 必须经过：

```text
validate artifact
  -> resolve adapter/projector
  -> resolve capability provider
  -> approval gate
  -> provider execute
  -> execution summary
```

### 7.2 Capability Registry

子包真实能力必须动态注册和发现：

```typescript
interface ArtifactCapabilityRegistration {
  readonly capabilityId: string;
  readonly packageId: string;
  readonly accepts: readonly string[];
  readonly produces?: readonly string[];
  readonly actions: readonly string[];
  readonly risk: 'low' | 'medium' | 'high' | 'destructive';
  readonly requiresApproval: boolean;
  readonly minVersion?: string;
}
```

Canvas 示例：

```json
{
  "packageId": "neko-canvas",
  "renders": ["CompositeArtifact", "GenericTable"],
  "accepts": ["StoryboardTable", "CanvasStoryboardPayload"],
  "actions": ["canvas.importStoryboard", "canvas.createTableNode"],
  "projectors": ["storyboard.toCanvasPayload"]
}
```

Cut 示例：

```json
{
  "packageId": "neko-cut",
  "renders": ["GenericTable", "timeline-cue-table"],
  "accepts": ["StoryboardTable", "CutStoryboardPayload"],
  "actions": ["cut.importStoryboard", "cut.appendClips"],
  "projectors": ["storyboard.toCutPayload"]
}
```

### 7.3 Protocol Registry

协议支持也必须注册：

```typescript
interface ArtifactProtocolRegistration {
  readonly artifactKind: string;
  readonly profile?: string;
  readonly schemaVersion: number;
  readonly validatorId: string;
  readonly renderers?: readonly string[];
  readonly projectors?: readonly string[];
}
```

它回答：

- 这是什么 artifact？
- 用哪个 validator 校验？
- 用哪个 renderer 展示？
- 可投影为哪些领域 payload？
- 不支持时如何诊断？

---

## 八、与 `EditOperation` 的区别

`CompositeArtifact` / `GenericTable` / `StoryboardTable` 和 `EditOperation` 不是替代关系。

| 概念 | 角色 |
|---|---|
| `CompositeArtifact` | 结构化产物信封：这是什么、有哪些 blocks、有哪些诊断和建议动作 |
| `GenericTable` | 展示和审阅动态表 |
| `StoryboardTable` | 分镜领域语义计划 |
| `EditOperation` | 已确认的确定性编辑操作，可 `apply` / `invert` / `undo` |

最佳关系：

```text
CompositeArtifact
  -> suggestedAction
  -> Capability Adapter
  -> EditOperationPlan 或 domain command payload
  -> approval
  -> apply EditOperation / execute provider
  -> ExecutionSummary
  -> 回写 artifact 状态
```

不要用 `EditOperation` 表达计划，也不要用 `GenericTable` 替代 `EditOperation`：

- 计划阶段需要候选、诊断、审阅、多模态预览和缺能力降级。
- 已确认编辑需要确定性 apply/invert、undo/redo、审计和状态同步。

一句话：`CompositeArtifact` 表示“想做什么、为什么、有哪些选项”；`EditOperation` 表示“现在确定要怎么改，并且能撤销”。

---

## 九、Skill 定制边界

### 9.1 Profile 管理方式

Profile 描述的是产物结构约束，而不是任务执行方法。它可以定义：

- `GenericTable` 的列、单元格类型、必填规则和默认视图。
- `CompositeArtifact` 的推荐 blocks 组合。
- 可选的校验规则、显示建议、字段映射和 suggested actions。
- 与某个 Skill 相关的输出 profile，例如 `comic-shot-asset-prep`。

Profile 默认跟随 Skill 就近管理：

```text
comic-to-animation/
  SKILL.md
  skill.json
  profiles/
    comic-shot-plan.profile.json
    comic-shot-asset-prep.profile.json
    comic-dialogue-map.profile.json
```

当一个 profile 被多个 Skill 复用，或需要稳定版本、统一校验、跨子包展示时，应提升为共享 Profile Descriptor，并注册到 protocol/profile registry：

```json
{
  "profileId": "comic-shot-asset-prep",
  "protocol": "GenericTable",
  "version": 1,
  "columns": [
    { "id": "shotId", "type": "text", "required": true },
    { "id": "sourcePanel", "type": "mediaRef", "required": true },
    { "id": "cleanPlateRequired", "type": "boolean" },
    { "id": "maskRequired", "type": "boolean" },
    { "id": "depthRequired", "type": "boolean" },
    { "id": "motionPlan", "type": "markdown" }
  ],
  "suggestedActions": [
    "project.toStoryboard",
    "canvas.createTableNode"
  ]
}
```

Pre-1.0 轻量版本策略：

- `CompositeArtifact` / `GenericTable` 必须保留 `schemaVersion`，用于阻止不匹配 schema 被静默解析。
- 共享 Profile Descriptor 保留 `version`；持久化 artifact 应保存 `profile` 与 `profileVersion`。
- 临时 chat artifact 可以省略 `profileVersion`，由当前 Skill-local profile 校验；一旦写入项目、Canvas、Cut、Dashboard 或长期任务记录，应补齐版本。
- 项目未上线前不维护多版本 validator 或完整兼容矩阵；breaking change 可以提升 `version`，旧 artifact 只读降级、丢弃重建或通过显式 migrator 生成新 artifact。
- validator 遇到不支持的 `schemaVersion` / `profileVersion` 应产生诊断，不能静默套用最新 descriptor。
- renderer 不负责版本迁移，不能在展示时隐式改写旧数据。

公共命名策略：

- Neko 自有且尚未出现并存不兼容版本的协议，公共类型名、registry id、Skill metadata 和 domain kind 使用无版本名称，例如 `CompositeArtifact`、`GenericTable`、`StoryboardTable`。
- 持久化版本由 `schemaVersion` / `profileVersion` 字段表达；跨 Webview、任务 backfill、文件和子包边界时只能依赖这些字段判断兼容性。
- `FooV1` / `FooV2` 后缀只在多个不兼容版本必须同时存在、迁移函数需要区分精确变体，或外部 API 已经定义版本化名称时使用。未来是否出现 `CompositeArtifactV2` 由实际 breaking change 决定，不作为默认路线。

因此三者边界是：

```text
Skill = 做什么、怎么做、何时调用能力
Profile = 输出什么结构、有哪些字段、如何校验、如何展示
Capability = 系统实际能执行什么
```

Profile 不应成为另一种运行时 Skill。原因是 Skill 具有任务流程、推理倾向和编排语义；Profile 只是结构、校验和展示约束。把 Profile 也做成 Skill 会让 Agent 同时面对“执行方法”和“数据结构”两类可组合单元，增加选择歧义，并可能误导用户认为新增 profile 就等于新增子包执行能力。

### 9.2 Skill 可以影响什么

Skill 可以定制：

- Agent 选择什么协议输出。
- 表结构怎么组织。
- 哪些字段更重要。
- 何时建议调用哪个能力。
- 生成时的风格、顺序、判断标准。
- 是否先停在审阅阶段。
- 输出哪些 `suggestedActions`。
- 需要哪些 validator、adapter、capability。

示例 manifest：

```json
{
  "producedArtifacts": ["composite-artifact", "generic-table"],
  "artifactProfiles": ["comic-shot-asset-prep"],
  "validationRequirements": ["GenericTable"],
  "referencedCapabilities": ["canvas.importStoryboard"],
  "suggestedProjectors": ["comicAssetPrep.toStoryboard"]
}
```

Skill Markdown 可以描述：

```markdown
## Output Table Profile: comic-shot-asset-prep

Columns:
- shotId
- sourcePanel
- cleanPlateRequired
- maskRequired
- depthRequired
- keyframePlan

先输出 GenericTable 供用户审阅。只有当用户确认进入正式分镜制作时，才投影或输出 StoryboardTable。
```

### 9.3 Skill 不能影响什么

Skill 不能：

- 动态提升子包支持程度。
- 让 Canvas/Cut 执行未注册协议。
- 绕过资源引用校验。
- 绕过审批门。
- 发明新的稳定资源引用格式。
- 直接调用未授权副作用能力。
- 让子包解析 Skill Markdown 作为执行依据。
- 让 Profile 注册未授权 capability 或代替 provider 执行副作用。

子包支持程度必须来自确定性注册：

```text
canvas.registerArtifactSupport(...)
cut.registerArtifactSupport(...)
media.registerGenerationCapability(...)
```

Skill 只能引用这些能力。能力缺失时，Agent 必须保留可审阅 artifact，并显示缺失能力诊断。

---

## 十、多模态数据支持

通用协议必须面向多模态，而不是只面向表格。

### 10.1 支持目标

| 模态 | 通用协议处理 |
|---|---|
| 文本 | `text` block、Markdown 摘要、诊断说明 |
| 表格 | `GenericTable` |
| 图片 | stable media/resource refs + preview renderer |
| 视频 | video refs + clip/timeline metadata |
| 音频 | audio refs + cue / waveform / TTS metadata |
| 3D / Model | model refs + preview/scene metadata |
| 多候选 | gallery / comparison block |
| 状态与诊断 | artifact diagnostics、row diagnostics、capability diagnostics |

### 10.2 渲染边界

持久数据只保存稳定引用；webview-safe URI 只存在于渲染适配层。

```text
persisted artifact
  -> ResourceRef / GeneratedAssetRef / tool-result locator
host adapter
  -> webview.asWebviewUri(...)
webview renderer
  -> img/video/audio/model preview
```

任何 block 或 table cell 都不得持久化 webview URI、blob URL、base64 或私有 cache path。

### 10.3 与 `PerceptionCard` / `CompositeBlock` 的关系

`adr-agent-multimodal-perception.md` 中的 `PerceptionCard` 是 Asset -> AgentObservation 路径的感知中间产物；本 ADR 的 `CompositeArtifact` 是 Agent -> User / Subpackage 路径的结构化产物。两者不应合并：

```text
Asset / Tool Result
  -> PerceptionCard
  -> Agent reasoning / context compression
  -> CompositeArtifact
  -> review / projector / capability execution
```

边界：

- `PerceptionCard` 描述资产的结构、语义证据、缩略图、波形、多视图等感知结果。
- `CompositeArtifact` 描述面向任务的计划、表格、候选、诊断和建议动作。
- artifact block 可以引用 `PerceptionCard` 的 stable asset refs 或摘要，但不内嵌完整 perception pipeline 状态。
- `CompositeBlock` 若作为富内容展示概念存在，应在实现时明确是否是 renderer 层 view model；若是 view model，不应成为持久 artifact schema 的同义词。

例如 comic-to-animation 中，漫画图片的 panel 检测、视觉描述和候选边界可先形成 `PerceptionCard` / observation；Agent 再把它们投影成 `GenericTable(profile="comic-shot-plan")` 和 `gallery(role="source-panels")`。

---

## 十一、实施阶段

### P0：OpenSpec 与契约

- 创建 `introduce-composite-artifact-table-protocol` change。
- 在 `@neko/shared` 定义 `CompositeArtifact`、`GenericTable`、artifact diagnostics、artifact actions、protocol/capability registration DTO。
- 定义 Profile Descriptor 契约，支持 Skill-local profile 与共享 profile registry 两种来源。
- 定义 pre-1.0 轻量版本规则：保留 `schemaVersion` / Profile Descriptor `version` / 持久化 artifact `profileVersion`，但不实现多版本兼容矩阵。
- 明确 block type 与 cell type 为当前版本封闭基础词表，未知类型必须降级渲染且禁用执行。
- 明确 `json` cell 的 bounded validation 与 `schemaRef` 策略，避免通用 validator 承担完整领域 schema 引擎职责。
- 将 artifact registry 设计为 `adr-capability-protocol.md` 的 typed facets，而不是并行 registry。
- 与当前 Skill catalog / SDD metadata 变更对齐：若该分支尚未合入，P0 需要预留或合并 `producedArtifacts`、`artifactProfiles`、`referencedCapabilities`、`suggestedProjectors` 等 manifest 字段。
- 添加纯 validator 和序列化测试。

### P1：Agent 富内容

- 扩展 Agent composite parser/presenter，支持 `CompositeArtifact` 与 `GenericTable`。
- 保留 `storyboard-table` legacy/semantic 兼容路径；`neko-composite` 旧 rich-content adapter 可以把 `CompositeArtifact` 中的 `domainKind="StoryboardTable"` block 投影成现有 storyboard 展示模型，但该 adapter 只负责展示桥接，不授予执行能力。
- 未知 profile 显示 bounded diagnostic，不暴露执行动作。
- 扩展 `@neko/agent-types` transfer，支持 artifact snapshot、block page、backfill 和 execution summary。
- 优先将 artifact transfer 作为 `toolResult` / `toolResultBackfill` 的子 payload 集成；只有跨工具生命周期场景才提升为顶层 postMessage。
- 对齐 `adr-agent-async-task-lifecycle.md` 的投影源恢复策略，覆盖 Webview 重建后的 artifact 恢复。

### P2：Registry 与能力发现

- 在 Capability Protocol Registry 下增加 artifact protocol/profile/renderer/projector/capability facets 的共享类型和最小实现。
- 将现有 `StoryboardTable -> CanvasStoryboardPayload` 和 `StoryboardTable -> Cut payload` 注册为第一批 projector。

### P3：子包定向支持

- Canvas 支持通用表轻量渲染或 TableNode；执行仍走 storyboard adapter。
- Cut 支持 shot/cue 表预览；执行仍走 Cut import adapter。
- Story/Dashboard 可消费通用表作为审阅/管理视图。

### P4：Skill 验证场景

- 新增或改造 `comic-shot-asset-prep` focused skill。
- 用 `GenericTable(profile="comic-shot-asset-prep")` 验证动态表、媒体 refs、建议动作、缺 adapter 降级。
- 验证 Skill-local profile 可被 Agent 读取和校验；共享 Profile Descriptor 可被多个 Skill 引用。

### P5：质量门禁

- 测试未知 profile 降级。
- 测试未知 block type / cell type 降级，且不会暴露 execute action。
- 测试缺 provider 禁用执行。
- 测试 unsafe resource ref 被诊断和阻断。
- 测试 Skill 不能注册未授权 capability。
- 测试通用表投影到 storyboard 时字段映射可验证。
- 测试大型 artifact 分页投递、backfill 合并和 Webview 重建恢复。
- 跟踪 block page runtime loader/request/back-pressure：当 当前版本先落地 transfer DTO 时，后续必须补齐按需加载、游标请求、重复页合并和背压策略的端到端测试。
- 跟踪 execution summary 生命周期端到端测试：覆盖 `succeeded`、`failed`、`partial`、`cancelled`、`unavailable`，并验证 Webview 重建后 terminal 状态可恢复。
- 测试 `PerceptionCard` 引用可被 artifact block 消费，但不会把完整 perception 状态内嵌进 artifact。

---

## 十二、风险与缓解

| 风险 | 缓解 |
|---|---|
| 协议过大，Agent 核心膨胀 | Agent 只支持协议内核；领域能力通过 registry 懒加载 |
| 通用表被误用为可执行命令 | execute 必须经过 adapter/capability/approval |
| Skill 动态发明能力 | Skill 只能引用 registry 中存在的能力 |
| 子包重复实现表格渲染 | 提供共享基础 renderer，子包只做领域增强 |
| 多模态资源泄漏 | 持久协议只保存 stable refs，渲染时解析 URI |
| 新表 profile 仍需改代码 | 常规表只需 Skill + manifest；只有新副作用能力才改 provider |
| Profile 被误认为 Skill 或能力 | Profile 只描述结构和校验；执行能力必须来自 capability/provider registry |
| registry 机制膨胀 | artifact registry 作为 Capability Protocol typed facets，不新增并行发现地基 |
| block / cell 开放性导致渲染不可控 | 当前版本采用封闭基础词表；未知类型降级展示并禁用执行 |
| artifact 过大导致 webview 投递或恢复失败 | 支持 snapshot + block page + backfill，并复用任务投影恢复策略；若先实现 DTO，后续补齐运行时分页 loader/request/back-pressure |
| artifact 执行动作状态不一致 | execution summary 必须作为执行后的唯一状态回写入口，并用端到端测试覆盖成功、失败、部分成功、取消和不可用 |
| 与 `PerceptionCard` 语义重叠 | `PerceptionCard` 是感知中间产物；`CompositeArtifact` 是面向任务的结构化产物 |
| Profile 升级改变旧 artifact 语义 | 持久化 artifact 固定 `profileVersion`；pre-1.0 不支持版本时只读降级或显式重建 |
| `json` cell 变成万能嵌套协议 | 当前版本仅做 bounded validation；复杂结构用 `schemaRef` 或领域 payload validator |
| 旧 storyboard 链路回归 | `StoryboardTable` 和现有 Canvas/Cut projector 保持兼容 |

---

## 十三、验收标准

1. Agent 能渲染一个不属于 `storyboard-table` 的 `GenericTable`。
2. Agent 能显示未知 profile 的诊断，而不是崩溃或伪造动作。
3. Canvas/Cut 只有在注册 adapter/capability 后才显示执行动作。
4. `StoryboardTable` 仍能投影到 Canvas/Cut，现有分镜闭环不退化。
5. Skill 可以通过 Markdown + manifest 定义新表 profile，并让 Agent 生成通用表。
6. Skill 不能让未注册子包能力变为可执行。
7. 多模态资源引用只保存 stable refs，不保存 webview/runtime/private cache 数据。
8. 需要副作用的操作必须经过审批门和执行 summary 回写。
9. Artifact registry 能通过 Capability Protocol Registry 查询，不要求 Agent 维护并行注册表。
10. Profile validator 能阻断列、cell type、资源模态或 suggested action 不符合 profile descriptor 的表。
11. Webview 重建后能恢复 artifact snapshot 或 block cursor，不丢失后台任务 backfill。
12. `PerceptionCard` 可作为 artifact 的来源引用或摘要来源，但不会被当作 artifact block schema 的替代品。
13. 持久化旧 artifact 按其声明的 `profileVersion` 校验；缺失 descriptor 或版本不支持时只读降级，不套用最新 profile。
14. `json` cell 的嵌套结构不会绕过 `schemaRef` / profile validator 触发 projector 或 execute action。

---

## 十四、一句话结论

通用协议负责流通和审阅，领域协议负责语义，adapter 负责确定性转换，provider 负责真实执行，Agent 负责动态编排，Skill 负责引导而不是扩权。
