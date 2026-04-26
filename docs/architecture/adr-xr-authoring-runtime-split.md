# ADR: XR Authoring/Runtime Plane Split — XR 场景的横切边界

## 状态

Proposed (2026-04-25)

## 关联 ADR

- 上层依赖:[adr-four-layer-contract.md](./adr-four-layer-contract.md), [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md)
- 横切配合:[adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md)

## 背景

neko-engine 准备扩展支持 XR 场景(VR / AR / MR)。表面看 XR 是"3D + 立体渲染",可以直接复用 `runtime-scene`。但深入分析后发现 XR 引入 **5 类架构级新约束**,直接复用会破坏现有四层架构的不变量(尤其 Inv-5 时间尺度分层):

| 维度 | 普通 3D | XR 增量 |
|------|---------|---------|
| 延迟预算 | 帧 16ms (60Hz) | **11ms (90Hz) / 8.3ms (120Hz)**,motion-to-photon 端到端 < 20ms |
| 渲染路径 | 单视图 PBR | 立体双目 + Foveated Rendering + ATW/ASW |
| 空间状态 | 编辑器/相机定义 | **世界自带**:SpatialAnchor / WorldMesh / Plane / LightEstimate |
| 输入模态 | 鼠标/键盘 (2D 投射) | 6DoF 控制器 + 手部 26 关节 + 眼动 + 语音 |
| 多用户 | 单机编辑 | 共享空间(Shared Anchor + 网络同步) |

**核心矛盾**:
- 四层架构允许 LLM 在 Intent 与 Orchestration 层秒级思考
- XR 的 frame loop 是 11ms 硬实时,不能等 LLM 任何形式的回复
- 如果不显式划分边界,LLM 必然在某个时刻被错误地拉进帧循环

## 决策

XR 沿用同一套四层架构,**但必须显式新增"Authoring Plane / Runtime Plane"横切边界**——AI 只活在 Authoring 一侧,Runtime 一侧由预编译的 BehaviorGraph + ECS Systems + 硬实时反馈策略接管。

> **不变量 X1(XR 强制):AI 决策 ≠ 渲染决策。AI 只能预先(Plan)或事后(Review)干预,绝不在 frame loop 内被调用。**

### Plane 边界

```
┌─ Authoring Plane ─────────┐         ┌─ Runtime Plane ────────────┐
│  Where AI lives           │         │  Where headset lives       │
│  ─────────────────────    │  bake   │  ─────────────────────     │
│  • L4 Intent              │ ──────► │  • Pre-baked behavior tree │
│  • L3 Orchestration       │         │  • State machines (BT/FSM) │
│  • LLM 推理 (秒级)        │         │  • <11ms 帧循环 (硬实时)   │
│  • VSCode + neko-agent    │  obs    │  • OpenXR / WebXR runtime  │
│                           │ ◄────── │  • 不允许 LLM 在循环中     │
└───────────────────────────┘         └────────────────────────────┘
```

## 设计要点

### 1. 各层在 XR 中的适配

#### L4 Intent — 完全不变

```
User NL: "在我面前桌面上放个虚拟猫,看到我就喵一声"

IntentDescriptor {
  goal: "桌面定位的反应式角色",
  domain: "xr-mr",            // ← 新 domain 标签
  constraints: {
    spatial: { anchor: "horizontal-plane", relativePose: "user-front" },
    reactive: { trigger: "user-gaze", action: "vocalize" },
    comfort:  { vection: "none", stationaryRequired: true }
  },
  expectedOutput: "scene + behavior-graph + anchor-recipe"
}
```

唯一变化:`constraints` 增加 `spatial` / `comfort` 子结构。这是数据扩展,不是架构变化。

#### L3 Orchestration — 新增 domain + BehaviorGraph 产物

```
DomainRouter
   ├─ '3d-scene'      → ISceneService
   ├─ '2d-puppet'     → IPuppetService
   ├─ '2d-sketch'     → ISketchService
   ├─ 'xr-scene'      → IXRSceneService    ← NEW (extends ISceneService)
   └─ 'xr-mr'         → IXRMixedService    ← NEW (anchor + occlusion)

新增 Tool 类目 (都属 ToolKind.operation):
  • PlaceAtAnchor       (绑定到 SpatialAnchor)
  • DefineReactivity    (产出 BehaviorGraph 节点)
  • SetComfortPolicy    (locomotion / FOV / vection)
  • DefineHandInteract  (手势 → 行为)
```

**关键产物:BehaviorGraph(.nkbg)**

```
LLM 输出 → BehaviorGraph (.nkbg)        ← 新 artifact 类型
            ├─ Triggers: gaze/proximity/voice/timer
            ├─ Conditions: spatial predicates
            └─ Actions: animation clip / audio / state transition
                ↓ Compile (设计时)
            FSM / BehaviorTree (静态产物)
                ↓ Deploy
            Runtime Plane 加载,无需 LLM 介入
```

类似 Unity Visual Scripting / Unreal Blueprint,但**由 LLM 生成图,而不是人手画图**。

#### L2 ECS Data — 新建 `runtime-xr` crate,extends `runtime-scene`

```
runtime-scene (3D 现状) ─┐
                         │ shared traits via engine-ecs-core
runtime-puppet (2D)    ──┤
                         │
runtime-xr (新增)      ──┘  ← 包含 runtime-scene 全部 + XR 特化
   │
   ├─ Components (XR 特有):
   │    • SpatialAnchor      { id, pose, persistence, tracking_quality }
   │    • HandJoints         { hand: Left|Right, joints: [Pose; 26] }
   │    • GazeRay            { origin, direction, confidence }
   │    • WorldMesh          { region_id, vertices, semantic_label }
   │    • PlaneGeometry      { extent, orientation, semantic: floor|wall|… }
   │    • XRReactivity       { trigger, condition, action_ref }   ← 行为图节点
   │
   ├─ Systems:
   │    • spatial_anchor_resolution (每帧把 anchor 投影到当前 world space)
   │    • behavior_graph_tick       (跑 FSM/BT,绝不调 LLM)
   │    • hand_gesture_recognizer   (hand → discrete events)
   │    • comfort_guard             (检测 vection/blackout,触发反馈)
   │
   └─ Resources:
        • XRSession (OpenXR session handle)
        • TrackingState (head/hands/world quality)
        • RenderBudget (剩余 ms,给 system 自调节)
```

`runtime-scene` 的 Skeleton + IkChain + AnimationTarget + GPU Skinning **原样复用**。XR 只是"3D + 空间感知 + 反应式行为"。

#### L1 Control — 必须扩展第 8、9、10 类信号

control-plane ADR 现有 7 类信号都是软实时(秒级)。XR 强制引入 3 类**硬实时**信号:

```
原 7 类 (沿用):
  validation-fail / tool-failure / budget-exceeded /
  self-eval / user-feedback / memory-conflict / llm-confidence

XR 新增 (硬实时,只能触发 L2/L3 决策,不能进 frame loop):
  ⊕ tracking-degraded   { component: head|hands|world, quality, duration_ms }
  ⊕ comfort-violation   { kind: vection|blackout|fov-clip, severity }
  ⊕ frame-budget-overrun { plane: render|physics|audio, overshoot_ms }
```

新信号触发的反馈决策(沿用 L0–L4 等级):

| 信号 | 典型决策 | 谁产生 | 谁消费 |
|------|----------|--------|--------|
| `tracking-degraded` | L1 retry-stage(重写 anchor 策略) | runtime-xr / OpenXR | FeedbackArbiter → 下一轮 LLM |
| `comfort-violation` | L2 regress-to('plan')(重新规划运动) | comfort_guard system | LLM 重生 BehaviorGraph |
| `frame-budget-overrun` | L1 retry-stage(降级:LOD/特效预算) | render budget tracker | LLM 调整 scene complexity |

**关键纪律**:这 3 类信号在 Runtime Plane 采集,**异步**送达 Authoring Plane;Runtime Plane 自己用 fallback policy 处理(降 LOD / 重置 anchor / fade-out),不等 AI 回复。

### 2. AI 在 XR 中的设计时职责

强约束:**AI 在 Authoring Plane 完成所有创作,Runtime Plane 不调用 LLM**。

| 阶段 | AI 职责 | 产物 |
|------|---------|------|
| Draft | 理解空间意图、舒适性约束、交互目标 | IntentDescriptor + creation-persona Draft.md |
| Plan | 选 Anchor 策略、设计 BehaviorGraph、估算渲染预算 | ExecutionPlan + .nkbg 草稿 |
| Apply | 调用 IXRSceneService 工具,生成场景 + 编译行为图 | .nkxr 场景 + 编译后的 FSM/BT |
| Review | 读 frame-budget / comfort 反馈,决定是否回退 | FeedbackDecision (L1–L4) |

### 3. 必须禁止的反模式

```
✗ 在 OnUpdate 里调 LLM 决定下一动画(延迟会爆)
✗ 把 LLM 当 NPC 的对话脑(应预生成对话树或边缘小模型)
✗ 让 BehaviorGraph 节点直接引用 Tool(应只引用预编译 action handle)
✗ Anchor 解析失败时阻塞渲染(应 fallback 到上一帧 pose)
```

## 后果

### 正面

- **硬实时安全**:Plane 边界形式化后,review 能直接体检"LLM 是否进了帧循环"
- **复用最大化**:runtime-scene 的 Skinning/IK/Animation 全部直接复用
- **跨平台路径**:OpenXR / WebXR / visionOS 三套 Provider 共享 Authoring Plane

### 负面 / 权衡

- **新 crate**:`runtime-xr` 增加构建依赖
- **新 artifact**:.nkbg 需要新格式 + 编译器
- **预编译开销**:BehaviorGraph 编译期需 lint(detect cycles, energy budget)
- **多用户暂不覆盖**:Shared Anchor 同步协议推迟到独立 ADR

## 实施路径

```
S1  runtime-xr crate 新建
    ── 复用 runtime-scene + 新增 XR 特有 Component/System
    ── XRSession / OpenXR 集成
    工作量: 4 PR

S2  BehaviorGraph artifact + 编译器
    ── .nkbg JSON Schema 定义
    ── 编译到 FSM/BehaviorTree
    ── lint(cycles / budget / unsafe action)
    工作量: 3 PR

S3  L1 Control 扩展 3 类信号
    ── tracking-degraded / comfort-violation / frame-budget-overrun
    ── 接入 FeedbackArbiter Policy
    工作量: 2 PR

S4  Authoring/Runtime 部署管道
    ── VSCode 内 Authoring 完成后 → 设备(Quest/Vision Pro)
    ── 中间 stage 通过 .nkxr 项目格式承载
    工作量: 3-5 PR(取决于平台覆盖)
```

## 悬而未决

```
Q1: VSCode 内的 XR 预览体验?
    选项 A: WebXR iframe (Webview 内,但 VSCode Webview 沙盒可能屏蔽 WebXR)
    选项 B: 外部窗口/进程(Rust 引擎开第二窗口走 OpenXR)
    选项 C: 仅生成,不预览,导出到 Quest/Vision Pro 真机
    → 倾向 B,与 host-cli 形态一致

Q2: 目标平台优先级?
    OpenXR (Quest/Vive/Index) | WebXR (浏览器) | visionOS (Apple)
    → visionOS 不开放 OpenXR,需独立 Provider
    → 建议先 OpenXR (Rust openxr crate 成熟),WebXR 次之

Q3: 多用户共享空间?
    属于"网络层",当前 ARCHITECTURE.md 未定义
    → 初版可推迟,但 SpatialAnchor 组件需预留 persistence_id 字段

Q4: AI 自动生成的 BehaviorGraph 安全性?
    可能死循环、无限触发、舒适违反
    → 必须接 L1 Feedback 的 comfort-violation + frame-budget-overrun
    → BehaviorGraph 编译期需有 lint(detect cycles, energy budget)
```
