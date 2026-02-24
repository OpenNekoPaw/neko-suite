# 3D 能力集成架构分析

> 日期：2025-06
> 状态：架构决策
> 范围：neko-engine / neko-model / neko-canvas / neko-live

---

## 目录

1. [ECS 引擎评估](#1-ecs-引擎评估)
2. [3D 引擎架构决策](#2-3d-引擎架构决策)
3. [3D 能力边界分析](#3-3d-能力边界分析)
4. [包架构设计](#4-包架构设计)
5. [前端渲染方案](#5-前端渲染方案)
6. [后端架构决策](#6-后端架构决策)
7. [2D↔3D 联动分析](#7-2d3d-联动分析)
8. [VSCode Webview 限制与对策](#8-vscode-webview-限制与对策)
9. [实施路线图](#9-实施路线图)

---

## 1. ECS 引擎评估

### 1.1 Bevy ECS 集成评估

**结论：❌ 不推荐集成 Bevy**

| 维度 | 分析 |
|------|------|
| **wgpu 版本冲突** | Bevy 使用 wgpu 0.20+，neko-engine 使用 wgpu 0.19。同进程两个 wgpu 版本会导致 GPU 资源无法共享 |
| **架构范式冲突** | 视频编辑器是时间线驱动（timeline-driven），不是游戏引擎的帧循环（frame-loop）|
| **N-API 边界不兼容** | Bevy 的 App::run() 会接管主线程控制权，与 N-API 的异步模型冲突 |
| **过度设计** | 视频编辑器 3D 场景通常 < 100 个实体，ECS 的性能优势无法体现 |

### 1.2 是否需要 ECS？

**结论：✅ 需要轻量 ECS（但不是 Bevy）**

> **修正**：之前将"不需要 Bevy"等同于"不需要 ECS"，这是错误的。
> Bevy 是框架（带渲染器，有 wgpu 冲突），ECS 是架构模式（纯数据结构，零冲突）。

**纯 Scene Graph 在 1000+ 实体时的性能问题：**

| 实体数 | Scene Graph（指针追踪） | ECS（连续内存） | 差距 |
|--------|------------------------|----------------|------|
| 100 | ~5-10 us | ~1-2 us | 3-5x |
| 1,000 | ~80-150 us | ~10-20 us | 5-8x |
| 10,000 | ~1.5-3 ms | ~100-200 us | 10-15x |
| 100,000 | ~20-50 ms | ~1-2 ms | 15-25x |

Scene Graph 瓶颈：
- 每个节点独立堆分配 → 指针追踪，L2/L3 缓存失效
- 递归遍历难以并行化
- 渲染批处理需要额外排序 O(N log N)
- 硬件预取器对随机访问模式无效

ECS 优势：
- 组件存储在连续数组（SoA）→ 预取器有效，缓存命中率高
- System 迭代天然可并行（rayon 拆分）
- Archetype 分组天然支持渲染批处理
- 多线程下差距扩大到 30-50x（4 核）

**rapier3d 的能力边界：**
rapier3d 只管物理（碰撞检测、刚体模拟，10K+ 没问题），不管 Transform 传播、渲染批处理、视锥体剔除。因此 rapier3d 不能替代 ECS 在渲染侧的性能优势。

**推荐方案：hecs（轻量 ECS）+ rapier3d（物理）+ 索引层级树（层级管理）**

可选的 Rust ECS crate（均不依赖 wgpu，与 wgpu 0.19 零冲突）：

| Crate | 依赖重量 | 特点 | 推荐度 |
|-------|---------|------|--------|
| **hecs** | 极轻 | 极简 API，无调度器，自己用 rayon 并行 | ⭐⭐⭐ 最推荐 |
| **shipyard** | 轻 | Sparse Set 存储，组件增删 O(1) | ⭐⭐ |
| **bevy_ecs** | 中等偏重 | 功能最全，变更检测、并行调度 | ⭐（依赖较重） |
| **legion** | 轻 | 自带并行调度，但维护放缓 | ⚠️ |

**混合架构：ECS 数据 + 索引层级树**

```
┌─────────────────────────────────────┐
│  ECS World (hecs)                   │
│  ┌──────────┬────────┬──────────┐   │
│  │Transform │ Mesh   │ Material │   │  ← 连续内存，迭代快
│  │[N 个]    │[N 个]  │[N 个]    │   │
│  └──────────┴────────┴──────────┘   │
└─────────────────────────────────────┘
           ↕ entity ID 关联
┌─────────────────────────────────────┐
│  Hierarchy Index (Vec<Node>)        │
│  ┌─────────────────────────────┐    │
│  │ [entity, parent_idx, child] │    │  ← 连续数组，索引引用
│  │ [entity, parent_idx, child] │    │    （非指针，缓存友好）
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘

渲染循环 → 直接迭代 ECS 组件数组（快）
编辑操作 → 通过 Hierarchy Index 父子管理（直观）
Transform 传播 → 深度排序后线性扫描（可并行子树）
```

---

## 2. 3D 引擎架构决策

### 2.1 独立引擎 vs 集成到 neko-engine

**结论：集成到 neko-engine workspace，新建 `native-scene` crate**

核心约束：**GpuContext 必须共享**

```rust
// /packages/neko-engine/packages/native-core/src/gpu/context.rs
pub struct GpuContext {
    adapter: wgpu::Adapter,
    device: Arc<wgpu::Device>,   // 单一 GPU 设备
    queue: Arc<wgpu::Queue>,     // 单一命令队列
    info: GpuInfo,
    staging_buffer_pool: BufferPool,
}
```

- `Arc<wgpu::Device>` 无法跨进程共享 → 必须同进程
- 3D 渲染输出（wgpu::Texture）需要零拷贝进入 2D 合成管线 → 必须同 GPU 上下文
- 独立进程 = GPU 纹理需要 CPU 中转 = 性能灾难

### 2.2 Crate 布局

```
neko-engine/packages/
├── native-scene/        # 新增：3D 场景管理
│   ├── src/
│   │   ├── scene_graph.rs    # 场景图数据结构
│   │   ├── renderer.rs       # PBR 渲染器
│   │   ├── mesh.rs           # 网格管理
│   │   ├── material.rs       # 材质系统
│   │   ├── light.rs          # 灯光系统
│   │   ├── camera.rs         # 3D 相机
│   │   └── gltf_loader.rs    # glTF 导入
│   └── Cargo.toml
│
├── native-core/         # 现有：核心引擎
├── native-api/          # 现有：API 门面
├── native-napi/         # 现有：Node.js 绑定
└── native-http/         # 现有：HTTP/WebSocket 服务
```

### 2.3 依赖方向

```
native-napi → native-api → native-core + native-scene → neko-types
                              ↑                ↑
                              └── 共享 GpuContext ──┘
```

---

## 3. 3D 能力边界分析

### 3.1 可行性矩阵

| 能力 | 后端（Rust+wgpu） | 前端（VSCode Webview） | 可行性 |
|------|-------------------|----------------------|--------|
| 3D 场景合成 | ✅ wgpu 直接渲染 | 通过 H.264 流预览 | ✅ 完全可行 |
| 材质/光照编辑 | ✅ PBR 渲染器 | R3F 交互编辑 | ✅ 完全可行 |
| 粒子特效 | ✅ Compute Shader | 流预览 | ✅ 完全可行 |
| 3D 文字 | ✅ cosmic-text + 挤出 | R3F 预览 | ✅ 完全可行 |
| 视频特效（2D） | ✅ 25+ WGSL 着色器已有 | 流预览 | ✅ 已实现 |
| 多机位切换 | ✅ 多相机 + 切换逻辑 | UI 选择器 | ✅ 完全可行 |
| 3D 建模（全功能） | ✅ CSG + 修改器 | ❌ 延迟不够 | ⚠️ 受限 |
| 仿真环境 | ✅ rapier3d 物理 | ❌ 交互受限 | ⚠️ 受限 |

### 3.2 现有 GPU 着色器资产

已有 25+ WGSL 着色器，可直接用于 3D 后期处理：

- **色彩校正**：exposure, brightness, contrast, gamma, temperature, saturation, HSL, 3-way wheels
- **转场效果**：fade, wipe, iris, clock, slide, zoom, distortion, flash, 3D flips
- **混合模式**：25+ Photoshop 兼容模式
- **特效**：blur (box/directional/radial/zoom), sharpen, vignette, film grain, glow, chromatic aberration, distortion, edge detection, posterize
- **工具**：easing 函数, 色彩空间转换, 数学工具

### 3.3 "人编辑为主，AI 辅助"原则

**架构导向：交互式编辑 > 程序化生成**

```
用户操作 ─→ 前端视口（R3F）─→ 实时反馈
                  │
                  └─→ AI 辅助面板
                       ├─ 智能属性建议
                       ├─ 几何体生成辅助
                       ├─ 材质推荐
                       └─ 场景布局建议
```

AI 通过 MCP Tools 接口辅助编辑，不接管编辑流程。

---

## 4. 包架构设计

### 4.1 编辑范式分离

| 维度 | neko-cut | neko-canvas | neko-model（新增） |
|------|----------|-------------|-------------------|
| 编辑空间 | 1D（时间线） | 2D（画布） | 3D（空间） |
| 核心操作 | 剪辑、拼接、调速 | 平移、缩放、图层 | 旋转、建模、光照 |
| 文件格式 | `.jvi` | `.jvc` | `.scene` / `.glb` |
| 数据模型 | Timeline → Track → Element | Canvas → Layer → Node | Scene → Object → Mesh |

### 4.2 包结构

```
packages/
├── neko-cut/           # 视频编辑器（时间线）
├── neko-canvas/        # 画布编辑器（2D）
├── neko-model/         # 3D 编辑器（新增）
│   ├── packages/
│   │   ├── extension/  # VS Code 扩展
│   │   └── webview/    # React + R3F UI
│   └── package.json
│
├── neko-engine/        # Rust 后端（共享）
│   └── packages/
│       ├── native-scene/   # 3D 场景（新增）
│       └── native-core/    # 核心引擎
│
└── shared/
    └── neko-scene-view/    # 共享 R3F 视口组件（新增）
```

### 4.3 共享组件：@neko/scene-view

```typescript
// @neko/scene-view - 共享 3D 视口库
interface SceneViewProps {
  sceneUrl: string;           // .scene 或 .glb 文件路径
  mode: 'edit' | 'preview';  // 编辑模式 vs 预览模式
  cameraConfig?: CameraConfig;
  onObjectSelect?: (id: string) => void;
  onTransformChange?: (id: string, transform: Transform3D) => void;
}

// neko-model: 完整编辑模式
<SceneView mode="edit" ... />

// neko-cut: 嵌入预览（时间线中的 3D 元素）
<SceneView mode="preview" ... />

// neko-canvas: 嵌入预览（画布中的 3D 元素）
<SceneView mode="preview" ... />
```

### 4.4 跨包引用

各编辑器通过文件路径引用 3D 内容，不直接依赖：

```json
// neko-cut 时间线元素引用 3D 场景
{
  "type": "Scene3D",
  "source": "./assets/my-scene.scene",
  "camera": "Camera_01",
  "timeRange": [0, 5.0]
}

// neko-canvas 画布节点引用 3D 场景
{
  "type": "Scene3DNode",
  "source": "./assets/my-scene.scene",
  "renderSize": [1920, 1080]
}
```

---

## 5. 前端渲染方案

### 5.1 H.264 流实际延迟

**修正评估：~10-18ms（非此前估计的 50-100ms）**

现有 PreviewPipeline 优化：

```rust
// /packages/neko-engine/packages/native-core/src/preview/pipeline.rs
encoder_config.max_b_frames = Some(0);           // 无 B 帧缓冲
encoder_config.profile = Some("baseline");        // Baseline 无 B 帧
encoder_config.preset = EncoderPreset::Ultrafast;  // 最快编码
encoder_config.use_zero_copy_gpu = true;           // IOSurface 零拷贝
```

延迟分解（macOS Metal 路径）：

| 阶段 | 耗时 |
|------|------|
| GPU 渲染 → IOSurface | ~2ms |
| VideoToolbox H.264 编码 | ~3-5ms |
| WebSocket 传输（本地） | ~0.1ms |
| WebCodecs 解码 | ~2-3ms |
| Canvas 绘制 | ~1ms |
| **总计** | **~8-11ms** |

### 5.2 三种渲染方案对比

| 方案 | 延迟 | 交互性 | 实现复杂度 | 适用场景 |
|------|------|--------|-----------|---------|
| **A: 纯 H.264 流** | 10-18ms | 一般 | 低（已有） | 预览、播放 |
| **B: JPEG 单帧模式** | 5-8ms | 好 | 中 | 编辑中的参数调整 |
| **C: R3F 双渲染** | < 1ms | 最佳 | 高 | 3D 交互编辑 |

**推荐策略：先验证 A，按需升级到 B 或 C**

```
编辑流程中的渲染模式切换：

拖拽 Gizmo → 方案 C（R3F 本地渲染，< 1ms）
    │
    └─ 松开鼠标 → 方案 A（Rust 高质量渲染，10-18ms）
                       │
                       └─ 播放预览 → 方案 A（H.264 流）
```

### 5.3 技术选型

**前端 3D 库：React Three Fiber (R3F)**

```json
// 新增依赖（@neko/scene-view）
{
  "@react-three/fiber": "^8.x",
  "@react-three/drei": "^9.x",
  "three": "^0.160",
  "@types/three": "^0.160"
}
```

兼容性：
- 与现有 React 18 + Zustand 架构一致
- @react-three/drei 提供 Gizmo、Grid、环境光等开箱即用
- 支持 WebGPU renderer（three.js r160+）

---

## 6. 后端架构决策

### 6.1 不拆分服务器

**结论：❌ 不拆分为"流 server + 模型 server"**

核心原因：`Arc<GpuContext>` 不可跨进程共享

```
❌ 拆分方案（需要 CPU 中转）：
Stream Server ──GPU Texture──→ CPU Readback ──IPC──→ Model Server
                                                     ──GPU Upload──→

✅ 单进程方案（零拷贝）：
ActionRouter
├── StreamGroup   ──→ stream_registry (Arc<StreamRegistry>)
├── SceneGroup    ──→ scene_service (Arc<SceneService>)    # 新增
├── MeshGroup     ──→ mesh_service (Arc<MeshService>)      # 新增
└── VideoGroup    ──→ video_service (Arc<VideoService>)
         ↑
         └── 共享 Arc<GpuContext>，纹理零拷贝
```

### 6.2 ServiceContainer 扩展

```rust
// native-core/src/services/impls/container.rs 扩展
pub struct ServiceContainer {
    gpu_ctx: Option<Arc<GpuContext>>,
    task_service: Arc<TaskService>,
    node_service: Arc<NodeService>,
    video_service: Arc<VideoService>,
    audio_service: Arc<AudioService>,
    image_service: Arc<ImageService>,
    timeline_service: Arc<TimelineService>,
    export_service: Option<Arc<ExportService>>,
    // 新增 3D 服务
    scene_service: Option<Arc<SceneService>>,     // 场景管理
    mesh_service: Option<Arc<MeshService>>,        // 网格操作
    material_service: Option<Arc<MaterialService>>, // 材质系统
}
```

### 6.3 ActionRouter 新增路由组

```rust
// 新增 Action Groups
"scenes"    → SceneGroup    (create, load, save, render, list_objects, ...)
"meshes"    → MeshGroup     (create_primitive, import_gltf, boolean_op, ...)
"materials" → MaterialGroup (create, set_texture, set_pbr_params, ...)
"cameras"   → CameraGroup   (create, set_transform, set_projection, ...)
"lights"    → LightGroup    (create, set_type, set_color, set_intensity, ...)
```

---

## 7. 2D↔3D 联动分析

### 7.1 联动场景分类

| 方向 | 场景 | 数据接口 | 复杂度 |
|------|------|----------|--------|
| **3D→2D** | 3D 场景渲染为视频层 | `wgpu::Texture` → `GpuLayer` | 低 |
| **3D→2D** | 深度图用于景深特效 | depth texture → blur shader | 低 |
| **3D→2D** | 法线图用于后期光照 | normal texture → effect shader | 中 |
| **2D→3D** | 视频作为 3D 纹理 | video frame → 3D material texture | 低 |
| **2D→3D** | 图片作为环境贴图 | image → environment map | 低 |
| **双向** | AR 合成（虚拟+实景） | 遮罩 + 深度匹配 | 高 |
| **双向** | 动态投影映射 | 相机矩阵同步 | 高 |

### 7.2 接口设计

```rust
/// 3D 渲染输出（给 2D 合成管线消费）
pub struct SceneRenderOutput {
    pub color: wgpu::Texture,       // RGBA 颜色缓冲
    pub depth: Option<wgpu::Texture>, // 深度缓冲（可选）
    pub mask: Option<wgpu::Texture>,  // 对象遮罩（可选）
    pub normal: Option<wgpu::Texture>, // 法线缓冲（可选）
}

/// 2D 纹理输入到 3D 场景
pub struct SceneExternalTextures {
    pub video_textures: HashMap<String, wgpu::TextureView>,
    pub image_textures: HashMap<String, wgpu::TextureView>,
}
```

### 7.3 何时需要联动

```
大多数基础场景是单向的（复杂度低）：
├─ 时间线嵌入 3D 元素 → 3D→2D（渲染为层）
├─ 视频贴到 3D 模型上 → 2D→3D（视频纹理）
└─ 3D 文字叠加在视频上 → 3D→2D（渲染为层）

双向联动仅在高级合成时需要：
├─ AR 虚实合成
├─ 实时投影映射
└─ 物理模拟与视频交互
```

---

## 8. VSCode Webview 限制与对策

### 8.1 Webview 3D 编辑限制

| 限制 | 影响 | 严重程度 |
|------|------|----------|
| **无 Pointer Lock** | 无法实现 FPS 式相机控制 | ⚠️ 中 |
| **右键被拦截** | 无法自定义右键菜单 | ⚠️ 中 |
| **快捷键冲突** | Ctrl+Z/S/C 被 VS Code 拦截 | ⚠️ 中 |
| **无压感** | 不支持压感笔输入 | 🔵 低 |
| **单面板限制** | 不能同时显示 3D 视口 + 属性面板 | ⚠️ 中 |
| **沙箱限制** | 无法直接访问文件系统 | 🔵 低（已有方案） |

### 8.2 VS Code Fork 策略

VS Code 是 MIT 开源，有先例（Cursor, Windsurf, VSCodium）。

**三阶段渐进策略：**

| 阶段 | 行动 | 投入 | 收益 |
|------|------|------|------|
| **Phase 1** | 不 Fork，在 vanilla VS Code 中验证产品 | 0 | 验证需求 |
| **Phase 2** | 最小 Fork（~200 行修改） | 1-2 周 | 解决 80% 限制 |
| **Phase 3** | 深度 Fork（像 Cursor） | 3-6 月 | 完全自定义 |

**Phase 2 最小 Fork 修改清单：**

```
修改量约 200 行，解决 80% 限制：

1. 关闭 Webview sandbox（~20 行）
   → 解锁 Pointer Lock、全屏、更多 Web API

2. 透传右键事件（~50 行）
   → 3D 视口自定义右键菜单

3. 快捷键白名单（~30 行）
   → Ctrl+Z/S/C 等在焦点 Webview 时不被拦截

4. Pointer Lock API（~100 行）
   → FPS 相机控制、无限拖拽

合计：~200 行修改，不影响 VS Code 核心功能
```

---

## 9. 实施路线图

### Phase 1：基础 3D 视口 + 场景组装

**目标**：能导入 glTF 模型、摆放、打光、预览

```
前端：
├─ @neko/scene-view 库（R3F 视口组件）
├─ neko-model 扩展骨架
├─ 基础 Gizmo（平移/旋转/缩放）
├─ 材质编辑面板
└─ 灯光编辑面板

后端：
├─ native-scene crate 骨架
├─ glTF 加载器
├─ Scene Graph 数据结构
└─ ActionRouter 新增 scenes/meshes 路由
```

### Phase 2：基础建模 + 延迟验证

**目标**：CSG 布尔运算、3D 文字、验证实际延迟

```
前端：
├─ CSG 操作 UI（并集/差集/交集）
├─ 3D 文字编辑器
├─ 参数化几何体面板
└─ 延迟测试工具（测量实际 RTT）

后端：
├─ CSG 布尔运算（三角网格级别）
├─ 3D 文字挤出（cosmic-text）
├─ 参数化几何体生成
└─ JPEG 单帧模式（备选方案 B）

关键里程碑：测量实际 H.264 流延迟
├─ < 15ms → 方案 A 够用
├─ 15-30ms → 启用方案 B（JPEG 单帧）
└─ > 30ms → 启动方案 C（R3F 双渲染）
```

### Phase 3：Rust PBR 渲染 + 时间线集成

**目标**：高质量渲染、3D 元素嵌入时间线

```
后端：
├─ PBR 渲染器（metallic-roughness workflow）
├─ 环境光 IBL（Image-Based Lighting）
├─ 阴影映射（Shadow Map）
├─ SceneRenderOutput → GpuLayer 集成
└─ Scene3D ElementType 扩展

前端：
├─ neko-cut 时间线嵌入 3D 元素
├─ neko-canvas 画布嵌入 3D 预览
├─ 相机动画编辑器
└─ 关键帧扩展（Point3D, Quaternion）
```

### Phase 4：AI 辅助 + 高级功能

**目标**：AI 辅助工作流、高级 3D 编辑

```
AI 辅助：
├─ MCP Tool: scene.suggest_layout（布局建议）
├─ MCP Tool: material.suggest（材质推荐）
├─ MCP Tool: mesh.generate（几何体生成建议）
└─ 自然语言 → 3D 操作指令转换

高级功能：
├─ 修改器系统（Bevel, Smooth, Mirror）
├─ rapier3d 物理模拟
├─ GPU 粒子系统（Compute Shader）
├─ 多机位切换编辑
└─ VS Code 最小 Fork（如果需要）
```

---

## 附录：关键约束总结

| 约束 | 原因 | 影响 |
|------|------|------|
| GpuContext 单进程 | `Arc<wgpu::Device>` 不可跨进程 | 3D 必须在 neko-engine 内 |
| 1000+ 实体性能 | Scene Graph 指针追踪导致缓存失效 | 需要轻量 ECS（hecs），非纯 Scene Graph |
| Webview 沙箱 | VS Code 安全策略 | 3D 交互受限，需 Fork 或流方案 |
| 人编辑为主 | 产品定位 | R3F 交互视口必须，AI 为辅助 |
| H.264 延迟 ~10-18ms | 已有零拷贝优化 | 纯流方案可能够用 |
| wgpu 0.19 | 现有代码基础 | 不能直接用 Bevy |

---

## 附录：关键文件索引

| 文件 | 作用 |
|------|------|
| `native-core/src/gpu/context.rs` | GpuContext — GPU 设备管理（共享约束来源） |
| `native-core/src/gpu/gpu_layer.rs` | GpuLayer — 2D 合成层（3D 输出接入点） |
| `native-core/src/gpu/texture_compositor.rs` | 纹理合成器 WGSL 着色器 |
| `native-core/src/preview/pipeline.rs` | PreviewPipeline — H.264 低延迟流 |
| `native-core/src/domain/timeline.rs` | Timeline 数据模型（扩展 Scene3D 元素） |
| `native-core/src/domain/transform.rs` | 2D Transform（需扩展为 Transform3D） |
| `native-core/src/animation/keyframe.rs` | 关键帧系统（需扩展 Point3D/Quaternion） |
| `native-core/src/services/impls/container.rs` | ServiceContainer DI（扩展 3D 服务） |
| `native-api/src/engine.rs` | EngineApi 门面（扩展 3D 路由组） |
| `native-http/src/routes/streaming.rs` | WebSocket 流路由（扩展 3D 视口流） |
