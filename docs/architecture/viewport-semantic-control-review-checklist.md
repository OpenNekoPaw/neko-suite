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

## 不足以通过的证据

- 只断言 H.264 frame/canvas/video surface 收到了新帧。
- 只断言本地 React state 变化，未验证 ack/error 或权威 snapshot。
- 只手动点击按钮看画面变化，没有检查 scene-control connect、command ack、delta/snapshot 和 store/controller 更新。
