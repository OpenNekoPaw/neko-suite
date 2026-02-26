# Neko Suite 下一阶段任务计划

> 基于 2026-02-25 完成度分析，按优先级排列

---

## P0：阻塞性问题（立即处理）

### ~~1. neko-agent OpenAI streaming 实现~~ ✅ 已完成（2026-02-26）
- **结论**：经分析，OpenAI streaming 通过 `AISdkAdapter` 已完整实现。`throw new Error('Not implemented')` 仅存在于私有辅助类 `OpenAIHttpHelper`（用于 DALL-E/模型列表），非阻塞。
- **已完成**：重构 `OpenAIHttpHelper` 不再继承 `BaseAdapter`，改为直接使用 `HttpClient`，消除误导性代码。
- **发现的技术债务**：`AISdkAdapter` 抽象层直接依赖 Vercel AI SDK（违反依赖倒置原则），详见技术债务 #TD-1。

### ~~2. neko-cut 资产拖拽导入~~ ✅ 已在 neko-assets 重新实现
- 拖拽导入功能已在 neko-assets Phase 3 中重新实现，不再阻塞。

---

## P1：核心功能补全（当前迭代）

### ~~3. 零测试包补充测试~~ ✅ 已完成（2026-02-26）
- neko-canvas：**71 个测试**（snapEngine/viewportCulling/historyStore/clipboardStore）
- neko-client：**50 个测试**（FrameScheduler/PlaybackPerformanceMonitor/formatTime）
- neko-preview：**115 个测试**（VideoPreviewProvider/AudioPreviewProvider/StatusBarManager/PreviewService/extension）
- 总计：**236 个新测试用例**，远超每包 20 个的目标

### ~~4. neko-cut 测试覆盖提升~~ ✅ 已完成（2026-02-26）
- 新增 **283 个测试**（9 个 slice 测试文件）
- 覆盖：selectionSlice/playbackSlice/projectSlice/uiStateSlice/trackOpsSlice/elementOpsSlice/clipboardSlice/keyframeSlice/shapeOpsSlice
- neko-cut 总测试：104 → **387**，超过 300+ 目标

### ~~5. neko-agent 迁移代码清理~~ ✅ 已完成（2026-02-26）
- 替换遗留类型别名：`ConfiguredAgent` → `PromptPresetConfig`，`ModelOption` → `ChatModelOption`
- 删除 `types.ts`/`prompts.ts`/`config/index.ts` 中的遗留别名定义
- Workflow 健康检查 TODO 标记为 `TODO(P2)` 优先级

### ~~6. neko-cut ffprobe 元数据提取~~ ✅ 已在 neko-assets 重新实现
- 元数据提取功能已在 neko-assets 中通过 neko-engine media probe 实现。

---

## P2：功能增强（下一迭代）

### 7. neko-tools 媒体 Diff 核心功能 — 进行中（65% → 85%）
- ~~视频帧 seeking 和 extraction 未实现~~ ✅ 已完成（2026-02-26）
  - neko-engine 新增 `neko.engine.extractFrame` + `neko.engine.decodeAudio` 命令
  - neko-tools `handleSeek` + `handleGetFrame` 已实现，通过 engine 命令提取帧
- **剩余工作**：
  - Git 版本视频帧对比（previous 版本需通过 GitMediaService 写入临时文件后提取）
  - Webview 专用 Diff 可视化 UI（当前复用 neko-cut webview）
  - VideoDiffAnalyzer / AudioDiffAnalyzer 单元测试
- 工作量：~1.5 天

### 8. neko-assets Phase 4：AI 模型资产化 + Handler 实现
- 前置条件：Phase 3 ✅ 已完成，neko-agent AI 分类能力成熟
- Handler 实现：ShaderAssetHandler（编译验证 + 预览 + 热重载）、PresetAssetHandler（LUT/转场/导出预设）、ModelAssetHandler（下载 + 校验 + 量化选择）
- AI 模型存储策略（懒加载 + 缓存 + 磁盘空间管理）
- AI 生成结果自动入库（Agent 生成 → AssetRegistry.register）
- IAIAnalysisService 实现（接入 neko-agent AI 分类能力）
- FFmpegService 完整实现
- extension.ts 升级为 AssetRegistry 顶层 Facade
- 详见 [资产管理架构设计](./architecture/asset-management-design.md) Phase 4
- 工作量：~8 天

### 9. neko-cut 反向播放
- 位置：`packages/neko-cut/packages/webview/src/components/Timeline/TimelineTrack.tsx:612`
- 需要 neko-engine 配合支持反向解码
- 工作量：~3 天

### 10. neko-cut 导出增强
- 后台导出队列
- 导出预设管理
- 多分辨率预览切换
- 工作量：~5 天

### 11. neko-agent 时间线操作 Skills
- 批量操作支持
- 智能素材推荐
- 工作量：~5 天

### 12. neko-story 功能补全
- 错误诊断（LSP diagnostics）
- 时间线生成（剧本 → 时间线）
- PDF 导出
- 工作量：~5 天

---

## P3：新功能开发（后续迭代）

### 13. neko-agent 创作辅助 Skills
- 剧本解析 → 时间线自动生成
- 自动配乐
- AI 字幕生成
- 画面描述
- 工作量：~10 天

### 14. neko-canvas 渲染增强
- WebGPU 渲染
- 特效系统
- 自定义转场
- 导出功能（`ArtboardNode.tsx:116`）
- 工作量：~10 天

### 15. neko-model 3D 编辑器启动
- Phase 3.1：native-scene crate 骨架 + glTF 加载器
- Phase 3.1：@neko/scene-view R3F 视口组件
- Phase 3.1：neko-model 扩展骨架
- 详见 [3D 架构设计](./architecture/3d-capability-analysis.md)
- 工作量：~15 天（Phase 3.1）

### 16. neko-assets Phase 5：社区分发
- 前置条件：Phase 4 完成，多种资产类型 Handler 已验证
- `.neko` 包格式定义（manifest + content）
- 远程注册表（类似 npm registry）+ push/pull/search/install CLI
- 私有化部署支持
- 依赖解析（Shader 依赖 common.wgsl 等）
- 声明与实体分离落地（project.json / lock.json / .installed/）
- Cloud Sync View（`neko.cloudSync`）实现
- CI/CD 自动渲染集成
- 详见 [资产管理架构设计](./architecture/asset-management-design.md) Phase 5
- 工作量：~12 天

---

## 技术债务（持续）

| ID | 项目 | 优先级 | 说明 |
|----|------|--------|------|
| TD-1 | AI SDK 依赖倒置 | P2 | `AISdkAdapter` 抽象层直接依赖 Vercel AI SDK（`import { streamText } from 'ai'`），OpenAI/Anthropic/Google adapter 与具体 SDK 强耦合（DIP 评分 65/100）。HTTP adapter（Azure/Generic/Ollama）通过 `HttpClient` 正确解耦。需引入 `ILanguageModelProvider` 抽象隔离 SDK 依赖。 |
| TD-2 | 统一错误处理 | P1 | 各包错误处理方式不一致 |
| TD-3 | git commit 规范化 | P2 | 当前全是 "update" 提交 |
| TD-4 | 文档补全 | P2 | docs/ 已有基础，需要持续更新 |
| TD-5 | 国际化扩展 | P3 | neko-cut/neko-agent 已有中英双语，其他包待跟进 |

---

## 里程碑对照

| 里程碑 | 对应任务 | 预计状态 |
|--------|----------|----------|
| M1 基础剪辑闭环 | ~~P0 #1-2~~ + ~~P1 #3-6~~ | ✅ **已达成**（2026-02-26）：所有阻塞项已清除，测试覆盖 519 新用例 |
| M2 AI 集成 | P2 #11 + P3 #13 | 进行中，Agent 引擎已就绪，Skills 生态待建设 |
| M3 视觉增强 | P3 #14-15 | 规划阶段，3D 架构设计已完成 |
| M6 资产管理与协作 | P2 #8（Phase 4）+ P3 #16（Phase 5） | Phase 1-3 ✅ 已完成，Phase 4 待 neko-agent 成熟，Phase 5 待 Phase 4 验证 |

---

## 测试覆盖变更记录（2026-02-26）

| 包 | 变更前 | 变更后 | 新增文件 |
|----|--------|--------|----------|
| neko-canvas | 0 | 71 | snapEngine/viewportCulling/historyStore/clipboardStore |
| neko-client | 0 | 50 | FrameScheduler/PlaybackPerformanceMonitor/formatTime |
| neko-preview | 0 | 115 | VideoPreviewProvider/AudioPreviewProvider/StatusBarManager/PreviewService/extension |
| neko-cut | 104 | 387 | 9 个 slice 测试（selection/playback/project/uiState/trackOps/elementOps/clipboard/keyframe/shapeOps） |
| **合计** | **104** | **623** | **+519** |

---

*生成日期：2026-02-25，更新：2026-02-26（P0/P1 全部完成，M1 达成，TD-1 AI SDK 依赖倒置纳入）*
