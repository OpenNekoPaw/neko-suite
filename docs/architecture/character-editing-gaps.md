# 角色编辑能力差距分析

> 基于 neko-engine 引擎代码的完整调研，分析 GLB (3D) 和 INP (2D) 在角色编辑五个维度（表情/发型/服饰/体态/动作）上的当前能力与待补充项。

## 1. 能力矩阵总览

### 3D (GLB / native-scene)

| 维度 | 技术手段 | 当前状态 | 缺失项 | 优先级 |
|------|---------|---------|--------|--------|
| **表情** | Morph Targets | CPU 动画插值 ✅ / GPU 渲染 ❌ / 交互 API ❌ | GPU morph 渲染 + `set_morph_weights` API | P1 |
| **发型** | 节点显隐 | ❌ 无 Visibility 组件 | `Visibility` 组件 + `set_visible` API | P0 |
| **服饰** | 节点显隐 + 材质替换 | ❌ 无运行时材质修改 | Visibility + 材质编辑 API | P1 |
| **体态** | Morph Targets + 骨骼缩放 | 骨骼 Transform ✅ / Morph ❌ | 同表情 | P1 |
| **动作** | 骨骼动画 + IK | ✅ 完整（29 个 API） | 无 | - |

### 2D (INP / native-puppet)

| 维度 | 技术手段 | 当前状态 | 缺失项 | 优先级 |
|------|---------|---------|--------|--------|
| **表情** | 参数驱动变形 | ✅ `param` API 设置参数值 | 无 | - |
| **发型** | 节点 Opacity | Opacity 组件存在但 API 只读 | `set_node_opacity` API | P0 |
| **服饰** | 节点 Opacity + 纹理替换 | Opacity 只读 / 无纹理替换 | Opacity API + 纹理热替换 | P1 |
| **体态** | 参数驱动 | ✅ 同表情 | 无 | - |
| **动作** | 参数动画 + 混合 | ✅ 完整（18 个 API） | 物理模拟（TODO P2） | P2 |

---

## 2. 按优先级的待补充能力

### P0: Visibility / Opacity 控制

**影响**: 发型切换、服饰层切换的基础能力。

#### 3D — `Visibility` 组件 + API

**需修改文件**:

| 文件 | 变更 |
|------|------|
| `native-scene/src/components.rs` | 新增 `Visible(pub bool)` 组件 |
| `native-scene/src/loader.rs` | 加载时默认 `Visible(true)` |
| `native-scene/src/world.rs` | 新增 `set_visible(node_id, visible)` |
| `native-api/src/controllers/scenes.rs` | 新增 `set_visible` action |
| `types/src/registry.rs` | 注册 `set_visible` |
| `native-core/src/gpu/scene_renderer/` | 渲染时跳过 `Visible(false)` 节点 |
| `native-scene/src/world.rs` → `get_snapshot()` | SceneNodeSnapshot 增加 `visible` 字段 |

**工作量估计**: ~1 天

#### 2D — `set_node_opacity` API

**需修改文件**:

| 文件 | 变更 |
|------|------|
| `native-puppet/src/world.rs` | 新增 `set_node_opacity(node_id, opacity)` |
| `native-api/src/controllers/puppets.rs` | 新增 `set_opacity` action |
| `types/src/registry.rs` | 注册 `set_opacity` |

Opacity 组件已存在（加载时从 INP `enabled` 映射），只需暴露修改 API。

**工作量估计**: ~0.5 天

---

### P1: Morph Target GPU 渲染 + 交互 API

**影响**: 3D 表情滑块、体态调整。

**当前状态**:
- ✅ glTF 加载时解析 morph target 动画通道
- ✅ CPU 侧 `MorphWeights` 组件 + 动画插值
- ❌ glTF 加载器不读取 morph target 顶点数据
- ❌ GPU 无 morph target 渲染
- ❌ 无交互式 `set_morph_weights` API

**实施分 3 步**:

#### Step 1: `set_morph_weights` API（不需要 GPU 变更）

先暴露 CPU 侧已有的 `MorphWeights` 设置能力：

| 文件 | 变更 |
|------|------|
| `native-scene/src/world.rs` | 新增 `set_morph_weights(node_id, weights: Vec<f32>)` |
| `native-api/src/controllers/scenes.rs` | 新增 `morph_weights` action |

这使 TS 层可以通过 API 设置权重，即使 GPU 还不渲染变形结果，也可为 UI 编辑做准备。

#### Step 2: glTF Morph Target 顶点数据加载

| 文件 | 变更 |
|------|------|
| `native-scene/src/loader.rs` | 解析 primitive morph targets (POSITION/NORMAL deltas) |
| `native-scene/src/components.rs` | 新增 `MorphTargetData { targets: Vec<Vec<Vec3>> }` |
| `native-core/src/gpu/scene_renderer/asset_cache.rs` | 创建 morph target GPU storage buffers |

#### Step 3: GPU Morph Rendering

**方案选择**:

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A: 顶点 Buffer 扩展** | 简单直接 | 内存膨胀（每 target 一组顶点） |
| **B: Storage Buffer + 计算着色器** | 内存高效 | 需新增 compute pipeline |
| **C: CPU 预混合后上传** | 无 shader 改动 | 每帧 CPU-GPU 传输 |

**推荐方案 B**（Storage Buffer）:

| 文件 | 变更 |
|------|------|
| `vertex.rs` | 无变更（morph 在 compute 阶段处理） |
| 新增 `morph_compute.wgsl` | Compute shader: `final = base + Σ(weight[i] * delta[i])` |
| `pbr_pipeline.rs` | 新增 morph compute bind group + pipeline |
| `pbr_forward_skinned.wgsl` | 读取 compute 输出的混合后顶点 |
| `asset_cache.rs` | 存储 morph delta buffers |

**工作量估计**: Step 1 ~0.5 天, Step 2 ~1 天, Step 3 ~3 天

---

### P1: 材质运行时编辑 API

**影响**: 换装（颜色/纹理替换）。

**当前状态**:
- ✅ 材质 uniform buffer 已有 `COPY_DST` flag（支持运行时更新）
- ❌ 无修改材质的 API
- ❌ 材质 uniform 只含 `base_color_factor` + `metallic/roughness`

#### Step 1: 材质参数编辑 API

| 文件 | 变更 |
|------|------|
| `native-scene/src/components.rs` | 扩展 `MaterialRef` 存储可编辑参数 |
| `native-scene/src/world.rs` | 新增 `set_material(node_id, params)` |
| `native-api/src/controllers/scenes.rs` | 新增 `material_update` action |
| `native-core/src/gpu/scene_renderer/asset_cache.rs` | `update_material_buffer()` 方法 |

**支持的参数**: base_color_factor、metallic_factor、roughness_factor

#### Step 2: 纹理热替换（后续）

| 文件 | 变更 |
|------|------|
| `asset_cache.rs` | 新增 `replace_texture(material_index, slot, image_data)` |
| `pbr_pipeline.rs` | 支持动态重建 material bind group |

**工作量估计**: Step 1 ~1 天, Step 2 ~2 天

---

### P1: 节点删除 API

**影响**: 编辑器内删除/替换模型部件。

| 文件 | 变更 |
|------|------|
| `native-scene/src/world.rs` | 新增 `delete_node(node_id)` — despawn entity + 子节点 |
| `native-api/src/controllers/scenes.rs` | 新增 `delete_node` action |
| `native-core/src/gpu/scene_renderer/` | 清理对应 GPU 资源 |

**工作量估计**: ~1 天

---

### P2: 2D 物理模拟

`native-puppet/src/systems.rs` 中已标记：
```rust
// TODO(P2): implement spring/pendulum physics from inox2d
```

影响头发/衣物自然摆动，非核心编辑功能，可后期实现。

---

## 3. 推荐实施路线图

```
Phase 1 (P0 基础能力) ✅ ──────────────────────────────
├─ 3D Visibility 组件 + set_visible API     ✅
├─ 2D set_node_opacity API                   ✅
└─ 验证：发型/服饰层显隐切换

Phase 2 (P1 表情 + 体态) ✅ ──────────────────────────
├─ 3D set_morph_weights API (CPU-only)       ✅
├─ 3D update_material API                    ✅
├─ 3D delete_node API                        ✅
├─ glTF morph target 顶点数据加载            — 待做（GPU morph 渲染前置）
└─ GPU morph rendering (compute shader)      — 待做

Phase 3 (P1 换装) ✅ ─────────────────────────────────
├─ 材质参数编辑 API                          ✅
├─ 节点删除 API                              ✅
└─ 验证：换装（颜色/纹理/显隐组合）

Phase 4 (P2 增强) ✅ ─────────────────────────────────
├─ 2D 物理模拟（弹簧/钟摆）                  ✅
├─ 材质扩展属性（emissive/AO）               ✅
├─ 2D 纹理热替换                             ✅
└─ 验证：物理摆动 + 发光/遮蔽 + 换肤
```

## 4. TS 层对应变更（每个 Rust API 新增后）

每个新 Rust action 需要对应的 TS 层集成：

| Rust Action | TS EngineClient 方法 | 编辑器 UI |
|-------------|---------------------|-----------|
| `set_visible` | `setNodeVisible(nodeId, visible)` | SceneTree 节点眼睛图标 |
| `set_opacity` (2D) | `setNodeOpacity(nodeId, opacity)` | 节点面板滑块 |
| `morph_weights` | `setMorphWeights(nodeId, weights)` | 表情/体态滑块面板 |
| `update_material` | `updateMaterial(nodeId, params)` | 材质属性面板（含 emissive/AO） |
| `delete_node` | `deleteNode(nodeId)` | SceneTree 右键菜单 |
| `set_texture` (2D) | `setTexture(nodeId, textureIndex)` | 纹理选择器 |
