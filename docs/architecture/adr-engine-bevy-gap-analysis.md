# ADR：neko-engine vs Bevy 差距分析与集成策略

- **状态**：提议中
- **日期**：2026-06-04
- **作者**：Claude（架构师）
- **范围**：neko-engine 全部 crate
- **前置条件**：[adr-engine-interface-pipeline-decoupling](./adr-engine-interface-pipeline-decoupling.md)、[adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md)、[adr-engine-effect-registry](./adr-engine-effect-registry.md)

---

## 1. 背景

neko-engine 当前采用 **bevy_ecs only + 全自研渲染/调度** 架构：使用 bevy_ecs 0.15 的 World/Component/Query，但不使用 Bevy 的 Schedule、Renderer、AssetServer、Window 等上层设施。需要评估是否应集成完整 Bevy，以及当前架构与 Bevy 能力之间的具体差距。

### 1.1 核心架构约束

| 约束 | 说明 |
|------|------|
| **Sidecar 进程** | engine 是 VSCode 扩展的后台进程，通过 N-API + HTTP/WebSocket 与 TS 层通信 |
| **Headless 渲染** | 输出为 render-to-texture → H.264 encode → fMP4 → WebSocket stream，无窗口 |
| **双 ECS World** | runtime-scene (3D) 与 runtime-puppet (2D) 各自独立的 bevy_ecs::World |
| **自有格式** | MOC3 (clean-room)、.nkc/.nkp/.nkm 等格式，Bevy AssetLoader 无法覆盖 |
| **媒体引擎** | FFmpeg 编解码、音频 DSP、ONNX ML 推理等 Bevy 不具备的领域能力 |
| **创作到互动闭环** | 引擎不仅输出媒体，还要让角色、剧情、资产直接进入可互动场景 |
| **多 Runtime 舞台编排** | runtime-stage 应编排 runtime-scene / runtime-puppet / Live2D / Spine / media / audio / device，而不是替代它们 |

### 1.2 现状总结

```
neko-engine (18 crates)
├── runtime-*   (4): scene(3D ECS) / puppet(2D ECS) / device / media / ml
├── engine-*    (6): types / gpu / scene-renderer / puppet-renderer / panoramic-renderer / kernel / codec / audio
└── host-*      (4): api / http / napi / cli
```

已有能力：基础 PBR forward rendering、GPU skinning、3 种 IK solver、动画 blend/crossfade、GPU 粒子系统、Bloom/ToneMapping/Vignette 后处理、render graph、render target pool、完整 CLI。

规划中的 `runtime-stage` 是互动场景编排层：它不负责替代 2D/3D 渲染，也不替代 Live Compositor，而是把 story / entity / canvas / agent / assets 的创作产物装配成可运行 actor、trigger、dialogue、behavior、session state，并把渲染输出交给 scene / puppet / adapter / compositor。

---

## 2. 决策：不集成完整 Bevy

### 2.1 判定理由

| 维度 | 分析 |
|------|------|
| **架构不匹配** | Bevy 是窗口应用引擎（App → Schedule → Render → Present to Window），neko-engine 是 headless sidecar（Request → Tick → Render-to-Texture → Encode → Stream）。Bevy 管线末端 (Present) 需要被 hack 掉，维护成本高于自研 |
| **产品目标不匹配** | Neko 的目标是创作工作台 + 可运行互动舞台 + 媒体/互动输出，多数输入、UI、资产权限、Agent 编排、导出都在 VSCode / Host / Runtime 合同上；完整 Bevy 会把这些边界拉回窗口应用模型 |
| **bevy_ecs 已获最大收益** | ECS 的 World/Component/Query 是 Bevy 核心价值，已在使用。Schedule 并行调度在 system 数 < 10 时收益趋近于零 |
| **渲染 crate 深度耦合** | bevy_pbr 依赖 22 个 Bevy crate（包括 bevy_render/bevy_app/bevy_window），无法独立提取 Shadow/SSAO/IBL |
| **自有格式不可妥协** | MOC3 clean-room、.nkc character authoring、puppet deformation 等领域特有能力，Bevy 的 Mesh/Material/AssetServer 帮不上忙 |
| **升级风险不对称** | bevy_ecs 单独升级影响面小（Component derive + Query 语法），完整 Bevy 每个大版本迁移是工程灾难级别 |

### 2.2 Bevy Streaming 插件评估

| 插件 | 做法 | 不适用原因 |
|------|------|-----------|
| [bevy_streaming](https://github.com/rlamarche/bevy_streaming) | headless capture → GStreamer → H264 → WebRTC | 依赖 GStreamer (~50MB)；WebRTC 对 localhost sidecar 过度设计；neko 已有 FFmpeg + WebSocket |
| [bevy_external_surface](https://libraries.io/cargo/bevy_external_surface) | Vulkan external memory 零拷贝 | 0.0.1-prealpha；仅 Vulkan（需 Metal/D3D12）；neko 已有 render-to-texture |
| [Bevy headless example](https://github.com/bevyengine/bevy/blob/main/examples/app/headless_renderer.rs) | 禁 WinitPlugin + GPU→Buffer→Channel | 每帧 GPU→CPU 拷贝；neko 管线更高效 |

### 2.3 面向创作与互动引擎的补充决策

本 ADR 不只服务媒体渲染输出。Neko 的目标路径应是：

```text
Creative Authoring -> Playable Stage -> Render / Stream / Export / Interactive Package
```

Playable Stage 是可运行世界的语义层，不是 Canvas、Compositor 或 3D Scene 的别名：

| 层 | 职责 | 不应承担 |
|---|---|---|
| Canvas | 创意规划、分镜、资产排布、创作上下文 | 实时 actor tick、trigger、session save |
| runtime-scene | 3D 场景图、相机、灯光、模型、3D picking/gizmo | 剧情状态机、跨角色对话、2D/Live2D 专属驱动 |
| runtime-puppet | Neko 原生 2D Bone2D + BlendShape 角色运行时 | Cubism SDK 绑定、3D 场景语义、剧情编排 |
| Live2D / Spine Adapter | 第三方格式高保真播放或导入桥接 | 成为 Neko 原生角色 SSOT |
| Live Compositor / Export | 合成、流式传输、录制、离线导出 | 决定互动语义与剧情状态 |
| runtime-stage | actor / trigger / input / behavior / dialogue / session 编排 | 直接实现所有渲染器或吞并各 runtime |

因此，Bevy 值得吸收的是**引擎能力模式**：事件、状态机、输入映射、资源热更新、场景模板、picking、gizmo、动画图、诊断，而不是完整 App/Renderer/Window 运行时。

---

## 3. Bevy Crate 三分法

### 3.1 不需要（17 crates，30%）

架构不匹配或已有更好实现。

| Bevy Crate | 原因 |
|---|---|
| `bevy_winit` / `bevy_window` | sidecar 无窗口 |
| `bevy_app` | Bevy App 生命周期与 axum 服务器模式不兼容 |
| `bevy_input` / `bevy_input_focus` / `bevy_gilrs` | 不直接依赖；输入采集在 TS/React、VSCode、device runtime，runtime-stage 只需要参考 action mapping 设计 |
| `bevy_ui` / `bevy_ui_render` / `bevy_ui_widgets` / `bevy_feathers` | UI 在 React + Tailwind 层 |
| `bevy_text` | 已有 `runtime-scene/src/text_mesh.rs` |
| `bevy_a11y` / `bevy_clipboard` | VSCode 原生提供 |
| `bevy_remote` | 已有 axum HTTP + WebSocket |
| `bevy_sprite` / `bevy_sprite_render` | 2D 由 puppet renderer 覆盖（Bone2D + BlendShape / MOC3 导入兼容，非矩形 sprite 模型） |
| `bevy_audio` | engine-audio (FFmpeg + DSP chain + 混音 + 响度分析) 能力更强 |
| `bevy_android` / `bevy_dylib` / `bevy_platform` | 平台抽象已由 wgpu + N-API + axum 覆盖 |
| `bevy_internal` | 元包 |
| `bevy_camera_controller` | 相机控制在 TS 层 ViewStateController |
| `bevy_settings` | 配置在 TS 层 `neko/settings.json` |
| `bevy_solari` | 光追实验性，sidecar 实时流帧预算不支持 |

### 3.2 可集成（22 crates 的能力，39%）

分为三个层次：直接依赖、Shader/算法移植、设计参考。

#### 3.2.1 可作为 Cargo 依赖直接使用

| Bevy Crate | 依赖深度 | 集成方式 | 收益 |
|---|---|---|---|
| **`bevy_ecs`** | ✅ 已集成 | 已在用 World/Component/Query | 核心 ECS |
| **`bevy_color`** | bevy_math only | `cargo add bevy_color` | 10 种色彩空间 (Srgba/LinearRgba/Hsla/Oklaba/Oklcha 等) + 感知均匀混合 + 色差计算 |
| **`bevy_tasks`** | bevy_platform only | `cargo add bevy_tasks` | ComputeTaskPool + IoTaskPool + ParallelIterator + work-stealing，解决无并行计算问题 |
| **`bevy_math`** | glam only | 替换直接 glam 依赖 | 样条曲线 (CubicBezier/BSpline/Nurbs)、Curve sampling、Rot2、几何原语 (Ray3d/Aabb3d)。neko 已用 glam 0.29，bevy_math 用 glam 0.32，需评估升级 |

#### 3.2.2 Shader / 算法可直接移植（MIT 开源）

Bevy 渲染 crate 无法独立引用，但其 WGSL shader 和纯算法代码可以拷贝并适配到 neko 的 wgpu 管线。

| 能力 | Bevy 来源文件 | 代码量 | 移植到 neko | 估算工期 |
|---|---|---|---|---|
| **Shadow mapping** (cascaded + PCF) | `bevy_pbr/render/shadows.wgsl` + `shadow_sampling.wgsl` | 890 行 WGSL | engine-scene-renderer (新 shadow pass + depth atlas) | ~2.5 周 |
| **SSAO** | `bevy_pbr/ssao/ssao.wgsl` | 217 行 WGSL | engine-scene-renderer post_process (需 depth prepass) | ~1.5 周 |
| **IBL environment map** | `bevy_pbr/light_probe/environment_map.wgsl` | 420 行 WGSL | engine-scene-renderer environment.rs (需 cubemap prefilter + DFG LUT) | ~1.5 周 |
| **Morph target GPU deform** | `bevy_pbr/render/morph.wgsl` | 120 行 WGSL | pbr_forward_skinned.wgsl (补全顶点数据加载 + 变形) | ~0.5 周 |
| **TAA** | `bevy_anti_alias/taa/taa.wgsl` | 201 行 WGSL | post_process.rs (需 velocity buffer + history texture) | ~1 周 |
| **DOF** (景深) | `bevy_post_process/dof/dof.wgsl` | 241 行 WGSL | post_process.rs | ~1 周 |
| **Motion blur** | `bevy_post_process/motion_blur/motion_blur.wgsl` | 149 行 WGSL | post_process.rs (需 velocity buffer) | ~0.5 周 |
| **Ray-mesh intersection** | `bevy_picking/mesh_picking/ray_cast/intersections.rs` | 532 行 Rust | runtime-scene 新 `picking.rs` 模块（纯数学，零 Bevy 依赖） | ~1 周 |
| **Gizmo 线渲染** | `bevy_gizmos_render/lines.wgsl` | 190 行 WGSL | engine-scene-renderer 新 `gizmo_pipeline.rs` | ~1.5 周 |
| **GPU mipmap generation** | `bevy_core_pipeline` mip generation compute | ~100 行 compute | engine-gpu (替换 `mip_level_count: 1`) | ~0.5 周 |
| **Bloom (改进)** | `bevy_post_process/bloom/` | ~300 行 | 升级现有 bloom 实现 | ~0.5 周 |

**总计可移植：~3,360 行 shader/算法，预计 ~12 周工作量。**

#### 3.2.3 设计可参考（架构模式，非代码拷贝）

| Bevy 模块 | 参考内容 | 应用到 neko |
|---|---|---|
| **`bevy_animation` AnimationGraph** | 节点图 + blend tree + additive blend + animation events + UUID target | 替换当前线性 blend/crossfade，实现动画状态机 |
| **`bevy_asset` AssetServer** | Handle\<T\> 引用计数 + 异步加载 + 热重载 (file_watcher) + 依赖追踪 | 改进 AssetCache，加入文件监视与缓存失效 |
| **`bevy_transform` 增量传播** | Changed\<T\> dirty flag + 静态优化 flag (StaticTransformOptimizations) | 优化全树每帧传播为仅 dirty 子树 |
| **`bevy_material` Material trait** | 可扩展材质系统 + per-material shader specialization + prepass support | 从硬编码 PBR 走向自定义 shader 材质 |
| **`bevy_shader` import 系统** | Shader 资产 + `#import` 语法 + 模块化组合 + ShaderCache | 改进内嵌 WGSL 管理，支持 shader 复用 |
| **`bevy_scene` BSN** | Scene template + per-field override + asset inheritance | 改进 project save/load，支持 scene composition |
| **`bevy_state` 状态机模式** | State / SubState / Transition 的显式阶段切换 | runtime-stage mode、actor behavior、dialogue branch、interaction phase |
| **`bevy_ecs` Events / observer 模式** | typed event bus、reader/writer、一次性事件消费 | StageEvent / TriggerEvent / DialogueEvent / InputEvent 的内部总线 |
| **`bevy_input` action mapping 设计** | device 输入归一为动作、轴、按钮状态 | VSCode/Webview/device/gamepad → StageInputAction 映射；不直接依赖 crate |
| **`bevy_reflect` 类型注册模式** | component type registry、动态字段 introspection | StageComponent schema registry；用于编辑器面板和 Agent 可解释修改 |
| **`bevy_render` SubApp 双 World** | Extract → Prepare → Queue → PhaseSort → Render → Cleanup | 参考 render 阶段划分（sidecar 不需要双 App） |
| **`bevy_light` clustering** | GPU 光照聚类 (tile/cluster) + decal support | 大量灯光场景优化 |
| **`bevy_diagnostic` Diagnostic store** | 结构化性能指标 + 可配置历史长度 | 补充 tracing 之外的结构化运行时诊断 |
| **`bevy_world_serialization` DynamicWorld** | 按需序列化 + WorldAsset + 过滤器 | 完善 World 持久化能力 |

### 3.3 需自研（16 项领域能力，约 28%）

Bevy 方案不适用，需在现有架构上继续完善。

| 能力 | 为什么不能用 Bevy 的 | neko 现有实现 |
|---|---|---|
| **Puppet 2D 变形渲染** | Bevy sprite 是矩形贴图；Neko 2D 是 Bone2D + BlendShape / 网格变形角色 | engine-puppet-renderer（sprite_batch + atlas_cache） |
| **H.264/H.265 流式编码** | Bevy 没有视频编码管线 | engine-codec + FFmpeg |
| **WebSocket fMP4 传输** | Bevy Remote 是 ECS 数据同步，不是视频流 | host-http (axum) |
| **Timeline 合成器** | Bevy 是实时游戏循环，不是 NLE 时间线 | engine-kernel domain/timeline |
| **Panoramic 360 渲染** | Bevy 无 equirectangular/cylindrical 投影 | engine-panoramic-renderer |
| **MOC3 导入转换** | Bevy 无 Live2D/Cubism 兼容层；Cubism Core 也不能作为开源内核直接内置 | runtime-puppet/moc3/ clean-room import converter + optional adapter |
| **ML 推理集成 (ONNX)** | Bevy 无 ML 管线 | runtime-ml (ONNX Runtime) |
| **视频 probe / diff / 字幕** | Bevy 无媒体域逻辑 | runtime-media |
| **音频 DSP chain** | Bevy audio 仅播放；neko 需编解码/混音/EQ/降噪/响度分析 | engine-audio (FFmpeg + biquad/EQ/gate/limiter) |
| **多 World 协调（3D + 2D）** | Bevy SubApp 假设 Main + Render 分离，不是 3D + 2D 共存 | engine-kernel 层设计（待完善） |
| **Export pipeline (glTF/VRM)** | Bevy scene 序列化面向 BSN，不是 glTF 导出 | runtime-scene/exporter.rs（需补全骨骼/morph） |
| **设备 I/O (camera/mic/MIDI/gamepad)** | Bevy gilrs 仅 gamepad | runtime-device (cpal/nokhwa/midir/gilrs) |
| **Playable Stage / runtime-stage** | Bevy App 假设单一窗口主循环；Neko 需要 story/entity/canvas/agent 绑定 + 多 runtime actor 编排 | 待新增 StageDocument / StageRuntime / StageSession |
| **Story / Entity / Agent 绑定** | Bevy scene 不理解角色记忆、剧情事实、Agent intent、资产语义 | neko-story / neko-agent / entity binding 需投影到 stage actor |
| **Interactive session save / replay** | Bevy save state 不是创作审阅、分支剧情、可导出 replay 的合同 | 待新增 StageSession / StageReplay / deterministic command log |
| **Live2D / Spine adapter 边界** | 第三方 SDK 有独立许可证、渲染模型和导出约束，不适合塞进 runtime-puppet core | optional runtime adapter，输入输出通过 StageActor / GpuLayer / command bridge 对齐 |

---

## 4. 当前能力差距审计

### 4.1 渲染管线差距（对标 Bevy）

| 能力 | Bevy 状态 | neko 状态 | 差距等级 |
|---|---|---|---|
| Core PBR (metallic-roughness) | ✅ StandardMaterial | ✅ pbr_forward.wgsl (GGX/Schlick/normal mapping) | 无差距 |
| **Shadow mapping** | ✅ Cascaded + cubemap + PCF/Gaussian/Temporal | ❌ `shadow: None` 硬编码 | **P0 阻塞** |
| **IBL (specular cubemap)** | ✅ Environment map + DFG LUT + irradiance volume | ⚠️ 仅背景渲染，无 specular IBL | **P1** |
| **SSAO** | ✅ GTAO 实现 | ❌ flag 存在 (`ssao: bool`) 但 shader 未实现 | P2 |
| **SSR** | ✅ Screen-space reflections | ❌ 不存在 | P3 |
| Bloom | ✅ 双向高斯 + 阈值 | ✅ threshold + blur + composite | 无差距 |
| Tone mapping | ✅ ACES/Reinhard/AgX | ✅ ACES/Reinhard/Uncharted2 | 基本持平 |
| **TAA** | ✅ Temporal AA + velocity buffer | ❌ 仅单帧 FXAA | P2 |
| SMAA | ✅ 子像素形态学 AA | ❌ | P3 |
| **DOF** | ✅ 景深 (bokeh) | ❌ | P3 |
| **Motion blur** | ✅ 运动模糊 | ❌ | P3 |
| Auto-exposure | ✅ 自适应曝光 | ❌ | P3 |
| Volumetric fog | ✅ 体积雾 | ❌ | P3 |
| Parallax mapping | ✅ 视差贴图 | ❌ | P3 |
| Lightmaps | ✅ 烘焙光照贴图 | ❌ | P3 |
| Contact shadows | ✅ 接触阴影 | ❌ | P3 |
| OIT (顺序无关透明) | ✅ Order-independent transparency | ❌ | P3 |
| Deferred rendering | ✅ 延迟渲染路径 | ❌ 仅 forward | P3 |
| GPU light clustering | ✅ Tile/cluster 光照 | ❌ 线性遍历 MAX_LIGHTS=16 | P2（灯光多时） |
| **GPU mipmap generation** | ✅ Compute shader | ❌ 全部 `mip_level_count: 1` | **P1** |
| Particles | ✅ (via hanabi 插件) | ✅ GPU compute 粒子 (4096/emitter, 5 preset) | 无差距 |

### 4.2 资产管线差距

| 能力 | Bevy 状态 | neko 状态 | 差距等级 |
|---|---|---|---|
| **Asset hot reload** | ✅ file_watcher + Handle\<T\> | ❌ 无文件监视，修改需重启 | P2 |
| 异步加载 | ✅ AsyncComputeTaskPool | ❌ 同步加载阻塞 | P2 |
| 依赖追踪 | ✅ Asset dependency graph | ❌ 无 | P3 |
| **glTF extensions** | ✅ clearcoat/transmission/volume/unlit/anisotropy/specular/ior | ❌ 仅基础 PBR + KHR_lights_punctual | P2 |
| Draco 压缩 | ✅ KHR_draco_mesh_compression | ❌ | P3 |
| Texture transform | ✅ KHR_texture_transform | ❌ | P2 |
| **Texture formats** | ✅ KTX2 + Basis Universal + DDS + EXR + HDR | ⚠️ PNG/JPEG/WebP only | P2 |
| **Morph target 顶点数据** | ✅ 加载 + GPU 变形 | ❌ 权重动画有，顶点数据未加载 | **P1** |
| Custom material / shader | ✅ Material trait 可扩展 | ❌ 硬编码 PBR only | P2 |
| Shader import 系统 | ✅ `#import` + 模块化 + ShaderCache | ❌ 内嵌 WGSL 无复用 | P2 |

### 4.3 ECS 与调度差距

| 能力 | Bevy 状态 | neko 状态 | 差距等级 |
|---|---|---|---|
| Schedule 并行调度 | ✅ 自动依赖分析 + 并行 | ❌ 全部手动顺序调用 | P3（system 少时不阻塞） |
| **Change Detection** | ✅ Changed\<T\> / Added\<T\> | ❌ 无；revision counter 仅 SceneRevision | P2 |
| Events | ✅ EventReader\<T\> / EventWriter\<T\> | ❌ 无 ECS 级事件系统 | P2 |
| Query 缓存 | ✅ archetype-aware 缓存 | ❌ 每帧重建 query | P3 |
| **Task 并行计算** | ✅ ComputeTaskPool + ParallelIterator | ❌ tokio 仅用于异步 I/O，无 CPU 并行 | **P1** |
| **Transform 增量传播** | ✅ 仅 dirty 子树 + 静态优化 | ❌ 全树每帧传播 | P2 |
| World 序列化 | ✅ DynamicWorld + WorldAsset | ⚠️ serialize_entities 有限 | P3 |

### 4.4 交互与调试差距

| 能力 | Bevy 状态 | neko 状态 | 差距等级 |
|---|---|---|---|
| **Viewport picking** | ✅ Ray cast + Click/Drag/Over/Out + 事件冒泡 + 多摄像机 | ❌ 仅 CSG ray intersection | **P0** |
| **Gizmo** | ✅ 即时模式线/弧/圆/frustum + transform handle | ❌ 仅 viewport grid | **P0** |
| Skeleton visualization | ✅ 可绘制骨骼 | ⚠️ flag 存在 (`show_skeleton`) 但未实现 | P2 |
| Debug overlay | ✅ FPS/frame graph/entity count | ⚠️ metric HTTP 端点有，无渲染 overlay | P3 |
| Render modes | ✅ wireframe/normal/depth | ⚠️ ViewportRenderMode 枚举定义了 8 种但部分 shader 未实现 | P2 |
| 色彩空间 | ✅ 10 种 (含 Oklab/Oklch 感知均匀) | ⚠️ 仅 SRGB/Linear | P2 |

### 4.5 动画系统差距

| 能力 | Bevy 状态 | neko 状态 | 差距等级 |
|---|---|---|---|
| **Animation Graph / 状态机** | ✅ AnimationGraph 节点图 + blend tree + events | ❌ 仅线性 blend + crossfade | **P1** |
| Additive blending | ✅ 加法混合 | ⚠️ 权重混合有，无加法模式 | P2 |
| Animation events | ✅ 关键帧触发事件 | ❌ | P2 |
| Motion matching | ❌ (Bevy 也无) | ❌ | — |

### 4.6 创作与互动场景差距

这部分面向 `runtime-stage`，用于支持“创作角色、剧情、资产后直接进入场景互动”。它与 3D 编辑器 P0 能力并列，但不应抢占 3D renderer 的职责。

| 能力 | 当前状态 | 目标合同 | 差距等级 |
|---|---|---|---|
| **StageDocument** | 规划中，散落于 story/canvas/entity/roadmap | 声明 stage actors、scene refs、bindings、triggers、initial state | **P0** |
| **StageRuntime** | 规划中 | `load()` / `tick()` / `dispatchInput()` / `emitEvent()` / `snapshot()` | **P0** |
| **StageActor model** | scene entity / puppet entity 各自存在 | actor 统一引用 3D model、2D puppet、Live2D、Spine、video segment、audio source | **P0** |
| **Story / Entity binding** | story/entity/agent 有资产语义，但未投影到运行时 | character、dialogue、memory、relationship、objective → actor/dialogue/behavior | P1 |
| **Event / Trigger bus** | ECS 级事件缺失；Viewport control 有局部命令 | StageEvent / TriggerEvent / DialogueEvent / AnimationEvent typed bus | P1 |
| **Input action mapping** | Webview/Device 可采集输入，但无 stage action 合同 | keyboard/gamepad/pointer/device → StageInputAction / axis / button | P1 |
| **Script / State machine** | roadmap 有 ScriptEngine，尚无实现 | bounded script + state machine + branch condition，不引入任意脚本黑箱 | P1 |
| **Play-in-editor preview** | engine viewport / canvas preview 分散 | Stage preview session，可热重载绑定、记录 command log | P1 |
| **Session save / replay** | timeline/export 有状态，interactive session 缺失 | StageSession + deterministic command log，用于恢复、审阅、导出视频 | P1/P2 |
| **Physics / collision / raycast** | picking/gizmo 缺失；无通用 collider | 先 picking/raycast，后 lightweight collider / trigger volume | P2 |
| **Interactive package export** | HTML5/VN preview 有雏形，engine runtime package 缺失 | 根据目标输出选择 Web adapter、desktop runtime 或预渲染 fallback | P2/P3 |

---

## 5. 实施路线

### 5.1 总览

```
Bevy 57 crates
├── 不需要 (17 crates, 30%)
│   窗口/输入/UI/音频/平台/远程 → neko 架构已覆盖或不适用
│
├── 可集成 (22 crates 的能力, 39%)
│   ├── 直接依赖 (3): bevy_color / bevy_tasks / bevy_math
│   ├── Shader 移植 (11 项): shadow/SSAO/IBL/morph/TAA/DOF/blur/ray/gizmo/mipmap/bloom
│   └── 设计参考 (15 项): AnimationGraph/AssetServer/State/Event/Input/Material/Scene/...
│
└── 需自研 (16 项领域能力, 约 28%)
    2D puppet / 流式编码 / 时间线 / 全景 / MOC3 导入 / ML / 媒体 / 设备 / Stage / 导出 / ...
    （大部分已有实现，需继续完善）
```

集成优先级服务两个目标：先补足 3D 编辑器最低门槛（shadow / picking / gizmo），同时建立 runtime-stage 的最小合同，使创作资产可以进入可互动预览，而不是只进入媒体导出。

### 5.2 分阶段实施

#### Phase 0：立即可做（~0.5 天）

| 动作 | 说明 |
|------|------|
| `cargo add bevy_tasks` | 获得 ComputeTaskPool + ParallelIterator，解决无 CPU 并行问题 |
| `cargo add bevy_color` | 获得 10 种色彩空间 + Oklab 感知混合 |
| 评估 `bevy_math` | glam 0.29 → 0.32 升级影响，获得 Curve/Ray3d/Aabb3d |

#### Phase 1：P0 差距补全——3D 编辑器最低门槛（~5 周）

| 任务 | 来源 | 工期 |
|------|------|------|
| **Shadow mapping** (cascaded + PCF) | 移植 `bevy_pbr/render/shadows.wgsl` (890 行) | 2.5 周 |
| **Viewport picking** (ray-mesh intersection) | 移植 `bevy_picking/ray_cast/intersections.rs` (532 行) | 1 周 |
| **Gizmo 渲染** (线/handle) | 移植 `bevy_gizmos_render/lines.wgsl` (190 行) + 交互逻辑 | 1.5 周 |

#### Phase 1B：P0 合同补全——Playable Stage 骨架（~2 周）

| 任务 | 来源 | 工期 |
|------|------|------|
| **StageDocument 合同** | 自研；参考 bevy_scene template / override 模式 | 0.5 周 |
| **StageActor / StageBinding** | 自研；绑定 story/entity/assets 到 scene/puppet/adapter actor | 0.5 周 |
| **StageRuntime 最小接口** | 自研；`load/tick/dispatchInput/emitEvent/snapshot` | 0.5 周 |
| **StageEvent / StageInputAction** | 参考 bevy_ecs event + bevy_input action mapping | 0.5 周 |

Phase 1B 只定义合同与空运行骨架，不引入完整脚本、物理或第三方 SDK。目标是让后续 story/entity/canvas/agent 能稳定投影到同一个互动运行时入口。

#### Phase 2：P1 差距补全——视觉质量 + 动画（~6.5 周）

| 任务 | 来源 | 工期 |
|------|------|------|
| **IBL** (specular cubemap + DFG LUT) | 移植 `bevy_pbr/light_probe/environment_map.wgsl` (420 行) | 1.5 周 |
| **Morph target GPU deform** | 移植 `bevy_pbr/render/morph.wgsl` (120 行) + 加载顶点数据 | 0.5 周 |
| **GPU mipmap generation** | 移植 compute shader ~100 行 | 0.5 周 |
| **Animation Graph** | 参考 bevy_animation 设计，自研状态机 | 3 周 |
| **Task 并行化** | bevy_tasks 集成后，并行化 render extraction + asset loading | 1 周 |

#### Phase 3：P2 差距补全——高级渲染 + 基础设施（~8 周）

| 任务 | 来源 | 工期 |
|------|------|------|
| **SSAO** | 移植 `bevy_pbr/ssao/ssao.wgsl` (217 行) + depth prepass | 1.5 周 |
| **TAA** | 移植 `bevy_anti_alias/taa/taa.wgsl` (201 行) + velocity buffer | 1 周 |
| **Change Detection + 增量传播** | 参考 bevy_transform Changed\<T\> 模式 | 1 周 |
| **Asset hot reload** | 参考 bevy_asset file_watcher 模式 | 2 周 |
| **glTF extensions** (clearcoat/unlit/texture_transform) | 参考 bevy_gltf 扩展处理 | 1.5 周 |
| **Custom Material trait** | 参考 bevy_material 可扩展设计 | 1 周 |

#### Phase 4：P3 差距补全——画质增强（按需）

| 任务 | 工期 |
|------|------|
| DOF 景深 | 1 周 |
| Motion blur | 0.5 周 |
| SMAA | 1 周 |
| SSR | 2 周 |
| Deferred rendering path | 3 周 |
| Volumetric fog | 2 周 |
| GPU light clustering | 1.5 周 |

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Shader 移植后与 Bevy 上游不同步 | 记录 Bevy commit hash；仅移植稳定算法（Shadow/SSAO/IBL 多年未大改） |
| bevy_tasks 引入 Bevy 版本锁定 | bevy_tasks 依赖极浅 (仅 bevy_platform)，可锁定版本独立升级 |
| glam 版本冲突 (neko 0.29 vs bevy 0.32) | bevy_color/bevy_tasks 不直接依赖 glam；bevy_math 集成需先升级 glam |
| Shadow mapping 性能影响流式帧率 | 与 [adr-engine-gpu-budget](./adr-engine-gpu-budget.md) 联动，interactive 优先级下可降级 shadow 分辨率 |
| Morph target 加载改动涉及 loader.rs 核心路径 | 增量添加，不改现有 skinning 路径；新增 `morph_targets` 组件 |
| runtime-stage 过早膨胀成第二套游戏引擎 | 先固定 Stage 合同与 actor/event/session 边界；物理、网络、复杂脚本延后到 runtime-game |
| Live2D/Spine SDK 许可证污染开源内核 | 第三方 runtime 只能作为 optional adapter；核心只保留导入转换、schema 和 command/GpuLayer 边界 |

---

## 7. 与其他 ADR 关系

| 关联 ADR | 关系 |
|---|---|
| [adr-engine-pipeline-sink](./adr-engine-pipeline-sink.md) | Shadow/SSAO 新增渲染 pass 需要 PipelineSink 标准化输出 |
| [adr-engine-effect-registry](./adr-engine-effect-registry.md) | Post-process 效果 (TAA/DOF/MotionBlur) 应注册为 GpuEffect |
| [adr-engine-gpu-budget](./adr-engine-gpu-budget.md) | Shadow/SSAO 的帧时间消耗需纳入 GPU 预算控制 |
| [adr-engine-dual-api-scene-split](./adr-engine-dual-api-scene-split.md) | Picking/Gizmo 交互需要 CreativeAccess API |
| [adr-2d3d-unified-engine](./adr-2d3d-unified-engine.md) | bevy_tasks 并行化可同时惠及 3D/2D World tick |
| [adr-model-lookdev-scene-editing](./adr-model-lookdev-scene-editing.md) | Shadow + IBL + Gizmo 是 LookDev 场景编辑的前置依赖 |
| [adr-3d-editor-rendering-architecture](./adr-3d-editor-rendering-architecture.md) | 本 ADR 的 P0 (shadow/picking/gizmo) 是该 ADR P1 修复项的上游 |
| [neko-suite-architecture-overview](./neko-suite-architecture-overview.md) | runtime-stage 已列为互动输出层，本 ADR 补充 Bevy 能力取舍 |
| [product-evolution-roadmap](./product-evolution-roadmap.md) | Stage 3 runtime-stage / Interactive Cinema 的工程化依赖在本 ADR 中落到 gap 表 |
| [agent-unified-workflow](./agent-unified-workflow.md) | story/entity/agent 创作产物进入 StageActor / StageBinding 的上游工作流 |
| [adr-canvas-render-refresh-tiering](./adr-canvas-render-refresh-tiering.md) | Canvas 是创作与预览状态层，runtime-stage 是可运行互动语义层，二者不互相替代 |
| [adr-2d-bone-blendshape-animation](./adr-2d-bone-blendshape-animation.md) | Live2D/MOC3 作为导入转换源，Neko 原生 2D 运行时仍是 Bone2D + BlendShape |

---

## 附录 A：Bevy Crate 依赖深度表

依赖越浅，独立集成越可行。

| Crate | Bevy 内部依赖数 | 可独立使用 |
|---|---|---|
| `bevy_tasks` | 1 (bevy_platform) | ✅ |
| `bevy_color` | 2 (bevy_math, bevy_reflect) | ✅ |
| `bevy_math` | 1 (bevy_reflect) + glam | ✅ |
| `bevy_state` | 4 | ⚠️ 需适配 bevy_app |
| `bevy_diagnostic` | 4 | ⚠️ |
| `bevy_shader` | 3 | ⚠️ 需 bevy_asset |
| `bevy_scene` | 7 | ❌ |
| `bevy_animation` | 13 | ❌ |
| `bevy_gizmos` | 14 | ❌ |
| `bevy_picking` | 12 | ❌ |
| `bevy_pbr` | 22 | ❌ |
| `bevy_render` | 24 | ❌ |
| `bevy_solari` | 18 | ❌ |

## 附录 B：Shader 移植清单

所有 shader 来源于 Bevy（MIT OR Apache-2.0 协议），移植时需保留许可声明。

```
bevy_pbr/render/shadows.wgsl           → engine-scene-renderer/shaders/shadows.wgsl
bevy_pbr/render/shadow_sampling.wgsl   → engine-scene-renderer/shaders/shadow_sampling.wgsl
bevy_pbr/ssao/ssao.wgsl                → engine-scene-renderer/shaders/ssao.wgsl
bevy_pbr/light_probe/environment_map.wgsl → engine-scene-renderer/shaders/environment_map.wgsl
bevy_pbr/render/morph.wgsl             → engine-scene-renderer/shaders/morph.wgsl
bevy_anti_alias/taa/taa.wgsl           → engine-scene-renderer/shaders/taa.wgsl
bevy_post_process/dof/dof.wgsl         → engine-scene-renderer/shaders/dof.wgsl
bevy_post_process/motion_blur/motion_blur.wgsl → engine-scene-renderer/shaders/motion_blur.wgsl
bevy_post_process/bloom/               → 升级现有 engine-scene-renderer bloom
bevy_gizmos_render/lines.wgsl          → engine-scene-renderer/shaders/gizmo_lines.wgsl
bevy_picking/mesh_picking/ray_cast/intersections.rs → runtime-scene/src/picking.rs
```
