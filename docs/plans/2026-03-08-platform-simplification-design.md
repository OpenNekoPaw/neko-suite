# @neko/platform 简化重构 — 设计方案

**日期**: 2026-03-08
**状态**: 草稿

## 问题

`@neko/platform` 积累了与实际使用模式不符的复杂度：

1. **LLMRoutingManager 是死代码** — `Service`（执行所有 chat/stream 调用的类）从不调用 `platform.llmRouter`。六个路由策略（UserPreference、HealthFilter、CapabilityFilter、ContextWindow、CostOptimization、LoadBalancing）被实例化但在任何请求路径中均未被调用。

2. **GroupManager 过度设计** — Group 体系（Priority / RoundRobin / Weighted / CostOptimal 策略、per-group fallback 配置、ExecutionGroup）是为解决多 provider 负载均衡问题而设计的，但 VSCode AI 助手用户根本没有这个需求。绝大多数用户配置一个 provider 和一个 model。

3. **HealthMonitor 是死代码** — `core/health-monitor.ts` 没有任何调用者。`ProviderRegistry` 使用自己内联的 `fetch` 健康检查；`LLMRoutingManager` 接受可选的 `healthMonitor` 参数，但工厂函数从未传入该参数。

4. **AnalysisTools 和 DocumentTools 是未实现的占位符** — `AnalyzeImageTool`、`GenerateScriptTool` 等依赖 `VisionAnalysisService` 和 `DocumentGenerationService` 接口，但这两个接口在整个代码库中没有任何具体实现，这些工具无法正常工作。

5. **PromptManager 设计断裂** — `createPlatform()` 创建的是一个空的 `PromptManager`，而 `ConfigManager` 通过 `getPrompts()` 独立持有内置 prompt 预设，两者从未连接，导致 `platform.prompts` 始终是空的 Map。

6. **MediaServiceAdapter 是不必要的中间层** — 生成工具的调用链为：`GenerateImageTool → AIGenerationService → MediaServiceAdapter → IMediaGenerationService → MediaGenerationService`。中间的 `AIGenerationService + MediaServiceAdapter` 层仅做字段名转换，工具可以直接依赖 `IMediaGenerationService`。

7. **UserConfigManager 与 FileUserConfigManager 重复约 400 行** — 所有 Provider / Model / Group / MCP / Workflow / Prompt 变更方法在两个类中完全相同地实现了两遍，仅存储后端不同。

## 解决方案

三条并行工作线，按风险由低到高排序：

- **Track A：删除死代码** — 移除无调用者的模块，零功能变更
- **Track B：以 ModelSelector 替换 GroupManager** — 用更简单的模型解析算法驱动现有的 `taskDefaults` 配置字段，同时保留 fallback 行为
- **Track C：修复设计断裂** — 解决 PromptManager 断链、UserConfig 重复代码、GenerationTools 适配层冗余问题

## 影响范围

主要影响 `packages/neko-agent/packages/platform/`。`@neko-agent/extension` 需要针对性更新，移除对 `platform.groups` 和 `platform.llmRouter` 的引用。

---

## Track A — 删除死代码

### A1. LLM 路由系统（约 700 行）

**待删除文件：**

```
src/llm/routing/llm-routing-manager.ts
src/llm/routing/types.ts
src/llm/routing/strategies/user-preference.ts
src/llm/routing/strategies/health-filter.ts
src/llm/routing/strategies/capability-filter.ts
src/llm/routing/strategies/context-window.ts
src/llm/routing/strategies/cost-optimization.ts
src/llm/routing/strategies/load-balancing.ts
src/llm/routing/strategies/index.ts
src/llm/routing/index.ts
```

**死代码证明：** `Service.resolveRouting()` 调用 `groupManager.route()`，从不调用 `llmRouter`。`createPlatform()` 创建了 `LLMRoutingManager` 并将其暴露为 `platform.llmRouter`，但没有任何内部代码调用其方法。

**对 `core/router.ts` 的影响：** `core/router.ts` 中的 `BaseRoutingManager` 同时被 `MediaRoutingManager` 继承，**不可删除** `core/router.ts`，只删除基于它构建的 LLM 路由层。

### A2. HealthMonitor（约 180 行）

**待删除文件：**

```
src/core/health-monitor.ts
```

**死代码证明：**
- `createPlatform()` 从未创建 `HealthMonitor` 实例
- `LLMRoutingManager(providerRegistry, configManager, healthMonitor?)` 的可选参数从未被传入
- `ProviderRegistry.checkProviderHealth()` 独立实现了自己的 HEAD 请求健康检查，与 `HealthMonitor` 无关

### A3. SelectionStrategy（约 200 行）

**待删除文件：**

```
src/core/selection-strategy.ts
```

只有 `GroupManager` 导入此文件。Track B 替换 `GroupManager` 后，此文件将无任何调用者。

### A4. Group / ExecutionGroup 体系

**待删除文件：**

```
src/provider/group-manager.ts             # 由 ModelSelector 替代
src/provider/execution-group-manager.ts   # Service 从未调用
src/types/group.ts
src/types/execution-group.ts
src/config/presets/en/groups.json
src/config/presets/en/execution-groups.json
src/config/presets/zh-cn/groups.json
src/config/presets/zh-cn/execution-groups.json
```

### A5. AnalysisTools 和 DocumentTools（约 400 行）

**待删除文件：**

```
src/tools/analysis-tools.ts
src/tools/document-tools.ts
src/tools/generation/character.ts
src/tools/generation/enhance-video.ts
src/tools/generation/optimize-audio.ts
src/tools/generation/style.ts
```

**原因：** `AnalyzeImageTool`、`ExtractImageTextTool`、`AnalyzeVideoTool`、`ExtractVideoSummaryTool` 均依赖 `VisionAnalysisService`；`GenerateScriptTool`、`GenerateStoryboardTool`、`GenerateSubtitlesTool` 依赖 `DocumentGenerationService`。两个接口在代码库中均无具体实现，这些工具是结构性占位符。

图像分析和文档生成功能应在 `@neko/agent` 层通过 LLM vision 能力和 `chatWithTools` 实现，而非在 platform 层通过不透明的服务接口抽象。

---

## Track B — 以 ModelSelector 替换 GroupManager

### B1. 新建：`service/model-selector.ts`

```typescript
/**
 * ModelSelector — 替代 GroupManager 的简单模型解析器
 *
 * 解析优先级：
 *   1. 调用方显式指定的 modelId
 *   2. 配置中 taskDefaults[taskType]（用户/工作区配置）
 *   3. 第一个有匹配能力且配置了 apiKey 的可用 model
 */
export interface ResolvedModel {
  modelId: string;
  providerId: string;
  attempt: number;   // 从 1 开始，每次 fallback 递增
}

export class ModelSelector {
  constructor(
    private config: ConfigManager,
    private registry: ProviderRegistry
  ) {}

  resolve(
    taskType: 'chat' | 'embedding',
    options: { modelId?: string; excludeModels?: string[] } = {}
  ): ResolvedModel { ... }

  /** 判断该错误类别是否应触发 fallback 到下一个 model */
  shouldFallback(error: PlatformError): boolean {
    return ['rate_limit', 'timeout', 'server', 'network'].includes(error.category);
  }
}
```

解析逻辑：

```
options.modelId
  ?? config.getTaskDefaults()?.[taskType]
  ?? 第一个满足以下条件的 enabled model：
       model.capabilities 包含 taskType 对应能力
       AND provider.apiKey 已配置
       AND providerRegistry.isProviderAvailable(providerId)
       AND !excludeModels.includes(modelId)
  ?? 抛出 PlatformError({ category: 'not_found', code: 'NO_AVAILABLE_MODEL' })
```

### B2. 更新 `ConfigManager`

新增方法：

```typescript
getTaskDefaults(): TaskDefaults | undefined {
  const user = this.userConfigManager?.load().taskDefaults;
  const workspace = this.workspaceConfig?.taskDefaults;
  // 工作区配置优先于用户配置
  return workspace ?? user;
}
```

删除：`getGroup()`、`getGroups()`、`getEnabledGroups()`、`setGroup()` 方法，以及 `ensureMerged()` 中对应的 `sections.groups` 调用。

从 `MergedConfig` 中删除 `groups`、`executionGroups` 字段。

### B3. 更新 `Service`

将 `GroupManager` 依赖替换为 `ModelSelector`。原 `resolveRouting()` 方法（含 Group fallback 逻辑约 75 行）简化为：

```typescript
private resolveModel(
  taskType: 'chat' | 'embedding',
  options: { modelId?: string; excludeModels?: string[] }
): ResolvedModel {
  return this.selector.resolve(taskType, options);
}
```

`chat()` 的 fallback 循环保持不变——出错时将 `routing.modelId` 加入 `excludeModels`，再次调用 `resolve()`。`ModelSelector.shouldFallback()` 替代原 `GroupManager.routeFallback()` 中的 `shouldTriggerFallback()` 逻辑。

### B4. 更新 `Platform` 接口

```typescript
// 重构前
interface Platform {
  config: ConfigManager;
  providers: ProviderRegistry;
  groups: GroupManager;          // 删除
  llmRouter: LLMRoutingManager;  // 删除
  tools: IToolRegistry;
  prompts: PromptManager;
  media: MediaGenerationService;
  createService(defaultGroupId?: string): Service;
  dispose(): void;
}

// 重构后
interface Platform {
  config: ConfigManager;
  providers: ProviderRegistry;
  tools: IToolRegistry;
  media: MediaGenerationService;
  createService(): Service;
  dispose(): void;
}
```

`ModelSelector` 在 `createService()` 内部创建，不暴露于 `Platform` 接口。

### B5. 更新 `UserConfig` 和 `WorkspaceConfig`

从 `UserConfig` 中删除：

```typescript
groups: Group[];                                    // 删除
groupOverrides: Record<string, Partial<Group>>;     // 删除
```

`taskDefaults?: TaskDefaults` 字段已存在，即为替代方案。

同步删除 `WorkspaceConfig` 中对应字段。

从 `config-section-impls.ts` 中删除 `GroupSection` 和 `ExecutionGroupSection`。

### B6. 更新 `BuiltinPresets`

从 `BuiltinPresets` 接口和 `loadBuiltinPresets()` 函数中删除 `groups`、`executionGroups` 的加载逻辑。

---

## Track C — 修复设计断裂

### C1. 修复 PromptManager 断链问题

**问题：** `createPlatform()` 创建的是空的 `PromptManager`，内置 prompt 预设存在于 `ConfigManager.getPrompts()` 中，两者从未连接。

**方案 A（推荐）：** 从 `Platform` 接口中删除 `prompts: PromptManager`，调用方直接使用 `platform.config.getPrompts()` 和 `platform.config.getPrompt(id)`。

**方案 B：** 在 `createPlatform()` 中，构造时将 `configManager.getPrompts()` 预加载到 `PromptManager`，并通过 `configManager.onChange()` 监听配置变更时重新加载。

方案 A 更简洁，且避免了数据双份维护的问题。

### C2. 简化 GenerationTools 适配链

**当前调用链：**
```
GenerateImageTool → AIGenerationService → MediaServiceAdapter → IMediaGenerationService
```

**简化后调用链：**
```
GenerateImageTool → IMediaGenerationService（直接依赖）
```

变更内容：
- 重写 `generation-tools.ts`，接受 `IMediaGenerationService` 而非 `AIGenerationService`
- 删除 `media-service-adapter.ts`
- 删除 `generation/` 子目录中无 media-service 对应实现的工具（character、enhance-video、optimize-audio、style-transfer）

### C3. 消除 UserConfigManager 重复代码（低优先级）

提取 `BaseUserConfigManager` 抽象基类，包含 Provider / Model / MCP / Workflow / Prompt 的共用变更逻辑。`UserConfigManager`（VSCode globalState）和 `FileUserConfigManager`（文件存储）仅在 `load()` 和 `save()` 实现上有所不同。

此项可消除约 400 行重复代码，但无功能影响，建议放入独立的 cleanup PR 处理。

---

## 不变的部分

| 模块 | 保留原因 |
|------|---------|
| `core/router.ts`（BaseRoutingManager） | `MediaRoutingManager` 继承此类 |
| `core/circuit-breaker.ts` | `ProviderRegistry` 核心依赖 |
| `core/rate-limiter.ts` | `ProviderRegistry` 核心依赖 |
| `core/http-client.ts` | LLM adapter 使用 |
| `llm/adapter/*` | 全部 provider 适配器（OpenAI / Anthropic / Google / Azure / Ollama / Generic） |
| `provider/provider-registry.ts` | 熔断器 + 限流器管理 |
| `provider/retry-executor.ts` | 重试 + 超时逻辑 |
| `provider/platform-error.ts` | 结构化错误类型 |
| `config/base-config-section.ts` | 三层合并模式 |
| `config/config-manager.ts`（核心方法） | Provider / Model / MCP / Prompt 方法 |
| `config/chat-model-service.ts` | UI 模型选择列表 |
| `config/config-export-service.ts` | Provider 导入 / 导出 |
| `media/*` | 完整媒体生成栈（有真实多 provider 路由需求） |
| `task/*` | 媒体任务持久化 |
| `tools/project-tools.ts` | Timeline / Track / Element 操作 |
| `tools/generation-tools.ts` | 简化后保留（Track C2） |
| `service/service.ts` | 简化后保留（Track B3） |
| `service/shared-service-adapter.ts` | IService 桥接适配器 |

---

## 删除 / 替换汇总

| 组件 | 重构前 | 重构后 |
|------|--------|--------|
| LLM 路由 | `LLMRoutingManager` + 6 个策略（约 700 行） | 删除（死代码） |
| 模型选择 | `GroupManager` + `SelectionStrategy` + Group 配置（约 500 行） | `ModelSelector`（约 80 行）+ `taskDefaults` 配置 |
| 健康监控 | `HealthMonitor`（约 180 行） | 删除（死代码） |
| 分析工具 | `AnalysisTools` + 未实现的接口（约 200 行） | 删除（移至 agent 层实现） |
| 文档工具 | `DocumentTools` + 未实现的接口（约 200 行） | 删除（移至 agent 层实现） |
| 生成工具适配层 | `AIGenerationService + MediaServiceAdapter`（约 200 行） | 简化为直接依赖 `IMediaGenerationService` |
| `Platform.prompts` | 空的 `PromptManager`（设计断裂） | 删除，改用 `config.getPrompts()` |
| `Platform.groups` | `GroupManager` 实例 | 删除 |
| `Platform.llmRouter` | `LLMRoutingManager` 实例 | 删除 |

**净代码变化：** 删除约 2,000 行，新增约 80 行（`ModelSelector`）。

---

## 执行顺序

```
Step 1  删除 LLM 路由死代码
        llm/routing/* → 删除
        验证：tsc --noEmit 通过

Step 2  删除 HealthMonitor
        core/health-monitor.ts → 删除
        验证：tsc --noEmit 通过

Step 3  新建 ModelSelector
        service/model-selector.ts → 创建

Step 4  更新 ConfigManager
        删除 group 相关方法；新增 getTaskDefaults()

Step 5  更新 UserConfig / WorkspaceConfig
        删除 groups / groupOverrides 字段

Step 6  更新 config-section-impls 和 builtin-presets
        删除 GroupSection、ExecutionGroupSection，移除 JSON 导入

Step 7  更新 Service
        GroupManager → ModelSelector

Step 8  更新 Platform 接口和 createPlatform()
        删除 groups、llmRouter；ModelSelector 在 createService() 内创建

Step 9  删除 Group 相关文件
        group-manager.ts、execution-group-manager.ts、
        types/group.ts、types/execution-group.ts、
        selection-strategy.ts、
        presets/*/groups.json、execution-groups.json

Step 10 修复 PromptManager 断链（Track C1）
        删除 Platform.prompts 字段

Step 11 简化 GenerationTools（Track C2）
        重写 generation-tools.ts 直接使用 IMediaGenerationService
        删除 media-service-adapter.ts

Step 12 删除 AnalysisTools 和 DocumentTools（Track A5）

Step 13 更新 extension 层
        删除 @neko-agent/extension 中对
        platform.groups 和 platform.llmRouter 的引用

Step 14 更新测试
        删除 group-manager 测试；新增 model-selector 测试

Step 15 最终类型检查
        cd packages/neko-agent/packages/platform && npx tsc --noEmit
        cd packages/neko-agent/packages/extension && npx tsc --noEmit
```

---

## 风险评估

| 风险 | 严重程度 | 缓解措施 |
|------|---------|---------|
| 用户配置文件中已有 `groups` 字段 | 低 | JSON 多余字段会被静默忽略；`taskDefaults` 是替代方案且已支持 |
| 误删 `core/router.ts` | 中 | `MediaRoutingManager` 继承 `BaseRoutingManager`——每步后验证 Media 测试通过 |
| extension 层引用了 `platform.groups` | 低 | TypeScript 会在 Step 13 捕获所有调用点 |
| LLM fallback 行为变化 | 低 | `ModelSelector` 的 fallback 循环保持相同语义：排除失败 model，尝试下一个 |
