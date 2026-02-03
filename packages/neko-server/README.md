# Neko Server

> 动力引擎：独立侧边进程，处理 FFmpeg 编解码与重度计算

## Context Summary

- **项目**：Neko Creator Suite - VS Code 全能内容创作工作站
- **角色**：Sidecar 进程，性能隔离的计算引擎
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Server** 是 Neko Creator Suite 的核心计算引擎，作为独立的 Sidecar 进程运行，通过 WebSocket/HTTP 与 VS Code 通讯。它承担了所有重度计算任务，彻底解决大文件读写与 FFmpeg 运行导致的编辑器卡顿问题。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **HTTP API** | RESTful API 服务，支持外部工具访问 |
| **WebSocket** | 实时双向通讯，状态同步 |
| **FFmpeg 编解码** | 视频/音频编解码、格式转换 |
| **帧缓存服务** | 视频帧提取与缓存 |
| **导出渲染** | 视频导出、批量渲染 |
| **Headless 模式** | 无界面执行工具操作 |

---

## 架构

```
VS Code Extension Host
        │
        ├─ WebSocket (ws://127.0.0.1:9528)
        │       │
        │       └─→ 实时状态同步、进度推送
        │
        └─ HTTP API (http://127.0.0.1:9527)
                │
                └─→ RESTful 接口、工具调用
                        │
                        ▼
                ┌─────────────────┐
                │   Neko Server   │
                │  (独立进程)      │
                ├─────────────────┤
                │ • FFmpeg 编解码  │
                │ • 帧缓存服务     │
                │ • 导出渲染      │
                │ • 媒体处理      │
                └─────────────────┘
```

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.server.ws.enabled` | `true` | 启用 WebSocket 服务 |
| `neko.server.ws.port` | `9528` | WebSocket 端口 |
| `neko.server.http.enabled` | `true` | 启用 HTTP API 服务 |
| `neko.server.http.port` | `9527` | HTTP API 端口 |
| `neko.server.http.host` | `127.0.0.1` | HTTP 绑定地址 |
| `neko.server.auth.enabled` | `false` | 启用 API 认证 |
| `neko.server.auth.token` | `""` | API 认证令牌 |
| `neko.server.headless.enabled` | `true` | 启用 Headless 模式 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Server: Start` | 启动服务器 |
| `Neko Server: Stop` | 停止服务器 |
| `Neko Server: Status` | 查看服务器状态 |
| `Neko Server: Open API Documentation` | 打开 API 文档 |

---

## 依赖关系

```
neko-server
    └── neko-cut (被依赖)
```

---

## 技术栈

- **运行时**：Node.js / Rust
- **通讯**：WebSocket (ws)
- **编解码**：FFmpeg
- **类型**：@uniedit/shared

---

## License

MIT
