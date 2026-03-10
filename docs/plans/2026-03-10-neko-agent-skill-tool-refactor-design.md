# neko-agent Skill/Tool 架构重构 — 设计方案

**日期**: 2026-03-10
**状态**: ✅ 全部完成（Track B/A/D/C）
**范围**: `packages/neko-agent/packages/agent/` + `packages/neko-types/src/types/`

---

## 背景

本文档记录对 neko-agent 工具/技能/钩子体系的架构分析结论与重构方向，基于以下研究：

1. 对现有代码的全量分析（hooks、commands、skill、tool-group、injection）
2. 对 Claude Code 官方设计（Skill/Tool/Hook 关系）的深度研究
3. 多轮架构讨论沉淀

---

## 一、现有架构全景

### 1.1 三个子系统

```
neko-agent 核心子系统
│
├── Tool 子系统
│   ├── ToolRegistry          — 工具注册 + 执行 + LLM 定义转换
│   ├── ToolCategoryRegistry  — 工具分类元数据 + token 计算
│   ├── ToolInjectionManager  — 工具分层注入（决定哪些工具发给 LLM）
│   └── ToolGroupRegistry     — ToolGroup 注册 + 工具集合管理
│
├── Skill 子系统
│   ├── SkillRegistry         — Skill + SlashCommand 注册
│   ├── SkillService          — 发现 / 应用 / 运行时守卫编排
│   ├── SkillMatcher          — 语义匹配（关键词）
│   ├── SkillInjector         — systemPrompt 注入 + 参数插值
│   └── ToolGuard             — 运行时工具白名单守卫
│
└── Hook/Command 子系统
    ├── ExecutorHooks（TS 进程内）
    │   ├── RetryHooks         — 工具重试 + 模型降级
    │   ├── MemoryHooks        — 上下文压缩 + 会话记忆
    │   ├── PermissionHooks    — 工具拦截确认（ask/allow/deny）
    │   └── ValidationHooks   — 输出验证
    ├── SettingsHooks（外部 Shell）
    │   └── SettingsHookLoader — 从 .neko/settings.json 加载 shell hooks
    └── Commands
        ├── BuiltinCommands    — /help /status /plan /skills 等内置命令
        └── SlashCommand       — 用户定义命令（.neko/commands/*.md）
```

### 1.2 三层工具注入（现状）

```
L1 core     — 始终注入：Read/Write/Bash/Grep/ListDirectory
              + SearchTools/ActivateSkill/DeactivateSkill/GetContext（元工具）
L2 skill    — 已激活 ToolGroup 的工具 + defaultActive ToolGroup 的工具
L3 ondemand — ⚠️ 死代码：addOnDemandTool/removeOnDemandTool 无调用方
```

### 1.3 Skill 与 ToolGroup 的关系

```
Skill    = 「行为模式」  → 注入 system prompt + 可选工具守卫（allowedTools）
ToolGroup = 「工具可见性」→ 控制哪些工具发送给 LLM（减少 token）

两者正交：
  激活 Skill "video-editing" → 注入"你是视频剪辑专家..."
  激活 ToolGroup "element-editing" → 工具列表中出现 AddElement/UpdateElement...
  当前：两者没有关联，需手动分别激活
```

---

## 二、识别到的问题

### 问题 1：ToolGroup 命名不清晰

`ToolGroup` 这个名字太泛化，与 `Skill` 概念高度相似，开发者容易混淆。实际语义是「LLM 可按需激活的工具模块」，应该叫 `ToolSet`。

具体命名问题：
- `ToolInjectionState.activeSkills` 字段名叫 `activeSkills`，实际存的是 `ToolGroup` 名
- 文件 `tool-skills.ts` 含 `skills`，内容全是 `ToolGroup` 定义
- `IToolGroupRegistry.getGroupsForTool()` vs `getActiveTools()` 命名风格不一致

### 问题 2：triggerKeywords 是死代码

`ToolInjectionManager.getSkillTools()` 的注释明确写明：

> We no longer auto-activate skills based on keyword matching.
> Instead, we rely on LLM to use SearchTools and ActivateSkill...

但 `tool-skills.ts` 中每个 `ToolGroup` 仍保留大量 `triggerKeywords`（每个 group 10~40 个关键词），成为无效维护负担。

### 问题 3：三层注入实质只有两层

L3 `ondemand` 层从未被使用——`addOnDemandTool()`/`removeOnDemandTool()` 无任何调用方。实质上只有：
- `always`：核心工具 + defaultActive ToolGroups
- `dynamic`：手动激活的 ToolGroups

### 问题 4：SettingsHooks 与 ExecutorHooks 断层

`SettingsHookLoader` 加载了 shell hooks 并实现了 `executePreToolUse()`，但该方法没有被 `AgentExecutor` 或 `PermissionHooks` 调用。两套 hook 体系各自孤立：

```
ExecutorHooks（TS）← AgentExecutor 调用 ✅
SettingsHookLoader（Shell）← AgentExecutor 从不调用 ❌
```

### 问题 5：SlashCommand injection 结果未被消费

`executeSlashCommand()` 执行用户定义命令后，将 `injection.systemPrompt` 放入 `data.injection`，但调用链（AgentRunner/CLI）没有将其注入到当前对话的 system prompt 中。`/commit`、`/review` 等命令的提示词注入实际上不生效。

### 问题 6：UserPromptSubmit hook 触发点缺失

`HookEvent` 类型定义有 `UserPromptSubmit`，`SettingsHookLoader` 也能处理它，但 `AgentRunner.execute()` 入口没有在用户输入进入 LLM 前触发此事件。「提交前动态注入上下文」的能力虽有类型定义但无法使用。

### 问题 7：Skill 与 ToolSet 没有关联声明

激活一个 Skill 时，其对应的 ToolSet 不会自动激活，需要用户/LLM 分别操作两套系统。

---

## 三、与 Claude Code 官方设计的对比

| 维度 | Claude Code 官方 | neko-suite 现有 | 评估 |
|------|-----------------|----------------|------|
| 工具可见性控制 | 无（所有工具始终可见） | ToolGroup 三层注入 | ✅ neko 合理扩展（解决 50+ 工具 token 问题） |
| `allowed-tools` 语义 | 免确认授权（不是限制） | `allowedTools` 运行时守卫 | ⚠️ 语义不同，需文档澄清 |
| Skill 触发 | LLM 语义理解 + 用户 /invoke | 关键词匹配（已废弃）+ 用户激活 | ⚠️ 关键词方案是死代码 |
| 动态工具发现 | MCP `list_changed` | SearchTools + ActivateSkill | ✅ 设计思路一致 |
| Hook 系统 | settings.json shell hooks | 两套（TS + Shell），未桥接 | ❌ 断层需修复 |
| SlashCommand | 注入 systemPrompt ✅ | 注入结果未消费 ❌ | ❌ 需修复 |
| Skill 与工具关联 | 无显式机制 | 无关联 | ⚠️ 需通过 toolSets 字段桥接 |

**关键结论：neko 的 ToolSet 层是合理的工程扩展**（官方无此概念），不应删除，但需要重命名和清理。

---

## 四、重构方案

### 方案总览

本次重构分为四条独立工作线，按优先级排序：

```
Track A（P1）：修复三个功能性断层
Track B（P1）：ToolGroup → ToolSet 重命名 + 死代码清理
Track C（P2）：注入层简化（三层 → 两层）
Track D（P2）：Skill 与 ToolSet 关联声明
```

---

### Track A — 修复功能性断层（P1，阻塞性）

#### A1. 桥接 SettingsHooks → ExecutorHooks

**问题**：`SettingsHookLoader.executePreToolUse()` 从不被调用。

**方案**：在 `PermissionHooks.onToolCall()` 中，先执行 SettingsHooks，再执行 TS 权限逻辑：

```typescript
// permission-hooks.ts
async onToolCall(info: ToolCallInfo, execute: () => Promise<ToolResult>) {
  // 1. 先执行外部 shell hooks（如果有）
  if (this.settingsHookLoader) {
    const hookResult = await this.settingsHookLoader.executePreToolUse(
      info.name,
      info.arguments ?? {}
    );
    if (hookResult.blocked) {
      return { success: false, error: hookResult.reason ?? 'Blocked by hook', ... };
    }
    // hook 可能修改了工具参数
    if (hookResult.updatedInput) {
      info = { ...info, arguments: { ...info.arguments, ...hookResult.updatedInput } };
    }
  }

  // 2. 再执行 TS 权限规则（现有逻辑）
  const result = this.matcher.check(info);
  // ...
}
```

`PermissionHooks` 构造函数新增可选参数 `settingsHookLoader?: SettingsHookLoader`。

#### A2. 修复 SlashCommand injection 消费

**问题**：`executeSlashCommand()` 返回的 `data.injection` 没有被使用。

**方案**：在 `AgentRunner` 中，执行 slash command 后，将 injection 应用到当前 session：

```typescript
// agentRunner.ts
async executeCommand(input: string): Promise<CommandResult> {
  const result = await executeSlashCommand(input, this._commandContext, this._skillService);

  if (result.handled && result.data?.injection) {
    const injection = result.data.injection as SkillInjection;
    // 将 systemPrompt 追加到当前对话
    this._session?.applySkillInjection(injection);
  }

  return result;
}
```

`AgentSession` 新增方法：

```typescript
applySkillInjection(injection: SkillInjection): void {
  // 将 injection.systemPrompt 追加到 system prompt
  // 应用 injection.allowedTools（如有）到 PermissionHooks
}
```

#### A3. 实现 UserPromptSubmit hook 触发

**问题**：用户输入提交给 LLM 前，没有触发 `UserPromptSubmit` hooks。

**方案**：在 `AgentRunner.execute()` 入口处调用：

```typescript
// agentRunner.ts
async *execute(input: string, context: IAgentContext): AsyncIterable<AgentEvent> {
  // 1. 触发 UserPromptSubmit hooks，获取额外上下文
  let enrichedInput = input;
  if (this._settingsHookLoader) {
    const hookResult = await this._settingsHookLoader.executeUserPromptSubmit(input);
    if (hookResult.blocked) {
      yield { type: 'error', error: hookResult.reason };
      return;
    }
    // stdout 输出追加到用户消息
    if (hookResult.stdout?.trim()) {
      enrichedInput = `${input}\n\n<context>\n${hookResult.stdout.trim()}\n</context>`;
    }
  }

  // 2. 继续执行（使用 enrichedInput）
  yield* this._session.execute(enrichedInput, context);
}
```

`SettingsHookLoader` 新增：

```typescript
async executeUserPromptSubmit(message: string): Promise<HookExecutionResult> {
  const hooks = this.getHooksForEvent('UserPromptSubmit');
  // ... 与 executePreToolUse 类似的执行逻辑
}
```

---

### Track B — ToolGroup 重命名 + 死代码清理（P1）

#### B1. 类型重命名（向后兼容）

在 `@neko/shared`（neko-types）中：

```typescript
// packages/neko-types/src/types/tool-set.ts（新文件）

/**
 * ToolSet — A named, activatable collection of tools
 *
 * @neko-extension Not in Claude Code spec.
 * Addresses the token cost problem of 50+ tools by allowing LLM to
 * discover and activate tool sets on demand via SearchToolSets/ActivateToolSet.
 */
export interface ToolSet {
  name: string;
  description: string;
  tools: string[];
  alwaysActive?: boolean;    // renamed from defaultActive
  priority?: number;
  dependencies?: string[];
  source: 'builtin' | 'project' | 'personal';
  enabled: boolean;
  icon?: string;
  // triggerKeywords removed — LLM semantic understanding replaces keyword matching
}

// Backward compatibility alias
/** @deprecated Use ToolSet */
export type ToolGroup = ToolSet;
```

#### B2. 移除 triggerKeywords

```typescript
// tool-skills.ts（全量修改）
// 移除所有 triggerKeywords 字段
// 将 defaultActive: true → alwaysActive: true
// 将 defaultActive: false → 直接省略（undefined = false）
```

移除前：
```typescript
export const fileEditingToolSkill: ToolGroup = {
  name: 'file-editing',
  triggerKeywords: ['修改', '编辑', '创建', ... /* 15 个关键词 */],
  defaultActive: false,
  // ...
};
```

移除后：
```typescript
export const fileEditingToolSet: ToolSet = {
  name: 'file-editing',
  // triggerKeywords 已删除
  // defaultActive 已删除（false 为默认）
  // ...
};
```

#### B3. 更新 InjectionManager 字段命名

```typescript
// ToolInjectionState
interface ToolInjectionState {
  injectedTools: Map<ToolInjectionLayer, string[]>;
  activeToolSets: string[];    // was: activeSkills
  tokenUsage: Map<ToolInjectionLayer, number>;
}

// IToolInjectionManager
interface IToolInjectionManager {
  activateToolSet(name: string): void;    // was: activateSkill
  deactivateToolSet(name: string): void;  // was: deactivateSkill
  getActiveToolSets(): string[];          // was: getActiveSkills
  // ...
}
```

#### B4. 更新元工具名称

```
SearchTools      → SearchToolSets
ActivateSkill    → ActivateToolSet
DeactivateSkill  → DeactivateToolSet
GetContext       → 保持不变
```

更新 CORE_TOOLS 常量和 meta-tools.ts 中的类名与工具名。

#### B5. 文件重命名

```
tool-skills.ts              → builtin-tool-sets.ts
tool-group-registry.ts      → tool-set-registry.ts
tools/core/meta-tools.ts    → 内容更新（工具名变更）
```

---

### Track C — 注入层简化（P2）

#### C1. ToolInjectionLayer 精简

```typescript
// 重构前
export type ToolInjectionLayer = 'core' | 'skill' | 'ondemand';

// 重构后
export type ToolInjectionLayer = 'always' | 'dynamic';
```

语义对应：
- `always` = 原 `core`（始终注入的核心工具）+ `alwaysActive` ToolSets 的工具
- `dynamic` = 原 `skill`（手动激活的 ToolSets 的工具）
- `ondemand` → 删除（从未使用）

#### C2. 更新 DEFAULT_INJECTION_CONFIG

```typescript
export const DEFAULT_INJECTION_CONFIG: ToolInjectionConfig = {
  maxToolsPerLayer: {
    always: 25,    // core(9) + alwaysActive sets(~12) + buffer
    dynamic: 30,   // activated tool sets
  },
  tokenBudgetPerLayer: {
    always: 10000,
    dynamic: 12000,
  },
};
```

#### C3. 简化 ToolInjectionManager

移除：
- `getOnDemandTools()` 方法
- `addOnDemandTool()` 方法
- `removeOnDemandTool()` 方法
- `pendingOnDemand` 状态字段
- `config.enableOnDemand` 配置项

---

### Track D — Skill 与 ToolSet 关联声明（P2）

#### D1. Skill 接口新增 toolSets 字段

```typescript
// packages/neko-types/src/types/skill.ts
export interface Skill {
  // ...现有字段不变...

  /**
   * ToolSets to activate when this skill is applied.
   *
   * When a skill is activated, its associated tool sets are automatically
   * loaded into the dynamic injection layer.
   *
   * @neko-extension Not in Claude Code spec.
   * @example ["element-editing", "effects-transitions"]
   */
  toolSets?: string[];
}
```

#### D2. SkillService 新增 toolSets 激活逻辑

`SkillService.apply()` 执行时，通知 `IToolInjectionManager` 激活关联 ToolSets：

```typescript
// skill-service.ts
export class SkillService {
  constructor(
    config: SkillServiceConfig = {},
    private injectionManager?: IToolInjectionManager,  // 新增可选依赖
  ) { ... }

  apply(skill: Skill): SkillInjection {
    // 现有逻辑：注入 systemPrompt，创建 ToolGuard
    const injection = this._injector.injectSkill(skill);
    const toolGuard = createToolGuard(injection.allowedTools, skill.name);
    this._activeSkill = skill;
    this._activeToolGuard = toolGuard;

    // 新增：激活关联 ToolSets
    if (skill.toolSets && this.injectionManager) {
      for (const toolSetName of skill.toolSets) {
        this.injectionManager.activateToolSet(toolSetName);
      }
    }

    return injection;
  }

  clearActiveSkill(): void {
    // 同步停用关联 ToolSets
    if (this._activeSkill?.toolSets && this.injectionManager) {
      for (const toolSetName of this._activeSkill.toolSets) {
        this.injectionManager.deactivateToolSet(toolSetName);
      }
    }
    this._activeSkill = undefined;
    this._activeToolGuard = undefined;
  }
}
```

#### D3. SKILL.md frontmatter 新增 tool-sets 字段

```yaml
# .neko/skills/video-editing/SKILL.md
---
name: video-editing
description: Expert video editing assistant for timeline operations
tool-sets: element-editing, effects-transitions, audio-editing
allowed-tools: Read, GetTimelineInfo, AddElement
---

You are an expert video editor...
```

```typescript
// skill.ts
export interface SkillFrontmatter {
  // ...现有字段...
  'tool-sets'?: string;  // 逗号分隔的 ToolSet 名称列表
}
```

---

## 五、不变的部分

| 模块 | 保留原因 |
|------|---------|
| `ToolRegistry` | 工具注册执行核心，职责清晰 |
| `ToolCategoryRegistry` | 分类元数据，SearchToolSets 依赖 |
| `ExecutorHooks` 接口 | 稳定，多实现复用 |
| `PermissionHooks` | 核心权限逻辑正确，仅增加 SettingsHooks 桥接 |
| `RetryHooks` + `MemoryHooks` | 功能正常 |
| `SkillRegistry` + `SkillInjector` + `SkillMatcher` | 职责清晰 |
| `BuiltinCommands` | 功能完整 |
| `AgentExecutor` ReAct 循环 | 核心执行路径稳定 |
| `SubagentManager` | 独立模块，不在本次范围 |

---

## 六、删除/替换汇总

| 组件 | 重构前 | 重构后 |
|------|--------|--------|
| 命名 | `ToolGroup` | `ToolSet`（type alias 向后兼容） |
| 命名 | `activeSkills`（InjectionState） | `activeToolSets` |
| 命名 | `SearchTools` / `ActivateSkill` / `DeactivateSkill` | `SearchToolSets` / `ActivateToolSet` / `DeactivateToolSet` |
| 死代码 | `triggerKeywords`（每个 ToolGroup 10~40 个关键词） | 删除 |
| 死代码 | L3 `ondemand` 层（`addOnDemandTool` 等） | 删除 |
| 断层 | `SettingsHooks` 未接入 `AgentExecutor` | 在 `PermissionHooks` 中桥接 |
| 断层 | `SlashCommand injection` 未消费 | `AgentRunner` 应用 injection |
| 断层 | `UserPromptSubmit` 无触发点 | `AgentRunner.execute()` 入口触发 |
| 新增 | Skill 与 ToolSet 无关联 | `Skill.toolSets` 字段 + `SkillService` 联动激活 |

**净代码变化**：删除约 600 行（triggerKeywords + ondemand 死代码），新增约 120 行（桥接逻辑 + toolSets 联动），重命名不增减代码量。

---

## 七、执行顺序

```
Track A（P1 断层修复）
  A1  PermissionHooks 桥接 SettingsHookLoader
  A2  AgentRunner 消费 SlashCommand injection
  A3  SettingsHookLoader.executeUserPromptSubmit + AgentRunner 触发
  验证：/commit /review 等命令提示词注入生效；shell hooks 能拦截工具调用

Track B（P1 重命名清理）
  B1  neko-types 新增 ToolSet 接口（ToolGroup = ToolSet type alias）
  B2  移除 triggerKeywords 字段（tool-skills.ts 全量更新）
  B3  InjectionManager：activeSkills → activeToolSets，方法名更新
  B4  meta-tools.ts：SearchTools → SearchToolSets，ActivateSkill → ActivateToolSet
  B5  文件重命名
  验证：tsc --noEmit 通过；LLM 工具发现流程 E2E 测试通过

Track C（P2 注入层简化）
  C1  ToolInjectionLayer: 'core'|'skill'|'ondemand' → 'always'|'dynamic'
  C2  更新 DEFAULT_INJECTION_CONFIG
  C3  ToolInjectionManager 移除 ondemand 方法
  验证：工具注入行为与重构前等价

Track D（P2 Skill-ToolSet 联动）
  D1  Skill 接口新增 toolSets 字段
  D2  SkillFrontmatter 新增 tool-sets 解析
  D3  SkillService.apply/clearActiveSkill 联动激活/停用 ToolSets
  D4  示例：video-editing skill 添加 toolSets 声明
  验证：激活 skill 后对应 ToolSets 自动可用
```

---

## 八、风险评估

| 风险 | 严重程度 | 缓解措施 |
|------|---------|---------|
| ToolGroup → ToolSet 重命名影响外部调用 | 低 | type alias 向后兼容，TypeScript 编译期发现所有调用点 |
| SettingsHooks 桥接改变权限拦截顺序 | 中 | shell hooks 在 TS 规则之前执行，语义更接近 Claude Code；需 E2E 测试覆盖 |
| SlashCommand injection 应用后 systemPrompt 叠加 | 低 | 追加而非替换，清除 active skill 时同步移除 |
| Skill.toolSets 声明的 ToolSet 不存在 | 低 | `SkillService.apply()` 中加 guard：ToolSet 不存在时 warn + 跳过，不抛出 |
| ToolInjectionLayer 改名影响序列化/持久化 | 低 | InjectionState 不做持久化，仅内存状态 |

---

## 附录：概念关系图（重构后）

```
┌─────────────────────────────────────────────────────────────┐
│                    用户输入                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
          UserPromptSubmit hooks（Shell，注入额外上下文）
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    AgentRunner                              │
│  - 检测 /slash-command → 执行命令，应用 injection           │
│  - 普通消息 → 转发给 AgentSession                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    AgentSession                             │
│  system prompt = base + active Skill.content + injections   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    AgentExecutor (ReAct)                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
         ToolInjectionManager.getToolsForTurn()
         ┌───────────────────┐
         │ always layer      │ Core tools + alwaysActive ToolSets
         │ dynamic layer     │ Activated ToolSets
         └───────────────────┘
                            ↓
                  ToolRegistry.toToolDefinitions()
                            ↓
                      发送给 LLM

    LLM 调用工具
        ↓
    PreToolUse hooks（Shell → TS PermissionHooks 串联）
        ↓
    ToolGuard（Skill.allowedTools 运行时守卫）
        ↓
    ToolRegistry.execute()
        ↓
    PostToolUse hooks（Shell）

概念职责边界：
  Tool     = 原子能力（执行函数）
  ToolSet  = 工具可见性模块（按需激活，减少 token）
  Skill    = 行为模式（system prompt + 可选守卫 + 关联 ToolSets）
  Hook     = 执行拦截（Shell 外部 + TS 内部，串联执行）
  Command  = 用户触发的工作流（/slash-command → 注入 Skill）
```

---

## 九、实施总结（2026-03-10）

### 已完成

| Track | 状态 | 说明 |
|-------|------|------|
| Track B — 重命名 + 死代码清理 | ✅ 完成 | |
| Track A — 功能断层修复 | ✅ 完成 | |
| Track D — Skill-ToolSet 联动 | ✅ 完成 | |
| Track C — 注入层简化 | ✅ 完成 | `'core'\|'skill'\|'ondemand'` → `'always'\|'dynamic'`，删除 `ondemand` 死代码 |

### 实施偏差

**B5（文件重命名）未执行**：`tool-skills.ts` 和 `tool-group-registry.ts` 保持原文件名。旧变量名（`xxxToolSkill`）添加 `@deprecated` 别名，但文件本身未重命名，以减少 diff 范围。

**A2 实现位置**：设计中计划在 `agentRunner.ts` 中消费 injection，实际在 Extension 路径的 `slashCommandHandler.ts` 中实现（调用 `agentManager.applySkillInjection()`）。CLI 路径暂未处理（该路径当前未使用 SlashCommand injection）。

**A3 实现位置**：`UserPromptSubmit` 触发点实现在 `AgentSession.execute()` 内，而非 `AgentRunner`。因为 `AgentSession` 是 Extension 和 CLI 的共同抽象层，在此处理更符合单一职责。

### 验证结果

```
pnpm build   → ✅ 16/16 tasks 成功
pnpm test    → ✅ 540 passed, 3 pre-existing failures (agent-executor.test.ts mock 问题，与本次重构无关)
```
