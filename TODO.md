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
- [x] **视频对比性能优化**：`sample_fps` 参数支持帧率降采样（Rust FFmpeg fps filter + TS 1fps 默认 + Webview 降采样至 500 帧），60 分钟视频对比时间 30s → 1-2s（15-30x 提升）
- [x] **时长不匹配智能优化**：Video/Audio diff 自动检测时长差异 > 20%，限制对比范围至较短文件（probe + endTime），120s vs 5s 视频 50s → 5s（10x 提升）— [diff-duration-mismatch-optimization.md](./docs/diff-duration-mismatch-optimization.md)
- [x] **多分辨率预览切换**：Full / High(1/2) / Medium(1/4) / Low(1/8) 质量档位，`PREVIEW_QUALITY` 缩放系数 → Rust `PreviewPipeline.update_config()`
- [x] **导出预设管理**：内置预设（社交/Web/母版）+ 自定义保存，`workspaceState` 持久化，`ExportPresetService` + `ExportPanel` 下拉 + 保存按钮
- [x] **更多编码格式支持**：ProRes 硬件加速（`prores_videotoolbox`）+ AVI / MPEG-TS 容器 + 硬件加速动态 badge（`nodes:hw_capabilities`）
- [x] **neko-types 文档完善**：`src/README.md` + `src/types/README.md` 更新至 50+ 文件现状，12 个子目录全部覆盖
- [x] **neko-story 非 AI 功能**（错误诊断 + 时间线生成 + PDF 导出）— 进度 55% → 75%
- [x] **Diff Phase 2B 前端可视化**：TimelineDiffViewer + 音频三轨波形 + 视频 WebGL 渲染器 + DiffRegionOverlay — [diff.md §Phase 2B](./docs/diff.md)
- [x] **视频早期预览修复**：`startEarlyFrameExtraction` 并行提取 t=0 帧（复用 `startEarlyWaveform` 模式）
- [x] **剧本→时间线 Skill**：Fountain → ProjectData JSON 语义 Skill（neko-story 联动）
- [x] **AgentExecutor 流式化 Phase 3**：`thinkStream()` + `content_delta`/`text_delta` 全链路流式 — [refactoring-chat-cli.md](./packages/neko-agent/docs/refactoring-chat-cli.md)
- [x] **ChatViewProvider Handler 拆分 Phase 1-2**：10 handler + 2 processor，ChatViewProvider -61%，MessageHandler -60%
- [x] **External Media Library P0/P1**：路径韧性 + 媒体库管理（settings.json + 路径变量 + TreeView + 拖拽导入）— [adr-external-media-library](./docs/architecture/adr-external-media-library.md)
- [x] **neko-canvas Undo/Redo + Copy/Paste**：`historyStore`（snapshot undoStack/redoStack）+ `clipboardStore`（序列化节点+连接、ID 重映射、自动偏移）
- [x] **统一错误处理框架**：`BaseError` + `IErrorHandler` + `ErrorDisplayOptions` + `VSCodeErrorHandler`（@neko/shared errors/）
- [x] **neko-types `as any` 清理**：主库零 `as any`，仅剩 2 处测试代码中合理用法（83 → 2）
- [x] **视频关键帧智能采样**：Rust `sample_fps` + TS 1fps 默认 + Webview 降采样至 500 帧（60 分钟视频 30s → 1-2s）
- [x] **Effects + Subtitles 渲染**：EffectDispatcher（blur/sharpen/vignette/glow）+ TextRenderer（13 字段）接入 GPU export pipeline
- [x] **Media LSP Phase 1+2**：JVI 诊断（9 规则）+ Hover（probe 元数据）+ DocumentSymbol（三级 Outline）+ Definition（src/linkedId 跳转）+ References（跨文件媒体引用）+ WorkspaceIndex（`**/*.jvi` 监听）— [lsp.md](./docs/lsp.md)
- [x] **Probe 冗余修复**：`handleStartStreaming` / `handleStartAudioStreaming` 缓存 `lastDiffResult` metadata，消除每次 streaming 重复 ~400ms probe
- [x] **反向播放前端 UI**：SpeedControl.tsx 反向切换按钮 + PropertyPanel SpeedProperties.reverse + 时间映射工具（已在之前迭代完成）
- [x] **Timeline Diff 范围 UI**：DiffControls TimeRangeControl（时间输入 + Apply/Reset）+ `mediaDiff:setTimeRange` 协议 + `DiffOptions.startTime/endTime` 全链路传递

</details>

---

## 🔴 P0 — 阻塞性（本迭代必须完成）

*当前无阻塞项*

---

## 🟡 P1 — 核心功能（当前迭代）

### neko-agent（AI Skills）
- [ ] 批量时间线操作 Skill（当前仅支持单元素操作）— [task-plan #11](./docs/task-plan.md)
- [ ] AI 字幕生成 Skill（调用 Whisper / 云端 ASR）
- [ ] 智能素材推荐（根据剧本自动检索资产库）
- [ ] **ChatViewProvider 拆分 + AgentExecutor 流式化** Phase 4-5（Phase 1-3 ✅ 完成）— [refactoring-chat-cli.md](./packages/neko-agent/docs/refactoring-chat-cli.md)
  - Phase 1-2 ✅: Handler 拆分（ChatViewProvider 1,885→734 行 -61%，MessageHandler 1,153→466 行 -60%）
  - Phase 3 ✅: `AgentExecutor.thinkStream()` + `content_delta`/`text_delta` 全链路流式
  - Phase 4: Handler 单元测试（10 handler + 2 processor）
  - Phase 5: 可选优化（会话操作提取 + deps 类型安全）

### neko-assets（Phase 4）

> **设计说明**：neko-assets 是非破坏性引用库，只登记路径引用不复制文件。neko-engine 直接通过本地绝对路径访问媒体，与 neko-assets 完全独立。"导入"（注册文件）和"导出到编辑器"（拖拽协议）均已在 Phase 1-2 完成，**无需新增导入导出功能**，Phase 5 的 `.neko` 包分发另行实现。— [asset-management-design.md §neko-engine 关系](./docs/architecture/asset-management-design.md)

- [ ] External Media Library P2: 性能优化（元数据缓存 + 增量索引 + 搜索 + 代理文件 + 批量导入）
- [ ] ShaderAssetHandler（编译验证 + 预览 + 热重载）
- [ ] PresetAssetHandler（LUT / 转场预设 / 导出预设）
- [ ] ModelAssetHandler（AI 模型下载 + 校验 + 量化选择）
- [ ] AI 生成结果自动入库（Agent 生成 → AssetRegistry.register）
- [ ] IAIAnalysisService 实现（接入 neko-agent AI 分类）
- 见 [asset-management-design.md §Phase 4](./docs/architecture/asset-management-design.md)

---

## 🟢 P2 — 增强功能（可延后）

### neko-cut
- [x] ~~反向播放前端 UI~~ ✅ 已完成（SpeedControl.tsx 已有反向切换按钮 + PropertyPanel 集成 + 时间映射工具）— [task-plan #9](./docs/task-plan.md)

### neko-engine
- [ ] WebGPU 实时预览优化（降低 GPU→CPU 回读延迟）
- [ ] 高精度波形 Zoom（按需加载超过 800 点的精细波形）
  - 见 [diff.md §Phase 3](./docs/diff.md)
- [ ] 渲染能力补齐：shapes / keyframes（effects ✅ subtitles ✅ letter_spacing ⚠️ cosmic-text 限制）— [timeline-alignment.md §Known Issues](./docs/timeline-alignment.md)
- [ ] 转场系统接入 export pipeline（buffer→texture 架构 mismatch）— [timeline-alignment.md §Phase 2](./docs/timeline-alignment.md)

### neko-tools（媒体 Diff）
- [x] ~~**Probe 冗余执行修复**~~：缓存 `lastDiffResult`，streaming 启动时直接提取 metadata（~400ms 节省/次）
- [ ] Diff 后端增强（Phase 3）— [diff.md §Phase 3](./docs/diff.md)
  - [ ] 音频静音检测（协议已定义，未实现）
  - [x] 视频关键帧智能采样（长视频优化）— ✅ 已完成（sample_fps + 降采样）
  - [x] 音频频谱分析 / 响度归一化 BS.1770（已实现为 `audios:analyze_loudness`）
  - [ ] 视频场景切割检测
- [x] ~~**Timeline Diff 范围优化**~~：DiffControls 新增 TimeRangeControl（时间范围输入 + Apply/Reset）→ `mediaDiff:setTimeRange` 消息 → 重新触发局部 diff

### neko-canvas
- [ ] 功能补全：Port 系统 + UI 面板（Undo/Redo ✅ Copy/Paste ✅ 已完成）— [engine.md §重构 #5](./docs/engine.md)
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
- [x] Phase 1：基础诊断 + Hover（9 个诊断规则 + 媒体元数据悬停 + ProbeCache + 34 个单元测试）
- [x] Phase 2：符号 & 导航（DocumentSymbol / Definition / References + WorkspaceIndex 跨文件索引）
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

### CI/CD 基础设施（Phase 1-2 ✅ 已完成）

- [x] GitHub Actions CI — 路径过滤（ts/rust/proto）+ build + lint + test + coverage artifact
- [x] Prettier 统一格式化（`.prettierrc.json`）— 835 个文件已格式化
- [x] Pre-commit hooks（Husky + lint-staged）— ESLint --fix + Prettier 自动格式化
- [x] 根 tsconfig 强化（`strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`）
- [x] ESLint 统一配置（`eslint.config.mjs` flat config v9 + typescript-eslint + react-hooks，warn 模式）
- [x] 测试覆盖率收集（vitest v8 coverage + CI artifact 上传，13 个 vitest.config 已配置）
- [x] Rust CI 增强 — `cargo fmt --check` + `cargo clippy` + `cargo test` + cargo-deny 依赖审计
- [x] Proto 类型同步检查 — `pnpm generate:types` + git diff 检测未提交变更
- [x] 依赖安全审查 — `actions/dependency-review-action`（PR only）
- [ ] Release workflow（`.github/workflows/release.yml`，tag 触发 vsix 打包）— Phase 3
- [ ] ESLint warn → error 升级（`no-console` + `no-explicit-any`，待清理完成后）— Phase 3

### 代码质量（Phase 3 — 2026-03-09 审计）

**`as any`：541 处（生产代码 89 处 + 测试代码 452 处）**

| 包 | 生产 | 测试 | 热点文件 |
|----|------|------|----------|
| neko-cut | 16 | 242 | shapeOpsSlice.ts (16), render-handlers.ts (9), elementOpsSlice.ts (8) |
| neko-agent | 14 | 216 | slashCommandHandler.test.ts (47) 等测试文件 |
| neko-tools | 5 | 5 | MediaDiffViewer.tsx (5) |
| 其他 | 5 | 4 | 低债务，已基本清零 |

**`console.*`：219 处（log 174 + error 36 + warn 8）**

| 包 | 数量 | 状态 |
|----|------|------|
| neko-agent | 117（log 98） | 🔴 CLI + extension 混合使用 |
| neko-engine | 70（log 53） | 🔴 Sidecar 调试日志 |
| neko-tools | 21 | 🟡 中等 |
| 其他 | 11 | 🟢 低 |

**大文件（>1000 LOC）：12 个**

| 文件 | LOC | 拆分方案 |
|------|-----|----------|
| TimelineToolExecutor.ts | 2138 | P0：按工具类型拆分 Strategy |
| MediaDiffMessageHandler.ts | 1480 | P1：按消息类型提取 Handler |
| mediaProtocol.ts | 1459 | P1：按领域拆分类型子模块 |
| MediaRequestProxy.ts | 1234 | P1：按请求类型拆分 |
| CanvasApp.tsx | 1186 | P0：提取 Context/Provider + 子组件 |
| ShapePanel.tsx | 1133 | P1：提取子组件和 hooks |
| PreviewPanel.tsx | 1116 | P1：提取子组件和 hooks |
| ExportPanel.tsx | 1112 | P1：提取子组件和 hooks |
| AudioDiffViewer.tsx | 1081 | P1：分离波形渲染和交互逻辑 |
| AssetVariantDiffEditorProvider.ts | 1071 | P1：重构 |
| videoEditorProvider.ts | 1062 | P1：重构 |
| MediaService.ts | 1038 | P1：模块化 |

**其他指标**

| 指标 | 数量 | 状态 |
|------|------|------|
| eslint-disable 注释 | 17 | 🟢 低，分散在各包 |
| @deprecated 标记 | 59（neko-types 29 + neko-agent 27） | 🟡 需清理废弃 API |
| TODO/FIXME | 16（无 P0 阻塞） | 🟢 全部是功能导向 |
| 测试文件比例 | neko-cut 6%、neko-canvas 6%、neko-agent 10% | 🔴 neko-cut 最需补充 |

**Phase 3 清理优先级**

| 优先级 | 任务 | 预期收益 |
|--------|------|----------|
| P0 | TimelineToolExecutor（2138 LOC）拆分 | 可维护性 + 可测试性 |
| P0 | neko-cut stores 16 处 `as any` → discriminated unions | 类型安全 |
| P1 | console.log → Logger 迁移（neko-agent 98 处 + neko-engine 53 处） | 日志规范 |
| P1 | 4 个 1100+ LOC 面板组件 hooks 提取 | 可维护性 |
| P2 | @deprecated API 清理（59 处） | 减少混淆 |
| P2 | neko-cut 测试补充（6% → 15%，需 ~30 个测试文件） | 回归保护 |
| P3 | ESLint warn → error 升级 | 质量守门 |
| P3 | Release workflow（vsix 打包发布） | 自动化发布 |

**其他技术债务**

| 优先级 | 问题 | 影响 | 来源 |
|--------|------|------|------|
| ~~高~~ | ~~统一错误处理机制~~ ✅ 框架已建立 | ~~调试困难~~ | [task-plan TD-2](./docs/task-plan.md) |
| 高 | neko-engine 性能监控（telemetry 基础已有，需接入指标面板） | 性能盲区 | |
| 中 | AI SDK 依赖倒置（`AISdkAdapter` 直接依赖 Vercel AI SDK，DIP 65/100） | 可替换性差 | [task-plan TD-1](./docs/task-plan.md) |
| ~~中~~ | ~~neko-types 83 个 `as any`~~ ✅ 已清理至 2 处（仅测试代码） | ~~类型安全~~ | [engine.md](./docs/engine.md) |
| 中 | neko-types JSDoc 覆盖率低 | 开发体验差 | |
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

*最后更新：2026-03-09（CI/CD Phase 1-2 ✅ + Phase 3 技术债务审计：541 as any / 219 console / 12 大文件）*
