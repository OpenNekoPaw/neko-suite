## Why

Agent TUI 已能局部显示中文，但命令执行结果、状态、用法、菜单和错误仍在 router、hook、host port 与共享 handler 中直接拼接英文。问题不是缺少若干翻译，而是缺少统一的**终端展示所有权契约**：业务层可以返回最终文案，新命令也可以绕过 i18n，因此国际化会持续回退。

本变更建立一套适用于 Agent 所有人类可读终端输出的通用规范，并以 `/model`、media、perception 命令族作为首个迁移切片。设计按本地 VS Code 客户端与本地 Engine 的产品边界收敛，不引入第二套 i18n runtime、终端 AST、通用错误框架或 Locale 管理子系统。

## What Changes

- 按输出通道而非命令类型划分边界：Ink TUI、非 Ink CLI、slash command、启动/状态 chrome、one-shot human wrapper、Commander help/usage/parse diagnostic、utility/experiment 的终端进度摘要与其他 Neko-owned 人类文案统一进入 Agent terminal presentation；JSON、debug JSONL、structured log、evaluation facts/report、completion script 等 machine/tooling projection 保持 locale-neutral。
- 在 `@neko/shared` i18n 基础设施中增加一个小型 immutable strict translator composition primitive，复用共享插值并对缺失 key、bundle 冲突、key/placeholder parity 失败实行 fail-visible；现有面向 Webview 的 mutable/fallback `I18nService` 行为保持不变。`@neko/agent` 拥有可跨终端复用的 `agent.command.*` 语义消息，现有 `packages/neko-agent/packages/cli-tui` 包（manifest 名称 `@neko/cli`）拥有 `agent.terminal.*` 标签、布局和 wrapper；不新增独立 CLI/presentation 子包或中央全仓 message catalog。
- Strict primitive 从现有 `@neko/shared/i18n` 导出并保持 Layer 0；owner bundles 与 `@neko/agent`、`@neko/cli` 共置，Agent 只通过窄 terminal-message 模块导出自身 bundle/key contract，CLI bundle 保持 package-private。全部 bundle 静态导入并在每 invocation composition 时验证一次，不做文件扫描、动态加载、registry、全局 singleton 或 locale pack。Strict interpolation 只接受命名 placeholder，要求参数精确匹配，`{{`/`}}` 表示 literal brace；缺失/额外参数、非法 brace 与旧 key 均 fail-visible，不保留 key alias 或 fallback。

- Bundle 使用完整语义消息而非可任意拼接的句子片段；稳定值通过 placeholder 注入，少量英文单复数由显式同构 key 选择，不引入 ICU/Fluent 或 plural DSL。语言标点和自然语言间距属于消息，语义行与顺序属于 Presenter，物理折行、缩进、ANSI/Ink styling 与宽度处理属于 terminal adapter。人类数字、日期时间、duration 和 binary byte size 由小型显式 formatter 处理；invocation 捕获一次系统时区用于确定性格式化，不新增时区、单位或精度配置。
- 实施以本 change 的 `tasks.md` 作为 owned-output inventory，不增加独立 manifest/registry；按 shared strict primitive → bootstrap/context → owner bundles → model/media/perception 首切片 → 其余 inventory → legacy removal/gates 顺序推进。每个 command family 在同一迁移单元中接入新路径并删除/poison 旧 prose/key，不保留 feature flag、staged rollout、legacy locale mode 或 localization telemetry。验收使用 focused package tests、repository gates 和仅在 prompt/routing/event projection 实际受影响时执行的 Agent evaluation；Capability Complete 只有一组封闭条件。

- 下层与各 command-family handler 返回小型 typed semantic result/diagnostic，静态导入的 command-family Presenter 使用一次性注入的 presentation context 生成最终人类文案；host port 不再返回成功或错误句子。外层 `TuiCommandRouterResult` 继续作为已渲染的 terminal projection，避免重写 TUI 消息协议，但不建立动态 Presenter registry、全局巨型 result union、universal command/menu AST 或 legacy string adapter。对于 `/status`，`useSlashCommands` composition adapter 在每次命令中对每个 owning store 各捕获一次 state，并直接组合 readonly semantic snapshot；不建立跨 store 事务、Snapshot Builder、Status Service、缓存或同步层。package-private status contract/Presenter 不依赖 store、配置、路径或文件系统，router 也不再拼接状态文案。
- 分离 `uiLocale` 与 `promptLocale`，但使用相同的 `auto | en | zh-cn` 配置词汇。Canonical 显式入口为 `--ui-locale` / `NEKO_UI_LOCALE` / `ui_locale` 和 `--prompt-locale` / `NEKO_PROMPT_LOCALE` / `prompt_locale`；不提供 `--locale`，迁移后删除旧 `NEKO_LOCALE` 且不保留 alias/warning adapter。`auto` 只存在于 source/config resolution，之后二者都是 concrete `SupportedLocale`。`promptLocale` 不进入会与 workspace 合并的 `UnifiedConfig`，而作为 invocation runtime input 一次性注入 system prompt、内置 Skill/capability/tool description、validation/compression、AgentSession 与子 Agent；resume 使用新 invocation 值且不改写历史内容。自定义 Skill、workspace instruction、外部 provider/tool 文本和用户内容保持原样；模型回复语言仍由对话与用户指令决定。
- Locale source adapters 只保留 absent 与 present raw value，不 trim、改写、解析优先级或 fallback；全部显式来源即使被遮蔽、为空或大小写/空白不规范也统一严格校验。Host detection 才允许规范化：未提供显式 Locale 时跟随操作系统首选语言，中文 family 映射为 `zh-cn`，不支持或无法读取则选择 `en`。macOS 由 invocation-scoped adapter 一次性读取 `AppleLanguages` 的第一项，并优先于可能冲突的 POSIX environment/Intl；不扫描后续语言寻找受支持项，不使用 shell，不保留模块级可变 cache。其他平台使用对应 process environment/Intl 作为系统 Locale 来源。Bootstrap/composition 按“捕获来源 → 校验全部显式来源 → 解析 UI/prompt → 校验并合并 owner bundles → 创建 strict translator → 创建 presentation context”的顺序每 invocation 执行一次，之后不再读取环境、配置或主机 Locale。command router 通过显式参数、Ink tree 通过 package-private React Context 使用同一个 context；React Context 不拥有 Locale 状态、setter、检测或 bundle registry。用户直接编辑用户配置，变更需重启后生效；不新增 Locale set/unset/status/path/open 命令或配置写入协议。
- 现有通用 `/status` 只增加一行用户配置文件位置，帮助用户找到配置文件。其 snapshot 只读组合各 owning domain/runtime 已导出的 canonical read model，不携带 Neko-owned `*Summary` 文案，也不在 TUI 复制领域 DTO；契约必需值缺失时 fail-visible，可选能力缺失则按 semantic absence 省略，不使用空串、`unknown`、`N/A` 或英文兜底。Presenter 统一负责标签、状态词、人类值格式和行布局。路径由 composition 调用共享 path API 一次后注入，Presenter 仅本地化路径标签并原样显示绝对路径。
- 命令名、参数 token、provider/model/tool/artifact ID、菜单选择 ID、诊断 code、exit code、JSON 字段、structured log、debug/evaluation 协议、completion script 与 experiment JSON/Markdown report 保持 locale-neutral；协议 stdout 不混入 human prose。Human success 写 stdout，expected human diagnostic 写 stderr，contract/bootstrap failure 写 stderr 并非零退出；菜单 title/label/description 由 Presenter 投影，handler 不反向解析本地化 label。Bundles 只含纯文本与占位符，ANSI/Chalk/Ink styling、宽度与换行属于 terminal adapter。
- 每个 owner 以 canonical English bundle 派生 typed key union，并对 `en`/`zh-cn` 执行 exact key parity 与 exact placeholder-name parity；terminal strict translator 合并两个 owner 的 flat namespaced bundles。通过命令族 locale matrix、旧 `tui-locale` helper 清除/poison、Webview `I18nService` 兼容测试、现有仓库质量检查和迁移 inventory review 防止硬编码文案回流；不新增专用 AST checker、codegen、protobuf key schema 或全仓 key registry。

## Capabilities

### New Capabilities

- `agent-terminal-presentation-localization`: Agent 人类可读终端输出的 locale、消息所有权、Presenter、诊断、稳定 token 和质量门禁契约。

### Modified Capabilities

- None.

## Impact

### Affected packages

- `packages/neko-agent/packages/cli-tui`: composition、router、Presenter、package-private status presentation contract、canonical status read-model composition、菜单与终端测试；不新增子包、不从 public index 导出内部 contract，也不拥有平行领域模型。
- `packages/neko-agent/packages/agent`: 共享 Agent command result/diagnostic、Agent-owned message bundles，以及 canonical concrete `promptLocale` 在内置 prompt/Skill/capability/tool/validation/compression/session/subagent 路径中的一致传播；不自动翻译自定义或外部内容。
- `packages/neko-types`: 在现有共享 i18n 入口增加通用 strict translator composition/validation primitive，并复用 locale 与 canonical user-config path 能力；不承载 Agent 文案，且不改变现有 Webview `I18nService` 的 mutable/fallback 契约。

### Compatibility

- Slash command 名称、参数和机器输出 schema 不变。
- 人类可读英文输出会切换到 message bundles，并增加 `zh-cn` 对应文案。
- 删除旧 `NEKO_LOCALE`，且不新增模糊的通用 `--locale`；UI 与 prompt 只使用各自明确入口，不保留 alias、warning adapter 或扇出兼容。
- Workspace 中的 `ui_locale` 或 `prompt_locale` 被视为非法所有权并在 bootstrap fail-visible；用户配置是唯一持久化位置。
- 运行中编辑配置不会热切换当前会话，需启动新的 invocation 验证生效。

## Non-Goals

- 不翻译命令关键字、参数 token、标识符或 machine protocol。
- 不决定模型回复语言。
- 不实现运行时 Locale 热切换、文件监听、Locale 管理命令或 TOML 编辑器。
- 不建立通用 Terminal AST、全仓库 Error Framework、universal `LocalizedText` DTO 或通用路径 Value Object。
- 外部 provider/contributor 文本的多语言协议不在本变更范围内；外部 detail 保持原样并置于本地化的 Neko-owned wrapper 下。
