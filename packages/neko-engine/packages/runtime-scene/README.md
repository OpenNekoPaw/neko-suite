# runtime-scene

3D 场景管理 crate，使用 bevy_ecs 作为独立 ECS 库（不依赖 Bevy 全框架）。

## 架构

```
runtime-scene
├─ components.rs    # ECS 组件（Transform/Mesh/Material/Light/Camera/Skeleton/MorphWeights）
├─ world.rs         # SceneWorld trait + BevySceneWorld 实现
├─ hierarchy.rs     # Parent/Children 层级索引
├─ systems.rs       # ECS System（transform_propagation, animation_tick）
└─ loader.rs        # glTF/glb 加载 → ECS 实体
```

## 核心特性

### ✅ 已实现（Phase 1，2026-03-13）

- **glTF/glb 加载**：完整支持 glTF 2.0 规范
  - 场景层级（Parent/Children）
  - Transform 传播（local → global）
  - Mesh/Material 引用
  - 光照（Directional/Point/Spot）
  - 相机（Perspective + Orthographic）
  - 骨骼动画（Skeleton + joint_entities + inverse bind matrices）
  - Morph Target 动画（Blend Shapes）
  - 关键帧动画（Translation/Rotation/Scale/MorphWeights）

- **ECS 架构**：
  - `bevy_ecs 0.15` 独立 crate（零 wgpu 依赖，无 Bevy 全框架）
  - 变更检测（`Changed<T>`）
  - 并行调度（`Schedule`）
  - 事件系统（`Events<T>`）

- **动画系统**：
  - 从 glTF buffer 提取实际关键帧数据（timestamps + values）
  - 支持 Translation/Rotation/Scale/MorphWeights 四种属性
  - 时间循环（duration wrapping）
  - 关键帧插值（线性，未来可扩展为 cubic spline）

- **相机系统**：
  - `CameraProjection::Perspective { fov, aspect_ratio }`
  - `CameraProjection::Orthographic { xmag, ymag }`
  - 共享 `near`/`far` 参数

- **骨骼系统**：
  - 两遍扫描：Pass 1 建立 `node_entity_map`，Pass 2 填充 `joint_entities`
  - IBM（Inverse Bind Matrices）从 glTF buffer 直接读取
  - 支持 glTF skin 规范

## 使用示例

```rust
use neko_native_scene::{BevySceneWorld, SceneWorld};
use std::path::Path;

// 创建场景世界
let mut world = BevySceneWorld::new();

// 加载 glTF 模型
let result = world.load_model(Path::new("model.glb"))?;
println!("Loaded {} entities", result.entity_count);
println!("Animations: {:?}", result.animation_clips);

// 获取场景快照
let snapshot = world.get_snapshot();
for node in &snapshot.nodes {
    println!("{}: pos={:?}", node.name, node.position);
}

// 播放动画
let delta = world.tick("Walk", 0.5); // 0.5 秒时刻
println!("Updated {} transforms", delta.updated_transforms.len());
println!("Updated {} morph weights", delta.updated_morph_weights.len());
```

## 测试

```bash
cargo test --package neko-runtime-scene
```

**覆盖率**：12 个单元测试，覆盖核心功能：
- Transform 传播（单根 + 父子层级）
- 关键帧索引查找（边界 + 插值）
- Morph Target 动画（3 帧 × 2 morph targets）
- 相机投影（Perspective + Orthographic）
- glTF Transform 分解（identity + translation）
- IBM 读取（空 buffer 降级为 identity）

## 依赖

| Crate | 版本 | 用途 |
|-------|------|------|
| `bevy_ecs` | 0.15 | ECS 框架（独立，非 Bevy 全框架） |
| `glam` | 0.29 | 数学库（Vec3/Quat/Mat4） |
| `gltf` | 1.4 | glTF 解析（含 KHR_lights_punctual） |
| `serde` | 1.0 | 序列化（SceneSnapshot） |
| `tracing` | 0.1 | 日志 |
| `thiserror` | 1.0 | 错误处理 |

## 架构决策

详见 [docs/architecture/3d-capability-analysis.md](../../../docs/architecture/3d-capability-analysis.md)。

**关键约束**：
- **不使用 Bevy 全框架**：wgpu 版本冲突（Bevy 0.20+ vs neko-engine 0.19）
- **bevy_ecs 独立 crate**：零 wgpu 依赖，手动驱动（不用 `App::run()`）
- **混合架构**：bevy_ecs 数据 + 索引层级树（Parent/Children）
- **请求驱动**：`Schedule::run()` 按需调用，非游戏引擎帧循环

## 下一步（Phase 2）

- [ ] 前端 R3F 视口集成（Morph Target 滑块 UI）
- [ ] AI 捏脸 MCP Tools（`face.generate_params` / `face.from_image` / `face.adjust`）
- [ ] CSG 布尔运算（三角网格级别）
- [ ] 3D 文字挤出（`cosmic-text`）
- [ ] 参数化几何体生成
- [ ] 轻量 PBR 渲染器（Phase 3）
