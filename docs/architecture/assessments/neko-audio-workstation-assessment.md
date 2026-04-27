# Neko Audio 工作站能力与 UI 评估

## 1. 文档目的

本文用于评估 `neko-audio` 当前的产品能力、界面设计成熟度，以及它与专业音频工具台之间的差距。

目标不是评价“是否已经能用”，而是回答以下问题：

- 当前版本更像什么类型的音频产品。
- 现有 UI 是否支撑完整的音频创作工作流。
- 距离专业音频工作站还缺哪些关键能力和组件。
- 后续应该按什么优先级补齐。

---

## 2. 当前定位判断

基于当前实现，`neko-audio` 更接近：

- VSCode 内嵌的 Alpha 级音频编辑器
- 带多轨工程骨架的轻量音频工作台
- 面向“查看、试听、裁剪、简单处理、导出”的工具

它暂时还不是成熟的专业 DAW（Digital Audio Workstation），原因不在于效果器数量，而在于核心工作流尚未闭环：

- 多轨工程播放与导出尚未真正围绕整个工程运作
- 时间线编辑深度不足
- 录音链路不具备专业录音工作流
- 混音台、路由、自动化、母带监看等关键界面缺失

---

## 3. 当前已具备能力

### 3.1 单文件编辑与分析

当前单文件模式已经具备一条相对完整的轻编辑链路：

- 音频文件探测与元信息展示
- 波形显示
- 播放、暂停、停止、seek、速度切换
- 区域框选
- 裁剪
- 频谱分析
- 响度分析结果展示
- 静音区域可视化
- 录音
- 导出

这套能力足以支撑以下场景：

- 配音文件初步清理
- 播客片段试听与粗剪
- 采访音频的快速预处理
- 音频素材检查与导出

### 3.2 多轨工程骨架

`.nka` 项目格式和多轨时间线基础已经存在：

- 工程文件结构
- 轨道列表
- 音频片段导入
- 波形缩略图
- 轨道静音、锁定、删除、排序
- 片段静音、复制、删除
- 工程缓存与保存
- EditOperation 同步机制

这说明架构上已经朝“可演进为多轨工作站”的方向前进。

### 3.3 引擎侧基础能力

引擎层已经有若干重要基础设施：

- waveform
- stream
- record_start / record_stop
- mixdown
- loudness analysis
- silence detection

因此问题主要不在“完全没有底层能力”，而在“产品层和 UI 层没有把能力组织成完整工作流”。

---

## 4. 与专业音频工具台的功能差距

### 4.1 工程级播放与导出未闭环

这是当前最核心的差距。

虽然已有多轨工程、轨道和片段，但工程模式下很多操作仍围绕“第一个音频文件”展开，而不是围绕整个项目：

- 播放更像预览某个源文件，而非回放完整工程
- trim / effect / denoise / normalize / export 没有稳定地绑定到工程 mixdown
- 引擎虽有 `audios:mixdown`，但产品工作流没有完整接通

这意味着当前 UI 里的多轨，更像“可视化与组织层”，还不是可依赖的制作层。

### 4.2 时间线编辑深度不足

专业音频编辑器的核心在于时间线编辑密度，而当前版本明显不足。

缺失或较弱的能力包括：

- 片段拖拽移动
- 边缘裁剪手柄
- split / ripple / slip / slide
- crossfade
- clip 级 fade handle
- snap / grid
- loop region
- range / region 编辑
- 多选与批量编辑

当前时间线更像“轨道内容浏览器”，而不是“高效编辑时间线”。

### 4.3 录音工作流不专业

当前录音 UI 能完成“录下来并保存”，但还不像制作台上的录音流程。

缺失的录音工作流包括：

- record arm
- input monitor
- 低延迟监听反馈
- count-in / pre-roll
- punch in / punch out
- take lanes
- 录音后自动进时间线
- 录音与轨道/工程状态绑定

对配音、采访、音乐录制来说，这些是高频功能，不是增强项。

### 4.4 混音能力远未达到专业工作台

当前混音相关能力更偏“音频叠加”而非真正的混音系统。

缺失内容包括：

- 通道条 mixer
- master bus
- bus / group
- send / return
- per-track insert rack
- per-track pan / gain / meter 可视化
- solo
- automation
- stem export
- sidechain

专业工具台的核心不是“能加效果器”，而是“可以组织复杂路由与动态控制”。这一层当前基本还未进入产品界面。

### 4.5 母带与质检能力过轻

已有响度信息与简单频谱，但对专业交付仍不足。

缺失内容包括：

- 持续型 loudness meter
- 峰值 / RMS / LUFS 联合监看
- phase / correlation meter
- spectrogram
- true peak 警报区间
- render 前质检视图
- 导出预设与交付模板

当前更像“分析结果展示”，而不是“工程级监看与质检面板”。

### 4.6 创作组织能力不足

专业音频工具不只是编辑器，也是会话管理器。

当前仍缺：

- marker / region 可视化与编辑
- 资源面板 / 素材箱
- recent / favorite / search
- preset browser
- 工程模板
- 多版本导出队列
- 任务状态与后台 render 队列

---

## 5. UI 设计是否满足音频制作需求

## 5.1 当前 UI 满足的场景

当前 UI 可以满足以下场景：

- 单条音频的试听、检查与粗修
- 简单裁剪与导出
- 轻量配音录制
- 简单多轨素材导入与排列
- 开发者在 VSCode 内快速处理音频资产

换句话说，它满足的是“轻工作流”。

## 5.2 当前 UI 不满足的场景

以下场景当前 UI 不足以支撑：

- 长时间多轨编辑
- 配音项目反复录制与 comping
- BGM、SFX、Voice 的完整混音
- 节目级播客制作
- 音乐制作与母带
- 对外交付前的质量监看

问题不只是功能缺失，也包括信息密度、编辑反馈和工作区组织不够。

## 5.3 当前 UI 的优点

- 主界面结构清晰：工具栏、transport、主编辑区、侧栏，基本符合音频软件的心理模型
- 波形、时间线、频谱、响度、录音、导出这些关键入口已经露出
- 样式系统已经建立了比较统一的 DAW 视觉语言
- 适配了 VSCode 主题，能较自然融入主宿主环境

这说明 UI 不是从零开始，而是已经具备可扩展骨架。

## 5.4 当前 UI 的主要问题

### 5.4.1 工作区分层不够

当前右侧侧栏只有：

- Effects
- Recording
- Export

但专业音频工作流至少还需要：

- Inspector
- Mixer
- Marker / Region
- Browser / Asset Bin
- Master / Meter

否则用户需要频繁切换上下文，难以形成连续创作节奏。

### 5.4.2 时间线交互密度过低

时间线目前能“看”，但不能高效“编”。

表现为：

- 轨道头信息少
- 片段上没有可视化编辑手柄
- 缺少吸附、网格、循环、标记
- 没有编辑模式切换

音频制作的核心区域应该是时间线，而不是单纯波形查看区。

### 5.4.3 录音界面像工具，不像工作台

录音面板目前提供的是基础录音功能，但缺少：

- 录音前准备状态
- 录音轨道上下文
- 监听状态
- take 管理
- 录音后结果确认与入轨反馈

因此更像一个“录音工具组件”，不是制作流程的一部分。

### 5.4.4 分析界面过于轻量

频谱和响度目前更偏“辅助显示”，不是稳定监看面板。

这会导致：

- 混音时缺少可靠的视觉反馈
- 母带与交付判断困难
- 无法持续监控峰值、响度区间和相位问题

### 5.4.5 属性编辑区尚未成型

已经存在 `AudioProperties` 组件草稿，但没有进入主工作流。

这说明界面设计里已经意识到需要属性检查器，只是还没落地到实际工作区中。

---

## 6. 需要补齐的音频创作组件

以下组件建议按“录音、编辑、混音、母带、组织”五类补齐。

### 6.1 会话与传输组件

- Transport Bar 2.0
- Timecode / Bars-Beats 切换器
- Zoom 控件
- Snap / Grid 开关
- Loop 区域控制
- Pre-roll / Count-in 控件

### 6.2 时间线与编辑组件

- Marker Lane
- Region Lane
- Clip Handles
- Fade Handles
- Split Tool
- Range Tool
- Multi-select Box
- Crossfade Editor
- Automation Lane
- Track Height / Track Collapse 控件

### 6.3 轨道与通道组件

- Track Header Strip
- Record Arm Button
- Solo Button
- Monitor Button
- Track Meter
- Pan Knob
- Gain / Volume Fader
- Input / Output Routing Selector
- Track Color / Icon

### 6.4 混音与效果组件

- Mixer Panel
- Channel Strip
- Master Strip
- Insert Rack
- Send / Return Rack
- Bus / Group Panel
- Preset Browser
- Effect Preset Save / Recall
- A/B Compare

### 6.5 录音与 take 管理组件

- Recording Workspace
- Input Device Panel
- Live Monitor Meter
- Take Lane View
- Punch In / Out Overlay
- Record Review Dialog
- Auto Insert To Track Flow

### 6.6 分析与母带组件

- Loudness Meter
- Peak / RMS Meter
- Phase Correlation Meter
- Spectrogram
- Master Analysis Panel
- Export Quality Checklist
- Delivery Preset Panel

### 6.7 素材与工程组织组件

- Asset Browser
- Search / Filter Bar
- Favorites / Recent 面板
- Project Template Selector
- Render Queue
- Stem Export Panel
- Session Notes / Markers Panel

---

## 7. 推荐产品边界

如果目标只是“补齐功能”，项目很容易滑向全能 DAW，成本会迅速失控。

更合理的做法，是先明确 `neko-audio` 到底要成为什么。

### 7.1 三种可能方向

#### 方向 A：单文件音频编辑器

特点：

- 聚焦单文件试听、裁剪、降噪、标准化、导出
- 学习成本低
- 与当前实现最接近

问题：

- 天花板较低
- 难以支撑真正的创作会话
- 多轨能力会长期处于“半成品”

#### 方向 B：面向配音 / 播客 / 声音资产制作的轻量工作台

特点：

- 聚焦 spoken audio，而不是全音乐制作
- 强调录音、粗剪、精剪、响度达标、批量导出
- 适合 VSCode 场景下的开发者、内容创作者、游戏音频资产处理

优势：

- 与当前多轨、波形、分析、导出能力最匹配
- 可以在不引入 MIDI / 乐器 / 节拍编曲系统的前提下建立完整闭环
- 产品边界清晰，研发投入可控

这是目前最推荐的方向。

#### 方向 C：全功能音乐 DAW

特点：

- 需要 tempo / beat grid、MIDI、虚拟乐器、插件宿主、延迟补偿、复杂自动化
- 目标接近 Logic / Cubase / Ableton / Reaper

问题：

- 与当前实现差距过大
- 会显著抬高引擎、协议、UI、性能和设备兼容性成本
- 在 VSCode 内部并不是最自然的第一目标

### 7.2 推荐定位

建议把 `neko-audio` 在未来 1 到 2 个大版本内，明确定位为：

- VSCode 内的轻量音频制作工作台
- 优先服务配音、播客、采访、声音素材整理、游戏音频资产处理
- 暂不追求 MIDI、虚拟乐器、乐谱、音乐编曲级节拍系统

这样做的好处是：

- 可以集中投入时间线编辑、录音闭环、混音基础、响度交付
- 更容易形成差异化，而不是与成熟 DAW 正面对撞
- 更符合 Neko Suite 作为创意工作套件的产品语境

---

## 8. 目标工作区信息架构

当前三栏布局是一个有效起点，但不适合继续把所有功能塞进单一右侧面板。

更合理的目标形态应是“中心时间线 + 左右停靠区 + 底部工作台”的结构。

### 8.1 建议布局

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 顶部：Mode / Transport / Timecode / Loop / Snap / Zoom / Device    │
├──────────────┬──────────────────────────────────────┬───────────────┤
│ 左侧停靠区   │ 中央主工作区                           │ 右侧停靠区    │
│ Browser      │ Marker Lane                           │ Inspector     │
│ Assets       │ Region Lane                           │ Clip/Track    │
│ Templates    │ Timeline Ruler                        │ Master        │
│ Notes        │ Track Headers + Clip Lanes            │ Effects       │
│              │ Automation / Take Lanes               │ Export        │
├──────────────┴──────────────────────────────────────┴───────────────┤
│ 底部工作台：Mixer / Analyzer / Take Review / Render Queue          │
├──────────────────────────────────────────────────────────────────────┤
│ 状态栏：Sample Rate / Channels / Latency / Peak Warning / Tasks    │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.2 各区域职责

#### 顶部栏

负责会话级控制，而不是只放播放按钮。

建议至少包含：

- 播放、暂停、停止、录音
- 时间显示与跳转
- zoom、snap、grid、loop
- 录音设备与监听状态
- 当前工程采样率、通道信息

#### 左侧停靠区

负责“找东西”和“组织东西”。

建议放：

- Asset Browser
- Search / Filter
- Favorites / Recent
- Project Template
- Session Notes

#### 中央主工作区

这是音频制作的核心，不应继续偏向“查看波形”。

建议中心区域长期固定为：

- Marker Lane
- Region Lane
- Timeline Ruler
- Track Header + Clip Lane
- Automation Lane
- Take Lane

其中波形视图应该成为时间线的一部分，而不是与时间线并列竞争主区域。

#### 右侧停靠区

负责上下文属性编辑，不负责承载所有生产功能。

建议改成 Inspector 驱动：

- 选中 clip 时显示 clip inspector
- 选中 track 时显示 track inspector
- 未选中时显示 session / project inspector
- 切到 master 时显示 master chain 与交付目标

#### 底部工作台

负责高信息密度但不需要常驻全高显示的面板。

建议承载：

- Mixer Lite
- Analyzer
- Take Review
- Render Queue
- 批量导出进度

### 8.3 Inspector 的最小上下文模型

当前 `AudioProperties` 已经说明项目需要属性检查器，但它还停留在“单文件 volume / pan / gain”层面。

真正可用的 Inspector 应至少分成四种上下文：

- Clip Inspector：起止时间、源偏移、增益、淡入淡出、片段备注、片段效果
- Track Inspector：名称、颜色、输入输出、arm、solo、mute、monitor、轨道插入链
- Master Inspector：主输出电平、响度目标、总线效果、true peak 状态
- Project Inspector：采样率、通道数、默认导出预设、工程备注

---

## 9. 建议的 UI 演进优先级

### P0：先让它成为“可连续编辑的音频工具”

优先补：

- 独立 zoom / grid / loop 控件
- Marker Lane
- Clip 拖拽与 trim handle
- Inspector
- Track Header Strip 基础版
- 录音入轨闭环

目标是先把“多轨编辑”从展示层推进到可操作层。

### P1：让它成为“可用的轻量制作台”

继续补：

- Mixer Lite
- Solo / Arm / Monitor
- Track Meter
- Automation Lane
- 更强的录音工作区
- 素材浏览器

目标是支撑播客、配音、多素材项目。

### P2：再向“专业工作站”靠近

最后补：

- Bus / Send / Return
- Master Meter Suite
- Spectrogram
- Stem Export
- Take Lanes / Comping
- Tempo / Beat / Music-oriented UI

目标是逐步进入专业混音与更复杂制作场景。

---

## 10. 最小创作闭环矩阵

下面这组组件不是“锦上添花”，而是让 `neko-audio` 从演示级 UI 变成可持续创作界面的最低配置。

| 工作流 | 最小组件 | 当前状态 | 优先级 |
| --- | --- | --- | --- |
| 导入与整理 | Asset Browser、搜索过滤、拖拽入轨、素材预听 | 部分具备 | P1 |
| 录音 | Arm、Monitor、设备选择、Pre-roll、自动入轨、Take Review | 明显不足 | P0 |
| 编辑 | Marker Lane、Clip Drag、Trim Handle、Split、Fade、Snap/Grid、多选 | 明显不足 | P0 |
| 混音 | Track Strip、Pan、Gain、Meter、Solo、Master Strip | 大部分缺失 | P1 |
| 质检 | Loudness Meter、Peak Meter、Phase、导出前检查 | 只有轻量分析 | P1 |
| 导出交付 | Export Preset、Render Queue、Stem Export、后台任务状态 | 基础导出存在 | P1-P2 |

如果只允许先补一条链路，应该优先补：

- 录音入轨
- 时间线精剪
- 响度达标导出

因为这三者构成了配音 / 播客 / 声音资产处理最常见的主路径。

---

## 11. 基于现有架构的落地路线

### 11.1 先修契约，再堆界面

当前最大的风险之一，不是按钮不够，而是产品动作和底层契约没有完全对齐。

例如：

- `AudioService` 当前发的是 `audios:loudness` 和 `audios:silence`
- 引擎控制器暴露的是 `audios:analyze_loudness` 和 `audios:detect_silence`
- `transcode` 当前传入了 `startTime / endTime / effects`，但引擎请求结构并未显式接收这些编辑语义

这意味着如果先大规模补 UI，很可能得到“看起来能点，但实际没有稳定落到引擎”的假闭环。

因此建议先做：

- 对齐分析动作命名
- 明确单文件导出与工程导出的协议边界
- 为项目级渲染建立明确契约，避免继续把工程语义塞进 `transcode`

### 11.2 推荐的状态分层

基于当前实现，状态职责可以继续收口成三层：

- `audioStore`：会话 UI 状态、transport、选择态、dock 布局、toast
- `audioProjectStore`：工程结构、tracks、clips、markers、undo/redo、project edits
- 新增 metering / recording slice：监听电平、录音设备、take 状态、后台 render 任务

这样可以避免把“单文件播放状态”和“工程级制作状态”继续混在一起。

### 11.3 推荐的实现顺序

#### P0：打通制作主链路

1. 对齐 `AudioService` 与引擎 action 契约
2. 把项目播放 / mixdown / export 变成明确的工程级能力
3. 为时间线补齐 marker、clip drag、trim、split、snap
4. 把录音结果自动入轨，并提供录音后确认反馈
5. 把 Inspector 接进主界面，而不是继续堆孤立面板

#### P1：建立轻量工作台

1. 引入 Mixer Lite 和 Track Header Strip
2. 增加 solo、arm、monitor、meter
3. 接入 Asset Browser、搜索与素材预听
4. 增加 Export Preset、Render Queue、项目模板
5. 增加持续型 loudness / peak 监看

#### P2：向专业工作站延展

1. 引入 automation lane
2. 引入 take lanes / comping
3. 引入 bus / send / return
4. 引入 spectrogram、phase correlation、master QC
5. 评估是否需要音乐导向能力，而不是默认继续扩张

### 11.4 不建议当前阶段立即投入的方向

以下内容虽然属于专业 DAW 能力，但不建议在当前阶段优先投入：

- MIDI piano roll
- 虚拟乐器宿主
- 节拍编曲与乐谱
- 复杂 sidechain 与延迟补偿系统
- 全量第三方插件生态兼容

这些能力会显著抬高复杂度，却不能优先解决 `neko-audio` 现在最核心的“编辑与制作闭环”问题。

---

## 12. 最终结论

`neko-audio` 当前的 UI 设计已经具备音频工具的基础骨架，但还没有达到“音频制作工作台”的完整程度。

更准确地说：

- 它已经能支撑轻量音频处理
- 还不能稳定支撑完整音频创作流程
- 当前最需要补的不是更多按钮，而是更完整的工作区组织和编辑反馈

后续若要把它真正做成 VSCode 内的音频工作站，重点应放在：

- 时间线编辑密度
- 轨道与混音工作区
- 录音闭环
- 分析与母带监看
- 工程组织与导出流程

只要这五个方向收口，`neko-audio` 才会从“能处理音频”升级为“适合长期创作音频”。
