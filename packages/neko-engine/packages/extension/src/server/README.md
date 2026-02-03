# server/

HTTP 服务器模块，提供外部 API 访问能力。

## 职责

提供 REST API 供外部工具（Python/Shell 脚本、MCP 客户端）访问。

## 结构

```
server/
├── index.ts              # 模块导出
├── http-server.ts        # HTTP 服务器
├── headless-webview.ts   # 无头 Webview 管理
└── external-api-server.ts # 外部 API 封装
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `Neko SuiteHttpServer` | 类 | HTTP 服务器 |
| `HeadlessWebviewManager` | 类 | 无头 Webview |
| `ExternalAPIServer` | 类 | 外部 API |
| `createExternalAPIServer()` | 函数 | 创建 API 服务器 |

## 依赖

```
→ editor/video/       # Webview 操作
→ tools/              # 时间线工具
← bootstrap/          # 服务启动
```

## API 端点

```
GET  /api/timeline          # 获取时间线信息
POST /api/element           # 添加元素
PUT  /api/element/:id       # 更新元素
DELETE /api/element/:id     # 删除元素
POST /api/export            # 导出视频
```

## 配置

```json
{
  "neko.server.http.enabled": true,
  "neko.server.http.port": 9527,
  "neko.server.http.host": "127.0.0.1"
}
```
