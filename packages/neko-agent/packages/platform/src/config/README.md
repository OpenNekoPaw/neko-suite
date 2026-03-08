# config/

三层配置管理模块，支持内置预设、用户配置和工作区配置。

## 架构

```
内置预设 (presets/*.json)
    ↓ 覆盖
用户配置 (~/.neko/config.json)   ← FileUserConfigManager
    ↓ 覆盖（仅 MCP/Workflow/Prompt/taskDefaults）
工作区配置 (.neko/config.json)   ← WorkspaceConfig
    ↓
ConfigManager（三层合并，含 ConfigSection 分区）
```

**提供商/模型**仅支持用户级配置（不支持工作区覆盖），工作区配置仅覆盖 MCP、Workflow、Prompt 和 `taskDefaults`。

## 结构

```
config/
├── index.ts                  # 模块导出
├── config-manager.ts         # 配置管理器（三层合并）
├── base-config-section.ts    # 配置分区基类
├── config-section-impls.ts   # 5 个分区实现
├── chat-model-service.ts     # ChatModelOption 生成
├── config-export-service.ts  # 导入/导出服务
├── builtin-presets.ts        # 内置预设加载
├── user-config.ts            # 用户配置（FileUserConfigManager）
├── workspace-config.ts       # 工作区配置
└── presets/                  # 预设配置文件
    ├── en/                   # 英文预设
    └── zh-cn/                # 中文预设
```

## 核心接口

### ConfigManager

```typescript
class ConfigManager {
  constructor(options: ConfigManagerOptions);

  // 读取
  getConfig(): MergedConfig;
  getProvider(id: string): Provider | undefined;
  getProviders(): Provider[];
  getEnabledProviders(): Provider[];
  getModels(): Model[];
  getChatModelOptions(): ChatModelOption[];
  getEnabledMCPServers(): MCPServerPreset[];
  getTaskDefaults(): TaskDefaults | undefined;

  // 写入（持久化到 ~/.neko/config.json）
  setProviderApiKey(providerId: string, apiKey: string): Promise<void>;
  setProvider(provider: Provider): Promise<void>;
  setModel(model: Model): Promise<void>;
  setMCPServer(server: MCPServerPreset): Promise<void>;

  // 变化监听
  onChange(listener: ConfigChangeListener): () => void;
  dispose(): void;
}

interface ConfigManagerOptions {
  userConfigManager?: IUserConfigManager;  // 默认为 null（只读内置）
  workspacePath?: string;                  // .neko/config.json 所在目录
  locale?: string;                         // 'en' | 'zh-cn'
}
```

### FileUserConfigManager

唯一的用户配置后端，读写 `~/.neko/config.json`，与 CLI 共享：

```typescript
const manager = new FileUserConfigManager();
manager.onChange(config => { /* 文件变化时回调 */ });
manager.dispose(); // 停止文件监听
```

### WorkspaceConfig

工作区级别的配置覆盖（providers/models 字段已移除，仅保留以下字段）：

```typescript
interface WorkspaceConfig {
  mcpServers?: MCPServerPreset[];
  workflows?: WorkflowPreset[];
  prompts?: PromptPreset[];
  mcpServerOverrides?: Record<string, Partial<MCPServerPreset>>;
  workflowOverrides?: Record<string, Partial<WorkflowPreset>>;
  promptOverrides?: Record<string, Partial<PromptPreset>>;
  taskDefaults?: TaskDefaults;
}
```

## 导出

| 导出 | 类型 | 用途 |
|------|------|------|
| `ConfigManager` | 类 | 三层配置管理 |
| `FileUserConfigManager` | 类 | 用户配置（文件后端） |
| `type IUserConfigManager` | 接口 | 用户配置管理器接口 |
| `type UserConfig` | 类型 | 用户配置结构 |
| `loadBuiltinPresets()` | 函数 | 加载内置预设 |
| `loadWorkspaceConfig()` | 函数 | 加载工作区配置 |
| `watchWorkspaceConfig()` | 函数 | 监听工作区配置变化 |
| `type WorkspaceConfig` | 类型 | 工作区配置结构 |
| `type ConfigExportData` | 类型 | 导出数据格式 |

## 依赖

```
→ types/config    # MCPServerPreset, WorkflowPreset, PromptPreset 等类型
→ @neko/shared    # UnifiedConfig, TaskDefaults, config-reader
← service/        # ModelSelector 读取 taskDefaults
← index.ts        # 平台入口 createPlatform()
```

## 配置分区覆盖范围

| 分区 | 内置 | 用户级 | 工作区级 |
|------|------|--------|----------|
| providers | ✅ | ✅ | ❌ |
| models | ✅ | ✅ | ❌ |
| mcpServers | ✅ | ✅ | ✅ |
| workflows | ✅ | ✅ | ✅ |
| prompts | ✅ | ✅ | ✅ |
| taskDefaults | ❌ | ✅ | ✅（优先） |

## 设计模式

- **分区模式**：BaseConfigSection 封装各类型 CRUD + 三层合并
- **策略模式**：IUserConfigManager 接口，可替换实现（测试用 mock）
- **观察者模式**：onChange 监听配置变化
