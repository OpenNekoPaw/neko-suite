# AI 媒体编辑能力分析

> 日期：2026-03-31
> 状态：分析完成，待实施
> 范围：neko-cut / neko-canvas / neko-sketch / neko-agent / neko-engine
> 关联：[ai-capabilities.md](./ai-capabilities.md) · [ai-capabilities-roadmap.md](./ai-capabilities-roadmap.md) · [model-runtime.md](./model-runtime.md) · [2d-capability-analysis.md](./2d-capability-analysis.md)

---

## 目录

1. [问题定义](#1-问题定义)
2. [当前能力评估](#2-当前能力评估)
3. [2026 年模型能力矩阵](#3-2026-年模型能力矩阵)
4. [云端 vs 本地决策](#4-云端-vs-本地决策)
5. [UI 集成策略](#5-ui-集成策略)
6. [架构方案](#6-架构方案)
7. [开发计划](#7-开发计划)
8. [Adapter 扩展规划](#8-adapter-扩展规划)

---

## 1. 问题定义

### 1.1 核心需求

用户在 AI 生成图片/视频后，需要对已有结果做精确编辑：

| 编辑需求 | 说明 | 典型场景 |
|---------|------|---------|
| **修改机位** | 改变镜头景别、运镜方式 | 近景→远景、固定→推拉 |
| **修改打光** | 改变光源方向、强度、色温 | 日光→暖光、正面→侧光 |
| **修改视角** | 改变相机位置（yaw/pitch/roll） | 正面→侧面、俯拍→仰拍 |
| **修改姿态** | 改变人物动作、表情 | 站立→坐下、微笑→严肃 |
| **局部修改** | 修改画面局部区域 | 换背景、去除物体、添加元素 |
| **保持一致性** | 修改后保持角色/风格一致 | 同角色多视角、风格统一 |

### 1.2 当前痛点

当前系统的"修改"本质上是"重新生成"——修改 prompt 后从零生成全新图片，不保留已有结果的任何空间信息。

```
当前：prompt 级控制（不精确、不保留）
理想：参数化精确控制（保留结构、精确修改）
```

---

## 2. 当前能力评估

### 2.1 neko-canvas

| 能力 | 状态 | 说明 |
|------|------|------|
| 影视级镜头元数据 | ✅ | ShotScale(8) + CameraMovement(8) + CameraAngle(5) |
| GenerationPromptPanel | ✅ | 景别/运镜/角度/风格/比例选择 UI |
| BatchGenerationScheduler | ✅ | 2 并发 + 指数退避 + 取消 |
| 节点图工作流 | ✅ | ModelNode(LoRA/ControlNet/VAE) → ShotNode 连接 |
| GalleryNode 多视图 | ✅ | 预设 + IP-Adapter referenceRefs |
| generationHistory | ✅ | 多版本候选 |
| **ControlNet 参数传递** | ❌ | ModelNode 定义了 controlnet 类型但生成请求无控制图参数 |
| **精确打光控制** | ❌ | 无 lighting 相关参数 |
| **img2img/inpaint 入口** | ❌ | ShotNode 只有"重新生成"，无"编辑已有" |
| **canvas↔sketch 联动** | ❌ | 无法将 ShotNode 图片发送到 sketch 编辑后回写 |

### 2.2 neko-sketch

| 能力 | 状态 | 说明 |
|------|------|------|
| SketchGenerate | ✅ | text→image → 导入图层 |
| SketchInpaint | ✅ | 选区 mask + AI 局部重绘 |
| SketchStyleTransfer | ✅ | 7 种风格预设 img2img |
| SketchAutoLayer | ✅ | AI 分层（线稿/色/阴影/高光） |
| Selection mask 导出 | ✅ | base64 grayscale PNG |
| **ControlNet pipeline** | ❌ | 无 depth/pose/canny 引导 |
| **精确打光** | ❌ | 无 IC-Light 集成 |
| **视角变换** | ❌ | 无 novel view synthesis |

### 2.3 neko-cut

| 能力 | 状态 | 说明 |
|------|------|------|
| PropertyPanel 属性编辑 | ✅ | 变换/音频/速度/颜色校正/特效/遮罩/转场 |
| AIActionsButton | ✅ UI | PropertyPanel 顶部 ✨ 按钮，已有下拉菜单 |
| 右键 AI Operations 子菜单 | ✅ UI | 12 个 action 定义（enhance/style-transfer/upscale/denoise/color-grade/background-remove/smart-crop 等） |
| aiActionSlice 状态管理 | ✅ | executeAIAction → sendAIAction → postMessage 完整链路 |
| GenerateVideoForClip | ✅ | 通过 neko-agent 工具，支持 text-to-video / image-to-video |
| **AI action 后端接通** | ❌ | executeAIAction 发消息但 Extension 无处理逻辑 |
| **指令编辑 UI** | ❌ | 无自然语言编辑输入框 |
| **Cut↔Sketch 联动** | ❌ | 无法将帧发送到 sketch 编辑后回写 |
| **Cut↔Canvas 联动** | ❌ | 无法跳转到关联 ShotNode |

### 2.4 neko-agent 媒体生成

| 能力 | 状态 | 说明 |
|------|------|------|
| 10+ 提供商 | ✅ | OpenAI/Google/Kling/Runway/Luma/Suno/fal.ai/Replicate 等 |
| text-to-image | ✅ | |
| image-to-image | ✅ | referenceImageUrl/Base64 |
| inpaint | ✅ | maskBase64 + inpaintStrength |
| text/image-to-video | ✅ | 7 种 MediaGenerationType |
| MediaRoutingManager | ✅ | 按 type 路由到配置的 provider/model |
| **ControlNet 参数** | ❌ | ImageGenerationRequest 无 controlImage/controlMode |
| **IP-Adapter 参数** | ❌ | 无 ipAdapterImage 字段 |
| **视频运镜参数** | ❌ | CameraMovement 仅在 canvas 层，不传递到 API |
| **视频编辑参数** | ❌ | 无 sourceVideo + editInstruction |
| **首尾帧控制** | ❌ | VideoGenerationRequest 无 startFrame/endFrame |

### 2.5 neko-engine

| 能力 | 状态 | 说明 |
|------|------|------|
| ONNX Runtime | ✅ | ort 1.20.1，CUDA/Metal/DirectML |
| ModelRegistry | ✅ | lazy load + LRU 卸载 |
| upscale.rs | ✅ | Real-ESRGAN 推理 |
| denoise.rs | ✅ | 去噪推理 |
| clip.rs | ✅ | CLIP 语义评分 |
| whisper.rs | ✅ | STT 转录 |
| **depth estimation** | ❌ | 无 Depth Anything V2 |
| **normal map** | ❌ | 无法线图估计 |
| **pose estimation** | ❌ | 无姿态检测 |

---

## 3. 2026 年模型能力矩阵

### 3.1 图像模型

| 能力 | Qwen-Image 2.0 | FLUX (fal.ai) | Replicate | DALL-E 3 |
|------|:---:|:---:|:---:|:---:|
| Text-to-Image | ✅ 2K 原生 | ✅ | ✅ | ✅ |
| Image-to-Image | ✅ | ✅ | ✅ | ✅ |
| Inpaint | ✅ 原生 | ✅ ControlNet Union | ✅ | ✅ |
| ControlNet Depth | ✅ **原生** | ✅ Flux-Depth-Pro | ✅ | ❌ |
| ControlNet Canny | ✅ **原生** | ✅ | ✅ | ❌ |
| ControlNet Normal | ❌ | ⚠️ SD1.5 级 | ✅ | ❌ |
| ControlNet Pose | ❌ | ✅ | ✅ | ❌ |
| IP-Adapter | ❌ | ✅ Flux-General | ✅ | ❌ |
| IC-Light 重打光 | ❌ | ⚠️ LoRA 级 | ⚠️ 社区 | ❌ |
| 指令编辑 | ✅ **原生** | ❌ | ❌ | ❌ |
| 姿态编辑 | ✅ **原生** | ✅ ControlNet | ✅ | ❌ |
| 开源 | ✅ Apache 2.0 | ⚠️ dev | ⚠️ 部分 | ❌ |
| API 可用 | ⚠️ 邀请测试 | ✅ 即用 | ✅ 即用 | ✅ |

**关键洞察**：
- **Qwen-Image 2.0**：唯一原生集成 depth/canny/inpaint + 指令编辑的模型（非外挂 ControlNet），7B 参数，Apache 2.0，可本地部署
- **fal.ai**：最完整的 ControlNet 云端 API 生态（Flux + ControlNet + LoRA + IP-Adapter）
- **Replicate**：社区模型最丰富（depth/normal/pose/canny 全覆盖）

### 3.2 视频模型

| 能力 | Kling 3.0 | Seedance 2.0 | ~~Sora 2~~ | Veo 3.1 | Wan 2.7 |
|------|:---:|:---:|:---:|:---:|:---:|
| Text-to-Video | ✅ 4K HDR | ✅ 1080p | ⚠️ **将下线** | ✅ 4K | ✅ 4K |
| Image-to-Video | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| 精确运镜 | ✅ pan/tilt/dolly/crane | ✅ 自主镜头规划 | ⚠️ prompt 级 | ✅ 首尾帧插值 | ✅ Camera Code |
| Motion Control | ✅ 2.6 动作迁移 | ✅ 参考视频 | ❌ | ⚠️ | ⚠️ |
| Motion Brush | ✅ | ❌ | ❌ | ❌ | ❌ |
| 原生音频 | ⚠️ 3.0 | ✅ 对话+音效 | ✅ | ✅ 50+ 语言 | ✅ |
| 多镜头 | ⚠️ | ✅ 单次多镜 | ❌ | ⚠️ | ⚠️ |
| 参考图一致性 | ⚠️ | ✅ 12 张参考 | ✅ Cameo | ✅ 3 张参考 | ✅ 9 宫格 |
| 视频编辑 | ⚠️ 有限 | ✅ 替换/增删 | ⚠️ edits | ⚠️ | ✅ 指令编辑 |
| 首尾帧控制 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 最长时长 | 10s+ 拼接 | 15s | 20s | 8s | 20-30s |
| API 可用 | ✅ | ⚠️ 受限 | ❌ 2026-09 下线 | ✅ Vertex AI | ✅ DashScope |
| 开源 | ❌ | ❌ | ❌ | ❌ | ⚠️ 2.1/2.2 开源 |

**关键洞察**：
- **⚠️ Sora 2 将于 2026-09-24 完全关闭**，必须规划替代方案
- **Kling 3.0**：统一多模态引擎（文本+图像+视频+音频），Motion Control 最成熟
- **Seedance 2.0**：Artificial Analysis 排名第一（Elo 1269），但 API 因版权纠纷受限
- **Veo 3.1**：Google 4K + 原生音频 + 首尾帧控制，但视频编辑能力弱
- **Wan 2.7**：阿里系，4K + 指令编辑 + Camera Code，前代开源可本地跑

### 3.3 2026 年技术趋势对方案的影响

```
2025 年思路：                          2026 年现实：
提取 depth → ControlNet 重生成         模型原生支持运镜/编辑/多条件控制
外挂 ControlNet adapter               重要性降低
需要 ComfyUI pipeline                  大模型 API 直接接受编辑指令
```

| 需求 | 2025 方案 | 2026 方案 | 变化 |
|------|----------|----------|------|
| 修改机位/运镜 | depth → ControlNet | Kling Motion Control / Wan Camera Code | 模型原生支持 |
| 修改视角 | Zero123++ 本地 | Seedance 多参考 + 指令 / fal.ai depth | 云端质量更高 |
| 修改打光 | IC-Light 本地 | Qwen-Image 指令编辑 / Wan 帧控制 | 原生支持 |
| 修改姿态 | OpenPose → ControlNet | Kling Motion Control / Qwen-Image pose | 原生支持 |
| 保持一致性 | IP-Adapter ComfyUI | Seedance 12参考 / Veo 3参考 / fal.ai IP | API 原生支持 |
| 局部修改 | ComfyUI inpaint | Qwen-Image / Seedance 视频编辑 / fal.ai | API 直接调用 |

---

## 4. 云端 vs 本地决策

### 4.1 逐能力分析

| 能力 | 云端 API | 本地模型 | **推荐** | 理由 |
|------|---------|---------|---------|------|
| 深度估计 | ❌ 无独立 API | ✅ Depth Anything V2 (~30MB) | **本地** | <1s、免费、调用频繁 |
| 法线图 | ❌ 无独立 API | ✅ DSINE/Omnidata (~50MB) | **本地** | 同上 |
| 姿态检测 | ❌ 无独立 API | ✅ DWPose (~25MB) | **本地** | 同上 |
| 边缘检测 | ❌ | ✅ 纯算法 Canny/HED | **本地** | 零模型、纯算法 |
| ControlNet 生成 | ✅ fal.ai/Replicate | ✅ ComfyUI | **云端优先** | 质量高、无 GPU 要求 |
| IC-Light 重打光 | ⚠️ fal.ai LoRA 级 | ✅ ComfyUI | **混合** | 简单→云端，精细→本地 |
| 视角变换 | ⚠️ prompt 级 | ✅ Zero123++/SV3D | **混合** | 精确变换需本地 |
| Inpaint | ✅ 多 API 支持 | ✅ ComfyUI | **云端优先** | 已有完整管线 |
| 视频运镜 | ✅ Kling/Wan 原生 | ❌ | **云端** | 模型原生支持 |
| 视频编辑 | ✅ Seedance/Wan | ❌ | **云端** | 模型原生支持 |
| 角色一致性 | ✅ Seedance/Veo/fal | ✅ ComfyUI IP-Adapter | **混合** | 简单→云端，精确→ComfyUI |

### 4.2 三层架构（与 model-runtime.md ADR 一致）

```
Layer 1: neko-engine ONNX 原生（零外部依赖，用户无感）
├── Depth Anything V2  (~30MB)  → 深度图
├── DSINE Normal Map   (~50MB)  → 法线图
├── DWPose/RTMPose     (~25MB)  → 人体姿态
├── Canny/HED          (算法)   → 边缘检测
├── Real-ESRGAN        (~65MB)  → 超分辨率（已有）
└── CLIP               (~340MB) → 语义评分（已有）

特点：编译进 Engine，lazy load + LRU 卸载
价值：实时预览(<1s)、离线可用、为云端 API 预提取控制图

Layer 2: 云端 API（已有基础设施，扩展参数即可）
├── fal.ai      → ControlNet + IP-Adapter + inpaint 全家桶
├── Replicate   → 社区模型 depth/normal/pose
├── Qwen-Image  → 原生 depth/canny/inpaint/指令编辑
├── Kling 3.0   → Motion Control + 多模态视频
├── Wan 2.7     → Camera Code + 指令编辑 + 4K
└── Veo 3.1     → 首尾帧 + 参考图

Layer 3: ComfyUI MCP 桥接（高级用户可选）
├── 多 ControlNet 组合（depth + pose + canny 同时）
├── IC-Light 精细重打光
├── IP-Adapter 精确角色一致性
├── AnimateDiff 图→视频 + 运镜
├── Qwen-Image / Wan 本地部署（Apache 2.0）
└── 完全离线 / 隐私场景
```

### 4.3 成本/质量/延迟对比

| 维度 | 云端 API | Engine ONNX 本地 | ComfyUI 本地 |
|------|---------|-----------------|-------------|
| 生成质量 | ⭐⭐⭐⭐⭐ | N/A（感知类） | ⭐⭐⭐⭐ |
| 延迟 | 3-30s | <1s | 5-60s |
| 成本 | $0.02-0.5/次 | 免费 | 免费 |
| GPU 需求 | 无 | 无（CPU 够用） | 8GB+ VRAM |
| 用户门槛 | API Key | 零（内置） | 安装 ComfyUI |
| 离线可用 | ❌ | ✅ | ✅ |
| 精确控制 | ⭐⭐-⭐⭐⭐ | N/A | ⭐⭐⭐⭐⭐ |

---

## 5. UI 集成策略

### 5.1 核心决策：按创作阶段分配职责

AI 编辑能力不集中在单个 UI 表面，而是按用户所在阶段分配到最自然的交互位置。

```
用户创作旅程：

  故事/剧本 → 分镜规划 → 生成图片 → 生成视频 → 时间线剪辑 → 导出
              neko-canvas  canvas+agent  canvas→cut   neko-cut

  "这个镜头换个角度"   "这张图打光不对"   "这段视频运镜换一下"   "这个片段需要调色"
       ↓                    ↓                 ↓                  ↓
     Canvas              Sketch             Cut                 Cut
```

### 5.2 各 UI 表面职责

| UI 表面 | 阶段 | AI 编辑职责 | 理由 |
|---------|------|-----------|------|
| **neko-cut** | 后期制作 | **片段级 AI 编辑（主阵地）**：重打光、重运镜、增强、风格迁移、智能裁剪 | 用户在时间线上停留最久，90% 的"修改"发现于此 |
| **neko-canvas** | 前期规划 | 镜头级重生成：改景别、改角度、改运镜、改风格 | ShotNode 已有全部镜头元数据 |
| **neko-sketch** | 像素级编辑 | inpaint、手绘修正、风格迁移、AI 分层 | 需要精细像素控制时进入 |
| **neko-agent** | 编排层 | 跨扩展批量操作、对话式修改 | "把所有室内场景打光调暖" → agent 批量编排 |

### 5.3 neko-cut 为主阵地的理由

**1. 用户停留时间最长**

```
Canvas：规划阶段，出图后离开
Sketch：临时打开修改，完成后关闭
Cut：从粗剪到精剪到导出，用户一直在这里
```

**2. 已有 AI 框架但未接通**

neko-cut 已定义完整的 AI 操作 UI 入口，但执行链未接通到 AI 服务：

```
✅ 已有 UI                              ❌ 未接通
├── AIActionsButton (PropertyPanel)      ├── executeAIAction → 发消息但无处理
├── 右键菜单 AI Operations 子菜单        ├── 12 个 action 定义但未实现
│   ├── ai-enhance                       │   （ai-enhance / ai-style-transfer /
│   ├── ai-style-transfer                │    ai-upscale / ai-denoise /
│   ├── ai-upscale                       │    ai-color-grade / ai-background-remove /
│   ├── ai-denoise                       │    ai-smart-crop / ai-speech-to-text /
│   ├── ai-color-grade                   │    ai-generate-subtitles / ai-auto-edit /
│   ├── ai-background-remove             │    ai-match-music / ai-remove-silence）
│   └── ai-smart-crop                    │
├── aiActionSlice.ts 状态管理            └── 仅 GenerateVideoForClip 通过 agent 可用
└── 时间线右键 AI Operations
```

UI 框架齐全，只差把 `executeAIAction` 接到 `MediaGenerationService`。

**3. Cut 阶段的编辑需求与 Canvas 不同**

| 场景 | Canvas（规划阶段） | Cut（制作阶段） |
|------|----------|---------|
| 改运镜 | "这镜头改成推拉" → 重生成 | "这段视频运镜太平" → video-to-video |
| 改打光 | "改成暖色调" → 重生成图片 | "和前一镜色调不统一" → AI 调色/重打光 |
| 改视角 | "换个低角度" → 重生成 | "这角度和前后不接" → 微调或重生成 |
| 局部修改 | "角色表情不对" → 发到 sketch | "画面有瑕疵" → 帧级 inpaint 或发到 sketch |
| 增强 | 不需要 | "分辨率不够" → upscale / denoise |

Cut 阶段更偏向"基于已有结果微调"，Canvas 更偏向"从头重生成"。

### 5.4 交互设计

#### neko-cut PropertyPanel AI 编辑区

```
┌─ 属性面板 ─────────────────────────┐
│ ▶ 变换                             │
│   位置 X [___] Y [___]             │
│   缩放 [___] 旋转 [___]           │
│                                     │
│ ▶ AI 编辑  ✨                       │  ← 新增 section
│ ┌─────────────────────────────────┐ │
│ │ [💡打光] [🎥运镜] [🎨风格]      │ │  ← 快捷按钮行
│ │ [📐增强] [✂️裁剪] [🖼️去背]     │ │
│ ├─────────────────────────────────┤ │
│ │ 编辑指令：                       │ │  ← 指令编辑输入
│ │ [将打光改为暖色夕阳____________] │ │
│ │              [应用 ▶]            │ │
│ ├─────────────────────────────────┤ │
│ │ ✏️ 在 Sketch 中精细编辑          │ │  ← 联动入口
│ │ 🎬 在 Canvas 中重新规划          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ▶ 颜色校正                         │
│ ▶ 特效                             │
└─────────────────────────────────────┘
```

**快捷按钮映射到 AI action**：

| 按钮 | aiActionSlice action | 后端调用 | 适用 Provider |
|------|---------------------|---------|---------------|
| 打光 | `ai-relight` (新增) | `editInstruction: "change lighting..."` | Qwen-Image 指令编辑 |
| 运镜 | `ai-regen-camera` (新增) | video-to-video + cameraMovement | Kling / Wan |
| 风格 | `ai-style-transfer` (已有) | img2img style | fal.ai / Qwen-Image |
| 增强 | `ai-enhance` (已有) | upscale + denoise | Engine ONNX / 云端 |
| 裁剪 | `ai-smart-crop` (已有) | object detection + crop | Engine ONNX |
| 去背 | `ai-background-remove` (已有) | segmentation | Engine ONNX / 云端 |

**指令编辑输入框**：直接调用 Qwen-Image 2.0 `editInstruction` 或 Wan 2.7 视频指令编辑，是最通用的交互——用户用自然语言描述修改意图。

#### neko-cut 右键菜单增强

```
时间线片段右键：
├── 复制 / 剪切 / 删除...        ← 已有
├── ───────────
├── AI 操作                       ← 已有子菜单，需接通
│   ├── AI 增强（upscale+denoise）
│   ├── 风格迁移
│   ├── 重新打光
│   ├── 重新生成（保留元数据）     ← 新增
│   ├── 去背景
│   └── 智能裁剪
├── ───────────
├── ✏️ 在 Sketch 中编辑            ← 新增：帧→sketch→回写
└── 🎬 在 Canvas 中查看            ← 新增：跳转关联 ShotNode
```

#### neko-canvas ShotNode 右键菜单扩展

```
ShotNode 右键：
├── ✨ 生成图像          ← 已有
├── ⚡ 批量生成          ← 已有
├── ───────────          ← 新增分隔线
├── 📐 修改视角          ← 新增：EditShotPanel
├── 💡 修改打光          ← 新增
├── 🎭 修改姿态          ← 新增
├── ───────────
├── 🎨 在 Sketch 中编辑  ← 已有
├── 🎬 生成视频          ← 新增：i2v + 运镜
└── 📤 发送到时间线       ← 已有
```

### 5.5 跨扩展联动协议

```
┌──────────┐     editInSketch      ┌──────────┐
│ neko-cut │ ──────────────────── → │  sketch  │
│ 片段     │                        │ 像素编辑  │
│          │ ← ──────────────────── │          │
│          │   updateClipFrame      │          │
└────┬─────┘                        └──────────┘
     │ viewInCanvas                      ↑
     ▼                                   │ editInSketch
┌──────────┐     editInSketch      ┌─────┴────┐
│  canvas  │ ──────────────────── → │  sketch  │
│ ShotNode │                        │          │
│          │ ← ──────────────────── │          │
│          │   updateShotImage      │          │
└────┬─────┘                        └──────────┘
     │ sendToTimeline
     ▼
┌──────────┐
│ neko-cut │
│ 时间线    │
└──────────┘
```

**Cut → Sketch**:
```typescript
// cut extension
vscode.commands.executeCommand('neko.sketch.editImage', {
  base64: frameAtPlayhead,
  name: `clip-${elementId}-frame`,
  context: { source: 'cut', sourceClipId: elementId, timeMs }
});
// sketch 编辑完成后回调
vscode.commands.executeCommand('neko.cut.updateClipFrame', {
  elementId, timeMs, newBase64
});
```

**Cut → Canvas**:
```typescript
// 跳转到关联的 ShotNode（如果有 metadata.shotId）
vscode.commands.executeCommand('neko.canvas.focusNode', {
  nodeId: element.metadata.shotNodeId
});
```

**Canvas → Cut**（已有，确认）:
```typescript
// 导出 ShotNode 到时间线
vscode.commands.executeCommand('neko.cut.importGeneratedClip', {
  imageBase64, shotMetadata, position
});
```

### 5.6 Agent 编排层

Agent 不直接呈现 UI，而是编排跨扩展操作：

```typescript
// 新增 agent tools
'cut_ai_edit'         // 对时间线片段执行 AI 编辑（打光/运镜/风格等）
'cut_batch_enhance'   // 批量增强多个片段
'canvas_edit_shot'    // 修改 ShotNode 视角/打光/姿态

// 典型 agent 对话
用户："把第 3-8 个镜头的打光都调暖一点"
Agent：→ cut_ai_edit × 6（batch，editInstruction: "warm up lighting"）

用户："重新生成第 5 个镜头，从低角度拍"
Agent：→ canvas_edit_shot（nodeId, cameraAngle: 'low-angle'）
       → canvas_generate_image（nodeId）
       → export_storyboard（sendToCut）
```

---

## 6. 架构方案

### 6.1 类型扩展

#### ImageGenerationRequest 扩展

```typescript
export interface ImageGenerationRequest extends MediaGenerationRequestBase {
  // --- 现有字段 ---
  width?: number;
  height?: number;
  aspectRatio?: string;
  count?: number;
  referenceImageUrl?: string;
  referenceImageBase64?: string;
  maskBase64?: string;
  inpaintStrength?: number;
  quality?: 'standard' | 'hd';
  style?: string;

  // --- 新增：ControlNet 引导 ---
  /** Control image (depth/canny/pose/normal/scribble) as base64 PNG */
  controlImageBase64?: string;
  /** Control conditioning mode */
  controlMode?: 'depth' | 'canny' | 'pose' | 'normal' | 'scribble';
  /** Control conditioning strength 0.0-1.0 */
  controlStrength?: number;

  // --- 新增：IP-Adapter 一致性 ---
  /** IP-Adapter reference image URL */
  ipAdapterImageUrl?: string;
  /** IP-Adapter reference as base64 */
  ipAdapterImageBase64?: string;
  /** IP-Adapter strength 0.0-1.0 */
  ipAdapterStrength?: number;

  // --- 新增：指令编辑（Qwen-Image 2.0 原生） ---
  /** Natural language edit instruction (e.g., "change lighting to warm sunset") */
  editInstruction?: string;
  /** Source image to be edited (alternative to referenceImageBase64 for edit-specific flow) */
  sourceImageBase64?: string;
}
```

#### VideoGenerationRequest 扩展

```typescript
export interface VideoGenerationRequest extends MediaGenerationRequestBase {
  // --- 现有字段 ---
  duration?: number;
  resolution?: string;
  fps?: number;
  aspectRatio?: string;
  referenceImageUrl?: string;
  referenceVideoUrl?: string;
  motionStrength?: number;

  // --- 新增：运镜控制 ---
  /** Camera movement type (Kling / Wan Camera Code) */
  cameraMovement?: CameraMovement;
  /** Camera angle (Kling / Wan) */
  cameraAngle?: CameraAngle;

  // --- 新增：Motion Control ---
  /** Motion reference video URL (Kling 2.6 motion transfer) */
  motionReferenceVideoUrl?: string;

  // --- 新增：首尾帧控制（Veo 3.1 / Wan 2.7） ---
  /** Start frame image URL */
  startFrameImageUrl?: string;
  /** End frame image URL */
  endFrameImageUrl?: string;

  // --- 新增：多参考图一致性（Seedance / Veo） ---
  /** Reference images for character/style consistency (max 3-12 depending on provider) */
  referenceImages?: string[];

  // --- 新增：视频编辑（Seedance / Wan 2.7） ---
  /** Source video to be edited */
  sourceVideoUrl?: string;
  /** Natural language edit instruction */
  editInstruction?: string;
}
```

### 6.2 Engine ONNX 感知模块扩展

```
native-core/src/ml/
├── mod.rs              ← 已有：ModelRegistry + 模块入口
├── onnx_runtime.rs     ← 已有：ort Session 管理
├── upscale.rs          ← 已有：Real-ESRGAN
├── denoise.rs          ← 已有：去噪
├── clip.rs             ← 已有：CLIP 评分
├── whisper.rs          ← 已有：STT
├── depth.rs            ← 新增：Depth Anything V2 推理
├── normal.rs           ← 新增：Normal Map 推理（DSINE）
├── pose.rs             ← 新增：Pose 检测（DWPose/RTMPose）
└── edge.rs             ← 新增：边缘检测（Canny 算法 + HED 可选）
```

EngineClient 新增方法：

```typescript
// neko-client
async estimateDepth(imageBase64: string): Promise<string>    // → depth map base64
async estimateNormal(imageBase64: string): Promise<string>   // → normal map base64
async detectPose(imageBase64: string): Promise<string>       // → pose map base64
async detectEdge(imageBase64: string, mode?: 'canny' | 'hed'): Promise<string>
```

### 6.3 Canvas ShotNode 编辑模式

```
ShotNode 右键菜单（新增）：
├── 🔄 重新生成         ← 现有
├── ✏️ 局部重绘          ← 新增：打开 neko-sketch → inpaint → 回写
├── 🎥 修改运镜          ← 新增：选择 CameraMovement → 重生成
├── 📐 修改视角          ← 新增：Engine depth → ControlNet 重生成
├── 💡 修改打光          ← 新增：指令编辑 或 Engine normal → ControlNet
├── 🎭 修改姿态          ← 新增：Engine pose → 编辑 → ControlNet
└── 🎬 生成视频          ← 新增：Image-to-Video + 运镜参数
```

### 6.4 Canvas↔Sketch 联动协议

```
Canvas ShotNode → "局部重绘"
  │
  ├── Extension: vscode.commands.executeCommand('neko.sketch.editImage', {
  │     imageBase64: generatedImage,
  │     source: { type: 'canvas-shot', nodeId, shotNumber },
  │     onComplete: 'neko.canvas.updateShotImage'
  │   })
  │
  ├── Sketch: 打开图片 → 用户选区 + inpaint → 完成
  │
  └── Callback: vscode.commands.executeCommand('neko.canvas.updateShotImage', {
        nodeId, newImageBase64
      })
```

---

## 7. 开发计划

### Phase E1：类型扩展 + Sora 替代（~2 天）

**目标**：扩展生成请求类型，应对 Sora 下线

| 任务 | 文件 | 代码量 |
|------|------|--------|
| ImageGenerationRequest 增加 control/ipAdapter/edit 字段 | `platform/src/media/types.ts` | ~30 行 |
| VideoGenerationRequest 增加 camera/motion/edit 字段 | 同上 | ~30 行 |
| CameraMovement/CameraAngle 从 `@neko/shared` 导入 | 同上 | ~5 行 |
| OpenAICompatMediaAdapter 传递新字段到 fal.ai/Replicate | `adapters/openai-compat-media-adapter.ts` | ~40 行 |
| 默认视频模型配置：添加 Kling 3.0 / Wan 2.7 作为 Sora 替代 | `config/default-config.ts` | ~20 行 |
| Sora 下线警告：检测 sora-2 模型配置时提示用户迁移 | `media/media-generation-service.ts` | ~15 行 |

**产出**：现有 Adapter 可传递 ControlNet/IP-Adapter/运镜参数给支持的 API

### Phase E2：fal.ai ControlNet Adapter（~3 天）

**目标**：接入 fal.ai 最完整的 ControlNet 云端 API

| 任务 | 文件 | 代码量 |
|------|------|--------|
| FalAIMediaAdapter | `adapters/fal-media-adapter.ts` | ~250 行 |
| ├── Flux-General + ControlNet（depth/canny/pose） | | |
| ├── Flux-General + IP-Adapter | | |
| ├── Flux-General image-to-image + inpaint | | |
| └── 异步轮询（Flux 快速，通常 <10s） | | |
| fal.ai Provider 配置模板 | `config/default-config.ts` | ~20 行 |
| MediaAdapterRegistry 注册 | `adapters/media-adapter-registry.ts` | ~5 行 |
| 单元测试 | `adapters/__tests__/fal-media-adapter.test.ts` | ~150 行 |

**产出**：通过 fal.ai 实现 depth/canny/pose ControlNet + IP-Adapter 云端生成

### Phase E2.5：Cut AI 编辑接通（~2 天）

**目标**：接通 neko-cut 已有的 12 个 AI action UI 入口到真实 AI 服务（ROI 最高：UI 全有，只差后端）

| 任务 | 文件 | 代码量 |
|------|------|--------|
| CutAIActionHandler 服务 | `cut/extension/src/services/cutAIActionHandler.ts` | ~200 行 |
| ├── 接收 webview `executeAIAction` 消息 | | |
| ├── 按 actionId 路由到 MediaGenerationService / EngineClient | | |
| ├── ai-enhance → upscale + denoise 组合 | | |
| ├── ai-style-transfer → img2img style | | |
| ├── ai-upscale → Engine ONNX / 云端 | | |
| ├── ai-denoise → Engine ONNX / 云端 | | |
| ├── ai-color-grade → Qwen-Image 指令编辑 | | |
| ├── ai-background-remove → segmentation | | |
| └── ai-smart-crop → object detection + crop | | |
| AI Edit Panel（PropertyPanel 新 section） | `cut/webview/src/components/PropertyPanel/AIEditSection.tsx` | ~150 行 |
| ├── 快捷按钮行（打光/运镜/风格/增强/裁剪/去背） | | |
| ├── 指令编辑输入框 + "应用" 按钮 | | |
| └── 联动入口（Sketch 编辑 / Canvas 查看） | | |
| Cut↔Sketch 联动命令 | `cut/extension/src/commands/` | ~40 行 |
| ├── neko.cut.editInSketch → 取当前帧 → sketch.editImage | | |
| └── neko.cut.updateClipFrame → 接收 sketch 回写 | | |
| aiActionSlice 扩展（新 action 类型） | `cut/webview/src/stores/slices/aiActionSlice.ts` | ~30 行 |
| 进度 UI（action 执行中状态显示） | `cut/webview/src/components/PropertyPanel/` | ~40 行 |
| 单元测试 | | ~80 行 |

**产出**：
- 用户在时间线右键 → AI 操作直接可用（无需通过 agent 对话）
- PropertyPanel 新增 AI 编辑区（快捷按钮 + 指令输入 + 联动入口）
- Cut↔Sketch 帧级编辑联动

### Phase E3：Qwen-Image Adapter（~2 天）

**目标**：接入 Qwen-Image 2.0 原生编辑能力

| 任务 | 文件 | 代码量 |
|------|------|--------|
| QwenImageMediaAdapter | `adapters/qwen-image-media-adapter.ts` | ~200 行 |
| ├── text-to-image（2K 原生） | | |
| ├── 指令编辑（editInstruction + sourceImage） | | |
| ├── 原生 ControlNet（depth/canny/inpaint） | | |
| └── DashScope API 集成 | | |
| 单元测试 | `adapters/__tests__/qwen-image-media-adapter.test.ts` | ~100 行 |

**产出**：通过 Qwen-Image 2.0 实现指令级编辑（"将打光改为暖色夕阳"）

### Phase E4：Wan 2.7 + Kling 增强（~2 天）

**目标**：视频编辑能力

| 任务 | 文件 | 代码量 |
|------|------|--------|
| WanVideoAdapter | `adapters/wan-media-adapter.ts` | ~200 行 |
| ├── Camera Code 运镜控制 | | |
| ├── 首尾帧控制 | | |
| ├── 指令编辑 | | |
| └── DashScope API 集成 | | |
| Kling Adapter 增强：Motion Control 参数 | `adapters/kling-media-adapter.ts`（已有） | ~50 行 |
| 单元测试 | | ~100 行 |

**产出**：视频运镜控制 + 视频编辑 + 首尾帧控制

### Phase E5：Engine 感知模块（~4 天）

**目标**：本地 ONNX 感知模型，实时预览 + 控制图提取

| 任务 | 文件 | 代码量 |
|------|------|--------|
| depth.rs — Depth Anything V2 | `native-core/src/ml/depth.rs` | ~120 行 Rust |
| normal.rs — DSINE | `native-core/src/ml/normal.rs` | ~100 行 Rust |
| pose.rs — DWPose | `native-core/src/ml/pose.rs` | ~120 行 Rust |
| edge.rs — Canny 算法 | `native-core/src/ml/edge.rs` | ~80 行 Rust |
| ModelsController 扩展 | `native-api/src/controllers/models.rs` | ~60 行 Rust |
| EngineClient 新方法 | `neko-client/src/` | ~40 行 TS |
| 模型下载脚本 | `neko-engine/scripts/` | ~50 行 |
| 单元测试 | | ~100 行 |

**产出**：Engine 内置 depth/normal/pose/edge 提取，<1s 推理

### Phase E6：Canvas 编辑 UI + 跨扩展联动（~3 天）

**目标**：Canvas 端编辑入口 + 全链路联动

| 任务 | 文件 | 代码量 |
|------|------|--------|
| ShotNode 右键菜单扩展（视角/打光/姿态/生成视频） | `canvas/webview/src/components/nodes/ShotNode.tsx` | ~80 行 |
| EditShotPanel（视角/打光/姿态编辑 UI） | `canvas/webview/src/components/panels/EditShotPanel.tsx` | ~200 行 |
| ├── Engine 实时 depth/pose 预览 | | |
| ├── 控制参数调节（strength/mode） | | |
| └── "应用" → 调用 generateForNode + 新参数 | | |
| Canvas↔Sketch editImage 联动 | `canvas/extension/src/editor/` + `sketch/extension/src/commands/` | ~60 行 |
| canvasStore 扩展（editMode 状态） | `canvas/webview/src/stores/canvasStore.ts` | ~30 行 |
| ShotNode→Video 生成入口（i2v + 运镜参数） | `canvas/webview/src/components/nodes/ShotNode.tsx` | ~40 行 |

**产出**：Canvas 端修改机位/打光/视角/姿态，联动 Sketch inpaint，ShotNode→Video

---

## 8. Adapter 扩展规划

### 8.1 优先级

| Adapter | 优先级 | 核心能力 | 状态 |
|---------|--------|---------|------|
| **FalAIMediaAdapter** | P0 | ControlNet + IP-Adapter + inpaint 云端全家桶 | 待新建 |
| **QwenImageMediaAdapter** | P0 | 原生 depth/canny/inpaint/指令编辑，Apache 2.0 | 待新建 |
| **WanVideoAdapter** | P1 | Camera Code + 指令编辑 + 4K + 首尾帧 | 待新建 |
| OpenAICompatMediaAdapter 增强 | P1 | 传递 control/camera/edit 参数 | 修改现有 |
| Kling Adapter 增强 | P1 | Motion Control + 多模态 | 修改现有 |
| Veo 3.1 Adapter | P2 | 4K + 首尾帧 + 3 参考图 | 待新建 |
| Seedance Adapter | P3 | 等 API 稳定后接入 | 阻塞中 |

### 8.2 Provider 支持矩阵（目标态）

```
修改机位/运镜：
├── 图片：fal.ai ControlNet depth → 重生成      ← Phase E2
├── 图片：Qwen-Image 指令编辑                    ← Phase E3
├── 视频：Kling Motion Control                   ← Phase E4
└── 视频：Wan Camera Code                        ← Phase E4

修改打光：
├── 图片：Qwen-Image 指令编辑                    ← Phase E3
├── 图片：fal.ai ControlNet normal               ← Phase E2
└── 视频：Wan 指令编辑                           ← Phase E4

修改视角：
├── 图片：Engine depth → fal.ai ControlNet       ← Phase E2 + E5
├── 图片：Qwen-Image 指令编辑                    ← Phase E3
└── 视频：Veo 首尾帧控制                         ← Phase E4

修改姿态：
├── 图片：Engine pose → fal.ai ControlNet pose   ← Phase E2 + E5
├── 图片：Qwen-Image 姿态编辑                    ← Phase E3
└── 视频：Kling 2.6 Motion Control               ← Phase E4

局部修改：
├── 图片：SketchInpaint（已有）
├── 图片：fal.ai ControlNet Union inpaint        ← Phase E2
├── 图片：Qwen-Image 原生 inpaint                ← Phase E3
└── 视频：Seedance 视频编辑                      ← Phase 待定

角色一致性：
├── 图片：fal.ai IP-Adapter                      ← Phase E2
├── 视频：Veo 参考图                             ← Phase E4
└── 高级：ComfyUI IP-Adapter（Layer 3）          ← 独立 MCP
```

### 8.3 总代码量估算

| Phase | TS | Rust | 测试 | 总计 |
|-------|----|----|------|------|
| E1 类型 + Sora 替代 | ~140 | — | — | ~140 |
| E2 fal.ai Adapter | ~275 | — | ~150 | ~425 |
| **E2.5 Cut AI 编辑接通** | **~460** | — | **~80** | **~540** |
| E3 Qwen-Image Adapter | ~200 | — | ~100 | ~300 |
| E4 Wan + Kling 增强 | ~250 | — | ~100 | ~350 |
| E5 Engine 感知模块 | ~90 | ~480 | ~100 | ~670 |
| E6 Canvas 编辑 UI + 联动 | ~410 | — | — | ~410 |
| **总计** | **~1,825** | **~480** | **~530** | **~2,835** |

### 实施顺序与依赖

```
E1（类型扩展）──→ E2（fal.ai）──→ E2.5（Cut 接通）──→ E3（Qwen-Image）
                                       │
                                       │ E4（Wan+Kling）可并行
                                       │ E5（Engine ONNX）可并行
                                       │
                                       └──→ E6（Canvas UI + 联动）
```

- **E1 → E2 → E2.5 串行**：类型定义先行 → Adapter 可用 → UI 接通
- **E4 / E5 可并行**：与 E2.5 / E3 无依赖
- **E6 等 E2 + E5 完成**：Canvas EditShotPanel 需要 ControlNet + Engine depth

---

*最后更新：2026-03-31（v2：新增 §5 UI 集成策略 + Phase E2.5 Cut AI 编辑接通）*
