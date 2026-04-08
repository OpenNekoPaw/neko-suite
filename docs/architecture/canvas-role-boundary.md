# neko-canvas 职责边界与缺口分析

**状态**: 持续更新（2026-04-08 已落实 asset 代理边界与 `timelineSync` 最小回流契约）  
**日期**: 2026-04-08  
**关联**: `canvas-agent-integration.md` · `project-data-management.md` · `ARCHITECTURE_CN.md`

---

## 一、问题定义

本文只讨论 `neko-canvas` 在 **Neko Suite 本地化 AI 创作 IDE** 中的职责边界，不讨论云端协作、社区分享或独立网页画布产品对标。

分析前提：

- 产品核心是 **AI Agent + 本地项目 + VSCode 插件体系**
- 多插件分别覆盖剧本、素材库、画布、时间线、绘图、模型等场景
- `neko-canvas` 不需要成为“全能编辑器”，而需要成为 **创作编排中枢**

---

## 二、结论摘要

`neko-canvas` 的最佳定位不是“另一个编辑器”，而是：

> **Agent 的语义编排层 / 创作工作台**

它的核心职责是：

- 承接创作意图
- 组织跨插件上下文
- 编排分镜、参考、文档、模型、候选结果
- 发起并审查 AI 生成
- 将确认后的结构下发到 `neko-cut`

一句话定义边界：

> `neko-canvas` 负责“想什么、看什么、先排成什么”，`neko-cut` 负责“按时间怎么做、怎么剪、怎么出片”。

---

## 三、IDE 内职责边界图

```text
用户意图
  ↓
neko-agent
  ├─ neko-story
  │    职责：剧本文本事实源、结构索引、脚本解析
  │
  ├─ neko-assets / neko-market
  │    职责：资产注册、检索、标签、路径解析、模型安装状态
  │
  ├─ neko-canvas
  │    职责：创作语义编排层
  │    ├─ scene / shot / gallery / script / document / model 节点
  │    ├─ 空间组织与参考关系
  │    ├─ AI 生成任务发起与结果审查
  │    ├─ Agent 当前上下文聚合
  │    └─ 向 neko-cut 输出 storyboard 结构
  │
  ├─ neko-sketch
  │    职责：像素级绘制、局部修图、图像二次编辑
  │
  └─ neko-cut
       职责：时间线、关键帧、特效、字幕、导出、成片事实源
```

---

## 四、为什么 `neko-canvas` 应处于这个位置

### 4.1 架构主链路已经明确是 Script → Canvas → Cut

仓库总架构明确把视频创作链路定义为：

```text
neko-story 剧本
  ↓
neko-canvas 分镜与生成编排
  ↓
neko-cut 时间线与导出
```

这说明 `canvas` 的角色不是 `cut` 的附属视图，而是 **剧本和时间线之间的语义中间层**。

现状依据：

- `ARCHITECTURE_CN.md` 中的“分镜创作流水线（Script → Canvas → Cut）”
- `neko-canvas` 已承担 `shot / scene / gallery / script / document / model` 节点
- `neko-cut` 的 README 明确将自身定义为专业视频剪辑器

### 4.2 Agent 最适合操作语义对象，而不是时间线低层对象

Agent 擅长理解的对象是：

- 场景
- 镜头
- 角色关系
- 文档上下文
- 参考图
- 风格与模型引用

这些都天然属于 `canvas` 节点层，而不是时间线轨道层。

时间线更适合：

- 精确时序
- 帧级编辑
- 轨道布局
- 特效和关键帧
- 导出与最终交付

因此：

- **Agent-first 的前台主界面应是 canvas**
- **最终生产控制面应是 cut**

### 4.3 跨插件协作也以 `canvas` 为自然汇聚层

现有跨扩展模型中：

- `neko-story` 暴露 `getScriptIndex`
- `neko-canvas` 暴露 `nodes` API
- `neko-cut` 暴露 `timeline` API
- `neko-agent` 通过命令总线与导出 API 编排这些对象

这使 `canvas` 成为最自然的“上下文聚合面”：

- 上接剧本和文档
- 左接素材和模型
- 下接时间线
- 横向连接 Sketch 修图

---

## 五、`neko-canvas` 应拥有的职责

### 5.1 创作语义节点层

`neko-canvas` 应该是以下语义对象的主要承载层：

- `scene`
- `shot`
- `gallery`
- `script`
- `document`
- `model`
- `canvas-embed`

这里的重点不是“多画几个节点”，而是把创作过程中的关键对象变成 **可被 Agent、用户和其他插件共同理解的结构化实体**。

### 5.2 空间化创作组织

`canvas` 的核心价值不是替代文本和时间线，而是提供：

- 非线性组织
- 跨对象对照
- 参考关系可视化
- 创作上下文并置

这类能力很难在纯文本编辑器或时间线中完整表达。

### 5.3 AI 生成任务编排与审查

`canvas` 应该承担：

- 生成入口
- 批量任务发起
- 候选结果挂载
- 结果筛选确认
- 再编辑回流

也就是说，`canvas` 不是生成引擎本身，但应是 **生成工作流的工作台**。

### 5.4 Agent 上下文中枢

`canvas` 应该是 Agent 最重要的实时上下文来源之一：

- 当前选中节点
- 当前场景与镜头关系
- 当前参考图与角色画廊
- 当前待生成对象

这比单纯让 Agent 读取时间线或剧本文本更接近创作者的即时工作状态。

### 5.5 向时间线输出已确认结构

`canvas` 的下游职责应是：

- 将确认的 storyboard 结构输出给 `neko-cut`
- 提供初始镜头顺序、时长、参考图、台词等信息

它不应负责替代时间线继续做帧级生产。

---

## 六、`neko-canvas` 不应拥有的职责

### 6.1 不应成为剧本文本事实源

剧本的文本真相、语言服务、结构索引应该继续归 `neko-story` 所有。

`canvas` 可以引用剧本、展示 TOC、建立 scene 映射，但不应承担主文本编辑职责。

### 6.2 不应成为资产注册表

素材的导入、标签、检索、路径解析、Git/LFS、媒体库索引应归 `neko-assets`。

`canvas` 可以引用资产，但不应自己维护一套资产事实源。

### 6.3 不应成为时间事实源

时间线、轨道、关键帧、特效、字幕、导出和成片事实源应归 `neko-cut`。

`canvas` 可以输出分镜骨架，但不应继续承担剪辑器职责。

### 6.4 不应承担像素级编辑

图像细修、局部 inpaint、笔刷绘制、逐帧修改等应归 `neko-sketch`。

`canvas` 应只负责调度与回流，不负责深度图像编辑。

### 6.5 不应承担模型安装真相

模型安装状态、版本、来源、部署能力应归 `neko-market` 或模型运行时层。

`canvas` 的 `model` 节点更适合承担“引用和选择”，而非“安装系统”。

---

## 七、当前实现与目标定位的匹配度

### 7.1 已经对齐的部分

- 已有 `nodes` API，说明 `canvas` 已被当作跨扩展可编排对象
- 已有 `GenerationPromptPanel` 和批量调度器，说明其承担生成编排职责
- 已有 `selectionChange` → Agent ambient context，说明其承担上下文中枢职责
- 已有 `importToTimeline`，说明其承担向 `cut` 输出 storyboard 的职责
- 已有 `getScriptIndex`、`openDocument`、`checkModelInstalled` 等桥接，说明其正在汇聚跨插件语义对象

### 7.2 尚未完全对齐的部分

- 与资产层、时间线层的边界仍需继续收敛
- 场景级批量工作流和审阅体验仍有增强空间
- 操作审计与双向回流仍处于最小可用阶段

这意味着：

> 当前方向正确，主要问题不是定位错误，而是若干增强型中枢能力仍需继续补强。

当前已明确的跨扩展边界：

- `neko-assets` 是资产事实源
- `NekoCanvasAPI.asset` 只是受限代理层，当前只暴露 `import/list/getById`
- `neko-canvas` 是语义编排与审阅状态层
- `neko-cut` 是时间线与成片事实源
- `cut -> canvas` 通过共享 `timelineSync` 契约做最小回流
- 当前允许回流的字段仅限 `shotId`、`projectName`、`importedAt` 一类操作元数据
- 这些回流字段只能更新 `lastImportedToTimeline*` 之类状态，不可覆盖 `shot` 的语义描述层

---

## 八、画布功能 P0 缺口清单

以下问题会直接影响 `neko-canvas` 是否能成为 Agent-first IDE 的稳定中枢。

### P0-1 `nodes.update` / `nodes.create` 协议基础一致性已修复

现状：

- Extension 侧通过 `sendRequest('nodes.update', { nodeId, data })`
- Extension 侧通过 `sendRequest('nodes.create', { type, position, data })`
- Webview 侧已统一按 `{ nodeId, data }` / `{ type, position, data }` 处理

影响：

- 跨扩展创建/更新节点主链路已稳定
- 剩余工作集中在继续收敛周边桥接接口，而不是协议本身失配

建议：

- 保持 `nodes.update` / `nodes.create` 当前统一契约不再分叉
- 新增桥接能力时继续在 webview 层完成结构拼装
- 避免重新引入“完整节点对象”和“局部 patch”双轨输入

### P0-2 操作桥接消息通道已完成统一封装

现状：

- webview 内 VSCode API 已收敛到统一工具层
- store / hook / 组件不再混用不同的全局入口

影响：

- `operationApplied`、dirty 标记和历史恢复主链路已稳定
- 剩余问题更多是消息语义继续细化，而不是通道可靠性

建议：

- 保持统一封装作为唯一消息出口
- 后续新增消息类型时优先扩展工具层，而不是直接访问全局对象

### P0-3 结果审查闭环未完成

现状：

- `ShotNode` 已有候选版本导航 UI
- `ShotNode` / `GalleryNode` 都已接入父层候选切换

影响：

- 结果审查主链路已闭环
- 剩余问题主要转向批量比较体验和更强的审阅 UI

建议：

- 保持 `generationHistory.selected` 作为统一事实来源
- 后续补多候选对比器和更强的批量审阅体验

### P0-4 `scene -> shot` 仍是弱容器语义

现状：

- `scene` 已有 `shotIds`
- `SceneGroupNode` 已支持镜头纳管、排序、自动布局、场景级批量生成

影响：

- 场景容器已从展示占位升级为基础语义容器
- 剩余缺口集中在更强的批量编辑和更丰富的场景级工作流

建议：

- 继续补齐场景级属性批量编辑与更强的工作流入口
- 保持 `scene.shotIds` 作为顺序权威来源

### P0-5 创作入口未覆盖全部关键语义节点

现状：

- `script / document / model / canvas-embed` 已具备 Explorer 拖入和 toolbar picker 入口

影响：

- 主工作流入口已覆盖关键语义节点
- 剩余问题主要是入口体验继续打磨，而不是能力缺失

建议：

- 保持现有 picker + dropAssets 契约
- 后续再考虑从模型市场、文档预览等位置做更深入口联动

---

## 九、画布功能 P1 缺口清单

以下问题不会立即阻断主链路，但会限制 `neko-canvas` 从“可用”升级为“成熟编排台”。

### P1-1 `canvas-embed` 已完成最小落地

现状：

- 类型系统、outline、webview 渲染、打开动作都已接通
- Explorer 拖入和 toolbar picker 都可创建 `canvas-embed`

价值：

- 复杂项目分层组织
- 子画布复用
- 大型 storyboard 模块化

### P1-2 `asset` 命名空间边界不干净

现状：

- `NekoCanvasAPI` 定义了 `asset` 命名空间
- 历史上实际实现中除 `import` 外多为 stub
- 当前已收敛为 `neko-assets` 的受限代理实现

风险：

- 容易误导其他扩展把 `canvas` 视为资产事实源

建议：

- 保持“代理而非事实源”的注释、测试和实现一致
- 后续优先推动 `neko-assets` 提供正式扩展 API，逐步替代 command 级代理

### P1-3 `canvas -> cut` 主要是单向导出

现状：

- 画布可将 storyboard 导入 `cut`
- 当前已通过共享 `timelineSync` 契约补上最小回流策略

风险：

- 进入剪辑阶段后，两个世界逐渐分叉

建议：

- 保持 `timelineSync` 的“最小字段、显式 reason、共享类型”原则
- 新增回流字段前，先审查是否属于操作元数据还是语义事实
- 只有前者才允许进入 `cut -> canvas` 契约
- 下一步如需扩展，优先考虑：选中镜头、导出视频缩略图、渲染产物引用

### P1-4 节点渲染注册表已完成首轮落地

现状：

- `NodeRendererRegistry` 已替代核心渲染分发硬编码
- 新节点类型已可通过注册表扩展渲染入口

风险：

- 当前注册表主要覆盖渲染分发
- metadata、属性面板 schema 等扩展点仍未完全外置

建议：

- 继续把节点 metadata、图标、默认尺寸、属性面板 schema 收敛到注册表周边
- 为后续插件化节点扩展预留更稳定的声明式接口

### P1-5 事件契约已细化到可支撑主链路

现状：

- `CanvasChangeEvent` 已细化为更明确的变更类型
- Agent ambient context 已可消费这些增量事件

风险：

- 当前事件粒度已足够支撑增量上下文和基础审计
- 剩余缺口主要在更强的智能提醒和跨插件消费约定

建议：

- 保持现有事件分类稳定
- 后续围绕场景排序、审阅动作和 cut 回流继续补充更细语义

### P1-6 操作历史设计领先于实现

现状：

- 项目文档已将 `.nkc-ops` 纳入整体策略
- 当前已支持 `.nkc-ops` 最小持久化、重载恢复、AI source 过滤和基础可视化

价值：

- AI 操作追踪
- 回放
- 未来协作和审计

建议：

- 已完成最小持久化与基础可视化
- 后续重点转向更强的回放、筛选和审计 UI

---

## 十、推荐优先级

### 10.1 两周内

- 基于当前 `asset` 代理边界补正式 API 演进方案
- 基于 `timelineSync` 收敛更明确的双向语义范围

### 10.2 一个月内

- 强化场景级批量编辑与更高阶的 storyboard 工作流
- 完善多候选对比器和更强的批量审阅体验

### 10.3 一季度内

- 完善 `.nkc-ops` 的回放/审计体验
- 继续定义更强的 `canvas ↔ cut` 双向模型
- 推进角色一致性、素材引用注入等增强能力

---

## 十一、最终判断

`neko-canvas` 的方向没有问题。

它最适合成为：

> **Neko Suite 中，连接 Agent、Story、Assets、Sketch、Cut 的语义创作编排中枢**

当前真正需要解决的，不是“要不要让 canvas 更像 timeline”，而是：

- 能否继续收敛跨扩展边界
- 能否把场景级工作流和审阅体验做强
- 能否把操作审计与双向回流做成稳定能力

只有这些补齐后，`neko-canvas` 才能真正承担 **Agent-first IDE 主工作台** 的角色。
