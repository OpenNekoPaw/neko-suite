# ADR: 统一 NativeEngine 架构

> 日期：2026-03-02
> 状态：✅ 已完成（全部 6 个 Step 完成）
> 关联：docs/diff.md, docs/engine.md

## 决策

**仅保留一个 NativeEngine 进程，统一处理 IPC/WebSocket/Stream/HTTP 接口。**

所有消费者（neko-tools、neko-preview、neko-cut）通过统一的 Frame Server HTTP/WS 接口通信，不再各自创建独立的 NativeEngine 实例和 HTTP 服务器。

## 目标架构

```
VSCode Extension Host (单进程)
├─ neko-engine Extension          ← 唯一的 NativeEngine 持有者
│  ├─ NativeEngine (NAPI)
│  ├─ Frame Server [HTTP/WS on port P]  ← 唯一 HTTP 服务器
│  └─ Command: neko.engine.getPort → port P
│
├─ @neko/neko-client              ← EngineClient 在此包
│  ├─ EngineClient class (零 vscode 依赖, constructor(port))
│  │  ├─ dispatch(req) → POST /v1/dispatch
│  │  ├─ probe/waveform/diff/extractFrame → dispatch 封装
│  │  └─ createStream/controlStream → WS /v1/streams/:id
│  └─ engine/responseTransform.ts — Rust tagged enum → 扁平 TS 类型
│
├─ neko-tools Extension     → EngineClient ✅
├─ neko-preview Extension   → EngineClient ✅
└─ neko-cut Extension       → EngineClient ✅
```

## 通信协议

| 操作类型 | 协议 | 端点 |
|---------|------|------|
| 同步命令 (probe, diff, waveform) | HTTP POST | `/v1/dispatch` |
| 流式传输 (video/audio stream) | WebSocket | `/v1/streams/:streamId` |
| 健康检查 | HTTP GET | `/health` |

## 收益

| 维度 | 改进 |
|------|------|
| 端口占用 | 3 → 1 |
| 通信方式 | 3 种（command / NAPI / HTTP）→ 1 种（HTTP/WS） |
| 客户端代码 | 各包独立实现 → 共享 `@neko/neko-client` EngineClient |

## 待实施的并行优化

- 视频 probe 提前发送（需 webview `mediaDiff:probeResult` 消息处理）
- SSIM || PSNR 并行（已在 Phase 2 实施，分析时间减少 30-50%）
