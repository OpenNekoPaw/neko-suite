# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。

---

## ✅ 已完成（本轮）

<details>
<summary>neko-canvas — resize/rotate/框选/分组/Port/画板导出</summary>

- 节点 resize/rotate + 框选 + 分组节点
- Port 系统 + UI 面板
- 画板导出为图片（PNG/SVG）
</details>

<details>
<summary>neko-proto — diff.proto 补齐</summary>

- CanvasContentDiff + AudioSilenceDetection 类型定义
</details>

<details>
<summary>neko-preview — 音频播放器现代化 Phase 1-5</summary>

- Apple Music 风格四视图 + 封面/歌词/波形/频谱
- Engine 元数据扩展（ID3/Vorbis/封面提取）
- LRC 歌词 + 嵌入歌词提取
</details>

<details>
<summary>UI 现代化 — Phase 0-5.6 全部完成</summary>

- neko-preview Phase 0-3（Tailwind + macOS Token + 组件重构 + 视频播放器）
- neko-audio Phase 4（Tailwind + macOS 组件）
- neko-story Phase 5（VSCode 主题变量）
- neko-tools Phase 5.5-5.6（macOS 主题配色 + File Icon Theme）
- @neko/shared（Design Token + 30+ SVG 图标）
- 共享组件迁移（MacButton/MacSlider/MacTabs/ProgressBar → @neko/shared/components）
</details>

<details>
<summary>EditOperation — 全包接入</summary>

- neko-types test + undo/redo 验证
- neko-audio / neko-canvas / neko-sketch 接入
- operations 类型扩展（audio 8 + canvas 8 + sketch 8）
</details>

<details>
<summary>neko-agent 架构补全</summary>

- Phase 3 重构（统一循环 + SessionInitializer + IPermissionManager + SkillInjection rollback）
- 媒体工具贯通（GenerateImage/Video/Music/TTS 4 个工具均有 execute）
- AI SDK 迁移（@ai-sdk/openai,google,anthropic v3）
- Pipeline Hook Registry + generatePilot stage
- 工具系统简化（1M context 全工具常驻 + meta-tools）
</details>

<details>
<summary>neko-market — Phase 6.5.1-6.5.2（市场核心 + Skill MVP）</summary>

- @neko/market-core Layer 0 包：MarketClient + InstallManager + CacheManager + VersionResolver + IntegrityChecker + InstalledRegistry + LicenseManager（stub）
- 市场类型定义：25+ 类型 + 6 个核心接口（IMarketClient/IInstallManager/IInstallTarget/ICacheManager/IVersionResolver/ILicenseManager）
- AssetDistribution 市场扩展字段 + SkillMarketMetadata + AssetCompatibility
- SkillSource 添加 'market' + SkillFrontmatter 添加 'market-id'
- Skill 市场 Extension 层：SkillInstallTarget + SkillAssetHandler + SkillMarketService + SkillMarketHandler
- Skill 市场 Webview：SkillMarketPanel（Browse/Installed/Updates）+ SkillCard + SkillSearchBar + useSkillMarket store
- 7 测试文件 / 58 用例全部通过
- dependency-cruiser 规则：market-core Layer 0 隔离 + 跨扩展依赖规则
</details>

<details>
<summary>neko-market — Phase 6.5.5（消费端集成 + 热加载）</summary>

- NekoMarketAPI 公共接口：`onDidInstall` / `onDidUninstall` / `onDidEnable` / `onDidDisable` / `getInstalled` / `isInstalled`
- InstalledPackage 增加 `enabled` 字段，支持启用/停用（不删除文件，仅切换状态）
- MarketplaceService 4 个 vscode.EventEmitter + `enable()` / `disable()` 方法
- MarketplaceHandler 新增 `market:enable` / `market:disable` 路由
- Webview InstalledView 启停 toggle（eye/eye-closed 图标）+ i18n（EN/ZH-CN）
- neko-cut MarketShaderService：扫描 `~/.neko/shaders/` + 订阅市场事件热重载 + graceful degradation
- InstalledRegistry `setEnabled()` + 旧数据 backward compat（无 enabled 字段默认 true）
- market-core 64 测试 + neko-cut 468 测试全部通过
</details>

---

## 🟢 P2 — 增强功能（可延后）

### neko-engine
- [ ] WebGPU 实时预览优化（降低 GPU→CPU 回读延迟）
- [ ] 高精度波形 Zoom（按需加载超过 800 点的精细波形）
- [ ] 渲染能力补齐：shapes / keyframes（effects ✅ subtitles ✅ letter_spacing ⚠️ cosmic-text 限制）

### neko-tools（媒体 Diff）
- [ ] 音频静音检测 UI（数据层已就绪，仅缺 AudioDiffViewer 沉默区域可视化）
- [ ] CompareView N 文件网格对比（现有仅支持 2 文件）
- [ ] 视频场景切割检测（需 engine 新增 FFmpeg scene filter）

### neko-canvas
- [ ] 大量节点性能优化（Canvas 2D / OffscreenCanvas + Worker，当前 <1000 节点足够）

### neko-proto
- [ ] Rust 域模型漂移检测增强（`__engine-check.ts` 覆盖面扩展）

---

## 🔵 P3 — 长期功能

### Diff AI 增强（Phase 4-6）
- [ ] CLIP 语义打分 + Whisper ASR 文本 Diff + Demucs 音源分离
- [ ] Grounding DINO 目标锚点验证
- [ ] AI 质量评估（黑帧/静音/冻结检测 + No-Reference VQA）
- [ ] AI 素材筛选（批量 CLIP 打分 + 语义一致性过滤 + 视觉聚类去重）

### Media LSP AI 增强（Phase 3-5）— [ADR](./docs/architecture/lsp.md)
- [ ] Phase 3：CLIP / Whisper / Demucs / Grounding DINO 集成
- [ ] Phase 4-5：AI 素材审查 + 质量评估（VQA / SAM 智能蒙版）

### neko-agent
- [ ] 对话持久化遗留：CLI `--resume` / `/resume` 未实现（存储层已完成）
- [ ] SubAgent Skills：Seed_Manager + Audio_Mixer + 镜头语言通用 Skill
- [ ] MCP 客户端重连退避（当前连接失败即终止）+ ContextManager 异步竞态保护
- [ ] 批量时间线操作 Skill + AI 字幕生成 + 智能素材推荐
- [ ] 场景描述 → 自动配乐 + 场景描写辅助
- [ ] AI API 诊断（从 neko-tools 迁移）

### AI MCP Tools
- [ ] neko-model：`face.generate_params` / `face.from_image` / `face.adjust`
- [ ] neko-sketch S.4：`sketch.generate` / `style_transfer` / 跨模块集成（→ neko-cut/canvas）

### neko-assets — [ADR](./docs/architecture/marketplace.md) · [ADR](./docs/architecture/remote-storage.md)
> 职责边界：项目级内容素材（媒体文件 + 参考文档 + AI 生成内容）。工具型资产（Shader/Model/Preset）由 neko-market 安装，由消费扩展直接读取。
> AI 生成素材默认保留在工作区，用户通过 Explorer 右键菜单按需手动导入 Asset Library。
- [x] `'document'` AssetType + DocumentMetadata + AssetTypeMetadata（PDF/Word/PPT/Excel/EPUB/CBZ/FDX）
- [x] `'document'` EntityCategory + DocumentEntityMetadata + 媒体检测 + 分类器支持
- [x] AssetOwnership（scope: personal/project/team/purchased/public，access: private/readonly/editable）
- [x] AssetQuery ownershipScopes 过滤 + EntityService 创建/更新支持
- [x] AssetManifestSource `'remote'` 类型（远程存储前置）
- [x] External Media Library P2：全文搜索（QuickPick 跨目录）+ 元数据持久化缓存（mtime + PathVariable 可移植 key）
- [x] PathVariable 全格式集成：neko-cut/canvas/audio 保存/加载时自动转换 `${VAR}/path`，支持 Git 团队协作
- [x] PathResolver 跨扩展 API：`neko.assets.contractPath` / `neko.assets.resolvePath` commands
- [ ] External Media Library P2（可选）：增量索引、批量导入（neko-engine 直接用文件路径，导入非必要）

> **素材路径层级**：
> | 路径格式 | 含义 | 解析方式 | 已完成？ |
> |---------|------|---------|:---:|
> | `assets/clip.mp4` | 项目内素材 | `path.resolve(projectDir, src)` | ✅ |
> | `${FOOTAGE}/scene.mov` | 外部本地素材 | `PathResolver.resolve()` | ✅ |
> | `neko://entity/variant/file` | Asset Library 间接引用 | AssetManifest 查找 → 本地/代理/远程 | Phase 6.6 |
>
> **代理/原始文件切换（Phase 6.6 设计）**：
> - `neko://` 引用通过 AssetManifest 解析，`AssetFile` 新增 `proxy?` 字段 + `'proxy'` 状态
> - 预览/编辑：自动用代理（720p H.264）；导出：按需拉取原始文件
> - Engine 无改动 — 始终读 MediaResolver 返回的本地路径
>
> **素材同步**：PathVariable 解决路径映射。内容同步依赖：
> - 项目内小文件：Git 直接跟踪 ✅
> - 项目内大文件：Git LFS（项目基础设施待做）
> - 外部媒体库：远程存储（Phase 6.6）或团队 NAS 自行同步

### neko-market — [ADR](./docs/architecture/marketplace.md) · [ADR](./docs/architecture/registry-server.md)
> **客户端已完成** ✅（Phase 6.5.1-6.5.5）。剩余为 onPostInstall 模型注册 + Registry Server 后端。
- [x] Phase M1 ✅：ModelInstallTarget.onPostInstall/onPreUninstall — GGUF → `ensureOllamaRunning()` + `ollama create`；ONNX → `EngineClient.registerModel()`；`ModelMetadata` +gguf（12 tests）
- [ ] **Registry Server**（后端，非客户端任务）
  - [ ] S1：最小 Server（Package API + SQLite + 本地文件 + Docker 镜像）
  - [ ] S2：对象存储（S3/R2/OSS）+ 预签名 URL 直传 + 分片上传 + 发布能力
  - [ ] S3：上游代理（HF/Civitai 适配器 + 缓存）
  - [ ] S4：商业化（可见性控制 + LicenseManager 服务端 + 支付集成 + 发布者 Portal + 评分评论）

### 本地模型运行时 — [ADR](./docs/architecture/model-runtime.md)
> 不创建 neko-runtime 包。外部运行时（Ollama/ComfyUI）用户自行管理，通过 Provider/MCP 接入。Engine ONNX/candle 原生处理。
- [x] Phase M2 ✅：neko-engine ONNX 原生 — `ort` crate + ml/ 模块（6 文件）+ IMlService trait + ModelsController 扩展（+7 action）+ EngineClient 模型方法（10 Rust tests）。推理管线为 placeholder，等 ort 2.0 stable 补齐
- [ ] Phase M3（待评估）：neko-engine candle SD/SDXL 图片生成 — 前置条件：candle 推理速度 < PyTorch 2x 且支持 Flux
- 外部运行时接入：Ollama → Provider 配置（adapter 已有）；ComfyUI → MCP Server 或 Provider 配置

### 远程存储
- [ ] Neko Storage Service（Auth + 隔离 + 预签名 URL）
- [ ] Transcode Worker（媒体 + 3D + 文档三条管线）
- [ ] ProxyService 扩展 + 导出增量拉取

### neko-live 虚拟制片（Phase 5）
- [ ] 5.1：MediaPipe Face/Pose + VMC + VRM 预览 + 骨骼驱动
- [ ] 5.2：录制管道 + 音视频同步 + MP4 导出
- [ ] 5.3：RTMP/SRT 推流 + OBS + 2D puppet 联动

### VR/AR（远期 Phase 7）
- [ ] 7.1-7.4：立体渲染 + WebXR App + AR 能力 + AI 辅助 XR

### 项目基础设施
- [ ] Project Memory：自动压缩（workspace 级 ✅ + MemoryWrite ✅）
- [ ] Git LFS 集成：neko-diff CLI + pHash + .gitignore/.gitattributes 模板 + OID 自动填充
- [ ] 跨语言架构对齐 Step 2-3（Engine ComputeService + UI 状态分离）

---

## 📋 技术债务

### CI/CD
- [ ] CI code-quality 移除 `continue-on-error`
- [ ] Release workflow（tag 触发 vsix 打包）
- [ ] ESLint warn → error 升级（`no-console` + `no-explicit-any`）
- ⚠️ 覆盖率遗留：neko-agent 根包未接入 `sharedCoverage()`

### 代码质量

**扫描基线**：`pnpm build` ✅ | `pnpm test` ✅ | Knip 435 未使用导出 | **0 循环依赖** ✅ | 生产 `as any` 0 ✅

**大文件（>1000 LOC）：5 个待拆分**

| 文件 | LOC | 方案 |
|------|-----|------|
| ShapePanel.tsx | 1133 | 提取子组件和 hooks |
| PreviewPanel.tsx | 1116 | 提取子组件和 hooks |
| ExportPanel.tsx | 1112 | 提取子组件和 hooks |
| AudioDiffViewer.tsx | 1081 | 分离波形渲染和交互逻辑 |
| AssetVariantDiffEditorProvider.ts | 1071 | 重构 |

**其他**

| 优先级 | 问题 |
|--------|------|
| 中 | neko-types JSDoc 覆盖率低 |
| 低 | neko-engine 性能监控 Dashboard UI（采集+端点已就绪） |
| 低 | 国际化扩展（neko-cut/agent/sketch 已完成，其他待补） |

---

## 🚧 规划中（未开始）

| 模块 | 目标 | 参考 |
|------|------|------|
| neko-market | **客户端完成** ✅（Phase 6.5.1-6.5.5），剩余为 onPostInstall 模型注册 + Registry Server 后端 | [ADR](./docs/architecture/marketplace.md) · [ADR](./docs/architecture/registry-server.md) · [ADR](./docs/architecture/model-runtime.md) |
| Neko Storage Service | 远程存储（MinIO S3 + Transcode Worker） | [ADR](./docs/architecture/remote-storage.md) |
| neko-live | 动捕 + 虚拟形象 + 直播 | Phase 5 |
| neko-vr | VR/AR 沉浸式创作 | Phase 7 |
| neko-protocol | 共享协议仓库（Proto IDL → 多语言生成） | — |
| @neko/types 重组 | domain/ 分层 + exports 子路径隔离 | — |

### neko-engine 设备代理 — [ADR](./docs/architecture/device-access.md)

| 设备 | 状态 |
|------|------|
| 麦克风 | ✅ 完整（cpal + WAV + monitor + 双模式录制） |
| 摄像头 | ⚠️ 框架就绪，capture 实现 TODO（FFmpeg avdevice，neko-live 前置） |
| MIDI | ✅ 完整（midir + broadcast + WS） |
| Gamepad | ✅ 完整（gilrs + 120Hz + broadcast + WS） |
| 手写板压感 | ✅ PointerEvent.pressure 直接可用 |

---

*最后更新：2026-03-25（Phase 6.4 完成：Document + Ownership + 搜索 + 缓存 + PathVariable 全格式集成 + 素材同步说明）*
