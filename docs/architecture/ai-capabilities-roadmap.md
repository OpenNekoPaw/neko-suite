# AI Capabilities 路线图

> neko-agent AI 能力演进：Phase 2 已完成，本文档聚焦未来开发规划

---

## 已完成总结

### Phase 2: Pipeline 核心 ✅（2026-03-24）

- 6 种创作流程（flowA-F）全部打通，10 个内置 Skill
- Pipeline 5 阶段：readDocument → parseStoryboard → generatePrompts → batchGenerate → arrangeOnTimeline
- 文档格式支持：PDF/DOCX/PPTX/EPUB/CBZ/CBR/XLSX/FDX
- ~2695 LOC + 109 tests

### Phase 3 入口 ✅（2026-03-24）

| 功能 | 实现方式 | 关键文件 |
|------|---------|---------|
| **QualityCheck 智能工具** | 路径 B：工具内封装 evaluate→retry 循环，多模态 LLM 评估 | `extension/src/tools/qualityCheckTools.ts` |
| **Pipeline VSCode 命令** | LLM-Routed：`neko.pipeline.start` / `startFromFile` / `retryFailed` | `extension/src/index.ts:258-367` |
| **Pipeline Slash 命令** | `/pipeline [flowId] [source]` + `/pipeline-retry`，supportsArguments | `agent/src/skill/builtins/index.ts:427-535` |

**关键架构决策 — QualityCheck 路径选择**：

| 路径 | 方案 | 结论 |
|------|------|------|
| A. ReactiveStage | Pipeline executor 新增 reactive 分支 | ❌ 评估需要 LLM 推理，多了一层 |
| B. Agent ReAct 直接处理 | 主 Agent 逐个调 evaluateMedia | ⚠️ N 次评估污染上下文 |
| **B'. 智能工具** | **工具内封装循环，返回结构化摘要** | **✅ 采用：零架构新增，上下文干净** |

- ReactiveStage 类型定义保留（`type: 'reactive'`），executor 不实现
- 当出现无需 LLM 推理的程序化循环（如编码参数优化）时再启用

---

## 未来开发计划

### 近期（P3，增量功能）

#### Canvas 分镜可视化 (~400 LOC, 3-4 天)

在 neko-canvas 中可视化编排分镜，增强 Pipeline 的交互体验。

**功能**：StoryboardNode 节点类型 + 拖拽排序 + 视频预览 + 导出 Pipeline 配置

**实现位置**：
- `packages/neko-canvas/packages/webview/src/nodes/StoryboardNode.tsx`
- `packages/neko-canvas/packages/webview/src/stores/storyboardSlice.ts`

**依赖**：neko-canvas（✅）+ Pipeline 系统（✅）

**风险**：中（依赖 neko-canvas 稳定性）

---

#### QualityCheck P1：视频帧评估

当前仅支持图片评估（P0）。P1 需通过 neko-engine RenderFrame 提取视频关键帧后送入多模态 LLM。

**依赖**：neko-engine `RenderFrame` / `GetThumbnail` 端点

---

### 中期（P3+，高级功能）

#### 高级循环 Stage (~300 LOC, 4-5 天)

复杂反馈循环场景，超出单次 QualityCheck 工具能力范围。

**场景**：
- 视频场景分割（自适应阈值）
- 视频理解（多模态分析 + LLM 多轮推理）
- 风格一致性修正（跨场景检测→调整→再检测）

**实现策略**：优先扩展 QualityCheck 工具能力；仅当需要无 LLM 推理的程序化循环时，才实现 ReactiveStage executor 分支。

---

#### 角色一致性追踪（研究中）

跨场景保持角色外貌一致。不确定性高，暂不排期。

**可选方案**：

| 方案 | 可行性 | 说明 |
|------|--------|------|
| 参考图策略 | ✅ 已可用 | `GenerateCharacter(referenceImageUrl)`，在 comic-to-storyboard Skill 中实现 |
| Embedding 策略 | 需研究 | 提取视觉 embedding 注入后续请求 |
| LoRA 微调 | 需提供商支持 | 为角色训练专用 LoRA |

**当前建议**：继续使用方案 1，待提供商能力成熟后评估方案 2/3。

---

### 远期（Phase 6+）

#### Workflow 引擎 (~3000 LOC, 3-4 周)

用户自定义 DAG 编排，ComfyUI 式可视化流水线。

**功能**：可视化节点图编辑器 + Stage → Workflow Node 包装 + 条件分支/循环 + 持久化

**应用场景**：AI 图片流水线 / 批量视频处理 / 跨扩展自动化

**架构预留**：Pipeline Stage 接口已设计为可包装为 Workflow Node，不需重构现有系统。

**风险**：中（工作量大，需分阶段实现）

---

## 技术债务

### 当前无阻塞性技术债务
- Pipeline 架构符合 SOLID，109 tests 覆盖
- ReactiveStage 类型保留但不实现（按需启用）

### 潜在优化点
1. **并发配置**: 批量生成并发数可配置（当前硬编码 3-5）
2. **中断恢复**: Pipeline 中断后恢复能力
3. **结构化日志**: Pipeline 执行链路可观测性

---

## 依赖关系图

```
已完成层:
  ✅ Pipeline 5 阶段 + 6 流程 + 10 Skill
  ✅ QualityCheck 智能工具 (路径 B)
  ✅ VSCode 命令 + Slash 命令

近期:
  Canvas 分镜可视化 ← 独立
  QualityCheck P1 视频帧 ← 依赖 neko-engine

中期:
  高级循环 Stage ← 扩展 QualityCheck / 可选 ReactiveStage
  角色一致性 ← 研究中

远期:
  Workflow 引擎 ← 依赖高级循环 Stage 经验
```

---

*最后更新: 2026-03-24*
