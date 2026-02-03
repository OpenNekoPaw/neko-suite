# services/

业务服务模块，提供扩展级别的业务服务。

## 职责

提供配置存储、连接状态管理等扩展级服务。

## 结构

```
services/
├── connectionStateManager.ts  # 连接状态管理
├── vscodeConfigStorage.ts     # VSCode 配置存储
├── vscodeTaskStorage.ts       # VSCode 任务存储
├── configBridge.ts            # 配置桥接
└── genericConfigService.ts    # 通用配置服务
```

## 接口

| 文件 | 主要导出 | 用途 |
|------|----------|------|
| `connectionStateManager.ts` | `ConnectionStateManager` | MCP/工作流连接状态 |
| `vscodeConfigStorage.ts` | `VSCodeConfigStorage` | 配置持久化 |
| `vscodeTaskStorage.ts` | `VSCodeTaskStorage` | 任务持久化 |
| `configBridge.ts` | `ConfigBridge` | 配置同步 |

## 依赖

```
→ @uniedit/platform   # Platform 类型
→ base/               # 服务容器
← bootstrap/          # 服务初始化
← chat/               # 状态查询
```

## 存储位置

```
VSCodeConfigStorage:
  → context.globalState (用户级)
  → context.workspaceState (工作区级)

VSCodeTaskStorage:
  → context.globalState (持久化任务)
```
