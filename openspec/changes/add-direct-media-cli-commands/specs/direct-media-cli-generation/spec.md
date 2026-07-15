## ADDED Requirements

### Requirement: 平级直接媒体命令

系统 SHALL 提供 `neko image <prompt>`、`neko video <prompt>` 和 `neko audio <prompt>` 三个平级 shell command，并 SHALL NOT 要求 `generate`、`music`、`tts` 等中间或子命令层级。

#### Scenario: 提交图像命令

- **WHEN** 用户执行 `neko image "水墨山谷"`
- **THEN** 系统将 prompt 作为 image 生成请求提交

#### Scenario: 提交视频命令

- **WHEN** 用户执行 `neko video "镜头缓慢推进"`
- **THEN** 系统将 prompt 作为 video 生成请求提交

#### Scenario: 提交通用音频命令

- **WHEN** 用户执行 `neko audio "雨夜城市环境声"`
- **THEN** 系统将 prompt 作为 canonical audio 生成请求提交
- **AND** 系统不根据 prompt 猜测 music 或 TTS 子类型

### Requirement: 直接媒体运行路径

媒体 shell command MUST 直接调用 Platform media generation service，并 MUST NOT 创建或执行 AgentSession、调用 chat model、执行 Agent Tool/Skill 或把命令重新提交为普通 Agent prompt。

#### Scenario: 直接命中媒体服务

- **WHEN** 任一媒体 shell command 通过有效配置执行
- **THEN** 对应 image、video 或 audio media service operation 被调用一次
- **AND** Agent prompt handler 未被调用

#### Scenario: 直接路径失败

- **WHEN** media service 提交或执行失败
- **THEN** 命令返回非零失败与明确 diagnostic
- **AND** 系统不得 fallback 到 AgentSession、chat model 或其他媒体 kind

### Requirement: 确定性媒体模型选择

命令 MUST 使用目标媒体 kind 的显式 `--model` 或配置的默认媒体模型，并 MUST 将其解析为完整 provider/model identity；系统 MUST NOT 使用 chat model 或任意其他 kind 的模型作为 fallback。

#### Scenario: 使用默认媒体模型

- **WHEN** 用户未传递 `--model` 且目标 kind 配置了默认媒体模型
- **THEN** direct request 使用该模型的 providerId 与 modelId

#### Scenario: 使用命令级模型

- **WHEN** 用户传递与目标 kind 匹配的 `--model`
- **THEN** direct request 使用该显式模型身份

#### Scenario: 缺失或错误类别模型

- **WHEN** 目标 kind 没有可用默认模型，或显式模型属于其他 kind
- **THEN** 命令 fail-visible 并且不提交任务

### Requirement: 同步等待与稳定结果

媒体命令 SHALL 等待 Task 终态并通过现有 Host generated-output lifecycle 返回 stable generated asset refs。没有持久后台进程 owner 时，系统 MUST NOT 提供会在进程退出后失去执行 owner 的 detach 成功路径。

#### Scenario: 默认等待并交付素材

- **WHEN** 默认执行的媒体任务完成且生成输出可持久化
- **THEN** Host 将输出保存到统一 generated-output 生命周期
- **AND** CLI 输出至少一个 stable generated asset ref

#### Scenario: 任务失败或无稳定结果

- **WHEN** Task 失败、取消或完成后没有可交付的 stable generated asset ref
- **THEN** 命令返回非零失败与 Task identity diagnostic
- **AND** 不把临时路径、远程 URL 或空输出当作成功

### Requirement: 可脚本化输出与命令诊断

媒体命令 SHALL 支持人类可读 text 输出与 `--json` 结构化输出；成功和失败结果 MUST 包含稳定 kind、model 和 Task identity 字段，且不得泄露 credential 或原始 provider stack。

#### Scenario: JSON 成功输出

- **WHEN** 用户传递 `--json` 且直接生成成功
- **THEN** stdout 返回可解析 JSON，包含 kind、providerId、modelId、task scope 和 stable asset refs

#### Scenario: 无效调用

- **WHEN** prompt 缺失、参数无效或配置不可用
- **THEN** stderr 返回本地化或稳定 code 的 diagnostic
- **AND** 进程设置非零退出状态
