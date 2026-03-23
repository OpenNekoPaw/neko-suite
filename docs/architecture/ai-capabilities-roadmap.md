# AI Capabilities 剩余任务分析

> 基于 ai-capabilities.md，Phase 2 已完成，本文档分析剩余开发任务

---

## 执行摘要

**Phase 2 状态**: ✅ 完成（2026-03-24）
- 6 种创作流程全部打通
- 10 个内置 Skill 完成
- ~2395 LOC + 102 tests

**最新更新**: ✅ PPTX 支持（2026-03-24）
- DocumentReaderService 新增 readPptx() 方法
- 使用 officeparser 库提取文本和元数据
- ~60 LOC + 5 tests
- 文档格式支持：PDF/DOCX/PPTX/EPUB/CBZ/CBR/XLSX/FDX

**下一步优先级**: Phase 3 增强功能

---

## 剩余任务清单

### P2 优先级（Phase 3 入口）

#### 1. ReactiveStage 执行器 (~200 LOC)

**目标**: 支持执行→评估→重试循环的 Stage 类型

**应用场景**:
- 导出质量检查（SSIM/PSNR + 黑帧检测）
- AI 生成质量筛选（CLIP 打分）
- 参数自适应调整

**技术方案**:
```typescript
interface ReactiveStage<TContext> {
  type: 'reactive';
  name: string;
  maxIterations: number;
  execute(ctx: TContext): Promise<TContext>;
  evaluate(ctx: TContext): Promise<EvalResult>;
}

interface EvalResult {
  verdict: 'pass' | 'retry' | 'escalate';
  score?: number;
  reason?: string;
  adjustments?: Partial<TContext>;
}
```

**实现位置**:
- `packages/neko-agent/packages/agent/src/pipeline/stages/reactive-stage.ts`
- `packages/neko-agent/packages/agent/src/pipeline/executor.ts` 扩展

**依赖**:
- 无（基于现有 Pipeline 架构）

**预估工作量**: 2-3 天

---

### P3 优先级（用户体验增强）

#### 2. Pipeline VSCode 命令 (~100 LOC)

**目标**: 右键菜单和命令面板快速启动 Pipeline

**功能**:
- 右键 `.fountain` 文件 → "Convert to Video Timeline"
- 右键 `.pdf/.docx` 文件 → "Generate Video from Document"
- 命令面板 → "Neko: Start Pipeline..."

**实现位置**:
- `packages/neko-agent/packages/extension/src/commands/pipeline-commands.ts`
- `packages/neko-agent/packages/extension/package.json` 注册命令

**技术方案**:
```typescript
vscode.commands.registerCommand('neko.agent.startPipelineFromFile', async (uri: vscode.Uri) => {
  const ext = path.extname(uri.fsPath);
  const flowId = detectFlowFromExtension(ext); // .fountain → flowF, .pdf → flowA
  // 调用 AgentRunner.startPipeline(flowId, { sourceFile: uri.fsPath })
});
```

**预估工作量**: 1 天

---

#### 3. Pipeline Slash 命令 (~50 LOC)

**目标**: 在 Agent Chat 中通过 `/pipeline` 命令启动

**功能**:
- `/pipeline flowF script.fountain` - 指定流程和文件
- `/pipeline` - 交互式选择流程

**实现位置**:
- `packages/neko-agent/packages/agent/src/skill/builtins/index.ts` 已有 `storyboardToTimelineSkill.command = 'pipeline'`
- 需要在 Skill 系统中支持参数解析

**状态**: ⚠️ 部分完成（Skill 已注册为 slash 命令，但参数解析需增强）

**预估工作量**: 0.5 天

---

#### 4. 角色一致性追踪（研究中）

**目标**: 跨场景保持角色外貌一致

**挑战**:
- 不同提供商的角色一致性能力差异大
- 需要提取和复用角色特征

**可能方案**:
1. **参考图策略**（当前可用）:
   - 第一次生成角色 → 保存为参考图
   - 后续场景使用 `GenerateCharacter(referenceImageUrl)`

2. **Embedding 策略**（需研究）:
   - 提取角色视觉 embedding
   - 注入到后续生成请求

3. **LoRA 微调**（高级）:
   - 为特定角色训练 LoRA
   - 需要提供商支持

**当前建议**: 使用方案 1（已在 `comic-to-storyboard` Skill 中实现）

**预估工作量**: 研究阶段，暂不排期

---

#### 5. Canvas 分镜可视化 (~400 LOC)

**目标**: 在 neko-canvas 中可视化编排分镜

**功能**:
- StoryboardNode 节点类型
- 拖拽调整场景顺序
- 预览生成的视频片段
- 导出为 Pipeline 配置

**实现位置**:
- `packages/neko-canvas/packages/webview/src/nodes/StoryboardNode.tsx`
- `packages/neko-canvas/packages/webview/src/stores/storyboardSlice.ts`

**依赖**:
- neko-canvas 基础架构（已完成）
- Pipeline 系统（已完成）

**预估工作量**: 3-4 天

---

### Phase 3+ 优先级（高级功能）

#### 6. 高级循环 Stage (~300 LOC)

**目标**: 实现复杂的反馈循环场景

**场景**:
- 视频场景分割（自适应阈值）
- 视频理解（多模态分析 + LLM 推理）
- 风格一致性修正（检测→调整→再检测）

**依赖**:
- ReactiveStage 执行器（任务 1）

**预估工作量**: 4-5 天

---

### Phase 6+ 优先级（远期规划）

#### 7. Workflow 引擎 (~3000 LOC)

**目标**: 用户自定义 DAG 编排

**功能**:
- 可视化节点图编辑器
- Stage 包装为 Workflow Node
- 条件分支和循环
- 持久化和版本管理

**应用场景**:
- ComfyUI 式 AI 图片流水线
- 批量视频处理工厂
- 跨扩展自动化

**架构预留**:
- Pipeline Stage 接口已设计为可包装为 Workflow Node
- 不需要重构现有 Pipeline 系统

**预估工作量**: 3-4 周

---

## 优先级排序

### 立即开始（本周）
1. ✅ ReactiveStage 执行器（解锁质量检查能力）

### 短期（本月）
2. Pipeline VSCode 命令（提升用户体验）
3. Pipeline Slash 命令增强（完善参数解析）

### 中期（下月）
4. Canvas 分镜可视化（可视化编排）
5. 高级循环 Stage（复杂场景支持）

### 长期（Q2-Q3）
6. 角色一致性追踪（研究 + 实现）
7. Workflow 引擎（用户自定义编排）

---

## 技术债务

### 当前无技术债务
- Pipeline 架构清晰，符合 SOLID 原则
- 测试覆盖充分（102 tests）
- 文档完整

### 潜在优化点
1. **性能优化**: 批量生成并发数可配置（当前硬编码 3-5）
2. **错误处理**: 增强 Pipeline 中断恢复能力
3. **日志**: 添加结构化日志（当前依赖 Logger）

---

## 依赖关系图

```
ReactiveStage 执行器 (P2)
    ↓
高级循环 Stage (Phase 3+)
    ↓
Workflow 引擎 (Phase 6+)

Pipeline VSCode 命令 (P3) ← 独立
Pipeline Slash 命令 (P3) ← 独立
Canvas 分镜可视化 (P3) ← 独立
角色一致性追踪 (P3) ← 研究中
```

---

## 资源需求

### 开发资源
- **ReactiveStage**: 1 人 × 2-3 天
- **VSCode 命令**: 1 人 × 1 天
- **Slash 命令**: 1 人 × 0.5 天
- **Canvas 可视化**: 1 人 × 3-4 天
- **高级循环 Stage**: 1 人 × 4-5 天

### 测试资源
- 每个功能需要 20-30 个单元测试
- 集成测试需要真实 AI 提供商（成本考虑）

---

## 风险评估

| 任务 | 技术风险 | 业务风险 | 缓解措施 |
|------|---------|---------|----------|
| ReactiveStage | 低 | 低 | 架构已预留，实现直接 |
| VSCode 命令 | 低 | 低 | VSCode API 成熟 |
| Slash 命令 | 低 | 低 | Skill 系统已支持 |
| Canvas 可视化 | 中 | 低 | 依赖 neko-canvas 稳定性 |
| 角色一致性 | 高 | 中 | 提供商能力差异大，需研究 |
| Workflow 引擎 | 中 | 低 | 工作量大，需分阶段实现 |

---

## 成功指标

### Phase 3 完成标准
- [ ] ReactiveStage 执行器实现并测试
- [ ] 至少 2 个 ReactiveStage 实例（导出质检 + CLIP 筛选）
- [ ] VSCode 命令支持 3 种文件类型（.fountain/.pdf/.docx）
- [ ] Slash 命令支持参数解析
- [ ] 测试覆盖率 > 80%

### Phase 6+ 完成标准
- [ ] Workflow 引擎支持 DAG 编排
- [ ] 可视化编辑器可用
- [ ] 至少 3 个用户自定义 Workflow 示例
- [ ] 文档完整（用户指南 + API 文档）

---

*最后更新: 2026-03-24*
