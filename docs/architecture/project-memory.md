# 项目级 Agent 记忆架构

> 日期: 2026-03-22
> 状态: 已实现

---

## 背景

`AgentSession` 的 `InMemorySessionMemory` 是纯内存实现，进程退出后全部丢失。用户需要在每次新会话中重复交代项目规约、偏好、关键决策等背景信息。

本方案通过 `.neko/memory.md` 文件实现跨会话的项目级 Agent 记忆：Agent 可在会话中通过 `MemoryWrite` 工具主动写入记忆，下次会话启动时自动注入 system prompt。

---

## 架构总览

```
.neko/memory.md
      │
      ├─ 读取（session init）
      │    └─ FileProjectMemoryManager.load()
      │         └─ SystemPromptComposer.setSection({
      │              layer: 'environment',  // 2000 token budget
      │              id:    'memory:project',
      │              priority: 60
      │            })
      │
      └─ 写入（Agent 调用 MemoryWrite 工具）
           └─ FileProjectMemoryManager.upsertEntry / removeEntry
                └─ emit('change') → promptComposer 自动更新（会话内实时生效）
```

**共享运行时**：TUI 和 Extension Host 均为 Node.js 环境，通过 `createFileProjectMemoryManager()` 工厂函数共用同一套实现，注入 `node:fs/promises`。

---

## 文件格式

`.neko/memory.md` 使用 H2 (`##`) 作为可寻址的节键：

```markdown
## User Preferences
- 使用中文回复
- 使用项目 Logger 代替 console.log

## Project Architecture
- 消息协议：Extension ←postMessage→ Webview
- 跨会话记忆路径：.neko/memory.md

## Recent Decisions
- [2026-03-22] 使用 FileProjectMemoryManager 作为文件持久化基础
```

`upsertEntry(key, content)` 找到 `## {key}` 与下一个 `##` 之间的范围并替换；不存在时末尾追加。`removeEntry(key)` 删除对应节。

---

## 核心组件

### 接口（neko-types）

```typescript
// packages/neko-types/src/types/project-memory.ts
interface IProjectMemoryManager {
  load(): Promise<void>;
  getContent(): string | null;
  upsertEntry(key: string, content: string): Promise<void>;
  removeEntry(key: string): Promise<void>;
  on(event: 'change', listener: (content: string | null) => void): void;
  off(event: 'change', listener: (content: string | null) => void): void;
}
```

### 实现（@neko/agent）

`FileProjectMemoryManager`（`agent/src/memory/project-memory-manager.ts`）：
- 内存缓存 `_content`，`load()` 从文件初始化
- `upsertEntry`/`removeEntry` 即时写文件 + 触发 `'change'` 事件
- `createFileProjectMemoryManager(filePath)` 工厂函数，注入 `node:fs/promises`

### MemoryWrite 工具

```
名称:   MemoryWrite
分类:   system
确认:   requiresConfirmation = false（Agent 直接写，无需用户批准）
参数:   action: 'upsert' | 'remove'
        key:    节标题（e.g. "User Preferences"）
        content: 节内容（upsert 时必填）
```

### Session 集成

`initializeSession()`（`agent-session-initializer.ts`，Step 7）在创建 `SystemPromptComposer` 后：

```typescript
if (config.projectMemoryManager) {
  const injectMemory = (content: string | null): void => {
    if (content) {
      promptComposer.setSection({
        id: 'memory:project', layer: 'environment',
        content: `## Project Memory\n\n${content}`, priority: 60,
      });
    } else {
      promptComposer.removeSection('memory:project');
    }
  };
  injectMemory(config.projectMemoryManager.getContent());
  config.projectMemoryManager.on('change', injectMemory);  // 会话内实时刷新
}
```

---

## 数据流

```
会话启动
  runner.ts / agentRunner.ts
    → createFileProjectMemoryManager(workDir + '/.neko/memory.md')
    → memoryManager.load()                   // 从文件读入缓存
    → createCoreTools({ projectMemoryManager })  // 注册 MemoryWriteTool
    → createAgentSession({ projectMemoryManager })
         → initializeSession()
              → promptComposer.setSection('memory:project')  // 注入 system prompt

会话中
  LLM 调用 MemoryWrite(action='upsert', key='...', content='...')
    → FileProjectMemoryManager.upsertEntry()
         → 写 .neko/memory.md
         → emit('change', newContent)
              → promptComposer.setSection('memory:project', ...)  // 实时更新
    → 下次 LLM 调用时，新内容已在 system prompt 中

下次会话
  memoryManager.load() 读取 .neko/memory.md
  → 新内容自动注入 system prompt ✅
```

---

## 各端实现差异

| 端 | 创建位置 | 工具注册位置 |
|----|----------|-------------|
| TUI | `cli-tui/src/core/runner.ts`（`runAgent` 前） | `createCoreTools({ projectMemoryManager })` |
| Extension | `extension/src/ai/agentRunner.ts`（`configure()` 中） | `config.platform.tools.register(new MemoryWriteTool(...))` |

两端均通过 `createAgentSession({ ..., projectMemoryManager })` 传入，Session 侧逻辑完全共用。

---

## 与 AGENTS.md 的区别

| | AGENTS.md | `.neko/memory.md` |
|--|-----------|-------------------|
| 写入者 | 用户（人工编辑） | Agent（通过 MemoryWrite 工具） |
| 内容 | 指令、偏好、规则 | 学习到的事实、决策、观察 |
| 注入层 | `base` 或 `environment` | `environment`（priority 60） |
| 格式控制 | 用户自由定义 | `## Section` 结构化节 |

---

## 涉及文件

| 文件 | 操作 |
|------|------|
| `neko-types/src/types/project-memory.ts` | 新建：`IProjectMemoryManager` 接口 |
| `neko-types/src/types/index.ts` | 修改：导出新接口 |
| `agent/src/memory/project-memory-manager.ts` | 新建：`FileProjectMemoryManager` 实现 |
| `agent/src/memory/index.ts` | 修改：导出实现类 |
| `agent/src/tools/core/memory-write-tool.ts` | 新建：`MemoryWriteTool` |
| `agent/src/tools/core/core-tools.ts` | 修改：`CoreToolsOptions.projectMemoryManager?` |
| `agent/src/tools/core/index.ts` | 修改：导出 `MemoryWriteTool` |
| `agent/src/session/types.ts` | 修改：`AgentSessionConfig.projectMemoryManager?` |
| `agent/src/session/agent-session-initializer.ts` | 修改：Step 7 注入 + 订阅 change |
| `agent/src/index.ts` | 修改：导出新类和工具 |
| `cli-tui/src/core/runner.ts` | 修改：创建 manager，传给 tools + session |
| `extension/src/ai/agentRunner.ts` | 修改：创建 manager，注册工具 + 传给 session |

---

## P2 待办

- 全局 `~/.neko/memory.md`（个人偏好，跨项目）
- Memory 自动压缩（超出 token budget 时 Agent 归纳旧条目）
- `MemoryRead` 工具（Agent 主动按 key 查询，不依赖 system prompt 注入）
- VSCode 文件监听（外部编辑 memory.md 后热重载）
