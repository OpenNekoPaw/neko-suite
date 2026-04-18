# ADR: ControlNet 端到端链路修复与 E5 预处理器

## 状态

Proposed

> **2026-04-17 更新**：本 ADR 的 §E5 预处理器工作已被 [ai-video-reference-system.md §12](./ai-video-reference-system.md) 的统一 `ControlNetAssetProducer` 接口收编。本文件继续作为 E5 ONNX 实现细节与命令桥接层 G1-G4 修复的权威来源；新的 2D/3D/Puppet 三源 producer 架构、`ControlAsset` 数据形状标准化、Provider ControlNet 能力矩阵在 §12 定义。新模块应 import `@neko/shared` 的 `ControlAsset` / `ControlChannel` / `ControlNetAssetProducer`，不要从本 ADR 的内联 TS 片段抄。

## 关联

- [ai-video-reference-system.md](./ai-video-reference-system.md) — **统一 ControlNet producer 接口**（本 ADR E5 的上层抽象）+ 3D 源 producer 对偶实现
- [sketch-2d-lighting.md](./sketch-2d-lighting.md) — 法线贴图生成与 E5 normal 提取共享能力
- [agent-media-architecture.md](./agent-media-architecture.md) — GeneratedAsset 存储与资产索引
- [canvas-agent-integration.md](./canvas-agent-integration.md) — Canvas × Agent 生成流程

---

## 一、背景

ControlNet 和 IP-Adapter 的类型定义、后端适配器、前端 UI **均已就绪**，但命令桥接层存在断裂，导致端到端链路不通。

### 1.1 现状总览

```
                        ✅ 已实现                    ❌ 断裂                     ✅ 已实现
┌──────────────────┐  ┌───────────────────────┐  ┌───────────────────────────────┐
│  neko-canvas UI  │  │  命令桥接层            │  │  neko-agent/platform 适配器   │
│                  │  │                       │  │                               │
│  controlMode ────┼──┼─→ callAgent() ──×     │  │  ImageGenerationRequest       │
│  controlStrength │  │   (未转发)             │  │    .controlImageBase64  ✅    │
│  ipAdapterRefs   │  │                       │  │    .controlMode          ✅    │
│  negativePrompt  │  │  generateForNode ──×  │  │    .controlStrength      ✅    │
│                  │  │   (input 类型缺失)     │  │    .ipAdapterRefs        ✅    │
└──────────────────┘  └───────────────────────┘  └───────────────────────────────┘
                                                          │
                                                  ┌───────┴───────┐
                                                  │  3 个适配器    │
                                                  │  fal.ai    ✅ │
                                                  │  DashScope ✅ │
                                                  │  OpenAI    ✅ │
                                                  └───────────────┘
```

### 1.2 断裂点定位

| # | 位置 | 文件 | 问题 |
|---|------|------|------|
| G1 | `callAgent()` | `packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts:174–185` | `generationInput` 仅转发 prompt/style/ratio/shotScale/camera*/referenceRefs/count，**未包含** controlMode/controlStrength/ipAdapterRefs/negativePrompt |
| G2 | `generateForNode` input 类型 | `packages/neko-agent/packages/extension/src/index.ts:564–575` | 命令 input 类型无 ControlNet/IP-Adapter 字段 |
| G3 | `generateImage()` 调用 | `packages/neko-agent/packages/extension/src/index.ts:592–596` | 仅传 `{ prompt, ratio, count }`，丢失所有条件生成参数 |
| G4 | `ratio` vs `aspectRatio` 命名不一致 | Canvas 传 `ratio`，`ImageGenerationRequest` 用 `aspectRatio` | 字段名静默不匹配 |
| G5 | `controlImageBase64` 无来源 | 无预处理器生成 conditioning image | UI 只有 controlMode 下拉，无图像提取管线 |

---

## 二、决策

### 2.1 修复优先级

| 优先级 | 任务 | 工作量 |
|--------|------|--------|
| **P0** | 修复 G1–G4 命令桥接断点 | ~50 行 TS |
| **P1** | 实现 E5 预处理器（depth/normal/pose/canny） | Rust + TS 桥接 |
| **P2** | 自动预处理工作流（图片 → conditioning image → 生成） | TS 编排 |

### 2.2 ControlNet 归属包

ControlNet 不是单一子包的功能，而是**跨包协作链路**：

```
neko-types          类型定义层     ControlMode / IPAdapterReference / ModelCapability
                                  ✅ 已有，无需改动

neko-canvas/webview  UI 层         GenerationPromptPanel controlMode/strength UI
                                  ✅ 已有，无需改动

neko-canvas/ext     命令发送层     batchGenerationScheduler → callAgent()
                                  ❌ G1: 需扩展 generationInput

neko-agent/ext      命令接收层     neko.agent.generateForNode handler
                                  ❌ G2+G3: 需扩展 input 类型 + 转发参数

neko-agent/platform  适配器层      fal / DashScope / OpenAI-compat adapters
                                  ✅ 已有，无需改动

neko-engine/ml      预处理层       depth/normal/pose/canny ONNX 提取
                                  ❌ G5: E5 新增模块
```

### 2.3 预处理器归属：neko-engine/runtime-ml

理由：
1. ONNX 推理基础设施已就绪（`ModelRegistry` + LRU 淘汰 + CoreML/CUDA EP）
2. 与现有 upscale/denoise/clip/whisper 同构
3. Rust 侧 GPU 推理性能远优于 WebGL/WASM
4. depth/normal 提取结果同时服务 ControlNet（neko-agent）和光照系统（neko-sketch）

---

## 三、P0 — 命令桥接修复

### 3.1 扩展 `GenerationParams`

```typescript
// packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts

interface GenerationParams {
  prompt: string;
  style?: string;
  ratio?: string;
  shotScale?: string;
  cameraMovement?: string;
  cameraAngle?: string;
  referenceRefs?: string[];
  count?: number;
  // --- 新增 ControlNet / IP-Adapter 字段 ---
  controlMode?: string;
  controlStrength?: number;
  controlImageBase64?: string;
  ipAdapterRefs?: Array<{ imageBase64: string; strength?: number; mode?: string }>;
  negativePrompt?: string;
  // --- 新增 inpaint 字段 ---
  maskBase64?: string;
  inpaintStrength?: number;
  [key: string]: unknown;
}
```

### 3.2 修复 `callAgent()` 转发

```typescript
// batchGenerationScheduler.ts — callAgent() 修改

const generationInput = {
  nodeId: task.nodeId,
  cellId: task.cellId,
  prompt: task.params.prompt,
  style: task.params.style,
  ratio: task.params.ratio,
  shotScale: task.params.shotScale,
  cameraMovement: task.params.cameraMovement,
  cameraAngle: task.params.cameraAngle,
  referenceRefs: task.params.referenceRefs,
  count: task.params.count ?? 1,
  // --- 新增透传 ---
  controlMode: task.params.controlMode,
  controlStrength: task.params.controlStrength,
  controlImageBase64: task.params.controlImageBase64,
  ipAdapterRefs: task.params.ipAdapterRefs,
  negativePrompt: task.params.negativePrompt,
  maskBase64: task.params.maskBase64,
  inpaintStrength: task.params.inpaintStrength,
};
```

### 3.3 扩展 `generateForNode` 命令 input

```typescript
// packages/neko-agent/packages/extension/src/index.ts

async (input: {
  nodeId: string;
  cellId?: string;
  prompt: string;
  style?: string;
  ratio?: string;
  shotScale?: string;
  cameraMovement?: string;
  cameraAngle?: string;
  referenceRefs?: string[];
  count?: number;
  // --- 新增 ---
  controlMode?: string;
  controlStrength?: number;
  controlImageBase64?: string;
  ipAdapterRefs?: Array<{ imageBase64: string; strength?: number; mode?: string }>;
  negativePrompt?: string;
  maskBase64?: string;
  inpaintStrength?: number;
})
```

### 3.4 修复 `generateImage()` 调用

```typescript
// packages/neko-agent/packages/extension/src/index.ts — 修改调用处

const task = await platform.media.generateImage({
  prompt: parts.join(', '),
  aspectRatio: input.ratio ?? '16:9',        // G4: ratio → aspectRatio
  count: input.count ?? 1,
  negativePrompt: input.negativePrompt,
  // ControlNet
  controlImageBase64: input.controlImageBase64,
  controlMode: input.controlMode as ControlMode | undefined,
  controlStrength: input.controlStrength,
  // IP-Adapter
  ipAdapterRefs: input.ipAdapterRefs,
  // Inpaint
  maskBase64: input.maskBase64,
  inpaintStrength: input.inpaintStrength,
});
```

### 3.5 关键文件

| 文件 | 修改内容 |
|------|----------|
| `packages/neko-canvas/packages/extension/src/services/batchGenerationScheduler.ts` | `GenerationParams` 扩展 + `callAgent()` 透传 |
| `packages/neko-agent/packages/extension/src/index.ts` | `generateForNode` input 类型扩展 + `generateImage()` 参数补全 + `ratio→aspectRatio` 修复 |

---

## 四、P1 — E5 预处理器（neko-engine/runtime-ml）

### 4.1 新增模块

```
packages/neko-engine/packages/runtime-ml/src/ml/
  ├── mod.rs          ← 新增 pub mod perception;
  ├── perception/
  │   ├── mod.rs      ← PerceptionTask enum + 公共入口
  │   ├── depth.rs    ← MiDaS / Depth-Anything ONNX 深度估计
  │   ├── normal.rs   ← 深度图 → 法线贴图（Sobel / 学习模型）
  │   ├── pose.rs     ← OpenPose / DWPose ONNX 姿态估计
  │   └── canny.rs    ← Canny 边缘检测（纯 Rust 算法，不需要 ONNX）
```

### 4.2 IMlService 扩展

```rust
// service_trait.rs — 新增方法

pub trait IMlService: Send + Sync {
    // ... 现有方法 ...

    /// 感知提取：从输入图像提取 conditioning map
    fn extract_perception(
        &self,
        model: &str,
        input: &str,          // 输入图片路径
        output: &str,         // 输出图片路径
        task: PerceptionTask, // depth | normal | pose | canny | lineart | segment
        params: &serde_json::Value,
    ) -> Result<()>;
}
```

### 4.3 PerceptionTask 类型

```rust
// ml/perception/mod.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PerceptionTask {
    Depth,          // MiDaS / Depth-Anything → 灰度深度图
    Normal,         // 深度图 → 法线贴图 (RGB encoded)
    Pose,           // DWPose / OpenPose → 骨骼关键点图
    Canny,          // Canny 边缘检测 → 二值边缘图
    Lineart,        // 线稿提取
    Segment,        // 语义分割
    Softedge,       // HED / PIDI 柔边
}
```

### 4.4 推荐模型

| 任务 | 模型 | 格式 | 大小 | 备注 |
|------|------|------|------|------|
| Depth | Depth-Anything-V2-Small | ONNX | ~25MB | 精度/速度平衡好 |
| Normal | 从 depth 推断（Sobel） | 无需模型 | — | 纯算法，P0 可用 |
| Normal | DSINE | ONNX | ~80MB | 学习模型，P2 精度更高 |
| Pose | DWPose | ONNX | ~45MB | 全身 + 手部关键点 |
| Canny | 纯 Rust 实现 | 无需模型 | — | Gaussian blur + Sobel + NMS + 双阈值 |
| Lineart | Lineart Anime | ONNX | ~20MB | 动画线稿 |

### 4.5 HTTP API（host-http）

```
POST /api/ml/perception
Content-Type: application/json

{
  "model": "depth-anything-v2-small",
  "input": "/path/to/image.png",
  "output": "/path/to/depth.png",
  "task": "depth",
  "params": {}
}
```

### 4.6 EngineClient 扩展（neko-client）

```typescript
// packages/neko-client/src/engineClient.ts — 新增方法

interface PerceptionRequest {
  model: string;
  input: string;
  output: string;
  task: 'depth' | 'normal' | 'pose' | 'canny' | 'lineart' | 'segment' | 'softedge';
  params?: Record<string, unknown>;
}

interface PerceptionResult {
  outputPath: string;
  width: number;
  height: number;
}

class EngineClient {
  // ... 现有方法 ...
  async extractPerception(request: PerceptionRequest): Promise<PerceptionResult>;
}
```

### 4.7 与光照系统共享

```
E5 预处理器输出:

  depth 任务 → 灰度深度图
    ├── ControlNet depth conditioning  (neko-agent → 生成)
    └── 灰度 → 法线 Sobel 推断        (neko-sketch → 光照)

  normal 任务 → RGB 法线贴图
    ├── ControlNet normal conditioning (neko-agent → 生成)
    └── 直接用作法线贴图               (neko-sketch → 光照)

  pose 任务 → 骨骼关键点图
    └── ControlNet pose conditioning   (neko-agent → 生成)

  canny 任务 → 二值边缘图
    └── ControlNet canny conditioning  (neko-agent → 生成)
```

---

## 五、P2 — 自动预处理工作流

### 5.1 Canvas 侧自动提取

当用户在 Canvas 中选择 ControlNet 模式时，自动从现有图像提取 conditioning map：

```
用户操作:
  1. 选中 ShotNode（已有生成图）
  2. 右键 → "ControlNet 编辑"
  3. 选择 controlMode = "depth"

自动流程:
  1. 读取 ShotNode 当前图像
  2. 调用 EngineClient.extractPerception({ task: 'depth', ... })
  3. 获得深度图 → 自动填入 controlImageBase64
  4. 用户调整 prompt + strength → 提交生成
```

### 5.2 Sketch 侧法线提取

```
用户操作:
  1. 选中图层
  2. 工具栏 → "生成法线贴图"

自动流程:
  1. 导出图层像素数据
  2. 调用 EngineClient.extractPerception({ task: 'normal', ... })
  3. 获得法线贴图 → 绑定到 LayerData.normalTexture
```

### 5.3 关键文件

| 文件 | 修改内容 |
|------|----------|
| `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts` | 新增 `extractControlImage` 消息处理，调用 EngineClient |
| `packages/neko-canvas/packages/webview/src/components/panels/GenerationPromptPanel.tsx` | 选择 controlMode 时自动触发预处理 |
| `packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts` | 新增 `extractNormalMap` 消息处理 |

---

## 六、实施顺序

```
P0 (命令桥接修复) ←── 最小改动，~50 行，立即可用
│
├── G1: batchGenerationScheduler 透传 ControlNet 字段
├── G2: generateForNode input 类型扩展
├── G3: generateImage() 参数补全
└── G4: ratio → aspectRatio 命名修复
│
P1 (E5 预处理器) ←── Rust + TS，中等工作量
│
├── E5.1: perception/canny.rs（纯 Rust，无 ONNX）
├── E5.2: perception/depth.rs（Depth-Anything ONNX）
├── E5.3: perception/normal.rs（Sobel 算法 + 可选 DSINE）
├── E5.4: perception/pose.rs（DWPose ONNX）
├── E5.5: host-http API + EngineClient 桥接
└── E5.6: neko-sketch 法线提取集成（与 sketch-2d-lighting P1 合并）
│
P2 (自动预处理工作流)
│
├── P2.1: Canvas 选择 controlMode 时自动提取 conditioning image
├── P2.2: Sketch 一键生成法线贴图
└── P2.3: lineart / segment / softedge 补充
```

---

## 七、后果与风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| P0 修复后无 controlImageBase64 来源 | 低 | UI 可手动上传 conditioning image；P1 预处理器解决自动提取 |
| ONNX 模型体积增加安装包大小 | 中 | 模型按需下载（onPostInstall 或首次使用时），不打入扩展包 |
| Depth-Anything 在 CPU 上推理慢 | 中 | CoreML EP（macOS）加速；提供 Small/Base 模型可选 |
| canny 纯 Rust 精度可能不如 OpenCV | 低 | Canny 算法成熟，可参考 imageproc crate 实现 |
| `ratio` vs `aspectRatio` 修改可能影响现有调用方 | 低 | 搜索全部调用点统一修复 |

---

## 八、结论

ControlNet 支持**不需要新增架构决策**——类型、适配器、UI 均已就绪。核心工作是：

1. **P0**（~50 行）：打通 `batchGenerationScheduler` → `generateForNode` → `generateImage()` 的参数透传，修复 `ratio`/`aspectRatio` 命名不一致
2. **P1**（中等）：在 `neko-engine/runtime-ml` 新增 perception 模块，提供 depth/normal/pose/canny 本地提取，同时服务 ControlNet conditioning 和 neko-sketch 光照法线贴图
3. **P2**（增强）：Canvas/Sketch 侧自动预处理工作流，用户无需手动提供 conditioning image
