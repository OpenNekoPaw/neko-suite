# types/

类型定义模块，提供平台所有核心类型。

## 职责

集中定义平台使用的 TypeScript 类型，确保类型一致性。

## 结构

```
types/
├── index.ts              # 类型汇总导出
├── provider.ts           # 提供商类型
├── adapter.ts            # 适配器类型
├── group.ts              # 模型组类型
├── execution-group.ts    # 执行组类型
├── service.ts            # 服务类型
├── agent.ts              # Agent 类型
├── tool.ts               # 工具类型
├── memory.ts             # 记忆类型
├── prompt.ts             # 提示词类型
├── task.ts               # 任务类型
├── workflow.ts           # 工作流类型
├── mcp.ts                # MCP 类型
├── error.ts              # 错误类型
├── context.ts            # 上下文类型
├── media.ts              # 媒体类型
├── config.ts             # 配置类型
└── skill.ts              # 技能类型（Claude Code 兼容）
```

## 类型分类

| 文件 | 主要类型 |
|------|----------|
| `provider.ts` | `Provider`, `ProviderConfig` |
| `adapter.ts` | `IAdapter`, `ChatMessage` |
| `agent.ts` | `AgentConfig`, `AgentResult` |
| `tool.ts` | `ToolDefinition`, `ToolResult` |
| `mcp.ts` | `MCPServerConfig`, `MCPClient` |
| `workflow.ts` | `Workflow`, `WorkflowResult` |
| `media.ts` | `MediaItem`, `MediaMetadata` |
| `skill.ts` | `Skill`, `SlashCommand`, `SkillInjection` |

## Skill 类型详解

`skill.ts` 定义了 Claude Code 兼容的技能系统类型：

### 核心类型

```typescript
// 技能（语义发现）
interface Skill {
  name: string;              // 技能名称
  description: string;       // 语义描述（用于匹配）
  content: string;           // SKILL.md 主体内容
  supportFileRefs?: string[]; // 支持文件引用（渐进披露）
  allowedTools?: string[];   // 工具限制
  model?: string;            // 模型覆盖
  source: SkillSource;       // 来源：builtin/personal/project
  directoryPath?: string;    // 技能目录路径
  icon?: string;             // 图标（UniEdit 扩展）
  enabled: boolean;          // 启用状态
}

// 斜杠命令（显式触发）
interface SlashCommand {
  command: string;           // 命令名（不含 /）
  description: string;       // 描述
  content: string;           // 命令内容（支持 $ARGUMENTS, $1, $2）
  argumentHint?: string;     // 参数提示
  allowedTools?: string[];   // 工具限制
  model?: string;            // 模型覆盖
  source: SkillSource;       // 来源
  filePath?: string;         // 文件路径
  icon?: string;             // 图标
  enabled: boolean;          // 启用状态
}
```

### 注入类型

```typescript
// 技能注入结果
interface SkillInjection {
  systemPrompt: string;      // 注入的系统提示
  allowedTools?: string[];   // 工具限制
  name: string;              // 技能/命令名
  model?: string;            // 模型覆盖
  type: 'skill' | 'slash-command';
}
```

### 匹配类型

```typescript
// 技能匹配结果
interface SkillMatch {
  skill: Skill;              // 匹配的技能
  relevance: number;         // 相关度 0-1
  reason: string;            // 匹配原因
}
```

### 目录常量

```typescript
const SKILL_DIRECTORIES = {
  project: '.skill',              // 项目级技能
  personal: '~/.uniedit/skills',  // 个人技能
};

const COMMAND_DIRECTORIES = {
  project: '.command',            // 项目级命令
  personal: '~/.uniedit/commands', // 个人命令
};
```

## 依赖

```
→ @uniedit/shared # 共享类型
← 所有其他模块    # 类型引用
```

## 设计原则

- 纯类型定义，无运行时代码
- 使用 interface 优先
- 充分使用泛型保持灵活性
- UniEdit 扩展字段明确标注（icon, enabled）
