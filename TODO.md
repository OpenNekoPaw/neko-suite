# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。

---

## 🔴 P0 — 阻塞性（本迭代必须完成）

### 构建/测试修复 ✅ 已完成
1. [x] `@neko-model/webview` 测试脚本缺少 `--passWithNoTests`（已修复）
2. [x] `neko-sketch/packages/extension/package.json` 入口 `./src/index.ts` 文件不存在（Knip 配置已修正：从整体 ignore 改为分子包正确配置入口）

---

## 🟡 P1 — 核心功能（当前迭代）

### neko-engine（3D PBR 渲染 Phase 3）✅ 已完成（12/12）

### neko-model（3D 编辑器 Phase 2）✅ 已完成（11/11）

---

## 🟢 P2 — 增强功能（可延后）

### neko-engine
- [ ] WebGPU 实时预览优化（降低 GPU→CPU 回读延迟）
- [ ] 高精度波形 Zoom（按需加载超过 800 点的精细波形）
- [ ] 渲染能力补齐：shapes / keyframes（effects ✅ subtitles ✅ letter_spacing ⚠️ cosmic-text 限制）
- [x] 转场系统接入 export pipeline（TextureTransitionProcessor，18 种转场 GPU texture 路径）

### neko-sketch（S.2 + S.3）✅ 已完成

### neko-canvas
- [ ] 节点 resize/rotate + 框选 + 分组节点
- [ ] Port 系统 + UI 面板

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

### neko-canvas（高级功能）
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

### neko-model AI MCP Tools
- [ ] `face.generate_params`（文本 → 参数向量）
- [ ] `face.from_image`（图片 → 参数向量）
- [ ] `face.adjust`（自然语言微调）

### neko-assets（未来开发）
- [ ] ShaderAssetHandler（编译验证 + 预览 + 热重载）
- [ ] PresetAssetHandler（LUT / 转场预设 / 导出预设）
- [ ] AI 生成结果自动入库（Agent 生成 → AssetRegistry.register）
- [ ] External Media Library P2: 性能优化（元数据缓存 + 增量索引 + 搜索 + 代理文件 + 批量导入）
- [ ] ModelAssetHandler（AI 模型下载 + 校验 + 量化选择）
- [ ] IAIAnalysisService 实现（接入 neko-agent AI 分类）

### neko-live 虚拟制片（Phase 5，前置 neko-audio）
- [ ] Phase 5.1：核心追踪
  - [ ] Webview 脚手架（React + Zustand + Three.js + @pixiv/three-vrm）
  - [ ] Extension Host VmcReceiver（Node.js dgram UDP → postMessage 中转）
  - [ ] MediaPipe Face/Pose 集成（468 面部 + 33 姿态点 → VRM BlendShape 映射）
  - [ ] 骨骼/表情驱动（复用 neko-model BoneExpression + 口型同步 6 音素）
  - [ ] 60fps 实时预览流（复用 neko-sketch puppet_stream WebSocket）
- [ ] Phase 5.2：录制与输出
  - [ ] 追踪标定系统（坐标系校准 + 参数微调）
  - [ ] 录制管道（复用 neko-engine ExportService + GPU 导出管线）
  - [ ] 音视频同步（依赖 neko-audio AudioMixer）
  - [ ] MP4 导出 → neko-cut 时间线集成
- [ ] Phase 5.3：直播推流
  - [ ] RTMP/SRT 推流（native-core FFmpeg 输出，绕过虚拟摄像头驱动）
  - [ ] OBS WebSocket 集成
  - [ ] neko-sketch 2D puppet 联动（INP → 实时驱动）

### VR/AR 沉浸式创作（远期 Phase 7）
- [ ] Phase 7.1：neko-engine 立体渲染（双 Pass wgpu + 镜头畸变校正 + XR pose 同步）
- [ ] Phase 7.2：Electron/Tauri WebXR 外部 App（沉浸式预览 + 手部追踪 → 骨骼映射）
- [ ] Phase 7.3：AR 能力（ARKit/ARCore 原生集成 + 平面检测 + 光照估计）
- [ ] Phase 7.4：AI 辅助 XR（neko-agent VR 场景生成 MCP Tools + 手势识别 + 语音指令）

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

### 代码质量（2026-03-16 更新）

**扫描基线**：`pnpm build` ✅ | `pnpm test` ✅ | `pnpm check` ❌（Knip 未使用导出）

**源码 TODO 扫描**：12 处（P0: 0 | P1: 0 | P2: 2 | 一般: 3 | 误报: 7）— 无阻塞项

**扫描基线**：Knip 5 未使用文件 | 435 未使用导出 | 16 未使用依赖 | **0 循环依赖** ✅

**循环依赖修复** ✅ **完成（2026-03-14）**
- neko-types: 2 处 → 0（ToolFilterOptions 移至 tool.ts）
- neko-cut webview: 3 处 → 0（已自动修复）
- neko-agent platform: 2 处 → 0（已自动修复）
- **成果**：7 → 0（100% 清理）

**`console.log` 清理** ✅ **完成（2026-03-14）**
- neko-tools webview: 21 处 → 0（迁移至 Logger）
- neko-client: 3 处 → 0（EngineClient + H264StreamClient）
- neko-model: 4 处 → 0（extension + webview 组件）
- neko-story: 1 处 → 0（ErrorBoundary）
- neko-audio/neko-live: 2 处 → 0（extension 激活日志）
- **保留**：ExportIntegrationTest.ts / simpleExportTest.js（CLI 测试脚本）
- **保留**：cli-tui 包（CLI 工具的标准 stdout/stderr 输出）

**`as any`：470 处（生产 18 + 测试 452）** — 生产代码减少 71 处 ✅（80% 改善）

| 包 | 生产 | 测试 | 热点 |
|----|------|------|------|
| neko-cut | 9 | 242 | TimelineTrack.tsx (4) |
| neko-canvas | 3 | 0 | TextNode/ArtboardNode/LayerPanel |
| neko-agent | 2 | 216 | serviceBootstrap.ts |
| neko-preview | 1 | 0 | useVscodeMessage.ts |
| 其他 | 3 | 194 | 低债务 |

**已修复（2026-03-14）**：
- render-handlers.ts: 9 处 → 0（类型守卫 + ProjectData 类型）
- MediaDiffViewer.tsx: 5 处 → 0（联合类型断言）
- keyframeHandler.ts: 3 处 → 0（交叉类型 `TimelineElement & { keyframes: ... }`）
- maskHandler.ts: 3 处 → 0（移除不必要的 `as any`）

**ESLint 配置优化（2026-03-14）** ✅：
- 测试文件关闭 `@typescript-eslint/no-explicit-any` 规则（452 处不再警告）
- 测试文件关闭 `@typescript-eslint/no-non-null-assertion` 规则
- 生产代码保持严格检查（18 处仍会警告）

**未使用导出分析（2026-03-14）** 📊：
- 总计：962 处（435 导出 + 527 类型）
- Barrel exports (index.ts): 146 处（34%）
- Phase 2 类型定义: ~200 处（21%）- 规划功能，暂不清理
- Hook 类型定义: ~100 处（10%）
- 工具函数/常量: ~100 处（10%）
- 其他: ~416 处（43%）

**按包分布**：
- neko-cut webview: ~350 处（types.ts 164 + services/index.ts 36）
- neko-agent webview: ~200 处（hooks/index.ts 29 + handlers）
- neko-canvas webview: ~120 处（components/index.ts 34 + hooks/index.ts 46）

**清理策略**：
- P1: 16 个未使用 devDependencies（`pnpm check:unused:fix`）
- P2: ~150 处 barrel exports 和工具函数
- P3: ~200 处 Hook 类型定义
- 保留: ~600 处 Phase 2 功能类型和公共 API

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
| P1 | 清理 16 个未使用 devDependencies | 减少安装时间 |
| P2 | 清理 ~150 处 barrel exports | 减少 bundle size |
| P2 | neko-cut 测试补充（6% → 15%） | 回归保护 |
| P3 | 清理 ~200 处 Hook 类型定义 | 代码整洁 |
| P3 | ESLint warn → error 升级 | 质量守门 |
| P3 | Release workflow（vsix 打包发布） | 自动化发布 |

**其他技术债务**

| 优先级 | 问题 | 影响 |
|--------|------|------|
| 高 | neko-engine 性能监控（telemetry 基础已有，需接入指标面板） | 性能盲区 |
| 中 | AI SDK 依赖倒置（`AISdkAdapter` 直接依赖 Vercel AI SDK） | 可替换性差 |
| 中 | neko-types JSDoc 覆盖率低 | 开发体验差 |
| 低 | 国际化扩展（neko-cut/neko-agent/neko-sketch 已完成，其他包待补） | 国际化缺口 |

---

## 🚧 规划中（未开始）

| 模块 | 目标 | 参考 |
|------|------|------|
| neko-protocol | 共享协议仓库（Proto IDL → TS/Go/Rust 生成） | — |
| @neko/types 重组 | domain/ 分层 + exports 子路径隔离 | — |
| @neko/media-analysis | 从 neko-tools 提取纯 Diff 算法包 | — |
| neko-audio | 波形编辑 + 均衡器 + 录音 | Phase 4 |
| neko-live | 动捕 + 虚拟形象 + 直播（前置 neko-audio；5.1 MediaPipe/VMC 追踪 + VRM 预览；5.2 录制 + 音视频同步；5.3 RTMP→OBS 推流；虚拟摄像头不做，改 RTMP） | Phase 5 |
| neko-assets Phase 5 | 社区分发（.neko 包格式 + 远程注册表） | — |
| neko-vr | VR/AR 沉浸式创作（立体渲染 + Electron WebXR App + 手部追踪；前置 Phase 3 + 5） | Phase 7 |

---

*最后更新：2026-03-16（P0 构建修复 2 项已完成；Knip 配置修正 neko-sketch/neko-model 子包入口；扫描基线 pnpm test ✅）*
