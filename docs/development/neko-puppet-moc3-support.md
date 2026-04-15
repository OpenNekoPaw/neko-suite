# neko-puppet Live2D (.moc3) 支持开发方案

> Date: 2026-04-13
> Updated: 2026-04-15
> Status: Phase 0-5 Implemented, Phase 6-7 Pending
> Related: [许可证分析](../analysis/live2d-license-analysis-2026-04-13.md) | ADR-2D-001

---

## 0. 实施状态

| Phase | 状态 | 内容 | 关键指标 |
|-------|------|------|---------|
| 0 | ✅ 完成 | 移除 inox2d | RUSTSEC-2022-0081 消除 |
| 1 | ✅ 完成 | MOC3 解析器 + Loader + 1D 插值 | 自研 parser (zero unsafe) |
| 2 | ✅ 完成 | WarpDeformer + RotationDeformer | 双线性网格 + 枢轴旋转 |
| 3 | ✅ 完成 | Expression + Motion + Physics | .exp3/.motion3/.physics3.json |
| 4 | ✅ 完成 | Extension + Webview + i18n | .moc3 文件类型注册 + 拖放 |
| 5 | ✅ 完成 | 面部追踪增强 | ParamBody/Breath/Cheek/EyeSmile |
| 6 | 📋 待实施 | AI 辅助 Puppet 创作 | Agent 工具 + 模板 UI |
| 7 | 📋 待实施 | VTube Studio API 兼容 | WebSocket VTS 协议子集 |

**验证**: 107 Rust 单元测试, clippy 0 warnings, pnpm build 29/29 tasks

**实现要点**:
- 未使用 `live2d-parser` crate（API 缺少顶点/UV/索引/deformer 数据），完全自研
- Expression 支持 Add/Multiply/Override 混合 + fade-in/fade-out
- Motion Bezier 曲线按 30fps 采样为线性关键帧
- Physics 支持 input 参数驱动（anchor 位移），非静态摆锤
- Deformer 与 keyform 正确叠加（非覆盖），执行顺序: keyform → rotation → warp
- Part 层级完整解析（art_mesh_parent_part_indices @ 0xDC）

---

## 1. 战略背景

### 1.1 为什么需要 .moc3 支持

- **市场事实**: 2D VTuber 市场（全球 200 万+ VTuber 的多数）以 Live2D (.moc3) 为事实标准，驱动 300+ 商业作品
- **用户资产**: 大量用户持有 .moc3 模型（委托制作成本 $500-5000），无法迁移到其他格式
- **VRM 不可替代 Live2D**: VRM 是 3D 格式（neko-model 已支持），Live2D 是 2D 格式（neko-puppet），两者面向不同用户群、不同创作需求，互补而非替代
- **Inochi2D 风险**: inox2d 原型状态 + Inochi Creator 19 个月无发布 + NLnet 资助已过期，INP 格式通用性极低

### 1.2 核心决策

| 决策 | 内容 | 理由 |
|------|------|------|
| 删除 `inox2d` 依赖 | 移除 Cargo.toml 中的 ghost dependency | 零运行时使用 + 引入 RUSTSEC-2022-0081 安全告警 |
| 保留 INP loader | `loader.rs` 已完全自研，不依赖 inox2d | 维护成本近零，兼容已有用户 |
| 不使用 Live2D 官方 SDK | Clean-room 实现，ADR-2D-001 不变 | Cubism Core 闭源 + Framework 许可证不兼容开源 |
| 使用 `live2d-parser` | MPL-2.0 纯 Rust 解析器 | 文件级 copyleft，无许可证风险 |
| 自研变形引擎 | 基于 OpenL2D 公开规格 | 版权保护"表达"不保护"功能接口"，逆向互操作合法（DMCA §1201(f)） |

### 1.3 许可证合规要求

1. 团队成员**不得下载/参考 Cubism SDK 源码** — 避免受 EULA 约束
2. 仅参考: OpenL2D 公开规格 + `live2d-parser` 源码（MPL-2.0）
3. 所有 `moc3/` 新文件标注: `//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.`
4. UI/文档使用描述性语言: "导入 .moc3 模型文件"（描述性合理使用），避免使用 "Live2D" 商标

---

## 2. 架构设计

### 2.1 核心洞察

现有渲染管线（ECS 组件 → deformation systems → PuppetSnapshot/DeformedMesh → Canvas 2D）**已经是格式无关的**。loader 是唯一 INP 特有代码。添加 MOC3 = 新 loader + 新变形组件 + 格式分发，下游全部复用。

### 2.2 架构图

```
                     ┌─────────────────────────────────────┐
                     │         Extension Host (TS)          │
                     │  PuppetEditorProvider                │
                     │  ├── .nkp / .inp / .moc3 dispatch   │
                     │  └── agentCapabilityProvider (不变)  │
                     └──────────────┬──────────────────────┘
                                    │ postMessage / HTTP / WS
                     ┌──────────────▼──────────────────────┐
                     │         Webview (React/TS)           │
                     │  PuppetCanvas.tsx      (格式无关)    │
                     │  puppet-store.ts       (格式无关)    │
                     │  puppet-controller.ts  (格式无关)    │
                     └──────────────┬──────────────────────┘
                                    │ HTTP API
            ┌───────────────────────▼──────────────────────┐
            │           engine-kernel (Rust)                │
            │  PuppetService → Mutex<BevyPuppetWorld>      │
            │  PuppetsController (格式无关 API)            │
            └───────────────────────┬──────────────────────┘
                                    │
   ┌────────────────────────────────▼──────────────────────────┐
   │               runtime-puppet (Rust)                        │
   │                                                            │
   │  ┌──────────┐   ┌───────────┐   ┌──────────────────────┐ │
   │  │loader.rs │   │moc3/      │   │ ECS Components       │ │
   │  │(INP)     │   │loader.rs  │   │ (格式无关)           │ │
   │  │已有      │   │新增       │   │                      │ │
   │  └────┬─────┘   └────┬──────┘   │ PuppetParameters     │ │
   │       │              │          │ MeshData              │ │
   │       └──────┬───────┘          │ DeformedVertices      │ │
   │              ▼                  │ Transform2D           │ │
   │  ┌───────────────┐             │ ParameterBinding      │ │
   │  │ world.rs      │             │ MultiKeyDeformation ★ │ │
   │  │ magic bytes   │── spawn ──→ │ WarpDeformer        ★ │ │
   │  │ 格式分发      │             │ RotationDeformer    ★ │ │
   │  └───────┬───────┘             │ ExpressionLibrary   ★ │ │
   │          │                     └──────────────────────┘ │
   │  ┌───────▼───────┐   ┌────────────────────────┐        │
   │  │ systems.rs    │   │ moc3/                    │        │
   │  │ (扩展)        │   │  interpolation.rs     ★ │        │
   │  │ + multikey    │   │  warp_deformer.rs     ★ │        │
   │  │ + warp        │   │  rotation_deformer.rs ★ │        │
   │  │ + rotation    │   │  expression.rs        ★ │        │
   │  └───────────────┘   │  motion.rs            ★ │        │
   │                      │  physics.rs           ★ │        │
   │                      │  mod.rs               ★ │        │
   │                      └────────────────────────┘        │
   └────────────────────────────────────────────────────────┘
   ★ = 新增
```

### 2.3 数据流

```
.moc3 + model3.json + textures/
  │
  ▼
live2d-parser (MPL-2.0) → Moc3Data
  │
  ▼
moc3/loader.rs → 同一套 ECS 组件
  │
  ▼
systems.rs (扩展) → DeformedVertices
  │
  ▼
world.rs → PuppetSnapshot / PuppetDelta (格式无关)
  │
  ▼
HTTP API → Webview → PuppetCanvas.tsx (零修改)
```

### 2.4 AI 集成分析

| 维度 | Live2D (.moc3) | VRM (.vrm) | INP (.inp) |
|------|----------------|-----------|------------|
| **AI 可读性** | 极低（编译后二进制） | 高（JSON + bin） | 中（JSON payload） |
| **参数可操作性** | **最高** — 标准化命名（ParamAngleX 等） | 高 — VRM Expression | 高 — 类似 Live2D |
| **AI 从零生成** | 不可能（需专业绑定） | 不可能（需 3D mesh） | 不可能 |
| **AI 最佳路径** | 模板 puppet + AI 调参/换纹理 | 模板 + AI 调表情 | 同 Live2D |

现有 AI 工具（`PuppetGenerateParams`/`PuppetFromImage`/`PuppetAdjust`）操作语义化参数，**格式无关**，添加 .moc3 后自动继承。

---

## 3. 分阶段开发计划

### Phase 0: 清理 — 移除 inox2d（1 天）

**复杂度**: S

| 文件 | 操作 |
|------|------|
| `runtime-puppet/Cargo.toml` | 移除 `inox2d` 依赖 |
| `runtime-puppet/src/lib.rs` | 更新模块文档注释 |
| `runtime-puppet/src/loader.rs` | 更新注释，移除 inox2d 引用 |
| `runtime-puppet/src/components.rs` | 更新注释为格式无关 |
| `runtime-puppet/src/systems.rs` | 更新注释 |
| `runtime-puppet/src/animation.rs` | 更新注释 |

**验证**: `cargo build && cargo test && cargo clippy && cargo audit`（RUSTSEC-2022-0081 消失）

**Done**: inox2d 移除，所有现有测试通过

---

### Phase 1: MOC3 解析器 + Loader（5-7 天）

**复杂度**: L | **依赖**: Phase 0

#### 新建文件

| 文件 | 职责 |
|------|------|
| `runtime-puppet/src/moc3/mod.rs` | 模块根，clean-room 声明 |
| `runtime-puppet/src/moc3/loader.rs` | .moc3 → ECS 实体（核心） |
| `runtime-puppet/src/moc3/interpolation.rs` | Key Form 插值引擎 |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `runtime-puppet/Cargo.toml` | 添加 `live2d-parser` |
| `runtime-puppet/src/lib.rs` | 添加 `pub mod moc3;` |
| `runtime-puppet/src/loader.rs` | 添加 `LoadError::Moc3Error` |
| `runtime-puppet/src/components.rs` | 添加 `PuppetFormat`, `PartVisibility`, `MultiKeyDeformation` |
| `runtime-puppet/src/world.rs` | magic bytes 格式分发 + `load_puppet_moc3()` |
| `engine-kernel/src/services/puppet.rs` | trait + impl 添加 `load_puppet_moc3()` |
| `host-api/src/controllers/puppets.rs` | 新增 `load_moc3` action |

#### 关键类型

```rust
// 多关键帧变形 — MOC3 模型核心
#[derive(Component)]
pub struct MultiKeyDeformation {
    pub axes: Vec<DeformAxis>,         // 参数名 + 离散关键值
    pub key_forms: Vec<Vec<Vec2>>,     // 每个 key form 的顶点位置
    pub index_map: Vec<usize>,         // 轴值组合 → key form 索引
}

pub struct DeformAxis {
    pub param_name: String,
    pub key_values: Vec<f32>,          // 排序后的关键参数值
}
```

#### MOC3 → ECS 映射

| MOC3 概念 | ECS 组件 | 说明 |
|-----------|---------|------|
| Parameter | `ParameterDef` in `PuppetParameters` | 1:1 直接映射 |
| Part | `PuppetNodeType::Group` + `PartVisibility` | 可见性分组 |
| Drawable | `MeshData` + `TextureRef` + `ZOrder` + `BlendMode` | 直接映射 |
| Key Form | `MultiKeyDeformation` | 多关键帧顶点变形 |

Phase 1 仅实现 **1D 参数插值**（单轴 key form 线性插值），2D 在 Phase 2。

**验证**: 合成数据单元测试（10+），INP 回归测试全通过

**Done**: .moc3 文件可解析为 ECS 实体，1D key form 插值正确，格式自动检测工作

---

### Phase 2: 变形引擎 — Warp/Rotation Deformer + 2D 参数（5-7 天）

**复杂度**: L | **依赖**: Phase 1

#### 新建文件

| 文件 | 职责 |
|------|------|
| `moc3/warp_deformer.rs` | 网格变形器（行列控制点 → 子顶点双线性插值） |
| `moc3/rotation_deformer.rs` | 旋转变形器（枢轴点 + 角度） |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `moc3/mod.rs` | 注册新模块 |
| `moc3/interpolation.rs` | 添加 2D 双线性插值 `interpolate_bilinear()` |
| `moc3/loader.rs` | 填充 WarpDeformer / RotationDeformer 组件 |
| `systems.rs` | 添加 `multi_key_deformation_update`, `warp_deformer_update`, `rotation_deformer_update` |
| `components.rs` | 添加 `WarpDeformer`, `RotationDeformer` 组件 |

#### 系统执行顺序

```
1. animation_tick / animation_blend_tick
2. expression_update (Phase 3)
3. physics_tick / physics_chain_tick (Phase 3)
4. rotation_deformer_update  ← 新增，深度优先序
5. warp_deformer_update      ← 新增，深度优先序
6. multi_key_deformation_update ← 新增，叶节点 drawable
7. parameter_update (现有，处理 INP ParameterBinding)
8. transform_propagation_2d (现有)
```

**验证**: 2x2 网格 warp 单测，旋转变形单测，双线性插值单测（15+），性能 < 2ms/tick

**Done**: 完整变形管线工作，Warp + Rotation deformer 正确

---

### Phase 3: 表情 / 动作 / 物理（4-5 天）

**复杂度**: M | **依赖**: Phase 1 | **可与 Phase 2 并行**

#### 新建文件

| 文件 | 职责 |
|------|------|
| `moc3/expression.rs` | .exp3.json 解析 → `ExpressionLibrary` ECS 组件 |
| `moc3/motion.rs` | .motion3.json 解析 → `AnimationClip`（Bezier 采样为线性关键帧） |
| `moc3/physics.rs` | .physics3.json 解析 → 链式摆锤模拟 |

#### 关键设计

**Expression**: 参数覆盖 + 三种混合模式（Add/Multiply/Override）+ 淡入淡出

**Motion**: Bezier 段按 30fps 采样为线性关键帧，完全复用现有 `AnimationClip`/`ParameterCurve`

**Physics**: Live2D 链式摆锤（输入参数 → 链节点传播 → 输出参数），比 INP 的 SimplePhysics 更复杂

#### 修改文件

| 文件 | 变更 |
|------|------|
| `moc3/loader.rs` | 解析 model3.json 发现辅助文件，加载并挂载到 ECS |
| `world.rs` | PuppetWorld trait 添加 `set_expression()` / `get_expressions()` |
| `systems.rs` | 集成 expression_update + physics_chain_tick |
| `host-api/controllers/puppets.rs` | 新增 expressions / set_expression action |
| `engine-kernel/services/puppet.rs` | trait + impl |

**验证**: .exp3.json 解析测试，Bezier 采样精度测试，blend mode 测试（12+）

**Done**: 三种辅助文件可加载，表情/动作/物理工作

---

### Phase 4: Extension + Webview 集成（3-4 天）

**复杂度**: M | **依赖**: Phase 1

#### 新建文件

| 文件 | 职责 |
|------|------|
| `webview/src/utils/moc3-texture-loader.ts` | MOC3 外部 PNG 纹理加载（base64 → ImageBitmap） |

#### 修改文件

| 文件 | 变更 |
|------|------|
| `neko-puppet/package.json` | 注册 `.moc3` / `.model3.json` 文件类型 |
| `extension/src/editor/puppetEditorProvider.ts` | 格式检测 + MOC3 bundle 组装 + 纹理发现 |
| `webview/src/animation/inochi2d-controller.ts` | 添加 `loadMoc3Bundle()` 方法 |
| `webview/src/stores/puppet-store.ts` | 添加 `puppetFormat` 状态 |
| `webview/src/PuppetApp.tsx` | 文件拖放支持 .moc3 |
| `neko-types/src/types/puppet.ts` | NkpProjectData 添加 `format` 字段 |
| i18n 文件 (en/zh-cn) | 更新导入提示文案 |

**关键**: `PuppetCanvas.tsx` **零修改** — 它操作格式无关的 `DeformedMesh[]` + `ImageBitmap[]`

**验证**: 手动 E2E — 打开 .moc3、导入 .model3.json、拖放、参数调节

**Done**: .moc3 文件在 VSCode 中可打开并渲染

---

### Phase 5: 面部追踪增强（2 天）

**复杂度**: S | **依赖**: Phase 1

#### 修改文件

| 文件 | 变更 |
|------|------|
| `neko-live/webview/src/tracking/puppetMapping.ts` | 添加 ParamBodyAngle/ParamBreath/ParamCheek/ParamEyeSmile 映射 |
| `neko-types/src/types/puppet-face-params.ts` | 添加 `LIVE2D_PARAM_ALIASES` 命名映射 |

**关键洞察**: 现有映射已使用 Live2D 标准命名（ParamEyeLOpen 等），大部分开箱即用。仅需补充少量参数 + 自动检测命名约定。

**验证**: 单测（4+），手动: 打开 .moc3 → 启用面部追踪 → 验证响应

**Done**: 面部追踪对 .moc3 和 .inp 均正常工作

---

### Phase 6: AI 辅助 Puppet 创作（3-4 天）

**复杂度**: M | **依赖**: Phase 3 (表情), Phase 4

#### 修改文件

| 文件 | 变更 |
|------|------|
| `neko-puppet/extension/src/agentCapabilityProvider.ts` | 新增 `PuppetListExpressions` + `PuppetSetExpression` 工具 |
| `neko-puppet/extension/src/editor/puppetEditorProvider.ts` | 模板选择 UI 添加 "导入 .moc3 模型" |
| `neko-types/src/types/puppet.ts` | NkpProjectData 添加 `expressions` / `activeExpression` |

#### AI 能力边界

| AI 可以做 | AI 不能做 |
|----------|----------|
| 根据文字/图片推断面部参数值 | 从零生成 .moc3 mesh 绑定 |
| 选择/切换表情 | 创建新的网格变形映射 |
| 自然语言调整参数（"眼睛再大一点"） | 自动拆分 PSD 图层并绑定 |
| 未来: 生成/替换纹理（UV 布局已知） | — |

**Done**: AI 工具对 .moc3 表情可用，现有参数工具兼容两种格式

---

### Phase 7: VTube Studio API 兼容（4-5 天）

**复杂度**: M | **依赖**: Phase 5 | **优先级**: 低

#### 新建文件

| 文件 | 职责 |
|------|------|
| `host-http/src/routes/vtube_studio_api.rs` | VTS WebSocket 协议子集 |
| `host-http/src/routes/vtube_studio_types.rs` | VTS 消息类型定义 |

#### 支持的 VTS API 子集

- `APIStateRequest` — 连接状态
- `AuthenticationTokenRequest/Response` — 插件认证
- `InputParameterListRequest` — 参数列表
- `InjectParameterDataRequest` — 外部参数注入（核心功能）
- `ExpressionStateRequest/ActivationRequest` — 表情控制

**Done**: VTS 兼容 WebSocket 运行，至少一个外部 VTS 插件可工作

---

## 4. 时间线与 MVP

```
Week 1:  Phase 0 (1d) ──→ Phase 1 开始 (4d)
Week 2:  Phase 1 完成 (3d) + Phase 2 开始 (2d)
Week 3:  Phase 2 完成 (5d)
         Phase 3 可并行开始
Week 4:  Phase 3 (5d)
Week 5:  Phase 4 (4d) + Phase 5 (1d)
Week 6:  Phase 6 (4d)
Week 7:  Phase 7 (5d)
Week 8:  集成测试 + 修复 + 文档
```

**MVP（最小可用产品）**: Phase 0 + 1 + 4 = **用户可打开 .moc3 文件并调节参数**，约 2 周。

**关键路径**: Phase 0 → 1 → 2。Phase 3-7 可在 Phase 1 后并行推进。

---

## 5. 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| `live2d-parser` API 不够用 | 中 | MPL-2.0 可 fork，仅修改文件保持 MPL-2.0 |
| Key Form 插值精度 | 中 | 用真实 .moc3 对比 VTube Studio 渲染 |
| 2D 参数绑定复杂度 | 中 | Phase 1 先 1D，Phase 2 补双线性 |
| Live2D 发 C&D 信 | 低 | 未使用任何 Live2D 软件/SDK，EULA 不适用 |
| MOC3 新版本不兼容 | 低 | live2d-parser 支持 2.0-4.0，可 fork 扩展 |
| 大文件性能 | 低 | HTTP API 传输（避免 postMessage 限制），dirty flag 优化 |

---

## 6. 性能预算

| 指标 | 目标 |
|------|------|
| Puppet tick | < 5ms（60fps 目标） |
| MOC3 加载 | < 500ms（典型模型） |
| 额外内存 | < 50MB/模型 |

---

## 7. 关键文件索引

### 需新建

| 文件路径 | Phase |
|---------|-------|
| `runtime-puppet/src/moc3/mod.rs` | 1 |
| `runtime-puppet/src/moc3/loader.rs` | 1 |
| `runtime-puppet/src/moc3/interpolation.rs` | 1 |
| `runtime-puppet/src/moc3/warp_deformer.rs` | 2 |
| `runtime-puppet/src/moc3/rotation_deformer.rs` | 2 |
| `runtime-puppet/src/moc3/expression.rs` | 3 |
| `runtime-puppet/src/moc3/motion.rs` | 3 |
| `runtime-puppet/src/moc3/physics.rs` | 3 |
| `webview/src/utils/moc3-texture-loader.ts` | 4 |
| `host-http/src/routes/vtube_studio_api.rs` | 7 |

### 需修改

| 文件路径 | Phase | 变更摘要 |
|---------|-------|---------|
| `runtime-puppet/Cargo.toml` | 0,1 | 移除 inox2d，添加 live2d-parser |
| `runtime-puppet/src/lib.rs` | 0,1 | 更新注释 + 注册 moc3 模块 |
| `runtime-puppet/src/components.rs` | 1,2 | 新增 MultiKeyDeformation, WarpDeformer 等 |
| `runtime-puppet/src/systems.rs` | 2,3 | 新增变形/表情/物理系统调用 |
| `runtime-puppet/src/world.rs` | 1,3 | 格式分发 + 新 trait 方法 |
| `engine-kernel/services/puppet.rs` | 1,3 | trait + impl 扩展 |
| `host-api/controllers/puppets.rs` | 1,3 | 新增 API action |
| `extension/editor/puppetEditorProvider.ts` | 4 | .moc3 文件处理 |
| `webview/animation/inochi2d-controller.ts` | 4 | loadMoc3Bundle() |
| `neko-live/tracking/puppetMapping.ts` | 5 | 补充参数映射 |
| `extension/agentCapabilityProvider.ts` | 6 | 新增 AI 工具 |

---

## 8. 参考资料

- [许可证分析文档](../analysis/live2d-license-analysis-2026-04-13.md)
- [OpenL2D MOC3 Spec](https://rentry.co/moc3spec)
- [CubismSpecs model3.json](https://github.com/Live2D/CubismSpecs/blob/master/FileFormats/model3.json.md)
- [live2d-parser crate](https://crates.io/crates/live2d-parser)
- [VTube Studio Plugin API](https://github.com/DenchiSoft/VTubeStudio)
- [Sega v. Accolade (clean-room 判例)](https://en.wikipedia.org/wiki/Sega_v._Accolade)
- [DMCA §1201(f) 互操作性豁免](https://leppardlaw.com/federal/computer-crimes/evaluating-the-role-of-reverse-engineering-in-dmca-compliance-under-us-federal-law/)
