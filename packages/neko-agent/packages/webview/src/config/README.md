# config/

> 预设配置模块，提供 Prompt、MCP、UI 元数据等预设

## Quick Reference

| 文件 | 说明 |
|------|------|
| `ui-metadata.ts` | Provider UI 元数据（图标、分类、认证字段）|
| `prompts.ts` | 系统提示词预设 |
| `mcp-servers.ts` | MCP 服务器预设 |

## 分层架构

Provider 配置采用分层设计：

```
Platform 层（业务数据）       Assistant 层（UI 数据）
├─ providers.json             ├─ ui-metadata.ts
│  ├─ id, name, displayName   │  ├─ icon
│  ├─ type (adapter type)     │  ├─ category (chat/media)
│  ├─ apiUrl                  │  ├─ noKey
│  └─ builtin, enabled        │  └─ authFields
```

**数据流**：
```
Platform providers.json → Extension Host → configuredProviders prop → ProviderSettings
                                                    ↓
                                          ui-metadata.ts (UI 渲染)
```

## UI Metadata 使用

```typescript
import {
  getProviderUIMetadata,
  getProviderIcon,
  getProviderCategory,
  isNoKeyProvider,
  getProviderAuthFields,
} from '@/config/ui-metadata';

// 获取完整 UI 元数据
const metadata = getProviderUIMetadata('anthropic');
// { icon: '🟠', category: 'chat' }

// 单独获取
const icon = getProviderIcon('openai');     // '🟢'
const category = getProviderCategory('kling'); // 'media'
const noKey = isNoKeyProvider('ollama');    // true

// 获取自定义认证字段
const authFields = getProviderAuthFields('azure');
// [{ key: 'apiKey', ... }, { key: 'resourceName', ... }]
```

## Provider 分类

**Chat Providers** (category: 'chat')
- OpenAI, Anthropic, Google, Azure
- DeepSeek, Kimi, GLM, Qwen
- Ollama, LM Studio, Generic

**Media Providers** (category: 'media')
- Image: Midjourney, LiblibAI
- Video: Kling, Vidu, Runway, Luma, MiniMax
- Audio: Suno

## 自定义认证字段

部分 Provider 需要多个认证字段：

| Provider | 认证字段 |
|----------|----------|
| Azure | apiKey, resourceName, deploymentId |
| Kling | accessKey, secretKey |
| LiblibAI | apiKey, secretKey |
| MiniMax | apiKey, groupId |
| Midjourney | apiKey, proxyUrl |
