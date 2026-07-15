## Why

`neko` 当前把所有自由参数都作为 Agent prompt 执行，因此用户已经明确指定 image、video 或 audio 生成时仍需经过聊天模型和 AgentSession，增加了不必要的延迟、成本和路由不确定性。现有 Platform 已拥有媒体模型路由、异步 Task 与生成结果持久化能力，现在应提供确定性、可脚本化的直接 CLI 入口。

## What Changes

- 新增平级终端命令 `neko image <prompt>`、`neko video <prompt>`、`neko audio <prompt>`，直接提交对应媒体生成任务。
- 三种命令共享同一直接媒体命令契约；不增加 `generate`、`music`、`tts` 等当前模型能力未区分的层级。
- 直接命令复用 Platform 媒体模型配置、provider routing、TaskManager、generated-output/resource-cache 生命周期与稳定结果引用。
- 直接命令不创建或执行 AgentSession，不调用聊天模型或执行 Agent Tool/Skill，也不得在失败时 fallback 到 Agent prompt 路径。
- 提供终端可读结果和结构化 `--json` 结果；命令等待终态并交付稳定素材引用。
- 对缺失 prompt、缺失媒体模型、无效参数、provider 错误和任务失败返回明确非零退出状态与 diagnostic。
- 非目标：本变更不细分 audio 为 music/TTS，不新增媒体 provider，不改变 Agent 内部 `Generate*` 工具契约，也不增加 Webview 功能。

成功标准：从 shell 执行任一媒体命令后，CLI 直接命中对应 Platform media service、产生带正确 media kind 的异步任务并输出稳定结果；路径级测试证明 AgentSession 与普通 prompt handler 未参与。

## Capabilities

### New Capabilities

- `direct-media-cli-generation`: 定义平级 image、video、audio CLI 的参数、直接媒体任务路径、结果输出、失败语义和 no-Agent/no-fallback 约束。

### Modified Capabilities

无。

## Impact

- 主要影响 `apps/neko-tui` 的 Commander 命令注册、CLI application composition、Node 媒体任务等待与终端输出。
- 复用 `@neko/platform` 的媒体生成与 Task 基础设施；必要时只增加最小公共 direct-generation facade，不复制 provider adapter 或 cache/path 逻辑。
- 不修改项目文件格式、Proto、Rust Engine、Webview 或用户持久数据。
- `neko image ...` 等此前会被当作普通 Agent prompt 的未发布行为将变为直接媒体命令；这是有意的 prelaunch breaking command 收敛，不保留 prompt fallback 或旧命令别名。
