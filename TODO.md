# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。

---

## 🟢 P2 — 增强功能（可延后）

### neko-engine
- [ ] WebGPU 实时预览优化（降低 GPU→CPU 回读延迟）
- [ ] 高精度波形 Zoom（按需加载超过 800 点的精细波形）
- [ ] 渲染能力补齐：shapes / keyframes（effects ✅ subtitles ✅ letter_spacing ⚠️ cosmic-text 限制）

### neko-canvas
- [x] 节点 resize/rotate + 框选 + 分组节点（resize ✅ 分组 ✅ rotate ✅ 框选 ✅）
- [x] Port 系统 + UI 面板（Port 类型/渲染 ✅ PortEditor UI 面板 ✅）

### neko-tools（媒体 Diff）
- [ ] 音频静音检测 UI（数据层已就绪：engine 后端 ✅ + Proto 类型 ✅ + Analyzer 接收 ✅，仅缺 AudioDiffViewer 沉默区域可视化）
- [ ] CompareView N 文件网格对比（现有仅支持 2 文件，AI 生成场景需对比 3-8 个变体）
- [ ] 视频场景切割检测（需 engine 新增 FFmpeg scene filter，优先级低）

### neko-canvas（高级功能）
- [x] 画板导出为图片（PNG/SVG，html-to-image 截图 + Extension 保存）
- [ ] 大量节点性能优化（Canvas 2D 渲染 或 OffscreenCanvas + Worker，当前 DOM/SVG 方案 <1000 节点足够）

### neko-proto
- [ ] 接入 protoc/buf 自动生成（当前手动维护，同步成本高）
- [x] 补齐 diff.proto 剩余类型定义（CanvasContentDiff + AudioSilenceDetection 已添加）

### neko-preview（音频播放器现代化）
- [x] Phase 1：视觉重设计 + 视图切换框架（Apple Music 风格布局 + 封面/歌词/波形三视图 + `--neko-audio-*` 主题变量 + speed 控制 + 拖拽 seek storm 修复）
- [ ] Phase 2：Engine 元数据扩展（FFmpeg metadata dict → ID3/Vorbis 标签提取 + 封面流提取 + MediaInfo 扩展 + 真实封面展示 + 模糊背景）
- [ ] Phase 3：歌词支持（.lrc 时间标签解析 + 嵌入歌词提取 + 同目录 .lrc 查找 + 滚动高亮歌词视图）

### EditOperation 遗留项
- [x] neko-types `package.json` 缺少 test script（已添加，11 文件 242 测试通过）
- [x] 操作 undo/redo 正确性验证（invert 30+ / roundtrip 40+ / historySlice 15+ 测试已覆盖）
- [x] neko-audio EditOperation 接入（audioProjectStore：dispatch + undo/redo + Extension 同步）
- [x] neko-canvas EditOperation 接入（canvasOperationStore 桥接层，14 个操作方法记录 EditOperation）
- [x] neko-sketch EditOperation 接入（sketchOperationStore 桥接层，layerSlice 5 个操作方法记录）
- [x] neko-types operations 扩展（audio 8 类型 + canvas 8 类型 + sketch 8 类型 + apply/invert 全覆盖）

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
- [ ] AI API 诊断（配置页内置：连通性/延迟/兼容性/配额检查，从 neko-tools 迁移）

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

### 代码质量

**扫描基线**：`pnpm build` ✅ | `pnpm test` ✅ | `pnpm check` ❌（Knip 未使用导出）

**源码 TODO 扫描**：10 处（P0: 0 | P1: 0 | P2: 0 | 一般: 3 | 误报: 7）— 无阻塞项

**扫描基线**：Knip 5 未使用文件 | 435 未使用导出 | 16 未使用依赖 | **0 循环依赖** ✅

**`as any`：452 处（生产 0 ✅ + 测试 452）**

生产代码 `as any` 已全部清除（18 → 0），修复方式：
- i18n 动态键：移除不必要的 `as any`（`t()` 签名已接受 `string`）
- 类型联合：利用判别联合自动窄化 + 精确类型断言（`BezierShape`）
- 全局 API：Window 接口扩展（`vite-env.d.ts` / `global.d.ts`）+ `'X' in globalThis`
- 泛型不兼容：BaseNode 引入 `BaseNodeInput` 放宽 prop 约束
- 接口对齐：`VSCodeTaskStorage` 实现 `ITaskStorage` + `createAllMCPTools()` 包装 MCP 工具
- 动态对象：`Record<string, unknown>` 中间变量 + `typeof` 守卫

**`as unknown as`（模式 1：TimelineElement 联合类型字段访问）：42 → 5 ✅**

neko-cut tool handler 8 文件中 ~42 处 `as unknown as` 收敛为 5 处（减少 88%），修复方式：
- 引入 `ToolElement`（`TimelineElement & Partial<ToolElementExtensions>`）+ `ToolTrack` 类型，集中声明运行时 UI 扩展字段
- `findElement()` 返回 `ToolElement`，将类型断言集中在 1 处
- `mergeElement()` / `createElement()` 工具函数消除 handler 中 spread+cast 模式
- 判别联合自动窄化访问 `src`/`content`/`shapes` 等子类型字段
- 剩余 5 处：`helpers.ts` 1 处（`createElement` 集中断言）+ `shapeHandler.ts` 4 处（Shape↔Record 固有转换）

**未使用导出分析** 📊：
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

**待清理**：

| 优先级 | 任务 | 预期收益 |
|--------|------|----------|
| P3 | 清理 ~200 处 Hook 类型定义 | 代码整洁 |
| P3 | ESLint warn → error 升级 | 质量守门 |
| P3 | Release workflow（vsix 打包发布） | 自动化发布 |

**大文件（>1000 LOC）：5 个待拆分**

| 文件 | LOC | 拆分方案 |
|------|-----|----------|
| ShapePanel.tsx | 1133 | 提取子组件和 hooks |
| PreviewPanel.tsx | 1116 | 提取子组件和 hooks |
| ExportPanel.tsx | 1112 | 提取子组件和 hooks |
| AudioDiffViewer.tsx | 1081 | 分离波形渲染和交互逻辑 |
| AssetVariantDiffEditorProvider.ts | 1071 | 重构 |

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
| neko-audio 遗留 | neko-preview 高级预览 | Phase 4 |
| neko-live | 动捕 + 虚拟形象 + 直播（前置 neko-audio；5.1 MediaPipe/VMC 追踪 + VRM 预览；5.2 录制 + 音视频同步；5.3 RTMP→OBS 推流；虚拟摄像头不做，改 RTMP） | Phase 5 |
| neko-assets Phase 5 | 社区分发（.neko 包格式 + 远程注册表） | — |
| neko-vr | VR/AR 沉浸式创作（立体渲染 + Electron WebXR App + 手部追踪；前置 Phase 3 + 5） | Phase 7 |

### neko-engine 设备代理（[ADR](./docs/architecture/device-access.md)）— ✅ P1-P3 框架完成

| 优先级 | 设备 | 状态 | 说明 |
|--------|------|------|------|
| P1 | 麦克风 | ✅ 完整 | `cpal` 采集 + WAV 写入 + `/v1/monitor` 电平 + neko-audio 双模式录制 |
| P2 | 摄像头 | ⚠️ 框架 | trait + controller + TS 方法就绪，capture 实现需 FFmpeg avdevice 集成 |
| P3 | MIDI | ✅ 完整 | `midir` 端口枚举 + 连接 + 事件 broadcast + `/v1/midi/{id}` WS 端点 |
| P3 | Gamepad | ✅ 完整 | `gilrs` 枚举 + 120Hz 轮询 + broadcast + `/v1/gamepad/{id}` WS 端点 |
| — | 手写板压感 | ✅ 无需代理 | `PointerEvent.pressure` webview 内直接可用 |

**待完成**：
- [ ] 摄像头 capture 实现（FFmpeg avdevice → H.264 编码 → WebSocket 流，属 neko-live Phase 5 前置）

---

*最后更新：2026-03-19（neko-preview 音频播放器现代化 Phase 1 完成；EditOperation 全包接入完成）*
