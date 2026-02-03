# bootstrap/

服务引导模块，负责扩展启动时的服务初始化。

## 职责

在扩展激活时初始化 Platform、MCP、工作流等核心服务。

## 结构

```
bootstrap/
├── index.ts              # 模块导出
├── serviceBootstrap.ts   # 服务引导主逻辑
├── platformFactory.ts    # Platform 实例创建
├── toolsBootstrap.ts     # 工具注册
├── mcpBootstrap.ts       # MCP 服务器连接
└── workflowBootstrap.ts  # 工作流引擎检查
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `bootstrapCoreServices()` | 函数 | 引导核心服务 |
| `createPlatformInstance()` | 函数 | 创建 Platform |
| `registerBuiltinTools()` | 函数 | 注册内置工具 |
| `connectMCPServers()` | 函数 | 连接 MCP 服务器 |
| `checkWorkflowEngines()` | 函数 | 检查工作流引擎 |
| `IPlatform` | 服务ID | Platform 服务 |
| `IToolRegistry` | 服务ID | 工具注册表 |
| `IMCPManager` | 服务ID | MCP 管理器 |

## 依赖

```
→ @neko/platform   # Platform 创建
→ base/               # 服务注册
← extension.ts        # 扩展入口调用
```

## 启动流程

```
1. createPlatformInstance()  → 创建 Platform
2. registerBuiltinTools()    → 注册工具
3. connectMCPServers()       → 连接 MCP
4. checkWorkflowEngines()    → 检查工作流
5. logServicesStatus()       → 输出状态
```
