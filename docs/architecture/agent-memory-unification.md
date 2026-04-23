# Memory Unification — Journal / ConversationRecord / Compact / Memory 四合一

**状态**: Proposed
**日期**: 2026-04-24
**关联范围**: neko-agent · @neko/shared · 所有 Skill / Hook / UI resume 路径
**关联文档**:

- [agent-unified-workflow.md](./agent-unified-workflow.md) — IDC §7.4 `.neko/` 布局 + §11.6.9 Evaluator 平面；本 ADR 关闭 §已延后表的 `.nksession.md` / `派生索引` 两项
- [agent-multi-agent-federation.md](./agent-multi-agent-federation.md) — Federation 对持久化施加 "Root-owned artifact" 约束；本 ADR 的 Journal 分片方案必须兼容 subagent 侧链（`conversationId_sub_{id}.jsonl`）
- [creative-context-compression.md](./creative-context-compression.md) — 七级优先级语义分类压缩策略；本 ADR 保留该策略作为 Compact 实现，但把"压缩结果"从"丢弃"改为"持久化成事件"

**取代说明**：当前 `session/journal-*.ts` / `session/conversation-record.ts` / `context/conversation-compressor.ts` / `memory/*` 四个子系统各自为政。本 ADR 定义**统一事实源（SSOT）**，四者降级为 SSOT 的不同**视图 / 投影 / 工具**。现有代码全部保留兼容，通过分期迁移收敛到新模型。

---

## 1. 背景

### 1.1 现状精确摘要

调研发现四个子系统各管一段，互相不通：

| 子系统 | 存储位置 | 格式 | 生命周期 |
|---|---|---|---|
| **Journal** | `~/.neko/journals/{conversationId}.jsonl` | JSONL 事件流（`event` / `snapshot` / `subagent_ref`）| 文件级持久，手动 cleanup |
| **ConversationRecord** | `~/.neko/conversations/{workDir-hash}.json` | 聚合 JSON（`ChatMessage[]` 列表）| 按 workDir 持久，100 条 FIFO |
| **Compact** | **纯内存** | `CompressedMessage[]`（含 isSummary 标记）| 进程退出即丢 |
| **Memory** | 三分身：`.neko/memory.md` / `~/.neko/global-memory.md` / 内存 Map | Markdown H2 section / in-memory KeyFact | 前两者持久，session memory 纯内存 |

### 1.2 观察到的问题

**P1 — 数据双写**
`ChatMessage[]` 同时出现在 Journal（从 `tool_call` / `tool_result` 事件重建）和 ConversationRecord（直接 JSON 序列化）。两者共存但没有对账关系：Journal 是事件流、ConversationRecord 是聚合快照，用户在 UI 看到的对话和 Journal 能重建的对话可能漂移（且无法验证）。

**P2 — 身份碎片化**
同一次会话被 4 套 ID 切割：

| ID | 出处 | 作用域 |
|---|---|---|
| `conversationId` | Journal 路径 | 一次 session 的 JSONL 文件名 |
| `sessionId` | SessionMemory.saveSession() | KeyFact map 的 key（默认 `'default'`）|
| `workDir-hash` | ConversationRecord 存储路径 | 工作目录维度的粒度 |
| `id`（ConversationRecord 内部）| FileConversationStorage 缓存 key | 与 conversationId 无关联 |
| `runId` | IDC artifact | 每个 Draft/Plan/Apply 轮次 |

重启后想找回"某次对话"：要同时知道 workDir-hash + record.id + conversationId 才能重建状态。Journal 的 `conversationId` 和 ConversationRecord 的 `id` **完全独立**，没有任何字段把它们串起来。

**P3 — Compact 是信息泄漏**
压缩 = 删除。原始老消息在下一次 Compress 后只存在于 Journal 的事件流里，但用户 / Skill 没有"读压缩前历史"的 API。Compact 摘要本身也不写入 Journal，下次恢复 session 时需要重新压缩（或者干脆不压缩，把 Journal 全部重放加载回来 —— 但那就失去了压缩的意义）。

**P4 — Session Memory 是伪持久化**
`InMemorySessionMemory` 接受 `saveSession(sessionId, facts)` 调用，但**底层是 `Map<string, SessionMemoryEntry>`，进程退出即丢**。文档宣称"跨 session 持久化 KeyFact"是假的；真正跨 session 的记忆只有 Project Memory / Global Memory（需要 MemoryWriteTool 或用户手动写）。

**P5 — Memory 三分身语义漂移**
Project / Global / Session 三个 manager 有几乎相同的接口，但：

- Project / Global 存 markdown H2 section
- Session 存 KeyFact 结构体
- 三者注入系统提示走三个不同的 PromptModule（MemoryProjectModule / MemoryGlobalModule / MemoryRecallModule）
- 抽取入口（KeyFactExtractor）只写 SessionMemory，不会自动升级到 Project —— 真正的"自动记忆"链条断在最后一步

**P6 — IDC artifacts 不在持久化讨论范围内**
`.neko/drafts/*.md` / `plans/*.md` / `tasks/*.md` 是独立的 run-scoped artifact，既不写 Journal 也不写 ConversationRecord。它们事实上是第五种"持久化"，但归 IDC 管而非持久化平面。本 ADR **不**把 IDC artifact 并入四合一 —— 它们是用户可见的创作产物，性质不同。

### 1.3 为什么现在做

三个触发条件：

1. **Federation ADR（2026-04-24）** 要求 subagent 有 journal 侧链 + 独立 history + 共享 memory。当前四子系统的身份碎片让这种拓扑难实现
2. **SelfEvaluationHooks（PR3f）** 已在 Apply 退出时注入引导，但"引导之后 AI 产生的自评结论" 没有地方写 —— 想让自评结论进 Memory 就得先把 Session Memory 真持久化
3. **`.nksession.md` 一直延后**（agent-unified-workflow.md §已延后）—— 这个会话摘要位置依赖"四合一"的结论，不先做就一直悬空

---

## 2. 目标 / 非目标

### 2.1 目标

**G1 单一事实源（SSOT）**
Journal 升格为**所有持久化信息的权威来源**。任何对会话状态的查询（包括 UI 显示的历史、Memory 注入的 KeyFact、compact 之前的原始消息）都能从 Journal 重建 —— 其他存储都是 Journal 的**投影 / 缓存 / 视图**。

**G2 身份统一**
一个 `ConversationId` 绑定一场对话的全部持久化。workDir-hash / sessionId / record.id 全部废弃或降级为 Journal 内字段。

**G3 Compact 不丢信息**
压缩事件本身写入 Journal（哪些消息被替换、替换成什么摘要、压缩时的 token 剖面）。下次恢复时既能选择"走压缩路径"（快 / 省 token），也能选择"展开到未压缩"（全量回溯）。

**G4 Memory 层清晰**
Project / Global / Session 保留但角色明确：

- **Working / Episodic / Semantic** 三层金字塔，按时间尺度和访问频率区分
- Semantic 层统一抽取入口：Journal 事件 → KeyFactExtractor → Semantic Memory（自动），而非当前"停在 Session Memory 不再往上流"

**G5 向后兼容**
现有 API 保留至少一个 release cycle。新模型通过 `PersistenceV2` flag 逐步启用。非 opt-in 的调用继续走旧路径。

### 2.2 非目标

**N1 跨进程 / 多 session 并发写同一 Journal**
单 session 单 writer。并发写由更高层（如 orchestrator）负责排队。

**N2 IDC artifact 并入 Journal**
`.neko/drafts/*.md` 等产物是用户可见文件，不是 runtime 事件。保留 IDC 所有权。

**N3 把 Memory markdown 格式改为结构化**
Project/Global memory 当前是 markdown H2 section（用户可手动编辑）。**保留**。本 ADR 只改"如何产生这些 section"而不改"section 自身是什么"。

**N4 实现 Event Sourcing 的全部范式**
不做 CQRS / Projection rebuild on startup / Snapshot-based compaction of Journal 本身。Journal 仍是 append-only JSONL，快照仍是现有 `JournalWriter.appendSnapshot` 语义。

**N5 统一 `.neko/logs/*.jsonl`**
`logs/events.jsonl`（EventBus 通用事件）/ `audits.jsonl`（Approval 决策）/ `steps.jsonl`（ReAct step 日志）是跨 agent 的横向日志，不是单 session 的持久化，不并入。

### 2.3 约束

- Node.js 单进程，单 session 单 JournalWriter
- JSONL 追加必须 O(1)（避免重写整个文件）
- Project Memory markdown 格式是**向外承诺**（用户文档说"你可以编辑 `.neko/memory.md`"）—— 不可变
- 现有 `ConversationRecord` 被 Extension / TUI 直接读 —— 不能直接 breaking

---

## 3. 术语

| 术语 | 定义 |
|---|---|
| **Journal** | 单 session 的 append-only 事件流，是 SSOT |
| **Event** | Journal 的最小持久化单元，含类型 / 时间戳 / payload |
| **Record** | 对 Journal 做只读聚合得到的数据结构（UI 显示、resume 加载）|
| **Projection** | Journal → Record 的单向推导过程 |
| **Snapshot** | 某一时刻的 Record 物化缓存，用于加速 resume（替代全量 replay）|
| **Working Memory** | 当前进程内的活动 `ChatMessage[]`，受 Compact 约束 |
| **Episodic Memory** | 持久化的"这次会话做了什么"—— 就是 Journal 本体 |
| **Semantic Memory** | 跨会话的"积累的事实"—— Project / Global memory + 它们的自动抽取管道 |
| **Compaction Event** | Journal 中一种新事件类型，记录一次 Compact 的输入/输出/摘要 |

---

## 4. 核心模型：三层记忆金字塔 + Journal 作为基座

```
                       ┌──────────────────────┐
                       │  Semantic Memory     │  跨会话持久化的事实
                       │  .neko/memory.md     │  低频写、高频读
                       │  ~/.neko/global-*.md │
                       └─────────┬────────────┘
                                 │ KeyFactExtractor (on Journal events)
                       ┌─────────┴────────────┐
                       │  Episodic Memory     │  单会话完整事件流
                       │  = Journal           │  高频写（事件级）、偶尔读（resume）
                       │  ~/.neko/journals/   │
                       └─────────┬────────────┘
                                 │ Projection (ConversationRecord) + Compact
                       ┌─────────┴────────────┐
                       │  Working Memory      │  当前 ReAct loop 的活跃上下文
                       │  AgentSession._history│  高频读写、Compact 约束
                       │  (in-memory only)    │
                       └──────────────────────┘
```

### 4.1 数据流

```
User input
    │
    ▼
Working Memory (append)
    │
    ▼
Journal (persist event: user_message)
    │
    ▼
LLM call → response → tool calls → results
    │
    ▼
Working Memory (append)
    │
    ▼
Journal (persist events: assistant_text / tool_call / tool_result)
    │
    ▼
[every N turns / token threshold]
Compact runs on Working Memory
    │
    ├─ replaces old messages in-memory
    └─ persists compaction event to Journal
         (references original event ids + writes summary payload)
    │
    ▼
[at session end or each turn]
KeyFactExtractor scans new Journal events
    │
    ├─ extracts candidate facts
    └─ writes to Semantic Memory file (.neko/memory.md)
         via MemoryWriteTool pipeline (dedup + user approval if configured)
    │
    ▼
[next session starts]
Semantic Memory → injected into system prompt via MemoryProjectModule/GlobalModule
Episodic Memory → loaded via Journal Projection (optional, per user action)
Working Memory → bootstrapped from projection if "continue previous"
```

### 4.2 关键翻转：谁是谁的视图

| 旧模型 | 新模型 |
|---|---|
| ConversationRecord 存 history，Journal 存事件（两份独立数据）| Journal 是 SSOT，ConversationRecord 是 Journal 的 **投影缓存**（定期 rebuild）|
| Compact 替换 history、扔掉原始 | Compact 只改 Working Memory；原始 + 摘要都写 Journal |
| SessionMemory 存 KeyFact 但不持久化 | SessionMemory 概念**移除**；KeyFact 是 Journal 事件的派生产物，直接送去 Semantic Memory |
| Project / Global / Session 三个 manager 对等 | Project / Global 是 Semantic Memory 的两个存储后端；Session 不存在 |

---

## 5. Journal 升格为 SSOT

### 5.1 事件类型扩展

现有 Journal 事件（`packages/neko-agent/packages/agent/src/session/journal-writer.ts`）已涵盖 `thinking` / `text_delta` / `tool_call` / `tool_result` / `version_recorded` / `error`。本 ADR 新增三类事件：

```ts
// 新增 1：用户消息（当前只有 assistant 事件）
interface UserMessageEvent {
  type: 'user_message';
  content: string | ContentBlock[];
  timestamp: number;
  eventId: string;
}

// 新增 2：压缩事件
interface CompactionEvent {
  type: 'compaction';
  trigger: 'token_threshold' | 'turn_threshold' | 'manual';
  replacedEventIds: string[];           // 被替换掉的老事件 id 列表
  summaryContent: string;                // 摘要文本
  summaryMessageRole: 'system' | 'user'; // 在 Working Memory 里以什么角色呈现
  tokenProfile: { before: number; after: number };
  strategy: 'basic' | 'creative-priority';
  timestamp: number;
  eventId: string;
}

// 新增 3：记忆抽取事件
interface MemoryExtractionEvent {
  type: 'memory_extraction';
  sourceEventIds: string[];             // 从哪些事件里抽的
  facts: Array<{
    id: string;
    content: string;
    category: 'fact' | 'preference' | 'decision' | 'warning';
    confidence: number;
    destination: 'project' | 'global';
  }>;
  writeStatus: 'pending' | 'written' | 'rejected-by-user' | 'dedup';
  timestamp: number;
  eventId: string;
}
```

每个事件必须有 `eventId`（ulid，时间有序），使 `replacedEventIds` / `sourceEventIds` 的引用稳定。

### 5.2 引入 `eventId`（迁移破坏点）

当前 Journal 事件没有 stable id（只有 `seq` 序号）。`eventId` 是**新字段**，迁移期用 `seq` 或 `seq-${timestamp}` 回填。Federation 的 Journal 侧链也用同样的 id 空间。

### 5.3 Projection API

```ts
interface IJournalProjection {
  // 把 Journal 读成 ChatMessage[]（给 resume / UI 用）
  projectToHistory(
    conversationId: string,
    options?: {
      includeCompacted?: boolean;  // false: 用摘要替换被 compact 的老消息；true: 展开到原始
      upToEventId?: string;         // 截止到某事件，用于 time-travel
    }
  ): Promise<ChatMessage[]>;

  // 把 Journal 的关键事件抽成结构化的会话摘要
  projectToSummary(conversationId: string): Promise<ConversationSummary>;

  // 查找所有某类事件
  filterEvents<T extends JournalEventType>(
    conversationId: string,
    type: T
  ): AsyncIterable<JournalEventOf<T>>;
}
```

`projectToHistory(..., { includeCompacted: false })` 替代当前 ConversationRecord 的加载路径（§6）。

---

## 6. ConversationRecord 降级为投影缓存

### 6.1 取消独立存储语义

当前 `ConversationRecord` 是 **聚合 JSON 文件，独立于 Journal 存储**。新模型下：

- **持久化来源**：消失。Record 不再独立写 JSON 文件。
- **数据来源**：调 `JournalProjection.projectToHistory(convId)` 按需生成。
- **缓存策略**：热数据（最近 10 条会话）在内存 LRU；冷数据现读现算。
- **workDir-hash 索引**：改为"`~/.neko/conversations-index.json` 存 `{workDir: [conversationId...]}` 映射"，只是索引不含内容。

### 6.2 API 兼容

`FileConversationStorage.load(id)` 保留但内部改为：

```ts
async load(id: string): Promise<ConversationRecord | undefined> {
  const history = await this.projection.projectToHistory(id);
  const meta = await this.index.getMeta(id);
  if (!meta) return undefined;
  return {
    id: meta.conversationId,
    version: 2,
    title: meta.title,
    workDir: meta.workDir,
    messages: history,
    createdAt: meta.createdAt,
    updatedAt: meta.lastEventAt,
    source: 'journal-projection',
    ...(meta.mediaModelSelection && { mediaModelSelection: meta.mediaModelSelection }),
  };
}
```

`save()` 变 no-op（或只更新 index meta，不写 messages）。Extension / TUI 无需改动。

### 6.3 性能

100 条 ChatMessage 的 projection 实测约 2-5ms（取决于 tool_result payload 大小）。LRU cache 命中后是 O(1)。对 resume 场景（1-2 次 load per session 启动）完全可接受。

---

## 7. Compact 改造：事件化 + 可展开

### 7.1 压缩生成事件而非替换

现在：

```ts
// context/conversation-compressor.ts (简化)
compress(messages): { messages: CompressedMessage[] } {
  // 决定哪些老消息被 drop / summarize
  // 返回新的 messages 数组
  // 调用方：session.history = result.messages
}
```

新：

```ts
compressAndLog(
  messages: ChatMessage[],
  journal: IJournalWriter,
): Promise<{
  workingMemory: ChatMessage[];      // 新的活跃上下文（= 旧的 messages 字段）
  compactionEvent: CompactionEvent;  // 写入 journal
}> {
  const decision = this.strategy.decide(messages);
  const event: CompactionEvent = {
    type: 'compaction',
    trigger: decision.trigger,
    replacedEventIds: decision.replacedEventIds,
    summaryContent: decision.summary,
    ...
  };
  await journal.append(event);
  return { workingMemory: decision.newMessages, compactionEvent: event };
}
```

### 7.2 展开恢复

当用户需要看"完整历史"（调试 / 回溯 / 导出），`projectToHistory(..., { includeCompacted: true })` 反解 `replacedEventIds` 把原始消息塞回 projection 输出。

### 7.3 Circuit breaker 保留

现有 `AutoCompactState` 的 3 次失败断路 30 分钟逻辑保留不变。失败也是事件（`compaction_failed`），写 Journal 便于观测。

---

## 8. Memory 三层金字塔落地

### 8.1 删除 Session Memory 概念

`InMemorySessionMemory` 是误导性命名（根本不持久化）。**本 ADR 提议移除**：

- `SessionMemory` 接口标记为 `@deprecated`
- `MemoryHooks.sessionMemory` 字段永远为 undefined（或接受但 no-op）
- KeyFact 的去处改为 **直接走 Semantic Memory 的抽取管道**

### 8.2 统一 KeyFact 抽取管道

```
Journal events (new / unextracted)
    │
    ▼
KeyFactExtractor.extract(events)   ← 保持现有启发式实现
    │
    ▼  Array<KeyFact>
MemoryRouter.route(facts)
    │
    ├─ dedup against existing Project Memory
    ├─ dedup against existing Global Memory
    └─ decide destination (project vs global vs discard)
           │
           ▼
    MemoryWriteTool.upsert(section, content, destination)
           │
           ▼
    MemoryExtractionEvent → Journal    (闭环：Journal 事件触发抽取，抽取结果又回到 Journal)
```

**关键**：Semantic Memory 的写入**永远**经过 Journal 留痕。不存在"偷偷改了 memory.md 但没人知道"的路径。

### 8.3 Project vs Global 保留

两个 markdown 文件是**承诺给用户的 UI 契约**，保留：

- 存储：`.neko/memory.md` / `~/.neko/global-memory.md`，H2 section 不变
- 注入：`MemoryProjectModule` / `MemoryGlobalModule` 不变
- 用户手动编辑：允许，change 事件触发 module 刷新（现有 `on('change')` 订阅）
- 区分：Project = 当前 workDir 相关；Global = 跨项目。**边界不变**。

### 8.4 `MemoryRecallModule` 角色

现有 `MemoryRecallModule`（priority 40 ephemeral layer）原本服务 Session Memory。Session Memory 移除后，这个 module 转向承载：

- **临时召回**（per-turn）：基于当前 user query 做 Semantic Memory 子集选择，避免把整份 `.neko/memory.md` 都扔进 prompt（当 memory 文件 > 2KB 时）
- **Self-evaluation 引导后的自评结论**：§11.6.9 的 SelfEvaluationHooks 产生的结论，若被 KeyFactExtractor 判定为 KeyFact，走 MemoryRouter 入 Semantic；否则作为 ephemeral recall 留一轮

---

## 9. 身份统一

### 9.1 ConversationId 规格

```
conversationId = "<workDirHash>-<ulid>"
```

- `workDirHash`: 8 字符 base36，由 workDir 绝对路径 hash（SHA-256 前缀）
- `ulid`: 26 字符时间有序 ID

示例：`a3k2m9qw-01HRT9PZ8K...`

**性质**：

- 包含 workDir 信息 → 不再需要独立 `workDir-hash` 映射
- ulid 时间序 → 可按字典序排序列出"最近的 N 场对话"
- 全局唯一 → Federation subagent 用 `{parentConversationId}/sub-{ulid}` 嵌入

### 9.2 废弃 / 降级的 ID

| ID | 处置 |
|---|---|
| `sessionId` (SessionMemory) | 删除 |
| `workDir-hash` (ConversationRecord 路径) | 并入 conversationId prefix |
| `ConversationRecord.id` | 等于 conversationId |
| `runId` (IDC) | 保留但与 conversationId 正交（一个 conversation 可包含多个 run）|

### 9.3 索引结构

```
~/.neko/
├── journals/
│   └── {conversationId}.jsonl         ← SSOT
├── conversations-index.json            ← workDir → conversationId[] 映射
│                                          + 每个 conversation 的 meta（title / createdAt / tags）
├── memory.md                           ← Semantic Memory (project-scoped, lives in workDir/.neko/)
├── global-memory.md                    ← Semantic Memory (global)
└── (conversations/ 目录删除)
```

---

## 10. 与现有系统集成

### 10.1 IDC artifacts 的关系

IDC artifacts（`.neko/drafts/draft-{runId}.md` 等）**不并入 Journal**。但 artifact 的 **生命周期事件**（`artifact_created` / `artifact_updated` / `artifact_committed`）进 Journal，使"从 Journal 重建 IDC run 历史"可能。

### 10.2 Federation 的 Journal 侧链

Federation ADR §11 定义 subagent 事件写 `{parentConversationId}/sub-{subAgentId}.jsonl`。本 ADR 与之对齐：

- 主 Journal 只有一条 `subagent_spawned` 事件（含子 conversationId 引用）
- 子 Journal 独立完整（不冗余主 Journal 的上下文）
- Projection 跨 Journal 时按需拉取子链（懒加载）

MessageBus 的消息流走主 Journal 的 `agent_message_*` 事件（§Federation 11.1），不再单独存 message log。

### 10.3 Prompt 平面

- `MemoryProjectModule` / `MemoryGlobalModule`：保留，注入路径不变
- `MemoryRecallModule`：语义变更（§8.4）
- 新增 `CompactSummaryModule`（可选）：把最新一次 CompactionEvent 的摘要放入 ephemeral 层，让 LLM 感知 "你之前谈过但被压缩了的事情"

### 10.4 Ablation

新增 toggle：

```ts
interface AblationTogglesPersistence {
  journalAsSSOT?: false;        // 关闭：退回到旧的 Record+Journal 双写
  compactLogging?: false;        // 关闭：Compact 不写 CompactionEvent（退回旧语义）
  autoMemoryExtraction?: false;  // 已存在：保留
  memoryRecall?: false;          // 关闭 MemoryRecallModule 注入
}
```

### 10.5 Self-Evaluation（§11.6.9）

Apply 退出 → SelfEvaluationHooks 注入引导 → AI 产生自评结论（文本）→ 下一轮 tool call 或 text_delta 事件进 Journal → KeyFactExtractor 识别是否是 KeyFact → 走 MemoryRouter 入 Semantic Memory。

**闭环**：原本 "引导之后结论无处可去" 的问题被关闭。

---

## 11. 迁移路径

### 11.1 分期 PR

| PR | 目标 | 破坏性 | 工作量 |
|---|---|---|---|
| **PR-M1** | `eventId` 字段加入 Journal；现有事件迁移时用 `seq` 回填 | 无（仅新增字段）| 0.3d |
| **PR-M2** | 新增 `UserMessageEvent` / `CompactionEvent` / `MemoryExtractionEvent` 事件类型；Journal writer 支持 | 无 | 0.4d |
| **PR-M3** | `IJournalProjection` 接口 + `projectToHistory` 实现 | 无（新模块）| 0.8d |
| **PR-M4** | ConversationRecord 改为 projection-backed；`save()` no-op；保留旧文件读逻辑作 fallback | 中（Extension 侧可能感知到 `source: 'journal-projection'`）| 1d |
| **PR-M5** | `compressAndLog` 替换 `compress`；CompactionEvent 写入生效 | 中（Hook 签名变）| 0.5d |
| **PR-M6** | Compaction 展开能力（`includeCompacted: true` 分支）| 无 | 0.3d |
| **PR-M7** | KeyFactExtractor → MemoryRouter → MemoryWriteTool 自动管道 | 中（Session Memory 弃用）| 1d |
| **PR-M8** | ConversationId 新规格 + conversations-index.json；旧 conversationId 透明迁移 | 高（数据迁移脚本）| 1.5d |
| **PR-M9** | SessionMemory 删除；Ablation toggles 加 4 项；CLAUDE.md 更新 | 中 | 0.3d |

**总量**：~6 工程日。PR-M1..M7 无破坏，PR-M8..M9 是数据迁移 + 清理。

### 11.2 兼容窗口

- PR-M1..M4 合并后：旧 ConversationRecord JSON 文件继续读（fallback），新会话写新格式
- PR-M5..M7 合并后：旧会话的 Compact 仍走老路径（in-memory），新会话带 CompactionEvent
- PR-M8 上线一次性迁移脚本：扫描 `~/.neko/conversations/*.json`，对应 Journal 不存在则生成对应的 `conversations-index.json` 条目
- PR-M9 正式删除 SessionMemory 接口；同版本 CLAUDE.md 标注 deprecation

### 11.3 回滚策略

所有改动受 `AblationToggles.journalAsSSOT = false` 控制：

- 关闭时：所有子系统走旧路径
- 打开时：Journal projection / compaction event / extraction pipeline 全部启用

Runtime 可切换（重建 AgentSession 生效）。PR-M8 的数据迁移不可回滚，但保留旧文件备份 30 天。

---

## 12. 替代方案

### 12.1 不做，继续维护四套系统

**pros**：零工作量
**cons**：P1-P6 的所有问题累积；Federation / SelfEval 的闭环无法实现；`.nksession.md` 延后项永远延后

**拒绝**：已有积压证明现状不可持续。

### 12.2 把 Journal 也删除，只保留 ConversationRecord + Memory

ConversationRecord 扩展成结构化记录（含 tool calls、thinking），Journal 废弃。

**pros**：一个文件而非两个
**cons**：失去事件流 semantics；audit / replay / time-travel 全部做不到；Federation 的 Journal 侧链需要重新设计

**拒绝**：Event Sourcing 的价值大于"少一个文件"的便利。

### 12.3 把 Memory 也并入 Journal

Semantic Memory 不再是 markdown 文件，直接从 Journal projection。

**pros**：更彻底的 SSOT
**cons**：破坏"用户可以手动编辑 `.neko/memory.md`" 的 UI 契约；markdown diff 可读，JSONL projection 难读

**拒绝**：markdown 文件是用户接触面，不可内化。

### 12.4 引入外部数据库（SQLite）

Journal + ConversationRecord + Memory 全走 SQLite。

**pros**：查询效率高、ACID
**cons**：引入依赖（neko-agent 当前纯文件系统）；移植性差；与 VSCode 文件系统约定不符；Journal 的 append-only + crash-safe 性质已由 JSONL 天然提供

**拒绝**：本地单用户场景不值得。

---

## 13. 未决问题

### Q1 迁移脚本的失败处理

PR-M8 扫描 `~/.neko/conversations/*.json` 时若发现没有对应 Journal，应：
(a) 为它合成一个最小 Journal（包含 `projectFromLegacy` 标记）
(b) 忽略，用户在 UI 显示"legacy conversation"，只读不能恢复

**立场**：倾向 (b)，但待用户反馈。

### Q2 Semantic Memory 写入的 approval 时机

自动抽取→写 memory.md 当前是直接写。改造后是否每个 MemoryExtractionEvent 都要走 ApprovalEngine？

**立场**：配置字段 `approveMemoryWrites?: boolean`，本地单用户默认 false，团队模式默认 true。但**此 ADR 不实现**，留给 memory-approval follow-up。

### Q3 Compact 摘要是否要纳入 memory 抽取

`CompactionEvent.summaryContent` 本身是高密度信息，是否也送 KeyFactExtractor？

**立场**：不自动送。摘要是 Working Memory 用的，不是 Semantic Memory 材料。手动路径（用户命令）保留。

### Q4 Journal 自身的 compaction

Journal 文件本身会无限增长。是否需要"老事件打包 + 生成 snapshot + 清理"机制？

**立场**：本 ADR 不做。现有 `JournalStorage.cleanup(olderThanMs)` 以天为单位的时间粒度删文件，够用。未来如需 journal-compaction 单独 ADR。

### Q5 Cross-session memory recall 的检索方法

`MemoryRecallModule` 要从可能 10KB 的 `memory.md` 里选 200 token 放到 prompt —— 用什么方法？

**立场**：初期用"关键词匹配 + 最近 N 条"朴素策略；进阶走 embedding（复用 ScriptIndex 基础设施）。ADR 不决定算法。

---

## 14. 变更记录

| 日期 | 变更 | 影响 |
|---|---|---|
| 2026-04-24 | 初版（Proposed）| 定稿，尚未实施 |

---

## 附：四合一前后对照

### 合并前（2026-04-24 现状）

```
Journal                      ConversationRecord             Compact (in-mem)              Memory
  ~/journals/*.jsonl           ~/conversations/*.json         context/compressor            .neko/memory.md
  events: thinking/tool_*      aggregated ChatMessage[]       returns new array             ~/.neko/global-memory.md
  snapshot: {history,...}      per-workDir, max 100           drops old messages            + InMemorySessionMemory (fake)
  conversationId                record.id (独立)               (transient)                   3 × Module 注入

      ❌ 数据双写        ❌ 身份碎片        ❌ 压缩信息泄漏        ❌ Session Memory 不持久化
```

### 合并后（本 ADR）

```
Journal (SSOT, append-only)
  ~/journals/{conversationId}.jsonl
  events: user_message / assistant_* / tool_* / compaction / memory_extraction / ...
  snapshot: materialized view pointer
  conversationId = workDirHash-ulid （唯一身份）
       │
       ├─── Projection → ConversationRecord (lazy, cached)
       │                         │
       │                         └→ Extension / TUI 读同一份聚合
       │
       ├─── Compaction writes summary + replacedIds back into Journal
       │                         │
       │                         └→ "展开" 查询可恢复原始 history
       │
       └─── MemoryExtraction events → MemoryRouter → Semantic Memory
                                            │
                                            ├→ .neko/memory.md (Project)
                                            └→ ~/.neko/global-memory.md (Global)

       ✅ 单 SSOT      ✅ 身份统一      ✅ Compact 可回溯      ✅ 记忆自动管道闭环
```
