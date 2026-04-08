# story-agent-canvas 职责 ADR 与轻量分镜表设计

**状态**: 架构决策（部分实施）
**日期**: 2026-04-08
**关联**: `agent-media-architecture.md` · `canvas-agent-integration.md` · `canvas-role-boundary.md` · `ARCHITECTURE_CN.md`

---

## 一、背景

随着 `neko-agent` 成为视频创作主编排器，`neko-story`、`neko-agent`、`neko-canvas` 的边界需要重新收敛。

核心问题不再是“谁来做分镜功能”，而是：

- 剧本应该承担到哪一层
- 分镜语义决策应该由谁负责
- 正式的分镜编辑工作台应该放在哪里
- `story` 中是否还需要保留轻量分镜视图

如果这几个问题不先收敛，后续实现会出现三类问题：

- `story` 和 `canvas` 重复建设分镜 UI
- Agent 既像聊天框又像半个 storyboard 编辑器，职责膨胀
- 剧本到分镜再到时间线的主流程不清晰，用户无法判断应该在哪一步做什么

---

## 二、结论摘要

### 2.1 总体定位

在 Agent-first 视频创作架构中：

> `story` 负责“剧本事实与审阅入口”，`agent` 负责“语义决策与流程编排”，`canvas` 负责“分镜落地与视觉编辑”。

### 2.2 关键决策

1. `neko-story` 需要支持分镜相关能力，但不承担完整分镜编辑器职责。
2. `neko-agent` 是剧本到分镜、分镜到视频流程的主编排器。
3. `neko-canvas` 是唯一正式的 storyboard 工作台。
4. `story` 中保留“轻量分镜表”，但其定位是“审阅和派发面板”，不是第二个 `canvas`。
5. 机械型导入可以由 `story` 直接调用 `canvas`，创造性拆镜必须经过 `agent`。

### 2.3 当前实施进度

截至 2026-04-08，已落地：

- `ScriptIndex` 已升级为稳定 `sceneId` + scene 元数据 + sceneCharacters + actionSummary + estimatedDuration
- `ScriptTableView` 已升级为轻量分镜表，包含 Agent / Canvas 状态列与场景级动作入口
- `story` 的 `sendToCanvas` 已走 `neko.canvas.importStoryboard` 正式导入入口
- `canvas` 已暴露 `NekoCanvasAPI.storyboard.import(...)` 与 `neko.canvas.importStoryboard`
- `neko-story` 已提供 `GetScriptIndex` / `SearchScriptIndex` / `GenerateScenePlan` / `GenerateShotPlan`
- shared planner 已支持 `mechanical | semantic` 双路径 payload
- `neko-story` extension API 已暴露 `generateScenePlans()` / `generateShotPlan()`
- `neko-agent` 的 `parseStoryboard` 已优先通过 `neko-story` 结构化 planning 生成 `scenePlans`
- `neko-agent` pipeline 已新增 `importStoryboardToCanvas` stage，可将 semantic storyboard 正式导入 `canvas`
- `StartPipeline` 已支持 `importToCanvas` / `canvasStartX` / `canvasStartY` 参数，用于开启 semantic canvas handoff

仍未完全落地：

- `semantic` 路径已进入 pipeline 主链，但 `story.generateStoryboard` 仍未直接启动该标准流程
- 轻量分镜表的 Agent / Canvas 状态仍缺少统一事实源与完整回写
- “从剧本开始视频创作”标准主流程尚未闭环

---

## 三、职责边界图

```text
用户在 story 写剧本 / 选中场景
  ↓
story
  ├─ 剧本文本事实源
  ├─ 结构化索引（scene / character / line range）
  ├─ 轻量分镜表（scene-level review）
  └─ 流程入口（发送给 Agent / 生成分镜 / 启动视频创作）
  ↓
agent
  ├─ 读取 ScriptIndex / SceneContext
  ├─ 决定拆几个镜头、每镜头的语义字段
  ├─ 调用 canvas 创建 SceneGroup / ShotNode
  ├─ 调用 cut 编排时间线
  └─ 维护确认门、回写与状态推进
  ↓
canvas
  ├─ 正式 storyboard 工作台
  ├─ ShotNode / SceneGroupNode / GalleryNode 编辑
  ├─ 视觉候选审查与批量生成
  └─ 向 cut 输出确认后的分镜结构
```

---

## 四、ADR-1：story 的职责上限

### 决策

`neko-story` 的职责上限是：

- 剧本文本事实源
- Agent 上下文入口
- scene-level 审阅面板
- 局部 AI 改写回写入口
- 剧本驱动流程的启动器

`neko-story` 的职责下限不是“只做 Fountain 编辑器”，但其上限也不是“完整分镜编辑器”。

### story 必须支持的能力

- 剧本文本编辑、预览、语法与结构诊断
- 稳定导出 `ScriptIndex / SceneContext / CharacterIndex`
- 将当前文件、当前场景、当前选区注入 Agent
- 展示 scene-level 规划信息
- 审阅 Agent 给出的改写、分镜建议和流程状态
- 触发下游动作：
  - 为当前场景生成分镜
  - 将指定场景发送到 `canvas`
  - 从剧本启动完整视频创作流程

### story 不应承担的能力

- ShotNode 拖拽与排布
- 镜头级属性编辑（景别、机位、运镜、候选图管理）
- 图片/视频批量生成主界面
- 独立于 `canvas` 的分镜事实源
- 独立的 storyboard 导出系统

### 设计原则

> `story` 应该“懂分镜”，但不应该“拥有分镜”。

---

## 五、ADR-2：agent 是剧本到视频的主编排器

### 决策

所有需要语义判断的“剧本 → 分镜”动作都由 `agent` 主导。

### 原因

剧本到分镜不是简单格式转换，而是语义决策过程，至少包含：

- 当前场景是否需要拆镜
- 该拆几个镜头
- 镜头顺序是叙事顺序还是视觉顺序
- 每个镜头的景别、情绪、视觉重点是什么
- 哪些信息应继承全局风格，哪些应做局部覆盖

这些都属于 Agent 的强项，不属于 `story` 扩展本身。

### agent 的职责

- 读取 `story` 暴露的结构化上下文
- 生成 `ScenePlan / ShotPlan`
- 调用 `canvas` 落成 `SceneGroupNode + ShotNode`
- 调用 `cut` 生成时间线结构
- 维护确认门、重试、回写和状态迁移

### agent 不应承担的能力

- 持有长期剧本真相
- 成为正式 storyboard 编辑器
- 替代 `canvas` 的视觉工作台

### 实施要求

- `story.generateStoryboard` 不应在 `story` 内直接实现拆镜逻辑
- 该命令应成为 Agent 工作流入口，调用 Agent 的对应工具或 pipeline
- 当前实现中，semantic planning 已进入 Agent pipeline；剩余工作是让 `story` 命令直接触发该标准入口，而不是只发送 context

---

## 六、ADR-3：canvas 是唯一正式分镜工作台

### 决策

所有 shot-level 编辑都收敛到 `neko-canvas`。

### canvas 应承担的能力

- `SceneGroupNode / ShotNode / GalleryNode` 的创建与编辑
- 分镜排布、镜头顺序调整、候选图查看
- 批量生成、重生成、视觉参考管理
- 画布上的创作上下文组织
- 向 `cut` 输出已确认分镜结构

### canvas 不应承担的能力

- Fountain 语法解析
- 剧本文本事实源
- 局部台词润色与文本修订主界面

### 设计原则

> `canvas` 负责“承载分镜”，不负责“解释剧本语义”。

---

## 七、ADR-4：轻量分镜表是必要能力

### 决策

`story` 中保留并强化“轻量分镜表”。

### 为什么必要

如果没有轻量分镜表，`story → agent → canvas` 会变成黑盒流程：

- 用户在剧本阶段无法确认场景拆解是否正确
- Agent 生成分镜前没有明确的审阅层
- 一上来就进入 `canvas`，会把大量 scene-level 判断提前转换成 shot-level 操作

轻量分镜表的价值不是编辑镜头，而是提供一个 **scene-level 审阅与确认门**。

### 它的正确定位

> 轻量分镜表是“审阅和派发面板”，不是“第二个 storyboard 编辑器”。

---

## 八、轻量分镜表功能设计

### 8.1 粒度

唯一主粒度为 `scene`。

不在 `story` 中做以下能力：

- shot 行编辑
- shot 拖拽排序
- 候选图切换
- 画布布局编辑

### 8.2 数据来源

轻量分镜表的数据应由三部分组成：

1. `story` 本地结构数据
   - 场景编号
   - 场景标题
   - INT/EXT
   - 地点 / 时间
   - 角色
   - 动作摘要
   - 估算时长

2. Agent 规划结果
   - 是否已分析
   - 建议镜头数
   - 场景情绪 / 风格提示
   - 缺失信息提示
   - 是否需要人工确认

3. 下游状态映射
   - 是否已发送到 `canvas`
   - 对应 `SceneGroupNode`
   - 已生成镜头数量
   - 是否已入时间线

### 8.3 最小字段集

建议轻量分镜表最少包含以下列：

| 字段 | 说明 |
|------|------|
| Scene | 场景编号 / sceneId |
| Heading | 场景标题 |
| Place | 地点 |
| Time | 时间 |
| Characters | 主要角色 |
| Summary | 动作摘要或场景摘要 |
| Duration | 预计时长 |
| Plan | Agent 建议（如“3 镜头 / 情绪紧张”） |
| Status | 未分析 / 已规划 / 已入 Canvas / 已生成 / 已入 Timeline |
| Action | 生成分镜 / 打开 Canvas / 重分析 / 跳过 |

### 8.4 必要交互

轻量分镜表至少需要支持以下操作：

- 点击行跳转到剧本对应场景
- 为当前场景请求 Agent 分析
- 为当前场景生成分镜
- 将当前场景发送到 `canvas`
- 打开对应的 `SceneGroupNode`
- 重新同步 `story ↔ canvas` 映射状态
- 标记场景为“跳过生成”

### 8.5 非目标

轻量分镜表不包含：

- 镜头级属性编辑器
- 图像预览墙
- 候选图比较器
- 批量生成调度器
- 时间线编辑入口

这些都应继续由 `canvas` 或 `cut` 承担。

---

## 九、推荐工作流

### 9.1 标准主流程

```text
1. 用户在 story 编写或修改剧本
2. story 生成/刷新 ScriptIndex
3. 用户打开轻量分镜表，按 scene 审阅结构
4. 用户对某场景点击“生成分镜”
5. story 调用 agent 工作流
6. agent 生成 ScenePlan / ShotPlan
7. agent 调用 canvas 创建 SceneGroupNode + ShotNode
8. 用户在 canvas 中进行 shot-level 精修
9. 结果导入 cut 时间线
```

### 9.2 两类调用路径

#### 路径 A：机械导入

适用于：

- 快速创建场景骨架
- 将场景先映射成空 `SceneGroupNode`
- 不要求镜头语义质量

该路径可以由 `story` 直接调用 `canvas`。

#### 路径 B：创造性拆镜

适用于：

- 自动拆镜
- 情绪 / 风格驱动的镜头规划
- 视觉节奏与叙事节奏协同

该路径必须经过 `agent`。

---

## 十、对现有实现的收敛建议

### 10.1 story

- 保留 `ScriptTableView`
- 将其升级为“轻量分镜表 + 下游状态表”
- `CreativeGridView` 只作为可选场景级展示，不作为正式 storyboard UI
- `generateStoryboard` 命令重定向为 Agent 编排入口

### 10.2 agent

- 以 `GetScriptIndex / SearchScriptIndex` 为读取入口
- 生成 `ScenePlan / ShotPlan`
- 将 `import_script_to_canvas` 从粗粒度骨架导入升级为语义拆镜导入
- 将 `flowF` 作为剧本启动视频创作的标准主流程

### 10.3 canvas

- 保持唯一正式 storyboard 编辑面板
- 承接来自 `story` 和 `agent` 的 scene / shot 结构
- 输出到 `cut`

---

## 十一、P0 落地项

1. 为 `story` 增加正式命令：
   - `生成分镜到 Canvas`
   - `从剧本开始视频创作`

2. 升级 `ScriptIndex`：
   - 引入稳定 `sceneId`
   - 增加 scene summary、dialogue blocks、action blocks

3. 将 `ScriptTableView` 升级为轻量分镜表：
   - 加入 Agent 状态和 Canvas 状态列
   - 支持场景级动作入口

4. 将 `generateStoryboard` 收敛为 Agent 入口，而不是在 `story` 内实现拆镜逻辑

5. 将 `import_script_to_canvas` 从“按行数估算 ShotNode”升级为“按语义生成 ShotPlan”

### 当前对应状态

- 1：已部分完成
  - `story` 已具备场景级 `sendToCanvas`
  - “从剧本开始视频创作”仍未形成标准流程入口
- 2：已完成当前迭代目标
- 3：已完成当前迭代目标
- 4：已完成当前迭代目标
- 5：已完成当前迭代核心闭环
  - shared planner / canvas import 已支持 semantic payload
  - agent pipeline 已统一消费 `GenerateScenePlan / GenerateShotPlan` 对应的结构化 planning
  - `importStoryboardToCanvas` 已成为 semantic canvas sink

---

## 十二、最终边界定义

用一句话定义三个模块：

> `story` 负责“剧本事实与审阅入口”，`agent` 负责“语义决策与流程编排”，`canvas` 负责“分镜落地与视觉编辑”。

用另一句话定义轻量分镜表：

> 轻量分镜表是 `story` 中的 scene-level 审阅层，不是 `canvas` 的缩小版。
