# 2D 创作能力架构分析

> 日期：2026-03-09（更新：2026-03-28）
> 状态：S.1 ✅ 完成 | S.2 ✅ 完成 | S.3 ✅ 完成（滤镜 ✅ 像素网格 ✅ 大气效果 ✅ 场景模板 ✅ Vector 拖拽预览 ✅ 序列帧播放器 ✅）| S.4 P1 ✅（sketch.generate，2026-03-28）
> 范围：neko-sketch / neko-cut / neko-canvas / neko-agent

---

## 目录

1. [定位与边界](#1-定位与边界)
2. [2D 能力矩阵](#2-2d-能力矩阵)
3. [绘画引擎](#3-绘画引擎)
4. [2D 骨骼动画系统](#4-2d-骨骼动画系统)
5. [2D 特效系统](#5-2d-特效系统)
6. [2D 场景与物品](#6-2d-场景与物品)
7. [AI 辅助 2D 创作](#7-ai-辅助-2d-创作)
8. [2D↔3D 联动](#8-2d3d-联动)
9. [包架构设计](#9-包架构设计)
10. [实施路线图](#10-实施路线图)
11. [混合策略：内置轻量创作 + MCP 桥接专业软件](#11-混合策略内置轻量创作--mcp-桥接专业软件)

---

## 1. 定位与边界

### 1.1 neko-sketch vs neko-model 对称关系

```
            2D 空间                3D 空间
创作套件    neko-sketch            neko-model
画布排版    neko-canvas            ─
时间线      neko-cut               ─
```

| 维度 | neko-sketch（2D） | neko-model（3D） |
|------|-------------------|------------------|
| 坐标空间 | 像素平面（x, y） | 三维空间（x, y, z） |
| 渲染管线 | Canvas 2D / WebGL 2D | wgpu PBR / R3F Three.js |
| 人物 | 2D 立绘 / Inochi2D（inox2d） | 3D 骨骼 mesh / VRM |
| 特效 | 2D 滤镜 / 平面粒子 | GPU 粒子（体积）/ 后处理 |
| 场景 | 图层叠加 / 视差滚动 | HDR 环境 / 天空盒 / 地形 |
| 物品 | 像素/矢量绘制 | 参数化几何体 / CSG |
| 动画 | 逐帧 / Inochi2D（参数驱动） | 3D 骨骼 / Morph Target |
| 输出 | PNG/SVG/PSD + 序列帧 | glTF/GLB/VRM + 视频渲染 |
| 典型用户 | 插画师、2D 动画师、UI 设计 | 3D 建模师、场景设计 |

### 1.2 与其他包的关系

```
neko-sketch（2D 创作）
├── 输出 → neko-cut（2D 动画序列嵌入时间线）
├── 输出 → neko-canvas（2D 资产嵌入画布节点）
├── 联动 → neko-model（2D 纹理 → 3D 材质贴图）
├── 辅助 → neko-agent（AI 生成/风格迁移/自动分层）
└── 资产 → neko-assets（2D 资产管理：PSD/Spine/Inochi2D 文件）
```

---

## 2. 2D 能力矩阵

| 能力 | 技术方案 | 前端实现 | 可行性 |
|------|----------|----------|--------|
| **绘画工具** | Canvas 2D / WebGL 2D | 画笔/形状/选区/图层 | ✅ 完全可行 |
| **压感支持** | Pointer Events API | pressure / tiltX / tiltY | ✅ 完全可行 |
| **图层系统** | 离屏 Canvas 合成 | 25+ 混合模式 | ✅ 完全可行 |
| **Inochi2D** | inox2d + native-puppet（bevy_ecs） | ECS 后端 + WebGL 前端渲染 | ✅ 完全可行（BSD 2-Clause） |
| **逐帧动画** | Canvas 序列帧 | 洋葱皮 + 帧管理 | ✅ 完全可行 |
| **2D 粒子** | Canvas / WebGL | 平面粒子系统 | ✅ 完全可行 |
| **2D 滤镜** | WebGL shader / WGSL 复用 | 模糊/发光/色彩/扭曲 | ✅ 完全可行 |
| **序列帧特效** | Sprite Sheet | 编辑 + 导出 | ✅ 完全可行 |
| **2D 场景** | 多图层 Canvas | 视差滚动 + 场景模板 | ✅ 完全可行 |
| **矢量绘制** | SVG / Canvas Path | 贝塞尔曲线编辑 | ✅ 完全可行 |
| **AI 生成** | 外部 API | Text-to-Image + 风格迁移 | ✅ 可行（依赖外部 API） |

**Webview 沙箱限制影响**：2D 创作场景几乎不受 VSCode Webview 限制影响——Canvas 2D / WebGL 性能充足，无需 Pointer Lock，压感通过标准 Pointer Events 获取。

---

## 3. 绘画引擎

### 3.1 技术选型

| 方案 | 优势 | 劣势 | 推荐 |
|------|------|------|------|
| **Canvas 2D** | 简单、广泛支持 | 大画布性能有限 | ⭐⭐ 基础绘画 |
| **WebGL 2D** | GPU 加速、高性能 | 开发复杂 | ⭐⭐⭐ 主力方案 |
| **OffscreenCanvas** | Web Worker 中渲染 | 兼容性一般 | ⭐ 备选 |

**推荐：WebGL 2D 为主，Canvas 2D 为辅**

### 3.2 画笔系统

```typescript
interface BrushEngine {
  // Stroke rendering with pressure sensitivity
  beginStroke(point: StrokePoint): void;
  addPoint(point: StrokePoint): void;
  endStroke(): StrokeResult;
}

interface StrokePoint {
  x: number;
  y: number;
  pressure: number;     // 0.0 ~ 1.0 (Pointer Events)
  tiltX: number;        // -90 ~ 90
  tiltY: number;        // -90 ~ 90
  timestamp: number;
}

// Brush types
type BrushType =
  | 'pencil'      // hard edge, pressure → opacity
  | 'pen'         // smooth, pressure → width
  | 'watercolor'  // blending, wet-on-wet
  | 'airbrush'    // soft spray
  | 'eraser'      // erase with pressure
  | 'marker'      // flat tip, tilt → shape
  | 'pixel';      // pixel art, no anti-aliasing
```

### 3.3 图层系统

```
Layer Stack（自底向上合成）：
├── Background Layer（锁定）
├── Layer 1: 线稿（Normal, 100%）
├── Layer 2: 底色（Multiply, 80%）
├── Layer 3: 阴影（Multiply, 60%）
├── Layer 4: 高光（Screen, 50%）
├── Group: 特效
│   ├── Layer 5: 发光（Add, 40%）
│   └── Layer 6: 粒子（Normal, 100%）
└── Layer 7: 文字（Normal, 100%）
```

混合模式复用现有 WGSL shader（`blend_modes.wgsl` 已有 25+ 模式）。

---

## 4. 2D 骨骼动画系统

**2D 骨骼动画是 2D 人物创作的核心能力**

### 4.1 技术选型：Inochi2D（inox2d）

**ADR 决策**：统一采用 inox2d（bevy_ecs + inox2d）作为唯一 2D 骨骼动画引擎，替代 Spine 和 Live2D。详见 ADR-2D-004。

| 维度 | Inochi2D（inox2d） |
|------|--------------------|
| **适用风格** | 立绘 / 日式角色 / VTuber，参数驱动 |
| **变形方式** | 参数化变形（物理弹簧/摆锤） |
| **动画原理** | 参数值 → 部件 → 网格变形 |
| **运行时** | inox2d（BSD 2-Clause） |
| **后端** | bevy_ecs 0.15 + inox2d（native-puppet crate） |
| **文件格式** | `.inp`（INP 归档格式） |
| **编辑器** | Inochi2D Creator（开源免费） |
| **性能** | Rust 后端数据计算 + WebGL2 前端渲染 |
| **社区** | VTuber / 虚拟形象，开源社区活跃 |

### 4.2 Inochi2D / inox2d 集成

> **ADR: inox2d 唯一方案决策**
>
> - **Live2D 否决**：Cubism SDK 许可证限制——neko-sketch 作为"可扩展应用"需单独审批签约，法律风险高
> - **Spine 否决**：Spine Runtimes License 非 MIT，有分发限制；功能与 inox2d 重叠，维护两套运行时代价高
> - **inox2d 选择理由**：BSD 2-Clause 开源许可，Inochi2D 格式兼容，社区活跃
> - **inox2d + Bevy 全框架否决**：WASM 体积 3.5-30MB、渲染管线冲突、与项目 ADR（不用 Bevy 全框架）矛盾
> - **最终方案**：参照 3D 的 native-scene + bevy_ecs 模式，将 inox2d 集成到 neko-engine 端（native-puppet crate）；动画回放由 **bevy_animation** 驱动，不依赖 inox2d 上游实现

**native-puppet 架构（对称 native-scene）**：

```
Inochi2D Editor（外部工具）→ 导出 .inp 文件
    │
    ▼
neko-engine: native-puppet crate（bevy_ecs 0.15 + inox2d + bevy_animation）
    │
    ├─ loader.rs      — INP 解析 → ECS World + AnimationClip 注册
    ├─ components.rs  — PuppetNodeId, Transform2D, MeshData, ParameterBinding, AnimationTarget
    ├─ systems.rs     — parameter_update, physics_tick, transform_propagation_2d, animation_tick
    ├─ animation.rs   — bevy_animation AnimationClip → ParameterCurve → inox2d 参数值
    ├─ world.rs       — trait PuppetWorld + BevyPuppetWorld
    │
    ▼
PuppetService (native-core) → PuppetsController (native-api)
    │
    ├─ POST /v1/puppets/load       — 加载 INP 文件 → PuppetSnapshot（含 animations 列表）
    ├─ POST /v1/puppets/param      — 手动设置参数 → 重算变形
    ├─ POST /v1/puppets/tick       — 物理步进 → PuppetDelta（请求-响应模式）
    ├─ POST /v1/puppets/anim/play  — 播放动画片段（name, loop）
    ├─ POST /v1/puppets/anim/stop  — 停止动画
    ├─ POST /v1/puppets/anim/seek  — 跳转至时间点（timeMs）
    ├─ GET  /v1/puppets/anims      — 动画片段列表（AnimationClipInfo[]）
    ├─ GET  /v1/puppets/snapshot   — 完整快照
    ├─ GET  /v1/puppets/params     — 参数列表
    ├─ GET  /v1/puppets/meshes     — 变形后网格数据
    └─ WS   /v1/puppets/stream     — 实时推送 PuppetDelta（60fps，neko-live 模式）
    │
    ▼
neko-sketch webview: Inochi2DController → WebGL2 渲染
    │
    └─ 编辑器 UI
        ├─ 参数滑块面板（手动驱动，PuppetSnapshot.parameters 动态生成）
        ├─ 动画列表 + 播放控制（bevy_animation 驱动）
        ├─ 节点层级查看器
        └─ 物理模拟开关
```

**数据流（三种模式）**：

```
── 模式 1：手动参数驱动（编辑器滑块）──
INP 文件 → loadPuppet() → PuppetSnapshot
                            ├─ nodes: 节点层级
                            ├─ parameters: 参数定义
                            ├─ animations: 动画片段列表
                            └─ meshes: 初始顶点+UV+索引

参数变更 → POST /v1/puppets/param → Rust 重算变形
物理步进 → POST /v1/puppets/tick  → PuppetDelta { deformed_meshes }
前端 WebGL2 → 更新 VAO → 按 z-order 渲染

── 模式 2：bevy_animation 动画回放（编辑器预览）──
POST /v1/puppets/anim/play { name, loop }   ← HTTP 命令启动动画
  → bevy_animation AnimationPlayer 启动
WS /v1/puppets/stream 自动连接（usePuppetPlayback hook 编排）
  → 每 tick: AnimationClip 曲线求值 → ParameterCurve → 写入 inox2d 参数值
  → 物理步进 → 变形计算 → PuppetDelta { deformed_meshes, animation_time_ms, animation_playing }
  → WS 推送 60fps
  → 前端更新 seek slider + deformed meshes
  → animation_playing === false 时自动断开 stream
注意：stream 活跃时不得调用 HTTP tick()，避免 double-tick

── 模式 3：WebSocket 实时流（neko-live 面部追踪）──
WS /v1/puppets/stream 建立连接
  → native-puppet 以 60fps 主动推送 PuppetDelta
  → neko-live 写入面部追踪参数 → 同一 tick 计算
前端 WebGL2 → onmessage → 更新 VAO → 渲染
（绕过 HTTP round-trip，延迟 <2ms）
```

```typescript
// Inochi2D controller
interface IInochi2DController {
  // Loading
  load(data: ArrayBuffer): Promise<PuppetSnapshot>;
  getSnapshot(): PuppetSnapshot | null;
  isLoaded(): boolean;

  // Manual parameter control
  setParameter(name: string, value: number): Promise<void>;
  getParameters(): Promise<ParameterInfo[]>;

  // Frame tick (request-response mode)
  tick(deltaMs?: number): Promise<DeformedMesh[]>;
  getMeshes(): Promise<DeformedMesh[]>;

  // Animation playback (driven by bevy_animation)
  getAnimations(): Promise<AnimationClipInfo[]>;
  playAnimation(name: string, loop?: boolean): Promise<void>;
  stopAnimation(): Promise<void>;
  seekAnimation(timeMs: number): Promise<void>;

  // WebSocket streaming (real-time / neko-live mode)
  connectStream(onDelta: (delta: PuppetDelta) => void): WebSocket;
  disconnectStream(): void;
}

interface AnimationClipInfo {
  name: string;
  durationMs: number;
  parameterNames: string[];  // parameters driven by this clip
}
```

**inox2d 当前限制**：

| 限制 | 影响 | 应对 |
|------|------|------|
| inox2d 上游动画未实现 | 无法从 INP 文件读取预录动画数据 | **bevy_animation 自定义 AnimationClip + ParameterCurve**，在 native-puppet 层实现动画回放，不依赖上游 |
| MeshGroup 未实现 | 新版模型可能异常 | 限制支持 Inochi2D 0.7 格式 |
| Composite-as-mask 会 panic | 特定模型崩溃 | 加载时检测并跳过，日志警告 |
| 无 wgpu 渲染器 | 不能直接用 neko-engine GPU | native-puppet 只做数据计算，渲染在前端 WebGL2 |

### 4.3 逐帧动画

传统逐帧动画，适合手绘风格：

```
逐帧编辑器 UI
┌─────────────────────────────────────────────┐
│  ┌──────────────────┐  ┌─────────────────┐  │
│  │                  │  │ 帧管理           │  │
│  │   画布            │  │ [1] [2] [3] ... │  │
│  │   (洋葱皮叠加)    │  │                 │  │
│  │   前帧=半透明绿   │  │ FPS: 12 ▾       │  │
│  │   后帧=半透明红   │  │ 洋葱皮: ✅       │  │
│  │                  │  │ 前: 2  后: 1     │  │
│  └──────────────────┘  └─────────────────┘  │
│  ◀ ▶ ⏯ [1/24] ━━━━●━━━━━━━━ 时间轴        │
└─────────────────────────────────────────────┘
```

### 4.4 与 3D 骨骼的对比

| 维度 | 2D 骨骼（Inochi2D / inox2d） | 3D 骨骼（neko-model） |
|------|------------------------------|----------------------|
| 变形方式 | 参数化变形（物理弹簧/摆锤） | 蒙皮权重 + 顶点着色器 |
| 渲染 | WebGL2 sprite | wgpu PBR / R3F |
| 数据格式 | .inp | glTF / VRM |
| 物理 | inox2d 内置弹簧/摆锤系统 | rapier3d |
| 动画驱动 | bevy_animation（ParameterCurve → inox2d 参数值） | bevy_animation（骨骼 Transform 曲线） |
| 面部追踪 | neko-live → WS /v1/puppets/stream → 参数值 | neko-live → WS → 骨骼 Transform |
| 编辑器 | 外部工具（Inochi2D Creator） | neko-model 内置 |

---

## 5. 2D 特效系统

### 5.1 特效分类

| 类型 | 实现方式 | 用途 |
|------|----------|------|
| **2D 粒子** | Canvas / WebGL 粒子系统 | 火花、雨雪、飘落物、魔法 |
| **2D 滤镜** | WebGL shader（复用 WGSL） | 模糊、发光、色彩调整、扭曲 |
| **序列帧特效** | Sprite Sheet 播放 | 爆炸、烟雾、技能特效 |
| **形变动画** | SVG/Canvas 路径动画 | 液体、波浪、弹性形变 |

### 5.2 已有可复用 shader

neko-engine 现有 25+ WGSL shader 可直接转译为 WebGL GLSL 或在 WebGPU 中使用：

- 模糊：box / directional / radial / zoom blur
- 色彩：exposure / brightness / contrast / temperature / saturation / HSL
- 特效：glow / vignette / film grain / chromatic aberration / distortion
- 工具：easing 函数、色彩空间转换

---

## 6. 2D 场景与物品

### 6.1 2D 场景

```
2D 场景 = 多图层叠加 + 视差滚动 + 氛围效果

Scene Layer Stack：
├── Layer: 天空（最慢滚动，parallax: 0.1）
├── Layer: 远山（parallax: 0.3）
├── Layer: 中景建筑（parallax: 0.5）
├── Layer: 近景角色（parallax: 1.0）
├── Layer: 前景植物（parallax: 1.5）
└── Layer: 粒子特效（雨/雪/尘埃）

输出格式：
├── 静态场景 → PNG（合并图层）
├── 动态场景 → 序列帧 / 视频（带视差动画）
└── 嵌入时间线 → neko-cut Scene2D 元素
```

### 6.2 2D 物品/资产

支持两种绘制模式：

| 模式 | 工具 | 输出格式 | 用途 |
|------|------|----------|------|
| **像素绘制** | 像素画笔 + 网格 + 调色板 | PNG | 像素游戏资产 |
| **矢量绘制** | 贝塞尔曲线 + 路径编辑 | SVG | UI 图标、标志、可缩放资产 |

---

## 7. AI 辅助 2D 创作

### 7.1 neko-sketch MCP Tools

**通过 neko-agent MCP Tools 集成**：

```
AI MCP Tools：
├─ sketch.generate          → Text-to-Image API → 生成 2D 立绘/场景  ✅ P1 完成（2026-03-28）
├─ sketch.style_transfer    → 风格迁移（照片 → 动漫/油画/水彩风格）
├─ sketch.auto_layer        → AI 自动分层（单图 → 线稿/色块/阴影/高光图层）
├─ sketch.auto_rig          → AI 辅助骨骼绑定（2D 立绘 → Inochi2D 参数建议）
├─ sketch.inpaint           → 局部重绘（选区 + 文本描述 → 重绘）
└─ sketch.upscale           → AI 超分辨率（低分辨率 → 高清）
```

**AI Provider 抽象**（复用 neko-agent platform 层）：

```typescript
interface I2DGenerationProvider {
  generateImage(prompt: string, options: Gen2DOptions): Promise<ImageResult>;
  styleTransfer(image: Buffer, style: string): Promise<ImageResult>;
  autoLayer(image: Buffer): Promise<LayerResult[]>;
}

type Gen2DOptions = {
  provider: 'stability' | 'dall-e' | 'midjourney' | 'custom';
  width: number;
  height: number;
  style?: string;
};
```

### 7.2 neko-canvas 内嵌生图对话框（ADR-2D-007）

> **参考**：liblibtv 节点点击后弹出的内嵌生图面板（图片节点 → 画面描述 + 风格 + 摄像机控制 + @引用素材）

**交互模式**：点击画布图片节点 → 节点下方展开 `GenerationPromptPanel` → 输入 prompt → 委托 neko-agent Extension Host 执行 → 结果回写节点。

**架构决策（ADR-2D-007）**：canvas 内嵌面板只做 UI，AI 执行完全委托 neko-agent Extension Host，不在 canvas webview 中引入 AI 逻辑。详见 [附录 ADR-2D-007](#adr-2d-007-neko-canvas-内嵌生图面板委托模式)。

```
neko-canvas webview
  → 点击图片节点 → GenerationPromptPanel 展开（纯 UI）
  → 用户输入: prompt + 风格 + 分辨率 + @引用素材 + 摄像机参数
  → postMessage({ type: 'canvas.generate', nodeId, prompt, referenceAssets, style, aspectRatio, cameraHint })
      ↓
  canvasEditorProvider.ts (Extension Host)
  → vscode.commands.executeCommand('neko.agent.generateForNode', context)
      ↓
  neko-agent Extension Host
  → MediaGenerationService.generateImage() → 进度回传
  → 完成 → base64 → postMessage({ type: 'canvas.nodeImageUpdated', nodeId, imageData })
      ↓
  canvas webview → 更新图片节点内容
```

**GenerationPromptPanel 控件设计**（对标 liblibtv）：

| 控件 | 功能 | 实现 |
|------|------|------|
| 文本输入区 | 画面描述 prompt，支持 `/` 指令 | contentEditable + slash command |
| **风格** | 全局风格锁（动漫/写实/水彩） | CanvasStyleLock → 自动前缀注入 prompt |
| **标记** | 分镜元数据标签（景别/运镜/机位） | ShotMetadataPanel（景别/运镜/色调） |
| **聚焦** | 主体构图聚焦参数 | focal subject → prompt suffix |
| `@引用素材` | 引用画布上的角色/场景节点 → IP-Adapter 参考图 | `@` 触发节点选择器 → referenceAssets[] |
| 模型选择 | 复用 neko-agent 已配置的模型 | agent.getAvailableModels() |
| 分辨率 | 随节点宽高自适应，可手动覆盖 | aspect ratio + resolution picker |
| **摄像机控制** | 景别(特/近/中/全/远) + 机位(正/侧/俯/仰) | 注入为结构化 prompt suffix |
| 生成数量 | 1-4 张候选 | batch size |
| 发送按钮 | 触发生成 | postMessage → agent |

**`@引用素材` 角色一致性机制**：

```
画布上的角色参考图节点（已有 base64 图片）
  → 用户输入 @沈昭昭 → 触发节点选择器
  → 选中角色节点 → referenceAssets: [{ nodeId, imageData, role: 'character' }]
  → 发送给 agent
  → agent 将 imageData 作为 IP-Adapter reference 注入生图参数
  → 生成图保持角色外貌一致
```

**摄像机控制 → Prompt 注入**：

```typescript
function cameraHintToPromptSuffix(hint: CameraHint): string {
  const shotScale = {
    'extreme-close': 'extreme close-up shot',
    'close':         'close-up shot',
    'medium':        'medium shot',
    'full':          'full shot',
    'long':          'long shot, wide angle',
  }[hint.shotScale] ?? '';

  const angle = {
    'eye-level': '',
    'high':      'high angle, bird\'s eye view',
    'low':       'low angle, worm\'s eye view',
    'dutch':     'dutch angle',
  }[hint.angle] ?? '';

  return [shotScale, angle].filter(Boolean).join(', ');
}
```

---

## 8. 2D↔3D 联动

| 方向 | 场景 | 数据流 | 复杂度 |
|------|------|--------|--------|
| **2D→3D** | 2D 纹理贴到 3D 模型 | PNG/SVG → neko-model material texture | 低 |
| **2D→3D** | 2D 背景用于 3D 环境 | 绘制环境图 → HDR/Skybox | 中 |
| **3D→2D** | 3D 渲染为 2D 素材 | SceneRenderOutput → PNG 图层 | 低 |
| **2D→时间线** | 2D 动画嵌入视频 | Inochi2D → neko-cut Scene2D 元素 | 低 |
| **2D→画布** | 2D 资产嵌入画布 | PNG/SVG → neko-canvas 节点 | 低 |

---

## 9. 包架构设计

### 9.1 包结构

```
neko-sketch/
├── packages/
│   ├── extension/        # VS Code 扩展（文件关联 + 命令 + 消息路由）
│   └── webview/          # React UI
│       ├── src/
│       │   ├── canvas/       # 绘画引擎（画笔/图层/选区）
│       │   ├── animation/    # 动画系统
│       │   │   ├── inochi2d/     # Inochi2D 集成（native-puppet 前端）
│       │   │   └── frame/        # 逐帧动画
│       │   ├── effects/      # 2D 特效（粒子/滤镜/序列帧）
│       │   ├── scene/        # 2D 场景（图层/视差）
│       │   ├── components/   # React UI 组件
│       │   └── store/        # Zustand 状态管理
│       └── package.json
└── package.json
```

### 9.2 依赖关系

```
neko-sketch ext → @neko/shared, neko-engine（可选，滤镜渲染）
neko-sketch webview → @neko/shared, react
neko-engine（native-puppet）→ bevy_ecs 0.15, inox2d（Rust 端，BSD 2-Clause）
```

**neko-engine 依赖为可选**：基础绘画和动画完全在前端 WebGL 完成。仅当需要 Rust GPU 加速的高级滤镜/特效时才走 neko-engine。

---

## 10. 实施路线图

### Phase S.1：绘画基础 ✅ COMPLETE

**目标**：画笔/形状/图层/混合模式/压感

**实施状态**（2026-03-12）：
- WebGL2 渲染引擎：上下文管理、着色器编译缓存、纹理/FBO 生命周期、ping-pong 合成管线
- 12 种 GLSL 混合模式（从 neko-engine WGSL 转译）
- 画笔系统：7 种笔刷（pencil/pen/watercolor/airbrush/eraser/marker/pixel）
- Catmull-Rom 样条插值 + 4 种压感曲线
- 图层系统：CRUD、分组、深层查找（纯函数）
- 选区系统：矩形/全选/反选（Uint8Array bitmask）
- 撤销/重做：区域快照模式，100 步上限
- Zustand 状态管理：7 个 slice 组合（document/layer/tool/brush/viewport/history/UI）
- React UI：Canvas/Toolbar/BrushPanel/ColorPanel/LayerPanel/StatusBar
- Extension Host：CustomEditorProvider(.nks)、LayerOutline TreeView、StatusBar、13 命令
- 文档 I/O：.nks JSON 序列化/反序列化、save/load/revert；WebGL 纹理像素读取（FBO → offscreen canvas → base64）
- 键盘分发：undo/redo/工具切换/缩放重置/导入导出；selectAll（全选当前图层）；deleteSelected（WebGL FBO 读像素，置零选区）
- 图片导入：base64 → ImageBitmap → 新图层
- i18n：运行时语言切换（en/zh-cn）

详细架构见 `packages/neko-sketch/ARCHITECTURE.md`。

```
前端：
├─ WebGL 2D 画布引擎
├─ 画笔系统（7+ 笔刷类型 + 压感/倾斜）
├─ 图层系统（25+ 混合模式 + 分组 + 遮罩）
├─ 选区工具（矩形/套索/魔棒 + 变换）
├─ 形状工具（直线/矩形/圆/贝塞尔）
├─ 撤销/重做（操作栈）
└─ 文件 I/O（PSD 导入/导出 + PNG/SVG）

Extension：
├─ 文件类型关联（.psd, .sketch, .aseprite）
├─ 自定义编辑器 Provider
└─ 命令注册 + 消息路由
```

### Phase S.2：2D 人物 + 骨骼动画 ✅ COMPLETE

**目标**：Inochi2D（inox2d）加载预览 + bevy_animation 动画回放 + 参数驱动、逐帧动画、AI 辅助

**实施状态**（2026-03-14）：

```
Inochi2D 集成（native-puppet 后端 + WebGL2 前端）：
├─ ✅ native-puppet crate（bevy_ecs + inox2d + bevy_animation，BSD 2-Clause / MIT）
├─ ✅ INP 文件加载：手动解析 INP 二进制格式（serde_json 直接解析 JSON payload）
│      （注：inox2d 0.3.0 将 puppet.nodes/params 设为 pub(crate)，绕过 API 直接解析）
├─ ✅ bevy_animation 动画回放
│   ├─ AnimationClip + ParameterCurve → 每 tick 计算参数值
│   ├─ animation_tick system 在 parameter_update 之前运行
│   └─ anim_play / anim_stop / anim_seek / anims 端点
├─ ✅ 手动参数驱动（滑块 UI → POST /v1/puppets/param）
├─ ✅ 物理模拟（弹簧/摆锤，heads/配饰）
├─ ✅ WebSocket 实时流（GET /v1/puppets/stream，60fps PuppetDelta push）
├─ ✅ AnimationPanel UI（动画列表 + 播放控制 + Seek slider）
└─ ✅ 节点层级快照 + 参数面板

逐帧动画（2026-03-14 完成）：
├─ ✅ FrameLayer / AnimFrame 类型系统（types/frame.ts）
├─ ✅ frameSlice（Zustand：addFrame/duplicateFrame/removeFrame/nextFrame/prevFrame/updateFrameImageData）
├─ ✅ frame-manager 纯函数工具（createFrame/insertFrame/duplicateFrame/removeFrame）
├─ ✅ useFramePlayback hook（RAF 循环，isFramePlaying → nextFrame/updateFrameImageData）
├─ ✅ 帧切换保存/恢复（SketchCanvas：FBO readPixels → ImageData → frameSlice，texSubImage2D 还原）
├─ ✅ 洋葱皮渲染（OffscreenCanvas tinting：前帧绿 / 后帧红，2D canvas overlay，viewport 同步）
├─ ✅ FrameTimeline UI（时间轴 + 帧缩略图）
├─ ✅ FrameControls UI（添加/复制/删除帧 + FPS 控制 + 播放/暂停）
└─ ✅ 序列帧导出（spritesheet-export.ts：PNG 序列 / Aseprite / TexturePacker JSON 格式）

AI 辅助（S.4 阶段实现）：
├─ 📋 2D 角色 AI 生成（Text-to-Image）
├─ 📋 AI 自动分层（单图 → 多图层）
└─ 📋 AI 辅助骨骼绑定建议
```

### Phase S.3：2D 特效 + 场景 + 物品 🔄 进行中

**目标**：粒子/滤镜/场景编辑/资产绘制

**实施状态**（2026-03-14）：

```
特效 - 滤镜（2026-03-14 完成）：
├─ ✅ FilterPipeline（filter-pipeline.ts：ping-pong FBO，applyFilters()）
├─ ✅ FilterRegistry（filter-registry.ts：10 个内置滤镜定义）
├─ ✅ 10 个内置 GLSL ES 3.0 滤镜（filter-shaders.ts）：
│   ├─ blur 类：gaussian-blur（radius 0-50）
│   ├─ color 类：brightness-contrast / hue-saturation / exposure(-3..3 stops) / temperature / (lightness)
│   ├─ stylize 类：sharpen / vignette / glow(intensity+radius) / film-grain
│   └─ distort 类：chromatic-aberration
├─ ✅ filterSlice（Zustand：addFilter/removeFilter/updateFilter/reorderFilters/toggleFilter）
├─ ✅ FilterPanel UI（filter-panel.tsx：拖拽排序 + 参数滑块 + 启用/禁用）
└─ ✅ 渲染管线接入（SketchCanvas → renderer.renderWithEffects() → filter chain）

特效 - 粒子（待实现）：
├─ 📋 2D 粒子系统（WebGL，可配置发射器/轨迹/生命周期）
│      注：particle-emitter.ts 已有基础框架（emitParticles/updateParticles），待完善 UI
└─ 📋 序列帧特效编辑器（sprite sheet 制作 + 预览）

场景（待实现）：
├─ 📋 多图层场景编辑器
├─ 📋 视差滚动系统（每图层独立 parallax 系数）
├─ 📋 场景模板库
└─ 📋 氛围效果（光效/粒子叠加）

场景（2026-03-14 完成）：
├─ ✅ sceneSlice（Zustand：createScene/deleteScene/addSceneLayer/removeSceneLayer/updateSceneLayer/updateCamera/setAtmosphere）
├─ ✅ types/scene.ts（Scene/SceneLayer/CameraConfig/AtmosphereConfig/AtmospherePreset）
├─ ✅ ScenePanel UI（场景选择 + 模板创建 + 图层管理 + 相机缩放 + 视差系数）
├─ ✅ AtmospherePanel UI（preset 选择 + 强度/风力参数，preset ≠ none 时显示）
├─ ✅ scene-templates.ts（4 种模板：platformer/topdown-rpg/visual-novel/side-scroller）
├─ ✅ atmosphere-presets.ts（atmosphereToEmitter：5 种预设 → ParticleEmitterConfig）
└─ ✅ 大气效果接入渲染管线（SketchCanvas 自动将场景大气转为粒子 emitter 传入 renderWithEffects）

物品/资产（2026-03-14 完成）：
├─ ✅ pixel-tool.ts（drawPixel / drawLine / floodFill，PixelBrushSize 1/2/4/8）
├─ ✅ PixelGrid 组件（zoom ≥ 4 时显示像素网格 CSS overlay）
├─ ✅ PixelGrid 接入 SketchCanvas（absolute overlay，pointer-events:none）
├─ ✅ vector-tool.ts（createPath/moveTo/lineTo/cubicTo + createRectangle/createEllipse/createPolygon/createStar）
├─ ✅ vector-renderer.ts（renderPath/renderPaths → Canvas2D；exportSVG → SVG 字符串）
├─ ✅ VectorToolbar UI（path/rectangle/ellipse/polygon/star 切换 + sides/points 参数）
└─ 📋 资产管理（→ neko-assets 集成，S.4 阶段）
```

**S.3 已完成所有任务**：

| 任务 | 状态 | 说明 |
|------|------|------|
| 滤镜面板 | ✅ | FilterPanel + WebGL effect pipeline |
| 像素网格 | ✅ | PixelGrid CSS overlay，zoom ≥ 4 时显示 |
| 大气效果 | ✅ | atmosphereToEmitter() 接入 renderWithEffects |
| 场景模板 | ✅ | ScenePanel + 4 种预设模板 |
| Vector 拖拽预览 | ✅ | Canvas2D overlay，onStrokeMove 实时绘制 |
| 序列帧播放器 | ✅ | SpriteSheetPlayer：拖拽导入 + RAF 播放 + 帧缩略图 |

**S.4 剩余任务**：

| 任务 | 优先级 | 说明 |
|------|--------|------|
| neko-assets 集成 | S.4 | 资产管理对接 |

### Phase S.4：AI 辅助 + 跨模块集成

**目标**：AI 工具、与时间线/画布/3D 联动

```
AI MCP Tools：
├─ sketch.generate（文本 → 2D 图像）✅ P1 完成（SketchGenerate MCP tool，2026-03-28）
├─ sketch.style_transfer（风格迁移）
├─ sketch.auto_layer（自动分层）
├─ sketch.auto_rig（骨骼绑定建议）
├─ sketch.inpaint（局部重绘）
└─ sketch.upscale（AI 超分辨率）

跨模块集成：
├─ → neko-cut（2D 动画序列 → 时间线 Scene2D 元素）
├─ → neko-canvas（2D 资产 → 画布节点）
├─ → neko-model（2D 纹理 → 3D 材质贴图）
├─ → neko-live（Inochi2D → 面部追踪驱动，参数值映射）
└─ → neko-assets（PSD/Inochi2D .inp 文件资产化）
```

---

## 11. 混合策略：内置轻量创作 + MCP 桥接专业软件

### 11.1 策略定位

neko-sketch 不追赶 Photoshop/Clip Studio 的专业绘画能力，而是聚焦 AI 辅助 + 一体化工作流。

```
                功能深度 →
            低                    高
      ┌─────────────────────────────────┐
   高 │                                 │
      │  neko-sketch ⭐                 │  Photoshop + AI 插件
   A  │  （轻量 + AI 原生              │  （专业 + 功能完整）
   I  │    + 一体化工作流）             │
   集 │                                 │
   成 │                                 │
   度 │                                 │
      │  Canva / Figma                  │  Clip Studio / Procreate
   低 │  （在线轻量编辑）              │  （专业绘画）
      │                                 │
      └─────────────────────────────────┘
```

### 11.2 三层互补架构

```
Layer 1: 内置轻量 2D 创作（neko-sketch）
├── 基础绘画（画笔/图层/选区/压感）
├── Inochi2D 预览 + 参数控制（native-puppet + WebGL2）
├── 逐帧动画编辑
├── AI 生成 + 自动分层 + 风格迁移
├── 手绘关键帧 → AI 视频输入（Image-to-Video）
└── 适合：快速原型、AI 参考图、简单素材、关键帧制作

Layer 2: MCP 桥接专业软件（可选安装）
├── Photoshop MCP → 专业图像处理 / 精细绘画
├── ComfyUI MCP → ControlNet + 高级 AI 图像 pipeline
├── Inochi2D Creator → 专业 2D 骨骼绑定（外部工具，开源免费）
└── 适合：专业级绘画、精细骨骼绑定、高级 AI 图像

Layer 3: AI 生成（neko-agent，已实现）
├── Text-to-Image / Image-to-Image
├── Text-to-Video / Image-to-Video（Runway/Luma/Vidu）
├── 输入来自 Layer 1 或 Layer 2
└── 输出进入 neko-cut 时间线
```

### 11.3 内置 vs 桥接的分工

| 能力 | 内置（neko-sketch） | 桥接（外部软件） | 判定 |
|------|-------------------|-----------------|------|
| 基础绘画 + 压感 | ✅ | — | 内置 |
| 图层 + 混合模式 | ✅ | — | 内置 |
| Inochi2D 预览 + 参数控制 | ✅ | — | 内置 |
| 逐帧动画 | ✅ | — | 内置 |
| AI 图像生成 | ✅ | — | 内置 |
| AI 自动分层 | ✅ | — | 内置（AI 原生） |
| 专业绘画/修图 | — | ✅ Photoshop MCP | 桥接 |
| 专业骨骼绑定 | — | ✅ Inochi2D Creator | 桥接 |
| ControlNet pipeline | — | ✅ ComfyUI MCP | 桥接 |
| PSD 高级编辑 | — | ✅ Photoshop MCP | 桥接 |

### 11.4 对 AI 视频创作的协同价值

neko-sketch 在 AI 视频工作流中的核心价值：

| 用途 | 具体场景 | 价值 |
|------|---------|------|
| **关键帧手绘** | 手绘构图 → Image-to-Video | 精确控制 AI 视频画面 |
| **角色设计** | AI 生成 + 手动微调 → 角色参考图 | 保证角色一致性 |
| **风格参考** | 手绘风格样板 → 风格迁移 | 统一视频风格 |
| **分镜草图** | 快速草图 → 批量 AI 视频生成 | 加速分镜到视频 |
| **后期修正** | AI 视频帧截取 → 手动修正 → 重新生成 | 修复 AI 瑕疵 |

---

## 12. 分镜系统架构（Storyboard System）

> 分析日期：2026-03-28
> 参考：liblibtv 脚本视图（表格）+ 创意视图（卡片网格）交互截图

### 12.1 职责划分

```
neko-story（数据 SSOT + 编辑界面）
  ├── 脚本视图（ScriptTableView）     → 表格编辑，多列扩展，角色/景别/情绪录入
  └── 创意视图（CreativeGridView）    → 卡片网格，同一数据的视觉化

neko-canvas（空间排布 + 生图入口）
  ├── ShotNode                        → 单镜节点，引用脚本视图数据
  └── SceneGroupNode（extends Group） → 场景容器，包含多个 ShotNode
```

**原则：脚本视图 / 创意视图不内嵌入 neko-canvas。**

- neko-story 拥有分镜数据（`.nks` 文件扩展）和两种编辑视图
- neko-canvas 中的 ShotNode 是空间展示节点，点击触发 GenerationPromptPanel（§7.2）
- 数据单向流：neko-story 修改 → ShotNode 反映；canvas 的图片生成结果回写 neko-story

### 12.2 ShotNode 数据模型

从脚本视图列定义完整的 `ShotNode` 数据结构：

```typescript
// 替换/扩展现有 StoryboardNode
interface ShotNodeData {
  // Identity
  shotNumber: number;
  sceneGroupId?: string;         // 所属 SceneGroupNode ID

  // Core
  duration: number;              // 时长（秒）
  visualDescription: string;     // 画面描述

  // Multi-character（动态数组，非固定角色1/角色2）
  characters: ShotCharacter[];

  // Shot metadata（脚本视图完整列集）
  shotScale: ShotScale;          // 景别
  cameraMovement?: CameraMovement; // 运镜
  cameraAngle?: CameraAngle;     // 机位
  characterAction: string;       // 角色动作（合并描述）
  emotion: string[];             // 情绪标签
  sceneTags: string[];           // 场景标签
  referenceNodeId?: string;      // 参考图（画布上其他节点 ID）

  // Generation state
  generatedImage?: string;       // base64 AI 生成分镜图
  generationStatus: ShotGenerationStatus;
  generationHistory: GeneratedImageVersion[]; // 多版本候选
}

interface ShotCharacter {
  name: string;
  description: string;           // 角色描述
  referenceNodeId?: string;      // 角色参考图节点 ID（用于 IP-Adapter 注入）
  action?: string;               // 该角色在本镜的动作
}

type ShotScale =
  | 'extreme-close'   // 特写
  | 'close'           // 近景
  | 'medium-close'    // 中近景
  | 'medium'          // 中景
  | 'medium-full'     // 中全景
  | 'full'            // 全景
  | 'long'            // 远景
  | 'extreme-long'    // 大全景
  | 'overhead'        // 俯拍
  | 'pov'             // 主观视角
  | 'medium-group';   // 中景组接

type CameraMovement = 'push' | 'pull' | 'pan' | 'tilt' | 'track' | 'crane' | 'handheld' | 'static';
type CameraAngle = 'eye-level' | 'high' | 'low' | 'dutch' | 'overhead';
type ShotGenerationStatus = 'none' | 'pending' | 'generating' | 'done' | 'error';

interface GeneratedImageVersion {
  imageData: string;             // base64
  timestamp: number;
  prompt: string;                // 生成时使用的 prompt（含风格/摄像机参数）
}
```

### 12.3 SceneGroupNode（场景容器）

```typescript
interface SceneGroupNodeData {
  sceneNumber: number;
  heading: string;               // 场景标题：INT. 深夜办公室 · 现代
  shotOrder: string[];           // 有序的 ShotNode ID 列表
}
```

`SceneGroupNode` 继承 `GroupNode` 的包围盒逻辑，但：
- 子节点只能是 `ShotNode`
- 在 canvas 中横向排列 ShotNode（左→右 = 镜头顺序）
- 场景内 ShotNode 按 `shotOrder` 顺序渲染，position.x 自动排布

### 12.4 neko-story 双视图架构

```
.nks 文件（或 Fountain 派生）
  └── StoryboardDocument
        ├── title: string
        ├── scenes: StoryboardScene[]
        └── styleConfig: StyleConfig   // 全局画风锁

StoryboardScene
  ├── id / heading / sceneNumber
  └── shots: StoryboardShot[]

StoryboardShot = ShotNodeData（共享类型，定义于 @neko/shared）
```

**脚本视图（ScriptTableView）**：

```
列定义（固定列 + 动态角色列）：
  镜号 | 时长 | 画面描述
  [角色N | 角色描述N | 角色图N] × N  ← 动态列组，角色数决定列数
  参考 | 景别 | 角色动作 | 情绪 | 场景标签 | [自定义列...]
```

关键设计：角色列是**动态列组**（非固定角色1/角色2），按镜头中实际角色数量生成列。

**创意视图（CreativeGridView）**：

```
Shot 卡片布局（对标 liblibtv 创意视图）：
┌─────────────────────────────────────┐
│  #1                        5.00s    │
│  ┌─────────────────────────────┐   │
│  │   生成图 / 暂无图片 占位     │   │  ← 点击触发 GenerationPromptPanel
│  └─────────────────────────────┘   │
│  [沈昭昭]              ← 角色标签   │
│  现代深夜，沈昭昭在凌乱...          │
│  特写 · 极度紧张                    │
│  场景 1                             │
└─────────────────────────────────────┘
```

### 12.4.1 GalleryNode（多视图画廊节点）

> 角色三视图 / 四视图 / 九宫格表情表等多视图参考图的专用节点类型（新增 `gallery`）

**为什么不用 ArtboardNode + 子节点**：子节点是独立画布对象，无法作为整体引用/导出；GalleryNode 将多图作为**内聚数据**管理，可整节点移动/导出，且每格可独立生成。

```typescript
type GalleryLayout =
  | '1x2' | '1x3' | '1x4'   // 横向条带（二/三/四视图）
  | '2x2' | '2x3' | '3x3'   // 网格（四格/六格/九宫格）
  | 'custom';

type GalleryPreset =
  | 'character-3view'   // 正面 / 侧面 / 背面
  | 'character-4view'   // 正面 / 3/4面 / 侧面 / 背面
  | 'expression-9'      // 表情九宫格
  | 'turnaround-8'      // 360°转面 8方向（2×4）
  | 'custom';

interface GalleryCell {
  id: string;
  label: string;         // '正面' / '侧面' / '开心'...
  image?: string;        // base64
  prompt?: string;       // 单格独立 prompt（覆盖全局前缀）
  generationStatus: 'none' | 'pending' | 'generating' | 'done' | 'error';
}

interface GalleryCanvasNode extends CanvasNodeBase {
  type: 'gallery';
  data: {
    preset: GalleryPreset;
    layout: GalleryLayout;
    rows: number;
    cols: number;
    cells: GalleryCell[];            // length === rows × cols
    globalPromptPrefix?: string;     // 全局风格/角色前缀，所有格子共享
    characterName?: string;          // 角色名，用于 IP-Adapter 绑定
  };
}
```

**预置模板与格子标签**：

| Preset | Layout | 格子标签 |
|--------|--------|---------|
| `character-3view` | 1×3 | 正面 / 侧面 / 背面 |
| `character-4view` | 1×4 | 正面 / 3/4面 / 侧面 / 背面 |
| `expression-9` | 3×3 | 喜 / 怒 / 哀 / 惊 / 蔑 / 恐 / 疑 / 冷 / 哭 |
| `turnaround-8` | 2×4 | 0° / 45° / 90° / 135° / 180° / 225° / 270° / 315° |
| `custom` | 任意 | 用户自定义标签 |

**GalleryNode × 分镜角色一致性**：

```
GalleryNode（沈昭昭·三视图）
  ├── cell[0] 正面  ─→ ShotNode @引用 → IP-Adapter 正面参考
  ├── cell[1] 侧面  ─→ ShotNode @引用 → IP-Adapter 侧面参考
  └── cell[2] 背面  ─→ 同理

GenerationPromptPanel 中 @引用粒度 = 单格（cell），而非整个 GalleryNode
→ 根据镜头摄像机角度自动建议引用对应格子
```

**生成交互**：
- 点击单格 → GenerationPromptPanel（单格 prompt，含摄像机角度提示）
- "批量生图" → 顺序生成所有空格，globalPromptPrefix + 格子 label 组合 prompt
- "导出参考图" → 合并所有格子为单张图片（适合发给外部协作者）

### 12.5 批量生图调度器（BatchGenerationScheduler）

"全部分镜一键生图"需要队列/并发控制，不能直接逐个调用 GenerationPromptPanel：

```
BatchGenerationScheduler（neko-agent Extension Host 侧）
  ├── 队列：ShotNode[] 按 SceneGroup + shotOrder 排列
  ├── 并发控制：maxConcurrent = 2（防止 API 限流/超时）
  ├── 进度回传：{ total, done, failed, currentShotId }
  │         → postMessage → canvas webview → 每卡实时更新 generationStatus
  ├── 失败重试：指数退避（1s / 2s / 4s），最多 3 次
  ├── 单镜重试：从创意视图卡片右键触发，跳过已完成的镜
  └── 取消：AbortController 全局取消，已完成的不回滚

进度订阅（canvas webview）：
  → onMessage({ type: 'batch.progress', ... })
  → ShotNode generationStatus 实时更新
  → 全部完成 → 通知弹窗（含失败统计）
```

### 12.6 自动 Prompt 生成（中文描述 → 英文 Prompt）

图像生成 API 通常需要英文 prompt，GenerationPromptPanel 必须支持自动翻译/扩写：

```
用户输入（中文）：现代深夜，沈昭昭在凌乱的办公室疯狂加班
  + 角色描述（角色名 + GalleryNode 选中格标签）
  + 景别（特写）+ 情绪（极度紧张）+ 摄像机（eye-level）
        ↓
neko-agent LLM（轻量 prompt 工程）
        ↓
结构化英文 prompt：
  "extreme close-up shot, eye-level angle, modern office interior at midnight,
   young Asian woman with black-framed glasses frantically typing,
   blue monitor glow reflecting on exhausted face, papers and coffee cups scattered,
   cinematic lighting, photorealistic, highly detailed"
```

实现：GenerationPromptPanel 的"发送"按钮触发前，先调用 `neko.agent.buildPrompt(shotContext)` → LLM 返回英文 prompt → 可预览/编辑 → 再调用生图。

### 12.7 分镜导出

| 导出格式 | 用途 | 实现方案 |
|---------|------|---------|
| **PDF 分镜表** | 发送导演/甲方审核 | `html-to-image` 每镜渲染 → `jsPDF` 拼装（每页含镜号/时长/画面图/台词） |
| **图片包（ZIP）** | 外部协作/存档 | `JSZip` 按场景目录打包，文件名 `场景N_镜M_label.png` |
| **导入 neko-cut** | 生成视频粗剪底稿 | 分镜图 → `MediaElement`（duration 来自 ShotNode.duration）+ 字幕轨（dialogue 字段） |

### 12.8 生图候选选择 UI

`GeneratedImageVersion[]` 已在 ShotNode 数据模型，交互设计：

```
创意视图卡片（有候选时）：
  ┌──────────────────────────┐
  │  [图片]         ← 当前采用  │
  │  ◀  1 / 3  ▶            │  ← 滑动切换候选
  │  [确认采用] [重新生成]    │
  └──────────────────────────┘
单次生成张数：1-4 张（GenerationPromptPanel 底部 "N张" 选择器）
```

### 12.9 补充字段（ShotNode + GalleryNode）

```typescript
// ShotNodeData 补充
dialogue?: string;       // 该镜头对白（从 Fountain 提取或手动输入）
voiceOver?: string;      // 画外音/旁白
soundCue?: string;       // 音效/音乐备注

// GalleryCell 补充
costumeLabel?: string;   // '现代职场' / '唐代宫装'（同一角色多套服装）
```

### 12.10 视图与数据流总结

```
Fountain / 手动录入
      ↓
neko-story SSOT（.nks）
      ├──→ 脚本视图（ScriptTableView）   ←→ 用户编辑所有字段（含台词/音效）
      ├──→ 创意视图（CreativeGridView）
      │       ├── 单镜点击 → GenerationPromptPanel（含自动 prompt 生成）
      │       ├── 批量生图 → BatchGenerationScheduler → 进度实时更新
      │       ├── 候选选择 → GeneratedImageVersion[] 滑动切换
      │       └── 导出 → PDF / ZIP / neko-cut 时间线
      │
      └──→ neko-canvas ShotNode + SceneGroupNode   → 空间构图
               + GalleryNode（角色/场景多视图参考）
               + GenerationPromptPanel（@引用单格 cell）
```

---

## 13. neko-canvas 资产导入与节点扩展

> 分析日期：2026-03-28
> 代码审计：useDragDrop / canvasEditorProvider / CanvasToolbar / useVSCodeMessages

### 13.1 当前导入能力（代码实测）

| 方式 | 支持类型 | 状态 |
|------|---------|------|
| Explorer 拖拽 | image / video / audio | ✅ 完整 |
| 素材库拖拽 | image / video / audio | ✅ 完整（`application/json` 协议）|
| 工具栏按钮 → 文件选择器 | image / video / audio | ⚠️ 85%（缺 `pickMedia` handler）|
| PathVariable 解析 | `${VAR}/path` | ✅ 完整 |
| 文档类型（PDF/DOCX/Fountain） | — | ❌ 未支持 |
| AI 模型节点 | — | ❌ 未支持 |

**最小修复**：`canvasEditorProvider.ts` 补 `case 'pickMedia'` handler（已有 showOpenDialog 调用样板），工具栏文件选择立即可用。

### 13.2 待新增节点类型

#### ScriptNode（剧本节点）

```typescript
interface ScriptCanvasNode extends CanvasNodeBase {
  type: 'script';
  data: {
    filePath: string;            // .nks / .fountain
    title: string;
    sceneCount: number;
    characterCount: number;
    // 展示模式：TOC 目录（不渲染全文）
    expandedSceneIds: string[];  // 当前展开的场景 ID
    linkedSceneGroupIds: Record<string, string>; // sceneId → SceneGroupNode ID
  };
}
```

**渲染策略（TOC 模式）**：通过 `neko-story.getScriptIndex(path)` 获取 `scenes[]`，仅渲染场景目录，不渲染全文。全文过长（100+ 场景）不适合在画布内展开。

```
ScriptNode 渲染：
┌────────────────────────────────────┐
│ 📄 我在盛唐写天下            .nks  │
│ ─────────────────────────────────  │
│ ▶ 【序幕】               3 镜      │  ← 折叠，点击展开
│ ▼ 【现代·深夜办公室】     5 镜      │  ← 展开，显示分镜列表
│   ├── 镜1 沈昭昭·深夜加班          │
│   └── 镜2 视觉黑暗...              │
│ [筛选场景] [在 neko-story 中打开]  │
└────────────────────────────────────┘
```

点击场景 → 高亮/导航到画布上对应的 SceneGroupNode（若已创建）。

#### DocumentNode（文档节点）

```typescript
interface DocumentCanvasNode extends CanvasNodeBase {
  type: 'document';
  data: {
    filePath: string;
    docType: 'pdf' | 'docx' | 'epub' | 'xlsx' | 'pptx';
    title: string;
    pageCount?: number;
    thumbnailData?: string;       // 首页/封面 base64 缩略图
    summary?: string;             // AI 摘要（可选）
  };
}
```

渲染：封面缩略图 + 文件名 + 页数徽标 + "在预览器中打开"按钮（委托 document-preview ADR 策略）。

#### ModelNode（AI 模型节点）

```typescript
type ModelNodeRole = 'reference' | 'workflow';

interface ModelCanvasNode extends CanvasNodeBase {
  type: 'model';
  data: {
    modelId: string;             // neko-market 中的模型 ID
    name: string;
    modelType: 'image-gen' | 'llm' | 'audio' | 'video-gen';
    paramCount?: string;         // '3.5B' / '7B'
    installed: boolean;
    role: ModelNodeRole;
    // workflow 模式时有出口 port → 连接到 ShotNode
    // reference 模式时仅展示信息
  };
}
```

**两种语义**：
- `reference`：展示画板中使用了哪个模型（信息卡）
- `workflow`：有出口 port，连接 ShotNode 指定该镜头使用此模型生图

#### CanvasEmbedNode（嵌套画布）

```typescript
interface CanvasEmbedCanvasNode extends CanvasNodeBase {
  type: 'canvas-embed';
  data: {
    filePath: string;            // .nkc 文件
    title: string;
    thumbnailData?: string;      // 画布缩略图 base64
    nodeCount: number;
  };
}
```

渲染为缩略图 + 双击打开嵌套画布（`vscode.commands.executeCommand('vscode.open', uri)`）。

### 13.3 章节筛选策略

| 内容类型 | 数据量 | 策略 |
|---------|--------|------|
| 剧本（ScriptNode） | 100+ 场景 | TOC 折叠目录；`getScriptIndex` 只取结构不取全文 |
| PDF（DocumentNode） | 1000+ 页 | 只显示封面缩略图 + 页数，点击委托 neko-preview |
| AI 模型列表 | 10-50 个 | 从 neko-market 查询，节点仅绑定单个模型 ID |
| 画布引用（CanvasEmbed） | 任意 | 缩略图 + 节点数，不递归渲染内容 |

**原则：画布节点是"入口"，不是"查看器"**——复杂内容委托专用扩展打开。

### 13.4 扩展后的节点类型全集

```typescript
// @neko/shared types/canvas.ts
export type CanvasNodeType =
  // 现有
  | 'media'          // image / video / audio
  | 'storyboard'     // 旧版（迁移到 'shot'）
  | 'annotation'     // 文本标注
  | 'group'          // 分组容器
  // Webview 扩展（已有）
  | 'text'           // 富文本
  | 'artboard'       // 画板（固定尺寸容器）
  // 分镜系统（§12）
  | 'shot'           // 分镜节点（替换 storyboard）
  | 'scene'          // 场景容器（SceneGroupNode）
  | 'gallery'        // 多视图画廊（角色三视图/九宫格）
  // 资产扩展（§13）
  | 'script'         // 剧本节点（TOC 模式）
  | 'document'       // 文档节点（PDF/DOCX/EPUB）
  | 'model'          // AI 模型节点（参考卡/工作流）
  | 'canvas-embed';  // 嵌套画布引用
```

---

## 附录：关键技术依赖

| 依赖 | 用途 | 许可 |
|------|------|------|
| **inox2d** | Inochi2D 格式解析 + 变形计算 | BSD 2-Clause |
| **bevy_ecs** | ECS 框架（native-puppet 后端） | MIT / Apache 2.0 |
| **bevy_animation** | 动画曲线回放（ParameterCurve → inox2d 参数值） | MIT / Apache 2.0 |
| ~~spine-ts~~ | ~~Spine 骨骼运行时~~ | ❌ 已否决（Spine Runtimes License + 功能重叠） |
| ~~Cubism SDK Web~~ | ~~Live2D 渲染~~ | ❌ 已否决（商业许可 + 法律风险） |
| **PixiJS** | 可选 2D WebGL 渲染框架 | MIT |
| **Pointer Events API** | 压感/倾斜输入 | Web 标准 |
| WGSL shaders（复用） | 滤镜/混合模式 | 内部资产 |

## 附录：关键约束

| 约束 | 原因 | 影响 |
|------|------|------|
| Webview 沙箱 | VSCode 安全策略 | 对 2D 创作几乎无影响 |
| 无本地文件访问 | 沙箱限制 | PSD 文件通过 Extension Host 读写 |
| ~~Live2D 商业许可~~ | ~~Cubism SDK 协议~~ | ❌ 已否决，改用 inox2d（BSD 2-Clause） |
| ~~Spine Runtimes License~~ | ~~非 MIT，分发限制~~ | ❌ 已否决，统一用 inox2d |
| inox2d 上游动画未实现 | 无法从 INP 读取预录动画 | bevy_animation 自定义 ParameterCurve 驱动，不依赖上游 |
| inox2d MeshGroup 未实现 | 新版模型可能异常 | 限制支持 Inochi2D 0.7 格式 |
| 外部编辑器依赖 | Inochi2D 骨骼绑定在外部工具（Inochi2D Creator）完成 | neko-sketch 定位为运行时 + 预览 + 参数控制 |

## 附录：否决决策记录

### ADR-2D-001: Live2D Cubism SDK 否决

- **日期**：2026-03-12
- **决策**：不集成 Live2D Cubism SDK Web
- **原因**：neko-sketch 作为"可扩展应用"属于 Cubism SDK 许可证中需要单独审批签约的类别，法律风险高
- **替代方案**：使用 inox2d（Inochi2D 开源实现，BSD 2-Clause）

### ADR-2D-002: Spine 许可证标注（历史记录）

- **日期**：2026-03-12
- **状态**：已被 ADR-2D-004 取代（Spine 整体否决）
- **历史修正**：spine-ts 运行时许可证**不是 MIT**，而是 Spine Runtimes License，有分发条件限制

### ADR-2D-003: inox2d + Bevy 全框架否决

- **日期**：2026-03-12
- **决策**：不使用 Bevy 全框架集成 inox2d
- **原因**：WASM 体积 3.5-30MB、渲染管线冲突、与项目 ADR（bevy_ecs 独立 crate，不用 Bevy 全框架）矛盾
- **采纳方案**：native-puppet crate（bevy_ecs 0.15 + inox2d），对称 native-scene 模式

### ADR-2D-005: bevy_animation 驱动 inox2d 动画回放

- **日期**：2026-03-13
- **决策**：在 native-puppet crate 内引入 `bevy_animation`，以自定义 `ParameterCurve` 驱动 inox2d 参数值，实现动画回放
- **原因**：
  1. inox2d 上游动画层尚未实现，等待上游会阻塞 Phase S.2
  2. `bevy_animation` 已有完整的 AnimationClip / AnimationPlayer / 曲线插值体系，MIT/Apache 2.0 许可
  3. inox2d 的"动画 = 参数值随时间变化"与 bevy_animation 的曲线模型天然契合，只需自定义 `AnimationTarget` → `ParameterBinding` 桥接层
  4. 与 native-scene（3D）共享同一 bevy_animation 依赖，无额外引入成本
- **架构边界**：
  - `animation.rs`：`AnimationClip` 中每个 channel 对应一个 inox2d 参数名 + `f32` 曲线
  - `systems.rs`：`animation_tick` system 在 `parameter_update` 之前运行，将曲线求值结果写入 `ParameterBinding`
  - 上游 inox2d 实现动画后可无缝替换，bevy_animation 层作为过渡兼容保留
- **WebSocket 实时流**：新增 `WS /v1/puppets/stream`，native-puppet 以 60fps 主动推送 `PuppetDelta`，供 neko-live 面部追踪驱动，避免 HTTP round-trip 延迟

### ADR-2D-006: 滤镜系统接入渲染管线

- **日期**：2026-03-14
- **决策**：在 `SketchCanvas` 渲染循环中将 `renderer.render()` 替换为 `renderer.renderWithEffects()`，接通 `FilterPipeline` → `FilterRegistry` → `filterSlice` 完整链路
- **背景**：`FilterPipeline`、`FilterRegistry`、`FilterPanel` 和 `filterSlice` 已经完整实现，但渲染循环调用的仍是不含滤镜的 `render()` 方法，导致所有滤镜设置完全无效
- **变更内容**：
  1. `SketchCanvas.tsx`：RAF 循环改为 `renderer.renderWithEffects(layers, viewport, filters, emitters, isParticlePreviewActive, dt)`
  2. 新增 4 个 GLSL ES 3.0 滤镜着色器（`filter-shaders.ts`）：exposure / temperature / glow / film-grain（从 neko-engine WGSL 转译）
  3. `filter-registry.ts`：注册新增 4 个滤镜，内置滤镜总数达 10 个
- **架构意义**：滤镜管线与逐帧动画相互独立，滤镜应用于合成后的完整图层栈，而非单帧；onion skin overlay 在滤镜之后由 2D canvas 覆盖渲染，不受滤镜影响

### ADR-2D-007: neko-canvas 内嵌生图面板委托模式

- **日期**：2026-03-28
- **背景**：liblibtv 分析显示，图片节点点击后弹出内嵌生图对话框是核心 UX，支持 prompt + 风格 + @引用素材（角色一致性）+ 摄像机控制。
- **决策**：neko-canvas webview 内嵌轻量 `GenerationPromptPanel`（纯 UI），AI 执行完全委托给 neko-agent Extension Host，**不在 canvas webview 内引入任何 AI Provider 逻辑**。
- **原因**：
  1. neko-agent 已有完整的 `MediaGenerationService` + 模型路由 + API Key 管理，重复实现代价高
  2. canvas webview 遵循沙箱限制，无法直接访问 API Key 或外部网络
  3. 委托模式保持单一职责：canvas 管 UI + 节点状态，agent 管 AI 执行
  4. 用户不需要看到 agent webview panel —— agent Extension Host 作为后台服务透明执行
- **数据流**：`canvas postMessage` → `canvasEditorProvider` → `executeCommand('neko.agent.generateForNode')` → `MediaGenerationService` → 进度回传 → `canvas updateNodeImage`
- **`@引用素材` 角色一致性**：canvas 节点的 base64 图片数据随 referenceAssets[] 传给 agent，agent 注入为 IP-Adapter reference；neko-agent 侧需新增 `generateForNode` 命令处理函数。
- **摄像机控制**：景别/机位参数转换为结构化 prompt suffix，由 `cameraHintToPromptSuffix()` 函数处理（canvas 侧实现）。

### ADR-2D-004: Spine 整体否决，统一 inox2d

- **日期**：2026-03-13
- **决策**：不集成 Spine（spine-ts），以 inox2d 作为唯一 2D 骨骼动画引擎
- **原因**：
  1. Spine Runtimes License 非开源，有分发条件限制，增加法律风险
  2. Spine 与 inox2d 功能存在重叠，维护两套运行时代价高
  3. neko-sketch 定位为 VTuber / 立绘 / AI 视频工作流，inox2d 参数驱动模型更契合
  4. inox2d BSD 2-Clause 许可与整体开源策略一致
- **影响**：
  - 移除 `animation/spine/` 目录及 spine-ts 依赖
  - 专业骨骼绑定通过 Inochi2D Creator（外部工具，开源免费）+ MCP 桥接完成
  - Spine 格式文件（`.skel`/`.atlas`）不再支持导入
