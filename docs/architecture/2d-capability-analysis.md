# 2D 创作能力架构分析

> 日期：2026-03-09（更新：2026-03-12）
> 状态：S.1 已实施完成
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
| 人物 | 2D 立绘 / Live2D / Spine | 3D 骨骼 mesh / VRM |
| 特效 | 2D 滤镜 / 平面粒子 | GPU 粒子（体积）/ 后处理 |
| 场景 | 图层叠加 / 视差滚动 | HDR 环境 / 天空盒 / 地形 |
| 物品 | 像素/矢量绘制 | 参数化几何体 / CSG |
| 动画 | 逐帧 / Spine / Live2D | 3D 骨骼 / Morph Target |
| 输出 | PNG/SVG/PSD + 序列帧 | glTF/GLB/VRM + 视频渲染 |
| 典型用户 | 插画师、2D 动画师、UI 设计 | 3D 建模师、场景设计 |

### 1.2 与其他包的关系

```
neko-sketch（2D 创作）
├── 输出 → neko-cut（2D 动画序列嵌入时间线）
├── 输出 → neko-canvas（2D 资产嵌入画布节点）
├── 联动 → neko-model（2D 纹理 → 3D 材质贴图）
├── 辅助 → neko-agent（AI 生成/风格迁移/自动分层）
└── 资产 → neko-assets（2D 资产管理：PSD/Spine/Live2D 文件）
```

---

## 2. 2D 能力矩阵

| 能力 | 技术方案 | 前端实现 | 可行性 |
|------|----------|----------|--------|
| **绘画工具** | Canvas 2D / WebGL 2D | 画笔/形状/选区/图层 | ✅ 完全可行 |
| **压感支持** | Pointer Events API | pressure / tiltX / tiltY | ✅ 完全可行 |
| **图层系统** | 离屏 Canvas 合成 | 25+ 混合模式 | ✅ 完全可行 |
| **Spine 骨骼** | spine-ts 运行时 | WebGL 渲染 + 编辑器 UI | ✅ 完全可行（⚠️ Spine Runtimes License，非 MIT） |
| **Inochi2D** | inox2d + native-puppet | ECS 后端 + WebGL 前端渲染 | ✅ 完全可行（BSD 2-Clause） |
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

### 4.1 两种主流方案对比

| 维度 | Spine | Live2D |
|------|-------|--------|
| **适用风格** | 游戏角色、骨骼驱动 | 立绘 / 日式角色、参数驱动 |
| **变形方式** | 网格变形（mesh deformation） | 参数化变形（cubism physics） |
| **动画原理** | 骨骼 → 插槽 → 附件 → 网格 | 参数值 → 部件 → Artmesh 变形 |
| **Web 运行时** | spine-ts（⚠️ Spine Runtimes License，非 MIT） | Cubism SDK Web（需商业许可） |
| **文件格式** | `.skel` + `.atlas` + `.png` | `.moc3` + `.model3.json` + textures |
| **编辑器** | Spine Editor（独立付费软件） | Live2D Cubism Editor（独立付费软件） |
| **性能** | 轻量，WebGL 渲染高效 | 中等，参数较多时计算量大 |
| **社区** | 游戏行业广泛 | VTuber / 虚拟形象广泛 |

**建议两者都支持**，优先 Spine（开源运行时 + 游戏行业标准），Live2D 作为 VTuber 场景补充。

### 4.2 Spine 骨骼集成

**Spine 运行时架构**：

```
Spine Editor（外部工具）→ 导出 .skel/.json + .atlas + .png
    │
    ▼
neko-sketch 加载 + 预览 + 参数控制
    │
    ├─ spine-ts（WebGL 渲染器）
    │   ├─ Skeleton → Bone → Slot → Attachment
    │   ├─ AnimationState（动画混合/队列）
    │   └─ MeshAttachment（网格变形）
    │
    └─ 编辑器 UI
        ├─ 动画列表 + 播放控制
        ├─ 骨骼树查看器
        ├─ 插槽/皮肤切换
        └─ 动画混合参数
```

```typescript
// Spine integration
import { Spine } from '@pixi-spine/all';
// or spine-ts native WebGL renderer

interface SpineController {
  loadSkeleton(skelPath: string, atlasPath: string): Promise<void>;
  playAnimation(name: string, loop: boolean): void;
  setMix(from: string, to: string, duration: number): void;  // animation blending
  setSkin(name: string): void;         // skin switching
  setBoneTransform(bone: string, transform: Transform2D): void;  // manual bone control
  getAvailableAnimations(): string[];
  getAvailableSkins(): string[];
}
```

**Spine 骨骼层级**：

```
Root Bone
├── Hip
│   ├── Torso → Chest → Neck → Head
│   │                          ├── Hair (IK)
│   │                          └── Face Slot
│   ├── LeftArm → LeftForearm → LeftHand
│   ├── RightArm → RightForearm → RightHand
│   ├── LeftLeg → LeftShin → LeftFoot
│   └── RightLeg → RightShin → RightFoot
└── Shadow (transform constraint)
```

### 4.3 Inochi2D / inox2d 集成（替代 Live2D）

> **ADR: Live2D → inox2d 替代决策**
>
> - **Live2D 否决理由**：Cubism SDK 许可证限制——neko-sketch 作为"可扩展应用"需单独审批签约，法律风险高
> - **inox2d 选择理由**：BSD 2-Clause 开源许可，Inochi2D 格式兼容，社区活跃
> - **inox2d + Bevy 全框架否决**：WASM 体积 3.5-30MB、渲染管线冲突、与项目 ADR（不用 Bevy 全框架）矛盾
> - **最终方案**：参照 3D 的 native-scene + bevy_ecs 模式，将 inox2d 集成到 neko-engine 端（native-puppet crate）

**native-puppet 架构（对称 native-scene）**：

```
Inochi2D Editor（外部工具）→ 导出 .inp 文件
    │
    ▼
neko-engine: native-puppet crate（bevy_ecs 0.15 + inox2d）
    │
    ├─ loader.rs     — INP 解析 → ECS World
    ├─ components.rs — PuppetNodeId, Transform2D, MeshData, ParameterBinding...
    ├─ systems.rs    — parameter_update, physics_tick, transform_propagation_2d
    ├─ world.rs      — trait PuppetWorld + BevyPuppetWorld
    │
    ▼
PuppetService (native-core) → PuppetsController (native-api)
    │
    ├─ POST /v1/puppets/load     — 加载 INP 文件 → PuppetSnapshot
    ├─ POST /v1/puppets/param    — 设置参数 → 重算变形
    ├─ POST /v1/puppets/tick     — 物理步进 → PuppetDelta
    ├─ GET  /v1/puppets/snapshot — 完整快照
    ├─ GET  /v1/puppets/params   — 参数列表
    └─ GET  /v1/puppets/meshes   — 变形后网格数据
    │
    ▼
neko-sketch webview: Inochi2DController → WebGL2 渲染
    │
    └─ 编辑器 UI
        ├─ 参数滑块面板（从 PuppetSnapshot.parameters 动态生成）
        ├─ 节点层级查看器
        └─ 物理模拟开关
```

**数据流**：

```
INP 文件 → EngineClient.loadPuppet(data) → PuppetSnapshot
                                              ├─ nodes: 节点层级
                                              ├─ parameters: 参数定义
                                              └─ meshes: 初始顶点+UV+索引

参数变更 → EngineClient.setPuppetParameter(name, value)
                                              ↓ Rust 端重算变形
                                              ↓
物理步进 → EngineClient.tickPuppet(deltaMs) → PuppetDelta
                                              └─ deformed_meshes: 变形后顶点
                                              ↓
前端 WebGL2 → 更新 VAO 顶点数据 → 按 z-order 渲染
```

```typescript
// Inochi2D controller (replaces Live2DController)
interface IInochi2DController {
  load(data: ArrayBuffer): Promise<PuppetSnapshot>;
  setParameter(name: string, value: number): Promise<void>;
  getParameters(): Promise<ParameterInfo[]>;
  tick(deltaMs?: number): Promise<DeformedMesh[]>;
  getMeshes(): Promise<DeformedMesh[]>;
  getSnapshot(): PuppetSnapshot | null;
  isLoaded(): boolean;
}
```

**inox2d 当前限制**：

| 限制 | 影响 | 应对 |
|------|------|------|
| 动画未实现 | 无法播放预设动画 | 手动参数驱动（滑块 UI），等上游实现后补充 |
| MeshGroup 未实现 | 新版模型可能异常 | 限制支持 Inochi2D 0.7 格式 |
| Composite-as-mask 会 panic | 特定模型崩溃 | 加载时检测并跳过，日志警告 |
| 无 wgpu 渲染器 | 不能直接用 neko-engine GPU | native-puppet 只做数据计算，渲染在前端 WebGL2 |

### 4.4 逐帧动画

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

### 4.5 与 3D 骨骼的对比

| 维度 | 2D 骨骼（Spine/Live2D） | 3D 骨骼（neko-model） |
|------|------------------------|----------------------|
| 变形方式 | 网格变形 / 参数化变形 | 蒙皮权重 + 顶点着色器 |
| 渲染 | WebGL 2D sprite | wgpu PBR / R3F |
| 数据格式 | .skel / .moc3 | glTF / VRM |
| 物理 | Cubism Physics（头发/衣物） | rapier3d |
| 面部追踪 | Live2D 参数映射 | 骨骼 + Blend Shape |
| 编辑器 | 外部工具（Spine/Cubism Editor） | neko-model 内置 |
| 实时驱动 | neko-live → 参数值 | neko-live → 骨骼 Transform |

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

**通过 neko-agent MCP Tools 集成**：

```
AI MCP Tools：
├─ sketch.generate          → Text-to-Image API → 生成 2D 立绘/场景
├─ sketch.style_transfer    → 风格迁移（照片 → 动漫/油画/水彩风格）
├─ sketch.auto_layer        → AI 自动分层（单图 → 线稿/色块/阴影/高光图层）
├─ sketch.auto_rig          → AI 辅助骨骼绑定（2D 立绘 → Spine 骨骼建议）
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

---

## 8. 2D↔3D 联动

| 方向 | 场景 | 数据流 | 复杂度 |
|------|------|--------|--------|
| **2D→3D** | 2D 纹理贴到 3D 模型 | PNG/SVG → neko-model material texture | 低 |
| **2D→3D** | 2D 背景用于 3D 环境 | 绘制环境图 → HDR/Skybox | 中 |
| **3D→2D** | 3D 渲染为 2D 素材 | SceneRenderOutput → PNG 图层 | 低 |
| **2D→时间线** | 2D 动画嵌入视频 | Spine/Live2D → neko-cut Scene2D 元素 | 低 |
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
│       │   │   ├── spine/        # Spine 集成
│       │   │   ├── live2d/       # Live2D 集成
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
neko-sketch webview → @neko/shared, spine-ts, cubism-sdk-web, react
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
- 文档 I/O：.nks JSON 序列化/反序列化、save/load/revert
- 键盘分发：undo/redo/工具切换/缩放重置/导入导出
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

### Phase S.2：2D 人物 + 骨骼动画

**目标**：Spine/Live2D 加载预览、逐帧动画、AI 辅助

```
Spine 集成：
├─ spine-ts 运行时（WebGL 渲染器）
├─ .skel/.json + .atlas 加载
├─ 动画播放/混合控制
├─ 骨骼树查看器 + 皮肤切换
└─ 编辑器 UI（时间轴 + 关键帧）

Live2D 集成：
├─ Cubism SDK Web 运行时
├─ .moc3 + .model3.json 加载
├─ 参数滑块面板（30+ 标准参数）
├─ 表情/动作播放
└─ 物理参数调整

逐帧动画：
├─ 洋葱皮渲染（前帧绿/后帧红）
├─ 帧管理（添加/复制/删除/重排）
├─ FPS 控制 + 循环播放
└─ 序列帧导出（PNG 序列 / sprite sheet）

AI 辅助：
├─ 2D 角色 AI 生成（Text-to-Image）
├─ AI 自动分层（单图 → 多图层）
└─ AI 辅助骨骼绑定建议
```

### Phase S.3：2D 特效 + 场景 + 物品

**目标**：粒子/滤镜/场景编辑/资产绘制

```
特效：
├─ 2D 粒子系统（WebGL，可配置发射器/轨迹/生命周期）
├─ 2D 滤镜（复用 WGSL shader 转 GLSL：模糊/发光/色彩/扭曲）
├─ 序列帧特效编辑器（sprite sheet 制作 + 预览）
└─ 形变动画（路径动画 + 弹性形变）

场景：
├─ 多图层场景编辑器
├─ 视差滚动系统（每图层独立 parallax 系数）
├─ 场景模板库
└─ 氛围效果（光效/粒子叠加）

物品/资产：
├─ 像素绘制模式（网格 + 调色板 + 像素笔刷）
├─ 矢量绘制模式（贝塞尔路径编辑 + SVG 导出）
└─ 资产管理（→ neko-assets 集成）
```

### Phase S.4：AI 辅助 + 跨模块集成

**目标**：AI 工具、与时间线/画布/3D 联动

```
AI MCP Tools：
├─ sketch.generate（文本 → 2D 图像）
├─ sketch.style_transfer（风格迁移）
├─ sketch.auto_layer（自动分层）
├─ sketch.auto_rig（骨骼绑定建议）
├─ sketch.inpaint（局部重绘）
└─ sketch.upscale（AI 超分辨率）

跨模块集成：
├─ → neko-cut（2D 动画序列 → 时间线 Scene2D 元素）
├─ → neko-canvas（2D 资产 → 画布节点）
├─ → neko-model（2D 纹理 → 3D 材质贴图）
├─ → neko-live（Live2D → 面部追踪驱动）
└─ → neko-assets（PSD/Spine/Live2D 文件资产化）
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
├── Spine/Live2D 预览 + 参数控制
├── 逐帧动画编辑
├── AI 生成 + 自动分层 + 风格迁移
├── 手绘关键帧 → AI 视频输入（Image-to-Video）
└── 适合：快速原型、AI 参考图、简单素材、关键帧制作

Layer 2: MCP 桥接专业软件（可选安装）
├── Photoshop MCP → 专业图像处理 / 精细绘画
├── ComfyUI MCP → ControlNet + 高级 AI 图像 pipeline
├── Spine Editor → 专业 2D 骨骼绑定（外部工具）
├── Cubism Editor → 专业 Live2D 建模（外部工具）
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
| Spine/Live2D 预览 | ✅ | — | 内置 |
| 逐帧动画 | ✅ | — | 内置 |
| AI 图像生成 | ✅ | — | 内置 |
| AI 自动分层 | ✅ | — | 内置（AI 原生） |
| 专业绘画/修图 | — | ✅ Photoshop MCP | 桥接 |
| 专业骨骼绑定 | — | ✅ Spine/Cubism Editor | 桥接 |
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

## 附录：关键技术依赖

| 依赖 | 用途 | 许可 |
|------|------|------|
| **spine-ts** | Spine 骨骼运行时 | MIT（运行时免费） |
| **Cubism SDK Web** | Live2D 渲染 | 需 Live2D 商业许可 |
| **PixiJS** | 可选 2D WebGL 渲染框架 | MIT |
| **Pointer Events API** | 压感/倾斜输入 | Web 标准 |
| WGSL shaders（复用） | 滤镜/混合模式 | 内部资产 |

## 附录：关键约束

| 约束 | 原因 | 影响 |
|------|------|------|
| Webview 沙箱 | VSCode 安全策略 | 对 2D 创作几乎无影响 |
| 无本地文件访问 | 沙箱限制 | PSD 文件通过 Extension Host 读写 |
| Live2D 商业许可 | Cubism SDK 协议 | 需评估是否纳入分发 |
| 外部编辑器依赖 | Spine/Live2D 骨骼绑定在外部工具完成 | neko-sketch 定位为运行时 + 预览 + 参数控制 |
