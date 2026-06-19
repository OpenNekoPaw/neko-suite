# Media 模型配置指南

## 概述

Neko Agent 支持为不同类型的媒体生成任务配置默认模型。这允许你精确控制图片、视频、音频和音乐生成使用的模型。

当前 MVP 优先支持两条路径：用户本地配置的 NewAPI-compatible gateway / local LLM，以及 OAuth 登录后由 Neko 官方 account catalog 注入的运行时 `neko-account-gateway`。用户配置的生成模型默认值可以指向 gateway 模型；OAuth 官方账号网关的生成模型是否出现取决于官方 catalog 返回的模型类型、能力和账号 entitlement。官方直连的生成模型供应商、更多中转协议和本地生成模型运行时属于 Roadmap 项；除非对应 provider 已有验证过的配置、adapter 和测试，不应把模型名称视为 Neko 已验证支持。

## 配置位置

配置文件位置：
- **用户级配置**: `~/.neko/config.toml`
- **工作区配置**: `.neko/config.toml`

用户配置的 Agent provider/model 由用户级配置管理；工作区配置主要用于 MCP 等工作区资源。媒体默认模型值必须是 `[[models]]` 中的 canonical `id`，不是供应商 API 的 model name 或展示名。OAuth 官方账号网关模型是运行时 snapshot，不会写入 `~/.neko/config.toml`；如果本地配置显式选择了错误的 AI provider/model，运行时会直接报错，不会 fallback 到账号网关。

旧版 `~/.neko/config.json` 不再作为默认运行时兜底。若你已有 JSON 配置，请执行 VS Code 命令 `NekoAgent: Migrate Agent Config to TOML` 或 CLI 命令 `nekoagent config migrate`；迁移成功后旧文件会重命名为 `config.json.bak`。

## 配置格式

在 `config.toml` 中添加 `default_media_models` 字段：

```toml
version = 1
default_provider = "ollama-local"
default_model = "ollama-local-llama3.2"

[default_media_models]
image = "neko-gateway-gpt-image-2"
video = "neko-gateway-seedance-lite"
audio = "neko-gateway-tts"
music = "neko-gateway-suno"

[[providers]]
id = "neko-gateway"
name = "neko-gateway"
display_name = "Neko Gateway"
type = "newapi"
connection_kind = "gateway"
protocol_profile = "newapi-compatible"
support_level = "verified"
api_url = "https://your-gateway.example/v1"
api_key = "sk-..."
enabled = true

[[providers]]
id = "ollama-local"
name = "ollama"
display_name = "Ollama Local"
type = "ollama"
connection_kind = "local"
protocol_profile = "ollama"
requires_api_key = false
api_url = "http://localhost:11434/api"
enabled = true

[[models]]
id = "neko-gateway-default-chat"
name = "auto"
provider_id = "neko-gateway"
type = "llm"
capabilities = ["chat", "function_calling", "streaming"]
enabled = true

[[models]]
id = "neko-gateway-gpt-image-2"
name = "gpt-image-2"
provider_id = "neko-gateway"
type = "image"
capabilities = ["text_to_image"]
enabled = true

[[models]]
id = "neko-gateway-seedance-lite"
name = "seedance-lite"
provider_id = "neko-gateway"
type = "video"
capabilities = ["text_to_video", "image_to_video"]
enabled = true

[[models]]
id = "ollama-local-llama3.2"
name = "llama3.2"
provider_id = "ollama-local"
type = "llm"
capabilities = ["chat"]
enabled = true

[[models]]
id = "neko-gateway-tts"
name = "tts-1"
provider_id = "neko-gateway"
type = "audio"
capabilities = ["text_to_audio"]
enabled = true
```

## 配置字段说明

### `default_media_models`

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|
| `image` | string | 图片生成默认模型 ID | `"neko-gateway-gpt-image-2"` |
| `video` | string | 视频生成默认模型 ID | `"neko-gateway-seedance-lite"` |
| `audio` | string | 音频/TTS 生成默认模型 ID | `"neko-gateway-tts"` |
| `music` | string | 音乐生成默认模型 ID | `"neko-gateway-suno"` |

所有字段都是可选的。如果未配置，媒体路由不会猜测自动模型，工具调用需要显式指定 provider/model。

## 使用场景

### 场景 1: 成本优化

使用更便宜的模型作为默认选项：

```toml
[default_media_models]
image = "neko-gateway-image-fast"
video = "neko-gateway-video-fast"
audio = "neko-gateway-tts"
```

### 场景 2: 质量优先

使用最高质量的模型：

```toml
[default_media_models]
image = "neko-gateway-gpt-image-2"
video = "neko-gateway-video-quality"
audio = "neko-gateway-tts-hd"
```

### 场景 3: 速度优先

使用最快的模型：

```toml
[default_media_models]
image = "neko-gateway-image-fast"
video = "neko-gateway-seedance-lite"
audio = "neko-gateway-tts"
```

## 工作原理

当你使用 AI Generate Skill 的工具时（如 `GenerateImage`、`GenerateVideo`、`GenerateTTS`），系统会按以下优先级选择模型：

1. **显式指定 provider + model** - 如果工具调用中同时指定了 `providerId` 和 `modelId`，使用该组合（score: 100）
2. **显式指定 model** - 如果只指定了 `modelId`，系统会查找该模型对应的 provider（score: 80）
3. **配置的默认模型** - 使用 `default_media_models` 中配置的模型（score: 90）
4. **无可用模型** - 如果以上都不满足，返回错误，要求用户配置默认模型

**重要**：与 chat 模型不同，media 模型**不会自动选择**。你必须在配置中明确指定 `default_media_models`，或在工具调用时显式指定模型。这样设计是为了：
- 避免意外使用昂贵的模型
- 确保生成质量符合预期
- 让用户明确知道使用的是哪个模型

### 示例

```javascript
// 场景 1: 用户请求："生成一张猫的图片"
// LLM 调用 GenerateImage 工具（未指定 modelId）
// → 系统使用 default_media_models.image 配置的模型（如 "neko-gateway-gpt-image-2"）

// 场景 2: 用户请求："用 stable-diffusion 生成一张猫的图片"
// LLM 调用 GenerateImage 工具（指定 modelId: "stable-diffusion-xl"）
// → 系统使用显式指定的模型，忽略默认配置

// 场景 3: 用户请求："生成一张猫的图片"，但未配置 default_media_models.image
// LLM 调用 GenerateImage 工具（未指定 modelId）
// → 系统返回错误：需要配置 default_media_models.image 或显式指定模型
```

## 常见模型方向

这些方向可通过 NewAPI-compatible gateway 或未来 direct provider 支持，但不代表当前 MVP 已逐项验证所有官方 API、套餐权限和参数差异。

- 图片：GPT image、Stable Diffusion、Midjourney 类模型
- 视频：Seedance、Kling、Runway、Luma、Vidu 类模型
- 音频/TTS：OpenAI-compatible speech、ElevenLabs 类模型
- 音乐：Suno、MusicGen 类模型

在配置中应使用你自己的 `[[models]].id`，例如 `neko-gateway-gpt-image-2`；`[[models]].name` 才是实际传给 gateway/API 的模型名。

## 验证配置

配置完成后，可以通过以下方式验证：

1. **CLI 模式**:
```bash
neko-agent --verbose "生成一张测试图片"
# 查看日志中使用的模型 ID
```

2. **检查配置**:
```bash
rg -n "default_media_models|neko-gateway-gpt-image-2" ~/.neko/config.toml
```

## 故障排查

### 问题：配置的模型未生效

**可能原因**:
1. 模型 ID 拼写错误
2. 模型未在 `[[models]]` 表中定义
3. 提供商未配置或未启用

**解决方法**:
- 检查 `[[models]]` 表中是否存在该模型
- 确保对应的 provider 已配置且 `enabled: true`
- 注意：media 模型不需要 `enabled` 字段，只要在配置中定义即可使用

### 问题：提示需要配置默认模型

**错误信息**: `No default model configured for media type: image`

**解决方法**:
- 在配置文件中添加 `default_media_models` 字段
- 或在工具调用时显式指定 `modelId`

示例配置：
```toml
[default_media_models]
image = "neko-gateway-gpt-image-2"
```

## 最佳实践

1. **始终配置默认模型**: 在 `~/.neko/config.toml` 中为常用的媒体类型配置默认模型，避免每次都需要显式指定
2. **分环境配置**: 开发环境使用快速/便宜的模型，生产环境使用高质量模型
3. **工作区覆盖**: 在项目的 `.neko/config.toml` 中为特定项目配置专用 MCP 等工作区资源；AI provider/model 默认由用户级配置管理
4. **定期更新**: 关注新模型发布，及时更新配置以使用更好的模型
5. **成本监控**: 记录不同模型的使用成本，优化配置
6. **明确性优于便利性**: 宁可要求用户配置默认模型，也不要自动选择可能不合适的模型

## 相关文档

- [neko-agent README](../README.md)
- [neko-agent 架构](../ARCHITECTURE.md)
