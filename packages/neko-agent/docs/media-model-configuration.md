# 模型默认值配置指南

## 概述

Neko Agent 按模型 `type` 管理默认模型：`llm`、`image`、`video`、`audio`。音乐生成模型不再是顶层 `music` 类型，而是 `type = "audio"`，并通过 `capabilities = ["text_to_music"]` 表达用途。

当前 MVP 优先支持用户本地 TOML 配置的 NewAPI gateway / local LLM，以及 OAuth 登录后由 Neko 官方 account catalog 注入的运行时模型列表。官方直连、更多中转协议和本地生成模型运行时属于 Roadmap。

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
protocol_profile = "newapi"
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

## Agent Composer LLM 配置

Agent 输入框中的模式配置是会话级选择，不会自动写回 `~/.neko/config.toml`。用户在当前 tab 里选择 Agent LLM 模型、推理深度、回复详略、创造性和执行模式后，这些值只作用于当前发送的 Agent turn；只有用户显式修改配置文件或设置页时，才会改变 durable 默认值。

普通 Agent 对话当前使用 `primary` 模型槽位。Webview 发送的 Agent 配置会在 Extension 边界解析为明确的 `providerId + modelId`：优先使用 composer 的 `agentModels.primary`，其次使用旧 `chatModel`，再使用当前设置/default provider 的 LLM 默认值。若 `primary` 与 `chatModel` 指向不同模型、provider/model 不匹配、模型缺失、provider 未配置或模型不是启用的 LLM，Agent 会返回可见诊断，不会切到无关模型。

MVP 合同预留了 `fast`、`deep`、`summarizer`、`vision` 槽位，用于未来多模型编排；当前普通 Agent turn 只支持 `primary`。如果 payload 引用这些非 MVP 槽位，Extension 会返回 fail-visible 诊断，而不是静默忽略。

Agent presets 是创作意图，不是 provider 原始参数：

| Composer preset | 说明 | 运行时映射 |
|-----------------|------|------------|
| Reasoning `fast/balanced/deep` | 控制推理预算或 reasoning effort | 仅在模型/provider 声明支持 reasoning effort 或 thinking budget 时映射 |
| Verbosity `brief/standard/detailed` | 控制回复详略 | 仅在模型/provider 声明支持 verbosity 时映射 |
| Creativity `stable/creative/wild` | 控制采样倾向 | 映射到 `temperature` / `topP`，前提是模型支持采样参数 |

自定义 provider 如果缺少能力元数据，默认只开放保守通用能力，不假设支持 reasoning、verbosity、fast service tier 或 provider-specific thinking。要开启高级 LLM 控件，在 provider 或 model 的 `options.llmCapabilities` 中声明能力：

```toml
[[models]]
id = "custom-gpt-reasoning"
name = "gpt-reasoning"
provider_id = "custom-newapi"
type = "llm"
capabilities = ["chat", "streaming", "reasoning", "verbosity"]
enabled = true

[models.options.llmCapabilities]
reasoningEffortValues = ["low", "medium", "high"]
verbosity = true
temperature = false
topP = false
maxOutputTokens = true
fastTier = false
```

Anthropic thinking 与采样参数存在 provider 限制：启用 thinking budget 时不能同时发送 `temperature` / `topP`。这类组合会在 Extension/Platform 映射阶段被诊断，避免到 provider API 才失败。

后续非 MVP 工作包括：持久化 Agent preset 默认值；在 runtime 中真正使用 `fast`、`deep`、`summarizer`、`vision` 槽位进行分工；为 provider-specific options 增加 typed adapter 合同。

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
