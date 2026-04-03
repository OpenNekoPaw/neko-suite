# 2D/3D 角色编辑能力综合分析

> 日期：2026-04-03
> 状态：**P1 TS 侧完成** ✅（Phase 1-7 全部完成，37 文件修改 + 13 新建，1835 行新增）| Phase 2 Rust 引擎待实施
> 范围：neko-puppet / neko-model / neko-sketch / neko-engine
> 关联：[2d-capability-analysis.md](./2d-capability-analysis.md) | [3d-capability-analysis.md](./3d-capability-analysis.md) | [制作指南](../guides/inochi2d-face-parameter-guide.md)

---

## 目录

1. [分析背景](#1-分析背景)
2. [捏脸能力评估](#2-捏脸能力评估)
3. [动作调整能力评估](#3-动作调整能力评估)
4. [绘制能力评估](#4-绘制能力评估)
5. [建模能力评估](#5-建模能力评估)
6. [综合判断](#6-综合判断)
7. [剩余任务清单](#7-剩余任务清单)
8. [推荐工作流](#8-推荐工作流)

---

## 1. 分析背景

Neko Suite 同时支持 2D（neko-puppet / Inochi2D）和 3D（neko-model / VRM+glTF）角色系统。本文档评估两条管线在**捏脸、动作调整、绘制、建模**四个维度的现有能力与缺口，明确剩余任务和优先级。

### 1.1 现有系统概览

```
2D 角色管线                          3D 角色管线
─────────────                        ─────────────
neko-sketch   → 2D 绘制              neko-model    → 3D 视口编辑
neko-puppet   → 2D 骨骼动画          native-scene  → ECS 场景管理
native-puppet → Inochi2D 后端        @pixiv/three-vrm → VRM 表情
EngineClient  → HTTP/WS 通信         EngineClient  → HTTP/WS 通信

共享基础设施
─────────────
neko-engine   → Rust 媒体引擎（wgpu + FFmpeg + bevy_ecs）
neko-client   → EngineClient（HTTP dispatch）
neko-types    → 共享类型
neko-cut      → 时间线集成
```

---

## 2. 捏脸能力评估

### 2.1 3D 捏脸（neko-model）— ✅ 已完成

| 能力 | 状态 | 实现方式 |
|------|------|----------|
| 参数化面部编辑 | ✅ | 22 个参数 / 5 分类（脸型/眼/鼻/嘴/眉） |
| Morph Target 驱动 | ✅ | 50-100 blend shapes，实时 < 1ms |
| VRM 表情预设 | ✅ | 52 个标准预设（情绪+口型+视线） |
| 骨骼表情 | ✅ | 嘴型、眼球追踪、眉毛 |
| AI 捏脸 MCP Tools | ✅ | face.generate_params / face.from_image / face.adjust |
| 随机/重置 | ✅ | 前端 UI 按钮 |
| 面部直接拖拽 | ❌ Phase 4 | Raycasting → Blend Shape 映射 |

**技术路径**：用户操作滑块 → 更新 Blend Shape 权重 → R3F morphTargetInfluences 实时变形。

### 2.2 2D 捏脸（neko-puppet）— ⚠️ 受限

| 能力 | 状态 | 说明 |
|------|------|------|
| 参数滑块调节 | ✅ | ParameterPanel 读取 INP 预定义参数 |
| 参数 → vertex displacement | ✅ | ParameterBinding 组件驱动网格变形 |
| 自由塑形 | ❌ | Inochi2D 无 morph target，只能调预埋参数 |
| 参数模板标准化 | ❌ | 无标准面部参数模板 |
| AI 捏脸 | ❌ | 无 MCP Tool 对接 |

**核心限制**：2D 捏脸完全依赖 INP 模型预埋的 deform 参数。如果模型制作时只埋了 5 个参数，用户就只能调 5 个。要实现"真正的 2D 捏脸"，需要：

1. **定义标准面部参数模板**（≥30 个参数：脸型/眼/鼻/嘴/眉各 6+）
2. **Inochi2D Creator 制作规范**：模型制作时按模板预埋全部参数
3. **AI 参数映射**：文本/图片 → 标准参数值 → 设置到 puppet

### 2.3 对比总结

```
3D 捏脸（已完成 ✅）               2D 捏脸（受限 ⚠️）
├─ 22 参数 / 5 分类                ├─ 参数数量取决于模型
├─ Morph Target 自由塑形           ├─ 仅 vertex displacement
├─ AI MCP Tools 完整               ├─ 无 AI 对接
├─ VRM 52 表情预设                 ├─ 无标准预设
└─ 实时 < 1ms                      └─ 实时 60fps（WS stream）
```

---

## 3. 动作调整能力评估

### 3.1 动画播放 — ✅ 两者完整

| 能力 | 3D（neko-model） | 2D（neko-puppet） |
|------|------------------|-------------------|
| 动画列表 | ✅ getAnimationClips() | ✅ anim/list API |
| 播放/暂停/停止 | ✅ AnimationMixer | ✅ play/stop/seek |
| Seek 定位 | ✅ setAnimationTime() | ✅ anim/seek |
| 循环播放 | ✅ | ✅ loop 参数 |
| 实时流预览 | ✅ H.264 ~10-18ms | ✅ WS 60fps PuppetDelta |

### 3.2 动画编辑 — ❌ 两者缺失

| 能力 | 3D | 2D | 说明 |
|------|----|----|------|
| 关键帧编辑 | ❌ | ❌ | 无法添加/删除/移动关键帧 |
| 曲线编辑器 | ❌ | ❌ | 无缓动曲线调整 UI |
| 动画混合/过渡 | ❌ | ❌ | 无 crossfade/blend tree |
| IK 交互编辑 | ❌ | N/A | 无逆运动学拖拽 |
| 动画录制 | ❌ | ❌ | 无法从手动操作录制关键帧 |
| AI 动画生成 | Phase 4 | ❌ | 文本 → 关键帧序列 |

**核心缺口**：目前是"动画播放器"而非"动画编辑器"。关键帧编辑是最高优先级缺失能力。

### 3.3 物理模拟

| 能力 | 3D | 2D | 说明 |
|------|----|----|------|
| 物理 tick | ❌ 未实现 | ✅ physics_tick 系统 | 2D 头发/衣物摇曳 |
| rapier3d 刚体 | Phase 4 | N/A | 碰撞/布料 |

### 3.4 面部追踪驱动

| 能力 | 3D | 2D | 说明 |
|------|----|----|------|
| 骨骼映射 | ✅ Humanoid 标准 | ✅ parameter mapping | 两者兼容 |
| Morph 同步 | ✅ setMorphWeight() | ✅ setParameter() | 实时驱动 |
| WS 流 | — | ✅ /v1/puppets/stream 60fps | 专用低延迟通道 |
| neko-live 集成 | Phase 4 | Phase 4 | 面部追踪捕获源未实现 |

---

## 4. 绘制能力评估

### 4.1 独立 2D 绘制（neko-sketch）— ✅ 完整

| 能力 | 状态 | 说明 |
|------|------|------|
| 画笔系统 | ✅ | 7 种笔刷（pencil/pen/watercolor/airbrush/eraser/marker/pixel） |
| 压感支持 | ✅ | Pointer Events API，4 种压感曲线 |
| 图层系统 | ✅ | 12 种混合模式，分组/裁切蒙版 |
| 选区工具 | ✅ | 矩形/全选/反选，Uint8Array 位掩码 |
| 帧动画 | ✅ | Sprite sheet + 洋葱皮 |
| 滤镜 | ✅ | 6 种 GLSL 滤镜 |
| 矢量绘制 | ✅ | Bézier + SVG 导出 |

### 4.2 与角色系统的集成 — ❌ 未打通

| 缺失能力 | 说明 | 优先级 |
|----------|------|--------|
| 3D 纹理绘制 | 在 3D 模型 UV 上直接画 | P2 |
| Puppet 贴图绘制 | 为 Inochi2D 部件画贴图 | P2 |
| sketch → puppet 导出 | 图层 → INP 部件映射 | P3 |
| sketch → model 导出 | PNG → PBR 材质贴图 | P3 |
| AI 辅助绘制集成 | inpaint/auto_layer/style_transfer | P2（sketch.generate 已完成） |

**现状**：neko-sketch 作为独立画板完整可用，但与 puppet/model 之间**无直接桥接**。用户需在外部工具绘制贴图后再导入。

---

## 5. 建模能力评估

### 5.1 3D 建模（neko-model）— ⚠️ 轻量级

| 能力 | 状态 | 说明 |
|------|------|------|
| CSG 布尔运算 | ✅ | 并集/差集/交集 |
| 参数化几何体 | ✅ | 立方体/球体/圆柱/圆环 |
| 3D 文字挤出 | ✅ | cosmic-text 后端 |
| glTF/VRM 导入 | ✅ | 加载 + Transform 编辑 |
| 顶点级编辑 | ❌ | 无多边形/顶点操作 |
| 修改器堆栈 | ❌ → Blender | Bevel/Smooth/Mirror/Array |
| UV 展开 | ❌ → Blender | 自动 UV + 手动调整 |
| Sculpt 雕刻 | ❌ → Blender | 体素/多边形雕刻 |

**定位**：轻量级参数化创建 + 资产导入编辑，专业建模交给 Blender MCP 桥接。

### 5.2 2D Puppet 制作 — ❌ 完全缺失

| 缺失能力 | 说明 | 推荐方案 |
|----------|------|----------|
| 骨骼绑定 | 在 2D 立绘上定义骨骼层级 | Inochi2D Creator（外部） |
| Mesh 划分 | 将图层切分为变形网格 | Inochi2D Creator（外部） |
| Deform 区域 | 定义参数影响的顶点范围 | Inochi2D Creator（外部） |
| 图层 → 部件转换 | PSD 分层 → INP 部件自动映射 | MCP 桥接 Inochi2D Creator |

**结论**：2D Puppet 制作完全依赖外部工具。自建成本极高且与 Inochi2D Creator（免费）重复，推荐 MCP 桥接。

---

## 6. 综合判断

### 6.1 能力矩阵

```
          捏脸    动作播放  动作编辑       绘制    建模
3D        ✅       ✅        ⚠️ TS就绪    N/A     ⚠️ 轻量
2D        ⚠️ 模板  ✅        ⚠️ TS就绪    ✅ 独立  ❌ 外部

✅ = 已完成   ⚠️ = TS侧完成/Rust待实现   ❌ = 缺失
```

### 6.2 核心定位

**Neko Suite 是编辑/调整/预览/集成平台，而非从零制作工具。**

```
外部专业工具（制作）          Neko Suite（编辑 + 集成）
────────────────────          ──────────────────────────
Blender       → 3D 建模  ──→  neko-model  → 捏脸/表情/动作预览
Inochi2D Creator → 骨骼  ──→  neko-puppet → 参数调整/动画播放
Krita/PS      → 贴图绘制 ──→  neko-sketch → 轻量修改/帧动画
ComfyUI       → AI 生成  ──→  neko-canvas → 构图/分镜/组合
                                    │
                               neko-cut → 时间线合成 → 最终输出
```

### 6.3 已具备（无需额外开发）

1. **3D 捏脸** — Morph Target + VRM 表情，22 参数 5 分类，AI MCP Tools 完整
2. **2D/3D 动画播放** — 加载、播放、暂停、seek，两者完整
3. **2D 独立绘制** — neko-sketch 画板功能完善（7 笔刷 + 压感 + 图层 + 滤镜）
4. **实时面部追踪管线** — WebSocket 60fps（2D）+ Humanoid bone mapping（3D）
5. **轻量 3D 建模** — CSG + 参数化几何体 + 3D 文字
6. **AI 3D 捏脸** — face.generate_params / face.from_image / face.adjust

### 6.4 不建议自建（混合策略 MCP 桥接）

| 功能 | 原因 | 推荐方案 |
|------|------|----------|
| 3D 专业建模 | 与 Blender/ZBrush 差距巨大 | MCP 桥接 Blender（Phase 4 已规划） |
| 2D Puppet 制作 | Inochi2D Creator 免费且专业 | MCP 桥接 Inochi2D Creator |
| AI 3D 生成 | Text-to-3D / Image-to-3D | MCP 桥接 ComfyUI（Phase 4 已规划） |
| Sculpt 雕刻 | 体素/多边形雕刻引擎复杂度极高 | MCP 桥接 Blender Sculpt |
| 复杂 UV 展开 | 算法复杂，Blender 已成熟 | MCP 桥接 Blender |

---

## 7. 剩余任务清单

### 7.1 P0 — 阻塞性功能（当前迭代）

无。核心播放/预览能力已就绪。

### 7.2 P1 — 核心功能 ✅ TS 侧全部完成（2026-04-03）

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| P1-1 | **2D 标准面部参数模板** | ✅ 完成 | 32 参数 / 7 分类，`puppet-face-params.ts` + `FaceParameterSection.tsx` + [制作指南](../guides/inochi2d-face-parameter-guide.md) |
| P1-2 | **2D AI 捏脸 MCP Tools** | ✅ 完成 | `puppetFaceTools.ts`（PuppetGenerateParams / PuppetFromImage / PuppetAdjust）+ NekoPuppetAPI 接口 |
| P1-3 | **动画关键帧编辑器** | ✅ TS完成 | 共享 `KeyframeTimeline` + `KeyframeDiamond` 组件，puppet/model 适配器，EngineClient 21 个新方法。**Rust 引擎 action handlers 待实现** |
| P1-4 | **动画混合/过渡** | ✅ TS完成 | crossfade UI（AnimationPanel + AnimationPlayer）+ EngineClient crossfade/blend API。**Rust blend system 待实现** |
| P1-5 | **.nkm 3D 项目格式** | ✅ 完成 | `NkmProjectData` v2 类型 + `ModelDocument.ts` + ModelEditorProvider 升级 + `createDefaultNkmProject()` 工厂 |

**Rust 引擎待实现清单**（Phase 2）：
- `native-puppet/animation.rs` — Keyframe CRUD 方法（add/remove/update）+ AnimationBlendState + CrossfadeRequest
- `native-puppet/systems.rs` — `animation_blend_tick` 系统
- `native-scene/animation_blend.rs` — SceneAnimationBlend（新建）
- `native-api/controllers/puppets.rs` — 注册 actions: `keyframe_tracks`, `keyframe_add`, `keyframe_remove`, `keyframe_update`, `clip_create`, `anim_crossfade`, `blend_weight`, `blend_state`
- `native-api/controllers/scenes.rs` — 同上 scene 版本
- `native-scene/project.rs` — NkmProject v2 字段（face_params, custom_clips, camera）

### 7.3 P2 — 增强功能（中期迭代）

| # | 任务 | 包 | 工作量 | 依赖 |
|---|------|-----|--------|------|
| P2-1 | **3D 纹理绘制**：neko-sketch UV 绘制模式 + EngineClient UV 映射接口 | neko-sketch + neko-engine | L | UV 展开支持 |
| P2-2 | **Puppet 贴图绘制集成**：neko-sketch → 导出 PNG → INP 纹理替换 | neko-sketch + neko-puppet | M | INP 写入支持 |
| P2-3 | **AI 动画生成**：文本描述 → 关键帧序列（"角色开心地挥手" → 动画脚本） | neko-agent | M | P1-3 |
| P2-4 | **面部直接拖拽编辑**：Raycasting → Blend Shape 映射 | neko-model webview | M | 无 |
| P2-5 | **动画录制**：从手动参数操作录制关键帧 | neko-puppet + neko-model | M | P1-3/P1-4 |
| P2-6 | **AI 辅助绘制**：sketch.inpaint / sketch.auto_layer / sketch.style_transfer | neko-agent + neko-sketch | M | 外部 API |

### 7.4 P3 — 远期功能（MCP 桥接为主）

| # | 任务 | 包 | 工作量 | 依赖 |
|---|------|-----|--------|------|
| P3-1 | **Blender MCP Server**：复杂建模/修改器/UV/高级动画桥接 | neko-agent MCP | L | Blender MCP 生态 |
| P3-2 | **Inochi2D Creator MCP**：PSD → INP 自动转换桥接 | neko-agent MCP | M | Inochi2D Creator CLI |
| P3-3 | **ComfyUI MCP Server**：ControlNet + 高级 AI 图像 pipeline | neko-agent MCP | L | ComfyUI 运行环境 |
| P3-4 | **sketch → puppet 导出**：图层 → INP 部件自动映射 | neko-sketch + neko-puppet | L | INP 格式写入 |
| P3-5 | **sketch → model 导出**：PNG → PBR 材质贴图自动绑定 | neko-sketch + neko-model | M | 材质通道映射 |
| P3-6 | **3D IK 交互编辑**：逆运动学拖拽 + 约束系统 | neko-engine native-scene | L | 物理系统 |
| P3-7 | **rapier3d 物理模拟**：3D 碰撞/布料/刚体 | neko-engine | L | 无 |
| P3-8 | **neko-live 面部捕获**：摄像头 → 面部追踪 → 骨骼/参数映射 | neko-engine + neko-live | XL | 摄像头接入（nokhwa） |

### 7.5 工作量说明

| 标记 | 估算 |
|------|------|
| S | 1-2 天 |
| M | 3-5 天 |
| L | 1-2 周 |
| XL | 2-4 周 |

---

## 8. 推荐工作流

### 8.1 2D 角色创作（当前最佳路径）

```
Krita/PS 绘制分层立绘
    ↓ PSD 文件
Inochi2D Creator 骨骼绑定 + 参数预埋
    ↓ .inp 文件
neko-puppet 加载 → 参数调整 → 动画播放/预览
    ↓ WebSocket 流
neko-live 面部追踪驱动（Phase 4）
    ↓
neko-cut 时间线集成
```

### 8.2 3D 角色创作（当前最佳路径）

```
VRoid Studio / Blender 创建 VRM 模型
    ↓ .vrm / .glb 文件
neko-model 加载 → AI 捏脸 → 表情编辑 → 动画预览
    ↓ H.264 流 / R3F 实时
neko-live 面部追踪驱动（Phase 4）
    ↓
neko-cut 时间线集成（Scene3D 元素）
```

### 8.3 AI 辅助创作路径（最大差异化）

```
用户描述 "圆脸大眼的可爱角色"
    ↓ neko-agent
face.generate_params → Morph Target 权重
    ↓
neko-model 实时预览 → 用户微调 → "眼睛再大一点"
    ↓ face.adjust
Text-to-3D API → 完整角色生成（Phase 4）
    ↓
neko-cut 多角度渲染 → AI 视频生成
```

---

## 附录 A：各包角色编辑相关文件索引

| 包 | 关键文件 | 职责 |
|----|----------|------|
| neko-model | `webview/src/components/face/FaceEditorPanel.tsx` | 3D 捏脸 UI |
| neko-model | `webview/src/components/vrm/ExpressionPresetPanel.tsx` | VRM 表情预设 |
| neko-model | `webview/src/types/faceParameters.ts` | 面部参数类型 |
| neko-puppet | `webview/src/components/ParameterPanel.tsx` | 2D 参数滑块 |
| neko-puppet | `webview/src/components/AnimationPanel.tsx` | 动画播放控制 |
| neko-puppet | `webview/src/animation/inochi2d-controller.ts` | Inochi2D HTTP/WS 客户端 |
| neko-engine | `native-scene/src/components.rs` | 3D ECS 组件（MorphWeights 等） |
| neko-engine | `native-puppet/src/components.rs` | 2D ECS 组件（ParameterBinding 等） |
| neko-engine | `native-puppet/src/animation.rs` | 2D 动画引擎 |
| neko-engine | `native-scene/src/loader.rs` | glTF 加载器 |
| neko-engine | `native-puppet/src/loader.rs` | INP 加载器 |
| neko-client | `src/EngineClient.ts` | scenes/puppets HTTP 方法 |
| neko-types | `src/types/puppet.ts` | 共享 puppet 类型 |
| neko-sketch | `webview/src/brush/brush-engine.ts` | 画笔系统 |
| neko-sketch | `webview/src/engine/sketch-renderer.ts` | WebGL2 渲染 |
