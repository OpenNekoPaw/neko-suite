# Phase 1: 核心剪辑能力 — 已完成归档

> **完成时间**: 2026-03-05
> **M1 里程碑**: ✅ 基础剪辑闭环

---

## neko-engine (媒体引擎 Sidecar)

架构：5 个 Rust crate（native-core / native-api / native-http / native-napi / native-cli）+ TS extension

- [x] GPU 渲染管线
  - [x] wgpu compositor + texture 管理
  - [x] blend modes（12 个 WGSL shader）
  - [x] color correction + transitions
  - [x] custom shader processor
- [x] 编解码服务
  - [x] 视频解码（含硬件加速、IDR scanner、decoder pool）
  - [x] 视频编码（含硬件加速、muxer、iframe）
  - [x] ffmpeg parser + media probe
  - [x] 更多编码格式支持
    - [x] ProRes 硬件加速（macOS VideoToolbox → `prores_videotoolbox`）
    - [x] AVI / MPEG-TS 容器格式暴露（ExportPanel + ExportService）
    - [x] 硬件加速动态显示（nodes:hw_capabilities API + ExportPanel badge）
- [x] 导出管线
  - [x] GPU 导出 pipeline
  - [x] audio mixer
  - [x] 导出服务（TS 侧 ExportService）
  - [x] FIFO 导出队列（Rust VecDeque + TS 多任务轮询 + 队列状态事件）
- [x] 动画系统（keyframe / easing / interpolate）
- [x] 媒体服务（video/audio/image/subtitle diff）
- [x] HTTP API 路由层（video/audio/timeline/effects/stream/task controllers）
- [x] .jvi 项目格式 loader/converter
- [x] 遥测（metrics / spans）
- [x] 统一 HTTP/WS 通信（EngineClient 单端口架构，3 个消费者包迁移完成）
- [x] 预加载优化（ProbeCache + DecoderPool stream 接入 + EncoderPool，首帧延迟 <50ms）
- [x] 音量标准化（ITU-R BS.1770-4 LUFS 分析 + 非破坏性增益调整）
- [x] Diff 异步并发修复（6 个 controller `spawn_blocking` 卸载，消除 tokio 线程饥饿）

---

## neko-cut (视频剪辑器)

架构：extension + webview（React + Zustand + Tailwind）

- [x] 时间线轨道系统
  - [x] 多轨道支持（视频/音频/文字）
  - [x] 元素拖拽、缩放、分割
  - [x] 轨道锁定/静音/隐藏
  - [x] 撤销/重做历史（13 个 store slices）
  - [x] EditOperation 系统（29 操作类型 + 6 slice 迁移 + 增量同步）
  - [x] Timeline Proto 对齐（Proto → Rust → TS 三层字段同步）
  - [x] Minimap 导航
  - [x] 键盘快捷键 + 右键菜单
- [x] 预览系统
  - [x] 实时预览播放
  - [x] 帧精确定位
  - [x] 缩放/平移控制
  - [x] PreviewModeController
  - [x] 多分辨率预览切换
- [x] 媒体导入
  - [x] 视频/音频/图片导入
  - [x] 缩略图生成（ThumbnailService）
  - [x] 波形可视化
  - [x] MediaDiff 查看器
  - [x] 拖拽导入竞态修复（串行化队列 + 实时 Store 状态 + await 音频检测）
- [x] 色彩校正
  - [x] BasicAdjustments
  - [x] ColorWheels
  - [x] Curves
- [x] 特效与转场
  - [x] Effects 面板
  - [x] TransitionPicker
  - [x] Mask 蒙版
- [x] 字幕编辑（Subtitles 组件）
- [x] 速度控制（SpeedControl）
- [x] 形状渲染 + 钢笔工具（ShapeRenderer / PenToolEditor）
- [x] 导出功能
  - [x] MP4/WebM 导出
  - [x] 分辨率/码率设置
  - [x] FIFO 导出队列（enqueueExport + 多任务轮询 + 队列状态 UI）
  - [x] 导出预设管理（内置预设 + 自定义保存，workspaceState 持久化）
- [x] 国际化（中英双语）

---

## neko-client (流媒体客户端)

- [x] H264StreamClient
- [x] FMP4StreamClient
- [x] AudioStreamClient
- [x] FrameScheduler
- [x] PlaybackPerformanceMonitor
- [x] 能力检测（detectCapabilities）
- [x] EngineClient（HTTP dispatch + 便捷方法，零 vscode 依赖）

---

## neko-types (共享类型层)

- [x] 全域类型定义（timeline/track/element/keyframe/effects/animation/agent/skill/task/mcp/canvas）
- [x] 操作系统（apply/invert/helpers，支持撤销重做 + WebviewElement 类型安全）
- [x] 横切关注点统一（Logger/i18n/Theme/Error 三层隔离，Phase 1-5 全部完成）
- [x] 配置读取/适配/规范化
- [x] VSCode API 代理类型
- [x] 并发池工具
- [x] Proto 生成类型（timeline.engine.ts）
- [x] 类型文档完善（src/README.md + types/README.md 更新至 50+ 文件现状）
