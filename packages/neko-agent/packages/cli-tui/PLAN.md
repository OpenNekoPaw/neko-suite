# TUI 复用 Platform 迁移计划

## 现状分析

### TUI 自建了什么（应该复用 Platform 的）

| TUI 自建模块 | 行数 | Platform 对应 | 重复度 |
|---|---|---|---|
| `core/llm-client.ts` — 手写 HTTP fetch + SSE 流解析 | 767 | `Service` + `AISdkAdapter` (Vercel AI SDK) | **100%** |
| `core/llm-service-adapter.ts` — ILLMClient→IService 桥接 | 145 | `Platform.createService()` 直接返回 IService | **100%** |
| `core/config.ts` — 配置加载/合并/保存 | 729 | `ConfigManager` + `FileUserConfigManager` | **~80%** |
| `core/types.ts` — PROVIDERS 硬编码 3 个 | 133 | `default-config.ts` 预设 6+ 提供商 | **90%** |

**总计 ~1774 行可删除/大幅简化。**

### TUI 正确复用 Agent 的部分（无需改动）

- `AgentSession` / `createAgentSession` ✅
- `MCPManager` / `createAllMCPTools` ✅
- `ToolRegistry` / `createCoreTools` ✅
- `SkillService` / `SkillLoader` ✅
- `SystemPromptBuilder` / `InputProcessor` ✅

### TUI 应保留的自有模块

- UI 层: components/, stores/, adapters/
- CLI 入口: cli.tsx, runner.ts
- 主题: theme/
- CLI 特有字段: verbose, outputFormat

---

## 迁移步骤

### Step 1: 引入 Platform，替换 LLM 层

**删除**: `core/llm-client.ts`, `core/llm-service-adapter.ts`

**改造 `useAgentSession.ts`**:
```
// Before:
const llmService = createLLMServiceAdapter(config, service);

// After:
const platform = createPlatform({
  userConfigManager: new FileUserConfigManager(),
  workspacePath: config.workDir,
  toolRegistry,
});
const llmService = service ?? platform.createService();
```

### Step 2: 简化配置层

**大幅简化 `core/config.ts`**:
- 删除 provider 解析、model 解析、API key 查找等逻辑（Platform ConfigManager 已有）
- 保留: CLI 命令行参数解析 → 薄层转换为 Platform 配置
- 保留: CLI 特有字段（verbose, outputFormat, thinkingBudget）

**简化 `core/types.ts`**:
- 删除 `PROVIDERS` 常量和 `ProviderConfig` 类型
- `CLIConfig` 简化为 CLI 特有字段 + Platform 配置引用

### Step 3: 更新 model 切换逻辑

**改造 `updateModel`**:
```
// Before: serviceAdapterRef.current.rebuild(newConfig)
// After:  platform.config.updateModelOverride(...) 或重建 service
```

### Step 4: 更新 package.json 依赖

- 添加 `@neko/platform` 为显式依赖
- 移除不再需要的直接 AI SDK 依赖（如果有）
