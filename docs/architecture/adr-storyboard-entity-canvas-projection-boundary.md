# ADR: Storyboard、统一实体与 Canvas 实体引用边界

**状态**: Proposed (2026-06-10)
**范围**: `@neko/shared` · `neko-agent` · `neko-canvas` · `neko-entity` · `neko-dashboard` · `neko-story` · `neko-sketch` · `neko-model` · `neko-puppet`
**关联**: `adr-agent-storyboard-table-schema.md` · `adr-unified-entity-memory-semantic-index.md` · `creative-entity-asset-composition.md` · `adr-comic-to-animation-image-prep.md` · `adr-canvas-artifact-reference-resolution.md` · `story-agent-canvas-boundary.md`

---

## 一、背景

`comic-to-animation` 已经能把漫画、分镜图或文档素材推进到结构化分镜、图像准备、Canvas 审阅和 Cut 组装链路。这个流程中会同时出现两类容易混淆的数据：

- `StoryboardTable`：镜头级语义计划，描述场景、镜头、角色出场、动作、对白、声音、媒体引用和生成策略。
- 统一实体与人物形象：描述"这个角色是谁"、候选身份、长期人物记忆、视觉表现、资产绑定和确认状态。

当前代码已经具备若干基础：

- `StoryboardShotCharacter` 支持 `characterId`、`entityRef`、`appearanceNotes`、`continuityNotes`。
- `projectStoryboardTableToCanvasPayload()` 会把 shot characters 投影到 `CanvasStoryboardPayload`。
- `ShotCanvasNode.data.characters` 支持 `entityRef`、`referenceNodeId`、`appearanceNotes` 和 `continuityNotes`。
- Canvas 注册了 `entity`、`representation-slot`、`occurrence`、`generated-asset` 节点类型。
- `neko-agent` 会扫描 `EntityMemoryContribution`，并调用 `neko.entity.processMemoryContribution`。
- `neko-entity` 默认以 `candidate` 模式处理 Agent 贡献：匹配已有实体、合并开放候选或创建候选，不自动确认。
- Dashboard 已具备实体管理框架、候选审阅能力和部分 binding 生命周期操作：表格 + 详情面板 + 5 维过滤 + orphan binding 单条操作；仍有 5 个写操作 stub 需要补齐（详见 §2.4 审计）。

但这些能力还没有形成一个明确的产品边界：Agent 是否应在发送 storyboard 时同时添加实体？Canvas 是否需要独立的实体节点？创作工具生成的形象如何就地关联到实体？

---

## 二、当前实现判断

### 2.1 Agent 是否同时添加实体和 storyboard？

当前不是一个原子动作。

Agent 可以在同一轮输出里同时产生：

- `StoryboardTable` 或可投影到 storyboard 的 `CompositeArtifact`。
- `EntityMemoryContribution` / `CharacterObservation`。

但运行时处理分为两条链路：

```text
StoryboardTable
  -> projectStoryboardTableToCanvasPayload()
  -> CanvasStoryboardPayload
  -> neko.canvas.importStoryboard
  -> scene / shot 节点

EntityMemoryContribution
  -> observeEntityMemoryContributionAutomation()
  -> neko.entity.processMemoryContribution(mode = "candidate")
  -> matched-existing / matched-candidate / created-candidate
```

因此，Agent 当前可以"同时贡献 storyboard 与实体候选信息"，但不会在同一个动作里同时正式添加 confirmed entity 和 Canvas entity graph。

### 2.2 当前 Canvas 是否支持实体？

截至 2026-06-10 代码更新后，Canvas 已从契约级/占位级支持推进到 **shot 内联实体引用可用**，但仍不是完整实体工作台。

Canvas 已具备：

- `entity`、`representation-slot`、`occurrence`、`generated-asset` 注册节点类型。
- `ShotCanvasNode` 可保存 `characters[].entityRef`。
- `ShotCharacter.candidateId` 可保存候选回填稳定键。
- `ShotCanvasNode` 可保存 `characterCandidates`、`visualOccurrences`、`shotImagePrepPlan` 等审阅字段。
- 节点库策略中 `entity` 是 `source-bound`，`representation-slot` / `occurrence` / `generated-asset` 是 `projection-only`。
- Canvas Extension Host entity 消息路由：summary / confirm / inspect。
- candidate confirm 后的 Canvas shot `entityRef` 回填链路：pending retry + entity change 订阅。
- shot 角色行五态展示、lazy summary、确认按钮和 Inspector 入口。
- Hover Entity Card、EntityReferenceActions、ConfirmCandidateButton。

Canvas 仍缺或仍需增强：

- 多候选同名/相似候选的消歧 UI。
- Entity Quick Panel 创作入口（如 [重新生成]、[在 Sketch 中编辑]）。
- Hover Card 视口溢出定位优化。
- Sketch / Model / Puppet / Story 等非 Canvas 工具的 EntityBindingWidget 嵌入和 postMessage 路由。

### 2.3 Storyboard import 当前会创建哪些节点？

`neko.canvas.importStoryboard` 当前通过 `applyStoryboardPayloadToCanvas()` 创建：

- `scene` 容器节点。
- `shot` 子节点。
- shot 间和 scene 间的 sequence connection。

它会把 `characters`、`sourceMediaRefs`、`generatedMediaRefs`、`mediaRefs`、reference image refs 等字段写入 shot data，但不会自动创建：

- `entity` 节点。
- `representation-slot` 节点。
- `occurrence` 节点。
- `generated-asset` 节点。
- confirmed entity 或 entity asset binding。

### 2.4 Dashboard 实体管理能力审计

Dashboard 具备实体浏览、候选审阅和部分 binding 生命周期管理能力，但完整管理能力仍存在缺口。

**已实现（可用）：**

- 表格：kind / status / 缺失素材 / 绑定状态 / 排序 5 维过滤。
- 详情面板：别名、出现位置、资产绑定、需求、视觉草稿、记忆审阅、同步建议的只读展示。
- 候选操作：confirm / reject / dismiss candidate。
- 别名编辑：内联编辑。
- 记忆审阅：accept / reject / conflict / supersede（但只能审阅状态，不能编辑观察内容）。
- orphan binding 单条操作：archive-binding / cleanup-suggested-orphan / rebind-orphaned-binding。
- 角色对话 / NPC 测试：委托给 Agent。
- 多源聚合：neko-entity 和 neko-story 各自提供 `DashboardCreativeEntitySource`，Dashboard 聚合展示。

**声明但未实现（stub，返回 "Unsupported action"）：**

| 操作 | 状态 | 服务层 API |
|------|------|-----------|
| 绑定资产（bind-existing） | stub | `upsertBinding` 已有 |
| 审阅视觉草稿（review-drafts） | stub，只显示 prompt 和数量，看不到图片 | `upsertVisualDraft` 已有 |
| 处理素材需求（handle-requirement） | stub | 无直接 API |
| 生成素材（generate-material） | stub | 无直接 API |
| 导入素材（import-material） | stub | 无直接 API |

**仍需明确产品路径：**

| 操作 | 状态 | 说明 |
|------|------|------|
| 定位绑定源文件（locate-binding-source） | 明确错误返回 | 需要资产选择器 / reveal 能力 |
| 同步建议（apply/ignore-sync-suggestion） | 需复核 | 若继续保留，应补齐 API 或从 Dashboard action 中移除 |

**完全缺失：**

| 操作 | 服务层支持 | Dashboard UI |
|------|-----------|-------------|
| 从零创建实体（非候选确认） | `createEntity` 已有 | 无入口 |
| 重命名实体 | `renameEntity` 已有 | 无入口 |
| 合并实体 | `mergeEntities` 已有 | 无按钮/对话框 |
| 关系管理 | 无 API，字段永远为空数组 | 无 |
| 编辑元数据 | `updateMetadata` 已有 | 只读展示 |
| 生命周期管理（废弃/恢复） | `deprecateEntity` / `reactivateEntity` 已有 | 无入口 |
| 批量操作 | N/A | 无多选、无批量确认/标记 |
| 编辑记忆观察内容 | 无直接 API | 只能审阅状态 |

**结论：Dashboard 当前是实体浏览器 + 候选审阅器，不是完整管理工作台。完整管理需要逐步补齐 stub 和缺失功能。**

### 2.5 创作工具与实体系统的断裂

当前每个创作工具的产出需要**离开创作现场**才能关联到实体：

| 创作动作 | 当前流程 | 断裂点 |
|----------|---------|--------|
| Agent 生成角色立绘 | Agent 生成 → VisualIdentityDraft → Dashboard 审阅 → 选择 → 绑定 | 审阅和绑定需要离开 Agent |
| Sketch 画角色 | Sketch 画图 → 保存文件 → Dashboard 手动创建 binding | 画完后没有自动关联到实体 |
| Model/Puppet 绑定角色 | 编辑 → 导出 → Dashboard 手动绑定 live2d/live3d role | 同上 |
| Story 定义角色 | 写角色页 → 解析出 candidate → Dashboard 确认 | 确认需要切换 |
| Canvas 分镜出现新角色 | Shot 写 characterName → 无自动候选 | 名字和实体不关联 |
| NPC 测试结束 | 评估报告在 Agent 中显示 → 改进建议需手动操作 | 反馈不自动回流实体 |

---

## 三、架构决策

### 3.1 决策摘要

**Storyboard 和人物形象不强绑定。Canvas 不投影实体子图，而是在 shot 内联引用实体并就地预览。实体管理留给 Dashboard，创作工具通过就地关联协议闭合创作循环。**

`StoryboardTable` 表达"镜头里需要谁、发生什么、引用哪些素材和证据"；统一实体表达"这个角色是谁、哪些形象/声音/模型代表它、哪些事实已确认"。二者通过 `CreativeEntityRef`、candidate id、asset refs 和 shot 内联引用组合，而不是相互拥有。

关键决策：

1. `StoryboardTable` 不拥有 confirmed character identity，也不拥有最终人物形象绑定。
2. `StoryboardTable.characters[].entityRef` 是引用字段；没有 `entityRef` 时只能表示名字和镜头内提示。
3. `EntityMemoryContribution` 是实体候选和人物记忆的贡献入口，不是 storyboard import 的副作用。
4. `neko.canvas.importStoryboard` 只负责 storyboard 节点导入，不负责确认实体事实。
5. **Canvas 不需要独立的 entity/representation-slot/occurrence/generated-asset 投影节点。** 实体信息通过 shot 角色行内联展示 + 悬停/点击预览 + 侧边栏面板呈现。
6. **不需要独立的实体管理 Webview。** Dashboard 是实体管理的正确架构位置，补齐 stub 后即可覆盖全部管理需求，新建 Webview 会重复 Dashboard 的框架职责。
7. **创作工具应在自己的上下文中完成实体关联，不要求用户离开去另一个地方操作。** 统一的 EntityBindingWidget 协议嵌入每个创作工具。
8. 人物确认必须进入 `neko-entity` / Dashboard / source-approved review flow，不由 Canvas 静默写入 confirmed facts。
9. 已有角色图像应优先绑定到已有实体或候选，不能盲目创建新实体、新角色卡或重复图片节点。
10. Dashboard 从"实体操作的唯一入口"转变为"总览 + 复杂操作兜底"，日常创作流程中的轻量操作在各工具内就地完成。

### 3.2 为什么不投影 entity 节点到 Canvas

ADR 早期版本设计了 4 种 Canvas entity 投影节点（entity / representation-slot / occurrence / generated-asset），经评审后移除。原因：

1. **Shot 节点已内联展示角色信息。** `ShotCanvasNode.data.characters[]` 已包含 characterName / entityRef / role / emotion / appearanceNotes / continuityNotes。再投影 entity 节点是重复表达。

2. **一个角色会变成多个节点。** 1 entity + N representation-slots + M occurrences + K generated-assets = 一个角色可能产生十几个节点。10 个角色就是上百个投影节点，Canvas 从分镜工作台退化为实体关系图数据库。

3. **实体管理是目录式工作，不是空间布局。** "这个角色有哪些形象、哪些绑定、哪些候选"适合表格 + 详情面板（Dashboard 已有），不适合空间节点排列。

4. **与 Canvas 定位矛盾。** ADR 原则是"Canvas 是视觉工作台，不是事实源"，但投影实体子图恰恰把 Canvas 变成了实体关系的空间镜像。

5. **投影器复杂度高、收益低。** 需要稳定 key 幂等 upsert + 去重 + 4 种节点渲染器 + 5 种连接类型，但用户在 Canvas 上真正需要的只是"这个镜头里有谁、长什么样"。

替代方案：shot 角色行增强 + Hover Entity Card + Entity Quick Panel + Dashboard 深链跳转。信息量相同，画布噪声为零，实现成本显著降低。

### 3.3 为什么不需要独立的实体管理 Webview

Dashboard 已经具备实体管理的框架能力（表格 + 详情面板 + 多源聚合 + 过滤排序），虽然部分操作尚为 stub（§2.4），但正确方向是**补齐 Dashboard 而非新建 Webview**：

1. **架构位置正确。** Dashboard 已有列表/过滤/搜索/详情布局和多源聚合机制，新 Webview 需要从头重建这些框架。
2. **服务层 API 齐备。** `CreativeEntityService` 已提供 createEntity / renameEntity / mergeEntities / upsertBinding / upsertVisualDraft 等全套 API，Dashboard 只需接入 UI。
3. **减少认知负担。** VSCode 标签页已经很多，再加一个实体管理标签不如在已有 Dashboard 中扩展。

实体创作的另一个缺口是"创作工具产出后需要离开现场才能关联实体"（§2.5）。这个缺口通过就地关联协议（§六）解决，不需要新 Webview。

Dashboard 需要补齐的能力见 §11.2 的剩余缺口表。

### 3.4 架构三问

1. **是否符合现有架构？**

   符合。该方案延续现有职责划分：Agent 做语义提取和编排，StoryboardTable 做镜头计划，Canvas 做视觉工作台（shot 内联引用实体而非投影实体子图），`neko-entity` 做实体生命周期，Dashboard 做聚合审阅和复杂管理。新增的 EntityBindingWidget 是跨工具的轻量协议，不破坏任何已有边界。

2. **如何进一步降低耦合？**

   将三个动作拆开：

   - `entity.processMemoryContribution`：处理实体候选和人物观察。
   - `canvas.importStoryboard`：导入 scene / shot。
   - 各创作工具在产出时通过 EntityBindingWidget 就地关联实体，不需要集中式投影器。

   Agent 只编排前两个能力，不直接依赖 Canvas 或 Entity 内部实现。

3. **是否易于扩展与测试？**

   易于扩展。后续可以分别测试：

   - `StoryboardTable -> CanvasStoryboardPayload` 纯投影。
   - `EntityMemoryContribution -> candidate/match` 自动化。
   - Shot 角色行展示 + Hover Card 数据获取。
   - EntityBindingWidget 在各工具中的集成。
   - candidate confirm 后 shot entityRef 回填。
   - 已有角色图像的绑定、复用和冲突诊断。

---

## 四、推荐工作流

### 4.1 Agent 生成阶段

```text
Comic / document / image evidence
  -> perception / OCR / panel / visual occurrence
  -> StoryboardTable
  -> EntityMemoryContribution
  -> ShotImagePrepPlan
```

Agent 应输出可审阅 artifact，而不是直接写长期事实：

- `StoryboardTable` 保存 shot 语义和角色出场。
- `EntityMemoryContribution` 保存候选角色、别名、外观观察、证据来源。
- `ShotImagePrepPlan` 保存图像准备和生成引用需求。

### 4.2 实体候选阶段

```text
EntityMemoryContribution
  -> resolve existing entity by name / aliases / kind
  -> resolve open candidate
  -> propose candidate if no match
  -> return decisions
```

默认行为应保持 `candidate`：

- 已有实体：返回 `matched-existing` 和 `entityRef`。
- 已有候选：返回 `matched-candidate`。
- 无匹配：返回 `created-candidate`。
- 不自动确认，除非进入显式 source-approved flow 并满足置信度策略。

### 4.3 Storyboard 导入阶段

```text
StoryboardTable
  -> CanvasStoryboardPayload
  -> scene / shot nodes
```

导入时只写入 shot 级引用：

- `characters[].characterName`
- `characters[].entityRef`
- `characters[].appearanceNotes`
- `characters[].continuityNotes`
- `sourceMediaRefs`
- `generatedMediaRefs`
- `referenceResourceRef`

不要在此阶段创建或确认实体。

### 4.4 执行顺序

```text
entity.processMemoryContribution
  -> canvas.importStoryboard（P0 闭环路径必须先拿到 contribution 结果或明确超时）
```

`canvas.importStoryboard` 可以独立完成 scene / shot 导入，但 **Agent 一键发送到 Canvas 的 P0 闭环路径不应盲目并行导入**。`StoryboardDeliveryService` 必须先等待 `processMemoryContribution` 结果或明确超时，再组装 `CanvasStoryboardPayload`：

- contribution 已返回 `matched-existing`：导入 payload 中写入 `characters[].entityRef`。
- contribution 已返回 `created-candidate` / `matched-candidate`：导入 payload 中写入 `characters[].candidateId`。
- contribution 超时或失败：允许降级导入，仅写 `characterName`，但此时系统不能承诺后续自动 confirm 回填，只能通过手动关联或显式 candidateId 回写 pass 恢复闭环。

**稳定映射问题**：confirm 后回填依赖从 candidateId 定位到 shot 中的具体 character，只靠 `characterName` 匹配在同名角色场景下不可靠。该历史缺口已在 2026-06-10 代码更新中关闭：`ShotCharacter` 已具备 `candidateId` 字段，`StoryboardDeliveryService` 可在导入 payload 中注入候选稳定键。

**契约状态**：`ShotCharacter.candidateId` 是已落地的可选字段，必须保持为 confirm 回填的稳定关联键：

```typescript
export interface ShotCharacter {
  characterName: string;
  entityRef?: CreativeEntityRef;
  candidateId?: string;  // 导入时从 contribution 结果写入，confirm 后用于定位回填
  // ... 其余字段不变
}
```

导入时行为：
- 如果 `processMemoryContribution` 返回了 `created-candidate` 或 `matched-candidate`，将 candidateId 写入对应 `ShotCharacter.candidateId`。
- 如果返回 `matched-existing`，直接写入 `entityRef`，`candidateId` 留空。
- 如果 contribution 尚未完成或失败，两者均留空；后续仅能通过显式 candidateId 回写 pass、手动关联或重新导入补齐，不能依赖 confirm event 自动定位。

**decision → shot character 映射要求**：

`EntityContributionAutomationDecision` 需要携带足以回写 storyboard 的稳定映射键。优先级为：

1. `storyboardCharacterId` / `StoryboardShotCharacter.characterId`。
2. `shotId + characterId` 或 `shotNumber + characterIndex`（仅限同一 storyboard payload 内）。
3. source provenance（`sourceRef` / panel / frame / page range）。
4. `name` 只能作为最后 fallback，且同名或多候选时必须进入消歧，不得自动写入。

没有稳定映射键时，`StoryboardDeliveryService` 可以导入 storyboard，但必须把该角色标记为 `unlinked/candidate-ambiguous` diagnostic，等待用户在 Hover Card / Quick Panel 中选择。

### 4.5 确认阶段

确认应由 `neko-entity` 或 Dashboard 执行：

```text
candidate / visual draft / asset binding suggestion
  -> user review
  -> confirmCandidate / bindRepresentation / reject / merge
  -> update entity store
  -> shot entityRef 回填（通过 candidateId 精确定位 ShotCharacter）
```

Canvas 可以作为确认入口（通过 Hover Card 或 Quick Panel 就地确认），但确认命令的所有权属于实体服务。

回填路径使用现有的 `CreativeEntityChangeEvent` 契约（不新增顶层字段）：

```typescript
onDidChangeEntity(event: CreativeEntityChangeEvent) {
  if (event.reason === 'confirm-candidate') {
    for (const ref of event.changedRefs) {
      if (ref.kind === 'candidate' && ref.entityRef) {
        // ref.id = candidateId, ref.entityRef = 新确认的实体引用
        updateShotCharacters(
          char => char.candidateId === ref.id,
          { entityRef: ref.entityRef, candidateId: undefined }
        );
      }
    }
  }
}
```

`changedRefs.find(r => r.kind === 'candidate')` 提供 candidateId（`r.id`）和确认后的 entityRef（`r.entityRef`），用于精确匹配 shot 中的 `characters[].candidateId` 并回填。

### 4.6 部分完成与重试语义

这些跨子包步骤不是数据库事务，也不应伪装成跨子包原子事务。

允许出现以下安全的部分完成状态：

| 状态 | 是否安全 | 恢复方式 |
|---|---|---|
| `processMemoryContribution` 成功，`importStoryboard` 未执行 | 安全 | 后续可重新导入 storyboard |
| `importStoryboard` 成功，entityRef/candidateId 尚未回填 | 安全 | 显式 candidateId 回写 pass、手动关联或重新导入 |
| candidate confirm 成功，Canvas 回填失败 | 安全但用户循环未闭合 | 通过 confirm event 重试回填 |

不需要回滚已导入的 storyboard，因为 storyboard 节点本身不写 confirmed entity facts。

### 4.7 Agent 编排透明度

三步拆分（entity contribution → storyboard import → 就地关联）是**系统内部架构边界**，不应增加用户创作复杂度。

**用户视角**：一个手势，一个结果。

```text
用户："帮我把这个漫画转成分镜"
  -> Agent 生成 StoryboardTable + EntityMemoryContribution（一次创作 pass）
  -> 用户看到 artifact：分镜表 + 角色列表
  -> 用户点击 [发送到 Canvas]（一个按钮）
  -> 系统编排完成
```

**系统编排层（用户不感知）**：

```text
[发送到 Canvas] 点击
  ├── ① entity.processMemoryContribution（静默后台，创建/匹配候选）
  ├── ② 组装 CanvasStoryboardPayload（注入 entityRef / candidateId，或超时降级）
  └── ③ canvas.importStoryboard（创建 scene/shot 节点）
```

| 关注点 | 用户可见 | 系统内部 |
|--------|---------|---------|
| 角色候选创建 | 不可见（自动） | `processMemoryContribution` |
| 分镜导入 | 可见（Canvas 出现新 shot） | `importStoryboard` |
| entityRef 回填 | 不可见（shot 角色行自动显示状态） | confirm event listener |
| 候选确认 | 可见（按需，Hover Card 中确认） | `entity.confirmCandidate` |
| 资产绑定 | 可见（按需，EntityBindingWidget） | `entity.upsertBinding` |

**编排职责归属**：

Agent 的 `StoryboardDeliveryService`（或等效 post-processor）负责：

1. 检测 Agent 输出中的 `EntityMemoryContribution`，先发送到 entity service。
2. 等待 contribution 结果（或设置超时），获取 entityRef / candidateId 映射。
3. 将 entityRef / candidateId 注入到 `CanvasStoryboardPayload.characters[]`。
4. 调用 `canvas.importStoryboard`。
5. 如果 contribution 超时或部分失败，仍然导入 storyboard（characterName 兜底），并标记 unlinked / ambiguous diagnostic；后续通过显式 candidateId 回写 pass、手动关联或重新导入恢复闭环。

**不由 Canvas 编排**——Canvas 不知道也不关心 entity contribution 是否完成。它只接收 payload 中已有的 entityRef（可能为空）。

**不由用户编排**——用户不需要"先处理实体，再导入分镜"。一个按钮完成全部。

**独立使用场景**：

Agent 不总是同时产生分镜和实体信息。以下场景各步骤独立触发：

| 场景 | 触发路径 | 用户操作 |
|------|---------|---------|
| "分析这个角色" | 仅 EntityMemoryContribution | 无 Canvas 操作 |
| "导入已有分镜 JSON" | 仅 importStoryboard | 无 entity 处理 |
| "从漫画创建完整分镜" | 两者联合编排 | 一键发送 |
| "给这个角色生成新形象" | 仅 VisualIdentityDraft | 在 Agent 对话中就地选择 |

---

## 五、Canvas 实体引用方案

### 5.1 设计原则

Canvas 中的实体信息通过**三层渐进式引用预览**呈现，而不是投影为独立节点：

- **L0 Shot 角色行增强**：零额外 UI 元素，在已有 shot 角色列表中就地展示实体状态。
- **L1 Hover Entity Card**：悬停触发，轻量浮层，用完即走。
- **L2 Entity Quick Panel**：固定侧边栏，跟随选中 shot 变化，提供更丰富的角色上下文。

### 5.2 L0：Shot 角色行增强

Shot preset 的 `shot-characters-section` 升级：

- confirmed 角色：显示头像缩略图 + 确认徽标 + entityRef 链接。
- candidate 角色：显示候选徽标 + confidence + 消歧入口。
- 未关联角色：仅显示 characterName + "未关联" 状态。
- 缺失素材角色：显示缺失 role 提示（如 portrait ✗ live2d ✗）。

点击角色行的交互：

- 单击：展开 Hover Entity Card。
- 双击或 📌：固定到 Entity Quick Panel。

### 5.3 L1：Hover Entity Card

鼠标悬停在 shot 角色名上，弹出轻量级浮层卡片：

**confirmed 角色卡片：**

```text
┌─────────────────────────────────┐
│ 🟢 角色名 (confirmed)           │
│ character · aliases: 别名列表   │
├─────────────────────────────────┤
│ [头像缩略图]  外观摘要           │
│               (2-3 行文字)      │
│                                 │
│ 默认绑定: portrait ✓ voice ✓    │
│           live2d ✗ (缺失)       │
│                                 │
│ 上一次出现: Shot N (表情/动作)   │
│ 连续性提示: 当前镜头的提示文字   │
├─────────────────────────────────┤
│ [在 Dashboard 中打开]  [固定面板]│
└─────────────────────────────────┘
```

**candidate 角色卡片：**

```text
┌─────────────────────────────────┐
│ 🟡 角色名 (candidate · 0.82)    │
│ character · 来源: 来源描述       │
├─────────────────────────────────┤
│ [视觉证据缩略图]                │
│ 外观观察: 观察文字               │
│ 匹配候选: N 个开放候选           │
├─────────────────────────────────┤
│ [确认] [绑定到已有] [忽略]       │
└─────────────────────────────────┘
```

candidate 卡片允许**就地执行轻量级确认**，不需要跳转 Dashboard。

**数据来源：** Shot 节点已有 `entityRef` / `candidateId`。Webview 通过 postMessage 请求 Extension Host，Extension Host 调用 entity service 获取 `DashboardCreativeEntityDetail` 子集并返回。

**交互路径（遵循 Webview 安全沙箱约束）：**

所有实体操作从 Webview 发起，经由 Canvas Extension Host bridge 转发到 entity service：

```text
Canvas Webview                    Canvas Extension Host           Entity Service
─────────────                    ─────────────────────           ──────────────
postMessage({                    messageHandler →
  type: 'entity.confirm',         vscode.commands.executeCommand(
  candidateId })                    'neko.entity.confirmCandidate',
                                    { candidateId })
                                 ← result
← postMessage({ type:
    'entity.confirmResult', ... })
```

Hover Card / Quick Panel 中的所有按钮（[确认]、[绑定到已有]、[在 Dashboard 中打开]、[生成新形象]）均通过此 postMessage → Extension Host → command/API 路径执行，Webview 不直接调用 `vscode.commands` 或 `vscode.workspace`。

### 5.4 L2：Entity Quick Panel

Canvas 右侧的可选侧边栏面板，**跟随选中的 shot 节点变化**：

```text
┌──────────────────────────┐
│ 角色引用                  │
│ ─────────────────────── │
│ 🟢 角色 A                │
│   头像 + 外观摘要         │
│   绑定: 3/5 role         │
│   最近 3 次出现           │
│   [生成新形象] [编辑]     │
│   ──────────────         │
│ 🟡 角色 B                │
│   证据缩略图              │
│   confidence: 0.82       │
│   [确认] [绑定到已有]     │
│   ──────────────         │
│ ⚪ 角色 C                │
│   仅镜头参考，无实体       │
│   [创建候选] [关联已有]   │
└──────────────────────────┘
```

**与 Dashboard 的区别：** Dashboard 是"以实体为中心，看它出现在哪些地方"；Quick Panel 是"以镜头为中心，看这个镜头里的角色都是谁"。视角相反，数据相同。

Quick Panel 提供创作入口（见 §七）：[生成新形象]、[在 Sketch 中编辑]、[确认]、[绑定到已有]。

### 5.5 Dashboard 深链跳转

Hover Card 和 Quick Panel 底部都有 **"在 Dashboard 中打开"** 链接：

```text
Canvas Webview → postMessage({ type: 'entity.revealInDashboard', entityRef })
  → Extension Host → vscode.commands.executeCommand(
      'neko.dashboard.revealCreativeEntity', { entityRef, returnUri: currentCanvasUri })
```

Dashboard 定位到该实体并展开详情。Dashboard 标题栏增加 **"返回画布"** 按钮，一键跳回来源 shot。

复杂操作（合并实体、审阅 14 维记忆、管理多个视觉草稿、关系图编辑）仍在 Dashboard 完成。

### 5.6 已有角色图像的去重与识别

当 Canvas 已经有角色图像或角色相关数据时，系统应按以下顺序判断：

1. 是否已有 `characters[].entityRef`。
2. 是否已有 `characters[].referenceNodeId` 指向 Gallery / Media / GeneratedAsset 节点。
3. 是否已有 `EntityAssetBinding` 指向同一 asset/resource。
4. 是否已有 `VisualIdentityDraft` 指向同一候选人物和图像。
5. 是否能通过名称、alias、source range、visual occurrence 或 media ref 匹配开放候选；如果匹配多个开放候选，必须进入候选间消歧，不能自动合并或任选一个。

匹配成功时，应复用现有实体、候选或形象绑定，不创建重复节点。

候选间消歧应优先比较：

- 共同 source range / panel / frame / page provenance。
- `VisualOccurrence` 的 bbox、crop ref、阅读顺序和置信度。
- 名称、alias、speaker cue、OCR 位置与对白归属。
- 已有关联的 asset/resource/binding/draft。
- 用户最近一次确认或忽略决策。

仍无法消歧时，Hover Card / Quick Panel 应展示多个候选供用户选择。

### 5.7 冲突处理

以下情况必须产生 review diagnostic：

- 同一名字匹配多个 confirmed entity。
- 同一名字或同一视觉证据匹配多个 open candidate。
- 同一图像已绑定到另一个 confirmed character。
- storyboard 中的 `appearanceNotes` 与 confirmed character memory 冲突。
- candidate 与已有 entity alias 相近但证据不足。
- candidate 与 candidate 之间 alias 相近、source range 重叠或视觉证据高度相似但未达到自动合并阈值。

冲突时不应覆盖实体事实。冲突 diagnostic 在 Hover Card 或 Quick Panel 中展示，复杂冲突跳转 Dashboard 解决。

### 5.8 就地快速编辑（Quick Edit）

#### 5.8.1 问题

创作者在创作过程中经常需要修改角色信息（调整外观描述、补充别名、更换默认立绘），当前每次修改都要切到 Dashboard 再切回来，打断创作流。

Quick Edit 要解决的是**实体编辑能力如何被各创作现场低成本触发**，不是要给每个子包各实现一套编辑 UI。它应被定义为 Entity Facade / Extension Host 层的统一命令能力：

```text
任意入口按钮 / 菜单
  -> postMessage 或 vscode.commands.executeCommand
  -> neko.entity.renameEntity / updateMetadata / addAlias / removeAlias / setDefaultBinding
  -> Extension Host 统一校验、去重、写入
  -> onDidChangeEntity event
  -> Hover Card / Quick Panel / Inspector / TreeView 刷新
```

因此 Canvas / Sketch / Model / Agent / Story 只需要提供触发入口（按钮、菜单或命令），不拥有编辑逻辑、校验逻辑和保存逻辑。未来 overlay 也只是这些入口之一，可以复用 Quick Edit 命令，但 Quick Edit 不依赖 overlay。

#### 5.8.2 方案分析

**方案 A：每个子包 Webview 内嵌行内编辑表单**

在 Hover Card / Quick Panel 中直接内嵌文本输入、tag 编辑、下拉选择等编辑控件。

优点：视觉上下文完整（边看边改）。

缺点：
- **实现重复**：Canvas / Sketch / Model / Agent / Story 五个 Webview 各自实现编辑表单、校验逻辑、保存/取消状态管理。即使抽取 `@neko/ui` 共享组件，每个宿主仍需集成 postMessage 路由、表单状态同步、编辑冲突处理。
- **并发冲突**：两个工具同时打开同一角色的行内编辑，后写覆盖前写且无提示。解决并发需要 `generation` 乐观锁——而 Webview 内的乐观锁需要每个宿主分别实现冲突恢复 UI。
- **行为漂移**：各子包对"重命名去重检查"的实现差异会导致用户在不同工具中遇到不同的交互行为。
- **测试负担**：5 个 Webview x N 个编辑操作 = 大量重复测试矩阵。

**方案 B：VSCode 原生 UI（InputBox / QuickPick）由 Extension Host 统一驱动**

Hover Card / Quick Panel 仅提供只读预览 + 操作触发按钮（[重命名] [编辑外观] [换立绘]），点击后通过 postMessage 通知 Extension Host，由 Extension Host 调用 `vscode.window.showInputBox` / `vscode.window.showQuickPick` 弹出原生编辑 UI。

优点：
- **单一实现**：编辑逻辑和校验完全在 Extension Host 内，所有工具共享同一代码路径。去重检查、别名校验、绑定切换只写一次。
- **天然互斥**：原生 InputBox / QuickPick 是模态交互——同一时刻只能有一个活跃编辑操作，消除并发冲突风险，无需乐观锁。
- **低子包集成成本**：各工具 Webview 只需放置按钮 / 菜单，并发送 `postMessage({ type: 'entity.requestRename', entityRef })` 或调用宿主已暴露的命令入口；不需要嵌入表单组件。
- **行为一致性**：原生 UI 由 VSCode 统一渲染，视觉和交互风格天然一致。
- **先例**：`adr-device-management.md` 已确立"交互频率低、数据简单的操作使用原生 TreeView + QuickPick + StatusBar"原则。

缺点：
- 编辑时视觉上下文中断（InputBox 遮盖 Hover Card）。
- 复杂编辑（多字段同时改）需要多次弹窗。

**方案 C：混合——shot-local 行内 + entity-global 原生**

Shot-local 字段（`continuityNotes` / `appearanceNotes` / `emotion`）在 Canvas Webview 行内编辑（仅影响当前 shot 数据，无跨工具冲突风险，仅 Canvas 需要）。Entity-global 字段（角色名 / 别名 / 外观描述 / 默认绑定）通过 VSCode 原生 UI 编辑（所有工具共享）。

#### 5.8.3 决策：方案 C（混合）

| 编辑类别 | 范围 | 交互方式 | 实现位置 |
|----------|------|---------|---------|
| `ShotCharacter.continuityNotes` | Shot-local | Webview 行内文本编辑 | Canvas Webview（仅 Canvas 需要） |
| `ShotCharacter.appearanceNotes` | Shot-local | Webview 行内文本编辑 | Canvas Webview（仅 Canvas 需要） |
| `ShotCharacter.emotion` | Shot-local | Webview 行内下拉 | Canvas Webview（仅 Canvas 需要） |
| 重命名角色 | Entity-global | `showInputBox`（含去重校验） | Extension Host `neko.entity.renameEntity` |
| 编辑外观摘要 | Entity-global | `showInputBox`（单行短文本） | Extension Host `neko.entity.updateMetadata` |
| 增删别名 | Entity-global | `showQuickPick`（带 [+ 新增] 项） | Extension Host `neko.entity.addAlias` / `removeAlias` |
| 切换默认立绘 | Entity-global | `showQuickPick`（带缩略图描述） | Extension Host `neko.entity.setDefaultBinding` |
| 重新生成形象 | 跨工具 | [重新生成] 按钮 → Agent 对话 | Canvas Webview 触发，Agent 执行 |
| 14 维记忆 / 合并 / 关系 | Entity-global | Dashboard 完整表单 | Dashboard Webview |

**决策依据**：

1. **Shot-local 行内编辑无并发风险**：shot 数据只属于当前 Canvas 文档，不存在跨工具同时编辑的场景，行内编辑的即时反馈价值大于复杂度成本。
2. **Entity-global 原生 UI 消除五大风险**：实现重复、并发冲突、行为漂移、测试矩阵、集成成本一并消除。模态交互牺牲部分视觉上下文，但 entity-global 编辑频率远低于 shot-local——偶尔弹 InputBox 的中断远小于每个子包维护编辑表单的长期成本。
3. **Hover Card / Quick Panel 保持只读预览 + 操作按钮**：不嵌入编辑控件，降低 Webview 复杂度。按钮点击通过 postMessage 触发 Extension Host 命令。
4. **Overlay 不是 Quick Edit 前置条件**：Quick Edit 的核心是命令和写入路径，overlay 只是未来可选的视觉容器。P1 不应依赖 P3 的跨 Webview overlay 组件。

> 说明：VSCode `showInputBox` 不提供多行输入。Quick Edit 只覆盖短文本 / 单字段轻量编辑；长篇外观描述、14 维记忆、关系和批量编辑仍进入 Dashboard 完整表单。若未来需要不离开当前上下文的长文本编辑，可在 Inspector 或 overlay 成熟后作为增强处理。

**数据流**：

```text
Shot-local 编辑（行内，仅 Canvas）：
  Canvas Webview 行内修改 -> canvasStore.updateShotCharacter() -> .nkc 文件

Entity-global 编辑（原生 UI，所有工具共享）：
  任意 Webview 点击 [重命名] / [编辑外观] / [编辑别名] / [换立绘] 按钮
    -> postMessage({ type: 'entity.requestRename', entityRef })
    -> Extension Host
    -> vscode.window.showInputBox({ value: currentName, validateInput: dedup })
       或 vscode.window.showQuickPick(aliasItems)
    -> vscode.commands.executeCommand('neko.entity.renameEntity', { entityRef, newName })
    -> Entity Service 更新实体文件
    -> onDidChangeEntity event
    -> 所有已订阅的 Webview 刷新显示
```

**Hover Card 按钮区**（只读预览 + 操作触发，不嵌入编辑控件）：

```text
+-------------------------------------------+
| [confirmed] 角色名                         |
| character | aliases: a, b                  |
+-------------------------------------------+
| [头像]  外观描述摘要...                      |
|         默认绑定: portrait-01              |
+-------------------------------------------+
| [重命名] [编辑外观] [编辑别名]               |
| [换立绘] [生成形象] [Dashboard >]           |
+-------------------------------------------+
```

点击任何 entity-global 操作按钮后，Extension Host 弹出对应的原生 InputBox / QuickPick，编辑完成后 Hover Card 通过 `onDidChangeEntity` 自动刷新显示。

**Shot-local vs Entity-global 编辑边界**：

| 字段 | 归属 | 编辑方式 | 编辑影响范围 |
|------|------|---------|------------|
| `ShotCharacter.continuityNotes` | Shot-local | Webview 行内 | 仅当前镜头 |
| `ShotCharacter.appearanceNotes` | Shot-local | Webview 行内 | 仅当前镜头 |
| `ShotCharacter.emotion` | Shot-local | Webview 行内 | 仅当前镜头 |
| Entity `name` | Entity-global | `showInputBox` | 全局（含去重检查） |
| Entity `appearanceDescription` | Entity-global | `showInputBox` | 所有引用此实体的镜头 |
| Entity `aliases` | Entity-global | `showQuickPick` | 全局搜索和匹配 |
| Entity `defaultBinding` | Entity-global | `showQuickPick` | 所有引用此实体的缩略图 |

按钮上标注编辑目标：[镜头内] 或 [角色全局]。全局编辑由原生 `showInputBox` 自带 `validateInput` 做去重/格式检查，无需额外确认弹窗。

---

## 六、实体引用机制

### 6.1 当前引用方式与局限

`EntityMention` 定义了 6 种引用方式：

| 引用方式 | kind | 场景 | 需要名字？ |
|----------|------|------|-----------|
| 名字引用 | `name` | 输入角色名、@ 引用 | 是 |
| OCR 引用 | `ocr` | 漫画面板中 OCR 提取的文字 | 是（靠提取到的文字） |
| 对白引用 | `dialogue` | 剧本中的角色对白标记 | 是（对白归属需要名字） |
| 视觉引用 | `visual` | 画面中识别到角色的外貌 | 否（靠外观描述） |
| 语音引用 | `voice` | 音频中识别到角色的声音 | 否（靠声纹） |
| 手动引用 | `manual` | 用户手动指定 | 视情况 |

**核心局限：所有解析最终都回退到名字匹配。**

尽管 `EntityMention` 支持 6 种引用类型，实际的实体解析只有一条路径：

```text
任何引用
  -> 提取出一个名字（或别名）
  -> resolveByName(name, kind)
  -> 在 registry 中匹配 canonicalName 或 aliases
  -> 找到 → matched-existing
  -> 没找到 → 创建候选
```

视觉引用（`visual`）只提供 `appearanceText`（外观文字描述）和 `confidence`，但没有机制把外观描述映射到实体。语音引用（`voice`）同样缺少实际解析路径。

**不知道名字的场景无法建立引用：**

| 场景 | 用户行为 | 当前能力 |
|------|---------|---------|
| 漫画页面角色无对白标注 | 框选角色区域 | `VisualOccurrence` 记录位置但不能关联到实体 |
| 参考图中的角色想复用到分镜 | 拖拽参考图到 shot | 成为 `referenceNodeId`，但与实体无关 |
| 相邻镜头同一角色换了服装 | 希望系统识别为同一人 | 无视觉连续性追踪 |
| 导入 Live2D 模型绑定到角色 | 希望系统提示匹配 | 无资产→实体反向查找 |
| 画了角色立绘但还没起名字 | 先画后命名 | `CreativeEntityCandidate.name` 是必填，不能创建无名候选 |

### 6.2 图片引用的现状

`VisualOccurrence` 已定义了图片级引用结构：

```typescript
interface VisualOccurrence {
  boundingBox?: MediaBoundingBox;     // 像素坐标
  cropRef?: StoryboardMediaRef;       // 裁切图引用
  maskRefs?: StoryboardMediaRef[];    // 分割掩码
  appearanceText?: string;            // "红发、白裙、高个子"
  candidateEntityRefs?: CreativeEntityRef[];
  candidateIds?: string[];
  confidence?: number;
}
```

但缺少以下能力：

- **无视觉嵌入向量匹配**——不能用图片找图片。
- **无资产反向查找**——不能从一张图片反查它属于哪个实体。
- **外观匹配靠文字描述**——"红发白裙"只是文字，不能做视觉相似度。

### 6.3 需要补齐的引用路径

#### 6.3.1 图片引用解析（P1）

从图片出发找到关联实体，不需要知道名字：

```text
图片 / 裁切区域 / VisualOccurrence
  -> 方式 A：查询 EntityAssetBinding (by assetRef) → 反向找到 entityRef
  -> 方式 B：查询 VisualIdentityDraft (by generatedAssetIds) → 找到 characterId
  -> 方式 C：外观描述文本相似度匹配已有候选/实体的 appearanceNotes
  -> 方式 D（P2）：视觉嵌入向量 cosine similarity 匹配
  -> 匹配成功 → 建议关联
  -> 匹配失败 → 创建匿名候选
```

实现优先级：方式 A/B 是精确反向查找，P1 必须实现；方式 C 是文本近似匹配，P1 实现；方式 D 依赖嵌入向量基础设施（`adr-structured-data-persistence.md` P3），P2 实现。

#### 6.3.2 资产反向引用（P1）

从任意资产出发找到关联实体：

```text
资产（图片/模型/音频）
  -> EntityAssetBindingService.list() 过滤 assetRef 匹配
  -> 找到 → 返回 entityRef + role + status
  -> 没找到 → 查询 VisualIdentityDraft (by generatedAssetIds)
  -> 没找到 → 无关联
```

Canvas 的 Gallery 节点、Media 节点和 Shot 的 referenceNodeId 都应支持资产反向引用。用户拖拽一张图到 shot 角色位时，系统应自动检查该图是否已绑定到某个实体。

#### 6.3.3 匿名候选（P1）

允许不知道名字时创建实体候选：

- `CreativeEntityCandidate.name` 保持 `string`（必填），但新增 `identityBasis` 字段标识名字来源：

```typescript
interface CreativeEntityCandidate {
  name: string;  // 始终有值：用户命名 或 系统生成占位名
  identityBasis: 'user-named' | 'placeholder' | 'visual' | 'asset';  // 新增
  // ... 其余字段不变
}
```

- `identityBasis` 语义：
  - `'user-named'`：用户或剧本明确给出的名字（默认值，兼容所有已有数据）。
  - `'placeholder'`：系统自动生成的描述性占位名（如 `"匿名角色 #1"`、`"红裙女孩"`、`"面板 3 左侧人物"`）。
  - `'visual'`：通过视觉证据创建的候选，占位名来自 `appearanceText` 摘要。
  - `'asset'`：通过资产反向查找创建的候选，占位名来自资产文件名或 binding role。

- 占位名生成优先级：`appearanceText` 摘要 > `VisualOccurrence` 位置描述 > 自增编号。
- `identityBasis !== 'user-named'` 的候选在 UI 中显示"待命名"标记，提示用户补充正式名字。
- 用户命名时，系统将 `identityBasis` 更新为 `'user-named'`，并检查是否与已有实体/候选重复，重复时建议合并。
- 搜索行为：`identityBasis !== 'user-named'` 的候选不参与 name-based 模糊搜索（占位名、视觉摘要和资产文件名都不是可靠匹配键），仅通过 candidateId / asset 反向查找 / visual occurrence / provenance 定位。
- `resolveByName` / `resolveOpenCandidate` / Entity Facade 中所有 name-based 匹配路径都必须尊重此规则；不能只在 UI 搜索中排除，否则 Agent 自动化仍可能把 `"红裙女孩"`、`"panel-3-left"` 或资产文件名误当作正式角色名。

#### 6.3.4 跨镜头视觉连续性（P2）

相邻镜头中同一角色的自动关联：

```text
Shot N 的角色 A (有 VisualOccurrence)
  -> Shot N+1 的未知角色 (新 VisualOccurrence)
  -> 外观描述相似 + 位置连续 + 服装一致
  -> 建议为同一候选
```

依赖 P1 的外观描述匹配 + P2 的视觉嵌入向量。在 P1 阶段可先做基于 appearanceText 的文本相似度匹配。

### 6.4 引用方式全景

补齐后的完整引用矩阵：

| 引用方式 | 触发 | 解析路径 | 需要名字？ | 优先级 |
|----------|------|---------|-----------|--------|
| 名字引用 | 输入角色名 / @ 引用 | registry name/alias 匹配 | 是 | 已有 |
| OCR 引用 | 漫画面板 OCR | 提取文字 → 名字匹配 | 是 | 已有 |
| 对白引用 | 剧本对白标记 | dialogue tag → 名字匹配 | 是 | 已有 |
| **图片引用** | 框选/拖拽图片区域 | 资产反向查找 + 外观描述匹配 | **否** | P1 |
| **资产引用** | 拖拽资产到角色位 | EntityAssetBinding 反向查找 | **否** | P1 |
| **匿名创建** | 先画后命名 | 创建匿名候选 + 后续命名 | **否** | P1 |
| **视觉连续性** | 相邻镜头自动匹配 | 外观描述 + 嵌入向量 | **否** | P2 |
| 语音引用 | 音频片段 | 声纹匹配 | **否** | P3 |
| 手动引用 | 用户直接指定 | 用户选择 | 视情况 | 已有 |

---

## 七、创作工具就地关联协议

### 7.1 问题

实体创作是**跨工具协作**：Sketch 画形象、Agent 生成概念、Model 建模、Story 写角色、Canvas 编排分镜。每个工具各自擅长，但当前产出后都需要离开创作现场去 Dashboard 关联实体。

新建 "Character Design Webview" 不可取：画不如 Sketch、建模不如 Model、写不如 Story——且又多一个需要维护的 surface。

### 7.2 设计：EntityBindingWidget 协议

统一的轻量级实体关联 UI 组件，嵌入到每个创作工具中。组件统一调用 `neko.entity.*` 命令，不依赖 Dashboard Webview。

```text
创作工具                      EntityBindingWidget              实体系统
─────────                    ──────────────────               ──────────
Sketch 保存角色画作           → "绑定到实体？" 浮层            → upsertBinding
Agent 生成 N 张形象           → 选择 + 绑定面板（就地）        → selectDraft + bind
Model 导出角色模型           → "关联到哪个角色？" 浮层         → upsertBinding
Story 定义新角色             → 候选自动创建 + 行内确认          → confirmCandidate
Canvas shot 添加角色名       → 自动匹配候选 + Hover Card 确认  → entityRef 回填
NPC 测试结束                 → 评估报告 → 行内改进建议          → memory update
```

### 7.3 EntityBindingWidget 核心能力

Widget 在每个宿主工具中提供以下交互：

**关联能力**（已有设计）：

| 能力 | 触发时机 | 拟注册命令 | 当前状态 |
|------|---------|-----------|---------|
| 匹配已有实体 | 产出包含角色名或特征时 | `neko.entity.resolveByName` | **待注册** (现为 service 内部方法) |
| 匹配开放候选 | 无已确认实体匹配时 | `neko.entity.listCandidates` | **待注册** |
| 创建候选 | 无匹配时 | `neko.entity.proposeCandidate` | **待注册** |
| 就地确认 | 用户点击"确认" | `neko.entity.confirmCandidate` | **待注册** |
| 绑定资产 | 用户选择 binding role | `neko.entity.upsertBinding` | **待注册** |
| 选择视觉草稿 | Agent 生成多张后 | `neko.entity.upsertVisualDraft` | **待注册** |
| 跳转 Dashboard | 复杂操作 | `neko.dashboard.revealCreativeEntity` | **待注册** |

**Quick Edit 能力**（Entity Facade 命令 + VSCode 原生 UI 驱动，详见 §5.8）：

Entity-global 编辑不在各 Webview 内嵌入表单，也不依赖 overlay 组件，而是由 Entity Facade 命令和 Extension Host 统一驱动。各工具只提供按钮 / 菜单入口，Extension Host 负责弹出原生 UI、校验、写入和事件广播。

| 能力 | 触发方式 | Extension Host 实现 | 拟注册命令 | 当前状态 |
|------|---------|---------------------|-----------|---------|
| 编辑外观摘要 | Webview / TreeView / Inspector 按钮 [编辑外观] | `showInputBox`（短文本，prefill 当前值） | `neko.entity.updateMetadata` | **待注册** |
| 增删别名 | Webview 按钮 [编辑别名] | `showQuickPick`（当前别名列表 + [新增] 项） | `neko.entity.addAlias` / `removeAlias` | **待注册** |
| 重命名角色 | Webview 按钮 [重命名] | `showInputBox`（`validateInput` 去重） | `neko.entity.renameEntity` | **待注册** |
| 切换默认绑定 | Webview 按钮 [换立绘] | `showQuickPick`（binding 列表，带描述） | `neko.entity.setDefaultBinding` | **待注册** |
| 获取实体详情 | Widget 初始化时 | 直接返回 | `neko.entity.getEntityDetail` | **待注册** |

**为什么不在 Webview 内嵌入编辑表单**：

- 原生 InputBox / QuickPick 是模态交互——天然互斥，消除并发冲突风险。
- 编辑逻辑（去重校验、格式检查、写入）只在 Extension Host 实现一次，所有工具共享。
- 各工具低集成成本：只需暴露触发入口，不需要嵌入表单组件、管理表单状态、处理冲突恢复。
- overlay 只是在 P3 阶段可能出现的触发入口，不能作为 Quick Edit 的前置依赖。
- 先例：`adr-device-management.md` 确立"低频简单操作使用原生 UI"原则。

**编辑边界**：原生 UI 命令负责高频轻量的 entity-global 编辑；低频复杂编辑（14 维记忆审阅、合并/拆分实体、关系图编辑）跳转 Dashboard。Shot-local 字段（`continuityNotes` / `appearanceNotes` / `emotion`）仅在 Canvas Webview 行内编辑。

> **注**：当前已注册的 entity 相关命令仅有 `neko.entity.getDashboardCreativeEntitySource` 和 `neko.entity.processMemoryContribution`。上述命令均需在 Entity Facade API 实现阶段统一注册。各 Webview 宿主通过 postMessage → Extension Host → command 路径调用，不直接调用 `vscode.commands`。

### 7.4 各工具集成方式

**Agent 对话中（生成形象后就地选择）：**

Agent 生成 VisualIdentityDraft 后，在对话流中嵌入选择面板：

- 展示生成的 N 个形象方案（缩略图网格）。
- 展示提取的视觉特征（黑发短发 / 校服 / 左眼有疤）。
- 用户选择方案后，就地执行 `upsertVisualDraft(status: 'selected')` + `upsertBinding(role: 'portrait', isDefault: true)`。
- 选择方案后如需纠正外观描述或补充别名，点击 [编辑外观] / [编辑别名] 按钮，Extension Host 弹出 InputBox / QuickPick 完成编辑。
- 不需要跳去 Dashboard。

**Sketch 保存后（关联）：**

保存对话框增加实体关联选项：

- 自动检测是否有活跃的实体上下文（如从 Canvas shot 跳转过来编辑角色）。
- 展示匹配的实体 / 候选列表。
- 用户选择绑定角色 + role（portrait / reference）后保存。
- 保存后自动调用 `entity.upsertBinding`。
- 如需更新外观描述（"我刚画了新发型"），点击 [编辑外观] 按钮触发原生 InputBox。

**Model 导出后（关联）：**

- 导出对话框增加实体关联选项，与 Sketch 类似。
- 如需补充 3D 外观信息（"全身甲胄"、"身高比例 1:7"），点击 [编辑外观] 按钮触发原生 InputBox。

**Canvas shot 角色行（查看 + 创作入口）：**

见 §5.2 - §5.4 + §5.8。Quick Panel 提供以下创作入口：

- [生成新形象]：弹出生成面板，自动填入 appearanceNotes + continuityNotes 作为 prompt 基础，生成结果走 VisualIdentityDraft 流程。
- [在 Sketch 中编辑]：打开 Sketch 编辑器，自动加载角色当前默认立绘，Sketch 标题栏显示角色上下文，保存后自动更新 binding。
- [确认] / [绑定到已有] / [创建候选]：通过 EntityBindingWidget 就地执行。
- [重命名] / [编辑外观] / [编辑别名] / [换立绘]：触发 Extension Host 原生 UI 编辑（详见 §5.8）。

**Story 角色页（双向同步）：**

Story 是 `source-approved` 来源。保存角色页时：

- 自动生成 `EntityMemoryContribution`，包含 `CharacterObservation`（14 维特征）。
- 如果角色已确认，直接更新 memory（作者自己写的角色描述是事实）。
- 如果是候选，合并到开放候选。
- 不要求用户去 Dashboard 审阅 Story 作者自己写的角色定义。
- Story 角色页本身就是角色信息的原生编辑界面。与其他工具不同，Story 的编辑是 source-approved 的——保存即为实体事实，不需要额外确认。Story 角色页可展示当前实体绑定摘要（头像 + binding 状态），无需 EntityBindingWidget——Story 就是 Widget。

**NPC 测试结束后（评估建议）：**

评估报告中的发现自动转化为实体改进建议：

- 补充缺失的关系定义 → [添加到实体]。
- 外观描述缺少信息 → [补充]（触发原生 InputBox）。
- 性格不一致 → [在 Story 中查看]。

每条建议可就地执行，不需要跳转 Dashboard。

### 7.5 Entity Inspector Panel（实体检视面板）

#### 7.5.1 问题

§5.8 将 entity-global 编辑交给 Extension Host 原生 UI（InputBox / QuickPick），解决了实现重复和并发冲突问题。但创作者在编辑前需要**视觉预览**——看到角色头像、外观描述全文、绑定缩略图、候选状态——这些是纯文本 QuickPick 无法提供的。

当前 Hover Card 提供了悬停预览，但它是**瞬态的**（鼠标移开即消失），不适合作为编辑操作的持续参考上下文。而 Dashboard 是完整的编辑器标签页，打开它意味着离开当前创作工具——即使有深链跳转，仍然是标签页切换。

中间层缺失：**持久的、视觉丰富的、不离开当前编辑器的**实体预览面板。

#### 7.5.2 方案分析

**方案 A：`@neko/ui` 共享 overlay 组件，各 Webview 按需集成**

`@neko/ui` 提供 `<EntityInspectorOverlay entityRef={ref} />` React 组件，各创作工具 Webview 导入并挂载为浮层/抽屉/面板。组件内部通过标准化 postMessage 协议获取实体数据和触发编辑命令。

重要边界：overlay 只能作为**实体预览和 Quick Edit 触发入口**，不能成为 Quick Edit 的实现位置。重命名、别名、默认绑定、外观摘要更新仍必须调用统一 Entity Facade 命令，由 Extension Host 执行校验和写入。

集成路径：
```text
@neko/ui 提供 <EntityInspectorOverlay> 组件
  -> 各 Webview 挂载组件，管理 open/close 状态
  -> 组件内部发 postMessage({ type: 'entity.getDetail', entityRef })
  -> 各 Extension Host 新增 entity 消息路由（转发到 neko.entity.* 命令）
  -> 组件监听 entity.onDidChange 事件刷新
  -> 编辑按钮发 postMessage → Extension Host → 原生 InputBox / QuickPick
```

优点：
- **视觉上下文零断裂**：overlay 就在创作画面旁边或上层，用户不需要把目光移到侧栏。对 Canvas 这种空间密集型工具，overlay 可以精确定位到被编辑角色附近。
- **空间利用灵活**：每个工具根据自身布局选择最佳位置——Canvas 用右侧抽屉、Sketch 用底部面板、Agent 用内联卡片。
- **无侧栏依赖**：不占用 VSCode 侧栏空间（侧栏可能已被 Explorer / Agent 对话 / Market 占满）。

缺点：
- **per-Webview 集成管道**：每个宿主 Extension Host 需要新增 entity 消息路由。Canvas 路由已经随 Hover Card / shot 角色行落地；Sketch / Model / Story 仍需分别接入。
- **N 份状态管理**：overlay 的 open/close/loading/error 状态在每个 Webview 各管一份。
- **并发数据请求**：多个 Webview 同时打开 overlay 查看同一实体时，各自独立请求数据。无功能性冲突（只读），但冗余。
- **测试面积**：每个宿主的 overlay 集成需要独立测试（postMessage 路由是否正确、事件刷新是否及时）。

增量成本评估（相对于已有 Hover Card 设计）：
- Hover Card 已经获取实体摘要数据 → overlay 扩展到完整数据时，Canvas 侧可以复用已建消息路由。
- 非 Canvas 工具仍需要新增各自的 postMessage → Extension Host → Entity Facade 转发管道。
- overlay 的增量成本主要是 UI 容器、open/close 状态管理和跨宿主测试矩阵；它不新增编辑写入路径。

**方案 B：VSCode WebviewView（侧栏面板），全局唯一实例**

由 neko-dashboard 注册一个 `WebviewViewProvider`，显示在 VSCode 侧栏（Primary Sidebar 或 Secondary Sidebar / Panel 区域）。任何工具通过 `neko.entity.inspectEntity(entityRef)` 命令驱动面板内容刷新。

集成路径：
```text
neko-dashboard 注册 WebviewViewProvider（全局唯一）
  -> 面板内 React 代码直接与 neko-dashboard Extension Host 通信
  -> Extension Host 内已有实体数据访问能力（Dashboard 本身就管理实体）
  -> 各工具 Webview 触发：postMessage → Extension Host → neko.entity.inspectEntity 命令
  -> Inspector 面板响应命令，刷新内容
```

优点：
- **单一实现**：一个 WebviewViewProvider，一份 React 代码，一个 postMessage 通道。neko-live（LivePanelProvider）、neko-market（MarketplaceProvider）、neko-agent（ChatViewProvider）已有同类先例。
- **零 per-Webview 集成成本**：各工具只需调用一条命令，无需在自己的 Extension Host 新增 entity 消息路由。
- **无并发问题**：全局唯一实例，不存在多份 overlay 同时显示/请求数据。
- **数据通道复用**：neko-dashboard Extension Host 已有实体数据访问能力（Dashboard 本身就读写实体），Inspector 面板直接复用，零新增路由。
- **持久可见**：面板常驻侧栏，不随鼠标移动消失。

缺点：
- **视觉上下文断裂**：实体详情在侧栏，创作内容在编辑区，用户需要横向移动视线。对大屏用户影响小，对小屏或全屏创作用户影响明显。
- **侧栏空间竞争**：VSCode 侧栏可能已被 Explorer / Agent Chat / Marketplace 占满。Secondary Sidebar 可缓解但并非所有用户都启用。
- **被动触发**：用户需要显式点击 [详情] 或配置自动跟随，不像 overlay 可以"就在旁边"。
- **单实体焦点**：全局只能显示一个实体。在 Canvas 中快速对比两个角色时，无法同时打开两份详情（overlay 方案可以）。

**逐维度对比**：

| 维度 | 方案 A: overlay | 方案 B: 侧栏面板 |
|------|---------------|-----------------|
| 视觉上下文 | 零断裂（overlay 紧邻内容） | 侧栏断裂（需横向移动视线） |
| 实现数量 | 1 共享组件 + N 份集成管道 | 1 个 WebviewViewProvider |
| per-Webview 集成 | 需要 postMessage 路由 + 状态管理 | 只需一条命令调用 |
| 数据通道 | 每个 Extension Host 新增 entity 路由 | 复用 Dashboard 已有通道 |
| 并发风险 | 多 overlay 同时打开（只读无冲突，但冗余） | 无（单实例） |
| 空间占用 | 从创作区域借空间 | 占用侧栏空间 |
| 多实体对比 | 可以（多个 overlay） | 不可以（单焦点） |
| 测试矩阵 | N 个宿主 x overlay 集成 | 1 个面板 |
| 已有先例 | 无（项目内无跨包共享 overlay） | LivePanel / MarketPanel / ChatView |

#### 7.5.3 决策：方案 B（WebviewView 侧栏面板）

选择方案 B，理由：

1. **集成成本差距是决定性的**。方案 A 的"共享组件"只共享 UI 渲染——每个宿主 Extension Host 仍需从零新增 entity 消息路由（当前 Canvas / Sketch / Model / Story 均无此路由）。方案 B 复用 Dashboard 已有的实体数据通道，各工具零新增路由。
2. **项目内无跨包 overlay 先例**。overlay 是一个新的共享组件分发模式，需要建立 `@neko/ui` 组件协议、版本管理、集成测试基础设施。侧栏面板有 3 个已验证的先例。
3. **视觉断裂可通过 Hover Card 缓解**。L0 Hover Card 提供瞬态零断裂预览，L1 Inspector 提供持久详情——两层互补。创作者大部分时间靠 Hover Card 确认"这是谁"，只在需要详细查看或编辑时才看 Inspector。
4. **Dashboard 侧栏模式复用**。Inspector Panel 本质上是 Dashboard 详情面板的侧栏投影——共享同一套 React 组件，只是渲染容器不同。不引入新的维护面。

> **备选保留**：如果未来 `@neko/ui` 组件库成熟（`adr-webview-ui-design-system.md` P3-P4 阶段），且 per-Webview entity 消息路由已因 Hover Card 建设而就位，方案 A overlay 可作为 P3 增强补充——在 Canvas 等空间密集型工具中提供近距离预览。此时 overlay 复用 Quick Edit 命令，只增加 UI 容器 + open/close 状态管理，不承载编辑写入逻辑。

注册 `neko.entityInspector` WebviewView，提供实体的持久视觉预览。

**面板内容**：

```text
+-------------------------------------------+
| Entity Inspector                    [pin] |
+-------------------------------------------+
| [portrait]  角色名                         |
|             character | confirmed          |
|             aliases: a, b, c               |
+-------------------------------------------+
| 外观描述                                    |
| "黑色短发，左眼有疤，常穿深色校服..."        |
+-------------------------------------------+
| 绑定                                       |
| [thumb] portrait-01.png  default           |
| [thumb] portrait-02.png                    |
| [thumb] voice-01.wav                       |
+-------------------------------------------+
| 候选状态                                    |
| source: agent-comic-flow | confidence: 0.8 |
| identityBasis: user-named                  |
+-------------------------------------------+
| [重命名] [编辑外观] [编辑别名] [换立绘]      |
| [生成形象] [在 Dashboard 中打开]             |
+-------------------------------------------+
```

**触发方式**：

| 触发源 | 方式 | 行为 |
|--------|------|------|
| Canvas Hover Card | 点击 [详情] 按钮 | postMessage → `neko.entity.inspectEntity` |
| Canvas Quick Panel | 点击角色卡片 | postMessage → `neko.entity.inspectEntity` |
| Sketch / Model | 绑定关联后 | 自动触发 `neko.entity.inspectEntity` |
| Agent 对话 | 选择 VisualIdentityDraft 后 | 自动触发 `neko.entity.inspectEntity` |
| 命令面板 | `Entity: Inspect` | `showQuickPick` 选择实体 → 打开 Inspector |
| 工具栏 | 点击实体图标 | 打开 Inspector（显示上次查看的实体） |

**自动跟随（可选）**：

启用 `entityInspector.autoFollow` 时，Inspector 自动跟踪当前编辑器上下文中的实体焦点：

- Canvas 中选择 shot → Inspector 显示第一个角色。
- Canvas 中悬停角色名 → Inspector 切换到该角色（debounce 300ms）。
- Agent 对话中提到角色 → Inspector 显示对应实体。

禁用时，Inspector 仅响应显式 `inspectEntity` 命令，不自动切换。默认禁用（避免面板频繁闪烁）。

**与 Hover Card 的关系**：

Hover Card（§5.2 - §5.4）和 Inspector Panel 是互补的，不是替代的：

| 维度 | Hover Card | Entity Inspector Panel |
|------|-----------|----------------------|
| 生命周期 | 瞬态（hover 触发，移开消失） | 持久（侧栏常驻） |
| 内容深度 | 摘要（名字 + 状态 + 首行外观描述） | 完整（全部字段 + 绑定列表 + 缩略图） |
| 触发成本 | 零（鼠标悬停） | 一次点击（[详情] 按钮或命令） |
| 适用场景 | 快速确认"这是谁" | 详细查看 + 编辑操作入口 |

Hover Card 的 [详情] 按钮触发 Inspector Panel 打开——从瞬态预览自然过渡到持久详情。

**与编辑命令的关系**：

Inspector Panel 是**只读预览 + 操作触发器**，不嵌入编辑表单。面板内的 [重命名] / [编辑外观] / [编辑别名] / [换立绘] 按钮触发 Extension Host 原生 InputBox / QuickPick（与 §5.8 完全一致）。编辑完成后，Inspector Panel 通过 `onDidChangeEntity` 事件自动刷新。

```text
Entity Inspector Panel (只读预览)
  -> 用户点击 [编辑外观]
  -> postMessage({ type: 'entity.requestUpdateMetadata', entityRef })
  -> Extension Host
  -> vscode.window.showInputBox({ value: currentDescription })
  -> vscode.commands.executeCommand('neko.entity.updateMetadata', ...)
  -> Entity Service 更新文件
  -> onDidChangeEntity event
  -> Inspector Panel 自动刷新显示
```

**注册归属**：

Inspector Panel 由 neko-dashboard 扩展注册（实体管理是 Dashboard 的职责域），viewType 为 `neko.entityInspector`。这与 LivePanelProvider（neko-live 注册）、MarketplaceProvider（neko-market 注册）一致——面板由拥有该领域的扩展注册。

### 7.6 实体 UI 三层架构

三层互补，覆盖从瞬态浏览到深度管理的完整频谱：

| 层 | 形态 | 实现位置 | 内容深度 | 触发成本 | 编辑能力 |
|----|------|---------|---------|---------|---------|
| L0 Hover Card | Webview 瞬态浮层 | 各工具 Webview 内 | 摘要 | 零（hover） | 操作按钮 → L1 / 原生 UI |
| L1 Entity Inspector | WebviewView 侧栏面板 | neko-dashboard 注册，全局唯一 | 完整 | 一次点击 | 操作按钮 → 原生 UI |
| L2 Dashboard | 编辑器标签页 | neko-dashboard 注册 | 全量 + 批量 | 标签页切换 | 完整表单（合并/关系/记忆/批量） |

L0 → L1：Hover Card [详情] 按钮。L1 → L2：Inspector [在 Dashboard 中打开] 按钮。逐级加深，用户按需选择深度。

另有独立浏览入口：`neko-asset-manager` 活动栏中的 Entity TreeView（§7.8）→ 点击 → L1 Inspector。这是一个与三层平行的**列表入口**，不是第四层。

### 7.7 Dashboard 定位调整

Dashboard 从"实体操作的唯一入口"转变为"L2 总览 + 复杂操作兜底"：

| 操作类型 | 执行层 | 实现方式 |
|----------|-------|---------|
| 快速确认"这是谁" | L0 Hover Card | Webview 瞬态浮层 |
| 查看完整实体详情 + 绑定 | L1 Inspector Panel | WebviewView 侧栏面板 |
| 确认单个候选 | L0 / L1 | Webview postMessage → command |
| 绑定单个资产 | L0 / L1 / 各工具 | Webview postMessage → command |
| 选择视觉草稿 | Agent 对话 | Agent Webview 选择面板 |
| 编辑外观描述 / 别名 / 默认绑定 / 重命名 | L0 / L1 触发 | Extension Host 原生 InputBox / QuickPick |
| 修改 shot-local 字段 | Canvas | Webview 行内编辑 |
| 合并多个实体 | L2 Dashboard | Dashboard 专有 UI |
| 批量审阅 14 维记忆 | L2 Dashboard | Dashboard 专有 UI |
| 关系图编辑 | L2 Dashboard | Dashboard 专有 UI |
| 全局搜索和过滤 | L2 Dashboard | Dashboard 专有 UI |
| 跨源同步建议管理 | L2 Dashboard | Dashboard 专有 UI |
| Orphaned binding 批量清理 | L2 Dashboard | Dashboard 专有 UI |

### 7.8 Entity Inspector 与素材库侧栏的关系

#### 7.8.1 问题

§7.5 将 Entity Inspector 注册在 neko-dashboard 侧栏。但 neko-assets 已在左侧活动栏注册了 `neko-asset-manager` ViewContainer，包含三个 TreeView：

| 视图 ID | 类型 | 功能 |
|---------|------|------|
| `neko.assetManager` | TreeDataProvider | AssetEntity 按类别分组浏览（角色/道具/背景/…），含变体展开、缩略图、拖拽 |
| `neko.mediaLibraries` | TreeDataProvider | 外部媒体目录浏览（懒加载子目录 + 拖拽到时间线） |
| `neko.assetHistory` | TreeDataProvider | 最近使用的资产（基于 Git 历史） |

这三个 Provider 实现完整，数据通道已打通（`AssetLibrary` + `ThumbnailService` + `MediaMetadataCache`）。

问题：Entity Inspector 应该加入 `neko-asset-manager` ViewContainer，还是保持在 neko-dashboard 侧栏？左侧工具栏缺少统一的"显示+编辑"管理入口，是否需要整合？

#### 7.8.2 两个"实体"的领域区别

neko-assets 的 `AssetEntity` 和本 ADR 的 `CreativeEntity` 是**不同领域**的概念：

| 维度 | AssetEntity（素材实体） | CreativeEntity（创意实体） |
|------|----------------------|-------------------------|
| 定义位置 | `@neko/shared` types/asset.ts | `@neko/shared` types/creative-entity-asset-composition.ts |
| 身份本质 | 一个可复用的素材条目（图片/模型/音效），有 variants 和 files | 一个创作概念（角色/场景/物件/地点/风格），有 aliases 和 status |
| 生命周期 | 随项目资产目录（`neko/assets/manifest.json`） | 随实体注册表（`neko/entities/*.json`） |
| 类别枚举 | `EntityCategory`（character/prop/background/effect/audio/other） | `CreativeEntityKind`（character/scene/object/location/style） |
| 数据所有者 | neko-assets | neko-entity（通过 neko-dashboard 管理） |
| 关系 | AssetEntity 可以**被绑定到** CreativeEntity | CreativeEntity 通过 `EntityAssetBinding` 引用 AssetEntity |

关系方向：`CreativeEntity` → `EntityAssetBinding` → `AssetEntity`。一个创意角色（CreativeEntity）绑定了一张立绘（AssetEntity variant）。

#### 7.8.3 方案分析

**方案 A：Entity Inspector 加入 `neko-asset-manager` ViewContainer**

将 `neko.entityInspector` WebviewView 注册到 neko-assets 的 `neko-asset-manager` ViewContainer 中，成为第四个视图。

```text
neko-asset-manager (活动栏)
  ├── neko.assetManager      -- 素材浏览（TreeView）
  ├── neko.mediaLibraries    -- 媒体库（TreeView）
  ├── neko.assetHistory      -- 使用历史（TreeView）
  └── neko.entityInspector   -- 实体检视（WebviewView）← 新增
```

优点：
- **一个入口管所有资源**：用户只需记住一个活动栏图标。
- **素材 ↔ 实体联动直觉**：浏览素材时看到绑定的实体，浏览实体时看到绑定的素材。

缺点：
- **跨扩展 ViewContainer 注入**：`neko-asset-manager` 由 neko-assets 的 `package.json` 声明。Entity Inspector 由 neko-dashboard 注册。VSCode 不支持跨扩展向别的 ViewContainer 注入视图——Inspector 必须由 neko-assets 注册，但 neko-assets 没有实体数据访问能力，也不应该依赖 neko-entity/neko-dashboard 的领域逻辑（违反 `no-cross-extension-deps`）。
- **领域混淆**：素材管理（文件级 CRUD、缩略图、媒体元数据）和创意实体管理（身份、候选确认、记忆、关系图）是不同领域。混在同一个面板里，暗示它们是同一概念的不同视角——但实际上 AssetEntity 是一个素材条目，CreativeEntity 是一个创作概念。
- **Inspector 是 WebviewView（富内容），其余三个是 TreeView（列表）**：混搭两种不同类型的视图在同一容器中，交互模式不一致。

**方案 B：独立 ViewContainer（实体专用活动栏图标）**

新建 `neko-entity-manager` ViewContainer，包含 Entity TreeView + Entity Inspector：

```text
neko-entity-manager (活动栏, 新)
  ├── neko.entityBrowser     -- 实体浏览（TreeView, 新）
  └── neko.entityInspector   -- 实体检视（WebviewView）
```

优点：
- **领域清晰**：实体管理有自己的家。
- **TreeView 补全**：填补了当前缺失的实体浏览 TreeView——创作者可以在活动栏中快速浏览所有角色/场景/物件。

缺点：
- **活动栏膨胀**：neko-suite 已有多个活动栏图标（Explorer、Search、SCM、neko-asset-manager、可能还有 Agent Chat）。再加一个增加认知负担。
- **注册归属问题**：ViewContainer 由扩展的 `package.json` 声明。如果归 neko-dashboard，则 Dashboard 同时注册编辑器标签页 + 活动栏图标 + 侧栏面板——职责过重。如果新建 neko-entity 扩展来注册——当前 neko-entity 是领域包不是扩展。

**方案 C（推荐）：Entity Inspector 保持在 Secondary Sidebar / Panel 区域，neko-assets 侧栏新增 Entity TreeView（跨域联动）**

保持 §7.5.3 决策不变：Entity Inspector 由 neko-dashboard 注册为 WebviewView，默认位于 Secondary Sidebar 或 Panel 区域。同时，在 neko-assets 的 `neko-asset-manager` ViewContainer 新增一个轻量 Entity TreeView（由 neko-assets 注册，数据通过 `neko.entity.*` 命令获取），提供实体浏览入口。

```text
neko-asset-manager (活动栏, 已有)         Secondary Sidebar / Panel
  ├── neko.assetManager       素材浏览       neko.entityInspector  实体检视
  ├── neko.mediaLibraries     媒体库         (由 neko-dashboard 注册)
  ├── neko.assetHistory       使用历史
  └── neko.entityBrowser      实体浏览 ← 新增（TreeView，点击触发 Inspector）
```

设计细节：

1. **neko.entityBrowser TreeView**：
   - 由 neko-assets 注册（素材管理侧栏是资源浏览的自然入口）。
   - 数据获取：通过 `neko.entity.listEntities` / `neko.entity.getEntity` 命令（Extension-to-Extension 命令协议，不违反依赖规则）。
   - 层级：Kind（character/scene/object/location/style）→ 实体列表 → 展开显示绑定摘要。
   - 点击行为：`neko.entity.inspectEntity(entityRef)` → Inspector Panel 刷新。
   - 双击行为：`neko.entity.revealInDashboard(entityRef)` → Dashboard 标签页打开。
   - 右键菜单：[重命名] / [编辑外观] / [在 Dashboard 中打开] / [创建新实体]。
   - 缩略图：通过 `EntityAssetBinding.defaultBinding` → 素材缩略图（neko-assets 自身的 ThumbnailService 可直接访问）。
   - **不需要导入 neko-entity/neko-dashboard 内部代码**——全部通过 VSCode 命令协议通信。

2. **Entity Inspector 保持 neko-dashboard 注册**：
   - 理由不变：Dashboard 拥有实体数据完整访问能力 + 详情组件复用。
   - VSCode 允许 WebviewView 放在 Secondary Sidebar 或 Panel 区域——不挤占 Primary Sidebar 空间。

3. **联动路径**：
   ```text
   neko-asset-manager 活动栏
     └── neko.entityBrowser (TreeView)
           → 点击实体
             → executeCommand('neko.entity.inspectEntity', entityRef)
               → neko.entityInspector (WebviewView, Secondary Sidebar)
                   → 显示完整详情 + 编辑按钮
   
   反向：素材 → 实体
     neko.assetManager TreeView
       → 右键素材 → [查看绑定实体]
         → executeCommand('neko.entity.inspectEntity', { fromAsset: assetRef })
           → Inspector 显示绑定该素材的实体
   ```

#### 7.8.4 决策：方案 C

选择方案 C，理由：

1. **领域边界清晰**。`neko-asset-manager` 是"资源浏览入口"——素材、媒体库、历史、实体都是创作者需要浏览的资源类型。在这个入口新增一个 Entity TreeView 是自然扩展，不是领域混淆。Entity Inspector（富内容详情面板）由 neko-dashboard 注册在 Secondary Sidebar 是"详情查看器"——与 TreeView 的"列表浏览器"角色互补。
2. **零跨扩展依赖**。Entity TreeView 由 neko-assets 注册（`package.json` 声明），通过 `vscode.commands.executeCommand('neko.entity.*')` 获取数据——这是标准的 Extension-to-Extension 命令协议，与 `neko.agent.generateForNode` / `neko.cut.ai.generateVideoForClip` 等现有跨扩展命令一致。不需要 import 任何 neko-entity 内部模块。
3. **填补左侧工具栏实体浏览缺口**。当前创作者没有快速浏览"项目里有哪些角色/场景/物件"的入口——必须打开 Dashboard 标签页。Entity TreeView 提供轻量、常驻的浏览入口。
4. **不增加活动栏图标**。复用已有的 `neko-asset-manager` ViewContainer，不膨胀活动栏。
5. **Inspector 注册归属不变**。§7.5.3 的决策完全保留，本节只是补充了 Entity TreeView 浏览入口和跨域联动路径。

**neko-assets 需要暴露的命令**（实体侧，由 neko-entity / neko-dashboard 注册）：

| 命令 | 注册方 | 用途 |
|------|-------|------|
| `neko.entity.listEntities` | neko-entity / neko-dashboard | 返回 `CreativeEntity[]`（支持 query filter） |
| `neko.entity.getEntity` | neko-entity / neko-dashboard | 返回单个 `CreativeEntity` 详情 |
| `neko.entity.inspectEntity` | neko-dashboard | 刷新 Inspector Panel |
| `neko.entity.revealInDashboard` | neko-dashboard | 在 Dashboard 中打开实体详情 |

Entity TreeView 调用这些命令，命令由 neko-entity/neko-dashboard 注册——调用方（neko-assets）和实现方（neko-dashboard）通过 VSCode 命令总线解耦。

---

## 八、接口建议

### 8.1 不推荐

不推荐把实体处理塞进 `canvas.importStoryboard`：

```ts
canvas.importStoryboard(payload, {
  createEntities: true,
  confirmCharacters: true,
});
```

这会让 storyboard import 同时承担镜头导入、实体候选创建、事实确认、资产绑定和 Canvas 投影，破坏职责边界。

不推荐向 Canvas 图投影 entity / representation-slot / occurrence / generated-asset 节点：

```ts
canvas.upsertEntityProjection({
  source: { kind: 'storyboard', canvasId, shotNodeIds },
  policy: { createMissingCandidateProjections: true },
});
```

这会让 Canvas 从分镜工作台退化为实体关系图数据库，每个角色产生十几个投影节点。

### 8.2 推荐

推荐拆分能力，各司其职。以下为拟注册的 Entity Facade Command（当前均为 service 内部方法，需统一注册为 `vscode.commands`）：

```ts
// 已有命令
vscode.commands.executeCommand('neko.entity.processMemoryContribution', {
  contribution,
  options: { mode: 'candidate', defaultKind: 'character' },
});

// 已有命令
vscode.commands.executeCommand('neko.canvas.importStoryboard', payload);
```

实体确认走实体服务（可从任何工具的 Extension Host 触发）：

```ts
// 以下均为待注册命令（Entity Facade API）
vscode.commands.executeCommand('neko.entity.confirmCandidate', { candidateId });
vscode.commands.executeCommand('neko.entity.upsertBinding', { entityId, role, assetRef, source, status });
vscode.commands.executeCommand('neko.entity.upsertVisualDraft', { characterId, prompt, generatedAssetIds, status });
vscode.commands.executeCommand('neko.entity.mergeEntities', { from, to });
```

Canvas 通过 `CreativeEntityChangeEvent` 回填 shot entityRef（详见 §4.5 回填路径）：

```ts
onDidChangeEntity((event: CreativeEntityChangeEvent) => {
  if (event.reason === 'confirm-candidate') {
    for (const ref of event.changedRefs) {
      if (ref.kind === 'candidate' && ref.entityRef) {
        updateShotCharacters(
          char => char.candidateId === ref.id,
          { entityRef: ref.entityRef, candidateId: undefined }
        );
      }
    }
  }
});
```

---

## 九、Canvas entity 节点类型处置

### 9.1 已注册的 entity 节点类型

Canvas 当前注册了 4 个 entity 相关节点类型：`entity`、`representation-slot`、`occurrence`、`generated-asset`。节点库策略中 `entity` 是 `source-bound`，其余三个是 `projection-only`。

### 9.2 处置方案

| 节点类型 | 处置 | 理由 |
|----------|------|------|
| `entity` | 保留注册但降为可选总览节点 | 用户可手动从 Quick Panel pin 一个角色到画布。但不由系统自动批量投影。仅显示：头像 + 名字 + 状态 + 绑定摘要 |
| `representation-slot` | 标记为 deprecated | 资产需求信息在 Hover Card / Quick Panel / Dashboard 中展示，不需要空间节点 |
| `occurrence` | 标记为 deprecated | 出现证据在 Quick Panel / Dashboard 中以列表展示，一个角色可能出现 20+ 次，不适合空间节点 |
| `generated-asset` | 标记为 deprecated | 生成资产在 Agent 对话中就地展示和选择，或在 Dashboard 视觉草稿区管理 |

Canvas entity subsystem 从 `createPlaceholderSubsystemRegistration('entity')` 升级为瘦子系统，仅提供：

- `entity` 节点的简化渲染（卡片样式，非 placeholder）。
- shot → entity 的 `reference` 连接支持（可选，仅当用户 pin 了 entity 节点时）。
- 无 representation-slot / occurrence / generated-asset 渲染器。

### 9.3 可选 entity 总览节点

如果用户确实需要在画布上"看到角色"：

- 从 Quick Panel 拖拽或 pin 角色到画布。
- entity 节点显示：头像 + 名字 + 确认状态 + 绑定摘要。
- shot → entity 连接线表达"谁出现在哪个镜头"。
- **一个角色 = 一个节点**，不是一棵子图。
- 不由系统自动批量创建，用户主动操作才创建。

---

## 十、资产删除与实体记录保留

### 10.1 问题

创作过程中，形象图片可能被删除（用户不满意）、模型文件可能被替换、参考素材可能被清理。当绑定到实体的资产被删除时：

- 实体记录是否保留？
- 引用是否自动更新？
- 如何避免大量悬空引用？

### 10.2 设计原则：实体记录永不因资产删除而丢失

实体是**身份锚点**，资产是**可替换的表现**。删除一张角色立绘不应删除"这个角色存在"这个事实。

```text
实体生命周期        ────────────────────────────────────────>
  身份/记忆/关系    ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■  （持久）
  资产绑定 A       ■■■■■■■■ deleted                          （可断开）
  资产绑定 B                  ■■■■■■■■■■■■■■■■■■■■■■■■■■■■  （替换）
  外观描述          ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■  （持久）
```

### 10.3 删除语义分层

| 被删除的内容 | 实体记录 | 绑定记录 | 引用处理 | 自动/手动 |
|-------------|---------|---------|---------|----------|
| **资产文件**（图片/模型/音频） | 保留 | `availability: 'orphaned'`（`status` 不变） | 引用保留但标记断裂 | 自动（FileWatcher，仅 project-local） |
| **VisualIdentityDraft** | 保留 | 关联 draft 标记失效 | 如果有 selectedAssetId 被删，清除选择 | 自动 |
| **EntityAssetBinding** 记录 | 保留 | 记录删除 | 实体 bindings 数组缩减 | 手动（用户操作） |
| **候选实体**（reject） | 候选删除 | 无 | 引用此候选的 shot characterName 保留 | 手动 |
| **已确认实体**（archive） | 标记 `archived` | `availability: 'archived'` | 引用保留但 UI 灰显 | 手动 |

### 10.4 EntityAssetBinding 孤儿处理

当资产文件被删除时，对应的 `EntityAssetBinding` 不应被删除，而是标记资产不可用。

**`status` 和 `availability` 是正交维度**：`status` 描述审阅状态（binding 是否被用户确认），`availability` 描述资产可用性（文件是否存在）。不能合并为一个字段——否则 orphaned 时丢失了 binding 原本是 `confirmed` 还是 `suggested` 的信息。

```typescript
interface EntityAssetBinding {
  entityId: string;
  entityKind: string;
  assetRef: AssetReference;
  role: BindingRole;
  status: 'suggested' | 'confirmed' | 'rejected';  // 审阅状态（不变）
  availability: 'active' | 'orphaned' | 'archived'; // 新增：资产可用状态
  source: string;
  confidence: number;
  orphanedAt?: string;  // ISO 8601, availability 变为 orphaned 的时间
}
```

典型状态组合：

| status | availability | 含义 |
|--------|-------------|------|
| confirmed | active | 正常：用户确认的绑定，资产存在 |
| confirmed | orphaned | 资产被删除，但用户曾确认过此绑定 |
| suggested | active | Agent 建议的绑定，等待用户审阅 |
| suggested | orphaned | Agent 建议的绑定，但资产已丢失 |
| rejected | active | 用户拒绝的绑定（罕见：拒绝后资产仍在） |
| * | archived | 用户主动归档（实体或绑定被存档） |

Orphaned binding 的意义：

- **保留审阅状态**：知道"这个 confirmed 绑定的资产丢了"比只知道"orphaned"更有价值——confirmed orphan 优先恢复，suggested orphan 可直接清理。
- **恢复可能**：用户可能从回收站恢复文件，orphaned binding 自动恢复 `availability: 'active'`，`status` 保持不变。
- **替换引导**：UI 可提示"此角色的已确认立绘已丢失，是否重新生成？"。

### 10.5 引用自动更新策略

| 引用位置 | 更新方式 | 时机 |
|----------|---------|------|
| `ShotCanvasNode.characters[].entityRef` | **不更新** | entityRef 指向实体 ID，实体未被删除 |
| Canvas shot 角色行头像缩略图 | **自动降级** | `availability: 'orphaned'` 时显示占位符 + 断裂标记 |
| Hover Card 外观摘要 | **自动降级** | 图片区域显示"资产已删除" + 外观文字描述仍在 |
| Quick Panel 资产列表 | **自动标记** | orphaned binding 灰显 + `status` 仍可见（confirmed/suggested）+ [重新绑定] 按钮 |
| Dashboard 实体详情 | **自动标记** | orphaned binding 显示警告 + 按 `status` 分优先级批量清理入口 |

**关键设计**：Canvas shot 中的 `entityRef` 指向实体 ID（不是资产 ID），所以资产删除不会破坏 shot 引用链路。受影响的只是表现层（缩略图、预览图）。

### 10.6 文件监听与自动检测

Entity service 通过 `vscode.workspace.FileSystemWatcher` 监听资产目录变化：

```text
project-local 资产文件删除
  -> FileWatcher 通知
  -> 查找引用此资产的 EntityAssetBinding
  -> 标记 availability: 'orphaned', orphanedAt: now（status 不变）
  -> 触发 onDidChangeEntity event
  -> Canvas / Dashboard 响应事件更新 UI
```

资产文件恢复（移回原路径）：

```text
project-local 资产文件创建
  -> FileWatcher 通知
  -> 查找 availability: 'orphaned' 的 bindings 匹配路径
  -> 恢复 availability: 'active', 清除 orphanedAt
  -> 触发 onDidChangeEntity event
```

**适用范围**：`vscode.workspace.FileSystemWatcher` 只能可靠覆盖 workspace / project-local 文件。对于 market / shared / external assetRef，通过 asset federation resolver refresh 检测可用性并标记 `availability: 'orphaned'`。本 ADR 不定义 federation resolver 的刷新策略，由 `adr-asset-federation.md` 负责。`availability` 枚举严格限定为 `'active' | 'orphaned' | 'archived'` 三态，不引入第四态。

**外部依赖**：P2 的 orphan lifecycle 只能先覆盖 project-local 文件。market / shared / external assetRef 的 orphan 检测依赖 `adr-asset-federation.md` 定义 resolver refresh 事件和可用性探测契约；在该契约落地前，非本地资产只做按需 probe 和 UI 降级提示，不承诺实时 orphan 标记。

### 10.7 批量清理

Dashboard 提供 orphaned binding 批量管理：

- 列出所有 `availability: 'orphaned'` 的 bindings，按实体分组。
- 按 `status` 排序优先级：confirmed orphan 排前（价值高，优先恢复），suggested orphan 排后（可直接清理）。
- 批量 [删除记录]（确认丢弃历史）。
- 批量 [重新绑定]（选择替代资产）。
- 批量 [重新生成]（触发 Agent 重新生成形象）。

---

## 十一、实现现状与剩余缺口

截至 2026-06-10 代码更新后，ADR §十三 拆出的四个 OpenSpec 的核心闭环已基本落地。以下状态是代码事实快照，不代表所有产品增强已经完成。

### 11.1 已落地能力

| 层级 | 实现状态 | 关键证据 |
|------|----------|----------|
| 类型契约 | 已完成 | `ShotCharacter.candidateId`、`CreativeEntityCandidate.identityBasis`、`EntityAssetBinding.availability`、`EntityAssetBinding.orphanedAt` 均已存在 |
| Entity Facade 命令 | 已完成 | `confirmCandidate`、`unbindAsset`、`markBindingOrphaned`、`restoreBinding`、`archiveBinding`、`nameCandidate`、`findEntitiesByAsset`、`listBindings`、`inspectEntity` 等命令已注册 |
| Widget Action 分发 | 已完成 | `unbind-asset`、`archive-binding`、`name-candidate` 等 action 已接入统一 Facade 路径 |
| Canvas 实体路由 | 已完成 | summary / confirm / inspect 三条路由，含 confirm backfill、pending retry 和 entity change 订阅 |
| Canvas Hover Card | 已完成 | `EntityReferenceHoverCard`、`EntityReferenceActions`、`ConfirmCandidateButton` 已实现 |
| Canvas shot 角色行 | 已完成 | 五态 badge、lazy summary、confirm / inspect 按钮已实现 |
| StoryboardDeliveryService | 已完成 | contribution → automation decision → payload 注入 → storyboard import 全流程已实现 |
| Entity Inspector | 已实现基础渲染 | `EntityInspectorProvider`、`neko.entity.inspectEntity`、`entityInspector.follow` 已接入；Webview 已渲染 label / aliases / summary / binding texts / requirements / actions，并具备刷新测试 |
| Entity TreeView | 已完成 | `EntityBrowserTreeProvider` + 右键命令 + AssetManager 素材反向查找 |
| Orphan FileWatcher | 已完成 | `ProjectAssetBindingAvailabilityWatcher` + service lifecycle 方法已实现 |
| Dashboard orphan 操作 | 已完成 | `archive-binding`、`cleanup-suggested-orphan`、`rebind-orphaned-binding` 已实现 |
| `identityBasis` 搜索排除 | 已完成 | contribution automation、CreativeEntityService、projection 路径均排除 `identityBasis !== 'user-named'` 的 name-based 匹配 |

### 11.2 剩余缺口

按真实剩余风险和用户闭环优先级排序：

| 优先级 | 项目 | 归属 OpenSpec | 说明 |
|--------|------|---------------|------|
| P1 | Dashboard 5 个 stub 动作 | `entity-binding-widget-facade` | `bind-existing`、`review-drafts`、`handle-requirement`、`generate-material`、`import-material` 仍需补齐 |
| P1 | Inspector 视觉丰富度 | `entity-inspector-panel` | 基础 Webview 已渲染详情；仍需补齐头像、绑定缩略图列表、候选状态视觉和更完整的 Dashboard 详情组件复用 |
| P1 | 候选消歧 UI | `canvas-shot-entity-inline-reference` | 多候选/同名候选场景需要在 Hover Card 或 Quick Panel 中让用户选择，不得自动错配 |
| P1 | Quick Panel 创作入口 | `canvas-shot-entity-inline-reference` | [重新生成] → Agent 对话、[在 Sketch 中编辑] 等创作入口尚未形成完整交互 |
| P1 | 非 Canvas 工具 Widget 嵌入 | `entity-binding-widget-facade` | Sketch / Model / Puppet / Story 仍需接入 EntityBindingWidget postMessage 路由 |
| P2 | federation orphan probe | `entity-asset-binding-orphan-lifecycle` | market / shared / external assetRef 依赖 `adr-asset-federation.md` 的 resolver refresh / availability probe 契约 |
| P2 | Dashboard 批量 orphan 清理 | `entity-asset-binding-orphan-lifecycle` | 单条操作已存在，批量选择、批量清理和批量重新绑定仍需补齐 |
| P2 | Hover Card 视口溢出处理 | `canvas-shot-entity-inline-reference` | 当前固定定位策略仍需避免窄视口或边缘角色行溢出 |

### 11.3 延后增强

- Canvas `entity` 节点从 placeholder 升级为简化卡片渲染。
- Quick Panel → 画布 pin entity 节点 + shot → entity 连接。
- NPC 测试评估报告自动转化为实体改进建议。
- `representation-slot` / `occurrence` / `generated-asset` 节点类型标记 deprecated。
- 跨镜头视觉连续性：相邻 shot 外观描述 + 嵌入向量匹配。
- 实体生命周期的批量 archive / restore 管理界面。
- `@neko/ui` EntityInspectorOverlay 共享组件与空间密集型工具 overlay 增强。overlay 不新增编辑写入路径，不成为 Quick Edit 依赖。

### 契约变更（Schema Migration）

本 ADR 涉及以下类型契约变更，不仅仅是 UI 层改动。2026-06-10 代码更新后，四项契约字段均已落地，后续工作重点是保持兼容默认值和全路径语义一致。

| 变更 | 历史缺口 | 当前定义 | 影响范围 | 兼容性 | 实现状态 |
|------|---------|---------|---------|--------|----------|
| `ShotCharacter.candidateId` | 不存在 | `candidateId?: string` | canvas.ts | 向后兼容（新增可选字段） | 已完成 |
| `CreativeEntityCandidate.identityBasis` | 不存在 | `identityBasis: 'user-named' \| 'placeholder' \| 'visual' \| 'asset'` | creative-entity-asset-composition.ts | 向后兼容（新增字段，旧数据默认 `'user-named'`） | 已完成 |
| `EntityAssetBinding.availability` | 不存在 | `availability: 'active' \| 'orphaned' \| 'archived'` | creative-entity-asset-composition.ts | 向后兼容（新增字段，旧数据默认 `'active'`） | 已完成 |
| `EntityAssetBinding.orphanedAt` | 不存在 | `orphanedAt?: string` | creative-entity-asset-composition.ts | 向后兼容（新增可选字段） | 已完成 |

**迁移策略**：

所有变更均为**新增字段**，无破坏性变更：

1. **`CreativeEntityCandidate.identityBasis`**：
   - `name` 保持 `string` 必填，不变。
   - 新增 `identityBasis` 字段。旧数据缺失此字段时默认 `'user-named'`（所有已有 candidate 都是用户/剧本命名的）。
   - `identityBasis !== 'user-named'` 的候选在 UI 中显示"待命名"标记。
   - `identityBasis !== 'user-named'` 的候选不参与 name-based 模糊搜索。
   - JSON Schema 和 validator 新增字段定义 + 默认值处理。

2. **`EntityAssetBinding.availability`**：
   - `status`（`'suggested' | 'confirmed' | 'rejected'`）不变，继续描述审阅状态。
   - 新增 `availability` 字段。旧数据缺失此字段时默认 `'active'`。
   - UI 过滤器分为两维度：按 `status` 过滤审阅状态 + 按 `availability` 过滤可用性。
   - `switch (binding.availability)` 使用 exhaustive check。

3. **`ShotCharacter.candidateId`**：
   - 新增可选字段，零迁移成本。
   - 导入时写入（如果有 contribution 结果），confirm 后清除。

---

## 十二、验收标准

1. Agent 输出 `StoryboardTable` 和 `EntityMemoryContribution` 时，二者可独立处理。
2. `canvas.importStoryboard` 不确认实体，也不自动写 `characters.json` 或 `neko/entities/*.json`。
3. Canvas shot 角色行展示 confirmed/candidate/unlinked 三态，包含头像和状态徽标。
4. Canvas Extension Host 提供 entity 消息路由，Hover Card 可通过 postMessage 获取实体摘要、触发确认、打开 Inspector。
5. 悬停 shot 角色名展示 Hover Entity Card，confirmed 角色显示外观摘要和绑定状态，candidate 角色可就地确认。
6. 重复导入同一 storyboard 不会创建重复角色引用。
7. 同一角色图像再次出现时复用已有 asset/resource/binding/candidate。
8. 用户确认候选后，shot 引用可以更新到 confirmed `CreativeEntityRef`。
9. Agent 生成 VisualIdentityDraft 后可在对话中就地选择和绑定，不需要跳转 Dashboard。
10. 冲突时产生 diagnostic（在 Hover Card / Quick Panel 中展示），而不是静默覆盖。
11. `importStoryboard` 成功但 entityRef/candidateId 尚未回填时，系统保留 storyboard 节点，并通过显式 candidateId 回写 pass、手动关联或重新导入补齐。
12. Dashboard 深链跳转可从 Canvas 直达实体详情，并支持一键返回画布。
13. 用户点击 [发送到 Canvas] 时，entity contribution + payload 注入 + storyboard import 自动联合编排；正常路径先拿到 entityRef/candidateId 映射，超时降级必须产生 unlinked / ambiguous diagnostic。
14. `identityBasis !== 'user-named'` 的候选不参与 name-based 模糊搜索，避免占位名、视觉摘要或资产文件名误匹配。
15. 资产文件删除时，EntityAssetBinding `availability` 标记 `'orphaned'`（`status` 不变），实体记录保留。
16. orphaned binding 的实体在 Canvas shot 角色行中显示断裂标记 + 降级占位符。
17. 非 project-local assetRef 的 orphan 检测依赖 asset federation resolver refresh；未实现前只承诺按需 probe 和 UI 降级提示。
18. 任意工具中点击 [重命名] / [编辑外观] / [编辑别名] / [换立绘] 按钮后，统一 Entity Facade 命令完成校验和写入；Extension Host 可用 InputBox / QuickPick 处理短字段，长文本和复杂字段进入 Dashboard 表单。编辑结果实时反映到所有已订阅的 Webview，不依赖 overlay。
19. Shot-local 编辑（continuityNotes/appearanceNotes/emotion）在 Canvas Webview 行内完成；entity-global 编辑通过 Extension Host 原生 UI 完成。两类编辑有明确的 UI 区分。
20. Entity Inspector Panel 在侧栏中显示完整实体详情（头像 + 外观描述全文 + 绑定缩略图列表 + 候选状态），Hover Card [详情] 按钮可联动打开 Inspector。
21. Inspector Panel 编辑按钮触发的原生 UI 编辑完成后，面板自动刷新。
22. `neko-asset-manager` 活动栏中的 Entity TreeView 能浏览项目内所有创意实体（按 Kind 分组），点击条目触发 Inspector Panel 联动，数据通过 VSCode 命令协议获取（零跨扩展依赖）。
23. AssetManager TreeView 中右键素材可查看绑定的创意实体（反向查找）。

---

## 十三、结论

Storyboard 和人物形象应独立建模，通过组合和引用协作。

`StoryboardTable` 是镜头计划，不是人物身份或形象绑定事实源；统一实体是身份锚点，不是镜头结构；Canvas 是视觉工作台，通过 shot 内联引用和悬停预览展示实体上下文，而不是投影实体子图。

正确方向是：

```text
Agent 生成计划和候选（一次创作 pass）
  -> StoryboardDeliveryService 联合编排（用户一键触发）
       +-- entity.processMemoryContribution（后台静默）
       +-- canvas.importStoryboard（用户可见）
  -> 各创作工具通过 EntityBindingWidget 就地关联实体
  -> 实体浏览入口：neko-asset-manager 活动栏新增 Entity TreeView（零跨扩展依赖）
  -> 实体 UI 三层递进：
       L0 Hover Card（瞬态悬停预览，零触发成本）
       L1 Entity Inspector（侧栏持久面板，视觉丰富，单一实现）
       L2 Dashboard（完整标签页，批量 + 复杂操作）
  -> Entity-global 编辑由 Extension Host 原生 UI 统一驱动（所有工具共享）
  -> Shot-local 编辑在 Canvas Webview 行内完成
  -> 资产删除时 binding orphaned（实体身份永续）
  -> 用户在任意工具中审阅后确认或绑定
```

四条核心不变量：
1. **实体身份永续**——资产可删除可替换，实体记录和身份锚点不因资产变动而丢失。
2. **编排透明**——三步拆分是系统内部架构边界，用户只看到一个动作、一个结果。
3. **就地关联**——创作工具是实体关联的主战场，Dashboard 是兜底，不是必经之路。
4. **编辑单一实现**——entity-global 编辑逻辑（校验、去重、写入）只在 Entity Facade / Extension Host 实现一次，通过原生 InputBox / QuickPick 或 Dashboard 表单驱动，所有工具共享。各 Webview 只负责触发，不嵌入编辑表单；overlay 只能复用这些命令，不能承载编辑逻辑。

### OpenSpec 实施状态与剩余拆分

本 ADR 覆盖面较大，已拆为 4 个独立 OpenSpec change 推进。2026-06-10 代码更新后，四个 change 的核心交付均已落地，后续应围绕剩余 gap 做小步增量，而不是重新拆解主链路。

| OpenSpec | 核心状态 | 已落地 | 剩余工作 | 依赖 |
|----------|----------|--------|----------|------|
| **canvas-shot-entity-inline-reference** | 核心已完成 | `ShotCharacter.candidateId`、Canvas entity 路由、Hover Card、shot 角色行、confirm 回填、StoryboardDeliveryService 编排 | 候选消歧 UI、Quick Panel 创作入口、Hover Card 视口溢出处理 | 就地确认依赖 Entity Facade confirm command |
| **entity-binding-widget-facade** | 核心已完成 | Entity Facade 命令注册、Widget action 分发、Quick Edit 原生 UI 路径、Canvas 侧接入 | Dashboard 5 个 stub 动作、Sketch / Model / Puppet / Story Widget 嵌入 | 各宿主 Extension Host 需提供 postMessage 路由 |
| **entity-inspector-panel** | 基础已完成，视觉仍需增强 | `EntityInspectorProvider`、`inspectEntity`、`follow` 命令、基础 Webview 渲染、Entity TreeView、素材→实体反向查找、autoFollow 配置 | 头像/缩略图/候选状态视觉、Dashboard 详情组件复用 | 依赖 Entity Facade readers 和 Dashboard 详情数据 |
| **entity-asset-binding-orphan-lifecycle** | 核心已完成 | `availability` / `orphanedAt` 契约、project-local FileWatcher、restore/archive service、Dashboard 单条 orphan 操作 | federation orphan probe、Dashboard 批量 orphan 清理 | 非本地 assetRef 依赖 `adr-asset-federation.md` resolver refresh 契约 |

§六（实体引用机制）横跨多个 OpenSpec：图片引用/资产反向查找和 `identityBasis` name-based 搜索排除已基本落地；Canvas 内引用归 inline-reference；视觉连续性仍是 P2 增量。
