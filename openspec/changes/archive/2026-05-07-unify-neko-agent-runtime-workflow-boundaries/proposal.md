## Why

`neko-agent` 的 Webview / Extension / Agent / Platform 大方向已经收敛，但 `AgentTurnBridge`、`AgentRunner` 和部分 command/tool bridge 仍把 runtime assembly、VSCode event shape、prompt/context/skill 注入边界混在 Extension 层。现在需要把这些边界固化为可测试契约，为 IDC 创作流程、market skill 安装后动态注入、prompt/schema 动态生成、prompt-chain workflow、subagent/multi-agent 和多模态工具调用提供统一运行时基线。

## What Changes

- 将 Agent turn 组装从 Extension bridge 迁到 host-agnostic runtime contract：Extension 只提供 VSCode/Webview host adapters，`@neko/agent/runtime` 负责 provider/settings/prompt/context/timeline/skill/plan/task/subagent assembly。
- 抽象 `AgentRunnerPort`，移除核心 runner contract 对 `vscode.Event` / `vscode.Disposable` 的直接暴露；Extension 保留 VSCode adapter。
- 建立统一 `AgentWorkflowDefinition` / `AgentWorkflowRun` / `AgentWorkflowNode`，支持 IDC 三阶段、plan mode 切换、prompt-chain、tool-chain、subagent-chain 和异步 task 投影。
- 统一 skill、slash command、tool、prompt fragment、workflow 的 capability injection schema，支持 market 安装 skill 后由 runtime 动态发现、校验和注入。
- 明确 prompt/schema 动态生成规则：runtime 根据 IDC stage、plan mode、active skill、workflow node、multimodal context、tool allowlist 和 capability fragments 生成 system prompt、tool schemas、structured output schema。
- 统一多模态输入与多模态工具调用契约：文本、图片、音频、视频、canvas、timeline、editor selection 进入同一 `MultimodalContextPacket`，工具声明自身输入/输出媒体能力。
- 加入控制层/意图层/编排层/执行层分层契约和架构边界检查，防止 Webview/Extension 重新承载 agent 核心业务。
- 增加消融实验与效果验证能力，支持开关 IDC、skill fragments、workflow planner、subagent、多模态 context、dynamic schema，并记录可比较指标。

## Capabilities

### New Capabilities

- `agent-runtime-boundaries`: Webview、Extension、Agent runtime、Platform、AI SDK 的职责边界、port/adapter 契约和架构 guard。
- `agent-unified-workflow-runtime`: IDC 三阶段、plan mode 切换、prompt-chain/tool-chain/subagent-chain、异步 task 和 multi-agent 编排的统一 workflow runtime。
- `agent-capability-injection`: market skill、local skill、plugin command、tool、prompt fragment、workflow fragment 的注册、发现、冲突处理和动态注入。
- `agent-dynamic-prompt-schema`: system prompt、prompt chain、tool schema、structured output schema 和 capability prompt fragment 的动态生成规则。
- `agent-multimodal-tooling`: agent 多模态上下文、模型选择、工具调用输入/输出媒体契约和 artifact 投影。
- `agent-evaluation-evolution`: 消融实验、效果验证、能力开关、指标采集和动态演化记录。

### Modified Capabilities

- 无。当前 `openspec/specs/` 尚无 agent 相关已归档能力；本变更新增 agent 能力基线，不修改 3D 既有 specs。

## Impact

- `packages/neko-agent/packages/agent`: 新增/收敛 runtime ports、turn assembler、workflow runtime、IDC stage controller、prompt/schema generator、task/subagent orchestration、skill/capability runtime。
- `packages/neko-agent/packages/platform`: provider/tool/capability binding、market skill install target alias、model/media/perception provider integration、workflow-capability discovery。
- `packages/neko-agent/packages/ai-sdk`: host-agnostic model invocation、tool schema conversion、structured output schema bridge、多模态 message adapter。
- `packages/neko-agent/packages/agent-types`: Webview protocol、workflow/schema/capability/task/subagent/multimodal shared contracts 和 parse/build tests。
- `packages/neko-agent/packages/extension`: 压薄 `AgentTurnBridge`、`AgentRunner`、command/tool bridges、SkillFileService/config bridge；只保留 VSCode APIs、workspace/file access、webview postMessage、command registration 和 host injection。
- `packages/neko-agent/packages/webview`: 保持 UI 渲染、用户交互、catalog 展示、workflow/task/subagent/artifact 投影；不得保存 agent 策略或执行核心。
- `packages/neko-market`: 继续作为 skill 安装目标和 registry 来源；agent 侧只消费安装后的 capability manifest/runtime projection。
- 文档和质量门禁：更新 agent 架构文档、remaining-tasks assessment、边界检查脚本、runtime 单测、extension adapter 单测、webview protocol/presenter 单测和 eval fixtures。
