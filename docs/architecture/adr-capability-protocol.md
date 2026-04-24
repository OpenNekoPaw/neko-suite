# ADR: Capability Protocol — neko 统一能力扩展协议

## 状态

Proposed (2026-04-25)

## 背景

neko-suite 的扩展生态在过去数轮 ADR 累积中，已经形成了多种并列的能力类型：Tool / Operation / ToolGroup / Skill / ProviderCard / MCP Server / PromptFragment / AgentCapabilityProvider / VSCode Extension。这些机制在各自 ADR 中都有定义，但缺少**一份统一协议**来回答三个基础问题：

- **Discovery**：系统怎么找到能力？
- **Injection**：什么时候把能力暴露给 LLM？
- **Trust**：这个能力是谁贡献的，权限到哪？

当前 `AgentCapabilityProvider` 是**事实上的接入协议**，但只部分解决 Discovery，后两者是隐式、分散、不可审计的。这带来六个具体问题：

### 问题 1：两阶段混淆，注册即注入

当前 ToolInjectionManager 虽然有 `resident/eager/lazy` 三层 tier，但贡献者常常假设"注册了就会被 AI 看到"——实际上 Registration 与 Injection 是两件不同的事，从未被明确区分。后果：

- 10 个子包各贡献 50 个 Tool → 默认全部进入 LLM context → token 爆炸
- Skill 的 allowedTools 筛选与 ToolInjectionManager 的 tier 筛选逻辑重叠
- MCP Server 异步连接慢阻塞启动

### 问题 2：Tool 来源不统一，命名易冲突

Tool 当前有四种实际来源：
- Internal（@neko/\* 子包，走 TOOL_NAMES 常量）
- MCP Server（外部进程）
- Market 下发（通过 Plugin 机制）
- 用户本地 `.neko/plugins/`

但四者没有统一命名约定，容易出现不同来源的 Tool 重名，且注册时无法追溯来源。

### 问题 3：Operation 被错误并列为独立概念

§11.6.2 明确声明 Tool/Operation 二分，但文档/讨论中经常把它们描述为"5 大核心概念之一"。类型上它们共享 `ToolDef` 接口，只有 `kind` 字段不同。这种"名义并列、实质子类"的错位容易误导新贡献者。

### 问题 4：ToolGroup 存在滥用风险

当前 ToolGroup 没有明确使用原则，子包作者可能为"组织"而非"跨 Skill 共享"建 ToolGroup，导致 ToolGroup 数量膨胀、语义散乱。

### 问题 5：MCP 关系错位

一个普遍的理解误区是"MCP 可以替代 Skill/Tool"。实际上 MCP 只解决 tool/resource/prompt 三原语的**进程间通信**，不覆盖 Skill 编排、ProviderCard 能力画像、ToolGroup 动态激活等 neko 特化语义。MCP 应作为 Tool 的一种**后端实现方式**被接入，而非替代现有概念。

### 问题 6：VSCode 扩展接入不清晰

VSCode 扩展包含两类本质不同的内容：
- **Agent 能力**（Tool/Skill/ProviderCard）—— 应走 neko 协议
- **IDE 集成**（commands/menus/views）—— 应走 VSCode 原生 API

当前既没有明确的分层模型，也没有两类内容的桥接规范。

### 问题 7：无信任模型

当前所有贡献者一视同仁，没有 `core / community / untrusted` 三级信任划分。这在 Market 开放后是明显安全漏洞——社区下发的 Skill 理论上可以调用任何 Tool，包括不可逆的 Operation。

## 决策

本 ADR 正式化 **neko Capability Protocol v1.0**，承托已有与即将到来的所有能力扩展机制。

### 1. 两阶段模型（Registration / Injection 分离）

协议的第一个关键决策是把"能力存在"与"能力可见"解耦：

```
┌──────────────────────────────────────────────────────┐
│ Phase 1: REGISTRATION（注册相）                       │
│   能力被发现 → 进入 Registry → 可查询但不消耗 LLM 上下文│
│   触发源：                                            │
│     ├─ Manifest 扫描（约定目录 markdown）              │
│     ├─ registerCapabilities 命令/API（动态）           │
│     ├─ MCP Server 连接后的能力枚举                    │
│     └─ Marketplace 安装后的自动注册                   │
├──────────────────────────────────────────────────────┤
│ Phase 2: INJECTION（注入相）                          │
│   Registry 中的能力 → 按策略注入 LLM 上下文            │
│   决策者：                                            │
│     ├─ ToolInjectionManager（tier: resident/eager/lazy)│
│     ├─ Skill activation（allowedTools + allowedGroups）│
│     ├─ ProviderRouter（按 styleFamily × Training Profile）│
│     └─ 元工具 ActivateToolSet / DeactivateToolSet     │
└──────────────────────────────────────────────────────┘
```

**关键约束**：Registration 是同步 / 轻量 / 事务性；Injection 是异步 / 按需 / 可被消融。贡献者声明能力，Agent 决定何时使用。

### 2. CapabilityContribution v1.0 Schema

统一贡献入口定义在 `@neko/shared/types/capability-protocol.ts`：

```typescript
export interface CapabilityContribution {
  // ─── 元数据 ───
  readonly contributorId: string;              // '@neko/cut' | 'com.acme.plugin'
  readonly protocolVersion: '1.0';
  readonly version: string;                    // semver
  readonly trustLevel: TrustLevel;
  readonly displayName: string;
  readonly description?: string;

  // ─── 能力声明（四维并列，无 Operation 独立项）───
  readonly tools?: ToolContribution[];
  readonly toolGroups?: ToolGroupContribution[];
  readonly skillFiles?: string[];              // 路径引用，不内嵌
  readonly providerAdapters?: ProviderAdapterContribution[];
  readonly providerCardFiles?: string[];       // 路径引用
  readonly promptFragmentFiles?: string[];     // 路径引用

  // ─── 外部集成 ───
  readonly mcpServers?: McpServerContribution[];

  // ─── 宿主要求 ───
  readonly hostRequirements?: HostRequirement[];

  // ─── 生命周期钩子 ───
  activate?(ctx: CapabilityContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
  onUpgrade?(from: string, to: string): Promise<void> | void;
}

export type TrustLevel = 'core' | 'community' | 'untrusted';

export type HostKind = 'vscode' | 'cli' | 'tui' | 'web';

export interface HostRequirement {
  readonly capability:
    | 'vscode-extension-api'
    | 'node-fs'
    | 'rust-engine'
    | 'electron-app'
    | 'browser-dom';
  readonly optional?: boolean;
  readonly reason: string;
}

export interface CapabilityContext {
  readonly host: HostKind;
  readonly logger: ILogger;
  readonly storage: IScopedStorage;
  readonly events: IEventBus;
  readonly registry: IReadOnlyCapabilityRegistry;
}
```

**关键设计**：
- **四维能力并列**（tools / toolGroups / skills / providerCards），Operation 作为 Tool 的 kind 不占用独立字段
- **Markdown 资源以路径引用**（skillFiles / providerCardFiles / promptFragmentFiles），不内嵌——保证 markdown 静态可发现、AI 可预览、Market 下发无需运行时重组
- **mcpServers 声明式代理**——实际能力由 MCP 协议自然暴露，不需要在 contribution 里逐个列出
- **hostRequirements 使协议跨宿主可消费**——CLI/TUI 下缺失的能力通过 optional/降级处理

### 3. Tool 四来源投影与命名空间

所有 Tool 投影为统一 `ToolDef`，通过 source 元数据区分来源：

```
┌───────────────────────────────────────────────────────┐
│ Source 1: Internal（@neko/* 子包）                     │
│   命名：TOOL_NAMES_* 常量 SSOT（如 TIMELINE.TRIM_CLIP）│
│   trustLevel: core                                    │
│   运行时位置：进程内 TypeScript                        │
├───────────────────────────────────────────────────────┤
│ Source 2: MCP（外部进程）                              │
│   命名：mcp.<serverId>.<toolName>                     │
│   trustLevel: 随 contributor 决定                     │
│   运行时位置：进程外（stdio/sse/http）                  │
├───────────────────────────────────────────────────────┤
│ Source 3: Market（neko-market 下发 plugin）            │
│   命名：market.<pluginId>.<toolName>                  │
│   trustLevel: community                               │
│   运行时位置：进程内（plugin 加载）                     │
├───────────────────────────────────────────────────────┤
│ Source 4: User Local（.neko/plugins/）                │
│   命名：local.<folderName>.<toolName>                 │
│   trustLevel: untrusted（需显式 allow）               │
│   运行时位置：进程内（需用户激活）                      │
└───────────────────────────────────────────────────────┘
```

统一接口：

```typescript
export interface ToolDef {
  readonly name: string;                       // 完整命名空间
  readonly kind: 'tool' | 'operation';
  readonly source: ToolSource;                 // 来源标签
  readonly origin: {
    readonly contributorId: string;
    readonly trustLevel: TrustLevel;
  };
  readonly schema: JsonSchema;
  readonly costProfile?: CostProfile;          // 仅 kind='operation'
  readonly reversibility?: 'reversible' | 'irreversible';
  invoke(args: unknown, ctx: ToolInvokeContext): Promise<ToolResult>;
}
```

#### 命名冲突解决规则

```
规则 1：完全同名（含 namespace）→ 后注册者失败（严格）
规则 2：短名冲突（AI 在 Plan 里写 'trim_clip'）
         解析顺序：Core > Community > Untrusted
         同级冲突 → 要求完整 namespace
规则 3：用户可在 .neko/preferences.md 里声明 alias
         （"trim 优先指 cut.trim_clip"）
```

### 4. MCP 投影规则

MCP 三原语投影到 neko 概念：

| MCP 原语 | neko 投影 | 默认 Injection |
|---|---|---|
| `Tool` | `ToolDef`（kind 按 schema 严格度推断：强类型 → operation，自由文本 → tool）| `lazy`（Skill 引用后 eager） |
| `Resource` | `ResourceTool` + `asset://<serverId>/<path>` URI 空间 | `resident`（让 AI 知道存在）|
| `Prompt` | `PromptFragment`（environment 层） | 随 MCP server 激活注入 |

#### MCP 原生但不透传的能力

| MCP 特性 | 不开放原因 | neko 替代 |
|---|---|---|
| **Sampling**（MCP server 反向请求 LLM） | 外部进程调用内核 LLM 是安全漏洞 | 仅 `trustLevel: 'core'` 可用且需显式声明 |
| **Roots**（文件系统根路径声明） | 与 Policy 面 preferences 重叠 | 投影为 Policy 面 allowlist |
| **Server-initiated notifications** | 通知风暴风险 | 投影为 EventBus 事件，有限频率 |

#### MCP Server 生命周期

```typescript
export interface McpServerContribution {
  readonly id: string;
  readonly transport: 'stdio' | 'sse' | 'http';
  readonly command?: string[];                 // stdio 启动命令
  readonly url?: string;                       // sse/http 地址
  readonly env?: Record<string, string>;
  readonly trustLevel: TrustLevel;
  readonly capabilityFilter?: {
    readonly allowTools?: string[] | '*';
    readonly allowResources?: string[] | '*';
    readonly allowPrompts?: string[] | '*';
  };
  readonly healthCheck?: {
    readonly intervalMs: number;
    readonly onFailure: 'deactivate' | 'notify' | 'restart';
  };
}
```

### 5. 能力类型边界（四维正交）

协议承载的四类能力在四个正交维度，消费者不重叠，不可合并：

```
┌────────────────────────────────────────────────────────┐
│ 维度 1：动作原子                                         │
│   Tool（"做什么"）                                      │
│     ├─ kind='tool':      Read / Write / Grep           │
│     └─ kind='operation': trimClip / image.generate     │
│   消费者：AI function-call                              │
├────────────────────────────────────────────────────────┤
│ 维度 2：动作分组                                         │
│   ToolGroup（"一起激活哪些动作"）                        │
│   消费者：ToolInjectionManager                          │
├────────────────────────────────────────────────────────┤
│ 维度 3：编排身份                                         │
│   Skill（"用什么身份 + 什么流程做事"）                   │
│   消费者：AI（作为 persona）                             │
├────────────────────────────────────────────────────────┤
│ 维度 4：供给画像                                         │
│   ProviderCard（"用哪个模型做" + "它能理解什么"）         │
│   消费者：ProviderRouter + SemanticBridge               │
└────────────────────────────────────────────────────────┘
```

#### Operation 降级声明

**Operation 不是第 5 大概念**——它是 Tool 的 `kind` 枚举之一。文档、讨论、ADR 引用一律改为"Tool 的 tool/operation 二分"，不再并列宣讲。代码层已经是 discriminated union，本 ADR 只做文档与术语层面的收敛。

#### ToolGroup 使用原则（防滥用）

```
使用 ToolGroup 当且仅当：
  ✓ 工具集合被多个 Skill 共享
  ✓ 需要动态激活/停用
  ✓ 需要独立的激活规则

不使用 ToolGroup：
  ✗ 单个 Skill 的专用工具集合（内联到 Skill.allowedTools）
  ✗ 纯粹为"组织"而分组（Tool 的 source 元数据已经提供分组视角）
  ✗ ToolGroup 数量接近或超过 Skill 数量（分组过度）

硬性指标：ToolGroup 总数应显著少于 Skill 总数
         若 ToolGroup 被单个 Skill 引用 > 3 个月未被其他 Skill 共享
         → 应降级为该 Skill 内联的 allowedTools
```

### 6. 三级信任模型

```
┌─────────────────────────────────────────────────┐
│ Trust Level: core                               │
│   来源：@neko/* 官方包                           │
│   权限：全部（等同内核）                         │
│   审计：代码审查 + 源码公开                       │
├─────────────────────────────────────────────────┤
│ Trust Level: community                          │
│   来源：neko-market 审核通过                     │
│   权限：默认允许的白名单能力                     │
│   约束：                                         │
│     - kind='operation' 且 irreversible 需 approval│
│     - MCP Sampling 禁用                         │
│     - approvalRules 不能 override 'ask'        │
├─────────────────────────────────────────────────┤
│ Trust Level: untrusted                          │
│   来源：.neko/plugins/ 或未认证外部              │
│   权限：仅 kind='tool' + 显式用户授权             │
│   约束：                                         │
│     - 每次 activate 要求用户确认                 │
│     - 不能贡献 ProviderCard                      │
│     - 所有 Operation 强制 approval='ask'        │
│     - Prompt Fragment 必须标记来源显示给用户     │
└─────────────────────────────────────────────────┘
```

#### 信任能力矩阵

| 能力类型 | core | community | untrusted |
|---|---|---|---|
| Tool (kind='tool') | ✅ | ✅ | ✅ |
| Tool (kind='operation', reversible) | ✅ | ✅ | ⚠️ 需 approval |
| Tool (kind='operation', irreversible) | ✅ | ⚠️ 需 approval | ❌ 禁用 |
| ToolGroup | ✅ | ✅ | ✅ |
| Skill | ✅ | ✅ | ⚠️ 需用户确认激活 |
| ProviderCard | ✅ | ✅ | ❌ 禁用 |
| MCP Sampling | ✅ | ❌ | ❌ |
| Prompt Fragments | ✅ | ✅ | ⚠️ 标记来源 |

### 7. 宿主抽象与降级

`hostRequirements` 让协议可跨宿主消费：

```typescript
// 贡献者声明需要的宿主能力
hostRequirements: [
  {
    capability: 'vscode-extension-api',
    optional: false,
    reason: '需要注册 custom editor 承载 timeline UI',
  },
  {
    capability: 'rust-engine',
    optional: true,
    reason: '有引擎时硬件编码，否则 ffmpeg-wasm 降级',
  },
]
```

#### 降级投影规则

```
对每个 hostRequirement r：
  if host supports r:              → 正常注册
  else if r.optional:              → 注册但标记 'degraded'，能力内部 fallback
  else (r.optional=false):         → 拒绝注册，写 Journal event 'capability.skipped'
```

#### 跨宿主一致性保证

```
CLI 自然缺失的能力（例）：
  - 无 Webview → Custom Editor 类 Skill 无法激活
  - 无 VSCode commands → UI 驱动 Skill 降级
  - 有完整 Node fs → filesystem 类 Tool 全可用
  - 有 Rust Engine → 生成/编码能力全可用

协议保证：同一 contribution 在 VSCode/CLI 下得到不同的 Injection 集合，
         但 Registration 层面声明一致（可查询、可审计）。
```

### 8. VSCode 扩展接入：三层模型

VSCode 扩展的内容分成三层，各走各的机制：

```
┌────────────────────────────────────────────────────────┐
│ VSCode Extension Host                                   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 某个子包 extension（如 @neko/cut）                │  │
│  │                                                  │  │
│  │  ┌──────────────┐      ┌──────────────────────┐ │  │
│  │  │ IDE 集成     │      │ Agent 能力贡献         │ │  │
│  │  │ (VSCode API) │      │ (Capability Protocol) │ │  │
│  │  │              │      │                       │ │  │
│  │  │ commands     │      │ registerCapabilities()│ │  │
│  │  │ menus        │      │   tools               │ │  │
│  │  │ views        │      │   toolGroups          │ │  │
│  │  │ editors      │      │   skillFiles          │ │  │
│  │  │ keybindings  │      │   providerCardFiles   │ │  │
│  │  └──────┬───────┘      │   mcpServers          │ │  │
│  │         │              └──────────┬────────────┘ │  │
│  │         │                         │              │  │
│  │         └──── Layer 3: 桥接 ──────┘              │  │
│  │                (Command → Agent)                  │  │
│  └──────────────────────────────────────────────────┘  │
│                       │                                 │
│                       ▼                                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │ @neko/agent extension                             │  │
│  │                                                   │  │
│  │   exports: NekoAgentAPI                          │  │
│  │     - registerCapabilities()  ← 统一入口          │  │
│  │     - sendToAgent()           ← UI 桥接          │  │
│  │                                                   │  │
│  │   CapabilityRegistry ← 所有 contribution 汇总     │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

#### 两类内容的边界

| 类型 | 例子 | 路径 | 为什么 |
|---|---|---|---|
| **Agent 能力** | Tool / Skill / ProviderCard / ToolGroup / MCP | Capability Protocol | AI 消费，需要 schema 约束 + trust model |
| **IDE 集成** | Command / Menu / View / Editor / Keybinding | VSCode Extension API | 用户消费，VSCode 原生生命周期 |
| **桥接** | "右键菜单→发送 Agent" | VSCode 注册 UI，回调里调用 agentApi | 各自在各自协议，通过 ID 引用 |

#### 为什么不"每个概念一个 API"

统一协议 vs 分散 API 的关键差异：

| 维度 | 分散 API（`registerTools()` / `registerSkills()` / ...） | 统一协议（`registerCapabilities()`） |
|---|---|---|
| 原子性 | ❌ 碎片失败：tools 注册成功但 skills 失败 | ✅ 事务语义：全成功或全回滚 |
| 审计性 | ❌ 多处查询才知贡献全貌 | ✅ `getCapabilitiesByContributor()` 一次返回 |
| 信任传播 | ❌ 每次 register 都传 trustLevel 易遗漏 | ✅ 一次声明继承到所有能力 |
| 生命周期 | ❌ 多个 disposable，顺序敏感 | ✅ activate/deactivate/onUpgrade 统一钩子 |
| 新能力接入 | ❌ 加 API 是破坏性变更 | ✅ Contribution 字段 optional 扩展 |
| CLI/TUI 复用 | ❌ 每个 API 都要适配 | ✅ 协议统一解耦宿主 |

### 9. 静态 vs 动态能力（markdown 资源 vs 协议字段）

能力按是否需要运行时代码，分两类接入：

| 接入方式 | 内容 | 例子 | 为什么 |
|---|---|---|---|
| **静态 markdown 文件** + 协议内路径引用 | Skill / ProviderCard / PromptFragment | `skills/short-video-editor.skill.md` | markdown 天然可发现；AI 可预览；Market 下发无需重组；版本控制 diff 清晰 |
| **协议字段对象** | Tool / ToolGroup / ProviderAdapter / McpServer | `tools: [{ name, schema, invoke }]` | 需要运行时函数/配置 |
| **VSCode 原生 API** | Command / View / Menu / Editor | `vscode.commands.registerCommand(...)` | UI 生命周期与 Agent 能力解耦 |

#### 约定目录

```
<package-root>/
  skills/                     ← Skill markdown
    <id>.skill.md
  providers/                  ← ProviderCard markdown
    <id>.card.md
  prompt-fragments/           ← PromptFragment markdown
    <id>.fragment.md
  src/
    index.ts                  ← activate() + registerCapabilities()
```

**扩展在 activate 时只声明路径**，实际内容由 agent 扫描加载。这保证即便扩展未 activate，agent 也能通过目录扫描发现资源（用于 Market 预览、搜索索引等）。

### 10. 生命周期与版本化

#### 协议版本矩阵

```
protocolVersion: '1.0'   ← 本 ADR 冻结

兼容规则：
  - 主版本号不同 → 拒绝加载（写 Journal 'capability.rejected'）
  - 次版本号前向兼容
    （agent 1.0 可加载 contribution 1.0/1.1，不能加载 2.0）
  - 不兼容升级 → Market 发布适配版本
```

#### 升级流程

```
Contributor v1.2.0 → v1.3.0：
  1. 调用 deactivate()
  2. 清理 Registry 中本 contributor 的所有能力
  3. 加载 v1.3.0
  4. 调用 activate(ctx)
  5. 触发 onUpgrade('1.2.0', '1.3.0')
  6. 若有 Skill 当前已激活 → 提示用户可能行为变化
```

#### 卸载清理链

```
deactivate(contributorId) 触发：
  ├─ tools：从 ToolRegistry 移除；活跃 toolCall 不中断（本轮完成）
  ├─ toolGroups：从 ToolGroupRegistry 移除；已激活的保留到下轮
  ├─ skills：若正在激活 → 提示用户（停用/回退）
  ├─ providerCards：Router 降级到其他可用 provider
  ├─ mcp servers：关闭进程（优雅 10s + 强制 kill）
  └─ 写 Journal event: 'capability.deactivated'
```

### 11. Registry 查询面（可观测性）

协议必须提供 Registry 查询 API，让能力自省（§11.6.9 自评三件套的"可见性"基础）：

```typescript
export interface ICapabilityRegistry {
  // 查询
  getTools(filter?: ToolFilter): ToolDef[];
  getToolGroups(filter?: ToolGroupFilter): ToolGroupDef[];
  getSkills(filter?: SkillFilter): SkillDef[];
  getProviderCards(filter?: ProviderCardFilter): ProviderCard[];

  // 来源追溯
  getContributors(): ContributorInfo[];
  getCapabilitiesByContributor(id: string): CapabilityManifest;

  // 注册 vs 注入
  isRegistered(capabilityId: string): boolean;
  isInjected(capabilityId: string, context: 'current-turn'): boolean;

  // 事件
  onDidChange: IEvent<CapabilityChangeEvent>;
}

export interface CapabilityManifest {
  readonly contributorId: string;
  readonly trustLevel: TrustLevel;
  readonly tools: ToolDef[];
  readonly toolGroups: ToolGroupDef[];
  readonly skills: SkillDef[];
  readonly providerCards: ProviderCard[];
  readonly mcpServers: McpServerInfo[];
  readonly hostRequirements: HostRequirement[];
  readonly activatedAt: Date;
}
```

AI 可通过 `ListCapabilities` 类元工具查询自身能力——这是"让 AI 知道自己能做什么"的基础。

### 12. 反模式清单

| # | 反模式 | 为什么错 |
|---|---|---|
| 1 | Registration 即 Injection（所有注册 Tool 都进 LLM context）| context 爆炸；违反两阶段模型 |
| 2 | 扁平全局命名（无 namespace）| 抢占通用名字；无法审计来源 |
| 3 | 把 MCP Sampling 开放给所有 trust level | 安全漏洞；成本失控 |
| 4 | 无 protocolVersion 字段 | 无法灰度升级协议 |
| 5 | activate 失败静默 skip | 诊断困难；能力漂移 |
| 6 | host 不匹配时直接失败而非降级 | 可用性差；违反渐进增强 |
| 7 | Skill 可在 activate 时动态贡献新 Tool | 破坏两阶段；Registry 不稳定 |
| 8 | Registry 不支持查询 | 自评"可见性"无基础 |
| 9 | 卸载时硬断当前 toolCall | 数据一致性问题 |
| 10 | 把 preferences.md 做成 Policy contribution | 用户配置应独立于能力协议 |
| 11 | 全走 registerCapabilities（连 commands/views 都塞进去） | 破坏 VSCode 原生能力 |
| 12 | 全走 VSCode API（每个 Tool 做成 command） | AI function-call 协议断裂 |
| 13 | Skill 内嵌在 TypeScript 对象里 | 失去 markdown 静态发现/预览 |
| 14 | ProviderCard 内嵌在代码里 | Layer 2 Project Override 无处附加 |
| 15 | 把命令直接注册给 Agent 当 Tool | 两种调用模型混淆；权限模型不对齐 |
| 16 | 在 activate 里调多次 registerCapabilities | 破坏事务原子性 |
| 17 | 不检查 neko.agent 是否安装 | 无 agent 时扩展 crash |
| 18 | 每次 register 都传 trustLevel | 容易遗漏；community 包可能误声明 |
| 19 | registerCapabilities 不返回/不持有 disposable | 卸载时 Registry 不清理；Orphan |
| 20 | Operation 被文档并列为第 5 大概念 | 破坏类型系统真相；误导新贡献者 |
| 21 | ToolGroup 被滥用（数量 > Skill）| 分组语义泛化；失去跨 Skill 共享价值 |
| 22 | Tool 字段膨胀（加 skillAffinity/groupIds 等）| 破坏 Tool 最小抽象 |

## 明确不做的事

本 ADR **不包含**：

1. **不重写现有代码**——本 ADR 是"升格现有事实协议为正式规范"，当前 `AgentCapabilityProvider` 保持兼容，只是外面套一层正式 `CapabilityContribution` 类型
2. **不引入新的分发机制**——Market 已有，本 ADR 只是规范其能力声明接入点
3. **不替代 VSCode Extension API**——commands/menus/views 永远走 VSCode 原生
4. **不替代 MCP**——MCP 是 Tool 的后端之一，不是被替代对象
5. **不强制 Skill 全部 markdown**——允许少量极其简单的 Skill 在 activate 里 inline 声明，但默认应 markdown
6. **不引入能力私有存储的跨贡献者共享**——`IScopedStorage` 只对当前 contributor 可见
7. **不做 runtime 的能力 hotfix/patch**——能力升级必须通过完整 deactivate/activate 循环，不做部分字段热替换
8. **不做能力依赖声明**（`requires: ['@neko/cut@^1.0']`）——协议不承载包管理职责，交由 npm/Market
9. **不在协议层处理 UI 本地化**——i18n 由 @neko/shared/l10n 独立承担

## 结果与影响

### 正面影响

1. **一次性解决七份 ADR 的共同隐式依赖**——Control Plane / Provider Bridge / Federation / Memory Unification / Multi-Agent 等 ADR 都不再需要各自定义能力注册机制
2. **新扩展接入路径清晰**——贡献者按决策树（§VSCode 扩展接入）即可分类；不再需要逐一阅读多份 ADR
3. **Trust 模型封住 Market 开放后的安全漏洞**——三级信任 + 能力矩阵强制
4. **Registration/Injection 分离降低 token 成本**——大规模扩展可通过 tier 控制注入
5. **MCP 一等公民**——社区 MCP 生态（filesystem/git/puppeteer/...）可无缝接入
6. **CLI/TUI 能力一致性**——Host Abstraction 保证跨宿主可预期降级
7. **Operation 降级统一术语**——文档不再误导新贡献者
8. **ToolGroup 使用原则止住滥用倾向**

### 代价与约束

1. **现有 AgentCapabilityProvider 需要增字段**——但 optional，向后兼容
2. **文档同步工作量大**——7 份关联 ADR 需要分别更新引用
3. **Market 需要对接 trustLevel 认证流程**——需要审核工作流升级
4. **新 Trust Level 字段在现有子包需要补齐**——但默认推断为 'core'，不强制立刻修改
5. **协议版本化机制本身是新增成本**——首年几乎没收益，多年后兼容性保护价值凸显
6. **Registry 查询面多了一套 API**——需要维护文档、测试

### 演化评级影响

| 控制面 | 本 ADR 影响 |
|---|---|
| Prompt | A → A（保持） |
| Schema | A- → A（命名空间 + trustLevel 填空）|
| Runtime | A- → A（两阶段模型 + 生命周期规范）|
| Policy | B → B+（trust model 入 Policy 层）|
| Memory | A → A（保持）|
| Evaluator | A → A（保持）|
| Control | A- → A（Registry 统一化）|
| Provider | A → A（保持）|

## 后续演进

按 5 个 Stage 推进，每个 Stage 包含 2-3 个 PR，累计约 10-12 工程日。

| Stage | 目标 | 工作量 | 依赖 |
|---|---|---|---|
| **Stage 0（当前）** | AgentCapabilityProvider 事实协议 | — | — |
| **Stage 1（PR-A1-A3）** | 形式化 CapabilityContribution v1.0；定义完整类型 schema；增加 protocolVersion / trustLevel / hostRequirements 字段；保持现有 runtime 兼容 | 2d | — |
| **Stage 2（PR-A4-A6）** | 两阶段分离：Registry 与 ToolInjectionManager 解耦；Registration vs Injection 概念显式；Lifecycle hooks 生效 | 2.5d | S1 |
| **Stage 3（PR-A7-A9）** | MCP 一等公民：McpAdapter 实现；Tool/Resource/Prompt 三原语投影；MCP Server 生命周期管理；健康检查 | 3d | S1 |
| **Stage 4（PR-A10-A12）** | Trust Model：core/community/untrusted 三级；能力信任矩阵强制；Market 接入 trustLevel 认证 | 2d | S1, S2 |
| **Stage 5（PR-A13-A15）** | 跨宿主一致性：HostRequirement 强制；CLI/TUI 能力降级自动化；Registry 查询 API | 2d | S1-S4 |

### 回滚策略

每个 Stage 都有 AblationToggle kill-switch：

- Stage 2 回滚：`twoPhaseRegistration: false`（回到"注册即注入"）
- Stage 3 回滚：`mcpAdapter: false`（不加载 MCP Server）
- Stage 4 回滚：`trustEnforcement: false`（忽略 trustLevel）
- Stage 5 回滚：`hostRequirementEnforcement: false`（全宿主视为 vscode）

### 新增 AblationToggles（5 个）

```typescript
export interface AblationToggles {
  // ... 既有字段 ...

  // === Capability Protocol（adr-capability-protocol.md） ===

  /** 两阶段注册：false=注册即注入（回退旧行为） */
  twoPhaseRegistration?: false;

  /** MCP 适配器：false=不加载 mcpServers 声明 */
  mcpAdapter?: false;

  /** Trust Level 强制：false=忽略 trustLevel，全部视为 core */
  trustEnforcement?: false;

  /** 宿主要求强制：false=缺失 requirement 时仍注册（行为可能出错） */
  hostRequirementEnforcement?: false;

  /** Registry 查询 API：false=禁用自省查询（Agent 无法列举自身能力） */
  registryIntrospection?: false;
}
```

## 与其他 ADR 的关系

本 ADR 是其他多份 ADR 的**基础框架**。合入后需同步更新：

| ADR | 更新内容 |
|---|---|
| **[capability-registration-and-distribution.md](./capability-registration-and-distribution.md)** | 收口早期设计；指向本 ADR 作为正式规范 |
| **[agent-unified-workflow.md](./agent-unified-workflow.md)** §5.1 | CapabilityKind 联合更新：保留 `tool / operation / skill / toolGroup / providerCard`，明确 `operation` 是 `tool` 的 kind（非并列）|
| **[agent-unified-workflow.md](./agent-unified-workflow.md)** §7.4 | `.neko/` 布局增加 `providers/`（已在 provider ADR 声明）|
| **[agent-tool-skill-enhancement.md](./agent-tool-skill-enhancement.md)** | Skill / Tool 边界引用本 ADR 的 §能力类型边界 |
| **[adr-provider-semantic-bridge.md](./adr-provider-semantic-bridge.md)** | ProviderCard 的贡献形式对齐本 ADR 的 `providerCardFiles + providerAdapters` |
| **[adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md)** | Stage/Artifact Registry 可复用本 ADR 定义的 Registry 查询面 |
| **[marketplace.md](./marketplace.md)** | 对接 trustLevel 认证流程；分发品类对齐本 ADR 能力类型 |
| **[agent-multi-agent-federation.md](./agent-multi-agent-federation.md)** | SubAgent 的能力继承走本协议；trustLevel 在 Federation 中传播 |
| **[agent-memory-unification.md](./agent-memory-unification.md)** | Project Memory Router 的目标路径可被能力声明 |
| **[ablation-experiment-framework.md](./ablation-experiment-framework.md)** | 附录追加 5 个新 toggle |
| **[agent-evolution-capacity.md](./agent-evolution-capacity.md)** | §3 控制层评级更新：Schema A- → A / Runtime A- → A / Policy B → B+ / Control A |

### 不纳入本 ADR 的延伸议题

以下属于本 ADR 的自然延伸，但不在当前范围：

1. **Capability Marketplace 搜索索引**——Market 端的搜索/推荐/评分系统
2. **Plugin 依赖解析**（`requires` / `conflicts`）—— 交由 Market 层处理
3. **Capability Sandbox 的具体实现**（Process isolation / WASM sandbox）—— Trust Model 声明约束，具体隔离机制独立 ADR
4. **Capability Telemetry**——使用统计、性能监控、错误上报
5. **Capability Versioning 的 migration 框架**——能力升级时的数据迁移
6. **Capability Federation**（跨 neko 实例共享能力）——属于分布式议题

---

**核心承诺**：本 ADR 把 neko 过去积累的多种能力扩展机制（Tool/Skill/ProviderCard/ToolGroup/MCP/VSCode 扩展）收敛到**一份统一协议 + 两阶段模型 + 四来源投影 + 三级信任**，成为其他所有 ADR 的基础框架。VSCode 扩展通过 `registerCapabilities()` 单一入口贡献 Agent 能力，IDE 集成保持 VSCode 原生 API，两者通过明确桥接协作。MCP 作为 Tool 的合法后端被一等公民化；Market 的长尾能力通过 trustLevel 安全接入；CLI/TUI 通过 Host Abstraction 保证跨宿主一致性。
