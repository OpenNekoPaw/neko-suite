# ADR: neko-audio AI DAW 需求分析

> **Status**: Accepted / P0 foundation implemented (2026-05-21)
> **Context**: 对比 Ardour 9 评估 neko-audio 是否满足 AI DAW 要求，明确缺口与优先级

> **Implementation Update (2026-05-21)**: P0-A/P0-B/P0-C 已通过 OpenSpec change `implement-ai-daw-foundation` 落地：
> `.nka v2.2` TempoMap、bars/beats grid、tick-based automation lanes、`SetTrackAutomation` Agent 工具、Engine track volume/pan automation 渲染，以及 AI-originated operation 高亮。P1 仍保留 MIDI/Piano Roll、实时 meter、crossfade 等体验增强项。

---

## 1. 当前 neko-audio UI 能力盘点

| 能力 | 状态 | 对应 Ardour |
|------|------|------------|
| 多轨时间线 + 波形显示 | 有 | 有 |
| Transport (播放/停止/循环/BPM) | 有 | 有 |
| Track Mute/Solo/Volume/Pan | 有 (MixerPanel) | 有 |
| 效果链 (16 种 engine 可渲染效果) | 有 | 有 (插件架构) |
| Undo/Redo (200 步) | 有 | 有 |
| 导出 (WAV/MP3/FLAC/AAC/OGG) | 有 | 有 |
| 频谱分析 + LUFS 响度 | 有 | 有 (需插件) |
| AI Agent 工具 (最多 18 个，由 AgentCapabilityProvider 暴露) | **有** | **无** |
| 预设系统 (podcast/music/voice/sfx) | 有 | 有 |
| 录音 | 有 (RecordingPanel) | 有 |

### 最多 18 个 AI Agent 工具

> 15 个基础工具始终注册；GenerateMusic / GenerateSFX / GenerateVoice 仅在 `context.mediaService` 存在时注册（见 `agentCapabilityProvider.ts:294`）。

**项目信息**: GetAudioProjectInfo, ListAudioTracks

**轨道操作**: AddAudioTrack, RemoveAudioTrack, SetTrackProperties, ImportAudio, SetTrackVolume, SetTrackPan

**效果处理**: ApplyTrackEffect, RemoveTrackEffect, ApplyMasterEffect

**导出与分析**: MixExport, AnalyzeAudioLoudness, AudioDenoise

**AI 媒体生成**: GenerateMusic, GenerateSFX, GenerateVoice

**ML 处理**: StemSeparation (placeholder, 待 Engine ML 模型)

---

## 2. Ardour 有但 neko-audio 缺失的功能分析

| Ardour 功能 | AI DAW 是否需要 | 理由 |
|-------------|:---:|------|
| MIDI 编辑器 / Piano Roll | **需要** | AI 生成 MIDI → 用户微调是核心场景 |
| Automation Lanes (参数自动化) | **需要** | Volume/Pan/Effect 参数随时间变化是混音基础 |
| Bus / Send / Routing (信号路由) | 不急需 | AI 可以直接操作 track effect chain，路由是高级场景 |
| 插件架构 (VST/AU/LV2) | 不需要 | Engine 内置效果 + AI 预设已覆盖；VSCode sandbox 限制插件加载 |
| Region/Take 管理 | 低优先 | AI 生成→替换的流程比 take comping 更自然 |
| 时间码 / SMPTE 同步 | 不需要 | 创意工具非后期同步场景 |
| 高级量化 / Groove 模板 | 低优先 | AI 生成已自带节奏 |
| Punch In/Out 录音 | 低优先 | AI 场景下更多是生成而非录音 |

---

## 3. 核心判断：AI DAW ≠ 全功能 DAW

**不需要全功能 DAW。** 三个原因：

### 3.1 AI 改变了创作流程

传统 DAW 假设用户手动操作每个参数；AI DAW 的流程是：

```
描述意图 → AI 生成/混音 → 用户微调 → AI 迭代优化
```

neko-audio 的最多 18 个 AI 工具（15 基础 + 3 条件媒体生成）已经覆盖了"描述→生成"阶段。缺口在"微调"阶段的精细控制。

### 3.2 VSCode sandbox 限制了天花板

- 无法加载 VST/AU 插件（Webview sandbox 无 native 插件接口）
- 无法做低延迟 ASIO/CoreAudio 直连（音频通过 Engine streaming）
- 全功能 DAW 需要这些，但 AI DAW 不需要

### 3.3 neko-audio 的定位是创意编排器

它与 neko-cut（视频）、neko-story（剧本）、neko-canvas（画板）协同工作，不是独立音乐制作工具。跨扩展协作能力（Send-to-Timeline, Send-to-Agent）是 Ardour 没有的差异化优势。

---

## 4. 优先级缺口与当前状态

### P0-A — 节拍网格基础设施（已完成，Automation 的前置依赖）

| 能力 | 状态 | 涉及模块 |
|------|------|----------|
| **Snap/Grid 吸附** | 已完成：拖拽提交前在 tick 空间吸附，再写回 seconds | AudioTimeline + audioProjectStore |
| **Bars\|Beats 时间标尺** | 已完成：TimelineRuler / TransportBar 可显示 `bar:beat:tick` | TimelineRuler + TransportBar |
| **拍号 (Time Signature)** | 已完成：`.nka v2.2` 持久化 `timeSignatureEvents` | TransportBar + audioProjectStore + .nka codec |
| **TempoMap** | 已完成：`tempoMap` 是 v2.2 节拍源，`bpm` 仅兼容回填 | neko-types 契约 |

### P0-B — Automation Lanes（已完成 P0 基础）

| 能力 | 状态 | 涉及模块 |
|------|------|----------|
| **Automation Lanes** | 已完成：`AudioTrackMixState.automation`、`.nka` codec/validator、operation/invert、Webview lane UI/store、Agent `SetTrackAutomation`、`buildMixConfig`、Engine track volume/pan 渲染均已接入 | 见 §7.5 PR 组 B（B1-B9） |
| **Effect parameter automation** | 契约与校验已完成；当前 Engine 明确 warning 跳过 effect-param 渲染，避免静默错误 | shared metadata + buildMixConfig + engine |

### P0-C — AI 操作可视化反馈（已完成）

| 能力 | 状态 | 涉及模块 |
|------|------|----------|
| **AI 操作可视化反馈** | 已完成：`project:sync.operation.meta.source === 'ai'` 只驱动 transient highlight / badge，不重新应用 mutation，undo 仍走 shared operation path | audioProjectStore + AudioClip + TrackHeader + MixerPanel |

### P1 — 体验提升

| 缺口 | 说明 | 涉及模块 |
|------|------|----------|
| **MIDI Track + Piano Roll** | AI 生成旋律 → MIDI 轨道 → 用户调音符。当前只有 AudioElement，无 MidiElement。需要新增 MidiTrack 类型 + Piano Roll 编辑器组件 | engine-types + audioProjectStore + 新 PianoRoll 组件 |
| **Clip Crossfade** | 相邻 clip 交叉淡化。当前 AudioClip 支持 move/resize/split 但无 crossfade UI | AudioClip + engine-kernel (crossfade 混音) |
| **Master/Track Meter** | 实时电平表。Ardour mixer strip 有详细电平显示；neko-audio 的 MixerPanel 只有 fader 无 meter。AI 分析响度后用户需要视觉确认 | MixerPanel + engine streaming (peak/RMS 数据) |

### P2 — 可以不做

| 功能 | 理由 |
|------|------|
| Bus / Send / Routing | AI 直接操作 track effect chain，路由是专业混音场景 |
| VST/AU/LV2 插件 | VSCode sandbox 限制；Engine 16 种内置效果 + AI 预设已覆盖 |
| SMPTE 时间码同步 | 创意工具，非后期同步场景 |
| Punch In/Out | AI 生成替代录音为主 |
| Groove 模板 / 高级量化 | AI 生成已自带节奏结构 |
| Region/Take Comping | AI 生成→替换比 take 管理更自然 |

---

## 5. UI 控件逐项对比 (vs Ardour 9)

### 5.1 Transport 区域

| 控件 | Ardour | neko-audio | 缺失影响 |
|------|--------|-----------|---------|
| Play / Pause | 有 | 有 | — |
| Stop | 有 | 有 | — |
| Record | 有 (全局 + 每轨 Arm) | 有 (全局按钮) | **每轨 Record Arm 缺失** — AI 录音场景需要指定录到哪条轨 |
| Loop | 有 | 有 | — |
| Rewind / Forward | 有 (独立按钮) | 无按钮，仅键盘 ←→ | 低影响，键盘已覆盖 |
| 回到开头 / 末尾 | 有 (按钮) | 无按钮，仅 Home/End 键 | 低影响 |
| Punch In/Out | 有 | 无 | 不需要（AI 场景） |
| 时间显示 | 双格式 (Bars\|Beats + Timecode) | 单格式 (MM:SS.MS) | **Bars\|Beats 显示缺失** — 音乐编辑需要小节/拍定位 |
| BPM | 有 | 有 | — |
| 拍号 (Time Signature) | 有 (TS: 4/4) | 无 | **缺失** — 拍号影响节拍网格划分 |

### 5.2 编辑工具栏

| 控件 | Ardour | neko-audio | 缺失影响 |
|------|--------|-----------|---------|
| 编辑模式 (Slide/Ripple/Lock) | 有 | 无 | **Ripple 模式缺失** — 删除/移动 clip 后续 clip 自动跟随，AI 编排常用 |
| 鼠标模式 (Object/Range/Gain) | 有 (Smart 整合) | 无显式切换 | 中等影响，当前隐式处理 |
| Snap 吸附 + Grid 类型 | 有 (Beat/Bar/Seconds) | 无 | **缺失** — clip 对齐到节拍是音乐编辑基础 |
| Nudge 微调 | 有 | 无 | 低影响，可后补 |

### 5.3 每轨控件 (TrackHeader)

| 控件 | Ardour | neko-audio | 缺失影响 |
|------|--------|-----------|---------|
| Mute (M) | 有 | 有 | — |
| Solo (S) | 有 | 有 | — |
| Record Arm (R) | 有 (红圆点) | 无 | **缺失** — 多轨录音需要 |
| Volume Fader | 有 | 有 (range 0-2) | — |
| Pan Knob | 有 | 有 (range -1 to 1) | — |
| Lock (L) | 无 | 有 | neko 独有 |
| Delete (×) | 右键菜单 | 有 (直接按钮) | neko 更直观 |
| Track Color | 有 | 有 (trackViewState) | — |
| Track Height 拖拽调整 | 有 | 有 (TrackLane resize handle) | — |
| Automation 展开 (A) | 有 (P/A/G 按钮) | 无 | **P0 缺失** — 对应 Automation Lanes |
| Input/Output Routing | 有 | 无 | 不需要（Engine 统一处理） |
| FX 插槽可视化 | 有 (insert 列表) | 有 (FX badge 计数) | 只显示数量，**不能直接点击编辑** |

### 5.4 Mixer 区域

| 控件 | Ardour | neko-audio | 缺失影响 |
|------|--------|-----------|---------|
| Volume Fader | 有 (垂直大推子) | 有 (水平小滑条) | **视觉弱** — DAW 推子通常是垂直的，更精确 |
| Pan | 有 | 有 | — |
| Solo / Mute | 有 | 有 | — |
| **Peak Meter (电平表)** | 有 (多段 LED 柱) | **仅文字 dB 值** | **P1 缺失** — 没有实时动态电平条，用户无法视觉感知音量 |
| Clip Indicator (过载指示) | 有 (红灯) | 无 | 缺失，应随电平表一起加 |
| Master Bus 推子 | 有 (独立 Master strip) | 数据层有 (`masterVolume` in .nka)，`buildMixConfig` 已传给 engine | **编辑通路 + UI 缺失** — 缺 `audio.setMasterVolume` operation/invert/store setter/extension sync + MixerPanel Master strip 推子 |
| Pre/Post Fader Send | 有 | 无 | 不需要 |

### 5.5 时间线 (Timeline)

| 控件 | Ardour | neko-audio | 缺失影响 |
|------|--------|-----------|---------|
| 时间标尺 | 有 (Timecode + Bars) | 有 (仅 MM:SS) | **Bars/Beats 标尺缺失** |
| Range Markers | 有 (专门一行) | 有 (markers 数据) | 标记行 UI 不够明显 |
| Location Markers | 有 (专门一行) | 同上 | — |
| Playhead 拖拽 | 有 | 有 (click-to-seek) | — |
| Clip Crossfade | 有 (自动交叉淡化) | 无 | P1 缺失 |
| Clip Gain 包络 | 有 (clip 内音量曲线) | 无 | 中等影响 |
| 缩放控件 | 有 | 有 (slider + Ctrl+Wheel) | — |

### 5.6 底部状态栏

| 控件 | Ardour | neko-audio | 缺失影响 |
|------|--------|-----------|---------|
| I/O Latency | 有 | 无 | 低影响（streaming 模式下用户不关心） |
| DSP 使用率 | 有 | 无 | 低影响 |
| 磁盘/录音状态 | 有 | 无 | 低影响 |

### 5.7 neko-audio 当前控件统计

| 控件类型 | 数量 | 示例 |
|---------|------|------|
| Icon Buttons | 12+ | Play, Stop, Record, Loop, Mute, Spectrum 等 |
| Toggle Buttons | 8+ | Solo, Mute, Lock (每轨), Spectrum, Panel 切换 |
| Range Sliders | 8+ | Volume, Pan (每轨), Transport playback volume, Zoom |
| Dropdown Select | 1 | Speed (0.25x - 4.0x) |
| Number Input | 1 | BPM (20-300) |
| Action Buttons | 5+ | Trim, Analyze Loudness, Detect Silence, Denoise, Normalize |

---

## 6. UI 控件缺失优先级汇总

### P0 — 结构性缺失（"能当 DAW 用"的分界线）

> 以下为纯 UI 控件缺口。节拍网格（Snap/Grid + Bars|Beats + 拍号）和 Automation Lanes 的完整落地计划见 §4 P0-A / P0-B 和 §7。

| 缺失控件 | 理由 | 涉及模块 |
|----------|------|----------|
| **Automation 按钮 + Lane 展开** | 没有这个，Automation Lanes 功能无法落地。每轨需要 A 按钮展开参数曲线 | TrackHeader + 新 AutomationLane 组件 |
| **Snap/Grid 开关 + Grid 类型选择器** | 音乐编辑最基础的操作 — clip 对齐到节拍 | TransportBar/Toolbar |
| **Bars\|Beats 时间标尺** | 有 BPM 输入但时间线只显示秒数 | TimelineRuler |
| **拍号输入 (Time Signature)** | 与 BPM 配套 | TransportBar |

### P1 — 体验明显短板

| 缺失控件 | 理由 | 涉及模块 |
|----------|------|----------|
| **实时电平表 (Peak Meter)** | 当前 MixerPanel 只有文字 dB，没有动态柱状电平条。这是 DAW mixer 最基本的视觉元素 | MixerPanel + engine streaming (peak/RMS 数据) |
| **Master Bus 推子** | 数据层已有 `masterVolume` 字段 + `buildMixConfig` engine 通路，但缺少 `audio.setMasterVolume` operation/invert、store setter、extension sync，以及 MixerPanel Master strip UI。不是纯 UI 补齐，需要编辑操作通路 + Mixer UI 一起做 | neko-types operations + audioProjectStore + extension sync + MixerPanel |
| **垂直推子** | 当前 mixer 用水平小滑条，操作精度和 DAW 视觉习惯不符 | MixerPanel 重构 |
| **Clip Indicator (过载红灯)** | 需要随电平表一起加 | MixerPanel |
| **每轨 Record Arm** | 多轨录音需要指定目标轨道 | TrackHeader + RecordingPanel |
| **FX 插槽点击编辑** | 当前只显示 "FX 2" 计数，不能直接点击打开效果编辑器 | TrackHeader + EffectsPanel |

### P2 — 加分项

| 缺失控件 | 理由 |
|----------|------|
| Ripple 编辑模式 | 删除 clip 后续自动跟随 |
| Clip 内 Gain 包络 | 精细控制 clip 内音量 |
| Rewind/Forward 按钮 | 键盘已覆盖，按钮是便利项 |
| Nudge 微调 | 帧级精确移动 |

---

## 7. Automation Lanes 设计草案

### 7.1 当前 AudioTrackMixState（v2.2）

```typescript
// packages/neko-types/src/types/audioProject.ts
interface AudioTrackMixState {
  volume: number;                   // 0.0-2.0
  pan: number;                      // -1.0 to 1.0
  solo: boolean;
  effectChain: AudioEffectConfig[];
  automation?: AudioAutomationLane[]; // v2.2 tick-based lanes
}

// 当前 operation 覆盖（apply-track-mix.ts）:
// track.mix.setVolume | track.mix.setPan | track.mix.setSolo | track.mix.setAutomation
// + effectChain 操作（add / remove / update / move — 无独立 toggle，通过 update(enabled) 实现）
```

### 7.2 Automation v2.2 契约

Automation 已在现有 `AudioTrackMixState` 基础上扩展，而非重新定义：

```typescript
interface AutomationPoint {
  /** 时间位置：ticks 为 SSOT，seconds 由 TempoMap 派生，不持久化 */
  ticks: number;
  value: number;
  curve: 'linear' | 'hold' | 'exponential';
}

/**
 * Automation target — 结构化身份标识，便于 validator/Agent/engine 统一校验。
 * 只持久化身份（kind / effectId / param），不持久化 valueRange。
 * 范围从参数 registry 派生（track-volume → [0,2], track-pan → [-1,1],
 * effect-param → 查 AudioEffectParamDef.min/max），避免项目文件保存过期或冲突的范围。
 *
 * 注意：AudioEffectParamDef 必须上移到 @neko/shared / neko-types 的共享契约层。
 * 当前 webview 的 AUDIO_EFFECT_DEFINITIONS 只能作为 UI 展示来源，validator / Agent /
 * engine 不能反向依赖 webview 包。
 */
type AutomationTarget =
  | { kind: 'track-volume' }
  | { kind: 'track-pan' }
  | { kind: 'effect-param'; effectId: string; param: string };

interface AutomationLane {
  id: string;
  target: AutomationTarget;
  enabled: boolean;
  points: AutomationPoint[];
}

// 扩展现有接口（v2.2）
interface AudioTrackMixState {
  volume: number;
  pan: number;
  solo: boolean;
  effectChain: AudioEffectConfig[];
  automation?: AutomationLane[];    // 新增：时间曲线覆盖静态值
}
```

> **注意**：`AutomationPoint.ticks` 使用基于节拍的时间坐标（PPQ ticks），而非裸 seconds。
> 这依赖 §7.3 的 TempoMap 契约，避免后续加入拍号变更/tempo 变更时全量迁移 automation 点。

### 7.3 TempoMap v2.2 契约

Automation ticks 的语义由 TempoMap 定义。以下是最小可用契约：

```typescript
/** 每四分音符的 tick 数，项目常量 */
const TICKS_PER_QUARTER_NOTE = 480;  // PPQ, 行业惯例 (MIDI Standard)

/** 拍号事件 */
interface TimeSignatureEvent {
  /** 生效位置（ticks from project start） */
  ticks: number;
  numerator: number;    // 拍子数（如 4/4 的 4）
  denominator: number;  // 拍子单位（如 4/4 的 4，表示四分音符）
}

/** Tempo 事件 */
interface TempoEvent {
  /** 生效位置（ticks from project start） */
  ticks: number;
  bpm: number;
}

/** TempoMap — 节拍网格 SSOT */
interface TempoMap {
  ppq: number;  // = TICKS_PER_QUARTER_NOTE, 序列化以保证可解释性
  tempoEvents: TempoEvent[];           // 按 ticks 升序，至少一个 {ticks:0, bpm}
  timeSignatureEvents: TimeSignatureEvent[];  // 按 ticks 升序，至少一个 {ticks:0}
}

// 转换边界（纯函数，Agent/validator/engine/UI 共用）
function ticksToSeconds(ticks: number, tempoMap: TempoMap): number;
function secondsToTicks(seconds: number, tempoMap: TempoMap): number;
/**
 * @returns bar: 1-based (音乐惯例，第 1 小节 = 1)
 *          beat: 1-based (第 1 拍 = 1)
 *          tick: 0-based, range [0, ticksPerBeat)
 *                ticksPerBeat = ppq * 4 / denominator
 *                (4/4 → 480, 6/8 → 240, 3/2 → 960)
 */
function ticksToBarBeat(ticks: number, tempoMap: TempoMap): { bar: number; beat: number; tick: number };
function barBeatToTicks(bar: number, beat: number, tick: number, tempoMap: TempoMap): number;

// 扩展 AudioProjectData（v2.2）
interface AudioProjectData {
  // ... 现有字段 ...
  bpm?: number;              // 保留向后兼容（单 tempo 快捷字段）
  tempoMap?: TempoMap;       // 新增：完整节拍网格（优先级高于 bpm）
}
```

**关键约束**：
- `tempoMap` 存在时，`bpm` 字段被忽略（`tempoMap.tempoEvents[0].bpm` 为 SSOT）
- Agent `SetTrackAutomation` 提交 ticks，UI 显示 bars|beats，engine 消费 seconds — 三方通过 `ticksToSeconds`/`secondsToTicks` 对齐
- validator 检查：tempoEvents/timeSignatureEvents 均按 ticks 升序，首项 ticks=0

**显示与舍入约定**：
- `bar` / `beat` 均为 **1-based**（音乐行业惯例：第 1 小节第 1 拍 = `1:1:000`）
- `tick` 为 **0-based**，范围 `[0, ticksPerBeat)` 其中 `ticksPerBeat = ppq * 4 / denominator`（4/4 → 480, 6/8 → 240, 3/2 → 960）
- UI 显示格式：`bar:beat:tick`（如 `3:2:120` 表示第 3 小节第 2 拍第 120 tick）
- `secondsToTicks` 舍入策略：**round to nearest tick**（`Math.round`），确保 `ticksToSeconds(secondsToTicks(s)) ≈ s`。Agent 和 validator 共用同一函数，避免 ±1 tick 差异
- 所有转换函数为纯函数，输入相同 TempoMap 保证幂等，便于测试快照比对

**`audio.setBpm` 兼容策略**：

`audio.setBpm` 在 v2.2 项目中已经重定向为更新 `tempoMap.tempoEvents[0].bpm`，codec 写盘时从该首个 tempo event 回填 legacy `bpm` 字段：

| 方案 | 做法 | 优缺点 |
|------|------|--------|
| **A: 重定向 setBpm（推荐）** | v2.2 后 `audio.setBpm` operation 内部改为写 `tempoMap.tempoEvents[0].bpm`；`bpm` 字段保留为只读派生（codec 写盘时从 tempoMap 回填，保持 v2.1 文件兼容） | 改动小，UI/store/Agent 无感知；缺点是 setBpm 只能改首个 tempo event |
| **B: 新增 tempoMap.update** | 新增 `audio.tempoMap.update` operation，UI 迁移到新 operation；`audio.setBpm` 标记 deprecated 但保留兼容 | 完整但工作量大，且单 tempo 场景（绝大多数）被强制走复杂路径 |

当前实现采用方案 A。后续需要多 tempo event 编辑 UI 时，再增加 `audio.tempoMap.update`。

### 7.5 落地依赖链 — P0 已完成范围

**PR 组 A：节拍网格基础设施（必须先行）**

| 序号 | 内容 | 涉及层 |
|------|------|--------|
| A1 | 已完成：`TempoMap` / `TempoEvent` / `TimeSignatureEvent` 类型 + `ticksToSeconds` / `secondsToTicks` / `ticksToBarBeat` / `barBeatToTicks` 纯函数 | neko-types 契约 |
| A2 | 已完成：`AudioProjectData.tempoMap` 字段 + .nka codec v2.2 validator + migration（`bpm` → `tempoMap` 兼容）+ `audio.setBpm` apply/invert 重定向写 `tempoMap.tempoEvents[0].bpm` + store 读取派生 BPM + 测试 | neko-types codec + operations + audioProjectStore |
| A3 | 已完成：Bars\|Beats 时间标尺 + 拍号 UI | TimelineRuler + TransportBar |
| A4 | 已完成：Snap/Grid 吸附逻辑 | AudioTimeline + audioProjectStore |

**PR 组 B：Automation Lanes（依赖 A 完成）**

| 序号 | 内容 | 涉及层 |
|------|------|--------|
| B1 | 已完成：`AutomationLane` / `AutomationPoint` 类型 → `AudioTrackMixState.automation` | neko-types 契约 |
| B2 | 已完成：共享音频效果参数 metadata 上移到 neko-types，webview 展示定义复用共享 registry | neko-types 契约 + webview |
| B3 | 已完成：`track.mix.setAutomation` operation + invert | neko-types operations |
| B4 | 已完成：.nka codec 扩展 automation 字段 + validator | neko-types codec |
| B5 | 已完成：audioProjectStore automation CRUD + undo/redo | webview store |
| B6 | 已完成：AutomationLane 组件 + TrackHeader 自动化按钮 | webview 组件 |
| B7 | 已完成：`SetTrackAutomation` Agent 工具 | AgentCapabilityProvider + audioToolBridge |
| B8 | 已完成：`buildMixConfig` 传递 automation → engine mixdown/stream；effect-param automation 当前 warning 跳过 | neko-types build-mix-config + engine |
| B9 | 已完成：Engine 端 track volume/pan automation 应用到实时/导出渲染管线 | engine-kernel |

### 7.6 对应 AI 工具

```typescript
// 新增 Agent 工具
SetTrackAutomation: {
  trackId: string;
  target: {
    kind: 'track-volume' | 'track-pan' | 'effect-param';
    effectId?: string;   // kind='effect-param' 时必填
    param?: string;      // kind='effect-param' 时必填
  };
  points: { ticks: number; value: number; curve?: string }[];
}
```

> validator 根据 `target.kind` 校验：
> - `track-volume`: value ∈ [0, 2]
> - `track-pan`: value ∈ [-1, 1]
> - `effect-param`: 查 effectChain 确认 effectId 存在，从共享 AudioEffectParamDef registry 查 valueRange；registry 必须位于 `neko-types`，不能由 validator/Agent/engine import webview 定义

---

## 8. 与现有 ADR 的关系

| ADR | 关系 |
|-----|------|
| Engine Interface & Pipeline Decoupling | Automation 数据需要通过 engine 实时应用到渲染管线 |
| Agent Capability Protocol | SetTrackAutomation 遵循 AgentCapabilityProvider 注册模式 |
| Perception-First Roadmap | AI 操作可视化反馈属于 Perception 闭环的一部分 |
| Format Strategy | .nka v2.2 兼容新增 automation / TempoMap / TimeSignature 字段（非破坏性 schema 变更，不需要 v3） |

---

## 9. 总结

neko-audio 作为 AI DAW 的底子已经很扎实：最多 19 个 AI 工具（15 基础 + `SetTrackAutomation` + 3 条件媒体生成）+ 多轨 + 效果链 + 预设系统 + 跨扩展协作。与 Ardour 相比，它缺的不是"全功能"。2026-05-21 的 P0 foundation 已经补齐节拍网格、自动化和 AI 操作反馈，后续重点转向 P1 体验增强。

**P0-A — 节拍网格基础设施（已完成，§4 + §7.5 PR 组 A）:**
1. **TempoMap + TimeSignature + Snap/Grid + Bars|Beats 标尺** — 统一时间语义，Automation 以 ticks 为 SSOT

**P0-B — Automation Lanes（已完成 P0 基础，§4 + §7.5 PR 组 B）:**
2. **Automation 全栈** — 从 `AudioTrackMixState` 扩展 → 共享参数 metadata → .nka codec → operation/invert → webview store → Agent tool → buildMixConfig → engine。当前 Engine 渲染 track volume/pan；effect-param automation 以 warning 显式跳过，避免静默错误

**P0-C — AI 操作可视化反馈（已完成）:**
3. **Operation highlight / AI action badge** — 基于 `EditOperation.meta.source === 'ai'`，只做 presentation，不重新 dispatch sync operation

**P1 — 体验短板 (§4 + §6):**
4. **实时电平表 + Master strip + 垂直推子** — mixer 视觉低于 DAW 基线（注：`audio.setMasterVolume` 数据/operation 已有，但仍缺完整 master strip UI 与实时 meter）
5. **MIDI Track + Piano Roll** — AI 生成旋律的微调入口
6. **每轨 Record Arm / FX 点击编辑** — 交互完整度（Track Height 拖拽已实现）

不需要追 Ardour 的信号路由、VST 插件架构、SMPTE 同步等传统 DAW 深水区。
