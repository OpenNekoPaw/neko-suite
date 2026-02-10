# NekoCut 预览 WebSocket 修复计划

## 问题根因

### 核心问题：架构不匹配

**PreviewPanel (Webview)** 连接的 WebSocket 端点：
```
ws://127.0.0.1:{port}/ws/h264
```

**NativeEngine.startFrameServer()** 启动的 HTTP 服务器路由：
```
/health
/v1/dispatch
/v1/:group
/v1/:group/:id/:action
/v1/streams/:stream_id    ← 新的 WebSocket 流端点
```

`/ws/h264` 属于旧的 `FrameServer`（已 deprecated），新架构使用 `/v1/streams/:stream_id`。

### 数据格式差异

旧 `/ws/h264` 推送格式：`[pts:i64][dts:i64][is_keyframe:u8][nal_data...]`
新 `/v1/streams/:stream_id` 推送格式：`FrameData.data`（原始字节，可以是 H264/JPEG/RGBA 等）

### 当前播放流程（断裂的）

```
1. Webview ready → Extension 发送 frameServer:config { port }
2. PreviewPanel 收到 port → 创建 H264StreamClient 连接 ws://.../ws/h264 ← 失败！
3. 播放时 → MediaService 调用 timelines:stream → 创建 stream → 返回 streamId
4. 但 streamId 没有传回 Webview，Webview 也没有连接正确的 WS 端点
```

## 修复方案

### 核心思路

将 PreviewPanel 的 WebSocket 连接从旧的 `/ws/h264` 迁移到新的 `/v1/streams/{streamId}`。

播放流程改为：
```
1. Webview ready → Extension 发送 frameServer:config { port }
2. 播放时 → Webview 发送 media:frameServer:projectPlayback:start
3. Extension MediaService 调用 timelines:stream → 获得 streamId
4. Extension 将 streamId + wsUrl 发回 Webview ← 新增
5. PreviewPanel 连接 ws://127.0.0.1:{port}/v1/streams/{streamId}
6. Seek 时 → 通过 IPC 发送 seek 命令（不需要 WS）
```

### 修改文件清单

#### 1. MediaService.ts（Extension 端）
- `handlePlaybackControl` 中 `projectPlayback:start` 成功后，将 streamId 和 wsUrl 发回 Webview
- 新增消息类型 `frameServer:streamCreated`

#### 2. PreviewPanel.tsx（Webview 端）
- 移除在收到 `frameServer:config` 时立即创建 H264StreamClient 的逻辑
- 改为监听 `frameServer:streamCreated` 消息，收到 wsUrl 后再连接
- H264StreamClient 的 websocketUrl 使用 `ws://127.0.0.1:{port}/v1/streams/{streamId}`

#### 3. H264StreamClient.ts（Webview 端）
- 适配新的消息格式：新端点推送的是 `FrameData.data` 原始字节
- 如果 stream 推送的是 H264 格式，数据就是纯 NAL 单元（无 pts/dts/keyframe 头）
- 需要调整 `handleMessage` 方法，或者在 Rust 端保持旧的头格式

#### 4. streaming.rs（Rust 端，可选）
- 如果选择在 Rust 端适配，可以在 WebSocket 推送时添加 pts/dts/keyframe 头
- 这样 H264StreamClient 不需要改动
