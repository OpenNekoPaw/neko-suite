# Agent Eval 测试用例设计文档

本文定义 Neko Agent eval 体系需要覆盖的核心测试用例。目标不是复刻旧的 real API smoke，而是通过当前 eval runner 和 TUI debug automation 协议，对真实 Agent 会话、消息队列、任务、Skill、模型绑定和质量评审做路径级验收。

当前基础协议链路：

```text
session.create -> message.submit -> session.waitForIdle -> session.facts -> session.dispose
```

`session.facts` 是主要证据来源，至少包含：

- `model`：当前 chat provider、model、profile。
- `idle`：前台 turn、后台任务、媒体投递、任务结果观察是否全部 idle。
- `turns`：用户/assistant/system 消息摘要、错误状态、tool call 摘要。
- `history`：可选完整会话历史，用于 debug 和路径核对，报告中不得泄露系统提示词或密钥。
- `skillActivations`：Skill lifecycle 可见记录。
- `tasks`：异步任务 id、type、status、progress、error。
- `messageQueue`：消息队列快照、pending count、version。
- `continuations`：内部续跑 source、display kind、parent/task/subagent/observation metadata 和执行状态；不得通过解析终端文本判断。
- `runtimeErrors`：TUI/Agent runtime 可见错误。
- `canvas`：Canvas 相关消息和 tool call 摘要。

## 通用 Manifest 结构

所有用例建议使用同一个 scenario manifest schema：

```json
{
  "schema": "neko.agent-eval.scenarios.v1",
  "defaultCwd": "~/Git/neko-test",
  "defaultTimeoutMs": 600000,
  "cases": [
    {
      "id": "agent.single.storyboard-outline.v1",
      "kind": "single-prompt",
      "surface": "agent",
      "prompt": "根据一个雨夜追逐场景生成 5 镜头分镜表",
      "expectations": ["输出结构化分镜", "包含镜号、景别、画面、动作、声音"],
      "assertions": [
        { "kind": "runtime-errors-empty" },
        { "kind": "final-answer-non-empty" },
        { "kind": "final-answer-contains", "text": ["镜号", "景别"] }
      ]
    }
  ]
}
```

通用通过条件：

- `runtimeErrors` 为空，除非用例明确测试失败诊断。
- `idle.fullyIdle` 为 true，不能在后台任务仍运行时判定通过。
- 最后一条 assistant 输出非空且不是错误消息。
- 有工具、任务、Skill、模型或产物要求时，必须断言路径证据，不能只看最终文本。
- 质量评审只能作为补充判断，不能替代路径级断言。

失败分类：

- `case fail`：Agent 行为、输出质量、产物、路径断言不满足。
- `infrastructure fail`：runner、TUI、provider、文件系统、网络或超时导致无法执行。
- `manifest/config invalid`：manifest schema、cwd、模型、Skill、环境变量等配置非法。

## 1. 单条提示词输出：单个提示词

目的：验证一个 prompt 在完整 Agent 会话中的最终输出结果。

驱动流程：

```text
create session -> submit prompt -> wait idle -> read facts -> assert final answer
```

必须观察：

- `turns` 中存在用户消息和 assistant 消息。
- 最后一条 assistant 非空、非 error。
- 输出满足 prompt 要求的关键词、结构、格式或产物引用。
- 如果 prompt 要求工具或产物，必须断言 tool call 或 task 终态。

示例：

```json
{
  "id": "agent.single.storyboard-outline.v1",
  "kind": "single-prompt",
  "prompt": "根据一个雨夜追逐场景生成 5 镜头分镜表",
  "assertions": [
    { "kind": "runtime-errors-empty" },
    { "kind": "final-answer-non-empty" },
    { "kind": "final-answer-contains", "text": ["镜号", "景别", "动作"] }
  ]
}
```

当前 runner 状态：`protocol-smoke.mjs` 已支持基础单 prompt smoke。

## 2. 一组提示词输出：消息队列

目的：验证同一个会话中，一组 prompt 在首个 turn 运行期间进入消息队列，并在前一轮完成后按顺序继续执行。

驱动流程：

```text
create session
-> submit long-running prompt
-> while running submit prompt[2..n]
-> assert messageQueue.pendingCount > 0
-> wait idle and drain queue
-> read facts
-> assert outputs ordered
```

必须观察：

- 第二条及之后的 prompt 在运行中进入 `messageQueue.items`。
- 队列 `version` 递增，`pendingCount` 变化符合提交和释放顺序。
- 最终 `pendingCount` 为 0。
- `turns` 或 history 中输出顺序与 prompt 顺序一致。
- 队列释放的消息不能重复生成用户 turn。

示例：

```json
{
  "id": "agent.queue.storyboard-review-chain.v1",
  "kind": "message-queue",
  "steps": [
    { "prompt": "生成一个 8 镜头动作分镜，过程中需要完整表格", "holdUntil": "turn-running" },
    { "prompt": "基于上一条分镜，检查节奏是否清晰" },
    { "prompt": "把评审意见整理成 3 条修改建议" }
  ],
  "assertions": [
    { "kind": "queue-pending-during-run", "min": 2 },
    { "kind": "queue-drained" },
    { "kind": "turn-order-matches-steps" }
  ]
}
```

当前 runner 状态：目标用例已设计，当前 smoke runner 尚未实现多 submit 编排，应 fail-visible，不允许静默当作单 prompt 通过。

## 3. 闭环反馈提示词输出：根据输出结果流转提示词

目的：验证 eval controller 能读取上一轮 Agent 输出，根据结果动态生成下一轮 prompt，并判断是否走完整个流程。

驱动流程：

```text
submit initial prompt
-> read facts/output
-> controller selects next prompt by rule
-> submit feedback prompt
-> repeat until stop condition
-> assert all stages completed
```

必须观察：

- 每一轮 next prompt 来源于上一轮输出或评审结果，而不是固定脚本硬编码。
- 流程状态机完整经过指定节点，例如 `generate -> review -> revise -> final-review`。
- 达到 stop condition：质量通过、最大轮次、明确失败诊断或人工中止。
- 每轮 assistant 输出与下一轮 prompt 有可追踪引用关系。

示例：

```json
{
  "id": "agent.loop.storyboard-quality-gate.v1",
  "kind": "closed-loop",
  "initialPrompt": "生成一个 6 镜头悬疑短片分镜表",
  "flow": [
    {
      "name": "review",
      "from": "last-assistant",
      "promptTemplate": "评审上一轮分镜，指出节奏、视觉连续性和可拍摄性问题：\n${lastAssistant}"
    },
    {
      "name": "revise",
      "from": "review-output",
      "promptTemplate": "根据评审意见修订分镜，并说明改动：\n${reviewOutput}"
    }
  ],
  "stopWhen": { "kind": "rubric-score-at-least", "score": 4, "maxRounds": 3 },
  "assertions": [
    { "kind": "flow-completed", "stages": ["review", "revise"] },
    { "kind": "feedback-used-in-next-turn" }
  ]
}
```

当前 runner 状态：目标用例已设计，当前 smoke runner 尚未实现 controller flow。

## 4. Agent 异步任务处理结果：提示词生成素材/评审质量

目的：验证 Agent 发起异步素材生成任务后，能等待任务终态、读取结果并进行质量评审。

驱动流程：

```text
submit generation prompt
-> observe task created
-> wait background task terminal
-> observe result delivery/backfill
-> assistant reviews generated asset
-> assert quality rubric
```

必须观察：

- `tasks` 中出现目标任务，例如 image/video/audio generation。
- 任务进入 terminal 状态：`completed`、`failed`、`cancelled` 中符合预期的一种。
- 成功路径必须有产物引用、result URL、resourceRef 或文件证据。
- assistant 评审基于生成结果，而不是只复述 prompt。
- 失败路径必须有明确诊断，不能默认成功。

示例：

```json
{
  "id": "agent.async.image.generate-review.v1",
  "kind": "async-task",
  "prompt": "生成一张猫猫玩耍图片，并在图片完成后评审构图、动作和瑕疵",
  "assertions": [
    { "kind": "task-created", "type": "image_generation" },
    { "kind": "task-terminal", "type": "image_generation", "status": "completed" },
    { "kind": "final-answer-contains", "text": ["构图", "动作", "瑕疵"] }
  ],
  "judge": {
    "kind": "rubric",
    "minScore": 4,
    "rubric": ["是否等待产物", "是否基于图像评审", "评审是否具体"]
  }
}
```

当前 runner 状态：基础 kind 可被 manifest 接受；任务/产物/rubric 断言需要继续扩展 runner。

## 5. Agent 并发任务处理结果：批量生成素材/评审质量

目的：验证 Agent 对一批素材生成请求能并发或批量处理，并分别评审质量。

驱动流程：

```text
submit batch prompt
-> observe multiple task created
-> wait all terminal
-> collect assets
-> review each asset and aggregate ranking
```

必须观察：

- `tasks` 中出现多个相关任务，数量满足 prompt 要求。
- 任务可以并发运行或由 Agent 明确说明串行策略；不能漏掉请求项。
- 每个任务都有独立终态、产物引用和评审结论。
- 汇总回答包含逐项评审和整体选择/排序。
- 失败的单项任务不能被吞掉，必须进入汇总诊断。

示例：

```json
{
  "id": "agent.concurrent.image.batch-review.v1",
  "kind": "concurrent-tasks",
  "prompt": "批量生成 3 张科幻城市概念图，完成后逐张评审并选出最佳方案",
  "concurrency": { "expectedTaskCount": 3, "minParallelActive": 2 },
  "assertions": [
    { "kind": "task-count", "type": "image_generation", "count": 3 },
    { "kind": "all-tasks-terminal", "type": "image_generation" },
    { "kind": "per-artifact-review-count", "count": 3 },
    { "kind": "final-answer-contains", "text": ["最佳", "理由"] }
  ]
}
```

当前 runner 状态：目标用例已设计，当前 smoke runner 尚未实现并发任务断言。

## 6. Agent 连续任务处理结果：生成/评审 -> 反馈迭代下一轮

目的：验证 Agent 能在连续多轮任务中吸收上一轮评审反馈，生成下一轮素材或方案，并比较质量是否改进。

驱动流程：

```text
round 1 generate asset
-> review round 1
-> feed review into round 2 prompt
-> generate revised asset
-> review round 2
-> compare improvement
```

必须观察：

- 每一轮都有独立任务、产物和评审结果。
- 下一轮 prompt 明确引用上一轮评审意见。
- 第二轮输出体现反馈吸收，例如修正构图、风格、叙事、节奏或缺陷。
- 质量评审可比较，至少说明改进项和剩余问题。

示例：

```json
{
  "id": "agent.iterative.image.feedback-improvement.v1",
  "kind": "iterative-tasks",
  "initialPrompt": "生成一张赛博朋克街角概念图，并评审画面问题",
  "iterations": [
    {
      "name": "revise-from-review",
      "promptTemplate": "根据上一轮评审意见重新生成改进版，并说明改进点：\n${lastReview}"
    }
  ],
  "assertions": [
    { "kind": "iteration-count", "count": 2 },
    { "kind": "feedback-used-in-next-turn" },
    { "kind": "quality-score-not-regressed" }
  ]
}
```

当前 runner 状态：目标用例已设计，当前 smoke runner 尚未实现连续任务 controller 和质量比较。

## 7. 指定 Skill 能力：提示词 + Skill -> Skill 执行 -> 输出结果

目的：验证 manifest 或 test harness 明确指定某个 Skill 后，Agent 以该 Skill 的指导、工具策略或能力目录完成任务。

驱动流程：

```text
create session
-> activate specified skill
-> submit prompt
-> wait idle
-> assert skill activation/tool path/output
```

必须观察：

- `skillActivations` 中存在指定 Skill 的 active/visible record。
- Skill 相关 prompt fragments、tool policy 或 capability trace 被命中。
- 输出满足该 Skill 的领域要求。
- 指定 Skill 不存在、禁用或不兼容时必须 fail-visible。

示例：

```json
{
  "id": "agent.skill.explicit-storyboard-director.v1",
  "kind": "explicit-skill",
  "skills": [{ "name": "storyboard-director", "slot": "domainSkill" }],
  "prompt": "把这个剧情概念扩展成 8 镜头动画分镜",
  "assertions": [
    { "kind": "skill-active", "name": "storyboard-director" },
    { "kind": "final-answer-contains", "text": ["镜头", "画面", "动作"] }
  ]
}
```

当前 runner 状态：kind 和 manifest 字段已接受；实际 Skill 激活/断言需要 runner 继续接入 automation 命令或预激活机制。

## 8. 触发 Skill 能力：提示词 -> 触发 Skill -> Skill 执行 -> 输出结果

目的：验证 Agent 能根据 prompt 语义自动触发目标 Skill 或 capability，而不是由 manifest 显式指定。

驱动流程：

```text
create session without pre-activated skill
-> submit prompt
-> routing/activation selects skill
-> skill executes
-> assert trace/output
```

必须观察：

- 触发依据来自 prompt 语义，不是预设 `skills`。
- `skillActivations`、tool calls 或 capability trace 能证明目标 Skill 实际参与。
- 未触发时必须给出可见失败或 diagnostic，不能用普通回答冒充成功。
- 输出符合触发 Skill 的领域格式和质量标准。

示例：

```json
{
  "id": "agent.skill.trigger-comic-animation.v1",
  "kind": "triggered-skill",
  "prompt": "分析这本漫画前 10 页，输出动画化分镜和镜头节奏",
  "expectedSkill": "comic-animation-indexing",
  "assertions": [
    { "kind": "skill-triggered", "name": "comic-animation-indexing" },
    { "kind": "final-answer-contains", "text": ["动画化", "镜头", "节奏"] }
  ]
}
```

当前 runner 状态：kind 和 manifest 字段已接受；自动触发路径断言需要继续扩展 runner。

## 9. 指定模型能力：chat/audio/image/video provider、模型 ID、profile

目的：验证 chat、audio、image、video 等不同模型类型可以按 case 指定 provider、模型 ID 和 profile，并且实际执行不静默回退。

驱动流程：

```text
create session with chat model override
-> apply media model overrides
-> submit prompt
-> observe model facts/tool task metadata
-> assert provider/model/profile
```

必须观察：

- `facts.model.providerId`、`facts.model.modelId`、profile 与 case 配置一致。
- image/video/audio 任务使用对应类别的 provider/model/profile。
- 缺失模型、禁用 provider、类型不匹配或 profile 不存在时 fail-visible。
- 不能回退到默认模型后仍判定成功。

示例：

```json
{
  "id": "agent.model.multi-modal-binding.v1",
  "kind": "model-binding",
  "model": {
    "chat": {
      "providerId": "openai",
      "modelId": "gpt-4.1",
      "providerExpressionProfileId": "creative-review"
    },
    "media": {
      "image": { "providerId": "fal", "modelId": "imagen4", "profileId": "concept-art" },
      "video": { "providerId": "runway", "modelId": "gen-4", "profileId": "storyboard-motion" },
      "audio": { "providerId": "elevenlabs", "modelId": "tts-v1", "profileId": "narration" }
    }
  },
  "prompt": "用指定图片模型生成奇幻森林概念图，并用指定 chat 模型评审画面层次",
  "assertions": [
    { "kind": "chat-model-is", "providerId": "openai", "modelId": "gpt-4.1", "profileId": "creative-review" },
    { "kind": "media-model-is", "category": "image", "providerId": "fal", "modelId": "imagen4" },
    { "kind": "no-model-fallback" }
  ]
}
```

当前 runner 状态：chat provider/model 可通过 `session.create` 参数验证；audio/image/video/profile 路径断言需要继续扩展 task metadata 和 media model facts。

## 用例补充方向

除上述 9 类外，后续可以继续扩展：

- `resume-session`：恢复 conversation 后继续执行，断言上下文未丢失。
- `content-access`：读取 EPUB、PDF、图片、视频、音频等本地内容。
- `canvas-handoff`：生成 Canvas 目标内容，断言 Canvas JSON 或 Canvas tool call。
- `failure-diagnostic`：故意缺模型、缺 Skill、非法路径，断言 fail-visible diagnostic。
- `cancellation`：长任务取消后，断言队列、任务和资源释放。
- `provider-outage`：模拟 provider 不可用，断言 infrastructure fail。

## 优先级

P0：

- 单条提示词输出。
- Agent 异步任务生成/评审。
- 指定 Skill。
- 触发 Skill。
- 指定 chat/media 模型。

P1：

- 消息队列。
- Agent 连续任务反馈迭代。
- Canvas handoff post check。
- content access 场景。

P2：

- 闭环 controller/judge。
- 并发批量任务。
- provider outage 和取消流程。
- 跨 provider/profile 的质量对比矩阵。

## 当前实现状态

`protocol-smoke.mjs` 当前支持的 manifest `kind`：

- `single-prompt`
- `async-task`
- `explicit-skill`
- `triggered-skill`
- `model-binding`

当前故意 fail-visible 的目标 `kind`：

- `message-queue`
- `closed-loop`
- `concurrent-tasks`
- `iterative-tasks`

这些 unsupported kind 必须在 runner 未实现前被拒绝，不能降级为单 prompt 成功。
