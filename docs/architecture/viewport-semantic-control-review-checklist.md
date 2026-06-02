# Viewport Semantic Control Review Checklist

所有 engine-rendered viewport 语义交互 PR 都必须按控制流验收，而不是只看视频帧是否变化。

## 必查项

- UI action 是否产生了明确的 `ViewportCommand`、scene-control query 或领域 `scene:*` command，并包含 `sceneId`、`viewportId`、`seq`、`correlationId`、`baseRevision`。
- 测试是否断言了 ack/error，以及失败时的 rollback 或 degraded state。
- ack、delta、snapshot 或权威 scene update 是否会更新 controller/store，而不是只更新本地 UI。
- overlay、toolbar、inspector 或 timeline 是否反映 pending、committed、error、stale 状态。
- 视频继续播放但控制通道断开/命令失败时，UI 是否显示 control degraded，而不是把视频变化当作成功。
- frame metadata 延迟、stale revision、ack-before-frame 是否有诊断或 prediction fallback。
- Webview 是否仍不直接 import `vscode`、Node API 或其他编辑器包。

## neko-model 性能与热路径必查项

- 高频 camera orbit、wheel、keyboard camera action、transform drag、灯光位置拖拽和连续 slider 是否先更新本地意图或 overlay prediction，再发送 latest-only scene-control hot update。
- 高频交互是否没有等待 `viewportCameraAck` 或普通 command ACK；没有 `cameraUpdateInFlight` / pending 队列把 pointer move 串行化。
- 高频交互是否没有触发 `destroy/startSceneRenderStream()`；`streamProfile` / `GOP=1` 是否只作为 Engine runtime stream policy，而不是 React stream lifecycle state 或 `startSceneRenderStream()` effect 依赖。
- 交互起点是否预热低延迟 profile：pointerdown、wheel 和 keyboard camera action 在真实 delta 前也应发送当前 camera + `streamProfile: 'interactive'`。
- Webview 是否只通过 `H264StreamClient.updateBackpressurePolicy()` 更新现有 decoder backpressure/latest-only 策略；没有 reset/close/recreate WebCodecs decoder。
- latest-only 是否只限制后续入队或呈现策略；不得 suppress 已提交给 WebCodecs/VideoToolbox 的旧帧，不得清空硬解已接管帧的 tracking 后再丢弃输出。
- 1080p 清晰度是否按 CSS size * `devicePixelRatio` 请求 Engine stream；性能 overlay 是否暴露 coded size、canvas CSS/physical size、DPR 和 presentation scale。
- 画质修复是否留在 Engine render graph / stream quality / encoder 设置中；不得重新引入 Webview mesh renderer、glTF parser、Three.js/R3F fallback。
- 性能 overlay 是否区分 Engine render、encode、decode、presentation、scene-control ACK、metadata delay/stale、memory availability；不得只用单一 FPS 指标解释卡顿。
- overlay 是否不会阻塞 viewport pointer capture；性能面板可选择文本，但非面板诊断层不得抢占高频输入。

## 不足以通过的证据

- 只断言 H.264 frame/canvas/video surface 收到了新帧。
- 只断言本地 React state 变化，未验证 ack/error 或权威 snapshot。
- 只手动点击按钮看画面变化，没有检查 scene-control connect、command ack、delta/snapshot 和 store/controller 更新。
- 只展示平均 FPS 正常，没有证明高频交互无 stream restart、无 ACK gating、无 decoder reset、无已提交硬解帧 suppress。
