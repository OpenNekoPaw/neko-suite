# Tool 多模态输入与 AssetRef 契约

> **状态**: Analysis (2026-04-26)
> **类型**: 架构判断 / 契约补完
> **关联 ADR**:
> - [agent-media-architecture.md](./agent-media-architecture.md) — GeneratedAsset on-disk + JSON 引用 + 零 base64 协议
> - [adr-asset-federation.md](./adr-asset-federation.md) — 跨子包素材联邦
> - [agent-unified-workflow.md](./agent-unified-workflow.md) — IDC 三阶段 + Plan markdown
> - [adr-capability-protocol.md](./adr-capability-protocol.md) — Tool 四来源投影
> - [adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md) — 薄编排,厚 prompt
> - [agent-subagent-usage-boundary.md](./agent-subagent-usage-boundary.md) — Subagent 使用边界

## 摘要

**当前生成类工具(`GenerateImage` / `GenerateVideo` 等)在参数层"形式上"支持参考图、mask、ControlNet、IP-Adapter 等多模态输入,但缺少统一的素材引用契约,导致意图层(Plan)、工具层、Provider 层三层之间的素材引用相互断裂。**

本文档:

1. 盘点当前多模态输入的支持现状
2. 指出三个核心断裂点
3. 提议统一的 `AssetRef / TypedAssetRef` 契约
4. 给出按优先级的实施建议

**核心结论**:补完工作不是新架构,而是把 [agent-media-architecture.md](./agent-media-architecture.md) 已声明的"零 base64 + JSON 引用"原则真正落到 Tool 参数 schema、Plan markdown、Tool 输出三处,三处用同一个 `TypedAssetRef` 类型贯穿。

---

## 一、现状盘点

### 1.1 工具参数的多模态字段

| 工具 | 参考输入 | 类型 |
|------|---------|------|
| `GenerateImage` | `referenceImageUrl/Base64`, `maskBase64`, `controlImageBase64`, `ipAdapterRefs[]` | `string \| undefined` |
| `GenerateVideo` | `referenceImageUrl/Base64`, `referenceVideoUrl`, `startFrameImageBase64`, `endFrameImageBase64`, `referenceImages[]` | `string \| undefined` |
| `GenerateTTS / Music` | (无参考输入) | — |

定义位置:
- [packages/neko-agent/packages/agent/src/skill/builtins/ai-generate.ts](../../packages/neko-agent/packages/agent/src/skill/builtins/ai-generate.ts)
- [packages/neko-agent/packages/platform/src/media/types.ts](../../packages/neko-agent/packages/platform/src/media/types.ts)
- [packages/neko-agent/packages/platform/src/media/media-agent-tools.ts](../../packages/neko-agent/packages/platform/src/media/media-agent-tools.ts)

### 1.2 Provider 端的格式异构

不同 Provider 接受的参考素材格式不一致,且 `MediaRoutingManager` **不做格式协调**:

| Provider Adapter | 期望格式 |
|-----------------|---------|
| OpenAI-compat | `*Base64` (data URL) |
| DashScope | base64 或 URL 均可 |
| Runway | 只接受 URL |
| Luma | 只接受 URL |

**结果**: 调用方传错格式会运行时静默失败,Tool 契约里看不到这种约束。

### 1.3 GeneratedAsset 已存在但未与 Tool 层对接

[GeneratedAsset](../../packages/neko-agent/packages/extension/src/services/generatedAssetIndex.ts) 类型已定义:

```typescript
GeneratedAsset {
  id, path, mimeType,
  characterIds, sourceNodeId, shotMeta,
  providerId, modelId, prompt, createdAt
}
```

但**无法直接作为 Tool 输入**:

- Tool 参数仍是松散字符串,不接受 `assetId: "img-123"`
- `neko.agent.generateForNode` 命令在 canvas 端手工解析 `referenceRefs` → 文件路径 → base64,**这条路径 canvas 专属**,agent 工具自身没有解析能力

### 1.4 Plan markdown 不承载素材引用

[agent-unified-workflow.md](./agent-unified-workflow.md) 的 Plan markdown 解析器只抽 `Goal / Style / Must Include / Avoid` 等文本段,**不解析素材引用**。

### 1.5 工具间无法链式传递

```
agent: GenerateImage(prompt="a car")
       → { taskId: "img-123" }       ← 只拿到 ID
agent: ???                           ← 没有官方途径把 img-123 转成 Tool 输入
agent: GenerateVideo(prompt="...", referenceImageUrl=???)
```

agent 必须**手动调一次 query 工具拿 path,再下载 + base64,再调 GenerateVideo**,违反"零 base64 + JSON 引用"原则。

---

## 二、三个核心断裂点

### 断裂点 ①: 类型契约断裂

```typescript
// 现状 — 松散
referenceImageUrl?: string
referenceImageBase64?: string

// 问题
// - 调用方必须先把素材"实体化" (下载/编码) 才能调工具
// - 类型不区分图/视频/音频
// - 元数据 (来源节点/角色/风格) 全部丢失
// - Provider 兼容性不在类型里, 运行时才暴雷
```

### 断裂点 ②: 意图层断裂

IDC 流程 (Draft → Plan → Apply) 中, Plan markdown 当前长这样:

```
Plan markdown (.neko/plans/)
├─ Goal: ...           ← 文本意图
├─ Style: ...          ← 文本意图
├─ Must Include: ...   ← 文本意图
└─ ❌ References: ...  ← 不存在, Plan 解析器跳过
```

agent 写的 Plan **无法把"使用 task-123 的输出作为参考图"这样的意图持久化**。素材引用只能活在临时对话上下文里, Apply 阶段时已丢失。

### 断裂点 ③: 工具间链式断裂

工具输出 schema 当前只有 `{ taskId }`, 不暴露 `outputs: AssetRef[]`。下一个工具想引用上一个的输出, 只能让 agent 写"先查询、再下载、再 base64、再传入"的胶水代码——这本来应该是基础设施的责任。

---

## 三、设计建议: 补完 AssetRef 契约

### 3.1 统一 AssetRef 类型

```typescript
// @neko/shared/types/asset-ref.ts

/** 五种引用形态,跨 Tool/Plan/Provider 通用 */
export type AssetRef =
  | { kind: 'asset';  assetId: string }                       // GeneratedAsset.id
  | { kind: 'task';   taskId: string; outputIndex?: number }  // 上一个工具输出
  | { kind: 'path';   path: string }                          // 工作区相对路径 (支持 ${VAR})
  | { kind: 'url';    url: string }                           // 外部 URL
  | { kind: 'inline'; mimeType: string; bytes: Uint8Array };  // 兜底, 用户刚上传

/** 引用的语义角色 (附加在 AssetRef 上) */
export interface AssetRefMeta {
  modality: 'image' | 'video' | 'audio' | 'mask';
  role?:
    | 'reference'      // 通用参考
    | 'init'           // 初始帧/初始图
    | 'control'        // ControlNet
    | 'ip-adapter'     // IP-Adapter
    | 'mask'           // 蒙版
    | 'start-frame'    // 视频起始帧
    | 'end-frame'      // 视频结束帧
    | 'voice-sample';  // 声音克隆样本
  weight?: number;
  characterIds?: string[];
  sourceNodeId?: string;
}

export type TypedAssetRef = AssetRef & AssetRefMeta;
```

**关键约束**:

- `kind: 'inline'` 只在用户刚上传那一刻短暂存在, Tool 进口处必须落盘转 `kind: 'asset'`
- 跨 Tool 传递**永远使用 `assetId / taskId / path`**, 严禁 inline
- `meta.role` 是开放枚举, 新增 role 不必改 schema

### 3.2 Tool 参数改造

```typescript
// ai-generate.ts (改造后)
interface GenerateVideoInput {
  prompt: string;
  references?: TypedAssetRef[];    // 替换所有 *Base64 / *Url 字段
  duration?: number;
  resolution?: string;
  // ...
}
```

同一个数组承载 `init-frame / end-frame / control / ip-adapter / mask`, **靠 `role` 字段区分**, 而不是字段名。这让新增 role 不必改 schema。

### 3.3 单点解析层 (AssetResolver)

```
Tool call (TypedAssetRef[])
       │
       ▼
┌─────────────────────────────┐
│  AssetResolver              │   ← 唯一一处把 ref 转成实体
│  - 'asset' → 查 AssetIndex  │
│  - 'task'  → 拿 task outputs│
│  - 'path'  → PathResolver   │
│  - 'url'   → 直通           │
│  - 'inline'→ 落盘 + 转 'asset'│
└──────────┬──────────────────┘
           │
           ▼
   ResolvedAsset { localPath, mimeType, meta, ... }
           │
           ▼
   Provider Adapter.materialize(resolved, providerCaps)
   (按 Provider 能力选 base64 / URL / 上传)
```

**好处**:

- Tool 层只看到引用, 不看到内容 → 不消耗 agent context
- 缓存/去重在 AssetResolver 一处做 → 多次引用同一资产只解析一次
- Provider 异构性收敛在 adapter 内部 → 不污染 Tool 契约

### 3.4 Plan markdown 引用语法

补完 [agent-unified-workflow.md](./agent-unified-workflow.md) 的 Plan schema:

```markdown
## Goal
为分镜 #3 生成动作镜头

## Style
赛博朋克, 雨夜

## References
- @asset:img-789 (role=reference, weight=0.7)
- @task:img-123#0 (role=start-frame)
- @path:${MEDIA}/storyboard/shot-3.png (role=control)
```

**引用语法形式**:

```
@<kind>:<id-or-path>[#<index>] [(<meta>)]
```

- `@asset:<id>` → AssetIndex 查询
- `@task:<taskId>[#<outputIndex>]` → 上游任务输出
- `@path:<workspace-relative>` → 走 PathResolver, 支持 `${VAR}`
- `@url:<url>` → 直通

Plan 解析器抽出 `References` 段, 转成 `TypedAssetRef[]`, Apply 阶段直接喂给 Tool。**意图层就能持久化携带素材引用**, 不再依赖临时上下文。

### 3.5 Tool 输出 schema

```typescript
// 现状
{ backgroundMode: true, taskId: 'img-123' }

// 改造后 (任务完成时)
{
  taskId: 'img-123',
  status: 'completed',
  outputs: TypedAssetRef[]   // 用同一个 AssetRef 类型, 直接可作下一个 Tool 的 reference
}
```

**对称性**: 输入和输出都是 `TypedAssetRef`, 链式天然成立。Agent 在 prompt 里写"使用 img-123 的输出作为视频起始帧"会被翻译为:

```typescript
GenerateVideo({
  prompt: "...",
  references: [
    { kind: 'task', taskId: 'img-123', outputIndex: 0,
      modality: 'image', role: 'start-frame' }
  ]
})
```

---

## 四、与现有 ADR 的关系

| ADR | 已有 | 本提议补完 |
|-----|------|-----------|
| [agent-media-architecture.md](./agent-media-architecture.md) | "零 base64 + JSON 引用"协议 | 把协议落到 **Tool 参数 schema** |
| [adr-asset-federation.md](./adr-asset-federation.md) | AssetHandler / 跨子包素材 | 把联邦协议**穿透到 Tool 层** (AssetResolver 是 Federation 的消费者) |
| [agent-unified-workflow.md](./agent-unified-workflow.md) | Plan markdown 章节惯例 | 补 `## References` 语义 |
| [adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md) | "薄编排, 厚 prompt" | AssetRef 是**唯一新增 DSL**, 且只用于安全边界 (引用而非内容) |
| [adr-capability-protocol.md](./adr-capability-protocol.md) | Tool 四来源投影 | AssetResolver 是 **horizontal capability** (与 Tool 来源正交) |
| [agent-subagent-usage-boundary.md](./agent-subagent-usage-boundary.md) | Subagent 是上下文隔离器 | AssetRef 强化"引用而非内容"的传递, 让 subagent 之间也只传引用 |

---

## 五、实施建议

按 [CLAUDE.md](../../CLAUDE.md) "契约优先 + 自上而下"原则:

### P0: 类型与解析器 (契约先行)

1. 定义 `AssetRef / TypedAssetRef` 在 `@neko/shared/types/asset-ref.ts`
2. 实现 `AssetResolver` 服务在 `@neko/agent/platform/asset/`
3. 写完整测试覆盖五种 `kind`

**验收**: 所有现存松散字段 (`*Base64`, `*Url`) 都能转成 `TypedAssetRef`, 解析后能得到本地路径。

### P1: Tool schema 改造 (向后兼容)

1. `GenerateImage / GenerateVideo` 新增 `references: TypedAssetRef[]`
2. 旧字段 (`referenceImageBase64` 等) **保留 + 标 `@deprecated`**, 内部转 `TypedAssetRef`
3. 在 [media-agent-tools.ts](../../packages/neko-agent/packages/platform/src/media/media-agent-tools.ts) 入口处统一走 `AssetResolver.resolve()` → `Provider.materialize()`
4. Provider adapter 新增 `materialize(resolved, providerCaps)` 方法, 处理 base64↔URL 选择

**验收**: 旧调用路径不变, 新调用路径可用 `references: [{kind:'asset',assetId:...}]`。

### P2: 输出 schema 改造

1. Tool 完成时 `outputs: TypedAssetRef[]`
2. Agent 内部 prompt 模板里加示例: 使用上一个工具的 `outputs[0]` 作为 reference

**验收**: agent 在不写胶水代码的情况下完成"图生视频"两步链式调用。

### P3: Plan markdown 集成

1. Plan parser 增加 `References` 章节解析
2. 实现 `@<kind>:<id>` 解析语法
3. Plan → Apply 阶段自动注入 `references` 到生成工具调用

**验收**: Plan 文件保存 → 重启 → Apply, 素材引用仍生效。

### P4: 缓存与去重

1. `AssetResolver` 加 LRU 缓存 (key=`assetId|taskId|path|hash(url)`)
2. 同一 turn 内同一 ref 只 base64 编码一次

**验收**: 三次连续生成同一参考图, 仅一次磁盘读 + 一次 base64 编码。

---

## 六、反模式清单

1. ❌ **在 Tool 参数里直接传 base64 字符串** → 污染 message 历史 + 重复编码
2. ❌ **让 agent 自己写"先 read 图、转 base64、再调 generate"** → 这是 AssetResolver 的责任, 不是 prompt 的责任
3. ❌ **每个 Provider adapter 自己定义参考图字段** → 应在 Adapter 层统一接收 `ResolvedAsset`, 内部决定 base64 / URL
4. ❌ **Plan markdown 里把 `data:image/png;base64,...` 直接嵌入** → Plan 应只持引用, 不持内容
5. ❌ **把 GeneratedAsset 的丰富元数据 (characterIds / shotMeta) 在 Tool 层丢弃** → 应通过 `TypedAssetRef.meta` 透传到 Provider, 让支持的 Provider 利用
6. ❌ **让 ControlNet / IP-Adapter / InitImage 各自一个字段** → 应统一为 `references[] + role` 模型, 新 role 不需要改 schema
7. ❌ **跨 subagent 边界传 `kind: 'inline'`** → subagent 之间只能传 `asset / task / path / url`, 强制经过 AssetIndex 落盘
8. ❌ **AssetResolver 解析时把内容塞回 agent context** → resolve 只产生本地路径 + 元数据, 内容只在 Provider 调用瞬间 materialize

---

## 七、与 Subagent 边界的协同

[agent-subagent-usage-boundary.md](./agent-subagent-usage-boundary.md) 的核心结论是 "Subagent 是上下文隔离器, 不是异步执行器"。AssetRef 契约**强化**这一边界:

- **主 agent → subagent 派发**: 只传 `TypedAssetRef[]`, 永不传 base64/inline 内容
- **subagent → 主 agent 返回**: 只传 `TypedAssetRef[]` (输出资产) + 文本摘要
- **subagent ↔ subagent** (Federation 启用后): 同样只传引用

**结果**: 上下文隔离的边界跟素材引用的边界**重合**, 两个机制在架构上自洽。

---

## 八、一句话结论

> **当前 Tool 层"形式上"支持多模态参考, 但缺少统一的 `AssetRef` 契约, 导致意图 (Plan)、执行 (Tool)、Provider 三层的素材引用相互不通。补完工作不是新架构, 而是把 [agent-media-architecture.md](./agent-media-architecture.md) 已声明的"零 base64 + JSON 引用"原则真正落到 Tool 参数 schema、Plan markdown、Tool 输出三处, 三处用同一个 `TypedAssetRef` 类型贯穿。**

---

## 九、修订记录

- **2026-04-26**: 初版, 基于 Tool 多模态输入支持现状审查整理。
