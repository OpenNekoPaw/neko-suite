# ADR: 统一 NativeEngine 架构

> 日期：2026-03-02
> 状态：✅ Phase 2 全部完成（neko-tools + neko-preview + neko-cut 已迁移）
> 关联：docs/adr-media-diff-parallelism.md, docs/engine.md

## 决策

**仅保留一个 NativeEngine 进程，统一处理 IPC/WebSocket/Stream/HTTP 接口。**

所有消费者（neko-tools、neko-preview、neko-cut）通过统一的 Frame Server HTTP/WS 接口通信，不再各自创建独立的 NativeEngine 实例和 HTTP 服务器。

## 背景

### 当前架构（多实例模型）

```
VSCode Extension Host (单进程)
├─ neko-engine Extension
│  ├─ NativeEngine (NAPI)
│  ├─ Frame Server [HTTP/WS on port A]
│  └─ Commands: ensureFrameServer, dispatch, diff, probe
│
├─ neko-preview Extension
│  ├─ NativeEngine (NAPI)          ← 独立实例
│  ├─ Frame Server [HTTP/WS on port B]  ← 独立 HTTP 服务器
│  └─ PreviewService (内部调用)
│
├─ neko-cut Extension
│  ├─ NativeEngine (NAPI)          ← 独立实例
│  ├─ FrameServerService [HTTP/WS on port C]  ← 独立 HTTP 服务器
│  └─ MediaService (内部调用)
│
└─ neko-tools Extension
   ├─ EngineMediaService (VSCode commands → neko-engine)
   └─ MediaDiffMessageHandler (通过 port A 的 WS 流播放)
```

### 问题

1. **三个独立 HTTP 服务器**：虽然 Rust 层 EngineApi 是单例（`OnceCell`），但每个包的 `NativeEngine` 各自启动 Frame Server，占用 3 个端口
2. **通信方式不统一**：neko-tools 用 VSCode commands，neko-preview/neko-cut 用 NAPI 直调，维护成本高
3. **端口发现重复**：每个包独立管理端口缓存，neko-tools 需通过 command 间接获取
4. **代码重复**：三个包各自实现 dispatch、流管理、probe 等逻辑

## 目标架构（单实例模型）

```
VSCode Extension Host (单进程)
├─ neko-engine Extension          ← 唯一的 NativeEngine 持有者
│  ├─ NativeEngine (NAPI)
│  ├─ Frame Server [HTTP/WS on port P]  ← 唯一 HTTP 服务器
│  └─ Command: neko.engine.getPort → port P
│
├─ @neko/neko-client              ← EngineClient 在此包（已实现）
│  ├─ EngineClient class
│  │  ├─ dispatch(req) → POST /v1/dispatch
│  │  ├─ probe(group, path) → dispatch 封装
│  │  ├─ waveform(path, opts) → dispatch 封装
│  │  ├─ diff(group, pathA, pathB) → dispatch 封装
│  │  └─ createStream(group, path) → WS /v1/streams/:id
│  └─ 零 vscode 依赖，constructor(port: number)
│
├─ neko-tools Extension
│  └─ 使用 @neko/neko-client EngineClient（✅ 已迁移）
│
├─ neko-preview Extension
│  └─ 使用 @neko/neko-client EngineClient（✅ 已迁移）
│
└─ neko-cut Extension
   └─ 使用 @neko/neko-client EngineClient（✅ 已迁移）
```

### 通信协议

所有消费者统一使用 Frame Server 的 HTTP/WS 接口：

| 操作类型 | 协议 | 端点 |
|---------|------|------|
| 同步命令 (probe, diff, waveform) | HTTP POST | `http://127.0.0.1:PORT/v1/dispatch` |
| 流式传输 (video/audio stream) | WebSocket | `ws://127.0.0.1:PORT/v1/streams/:streamId` |
| 健康检查 | HTTP GET | `http://127.0.0.1:PORT/health` |

### 端口发现

```
neko-engine 启动 → startFrameServer(0) → 获得 port P
                 → vscode.commands('neko.engine.getPort') 暴露 port

消费者激活 → executeCommand('neko.engine.getPort') → 获得 port P
          → createEngineClient(port P) → 可用
```

## EngineClient 设计

### 位置（已实现）

```
packages/
├─ neko-client/                   # EngineClient 在此包
│  └─ src/
│     ├─ EngineClient.ts          # HTTP/WS 客户端（public readonly port）
│     ├─ engine/
│     │  ├─ types.ts              # ActionRequest/ActionResponse/ProbeResult/WaveformResult/StreamHandle
│     │  ├─ responseTransform.ts  # Rust tagged enum → 扁平 TS 类型
│     │  └─ index.ts              # barrel exports
│     └─ index.ts                 # 追加导出
```

### 接口设计

```typescript
interface IEngineClient {
  // Generic dispatch
  dispatch(req: ActionRequest): Promise<ActionResponse>;

  // Convenience methods
  probe(group: 'videos' | 'audios', path: string): Promise<MediaInfo>;
  waveform(path: string, opts?: WaveformOptions): Promise<WaveformData>;
  diff(group: 'videos' | 'audios', pathA: string, pathB: string): Promise<DiffResult>;

  // Streaming
  createStream(group: 'videos' | 'audios', path: string, opts?: StreamOptions): Promise<StreamHandle>;

  // Lifecycle
  dispose(): void;
}
```

## 迁移路径

### Step 1：创建 EngineClient — ✅ 已完成

- `EngineClient` 在 `@neko/neko-client` 包中实现
- 零 vscode 依赖，`constructor(port: number)`，可在 Extension Host 和 Webview 中使用
- 便捷方法：`probe()`, `waveform()`, `diff()`, `extractFrame()`, `createStream()`, `controlStream()`
- 响应转换：Rust tagged enum → 扁平 TS 类型（`responseTransform.ts`）

### Step 2：neko-engine 暴露端口发现

- 新增 `neko.engine.getPort` command（如不存在）
- Frame Server 自动启动（首次 getPort 时 lazy 启动）

### Step 3：neko-tools 迁移 — ✅ 已完成

- `EngineMediaService` 内部改用 `EngineClient.dispatch()` 替代 VSCode commands（lazy init 模式）
- `MediaDiffMessageHandler` 全部 streaming/frame extraction 方法迁移到 `EngineClient`
- 音频并行 waveform 调度已实现（`startEarlyWaveform()`）
- 播放流创建改用 `EngineClient.createStream()` + `controlStream()`

### Step 4：neko-preview 迁移 — ✅ 已完成

- `PreviewService` 移除本地 NativeEngine 实例，改用 `EngineClient`
- 通过 `EngineClient.dispatch()` 执行 probe/waveform/stream 操作
- 流播放 WS URL 从 `client.port` 获取
- 移除 `@neko-engine/native-napi` 依赖，添加 `@neko/neko-client`

### Step 5：neko-cut 迁移 — ✅ 已完成

- 创建 `EngineConnection` 轻量级连接管理器（替代 `FrameServerService`）
- `MediaService` / `ExportService` / `ProxyService` 改用 `EngineClient.dispatch()`
- `VideoEditorProvider` 使用共享 `EngineConnection`（所有文档共用一个 client）
- 移除 `FrameServerService.ts` 和 `@neko-engine/native-napi` 依赖
- Timeline 渲染保持 dispatch 协议不变（仅改传输层）

### Step 6：清理 — ✅ 已完成

- 所有消费者已迁移到 `@neko/neko-client` EngineClient
- 仅 neko-engine 依赖 `@neko-engine/native-napi`
- 统一通信协议：HTTP POST `/v1/dispatch` + WebSocket `/v1/streams/:id`

## 收益

| 维度 | 改进 |
|------|------|
| 端口占用 | 3 → 1 |
| 通信方式 | 3 种（command / NAPI / HTTP）→ 1 种（HTTP/WS） |
| 客户端代码 | 各包独立实现 → 共享 `@neko/neko-client` EngineClient |
| 调试 | 只需监控一个端口的流量 |
| 内存 | 少 2 个 HTTP 服务器实例 |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| neko-engine 未激活时其他包无法工作 | `getPort` 触发 lazy 激活 + 重试机制 |
| 单点故障（Frame Server 崩溃） | Engine 内部 panic recovery + 客户端自动重连 |
| HTTP 开销 vs NAPI 直调 | 本机 HTTP localhost 延迟 <1ms，可接受 |
| 迁移期间两种方式并存 | 逐包迁移，旧接口标记 @deprecated |

## 与 Phase 2 并行优化的关系

EngineClient 已实现，neko-tools 已迁移。音频并行调度（waveform || diff）已在 `MediaDiffMessageHandler.startEarlyWaveform()` 中实现：

```typescript
// 实际代码：initializeDiff() 中音频 diff 并行调度
if (mediaType === 'audio' && this.engineClient) {
  // 波形提取 ~500ms，与 diffService.analyze() (5-30s) 并行执行
  this.startEarlyWaveform(this.engineClient, currentPath, previousPath);
}

// diffService.analyze() 继续执行 audios:diff (5-30s)
const result = await this.diffService.analyze(...);
// 波形早已送达 webview，此处发送最终结果和权威波形
```

待实施的并行优化：
- 视频 probe 提前发送（需 webview `mediaDiff:probeResult` 消息处理）
- SSIM || PSNR 并行（需 Rust 侧改动，预计分析时间减少 30-50%）
