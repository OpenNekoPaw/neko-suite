# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。
>
> 来源文档索引：[task-plan](./docs/task-plan.md) · [diff](./docs/diff.md) · [engine](./docs/engine.md) · [timeline-alignment](./docs/timeline-alignment.md) · [editoperation](./docs/editoperation.md) · [lsp](./docs/lsp.md) · [asset-management](./docs/architecture/asset-management-design.md) · [cross-repo-sharing](./docs/architecture/cross-repo-sharing-design.md) · [shared-packages](./docs/architecture/shared-packages-design.md) · [cross-language](./docs/architecture/cross-language-architecture.md) · [3d-capability](./docs/architecture/3d-capability-analysis.md)

---

<details>
<summary>✅ 近期已完成（点击展开）</summary>

- [x] 横切关注点统一 Phase 1-5 — [adr-cross-cutting-concerns](./docs/architecture/adr-cross-cutting-concerns.md)
- [x] 统一引擎通信 Phase 2 — [adr-unified-engine](./docs/adr-unified-engine.md)
- [x] EditOperation Phase 1-4B — [editoperation](./docs/editoperation.md)
- [x] Timeline Alignment Phase 0-5 — [timeline-alignment](./docs/timeline-alignment.md)
- [x] Media Diff Phase 1-2.6 — [diff.md §已完成](./docs/diff.md)
- [x] task-plan P0 #1-2, P1 #3-6 — [task-plan](./docs/task-plan.md)
- [x] **Bug #1 修复：Git fetch 期间播放失败** — `mediaDiff:fetchState` 协议 + 双重保护（Extension await + Webview 禁用 Play）— [diff.md §Bug #1](./docs/diff.md)
- [x] **预加载优化**：ProbeCache + DecoderPool 接入 stream + EncoderPool，首帧延迟 >200ms → <50ms（warm）
- [x] **KeyframeCache 清理**：删除废弃的 NV12 帧缓存模块（与 GPU zero-copy 路径不兼容，FFmpeg 内部已有 keyframe index）
- [x] **拖拽导入竞态修复**：三处竟态全部消除 — drop 串行化队列（`dropQueueRef`）+ `getCurrentTracks()` 实时状态 + `addMediaElementWithAudio` await 音频/字幕检测
- [x] **FIFO 导出队列**：Rust `VecDeque` + TS `enqueueExport` 多任务轮询 + `timelines:export_enqueue` / `export_queue` API + ExportPanel UI
- [x] **Operations 类型安全**：新增 `WebviewElement` 类型，消除测试中 `as any`，apply-keyframe 重构
- [x] **Diff 协议增强**：`mediaDiff:fetchState` 协议 + MessageHandler 重构 + 音频/视频 Diff 查看器改进
- [x] **文档大整理**：新增 5 个 ARCHITECTURE.md + 全部包 README 精简 + 废弃文档清理
- [x] **音频响度标准化**：Rust `audios:analyze_loudness`（ebur128 crate, ITU-R BS.1770-4）+ EngineClient 便捷方法 + neko-cut PropertyPanel "Normalize Loudness" 按钮（非破坏性增益调整）
- [x] **Diff 异步并发修复**：6 个 controller（video/audio/image/models/canvas/timeline）的 diff 操作用 `spawn_blocking` 卸载到阻塞线程池，消除 tokio 工作线程饥饿导致的播放阻塞
- [x] **Timeline Model 合并**：消除 `domain::Timeline` vs `export::TimelineData` 双模型 — `export/types.rs` 仅保留导出专用类型，`domain/timeline.rs` 成为唯一模型，`to_transform_2d()` / `to_gpu_blend_mode()` / `effective_volume()` 等 GPU 转换方法已补充，`jvi/converter.rs` 已切换至 domain 层，~1,500-2,000 行变更
- [x] **Stream Playback 统一**：提取 `IStreamPlayback` trait（`playback.rs`）+ `StreamPlaybackDelegate`（`stream_loop.rs`）消除 3 服务 × 6 方法重复实现；`handle_stream_control()` 统一四个 Controller 流控；修复 seek bug（`seek_seq += 1`）；修复 `StreamController` pause/resume 错误传播 + destroy 补充 `stop_stream()` 清理
- [x] **BlendMode 补齐**：`neko_types::BlendMode` 扩展至 27 变体（对齐 `gpu::BlendMode` / proto / TS 类型），补全 `to_gpu_blend_mode()` + `convert_blend_mode()` 两处 match arm（`effects.rs` + `domain/timeline.rs` + `services/impls/timeline.rs`）
- [x] **Diff Phase 2B**：前端可视化增强（TimelineDiffViewer + 音频三轨波形 + 视频 WebGL 渲染器 curtain/heatmap/flicker + DiffRegionOverlay）— [diff.md §Phase 2B](./docs/diff.md)
- [x] **Diff 范围支持**：Video/Audio diff 支持 `start_time`/`end_time` 参数，FFmpeg `-ss`/`-to` 裁剪输入，性能提升 5-6x（长视频局部对比）— [diff-range-usage.md](./docs/diff-range-usage.md)

</details>

---

## 🔴 P0 — 阻塞性（本迭代必须完成）

*当前无阻塞项*

---

## 🟡 P1 — 核心功能（当前迭代）

### neko-tools（媒体 Diff）
- [x] **Diff Phase 2B**：前端可视化增强 — [diff.md §Phase 2B](./docs/diff.md)
  - [x] TimelineDiffViewer 组件（Summary + Track/Element 树）
  - [x] 音频三轨波形（A/B/Diff + diff 区域高亮）
  - [x] 视频 H264+PCM 流 + WebGL 渲染器（curtain/heatmap/flicker）
  - [x] Diff 区域时间轴高亮（DiffRegionOverlay）
- [ ] **Diff Phase 3**：Engine 流式帧指标返回（SSIM 每 N 帧回调，Rust 工作量大）
  - 见 [diff.md §Phase 3](./docs/diff.md)
- [ ] **Bug: 视频无早期预览**：音频有 ~500ms 早期波形，视频黑屏 5-60s
  - 方案：实现 `startEarlyFrameExtraction`（并行提取 t=0 帧）· 预计 1-2h

### neko-agent（AI Skills）
- [ ] 批量时间线操作 Skill（当前仅支持单元素操作）— [task-plan #11](./docs/task-plan.md)
- [ ] 剧本解析 → 时间线自动生成 Skill（neko-story 联动）
- [ ] AI 字幕生成 Skill（调用 Whisper / 云端 ASR）
- [ ] 智能素材推荐（根据剧本自动检索资产库）
- [ ] **ChatViewProvider Handler 拆分** Phase 2-5（当前 Phase 1 完成 18%）— [engine.md §重构 #3](./docs/engine.md)

### neko-story
- [ ] 错误诊断（LSP Diagnostics）：语法错误实时标红 — [lsp.md §Phase 1](./docs/lsp.md)
- [ ] 时间线生成：`.nks` → `.jvi` 自动转换 — [engine.md §重构 #4: neko-story Phase 3.3](./docs/engine.md)
- [ ] 导出 PDF（Fountain 标准格式）— [task-plan #12](./docs/task-plan.md)

### neko-assets（Phase 4）
- [x] **External Media Library** Phase P0/P1（2026-03-04 完成）— [adr-external-media-library](./docs/architecture/adr-external-media-library.md)
  - [x] P0: 路径韧性（健康检查 + 离线检测 + 重定位 UI + 状态装饰）
  - [x] P1: 媒体库管理（settings.json + 路径变量 + TreeView + 拖拽导入）
  - [ ] P2: 性能优化（元数据缓存 + 增量索引 + 搜索 + 代理文件 + 批量导入）
- [ ] ShaderAssetHandler（编译验证 + 预览 + 热重载）
- [ ] PresetAssetHandler（LUT / 转场预设 / 导出预设）
- [ ] ModelAssetHandler（AI 模型下载 + 校验 + 量化选择）
- [ ] AI 生成结果自动入库（Agent 生成 → AssetRegistry.register）
- [ ] IAIAnalysisService 实现（接入 neko-agent AI 分类）
- 见 [asset-management-design.md §Phase 4](./docs/architecture/asset-management-design.md)

---

## 🟢 P2 — 增强功能（可延后）

### neko-cut
- [ ] 多分辨率预览切换（1/4、1/2、Full）— [task-plan #10](./docs/task-plan.md)
- [ ] 导出预设管理（常用配置保存/加载）
- [ ] 更多编码格式支持（ProRes、DNxHD）
- [ ] 反向播放支持（需 neko-engine 配合）— [task-plan #9](./docs/task-plan.md)

### neko-engine
- [ ] WebGPU 实时预览优化（降低 GPU→CPU 回读延迟）
- [ ] 高精度波形 Zoom（按需加载超过 800 点的精细波形）
  - 见 [diff.md §Phase 3](./docs/diff.md)
- [ ] 渲染能力补齐：shapes / effects / keyframes / subtitles / letter_spacing — [timeline-alignment.md §Known Issues](./docs/timeline-alignment.md)
- [ ] 转场系统接入 export pipeline（buffer→texture 架构 mismatch）— [timeline-alignment.md §Phase 2](./docs/timeline-alignment.md)

### neko-tools（媒体 Diff）
- [ ] **Probe 冗余执行修复**：`videos:diff` 已返回 metadata，`handleStartStreaming` 重复 probe
  - 方案：Extension 侧缓存 diff 结果 metadata · 预计 1h
- [ ] Diff 后端增强（Phase 3）— [diff.md §Phase 3](./docs/diff.md)
  - [ ] 音频静音检测（协议已定义，未实现）
  - [ ] 视频关键帧智能采样（长视频优化）
  - [x] 音频频谱分析 / 响度归一化 BS.1770（已实现为 `audios:analyze_loudness`）
  - [ ] 视频场景切割检测

### neko-canvas
- [ ] 功能补全：Undo/Redo + Copy/Paste + Port 系统 + UI 面板 — [engine.md §重构 #5](./docs/engine.md)
- [ ] WebGPU 渲染管线（当前 Canvas 2D 降级实现）
- [ ] 特效系统（复用 neko-engine WGSL shaders）
- [ ] 自定义转场（复用 engine 转场类型）
- [ ] 导出功能 — [engine.md §neko-canvas TODO](./docs/engine.md)

### neko-proto
- [ ] 接入 protoc/buf 自动生成（当前手动维护，同步成本高）
- [ ] 补齐 diff.proto 剩余类型定义

### EditOperation 遗留项
- [ ] neko-types `package.json` 缺少 test script（测试文件已写但无法运行）— [editoperation.md §Known Issues](./docs/editoperation.md)
- [ ] 操作 undo/redo 正确性手动验证 — [editoperation.md §Known Issues](./docs/editoperation.md)

---

## 🔵 P3 — 长期功能

### Diff AI 增强（Phase 4-6）— [diff.md §Phase 4-6](./docs/diff.md)
- [ ] CLIP 语义打分（Prompt↔视频/图片对齐度）
- [ ] Whisper ASR 文本 Diff（对白变更检测）
- [ ] Demucs 音源分离（人声/背景独立比较）
- [ ] Grounding DINO 目标锚点验证
- [ ] AI 质量评估（黑帧/静音/冻结检测 + No-Reference VQA）
- [ ] AI 素材筛选（批量 CLIP 打分 + 语义一致性过滤 + 视觉聚类去重）

### LSP 完整实现 — [lsp.md](./docs/lsp.md)
- [ ] Phase 2：符号 & 导航（DocumentSymbol / Definition / References）
- [ ] Phase 3：AI 增强（CLIP / Whisper / Demucs / Grounding DINO）
- [ ] Phase 4：AI 素材审查
- [ ] Phase 5：质量评估（黑帧检测 / VQA / SAM 智能蒙版）

### neko-agent 创意助手 — [task-plan #13](./docs/task-plan.md)
- [ ] 场景描述 → 自动配乐
- [ ] AI 字幕（云端 ASR 集成）
- [ ] 场景描写辅助

### 跨语言架构对齐 — [cross-language-architecture.md](./docs/architecture/cross-language-architecture.md)
- [ ] Step 2：Engine ComputeService（`/v1/compute/evaluate_frame`，消除 ~1285 行 TS 重复计算）
- [ ] Step 3：UI 状态分离（Track/Element UI 字段移入前端 Store）

---

## 📋 技术债务

| 优先级 | 问题 | 影响 | 来源 |
|--------|------|------|------|
| 高 | 统一错误处理机制（各包自行 catch，不统一） | 调试困难 | [task-plan TD-2](./docs/task-plan.md) |
| 高 | 单元测试覆盖率（neko-agent 47 个最多，其他包偏少） | 回归风险 | [task-plan TD-4](./docs/task-plan.md) |
| 高 | neko-engine 性能监控（telemetry 基础已有，需接入指标面板） | 性能盲区 | |
| 中 | AI SDK 依赖倒置（`AISdkAdapter` 直接依赖 Vercel AI SDK，DIP 65/100） | 可替换性差 | [task-plan TD-1](./docs/task-plan.md) |
| 中 | 规范化 git commit message（采用 Conventional Commits） | 追溯困难 | [task-plan TD-3](./docs/task-plan.md) |
| 中 | neko-types 83 个 `as any` 需替换为判别联合 | 类型安全 | [engine.md](./docs/engine.md) |
| 中 | neko-types 类型文档完善（JSDoc 覆盖率低） | 开发体验差 | |
| 低 | 国际化扩展（neko-cut/neko-agent 已完成，其他包待补） | 国际化缺口 | [task-plan TD-5](./docs/task-plan.md) |

---

## 🚧 规划中（未开始）

| 模块 | 目标 | 参考 |
|------|------|------|
| neko-protocol | 共享协议仓库（Proto IDL → TS/Go/Rust 生成） | [cross-repo-sharing](./docs/architecture/cross-repo-sharing-design.md) |
| @neko/types 重组 | domain/ 分层 + exports 子路径隔离 | [shared-packages](./docs/architecture/shared-packages-design.md) |
| @neko/media-analysis | 从 neko-tools 提取纯 Diff 算法包 | [shared-packages](./docs/architecture/shared-packages-design.md) |
| neko-audio | 波形编辑 + 均衡器 + 录音 | Phase 4 |
| neko-live | 动捕 + 虚拟形象 + 直播 | Phase 5 |
| neko-sketch | 压感手绘 + 笔刷系统 | Phase 3 |
| neko-model (3D) | native-scene + R3F 视口 | [3d-capability](./docs/architecture/3d-capability-analysis.md)，Phase 3 |
| neko-assets Phase 5 | 社区分发（.neko 包格式 + 远程注册表） | [asset-management](./docs/architecture/asset-management-design.md) Phase 5 |

---

*最后更新：2026-03-05*
