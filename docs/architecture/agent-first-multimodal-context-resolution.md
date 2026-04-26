# Agent-First 多模态上下文解析与感知输入分层

**状态**: Proposed / Architecture Guidance
**日期**: 2026-04-26
**关联范围**: neko-agent · neko-client · neko-engine · neko-cut · neko-canvas · neko-model · neko-puppet · XR runtime
**关联文档**:

- [Agent-First 多模态开发方案](./agent-first-multimodal-development-plan.md)
- [Agent-First 多模态感知闭环路线图](./perception-first-roadmap.md)
- [Agent Media Architecture](./agent-media-architecture.md)
- [Capability Protocol](./adr-capability-protocol.md)
- [Skill as Prompt Chains](./adr-skill-as-prompt-chains.md)

---

## 1. 核心结论

多模态感知不能在 **UI 状态** 与 **素材文件** 之间二选一，而应分层组合：

```text
UI Selection / View Context
→ Project / Engine Authoritative State
→ Asset / Frame / Segment Resolver
→ AgentObservation
→ optional PerceptionEvidence
→ DecisionRationale
```

职责边界：

- **Agent 是主感知与主决策主体**：最终由 Agent 形成 `AgentObservation` / `DecisionRationale`。
- **UI 工具是上下文桥梁**：负责“用户当前指向什么、选中了什么、当前视图在哪里”。
- **项目/引擎状态是结构权威**：负责 timeline、canvas graph、scene graph、camera、rig、animation track 等结构化状态。
- **素材文件是内容本体**：负责像素、帧、音频、mesh、texture、motion curve、camera path 等可复现输入。
- **Perception tools 是 evidence provider**：只产出 `PerceptionEvidence`，不直接修改项目、不触发重跑、不替代 Agent 判断。

---

## 2. 为什么 UI 与素材都需要

### 2.1 不能只依赖 UI

- UI 是瞬时状态，不是内容事实来源。
- Webview 不能直接访问 Node.js / VSCode API，不能把 UI 当数据权威。
- UI selection / hover / viewport 容易丢失，难以复现和审计。
- Agent-first Journal 需要稳定引用：`artifactRef`、`selectionRef`、`timeRange`、`nodeId`、`framePath`。

UI 适合回答：

```text
用户当前看哪里、选了什么、播放头在哪、当前相机是谁、是否有手动标注
```

### 2.2 不能只依赖素材文件

- 文件不知道用户当前指的是哪里。
- 同一个视频文件可能对应多个 timeline clip、不同 in/out、不同 speed/effects。
- 同一个 3D 模型文件在 scene 中可能有不同 transform、material、camera、light、visibility。
- 动作文件不知道当前绑定角色、选中 bone/keyframe、当前镜头。
- 用户说“这个”“这里”“刚才那段”时，必须依赖 UI context。

素材文件适合回答：

```text
图像像素是什么、视频帧是什么、音频片段是什么、mesh/material/skeleton/motion curve 是什么
```

---

## 3. 对象级分工

| 对象 | 主要来源 | UI 是否必须参与 | 推荐感知输入 |
| --- | --- | ---: | --- |
| 画布 Canvas | canvas graph / node 数据 + 素材文件 | 是 | selected node 的 rendered crop + node metadata |
| 时间线 Timeline | timeline project state + clip asset | 是 | selected clip/range 的 frame sample / audio segment |
| 2D 模型/角色 | rig、layer binding、贴图、当前 pose | 通常需要 | 当前 pose render + selected part metadata |
| 3D 模型/场景 | scene graph、mesh、material、rig、animation | 是 | viewport render + scene node metadata + mesh/material refs |
| XR 场景 | XR session pose + scene graph + asset | 强依赖 | current XR view snapshot + spatial object ref |
| 动作数据 | animation clip / keyframes / motion file | 视任务而定 | motion segment + preview frames + curve metadata |
| 镜头数据 | shot list / camera track / timeline mapping | 是 | shot frame samples + camera metadata + adjacent shot context |
| 图片/视频/音频素材 | `GeneratedAsset` / 文件 | 不一定 | 原始文件、帧、片段、波形、metadata |

---

## 4. 推荐接口分层

### 4.1 UIContextProvider

只提供当前交互上下文，不做语义判断。

```ts
interface UIContextProvider {
  getActivePanel(): ActivePanel;
  getSelection(): readonly SelectionRef[];
  getViewportState(): ViewportState | null;
  getTimelineState(): TimelineViewState | null;
  getCanvasState(): CanvasViewState | null;
  getSceneState(): SceneViewState | null;
}
```

典型输出：

```text
panel、selectionRef、viewport、playhead、timeRange、cameraRef、userAnnotation
```

### 4.2 ProjectStateProvider / EngineStateProvider

把 UI selection 解析为项目/引擎权威对象。

```ts
interface ProjectStateProvider {
  resolveTimelineClip(ref: SelectionRef): TimelineClip;
  resolveCanvasNode(ref: SelectionRef): CanvasNode;
  resolveSceneNode(ref: SelectionRef): SceneNode;
  resolveAnimationTrack(ref: SelectionRef): AnimationTrack;
  resolveCameraShot(ref: SelectionRef): CameraShot;
}
```

### 4.3 PerceptionInputResolver

把 UI + 项目/引擎状态转换成 perception tool 可消费的输入。

```ts
interface PerceptionInputResolver {
  resolveImageInput(selection: SelectionRef): ImageInput;
  resolveVideoFrame(selection: SelectionRef): VideoFrameInput;
  resolveAudioSegment(selection: SelectionRef): AudioSegmentInput;
  resolveModelSnapshot(selection: SelectionRef): ModelSnapshotInput;
  resolveMotionSegment(selection: SelectionRef): MotionSegmentInput;
}
```

示例：

```text
timeline selected clip + playhead
→ frame image path + clip id + timestamp

canvas selected node
→ rendered crop image + node id + layer metadata

3D selected mesh
→ viewport render + scene node metadata + material refs

XR gaze target
→ scene node ref + world transform + current view pose
```

### 4.4 MultimodalContextPacket

Agent 不应直接读取“全量 UI”或“全量素材库”，而应消费解析后的上下文包。

```ts
interface MultimodalContextPacket {
  readonly selection: readonly SelectionRef[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly projectRefs: readonly ProjectObjectRef[];
  readonly perceptionInputs: readonly PerceptionInputRef[];
  readonly uiContext: UIContextSnapshot;
}
```

主链路：

```text
MultimodalContextPacket
→ AgentObservation
→ optional PerceptionEvidence
→ DecisionRationale
```

---

## 5. 处理规则

| 问题类型 | 主要来源 | 决策主体 |
| --- | --- | --- |
| “内容是什么” | 素材文件 / 渲染结果 | Agent |
| “用户指的是哪个对象” | UI selection / viewport | UIContextProvider + Agent |
| “这个对象在项目里是什么” | ProjectStateProvider / EngineStateProvider | 项目/引擎状态 |
| “是否需要修改” | observation + evidence + policy | Agent |
| “怎么修改” | Tool / artifact / approval path | Agent + 既有工具 |

禁止：

- UI 直接给出最终内容判断。
- UI 或 perception tool 直接触发重跑 / pipeline。
- 素材文件脱离用户 selection 独立决定编辑目标。
- Subagent 接管主感知或作为 worker pool 自动执行。

---

## 6. 示例链路

### 6.1 时间线 shot 风格漂移

```text
用户选中 timeline shot 3
→ UIContextProvider 提供 selected clip + playhead + active track
→ ProjectStateProvider 解析 clip source / in-out / effects
→ PerceptionInputResolver 导出当前帧与相邻 shot frame samples
→ Agent 形成 AgentObservation：shot 3 风格可能漂移
→ 可选调用 perception.image.similarity / perception.image.classify
→ PerceptionEvidence 附到 observation
→ Agent 形成 DecisionRationale
→ Skill Prompt-Chain Guidance 给出最小修正建议
```

### 6.2 画布节点识别

```text
用户框选 canvas node
→ UIContextProvider 提供 node selection + viewport crop
→ ProjectStateProvider 解析 node transform / layer order / generation params
→ PerceptionInputResolver 生成 rendered crop
→ Agent 观察该节点内容与用户意图是否一致
→ 可选 classify/similarity evidence
→ Agent 决定是否建议调整 prompt、layer 或素材引用
```

### 6.3 3D/XR 当前对象

```text
用户在 3D/XR 视图中指向对象
→ UI/XR context 提供 camera/head pose、controller ray、selection ref
→ EngineStateProvider 解析 scene node、world transform、material、animation state
→ PerceptionInputResolver 生成 viewport snapshot + scene metadata
→ Agent 形成 observation/rationale
→ 工具只作为 evidence，不直接修改 scene
```

---

## 7. 落地优先级

1. 定义 `SelectionRef` / `ArtifactRef` / `ProjectObjectRef` / `PerceptionInputRef` 最小契约。
2. 增加 `UIContextProvider` 只读接口，先覆盖 timeline / canvas。
3. 增加 `PerceptionInputResolver`，先支持 selected clip frame、selected canvas node crop。
4. 将 context packet id 写入 `AgentObservation` / `PerceptionEvidence.data`，保证 Journal 可追溯。
5. 后续扩展 3D / XR / motion / camera shot。

---

## 8. 变更历史

| 日期 | 变更 | 作者 |
| --- | --- | --- |
| 2026-04-26 | 初版：明确 UI、项目/引擎状态、素材文件、AgentObservation 与 PerceptionEvidence 的分层边界 | Codex |
