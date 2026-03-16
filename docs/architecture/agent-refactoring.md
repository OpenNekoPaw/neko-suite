# neko-agent/packages/agent 架构重构记录

> 日期: 2026-03-16
> 状态: Phase 1-2 完成, Phase 3 待规划

## 背景

对 `packages/neko-agent/packages/agent` (~17K LOC, 21 个模块) 进行架构分析和渐进式重构，
解决冗余功能、职责混乱和可维护性问题。

---

## 模块健康度评分

| 模块 | 职责清晰度 | 耦合度 | 可测试性 | 总评 |
|------|-----------|--------|---------|------|
| tool-pattern-matcher | 5/5 | 5/5 | 5/5 | 优秀 |
| PermissionRuleMatcher | 4/5 | 4/5 | 5/5 | 优秀 |
| SystemPromptComposer | 5/5 | 5/5 | 5/5 | 优秀 |
| ToolRegistry | 4/5 | 4/5 | 4/5 | 良好 |
| ToolGroupRegistry | 4/5 | 4/5 | 4/5 | 良好 |
| ToolGuard | 4/5 | 4/5 | 4/5 | 良好 |
| LayeredContextManager | 4/5 | 3/5 | 4/5 | 良好 |
| SubAgentManager | 3/5 | 3/5 | 3/5 | 一般 |
| SkillService | 3/5 | 2/5 | 3/5 | 一般 |
| ToolInjectionManager | 3/5 | 3/5 | 3/5 | 一般 |
| AgentExecutor | 3/5 | 2/5 | 2/5 | 需改进 |
| PermissionHooks | 2/5 | 2/5 | 3/5 | 需改进 |
| **AgentSession** | 1/5 | 1/5 | 1/5 | **问题严重** |

---

## Phase 1 — 冗余修复 (已完成)

### Step 1: 修复 Skill 注入 permission rule 泄漏
- **问题**: `applySkillInjection()` 添加 allow rules 但 `removeSkillInjection()` 不清理
- **修复**: `permission-hooks.ts` 新增 `removeAllowRule()`; `agent-session.ts` 记录并清理注入的 rules
- **测试**: `agent-session.test.ts` 新增 3 个测试验证 rule 清理

### Step 2: 提取共享模式匹配工具
- **问题**: `rule-matcher.ts` 和 `tool-guard.ts` 各自实现模式匹配，且 ToolGuard 只支持 Bash 模式
- **修复**: 新建 `tools/tool-pattern-matcher.ts` (纯函数: normalizeToolCall/matchesPattern/isInPatternList)
  - `rule-matcher.ts` 改为 re-export
  - `tool-guard.ts` 替换为统一实现，获得完整模式匹配能力 (路径 glob, 域名, 前缀等)
- **测试**: `tool-pattern-matcher.test.ts` 24 个测试覆盖所有模式类型

### Step 3: 标记废弃 API
- `ToolGroupRegistry.match()` 添加 `@deprecated` (永远返回 `[]` 的死代码)
- `@neko/shared` 的 `isToolAllowed()` 添加 `@deprecated`

### Step 4: 注册表和 Prompt 系统文档化
- 4 个 Registry + 2 个 Prompt 类添加 JSDoc，明确各自职责和区分

---

## Phase 2 — 职责分离 (已完成)

### Step 1: 提取 ExecutorHooksFactory
- **问题**: `_initializeExecutor()` 硬编码 Memory/Validation/Permission/Custom hooks 的创建和排序 (违反 OCP)
- **修复**: 新建 `hooks/executor-hooks-factory.ts`
  - `createExecutorHooks(config)` → `{ hooks: ExecutorHooks[], permissionHooks }`
  - Session 减少 ~40 LOC，新 hook 类型只需改工厂
- **测试**: `executor-hooks-factory.test.ts` 6 个测试

### Step 2: 提取 SkillInjectionCoordinator
- **问题**: skill 注入分散在 3 个独立操作 (prompt/permission/tools)，无事务性
- **修复**: 新建 `skill/skill-injection-coordinator.ts`
  - 封装 3-track 注入/清理的全部操作
  - 自动清理前一个注入防止累积
  - Session 减少 2 个私有字段 + ~30 LOC
- **测试**: `skill-injection-coordinator.test.ts` 14 个测试

### Step 3: 分离事件转换与历史写入
- **问题**: `_convertStepToEvents()` 混合事件生成和历史写入 (违反 SRP)
- **修复**: 拆为 `_recordStepInHistory()` (副作用) + `_stepToEvents()` (纯生成器)

---

## Phase 3 — 剩余问题 (待实施)

### P0 — 阻塞质量

#### #1: AgentExecutor execute/executeStream 80%+ 代码重复
- `execute()` 与 `executeStream()` 几乎相同的初始化/错误处理/循环逻辑
- `think()` 与 `thinkStream()` 共 120+ 行重复的 hook 调用、工具过滤、消息构建
- Bug fix 需要改 2-4 处
- **建议**: 提取 `executeCore()` + `thinkCore()` 统一循环

#### #2: AgentSession 构造函数 7 步初始化
- Compressor → ToolGroupRegistry → ToolCategoryRegistry → MetaTools → Executor → PromptComposer → SkillCoordinator
- 耦合高，难测试，难扩展
- **建议**: 提取 `AgentSessionInitializer`

### P1 — 架构完整性

#### #3: PermissionHooks 双重角色
- 既是 ExecutorHook (onToolCall) 又是状态管理器 (setMode/confirmTool/addAllowRule)
- 唯一被 Session 直接调用方法的 hook，破坏封装性
- **建议**: 拆分为 `IPermissionManager` + `PermissionHook`

#### #4: 工具确认流程 4 方协调
- Executor → PermissionHooks → Session._handleToolConfirmation → config.onConfirmTool
- 确认状态在 PermissionHooks.pendingConfirmations 和 Session._pendingConfirmations 各一份
- Promise/callback 模式不一致
- **建议**: 提取 `ToolConfirmationManager`

#### #5: Hook 执行模型不安全类型转换
- `runHooks()` 用 `unknown[]` + `apply()` 强转调度
- 参数类型/数量无编译时校验
- **建议**: 使用显式 hook 方法调用替代反射式 dispatch

#### #6: ToolInjectionManager toolProvider 契约不严
- ToolGroupRegistry 通过结构子类型充当 IToolProvider，无显式接口保证
- **建议**: 提取 `IDefaultToolProvider` 接口

#### #7: SystemPromptComposer 执行期突变
- `_syncSystemPrompt()` 直接 mutate `_history[0].content`，在 5 个不同时机调用
- 实际无 race (已发送 snapshot)，但语义不清

#### #8: SkillInjectionCoordinator.apply() 无事务保证
- Track A (prompt) 成功后 Track B (permission) 异常则不一致
- 实际风险低 (addAllowRule 几乎不 throw)
- **建议**: 添加 try-catch rollback

### P2 — 改进项

| # | 问题 | 描述 |
|---|------|------|
| 9 | SubAgentManager 强耦合 | 手动构建 AgentConfig，无法流式传输子 agent 进度 |
| 10 | MCP 客户端缺少重连/退避 | connectAll() 吞掉部分连接错误 |
| 11 | ContextManager 异步压缩竞态 | onTurnStart 发起 void this.compress() 无锁 |
| 12 | ExecutorHooksFactory 硬编码顺序 | 无法在内置 hooks 之间插入自定义 hook |
| 13 | 测试覆盖缺口 | Executor 流式/非流式一致性, 确认流程端到端, SubAgent 超时/取消 |

---

## 推荐 Phase 3 实施路径

```
Phase 3A（DRY 消除 — 最高 ROI）
├─ #1: AgentExecutor 统一循环 — 提取 executeCore() + thinkCore()
└─ 预估: 涉及 1 个文件，约 -150 LOC 重复

Phase 3B（SRP 持续）
├─ #2: 提取 AgentSessionInitializer — 构造函数瘦身
├─ #3: 拆分 PermissionHooks → IPermissionManager + PermissionHook
└─ #4: 提取 ToolConfirmationManager — 统一确认流程

Phase 3C（韧性 + 测试）
├─ #8: SkillInjectionCoordinator 添加 try-catch rollback
└─ #13: 补充关键路径集成测试
```

---

## 不在重构范围

- 删除 `isToolAllowed()` from `@neko/shared` (需 major 版本)
- 删除 `ToolGroupRegistry.match()` 接口方法 (需 major 版本)
- AgentSession 完全拆解为微编排器 (影响面过大，需独立 ADR)
- 统一历史管理 / 消除 skipUserMessage (影响面过大)

---

## 验证命令

```bash
cd packages/neko-agent && pnpm build && pnpm test
pnpm build && pnpm test && pnpm check
```
