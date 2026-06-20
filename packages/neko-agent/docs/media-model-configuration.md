# 模型默认值配置指南

## 概述

Neko Agent 按模型 `type` 管理默认模型：`llm`、`image`、`video`、`audio`。音乐生成模型不再是顶层 `music` 类型，而是 `type = "audio"`，并通过 `capabilities = ["text_to_music"]` 表达用途。

当前 MVP 优先支持用户本地 TOML 配置的 NewAPI-compatible gateway / local LLM，以及 OAuth 登录后由 Neko 官方 account catalog 注入的运行时模型列表。官方直连、更多中转协议和本地生成模型运行时属于 Roadmap。

## 配置位置

- 用户级配置：`~/.neko/config.toml`
- 工作区配置：`.neko/config.toml`

用户配置的 AI provider/model 由用户级配置管理；工作区配置主要用于 MCP 等工作区资源。旧版 `~/.neko/config.json` 不再作为运行时输入。

## 配置格式

`default_models` 是默认模型唯一配置入口。每个类型默认值都显式写 `provider_id` 和 `model_id`，不要拼成 `provider:model` 字符串。

```toml
version = 1

[default_models.llm]
provider_id = "ollama-local"
model_id = "ollama-local-llama3.2"

[default_models.image]
provider_id = "neko-gateway"
model_id = "neko-gateway-gpt-image-2"

[default_models.video]
provider_id = "neko-gateway"
model_id = "neko-gateway-seedance-lite"

[default_models.audio]
provider_id = "neko-gateway"
model_id = "neko-gateway-tts"

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
id = "ollama-local-llama3.2"
name = "llama3.2"
provider_id = "ollama-local"
type = "llm"
capabilities = ["chat", "streaming"]
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
id = "neko-gateway-tts"
name = "tts-1"
provider_id = "neko-gateway"
type = "audio"
capabilities = ["text_to_audio"]
enabled = true

[[models]]
id = "neko-gateway-suno"
name = "suno-v4"
provider_id = "neko-gateway"
type = "audio"
capabilities = ["text_to_music"]
enabled = true
```

## 字段说明

### `default_models`

| 字段 | 类型 | 说明 |
|------|------|------|
| `llm` | `{ provider_id, model_id }` | 对话/Agent 默认 LLM |
| `image` | `{ provider_id, model_id }` | 图片生成默认模型 |
| `video` | `{ provider_id, model_id }` | 视频生成默认模型 |
| `audio` | `{ provider_id, model_id }` | 音频/TTS/音乐所属的默认音频模型 |

`provider_id` 必须指向 `[[providers]].id`；`model_id` 必须指向同一 provider 下的 `[[models]].id`。如果 provider 不存在、model 不存在、provider/model 不匹配、模型被禁用或模型 `type` 不匹配，Agent 会直接报配置错误，不会 fallback。

`default_provider` / `default_model` 是旧的 LLM 选择字段。新配置建议使用 `[default_models.llm]`；如果两者同时存在，运行时默认模型绑定优先使用 `[default_models.llm]`。

### `models[].type`

`type` 只做 UI 分组和粗路由，当前允许：

```text
llm | image | video | audio
```

不要配置 `type = "music"`。音乐模型写成 `type = "audio"`，并声明 `text_to_music` 能力。

### `models[].capabilities`

`capabilities` 是模型元数据，继续支持 `chat`、`function_calling`、`streaming`、`json_mode`、`code`、`vision`、`text_to_image`、`text_to_video`、`text_to_audio`、`text_to_music` 等字段。Neko 内部会把这些元数据映射到产品用途，例如 `text_to_music` 满足 `audio.music.generate`。

## 工作原理

生成工具选择模型时按以下优先级：

1. 显式指定 `providerId + modelId`：直接使用该组合。
2. 只指定 `modelId`：通过 `[[models]]` 找到对应 provider。
3. 未指定模型：使用 `[default_models.<type>]`。
4. 仍无法确定模型：返回错误，要求用户配置默认模型或显式指定模型。

媒体模型不会自动猜测默认值。这样可以避免误用昂贵模型，也能保证生成结果来自用户明确配置的 provider。

## 示例

成本优先：

```toml
[default_models.image]
provider_id = "neko-gateway"
model_id = "image-fast"

[default_models.video]
provider_id = "neko-gateway"
model_id = "video-fast"

[default_models.audio]
provider_id = "neko-gateway"
model_id = "tts-fast"
```

质量优先：

```toml
[default_models.image]
provider_id = "neko-gateway"
model_id = "gpt-image-2"

[default_models.video]
provider_id = "neko-gateway"
model_id = "video-quality"

[default_models.audio]
provider_id = "neko-gateway"
model_id = "tts-hd"
```

同名模型来自不同 provider：

```toml
[default_models.image]
provider_id = "openai-image"
model_id = "gpt-image-2"

[[models]]
id = "gpt-image-2"
name = "gpt-image-2"
provider_id = "openai-image"
type = "image"
capabilities = ["text_to_image"]

[[models]]
id = "gpt-image-2"
name = "gpt-image-2"
provider_id = "neko-gateway"
type = "image"
capabilities = ["text_to_image"]
```

当前 `[[models]].id` 仍按全局唯一校验，因此同名模型场景后续会继续收敛到 provider-scoped identity。现阶段建议用户给 `id` 加 provider 前缀，例如 `openai-image-gpt-image-2`。

## 验证配置

```bash
rg -n "default_models|provider_id|model_id" ~/.neko/config.toml
```

常见错误：

- `default_media_models`：旧字段，已不再作为配置输入。
- `type = "music"`：应改为 `type = "audio"` 加 `capabilities = ["text_to_music"]`。
- `provider_id` / `model_id` 拼写错误：会触发 fail-visible 配置诊断。

## 相关文档

- [neko-agent README](../README.md)
- [neko-agent 架构](../ARCHITECTURE.md)
