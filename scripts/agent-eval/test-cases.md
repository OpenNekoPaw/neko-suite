# Agent Eval 测试用例文档

本文定义 Neko Agent eval 用例的分类、证据口径和 manifest 设计约定。它面向
`scripts/agent-eval/` 下的开发者验收脚本，不定义 Agent、Canvas、Skill、provider
或媒体生成业务逻辑。

## 目标

- 用真实 Agent 会话链路验证创作行为，而不是只验证单个函数或 mock provider。
- 用统一 case 类型覆盖单轮、多轮、队列、闭环、异步任务、并发任务、Skill 和模型绑定。
- 每个 case 必须给出可审计证据：输入、会话 facts、工具调用、任务状态、产物、评审结论和失败分类。
- eval runner 只做驱动、观察和判断；业务能力仍由 Agent runtime、Skill、Capability、Task 和 provider adapter 拥有。

## 当前自动化基线

当前 `protocol-smoke.mjs` 已能通过 TUI debug automation stdio 协议执行基础用例：

```text
session.create -> message.submit -> session.waitForIdle -> session.facts -> session.dispose
```

`session.facts` 可以提供以下验收证据：

- `model`：当前 chat provider、model、provider expression profile。
- `idle`：前台 turn、后台任务、媒体投递、任务结果观察是否全部 idle。
- `turns`：消息摘要、错误状态、tool calls、tool arguments/result/error。
- `skillActivations`：当前 Skill lifecycle 记录。
- `tasks`：异步任务 id、type、status、progress、error。
- `messageQueue`：队列快照和 pending count。
- `runtimeErrors`：Agent/TUI runtime 可见错误。
- `canvas`：Canvas 相关消息和 tool call 摘要。

当前 manifest 已使用的字段是 `schema`、`defaultCwd`、`defaultTimeoutMs`、`cases[].id`、
`surface`、`prompt`、`expectations`、`postChecks`。下面的 `kind`、`steps`、
`judge`、`assertions`、`model`、`skills` 等字段是目标 schema，用于指导后续 runner
扩展；在 runner 支持前，等价用例可以先拆成单 prompt case 和外部 post check。

## 通用用例结构

```json
{
  "id": "agent.single.cat-image-analysis.v1",
  "kind": "single-prompt",
  "surface": "agent",
  "cwd": "~/Git/neko-test",
  "timeoutMs": 600000,
  "prompt": "生成猫猫玩耍图片，并分析图片内容",
  "expectations": [
    "Agent 发起或请求图片生成任务",
    "Agent 等待图片生成结果后再分析",
    "最终回答描述可见图片内容，而不是复述提示词"
  ],
  "assertions": [
    { "kind": "runtime-errors-empty" },
    { "kind": "final-answer-contains", "text": ["猫", "玩耍"] },
    { "kind": "task-terminal", "type": "image.generate", "status": "completed" }
  ],
  "postChecks": [{ "kind": "artifact-exists", "path": "${OUTPUT_IMAGE}" }],
  "judge": {
    "kind": "rubric",
    "minScore": 4,
    "rubric": ["任务完成度", "产物相关性", "分析是否基于产物"]
  }
}
```

## 质量证据规则

每个 eval case 至少断言以下证据：

- 输入被提交到正确 surface、cwd 和会话。
- `runtimeErrors` 为空，除非 case 明确测试失败路径。
- `idle.fullyIdle` 为 true，不能在后台任务仍运行时判定通过。
- 如果期望工具或 Skill，必须断言 tool call 或 `skillActivations`，不能只看最终文本。
- 如果期望产物，必须断言任务终态和产物存在/可解析/内容符合最低结构。
- 如果期望模型绑定，必须断言 `facts.model` 或媒体模型选择结果，不能只依赖提示词描述。
- 如果有 judge，judge 只能评审结果质量，不替代路径级断言。

失败分类：

- `case fail`：Agent 行为、输出质量、产物或路径断言失败。
- `infrastructure fail`：provider/API 不可用、会话超时、环境资产缺失、runner 无法启动。
- `manifest/config invalid`：manifest schema、cwd、环境变量、模型或 Skill 配置非法。

## 用例类型矩阵

### 1. 单条提示词输出

用途：验证一个 prompt 在完整 Agent 会话中的最终输出。

流程：

```text
create session -> submit prompt -> wait idle -> read facts -> assert final answer/artifacts
```

必须断言：

- 最后一条 assistant turn 非空且不是错误消息。
- 关键内容、结构或产物引用满足 `expectations`。
- 需要工具时，相关 tool call 进入成功或可解释的终态。

示例：

```json
{
  "id": "agent.single.storyboard-outline.v1",
  "kind": "single-prompt",
  "prompt": "根据一个雨夜追逐场景生成 5 镜头分镜表",
  "expectations": ["输出表格或结构化分镜", "包含镜号、景别、画面、动作、声音或备注"]
}
```

### 2. 一组提示词输出，消息队列

用途：验证正在执行的 Agent turn 期间，后续文本消息进入权威队列，并按顺序执行。

流程：

```text
create session -> submit long-running prompt -> submit queued prompts -> assert queue snapshot
-> wait idle/drain -> assert outputs ordered
```

必须断言：

- 第二条及之后的文本消息在首个 turn 运行期间产生 `messageQueue.pendingCount`。
- pending items 顺序与提交顺序一致。
- 队列 drain 后每条提示词都有对应 assistant 输出。
- slash command、Skill invocation、附件等富 payload 不被当成普通文本队列项，除非后续契约明确支持。

目标 manifest：

```json
{
  "id": "agent.queue.storyboard-review-batch.v1",
  "kind": "message-queue",
  "steps": [
    { "submit": "生成一个 10 镜头动作分镜，过程要调用素材生成" },
    { "submitWhileRunning": "把分镜改成更克制的悬疑风格" },
    { "submitWhileRunning": "再输出一个导演审阅清单" }
  ],
  "assertions": [
    { "kind": "queue-pending-count-gte", "count": 2 },
    { "kind": "queue-drained" },
    { "kind": "assistant-turns-gte", "count": 3 }
  ]
}
```

### 3. 闭环反馈提示词输出

用途：验证 runner 能根据上一轮输出生成下一轮提示词，并走完整个反馈流程。

流程：

```text
submit seed prompt -> read output -> controller derives feedback prompt
-> submit feedback -> repeat until exit condition -> judge final result
```

必须断言：

- 每一轮输入都来自上一轮 facts 或产物，而不是固定脚本硬编码成功路径。
- 所有阶段都达到终态，失败时能定位到具体 stage。
- 最终产物比初稿更符合 rubric，或给出明确无法改进的诊断。

目标 manifest：

```json
{
  "id": "agent.closed-loop.poster-iteration.v1",
  "kind": "closed-loop",
  "seedPrompt": "生成一张赛博城市海报并给出设计说明",
  "loop": {
    "maxRounds": 3,
    "feedbackPolicy": "judge-output-to-next-prompt",
    "exitWhen": { "kind": "judge-score-gte", "score": 4 }
  },
  "judge": {
    "kind": "rubric",
    "rubric": ["主题一致性", "画面可描述性", "迭代是否吸收反馈"],
    "minScore": 4
  }
}
```

### 4. Agent 异步任务处理

用途：验证一个 prompt 触发素材生成或外部任务后，Agent 能等待任务结果、观察结果并完成质量评审。

流程：

```text
submit prompt -> observe task created -> wait background tasks idle
-> assert task terminal -> assert artifact -> judge quality
```

必须断言：

- `tasks` 中出现预期 type。
- 任务进入 `completed`，或失败时 Agent 给出可见诊断。
- Agent 不在任务结果返回前编造产物分析。
- 产物可访问、可解析，必要时有 Canvas/Markdown/文件 post check。

示例：

```json
{
  "id": "agent.async.image-generate-review.v1",
  "kind": "async-task",
  "prompt": "生成一张蒸汽朋克书店图片，等待结果后评审构图质量",
  "assertions": [
    { "kind": "task-created", "type": "image.generate" },
    { "kind": "task-terminal", "type": "image.generate", "status": "completed" },
    { "kind": "final-answer-mentions-artifact" }
  ]
}
```

### 5. Agent 并发任务处理

用途：验证批量生成素材时，Agent 能正确跟踪多个任务、避免结果串线，并对批量结果做质量评审。

流程：

```text
submit batch prompt -> observe N tasks -> wait all terminal
-> map outputs to requested items -> judge per-item and aggregate quality
```

必须断言：

- 创建的任务数量与 prompt 要求一致，或有明确的计划/分批说明。
- 每个任务有稳定 id 和对应主题。
- 失败任务不会污染成功任务的评审。
- 最终回答包含批量汇总和逐项质量判断。

目标 manifest：

```json
{
  "id": "agent.concurrent.character-concepts.v1",
  "kind": "concurrent-tasks",
  "prompt": "并发生成 4 个角色概念图：侦探、机械师、祭司、走私者，并逐一评审质量",
  "assertions": [
    { "kind": "task-count-gte", "type": "image.generate", "count": 4 },
    { "kind": "all-tasks-terminal", "type": "image.generate" },
    { "kind": "final-answer-contains", "text": ["侦探", "机械师", "祭司", "走私者"] }
  ]
}
```

### 6. Agent 连续任务处理和迭代

用途：验证“生成素材/评审质量 -> 根据反馈迭代下一轮生成/评审质量”的连续工作流。

流程：

```text
generate artifact v1 -> review v1 -> derive feedback
-> generate artifact v2 -> review v2 -> compare v1/v2
```

必须断言：

- v2 prompt 明确引用 v1 评审中的改进点。
- v2 产物与 v1 是不同轮次的任务或 artifact。
- 终稿质量分数提升，或至少解决指定缺陷。
- 会话 history 保留足够上下文，Agent 没把第二轮当成全新无关任务。

目标 manifest：

```json
{
  "id": "agent.iterative.key-visual-two-rounds.v1",
  "kind": "iterative-tasks",
  "rounds": [
    { "prompt": "生成一个动画企划主视觉并评审质量" },
    { "feedbackFrom": "previous-review", "prompt": "根据上一轮问题迭代主视觉并再次评审" }
  ],
  "assertions": [
    { "kind": "artifact-rounds", "count": 2 },
    { "kind": "iteration-addresses-feedback" },
    { "kind": "judge-score-delta-gte", "delta": 1 }
  ]
}
```

### 7. 指定 Skill 能力

用途：验证显式指定 Skill 后，Agent 使用该 Skill 的方法论或能力完成输出。

流程：

```text
activate skill -> submit prompt -> wait idle -> assert skill activation -> assert output
```

必须断言：

- `skillActivations` 包含指定 Skill。
- 输出体现 Skill 的领域约束，而不是普通聊天回答。
- Skill 不应该承担运行时工具协议、路径协议或 provider schema 教程。

可通过 TUI 命令等价表达：

```text
/skill storyboard-director
把这个 3 段剧情改成 8 镜头分镜
```

目标 manifest：

```json
{
  "id": "agent.skill.explicit-storyboard.v1",
  "kind": "explicit-skill",
  "skills": [{ "name": "storyboard-director", "slot": "domainSkill" }],
  "prompt": "把一场雨夜追逐改成 8 镜头分镜",
  "assertions": [
    { "kind": "skill-active", "name": "storyboard-director" },
    { "kind": "final-answer-contains", "text": ["镜头", "景别", "动作"] }
  ]
}
```

### 8. 触发 Skill 能力

用途：验证用户没有显式 `/skill` 时，Agent 能根据提示词触发合适 Skill 或 capability。

流程：

```text
submit prompt -> routing selects skill/capability -> skill executes -> assert trace/output
```

必须断言：

- 触发条件来自 prompt 语义，而不是 manifest 预激活。
- `skillActivations`、tool calls 或 capability trace 能证明被触发能力实际参与。
- 未触发时必须是可见失败或明确诊断，不能静默退化成普通回答并判定成功。

目标 manifest：

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

### 9. 指定模型能力

用途：验证 chat、image、video、audio 等模型类型、provider、模型 ID、profile 的绑定和实际调用。

流程：

```text
create session with chat model -> set media model overrides if needed
-> submit prompt -> assert facts.model and media/tool binding -> judge output
```

必须断言：

- chat provider/model/profile 与 case 配置一致。
- image/video/audio 生成使用对应类别的模型绑定。
- 模型缺失、禁用、类型不匹配或 profile 不存在时 fail-visible。
- 不能回退到其它模型后仍判定成功。

TUI 命令等价表达：

```text
/model openai:gpt-4.1
/media image fal:imagen4
/media video runway:gen-4
/media audio elevenlabs:tts-v1
```

目标 manifest：

```json
{
  "id": "agent.model.profile-image-provider.v1",
  "kind": "model-binding",
  "model": {
    "chat": {
      "providerId": "openai",
      "modelId": "gpt-4.1",
      "providerExpressionProfileId": "creative-review"
    },
    "media": {
      "image": { "providerId": "fal", "modelId": "imagen4" }
    }
  },
  "prompt": "用指定图片模型生成奇幻森林概念图，并用 chat 模型评审画面层次",
  "assertions": [
    { "kind": "chat-model-is", "providerId": "openai", "modelId": "gpt-4.1" },
    { "kind": "media-model-is", "category": "image", "providerId": "fal", "modelId": "imagen4" },
    { "kind": "task-terminal", "type": "image.generate", "status": "completed" }
  ]
}
```

## 扩展用例类型

后续可以继续增加以下 case 类型：

- `resume-session`：恢复指定 conversation 后继续执行，断言上下文没有丢失。
- `content-access`：读取图片、EPUB、PDF、视频、音频等本地内容，断言走 content access runtime。
- `canvas-handoff`：生成 Canvas 目标内容，断言 Canvas JSON 或 Canvas tool call 结构。
- `failure-diagnostic`：故意配置缺失模型、缺失 Skill、非法路径，断言返回可见 diagnostic。
- `cancellation`：长任务中取消 turn，断言任务和队列按契约清理。
- `provider-outage`：模拟 provider 不可用，断言分类为 infrastructure fail。

## 命名规范

case id 使用稳定、可过滤的点分层：

```text
agent.<kind>.<domain-or-capability>.<short-goal>.v<version>
```

示例：

- `agent.single.image.cat-analysis.v1`
- `agent.queue.storyboard.review-chain.v1`
- `agent.async.image.generate-review.v1`
- `agent.skill.explicit.storyboard-director.v1`
- `agent.model.image.fal-imagen4.v1`

文件组织建议：

```text
scripts/agent-eval/scenarios/
  creative-workflows.scenarios.json
  skill-routing.scenarios.json
  model-binding.scenarios.json
  queue-and-loop.scenarios.json
```

## 评审 Rubric

素材生成/评审质量类用例默认采用 0-5 分 rubric：

| 维度       | 说明                                                  |
| ---------- | ----------------------------------------------------- |
| 任务完成度 | 是否完成 prompt 要求的产物、结构和数量                |
| 路径正确性 | 是否命中预期 Skill、tool、task、provider/model        |
| 产物有效性 | 文件、Canvas JSON、Markdown、媒体引用是否存在且可解析 |
| 内容相关性 | 输出是否基于真实产物/输入内容，而不是复述提示词       |
| 反馈吸收   | 迭代用例是否采纳上一轮评审意见                        |
| 错误可见性 | 失败时是否给出明确 diagnostic，且没有静默 fallback    |

默认通过线：

- smoke：关键路径断言通过即可。
- quality：平均分不低于 4，且路径正确性、错误可见性不得低于 4。
- release：平均分不低于 4，所有 mandatory assertions 必须通过，不能有未分类 runtime error。

## 落地优先级

P0：

- 单条提示词。
- 指定 Skill。
- 触发 Skill。
- 指定 chat/media 模型。
- 异步任务生成并等待结果。

P1：

- 消息队列。
- 连续迭代任务。
- Canvas handoff post check。
- content access 场景。

P2：

- 闭环 controller/judge。
- 并发批量任务。
- provider outage 和取消流程。
- 跨 provider/profile 的质量对比矩阵。
