# Neko Suite - 1+N 插件架构

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Neko Suite (主包)                        │
│  • 元数据容器，不包含运行时代码                                        │
│  • extensionPack: 安装时自动安装所有基础包                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌───────────┐   ┌───────────┐   ┌───────────┐
             │  NekoCut  │   │NekoCanvas │   │NekoAgent  │
             │  (基础包)  │   │  (基础包)  │   │  (基础包)  │
             │ 视频编辑器 │   │画布+素材库 │   │   Agent   │
             └─────┬─────┘   └───────────┘   └───────────┘
                   │
                   │ 按需触发安装
                   ▼
             ┌───────────┐
             │NekoCutPro │
             │  (增强包)  │
             │ WS Server │
             └───────────┘
```

## 包结构

```
packages/
├── neko-suite/      # 主包（元数据容器）
│   ├── package.json          # extensionPack 声明
│   └── README.md
│
├── nekocut/                  # 基础包：视频编辑器
│   ├── package.json
│   ├── l10n/                 # 国际化
│   └── src/
│       ├── extension.ts      # 入口，导出 NekoCutAPI
│       ├── api.ts            # API 类型定义
│       ├── base/             # DI 容器
│       ├── editor/           # 视频编辑器 Provider
│       ├── views/            # 属性面板、项目大纲
│       └── commands/         # 命令注册
│
├── nekocanvas/               # 基础包：画布 + 素材库
│   ├── package.json
│   ├── l10n/
│   └── src/
│       ├── extension.ts      # 入口，导出 NekoCanvasAPI
│       ├── api.ts            # API 类型定义
│       ├── editor/           # Canvas 编辑器 Provider
│       └── views/            # 素材库
│
├── nekoagent/                # 基础包：AI Agent
│   ├── package.json
│   ├── l10n/
│   └── src/
│       ├── extension.ts      # 入口，导出 NekoAgentAPI
│       ├── api.ts            # API 类型定义
│       ├── views/            # AI 助手面板
│       ├── services/         # 工具注册表
│       └── tools/            # NekoCut/NekoCanvas 工具集成
│
└── nekocut-pro/              # 增强包：WebSocket Server
    ├── package.json          # extensionDependencies: nekocut
    ├── l10n/
    └── src/
        ├── extension.ts      # 入口
        ├── server/           # WS/HTTP 服务器
        └── api/              # REST API 路由
```

## 依赖关系

```
neko-suite
    │
    └── extensionPack ──┬── nekocut
                        ├── nekocanvas
                        └── nekoagent
                                │
                                ├── 可选依赖 → nekocut (工具集成)
                                └── 可选依赖 → nekocanvas (工具集成)

nekocut-pro
    │
    └── extensionDependencies → nekocut (必需)
```

## API 导出

### NekoCutAPI

```typescript
interface NekoCutAPI {
  timeline: {
    getInfo(): Promise<TimelineInfo | null>;
    addElement(config: ElementConfig): Promise<string>;
    updateElement(id: string, updates: Partial<ElementConfig>): Promise<void>;
    deleteElement(id: string): Promise<void>;
    listElements(): Promise<ElementConfig[]>;
  };
  events: {
    onDidChangeTimeline: Event<TimelineChangeEvent>;
    onDidSelectElement: Event<ElementSelectedEvent>;
    onDidChangePlayback: Event<PlaybackChangeEvent>;
  };
  hasProFeatures(): boolean;
  promptProInstall(feature: string): Promise<boolean>;
}
```

### NekoCanvasAPI

```typescript
interface NekoCanvasAPI {
  asset: {
    import(path: string): Promise<Asset>;
    list(filter?: AssetFilter): Promise<Asset[]>;
    getById(id: string): Promise<Asset | undefined>;
    delete(id: string): Promise<void>;
    update(id: string, updates: Partial<Asset>): Promise<void>;
  };
  canvas: {
    create(config: CanvasConfig): Promise<string>;
    addShape(canvasId: string, shape: ShapeConfig): Promise<string>;
    updateShape(canvasId: string, shapeId: string, updates: Partial<ShapeConfig>): Promise<void>;
    deleteShape(canvasId: string, shapeId: string): Promise<void>;
  };
  events: {
    onDidChangeAssets: Event<AssetChangeEvent>;
    onDidChangeCanvas: Event<CanvasChangeEvent>;
  };
}
```

### NekoAgentAPI

```typescript
interface NekoAgentAPI {
  chat(message: string, options?: ChatOptions): Promise<string>;
  chatStream(message: string, options?: ChatOptions): AsyncIterable<...>;
  registerTool(tool: Tool): void;
  unregisterTool(name: string): void;
  getTools(): Tool[];
  events: {
    onDidReceiveMessage: Event<AgentMessage>;
    onDidCallTool: Event<{ name: string; args: Record<string, unknown> }>;
  };
  mcp: {
    connect(config: MCPServerConfig): Promise<void>;
    disconnect(name: string): Promise<void>;
    listServers(): MCPServerConfig[];
  };
}
```

## 跨扩展通信

```typescript
// NekoAgent 获取 NekoCut API
const nekocutExt = vscode.extensions.getExtension<NekoCutAPI>('neko.nekocut');
if (nekocutExt) {
  const api = nekocutExt.isActive ? nekocutExt.exports : await nekocutExt.activate();
  const info = await api.timeline.getInfo();
}
```

## 构建命令

```bash
# 构建所有 Neko 包
npm run build:neko

# 单独构建
npm run build:nekocut
npm run build:nekocanvas
npm run build:nekoagent
npm run build:nekocut-pro

# 开发模式
npm run dev:neko
```

## 用户安装场景

| 场景 | 安装方式 | 结果 |
|------|----------|------|
| 完整套件 | 安装 `Neko Suite` | 自动安装 NekoCut + NekoCanvas + NekoAgent |
| 仅视频编辑 | 安装 `NekoCut` | 仅视频编辑功能 |
| 仅画布设计 | 安装 `NekoCanvas` | 仅画布 + 素材库 |
| 仅 AI 助手 | 安装 `NekoAgent` | 仅 AI 功能 |
| 高级功能 | 使用时提示安装 `NekoCutPro` | 按需安装 |
