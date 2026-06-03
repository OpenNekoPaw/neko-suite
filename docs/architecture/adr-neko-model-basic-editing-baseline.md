# ADR: neko-model 基础可视化编辑能力基线

## 状态

Proposed (2026-06-01; revised 2026-06-02)

**日期**: 2026-06-01
**关联**: neko-model · neko-engine · neko-client · neko-proto

## 关联文档

| 关联文档 | 关系 |
|---|---|
| [adr-3d-editor-rendering-architecture.md](./adr-3d-editor-rendering-architecture.md) | Route A 边界：Engine 权威渲染，Webview 不做 3D 渲染权威 |
| [adr-viewport-stream-control-boundary.md](./adr-viewport-stream-control-boundary.md) | 视频流、scene-control、frame metadata 与高频热路径边界 |
| [adr-model-lookdev-scene-editing.md](./adr-model-lookdev-scene-editing.md) | LookDev、灯光、环境、选择合同的目标能力 |
| [adr-headshot3-capability-gap-analysis.md](./adr-headshot3-capability-gap-analysis.md) | Headshot/AI 能力必须建立在基础编辑闭环之上 |
| [adr-ai-face-sculpting.md](./adr-ai-face-sculpting.md) | 面部参数、Agent 编辑与 VLM 验证闭环的上层能力 |
| [viewport-semantic-control-review-checklist.md](./viewport-semantic-control-review-checklist.md) | PR 评审清单：语义控制、性能与热路径回归检查 |

---

## 实施状态更新

2026-06-01 的首轮实现曾尝试补齐基础编辑控制流，但运行测试发现新增路径会让可见 camera/drag 反馈延迟数秒。该实现代码已回滚，本文继续作为需求与架构基线；OpenSpec change `implement-neko-model-basic-editing-baseline` 的任务状态也已重置为未完成，只有审计/fixture 类工作可保留为已完成。

下一轮实现必须先满足即时交互热路径：

1. Webview 先更新本地意图、overlay 或短生命周期 prediction，再发送 Engine hot update。
2. 高频 camera orbit、pan、wheel、keyboard camera action、transform drag、灯光位置拖拽和连续 slider 使用 latest-only scene-control hot update，不等待 `viewportCameraAck` 或普通 SceneCommand ACK。
3. latest-only 和 backpressure 是当前 stream/client 的 runtime policy；不得成为 `startSceneRenderStream()` effect 依赖，也不得触发 stream destroy/start。相机/拖拽热路径不得自动发送 `streamProfile/profileTtlMs` 或触发 Engine `GOP=1`/默认 GOP reconfigure。
4. LookDev PBR/白模/线框/法线/深度切换不得通过重启视频流实现；Webview 只能发送当前 viewport 的 `viewport-settings-update`，并用 Engine ack 与当前流 frame metadata 确认最终有效模式。
5. WebCodecs/VideoToolbox 已接管的输出帧不得在 JS 侧 reset、suppress 或 close/recreate decoder 来“追低延迟”；这会造成等待新 keyframe 的输出空窗。
6. 视频帧、frame metadata、SceneDelta 和 snapshot 只负责最终一致对齐；用户可见交互反馈不得被它们闸住。
7. 交互期不得新增第二条或第三条模型视频流，也不得引入 `/scene-video` 等并行兼容流作为实时视口路径；`GOP=1` / All-Intra 只允许作为显式实验或非热路径配置，不能通过相机/拖拽自动 profile 更新或重新申请 stream descriptor 实现。

### 硬约束：禁止交互、性能、画质回退

下一轮实现必须把当前已恢复的稳定路径作为不可变基线。本 ADR 下的任何 PR 都不得通过“改慢、改糊、改少”的方式换取功能接入。

1. **禁止修改交互路径**：camera orbit、pan、wheel、keyboard camera action、transform drag、灯光位置拖拽和连续 slider 的既有即时反馈路径不得被替换、绕行或重排到可靠 ACK/查询/诊断/LookDev 状态之后。新功能只能旁路观察、补充诊断或在 commit 阶段做最终一致，不得接管热路径。
2. **禁止降低 GPU 性能**：不得引入热路径 CPU readback、GPU->CPU->Webview 逐帧传输、额外全屏 pass、同步等待、关闭 zero-copy/hardware encoder、降低 stream 分辨率/DPR/FPS/码率作为默认策略，或把 Engine GPU 渲染替换成 Webview 渲染 fallback。
3. **禁止降低渲染效果**：不得通过关闭或降级 PBR、法线/切线、sRGB/tone mapping、阴影、AO、抗锯齿、纹理采样、材质精度、helper pass 合成质量或 1080p 默认清晰度来掩盖性能/控制流问题。
4. **禁止用重启流或重开编码器修复交互或 LookDev**：高频交互、LookDev 模式切换、latest-only backpressure、相机/灯光/transform 拖拽和连续 slider 不得调用 `startSceneRenderStream()`、销毁当前 H.264 client、重建 WebSocket、reset/close/recreate decoder、新增并行模型视频流，或自动触发 Engine GOP/码率 reconfigure。
5. 任何必要 fallback 必须是显式能力降级：要有 Engine descriptor、stream diagnostic 或 UI reason，且不得伪装成默认 1080p/60fps 与完整 LookDev 质量。

## 背景

当前 neko-model 的首要问题不是缺少 Headshot 级 AI 生成能力，而是普通模型仍无法稳定完成基础可视化编辑闭环：看到模型、选中对象或部位、修改属性、获得实时反馈、确认或回滚结果。

现有 UI 已出现多个控制入口，但用户侧看到的是“按钮存在但不可用”：LookDev 只剩 PBR，可选工作流中“面部/骨骼/灯光/动画/检查”大量灰态，面部/骨骼编辑面板在普通 GLB 下无法提交。这说明当前实现把“合同已设计”与“产品可编辑”混在了一起。

本 ADR 单独定义 neko-model 的基础编辑基线。Headshot、AI 生成、语义区域、纹理投射等高阶能力必须建立在该基线之上。

## 目标

- 任意合法 GLB/VRM 至少可以作为场景对象查看、选择、变换、调光和检查。
- Webview 继续作为控制 UI、状态展示和 overlay，不解析 glTF/VRM，不成为 3D 渲染权威。
- Engine 继续作为模型加载、场景状态、拾取、渲染和编辑命令应用的权威。
- UI 按钮禁用必须有可见原因，并走 i18n 文案，不允许静默灰态。
- 普通 mesh、rigged mesh、角色资产按能力逐级降级，不伪装成完整可编辑角色。
- 默认实时视口目标是 1080p/60fps 级别即时反馈；720p 或更低只允许作为显式 fallback，并必须显示原因。
- 禁止为了接入基础编辑能力而修改既有即时交互路径、降低 Engine GPU 性能或降低渲染效果。

## 非目标

- 不在 Webview 引入 Three.js/R3F 或 glTF 解析。
- 不在本 ADR 内实现 Headshot 照片转 3D、AI provider、纹理投射或 VLM 验证闭环。
- 不要求普通 GLB 自动具备面部 region、morph target 或标准骨骼语义。
- 不接受以降低分辨率、关闭抗锯齿/阴影/AO/PBR 质量、关闭 zero-copy/hardware encode 或改变交互热路径作为默认修复方案。

---

## 基础能力分层

| 层级 | 能力 | 用户可感知验收 | 优先级 |
|---|---|---|---|
| B0: 可视化 | 加载模型、显示 Engine stream、相机 orbit/pan/zoom、默认目标 1080p/60fps 清晰显示 | 用户能稳定看到 mesh，旋转观察即时响应，PBR/白模/线框至少可切换；若只能降到 720p，必须是显式 fallback 并显示原因 | P0 |
| B1: 对象级编辑 | 选中 node/submesh/material slot，Transform 平移/旋转/缩放，显示 Outliner/Inspector | 点击模型或树节点后 Inspector 可编辑；拖拽/相机热路径即时反馈，提交后由 Engine 最终一致确认 | P0 |
| B2: 场景 LookDev | PBR/白模/线框/法线/深度切换，添加/删除/移动灯光，背景色/环境切换 | 按钮不静默灰态，操作后 Engine 画面变化，失败有明确原因 | P0 |
| B3: 角色级编辑 | 面部 morph、骨骼 pose、动画播放/关键帧、雕刻 brush | 只有具备 character contract 的模型启用；普通 GLB 明确降级 | P1 |
| B4: 语义/AI 编辑 | face region、MetaHuman-like 部位选择、照片转 3D、纹理投射、VLM 验证闭环 | 依赖 `.nkc` region descriptor、provider capability 和资产合同 | P2+ |

基础能力的目标是让任何合法 GLB/VRM 至少成为可查看、可选择、可变换、可调光的场景对象。Headshot/AI 能力的目标是把输入素材转换为具备角色语义的可编辑资产。前者是产品可用性前提，后者是创作效率增强；实现顺序不能反过来。

---

## 五层分析

| 维度 | 设计结论 |
|---|---|
| 职责 | Webview 只做控制 UI、状态展示和 overlay；Engine 负责模型加载、场景状态、渲染、拾取、命令应用和 runtime stream policy。 |
| 依赖 | 基础编辑依赖 Route A scene control、SceneSnapshot/SceneDelta、ViewportCommand/SceneCommand、RenderStreamDescriptor 和 RenderFrameMeta；不依赖 AI provider。 |
| 接口 | 所有写操作必须走 command envelope；所有按钮启用状态必须来自能力声明、场景快照、运行时 diagnostic 和选中上下文，而不是硬编码 UI 假设。 |
| 扩展 | 普通 mesh 从 object/material/submesh 开始；角色资产再扩展 morph/bone/region；Headshot/AI 输出必须先归一化到角色资产合同。 |
| 测试 | 必须增加 smoke：加载固定 GLB 后对象选择、Transform、LookDev 切换、灯光 CRUD、背景色切换均可操作；无能力时按钮显示具体原因。当前可用 `../neko-test/test.glb` 做手工验证，但 CI 需要仓库内新增可再分发 fixture。 |

---

## 当前 UI 灰态含义与修复方向

| UI 区域 | 当前灰态常见原因 | 基础修复方向 |
|---|---|---|
| LookDev 白模/线框/法线/深度 | Engine capability 只声明 `renderModes: ['pbr']` 或 scene control 未 ready | Engine descriptor 必须真实反映已实现 render modes；Webview 显示 capability diagnostic |
| 选择：对象 | typedPicking 未声明时整个选择工作流被禁用 | 对象级选择不应依赖 semantic typed picking；至少允许 Outliner 选中和 raycast node/material fallback |
| 选择：面部 | 缺少 characterRegions 或 `.nkc` region descriptor | 普通 GLB 保持禁用并显示“缺少角色区域”；角色资产合同完成后启用 |
| 选择：骨骼 | 缺少 skeleton/bone metadata 或未选中 character | 对 VRM/rigged GLB 先启用 bone list/outliner 选择；语义骨骼稍后扩展 |
| 选择：灯光 | authoredLights capability 为 false 或没有 light node | P0 先保证 node-add light 可用，并把新灯加入 scene snapshot/outliner |
| 选择：动画 | 没有 animation clips 或 scene control 未 ready | 有 clips 时启用播放/选择；无 clips 时显示空状态，不应表现为未知故障 |
| 检查 | typed picking 未 ready 时被禁用 | inspection 可以先基于 selected node/material snapshot 工作，不要求高级 region picking |
| 面部/骨骼编辑面板 | `selectedCharacterId` 为空，或普通 GLB 无 morph/bone compatibility | UI 应提示“当前模型不是可编辑角色”；不要让用户误以为按钮坏了 |

---

## 决策

### D1: Basic Editing Baseline 是 neko-model 当前 P0

在 Headshot/AI 能力之前，必须先让普通 GLB/VRM 完成 B0-B2。否则模型/API 输出即使可以生成，也无法成为用户能操作的创作资产。

### D2: Object/Inspect 不应强依赖高级 typed picking

`typedPicking` 和 `characterRegions` 是语义选择增强能力，不应阻塞对象级编辑。即使 Engine 暂未提供完整 semantic picking，Webview 也应允许 Outliner 选中、selected node inspector、material slot snapshot inspection 等基础路径。

### D3: 灰态按钮必须有状态解释

按钮禁用必须能映射到结构化原因：

- Engine 未 ready
- scene control 未 connected/ready
- Engine capability 缺失
- 当前未选中对象
- 当前模型不是可编辑角色
- 当前模型缺少 morph/bone/animation/material 数据
- runtime diagnostic 表明命令被 Engine reject 或资源加载失败

这些原因必须走 i18n 文案，并在 tooltip、状态行或空状态中呈现。

### D4: 普通模型先降级为对象/材质编辑

普通 GLB/OBJ/VRM 如果没有 region descriptor、standard topology 或 morph compatibility，不得伪装成完整可编辑角色。但它仍应支持查看、对象选择、Transform、材质检查、LookDev、灯光和背景。

### D5: Route A 边界保持不变

Webview 可以显示控制面、状态、hover/selection overlay，但不能解析 mesh 或自己渲染 3D 场景。所有模型状态、拾取结果和编辑写入必须由 Engine 提供或确认。

### D6: Capability 声明不是唯一真相

Engine capability discovery 用于决定默认 UI 启用状态，但 Webview 不能永久信任静态 capability。若 capability 声明与实际 SceneCommand/ViewportCommand 响应冲突，Webview 必须以 Engine 的实际 ack/reject/diagnostic 为准，并更新本地 diagnostic 状态。静态 capability 只能让按钮默认启用或禁用，不能吞掉运行时错误。

### D7: 已有 LookDev 实现需要先审计再复用

`adr-model-lookdev-scene-editing.md` 和当前实现已经覆盖大量 B2 合同与代码路径，但本 ADR 不假设它们已满足产品基线。实施时先做 B0-B2 审计：capability 是否真实、按钮是否有灰态原因、普通 GLB 是否能走对象/检查 fallback、light/environment 是否能在 Engine 画面中可见。通过审计的代码直接复用；未满足用户可感知验收的部分按本 ADR 补齐。

### D8: 高频交互必须使用本地即时反馈 + Engine 最终一致

高频相机、拖拽和连续调参不是普通 authoring command。它们必须走 local intent / overlay prediction -> latest-only Engine hot update -> SceneDelta/snapshot/frame metadata reconcile 的闭环。禁止把 `viewportCameraAck`、SceneCommand ACK、stream restart、WebCodecs reset 或已提交硬解帧 suppress 放在用户可见反馈热路径上。

### D9: 交互路径是不可变兼容边界

本 ADR 的实现不得重写、替换或重新排序已恢复稳定的相机/拖拽/连续 slider 路径。选择查询、控制可用性诊断、LookDev 状态和 scene-control 错误只能影响对应控制的降级或最终一致状态，不能成为高频输入的前置条件。若未来确实需要改变交互架构，必须另起 ADR/OpenSpec change，并先给出对照性能和用户可感知延迟证据。

### D10: GPU 性能和渲染效果不得作为回退成本

基础编辑能力必须建立在现有 Engine GPU 渲染和 1080p/60fps 目标之上。不得通过 CPU readback、禁用 zero-copy/hardware encode、降低默认 stream 参数、关闭抗锯齿/阴影/AO/tone mapping/PBR 材质质量或模糊/降采样画面来换取控制流接入。性能问题必须沿 Engine render graph、runtime stream policy、backpressure 和异步最终一致路径解决。

---

## 性能与画质基线

1. 默认目标是 1080p/60fps 级别的 Engine stream；1080p 以 CSS viewport size * `devicePixelRatio` 后的物理像素为准。
2. 720p 或更低 fallback 必须由 Engine descriptor、stream diagnostics 或 UI state 显示原因；UI 不得把低分辨率误报为 1080p。
3. 性能 overlay 必须分层展示 Engine render/frame time、encode time、coded size、canvas CSS/physical size、DPR、presentation scale、decode FPS、pending decode frames、decode output lag、presentation FPS、scene-control ACK 健康、metadata stale/delay 和内存指标可用性。
4. VSCode/Electron Webview 或显示器刷新率可能限制 presentation FPS；这类宿主约束不能被误判为 Engine GPU 不足。
5. 画质问题沿 Engine render graph、stream 分辨率、后处理、编码 profile/码率解决；不得用 Webview mesh renderer、glTF parser 或 Three.js/R3F fallback 修复锯齿/模糊。
6. 诊断 overlay 不得影响 pointer capture 和热路径；性能面板可以选中文本，非面板 overlay 区域不得抢占高频输入。
7. GPU 性能基线必须用固定 fixture 对照变更前后：render/frame time、encode time、GPU/VideoToolbox 路径、coded size、DPR、presentation scale 和 dropped/backpressure 指标不得因本 ADR 实现退化。
8. 渲染效果基线必须用固定 fixture 做视觉对照：PBR/白模/线框、材质、法线、阴影/AO、抗锯齿、背景/环境和 1080p 边缘清晰度不得低于变更前稳定版本。
9. 性能验证必须同时记录 active stream 数量和 stream id；除合法的低频文档/可见性生命周期外，交互期间 active model stream 数不得增加，不能出现多条 scene stream 同时为同一 viewport 反复重配 GOP。

---

## 实施切片

E0 是 E1-E5 的前置诊断层，但可以先做最小版：定义禁用原因模型、i18n 文案和显示位置。后续每个阶段发现新的 Engine diagnostic 或上下文缺失原因时，继续扩展 E0 的枚举和文案。

| 阶段 | 范围 | 依赖 | 工作量估计 | 验收 |
|---|---|---|---|---|
| E0 | Capability diagnostics 与灰态原因 | 无 | 1 PR / 1-2 天 | 所有禁用按钮可显示具体原因，且中英文 i18n 完整 |
| E1 | B0 可视化稳定 | E0 最小版 | 1 PR / 1-2 天 | 固定 GLB 默认目标 1080p stream 显示，orbit/pan/zoom 可用，白模/线框 capability 正确；720p fallback 有原因 |
| E2 | B1 对象级选择 | E0、E1 | 1-2 PR / 2-4 天 | Outliner 选择、raycast node fallback 或 Engine hit-test fallback、Inspector 同步；无需 characterRegions |
| E3 | Transform 编辑闭环 | E2 | 1 PR / 2-3 天 | 平移/旋转/缩放写入 SceneCommand，SceneDelta 回显，失败可回滚；高频拖拽不等待 ACK |
| E4 | B2 LookDev/灯光/背景 | E0、E1，可复用 lookdev 实现 | 1-2 PR / 2-4 天 | PBR/白模/线框/法线/深度、light CRUD、背景色切换可操作 |
| E5 | B3 角色能力降级 | E0、E2 | 1 PR / 1-2 天 | 有 morph/bone/clip 时启用面部/骨骼/动画；普通 GLB 显示明确降级状态 |

E2 的 `raycast node fallback` 不是 Webview 自行解析 mesh。若 Engine 当前没有 node-level hit-test，需要在 Engine/host 增加最低可用拾取 API；在该 API 完成前，B1 至少必须通过 Outliner selection + Inspector 完成对象级编辑。

---

## Fixture 策略

### 手工验证 fixture

短期手工验证可使用仓库外的 `../neko-test/test.glb`，用于本机 Chrome DevTools/VSCode extension debugger 跑通 B0-B2。但它不能作为 CI 依赖，ADR 和测试不能假设该路径存在。

### CI fixture 要求

仓库内需要新增一个可再分发的最小 GLB fixture，建议放在 `test-fixtures/model/basic-editable.glb` 或模型包本地 fixture 目录。最小要求：

- CC0/generated 或项目可再分发授权
- 至少 1 个 mesh node
- 至少 1 个 material slot
- 非空 bounding box，便于相机 framing 和 hit-test
- 可选：第二个 mesh node，用于验证 Outliner 选择
- 可选：简单 skeleton 或 animation clip，用于 B3 降级/启用测试

测试命名应避免与外部 `../neko-test/test.glb` 绑定；外部文件只能作为本地调试输入。

---

## 风险与回滚

| 风险 | 影响 | 缓解/回滚 |
|---|---|---|
| Capability 声明过乐观 | UI 按钮可点但 Engine reject，用户感知为功能坏了 | 以 Engine ack/reject diagnostic 为准，自动降级按钮状态并显示原因 |
| Capability 声明过保守 | 已实现能力被 UI 灰掉 | 提供 retry/refresh capability；允许通过运行时成功响应提升本地 capability 状态 |
| 1080p/60fps 在低端设备不稳定 | 画面卡顿或自动降到 720p | 1080p 是默认目标；允许显式 720p fallback，但必须显示性能/宿主限制原因 |
| Engine 缺少 node-level hit-test | 视口点击无法选中对象 | E2 先保证 Outliner selection；Engine hit-test API 作为同阶段或后续 PR 补齐 |
| 已有 LookDev 代码与产品验收不一致 | 合同测试通过但用户仍看不到效果 | 先审计 B2 可见性与 SceneDelta 回显；不满足时按本 ADR 修复，不重写已通过路径 |
| 灰态原因过多导致 UI 噪音 | 控制面拥挤 | 默认 tooltip/状态行展示短原因，详细 diagnostic 进入 inspector/status panel |
| 高频交互重新被慢路径接管 | camera/drag 可见反馈延迟 2-3s 或更久 | Route A boundary/review checklist 必须检查无 ACK gating、无 stream restart、无 decoder reset、无硬解输出 suppress |
| GPU 性能被新控制流拖低 | 1080p/60fps 不稳定、render/encode 时间升高 | 禁止热路径 CPU readback、额外同步 pass、关闭 zero-copy/hardware encode 或默认降分辨率；必须用固定 fixture 对照指标 |
| 渲染效果被性能 workaround 降级 | 人物边缘更糊、锯齿更明显、LookDev 失真 | 禁止默认关闭 AA/阴影/AO/tone mapping/PBR/纹理质量；任何 fallback 必须显式诊断并可恢复 |

## 验收标准

### A0: 普通 GLB 可编辑

加载仓库内固定 GLB fixture 后，用户必须能看到 mesh、旋转相机、选中对象、查看 Inspector、修改 Transform、切换 PBR/白模/线框、添加一盏灯并看到画面变化。默认目标是 1080p/60fps；若运行环境只能 fallback 到 720p，必须显示原因且不得让 UI 误报为 1080p。

### A1: 灰态可解释

任一按钮不可用时，用户可以看到原因。原因必须来自 Engine capability、scene control status、scene snapshot、runtime diagnostic 或当前 selection context，而不是 UI 硬编码猜测。

### A2: 高阶能力明确降级

普通 GLB 没有 characterRegions、morph compatibility 或 skeleton metadata 时，面部/骨骼/语义部位按钮可以禁用，但必须显示“当前模型不具备角色编辑合同”。对象、检查、Transform、LookDev 不应因此被禁用。

### A3: Route A 合规

测试必须确认 Webview 未引入 Three.js/R3F/glTF parser；所有写操作仍通过 ViewportCommand/SceneCommand 或既有 Route A command envelope。

### A4: 可测试性

需要至少覆盖以下测试：

- Webview unit：按钮启用/禁用原因、i18n 文案、object workflow 不依赖 characterRegions
- Client contract：capability discovery normalizer、scene control ready/error 状态
- Engine/host：render mode capability、light CRUD、scene snapshot/SceneDelta
- E2E smoke：加载仓库内固定 GLB fixture，完成 B0-B2 操作链；`../neko-test/test.glb` 只作为手工调试输入

### A5: 热路径不回归

高频交互测试或手工 debugger 验收必须证明 camera orbit、wheel、keyboard camera action、transform drag、灯光位置拖拽和连续 slider：

- 本地意图先更新；
- 不等待 `viewportCameraAck` 或普通 ACK 才显示反馈；
- 不经 Extension Host 中转；
- 不触发 stream destroy/start；
- 不 reset/close/recreate WebCodecs decoder；
- 不 suppress 已提交硬解输出帧。

### A6: GPU 性能与渲染效果不回归

固定 GLB fixture 和本地 `../neko-test/test.glb` 手工验证必须证明：

- 默认仍以 1080p/60fps 为目标，不能静默降到 720p 或低 DPR；
- Engine GPU render/frame time、encode time、zero-copy/hardware encode 路径、decode/presentation 指标不因本 ADR 实现退化；
- PBR、白模、线框、法线/深度、阴影/AO、抗锯齿、tone mapping、纹理采样和背景/环境效果不低于变更前稳定版本；
- 若环境无法满足目标，只能显示 explicit fallback reason，不能把 fallback 当作默认成功状态。

---

## 结论

neko-model 必须先成为可用的模型创作工具，再讨论 Headshot 级素材转换和 AI 编排。当前 P0 是 Basic Editing Baseline：普通 GLB/VRM 能显示、能选、能改、能调光、能切换基础 LookDev，并在能力缺失时给出明确原因。

该 ADR 是 Headshot/AI 相关 ADR 的前置条件。只有 B0-B2 稳定后，Character Asset Contract、Processing Adapter、语义部位选择和纹理投射才有可靠的用户编辑落点。
