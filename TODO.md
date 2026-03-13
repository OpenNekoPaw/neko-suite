# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。

---

## 🔴 P0 — 阻塞性（本迭代必须完成）

### 后续开发步骤

1. ~~验证 Phase 3 Rust 编译~~ ✅ `cargo build` 通过（仅 warnings，无 errors）
2. neko-model Phase 2 继续推进 — 当前迭代 P1 核心，CSG 布尔运算和 3D 文字挤出是最高复杂度项
3. ~~neko-sketch 逐帧动画~~ ✅ S.2 + S.3 全部完成

---

## 🟡 P1 — 核心功能（当前迭代）

### neko-engine（3D PBR 渲染 Phase 3）✅ 已完成

**目标**：轻量 PBR 渲染 + 场景组装 + 时间线集成（打通 3D 场景 → GPU 纹理 → 2D 合成管线）
**进度**：12/12 完成（100%）

**已完成** ✅：
- [x] Step 1: GPU 资产缓存（AssetCache，glTF → GPU mesh/material，按 URI 去重）
- [x] Step 2: PBR 渲染管线（Forward rendering, Cook-Torrance BRDF, `pbr_forward.wgsl`）
- [x] Step 3: SceneRenderOutput → GpuLayer 桥接（Rgba16Float 零拷贝进 TextureCompositor）
- [x] Step 4: Scene3D 元素类型（ElementType::Scene3D + Scene3DElementData + CameraOverride）
- [x] Step 5: SceneService 扩展（ISceneService::render_frame，Mutex 内 tick+render 同一锁）
- [x] Step 6: GpuExportPipeline 集成（collect_visible_scene3d → render → GpuLayer）
- [x] Step 7: ScenesController 渲染 API（capture/composite/stream 三个 action）
- [x] Step 8: 动画插值增强（Translation/Scale LERP + Rotation SLERP + MorphWeights LERP）
- [x] Step 9: IBL 环境系统（irradiance map + prefilter map + BRDF LUT + skybox）
- [x] Step 10: 后处理链（Tone Mapping ACES/Reinhard/Uncharted2 + bloom + vignette + color grading）
- [x] Step 11: GPU 粒子系统（compute shader 模拟 + billboard 渲染，fire/smoke/magic/debris 预设）
- [x] Step 12: 前端集成（TS 类型 + neko-cut 时间线 dispatch + neko-canvas 节点类型 + AI action 映射）

**新增文件**：`scene_renderer/` 模块（asset_cache/pbr_pipeline/environment/post_process/particles/vertex）+ 5 个 WGSL shaders
**修改文件**：gpu_export_pipeline.rs、domain/timeline.rs、services/scene.rs、editor-types.ts、TimelineElementContent.tsx、extendedCanvas.ts、LayerPanel.tsx、aiAction.ts 等

### neko-model（3D 编辑器 Phase 2）

**目标**：AI 捏脸 + 基础建模 + 延迟验证
**进度**：4/7 完成（57%）

**已完成** ✅：
- [x] 前端：参数化面部编辑器（R3F 视口 + 分类滑块面板：脸型/眼/鼻/嘴/眉，22 个参数）
- [x] 前端：Morph Target 驱动捏脸（自动绑定 morphTargetInfluences）
- [x] 前端：VRM 表情预设（`@pixiv/three-vrm@^3.5.1`，17 个标准表情：情绪/口型/眼神）
- [x] 前端：延迟测试工具（100 次测试 + Min/Max/Avg/P95 统计 + 建议）
- [x] 后端：`scenes:latency_test` action（立即返回，用于 RTT 测量）

**待完成** ⬜：
- [ ] 前端：骨骼驱动表情（口型/眼球追踪/眉毛）
- [ ] 前端：CSG 操作 UI（并集/差集/交集）
- [ ] 前端：3D 文字编辑器
- [ ] 前端：参数化几何体面板
- [ ] 后端：CSG 布尔运算（三角网格级别）
- [ ] 后端：3D 文字挤出（`cosmic-text`）
- [ ] 后端：参数化几何体生成
- [ ] 后端：JPEG 单帧模式（备选方案 B，根据延迟测试结果决定）
- [ ] AI MCP Tools：`face.generate_params`（文本 → 参数向量）
- [ ] AI MCP Tools：`face.from_image`（图片 → 参数向量）
- [ ] AI MCP Tools：`face.adjust`（自然语言微调）

**关键里程碑**：实测 H.264 流延迟 < 15ms → 方案 A 够用 | 15-30ms → 启用方案 B | > 30ms → 启动方案 C

---

## 🟢 P2 — 增强功能（可延后）

### neko-engine
- [ ] WebGPU 实时预览优化（降低 GPU→CPU 回读延迟）
- [ ] 高精度波形 Zoom（按需加载超过 800 点的精细波形）
- [ ] 渲染能力补齐：shapes / keyframes（effects ✅ subtitles ✅ letter_spacing ⚠️ cosmic-text 限制）
- [ ] 转场系统接入 export pipeline（buffer→texture 架构 mismatch）

### neko-sketch（S.2 骨骼动画 + S.3 高级 2D）✅ 已完成
- [x] bevy_animation ParameterCurve 桥接层（AnimationTarget → inox2d 参数值）✅
- [x] inox2d 真实 INP 解析（手动解析 INP 二进制格式，绕过 inox2d 0.3.0 `pub(crate)` 限制）✅
- [x] anim/play、anim/stop、anim/seek、anims HTTP 端点 ✅
- [x] `GET /v1/puppets/stream` 60fps WebSocket PuppetDelta 推送 ✅
- [x] AnimationPanel UI（动画列表 + 播放控制 + Seek slider）✅
- [x] IInochi2DController.connectStream（WebSocket 接入）✅
- [x] 逐帧动画：洋葱皮渲染 + 帧管理 + 精灵表导出 ✅
- [x] S.3 滤镜系统（FilterPipeline + FilterRegistry 6 内置 GLSL + FilterPanel UI）✅
- [x] S.3 粒子系统（ParticleSimulation 对象池 + ParticleRenderer WebGL2 实例化 + ParticlePanel UI）✅
- [x] S.3 变形动画（MorphEngine 顶点变形 + 关键帧插值 + MorphEditor UI）✅
- [x] S.3 场景系统（视差渲染 + 4 场景模板 + 氛围效果 5 预设 + ScenePanel/AtmospherePanel）✅
- [x] S.3 像素绘制（Bresenham + flood fill + 1x/2x/4x/8x 画笔）✅
- [x] S.3 矢量绘制（贝塞尔路径 + 矩形/椭圆/多边形/星形 + SVG 导出）✅
- [x] S.3 资产集成（精灵表/场景 JSON 导出 + VSCode 命令）✅
- [x] S.3 渲染管线集成（filterFn 回调 + SketchRenderer.renderWithEffects）✅
- [x] S.3 单元测试（7 文件 42 测试）✅

### neko-tools（媒体 Diff）
- [ ] Diff 后端增强（Phase 3）
  - [ ] 音频静音检测（协议已定义，未实现）
  - [ ] 视频场景切割检测
- [ ] AI 生成内容对比（基于现有 MediaDiff 扩展，无需新子包）
  - [ ] CompareView N 文件网格对比（现有仅支持 2 文件）
  - [ ] AI 元数据面板（展示 prompt / model / seed 等生成参数）
  - [ ] 用户评分/标注组件（主观质量评价）
  - [ ] neko-agent 集成入口（`neko.tools.compareAIResults` 命令）
- [ ] 自定义 AI API 诊断（在 neko-agent 配置页内置，非独立包）
  - [ ] 连通性测试（鉴权验证）
  - [ ] 延迟测试（首 token 时间 / 总响应时间）
  - [ ] 兼容性检测（streaming / tool_use 支持）
  - [ ] 配额检查（速率限制 / 余额）

### neko-canvas
- [ ] 功能补全：Port 系统 + UI 面板
- [ ] WebGPU 渲染管线（当前 Canvas 2D 降级实现）
- [ ] 特效系统（复用 neko-engine WGSL shaders）
- [ ] 自定义转场（复用 engine 转场类型）
- [ ] 导出功能

### neko-proto
- [ ] 接入 protoc/buf 自动生成（当前手动维护，同步成本高）
- [ ] 补齐 diff.proto 剩余类型定义

### EditOperation 遗留项
- [ ] neko-types `package.json` 缺少 test script（测试文件已写但无法运行）
- [ ] 操作 undo/redo 正确性手动验证

---

## 🔵 P3 — 长期功能

### Diff AI 增强（Phase 4-6）
- [ ] CLIP 语义打分（Prompt↔视频/图片对齐度）
- [ ] Whisper ASR 文本 Diff（对白变更检测）
- [ ] Demucs 音源分离（人声/背景独立比较）
- [ ] Grounding DINO 目标锚点验证
- [ ] AI 质量评估（黑帧/静音/冻结检测 + No-Reference VQA）
- [ ] AI 素材筛选（批量 CLIP 打分 + 语义一致性过滤 + 视觉聚类去重）

### Media LSP（Phase 3-5）— [docs/architecture/lsp.md](./docs/architecture/lsp.md)
- [ ] Phase 3：AI 增强（CLIP / Whisper / Demucs / Grounding DINO）
- [ ] Phase 4：AI 素材审查
- [ ] Phase 5：质量评估（黑帧检测 / VQA / SAM 智能蒙版）

### neko-agent 创意助手
- [ ] 批量时间线操作 Skill（当前仅支持单元素操作）
- [ ] AI 字幕生成 Skill（调用 Whisper / 云端 ASR）
- [ ] 智能素材推荐（根据剧本自动检索资产库）
- [ ] 场景描述 → 自动配乐
- [ ] 场景描写辅助

### neko-assets（未来开发）
- [ ] ShaderAssetHandler（编译验证 + 预览 + 热重载）
- [ ] PresetAssetHandler（LUT / 转场预设 / 导出预设）
- [ ] AI 生成结果自动入库（Agent 生成 → AssetRegistry.register）
- [ ] External Media Library P2: 性能优化（元数据缓存 + 增量索引 + 搜索 + 代理文件 + 批量导入）
- [ ] ModelAssetHandler（AI 模型下载 + 校验 + 量化选择）
- [ ] IAIAnalysisService 实现（接入 neko-agent AI 分类）

### 跨语言架构对齐
- [ ] Step 2：Engine ComputeService（`/v1/compute/evaluate_frame`，消除 ~1285 行 TS 重复计算）
- [ ] Step 3：UI 状态分离（Track/Element UI 字段移入前端 Store）

---

## 📋 技术债务

### CI/CD（待完成项）
- [ ] 覆盖率阈值启用（vitest 已统一到 v4，待取消 `vitest.shared.ts` 注释的 thresholds）
- [ ] CI code-quality 移除 `continue-on-error`（本地稳定后使其成为阻塞门禁）
- [ ] Release workflow（`.github/workflows/release.yml`，tag 触发 vsix 打包）
- [ ] ESLint warn → error 升级（`no-console` + `no-explicit-any`）

### 代码质量（2026-03-09 审计基线）

**扫描基线**：Knip 132 未使用文件 | 421 未使用导出 | 22 未使用依赖 | 7 循环依赖

**`as any`：541 处（生产 89 + 测试 452）**

| 包 | 生产 | 测试 | 热点 |
|----|------|------|------|
| neko-cut | 0 ✅ | 242 | render-handlers.ts (9) |
| neko-agent | 14 | 216 | 测试文件 |
| neko-tools | 5 | 5 | MediaDiffViewer.tsx |
| 其他 | 5 | 4 | 低债务 |

**大文件（>1000 LOC）：5 个待拆分**

| 文件 | LOC | 拆分方案 |
|------|-----|----------|
| ShapePanel.tsx | 1133 | 提取子组件和 hooks |
| PreviewPanel.tsx | 1116 | 提取子组件和 hooks |
| ExportPanel.tsx | 1112 | 提取子组件和 hooks |
| AudioDiffViewer.tsx | 1081 | 分离波形渲染和交互逻辑 |
| AssetVariantDiffEditorProvider.ts | 1071 | 重构 |

**清理优先级**

| 优先级 | 任务 | 预期收益 |
|--------|------|----------|
| P2 | neko-cut 测试补充（6% → 15%） | 回归保护 |
| P3 | ESLint warn → error 升级 | 质量守门 |
| P3 | Release workflow（vsix 打包发布） | 自动化发布 |

**其他技术债务**

| 优先级 | 问题 | 影响 |
|--------|------|------|
| 高 | neko-engine 性能监控（telemetry 基础已有，需接入指标面板） | 性能盲区 |
| 中 | AI SDK 依赖倒置（`AISdkAdapter` 直接依赖 Vercel AI SDK） | 可替换性差 |
| 中 | neko-types JSDoc 覆盖率低 | 开发体验差 |
| 低 | 国际化扩展（neko-cut/neko-agent 已完成，其他包待补） | 国际化缺口 |

---

## 🚧 规划中（未开始）

| 模块 | 目标 | 参考 |
|------|------|------|
| neko-protocol | 共享协议仓库（Proto IDL → TS/Go/Rust 生成） | — |
| @neko/types 重组 | domain/ 分层 + exports 子路径隔离 | — |
| @neko/media-analysis | 从 neko-tools 提取纯 Diff 算法包 | — |
| neko-audio | 波形编辑 + 均衡器 + 录音 | Phase 4 |
| neko-live | 动捕 + 虚拟形象 + 直播 | Phase 5 |
| neko-assets Phase 5 | 社区分发（.neko 包格式 + 远程注册表） | — |

---

*最后更新：2026-03-13（neko-sketch S.2 + S.3 全部完成：逐帧动画 + 滤镜/粒子/场景/像素/矢量/资产集成 + 渲染管线接入 + 42 单元测试）*
