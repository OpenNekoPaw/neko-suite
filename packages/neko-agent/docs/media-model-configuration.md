# 模型默认值配置指南

## 概述

Neko Agent 按模型 `type` 管理默认模型：`llm`、`image`、`video`、`audio`。音乐生成模型不再是顶层 `music` 类型，而是 `type = "audio"`，并通过 `capabilities = ["text_to_music"]` 表达用途。

当前 MVP 优先支持用户本地 TOML 配置的 NewAPI gateway / local LLM，以及 OAuth 登录后由 Neko 官方 account catalog 注入的运行时模型列表。官方 direct provider 可以通过显式 `type` / `protocol_profile` 配置；Neko 不会根据模型名或 provider 名把 direct 请求转换到 gateway。本地生成模型运行时和更多中转协议属于 Roadmap。

Provider 的 `protocol_profile` 是该 endpoint 的默认请求标准。模型默认继承 provider 的请求标准；只有同一个 gateway 下确实暴露了不同 wire protocol 的模型时，才在 `[[models]]` 上显式写 `protocol_profile` 覆盖。Neko 不会根据 `gpt`、`claude`、`gemini`、`deepseek` 等模型名猜测协议，也不会在 `direct`、`gateway`、`local` 之间自动转换。

## 配置位置

- 用户级配置：`~/.neko/config.toml`
- 工作区配置：`.neko/config.toml`

用户配置的 AI provider/model 由用户级配置管理；工作区配置主要用于 MCP 等工作区资源。旧版 `~/.neko/config.json` 不再作为运行时输入。

## 配置格式

`default_models` 是类型默认模型入口。每个类型默认值都显式写 `provider_id` 和 `model_id`，不要拼成 `provider:model` 字符串。语义用途更细的模型选择使用 `default_model_purposes`，例如 Gemini 原生图片、音频、视频理解。

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

[default_model_purposes.image_understand]
provider_id = "google"
model_id = "google-gemini-2.5-flash"

[default_model_purposes.audio_understand]
provider_id = "google"
model_id = "google-gemini-2.5-flash"

[default_model_purposes.video_understand]
provider_id = "google"
model_id = "google-gemini-2.5-flash"

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

[[providers]]
id = "google"
name = "google"
display_name = "Google Gemini"
type = "google"
connection_kind = "direct"
protocol_profile = "google"
support_level = "verified"
api_url = "https://generativelanguage.googleapis.com/v1beta"
api_key = "..."
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

[[models]]
id = "google-gemini-2.5-flash"
name = "gemini-2.5-flash"
provider_id = "google"
type = "llm"
capabilities = ["chat", "vision", "image.understand", "audio.understand", "video.understand", "function_calling", "streaming", "json_mode"]
enabled = true
```

## 字段说明

### `default_models`

| 字段    | 类型                        | 说明                            |
| ------- | --------------------------- | ------------------------------- |
| `llm`   | `{ provider_id, model_id }` | 对话/Agent 默认 LLM             |
| `image` | `{ provider_id, model_id }` | 图片生成默认模型                |
| `video` | `{ provider_id, model_id }` | 视频生成默认模型                |
| `audio` | `{ provider_id, model_id }` | 音频/TTS/音乐所属的默认音频模型 |

`provider_id` 必须指向 `[[providers]].id`；`model_id` 必须指向同一 provider 下的 `[[models]].id`。如果 provider 不存在、model 不存在、provider/model 不匹配、模型被禁用或模型 `type` 不匹配，Agent 会直接报配置错误，不会 fallback。

`default_provider` / `default_model` 是旧的 LLM 选择字段。新配置建议使用 `[default_models.llm]`；如果两者同时存在，运行时默认模型绑定优先使用 `[default_models.llm]`。

### `default_model_purposes`

`default_model_purposes` 用于按产品用途绑定模型。TOML key 使用下划线形式，运行时会映射到点号 purpose，例如 `[default_model_purposes.video_understand]` 对应 `video.understand`。

`image.understand` 表示原生图片/静帧分析模型，适合审美、构图、影视化画面感、图片质量等理解任务。

`audio.understand` 表示原生音频分析模型，适合对白转写、可懂度、噪声、响度、混音质量、音乐/环境声关系等理解任务。

`video.understand` 表示原生视频分析/审阅模型，适合审美、影视化效果、视频质量等理解任务。

这些理解用途通常由 `type = "llm"` 且声明 `capabilities = ["image.understand", "audio.understand", "video.understand", "vision"]` 的 Gemini 模型承担；不要把它们配置到 `[default_models.image]`、`[default_models.audio]` 或 `[default_models.video]`，这些类型默认值保留给生成模型。

前端确认入口在 Composer 的媒体模型配置栏中。选择或切换图片、音频、视频生成模型时，同一行会显示对应的 understand 模型：`Configured` 表示来自 `[default_model_purposes.*]` 的显式绑定，`Auto` 表示没有显式绑定但已有启用模型声明对应 understand capability，`Missing` 表示当前 Agent 不会调用该类媒体理解模型。

### `models[].type`

`type` 只做 UI 分组和粗路由，当前允许：

```text
llm | image | video | audio
```

不要配置 `type = "music"`。音乐模型写成 `type = "audio"`，并声明 `text_to_music` 能力。

### `models[].capabilities`

`capabilities` 是模型元数据，继续支持 `chat`、`function_calling`、`streaming`、`json_mode`、`code`、`vision`、`text_to_image`、`text_to_video`、`text_to_audio`、`text_to_music` 等字段。Neko 内部会把这些元数据映射到产品用途，例如 `text_to_music` 满足 `audio.music.generate`。

### `models[].protocol_profile`

`protocol_profile` 是模型级请求标准覆盖，支持：

```text
newapi | openai-chat | openai-responses | anthropic | google | ollama
```

常见配置：

- DeepSeek 官方直连：provider 写 `type = "generic"`、`connection_kind = "direct"`、`protocol_profile = "openai-chat"`，模型通常不需要覆盖。
- NewAPI/OneAPI 聚合网关：provider 写 `type = "newapi"`、`connection_kind = "gateway"`、`protocol_profile = "newapi"`；如果其中某个模型必须按 Anthropic/Gemini/Ollama wire protocol 请求，再在该模型上写 `protocol_profile = "anthropic"`、`"google"` 或 `"ollama"`。
- OpenAI Responses 参数族：provider 或模型写 `protocol_profile = "openai-responses"`，只有声明支持相关能力的模型才展示 reasoning/verbosity 等 OpenAI 专属参数；当前聊天 adapter 仍使用 Chat Completions 请求路径，Responses wire protocol 需要对应 adapter 支持后再启用。

旧字段 `protocol` 仍可读取，用于已有配置的 adapter override；新配置请优先使用 `protocol_profile`。配置非法值会直接显示配置诊断，不会 fallback 到 NewAPI、官方账号或首个可用模型。

### `models[].provider_expression_profile_id`

`provider_expression_profile_id` 是模型目录对 Provider/model Expression Profile 的引用，不是 TOML 内联提示词。该 profile 必须由内置能力、Skill/package、market、personal 或 project profile package 通过 Agent profile registry 贡献。

```toml
[[models]]
id = "neko-gateway-gpt-image-2"
name = "gpt-image-2"
provider_id = "neko-gateway"
type = "image"
capabilities = ["text_to_image"]
provider_expression_profile_id = "provider-expression:openai:gpt-image-2"
enabled = true
```

Agent turn assembly 会在选中媒体模型时通过 registry 解析该 id。缺失或 provider/model 不匹配会生成可见 diagnostic，不会把 TOML 当成 expression profile schema，也不会编造 provider-specific guidance。

用户 TOML 不能定义 Artifact Profile、Creation Profile 或 Provider/model Expression Profile schema。`[[artifact_profiles]]`、`[[creation_profiles]]`、`[[provider_expression_profiles]]` 属于不支持的 schema section，会被配置读取诊断拒绝。要分发 profile，请使用 profile contribution package。

## 工作原理

生成工具必须拿到明确的模型路由：

1. 显式指定 `providerId + modelId`：直接使用该组合。
2. Agent runtime 为该类型传入已选择的媒体模型：直接使用该组合。
3. 仍无法确定模型：返回错误，要求用户选择模型或显式传入 `providerId + modelId`。

媒体工具不会只凭 provider 名、model 名或历史默认值猜测路由，也不会从 direct/local 转到 NewAPI gateway。这样可以避免误用昂贵模型，也能保证生成结果来自用户明确配置的 provider。

LLM `chat` / `chatStream` 服务本身也要求完整 `providerId + modelId`，不会在空参数或半截参数时选择首个可用模型。Agent 主对话、图像理解工具 `ReadImage`、角色扮演、Canvas 提示生成、质量检查和跨扩展 `neko.agent.internalChat` 都必须把当前已选 LLM 模型传到底层服务。若当前未选择对话模型、选择不完整，或者所选模型不具备所需视觉能力，调用会返回可见错误或走调用方明确的本地降级策略，不会调用默认 gateway。

## Agent Composer LLM 配置

Agent 输入框中的模式配置是会话级选择，不会自动写回 `~/.neko/config.toml`。用户在当前 tab 里选择 Agent LLM 模型、推理深度、回复详略、创造性和执行模式后，这些值只作用于当前发送的 Agent turn；只有用户显式修改配置文件或设置页时，才会改变 durable 默认值。

普通 Agent 对话当前使用 `primary` 模型槽位。Webview 发送的 Agent 配置会在 Extension 边界解析为明确的 `providerId + modelId`：优先使用 composer 的 `agentModels.primary`，其次使用旧 `chatModel`，最后使用当前设置中的完整 LLM 选择。若缺少 provider 或 model 任一半、`primary` 与 `chatModel` 指向不同模型、provider/model 不匹配、模型缺失、provider 未配置或模型不是启用的 LLM，Agent 会返回可见诊断，不会切到无关模型。

Webview 不再提供全局 `auto` 选项，也不会用空 provider/model 清除运行态覆盖。用户配置 API 不生成语义 `auto`；`auto` 只有作为真实 provider 下的模型 ID 时才合法，例如账号 catalog 的 `neko-account-gateway:auto`。若用户显式配置 `custom-gateway:auto`，它也只是普通模型 ID。这类选择仍会以完整 `providerId + modelId` 传递。刷新配置快照或重新读取 `config.toml` 时，若没有运行态选择，新的文件默认值或账号 catalog 默认值会重新成为事实来源；当用户配置模型和账号模型同时可选且没有显式运行态选择时，Webview 优先用用户配置的 LLM 初始化当前选择。

MVP 合同预留了 `fast`、`deep`、`summarizer`、`vision` 槽位，用于未来多模型编排；当前普通 Agent turn 只支持 `primary`。如果 payload 引用这些非 MVP 槽位，Extension 会返回 fail-visible 诊断，而不是静默忽略。

Agent presets 是创作意图，不是 provider 原始参数：

| Composer preset                     | 说明                            | 运行时映射                                                            |
| ----------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Reasoning `fast/balanced/deep`      | 控制推理预算或 reasoning effort | 仅在模型/provider 声明支持 reasoning effort 或 thinking budget 时映射 |
| Verbosity `brief/standard/detailed` | 控制回复详略                    | 仅在模型/provider 声明支持 verbosity 时映射                           |
| Creativity `stable/creative/wild`   | 控制采样倾向                    | 映射到 `temperature` / `topP`，前提是模型支持采样参数                 |

自定义 provider 如果缺少能力元数据，默认只开放保守通用能力，不假设支持 reasoning、verbosity、fast service tier 或 provider-specific thinking。要开启高级 LLM 控件，在 provider 或 model 的 `options.llmCapabilities` 中声明能力；这些能力只决定 UI 展示和参数投影，不改变 provider 的连接模式。

Token 配置有三个独立含义，不要混用：

- `[defaults].max_tokens`：默认最大输出 token 数，用于回复生成上限。
- `[[models]].context_window`：模型输入上下文窗口 metadata。
- `[[models]].max_output_tokens`：模型支持的最大输出 token 数 metadata。

如果把 `max_tokens = 256000` 当上下文窗口，而模型 `max_output_tokens = 128000`，Agent 会在 provider 调用前给出可见诊断，不会把 256000 发送为 `max_tokens`。

```toml
[defaults]
max_tokens = 8192

# In each chat-capable [[models]] entry:
context_window = 256000
max_output_tokens = 128000
```

```toml
[[models]]
id = "custom-gpt-reasoning"
name = "gpt-reasoning"
provider_id = "neko-gateway"
type = "llm"
context_window = 256000
max_output_tokens = 128000
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
