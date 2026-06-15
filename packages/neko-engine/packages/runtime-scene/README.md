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

## 核心能力

| 能力 | 说明 |
|------|------|
| glTF/glb 加载 | 场景层级、Transform、Mesh/Material、光照、相机、Skeleton、Morph Target 和关键帧动画 |
| ECS 架构 | `bevy_ecs 0.15` 独立 crate，零 wgpu 依赖，不引入 Bevy 全框架 |
| 动画系统 | 从 glTF buffer 提取关键帧数据，支持 Translation/Rotation/Scale/MorphWeights 和时间循环 |
| 相机系统 | Perspective / Orthographic 投影和共享 near/far 参数 |
| 骨骼系统 | 两遍扫描建立 node/entity 映射与 joint_entities，读取 inverse bind matrices |

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

## 依赖

| Crate | 版本 | 用途 |
|-------|------|------|
| `bevy_ecs` | 0.15 | ECS 框架（独立，非 Bevy 全框架） |
| `glam` | 0.29 | 数学库（Vec3/Quat/Mat4） |
| `gltf` | 1.4 | glTF 解析（含 KHR_lights_punctual） |
| `serde` | 1.0 | 序列化（SceneSnapshot） |
| `tracing` | 0.1 | 日志 |
| `thiserror` | 1.0 | 错误处理 |

## 架构约束

- **不使用 Bevy 全框架**：wgpu 版本冲突（Bevy 0.20+ vs neko-engine 0.19）
- **bevy_ecs 独立 crate**：零 wgpu 依赖，手动驱动（不用 `App::run()`）
- **混合架构**：bevy_ecs 数据 + 索引层级树（Parent/Children）
- **请求驱动**：`Schedule::run()` 按需调用，非游戏引擎帧循环

## 活跃方向

- [ ] 前端 R3F 视口集成（Morph Target 滑块 UI）
- [ ] AI 捏脸 MCP Tools（`face.generate_params` / `face.from_image` / `face.adjust`）
- [ ] CSG 布尔运算（三角网格级别）
- [ ] 3D 文字挤出（`cosmic-text`）
- [ ] 参数化几何体生成
- [ ] 轻量 PBR 渲染器
