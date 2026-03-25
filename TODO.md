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
- [ ] `'document'` AssetType + DocumentMetadata + DocumentAssetHandler（PDF/Word/PPT/Excel/EPUB/CBZ/FDX）
- [ ] AssetOwnership（scope: personal/project/team/purchased/public）
- [ ] AI 生成结果自动入库：GenerateImage/Video 完成 → `neko.assets.importGenerated`（source: `'ai-generated'`）
- [ ] External Media Library P2（mtime/inode 增量索引 + 元数据缓存 + 全文搜索 + 批量导入）

### neko-market（Phase 6.5.5-6.5.6 待开发）
- [ ] `activate()` 导出公共 API（`NekoMarketAPI`：`onDidInstall` / `onDidUninstall` / `getInstalled`）
- [ ] neko-cut：EffectDispatcher 扫描 `~/.neko/shaders/` + 订阅 `onDidInstall` 热重载；LUT/转场面板同步
- [ ] neko-agent：ModelManager 扫描 `~/.neko/models/`，generation 工具自动发现可用模型
- [ ] 私有 registry 支持（MarketClient 可配 registryUrl）
- [ ] 商业化：LicenseManager 完整实现（JWT + 在线校验）+ 支付集成 + 发布者 Portal + 评分评论

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
| neko-market | ~~统一市场平台~~ Phase 6.5.1-6.5.2 ✅，6.5.3-6.5.4 待开发 | [ADR](./docs/architecture/marketplace.md) |
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

*最后更新：2026-03-25（架构调整：neko-assets 职责边界厘清，工具型资产接入模式重新定义）*
