# neko-cut 当前功能设计评估

> 评估日期：2026-04-08
> 评估方式：基于仓库当前代码的静态分析，未包含运行时导出验证与真实项目压力测试。

## 1. 评估目标

本文用于回答一个具体问题：

- 当前 `neko-cut` 的功能设计，是否已经满足“时间线编辑”和“视频创作”的实际需求？

评估重点聚焦五个方面：

1. 时间线核心编辑能力
2. 预览与播放闭环
3. 导出闭环
4. 创作辅助能力（字幕、素材、AI、音频）
5. 架构可扩展性与当前风险

## 2. 结论摘要

### 2.1 总体判断

当前 `neko-cut` 已经具备一个 Alpha 阶段视频剪辑器的主要骨架，能够支持：

- 多轨时间线基础编辑
- 拖拽导入与粗剪
- 预览播放与暂停态高质量合成
- 操作式撤销重做
- 与 Rust 引擎的增量同步
- 初步的 AI 辅助能力

但它还不能被视为“完整满足视频创作需求”的成熟方案。

### 2.2 评分判断

- 对“基础到中等强度时间线编辑需求”的满足度：`7/10`
- 对“完整视频创作闭环需求”的满足度：`5.5/10`

### 2.3 一句话判断

`neko-cut` 现在更适合“粗剪、实验性创作、AI 驱动工作流验证”，还不适合作为“稳定的专业视频编辑器”。

## 3. 已经具备的能力

### 3.1 工作区布局已形成标准 NLE 骨架

主界面已经形成：

- 上方预览
- 下方时间线
- 右侧属性面板

这套结构符合视频编辑器的基本使用模型。

代码入口：

- `packages/neko-cut/packages/webview/src/App.tsx`

关键位置：

- `PreviewPanel + PreviewControls + Timeline + PropertyPanelInline`

### 3.2 时间线编辑核心已经不是“展示级 UI”

当前时间线已经具备以下能力：

- 多轨编辑
- 缩放
- 吸附
- 框选
- 轨道重排
- 文件拖拽导入
- 分割
- 删除
- 复制粘贴
- 导出入口

对应实现：

- `packages/neko-cut/packages/webview/src/components/Timeline/Timeline.tsx`
- `packages/neko-cut/packages/webview/src/hooks/useTimelineDragDrop.ts`
- `packages/neko-cut/packages/webview/src/hooks/useTimelineActions.ts`

### 3.3 元素交互能力已具备剪辑器核心手感

元素层已经支持：

- 拖动位置
- 左右裁切
- 跨轨移动
- 多选批量移动
- 拖拽结束后提交为可撤销操作

这是判断时间线是否“进入可用状态”的关键指标。

对应实现：

- `packages/neko-cut/packages/webview/src/components/Timeline/TimelineTrack.tsx`

### 3.4 操作模型设计是正确的

编辑操作统一走：

`EditOperation -> applyOperation -> undo/redo -> sync to Extension -> sync to engine`

这说明项目没有把剪辑逻辑散落在 UI 事件里，而是采用了更适合后续扩展、协作和 AI 接入的契约式操作模型。

对应实现：

- `packages/neko-cut/packages/webview/src/stores/slices/dispatchSlice.ts`
- `packages/neko-cut/packages/webview/src/stores/slices/operationHistorySlice.ts`
- `packages/neko-types/src/operations/apply.ts`

### 3.5 预览链路已经打通到 Rust 引擎

当前预览不是前端本地拼接的假预览，而是：

- 编辑器打开时创建 editor-level stream
- Webview 通过 WS 接收 H.264 / PCM
- 运行中支持 pause / resume / seek / quality / speed / operation apply

对应实现：

- `packages/neko-cut/packages/extension/src/services/MediaService.ts`
- `packages/neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts`
- `packages/neko-cut/packages/webview/src/components/PreviewPanel/PreviewPanel.tsx`

### 3.6 素材导入体验已具备创作价值

拖入视频时会：

- 自动计算时长
- 自动探测是否带音轨
- 自动补出关联音频轨
- 自动探测内嵌字幕轨并创建字幕轨

这已经超出“手动摆素材”的初级剪辑器范畴。

对应实现：

- `packages/neko-cut/packages/webview/src/stores/slices/elementOpsSlice.ts`

### 3.7 项目文件具备协作友好性

保存时会把路径收敛为：

- 相对路径
- 或 `${VAR}/path` 形式

这符合仓库对可移植项目文件的要求，也适合 Git 协作。

对应实现：

- `packages/neko-cut/packages/extension/src/services/tools/helpers.ts`
- `packages/neko-cut/packages/extension/src/editor/video/messageHandler.ts`

## 4. 当前不能完全满足创作需求的关键问题

### 4.1 编辑态 / 预览态 / 导出态的 P0 一致性已基本收敛

前几轮 P0 已经补上以下真实不一致：

- `transitionIn/transitionOut` 已统一为主字段，预览与导出保留 legacy 兼容读取
- `effects / colorCorrection / masks` 已补齐导出转换，不再在导出阶段清空
- 暂停态高质量预览已按元素 `speed / reverse / timeRemap` 计算 `sourceTime`

本轮又补齐了播放态预览的全局倍率契约：

- Webview store 新增全局 `playbackSpeed`
- `PreviewControls` 暴露播放倍率入口
- `App.tsx` 的本地播放时钟按 `playbackSpeed` 推进
- `PreviewPanel` 在 `resume` 与运行中变更时，把同一倍率发送给 `projectPlayback:resume/speed`

这里需要明确一个重要分层：

- `projectPlayback:*` 的 `speed` 表示预览流的全局播放倍率
- 元素自身的 `speed / reverse / timeRemap` 仍然属于 clip 级时间映射

结论：

- 之前的 P0 “字段一致性”问题已基本完成
- 当前更像是后续可继续优化的产品表达问题，而不再是阻塞闭环的模型缺口

对应实现：

- `packages/neko-cut/packages/webview/src/App.tsx`
- `packages/neko-cut/packages/webview/src/components/PreviewControls.tsx`
- `packages/neko-cut/packages/webview/src/components/PreviewPanel/PreviewPanel.tsx`
- `packages/neko-cut/packages/webview/src/stores/slices/playbackSlice.ts`
- `packages/neko-cut/packages/extension/src/services/MediaService.ts`
- `packages/neko-engine/packages/host-api/src/controllers/utils.rs`
- `packages/neko-engine/packages/engine-kernel/src/services/impls/stream_loop.rs`

### 4.2 暂停态高质量合成只覆盖 media 元素

暂停时的高质量合成逻辑 `buildCompositeLayers()` 当前只处理：

- `media`

没有覆盖：

- `text`
- `subtitle`
- `shape`
- `scene3d`

这意味着在“暂停检查画面细节”这个专业剪辑高频场景里，所见未必即所得。

对应实现：

- `packages/neko-cut/packages/webview/src/components/PreviewPanel/compositeUtils.ts`
- `packages/neko-cut/packages/webview/src/components/PreviewPanel/PreviewPanel.tsx`

### 4.3 波纹编辑只覆盖删除场景

当前 `rippleEditingEnabled` 只在 `removeElement()` 中使用。

已覆盖：

- 删除元素后，后续元素整体前移

未见完整覆盖：

- 插入素材
- 拖动素材
- 裁切长度变化
- 分割后的自动错位修正

所以它现在更像“局部波纹删除”，而不是完整的 ripple edit 系统。

对应实现：

- `packages/neko-cut/packages/webview/src/stores/slices/elementOpsSlice.ts`
- `packages/neko-types/src/operations/apply-element.ts`

### 4.4 素材库没有整合进主剪辑工作区

仓库中存在独立的素材库 Webview：

- `packages/neko-cut/packages/webview/src/assetLibrary.tsx`

但主编辑界面 `App.tsx` 并没有把素材库嵌入同一工作区。

这会导致创作流程出现割裂：

- 浏览素材
- 回到时间线
- 再进行摆放

对于视频创作工具来说，素材面板通常应成为主工作区组成部分，而不是独立入口。

### 4.5 字幕能力存在“两套体系”

当前代码同时存在：

- `subtitle` 轨道元素体系
- 独立 `SubtitlePanel` 组件体系

但主编辑器没有接入 `SubtitlePanel`。

同时，拖入字幕文件时走的是：

- `text` 轨

而不是：

- `subtitle` 轨

这意味着字幕能力还没有统一到一个明确的数据模型和交互入口上。

对应实现：

- `packages/neko-cut/packages/webview/src/components/Subtitles/SubtitlePanel.tsx`
- `packages/neko-cut/packages/webview/src/hooks/useTimelineDragDrop.ts`

### 4.6 AI 创作仍以辅助为主，自动成片能力未完成

当前 AI 动作中，部分能力已经接通：

- `ai-upscale`
- `ai-denoise`
- `ai-enhance`
- `ai-speech-to-text`
- `ai-generate-subtitles`
- `ai-remove-silence`

但仍有关键创作动作是 stub：

- `ai-auto-edit`
- `ai-match-music`

这意味着它还不能真正支撑“自动剪片”或“自动配乐成片”类需求。

对应实现：

- `packages/neko-cut/packages/extension/src/services/AIActionHandler.ts`

### 4.7 若干创作操作仍停留在占位实现

例如时间线上下文菜单中的：

- Reverse playback 仍是 TODO
- 速度菜单部分动作只是直接改 duration，没有完整速度语义闭环

这类功能在演示层足够，但在真实创作里还不够。

对应实现：

- `packages/neko-cut/packages/webview/src/components/Timeline/TimelineTrack.tsx`

## 5. 对“时间线编辑需求”的判断

### 5.1 已满足的需求

- 多轨素材编排
- 基础粗剪
- 拖拽定位
- 裁切
- 分割
- 跨轨移动
- 复制粘贴
- 轨道管理
- 吸附与时间线缩放
- 撤销重做

### 5.2 尚未完全满足的需求

- 全量波纹编辑
- 完整 slip / slide / roll 语义
- 播放态全局倍率与元素速度模型的明确分层
- 更强的多选编组与批量编辑
- 复杂时间重映射
- 更可靠的字幕时间线编辑入口

### 5.3 判断

对“时间线编辑”本身，当前设计已经基本达标 Alpha 可用线，但还未达到专业剪辑器成熟度。

## 6. 对“视频创作需求”的判断

### 6.1 已满足的部分

- 素材导入
- 时间线编排
- 基础预览
- 音频自动拆分
- 内嵌字幕探测
- AI 增强与转录类辅助
- 初步导出能力

### 6.2 尚未满足的核心部分

- 高级视觉效果稳定导出
- 字幕体系统一
- 素材库与主编辑界面一体化
- 自动剪辑工作流闭环
- 专业创作中的最终成片可靠性

### 6.3 判断

对“完整视频创作”而言，当前设计仍是“可创作，但不够稳定闭环”的状态。

## 7. 架构评价

### 7.1 优点

- 总体架构方向正确
- Rust 引擎与 Webview 责任边界清晰
- 操作模型适合 AI 与增量同步
- 可扩展性强
- 项目格式适合版本管理

### 7.2 风险

- Webview 扩展字段与引擎字段之间存在漂移风险
- 预览链路与导出链路的能力不一致
- UI 上已暴露的能力并不总是完整落到底层模型
- 组件很多，但主工作区整合度还不足

## 8. 优先级建议

### P0

- 已完成：统一 `transitionIn/transitionOut` 与 `inTransition/outTransition` 命名
- 已完成：打通 `effects / colorCorrection / masks` 的导出链路
- 已完成：暂停态高质量预览已按元素 `speed / reverse / timeRemap` 计算 `sourceTime`
- 已完成：补齐播放态预览的全局播放倍率状态、UI 与消息契约
  - 当前 `projectPlayback:resume.speed` / `projectPlayback:speed` 已明确为 stream playback speed
  - 元素级 `speed` 与全局预览倍率已在实现层分离

### P1

- 将暂停态高质量合成扩展到 `text / subtitle / shape / scene3d`
- 把字幕体系收敛到单一入口和单一模型
- 将素材库嵌入主编辑工作区

### P2

- 完整波纹编辑
- 更丰富的时间编辑语义
- 自动剪辑与自动配乐闭环
- 反向播放与更完整的速度系统

## 9. 最终结论

如果目标是：

- 验证 `Neko Suite` 在 VSCode 内做视频剪辑的可行性
- 打造 AI 驱动的视频创作原型
- 构建可扩展的时间线编辑内核

那么当前 `neko-cut` 的设计是成立的。

如果目标是：

- 直接满足专业视频创作者的稳定生产需求
- 保证复杂效果在预览与导出中完全一致
- 提供完整成片级创作体验

那么当前实现仍存在明显差距。

因此，当前阶段最准确的定位应为：

**一个架构方向正确、核心能力已成型、但创作闭环仍需补完的 Alpha 视频剪辑器。**
