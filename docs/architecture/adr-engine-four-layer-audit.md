# ADR: Engine Four-Layer Audit — neko-engine 各域四层架构适配审计

## 状态

Proposed (2026-04-25)

## 关联 ADR

- 上层依赖:[adr-four-layer-contract.md](./adr-four-layer-contract.md)
- 横向配合:[adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md), [adr-xr-authoring-runtime-split.md](./adr-xr-authoring-runtime-split.md)
- 后续推进:[adr-engine-ai-native-foundation.md](./adr-engine-ai-native-foundation.md)
- 具体域审计:[adr-3d-editor-rendering-architecture.md](./adr-3d-editor-rendering-architecture.md)（runtime-scene 四层断裂的详细诊断与修复路径）

## 背景

四层架构契约([adr-four-layer-contract.md](./adr-four-layer-contract.md))定义了通用层结构,但**不是所有引擎模块都需要四层**。本 ADR 对 neko-engine 现有 11 个 crate 逐一审计,确定哪些必须四层化、哪些部分需要、哪些不需要,并识别这些四层化域**共用的基础设施**。

## 决策

### 1. 判定准则

```
  ┌─ 创作状态? ─┐  ┌─ AI 意图能映射到操作? ─┐  ┌─ 状态有时序演化? ─┐  ┌─ 输出可观察? ─┐
  │   有        │  │   能                     │  │   有 (snapshot/史) │  │   能(渲染/导出)│
  └──────┬──────┘  └────────────┬─────────────┘  └─────────┬──────────┘  └────────┬───────┘
         │                       │                          │                      │
         └────────────── 四个都满足 ⇒ 强需四层 ──────────────┴──────────────────────┘

  缺其中 1 个 ⇒ 部分需要(通常只需 L4+L3 或 L2+L1)
  缺 2 个以上 ⇒ 不需要四层,普通服务即可
```

反例:文档预览满足 0 个(无创作态、无意图映射、无演化、只读),不需要四层。

### 2. 已覆盖 vs 未覆盖盘点

| Crate | 状态 | 说明 |
|-------|------|------|
| `runtime-scene` | 已四层化（L3 完整；L2 TS 镜像断裂；L1 缺失；L4 3D 域未注册） | 3D ECS,IK + GPU Skinning；详见 [adr-3d-editor-rendering-architecture.md §1.4](./adr-3d-editor-rendering-architecture.md) |
| `runtime-puppet` | **四层完整度最高（参照标准）** | 2D 骨骼 ECS；L2 TS 类型完整（PuppetSnapshot/PuppetDelta/DeformedMesh）；L1 WebSocket /v1/puppets/stream 60fps delta 已实现；L3 双向 HTTP+WS；L4 AgentCapabilityProvider 已注册（PuppetGenerateParams/PuppetFromImage/PuppetAdjust） |
| `runtime-xr` | 已设计 | 提议新增,见 [adr-xr-authoring-runtime-split.md](./adr-xr-authoring-runtime-split.md) |
| (TS) `neko-sketch` | **独立自治，不适用四层框架** | 100% 自研 WebGL2，零 neko-engine 依赖；保存数据来自 gl.readPixels() 纹理回读；无 WYSIWYG 一致性问题（单一渲染器）；不需要 ECS，四层框架 L2 对其不适用 |
| **`runtime-media`** | **未四层化** | NLE 域,**最大的未覆盖域** |
| **`runtime-ml`** | **未四层化** | ML 推理(超分/降噪/CLIP/Whisper) |
| **`runtime-device`** | 部分需要 | 相机/麦克/MIDI/手柄 I/O |
| **`engine-kernel` 音频/特效** | **未四层化** | 实时混音 + GPU 特效图 |
| `engine-kernel` GPU 渲染 | 不需要 | 纯基础设施 |
| `host-api / http / napi / cli` | 不需要 | 传输/绑定层 |
| `engine-types` | 不需要 | DTO |

## 设计要点

### 强需四层的四个域

#### 1. `runtime-media` + Timeline NLE — **最高优先级**

旗舰域([neko-cut](../../packages/neko-cut/) 已经有 36 个 Tool 注册在 [NekoCutCapabilityProviderImpl](../../packages/neko-cut/packages/extension/src/agentCapabilityProvider.ts)):

```
L4 Intent     "做一段 30s 抖音风格,前 5s 慢镜头,带回忆滤镜"
              IntentDescriptor.domain = 'video-nle'

L3 Orchestr   ITimelineService + IExportService + IEffectGraphService
              Tools: AddClip / Trim / SetSpeed / ApplyEffect / Render
              Stage: Plan(分镜表) → Apply(填轨道) → Review(看预览帧)

L2 ECS Data   ⚠ 现状:Timeline 状态在 TS Zustand + Rust 镜像分裂
              建议:迁到 runtime-media 的 bevy_ecs World
                Components: ClipEntity / TrackEntity / EffectChain /
                            KeyframeCurve / TransitionEdge
                Systems:    timeline_compile / preview_tick / export_pipeline

L1 Feedback   render-fps-drop / export-progress / clip-missing /
              effect-gpu-oom / preview-stutter
              ⊕ 与 control-plane ADR 7 类信号合流
```

**核心债务**:Timeline 的 SSOT 不清晰,违反四层契约 Inv-2。按 CLAUDE.md "Rust engine is the single source of truth",应该把 Timeline 状态收回 ECS,TS 端只是投影。

#### 2. `runtime-ml` — AI 调 AI 的元编排

特殊域:**它的服务本身就是 AI 工具**(超分、降噪、CLIP、Whisper),但要让 LLM 编排这些 AI,需要四层:

```
L4 Intent     "把这段视频升到 4K,人脸要清晰,但不要 plastic"
              IntentDescriptor.domain = 'ml-pipeline'

L3 Orchestr   IModelRegistry + IInferenceScheduler
              决策:选模型(Real-ESRGAN vs SwinIR)、批大小、回退链
              Tools: Upscale / Denoise / Inpaint / Embed / Transcribe

L2 ECS Data   Components: ModelHandle / InferenceJob / TensorCache /
                          GpuMemoryBudget / ModelProvenance
              Resources: ProviderRegistry (Ollama/ONNX/远端)
              Systems: job_scheduler / cache_evict / fallback_chain

L1 Feedback   model-load-fail / oom / quality-below-threshold /
              latency-budget-exceeded / model-version-drift
              ⊕ 关键:把 "AI 评估 AI 输出质量" 作为反馈信号
```

**与 [adr-provider-expression-context.md](./adr-provider-expression-context.md) 联动**:ProviderCapabilityCard 三合一 markdown 在这里就是 L4 Intent 翻译手册(把"不要 plastic"翻译成具体 sampler/cfg)。

#### 3. 音频 / DAW 域 — 必须 Authoring/Runtime 拆分

现状音频代码散落在 `engine-kernel` + `runtime-device`(麦克)+ `runtime-media`(混流)。建议**抽出 `runtime-audio` 新 crate**,且**强制套用 [adr-xr-authoring-runtime-split.md](./adr-xr-authoring-runtime-split.md) 同款"Authoring/Runtime Plane"边界**:

```
                    Authoring Plane                Runtime Plane
                  (LLM 可以介入,秒级)        (硬实时,< 5ms 缓冲)
                  ─────────────────────         ─────────────────────
L4 Intent         "调出温暖的人声 EQ"                    —
L3 Orchestration  EffectChainPlanner                   —
L2 ECS Data       MixerGraph (设计时)         AudioGraph (运行时,lock-free)
L1 Feedback       clipping-history             ─► 实时 fallback (限幅)
                  cpu-load-trend               ─► 自动降级
                  user-perceived-latency       ─► 触发 LLM 重规划
```

**关键纪律**:VST/AU 插件运行在 Runtime Plane 的实时线程,**绝不**等 LLM。LLM 只在 Authoring Plane 改 EffectChain 模板,然后 hot-swap。

#### 4. 资产管理 + 语义搜索

CLAUDE.md 提到 "AssetManifest + Handler registry pattern" 但目前主要是注册/分发。要让 AI 真正用起来需要四层:

```
L4 Intent     "找张能配赛博朋克霓虹夜景的图"
              IntentDescriptor.domain = 'asset-search'

L3 Orchestr   IAssetIndex + IEmbeddingService + IAssetRouter
              Tools: SearchSemantic / SearchTag / TagAuto / Deduplicate
              复用 runtime-ml 的 CLIP / Whisper

L2 ECS Data   Components: AssetEntity / Embedding / TagSet /
                          UsageHistory / RefersTo (引用图)
              Resources: VectorIndex (HNSW)
              Systems: embedding_compute / refresh_index / dedup

L1 Feedback   embedding-stale / tag-conflict / asset-missing /
              search-irrelevant (人类 thumbs-down)
```

**与 [LSP ScriptIndex](./media-lsp.md) 同构**——都是"嵌入索引 + 语义搜索",可共享底层 `engine-vector-index` crate。

### 部分需要(L4+L3 但 L2/L1 弱)

#### `runtime-device` — I/O 层,不是创作域

```
✓ L4 Intent:        "用我的 USB 麦克录" — 有意图映射
✓ L3 Orchestration: 设备选择 / 格式协商 / 权限
✗ L2 ECS:           设备状态由 OS 管,ECS 只是壳
~ L1 Feedback:      disconnect / permission-denied 等告警
```

**结论**:`runtime-device` 不是独立的"四层域",而是**上游传感器**——它的输出 *进入* 其他域(camera → runtime-ml CLIP → runtime-media timeline)。

应该建模为"L1 Feedback 信号源"的补充:`device-state-changed` 作为**第 11 类反馈信号**(继 XR 三类之后)。

#### Marketplace / Plugins — 过程式

```
✓ L4 Intent:   "我需要个 LUT 包" — 一次性查询
✗ L3:           Tools 短(Search / Install / Update),无编排
✗ L2:           插件清单不是创作态
✓ L1 Feedback:  install-fail / signature-invalid / version-conflict
```

**结论**:用普通 Service + 一两个 Tool 即可。把它当作**能力发现源**而非创作域([adr-capability-protocol.md](./adr-capability-protocol.md) 的 "Market" 来源已经覆盖)。

### 共享基础设施(横切所有四层域的 7 个 crate)

把所有"需要四层"的域并排,会发现它们要重复用到几个底座组件:

```
                                              使用者
                                  scene puppet xr media ml audio asset
engine-ecs-core (Affine/Blend traits)  ✓    ✓   ✓   ✓        ✓
engine-vector-index (HNSW + 嵌入)               ✓        ✓     ✓
engine-feedback-bus (信号总线)         ✓    ✓   ✓   ✓   ✓   ✓   ✓
engine-artifact-store (.nk* 持久化)    ✓    ✓   ✓   ✓        ✓
engine-budget-tracker (GPU/CPU/mem)              ✓   ✓   ✓   ✓
engine-stage-registry (control plane)  ✓    ✓   ✓   ✓   ✓   ✓   ✓
engine-realtime-plane (Authoring/Run)         ✓             ✓
```

> **这 7 个 crate 必须先于任何 P0 域抽出**——否则每个域都会私下重新发明一份反馈总线、一份预算追踪、一份 stage registry,重复一次 [runtime-scene/animation_blend.rs](../../packages/neko-engine/crates/runtime-scene/src/animation_blend.rs) ⇆ [runtime-puppet/animation_blend.rs](../../packages/neko-engine/packages/runtime-puppet/src/animation_blend.rs) 的镜像债务。

## 后果

### 正面

- **聚焦**:明确"哪些不需要四层",避免过度工程化
- **复利**:7 个共享 crate 抽出后,后续新域接入成本骤降
- **可演化**:每个域独立四层化,无相互阻塞

### 负面 / 权衡

- **基础设施前置**:必须先做 7 个共享 crate,推迟具体功能
- **路径依赖**:做完基础设施后,域改造涉及大量旧代码迁移
- **多 crate 维护**:从 ~11 个 crate 增至 ~18 个

## 实施路径

```
P0 (立即):
  ┌────────────────────────────────────────────────────┐
  │ 7 个共享基础 crate                                 │
  │ ────────────────                                    │
  │ 必须先做,否则后续每个域重复发明                    │
  │ 工作量: 12-15 PR                                    │
  └────────────────────────────────────────────────────┘
  
P1 (S1 之后):
  ┌────────────────────────────────────────────────────┐
  │ runtime-media + Timeline NLE                       │
  │ ────────────────                                    │
  │ • 旗舰域、已有 36 Tool 但无 ECS SSOT、痛点最大     │
  │ • 与 [agent-media-architecture.md] 联动            │
  │ • 工作量: 6-8 PR                                    │
  └────────────────────────────────────────────────────┘

P1 并行:
  ┌────────────────────────────────────────────────────┐
  │ runtime-ml 元编排                                   │
  │ ────────────────                                    │
  │ • 现已有 ONNX 但无策略层(选模型/回退/批)         │
  │ • 与 adr-provider-expression-context 同路             │
  │ • 工作量: 4-5 PR                                    │
  └────────────────────────────────────────────────────┘

P1 并行:
  ┌────────────────────────────────────────────────────┐
  │ 资产语义搜索 (engine-vector-index 共享)             │
  │ ────────────────                                    │
  │ • LSP ScriptIndex 已经验证模式                      │
  │ • 工作量: 3-4 PR                                    │
  └────────────────────────────────────────────────────┘

P2 (中期):
  ┌────────────────────────────────────────────────────┐
  │ runtime-audio 拆分 + Authoring/Runtime Split       │
  │ ────────────────                                    │
  │ • 必须等 XR Plane 边界 ADR 先固化(共享同条原则)  │
  │ • 工作量: 8-10 PR(VST 桥接最重)                   │
  └────────────────────────────────────────────────────┘

不做四层化:
  • engine-kernel GPU/编解码:基础设施
  • host-api/http/napi/cli:传输层
  • runtime-device:升级为反馈信号源
  • Marketplace:复用 capability-protocol
  • 文档预览:无创作态
```

## 反模式清单

```
AP-1  "无判定标准就上四层"
      现象:把每个新模块都套四层
      代价:过度工程化,增加复杂度
      修法:用 4 项判定标准过滤

AP-2  "不抽共享就开始改"
      现象:急于改 runtime-media,自己造一份 feedback bus
      代价:与 runtime-scene 的 bus 不兼容,后续合并难
      修法:7 个共享 crate 先于任何 P1 域

AP-3  "I/O 层硬塞 ECS"
      现象:把 runtime-device 强行做成四层域
      代价:设备状态由 OS 管,ECS 是空壳
      修法:I/O 层升级为信号源,不是独立域
```
