# SettingsView/

> 设置视图组件，管理 AI Provider、Model、MCP 等配置

## Quick Reference

| 组件 | 职责 |
|------|------|
| `ProviderSettings` | 添加/编辑/删除 AI Provider（Claude, OpenAI 等）|
| `ModelSettings` | 配置模型参数（temperature, maxTokens）|
| `PromptSettings` | 管理系统提示词预设 |
| `MCPSettings` | 配置 MCP 服务器连接 |

**结构**：
```
SettingsView/
├── index.tsx              # 主组件（Tab 容器）
├── ProviderSettings.tsx   # Provider 配置
├── ModelSettings.tsx      # Model 配置
├── PromptSettings.tsx     # 提示词配置
└── MCPSettings.tsx        # MCP 服务器配置
```

## 数据流

```
SettingsView
    ↓ onChange
AIAssistant.handleUpdateProviders()
    ↓
VSCodeMessages.updateProvider()
    ↓ postMessage
Extension Host
    ↓
Platform.config.updateProvider()
    ↓
配置文件
```

## 关键 Props

```typescript
interface SettingsViewProps {
  settings: Settings;
  models: ModelPreset[];
  onAddProvider: (provider: ProviderConfig) => void;
  onRemoveProvider: (providerId: string) => void;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
  onUpdateMCPServers: (servers: MCPServer[]) => void;
  onTestMCPServer: (server: MCPServer) => Promise<TestResult>;
}

interface Settings {
  configuredProviders: ConfiguredProvider[];
  configuredModels: ModelConfig[];
  configuredPrompts: PromptPresetConfig[];
  configuredMCPServers: ConfiguredMCPServer[];
  executionMode: 'auto' | 'ask' | 'plan';
}
```

## UI 特点

- Tab 页切换不同配置类别
- 卡片式列表展示已配置项
- 模态框编辑详细配置
- 连接测试按钮（MCP）
- 即时保存到 Extension Host
