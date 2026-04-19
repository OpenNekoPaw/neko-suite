# CLIP TS Binding（Phase 4 前置 ADR）

> ADR Status: Proposed（TS 契约已 stub；Rust napi 绑定待实施）
> Date: 2026-04-19
> Scope: `runtime-ml/src/ml/clip.rs` → TS 可调用；L3 SemanticMatcher 与 EmbeddingCache 的消费契约
> Layer: **Engine binding**（被 workflow MatchingEngine 消费）

---

## 1. 背景

Rust 端 [clip.rs](../../packages/neko-engine/packages/runtime-ml/src/ml/clip.rs) 已完整实现 CLIP-ViT-B/32 的 ONNX 推理：

- `encode_image(session, path) -> Vec<f32>`（512 维）
- `encode_text(session, token_ids) -> Vec<f32>`（512 维）
- `cosine_similarity(a, b) -> f32`

**缺口**：TS 端没有调用路径。结果是 MatchingEngine L3（语义匹配）无法启用，只能靠 L1/L2/L5 规则层。

**本 ADR 的目标**：**锁定 TS/Rust 之间的契约**，让未来的 Rust napi PR 可以直接对着稳定的 TS 类型实现，同时让 workflow 侧的 L3 stub 立即可用（接 `InMemoryClipProvider` 走测试路径）。

## 2. 为什么要提前定契约

单纯「等 Rust 实现完再集成」有三个问题：

| 问题 | 表现 |
|------|------|
| 反复打磨接口 | Rust 先写 → TS 再 wrap → 不合味口 → 回头改 Rust；每次循环消耗 1-2 天 |
| L3 死等 | SemanticMatcher 没契约前只能 skip，Plan 矩阵的一致性反馈少了一条主力 |
| 测试难写 | 没有 `ClipProvider` 接口，L3 代码路径无法 mock |

**策略**：先落 TypeScript 契约 + 内存实现 + 测试；Rust napi PR 只需要实现 `ClipProvider` 接口即可上线。

## 3. TS 契约（已实现）

见 [matching/clip-provider.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/clip-provider.ts)：

```typescript
export type ClipEmbedding = Float32Array;

export interface ClipEncodeOptions {
  signal?: AbortSignal;
}

export interface ClipProvider {
  encodeImage(imagePath: string, options?: ClipEncodeOptions): Promise<ClipEmbedding>;
  encodeText(text: string, options?: ClipEncodeOptions): Promise<ClipEmbedding>;
  readonly embeddingDim: number;
}

export function cosineSimilarity(a: ClipEmbedding, b: ClipEmbedding): number;

export class UnimplementedClipProvider implements ClipProvider { /* throws ClipUnavailableError */ }
export class InMemoryClipProvider implements ClipProvider { /* for tests */ }
```

**关键决策**：

1. **图像入口是路径，不是 bytes**
   - 引擎端直接 `image::open(path)`，避免 base64 + postMessage 往返
   - TS 层只传 `string` — webview 之外（Node 主进程）调用

2. **文本入口是 UTF-8 字符串，不是 token ids**
   - BPE tokenizer 放在 Rust（runtime-ml 已包含）
   - JS 端不再另塞一份 vocab + tokenizer JSON（~240KB）

3. **Embedding 大小写死 `Float32Array`**
   - 未来如果模型换到 CLIP-ViT-L（768 维），同一接口可用；`embeddingDim` 字段标注实际值

4. **`AbortSignal` 第一级支持**
   - napi 层接入 `Arc<AtomicBool>`，Rust 每批次 check；超长 prompt 可终止

## 4. 缓存契约（已实现）

见 [matching/embedding-cache.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/embedding-cache.ts)：

```typescript
export interface EmbeddingCache {
  get(key: string): Promise<ClipEmbedding | undefined>;
  put(key: string, embedding: ClipEmbedding): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

export class InMemoryEmbeddingCache implements EmbeddingCache { /* LRU map */ }
```

**Key 约定**：调用方（L3 SemanticMatcher 当前、asset manifest writer 未来）使用 `sha256(assetPath + mtime)` 作为 key，保证文件变更自动失效。

**持久化实现**（未来）：`<workDir>/.neko/.cache/embeddings.idx` —  mmap-style Float32 文件 + 小型 header（key → offset）。这部分落在 Phase 4 Rust PR。

## 5. Rust napi 侧契约（待实施）

**目标文件**：

- `packages/neko-engine/packages/host-napi/src/ml/clip_bridge.rs` — napi 导出
- `packages/neko-engine/packages/host-api/src/ml/clip.ts` — TS wrapper，实现 `ClipProvider`
- `packages/neko-engine/packages/host-napi/index.d.ts` — regen 自动包含

**napi 签名**（提案）：

```rust
#[napi]
pub struct ClipRuntime { /* lazy-loaded sessions */ }

#[napi]
impl ClipRuntime {
    #[napi(constructor)]
    pub fn new(opts: ClipRuntimeOptions) -> napi::Result<Self>;

    #[napi]
    pub async fn encode_image(&self, image_path: String) -> napi::Result<Buffer /* f32 bytes */>;

    #[napi]
    pub async fn encode_text(&self, text: String) -> napi::Result<Buffer>;
}

#[napi(object)]
pub struct ClipRuntimeOptions {
    pub image_model_path: String,
    pub text_model_path: String,
    pub tokenizer_path: String,
    /** 默认 CUDA / CoreML，回落 CPU */
    pub provider: Option<String>,
}
```

**TS wrapper**：

```typescript
// host-api/src/ml/clip.ts
import { ClipRuntime } from '@neko-engine/host-napi';
import type { ClipProvider, ClipEmbedding } from '@neko/shared/workflow';

export class EngineClipProvider implements ClipProvider {
  readonly embeddingDim = 512;
  constructor(private runtime: ClipRuntime) {}

  async encodeImage(path: string, opts?): Promise<ClipEmbedding> {
    const bytes = await this.runtime.encodeImage(path);
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }
  async encodeText(text: string, opts?): Promise<ClipEmbedding> {
    const bytes = await this.runtime.encodeText(text);
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }
}
```

**模型分发**：复用 onPostInstall 模式（见 [model-runtime.md](./model-runtime.md)）；首次启用时从 Registry 拉取 ONNX + tokenizer 到 `~/.neko/models/clip-vit-b-32/`。

## 6. L3 SemanticMatcher 集成（已实现）

见 [matching/semantic-matcher.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/semantic-matcher.ts)。

**工作方式**：

1. PlanBuilder 调用 `matchShot(shot, library, context)` 时，chain 已经把 L3 matcher 加到末尾
2. L3 读取 `ref.name + ref.variant + shot.scriptLine` 作为查询文本
3. 对 entity 下的每张图（最多 32 张）拿 embedding（Asset.embeddings.clip → EmbeddingCache → ClipProvider）
4. 计算余弦相似度 → 归一化到 [0, 0.85] 的 confidence（上限 0.85，确保 L1/L5 仍有优先权）
5. 低于 `minConfidence`（默认 0.22）的 asset 不提交候选

**降级行为**：

- `ClipProvider` 抛 `ClipUnavailableError` → 静默跳过（生产默认）
- `ClipProvider` 抛其他错误 → logger.warn + 跳过（防 L3 打挂整条链）

## 7. L4 LLMMatcher 集成（已实现）

见 [matching/llm-matcher.ts](../../packages/neko-agent/packages/platform/src/workflow/matching/llm-matcher.ts)。

**Broker 接口**：

```typescript
export interface LLMMatchBroker {
  choose(request: LLMMatchBrokerRequest): Promise<LLMMatchDecision>;
}
```

**默认实现**：`DisabledLLMMatchBroker` 永远返回空决策 → 链路 skip。生产 broker 由扩展侧注入（调用 Haiku 4.5），参考 Phase 3 LLMRouter 的 tool-use 模式，注意：

- 单次预算 ≤ 5s（默认）
- 仅展示 ≤ 8 个候选给模型（防 token 爆炸）
- 返回 `assetId` 必须在候选集合内，否则视为 decline

## 8. Feature flag

两个新 flag（[workflow-settings.ts](../../packages/neko-agent/packages/extension/src/workflow/workflow-settings.ts)）：

- `neko.workflow.matching.semantic.enabled` — 默认 `false`；启用需要 Rust binding 已就绪
- `neko.workflow.matching.llm.enabled` — 默认 `false`；启用需要 LLMMatchBroker 注入 + LLM 预算基建

`package.json` `contributes.configuration` 已注册，用户可在 VSCode UI 中切换。

## 9. 实施路线

| 步骤 | 产物 | 归属 |
|------|------|------|
| ✅ **1. TS 契约 + 内存实现 + 测试** | clip-provider.ts / embedding-cache.ts / semantic-matcher.ts / llm-matcher.ts | 本 ADR（workflow 侧） |
| ⏳ **2. host-napi napi 绑定** | clip_bridge.rs + index.d.ts | neko-engine 侧（单独 PR） |
| ⏳ **3. host-api TS wrapper** | ml/clip.ts 实现 ClipProvider | neko-engine 侧 |
| ⏳ **4. 模型分发** | Registry 条目 + onPostInstall hook | model-runtime 集成 |
| ✅ **5. 持久化 embedding 缓存** | `NodeEmbeddingCache`（JSON + base64 Float32 + LRU） | workflow 侧（已完成 2026-04-19）|
| ⏳ **6. 二进制 mmap 替换 JSON** | `<workDir>/.neko/.cache/embeddings.idx` 真正的 Float32 mmap | 后续优化 |
| ⏳ **7. 导入时预计算** | AssetManifest 写入 `embeddings.clip` | asset pipeline 集成 |

### NodeEmbeddingCache 设计

- 单一 JSON 索引文件 + base64 编码的 Float32 payload（每条 entry ~3 KB for 512-dim）
- LRU：`get` 触发 O(1) 重排但不立即落盘；`put` / `delete` / `clear` 才 flush；`flushPending()` 给 dispose 做兜底
- Dim pinning：第一次 `put` 把 dim 钉住；后续不一致 dim 抛错
- 损坏文件：parse 失败时返回空 cache 让上游重新 hydrate
- 路径：`<workDir>/.neko/.cache/embeddings.json`（典型 < 100 KB / 500 entries）
- 注入点：构造接 `FileIOAdapter`（与 asset-library 同一接口），方便 in-memory 测试与 Node fs 共用

## 10. 反对的做法

- ❌ 把 tokenizer 塞进 JS 包（240KB vocab + BPE 实现，维护成本高）
- ❌ 让 webview 直接调 CLIP（受 VSCode sandbox 限制，没 N-API 通道）
- ❌ 在 ClipProvider 里内嵌 retry / backoff（应放到 MatchingEngine 层统一策略）
- ❌ L3 用 top-k 返回多个候选（会掩盖 L1/L5 的优先权，应只返回 top-1 加入 chain）
- ❌ `encodeImage` 返回 Promise<number[]>（内存翻倍，JSON 序列化慢）

## 11. 相关 ADR

| 文档 | 关系 |
|------|-----|
| [cross-modal-matching.md](./cross-modal-matching.md) | L3/L4 matcher 的顶层设计 |
| [asset-knowledge-graph.md](./asset-knowledge-graph.md) | Asset.embeddings.clip 字段归属 |
| [model-runtime.md](./model-runtime.md) | ONNX + tokenizer 文件分发路径 |
| [plan-mode.md](./plan-mode.md) | Plan 矩阵消费 L3/L4 候选作为 alternatives |
| [workflow-orchestration.md](./workflow-orchestration.md) | Phase 4 进度跟踪 |

## 12. 一句话总结

> **TS 这边把 ClipProvider / EmbeddingCache / L3 SemanticMatcher / L4 LLMMatcher 的契约和测试都落定；Rust napi PR 只要实现 ClipProvider 就能把 L3 开关打开。**
