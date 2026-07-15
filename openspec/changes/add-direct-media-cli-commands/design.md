## Context

`apps/neko-tui` 同时是 Ink TUI 与 `neko` shell CLI 的 composition root。Commander 顶层当前只有自由 `[prompt...]` 参数，因此 `neko image ...`、`neko video ...`、`neko audio ...` 会落入交互式 AgentSession。另一方面，`@neko/platform` 已通过 `MediaGenerationService` 提供 `generateImage`、`generateVideo`、`generateAudio`、任务等待、provider/model routing 和输出保存；`submitMediaTurn` 已提供按媒体 category 提交请求的 host-neutral 入口。TUI Host 还拥有 SQLite Task storage、resource-cache manifest、generated asset index 和 `NodeMediaTaskDeliveryHost`。

本变更跨 CLI composition、Host runtime 与 Platform media 调用，但不改变 provider adapter、Agent tool、Webview、Proto 或 Rust Engine。仓库存在其他未提交改动，实现必须最小化触碰并保留其语义。

## Goals / Non-Goals

**Goals:**

- 提供平级的 `neko image|video|audio <prompt>` 非交互式生成命令。
- 直接复用 Platform media service 与 Host-owned Task/output lifecycle，不经过 AgentSession 或聊天模型。
- 使用当前配置中的对应默认媒体模型，并允许命令级显式 `--model` 覆盖。
- 等待终态并输出 stable generated asset refs。
- 提供 text 与 JSON 两种确定性输出及 fail-visible 非零失败。
- 通过路径级测试证明 direct handler/media port 被命中，普通 prompt/Agent handler 未参与。

**Non-Goals:**

- 不把 audio 细分为 music、TTS 或其他子类型；未来真实能力作为新的平级命令扩展。
- 不新增 provider、模型能力、Agent Tool/Skill 或媒体参数全集。
- 不将 direct CLI 变成第二套 Platform、TaskManager、cache manager 或 path resolver。
- 不提供 direct-command-to-Agent fallback，也不保留 `image|video|audio` 作为普通 prompt 的兼容行为。

## Decisions

### 1. Commander 注册三个平级命令，共用一个 direct media handler

`image`、`video`、`audio` 是用户可见的独立顶层命令，但注册和执行使用同一参数契约与 handler，通过显式 `kind` 区分。公共参数最小化为 prompt、`--model`、`--json` 与 work-dir。

替代方案：增加 `generate` 中间层或 audio 子命令。拒绝，因为当前模型分类只有 image/video/audio，额外层次没有对应的产品或 provider 变化点。

### 2. direct handler 依赖窄媒体运行时端口，concrete bootstrap 复用现有 Host/Platform

纯 orchestration 定义 `DirectMediaCommandRuntime`，只暴露模型解析、submit、wait、delivery 与 dispose 所需操作。生产 composition 使用现有配置加载、SQLite Task storage、generated asset index、`createCLIPlatform`、`submitMediaTurn` 和 `NodeMediaTaskDeliveryHost`。测试注入端口，直接 poison Agent prompt handler。

这不是新的共享 service：职责仅是 `apps/neko-tui` 的 shell command orchestration，生命周期随一次进程调用结束。若未来第二个 Node Host 需要同一 composition，再提取 host-neutral factory；当前不提前制造 registry/factory 层。

### 3. 模型身份必须显式解析为 provider/model pair

默认从 `CLIConfig.defaultMediaModels[kind]` 读取，通过现有 `buildTuiMediaModelMetadata` 与 model catalog 解析；`--model` 使用同一解析规则覆盖。缺失、`none`、类别不匹配或无法解析的模型直接失败，不回退到 chat model 或任意 provider。

### 4. audio 始终提交 canonical text-to-audio

CLI `audio` 调用 `generateAudio` 且不设置 `isMusic`。现有 Platform 的 `text-to-music` 仅由明确的 music category/flag 触发；CLI 不检查 prompt 内容、不猜测 music/TTS，也不调用旧 Agent 工具进行分流。

### 5. 命令同步等待并交付稳定素材

命令等待 Task terminal，然后使用 `NodeMediaTaskDeliveryHost.createTaskViewDelivery` 执行现有输出下载、generated asset 建索引与 stable ref 投影。成功输出 asset ref；失败、取消或无持久结果均为可诊断失败。当前没有常驻 daemon owner，因此不提供可能在进程退出后失去执行 owner 的 detach 模式。

### 6. CLI 失败通过 typed diagnostic 投影，入口设置非零 exit code

缺失 prompt 由 Commander 拒绝；配置、模型、提交、等待与交付错误转换为安全 terminal diagnostic。程序不捕获后继续启动 TUI，也不返回空成功结果。外部 provider 原始 stack 不进入 JSON 输出。

## Five-layer analysis

- **职责**：Commander 拥有语法；direct handler 拥有一次命令编排；Platform 拥有模型路由与生成；TaskManager 拥有异步生命周期；Host delivery 拥有本地输出与 stable asset projection。
- **依赖**：`apps/neko-tui` 依赖 `@neko/platform`/`@neko/shared` 公共入口；Platform 不反向依赖 app；无 Webview/VSCode/Rust 边界变化。
- **接口**：三种 kind 的判别联合、完整 model identity、完整 Task scope、terminal result DTO；不新增共享 DTO，除非现有类型无法表达。
- **扩展**：未来媒体类型通过新增平级 Commander command 和 category mapping 扩展；无需修改 image/video/audio 内部层次。
- **测试**：纯 handler contract tests、Commander action tests、Platform media path tests、app typecheck/build；Agent real evaluation 排除，因为 canonical path 明确不创建 AgentSession，并以 deterministic poison test 证明。

## Risks / Trade-offs

- [直接 runtime bootstrap 与 Ink session bootstrap 可能漂移] → 复用现有 config、storage、Platform 和 delivery constructors，只新增一次性 composition；测试断言相同 model identity 与 output lifecycle。
- [长视频命令会持续占用终端] → 保持明确的同步 owner、超时与中断失败语义；后台执行留给未来具有常驻 owner 的独立变更。
- [任务提交成功但交付失败] → 保留 Task identity 并返回非零 diagnostic，不把远程 URL 或临时路径伪装成 durable success。
- [现有 `neko image ...` prompt 行为发生变化] → 这是未发布 CLI 的有意 breaking change；不保留 alias/fallback，普通 Agent 请求仍可用默认 prompt 或 `interactive`。
- [当前工作区有并行改动] → 避免修改 Agent media tool 实现；对重叠文件逐块 patch，并以 scoped diff 审计。

## Migration Plan

1. 先注册并测试三个顶层 command，使这些 token 不再进入默认 prompt path。
2. 实现 direct handler contract 与 no-Agent poison tests。
3. 接入现有 Host/Platform/Task/output composition，验证同步等待与稳定交付路径。
4. 更新 completion/help 与中英文 terminal 文案。
5. 若回滚，移除三个 command 注册及 direct adapter；不会迁移或删除已有用户数据和生成素材。

## Open Questions

无。高级媒体参数与新增平级类型留给后续独立变更。
