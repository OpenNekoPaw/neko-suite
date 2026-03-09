# 3D 能力集成架构分析

> 日期：2025-06（更新：2026-03-09）
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
10. [混合策略：内置轻量创作 + MCP 桥接专业软件](#10-混合策略内置轻量创作--mcp-桥接专业软件)

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
| **AI 捏脸/角色定制** | ✅ 蒙皮渲染 + 导出 | ✅ R3F Morph Target（< 1ms） | ✅ 完全可行 |
| **骨骼动画** | ✅ wgpu compute shader 蒙皮 | ✅ Three.js AnimationMixer | ✅ 完全可行 |
| **表情系统** | ✅ Blend Shape 渲染 | ✅ VRM 52 个标准表情 | ✅ 完全可行 |
| **特效系统** | ✅ GPU 粒子 + 后处理链 + 自定义 shader | ✅ R3F postprocessing | ✅ 完全可行 |
| **场景制作** | ✅ HDR 环境 + 天空盒 + 地形 | ✅ R3F drei 场景工具 | ✅ 完全可行 |
| **物品/道具制作** | ✅ 参数化几何体 + 修改器 + UV | ✅ R3F 交互编辑 | ✅ 完全可行 |
| **Text-to-3D** | ✅ glTF 导入生成结果 | ✅ R3F 预览 | ✅ 可行（依赖外部 API） |
| **Image-to-3D** | ✅ 多视图重建 → glTF | ✅ R3F 预览 | ✅ 可行（依赖外部 API） |
| **3D Gaussian Splatting** | ✅ wgpu compute 排序+渲染 | ✅ Three.js 3DGS 库 | ✅ 可行 |
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

### 3.4 AI 捏脸与角色定制

**核心架构：参数化面部模型 + AI 驱动参数 + R3F 实时预览**

```
用户操作（滑块拖拽 / 文本描述 / 图片上传）
    │
    ├─ 滑块拖拽 → 直接更新 Blend Shape 权重 → R3F 实时变形（< 1ms）
    │
    └─ AI 生成 → neko-agent MCP Tool → 面部参数向量 → 同上
```

**技术方案：Morph Target（业界主流）**

预制面部 Blend Shapes（50-100 个），分类控制：

| 分类 | Blend Shapes | 说明 |
|------|-------------|------|
| 脸型 | 脸宽、脸长、颧骨、下巴尖度、下巴宽度 | 整体轮廓 |
| 眼睛 | 眼距、眼大小、眼角上扬、双眼皮、瞳孔大小 | 眼部区域 |
| 鼻子 | 鼻高、鼻宽、鼻尖、鼻翼 | 鼻部区域 |
| 嘴巴 | 嘴宽、唇厚、嘴角、唇弓 | 唇部区域 |
| 眉毛 | 眉距、眉高、眉粗、眉弯 | 眉毛形态 |

**UI 交互设计**：

```
┌─────────────────────────────────────────────┐
│  neko-model Webview                         │
│  ┌──────────────────┐  ┌─────────────────┐  │
│  │                  │  │ 面部参数         │  │
│  │   R3F 3D 视口    │  │ ┌─ 脸型 ──────┐ │  │
│  │  （旋转/缩放）    │  │ │ 脸宽  ━━●━━ │ │  │
│  │                  │  │ │ 脸长  ━●━━━ │ │  │
│  │    👤 头部模型    │  │ └────────────┘ │  │
│  │                  │  │ ┌─ 眼睛 ──────┐ │  │
│  │                  │  │ │ 眼距  ━━●━━ │ │  │
│  │                  │  │ │ 眼大  ━●━━━ │ │  │
│  │                  │  │ └────────────┘ │  │
│  │                  │  │ [随机] [重置]   │  │
│  │                  │  │ [AI 生成]       │  │
│  └──────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────┘
```

**关键实现细节**：

- **纯前端实现**：捏脸交互完全在 Webview 中完成，Three.js 原生 Morph Target 支持，不依赖 Rust 后端
- **R3F < 1ms 延迟**：滑块拖拽即时反馈，Webview 沙箱限制对捏脸场景几乎无影响
- **Rust 后端仅用于**：高质量 PBR 渲染导出、离线渲染、蒙皮计算

**AI MCP Tools**：

```
face.generate_params  → 文本描述 → 面部参数向量（"圆脸大眼" → weights[]）
face.from_image       → 图片 → 面部参数向量（照片 → 相似角色）
face.adjust           → 自然语言微调（"眼睛再大一点" → delta weights）
```

### 3.5 骨骼动画系统

**骨骼动画是捏脸 → 虚拟形象 → 虚拟制片的基础能力**

**两层架构**：

| 层 | 职责 | 执行位置 |
|----|------|----------|
| 蒙皮变形（Skinning） | 骨骼权重 → 顶点变形 | 前端 Three.js 或后端 wgpu |
| 动画驱动（Animation） | 关键帧插值 → 骨骼 Transform | 按场景选择前端或后端 |

**骨骼层级（标准 Humanoid）**：

```
Hips
├── Spine → Chest → Neck → Head
│                            ├── LeftEye / RightEye（眼球追踪）
│                            └── Jaw（口型驱动）
├── LeftUpperArm → LeftLowerArm → LeftHand → Fingers
├── RightUpperArm → ...
├── LeftUpperLeg → LeftLowerLeg → LeftFoot
└── RightUpperLeg → ...
```

**三种动画驱动来源**：

| 来源 | 数据流 | 适用场景 |
|------|--------|----------|
| 预制动画 | glTF AnimationClip → Mixer 播放 | 走路、待机、挥手等标准动作 |
| 实时驱动 | 面部追踪/动捕 → 骨骼 Transform | neko-live 虚拟形象 |
| AI 生成 | 文本描述 → Agent 生成关键帧序列 | "角色开心地挥手" → 动画脚本 |

**Morph Target + 骨骼联动**：

```
Morph Target → 控制面部形状（静态结构：脸型/鼻高/眼距）
骨骼动画    → 控制面部表情（动态变化：口型/眼球/眉毛）
两者叠加    → 完整角色表现
```

**模型格式支持**：

| 格式 | 骨骼 | 动画 | Morph Target | 推荐度 |
|------|------|------|-------------|--------|
| glTF/GLB | ✅ | ✅ | ✅ | ⭐⭐⭐ 通用首选 |
| VRM | ✅ | ✅ | ✅（52 个表情预设） | ⭐⭐⭐ 虚拟形象首选 |
| FBX | ✅ | ✅ | ✅ | ⭐⭐ 兼容导入 |

**VRM 格式优势**（基于 glTF 扩展）：
- @pixiv/three-vrm 加载器，Three.js 原生集成
- 预定义 52 个标准表情 Blend Shape（喜怒哀乐 + 口型 + 眼神）
- UniVRM Humanoid 标准化骨骼命名，面部追踪可直接映射

**后端数据结构（native-scene）**：

```rust
pub struct Skeleton {
    pub bones: Vec<Bone>,
    pub inverse_bind_matrices: Vec<Mat4>,
}

pub struct SkinnedMesh {
    pub mesh: Mesh,
    pub skeleton: Arc<Skeleton>,
    pub joint_weights: Vec<[f32; 4]>,   // per-vertex, max 4 bones
    pub joint_indices: Vec<[u16; 4]>,
}

pub struct AnimationClip {
    pub name: String,
    pub duration: f32,
    pub channels: Vec<AnimationChannel>,  // bone → keyframe curves
}
```

**实施策略：前端先行，后端按需**

- Phase 3.1：前端 R3F 骨骼支持（Three.js 原生，零额外开发），glTF/VRM 加载播放
- Phase 3.3：后端 native-scene 蒙皮渲染（wgpu compute shader），用于高质量导出

**跨模块联动**：

```
neko-model（骨骼编辑/动画预览）
    ├── → neko-cut（角色动画嵌入时间线，关键帧序列）
    ├── → neko-live（面部追踪 → 骨骼映射，虚拟形象驱动）
    └── → neko-agent（AI 生成动画脚本 + 表情序列）
```

### 3.6 特效系统

**三层特效架构：粒子 + 后处理 + 自定义 Shader**

| 层 | 实现位置 | 技术 | 用途 |
|----|----------|------|------|
| **GPU 粒子** | Rust（wgpu compute shader） | Compute → 粒子缓冲 → Billboard 渲染 | 火焰、烟雾、魔法、碎片 |
| **后处理链** | Rust + 前端可选 | 全屏 pass 串联 | Bloom、DOF、Motion Blur、Color Grading |
| **自定义 Shader** | Rust（用户上传 WGSL） | Custom shader 热加载 | 创意特效、风格化渲染 |

**后端特效管线（native-scene 扩展）**：

```rust
pub struct EffectPipeline {
    pub particle_systems: Vec<ParticleSystem>,   // GPU 粒子系统
    pub post_process_chain: Vec<PostProcessPass>, // 后处理链
    pub custom_shaders: Vec<CustomShaderEffect>,  // 用户自定义
}

pub struct ParticleSystem {
    pub emitter: EmitterConfig,       // 发射器（点/面/体积）
    pub max_particles: u32,           // 最大粒子数
    pub compute_pipeline: wgpu::ComputePipeline,
    pub render_pipeline: wgpu::RenderPipeline,
}

pub struct PostProcessPass {
    pub name: String,                 // "bloom", "dof", "motion_blur"
    pub shader: wgpu::ShaderModule,
    pub params: HashMap<String, f32>, // 可调参数
    pub enabled: bool,
}
```

**前端交互**：R3F `@react-three/postprocessing` 提供实时预览编辑，最终渲染/导出走 Rust 后端。

**已有可复用资产**：25+ WGSL shader（blur / glow / chromatic aberration / vignette / film grain 等），可直接扩展为后处理 pass。

### 3.7 场景制作

**场景 = 环境 + 光照 + 物体摆放 + 氛围**

| 能力 | 前端（R3F） | 后端（Rust） |
|------|------------|-------------|
| HDR 环境贴图 | @react-three/drei `Environment` | wgpu IBL 采样 |
| 天空盒 / 程序化天空 | drei `Sky` / `Stars` | Hosek-Wilkie 天空模型 |
| 地形 | drei `Heightmap` + 自定义 | wgpu 高度图渲染 |
| 植被/散布 | R3F instanced mesh | wgpu 实例化渲染 |
| 雾效 | drei `Fog` | wgpu 体积雾 |
| 场景模板 | 预设模板加载 | 模板 glTF + 参数配置 |

**场景编辑器 UI**：

```
┌─────────────────────────────────────────────────┐
│  场景编辑器                                      │
│  ┌────────────────────┐  ┌───────────────────┐  │
│  │                    │  │ 场景属性           │  │
│  │   R3F 3D 视口      │  │ ┌─ 环境 ────────┐ │  │
│  │   (场景全貌)       │  │ │ HDR: studio.hdr│ │  │
│  │                    │  │ │ 强度: ━━●━━━  │ │  │
│  │                    │  │ │ 旋转: ━●━━━━  │ │  │
│  │                    │  │ └──────────────┘ │  │
│  │                    │  │ ┌─ 光照 ────────┐ │  │
│  │                    │  │ │ 主光 ☀️ 方向光 │ │  │
│  │                    │  │ │ 补光 💡 点光源 │ │  │
│  │                    │  │ └──────────────┘ │  │
│  │                    │  │ ┌─ 氛围 ────────┐ │  │
│  │                    │  │ │ 雾: ━━●━━━━  │ │  │
│  │                    │  │ │ 色调: ━━━●━━ │ │  │
│  │                    │  │ └──────────────┘ │  │
│  └────────────────────┘  └───────────────────┘  │
│  [场景模板库] [导出场景] [添加物体]               │
└─────────────────────────────────────────────────┘
```

### 3.8 物品/道具制作

**定位：参数化道具创建，非全功能建模（Blender 级别）**

支持的工作流：

| 工作流 | 说明 | 复杂度 |
|--------|------|--------|
| **参数化几何体** | 立方体/球体/圆柱/圆环等 + 参数调节 | 低 |
| **修改器堆栈** | Bevel / Smooth / Mirror / Array / Boolean | 中 |
| **UV 展开** | 自动 UV + 手动调整 | 中 |
| **材质绘制** | PBR 材质参数 + 纹理贴图 | 中 |
| **外部导入** | glTF/FBX/OBJ 导入编辑 | 低 |
| **AI 生成** | Text-to-3D API → glTF 导入 → 参数微调 | 低（调用外部） |

**前端实现**：R3F 交互编辑（Gizmo 变换 + 参数面板），后端提供 CSG 运算和修改器计算。

### 3.9 AI 3D 生成集成

**架构：neko-agent MCP Tools → 外部 AI API → glTF 导入 → 编辑器**

```
用户意图（文本/图片）
    │
    ▼
neko-agent MCP Tools
    │
    ├─ mesh.generate_from_text  → Text-to-3D API（Meshy/Tripo3D/...）
    │                            → 生成 glTF → 导入 neko-model
    │
    ├─ mesh.generate_from_image → Image-to-3D API（多视图重建）
    │                            → 生成 glTF → 导入 neko-model
    │
    ├─ scene.suggest_layout     → LLM 推理场景布局 → 物体位置/旋转 JSON
    │
    └─ material.suggest         → LLM 推理材质参数 → PBR 参数 JSON
```

**AI Provider 抽象**（复用 neko-agent platform 层）：

```typescript
interface I3DGenerationProvider {
  generateFromText(prompt: string, options: Gen3DOptions): Promise<GLTFResult>;
  generateFromImage(image: Buffer, options: Gen3DOptions): Promise<GLTFResult>;
  estimateTime(prompt: string): Promise<number>;  // 预估生成时间（秒）
}

// 可插拔多个 Provider
type Gen3DOptions = {
  provider: 'meshy' | 'tripo3d' | 'custom';
  quality: 'draft' | 'standard' | 'high';
  format: 'glb' | 'gltf';
};
```

**工作流程**：AI 生成粗模 → 用户在 neko-model 中精修（材质/UV/修改器）→ 嵌入时间线/画布。

### 3.10 3D Gaussian Splatting (3DGS)

**定位：实景捕捉/重建 → 虚实合成 → 视频后期**

**3DGS 管线**：

```
外部采集（手机/相机多角度拍摄）
    │
    ▼
3DGS 训练（COLMAP SfM + 3DGS 优化）
    │ 可选：本地 CLI 集成 / 云端训练服务
    ▼
.ply / .splat 文件
    │
    ▼
neko-model 加载 + 预览
    │
    ├─ 前端：Three.js 3DGS 渲染器（交互预览）
    └─ 后端：wgpu compute shader（高质量渲染/导出）
         │
         ▼
    嵌入 neko-cut 时间线 / neko-canvas 画布
    （3DGS 场景作为 Scene3D 元素，与 2D 视频合成）
```

**渲染原理**（wgpu 实现）：

```
1. 加载 Gaussian 点云（位置 + 协方差 + 颜色 + 不透明度）
2. Compute Shader：视图变换 + 深度排序（Radix Sort）
3. Render Pass：按深度顺序 alpha blending splatting
4. 输出：wgpu::Texture → SceneRenderOutput → GpuLayer
```

**前后端分工**：

| 操作 | 位置 | 说明 |
|------|------|------|
| 交互预览 | 前端 Three.js | `@mkkellogg/three-gaussian-splat` 或类似库 |
| 高质量渲染 | 后端 wgpu | Compute shader 排序 + 精确 splatting |
| 导出/时间线渲染 | 后端 wgpu | 与 PBR 管线合成 |
| 编辑（裁剪/变换） | 前端 R3F | 包围盒裁剪 + 仿射变换 |

**与时间线联动**：3DGS 场景可设置相机路径动画，在时间线上作为 Scene3D 元素播放。

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

### Phase 1：基础 3D 视口 + 场景组装 + 骨骼动画

**目标**：导入 glTF/VRM 模型、摆放、打光、预览，支持骨骼动画播放

```
前端：
├─ @neko/scene-view 库（R3F 视口组件）
├─ neko-model 扩展骨架
├─ 基础 Gizmo（平移/旋转/缩放）
├─ 材质编辑面板 + 灯光编辑面板
├─ glTF/VRM 加载（含 Skeleton + Morph Targets）
├─ AnimationMixer 骨骼动画播放
└─ Morph Target 系统（GPU 顶点变形）

后端：
├─ native-scene crate 骨架
├─ glTF 加载器（含骨骼 + morph targets 解析）
├─ hecs ECS 数据结构 + 索引层级树
└─ ActionRouter 新增 scenes/meshes/materials 路由
```

### Phase 2：AI 捏脸 + 基础建模

**目标**：参数化面部编辑、AI 驱动捏脸、CSG 建模、延迟验证

```
前端（捏脸）：
├─ 参数化面部编辑器（R3F 视口 + 分类滑块面板）
│   ├─ 脸型（脸宽/脸长/颧骨/下巴）
│   ├─ 眼睛（眼距/眼大小/眼角/双眼皮）
│   ├─ 鼻子（鼻高/鼻宽/鼻尖/鼻翼）
│   ├─ 嘴巴（嘴宽/唇厚/嘴角/唇弓）
│   └─ 眉毛（眉距/眉高/眉粗/眉弯）
├─ Morph Target 驱动捏脸（50+ Blend Shapes）
├─ 骨骼驱动表情（口型/眼球追踪/眉毛）
├─ VRM 52 个标准表情预设（@pixiv/three-vrm）
└─ 随机/重置/AI 生成按钮

前端（建模）：
├─ CSG 操作 UI（并集/差集/交集）
├─ 3D 文字编辑器
├─ 参数化几何体面板
└─ 延迟测试工具（测量实际 RTT）

后端：
├─ CSG 布尔运算（三角网格级别）
├─ 3D 文字挤出（cosmic-text）
├─ 参数化几何体生成
└─ JPEG 单帧模式（备选方案 B）

AI 捏脸 MCP Tools：
├─ face.generate_params（文本 → 参数向量："圆脸大眼" → weights[]）
├─ face.from_image（图片 → 参数向量：照片 → 相似角色）
└─ face.adjust（自然语言微调："眼睛再大一点" → delta weights）

关键里程碑：测量实际 H.264 流延迟
├─ < 15ms → 方案 A 够用
├─ 15-30ms → 启用方案 B（JPEG 单帧）
└─ > 30ms → 启动方案 C（R3F 双渲染）
```

### Phase 3：轻量渲染 + 场景组装 + 时间线集成

**目标**：轻量级 PBR 渲染、场景组装（非专业建模）、3D 元素嵌入时间线

**设计原则**：聚焦 AI 辅助 + 轻量创作，专业建模/修改器/UV 展开交给 Blender MCP 桥接

```
后端（轻量渲染）：
├─ 轻量 PBR 渲染器（metallic-roughness + IBL）
├─ native-scene 骨骼蒙皮渲染（wgpu compute shader）
├─ 动画插值引擎（用于高质量导出/离线渲染）
├─ SceneRenderOutput → GpuLayer 集成
└─ Scene3D ElementType 扩展

场景组装（非建模）：
├─ glTF/VRM 资产导入 + 摆放 + 缩放旋转
├─ 环境系统（HDR 环境贴图 + 天空盒）
├─ 氛围控制（雾效 + 色调映射）
└─ 场景模板库（预设模板加载/保存）

特效系统：
├─ GPU 粒子系统（Compute Shader：火焰/烟雾/魔法/碎片）
├─ 后处理链（Bloom / DOF / Motion Blur / Color Grading）
├─ 自定义 WGSL shader 特效（热加载）
└─ 复用已有 25+ WGSL shader 资产

前端集成：
├─ neko-cut 时间线嵌入 3D 元素（含角色动画序列）
├─ neko-canvas 画布嵌入 3D 预览
├─ 相机动画编辑器
└─ 关键帧扩展（Point3D, Quaternion）

降低优先级（交给 Blender MCP 桥接）：
├─ ⬇ 修改器堆栈（Bevel / Smooth / Mirror / Array / Boolean）
├─ ⬇ UV 展开（自动 UV + 手动调整）
├─ ⬇ 材质绘制面板
├─ ⬇ 地形/植被（高度图 + 实例化散布）
└─ ⬇ CSG 布尔运算
```

### Phase 4：AI 辅助 3D + 3DGS + MCP 桥接

**目标**：AI 3D 生成、3DGS 实景重建、MCP 桥接专业软件、虚拟形象驱动

```
AI 3D 生成：
├─ Text-to-3D 集成（外部 API → glTF 导入 → 参数微调）
├─ Image-to-3D（单图/多图 → 3D 重建 → glTF 导入）
├─ I3DGenerationProvider 抽象（可插拔多 Provider：Meshy/Tripo3D/...）
├─ MCP Tool: mesh.generate_from_text / mesh.generate_from_image
├─ MCP Tool: scene.suggest_layout（布局建议）
├─ MCP Tool: material.suggest（材质推荐）
├─ AI 动画生成（文本描述 → 关键帧序列）
└─ 自然语言 → 3D 操作指令转换

3D Gaussian Splatting：
├─ .ply / .splat 文件加载
├─ 前端预览：Three.js 3DGS 渲染器（交互查看）
├─ 后端渲染：wgpu compute shader（Radix Sort + alpha splatting）
├─ 3DGS 编辑（包围盒裁剪 + 仿射变换）
├─ 3DGS → SceneRenderOutput → GpuLayer（嵌入时间线/画布）
└─ 相机路径动画（3DGS 场景漫游）

MCP 桥接专业软件（新增）：
├─ Blender MCP Server 集成（复杂建模/修改器/UV/动画）
├─ ComfyUI MCP Server 集成（高级 AI 图像 pipeline + ControlNet）
├─ 桥接数据流：Blender 输出 glTF → neko-model 导入预览 + 编辑
├─ 桥接数据流：neko-model 渲染帧 → ComfyUI ControlNet 输入
└─ 统一 MCP Tool 注册（neko-agent MCPManager 管理）

高级交互：
├─ 面部直接拖拽编辑（Raycasting → Blend Shape 映射）
├─ rapier3d 物理模拟
└─ 多机位切换编辑

neko-live 联动：
├─ 面部追踪 → 骨骼映射接口（Humanoid 标准）
└─ 实时驱动 Blend Shape 权重（表情同步）
```

---

## 10. 混合策略：内置轻量创作 + MCP 桥接专业软件

### 10.1 策略定位

neko-model 不追赶 Blender/Maya 的专业建模能力（30 年积累不可追），而是定位为：

```
                功能深度 →
            低                    高
      ┌─────────────────────────────────┐
   高 │                                 │
      │  neko-model ⭐                  │  Blender + AI MCP
   A  │  （轻量 + AI 原生              │  （专业 + AI 辅助
   I  │    + 一体化工作流）             │    + 功能完整）
   集 │                                 │
   成 │                                 │
   度 │                                 │
      │  SketchUp / Tinkercad          │  Maya / Cinema 4D
   低 │  （简单 3D 建模）              │  （专业 3D + 付费）
      │                                 │
      └─────────────────────────────────┘
```

**独特价值**：高 AI 集成度 + 一体化工作流（3D → 时间线 → 导出，零切换）。

### 10.2 三层互补架构

```
Layer 1: 内置轻量 3D 创作（neko-model）
├── 场景组装（glTF/VRM 导入 + 摆放 + 环境）
├── AI 捏脸（Morph Target 参数化编辑）
├── 骨骼动画预览 + 参数控制
├── 轻量 PBR 渲染 + 特效
├── 3D 渲染帧 → AI 视频输入（Image-to-Video）
└── 适合：快速原型、AI 参考图、简单场景、角色一致性

Layer 2: MCP 桥接专业软件（可选安装）
├── Blender MCP Server → 复杂建模/修改器/UV/高级动画
├── ComfyUI MCP Server → ControlNet + 高级 AI 图像 pipeline
├── 数据流：Blender glTF 输出 → neko-model 导入
├── 数据流：neko-model 渲染帧 → ComfyUI ControlNet
└── 适合：专业级建模、精细材质、高级动画

Layer 3: AI 生成（neko-agent，已实现）
├── Text-to-3D / Image-to-3D（外部 API → glTF）
├── Text-to-Video / Image-to-Video（Runway/Luma/Vidu）
├── 输入来自 Layer 1 或 Layer 2
└── 输出进入 neko-cut 时间线
```

### 10.3 内置 vs 桥接的分工

| 能力 | 内置（neko-model） | 桥接（Blender MCP） | 判定 |
|------|-------------------|---------------------|------|
| glTF/VRM 导入 + 预览 | ✅ | — | 内置 |
| 场景摆放 + 环境 | ✅ | — | 内置 |
| AI 捏脸 + 表情 | ✅ | — | 内置（AI 原生） |
| 骨骼动画播放 | ✅ | — | 内置 |
| 轻量 PBR 渲染 | ✅ | — | 内置 |
| GPU 特效/后处理 | ✅ | — | 内置 |
| 3DGS 加载/渲染 | ✅ | — | 内置 |
| 复杂多边形建模 | — | ✅ Blender | 桥接 |
| 修改器堆栈 | — | ✅ Blender | 桥接 |
| UV 展开 + 材质绘制 | — | ✅ Blender | 桥接 |
| 地形/植被系统 | — | ✅ Blender Geometry Nodes | 桥接 |
| ControlNet 视频生成 | — | ✅ ComfyUI | 桥接 |

### 10.4 对 AI 视频创作的协同价值

```
AI 视频创作全流程（Neko Suite 一体化）：

剧本（neko-story）
  ↓ AI 解析 → 分镜描述
关键帧制作
  ├─ Layer 1: neko-model 轻量场景 → 渲染关键帧
  ├─ Layer 1: neko-sketch 手绘关键帧
  └─ Layer 2: Blender MCP 专业场景 → 渲染关键帧
AI 视频生成（neko-agent MediaGenerationService）
  ├─ Image-to-Video（关键帧驱动）
  ├─ Text-to-Video（文本驱动）
  └─ Layer 2: ComfyUI ControlNet（深度图/法线图控制）
后期编辑（neko-cut）
  ├─ 多段拼接 + 转场
  ├─ GPU 特效 + 色彩校正
  ├─ AI 配乐（Suno）+ AI 字幕
  └─ 导出
```

**关键帧驱动解决 AI 视频三大痛点**：
- **角色一致性** → neko-model 3D 角色多角度渲染 → 统一角色外观
- **构图可控** → neko-model/neko-sketch 精确控制画面构图
- **风格统一** → 同一 3D 场景 + 一致的渲染参数

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
