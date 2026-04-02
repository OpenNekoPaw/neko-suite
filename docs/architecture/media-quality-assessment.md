# Media Quality Assessment System — Architecture Design

> neko-agent 生成素材质量评估系统：现状分析、模型能力调研与开发方案

---

## 1. 现状分析

### 1.1 当前能力矩阵

| 能力维度 | 当前状态 | 实现位置 |
|---------|---------|---------|
| 图片质量评估 | ✅ 完整（Vision LLM 多维评分 + 结构化诊断 + 重试循环） | `qualityCheckTools.ts` — VisionEvaluator |
| 结构化问题分类 | ✅ 12 种 `QualityIssueCategory`，`QualityIssue[]` 替代 `string[]` | `qa-types.ts` + `qualityCheckTools.ts` |
| 多维度评估 | ✅ `MediaEvaluation` 四维分数（技术/Prompt/剧本/美学） | `qa-types.ts` + `qualityCheckTools.ts` |
| 确定性修复映射 | ✅ `RemediationPlanner`：issue → ToolSet 工具调用 | `remediation-planner.ts` |
| 剧本 ↔ 素材符合度 | ✅ `sceneDialogue` + `globalStyle` 参数传入评估 prompt | `qualityCheckTools.ts` |
| 视频质量评估 | ✅ VideoFrameEvaluator（多帧采样 + Vision LLM 评估，含 videoQuality 维度） | `qualityCheckTools.ts` — VideoFrameEvaluator |
| 音频质量评估 | ✅ AudioEvaluator（Engine LUFS/TruePeak/静音 → 确定性阈值检测，零 LLM 成本） | `qualityCheckTools.ts` — AudioEvaluator |
| 人物/物品/场景一致性 | ✅ ConsistencyEvaluator（角色一致性追踪 + LLM 参考对比） | `consistency-evaluator.ts` |
| 风格一致性检测 | ✅ ConsistencyEvaluator（CLIP 快筛 + Vision LLM 精评双层） | `consistency-evaluator.ts` |
| 视频帧级问题检测 | ✅ 3 种视频 category（jitter/tearing/stuttering）+ RemediationPlanner 映射 | `qa-types.ts` + `remediation-planner.ts` |
| 长视频分段评估 | TODO 无分片机制 | — |
| 跨素材一致性 | ✅ QualityCheckConsistency 工具 + qualityGate 管线阶段 | `consistencyCheckTools.ts` + `quality-gate.ts` |
| SSIM/PSNR 对比 | ✅ 完整（图片+视频+音频 diff） | `neko-engine` Rust 层 |
| CLIP 评分 | ✅ EngineClient.clipScore() | `neko-client` |
| 响度分析 | ✅ ITU-R BS.1770-4 LUFS | `neko-engine` loudness.rs |
| IP-Adapter 参考图 | ✅ 类型+3 适配器（fal/DashScope/Kling） | `platform/media/types.ts` |
| 音频技术指标类型 | ✅ `AudioTechnicalMetrics`（LUFS/TruePeak/LRA/静音率/削波检测） | `qa-types.ts` |
| 媒体类型路由 | ✅ `detectMediaType()` 自动路由 image/video/audio 到对应 Evaluator | `qualityCheckTools.ts` |
| 质量评估 Skill | ✅ `qualityAssessmentSkill` + `/quality-check` 斜杠命令 | `quality-assessment.ts` |
| 质量评估 ToolSet | ✅ `mediaQAToolSet`（QualityCheck + QualityCheckConsistency + 按需激活） | `tool-skills.ts` |
| quality-checker SubAgent | ✅ 专用质量评估 SubAgent 预设（QualityCheck + QualityCheckConsistency） | `creative-presets.ts` |
| Pipeline qualityGate | ✅ 可选质量门禁（opt-in，batchGenerate 后、arrangeOnTimeline 前） | `quality-gate.ts` |

### 1.2 现有架构

```
VisionEvaluator (qualityCheckTools.ts) — 图片评估
├── evaluate(): 单图片 → base64 → Vision LLM → MediaEvaluation JSON
│   └── 4 维度评分: technicalQuality / promptAdherence / scriptAdherence / aesthetics
│   └── 上下文: prompt + description + globalStyle + dialogue[]
├── parseEvaluation(): 安全解析 LLM 输出 → MediaEvaluation（含验证+默认值）
│   └── coerceScore() / isValidIssue() / normalizeIssue() 辅助函数
├── optimizePrompt(): QualityIssue[] → LLM → 优化后的 prompt 文本
└── 重试循环: overallScore < minScore → optimize → regenerate → re-evaluate
    └── 跟踪每次尝试的最佳分数/维度/issues，最终返回最优结果

VideoFrameEvaluator (qualityCheckTools.ts) — 视频评估
├── evaluate(): 视频 → probe 元数据 → 均匀采样 N 帧 → 多帧 image part → Vision LLM → MediaEvaluation
│   └── 5 维度评分: technicalQuality / promptAdherence / scriptAdherence / aesthetics / videoQuality
│   └── 帧间一致性: jitter / tearing / stuttering 检测
├── IFrameExtractor 接口: extractFrame(source, time) + probe(source)
├── 采样策略: 排除首尾 5%，均匀 4 帧（可配置 maxFrames）
└── 视频保留 retry（区别于 audio skip retry）

AudioEvaluator (qualityCheckTools.ts) — 音频评估（零 LLM 成本）
├── evaluate(): 音频 → Engine LUFS/TruePeak/LRA/静音 → 确定性阈值 → MediaEvaluation
├── IAudioAnalyzer 接口: analyzeLoudness() + detectSilence()
└── 音频不进入 retry 循环（技术问题通过 RemediationPlanner 确定性修复）

ConsistencyEvaluator (consistency-evaluator.ts) — 跨场景一致性评估
├── evaluate(): 多场景 → 代表图提取 → CLIP 快筛 → Vision LLM 精评 → ConsistencyReport
│   ├── Layer 1: CLIP 快筛（IClipScorer 可选，drift < 15 → 跳过 LLM）
│   └── Layer 2: Vision LLM 双图对比（driftScore + description + characterIssues）
├── 角色一致性: 首次出场为参考 → 后续场景逐一对比 → CharacterAppearance[]
├── 视频支持: IFrameExtractor 提取中间帧作为代表图
└── QualityCheckConsistency Tool (consistencyCheckTools.ts) 封装为 Agent 可调用工具

QualityGate Stage (quality-gate.ts) — 管线质量门禁（opt-in）
├── 位置: batchGenerate 之后、arrangeOnTimeline 之前
├── 默认禁用: stageParams.qualityGate.enabled = false 时 passthrough
└── 启用时: 调用 ConsistencyEvaluator → ctx.qualityReport

RemediationPlanner (remediation-planner.ts)
├── plan(): QualityIssue → RemediationAction（确定性映射，零 LLM）
├── 15 种 category 全覆盖:
│   ├── 技术类: artifact→AddEffect(denoise), color-distortion→SetColorCorrection,
│   │          audio-*→SetAudioProperties, resolution→regenerate
│   ├── 语义类: prompt/script-mismatch→regenerate, character-inconsistency→regenerate-ref,
│   │          style-drift→color-correct, composition/motion→regenerate
│   └── 视频类: jitter→AddEffect(stabilize), tearing→regenerate, stuttering→AddEffect(frame-interpolation)
└── 未知 category → manual-review fallback (confidence 0.3)

QualityCheck Tool 返回:
  QualityCheckResult {
    totalScenes, passed, failed,
    evaluations: [{
      index, finalScore, passed,
      attempts,                    // 重试次数追踪
      issues: QualityIssue[],      // 结构化问题（category + severity + description）
      finalPath,                   // 最优生成文件路径
      dimensions?,                 // 五维度评分（含 audioQuality/videoQuality）
      remediations?,               // critical/major 问题的修复操作
      audioMetrics?,               // 音频技术指标
      videoMetrics?,               // 视频技术指标
    }]
  }

执行策略: Path A (Agent ReAct 工具调用)
  - NOT pipeline stage — QualityCheck 作为独立 tool
  - Agent 在 ReAct 循环中自主决定是否调用
  - 评估→结构化诊断→确定性修复映射闭环在工具内部完成
  - Agent 可根据 remediations 自主执行 ToolSet 修复
```

**Phase 1 已解决的局限** ~~(Phase 1 前)~~：
1. ~~**无结构化问题分类**~~ → ✅ `QualityIssue[]`（12 种 category × 4 种 severity）
2. ~~**仅 prompt 对比**~~ → ✅ 传入 `globalStyle` + `sceneDialogue[]` 到评估 prompt
3. ~~**修复仅限重新生成**~~ → ✅ `RemediationPlanner` 映射到 AddEffect/SetColorCorrection/SetAudioProperties
4. ~~**硬编码评分维度百分比**~~ → ✅ 四维独立评分（technicalQuality/promptAdherence/scriptAdherence/aesthetics）

**剩余局限**：
1. ~~**仅图片**~~ → ✅ Phase 2 完成视频（VideoFrameEvaluator）、Phase 3 完成音频（AudioEvaluator）
2. ~~**无跨场景上下文**~~ → ✅ Phase 4 完成跨场景一致性（ConsistencyEvaluator + QualityCheckConsistency）
3. ~~**CLIP Score 快筛未集成**~~ → ✅ Phase 4 ConsistencyEvaluator Layer 1 集成 CLIP 快筛（IClipScorer 可选注入）
4. **SSIM/PSNR 相邻帧指标待填充**：`VideoTechnicalMetrics` 中 `meanAdjacentSsim/minAdjacentSsim/meanAdjacentPsnr` 为 optional，待 Engine 扩展图片 diff 能力后接入

### 1.3 已有类型基础（qa-types.ts）

**P0 已实现（Gate Preview + Diagnostics + 结构化质量评估）**:

```typescript
// Gate 预览 — 用于 Pipeline 门控展示
SceneVerdict = 'accept' | 'needs-edit' | 'regenerate'
SceneReviewCard { sceneIndex, heading, description, mediaPath, mediaType, verdict?, notes? }
GatePreviewData { stageName, scenes: SceneReviewCard[], globalStyle?, failedIndices }

// 诊断报告 — 类型已定义，实现延迟到 Phase 2+
SceneDiagnostic { sceneIndex, heading, intendedDescription, generatedPath?, issues: string[], suggestion }
DiagnosticsReport { pipelineId, flowId, status, stagesSummary, sceneDiagnostics[], recommendations[] }

// ✅ Phase 1 新增 — 结构化质量评估（已实现）
EvalMediaType = 'image' | 'video' | 'audio'
IssueSeverity = 'critical' | 'major' | 'minor' | 'info'
QualityIssueCategory   // 15 种: artifact/resolution/color-distortion/audio-noise/audio-clipping/
                       //        loudness-off/prompt-mismatch/script-mismatch/style-drift/
                       //        character-inconsistency/composition-poor/motion-unnatural/
                       //        jitter/tearing/stuttering (Phase 2 新增)
QUALITY_ISSUE_CATEGORIES  // 运行时数组（for validation）
QualityIssue { category, severity, description, location?, remediation? }
RemediationActionType = 'regenerate' | 'regenerate-ref' | 'apply-effect' | 'color-correct' | 'adjust-audio' | 'manual-review'
RemediationAction { type, description, toolName?, toolParams?, optimizedPrompt?, confidence }
MediaEvaluation { overallScore, dimensions: { technicalQuality, promptAdherence, scriptAdherence?, aesthetics }, issues, passed }
```

**P2 未实现（跨场景一致性）**:

```typescript
StyleDriftPair       // 相邻场景风格漂移评分（driftScore 0-100）
CharacterAppearance  // 角色跨场景外观一致性（score 0-100 vs 首次出现）
ConsistencyReport    // 完整跨场景一致性报告
```

### 1.4 已有但未对接的工具

Pipeline 和 ToolSet 中存在大量可用于"修复"的工具。Phase 1 已通过 `RemediationPlanner` 建立结构化映射：

| ToolSet | 可用工具 | 修复场景 | alwaysActive | RemediationPlanner 映射 |
|---------|---------|---------|-------------|------------------------|
| `effectsTransitionsToolSet` | AddEffect, UpdateEffect | 添加去噪/锐化/稳定滤镜 | ✅ | ✅ `artifact→AddEffect(denoise)` |
| `colorGradingToolSet` | SetColorCorrection | 色调统一、风格校正 | ✅ | ✅ `color-distortion/style-drift→SetColorCorrection` |
| `audioEditingToolSet` | SetAudioProperties | 音量归一化、降噪 | ✅ | ✅ `audio-noise/clipping/loudness→SetAudioProperties` |
| `elementEditingToolSet` | TrimElement, SplitElement | 裁剪问题片段 | ✅ | TODO 未映射到 RemediationPlanner |
| `animationKeyframesToolSet` | AddKeyframe | 平滑过渡修复 | ✅ | TODO 未映射到 RemediationPlanner |
| `mediaQAToolSet` | QualityCheck, QualityCheckConsistency | 质量检测 + 一致性 | ✅ 按需激活 | — |

### 1.5 底层已有能力（neko-engine Rust 层）

Quality Assessment 可直接复用的 Engine 能力：

| 能力 | 实现位置 | 说明 |
|------|---------|------|
| **SSIM（视频）** | `video_diff.rs` | FFmpeg 并行处理，帧级 SSIM/PSNR，0.95 阈值标记差异帧，支持采样 FPS |
| **SSIM（图片）** | `image_diff.rs` | 逐通道 8x8 块 SSIM + diff 热力图 JPEG |
| **PSNR** | `video_diff.rs` + `image_diff.rs` | 逐帧 dB 值 |
| **音频 SNR** | `audio_diff.rs` | 波形比较 + 0.1s 分段差异检测 + 峰值下采样 |
| **响度分析** | `loudness.rs` | ITU-R BS.1770-4 LUFS + True Peak + LRA + 归一化增益建议 |
| **硬件加速解码** | `decoder/mod.rs` | VideoToolbox/VAAPI/D3D11VA，NV12 GPU 纹理输出 |
| **关键帧提取** | `services/video.rs` | `capture_frame()` / `extract_frames()` / `get_keyframes()` |
| **IDR 扫描** | `decoder/idr_scanner.rs` | 关键帧检测 |
| **媒体探测** | `probe.rs` | FFmpeg probe 元数据 |
| **CLIP 评分** | `EngineClient.clipScore()` | 文本-图像对齐分数 [-1, 1] |

**未实现**：
- TODO VMAF（未集成，使用 SSIM/PSNR 替代）
- TODO FFT 频谱分析（无音频频域能力，需 Rust 扩展）
- TODO cpal 实时音频采集（使用 FFmpeg 替代，需 Rust 扩展）

### 1.6 ReactiveStage 状态

`IReactiveStage` 接口已定义在 `pipeline/types.ts`，但 `pipeline-executor.ts` 中 `throw` 拒绝执行：

```typescript
// pipeline-executor.ts:166
"ReactiveStage not implemented (stage: ${stage.name}). Reserved for Phase 3+."
```

质量评估目前走 **Path B（Agent ReAct 工具调用）**，不走 Pipeline ReactiveStage。

---

## 2. 2026 多模态模型能力调研

### 2.1 图片质量评估

| 模型 | 能力 | 限制 |
|------|------|------|
| **Claude Opus 4.6** | 元素级评分（物体/颜色/空间/动作），结构化输出 | MMMU ~78%，略落后 GPT/Gemini |
| **GPT-5.x** | MMMU ~85%，强图像分析 | 无原生视频 |
| **Gemini 2.5/3.x** | 跨模态联合推理最强，原生多模态 tokenizer | 视觉评分与 GPT 接近 |

**关键发现**：
- 多模态 LLM 在 IQA（Image Quality Assessment）上超越传统手工特征方法，但仍不及专项深度 CNN
- **角色/风格一致性跨图检测**：无正式 benchmark，但零样本 prompting（传多张图比较）可行，准确度未经验证
- M3-AGIQA 框架（2025）支持感知质量+提示符合度+真实性三维评估，需 LoRA 微调

### 2.2 视频理解

| 模型 | 原生视频 | 容量 | 帧处理 |
|------|---------|------|--------|
| **Gemini 2.5 Pro** | ✅ 原生输入 | ~1 小时/2GB | 1fps, 最高 7200 帧 |
| **GPT-4o/5.x** | ❌ 抽帧分析 | <5 分钟最佳 | 手动帧提取 |
| **Claude** | ❌ 仅图片 | — | — |
| **Gemini 3** | ✅ 跨帧上下文理解 | 改进 | 帧间关系推理 |

**关键发现**：
- Gemini 2.5 Pro 是**唯一支持原生视频输入**的前沿模型，无竞争对手
- 帧级技术质量（抖动/撕裂/卡顿）：**无模型经过验证**，仍需传统工具
- **neko-engine 已有 SSIM/PSNR 帧级分析**，可直接用于技术质量检测
- 动作连贯性/场景一致性：Gemini 可做时序推理，但无专项 benchmark
- GPT "GPT-4o-2" 计划 2026 Q2 支持原生视频
- **当前代码瓶颈**：`ai-sdk-adapter.ts` 消息转换层仅支持 image，未接入视频消息类型

### 2.3 音频评估

| 工具/模型 | 能力 | 开源 |
|---------|------|------|
| **Meta Audiobox Aesthetics** | 语音+音乐+环境音统一质量评估 | 研究论文 |
| **DORA-MOS** (AudioMOS 2025) | 四维评分：产出质量/复杂度/内容享受/有用性 | ❌ 闭源 |
| **MuQ-Eval** (2026.03) | AI 生成音乐的开源逐样本质量指标 | ✅ 开源 |
| **SCOREQ** (NeurIPS 2024) | 语音质量对比回归 | ✅ |
| **Audio LLM** (ICLR 2025) | 描述性语音质量评估 | 研究 |
| **Gemini 2.5** | 原生音频输入理解 | API |

**关键发现**：
- 音频质量评估正在成熟，但无统一的、生产级的评估 API
- 音画同步检测：**无专项模型或 benchmark**
- Gemini 2.5 原生处理音频，可做零样本语义理解，但技术指标（噪声/削波）未验证
- **neko-engine 已有**：ITU-R BS.1770-4 LUFS 响度分析 + SNR 波形比较，可覆盖技术层指标

### 2.4 跨模态一致性

| 评估方法 | 用途 | 成熟度 |
|---------|------|--------|
| **CLIP Score** | 文本-图像对齐基线 | ✅ 工业标准，**EngineClient 已集成** |
| **MindScore** (2025) | 匹配/忠实度/质量/真实性四维 | 研究 |
| **Task-Decomposed** (ACL 2025) | 提取问题→生成描述→评分 | 研究 |
| **Gemini 2.5 长上下文** | 剧本↔视频对齐的最佳候选 | 可行但未验证 |

**关键发现**：
- 剧本→视频对齐：无专项模型，Gemini 2.5（1M token + 原生视频）是最可行方案
- 跨场景叙事一致性：需自行构建评估 pipeline
- **CLIP Score 已可直接使用**（`EngineClient.clipScore()`），可作为快筛基线

### 2.5 技术质量指标（传统工具）

| 工具 | 指标 | 特点 | neko-engine 状态 |
|------|------|------|-----------------|
| **SSIM** | 结构相似度 | 适合边缘保持/纹理评估 | ✅ 已实现（图片+视频） |
| **PSNR** | 峰值信噪比 | 与 SSIM 互补 | ✅ 已实现 |
| **VMAF 3.0** | 感知质量（0.87+ MOS 相关） | FFmpeg 集成，GPU 加速 | ❌ 未集成 |
| **Probe.dev** | 云 API：VMAF/SSIM/PSNR | 生产级服务 | — |
| **ITU-R BS.1770-4** | 响度 LUFS + True Peak | 广播标准 | ✅ 已实现 |

### 2.6 能力-方案映射总结

```
需求                    模型/工具方案               成熟度    Engine 基础
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
图片质量评估             Vision LLM (任意前沿)        ✅ 高    —
图片一致性(跨场景)       Vision LLM 多图比较          ⚠️ 中    CLIP Score ✅
视频语义评估             Gemini 2.5 原生视频          ✅ 高    需接 video msg ❌
视频帧级质量             SSIM/PSNR + neko-engine      ✅ 高    ✅ 已实现
视频抖动/撕裂检测        neko-engine 帧差分析          ⚠️ 中    SSIM diff ✅
音频质量评估             MuQ-Eval / Audiobox          ⚠️ 中    LUFS/SNR ✅
音画同步                 neko-engine 时序分析          ❌ 低    需自建
剧本↔素材符合度          Gemini 2.5 长上下文           ⚠️ 中    —
风格一致性               Vision LLM 多图比较 + CLIP    ⚠️ 中    CLIP Score ✅
可执行修复操作            LLM 生成工具调用             ✅ 高    ToolSet 体系 ✅
跨素材一致性             Vision LLM + IP-Adapter       ⚠️ 中    IP-Adapter 3 adapter ✅
```

---

## 3. 编排模式分析

质量评估系统的执行模式选择直接影响架构设计。neko-agent 已有三种编排模式，需明确各自适用边界。

### 3.1 三种模式对比

```
                    确定性                                    自主性
         ◄─────────────────────────────────────────────────────►

  Pipeline（管线）          Coordinator（工作流）        Agent ReAct（推理）
  ┌──────────────┐         ┌──────────────────┐        ┌──────────────┐
  │ 固定阶段链    │         │ 任务 DAG 编排     │        │ LLM 自主决策  │
  │ 顺序确定     │         │ 依赖关系确定      │        │ 每步重新推理   │
  │ 门控暂停     │         │ 并发度确定        │        │ 工具自主选择   │
  │ 人在回路     │         │ 子 Agent 隔离     │        │ 上下文驱动     │
  └──────────────┘         └──────────────────┘        └──────────────┘

  适合：已知流程             适合：已知任务集              适合：探索性任务
  类比：工厂流水线           类比：项目管理看板             类比：自由职业者
```

| 维度 | Pipeline | Coordinator (SubAgent) | Agent ReAct |
|------|----------|----------------------|-------------|
| **控制流** | 线性阶段链，编译时确定 | DAG 依赖图，运行时调度 | LLM 每轮决策 |
| **并发** | 单阶段内 `Promise.allSettled` | `maxConcurrency` 跨任务并行 | 单线程，工具级并行 |
| **人在回路** | `gate: 'confirm'` 暂停 | `require_confirmation` 阶段 | `permission: 'ask'` 模式 |
| **错误恢复** | `failedScenes[]` 跳过，无自动重试 | `pool.fail()` 标记，无重试 | LLM 看到错误后自主调整 |
| **上下文** | `PipelineContext` 可变数据袋 | 依赖结果注入子任务 prompt | 完整对话历史 |
| **可扩展性** | before/after hooks | 新任务加入 DAG | 新工具注册即可用 |
| **当前成熟度** | 6 flow + 6 stage，生产可用 | Coordinator 可用但无重试 | 核心引擎，最成熟 |

### 3.2 创作场景适配

创作不是单一模式的问题，**不同阶段需要不同模式**：

| 创作阶段 | 特征 | 最适模式 | 原因 |
|---------|------|---------|------|
| 需求理解 | 探索性，需反复澄清 | **ReAct** | Agent 提问、搜索参考、理解意图 |
| 剧本/分镜 | 半结构化，需创意发散 | **ReAct** | 自主迭代、用户反馈 |
| 提示词生成 | 确定性流程，批量处理 | **Pipeline** | N 场景 → N prompt → 人工审核 |
| 素材批量生成 | 大规模并行，独立任务 | **Coordinator** | 5 SubAgent 并发，资源调度 |
| **质量评估** | **需判断力，每个结果不同** | **ReAct** | **自主诊断 + 工具调用** |
| 精修/调色 | 交互式，高度个性化 | **ReAct** | 理解模糊反馈 → 工具组合 |
| 最终合成 | 确定性，顺序操作 | **Pipeline** | arrangeOnTimeline stage |

### 3.3 各模式的边界与局限

**Pipeline 的价值在"门控"，局限在"刚性"**：

```
Pipeline 局限:
├── 阶段顺序编译时固定 → 创作中经常需要"跳回去改"
├── ReactiveStage 未实现 → 质量不达标只能重跑整条 pipeline
├── 无条件分支 → 不能"如果视频质量差就改用图片"
├── 阶段间仅靠 PipelineContext → 丢失 LLM 推理上下文
└── 错误只标记不修复 → failedScenes[] 等人工处理
```

**Coordinator 的价值在"并行+隔离"，局限在"无判断力"**：

```
Coordinator 局限:
├── 子 Agent 无全局上下文 → 不能做跨场景一致性判断
├── 无自动重试 → pool.fail() 后无后续
├── 任务粒度固定 → 不能中途拆分/合并任务
└── 结果仅回流到依赖任务 → 不回流到父 Agent 对话历史
```

**Agent ReAct 的价值在"判断力"，局限在"串行+昂贵"**：

```
ReAct 局限:
├── 单线程 → 10 个场景逐个评估太慢
├── 完整上下文 → token 消耗随对话增长
├── 无确定性保证 → 同样输入可能产生不同行为
└── 无内置进度追踪 → 用户不知道"做到哪了"
```

### 3.4 编排决策：混合分层

**结论：单一模式不够，三种模式分层组合。**

```
┌──────────────────────────────────────────────────────────────┐
│                 Agent ReAct (L3 — 决策层)                     │
│  理解需求 → 选择策略 → 评估结果 → 决定修复 → 与用户交互        │
│                                                              │
│  ┌────────────────────┐  ┌─────────────────────────────────┐ │
│  │ Pipeline (L2a)     │  │ Coordinator (L2b)               │ │
│  │ 确定性阶段链        │  │ 并行任务调度                     │ │
│  │ gate 人工审核       │  │ DAG 依赖 + SubAgent 隔离        │ │
│  │                    │  │                                 │ │
│  │ readDoc → parse →  │  │ [scene-0] [scene-1] [scene-2]  │ │
│  │ prompts → [gate]   │  │ [image]   [video]   [music]    │ │
│  │ → arrange          │  │                                 │ │
│  └────────────────────┘  └─────────────────────────────────┘ │
│                                                              │
│  Agent 自主决定何时启动 Pipeline、何时用 Coordinator、         │
│  何时直接用 ToolSet 手动操作                                  │
└──────────────────────────────────────────────────────────────┘
```

**职责边界**：

| 模式 | 负责 | 不负责 |
|------|------|-------|
| **Agent ReAct** | 需求理解、策略选择、**质量判断**、精修交互、异常处理 | 批量并行、固定流程 |
| **Pipeline** | 确定性阶段链（解析→提示词→排列）、门控审核 | 判断、修复、并行生成 |
| **Coordinator** | 批量并行生成（N 场景 × M 媒体类型）、资源调度 | 流程编排、质量判断 |

### 3.5 对质量评估系统的影响

基于上述分析，质量评估应走 **Agent ReAct Tool 模式**（非 Pipeline ReactiveStage）：

| 考量 | Pipeline ReactiveStage | Agent ReAct Tool | 选择 |
|------|----------------------|-----------------|------|
| 判断力 | 无（固定阈值） | ✅ LLM 推理 | ReAct |
| 修复决策 | 预定义 action | ✅ 上下文感知组合 | ReAct |
| 跨场景关联 | 仅 PipelineContext | ✅ 完整对话历史 | ReAct |
| 用户交互 | gate 二选一 | ✅ 自然语言 | ReAct |
| 批量评估并行 | ✅ 内置 | 需 Coordinator 辅助 | 混合 |
| 进度追踪 | ✅ PipelineEvent | 需手动 | Pipeline 辅助 |

**最终方案**：
- **单素材评估**：Agent ReAct 直接调用 `QualityAssess` tool
- **批量评估**：Agent 启动 Coordinator，N 个 `quality-checker` SubAgent 并行评估
- **修复决策**：Agent ReAct 看到评估结果后自主选择修复工具
- **Pipeline 集成**：opt-in 的 `qualityGate` 阶段（仅门控展示报告，不做判断）

**不应该做的**：
- 不要把判断逻辑塞进 Pipeline ReactiveStage（丢失 LLM 推理能力）
- 不要让 Coordinator SubAgent 替代 Agent 做跨场景一致性判断（无全局上下文）
- 不要让 Agent ReAct 串行评估 N 个场景（太慢，应委托 Coordinator 并行）

---

## 4. 开发方案

### 4.1 设计原则

1. **混合评估策略**：LLM 做语义/美学评估，传统工具做技术指标，互补不替代
2. **Evaluator 接口隔离**：统一 `IMediaEvaluator` 接口，具体实现可替换（Claude/Gemini/本地模型）
3. **结构化问题分类**：评估结果必须是结构化的 `QualityIssue`，不是自由文本 `string[]`
4. **Action 驱动修复**：每个 issue 关联可执行的 `RemediationAction`，对接已有 ToolSet
5. **渐进式上下文**：从单素材评估 → 成对比较 → 全场景一致性，逐步扩展上下文窗口
6. **复用 Engine 能力**：SSIM/PSNR/LUFS/CLIP 已在 Rust 层实现，不在 TS 层重复

### 4.2 核心接口设计

```typescript
// =============================================================================
// L0: 评估原语
// =============================================================================

/** 媒体类型 */
type EvalMediaType = 'image' | 'video' | 'audio';

/** 问题严重度 */
type IssueSeverity = 'critical' | 'major' | 'minor' | 'info';

/** 结构化问题分类 */
interface QualityIssue {
  /** 问题类别 */
  category: QualityIssueCategory;
  /** 严重度 */
  severity: IssueSeverity;
  /** 人类可读描述 */
  description: string;
  /** 时间/空间位置（可选） */
  location?: IssueLocation;
  /** 关联的修复操作 */
  remediation?: RemediationAction;
}

type QualityIssueCategory =
  // 技术质量
  | 'artifact'           // 伪影、噪点
  | 'resolution'         // 分辨率不足
  | 'color-distortion'   // 色彩失真
  | 'jitter'             // 画面抖动
  | 'tearing'            // 画面撕裂
  | 'stuttering'         // 卡顿
  | 'audio-noise'        // 音频噪声
  | 'audio-clipping'     // 音频削波
  | 'loudness-off'       // 响度异常（LUFS 超标）
  // 语义质量
  | 'prompt-mismatch'    // 不符合生成提示词
  | 'script-mismatch'    // 不符合剧本描述
  | 'style-drift'        // 风格漂移
  | 'character-inconsistency'  // 人物不一致
  | 'object-inconsistency'    // 物品不一致
  | 'scene-inconsistency'     // 场景不一致
  | 'motion-unnatural'   // 动作不合理
  | 'composition-poor'   // 构图差
  // 同步
  | 'av-sync'            // 音画不同步
  | 'pacing-off';        // 节奏不匹配

/** 问题位置 */
interface IssueLocation {
  /** 时间范围（视频/音频，秒） */
  timeRange?: { start: number; end: number };
  /** 空间区域（图片/视频帧） */
  region?: { x: number; y: number; width: number; height: number };
  /** 场景索引 */
  sceneIndex?: number;
  /** 帧范围 */
  frameRange?: { start: number; end: number };
}

/** 可执行修复操作 */
interface RemediationAction {
  /** 修复类型 */
  type: RemediationActionType;
  /** 操作描述 */
  description: string;
  /** 对应的 tool 名称（映射到已有 ToolSet） */
  toolName?: string;
  /** tool 参数 */
  toolParams?: Record<string, unknown>;
  /** 优化后的 prompt（用于重新生成） */
  optimizedPrompt?: string;
  /** IP-Adapter 参考图（用于角色一致性修复） */
  ipAdapterRef?: { imageBase64: string; strength: number; mode: 'style' | 'subject' | 'both' };
  /** 置信度 0-1 */
  confidence: number;
}

type RemediationActionType =
  | 'regenerate'         // 重新生成（prompt 优化）
  | 'regenerate-ref'     // 重新生成（IP-Adapter 参考图）
  | 'apply-effect'       // 应用效果（去噪/锐化/稳定）
  | 'color-correct'      // 色彩校正
  | 'trim'               // 裁剪问题片段
  | 'replace-segment'    // 替换片段
  | 'adjust-audio'       // 音频调整（含响度归一化）
  | 'add-transition'     // 添加转场平滑
  | 'manual-review';     // 需人工处理

// =============================================================================
// L1: 评估器接口
// =============================================================================

/** 单素材评估结果 */
interface MediaEvaluation {
  /** 总体质量分 0-100 */
  overallScore: number;
  /** 维度分数 */
  dimensions: {
    technicalQuality: number;    // 技术质量
    promptAdherence: number;     // Prompt 符合度
    scriptAdherence?: number;    // 剧本符合度（有剧本时）
    aesthetics: number;          // 美学
  };
  /** 技术指标（由 Engine 计算，非 LLM） */
  technicalMetrics?: {
    ssim?: number;               // 结构相似度 0-1
    psnr?: number;               // 峰值信噪比 dB
    clipScore?: number;          // 文本-图像对齐 [-1, 1]
    lufs?: number;               // 响度 LUFS
    truePeak?: number;           // 真峰值 dBFS
    lra?: number;                // 响度范围 LU
  };
  /** 结构化问题列表 */
  issues: QualityIssue[];
  /** 是否通过 */
  passed: boolean;
}

/** 跨素材一致性评估结果 */
interface ConsistencyEvaluation {
  overallConsistency: number;
  styleDrift: StyleDriftPair[];
  characterConsistency: CharacterAppearance[];
  issues: QualityIssue[];
}

/** 评估器接口（SRP: 一个评估器只负责一个维度） */
interface IMediaEvaluator {
  readonly name: string;
  readonly supportedTypes: EvalMediaType[];
  evaluate(input: EvalInput): Promise<MediaEvaluation>;
}

/** 一致性评估器接口 */
interface IConsistencyEvaluator {
  readonly name: string;
  evaluate(inputs: EvalInput[], context: ConsistencyContext): Promise<ConsistencyEvaluation>;
}

/** 评估输入 */
interface EvalInput {
  mediaPath: string;
  mediaType: EvalMediaType;
  prompt: string;
  /** 剧本场景信息（可选，启用剧本符合度评估） */
  scene?: StoryboardScene;
  /** 全局风格（可选，启用风格一致性评估） */
  globalStyle?: string;
  /** 参考图（可选，用于角色/风格参考） */
  referenceImages?: string[];
}

/** 一致性评估上下文 */
interface ConsistencyContext {
  globalStyle?: string;
  characterDescriptions?: Array<{ name: string; description: string; referenceImage?: string }>;
  storyboard?: StoryboardScene[];
}
```

### 4.3 架构设计

基于 §3 编排模式分析的混合分层决策：

```
┌──────────────────────────────────────────────────────────────────────┐
│  L3: Agent ReAct (决策层)                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Agent 自主决策:                                                 │  │
│  │  · 单素材 → 直接调用 QualityAssess tool                        │  │
│  │  · 批量评估 → 启动 Coordinator (N 个 quality-checker SubAgent) │  │
│  │  · 看到结果 → 自主选择修复工具 / 重新生成 / 请求用户确认        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  L2: 编排层                                                          │
│  ┌─────────────────────┐  ┌────────────────────────────────────┐    │
│  │ Pipeline (opt-in)   │  │ Coordinator (批量评估)              │    │
│  │ qualityGate 阶段    │  │ quality-checker SubAgent × N       │    │
│  │ 仅门控展示报告       │  │ 并行评估 + 结果聚合               │    │
│  │ 不做判断            │  │                                    │    │
│  └─────────────────────┘  └────────────────────────────────────┘    │
│                                                                      │
│  L1: 评估服务层                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                 QualityAssessmentService                      │    │
│  │  (orchestrator: 选择评估器、聚合结果)                          │    │
│  ├──────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐ │    │
│  │  │ ImageEvaluator │  │VideoEvaluator│  │ AudioEvaluator    │ │    │
│  │  │ (Vision LLM)  │  │(Gemini/帧)   │  │ (Gemini/LLM)     │ │    │
│  │  └───────────────┘  └──────────────┘  └───────────────────┘ │    │
│  │                                                              │    │
│  │  ┌───────────────┐  ┌──────────────┐                        │    │
│  │  │TechnicalEval. │  │Consistency   │                        │    │
│  │  │SSIM/PSNR/LUFS │  │CLIP+LLM 双层│                        │    │
│  │  │via Engine      │  │             │                        │    │
│  │  └───────────────┘  └──────────────┘                        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  L0: 修复执行层                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  RemediationPlanner                                          │    │
│  │  (issue → action 映射, IP-Adapter ref 注入)                  │    │
│  ├──────────────────────────────────────────────────────────────┤    │
│  │  已有 ToolSet 层                                              │    │
│  │  effectsTransitions | colorGrading | audioEditing | element  │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘

执行路径:

  路径 A — 单素材评估 (ReAct 直接):
    Agent → QualityAssess tool → QualityAssessmentService → IMediaEvaluator[]
    Agent 看结果 → RemediationPlanner → 执行 ToolSet 修复

  路径 B — 批量评估 (ReAct + Coordinator):
    Agent → coordinate({ tasks: scenes.map(s => quality-checker SubAgent) })
    Coordinator → N 个 SubAgent 并行评估 → 聚合结果回 Agent
    Agent 看聚合结果 → 自主决定逐个修复 / 批量重生成

  路径 C — Pipeline 内嵌 (opt-in):
    ... → batchGenerate → qualityGate[展示报告] → Agent 接管修复决策
    qualityGate 仅做评估 + 门控展示，不做修复判断
```

### 4.4 分阶段实施计划

#### Phase 1: 结构化评估 + 修复闭环（P0） — ✅ 已完成

**目标**：将 `qualityCheckTools.ts` 从"自由文本评分+仅重生成"升级为"结构化诊断+多路修复"。

**实际完成**（2026-04-01）：

##### 1a. 类型体系（agent 层，零 vscode 依赖）

**文件**: `packages/neko-agent/packages/agent/src/pipeline/qa-types.ts`（现 124 行，扩展）

在已有的 `SceneVerdict`/`SceneDiagnostic`/`StyleDriftPair` 基础上新增：

```typescript
// --- 新增到 qa-types.ts ---

/** 结构化问题类别 */
export type QualityIssueCategory =
  // 技术质量（可由 Engine 客观检测）
  | 'artifact' | 'resolution' | 'color-distortion'
  | 'audio-noise' | 'audio-clipping' | 'loudness-off'
  // 语义质量（需 LLM 判断）
  | 'prompt-mismatch' | 'script-mismatch'
  | 'style-drift' | 'character-inconsistency'
  | 'composition-poor' | 'motion-unnatural';

export type IssueSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface QualityIssue {
  category: QualityIssueCategory;
  severity: IssueSeverity;
  description: string;
  location?: { sceneIndex?: number; region?: { x: number; y: number; w: number; h: number } };
  remediation?: RemediationAction;
}

export type RemediationActionType =
  | 'regenerate'      // prompt 优化重生成
  | 'regenerate-ref'  // IP-Adapter 参考图重生成
  | 'apply-effect'    // 添加滤镜（去噪/锐化/稳定）
  | 'color-correct'   // 调色
  | 'adjust-audio'    // 音频调整（含响度归一化）
  | 'manual-review';  // 需人工

export interface RemediationAction {
  type: RemediationActionType;
  description: string;
  /** 映射到已有 ToolSet 中的 tool 名称 */
  toolName?: string;
  /** tool 调用参数 */
  toolParams?: Record<string, unknown>;
  /** 优化后的 prompt（type='regenerate' 时） */
  optimizedPrompt?: string;
  confidence: number;  // 0-1
}

/** 多维度评估结果（替代现有的 score: number + issues: string[]） */
export interface MediaEvaluation {
  overallScore: number;  // 0-100
  dimensions: {
    technicalQuality: number;
    promptAdherence: number;
    scriptAdherence?: number;  // 有剧本时
    aesthetics: number;
  };
  technicalMetrics?: {
    clipScore?: number;  // [-1, 1], from EngineClient
  };
  issues: QualityIssue[];
  passed: boolean;
}
```

**改动要点**：
- 纯类型追加，不影响已有 `SceneReviewCard`/`GatePreviewData`/`DiagnosticsReport`
- `SceneDiagnostic.issues` 保持 `string[]` 不变（已有消费者），`QualityIssue` 是新体系
- 后续 Phase 视频/音频相关类别（`jitter`/`tearing`/`av-sync` 等）延后添加

##### 1b. 评估器接口 + ImageEvaluator 重构

**新增文件**: `packages/neko-agent/packages/agent/src/validation/media-evaluator.ts`

```typescript
// --- 评估器接口（agent 层，零 vscode 依赖） ---

export type EvalMediaType = 'image' | 'video' | 'audio';

export interface EvalInput {
  mediaPath: string;
  mediaType: EvalMediaType;
  prompt: string;
  scene?: { description: string; dialogue?: string[] };
  globalStyle?: string;
  referenceImages?: string[];  // base64, for multi-image comparison
}

/** SRP: 一个评估器只负责一种媒体类型的一个评估维度 */
export interface IMediaEvaluator {
  readonly name: string;
  readonly supportedTypes: readonly EvalMediaType[];
  evaluate(input: EvalInput): Promise<MediaEvaluation>;
}
```

**重构文件**: `packages/neko-agent/packages/extension/src/tools/qualityCheckTools.ts`

当前 `VisionEvaluator` 的改动（保持在 extension 层，因为需要 `vscode.workspace.fs`）：

| 现状 | 改为 |
|------|------|
| `EVALUATION_SYSTEM_PROMPT` 硬编码 3 维度百分比 | 要求返回 `MediaEvaluation` JSON Schema，4 维度 + issues 数组 |
| `evaluate()` 返回 `{score, issues: string[], suggestion}` | 返回 `MediaEvaluation`（结构化 issues） |
| `parseEvaluation()` 手动 JSON.parse | JSON Schema 验证（复用 agent 层 `validation/` 已有基础设施） |
| `SceneInput.description` 可选但未传入 LLM | 传入 `scene.description` + `scene.dialogue[]` + `globalStyle` 到 prompt |
| `detectMimeType()` 仅 4 种图片格式 | 新增 `video/mp4`、`audio/mpeg` 等（为 Phase 2 铺路，本阶段仍仅走图片路径） |
| 重试循环仅 `optimizePrompt → regenerate` | 先检查 `issue.remediation`：`apply-effect` → 调用 ToolSet，`regenerate` → 原有路径 |

**新增评估 prompt**（替代 `EVALUATION_SYSTEM_PROMPT`）:

```
You are evaluating an AI-generated image for a creative project.

Context:
- Generation prompt: "{prompt}"
- Scene description: "{scene.description}" (if provided)
- Dialogue: {scene.dialogue} (if provided)
- Global style: "{globalStyle}" (if provided)

Return ONLY valid JSON matching this schema:
{
  "overallScore": <0-100>,
  "dimensions": {
    "technicalQuality": <0-100>,
    "promptAdherence": <0-100>,
    "scriptAdherence": <0-100 or null>,
    "aesthetics": <0-100>
  },
  "issues": [
    {
      "category": "<artifact|resolution|color-distortion|prompt-mismatch|script-mismatch|style-drift|character-inconsistency|composition-poor>",
      "severity": "<critical|major|minor|info>",
      "description": "<what's wrong>"
    }
  ]
}
```

##### 1c. CLIP Score 快筛

**改动文件**: `qualityCheckTools.ts` — `execute()` 方法

在 LLM 评估前插入 CLIP Score 快筛步骤：

```typescript
// Phase 1: CLIP fast-screen (if EngineClient available)
if (engineClient) {
  const clipScore = await engineClient.clipScore(scene.mediaPath, scene.prompt);
  if (clipScore > CLIP_HIGH_THRESHOLD) {  // e.g., 0.28
    // Prompt adherence likely good, skip expensive LLM call for this dimension
    // Still do LLM eval but with reduced scope (aesthetics + technical only)
  }
}
```

**依赖**: `QualityCheckToolsDeps` 新增可选 `engineClient?: EngineClient`。Extension 层 `serviceBootstrap.ts` 注入。

##### 1d. RemediationPlanner

**新增文件**: `packages/neko-agent/packages/agent/src/validation/remediation-planner.ts`

```typescript
/** issue → tool 调用映射（agent 层，零 vscode 依赖） */
export class RemediationPlanner {
  plan(issue: QualityIssue, mediaType: EvalMediaType): RemediationAction {
    // 确定性映射表，不需要 LLM
    const mapping: Partial<Record<QualityIssueCategory, () => RemediationAction>> = {
      'artifact': () => ({
        type: 'apply-effect', toolName: 'AddEffect',
        toolParams: { effectType: 'denoise', strength: 0.7 },
        description: 'Apply denoise filter', confidence: 0.8,
      }),
      'color-distortion': () => ({
        type: 'color-correct', toolName: 'SetColorCorrection',
        toolParams: { autoCorrect: true },
        description: 'Auto color correction', confidence: 0.7,
      }),
      'prompt-mismatch': () => ({
        type: 'regenerate', description: 'Regenerate with optimized prompt',
        confidence: 0.6,  // prompt optimization by LLM
      }),
      'loudness-off': () => ({
        type: 'adjust-audio', toolName: 'SetAudioProperties',
        toolParams: { normalize: true },
        description: 'Normalize audio loudness', confidence: 0.9,
      }),
    };
    return mapping[issue.category]?.() ?? {
      type: 'manual-review', description: 'Requires manual review',
      confidence: 0.3,
    };
  }
}
```

##### 1e. 多图比较模式

**改动文件**: `qualityCheckTools.ts` — `VisionEvaluator.evaluate()`

新增参数 `referenceImages?: string[]`。当提供时，将多张图片一起发给 Vision LLM：

```typescript
// Content parts for multi-image comparison
const imageParts = [
  { type: 'image', imageUrl: `data:${mime};base64,${currentBase64}`, detail: 'low' },
  ...referenceImages.map((ref, i) => ({
    type: 'image', imageUrl: `data:image/png;base64,${ref}`, detail: 'low',
  })),
];
// Prompt addition: "Compare the first image (current scene) with reference images.
// Check for style consistency and character appearance consistency."
```

##### 1f. QualityCheck tool 参数扩展

**改动文件**: `qualityCheckTools.ts` — tool `parameters`

```typescript
// 新增参数（向后兼容，全部 optional）
globalStyle: { type: 'string', description: 'Global visual style for consistency check' },
referenceImages: {
  type: 'array', items: { type: 'string' },
  description: 'File paths of reference images for style/character consistency',
},
sceneContext: {
  type: 'object',
  description: 'Storyboard scene context: { description, dialogue[] }',
},
enableClipScreen: {
  type: 'boolean', description: 'Enable CLIP score fast-screening (default: true)',
},
```

##### Phase 1 文件变更清单 — ✅ 实际完成

| 文件 | 操作 | 改动量 | 状态 |
|------|------|--------|------|
| `agent/src/pipeline/qa-types.ts` | 扩展 | +107 行（6 类型 + 1 运行时数组） | ✅ |
| `agent/src/pipeline/index.ts` | 扩展 | +re-export 8 类型 + 1 值 | ✅ |
| `agent/src/validation/remediation-planner.ts` | **新增** | 157 行（12 category 全覆盖） | ✅ |
| `agent/src/validation/index.ts` | 扩展 | +re-export 3 符号 | ✅ |
| `agent/package.json` | 扩展 | +`"./validation"` 显式导出路径 | ✅ |
| `extension/src/tools/qualityCheckTools.ts` | 重构 | 586 行（全文重写） | ✅ |
| `extension/src/tools/__tests__/qualityCheckTools.test.ts` | 重写 | 10 tests（结构化输出 + 维度 + remediation） | ✅ |
| `agent/src/validation/__tests__/remediation-planner.test.ts` | **新增** | 17 tests（全 category 映射覆盖） | ✅ |

**已做**:
- ✅ 结构化 `QualityIssue[]` 替代 `string[]`
- ✅ 四维独立评分（technicalQuality/promptAdherence/scriptAdherence/aesthetics）
- ✅ `RemediationPlanner` 确定性映射到 AddEffect/SetColorCorrection/SetAudioProperties
- ✅ `globalStyle` + `sceneDialogue` 上下文注入评估 prompt
- ✅ 安全解析（coerceScore/isValidIssue/normalizeIssue）

**未做（延后或设计变更）**:
- `media-evaluator.ts` 接口文件未新增 — VisionEvaluator 依赖 vscode.workspace.fs，保持 extension 层内联（设计决策，非缺失）
- ~~CLIP Score 快筛未集成~~ → ✅ Phase 4 ConsistencyEvaluator Layer 1 已集成（IClipScorer 可选注入）
- ~~多图比较模式未实现~~ → ✅ Phase 4 ConsistencyEvaluator 已实现多图对比
- `serviceBootstrap.ts` 未改动 — CLIP 通过 ConsistencyCheckToolsDeps.clipScorer 注入（设计决策）
- 不新增 QualityAssessmentService orchestrator（仍在 tool 内直接组合）
- ~~不实现视频/音频评估~~ → ✅ Phase 2 视频 + Phase 3 音频已完成

---

#### Phase 2: 视频评估 + 技术指标（P1）— ✅ 已完成 (2026-04-02)

**目标**：支持视频质量评估，混合 LLM 语义评估 + Engine 帧级技术指标

**前置条件**：Phase 1 类型体系 ✅

##### 实现方案

**VideoFrameEvaluator**（`qualityCheckTools.ts` 内部类，~150 行）— 多帧采样 + Vision LLM 一次性评估：

1. `IFrameExtractor.probe()` → 获取 duration/fps/width/height
2. 均匀采样 N 帧（默认 4 帧，排除首尾 5% 避免黑帧）
3. `IFrameExtractor.extractFrame()` → 并发提取 base64 JPEG
4. 构建多帧 multimodal message（N 个 image part + 视频元数据文本）
5. 视频专用评估 prompt（关注帧间一致性：jitter/tearing/stuttering）
6. 返回 `MediaEvaluation`（含 `videoQuality` 维度 + `VideoTechnicalMetrics`）

**类型扩展**：
- `QualityIssueCategory` 新增 3 种视频类别：`jitter`/`tearing`/`stuttering`（共 15 种）
- `VideoTechnicalMetrics`（qa-types.ts）：duration/fps/width/height/framesSampled + optional SSIM/PSNR
- `MediaEvaluation.dimensions.videoQuality?`：视频专属维度分数
- `MediaEvaluation.videoMetrics?`：附带完整技术指标

**RemediationPlanner 视频映射**：
- `jitter` → `AddEffect(stabilize, strength:0.6)`（confidence 0.7）
- `tearing` → `regenerate`（confidence 0.5）
- `stuttering` → `AddEffect(frame-interpolation, targetFps:30)`（confidence 0.6）

**ai-sdk-adapter 视频内容支持**（模型无关）：
- `ContentPart = TextPart | ImagePart | VideoPart`（三联合）
- `transformMessages()` 将 `video` part 转为 AI SDK `file` part（`mediaType: 'video/mp4'`）
- 实际评估仍走帧提取路径（多帧 image part），`VideoPart` 为原生视频理解预留
- 不硬编码任何模型 — 通过 `createService()` + `ModelSelector` + `capabilities: ['vision']` 选择

**QualityCheck tool 路由**：
- `detectMediaType()` 返回 `'video'` → VideoFrameEvaluator
- 视频保留 retry 能力（区别于音频 skip retry）
- retry 时重新评估也使用 VideoFrameEvaluator

**SSIM/PSNR 相邻帧指标**（optional，待扩展）：
- `VideoTechnicalMetrics.meanAdjacentSsim/minAdjacentSsim/meanAdjacentPsnr` 为 optional 字段
- 需要 Engine 支持图片级 diff（当前 `EngineClient.diff()` 需要文件路径）
- 后续可通过 Engine 新增 `videos:frame-metrics` action 直接返回帧级指标

##### Phase 2 实际文件变更

| 文件 | 操作 | 改动量 |
|------|------|--------|
| `agent/src/pipeline/qa-types.ts` | 扩展 | +3 视频 category，+`VideoTechnicalMetrics`，+`videoQuality` 维度，+`videoMetrics` 字段 |
| `agent/src/pipeline/index.ts` | 扩展 | re-export `VideoTechnicalMetrics` |
| `extension/src/tools/qualityCheckTools.ts` | 扩展 | +`IFrameExtractor`/`VideoFrameEvaluator` ~180 行，+video 路由，+retry video 评估 |
| `agent/src/validation/remediation-planner.ts` | 扩展 | +3 视频 category 映射（jitter/tearing/stuttering） |
| `platform/src/types/adapter.ts` | 扩展 | +`VideoPart` 类型，`ContentPart` 三联合 |
| `platform/src/llm/adapter/ai-sdk-adapter.ts` | 扩展 | +`video` → `file` part 转换 |
| `extension/src/tools/__tests__/qualityCheckTools.test.ts` | 扩展 | +8 个视频测试（26 tests total） |

---

#### Phase 3: 音频评估（P1）— ✅ 已完成 (2026-04-02)

**目标**：支持音频/音乐质量评估，复用 Engine LUFS/静音检测

**前置条件**：Phase 1 类型体系 ✅

##### 实现方案

**AudioEvaluator**（`qualityCheckTools.ts` 内部类，~110 行）— 纯 Engine 技术指标分析，零 LLM 成本：

1. `EngineClient.analyzeLoudness()` → LUFS + True Peak + LRA
2. `EngineClient.detectSilence()` → 静音率 + 静音区域数
3. 确定性阈值检测：
   - TruePeak > -1 dBFS → `audio-clipping`（critical/major）
   - LUFS < -24 or > -8 → `loudness-off`（major）
   - LUFS 在 -16~-12 范围外 → `loudness-off`（minor，非广播标准）
   - LRA > 20 LU → `loudness-off`（minor，动态范围过宽）
   - 静音比 > 50% → `audio-noise`（info）
4. 加权评分：削波 -40、响度 -30、动态范围 -15、静音 -10

**媒体类型路由**（`detectMediaType()` + `IAudioAnalyzer` 接口）：
- mp3/wav/opus/m4a/flac/ogg/aac → AudioEvaluator
- 音频场景不进入 retry 循环（技术问题通过 RemediationPlanner 确定性修复）
- 无 audioAnalyzer 时 fallback 到 VisionEvaluator

**类型扩展**：
- `AudioTechnicalMetrics`（qa-types.ts）：7 字段技术指标
- `MediaEvaluation.dimensions.audioQuality?`：音频专属维度分数
- `MediaEvaluation.audioMetrics?`：附带完整技术指标

##### Phase 3 实际文件变更

| 文件 | 操作 | 改动量 |
|------|------|--------|
| `agent/src/pipeline/qa-types.ts` | 扩展 | +`AudioTechnicalMetrics` 接口，+`audioQuality` 维度，+`audioMetrics` 字段 |
| `agent/src/pipeline/index.ts` | 扩展 | re-export `AudioTechnicalMetrics` |
| `extension/src/tools/qualityCheckTools.ts` | 扩展 | +`IAudioAnalyzer`/`AudioEvaluator`/`detectMediaType()` ~150 行 |
| `extension/src/tools/__tests__/qualityCheckTools.test.ts` | 扩展 | +8 个音频测试（35 tests total） |

**延后（不在此阶段）**:
- TODO LLM 语义音频评估（对话清晰度/情感匹配 → 需 ASR + LLM）
- TODO FFT 频谱分析 / onset detection（需新增 Rust）
- TODO SNR 分析（EngineClient.diff() 的 SNR 是双文件比较，非单文件质量指标）

---

#### Phase 4: 跨素材一致性 + 批量评估（P2）✅ 已完成 2026-04-02

**实现内容**：`ConsistencyReport` 完整实现，双层评估架构（CLIP 快筛 + Vision LLM 精评），角色一致性追踪，quality-checker SubAgent，Pipeline qualityGate

##### 4a. ConsistencyEvaluator（已实现）

**文件**: `agent/src/validation/consistency-evaluator.ts`（~320 行）

```
ConsistencyEvaluator
├── evaluate(inputs, context) → ConsistencyReport
│   ├── Step 1: extractRepresentativeImages() — 图片读路径，视频提取中间帧
│   ├── Step 2: clipFastScreen() — Layer 1 CLIP 快筛（IClipScorer 可选注入）
│   │   └── 相邻对各自对 globalStyle 做 clipScore → drift = |scoreA - scoreB| * 50
│   │   └── drift < CLIP_DRIFT_THRESHOLD(15) → 标记 Consistent，跳过 LLM
│   ├── Step 3: llmPairwiseEval() — Layer 2 Vision LLM 精评（仅高 drift 对）
│   │   └── 发两张图 + globalStyle + prompts → JSON { driftScore, description, characterIssues }
│   ├── Step 4: evaluateCharacterConsistency() — 首次出场为参考，逐场景对比
│   └── Step 5: 聚合 overallConsistency = 100 - mean(driftScores) + recommendations
├── 接口: IClipScorer { score(imagePath, text) }
│   └── EngineClient.clipScore() 预绑定 model 参数
├── 接口: IFrameExtractor（复用 Phase 2 定义）
└── 模型无关: createService() 工厂 → 任意 vision 模型
```

##### 4b. QualityCheckConsistency tool（已实现）

**文件**: `extension/src/tools/consistencyCheckTools.ts`（~160 行）

```typescript
{
  name: 'QualityCheckConsistency',
  parameters: {
    scenes: [{ sceneIndex, mediaPath, prompt }],  // required
    globalStyle: string,                            // optional
    characters: [{ name, description, referenceImagePath? }],  // optional
  },
  // → { success: true, data: ConsistencyReport }
}
```

##### 4c. quality-checker SubAgent Preset（已实现）

**文件**: `agent/src/subagent/creative-presets.ts` + `types.ts`

- `SpecializedAgentType` 新增 `'quality-checker'`
- `CreativeAgentType` 新增 `'quality-checker'`
- CREATIVE_PRESETS 新增条目：allowedTools `['QualityCheck', 'QualityCheckConsistency']`，tier `'balanced'`，maxIterations `10`

##### 4d. Pipeline qualityGate（已实现，opt-in）

**文件**: `agent/src/pipeline/stages/quality-gate.ts`（~85 行）

```
qualityGate stage
├── gate: 'auto', type: 'linear'
├── 默认禁用: stageParams.qualityGate.enabled 未设置时直接 passthrough
├── 启用时: scenes + generatedPaths → ConsistencyEvaluator → ctx.qualityReport
└── 位置: flowA/B/C/E/F 的 batchGenerate 与 arrangeOnTimeline 之间
```

##### Phase 4 实际文件变更

| 文件 | 操作 | 改动量 |
|------|------|--------|
| `agent/src/validation/consistency-evaluator.ts` | **新增** | ~320 行 |
| `agent/src/validation/__tests__/consistency-evaluator.test.ts` | **新增** | ~250 行 (11 tests) |
| `agent/src/validation/index.ts` | 扩展 | +8 行 |
| `extension/src/tools/consistencyCheckTools.ts` | **新增** | ~160 行 |
| `extension/src/tools/__tests__/consistencyCheckTools.test.ts` | **新增** | ~130 行 (5 tests) |
| `agent/src/subagent/creative-presets.ts` | 扩展 | +22 行 |
| `agent/src/subagent/types.ts` | 扩展 | +1 行 |
| `agent/src/pipeline/stages/quality-gate.ts` | **新增** | ~85 行 |
| `agent/src/pipeline/pipeline-registry.ts` | 扩展 | +6 行 |
| `agent/src/pipeline/index.ts` | 扩展 | +3 行 |
| `extension/src/pipeline/pipeline-bootstrap.ts` | 扩展 | +25 行 |
| `agent/src/skill/builtins/tool-skills.ts` | 扩展 | +1 行 |

---

#### Phase 5: Agent Skill + 完整修复闭环（P2）— ✅ 部分完成 (2026-04-02)

**目标**：质量评估作为 Agent Skill，评估→修复完整自动化

**已完成**：Skill 定义 + ToolSet 升级 + Slash Command
~~待完成~~：~~QualityCheckConsistency 工具集成（依赖 Phase 4）~~ ✅ Phase 4 已完成集成。~~RemediationPlanner 视频 category 扩展~~ ✅ 已在 Phase 2 中完成。

##### 5a. qualityAssessmentSkill ✅

**新增文件**: `agent/src/skill/builtins/quality-assessment.ts`

```typescript
export const qualityAssessmentSkill: Skill = {
  name: 'quality-assessment',
  description: 'Evaluate quality of AI-generated images, videos, and audio...',
  content: `# Media Quality Assessment Assistant\n\n...`,  // 完整工作流 prompt
  allowedTools: [
    'QualityCheck',
    'AddEffect', 'UpdateEffect', 'SetColorCorrection',
    'SetAudioProperties', 'GenerateImage', 'GenerateVideo',
    'GetTimelineInfo', 'ListElements', 'GetElementInfo',
  ],
  command: 'quality-check',  // /quality-check slash command
  supportsArguments: true,
  icon: '📊',
  source: 'builtin',
  enabled: true,
};
```

Skill content 包含：评估→解读→修复→报告四步工作流、15 种 issue category 参考、修复工具映射表。

注册: `builtinSkills[]` + `skill/index.ts` re-export。

##### 5b. RemediationPlanner 增强（Phase 1 已覆盖 12 类别）

Phase 1 已实现全部 12 种 `QualityIssueCategory` 的确定性映射：

| Issue | Action | Tool | Confidence |
|-------|--------|------|-----------|
| `artifact` | `apply-effect` | AddEffect(denoise) | 0.8 |
| `resolution` | `regenerate` | — | 0.7 |
| `color-distortion` | `color-correct` | SetColorCorrection | 0.7 |
| `prompt-mismatch` | `regenerate` | — | 0.6 |
| `script-mismatch` | `regenerate` | — | 0.6 |
| `style-drift` | `color-correct` | SetColorCorrection | 0.5 |
| `character-inconsistency` | `regenerate-ref` | IP-Adapter | 0.5 |
| `composition-poor` | `regenerate` | — | 0.5 |
| `motion-unnatural` | `regenerate` | — | 0.4 |
| `audio-noise` | `adjust-audio` | SetAudioProperties(denoise) | 0.8 |
| `audio-clipping` | `adjust-audio` | SetAudioProperties(normalize+limitPeak) | 0.9 |
| `loudness-off` | `adjust-audio` | SetAudioProperties(targetLufs:-14) | 0.9 |

**已扩展**（Phase 2 完成）：

| Category | Remediation | Tool | Confidence |
|----------|-------------|------|------------|
| `jitter` | `apply-effect` | AddEffect(stabilize) | 0.7 |
| `tearing` | `regenerate` | — | 0.5 |
| `stuttering` | `apply-effect` | AddEffect(frame-interpolation) | 0.6 |

##### 5c. mediaQAToolSet 升级 ✅

```typescript
// 已更新:
export const mediaQAToolSet: ToolGroup = {
  name: 'media-qa',
  description: '...（含音频评估能力说明）',
  tools: ['QualityCheck', 'QualityCheckConsistency'],
  alwaysActive: false,
  dependencies: ['ai-generation'],  // 移除 pipeline-control（可独立使用）
  icon: '📊',
};
```

##### Phase 5 实际文件变更

| 文件 | 操作 | 改动量 |
|------|------|--------|
| `agent/src/skill/builtins/quality-assessment.ts` | **新增** | qualityAssessmentSkill 定义 ~100 行 |
| `agent/src/skill/builtins/index.ts` | 扩展 | import + builtinSkills[] 注册 |
| `agent/src/skill/index.ts` | 扩展 | re-export qualityAssessmentSkill |
| `agent/src/skill/builtins/tool-skills.ts` | 改动 | mediaQAToolSet 描述优化 + 依赖简化 |
| `agent/src/skill/builtins/builtin-skills.test.ts` | 扩展 | +11 个测试（45 tests total） |

---

### 4.5 全量文件变更清单

```
Phase 1 (P0) — ✅ 已完成 (2026-04-01)
  改动: qa-types.ts, pipeline/index.ts, validation/index.ts, agent/package.json, qualityCheckTools.ts
  新增: remediation-planner.ts
  测试: remediation-planner.test.ts (17 tests), qualityCheckTools.test.ts (10 tests)

Phase 2 (P1) — ✅ 已完成 (2026-04-02)
  改动: qa-types.ts (+VideoTechnicalMetrics +3 video categories), pipeline/index.ts,
        qualityCheckTools.ts (+IFrameExtractor +VideoFrameEvaluator +video routing),
        remediation-planner.ts (+jitter/tearing/stuttering mappings),
        adapter.ts (+VideoPart), ai-sdk-adapter.ts (+video→file transform)
  测试: qualityCheckTools.test.ts (+8 video tests, 26 total)

Phase 3 (P1) — ✅ 已完成 (2026-04-02)
  改动: qa-types.ts (+AudioTechnicalMetrics), pipeline/index.ts, qualityCheckTools.ts (+AudioEvaluator +detectMediaType)
  测试: qualityCheckTools.test.ts (+8 audio tests, 35 total)

Phase 4 (P2) — ✅ 已完成 (2026-04-02)
  改动: creative-presets.ts, types.ts, pipeline-registry.ts, pipeline/index.ts,
        validation/index.ts, pipeline-bootstrap.ts, tool-skills.ts
  新增: consistency-evaluator.ts, consistencyCheckTools.ts, quality-gate.ts
  测试: consistency-evaluator.test.ts (11 tests), consistencyCheckTools.test.ts (5 tests)

Phase 5 (P2) — ✅ 已完成 (2026-04-02)
  已完成: quality-assessment.ts (Skill定义), index.ts/skill/index.ts (注册), tool-skills.ts (ToolSet升级)
  测试: builtin-skills.test.ts (+11 tests, 45 total)
  remediation-planner.ts 视频 category 扩展已在 Phase 2 中完成
```

### 4.6 依赖关系图

```
Phase 1 ✅ (类型 + 图片评估 + 修复映射) — 已完成
  │
  ├─→ Phase 2 ✅ (视频评估 + 帧提取 + 视频 categories) — 已完成
  │     │
  │     └─→ Phase 4 ✅ (跨素材一致性 + 批量评估) — 已完成
  │
  ├─→ Phase 3 ✅ (音频评估) — 已完成
  │
  └─→ Phase 5 ✅ (Skill + ToolSet + slash command) — 已完成
```

### 4.7 关键技术决策

| 决策点 | 选择 | 原因 |
|-------|------|------|
| 视频评估模型 | 任意 vision 模型（用户配置） | 帧提取方案，不依赖原生视频输入 |
| 图片评估模型 | 当前 LLM（Claude/GPT/Gemini 均可） | 能力趋同，跟随用户配置 |
| 帧级技术指标 | neko-engine（Rust SSIM/PSNR） | **已实现**，零新代码 |
| 音频技术指标 | neko-engine LUFS/SNR（已有）+ FFT（需新增） | LUFS 已有，FFT 需扩展 |
| 跨场景一致性 | CLIP embedding（已有）+ Vision LLM 双层 | CLIP 快筛已集成 |
| 角色一致性修复 | IP-Adapter via fal/DashScope/Kling | **3 个 adapter 已实现** |
| 修复执行 | 复用已有 ToolSet | 零新工具开发 |
| 执行模式 | 混合分层（§3） | ReAct 做判断 + Coordinator 做并行 + Pipeline opt-in 门控 |
| 批量评估 | Coordinator + quality-checker SubAgent | 并行评估 N 场景，结果聚合回 Agent |
| Pipeline 集成 | opt-in qualityGate（仅展示报告） | 不在 Pipeline 内做修复判断，保持 Agent 决策权 |
| VMAF 集成 | 暂不集成，SSIM/PSNR 已足够 | 减少复杂度，已有能力已够用 |

### 4.8 外部依赖

```
Phase 1 → ✅ 已完成 (2026-04-01)
Phase 2 → ✅ 已完成 (2026-04-02)（VideoFrameEvaluator + VideoPart + 3 video categories + RemediationPlanner 映射）
Phase 3 → ✅ 已完成 (2026-04-02)（AudioEvaluator + AudioTechnicalMetrics + IAudioAnalyzer）
Phase 4 → ✅ 已完成 (2026-04-02)（ConsistencyEvaluator + QualityCheckConsistency + qualityGate + quality-checker SubAgent）
Phase 5 → ✅ 已完成 (2026-04-02)（Skill + ToolSet + quality-check slash command）
```

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| ~~Gemini API 视频输入配额/成本高~~ | ~~Phase 2 成本~~ | ✅ 已缓解：采用帧提取方案（默认 4 帧），实际走 image part，任何 vision 模型均可 |
| 角色一致性检测准确度不足 | Phase 4 效果 | CLIP 快筛 + IP-Adapter 参考图闭环（3 adapter 已就绪） |
| ~~ai-sdk-adapter 视频消息接入复杂~~ | ~~Phase 2 工期~~ | ✅ 已完成：VideoPart → AI SDK FilePart 转换，不依赖固定模型 |
| LLM 结构化输出不稳定 | Phase 1 可靠性 | JSON Schema 验证 + retry（Agent 已有验证基础设施） |
| 音频评估模型生态不成熟 | Phase 3 质量 | Engine LUFS/SNR 技术层兜底 + Gemini 语义层补充 |
| Rust 侧 FFT/onset 开发周期 | Phase 3 工期 | 先纯 LLM 语义评估上线，技术指标渐进增强 |
| Coordinator SubAgent 上下文隔离导致跨场景判断缺失 | Phase 4 一致性评估 | 聚合结果回 Agent ReAct 层做跨场景判断，SubAgent 仅做单素材评估 |
| 三种模式交互复杂度 | 全阶段 | 严格分层：ReAct 决策 / Coordinator 并行 / Pipeline 门控，不互相侵入 |
