# 对话持久化架构

> 日期: 2026-03-22
> 状态: 设计完成，待实现

---

## 背景

neko-agent 支持两种入口：VSCode Extension（Webview）和 CLI/TUI。两者均需要对话历史持久化，
以支持 Resume（恢复历史会话）功能。需要明确两端是否共享存储，以及如何定义序列化格式。

---

## 当前状态

```
Extension (Webview)                      TUI/CLI
────────────────────────────             ────────────────────────────
ConversationMessage[]                    ChatMessage[]
  ├─ contentBlocks (显示层)               ├─ role
  │   ├─ thinking blocks                 ├─ content
  │   ├─ text blocks                     ├─ toolCalls?
  │   └─ tool_call blocks                └─ toolResults?
  ├─ toolCalls (legacy)
  └─ thinking, id, timestamp...

存储后端：                                存储后端：
VscodeConversationStorage                无持久化（纯内存）❌
→ context.workspaceState ✅
```

Tasks 状态：
- Extension：`VSCodeTaskStorage` → `globalState`（7 天保留）✅
- TUI：`FileTaskStorage` → `~/.neko/tasks.json` ✅

---

## 核心区分：Resume 协议 vs 显示协议

```
Resume 协议（共同需要）              显示协议（各自独有）
─────────────────────────           ─────────────────────────────
ChatMessage[]                       ConversationMessage[]
  role, content,                      contentBlocks（streaming）
  toolCalls, toolResults              thinking blocks
                                      UI metadata、timestamps
```

**Resume 只需要 LLM API 格式**。`AgentSession.loadHistory()` 接受 `ChatMessage[]`，
Extension 已有 `toAgentHistory()` 完成从显示格式到 API 格式的转换。

---

## 架构决策

### 1. 定义共同的 Resume 层格式（位于 @neko/agent）

```typescript
// packages/neko-agent/packages/agent/src/session/conversation-record.ts
interface ConversationRecord {
  id: string;
  title: string;
  workDir: string;
  messages: ChatMessage[];   // @neko/shared，两端已共用
  createdAt: number;
  updatedAt: number;
  source: 'extension' | 'tui';
}

interface ConversationIndex {
  records: ConversationRecord[];
  lastId: string | null;
}
```

### 2. 存储分层

```
~/.neko/conversations/<workDir-hash>.json    ← 共同 Resume 层（普通文件）
                                               Extension 和 TUI 都读写
                                               仅存 ChatMessage[]（最小集合）

context.workspaceState['conversations']      ← Extension 独有显示层（VSCode Memento）
                                               仅 Extension 使用
                                               存完整 ConversationMessage[]（含 contentBlocks）
```

`workDir-hash` 建议使用 `workDir` 路径的 base64url 或 sha1 前 8 位，保证文件名合法且可反查。

### 3. 各端职责

**Extension 写入时机**（每轮 turn 的 `streamComplete` / `done` 事件后）：
1. **写文件**：`toAgentHistory()` 转换 → 写入 `~/.neko/conversations/<hash>.json`
2. **写 workspaceState**：保留完整 `ConversationMessage[]` 供 webview 渲染

**TUI 写入时机**（每轮 turn 结束后）：
1. **写文件**：直接写 `ChatMessage[]`，无需任何格式转换

**Resume 读取**（两端均通过 `session.loadHistory(record.messages)` 恢复）：
- Extension：从 workspaceState 读取（富显示格式），转换后 `loadHistory()`
- TUI：从文件读取 `ConversationRecord.messages`，直接 `loadHistory()`

---

## 不共同化的部分

以下字段**不放入共同格式**，仅存于 Extension 的 workspaceState：

| 字段 | 原因 |
|------|------|
| `contentBlocks` | webview 渲染专用，TUI 不产生也不消费 |
| `thinking` | 显示用，非 LLM API 必需字段 |
| `isStreaming` | 实时状态，无需持久化 |
| `contentBlock.isThinkingComplete` | 渲染状态标志 |

---

## TUI Resume UX

```
neko                    → 总是全新开始（当前行为不变）
neko --resume           → 列出该 workDir 的历史 session，交互选择后 loadHistory()
neko --resume <id>      → 直接恢复指定 session
/resume                 → 交互模式内，列出历史并切换
/history                → 查看当前 session 的 turns 列表
```

---

## 与现有基础设施的关系

| 组件 | 用途 | 是否变动 |
|------|------|---------|
| `IContextStorage` / `ContextPersistenceManager` | ContextState 层（系统提示、active skills）持久化 | 不变，独立于对话历史 |
| `FileTaskStorage` (`~/.neko/tasks.json`) | 后台任务状态（图片/视频/音频生成） | 不变 |
| `VscodeConversationStorage` (workspaceState) | Extension 富显示格式 | 不变，新增同步写文件 |
| `deriveBackgroundTaskIds()` | 从 contentBlocks 重建 backgroundTaskIds | 不变，继续作为 workaround |

---

## 实现步骤

1. **定义接口**：在 `@neko/agent` 中添加 `ConversationRecord` 类型和 `FileConversationStorage` 类
2. **TUI 写入**：在 `runner.ts` 的 `initializeInteractiveSession` 中初始化存储，每轮 turn 后追加写入
3. **TUI Resume**：添加 `--resume` CLI 参数和 `/resume` slash command
4. **Extension 同步写入**：在 `conversationHandler.ts` 的 `addMessage` 路径上，同步写共同格式文件
5. **Extension Resume 读取**（可选）：`--resume` 从共同文件恢复，当 workspaceState 无对应 session 时 fallback

---

## 对比：不定义共同格式的代价

| | 定义共同格式 | 各自独立 |
|---|---|---|
| 跨端 Resume | ✅ VSCode → TUI，TUI → VSCode | ❌ 两端各自孤岛 |
| 数据备份/迁移 | ✅ 普通 JSON 文件，可 git 追踪 | ⚠️ Extension 数据锁在 VSCode 内部 |
| 实现复杂度 | Extension 多一条写入路径 | 更简单 |
| 格式版本维护 | 需要版本字段（`version: 1`） | 无此问题 |

---

## TUI 功能缺口：媒体模型选择

### 当前差距

Webview 已实现运行时媒体模型选择，TUI 仅有静态配置，无法在会话中切换：

| 能力 | Webview (Extension) | TUI/CLI |
|------|--------------------|----|
| 每类别模型选择 | `AgentMediaBar`（image/video/audio 三个独立 chip）| ❌ 无运行时 UI |
| 运行时切换 | 点击 chip → 下拉选择，立即生效 | ❌ 无机制 |
| 静态默认值 | `defaultMediaModels` from config | ✅ 已读取 |
| 可用模型列表 | `availableMediaModels: ChatModelOption[]` | ✅ `CLIConfig.mediaModels: string[]` |
| 选择传递方式 | `sendMessage(mediaModelId)` → Extension → Platform | ❌ 未实现 |

### 数据流对比

**Webview 流程**：
```
用户点击 AgentMediaBar chip
  → setMediaModelSelection({ image: 'dall-e-3', ... })  [useUIState]
  → sendMessage(..., mediaModelId: 'dall-e-3')           [VSCodeMessages]
  → Extension messageHandler                              [chatProvider.ts]
  → Platform.createService({ mediaModelId })             [覆盖 defaultMediaModels]
  → MediaRoutingManager.selectProvider(modelId)          [直接使用用户选择]
```

**TUI 当前流程**：
```
loadConfig() 读取 defaultMediaModels from config file
  → CLIConfig.defaultMediaModels = { image: '...', video: '...', audio: '...' }
  → Platform 初始化时固定，整个会话不可变
  → MediaRoutingManager 只能用 config 默认值
```

### TUI 应实现的机制

**1. 会话级媒体模型状态**（`runner.ts` 的 `InteractiveSessionState`）：

```typescript
interface InteractiveSessionState {
  // 现有字段...
  /** 当前会话的媒体模型选择（覆盖 config 默认值）*/
  mediaModelOverrides: {
    image?: string;
    video?: string;
    audio?: string;
    music?: string;
  };
}
```

**2. `/media` slash command**：

```
/media                    → 列出当前媒体模型选择和可用模型
/media image              → 列出可用的 image 类别模型
/media image dall-e-3     → 将当前会话的 image 模型切换为 dall-e-3
/media video none         → 本会话禁用视频生成
/media reset              → 恢复所有类别为 config 默认值
```

**3. Platform 调用时传入覆盖值**：

Platform 的 `createService()` 或 `generateMedia()` 调用时，合并会话级覆盖：

```typescript
// runner.ts 中执行 agent 前
const effectiveMediaModels = {
  ...config.defaultMediaModels,
  ...state.mediaModelOverrides,  // 会话级选择优先
};
// 通过 platform 传入，覆盖 MediaRoutingManager 的默认行为
```

**4. `--media-image / --media-video / --media-audio` CLI 参数**（可选，用于非交互模式）：

```bash
neko --media-image dall-e-3 "生成一张猫的图片"
neko --media-audio eleven-labs "将这段文字转为语音"
```

### 与 ConversationRecord 的关系

媒体模型选择属于**会话配置**，不属于对话历史消息。Resume 时恢复选择有合理场景（"上次用了哪个模型"），
因此可选择将其加入 `ConversationRecord`：

```typescript
interface ConversationRecord {
  id: string;
  title: string;
  workDir: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  source: 'extension' | 'tui';
  /** 可选：该会话最后使用的媒体模型选择 */
  mediaModelSelection?: {
    image?: string;
    video?: string;
    audio?: string;
    music?: string;
  };
}
```

Resume 时若有 `mediaModelSelection`，自动恢复为会话初始状态，用户仍可用 `/media` 覆盖。

### 实现优先级

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 1 | `InteractiveSessionState.mediaModelOverrides` 字段 | P1 |
| 2 | `/media` slash command（list / set by category）| P1 |
| 3 | platform 调用时注入 override | P1 |
| 4 | `--media-*` CLI 参数 | P2 |
| 5 | `ConversationRecord.mediaModelSelection` 持久化 | P2 |
