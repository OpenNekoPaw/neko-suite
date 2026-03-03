# Neko Suite 任务计划

> 基于 2026-02-25 完成度分析，按优先级排列
> 最后更新：2026-03-03

---

## ✅ 已完成

<details>
<summary>P0 #1-2, P1 #3-6 — 已于 2026-02-26 全部完成 (点击展开)</summary>

- ~~P0 #1: neko-agent OpenAI streaming~~ — 经分析已由 `AISdkAdapter` 实现，重构了 `OpenAIHttpHelper`
- ~~P0 #2: neko-cut 资产拖拽导入~~ — 已在 neko-assets Phase 3 重新实现
- ~~P1 #3: 零测试包补充测试~~ — neko-canvas 71 + neko-client 50 + neko-preview 115 = **236 新测试**
- ~~P1 #4: neko-cut 测试覆盖~~ — 283 新测试（9 个 slice），104 → **387** 总测试
- ~~P1 #5: neko-agent 迁移代码清理~~ — 替换遗留类型别名，标记 TODO(P2)
- ~~P1 #6: neko-cut ffprobe 元数据~~ — 已在 neko-assets 通过 engine media probe 实现

**M1 里程碑已达成**（2026-02-26）：所有阻塞项已清除，测试覆盖 +519 用例

</details>

---

## P2：功能增强（当前迭代）

### 7. neko-tools 媒体 Diff 核心功能 — 85%
- ✅ 视频帧 seeking 和 extraction 已完成
- **剩余**：
  - Git 版本视频帧对比（previous 版本需通过 GitMediaService 写入临时文件后提取）
  - Webview 专用 Diff 可视化 UI（当前复用 neko-cut webview）
  - VideoDiffAnalyzer / AudioDiffAnalyzer 单元测试
- 工作量：~1.5 天

### 8. neko-assets Phase 4：AI 模型资产化 + Handler 实现
- ShaderAssetHandler、PresetAssetHandler、ModelAssetHandler
- AI 模型存储策略 + 生成结果自动入库 + IAIAnalysisService
- FFmpegService 完整实现
- 详见 [资产管理架构设计](./architecture/asset-management-design.md) Phase 4
- 工作量：~8 天

### 9. neko-cut 反向播放
- 需要 neko-engine 配合支持反向解码
- 工作量：~3 天

### 10. neko-cut 导出增强
- 后台导出队列 + 导出预设管理 + 多分辨率预览切换
- 工作量：~5 天

### 11. neko-agent 时间线操作 Skills
- 批量操作支持 + 智能素材推荐
- 工作量：~5 天

### 12. neko-story 功能补全
- 错误诊断（LSP diagnostics）+ 时间线生成 + PDF 导出
- 工作量：~5 天

---

## P3：新功能开发（后续迭代）

### 13. neko-agent 创作辅助 Skills (~10 天)
剧本解析→时间线自动生成 / 自动配乐 / AI 字幕 / 画面描述

### 14. neko-canvas 渲染增强 (~10 天)
WebGPU / 特效系统 / 自定义转场 / 导出功能

### 15. neko-model 3D 编辑器启动 (~15 天)
Phase 3.1：native-scene crate + glTF 加载器 + R3F 视口 — 详见 [3D 架构设计](./architecture/3d-capability-analysis.md)

### 16. neko-assets Phase 5：社区分发 (~12 天)
`.neko` 包格式 + 远程注册表 + 私有化部署 — 详见 [资产管理架构设计](./architecture/asset-management-design.md) Phase 5

---

## 技术债务

| ID | 项目 | 优先级 | 说明 |
|----|------|--------|------|
| TD-1 | AI SDK 依赖倒置 | P2 | `AISdkAdapter` 直接依赖 Vercel AI SDK（DIP 65/100），需引入 `ILanguageModelProvider` 抽象 |
| TD-2 | 统一错误处理 | P1 | 各包错误处理方式不一致 |
| TD-3 | git commit 规范化 | P2 | 当前全是 "update" 提交 |
| TD-4 | 文档补全 | P2 | docs/ 已有基础，需要持续更新 |
| TD-5 | 国际化扩展 | P3 | neko-cut/neko-agent 已完成，其他包待跟进 |

---

## 里程碑

| 里程碑 | 对应任务 | 状态 |
|--------|----------|------|
| M1 基础剪辑闭环 | P0 #1-2 + P1 #3-6 | ✅ 已达成（2026-02-26） |
| M2 AI 集成 | P2 #11 + P3 #13 | Agent 引擎已就绪，Skills 生态待建设 |
| M3 视觉增强 | P3 #14-15 | 规划阶段，3D 架构设计已完成 |
| M6 资产管理与协作 | P2 #8 + P3 #16 | Phase 1-3 ✅，Phase 4 待 neko-agent 成熟 |

---

*生成日期：2026-02-25，更新：2026-03-03（清理已完成任务）*
