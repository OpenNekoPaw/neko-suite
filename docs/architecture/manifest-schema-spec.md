# AssetManifest Schema Specification

> **范围**：本文档是 `AssetManifest` 完整字段的**权威 TypeScript 类型定义**，由 `neko-market` 客户端（本仓）和 `neko-registry-server`（独立仓）共同遵守。
> **关联**：[marketplace.md](./marketplace.md) · [registry-server-contract.md](./registry-server-contract.md)

> **修订**：2026-05-05 · 抽出自 [marketplace.md §四 + §五](./marketplace.md)，扩为完整 schema 文档。

---

## 一、文档目的

```
✓ AssetManifest 完整字段权威定义（client / server 共同消费）
✓ 字段必填 / 可选矩阵
✓ 校验规则
✓ 演进策略（向后兼容）

✗ 不描述 server 端审核流程（见 registry-server-contract.md）
✗ 不描述 client 端 UI 渲染（见 marketplace.md）
✗ 不描述 InstallTarget 实现（见 marketplace.md §九）
```

所有字段以 TypeScript 接口定义为准。Client / Server 实现都必须从本文档导出类型。

---

## 二、AssetManifest 顶层结构

```typescript
export interface AssetManifest {
  // === 标识 ===
  /** Unique identifier (@publisher/name) */
  id: string;
  /** Display name (UI 用) */
  name: string;
  /** Semantic version */
  version: string;
  /** 11 种 AssetType 之一（见 §三） */
  type: AssetType;

  // === 来源与分发形态 ===
  /** Source descriptor（§四） */
  source: AssetManifestSource;
  /** Distribution shape（§六）：archive / orchestration / registration */
  distributionKind: DistributionKind;

  // === 类型特化元数据 ===
  /** Type-specialized metadata（§五，按 type 判别） */
  typeMetadata?: AssetTypeMetadata;

  // === 分发与定价 ===
  /** Marketplace distribution metadata（§七） */
  distribution?: AssetDistribution;

  // === 副作用与依赖 ===
  /** Declarative side-effects（§八） */
  effects?: EffectsManifest;
  /** Direct dependencies（§九） */
  dependencies?: AssetDependency[];
  /** Bundle contents（§九，仅 type === 'bundle' 必填） */
  contents?: BundleContent[];

  // === 大素材策略 ===
  /** Large asset distribution strategy（§十） */
  largeAsset?: LargeAssetStrategy;

  // === 语义 / 意图 / 向量 ===
  /** Typed semantic facets（§十一） */
  semantics?: AssetSemantics;
  /** Typed intent facets（§十二） */
  intent?: AssetIntent;
  /** Package-internal pre-computed embeddings（§十三） */
  embeddings?: PackageEmbeddings;

  // === 兼容性与弃用 ===
  /** Curation deprecation marking（§十四） */
  deprecation?: AssetDeprecation;

  // === UI 展示 ===
  /** Thumbnail / preview image relative path */
  thumbnail?: string;

  // === 时间戳 ===
  createdAt: number;
  updatedAt: number;
}
```

License / entitlement 信息**不在 manifest** — 属于 server 端 user-specific 状态，详见 [registry-server-contract.md §3.4](./registry-server-contract.md)。

---

## 三、AssetType（11 种）

```typescript
export type AssetType =
  // === Media（1 种，吃掉原 7 种）===
  | 'media'         // 媒体素材：metadata.mediaKind 区分子类型

  // === Workspace（2 种）===
  | 'starter'       // 工程模板（.nkcut/.nkc/.nkm/.nks/.nkpup/.nkst 起始项目）
  | 'identity'      // 跨格式角色身份包（与 Asset Federation 对接）

  // === AI（3 种）===
  | 'model'         // 本地 AI 权重：metadata.modelKind 区分（base/lora/embedding）
  | 'endpoint'      // 远程模型 / API 端点
  | 'provider'      // Provider 表达上下文（原 provider-card）

  // === Tooling（4 种）===
  | 'skill'         // Agent Skill（prompt-chain）
  | 'plugin'        // VSCode 扩展代码包
  | 'shader'        // GPU 着色器：metadata.shaderKind 区分（standalone/preset）
  | 'preset'        // 配置预设：metadata.presetKind 区分（lut/transition/effect/...）

  // === Composition（1 种）===
  | 'bundle';       // 整合包（递归引用其它 type）
```

### 3.1 子类型 metadata.kind 表

| AssetType | metadata.kind 字段 | 取值 |
|---|---|---|
| `media` | `mediaKind` | `video` / `audio` / `image` / `sequence` / `3d-model` / `puppet-motion` / `document` |
| `model` | `modelKind` | `base` / `lora` / `embedding` |
| `shader` | `shaderKind` | `standalone` / `preset` |
| `preset` | `presetKind` | `lut` / `transition` / `effect` / `export` / `color` / `memory` / `theme` / `keybinding` / `convention` / ... |

其它 7 种（`starter` / `identity` / `endpoint` / `provider` / `skill` / `plugin` / `bundle`）无子类型——单一行为。

### 3.2 AssetCategory（UI 视图维度）

```typescript
export type AssetCategory = 'media' | 'ai' | 'tooling' | 'bundle';

export const CATEGORY_MAP: Record<AssetType, AssetCategory> = {
  media: 'media',
  starter: 'media',
  identity: 'media',

  model: 'ai',
  endpoint: 'ai',
  provider: 'ai',

  skill: 'tooling',
  plugin: 'tooling',
  shader: 'tooling',
  preset: 'tooling',

  bundle: 'bundle',
};
```

`AssetCategory` 是 **UI 视图维度**（4 chips），`AssetType` 是 **实现维度**（11 个 InstallTarget 路由）。

---

## 四、AssetManifestSource

```typescript
export type AssetManifestSource =
  /** 本地文件（开发期） */
  | { kind: 'local'; path: string }

  /** Git LFS 引用 */
  | { kind: 'git-lfs'; oid: string; path: string }

  /** Market registry（生产期标准方式） */
  | { kind: 'registry'; registry: string; package: string; version: string; integrity?: string }

  /** AI 生成产物 */
  | { kind: 'ai-generated'; taskId: string; model: string }

  /** 远程 URL（无 registry） */
  | { kind: 'remote'; uri: string; checksum?: string };
```

**约束**：

```
✓ 'registry' 必带 integrity（SRI hash，server 不变量 ②）
✓ 'remote' 推荐带 checksum（client 校验完整性）
✓ 'local' / 'ai-generated' 不上传 server，仅本地 manifest
```

---

## 五、AssetTypeMetadata（按 type 判别的联合）

```typescript
export type AssetTypeMetadata =
  | { type: 'media';    data: MediaMetadata }
  | { type: 'starter';  data: StarterMetadata }
  | { type: 'identity'; data: IdentityMetadata }
  | { type: 'model';    data: ModelMetadata }
  | { type: 'endpoint'; data: EndpointMetadata }
  | { type: 'provider'; data: ProviderMetadata }
  | { type: 'skill';    data: SkillMetadata }
  | { type: 'plugin';   data: PluginMetadata }
  | { type: 'shader';   data: ShaderMetadata }
  | { type: 'preset';   data: PresetMetadata }
  | { type: 'bundle';   data: BundleMetadata };
```

### 5.1 MediaMetadata

```typescript
export interface MediaMetadata {
  mediaKind: 'video' | 'audio' | 'image' | 'sequence' | '3d-model' | 'puppet-motion' | 'document';
  /** Common */
  fileSize: number;
  /** Discriminated subtype data */
  video?: { duration: number; fps: number; codec: string; resolution: [number, number] };
  audio?: { duration: number; sampleRate: number; channels: number };
  image?: { resolution: [number, number]; hasAlpha?: boolean };
  sequence?: { frameCount: number; fps: number; resolution: [number, number] };
  '3d-model'?: { format: 'glb' | 'gltf' | 'fbx' | 'obj' | 'vrm' | 'mmd'; vertexCount?: number };
  'puppet-motion'?: { format: 'inp' | 'live2d' | 'nkpup'; duration: number };
  document?: {
    subtype: 'markdown' | 'pdf' | 'word' | 'pptx' | 'xlsx' | 'epub' | 'cbz' | 'fdx';
    pageCount?: number;
    wordCount?: number;
    textExtractable: boolean;
  };
}
```

### 5.2 StarterMetadata

```typescript
export interface StarterMetadata {
  /** Target editor */
  targetEditor: 'cut' | 'canvas' | 'model' | 'sketch' | 'puppet' | 'story';
  /** Required AssetTypes the starter depends on */
  requires?: AssetType[];
}
```

### 5.3 IdentityMetadata

```typescript
export interface IdentityMetadata {
  /** Identity kind */
  identityKind: 'character' | 'location' | 'object' | 'style';
  /** Stable AssetIdentity ULID (binding target in Asset Federation) */
  identityId: string;
  /** Forms contained in this pack */
  forms: Array<{
    role: '3d-rigged' | '2d-puppet' | 'portrait' | 'voice' | 'bio' | 'reference';
    packageRef: string;          // package id of the form's source asset (or 'embedded')
    relPath?: string;            // relative path inside this pack if embedded
  }>;
}
```

### 5.4 ModelMetadata

```typescript
export interface ModelMetadata {
  modelKind: 'base' | 'lora' | 'embedding';
  framework: 'onnx' | 'pytorch' | 'safetensors' | 'gguf';
  task:
    | 'image-gen' | 'tts' | 'stt' | 'style-transfer' | 'upscale' | 'denoise'
    | 'transcribe' | 'clip' | 'chat' | 'embedding' | 'vision' | string;
  size: number;
  quantization?: string;
  minVram?: number;
  architecture?: string;
  /** For lora / embedding: base model id reference */
  baseModel?: string;
}
```

### 5.5 EndpointMetadata

```typescript
export interface EndpointMetadata {
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'comfyui' | 'custom';
  capabilities: ('chat' | 'image' | 'video' | 'audio' | 'embedding' | 'vision')[];
  /** Endpoint URL template (may contain ${var}) */
  endpointTemplate: string;
  /** Credential schema (renders form on install, secrets stored in keytar) */
  credentialSchema: {
    fields: Array<{
      name: string;
      label: string;
      kind: 'apiKey' | 'orgId' | 'baseUrl' | 'custom';
      required?: boolean;
      placeholder?: string;
    }>;
  };
  /** Optional model id whitelist exposed by this endpoint */
  modelIds?: string[];
}
```

**约束**：凭证**永不进 manifest**——`credentialSchema` 仅描述需要哪些字段，安装时弹表单 → 用户填 → 存 keytar。

### 5.6 ProviderMetadata

```typescript
export type ProviderTrustLevel = 'core' | 'community' | 'untrusted';

export interface ProviderSignature {
  algorithm: 'sha256' | 'sha512' | 'ed25519';
  value: string;
  signedBy?: string;
}

export interface ProviderMetadata {
  providerId: string;
  capabilities: ('image.generate' | 'video.generate' | 'audio.generate')[];
  modelIds?: string[];
  cardSchemaVersion?: string;
  trustLevel?: ProviderTrustLevel;
  signature?: ProviderSignature;
}
```

### 5.7 SkillMetadata

```typescript
export interface SkillMetadata {
  /** Skill domain tags */
  domain: string[];
  /** Associated ToolSet names */
  toolSets?: string[];
  /** Required MCP server names */
  mcpServers?: string[];
  /** LLM requirements */
  llmRequirements?: {
    capabilities: ('vision' | 'function-calling' | 'streaming')[];
    minContextWindow?: number;
  };
}
```

### 5.8 PluginMetadata

```typescript
export interface PluginMetadata {
  entryPoint: string;
  apiVersion: string;
  permissions: string[];
  configSchema?: Record<string, unknown>;
}
```

### 5.9 ShaderMetadata

```typescript
export interface ShaderMetadata {
  shaderKind: 'standalone' | 'preset';
  language: 'wgsl' | 'glsl';
  stage: 'vertex' | 'fragment' | 'compute';
  inputs: Array<{
    name: string;
    type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'texture' | 'sampler';
    default?: number | number[];
    min?: number;
    max?: number;
    label?: string;
  }>;
  /** Only when shaderKind === 'preset': base shader package id */
  baseShader?: string;
  preview?: string;
  compatibleWith?: string[];
}
```

### 5.10 PresetMetadata

```typescript
export interface PresetMetadata {
  presetKind:
    | 'lut'         // 调色 LUT
    | 'transition'  // 转场
    | 'effect'      // 效果参数预设
    | 'export'      // 导出预设
    | 'color'       // 调色面板预设
    | 'memory'      // memory.md 风格预设（暂行 knowledge-pack）
    | 'theme'       // 主题
    | 'keybinding'  // 键位
    | 'convention'  // 工程约定（linter / formatter）
    | string;       // 允许扩展
  targetApp?: 'cut' | 'canvas' | 'model' | 'sketch' | 'puppet' | 'story' | 'agent' | string;
  parameters?: Record<string, unknown>;
}
```

### 5.11 BundleMetadata

```typescript
export type BundleInstallPolicy = 'all' | 'pick';

export interface BundleMetadata {
  installPolicy: BundleInstallPolicy;        // 'all' = 全部装 | 'pick' = 用户挑选
  bundleType?: 'style-pack' | 'workflow-pack' | 'character-pack' | 'mixed';
}
```

---

## 六、DistributionKind

```typescript
export type DistributionKind =
  | 'archive'          // tar.gz / zip → directory（默认）
  | 'orchestration'    // 无产物，纯编排（bundle）
  | 'registration';    // 无产物，写入子系统注册表（endpoint）
```

**P2 延后**：`single-file`（不解压的 .gguf/.onnx）、`merge`（合并到现有结构）、`streaming`（按需访问）。

InstallManager 按 `distributionKind` 选取分发分支，详见 [marketplace.md §七](./marketplace.md)。

---

## 七、AssetDistribution

```typescript
export interface AssetDistribution {
  // === 基础 ===
  license: string;
  author: string;
  tags: string[];                      // 向后兼容；新 manifest 优先用 semantics + intent
  description?: string;
  homepage?: string;
  downloads?: number;
  checksum: string;

  // === Marketplace extensions ===
  visibility?: 'public' | 'private' | 'shared' | 'paid';
  publisherId?: string;
  publisherName?: string;
  verified?: boolean;
  pricing?: AssetPricing;
  rating?: { average: number; count: number };
  screenshots?: string[];
  compatibility?: AssetCompatibility;

  // === Trust & Signature ===
  trustLevel?: 'core' | 'community' | 'untrusted';
  signature?: {
    algorithm: 'sha256' | 'sha512' | 'ed25519';
    value: string;
    signedBy?: string;
    publicKeyId?: string;
  };

  // === Vector reference ===
  /** Reference to server-side vector DB row (Layer 1，仅指针不带实际向量) */
  embeddingHash?: string;
}

export interface AssetPricing {
  model: 'free' | 'paid' | 'freemium';
  price?: number;
  currency?: string;
}

export interface AssetCompatibility {
  /** Neko Suite version range (semver) */
  nekoSuiteVersion?: string;
  /** VSCode version range */
  vscodeVersion?: string;
  /** Engine version range */
  engineVersion?: string;

  // === v3.3 新增 ===
  /** 已知不兼容的 client 版本范围，server 标记 */
  knownIncompatible?: { reason: string; range: string }[];
  /** 推荐升级到 packageId@version */
  upgradeTo?: { packageId: string; version: string };
}
```

---

## 八、EffectsManifest（声明式副作用）

```typescript
export interface EffectsManifest {
  /** File system writes / reads outside install path */
  files?: { writes?: string[]; reads?: string[] };

  /** Resource consumption */
  resources?: {
    vramMB?: number;
    diskMB?: number;
    ports?: number[];
  };

  /** Runtime registrations */
  registrations?: {
    /** Capability Protocol Tool ids */
    tools?: string[];
    /** Provider IDs (type === 'provider') */
    providers?: string[];
    /** Runtime targets */
    runtimes?: ('ollama' | 'comfyui' | 'engine-onnx' | 'python')[];
    /** Shader effect ids (consumed by neko-cut EffectDispatcher) */
    effects?: string[];
    /** VSCode commands contributed */
    commands?: string[];
  };

  /** Conflict declarations (packageId list) */
  conflicts?: string[];

  /** Network access requirements */
  network?: { hosts: string[] };
}
```

**安装时**：`InstallManager` 用 effects 做 quota check / conflict check / 权限审核展示。
**卸载时**：反演 effects，依次调对应 registry 的 `unregister`，再删文件。

---

## 九、AssetDependency 与 BundleContent

```typescript
export interface AssetDependency {
  id: string;
  version: string;
  optional?: boolean;
}

export interface BundleContent {
  /** Sub-package ID */
  packageId: string;
  /** Semver range */
  version: string;
  /** Whether the user can opt out */
  optional?: boolean;
  /** UI display role, e.g. "主 LUT" / "辅助 Shader" */
  role?: string;
}
```

**约束**：

```
✓ dependencies 由 InstallManager 在 resolve 阶段递归展开
✓ contents 仅 type === 'bundle' 必填
✓ bundle 不许循环依赖（server 校验，不变量 ⑥）
✓ optional 默认 false
```

---

## 十、LargeAssetStrategy（大素材策略）

```typescript
export type DistributionMode =
  | 'eager'      // 立即整包下载
  | 'sparse'     // 清单先到，用户挑子集下载
  | 'proxy'      // 低质代理先到，用时取高质
  | 'delta'      // 基线已存，仅下载差量
  | 'variant';   // 发布多档质量，用户选档

export interface LargeAssetStrategy {
  /** 策略类型（可组合） */
  modes: DistributionMode[];

  /** Sparse: 包内可选条目清单 */
  sparseItems?: SparseItem[];

  /** Proxy: 代理质量档 */
  proxyVariants?: ProxyVariant[];

  /** Variant: 质量/量化档（model 类常用） */
  variants?: ModelVariant[];

  /** Delta: 与上一版本的差异基线 */
  deltaBase?: { version: string; deltaUrl: string; deltaSize: number };

  /** 总体大小估计（必填，Quota 中间件 + 用户决策依据） */
  totalSize: number;
}

export interface SparseItem {
  itemId: string;
  name: string;
  size: number;
  thumbnail?: string;
  defaultSelected?: boolean;
}

export interface ProxyVariant {
  qualityTag: 'low' | 'medium' | 'high' | 'original';
  size: number;
  resolution?: [number, number];   // 视频 / 图
  bitrate?: number;                // 音频
  default?: boolean;
}

export interface ModelVariant {
  variantId: string;        // 'fp16' | 'int8' | 'q4_k_m' 等
  size: number;
  minVram?: number;
  qualityScore?: number;    // 0-1，相对原始
  recommended?: boolean;
}
```

### 10.1 必填约束

```
✓ totalSize 必填（Quota 中间件 + 用户决策依据）
✓ modes 至少含一个（默认 'eager'）
✓ sparse 模式 → sparseItems 必填
✓ proxy 模式 → proxyVariants 必填，default 标 1 个
✓ variant 模式 → variants 必填，recommended 标 1 个
✓ delta 模式 → deltaBase 必填
✓ bundle.contents 的 totalSize 累加 == bundle.totalSize（不变量 ⑬）
```

### 10.2 5+1 态状态机

```
not-owned         未购买
owned             已购未装
manifest-only     安装后仅 manifest + thumbnails（sparse）
proxy             低质代理可立即使用
partial           部分子项已下载（sparse 中间态）
full              最终态
```

详细生命周期与 UI 行为见 [marketplace.md §六.11 / §七.4](./marketplace.md)。

---

## 十一、AssetSemantics（语义层 typed facets）

```typescript
export type AssetSemantics =
  // Preset 子类型
  | { type: 'preset'; presetKind: 'lut'; data: LutSemantics }
  | { type: 'preset'; presetKind: 'transition'; data: TransitionSemantics }
  | { type: 'preset'; presetKind: 'effect'; data: EffectSemantics }
  | { type: 'preset'; presetKind: 'memory'; data: MemorySemantics }

  // Media 子类型
  | { type: 'media'; mediaKind: 'audio'; data: AudioSemantics }
  | { type: 'media'; mediaKind: 'image'; data: ImageSemantics }
  | { type: 'media'; mediaKind: 'video'; data: VideoSemantics }
  | { type: 'media'; mediaKind: '3d-model'; data: ModelMediaSemantics }
  | { type: 'media'; mediaKind: 'puppet-motion'; data: PuppetMotionSemantics }

  // 其他 type
  | { type: 'identity'; data: IdentitySemantics }
  | { type: 'skill'; data: SkillSemantics }
  | { type: 'model'; data: ModelSemantics }
  | { type: 'shader'; data: ShaderSemantics }
  | { type: 'plugin'; data: { domain: string[]; useCase: string } }
  | { type: 'endpoint'; data: { latencyTier: 'low' | 'medium' | 'high'; rateLimit?: string } }
  | { type: 'provider'; data: { syntaxStyle: string[]; conceptCoverage: string[] } }
  | { type: 'starter'; data: { complexity: 1 | 2 | 3 | 4 | 5; scenario: string } }
  | { type: 'bundle'; data: { theme: string[]; collectionSize: number } };
```

### 11.1 核心 facet schema 草案

```typescript
export interface LutSemantics {
  warmth: number;             // -1 cold ~ +1 warm
  contrast: number;           // 0 flat ~ 1 punchy
  saturation: number;
  mood: string[];             // 'nostalgic' / 'cinematic' / 'gritty' / 'vibrant' / 'pastel'
  timeOfDay?: 'golden-hour' | 'blue-hour' | 'daylight' | 'night';
  filmStock?: string;         // 'kodak-portra-400' 等
}

export interface TransitionSemantics {
  speed: 'slow' | 'medium' | 'fast';
  style: ('cut' | 'fade' | 'slide' | 'zoom' | 'glitch' | 'morph')[];
  mood: string[];
}

export interface AudioSemantics {
  genre: string[];
  mood: string[];
  bpm?: number;
  key?: string;               // 'C-major' 等
  energy: number;             // 0-1
  loopable: boolean;
}

export interface ImageSemantics {
  artStyle: string[];         // 'cyberpunk' / 'studio-ghibli' / 'oil-painting'
  era?: string;
  composition: ('portrait' | 'landscape' | 'closeup' | 'wide-shot')[];
  dominantColors: string[];
  hasAlpha: boolean;
}

export interface VideoSemantics {
  scene: string[];
  style: string[];
  pace: 'slow' | 'medium' | 'fast';
  duration: number;
  fps: number;
}

export interface IdentitySemantics {
  archetype: string[];        // 'warrior' / 'mage' / 'companion'
  ageGroup: 'child' | 'teen' | 'young-adult' | 'adult' | 'elder';
  personality: string[];      // 'stoic' / 'cheerful' / 'mysterious'
  artStyle: string[];
}

export interface SkillSemantics {
  domain: string[];           // 'video-edit' / 'storyboard' / '3d-rigging'
  useCase: string;
  outputKind: ('text' | 'image' | 'audio' | 'video' | 'plan')[];
}

export interface ModelSemantics {
  task: string[];             // 'image-gen' / 'upscale' / 'tts' / ...
  architecture: string;       // 'sdxl' / 'whisper' / 'realesrgan'
  trainingDomain: string[];   // 'anime' / 'realistic' / 'cinematic'
  language?: string[];
}

export interface ShaderSemantics {
  effectCategory: ('color' | 'distort' | 'blur' | 'sharpen' | 'stylize' | 'composite')[];
  intensity?: 'subtle' | 'moderate' | 'intense';
}

export interface EffectSemantics {
  effectKind: string[];       // 'glow' / 'bloom' / 'chromatic-aberration' / ...
  intensity: number;
}

export interface MemorySemantics {
  writingStyle: string[];     // 'formal' / 'casual' / 'literary' / 'technical'
  domain: string[];           // 'fiction' / 'screenplay' / 'documentary'
}

export interface ModelMediaSemantics {
  category: 'character' | 'prop' | 'environment' | 'vehicle';
  style: string[];
  polyCount?: 'low' | 'medium' | 'high';
  rigged: boolean;
}

export interface PuppetMotionSemantics {
  emotion: string[];
  actionType: ('idle' | 'walk' | 'run' | 'gesture' | 'reaction')[];
  loopable: boolean;
}
```

### 11.2 Server Ontology 校验

```
发布者声明的 semantics 必经 server ontology 校验：
  · 字段名必须在 type/kind 对应的 schema 内
  · enum / set 字段取值必须在受控词汇表内
  · range 字段在范围内
  · 不在表内的取值 → server 拒收（HTTP 422）

受控词汇表通过 GET /api/v1/ontology/semantic 暴露，client 用此渲染 facet UI。
```

---

## 十二、AssetIntent（意图层 typed facets）

```typescript
export interface AssetIntent {
  /** 适用使用场景 */
  useCases: string[];        // 'vlog' / 'wedding' / 'commercial' / 'tutorial' / 'film' / ...

  /** 工作流阶段 */
  workflowStage?: ('pre-production' | 'rough-cut' | 'fine-cut' | 'color-grading' | 'sound-design' | 'finishing' | 'export' | 'storyboarding' | 'pre-vis')[];

  /** 创作目标 */
  goals?: ('mood-setting' | 'pacing' | 'realism' | 'stylization' | 'continuity' | 'transition' | 'emphasis' | 'world-building' | 'character-development')[];

  /** 目标受众 */
  audience?: ('beginner' | 'intermediate' | 'professional' | 'enterprise')[];

  /** 适用领域 */
  domain?: ('film' | 'youtube' | 'tiktok' | 'animation' | 'game-dev' | 'broadcast' | 'streaming' | 'corporate' | 'education')[];

  /** 显式排除场景（合规 / 设计意图） */
  notFor?: ('commercial' | 'NSFW' | 'minor-targeted' | 'broadcast' | 'cinema' | string)[];

  /** 创作者意图描述（自由文本，详情页 + agent 上下文） */
  description?: string;

  /** 灵感参考 */
  inspiredBy?: string[];     // 'Wes Anderson palette' / 'Blade Runner 2049' / 'Studio Ghibli'
}
```

### 12.1 Type-specific 扩展

```typescript
export interface SkillIntent extends AssetIntent {
  triggers: string[];         // ['整理素材', '配字幕']
  prerequisites?: string[];
  expectedOutput: ('plan' | 'execution' | 'suggestion' | 'analysis')[];
}

export interface LutIntent extends AssetIntent {
  lookReference?: string[];   // ['La La Land', 'Joker 2019']
  targetGenre?: string[];     // ['drama', 'romance', 'sci-fi']
}

export interface ModelIntent extends AssetIntent {
  bestFor: string[];
  knownLimitations?: string[];
}

export interface MediaIntent extends AssetIntent {
  shotRole?: ('b-roll' | 'hero-shot' | 'establishing' | 'transition' | 'close-up' | 'wide')[];
  audioRole?: ('background' | 'foreground' | 'sfx' | 'ambient' | 'foley' | 'dialogue')[];
}

export interface StarterIntent extends AssetIntent {
  scenario: string;
  complexity: 1 | 2 | 3 | 4 | 5;
  estimatedDuration?: string;
}
```

### 12.2 与 Semantics 的边界

```
semantics = "这是什么"      （客观 / 可计算 / 用于向量检索）
intent    = "应该怎么用"    （主观 / 由人/agent 标 / 用于业务匹配）

不要混合：
× semantics: { warmth: 0.85, useCases: ['wedding'] }   ← 错
✓ semantics: { warmth: 0.85 }
  intent:    { useCases: ['wedding'] }
```

### 12.3 强制约束

```
✓ 付费包必填 notFor 至少一项（或显式声明 'no-restriction'）
✓ useCases 必填（至少一项）
✓ useCases / domain / workflowStage 取值必落 server 受控词汇表（不变量 ⑪）
✓ 其它字段全部 optional（向后兼容老 manifest）
```

`intent.useCase` 单数写法只作为旧 client 查询 alias 保留到 marketplace contract v1.1 / 下个 minor 迁移窗口结束；manifest schema 和新查询代码均使用复数 `useCases`。

---

## 十三、PackageEmbeddings（向量层 Layer 2）

```typescript
export interface PackageEmbeddings {
  modelId: string;          // 必须显式："clip-vit-base-patch32"
  modelVersion: string;
  dimension: number;
  /** Path within package → embedding bin path */
  files: { path: string; vector: string }[];
}
```

### 13.1 约束

```
✓ modelId 必填（避免向量黑盒互不兼容）
✓ modelVersion 必填
✓ dimension 必填
✓ 不在 server 白名单的 modelId 拒收（不变量 ⑫）
✓ files 中每条 path 必须在 package payload 内
✓ files 中每条 vector 路径必须存在 .bin 文件
```

### 13.2 各 type 是否带 embedding

| Type | 包内带 embedding？ | 原因 |
|---|---|---|
| `skill` | ✗ | SKILL.md 是 prompt-chain，文本就是语义 |
| `plugin` | ✗ | 代码包，不存在向量 |
| `shader` | ✗ | 着色器代码，无视觉语义 |
| `preset` (lut) | ⚠️ 大包可选 | 50 个 LUT 包可带"色调向量"加速匹配 |
| `preset` (memory/convention) | ✗ | 文本，client 重算便宜 |
| `model` | ✗ | 权重本身不是 embedding |
| `endpoint` / `provider` | ✗ | 无内容 |
| `media` (image/video) | ⚠️ 大包带 | 100+ 图的 stock pack 带 CLIP embedding |
| `media` (audio) | ⚠️ 大包带 | 音乐包带 audio embedding（CLAP / wav2vec） |
| `media` (3d/puppet-motion) | ⚠️ 可选 | 几何/动作向量计算贵 |
| `identity` | ✓ | 跨格式角色身份必带（与 Asset Federation 对接） |
| `bundle` | ✗ | 无内容 |

### 13.3 Manifest 不带向量本身（Layer 1）

```
✗ 不允许：manifest 直接嵌 embedding 数组
✓ 仅允许：distribution.embeddingHash 指针（指向 server 向量 DB row id）
✓ 实际向量在 server 端 / Payload bin 文件中
```

---

## 十四、AssetDeprecation（Curation 弃用）

```typescript
export interface AssetDeprecation {
  /** Deprecate 起始时间戳 */
  since: number;
  /** 替代品 packageId */
  replacedBy?: string;
  /** publisher 给的说明 */
  reason?: string;
  /** 何时彻底从 market 下架（之后 entitlement 仍有效但不再可买） */
  delistAt?: number;
}
```

**约束**：

```
✓ since 必填（不变量 ⑧）
✓ replacedBy 必经 server 校验存在（不变量 ⑧）
✓ deprecation 由 server 注入，publisher 不可绕过
✓ 不影响已装包的可用性（只是 UI 标 deprecated）
```

License 信息（A 类过期）**不在 manifest**，由 server entitlement 持有。详见 [registry-server-contract.md §3.4](./registry-server-contract.md)。

---

## 十五、字段必填 / 可选矩阵

```
顶层字段必填性
─────────────────────────────────────────
id                          ✓ 必填
name                        ✓ 必填
version                     ✓ 必填
type                        ✓ 必填（11 种之一）
source                      ✓ 必填
distributionKind            ✓ 必填
typeMetadata                ⚠️ 大多数 type 必填（除 endpoint 简化场景）
distribution                ⚠️ 公开分发必填，本地开发可省
effects                     ⚠️ 有副作用必填（registrations / files / network 任一）
dependencies                ◯ 可选
contents                    ⚠️ type === 'bundle' 时必填
largeAsset                  ◯ 可选；缺省视为 eager 整包
semantics                   ⚠️ 强烈建议（Browse Tab facet 搜索依赖）
intent                      ⚠️ 强烈建议（agent 推理 + 创作者查询）
embeddings                  ◯ 可选；按 §13.2 表决定
deprecation                 ◯ 仅 deprecated 包必填
thumbnail                   ◯ 可选
createdAt                   ✓ 必填
updatedAt                   ✓ 必填
```

```
type 与 typeMetadata 对应必填性
─────────────────────────────────────────
type === 'media'      → typeMetadata.data.mediaKind 必填
type === 'starter'    → typeMetadata.data.targetEditor 必填
type === 'identity'   → typeMetadata.data.identityKind / identityId / forms 必填
type === 'model'      → typeMetadata.data.modelKind / framework / task / size 必填
type === 'endpoint'   → typeMetadata.data.provider / capabilities / endpointTemplate / credentialSchema 必填
type === 'provider'   → typeMetadata.data.providerId / capabilities 必填
type === 'skill'      → typeMetadata.data.domain 必填
type === 'plugin'     → typeMetadata.data.entryPoint / apiVersion / permissions 必填
type === 'shader'     → typeMetadata.data.shaderKind / language / stage / inputs 必填
type === 'preset'     → typeMetadata.data.presetKind 必填
type === 'bundle'     → typeMetadata.data.installPolicy 必填，contents 必填
```

```
distributionKind 与 largeAsset 对应必填性
─────────────────────────────────────────
distributionKind === 'archive'         largeAsset.modes 含 'eager' / 'sparse' / 'proxy' / 'delta' / 'variant'
distributionKind === 'orchestration'   仅 type === 'bundle'，无 largeAsset
distributionKind === 'registration'    仅 type === 'endpoint'，不使用 largeAsset.modes；endpoint 自身声明远端能力
```

---

## 十六、Schema 校验规则

### 16.1 Server 校验（authoritative）

发布者上传 manifest 时，server 端必须执行：

```
① 顶层字段必填检查
② type 与 typeMetadata.type 一致
③ typeMetadata.data 字段按 type/kind 必填检查
④ distributionKind 与 largeAsset.modes 一致性
⑤ semantics 取值落 ontology 受控词汇表
⑥ intent 取值落受控词汇表
⑦ embeddings.modelId 在 server 白名单
⑧ source.kind === 'registry' 必带 integrity
⑨ effects 中声明的 commands / tools / providers / runtimes 取值合法
⑩ contents 引用的 packageId 存在 + 版本兼容 + 无环
⑪ largeAsset.totalSize 与实际下载内容一致（基于上传文件计算）
⑫ deprecation.replacedBy 引用的 packageId 存在
```

校验失败 → HTTP 422 + 详细错误清单。

### 16.2 Client 兜底

Client 端不重做完整校验，但要兜底：

```
✓ 必填字段缺失 → log warning + 跳过该项（不阻塞列表）
✓ typeMetadata 与 type 不一致 → 视为不可识别，不渲染详情页
✓ 未知 distributionKind → 不安装，提示"需要升级 client"
✓ 未知 effects.registrations 字段 → 忽略该字段（向后兼容）
```

---

## 十七、字段演进策略

### 17.1 向后兼容规则

```
新增字段        必标 optional（老 client 忽略）
删除字段        v2 才能做（v1 仍保留并标 deprecated）
字段含义改变    必须改名（不允许同名异义）
枚举扩展        新增取值用 string union with `| string` 留出后路
```

### 17.2 Schema 版本

```
当前版本：v1.0
版本字段：未来在 manifest 顶层加 schemaVersion: '1.x'
        现阶段省略，统一视为 v1.0
```

### 17.3 Breaking Change 流程

```
1. 在新版本 schema 中新增等价字段
2. 老字段标 @deprecated，server 双写新老字段 6 个月
3. 通知所有发布者迁移
4. 6 个月后下个 major 版本删除老字段
```

### 17.4 旧类型迁移与 v4-only 路由

本仓实现已把生产安装路由收敛到 v4 的 11 种 `AssetType`。旧 manifest / 已安装记录必须在进入 `InstallTargetRegistry` 前迁移或拒绝，运行时不得直接按旧 type 分发。

| Legacy type | v4 type | metadata patch |
|---|---|---|
| `video` / `audio` / `image` / `sequence` / `3d-model` / `puppet-motion` / `document` | `media` | `typeMetadata = { type: 'media', data: { mediaKind } }` |
| `project-template` / `template` | `starter` 或 `preset` | 工程起始项目用 `starter.targetEditor`；配置模板用 `preset.presetKind` |
| `identity-pack` | `identity` | `identityKind` / `identityId` / `forms` |
| `ai-model` / `lora` / `embedding` | `model` | `modelKind = base / lora / embedding` |
| `service-endpoint` | `endpoint` | `distributionKind = 'registration'` |
| `provider-card` | `provider` | `providerId` / `capabilities` |
| `shader-preset` | `shader` 或 `preset` | GPU shader 预设用 `shader.shaderKind='preset'`；LUT/转场/导出配置用 `preset.presetKind` |
| `lut` | `preset` | `presetKind = 'lut'` |

迁移规则：

```
✓ parse helper 可以输出 legacy migration diagnostics，供导入、fixture 和 InstalledRegistry migration 使用
✓ InstalledRegistry migration 读取旧记录时把 legacy `type` 和 `manifest.type` 重映射为 v4 `type + typeMetadata`，并补齐 v4 metadata 必填默认值
✓ detail/render/install 前必须保证 manifest.type 是 v4 type 且 typeMetadata.type 与 manifest.type 一致
✓ InstallTarget 路由只接受 v4 type；legacy type 不允许注册 target
✓ 搜索和 Browse filter 使用 AssetCategory → AssetType → metadata kind，不把旧 type 作为 query.types 发给 registry
✓ 消费面只接收 installed record / market event projection，不读取 owned entitlement 当作本地资产
```

当前 P0 实现对 unknown optional fields 继续宽容；对未知 `distributionKind`、不匹配的 `typeMetadata.type`、缺失 v4 必填字段，安装路径必须返回 upgrade-required 或 invalid-manifest 诊断。

---

## 十八、变更日志

### v1.0（2026-05-05）

```
+ 抽出自 marketplace.md §四 + §五
+ 完整 AssetManifest 顶层结构（17 个字段）
+ 11 种 AssetType + 子类型 metadata.kind 表
+ 5 种 AssetManifestSource
+ 11 个 AssetTypeMetadata 接口（按 type 判别）
+ 3 种 DistributionKind（archive / orchestration / registration）
+ AssetDistribution + AssetCompatibility + Pricing
+ EffectsManifest 完整字段
+ AssetDependency / BundleContent
+ LargeAssetStrategy（5 modes + 3 子接口 + 5+1 态）
+ AssetSemantics（typed facets，按 type/kind 判别）
+ AssetIntent（typed facets + 5 个 type-specific 扩展）
+ PackageEmbeddings（Layer 2 向量）
+ AssetDeprecation
+ 字段必填 / 可选矩阵（3 张表）
+ Schema 校验规则（server 12 条 + client 4 条兜底）
+ 字段演进策略（向后兼容 + breaking change 流程）
```
