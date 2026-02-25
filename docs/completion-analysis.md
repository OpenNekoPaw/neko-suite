# Neko Suite 核心功能完成度分析

> 分析日期：2026-02-25
> 基于实际代码统计，非主观评估

---

## 总览

| 包 | 源码文件 | 代码行数 | 测试用例 | TODO/未实现 | 完成度 | 成熟度 |
|---|---|---|---|---|---|---|
| neko-engine | 164 RS + 11 TS | 53,301 RS + 3,139 TS | 352 | 0 | 70% | ★★★★☆ |
| neko-agent | 371 TS | 88,391 | 1,171 | 6 TODO + 2 未实现 | 70% | ★★★★☆ |
| neko-cut | 194 TS | 55,347 | 104 | 3 TODO + 1 未实现 | 65% | ★★★☆☆ |
| neko-types | 92 TS | 20,400 | 169 | 0 | 80% | ★★★★☆ |
| neko-canvas | 58 TS | 10,452 | 0 | 1 TODO | 40% | ★★☆☆☆ |
| neko-tools | 14 TS | 5,237 | 61 | 4 TODO | 50% | ★★★☆☆ |
| neko-preview | 19 TS | 3,590 | 0 | 0 | 60% | ★★☆☆☆ |
| neko-assets | 17 TS | 3,221 | 98 | 2 TODO | 55% | ★★★☆☆ |
| neko-story | 29 TS | 2,824 | 83 | 0 | 55% | ★★★☆☆ |
| neko-client | 8 TS | 2,179 | 0 | 0 | 75% | ★★☆☆☆ |

**项目总计**：164 RS + 812 TS/TSX 源文件，~244K 行代码，2,038 个测试用例

---

## 核心三角详细分析

### neko-engine（Rust 媒体引擎）— 70%

项目中架构最规范、测试最扎实的模块。

**已完成**：
- GPU 渲染管线：wgpu compositor + 26 个 GPU 模块 + 12 个 WGSL shader
- 编解码：FFmpeg 集成 + 硬件加速（VideoToolbox/VAAPI/CUDA）+ decoder pool
- 导出管线：GPU export pipeline + audio mixer
- 关键帧缓存服务 + 动画系统（keyframe/easing/interpolate）
- 媒体服务：video/audio/image/subtitle diff + ffmpeg parser + probe
- HTTP API 路由层（axum）+ NAPI 绑定 + CLI（clap + Tracy profiler）
- .jvi 项目格式 + 遥测（metrics/spans）
- 跨平台 GPU 纹理导入/导出（macOS Metal / Linux Vulkan / Windows D3D）

**未完成**：
- 预加载优化
- 音量标准化
- WebGPU 实时预览优化
- [规划] native-scene 3D 场景 crate

**风险点**：无。0 个 `todo!()` / `unimplemented!()`，352 个测试用例覆盖充分。

---

### neko-agent（AI Agent）— 70%

代码量最大（88K LOC）、测试覆盖最好（1,171 用例）的 TS 包。

**已完成**：
- Agent 核心引擎：executor / session（context compression）/ context / memory / MCP / skills / subagent / task / hooks / validation / prompt / input / permission
- LLM 平台层：Claude/OpenAI adapter + routing strategies + media adapters + workflow + task scheduling + 中英双语预设
- Assistant UI：ChatView + AgentControlCenter + AgentsPanel + SettingsView + i18n
- Agent CLI：交互式 CLI（/plan /auto /ask /clear /compact）+ MCP + 文件引用

**未完成**：
- OpenAI adapter streaming（2 处 `throw new Error('Not implemented')`）
- Agent CLI proper streaming support
- 迁移遗留代码清理（3 处 `TODO: Remove after migration complete`）
- 时间线操作 Skills（批量操作、智能素材推荐）
- 创作辅助 Skills（剧本解析→时间线、自动配乐、AI 字幕、画面描述）

**风险点**：OpenAI streaming 是功能缺口；Skills 生态尚未丰富。

---

### neko-cut（视频剪辑器）— 65%

UI 功能最丰富的包，但测试覆盖偏低。

**已完成**：
- 时间线：多轨道 + 拖拽/缩放/分割 + 撤销重做（13 个 store slices）+ Minimap + 键盘快捷键
- 预览：实时播放 + 帧精确定位 + PreviewModeController
- 色彩校正：BasicAdjustments / ColorWheels / Curves
- 特效：Effects + TransitionPicker + Mask + Subtitles + SpeedControl
- 形状：ShapeRenderer + PenToolEditor
- 导出：MP4/WebM + 分辨率/码率设置
- 国际化（中英双语）

**未完成**：
- 资产拖拽导入（`useAssetLibrary.ts:310`）
- 反向播放（`TimelineTrack.tsx:612`）
- ffprobe 元数据提取（`AssetService.ts:684`）
- 多分辨率预览切换
- 导出预设管理
- 后台导出队列

**风险点**：104 个测试用例相对 55K LOC 偏少，测试覆盖率需要提升。

---

## 基础设施分析

### neko-types — 80%

稳定的类型基础层，0 个未实现标记。覆盖 timeline/track/element/keyframe/effects/animation/agent/skill/task/mcp/canvas 全域类型 + 操作系统（apply/invert）。169 个测试用例。

### neko-client — 75%

精炼的流媒体客户端（8 个文件，2,179 行），H264/fMP4/PCM 解码 + 帧调度 + 性能监控。功能聚焦但零测试。

---

## 功能模块分析

### neko-canvas — 40%

节点系统和画布交互已实现，但零测试、导出未实现。有 PLAN.md 和 FEATURE_INVENTORY.md 说明仍在规划阶段。

### neko-preview — 60%

视频/音频预览 Provider + 播放器 UI 已完成，0 个 TODO。但零测试。

### neko-story — 55%

Fountain 解析器 + LSP（补全/定义/悬停/符号/链接）+ Webview 渲染器已完成。83 个测试用例。缺少错误诊断、时间线生成、PDF 导出。

### neko-assets — 55%

AssetLibrary + 实体/文件/变体服务 + 规则分类器已实现。98 个测试用例。但 git ref 解析和变更分析核心逻辑未实现。

### neko-tools — 50%

媒体 Diff 框架已搭建，图片 Diff 可用。但视频帧 seeking/extraction 和文件比较核心功能未实现。webview 复用 neko-cut 构建产物。

---

## 关键指标

### 测试覆盖分布

```
neko-agent   ████████████████████████████████████████ 1,171 用例
neko-engine  ████████████ 352 用例（Rust #[test]）
neko-types   ██████ 169 用例
neko-cut     ████ 104 用例
neko-assets  ███ 98 用例
neko-story   ███ 83 用例
neko-tools   ██ 61 用例
neko-canvas  ░ 0 用例
neko-preview ░ 0 用例
neko-client  ░ 0 用例
```

### 零测试包（高风险）

| 包 | 代码行数 | 风险评估 |
|---|---|---|
| neko-canvas | 10,452 | 高 — 画布交互逻辑复杂，无回归保护 |
| neko-preview | 3,590 | 中 — 功能简单，但播放器状态管理需要测试 |
| neko-client | 2,179 | 中 — 流媒体解码是底层关键路径 |

### 未实现功能汇总

| 位置 | 功能 | 优先级 |
|---|---|---|
| neko-agent OpenAI adapter | streaming 支持 | P1 |
| neko-cut useAssetLibrary | 拖拽导入 | P1 |
| neko-cut TimelineTrack | 反向播放 | P2 |
| neko-cut AssetService | ffprobe 元数据 | P2 |
| neko-assets AssetDiffService | git ref 解析 + 变更分析 | P2 |
| neko-tools MediaDiffMessageHandler | 视频帧 seeking/extraction | P2 |
| neko-canvas ArtboardNode | 导出功能 | P3 |

---

## 架构健康度

### 优势
- neko-engine Rust workspace 分层清晰（types → core → api → http/napi/cli）
- neko-agent 测试覆盖充分，AOP 钩子 + 验证系统架构完善
- neko-types 作为共享类型层稳定可靠
- 12 个 WGSL shader + 26 个 GPU 模块为 3D 扩展提供了坚实基础

### 风险
- 测试覆盖两极分化：3 个包零测试
- neko-cut 代码量大（55K LOC）但测试仅 104 个用例
- neko-agent 有 3 处迁移遗留代码待清理
- neko-tools 核心 diff 功能未实现，webview 依赖 neko-cut 构建产物

---

*基于 git main 分支代码统计*
