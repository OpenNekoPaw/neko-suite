# neko-agent 测试覆盖率提升方案

> 设计日期：2026-03-10
> 目标：10% → 40% 测试覆盖率（核心模块优先）

## 📊 现状分析

### 整体指标
- **源文件**：390 个 TS 文件
- **测试文件**：43 个（11% 文件覆盖率）
- **代码行数**：~25,533 行
- **已测试模块**：executor, input, session, subagent, task（5/15 模块）

### 模块测试覆盖率

| 模块 | 源文件 | 测试文件 | 覆盖率 | 优先级 |
|------|--------|----------|--------|--------|
| **executor** | 2 | 1 | 50% | ✅ 已覆盖 |
| **session** | 3 | 2 | 67% | ✅ 已覆盖 |
| **task** | 4 | 4 | 100% | ✅ 已覆盖 |
| **subagent** | 4 | 3 | 75% | ✅ 已覆盖 |
| **input** | 5 | 1 | 20% | 🟡 需补充 |
| **commands** | 9 | 0 | 0% | 🔴 P0 |
| **skill** | 14 | 0 | 0% | 🔴 P0 |
| **tools** | 12 | 0 | 0% | 🔴 P1 |
| **prompt** | 5 | 0 | 0% | 🟡 P1 |
| **mcp** | 4 | 0 | 0% | 🟡 P1 |
| **context** | 5 | 0 | 0% | 🟡 P2 |
| **permission** | 4 | 0 | 0% | 🟡 P2 |
| **validation** | 8 | 0 | 0% | 🟢 P2 |
| **plan** | 3 | 0 | 0% | 🟢 P3 |
| **memory** | 3 | 0 | 0% | 🟢 P3 |

---

## 🎯 测试策略

### 架构三问

**Q1: 是否符合现有架构？**
- ✅ 遵循 `__tests__/` 目录结构
- ✅ 使用 Vitest 框架（已配置）
- ✅ Mock 外部依赖（vscode API / LLM / 文件系统）

**Q2: 如何最小化耦合？**
- 使用依赖注入测试（构造函数注入 Mock）
- 提取 `test-helpers.ts` 工厂函数（复用 fixture）
- 隔离 I/O 操作（文件/网络/LLM 全部 Mock）

**Q3: 是否易于扩展测试？**
- 每个模块独立测试套件
- 共享 Mock 工具（`@neko-agent/test-utils`）
- 参数化测试（边界条件 + 错误路径）

### 测试分层策略

```
L1: 单元测试（70%）  → 纯函数 / 工具类 / 解析器
L2: 集成测试（25%）  → 模块间交互 / 服务协作
L3: E2E 测试（5%）   → 完整 Agent 执行流程
```

### 测试优先级矩阵

| 优先级 | 标准 | 模块 |
|--------|------|------|
| **P0** | 核心业务逻辑 + 高复杂度 + 无测试 | commands, skill |
| **P1** | 关键路径 + 中等复杂度 | tools, prompt, mcp |
| **P2** | 辅助功能 + 低复杂度 | context, permission, validation |
| **P3** | 边缘功能 + 已有替代验证 | plan, memory |

---

## 📋 P0 模块测试设计

### 1. commands 模块（9 文件 → 3 测试文件）

**核心职责**：命令解析 → 路由 → 执行

**测试文件设计**：
```
commands/
├── __tests__/
│   ├── command-executor.test.ts      # 命令执行器（核心）
│   ├── builtin-commands.test.ts      # 内置命令注册
│   └── handlers/
│       ├── config-handlers.test.ts   # 配置命令
│       ├── core-handlers.test.ts     # 核心命令
│       └── session-handlers.test.ts  # 会话命令
```

**测试用例设计**：

#### `command-executor.test.ts`（预计 80 行）
```typescript
describe('CommandExecutor', () => {
  describe('execute()', () => {
    it('应正确解析并执行注册的命令')
    it('应在命令不存在时抛出 AgentError')
    it('应正确传递命令参数')
    it('应支持异步命令执行')
    it('应捕获并包装命令执行错误')
  })

  describe('register()', () => {
    it('应正确注册新命令')
    it('应在命令名冲突时抛出错误')
    it('应支持命令覆盖（force: true）')
  })

  describe('命令生命周期', () => {
    it('应在执行前调用 beforeExecute hook')
    it('应在执行后调用 afterExecute hook')
    it('应在错误时调用 onError hook')
  })
})
```

#### `config-handlers.test.ts`（预计 60 行）
```typescript
describe('ConfigHandlers', () => {
  describe('/config get', () => {
    it('应返回指定配置项')
    it('应在配置不存在时返回 undefined')
    it('应支持嵌套路径（dot notation）')
  })

  describe('/config set', () => {
    it('应正确设置配置值')
    it('应触发配置变更事件')
    it('应验证配置值类型')
  })

  describe('/config reset', () => {
    it('应重置为默认值')
    it('应清除用户自定义配置')
  })
})
```

#### `core-handlers.test.ts`（预计 100 行）
```typescript
describe('CoreHandlers', () => {
  describe('/help', () => {
    it('应返回所有可用命令列表')
    it('应返回指定命令的详细帮助')
    it('应按类别分组显示命令')
  })

  describe('/clear', () => {
    it('应清除当前会话历史')
    it('应保留系统提示词')
    it('应触发 UI 清屏事件')
  })

  describe('/exit', () => {
    it('应正确清理资源')
    it('应保存会话状态（如果启用）')
    it('应触发退出事件')
  })

  describe('/version', () => {
    it('应返回正确的版本信息')
    it('应包含依赖版本（LLM SDK / VSCode）')
  })
})
```

**Mock 依赖**：
```typescript
// test-helpers/command-mocks.ts
export function createMockCommandContext(): CommandContext {
  return {
    session: createMockSession(),
    config: createMockConfig(),
    logger: createMockLogger(),
  }
}
```

---

### 2. skill 模块（14 文件 → 5 测试文件）

**核心职责**：Skill 加载 → 解析 → 注册 → 匹配 → 注入

**测试文件设计**：
```
skill/
├── __tests__/
│   ├── skill-loader.test.ts          # Skill 加载器（623 LOC，核心）
│   ├── skill-registry.test.ts        # Skill 注册表
│   ├── skill-matcher.test.ts         # Skill 匹配逻辑
│   ├── markdown-parser.test.ts       # Markdown 解析器
│   └── skill-conflict-resolver.test.ts # 冲突解决
```

**测试用例设计**：

#### `skill-loader.test.ts`（预计 150 行）
```typescript
describe('SkillLoader', () => {
  describe('loadFromDirectory()', () => {
    it('应递归加载目录下所有 .md 文件')
    it('应跳过无效的 Skill 文件')
    it('应正确解析 frontmatter 元数据')
    it('应支持嵌套目录结构')
    it('应在文件不存在时抛出错误')
  })

  describe('loadFromFile()', () => {
    it('应正确解析单个 Skill 文件')
    it('应提取 trigger 条件')
    it('应提取 tools 依赖')
    it('应提取 prompt 内容')
    it('应验证必需字段（name / description）')
  })

  describe('热重载', () => {
    it('应监听文件变更')
    it('应在文件修改时重新加载')
    it('应在文件删除时注销 Skill')
  })

  describe('错误处理', () => {
    it('应在 YAML frontmatter 无效时抛出错误')
    it('应在 Skill 名称冲突时警告')
    it('应在循环依赖时抛出错误')
  })
})
```

#### `skill-matcher.test.ts`（预计 100 行）
```typescript
describe('SkillMatcher', () => {
  describe('match()', () => {
    it('应匹配精确的 trigger 字符串')
    it('应匹配正则表达式 trigger')
    it('应匹配 glob 模式')
    it('应支持多个 trigger 条件（OR）')
    it('应按优先级排序匹配结果')
  })

  describe('优先级计算', () => {
    it('精确匹配应优先于模糊匹配')
    it('用户自定义 Skill 应优先于内置 Skill')
    it('应考虑 Skill 的 priority 字段')
  })

  describe('上下文过滤', () => {
    it('应根据当前文件类型过滤')
    it('应根据工作区状态过滤')
    it('应根据 tools 可用性过滤')
  })
})
```

#### `markdown-parser.test.ts`（预计 80 行）
```typescript
describe('MarkdownParser', () => {
  describe('parseFrontmatter()', () => {
    it('应正确解析 YAML frontmatter')
    it('应支持多行字符串')
    it('应支持数组和对象')
    it('应在 YAML 无效时抛出错误')
  })

  describe('extractSections()', () => {
    it('应按 Markdown 标题分割章节')
    it('应保留代码块格式')
    it('应处理嵌套标题')
  })

  describe('parseToolReferences()', () => {
    it('应提取 {{tool:name}} 引用')
    it('应提取 {{mcp:server/tool}} 引用')
    it('应验证工具是否存在')
  })
})
```

**Mock 依赖**：
```typescript
// test-helpers/skill-fixtures.ts
export const VALID_SKILL_MD = `---
name: test-skill
description: Test skill
trigger: /test
tools: [read, write]
---

# Test Skill

This is a test skill.
`

export function createMockSkillRegistry(): ISkillRegistry {
  return {
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    unregister: vi.fn(),
  }
}
```

---

## 📋 P1 模块测试设计

### 3. tools 模块（12 文件 → 3 测试文件）

**测试文件设计**：
```
tools/
├── __tests__/
│   ├── tool-registry.test.ts         # 工具注册表
│   ├── core/
│   │   ├── read-tool.test.ts         # 文件读取工具
│   │   ├── write-tool.test.ts        # 文件写入工具
│   │   └── bash-tool.test.ts         # Bash 执行工具
```

**测试用例设计**：

#### `tool-registry.test.ts`（预计 70 行）
```typescript
describe('ToolRegistry', () => {
  describe('register()', () => {
    it('应注册新工具')
    it('应在工具名冲突时抛出错误')
    it('应验证工具 schema')
  })

  describe('get()', () => {
    it('应返回已注册的工具')
    it('应在工具不存在时返回 undefined')
  })

  describe('listByCategory()', () => {
    it('应按类别分组返回工具')
    it('应支持多类别工具')
  })

  describe('权限检查', () => {
    it('应在工具被禁用时拒绝调用')
    it('应在权限不足时抛出错误')
  })
})
```

#### `read-tool.test.ts`（预计 60 行）
```typescript
describe('ReadTool', () => {
  it('应正确读取文件内容')
  it('应支持相对路径')
  it('应支持绝对路径')
  it('应在文件不存在时抛出错误')
  it('应在权限不足时抛出错误')
  it('应支持二进制文件（base64 编码）')
  it('应支持大文件分块读取')
})
```

---

### 4. prompt 模块（5 文件 → 2 测试文件）

**测试文件设计**：
```
prompt/
├── __tests__/
│   ├── prompt-manager.test.ts        # Prompt 管理器（604 LOC）
│   └── builtin-prompts.test.ts       # 内置 Prompt
```

**测试用例设计**：

#### `prompt-manager.test.ts`（预计 100 行）
```typescript
describe('PromptManager', () => {
  describe('loadPrompts()', () => {
    it('应加载内置 Prompt')
    it('应加载用户自定义 Prompt')
    it('应合并多个 Prompt 源')
  })

  describe('render()', () => {
    it('应正确替换变量占位符')
    it('应支持条件渲染（{{#if}}）')
    it('应支持循环渲染（{{#each}}）')
    it('应支持嵌套模板')
  })

  describe('变量注入', () => {
    it('应注入系统变量（date / user / workspace）')
    it('应注入会话变量（history / context）')
    it('应注入 Skill 变量')
  })

  describe('错误处理', () => {
    it('应在变量未定义时警告')
    it('应在模板语法错误时抛出错误')
  })
})
```

---

### 5. mcp 模块（4 文件 → 2 测试文件）

**测试文件设计**：
```
mcp/
├── __tests__/
│   ├── mcp-manager.test.ts           # MCP 管理器
│   └── mcp-client.test.ts            # MCP 客户端
```

**测试用例设计**：

#### `mcp-manager.test.ts`（预计 80 行）
```typescript
describe('MCPManager', () => {
  describe('connectServer()', () => {
    it('应连接到 MCP 服务器')
    it('应在连接失败时重试')
    it('应在超时后抛出错误')
  })

  describe('listTools()', () => {
    it('应返回服务器提供的工具列表')
    it('应缓存工具列表')
    it('应在服务器断开时清除缓存')
  })

  describe('callTool()', () => {
    it('应正确调用 MCP 工具')
    it('应传递参数')
    it('应返回结果')
    it('应在工具不存在时抛出错误')
  })

  describe('生命周期', () => {
    it('应在断开连接时清理资源')
    it('应支持重新连接')
  })
})
```

---

## 📋 P2 模块测试设计

### 6. context 模块（5 文件 → 2 测试文件）

**测试文件设计**：
```
context/
├── __tests__/
│   ├── context-manager.test.ts       # 上下文管理器
│   └── conversation-compressor.test.ts # 对话压缩
```

### 7. permission 模块（4 文件 → 2 测试文件）

**测试文件设计**：
```
permission/
├── __tests__/
│   ├── rule-matcher.test.ts          # 规则匹配器
│   └── permission-hooks.test.ts      # 权限钩子
```

### 8. validation 模块（8 文件 → 3 测试文件）

**测试文件设计**：
```
validation/
├── __tests__/
│   ├── json-validator.test.ts        # JSON 验证器
│   ├── image-validator.test.ts       # 图片验证器
│   └── output-validator.test.ts      # 输出验证器
```

---

## 🛠️ 测试基础设施

### 共享 Mock 工具

创建 `packages/neko-agent/test-utils/` 包：

```typescript
// test-utils/src/mocks/session.ts
export function createMockSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    id: 'test-session-id',
    messages: [],
    config: createMockConfig(),
    ...overrides,
  }
}

// test-utils/src/mocks/llm.ts
export function createMockLLMClient(): ILLMClient {
  return {
    chat: vi.fn().mockResolvedValue({ content: 'mock response' }),
    stream: vi.fn().mockReturnValue(mockStream()),
  }
}

// test-utils/src/mocks/vscode.ts
export function createMockVSCodeAPI() {
  return {
    workspace: {
      fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    window: {
      showInformationMessage: vi.fn(),
    },
  }
}

// test-utils/src/fixtures/skills.ts
export const FIXTURES = {
  validSkill: `---\nname: test\n---\nContent`,
  invalidSkill: `---\ninvalid yaml\n---`,
}
```

### Vitest 配置增强

```typescript
// packages/neko-agent/packages/agent/vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 40,      // 目标：40% 行覆盖率
        functions: 35,  // 目标：35% 函数覆盖率
        branches: 30,   // 目标：30% 分支覆盖率
      },
      exclude: [
        '**/__tests__/**',
        '**/test-utils/**',
        '**/examples/**',
      ],
    },
    setupFiles: ['./test-setup.ts'],
  },
})

// test-setup.ts
import { vi } from 'vitest'

// Mock VSCode API
vi.mock('vscode', () => ({
  workspace: {},
  window: {},
  commands: {},
}))

// Mock Logger
vi.mock('@neko/shared/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))
```

---

## 📈 实施计划

### Phase 1: P0 模块（预计 2-3 天）

| 任务 | 文件数 | 预计行数 | 负责人 |
|------|--------|----------|--------|
| commands 测试 | 5 | ~400 | - |
| skill 测试 | 5 | ~500 | - |
| test-utils 基础设施 | 3 | ~200 | - |

**验收标准**：
- ✅ commands 模块覆盖率 > 60%
- ✅ skill 模块覆盖率 > 50%
- ✅ 所有测试通过 CI

### Phase 2: P1 模块（预计 2 天）

| 任务 | 文件数 | 预计行数 |
|------|--------|----------|
| tools 测试 | 3 | ~200 |
| prompt 测试 | 2 | ~150 |
| mcp 测试 | 2 | ~150 |

**验收标准**：
- ✅ 整体覆盖率 > 30%
- ✅ 核心路径全部覆盖

### Phase 3: P2 模块（预计 1-2 天）

| 任务 | 文件数 | 预计行数 |
|------|--------|----------|
| context 测试 | 2 | ~120 |
| permission 测试 | 2 | ~100 |
| validation 测试 | 3 | ~150 |

**验收标准**：
- ✅ 整体覆盖率 > 40%
- ✅ CI 覆盖率门禁启用

---

## 🎯 成功指标

### 量化目标

| 指标 | 当前 | Phase 1 | Phase 2 | Phase 3 |
|------|------|---------|---------|---------|
| 文件覆盖率 | 11% | 20% | 30% | 40% |
| 行覆盖率 | ~10% | 25% | 35% | 40% |
| 测试文件数 | 43 | 56 | 63 | 70 |
| 核心模块覆盖 | 5/15 | 7/15 | 10/15 | 13/15 |

### 质量目标

- ✅ 所有 P0 模块有单元测试
- ✅ 关键路径有集成测试
- ✅ CI 覆盖率门禁启用（40% 阈值）
- ✅ 测试执行时间 < 30s（单包）

---

## 📚 参考资源

- [Vitest 文档](https://vitest.dev/)
- [测试最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [CLAUDE.md 测试规范](../../CLAUDE.md#4️⃣-测试规范)
- [现有测试示例](./packages/agent/src/task/__tests__/task-manager.test.ts)

---

*最后更新：2026-03-10*
