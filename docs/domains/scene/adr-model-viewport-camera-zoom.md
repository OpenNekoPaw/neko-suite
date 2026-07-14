# ADR: 模型视口相机缩放与防穿模

状态：Accepted
日期：2026-06-17
范围：`neko-model` 3D Webview、Scene/Viewport Engine control、选择命中、相机 near/far 策略、后续内部查看工具。

本文记录 Neko Model 中滚轮/Orbit 缩放、表面放大、防穿模、小尺度物品和进入物体内部查看的稳定设计原则。它补充 `architecture.md`、`../../architecture/engine-runtime.md` 和 `../../architecture/package-boundaries.md`，不保存单次实现日志。

## 背景

模型视口当前采用 Orbit camera：滚轮或拖拽缩放会改变 `cameraRadius`，再由 `cameraTarget`、`theta`、`phi` 重新计算相机位置。这个语义是 dolly toward target，而不是 surface magnifier。

当 `cameraTarget` 位于模型中心、内部或模型后方时，持续缩放会把相机推向几何体内部。即使相机尚未进入模型体积，近裁剪面也可能先切到前表面，形成“穿模”或“被切开”的观感。

固定世界尺度的最小相机半径同样有问题：

- 对 1:1 角色或普通道具，过小半径会误穿。
- 对纽扣、首饰、眼睛高光、螺丝等小物品，固定 `near = 0.1` 会让微距查看停在过远位置。
- 内容创作允许极大、极小和夸张比例，不能通过限制对象 scale 来解决视口问题。

## 决策

Neko Model 的默认视口缩放采用“默认不误穿、显式可进入内部”的策略。

默认 Orbit/滚轮缩放必须保护相机：

```text
safeMinRadius = frontDepth + near + margin
cameraRadius = clamp(cameraRadius + delta, safeMinRadius, maxRadius)
```

其中：

- `frontDepth` 是从当前 orbit target 到选中对象或场景 bounds 在相机方向上的前表面距离。
- `near` 是当前 editor camera 的近裁剪面。
- `margin` 是防止数值抖动和裁剪闪烁的安全余量。

该约束的职责归 Webview camera state/control 层；Rust Engine 仍拥有真实渲染、scene graph、camera component 和命中检测权威。Webview 不直接复制 Engine 的渲染判定，只使用 scene snapshot、selection target、bounds 或 Engine hit-test 返回的投影数据做交互保护。

对象本身的 transform scale 不做硬限制。异常尺度可以在属性面板、导出、物理或动画流程中提示，但默认创作视口必须通过自适应 camera、grid、pan、zoom、near/far 处理尺度差异。

## 缩放语义

默认滚轮缩放应逐步从 target-based dolly 升级到 surface-anchored zoom：

```text
1. 根据鼠标位置发起 hit-test 或读取 depth/selection hit。
2. 若命中可见表面，使用 surface point 作为临时缩放锚点。
3. 平滑移动 orbit target 或 focal point 到 surface point 附近。
4. 沿视线靠近该表面，但停在 near + margin 之前。
5. 若没有命中，回退到当前 orbit target 缩放。
```

这能让“鼠标指到哪里就放大哪里”成为主路径，避免用户以为滚轮是放大表面、实际却推向模型中心。

## 小物品与动态 near/far

小尺度对象不能使用固定 `near = 0.1` 作为唯一约束。editor camera 应根据选中对象或当前焦点 bounds 自适应：

```text
selectionRadius = radius(selectedBounds ?? sceneBounds)
near = clamp(selectionRadius * 0.005, 0.001, 0.1)
margin = max(near * 0.2, 0.001)
far = max(sceneDistance + sceneRadius * 2, near * 1000, defaultFarFloor)
safeMinRadius = frontDepth + near + margin
```

动态 near/far 是交互相机策略，不改变导入场景 camera 的作者意图。导入 camera 若带有显式 near/far，应保留其语义；editor camera 可使用独立参数。

## 内部查看

建模软件需要支持进入物体体积，但不能把它作为默认滚轮行为。

允许进入内部的能力必须显式：

- X-Ray / 透明查看。
- Section Plane / Clip Plane。
- Isolate Selection / Hide Outer Shell。
- Walk/Fly Camera 或自由相机模式。
- 按住修饰键临时绕过 clipping guard。

进入内部或启用剖切时，视口必须提供明确反馈，例如 `Inside`、`X-Ray`、`Section`、`Clipping guard bypassed` 等状态，而不是让用户误判为渲染损坏。

## 精度层级

防穿模按三层递进实现：

| 层级 | 数据来源                | 用途                               | 限制                           |
| ---- | ----------------------- | ---------------------------------- | ------------------------------ |
| L1   | selected/scene AABB     | 快速保护普通模型、角色和道具       | 凹形、洞口、薄片不够精确       |
| L2   | Engine hit-test/raycast | 表面锚定缩放、复杂几何前表面保护   | 依赖 Engine 命中与延迟控制     |
| L3   | depth buffer/BVH        | 高精度 camera collision 与微距保护 | 需要渲染/加速结构支持和性能评估 |

L1 可作为 fallback；L2 是默认交互的目标状态；L3 用于高质量建模、内部检查和复杂场景。

## 架构边界

- Webview 负责 UI gesture、camera interaction state、节流和用户反馈。
- EngineClient/SceneControlSocket 负责传递 editor camera、hit-test request、selection query 和 viewport stream descriptor。
- Rust Engine 负责 scene authority、bounds、raycast/depth、camera projection 和 render output。
- Protobuf/生成类型仍是跨层协议的单一事实来源；新增 near/far、camera mode、hit-test 或 clipping mode 字段必须先更新契约。
- Webview 不直接访问 Node/Vscode API；运行态验证必须使用 VS Code Webview smoke 或 `vscode-extension-debugger` skill。

## 后果

正向影响：

- 默认缩放不会误穿模型或被 near clip 切开。
- 小物品可以通过动态 near/far 获得真实微距查看，而不是放弃防穿模。
- 内部查看作为显式创作工具存在，不与默认滚轮语义冲突。
- 后续 raycast、depth 或 section plane 可以按层级演进。

成本与风险：

- 动态 near/far 可能影响深度精度，需要按场景尺度 clamp。
- surface-anchored zoom 依赖 hit-test 或 depth 数据，需处理异步延迟、无命中、透明/隐藏对象和 selection filter。
- 如果反馈不足，用户可能把 clipping guard 理解为滚轮失效。
- 过度依赖 AABB 会让洞口、薄片和凹形模型的行为显得保守。

## 验证要求

相关变更至少验证：

```bash
pnpm --filter @neko-model/webview test
pnpm --filter @neko-model/webview exec tsc --noEmit
pnpm check:3d-route-a-boundaries
pnpm test:webview:functional --owner neko-model
```

若涉及 Rust hit-test、camera projection、Proto 或 stream descriptor，还需增加对应契约测试、Engine 测试和 smoke。

关键场景应覆盖：

- 1:1 模型 target 在中心时滚轮不会穿入前表面。
- 小物品选中后可以微距查看。
- target 平移到模型外时仍可 close-up 查看空白/局部区域。
- 多选或子部件选中时优先使用选中 bounds。
- X-Ray、section、free camera 或 bypass 模式可显式进入内部并显示状态。
