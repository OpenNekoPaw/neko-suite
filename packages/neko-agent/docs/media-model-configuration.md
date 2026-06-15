# Media 模型配置指南

## 概述

从 v1.0 开始，Neko Agent 支持为不同类型的媒体生成任务配置默认模型。这允许你精确控制图片、视频、音频和音乐生成使用的模型。

## 配置位置

配置文件位置：
- **用户级配置**: `~/.neko/config.json`
- **工作区配置**: `.neko/config.json`

工作区配置会覆盖用户级配置。

## 配置格式

在 `config.json` 中添加 `defaultMediaModels` 字段：

```json
{
  "defaultModel": "gpt-4o",
  "defaultMediaModels": {
    "image": "dall-e-3",
    "video": "gen3a_turbo",
    "audio": "tts-1",
    "music": "chirp-v3-5"
  },
  "providers": [
    {
      "id": "openai",
      "type": "openai",
      "apiKey": "sk-...",
      "enabled": true
    },
    {
      "id": "runway",
      "type": "runway",
      "apiKey": "rw_...",
      "enabled": true
    }
  ],
  "models": [
    {
      "id": "gpt-4o",
      "providerId": "openai",
      "capabilities": ["chat", "vision"],
      "enabled": true
    },
    {
      "id": "dall-e-3",
      "providerId": "openai",
      "capabilities": ["text_to_image"],
      "enabled": true
    },
    {
      "id": "gen3a_turbo",
      "providerId": "runway",
      "capabilities": ["text_to_video", "image_to_video"],
      "enabled": true
    },
    {
      "id": "tts-1",
      "providerId": "openai",
      "capabilities": ["text_to_audio"],
      "enabled": true
    }
  ]
}
```

## 配置字段说明

### `defaultMediaModels`

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|
| `image` | string | 图片生成默认模型 ID | `"dall-e-3"`, `"stable-diffusion-xl"` |
| `video` | string | 视频生成默认模型 ID | `"gen3a_turbo"`, `"luma-ray"` |
| `audio` | string | 音频/TTS 生成默认模型 ID | `"tts-1"`, `"eleven_multilingual_v2"` |
| `music` | string | 音乐生成默认模型 ID | `"chirp-v3-5"`, `"musicgen-large"` |

所有字段都是可选的。如果未配置，系统会自动选择第一个可用的模型。

## 使用场景

### 场景 1: 成本优化

使用更便宜的模型作为默认选项：

```json
{
  "defaultMediaModels": {
    "image": "dall-e-2",        // 更便宜
    "video": "gen3a_turbo",     // 快速模式
    "audio": "tts-1"            // 标准质量
  }
}
```

### 场景 2: 质量优先

使用最高质量的模型：

```json
{
  "defaultMediaModels": {
    "image": "dall-e-3",        // 最高质量
    "video": "gen3a",           // 标准模式（更高质量）
    "audio": "tts-1-hd"         // HD 质量
  }
}
```

### 场景 3: 速度优先

使用最快的模型：

```json
{
  "defaultMediaModels": {
    "image": "stable-diffusion-turbo",
    "video": "gen3a_turbo",
    "audio": "tts-1"
  }
}
```

## 工作原理

当你使用 AI Generate Skill 的工具时（如 `GenerateImage`、`GenerateVideo`、`GenerateTTS`），系统会按以下优先级选择模型：

1. **显式指定 provider + model** - 如果工具调用中同时指定了 `providerId` 和 `modelId`，使用该组合（score: 100）
2. **显式指定 model** - 如果只指定了 `modelId`，系统会查找该模型对应的 provider（score: 80）
3. **配置的默认模型** - 使用 `defaultMediaModels` 中配置的模型（score: 90）
4. **无可用模型** - 如果以上都不满足，返回错误，要求用户配置默认模型

**重要**：与 chat 模型不同，media 模型**不会自动选择**。你必须在配置中明确指定 `defaultMediaModels`，或在工具调用时显式指定模型。这样设计是为了：
- 避免意外使用昂贵的模型
- 确保生成质量符合预期
- 让用户明确知道使用的是哪个模型

### 示例

```javascript
// 场景 1: 用户请求："生成一张猫的图片"
// LLM 调用 GenerateImage 工具（未指定 modelId）
// → 系统使用 defaultMediaModels.image 配置的模型（如 "dall-e-3"）

// 场景 2: 用户请求："用 stable-diffusion 生成一张猫的图片"
// LLM 调用 GenerateImage 工具（指定 modelId: "stable-diffusion-xl"）
// → 系统使用显式指定的模型，忽略默认配置

// 场景 3: 用户请求："生成一张猫的图片"，但未配置 defaultMediaModels.image
// LLM 调用 GenerateImage 工具（未指定 modelId）
// → 系统返回错误：需要配置 defaultMediaModels.image 或显式指定模型
```

## 常见模型 ID

### 图片生成
- OpenAI: `dall-e-2`, `dall-e-3`
- Stability AI: `stable-diffusion-xl`, `stable-diffusion-turbo`
- Midjourney: `midjourney-v6`

### 视频生成
- Runway: `gen3a_turbo`, `gen3a`, `gen2`
- Luma: `luma-ray`, `luma-photon`
- Pika: `pika-1.0`

### 音频生成
- OpenAI: `tts-1`, `tts-1-hd`
- ElevenLabs: `eleven_multilingual_v2`, `eleven_turbo_v2`

### 音乐生成
- Suno: `chirp-v3-5`, `chirp-v3`
- MusicGen: `musicgen-large`, `musicgen-medium`

## 验证配置

配置完成后，可以通过以下方式验证：

1. **CLI 模式**:
```bash
neko-agent --verbose "生成一张测试图片"
# 查看日志中使用的模型 ID
```

2. **检查配置**:
```bash
cat ~/.neko/config.json | grep -A 5 defaultMediaModels
```

## 故障排查

### 问题：配置的模型未生效

**可能原因**:
1. 模型 ID 拼写错误
2. 模型未在 `models` 数组中定义
3. 提供商未配置或未启用

**解决方法**:
- 检查 `models` 数组中是否存在该模型
- 确保对应的 provider 已配置且 `enabled: true`
- 注意：media 模型不需要 `enabled` 字段，只要在配置中定义即可使用

### 问题：提示需要配置默认模型

**错误信息**: `No default model configured for media type: image`

**解决方法**:
- 在配置文件中添加 `defaultMediaModels` 字段
- 或在工具调用时显式指定 `modelId`

示例配置：
```json
{
  "defaultMediaModels": {
    "image": "dall-e-3"
  }
}
```

## 最佳实践

1. **始终配置默认模型**: 在 `~/.neko/config.json` 中为常用的媒体类型配置默认模型，避免每次都需要显式指定
2. **分环境配置**: 开发环境使用快速/便宜的模型，生产环境使用高质量模型
3. **工作区覆盖**: 在项目的 `.neko/config.json` 中为特定项目配置专用模型
4. **定期更新**: 关注新模型发布，及时更新配置以使用更好的模型
5. **成本监控**: 记录不同模型的使用成本，优化配置
6. **明确性优于便利性**: 宁可要求用户配置默认模型，也不要自动选择可能不合适的模型

## 相关文档

- [neko-agent README](../README.md)
- [neko-agent 架构](../ARCHITECTURE.md)
