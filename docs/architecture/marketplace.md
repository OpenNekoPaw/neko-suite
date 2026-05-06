# neko-market 客户端设计文档

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [format-strategy.md](./format-strategy.md) · [storage-strategy.md](./storage-strategy.md) · [model-runtime.md](./model-runtime.md) · [adr-asset-federation.md](./adr-asset-federation.md) · [adr-capability-protocol.md](./adr-capability-protocol.md) · [adr-provider-expression-context.md](./adr-provider-expression-context.md) · [adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md)

> **范围声明**：本文档**仅描述客户端**（VSCode 扩展 + Layer 0 协议层）。发布、审核、签名生成、上游代理、付费收单、Publisher Portal 等全部属于 `neko-registry-server`（独立项目，不在本仓），见本文 §十一 与 Server 的契约。

---

## 一、定位与边界

### 1.1 一句话定位

`neko-market` 是 **AssetManifest 的消费者 + 安装器 + 卸载器 + 事件广播器**——只做"装、说、管"，不写、不签、不审、不收钱。

### 1.2 三件事

```
装 (Install)     下载 / 校验 / 解包-编排-注册 / 反演卸载
说 (Describe)    清单展示 / 截图 / 兼容性 / 信任徽章 / 依赖图
管 (Manage)      列表 / 启停 / 更新 / 缓存 / 事件广播
```

### 1.3 客户端 / 服务端边界

```
┌─ neko-market（本项目）─ 仅客户端 ──────────────────────┐
│  装 / 说 / 管 + LicenseManager 调用方                  │
└────────────────────────────────────────────────────────┘
                       │ HTTP only
                       ▼
┌─ neko-registry-server（独立项目）──────────────────────┐
│  发布 / 审核 / 签名 / 上游代理 / 付费 / Publisher Portal │
└────────────────────────────────────────────────────────┘
```

客户端**不做**：

- 生成 manifest（manifest 是 server 权威产物，client 只消费）
- 计算签名（client 只验证 server 下发）
- 评级 / 评论写回（client 只浏览，写入是 server 端 POST）
- 直传上传（client 无 Upload API 调用）
- 发布者 / 用户注册（neko-auth + server）
- 维护搜索索引（client 永远是 server 的 query 客户端）

---

## 二、核心架构决策

### 决策 1：统一协议层 + 分离 UI 入口

底层协议统一，UI 入口跟随各扩展使用场景。用户在 neko-agent 里找 Skill、在 neko-cut 里找 Shader/LUT，但底层搜索/下载/校验/授权逻辑完全相同。

### 决策 2：市场基础设施独立为 neko-market

`neko-market` 是顶层包，不归 `neko-assets`。原因：

- `neko-agent` 需要 Skill 市场，但完全不需要 `Entity→Variant→File` 三层素材层级
- 市场 API 变化频繁，不应拖累 `neko-assets` 的本地素材管理
- HTTP / auth 库不应污染 `neko-assets`

### 决策 3：类型定义统一在 @neko/shared

市场专有类型在 `neko-types/src/types/asset/market.ts`，与 `AssetManifest` / `AssetDistribution` 同位。

### 决策 4：客户端 web 跳转购买，永不在 client 内闭环

```
方案 A. 纯 web jump          ✓ 主路径（P0）
        client 一句 vscode.env.openExternal()，全部支付在浏览器完成
方案 B. webview 嵌入式支付    △ P2 可选演进（小额冲动购买）
        Stripe Elements 等 webview 内嵌；CSP / 3DS / 风控稳定性差
方案 C. 完全 in-app           ✗ 永久排除
        合规 / 跨境 / 风控 / 退款 / App Store 抽佣全是地雷
方案 D. 完全不支持付费        ✗ AIGC 创作者要买 LoRA / 模型 / 角色 / 工程
```

**采用方案 A 作为 P0 唯一路径**。理由：

1. **行业惯例**：Civitai / HuggingFace / Adobe CC / Figma / Tabnine / Wallaby.js / Copilot / Cursor / Claude Code 全部 web 购买 + 本地激活；0 个主流创作者工具走 in-app purchase——用户预期已成熟
2. **VSCode webview CSP 限制**：嵌入 Stripe / Alipay / 微信支付每家配置不同，每加一通道一次扩展更新一次商店审核
3. **3DS / 风控弹窗在 webview 经常被拦死**：一旦拦死即支付失败 → 退款投诉 → 客服爆炸
4. **跨境收款 / 国内通道复杂性**：全部交给 server 端处理，client 不感知
5. **远期 App Store 30% 抽佣条款**：iOS / Android 平台分发的 VSCode 会卡死嵌入式 web 支付

**方案 B 升级触发条件**（必须**全部**满足才考虑）：

```
✓ 月活 ≥ 10k，购买转化数据充分
✓ 用户反馈 "跳浏览器打断创作流程" 占 top 3
✓ server 端通道稳定收单 ≥ 6 个月
✓ 单价 ≤ ¥30 的小额冲动购买场景明确（如单 LUT / 单 LoRA）

升级时仅做小额嵌入：
  < ¥30        webview 内嵌 Stripe Element（无 3DS 跳转概率高）
  ≥ ¥30        仍跳浏览器（需要 3DS / 风控时浏览器更稳）
  订阅 / 续费   永远跳浏览器
  退款 / 发票   永远跳浏览器
```

**客户端永不做**：

```
✗ 持有任何支付凭证 / 卡号 / 卡 token（PCI 范围立即爆炸）
✗ 实现退款 / 申诉 / 客服流程（永远跳到 server 网页）
✗ 把支付状态机写进 client（状态机在 server，client 只看结果）
✗ 在详情页直接发起 Charge API（必须经 server checkout-url）
```

详细购买流水见 §六.6。

### 决策 5：AssetType 11 种终态（v4 重整）

经两轮过滤后锁定 **11 种 AssetType**：

```
v3 (21 种)                      v4 (11 种)
──────────                      ──────────
video / audio / image /         media       (mediaKind 子类型)
sequence / 3d-model /
puppet-motion / document
project-template                starter
identity-pack                   identity
ai-model / lora / embedding     model       (modelKind 子类型)
service-endpoint                endpoint
provider-card                   provider
skill                           skill
plugin                          plugin
shader / shader-preset          shader      (shaderKind 子类型)
preset / template / lut         preset      (presetKind 子类型)
bundle                          bundle
```

**合并规则**：InstallTarget 安装/卸载行为不同 → 必须独立 AssetType；只是 metadata 不同 → 合并并用 `metadata.kind` 区分。

**重命名规则**：单数单词、命名风格一致、丢掉实现细节后缀（`-pack` / `-card`）和冗余前缀（`ai-` / `service-`）。

详见 §四。

### 决策 6：DistributionKind 一等公民

不所有包都是"档案 → 目录"。引入 `DistributionKind` 三种：`archive` / `orchestration` / `registration`，让 `bundle` / `endpoint` 真正能装。

### 决策 7：EffectsManifest 声明式副作用

副作用必须从 InstallTarget 内部硬编码升级为 manifest 上的声明字段。卸载 = 反演 EffectsManifest，从根源消灭"漏清理"。

### 决策 8：4 Tab 信息架构

```
Browse / Installed / Owned / Updates
```

原"4 大分类（素材 / AI / 工具 / 整合）"降级为 Browse Tab 内的筛选 chips，不抢顶级 Tab 位。

---

## 三、包结构

```
packages/
├── neko-types/src/types/asset/        ← 所有类型定义（含市场类型）
│   ├── manifest.ts                      AssetManifest / AssetDistribution / DistributionKind
│   ├── registry.ts                      IAssetRegistry / IAssetHandler
│   ├── market.ts                        IMarketClient / IInstallTarget / EffectsManifest
│   └── effects.ts                       EffectsManifest 子类型
│
├── neko-market/                       ← 市场基础设施
│   └── packages/
│       ├── core/                        @neko/market-core（Layer 0，零 vscode 依赖）
│       │   ├── client/                    MarketClient（HTTP API 客户端）
│       │   ├── install/
│       │   │   ├── install-manager.ts     8 阶段生命周期编排
│       │   │   ├── install-target.ts      InstallTargetRegistry
│       │   │   ├── distribution/          archive / orchestration / registration 分发器
│       │   │   ├── middleware/            Trust / Quota / Conflict / Dependency 链路
│       │   │   ├── integrity-checker.ts   SRI 校验
│       │   │   └── download-service.ts    断点续传
│       │   ├── effects/                   EffectsManifest 反演卸载器
│       │   ├── cache/                     CacheManager LRU
│       │   ├── version/                   VersionResolver semver
│       │   ├── license/                   LicenseManager（client 调用方，不重算）
│       │   └── registry/                  InstalledRegistry 持久化
│       │
│       ├── extension/                   neko.neko-market VSCode 扩展
│       │   └── src/
│       │       ├── index.ts               activate / deactivate
│       │       ├── MarketplaceProvider.ts WebviewViewProvider
│       │       ├── MarketplaceService.ts  包装 market-core，注入 Bearer
│       │       ├── MarketplaceHandler.ts  market:* postMessage 路由
│       │       ├── market-api.ts          NekoMarketAPI 公开导出 + registerInstallTarget
│       │       ├── contribution-discovery.ts  扫描 contributes.neko.installTargets
│       │       └── targets/               4 个 X 类 InstallTarget（Media/Starter/Preset/Bundle）
│       │                                  Y 类（Skill/Plugin/Shader/Identity/Endpoint/Provider/Model）
│       │                                  由对应子包贡献，详见 §九.4-9.5
│       │
│       └── webview/                     @neko/market-webview React UI
│           └── src/
│               ├── components/
│               │   ├── MarketplaceApp.tsx
│               │   ├── BrowseView.tsx       推荐 / 最新 / 热门 / 免费 segmented
│               │   ├── InstalledView.tsx    本地已安装 + 启停
│               │   ├── OwnedView.tsx        已购列表 + 已购未装
│               │   ├── UpdatesView.tsx      可用更新
│               │   ├── AssetCard.tsx
│               │   ├── CategoryChips.tsx    素材 / AI / 工具 / 整合
│               │   └── SearchBar.tsx
│               ├── stores/marketplaceStore.ts  Zustand
│               ├── messages/                  类型安全 postMessage
│               └── i18n/                      EN + ZH-CN
│
├── neko-assets/                       ← 既有：本地素材管理（与 market 平行）
└── neko-agent/                        ← 既有：Skill 深链接入口
```

### 依赖关系

```
                @neko/shared (types + i18n + logger + theme)
                        ▲
                        │
                @neko/market-core         ← Layer 0，纯协议 + HTTP + 下载
                  ▲         ▲
                  │         │
        neko-market/      neko-agent      ← 各自的 UI + 安装逻辑
        extension/        SkillMarket
        webview/          (深链接入口)
            ▲
            │
        cli-tui                            ← /market 命令（Layer 0 直接消费）
```

---

## 四、AssetType 全集（11 种）

### 4.1 终态清单

```typescript
// manifest.ts
export type AssetType =
  // === Media（1 种，吃掉原 7 种）===
  | 'media'         // 媒体素材：metadata.mediaKind 区分子类型
  // === Workspace（2 种）===
  | 'starter'       // 工程模板（.nkcut/.nkc/.nkm/.nks/.nkpup/.nkst 起始项目）
  | 'identity'      // 跨格式角色身份包（与 Asset Federation 对接）
  // === AI（3 种）===
  | 'model'         // 本地 AI 权重：metadata.modelKind 区分（base/lora/embedding）
  | 'endpoint'      // 远程模型 / API 端点（吃掉 credential-template）
  | 'provider'      // Provider 表达上下文（原 provider-card）
  // === Tooling（4 种）===
  | 'skill'         // Agent Skill（prompt-chain）
  | 'plugin'        // neko-engine 原生 cdylib 扩展（KYC publisher 必需，无 WASM 通道）
                    // 社区贡献请用 skill / preset / shader / identity 等其它 type
                    // 详见 marketplace-plugin-governance.md
  | 'shader'        // GPU 着色器：metadata.shaderKind 区分（standalone/preset）
  | 'preset'        // 配置预设：metadata.presetKind 区分（lut/transition/effect/export/memory/...）
  // === Composition（1 种）===
  | 'bundle';       // 整合包（递归引用其它 type）
```

### 4.2 子类型 metadata.kind 表

| AssetType | metadata.kind 字段 | 取值 |
|---|---|---|
| `media` | `mediaKind` | `video` / `audio` / `image` / `sequence` / `3d-model` / `puppet-motion` / `document` |
| `model` | `modelKind` | `base` / `lora` / `embedding` |
| `shader` | `shaderKind` | `standalone` / `preset` |
| `preset` | `presetKind` | `lut` / `transition` / `effect` / `export` / `color` / `memory` / `theme` / `keybinding` / ... |

其它 7 种（`starter` / `identity` / `endpoint` / `provider` / `skill` / `plugin` / `bundle`）无子类型——单一行为。

### 4.3 4 大分类映射（UI 视图维度）

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

`AssetCategory` 是 **UI 视图维度**，`AssetType` 是 **实现维度**。两层分开：UI 切 Category（4 个 chips），引擎按 Type 分发（11 个 InstallTarget 路由）。

### 4.4 v3 → v4 重整对照

合并规则：**InstallTarget 安装/卸载行为不同 → 必须独立；只是 metadata 不同 → 合并并用 `metadata.kind` 区分**。

| v3 (21 种) | v4 (11 种) | 处理方式 |
|---|---|---|
| video / audio / image / sequence / 3d-model / puppet-motion / document | `media` | 合并：mediaKind 区分 |
| project-template | `starter` | 重命名：避免与 preset.template 撞名 |
| identity-pack | `identity` | 重命名：丢掉 `-pack` 实现细节 |
| ai-model / lora / embedding | `model` | 合并：modelKind 区分 |
| service-endpoint | `endpoint` | 重命名：丢掉冗余前缀 |
| provider-card | `provider` | 重命名：`-card` 是文档形态非类型 |
| skill | `skill` | 不变 |
| plugin | `plugin` | 不变 |
| shader / shader-preset | `shader` | 合并：shaderKind 区分 |
| preset / template / lut | `preset` | 合并：presetKind 区分 |
| bundle | `bundle` | 不变 |

**重命名原则**：单数单词、命名风格一致、丢掉实现细节后缀（`-pack` / `-card`）和冗余前缀（`ai-` / `service-` / `project-`）。

### 4.5 砍掉与推后

经 AIGC 创作者视角过滤后**明确不做**：

| 候选 | 理由 |
|---|---|
| dataset | 训练向，AIGC 创作者不训练 |
| recipe | 与 skill 的 prompt-chain 重复 |
| capability-spec | 内部协议物，不在市场销售 |
| entitlement | 隐藏在 license 后，不暴露成品类 |
| credential-template | 合并进 endpoint |
| 主题 / 字体 / 键位 / Linter | 用 `preset(presetKind: 'theme'/'keybinding'/...)` 落地 |
| agent-persona | 用 bundle + 特化 metadata 实现，不必单列 |
| knowledge-pack | 用 `preset(presetKind: 'memory')` 跑，遇 merge 冲突再升级 |

---

## 五、Manifest 与 Distribution

> **完整 Schema 权威文档**：[manifest-schema-spec.md](./manifest-schema-spec.md)
> 本节给出**架构决策的来源说明**（为什么这样设计）；所有字段定义、必填矩阵、校验规则以 schema spec 为准。
> Client / Server 实现都必须从 spec 文档导出 TypeScript 类型，本节示例仅作架构说明。

### 5.1 AssetManifest（统一清单）

```typescript
export interface AssetManifest {
  /** Unique identifier (@publisher/name) */
  id: string;
  /** Display name */
  name: string;
  /** Semantic version */
  version: string;
  /** Asset type (one of the 11) */
  type: AssetType;
  /** Source descriptor */
  source: AssetManifestSource;
  /** Distribution shape (NEW: archive / orchestration / registration) */
  distributionKind: DistributionKind;
  /** Type-specialized metadata */
  typeMetadata?: AssetTypeMetadata;
  /** Distribution metadata (license / author / pricing / ...) */
  distribution?: AssetDistribution;
  /** Declarative side-effects (NEW) */
  effects?: EffectsManifest;
  /** Direct dependencies (resolved recursively at install time) */
  dependencies?: AssetDependency[];
  /** Bundle contents (only when type === 'bundle') */
  contents?: BundleContent[];
  /** Thumbnail / preview image relative path */
  thumbnail?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}
```

### 5.2 DistributionKind（新增，§二决策 6）

```typescript
export type DistributionKind =
  | 'archive'          // tar.gz / zip → directory（现状默认）
  | 'orchestration'    // 无产物，纯编排（bundle）
  | 'registration';    // 无产物，写入子系统注册表（endpoint）
```

`InstallManager` 按 `distributionKind` 选取分发分支，`tar -xzf` 只在 `archive` 分支跑。

延后到 P2 的 kind：`single-file`（不解压的 .gguf/.onnx）、`merge`（合并到现有结构）、`streaming`（按需访问）。

### 5.3 EffectsManifest（新增，§二决策 7）

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
**卸载时**：反演 effects，依次调对应 registry 的 `unregister`，再删文件。漏清理的可能性降到接近零。

### 5.4 AssetManifestSource

```typescript
export type AssetManifestSource =
  | { kind: 'local'; path: string }
  | { kind: 'git-lfs'; oid: string; path: string }
  | { kind: 'registry'; registry: string; package: string; version: string; integrity?: string }
  | { kind: 'ai-generated'; taskId: string; model: string }
  | { kind: 'remote'; uri: string; checksum?: string };
```

### 5.5 AssetDependency 与 BundleContent

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

/** Bundle install policy */
export type BundleInstallPolicy = 'all' | 'pick';
```

### 5.6 类型特化元数据（11 种 type，每种 1 个 metadata 形）

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

// === Media (吃掉原 7 种 type) ===
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

// === Starter（原 project-template）===
export interface StarterMetadata {
  /** Target editor */
  targetEditor: 'cut' | 'canvas' | 'model' | 'sketch' | 'puppet' | 'story';
  /** Required AssetTypes the starter depends on */
  requires?: AssetType[];
}

// === Identity（原 identity-pack）===
export interface IdentityMetadata {
  /** Identity kind */
  identityKind: 'character' | 'location' | 'object' | 'style';
  /** Stable AssetIdentity ULID (binding target in Asset Federation) */
  identityId: string;
  /** Forms contained in this pack */
  forms: Array<{
    role: '3d-rigged' | '2d-puppet' | 'portrait' | 'voice' | 'bio' | 'reference';
    packageRef: string;
    relPath?: string;
  }>;
}

// === Model（吃掉原 ai-model / lora / embedding）===
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

// === Endpoint（原 service-endpoint）===
export interface EndpointMetadata {
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'comfyui' | 'custom';
  capabilities: ('chat' | 'image' | 'video' | 'audio' | 'embedding' | 'vision')[];
  endpointTemplate: string;
  credentialSchema: {
    fields: Array<{
      name: string;
      label: string;
      kind: 'apiKey' | 'orgId' | 'baseUrl' | 'custom';
      required?: boolean;
      placeholder?: string;
    }>;
  };
  modelIds?: string[];
}

// === Provider（原 provider-card）===
export interface ProviderMetadata {
  providerId: string;
  capabilities: ('image.generate' | 'video.generate' | 'audio.generate')[];
  modelIds?: string[];
  cardSchemaVersion?: string;
  trustLevel?: 'core' | 'community' | 'untrusted';
  signature?: { algorithm: 'sha256' | 'sha512' | 'ed25519'; value: string; signedBy?: string };
}

// === Skill ===
export interface SkillMetadata {
  domain: string[];
  toolSets?: string[];
  mcpServers?: string[];
  llmRequirements?: {
    capabilities: ('vision' | 'function-calling' | 'streaming')[];
    minContextWindow?: number;
  };
}

// === Plugin ===
export interface PluginMetadata {
  entryPoint: string;
  apiVersion: string;
  permissions: string[];
  configSchema?: Record<string, unknown>;
}

// === Shader（吃掉原 shader / shader-preset）===
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

// === Preset（吃掉原 preset / template / lut + 编辑器装饰）===
export interface PresetMetadata {
  presetKind:
    | 'lut'         // 调色 LUT
    | 'transition'  // 转场
    | 'effect'      // 效果参数预设
    | 'export'      // 导出预设
    | 'color'       // 调色面板预设
    | 'memory'      // memory.md 风格预设（原 knowledge-pack 暂行方案）
    | 'theme'       // 主题
    | 'keybinding'  // 键位
    | 'convention'  // 工程约定（linter / formatter）
    | string;       // 允许扩展
  targetApp?: 'cut' | 'canvas' | 'model' | 'sketch' | 'puppet' | 'story' | 'agent' | string;
  parameters?: Record<string, unknown>;
}

// === Bundle ===
export interface BundleMetadata {
  installPolicy: BundleInstallPolicy;  // 'all' | 'pick'
  bundleType?: 'style-pack' | 'workflow-pack' | 'character-pack' | 'mixed';
}
```

**讨论**：v4 把"21 个 metadata 接口"压缩到"11 个 + 4 个 kind 字段"，类型联合显著简化，typescript 判别也更顺手。子类型字段全部内置，无需再加新的 type 即可扩展（如 `presetKind: 'gradient'` / `mediaKind: 'midi'`）。

### 5.7 过期与弃用 schema

"过期"不是一种事，是 5 种性质不同的事：

```
A. License 过期    server 权威   订阅停付 / 1 年期到 / 试用结束 / 退款 / 平台下架
B. 兼容性过期      client 自检   shader 在新 GPU 编译失败 / skill 在新 runtime 不工作
C. Curation 过期   server 标注   publisher 主动 deprecate / 老版被新版取代
D. 缓存过期        client 自治   market-cache / stock-cache / ai-generated-cache LRU
E. 闲置过期        用户决定      长期未用 + 磁盘紧张
```

5 类的处理机制完全不同——所有权不同、强度不同、回滚路径不同。详细处理策略见 §九.6 ExpiryEvaluator，UI 表现见 §六.10。

#### Manifest 端字段（B + C 类）

```typescript
export interface AssetCompatibility {
  nekoSuiteVersion?: string;
  vscodeVersion?: string;
  engineVersion?: string;

  // === 新增（B 类） ===
  /** 已知不兼容的 client 版本范围，server 标记 */
  knownIncompatible?: { reason: string; range: string }[];
  /** 推荐升级到 packageId@version */
  upgradeTo?: { packageId: string; version: string };
}

/** Curation 弃用标注（C 类，server 下发） */
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

export interface AssetManifest {
  // ... 现有字段 ...

  /** Curation 标注（C 类，server 下发） */
  deprecation?: AssetDeprecation;
}
```

#### License 信息（A 类）不进 manifest

License 状态属于 server 端 entitlement，client 通过 `/me/entitlements` 拉取，**不入 manifest**。原因：

```
✗ License 因人而异（同一 manifest，A 用户已购 B 用户未购）
✗ License 时变（订阅状态每分钟可能变）
✗ Manifest 是包属性，license 是用户属性，二者必须分离
```

InstalledRegistry 端持有 license 派生字段（详见 §九.6 InstalledPackage 扩展）。

### 5.8 大素材策略 LargeAssetStrategy

按整包大小分档，不同档位的策略完全不同：

```
档 0   极小    < 1 MB         skill / plugin 代码 / LUT / preset / provider
档 1   小      1 - 100 MB     单 shader / 单语音 / 轻量模型
档 2   中      100 MB - 1 GB  单 LoRA / embedding / 单 3D 模型 / 单素材包
档 3   大      1 - 10 GB      基础扩散模型 / 大 LoRA 合集 / 高清素材包
档 4   巨      10 - 100 GB    LLM 权重 / Whisper-Large / 视频素材库
档 5   超巨    > 100 GB       foundation 模型 / 完整数据集
```

#### 5 种策略 modes（可组合）

```typescript
export type DistributionMode =
  | 'eager'      // 立即整包下载（所有字节预下载）
  | 'sparse'     // 清单先到，用户挑子集下载（适合 100+ 项目大包）
  | 'proxy'      // 低质代理先到，用时取高质（视频 / 高清图）
  | 'delta'      // 基线已存，仅下载差量（模型升级）
  | 'variant';   // 发布多档质量，用户选档（量化档 fp16/int8/Q4_K_M）
```

#### LargeAssetStrategy schema

```typescript
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

  /** 总体大小估计（用户决策依据 + Quota 中间件检查必读） */
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

export interface AssetManifest {
  // ... 现有字段 ...

  /** 大素材策略（可选；缺省视为 eager） */
  largeAsset?: LargeAssetStrategy;
}
```

#### 必填约束

```
✓ totalSize 必填（Quota 中间件 + 用户决策依据）
✓ modes 至少含一个（默认 'eager'）
✓ sparse 模式 → sparseItems 必填
✓ proxy 模式 → proxyVariants 必填，default 标 1 个
✓ variant 模式 → variants 必填，recommended 标 1 个
✓ delta 模式 → deltaBase 必填
```

#### 按 type × 档位的策略推荐

| Type | 档位 | 推荐 modes | 备注 |
|---|---|---|---|
| `skill` / `plugin` / `provider` / `endpoint` | 0 | `eager` | 整包下载 |
| `preset` (单文件) | 0-1 | `eager` | KB-MB |
| `shader` (standalone) | 0-1 | `eager` | WGSL/GLSL 文本 |
| `preset` 大合集 | 2-3 | `sparse` | 用户选子集 |
| `model` (单基模) | 3 | `eager` + `delta` + `variant` | 升级走 delta，量化档可选 |
| `model` (LLM Q4_K_M) | 3-4 | `variant` + `delta` | 强制选档 |
| `model` (LoRA 合集) | 2-3 | `sparse` | 用户挑用 |
| `embedding` | 1-2 | `eager` | 单文件 MB 级 |
| `media` (单张高清图 / 单段 4K) | 0-2 | `eager` 或 `proxy` | 视频/高清图必带 proxy |
| `media` 图片合集 (1000+) | 2-3 | `sparse` + `proxy` | 缩略图先到，原图按需 |
| `media` 视频素材库 | 3-4 | `sparse` + `proxy` | proxy 先 + 原视频按需 |
| `media` (3d-model 高模) | 1-2 | `proxy` | 简模 + 高模按需 |
| `media` (puppet-motion 库) | 1-2 | `sparse` | 按动作选下 |
| `identity` | 1-3 | `eager` 或 `sparse` | forms 数量决定 |
| `starter` | 0-1 | `eager` | 工程模板小 |
| `bundle` | 任意 | (子包各自策略) | bundle 不持有字节 |

#### 状态机扩展（5 态）

大素材的 install 不再是简单 "未装 / 已装"，需 5 态：

```
not-owned        Market Browse 才显示
owned            Market.Owned 显示，AssetLibrary 不显示
manifest-only    安装后仅 manifest + 缩略图 + 选择 UI（sparse）
proxy            低质代理可立即使用
full             最终态
```

转换：

```
not-owned ──[purchase]──► owned ──[install]──► manifest-only / proxy / full
                                       │
                                       ▼
manifest-only ──[per-item download]──► partial → ... → full

proxy ──[on-use upgrade]──► full
        （编辑器要 4K 时触发）
```

每态可独立卸载（释放空间但保留更高态需要时的"再下载"权利）。

### 5.9 Manifest 语义层（typed semantic facets）

语义和意图（§五.11）是平行的两个独立字段，**不要混在一起**：

```
语义 (Semantics)   描述固有属性 → "这是什么"
                   warmth=0.85, mood='nostalgic', era='1980s'
                   客观可计算 / 用于向量检索

意图 (Intent)      描述使用场景 → "何时/为何/给谁用"
                   useCase=['vlog','wedding'], audience='professional'
                   主观判断 / 用于业务匹配
```

#### 反对自由 tag

```
不再用：
  tags: ['warm', 'cinematic', 'sunset']

改用：
  semantics: {
    warmth: 0.85, contrast: 0.6, saturation: 0.4,
    mood: ['nostalgic', 'cinematic'],
    timeOfDay: 'golden-hour', era: '1980s'
  }
```

`tags` 字段保留向后兼容，但**不参与排序 / 跨包语义对齐 / agent 推理**。

#### typed facets 的能力

```
✓ 范围搜索（warmth ∈ [0.7, 1.0]）
✓ 跨包语义对齐（不同 LUT 包的 'warm' 含义不同；warmth=0.85 是数字）
✓ LLM agent 推理（"温暖但不太甜的 LUT" → warmth>0.7 AND saturation<0.6）
✓ 与 engine-semantic-ontology 槽对应（[adr-engine-ai-native-foundation.md] 的"温暖"槽）
```

#### AssetSemantics 联合（按 type/kind 判别）

```typescript
export type AssetSemantics =
  | { type: 'preset'; presetKind: 'lut'; data: LutSemantics }
  | { type: 'preset'; presetKind: 'transition'; data: TransitionSemantics }
  | { type: 'preset'; presetKind: 'effect'; data: EffectSemantics }
  | { type: 'preset'; presetKind: 'memory'; data: MemorySemantics }
  | { type: 'media'; mediaKind: 'audio'; data: AudioSemantics }
  | { type: 'media'; mediaKind: 'image'; data: ImageSemantics }
  | { type: 'media'; mediaKind: 'video'; data: VideoSemantics }
  | { type: 'media'; mediaKind: '3d-model'; data: ModelMediaSemantics }
  | { type: 'media'; mediaKind: 'puppet-motion'; data: PuppetMotionSemantics }
  | { type: 'identity'; data: IdentitySemantics }
  | { type: 'skill'; data: SkillSemantics }
  | { type: 'model'; data: ModelSemantics }
  | { type: 'shader'; data: ShaderSemantics }
  | { type: 'plugin'; data: { domain: string[]; useCase: string } }
  | { type: 'endpoint'; data: { latencyTier: 'low' | 'medium' | 'high'; rateLimit?: string } }
  | { type: 'provider'; data: { syntaxStyle: string[]; conceptCoverage: string[] } }
  | { type: 'starter'; data: { complexity: 1 | 2 | 3 | 4 | 5; scenario: string } }
  | { type: 'bundle'; data: { theme: string[]; collectionSize: number } };

// === 各 facet schema 草案（核心几个）===

export interface LutSemantics {
  warmth: number;             // -1 cold ~ +1 warm
  contrast: number;           // 0 flat ~ 1 punchy
  saturation: number;
  mood: string[];             // 'nostalgic' / 'cinematic' / 'gritty' / 'vibrant' / 'pastel'
  timeOfDay?: 'golden-hour' | 'blue-hour' | 'daylight' | 'night';
  filmStock?: string;         // 'kodak-portra-400' 等
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

export interface AssetManifest {
  // ... 现有字段 ...

  /** Typed semantic facets（按 type/kind 判别） */
  semantics?: AssetSemantics;
}
```

#### Server 端职责

```
① 维护各 type / kind 的 facet schema 受控词汇表（ontology）
② 验证发布者声明的 facet 取值是否在表内
③ 由 manifest.name / description / tags / semantics 算向量入向量 DB
④ 暴露 GET /api/v1/packages?semantic.warmth>=0.7&semantic.mood=cinematic
   facet 化搜索 + 向量混合排序
```

#### Client 端职责

```
① 详情页直接读 manifest.semantics 渲染（"为什么推荐"）
② Browse Tab 提供 facet 范围 slider / chips
③ 跨包搜索 / Agent 推荐 走本地 engine-vector-index（详见 §五.10）
```

### 5.10 Payload 向量与 Client 端索引

#### 四层独立决策

```
Layer 1  Manifest 层向量    AssetManifest 是否带 embedding 字段？  → ✗ 不带
Layer 2  Payload 层向量    包内文件是否带预计算 embedding？        → ⚠️ 视情况
Layer 3  Manifest 层语义    AssetManifest 是否带结构化 facets？      → ✓ 必带（§五.9）
Layer 4  Client 端索引      装完后 client 是否本地建向量库？        → ✓ 必建
```

四层互相独立，可以选不同组合。

#### Layer 1：Manifest 不带向量

```
× 模型版本绑死（升级 embedding 模型 = 全量 manifest 重生）
× Server 已有完整 manifest，重复存一遍向量纯浪费
× Client 不做向量搜索（搜索是 server 职责）

✓ 唯一例外：embeddingHash 指针
  manifest.distribution.embeddingHash → server 端向量 DB row id
  仅用于 client 通过 hash 校验"我看到的是哪个版本"
```

#### Layer 2：Payload 内 embedding 视情况

```
小包（< 50 个文件）：              不带，安装时 client 重算成本可忽略
大包（≥ 100 个文件 / 媒体素材）：   建议带，避免装完一遍 GPU 算半小时
```

按 type 决定：

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
| `media` (3d/puppet-motion) | ⚠️ 可选 | 几何/动作向量计算贵，预算下来值得 |
| `identity` | ✓ | 跨格式角色身份必带（与 Asset Federation `IdentityRegistry` 对接） |
| `bundle` | ✗ | 无内容 |

#### PackageEmbeddings schema

```typescript
export interface PackageEmbeddings {
  modelId: string;          // 必须显式："clip-vit-base-patch32"
  modelVersion: string;
  dimension: number;
  /** Path within package → embedding bin path */
  files: { path: string; vector: string }[];
}

export interface AssetManifest {
  // ... 现有字段 ...

  /** Package payload 内的预计算 embedding（Layer 2，仅大包/媒体类） */
  embeddings?: PackageEmbeddings;
}
```

**约束**：

```
✓ modelId 必填（避免向量黑盒互不兼容）
✓ modelVersion 必填
✓ dimension 必填
✓ 不在 server 白名单的 modelId 拒收
```

#### Client 装机后处理

```
1. 检查本地 engine 支持 manifest.embeddings.modelId
2. 不支持 → 降级，按需重算（不阻塞安装）
3. 支持   → 直接吃下，跳过本地计算
4. 灌入本地 engine-vector-index（与 [adr-asset-federation.md] 对接）
```

#### Layer 4：Client 端向量库

```
本地搜索"温暖的 LUT"     engine-vector-index 查询本地已装包
Asset Federation 跨包流转 "Anya 3D → 找她 2D 立绘" → identity vector 关联
Agent 推荐               "你这段视频用温暖调，要不要试试这个 LUT 包？"
离线工作                 不打 server，本地全功能
```

数据来源（按优先级）：

```
1. 包内带 embedding         直接吃下（Layer 2 命中，最省）
2. manifest.semantics       由 facets 推导粗向量（Layer 3，免计算）
3. AssetHandler.computeEmbeddings()  本地 engine 算（fallback）
```

与 [adr-asset-federation.md](docs/architecture/adr-asset-federation.md) 的 `AssetHandler.computeEmbeddings` 模式一致——**market 装机器只是把向量"塞进去"，本地索引由 federation 持有**。

#### 卸载时的反演

```
卸载包 → ExpiryEvaluator 反演 effects.registrations
       + 删 engine-vector-index 中所有属于该 packageId 的 row
       + 删 IdentityRegistry 中由该包注册的 identity row
```

### 5.11 Manifest 意图层（typed intent facets）

意图字段与 §五.9 semantics **平行**，不混合。

#### 意图层的价值

```
价值 1  创作者查询贴近自然语言
        没 intent: 退化为 tag 字符串匹配
        有 intent: GET /api/v1/packages?intent.useCase=vlog 精确返回

价值 2  Agent 工作流感知推荐
        Agent 知道"用户在 corporate workflowStage" → 过滤掉 useCase=['vlog']

价值 3  onboarding 与技能分层
        audience='beginner' filter → 自动屏蔽高阶资产

价值 4  合规边界
        notFor: ['commercial', 'NSFW']
        付费素材的合规风险显式化
```

#### AssetIntent 通用接口

```typescript
export interface AssetIntent {
  /** 适用使用场景 */
  useCases: string[];        // 'vlog' / 'wedding' / 'commercial' / 'tutorial' / 'film' / 'social-media' / ...

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

#### Type-specific intent

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

export interface AssetManifest {
  // ... 现有字段 ...

  /** Typed intent facets（与 semantics 平行字段） */
  intent?: AssetIntent;
}
```

#### 与 semantics 的边界

```
semantics = "这是什么"      （客观 / 可计算 / 用于向量检索）
intent    = "应该怎么用"    （主观 / 由人/agent 标 / 用于业务匹配）

不要混合：
× semantics: { warmth: 0.85, useCases: ['wedding'] }   ← 错
✓ semantics: { warmth: 0.85 }
  intent:    { useCases: ['wedding'] }
```

#### 三层混合搜索

```
Q "找一个温暖怀旧的 vlog LUT"
  semantics: warmth>0.6 AND mood=nostalgic   → 30 个候选
  intent:    useCases=vlog                    → 缩到 8 个候选
  vector:    与"温暖怀旧"句向量相似度排序      → 排序后给前 5
```

没有 intent 这一层就没了"vlog"过滤维度，只能靠 vector 模糊匹配。

兼容窗口：`MarketSearchQuery.intent.useCase` 单数 key 仅作为旧 client alias 保留到 marketplace contract v1.1 / 下个 minor 迁移窗口结束。新代码和文档必须使用复数 `useCases`。

#### Server 端职责

```
① 受控词汇表（ontology）：useCases / workflowStage / goals / audience / domain
② 不在表内的取值拒收（保证跨包对齐）
③ Browse Tab 暴露 intent 多选 chips
```

#### 强制约束

```
✓ 付费包必填 notFor 至少一项（或显式声明 'no-restriction'）
✓ useCases 必填（至少一项）
✓ 其它字段全部 optional（向后兼容老 manifest）
```

---

## 六、信息架构（UI）

### 6.1 4 顶级 Tab

```
┌────────────────────────────────────────────────────────┐
│ neko-market                                             │
├────────────────────────────────────────────────────────┤
│ Browse        浏览（推荐 / 最新 / 热门 / 免费）         │
│ Installed     已安装（本地，可启停）                    │
│ Owned         已购买（含未装的，可一键装）              │
│ Updates       可更新（差异版本提示）                    │
└────────────────────────────────────────────────────────┘
```

### 6.2 Browse Tab 内部（segmented control + 分类 chips）

```
[推荐] [最新] [热门] [免费]   ← segmented sort
┌──────────────────────────────────────────────────────────────────────┐
│ 类别: ⓘ素材 ◯AI ◯工具 ◯整合                                       │  ← AssetCategory chips (4)
│ 类型: media / starter / identity / model / endpoint / provider /    │  ← AssetType filter (11)
│       skill / plugin / shader / preset / bundle                      │
│ 子类型: (按所选 type 动态展开 mediaKind / modelKind / shaderKind /  │  ← metadata.kind filter
│         presetKind 子选项)                                            │
│ 搜索: ___________________                                              │
└──────────────────────────────────────────────────────────────────────┘
列表区（按当前 segmented 排序，按 chips 筛选）
```

筛选层级：`AssetCategory (4)` → `AssetType (11)` → `metadata.kind (动态)`。点 Category 自动收窄 Type chips；点 Type 后再展开 kind 子选项（如选 `media` 出现 `mediaKind` 子滤镜）。

各排序后端映射：

```
推荐  → GET /api/v1/packages?sort=featured     P0（已有 /featured 端点改造）
最新  → GET /api/v1/packages?sort=created      P0
热门  → GET /api/v1/packages?sort=trending     P1（server 端要实现 trending 算法）
免费  → GET /api/v1/packages?sort=downloads&pricing=free  P2
```

### 6.3 Installed Tab

按 AssetCategory 折叠分组：

```
▼ 素材 (5)
   • @studio/cyberpunk-lut-pack v1.2.0    [启停] [详情] [卸载]
▼ AI (3)
▼ 工具 (8)
▼ 整合 (1)
```

每行支持启停（保留文件、停用注册）、详情、卸载、查看依赖。

### 6.4 Owned Tab（对应 §二决策 4）

数据来自 `GET /api/v1/me/entitlements`，区分三种状态：

```
✓ 已购已装       直接显示
○ 已购未装       高亮，"一键安装"按钮
⚠ 已购过期       灰色，"续费"按钮（deep-link 到 server 续费页）
```

价值：用户换机器后能找回买过的东西。

### 6.5 Updates Tab

`MarketClient.checkUpdates()` 客户端比对版本，列出可用更新 + changelog 摘要 + "一键全部更新"。

### 6.6 购买流水（方案 A：纯 web jump）

```
client 详情页
  └─ [购买 ¥99] 按钮
       │
       ▼
  client.licenseManager.buildCheckoutUrl(packageId, returnTo='vscode://neko.market/refresh?packageId=...')
       │
       ▼
  GET /api/v1/billing/checkout-url?packageId=&returnTo=
       │
       ▼  server 返回 Stripe / Alipay / 微信 的 checkout URL（含 session token）
       │
       ▼
  vscode.env.openExternal(url)
       │
       ▼
  浏览器内完成支付（含 3DS / 验证码 / 风控 / 优惠券 / 发票）
       │
       ▼
  server webhook 收到支付成功 → 写入 Entitlements 表
       │
       ▼
  client 通过三条路径感知 entitlement：
    ① returnTo deep-link：vscode://neko.market/refresh 触发刷新
    ② 用户回 client 后点"刷新已购"按钮
    ③ 后台轮询 GET /me/entitlements（5 min TTL）
       │
       ▼
  Owned Tab 自动出现新条目（已购未装态），可一键 install
       │
       ▼
  install 时再调一次 POST /me/entitlements/check 拦截 → server 返 allowed=true
       │
       ▼
  正常进入 §七 8 阶段安装流水
```

**详情页按钮状态机**：

```
免费包         → "安装"
付费未购       → "购买 ¥XX"  + 可选"免费试用 N 天"
已购未装       → "安装"（直接走 install，跳过支付）
已购已装       → "已安装"（灰，链到 Installed Tab）
订阅过期       → "续费"（deep-link 到 server 续费页）
购买中（轮询） → "处理中…"（5min 内 entitlement 未到）
```

**失败兜底**：购买后 5 min 内 entitlement 未到达，详情页提示"如已支付请稍后刷新或联系客服"，并提供"打开订单查询"链接（deep-link 到 server 订单页）。**永远不在 client 内做申诉 / 退款 / 客服流程**。

**按钮事件最小集**：

```typescript
// 仅这四个事件，全部为 deep-link 出口
type BuyAction =
  | { kind: 'checkout'; packageId: string }      // → openExternal(checkoutUrl)
  | { kind: 'renew'; packageId: string }         // → openExternal(renewUrl)
  | { kind: 'invoice'; orderId: string }         // → openExternal(invoiceUrl)
  | { kind: 'support'; orderId: string };        // → openExternal(supportUrl)
```

**Client 不持有的状态**：

```
✗ 卡号 / Stripe customer id / Alipay 用户 id
✗ 订单详情 / 发票数据 / 退款流程
✗ 支付状态机（pending / authorized / captured / refunded …）
✗ 优惠券验证逻辑
```

以上全部由 server 持有，client 仅看 `Entitlement.allowed: boolean` 和 `expiresAt: number`。

### 6.7 按 type 显示三面分工（浏览面 / 取用面 / 管理面）

每种 AssetType 在 UI 中有三个独立"显示面"，各管一职，不要互抢：

```
1. 浏览面 (Browse)        用户看"有什么 / 我有什么"
2. 取用面 (Consume)        用户在创作中"挑一个用"
3. 管理面 (Manage)        启停 / 卸载 / 更新 / 看 entitlement
```

按 11 种 type 各自的归位：

| Type | 浏览面 | 取用面 | 管理面 |
|---|---|---|---|
| `media` (video/audio/image/sequence/document) | **AssetLibrary** | timeline drag / canvas insert / 文档预览 | Market.Installed |
| `media` (3d-model) | **AssetLibrary** | neko-model 视口 | Market.Installed |
| `media` (puppet-motion) | **AssetLibrary** | neko-puppet 动作库 | Market.Installed |
| `identity` | **AssetLibrary** + 各编辑器的 Character 选择器 | 右键 "Use Character ▸" | Market.Installed |
| `starter` | New Project 向导（一次性） | 新建工程时 | Market.Installed |
| `skill` | neko-agent Skill 列表 | 聊天框 `/skill-name` 命令 | Market.Installed |
| `plugin` | 命令面板 + 各 host UI | 视 contribution | Market.Installed |
| `shader` | Effect 面板 / Material 选择器 | 右键 "Add Effect ▸" | Market.Installed |
| `preset` (lut) | LUT 面板 | 右键 "Apply LUT ▸" | Market.Installed |
| `preset` (transition) | 转场选择器 | 右键 "Add Transition ▸" | Market.Installed |
| `preset` (effect) | 效果库 | 右键 "Apply Filter ▸" | Market.Installed |
| `preset` (export) | 导出对话框 | 导出时选 | Market.Installed |
| `preset` (memory) | Agent Memory 面板 | 切换记忆档位 | Market.Installed |
| `preset` (theme/keybinding/convention) | 设置 / 各编辑器视口 | 自动应用 | Market.Installed |
| `model` (base/lora/embedding) | Agent 模型选择器 | 生成时 / 推理时选 | Market.Installed |
| `endpoint` | Agent endpoint 切换器 | 调用时选 | Market.Installed |
| `provider` | Agent provider 列表 | provider 切换 | Market.Installed |
| `bundle` | — | — | Market.Installed/Owned |

**纪律**：每种 type 的浏览面**只能有一个**——避免"在 AssetLibrary 看到一遍，在 LUT 面板又看到一遍"的双源。已购未装项**只在 Market.Owned Tab**，不在领域面板做"幽灵项"。

### 6.8 AssetLibrary 与 Market 的边界

AssetLibrary 仅显示**心智上属于"素材"**的两种：`media` + `identity`。其它 9 种各归领域面板（详见 §六.7）。

#### 反模式：3 Tab "本地 / 云端 / 市场已购买"

被否决的方案。状态空间真有 4 种来源 × 2 种位置 = 8 个状态，硬塞 3 Tab 必现重叠：

```
来源 \ 在不在本地    本地有       本地没有
─────────────────   ─────────    ──────────
自己导入             A            ✗
AI 生成              B            ✗
市场买的             C            D
云端 stock           E            F

"本地"映射到 A+B+C+E，"市场已购买"映射到 C+D
→ C 同时出现在两个 Tab，用户糊涂
```

#### 推荐结构：1 + N + 1（核心 Tab + 动态 Stock Tab + Market 出口）

```
┌──────────────────────────────────────────────────────────────┐
│ AssetLibrary                                                  │
├──────────────────────────────────────────────────────────────┤
│ [本地]  [Pexels]  [Freesound]  [Civitai]  …  [+ 找更多]      │
│   ↑       ↑──────────┴─────────┘              ↑              │
│   核心    动态 Stock Tab                       deep-link       │
│   完整    由已装 service-endpoint 注入         到 Market       │
│   CRUD    Phase 6.6 落地                       Browse Tab      │
└──────────────────────────────────────────────────────────────┘
```

**Tab 1 [本地]**（默认 Tab，唯一持有 CRUD）

```
内容：A + B + C + E（所有"现在能拖到时间线/画布/视口"的素材）
UI：
  - 顶部 source filter chips（全部 / 自己导入 / AI 生成 / 市场 / Stock 缓存）
  - 每条素材右上角 source badge：
      ✓ Market   → 点击 deep-link 到 Market 详情页
      ☁ cached   → "重新下载 / 离线缓存"
      ✦ AI       → "查看生成历史 / 重新生成"
      （无徽章 = 自己导入）

不接管 Market 管理：本地 Tab 点 ✓ Market badge 弹出菜单，
"卸载/启停/更新"全部跳到 Market 详情页处理，AssetLibrary 不重做一遍。
```

**Tab 2~N [云端 Stock]**（动态注入，按已装 endpoint）

```
触发：装一个 service-endpoint
      with metadata.capabilities 含 'stock-image' | 'stock-audio' | 'stock-video'
      → AssetLibrary 自动加一个 Tab，命名 = endpoint.name

Tab 内容：
  搜索框 + endpoint API 实时返回结果
  选中"Use" → 下载到 ~/.neko/local/stock-cache/{provider}/
  下载后变 E (cached)，自动出现在本地 Tab

属于 Phase 6.6 范畴。
```

**[+ 找更多]**（不是 Tab，是 deep-link 按钮）

```
位置：Tab 条最右
点击：vscode.commands.executeCommand('neko.market.open', { category: 'media' })
      → 打开 Market Browse Tab，category 预筛 = media + identity
```

#### 双向桥（不复刻，只 deep-link）

```
AssetLibrary 本地 Tab → Market 详情页
  · 点 ✓ Market badge → "在 Market 中查看"
  · 点 "找更多" 按钮 → Market Browse Tab + category=media

Market.Installed (filter media+identity) → AssetLibrary
  · Market 详情页 "Open in Library" 按钮 → AssetLibrary 高亮该项

Market.Owned 已购未装 → 安装后自动出现在本地 Tab（无 AssetLibrary 主动拉）
```

#### 为什么不做"市场已购买" Tab

```
× 与 Market.Installed/Owned Tab 100% 重复
× AssetLibrary 不该是 Market 客户端（违反 SRP）
× 双源 → 状态不一致风险（Market 卸载后 AssetLibrary 该不该立刻刷？）
× 已购未装混进 AssetLibrary 会复活 §二决策 4 否决的 Model B
```

本地 Tab 的 source badge 已覆盖"我从市场买的"这一可见性需求，不必再开 Tab。

### 6.9 AssetLibrary Tab 演进路径

```
P0  现状：[本地]
        单 Tab，无 source 区分

P1  与 Phase 6.5.5 / 6.5.6b 同期：[本地] + [+ 找更多]
        本地 Tab 加 source filter chips
        每条素材加 source badge
        点 ✓ Market badge → deep-link 到 Market 详情页
        Market 详情页加 "Open in Library" 按钮（双向桥）

P2  Phase 6.6（云端单素材）：[本地] [Pexels] [Freesound] ... [+ 找更多]
        service-endpoint with capabilities=['stock-*'] 触发动态 Tab 注入
        ~/.neko/local/stock-cache/ LRU 管理
        stock 下载后转换为本地 media，进入本地 Tab
```

**动态 Tab 注入机制**（P2 实现要点）：

```typescript
// neko-assets webview 订阅 onDidInstall
market.onDidInstall((event) => {
  if (event.type !== 'endpoint') return;
  const meta = event.manifest.typeMetadata?.data as EndpointMetadata;
  const stockCaps = meta.capabilities.filter((c) => c.startsWith('stock-'));
  if (stockCaps.length > 0) {
    addStockTab({ endpointId: event.packageId, name: event.manifest.name, caps: stockCaps });
  }
});

market.onDidUninstall((event) => {
  if (event.type === 'endpoint') removeStockTab(event.packageId);
});
```

### 6.10 过期素材的 UI 表现

延续 §五.7 的 5 类过期，UI 在三个不同位置各自展示：

#### Market.Installed Tab：5 种状态徽章

```
状态                 徽章       行为
─────────────────    ─────     ───────────────────────────────────────────
active               （无）     正常显示
expiring-soon (7d)   ⚠ 黄色    顶栏 "X 天后过期，[续费]"
expired              ⛔ 灰色    顶栏 "已过期 N 天前，[续费 / 立即清理]"
                                运行时不再加载（硬禁用）
incompatible         ⚠ 红色    "需要 neko-suite ≥ vX.Y, [升级 / 卸载]"
                                运行时不再加载（软禁用）
deprecated           ℹ️ 蓝色    "已被 @publisher/new-pack 替代, [迁移]"
                                正常显示，仍可用
```

#### Market.Owned Tab：续费聚焦

```
重点显示：[即将过期] 区块（最近 30 天到期的全部资产）
+ 自动续费开关（与 server 对接）
+ 续费历史
+ 已过期资产的"重新购买"deep-link
```

#### AssetLibrary 本地 Tab（仅 media + identity）

```
expired media         → 不在本地 Tab 显示（已禁用）
incompatible media    → 不在本地 Tab 显示（无法加载）
deprecated media      → 显示 + ℹ️ badge "已废弃，建议迁移"
expiring-soon media   → 显示 + ⚠ badge "X 天后过期"

特殊：已被 timeline 引用的 expired media
  → AssetLibrary 不显示
  → timeline 引用标红 + 弹"授权过期"对话框
     [续费 / 替换素材 / 移除引用]
```

#### 各领域面板（LUT / Shader / Skill / ...）

```
expired       → 隐藏或灰色 + 续费图标，点击 deep-link 到 Market 续费页
incompatible  → 红色 ⚠ + tooltip 错误信息
deprecated    → 显示 + ℹ️ + 推荐替代品
```

#### Storage Manager（D + E 类专属面板）

E 类（闲置清理）需要独立 UI——属于"用户主动维护"工具，不放在 Market 主流程里：

```
┌─────────────────────────────────────────────────────────────┐
│ Storage Manager                                              │
├─────────────────────────────────────────────────────────────┤
│ 总占用: 87.4 GB / 200 GB                                     │
│ ┌──────────────────────────────────────────────────────┐    │
│ │ Sort: [大小↓] [上次使用↑] [安装时间]                  │    │
│ ├──────────────────────────────────────────────────────┤    │
│ │ ▼ 模型 (62 GB)                                         │    │
│ │   sdxl-base-1.0          6.9 GB  6 个月前用过 ⚠       │    │
│ │   whisper-large-v3       3.1 GB  从未用过 ⚠⚠          │    │
│ │   ...                                                  │    │
│ │                                                        │    │
│ │ ▼ 媒体合集 (18 GB)                                     │    │
│ │ ▼ 工具 (1.2 GB)                                        │    │
│ │                                                        │    │
│ │ [全选未用 30 天+]  [清理已选 25.3 GB]                  │    │
│ └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**纪律**：

```
✓ 仅显示已装包，不主动清理
✓ "清理"动作 = 卸载文件，但保留 entitlement（在 Owned Tab 仍可一键重装）
✓ 大于 1 GB 清理必二次确认
✓ 闲置 ≠ 过期，UI 文案区分（"长时间未使用" vs "已过期"）
✓ D 类缓存（market-cache / stock-cache / ai-cache）独立"清理缓存"按钮，不混在包列表里
```

### 6.11 AssetLibrary 显示状态规则（按 5+1 态）

承接 §五.8 大素材状态机，AssetLibrary 仅显示 media + identity 类资产，每条目按状态渲染：

| 状态 | 显示位置 | 显示形态 | 操作 |
|---|---|---|---|
| `not-owned` | ✗ AssetLibrary 不显示 | (仅 Market.Browse) | 购买入口 |
| `owned` (已购未装) | ✗ AssetLibrary 不显示 | (仅 Market.Owned) | 一键安装 |
| `manifest-only` | △ 部分显示 | 已选条目入本地 Tab，未选条目仅 Market 详情 | "继续挑选" |
| `proxy` | ✓ 显示 | + 'Proxy' badge + 灰色边框 | 点击 "升级到完整版" |
| `partial` | ✓ 已下载部分 | 已下载的入本地 Tab，未下载的不在 AssetLibrary | "下载更多" |
| `full` | ✓ 正常显示 | 与导入素材无差别 | 拖出来用 |

#### 核心纪律

```
AssetLibrary 显示 = "我现在能用的"
                  → 包括 proxy（能用，只是质量打折）
                  → 不包括 owned-no-bytes（不能用）
                  → 不包括 unselected items in pack（用户没要它）
```

这与 §六.8 "AssetLibrary 不做幽灵项"一致。

#### 状态转换触发显示更新

```
not-owned → owned                     不影响 AssetLibrary
owned → manifest-only / proxy / full   onDidInstall 事件触发增量
proxy → full                           onDidInstall 增量（同 packageId 替换 badge）
manifest-only → partial → full         每子条目下载完成 fire 一次 onDidInstall
任意 → expired/incompatible            移出 AssetLibrary（详见 §六.10）
任意 → uninstalled                     移出 AssetLibrary
```

#### Proxy / Full 的隐式 upgrade

编辑器使用素材时，按上下文决定用哪一份：

```
timeline preview / canvas 编辑：    proxy 即可
最终渲染 / 导出商用：               必须 full → 自动触发 upgrade
缩略图 / thumbnail：                proxy 优先
向 agent 提供分析：                 proxy 即可

upgrade 触发流程：
  编辑器在导出前调 NekoMarketAPI.ensureFull(packageId, itemId)
  → 若已 full，立即返回
  → 若 proxy，弹下载进度 + 阻塞导出（用户可取消）
  → 若 partial 但目标条目未下载，触发该条目下载
```

### 6.12 大素材安装 UI 规范

大素材安装前必须给用户**明确成本提示**，不能直接 spinner 转 30 分钟。三种 UI 模式按 modes 区分：

#### Variant Picker（model 类专属）

```
┌────────────────────────────────────────────────────────┐
│ Install: SDXL Base Model v1.0                           │
├────────────────────────────────────────────────────────┤
│ Variant:    ⓘ fp16 (6.9 GB, 推荐)                       │
│             ◯ int8  (3.5 GB, 质量轻微下降)              │
│             ◯ Q4_K_M (1.8 GB, 显著加速)                 │
│                                                          │
│ VRAM 要求:  fp16 → 8 GB（你有 12 GB ✓）                │
│ 磁盘需求:   6.9 GB + 1.5 GB 缓存 = 8.4 GB              │
│ 预计下载:   约 12 分钟（按当前 10 MB/s）                │
│                                                          │
│ [取消]                              [开始下载 8.4 GB]    │
└────────────────────────────────────────────────────────┘
```

**强制规则**：

```
✓ recommended 标记的档默认选中
✓ minVram > available VRAM 的档灰显并标"VRAM 不足"
✓ 必须显式呈现，不允许藏到"高级选项"
```

#### Sparse Selector（合集包专属）

```
┌────────────────────────────────────────────────────────┐
│ Install: Cyberpunk LoRA Pack (50 LoRAs, 25 GB total)    │
├────────────────────────────────────────────────────────┤
│ ✓ neon-city-v2          512 MB  ⓘ                       │
│ ✓ rain-effect-v3        480 MB  ⓘ                       │
│ ◯ holographic-ui        510 MB  ⓘ                       │
│ ✓ retro-vehicles        490 MB  ⓘ                       │
│ ◯ ...                                                    │
│                                                          │
│ 已选 14 / 50  →  6.8 GB                                 │
│ [全选]  [推荐]  [清空]    [安装 6.8 GB]                 │
└────────────────────────────────────────────────────────┘
```

**强制规则**：

```
✓ 默认选中 = defaultSelected: true 的条目（不要默认全选）
✓ "推荐"按钮 = 选中所有 defaultSelected
✓ 选中数量 + 总大小实时更新
✓ 单击条目可看详情（thumbnail / 描述）
```

#### Proxy Upgrade UI

```
当编辑器调 ensureFull() 触发：

┌────────────────────────────────────────────────────────┐
│ Upgrading proxy → full quality                          │
├────────────────────────────────────────────────────────┤
│ neon-cinematic-lut.cube                                 │
│ Proxy (Low) → Original (12.5 MB)                        │
│ ████████████░░░░░░░░  64%   2.3s 剩余                   │
│ [取消（保持 Proxy）]                                     │
└────────────────────────────────────────────────────────┘
```

#### 进度 / 续传 / 网络断开

```
下载进度条      显式百分比 + 已下载 / 总大小 + 速度 + ETA
暂停按钮        每次下载必须暴露
网络断开        自动暂停 + 显示 "已暂停，等待网络…"
失败重试        最多 3 次自动重试，之后用户手动
完整性失败      必须重新下载（不允许 partial 加 SRI 半通过）
```

#### Sparse 包后续追加下载

用户首次只选了 14/50，之后想追加：

```
Market 详情页 → "管理子项"
→ 重新呈现 Sparse Selector
→ 已下载条目显示 ✓ 已装，不可再选（或可"重下载"）
→ 未下载条目可勾选追加
→ 单独走 mini install 流水
```

---

## 七、安装生命周期

### 7.1 8 阶段状态机

```
discover ──► resolve ──► preflight ──► fetch ──► verify ──► stage ──► activate ──► record
   │           │            │            │         │          │          │           │
   │           │            │            │         │          │          │           │
   ▼           ▼            ▼            ▼         ▼          ▼          ▼           ▼
错误任一阶段触发 rollback：逆向调用各阶段的 onRollback() 钩子，清理已产生的副作用。
```

| 阶段 | 责任 | 必有 | 备注 |
|---|---|---|---|
| `discover` | 拉取 server 上的 manifest（getPackage） | ✅ | 缺包直接失败 |
| `resolve` | 递归解析 dependencies + bundle.contents，构建装机图 | ✅ | 依赖图遍历 + 环检测 |
| `preflight` | TrustGate / Quota / Conflict / Compatibility 检查 | ✅ | 任何一项不过 → 不下载 |
| `fetch` | 下载（archive）或跳过（orchestration / registration） | ⚠️ | 按 distributionKind 分发 |
| `verify` | SRI 完整性 + 签名 presence check | ⚠️ | archive 必校验，其他可跳过 |
| `stage` | 解包（archive）/ 注册表写入（registration）/ 不动作（orchestration） | ✅ | 按 distributionKind 分发 |
| `activate` | EffectsManifest 注册 → tools / providers / runtimes / effects / commands | ✅ | 副作用统一在此 |
| `record` | 写入 InstalledRegistry 持久化 | ✅ | 最后步，事务边界 |

### 7.2 DistributionKind 在生命周期里的差异

```
                    fetch    verify   stage              activate
archive             下载     SRI      tar -xzf 到目录    EffectsManifest 注册
orchestration       skip     skip     skip               递归触发子包安装 + 写入 bundle 记录
registration        skip     skip     写入子注册表       注册到对应运行时（如 LLM Router）
```

### 7.3 InstallTarget 生命周期钩子

每个 InstallTarget 可声明 `onRollback(state)`：

```typescript
export interface IInstallTarget<T extends AssetType = AssetType> {
  readonly type: T;
  getInstallPath(manifest: AssetManifest): string;
  validateManifest?(manifest: AssetManifest): void | Promise<void>;
  /** Run before fetch — use for quota / conflict / external precondition */
  onPreInstall?(manifest: AssetManifest): Promise<void>;
  /** Required during stage for distributionKind='registration'. */
  writeRegistration?(manifest: AssetManifest, installedPath: string): Promise<void>;
  /** Run after stage and EffectsManifest activation — hot-reload runtimes */
  onPostInstall?(manifest: AssetManifest, installedPath: string): Promise<void>;
  /** Run before file removal — unregister effects */
  onPreUninstall?(manifest: AssetManifest, installedPath: string): Promise<void>;
  /** Run on lifecycle failure — clean partial side-effects */
  onRollback?(manifest: AssetManifest, partial: Partial<InstallState>): Promise<void>;
}
```

延后到 P2 的钩子：`onActivate` / `onDeactivate` / `onUpdate(from, to)` / `onMigrate` / `onHealthCheck`。

### 7.4 大素材在 8 阶段中的分支

承接 §五.8，大素材的 install 在 8 阶段主流程基础上加分支处理。

#### preflight 阶段额外检查

```
基础检查（已有）：
  · Trust gate（trustLevel 闸门）
  · Conflict detection（manifest.effects.conflicts）
  · Dependency resolution（递归装 contents）
  · Compatibility（nekoSuiteVersion / engineVersion）

大素材额外检查：
  · totalSize > availableDiskSpace × 0.9      → 拒绝
  · totalSize > 5GB AND no resumable URL      → 警告但允许
  · variants 模式且 minVram > available VRAM  → 强制选低档（弹 picker）
  · 已有更高态版本（已是 full，又装 proxy）    → 提示降级风险
  · entitlement.allowed === false              → 拒绝（与 §九.6 ExpiryEvaluator 协作）
```

#### stage 阶段按 modes 分发

```
modes: ['eager']
  → 整包下载到 install path（现状默认行为）

modes: ['sparse']
  → 仅下载 manifest + thumbnails + index 文件
  → 弹 SparseSelector UI 让用户标记 selectedItems
  → 进入 partial-download 子流程：每个选中项目独立 mini-install

modes: ['proxy']
  → 下载 default proxy variant
  → 后续 ensureFull() 触发完整版升级（走相同 8 阶段，跳过 discover）

modes: ['variant']
  → 弹 VariantPicker UI
  → 用户选完只下载选中 variantId

modes: ['delta']
  → 检查本地是否有 deltaBase.version
  → P0：请求 delta descriptor 后下载 full fallback 并校验 SRI
  → P1：有本地基线时下载 delta + apply patch（xdelta3/bsdiff/rsync）
  → 无 → fallback 到 eager full
```

modes 可组合：

```
['eager', 'delta']            首次 eager，后续 delta 升级
['sparse', 'proxy']            清单选 + 选中后 proxy 先到
['variant', 'delta']           model 专用：选档 + 后续 delta
```

#### 子下载走 mini 8 阶段

每个 sparse 子项目 / proxy upgrade / variant download **复用相同 8 阶段，但跳过 discover/resolve**：

```
完整流程（首次安装包）：
  discover → resolve → preflight → fetch → verify → stage → activate → record

mini 流程（包内子项目）：
  (skip discover/resolve)  → preflight → fetch → verify → stage → activate → record-update

差异：
  · discover: 已经有 manifest，不重复拉
  · resolve:  依赖已经在父 install 时解决
  · record:   不创建新 InstalledPackage，而是更新现有 record 的 partial 状态
```

#### activate 阶段的延迟激活

大素材 sparse 模式下，**activate 不在父 install 时全量执行**：

```
父 install 完成 record → manifest-only 状态 → 不调 onPostInstall
每个子项目下载完 record-update → 该子项 activate（onPostInstall 局部）

理由：
  · 防止 activate 时引用未下载的子项目
  · 让 onDidInstall 事件按子项目颗粒度发出（消费扩展可增量加载）
```

#### rollback 时的清理

```
完整安装 rollback        删 install path 整个目录 + InstalledRegistry remove
sparse 部分子项 rollback  仅删失败的子项 + 父 record 的 selectedItems 缩减
proxy upgrade rollback    保留 proxy 不变，仅删失败的 full payload
delta 失败 rollback        保留旧版本，不切换
```

---

## 八、协议接口

### 8.1 IMarketClient

```typescript
export interface IMarketClient {
  /** Search packages with sort / filter */
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;
  /** Get full package detail */
  getPackage(packageId: string): Promise<MarketPackage | undefined>;
  /** Get all versions of a package */
  getVersions(packageId: string): Promise<MarketPackageVersion[]>;
  /** Get pre-signed download URL */
  getDownloadUrl(packageId: string, version: string): Promise<string>;
  /** Featured / trending / recent / free feeds (server sort param) */
  getFeatured(type?: AssetType): Promise<MarketPackage[]>;

  // === Auth & entitlement (NEW) ===
  /** Inject Bearer token from neko-auth */
  setAuthToken(token: string | null): void;
  /** List user-owned entitlements */
  listEntitlements(): Promise<Entitlement[]>;
  /** Check whether user can install a paid package */
  checkEntitlement(packageId: string, version: string): Promise<EntitlementCheck>;
  /** Build deep-link to server purchase page */
  getCheckoutUrl(packageId: string, returnTo?: string): Promise<string>;
}

export interface MarketSearchQuery {
  text?: string;
  types?: AssetType[];
  category?: AssetCategory;
  tags?: string[];
  visibility?: ('public' | 'shared' | 'paid')[];
  sort?: 'featured' | 'trending' | 'created' | 'downloads' | 'rating';
  pricing?: 'free' | 'paid' | 'all';
  limit?: number;
  offset?: number;
}
```

### 8.2 IInstallManager

```typescript
export interface IInstallManager {
  /** Install with full lifecycle (fires progress events through 8 stages) */
  install(packageId: string, version: string, onProgress?: InstallProgressCallback): Promise<InstallResult>;
  /** Reverse install via EffectsManifest */
  uninstall(packageId: string): Promise<void>;
  /** Update = uninstall + install (P2 will support delta) */
  update(packageId: string, targetVersion: string, onProgress?: InstallProgressCallback): Promise<InstallResult>;
  /** Toggle without uninstall — runs activate / deactivate */
  enable(packageId: string): Promise<void>;
  disable(packageId: string): Promise<void>;
  /** List installed (with filters) */
  listInstalled(): Promise<InstalledPackage[]>;
  /** Diff installed vs latest available */
  checkUpdates(): Promise<UpdateInfo[]>;
  /** Cancel an in-flight package or large-asset download */
  cancelInstall?(packageId: string): boolean;
}

export interface InstallProgress {
  packageId: string;
  /** 8-stage state */
  phase: 'discover' | 'resolve' | 'preflight' | 'fetch' | 'verify' | 'stage' | 'activate' | 'record' | 'rollback' | 'done' | 'error';
  /** 0-100 within current phase */
  percent: number;
  error?: string;
}
```

### 8.3 IInstallTarget（含 §7.3 钩子全集）

参见 §7.3 完整定义。

### 8.4 ILicenseManager（client 调用方）

```typescript
export interface ILicenseManager {
  /** Returns server-computed entitlement verdict — client never recomputes */
  verify(manifest: AssetManifest): Promise<{ allowed: boolean; reason?: string }>;
  /** List all entitlements (cached, 5min TTL) */
  listEntitlements(forceRefresh?: boolean): Promise<Entitlement[]>;
  /** Build deep-link to server checkout page */
  buildCheckoutUrl(packageId: string, returnTo?: string): Promise<string>;
}
```

### 8.5 ICacheManager / IVersionResolver

保持现状不变（参见现有实现）。

---

## 九、安装目标实现（v4：11 种 type，11 个 InstallTarget）

> **plugin / shader 治理权威文档**：[marketplace-plugin-governance.md](./marketplace-plugin-governance.md)
> 包含 native-only plugin trust tier、声明性 permission、host-api audit、防盗版 8 战术、Workspace Trust 本机权威 store、server-side compilation pipeline、Engine 内 license 闸门和 sideload 治理等完整定义。
> 本节仅给出 InstallTarget 概览，治理细节以独立文档为准。

### 9.1 InstallTarget 全集

| Target | Type | DistributionKind | 路径 / 注册位置 | Stage 行为 | Activate 行为 |
|---|---|---|---|---|---|
| `MediaInstallTarget` | `media` | `archive` | `~/.neko/media/{mediaKind}/{publisher}/{name}/` | 解包到媒体库 | AssetLibrary 索引 + Federation probe |
| `StarterInstallTarget` | `starter` | `archive` | `~/.neko/starters/{targetEditor}/{name}/` | 解包到模板目录 | 注册到 New Project 向导 |
| `IdentityInstallTarget` | `identity` | `archive` | `~/.neko/identities/{identityId}/` | 解包 + 调 Federation | 注册到 IdentityRegistry |
| `ModelInstallTarget` | `model` | `archive` | `~/.neko/models/{framework}/{name}/` | 解包模型权重 | pickRuntime 路由（Ollama/ComfyUI/ONNX/Python） |
| `EndpointInstallTarget` | `endpoint` | `registration` | `~/.neko/endpoints/{provider}/{name}.json` | 写注册条目 + 弹凭证表单 | 注册到 LLM Router / Endpoint Registry |
| `ProviderInstallTarget` | `provider` | `archive` | `~/.neko/providers/{providerId}/` | 解包 ProviderCard | 注册到 ProviderRouter |
| `SkillInstallTarget` | `skill` | `archive` | `~/.neko/skills/{publisher}/{name}/` | 解包 SKILL.md + 资源 | 触发 SkillService 热加载 |
| `PluginInstallTarget` | `plugin` | `archive` | `~/.neko/plugins/{publisher}/{name}/` | 解包 cdylib + manifest，校验 targetTriple | 交给 neko-engine PluginManager 执行完整性 / 签名 / license / trust / workspace 闸门后 dlopen |
| `ShaderInstallTarget` | `shader` | `archive` | `~/.neko/shaders/{shaderKind}/{publisher}/{name}/` | 解包 WGSL/GLSL | 注册到 EffectDispatcher |
| `PresetInstallTarget` | `preset` | `archive` | `~/.neko/presets/{presetKind}/{publisher}/{name}/` | 解包配置文件 | 通知对应消费扩展（LUT 面板 / 转场选择器 / Memory Router / ...） |
| `BundleInstallTarget` | `bundle` | `orchestration` | `~/.neko/bundles/{publisher}/{name}/` (仅 manifest) | 解析 contents | 递归 install 子包，引用计数 +1 |

**与 v3（21 种 type / 15 个 Target）对比**：

```
v3 → v4 InstallTarget 重整
─────────────────────────────────────────────────────
原 11 已实现 + 计划 4 新增 = 15 个 → v4 共 11 个 (-4)

合并：
  4 个媒体类（隐式 video/audio/image/sequence Target，原本未单列）+ PuppetMotionInstallTarget
    → MediaInstallTarget × 1
  ShaderInstallTarget × 2 (shader / shader-preset)
    → ShaderInstallTarget × 1，shaderKind 区分
  ModelInstallTarget × 3 (ai-model / lora / embedding)
    → ModelInstallTarget × 1，modelKind 区分
  PresetInstallTarget × 3 (preset / template / lut)
    → PresetInstallTarget × 1，presetKind 区分

重命名（无逻辑变化）：
  ProviderCardInstallTarget       → ProviderInstallTarget
  ProjectTemplateInstallTarget    → StarterInstallTarget
  ServiceEndpointInstallTarget    → EndpointInstallTarget
  IdentityPackInstallTarget       → IdentityInstallTarget

新增（v3 未实现）：
  PluginInstallTarget             （v3 漏了）
  BundleInstallTarget
```

### 9.2 Bundle 卸载的引用计数

```
卸载 bundle B：
  for each content in B.contents:
    refCount[content.packageId] -= 1
    if refCount == 0 AND no other bundle owns it:
      uninstall(content.packageId)    ← 真正卸载
    else:
      keep installed                   ← 其它 bundle 仍依赖
```

引用计数表持久化在 `~/.neko/market-installed.json` 的 `refs` 字段。

### 9.3 Endpoint 凭证存储

凭证**永不进 manifest**，安装时弹表单 → 用户填 → 通过 [neko-auth](docs/architecture/marketplace.md) 的 `keytar` 存储。endpoint 注册条目只存 `endpointTemplate` 和 `credentialRef`（指向 keytar 条目名）。

### 9.4 InstallTarget 归属边界（X 类 vs Y 类）

11 个 InstallTarget **不应该都住在 neko-market**。按"是否真的需要领域知识"二分：

#### X 类（4 个，永久留 neko-market）

```
MediaInstallTarget      拷贝媒体文件，无领域逻辑
StarterInstallTarget    复制工程模板，无领域逻辑
PresetInstallTarget     拷贝配置 JSON，按 presetKind 通知不同消费者（事件出口而非业务入口）
BundleInstallTarget     纯编排，本身无业务
```

X 类不读领域 schema、不 import 任何子包类型即可完成安装，**永久住在 `packages/neko-market/extension/src/targets/`**。

#### Y 类（7 个，渐进迁移到对应子包）

| Target | 当前位置 | 目标位置 | 迁移理由 |
|---|---|---|---|
| `SkillInstallTarget` | `neko-market` | `neko-agent` | SkillService 在 neko-agent，热加载逻辑在那 |
| `PluginInstallTarget` | `neko-market`（待新建） | `neko-tools` 或 PluginHost | 动态 require 必须由 host 持有 |
| `ShaderInstallTarget` | `neko-market` | `neko-cut` 或 shared shader 包 | EffectDispatcher / 材质管线在那 |
| `IdentityInstallTarget` | `neko-market` | `neko-assets`（AssetFederationRegistry 所在包） | IdentityRegistry 注册由 Federation 持有 |
| `EndpointInstallTarget` | `neko-market` | `neko-agent` | LLM Router / Endpoint Registry 在那 |
| `ProviderInstallTarget` | `neko-market` | `neko-agent` | ProviderRouter 在那 |
| `ModelInstallTarget` | `neko-market` | `@neko/model-runtime` | `pickRuntime` 路由已经在那 |

Y 类**必须 import 子包类型**才能完成 onPostInstall，留在 neko-market 等于让 neko-market"知道每种 type 的领域语义"——违反协议层应当无知的纪律。

#### 判定守则（一句话）

```
写 InstallTarget 时，如果 import 了任何 @neko/agent / @neko-engine / @neko/cut / @neko/canvas / ... 的领域类型
→ 它属于 Y 类，必须搬到对应子包；
否则
→ 它属于 X 类，留 neko-market。
```

迁移完成的标志：**`neko-market/extension/` 的 `package.json` 不依赖任何 `@neko/{agent,cut,model,sketch,puppet,canvas,story,assets}` 子包**。

### 9.5 贡献协议契约

Y 类 Target 通过"两阶段发现"贡献到 neko-market（与 [AgentCapabilityProvider](docs/architecture/agent-unified-workflow.md) / [AssetHandler](docs/architecture/adr-asset-federation.md) 同形）。

#### Stage 1：Registration（静态声明）

子包在 `package.json` 声明：

```jsonc
{
  "contributes": {
    "neko.installTargets": [
      { "type": "skill",    "activationEvent": "onInstallType:skill" },
      { "type": "endpoint", "activationEvent": "onInstallType:endpoint" },
      { "type": "provider", "activationEvent": "onInstallType:provider" }
    ]
  },
  "activationEvents": [
    "onInstallType:skill",
    "onInstallType:endpoint",
    "onInstallType:provider"
  ]
}
```

neko-market 启动期扫描所有装机扩展的 `contributes.neko.installTargets`，建立 `type → extensionId` 映射表（**仅记 id，不激活**）。

#### Stage 2：Activation（按需激活）

```typescript
// neko-market/InstallManager
async function dispatchTo(manifest: AssetManifest): Promise<IInstallTarget> {
  const target = builtinTargets.get(manifest.type);  // X 类直接返回
  if (target) return target;

  // Y 类：按 contributes 表激活对应子包
  const ext = contributedTargets.get(manifest.type);
  if (!ext) throw new Error(`No InstallTarget for type: ${manifest.type}`);

  await vscode.extensions.getExtension(ext.id)?.activate();   // 触发 activationEvent
  const live = registeredTargets.get(manifest.type);          // 子包激活时已自注册
  if (!live) throw new Error(`Extension ${ext.id} did not register InstallTarget for ${manifest.type}`);
  return live;
}
```

#### 子包侧 boilerplate

```typescript
// e.g. neko-agent/extension.ts
import type { NekoMarketAPI } from '@neko/market-api';

export async function activate(ctx: vscode.ExtensionContext) {
  const market = vscode.extensions.getExtension<NekoMarketAPI>('neko.neko-market')?.exports;
  if (!market) return;  // marketplace 未装，子包仍可独立运行

  const skillTarget    = new SkillInstallTarget(skillService);
  const endpointTarget = new EndpointInstallTarget(llmRouter);
  const providerTarget = new ProviderInstallTarget(providerRouter);

  ctx.subscriptions.push(
    market.registerInstallTarget(skillTarget),
    market.registerInstallTarget(endpointTarget),
    market.registerInstallTarget(providerTarget),
  );
}
```

`registerInstallTarget` 返回 `vscode.Disposable`，子包退出时自动反注册。

#### 协议契约的 5 条不变量

```
① 同一个 type 只能有一个贡献者（neko-market 检测重复并拒绝）
② 贡献者必须实现 IInstallTarget 完整接口（含 onRollback）
③ 激活失败（throw）→ market 取消该次 install，向用户报具体错误（不降级到默认 Target）
④ 子包退出 → unregister，market 该 type 进入 "未安装贡献者" 状态，详情页显示
   "需要安装扩展 ${extensionId} 才能装这类资产"
⑤ X 类与 Y 类不重叠：同一 type 不能既是 builtin 又是 contributed
```

#### 激活事件命名规范

```
onInstallType:{type}        装某 type 时引爆
onInstallKind:{type}.{kind} 可选，按 kind 二级引爆（用于一个 type 的不同 kind 由不同子包处理）

示例：
  onInstallType:shader              → neko-cut（默认）
  onInstallKind:shader.material     → neko-model（覆盖：3D 材质走专用 Target）
```

第二行的覆盖机制让"同 type 跨子包分工"成为可能（如 shader 在 cut 是滤镜、在 model 是材质），但**默认情况一个 type 一个贡献者足够**，只在确有必要时启用 kind 级覆盖。

### 9.6 ExpiryEvaluator 与 Grace Period

承接 §五.7（schema）和 §六.10（UI），本节描述 5 类过期的处理机制。

#### 9.6.1 InstalledPackage 状态扩展

```typescript
export interface InstalledPackage {
  // ... 现有字段（packageId / version / type / installedAt / installedPath / manifest / enabled）...

  /** 综合过期状态（计算字段，由 ExpiryEvaluator 维护） */
  status: 'active' | 'expiring-soon' | 'expired' | 'incompatible' | 'deprecated';

  /** License 过期时间（来自 server entitlement） */
  expiresAt?: number;

  /** Grace 期限（A 类专用，过此点删文件） */
  graceEndsAt?: number;

  /** 上次成功使用时间（E 类驱动） */
  lastUsedAt?: number;

  /** 兼容性问题记录（B 类） */
  compatibilityIssue?: { detectedAt: number; reason: string; suggestedAction?: string };
}
```

#### 9.6.2 status 派生规则（按优先级）

```
1. expiresAt < now             → 'expired'        (A)
2. compatibilityIssue 存在      → 'incompatible'   (B)
3. manifest.deprecation 存在    → 'deprecated'     (C)
4. expiresAt - now < 7 days    → 'expiring-soon'  (A 提前预警)
5. else                        → 'active'
```

A/B/C 三类**互斥**，按优先级取一个结果。D/E 不进 status（D 是缓存层 / E 是用户面板）。

#### 9.6.3 5 类处理策略对照

```
                  禁用？     自动删？        责任方
A. License         ✓         延后(grace)    server entitlement 权威
B. 兼容性          ✓         ✗              client 自检
C. Curation       ✗         ✗              server 标注
D. 缓存            N/A       ✓ (LRU)        client 自治
E. 闲置            ✗         用户手动        用户决定
```

**核心原则**："过期 = 删除"是常见误解，5 类里**只有 D 该自动删**。

#### 9.6.4 Grace Period（A 类专属）

License 到期后**不立即删除**：

```
T0              expiresAt        license 到期，UI 切 'expired'
                                  立即硬禁用（运行时不再加载）
T0 + 7 天        gracePeriod      仍保留文件，用户可一键续费
                                  Detail 页提示 "续费即恢复，无需重新下载"
T0 + 30 天       hardCleanup      默认清除文件
                                  用户可在 settings 改为 90 天 / 永不清
T0 + 90 天       maxRetention     强制清理（避免无限堆积）
```

**默认值（用户可调）**：

```
graceLength: 7 天
hardCleanupAfter: 30 天
maxRetention: 90 天
```

**特例规则**：

```
> 5 GB 的素材           延宽期减半（避免长期占用大空间）
AI 模型                  延宽期翻倍（重新下载成本大）
整 bundle 内 contents    各自独立，不连带
```

#### 9.6.5 ExpiryEvaluator 中间件

```typescript
class ExpiryEvaluator {
  /** 启动时：从 server 拉一次 entitlement，更新所有已装包的 status */
  async refreshAll(): Promise<void>;

  /** 周期性（每小时）轻量校验：检查 expiresAt < now，触发状态切换 */
  async tick(): Promise<void>;

  /** 单次激活前：preflight 阶段调用，过期则拒绝 */
  evaluate(packageId: string): ExpiryStatus;

  /** Grace 检查：到 hardCleanupAfter 时清文件 */
  async runCleanup(): Promise<CleanupReport>;

  /** 触发事件：状态切换时通知 UI */
  readonly onStatusChange: vscode.Event<{ packageId: string; from: Status; to: Status }>;
}
```

**触发点**：

```
1. neko-market activate 时              → refreshAll（一次拉取）
2. 每 1 小时定时                          → tick（轻量本地校验）
3. server entitlement webhook 通知       → 立即 refreshAll
4. 用户点详情页 "刷新" 按钮              → refreshAll
5. 包激活时（onPostInstall / 调用前）     → evaluate
6. 每天 04:00 后台                        → runCleanup
```

#### 9.6.6 与 8 阶段生命周期的衔接

过期不进 §七 主流程，但与之交互：

```
8 阶段安装时：
  preflight 阶段加 ExpiryEvaluator.evaluate
    → 已 expired 的依赖（bundle.contents）拒绝安装

激活时：
  status === 'expired' || 'incompatible' → 不让消费扩展加载
  status === 'deprecated'                → 加载 + 触发 UI 警告

卸载时：
  正常 8 阶段反演（与现状一致）
  + ExpiryEvaluator 清除该 packageId 的状态记录

更新时（uninstall + install）：
  目标版本若 incompatible → 拦在 preflight，不卸老版
```

#### 9.6.7 Bundle 过期：独立而非连带

```
方案 1  整体过期    bundle license 过期 → contents 一起停    × 否决
方案 2  独立过期    contents 各自有 license              ✓ 采纳
方案 3  混合        二者乘积                            × 复杂
```

**采纳方案 2** 的理由：

```
✓ 用户买"赛博朋克套装"是为了 50 件具体素材
✓ Bundle 失效但 contents 还在用 → 体验合理
✓ Server 端各 content 独立颁发 entitlement
✗ 唯一例外：组合定价折扣
   → 处理：server 把"3 折"折扣视为 bundle 自身的"组合 entitlement"
            过期后 contents 仍可用，但下次续费按原价
```

Bundle 自身的 manifest **不影响 contents 的 license 状态**——它只是"采购单"，不是"准入凭证"。

#### 9.6.8 D 类缓存预算

```
缓存类型                    位置                              默认预算   清理策略
market-cache (下载缓存)      ~/.neko/market-cache/             5 GB       LRU
stock-cache  (云端 stock)    ~/.neko/local/stock-cache/        2 GB       LRU + 7 天 TTL
ai-cache     (AI 生成缓存)   ~/.neko/local/ai-cache/           不限       用户 keep / drop 决定
embedding-cache              engine 数据目录                    1 GB       LRU
thumbnail-cache              ~/.neko/local/thumbnails/         500 MB     LRU
```

写入时检查总量 → 超预算逐出最旧条目 → 不阻塞当前操作。Settings 暴露各 sub-cache 预算 + "Clear all caches" 按钮 + 实时用量。

#### 9.6.9 Server 契约新增

```
GET  /api/v1/me/entitlements                    现有，扩 expiresAt 字段
GET  /api/v1/me/entitlements/changes            新增，差量同步（ETag）
POST /api/v1/me/entitlements/refresh            新增，强制刷新
GET  /api/v1/packages/:id/deprecation           新增，C 类元数据查询
WS   /api/v1/me/entitlements/stream             可选，实时推送（避免轮询）
```

**Server 端新增不变量**：

```
⑦ entitlement 必带 expiresAt（无限期则用 0 / null 表示）
⑧ deprecation 必带 since 时间戳，replacedBy 必经合法 packageId 校验
⑨ 删除 entitlement（退款 / 撤销）必通过 webhook 立即推 client，不靠下次轮询
```

---

## 十、跨切关注（中间件链路）

### 10.1 链路组合

```
InstallPipeline = [
  TrustGateMiddleware,         // 横切：trustLevel 闸门（core / community / untrusted）
  QuotaCheckMiddleware,        // 横切：VRAM / 磁盘 / 端口
  ConflictResolveMiddleware,   // 横切：冲突 / 互斥
  DependencyResolveMiddleware, // 横切：递归装依赖（基于 5.5 BundleContent / AssetDependency）
  TypeSpecificTarget,          // 类型特化：11 个 InstallTarget
  TelemetryMiddleware,         // 横切：上报（可选）
]
```

InstallManager 按顺序执行。任一中间件 reject → 触发 rollback，逆序回滚。

### 10.2 TrustGate 规则

```
trustLevel: 'core'        任何分类，任何 distributionKind
trustLevel: 'community'   任何分类；endpoint 需 publisher 实名
trustLevel: 'untrusted'   仅 media 分类（纯数据，含 starter / identity 中的纯素材部分）
                          禁止 tooling / ai (endpoint 除外，凭证由用户手填) / bundle
                          每次激活提示用户确认
                          sideload 特例由 plugin-governance §十九按 type 控制：
                          copy-managed 本地资产位于 ${NEKO_HOME}/local，
                          native plugin 仍必须 dev-mode + trusted workspace
```

理由：tooling 会执行代码、ai 会消耗 GPU/付费 API、bundle 会拉级联，三者都不能给 untrusted 通道。

### 10.3 Quota 检查

读取 `manifest.effects.resources`：

```
vramMB    检查 GpuResourceManager 当前可用 VRAM 是否够
diskMB    检查目标磁盘可用空间
ports     检查端口可用性
```

超出预算 → 提示用户 + 可选"忽略并继续"。

### 10.4 Conflict 解析

```
显式冲突：manifest.effects.conflicts: ['@a/b', '@c/d']
隐式冲突：
  - provider 同 providerId 多张激活
  - endpoint 同 endpoint URL 重复
  - shader 同 effect id
  - identity 同 identityId 多包
```

冲突时给用户三个选项：放弃安装 / 卸载冲突方 / 强制装但禁用旧的。

---

## 十一、与 Server 的契约

> **完整契约权威文档**：[registry-server-contract.md](./registry-server-contract.md)
> 本节仅给出概要；所有 HTTP 端点 / 字段 / 约束以契约文档为准。

### 11.1 概要

```
client (本仓)                neko-registry-server (独立仓)
──────────────              ──────────────────────────────
装 / 说 / 管                  发 / 审 / 签 / 卖 / 代理
   │                              │
   └── HTTP only ─────────────────┘
       Authorization: Bearer <token from neko-auth>
```

### 11.2 五大端点组（概览）

```
Discovery       搜索 / 详情 / 版本 / 推荐
Sort & Search   排序参数 / facet 范围 / vector 混合排序
Download        预签名 URL / sparse-manifest / variants / proxy / delta
Entitlement     已购列表 / 校验 / 续费 deep-link / 实时推送
Curation        deprecation 元数据 / ontology 受控词汇表
```

完整签名见 [registry-server-contract.md §三](./registry-server-contract.md)。

### 11.3 13 条 Server 不变量（概览）

```
①-⑥   现有（v3.2 锁定）：manifest 最终形态 / SRI / signature / trustLevel / effects / bundle
⑦-⑨   过期（v3.3）：     entitlement.expiresAt / deprecation 校验 / webhook 推送
⑩-⑬   语义/向量/大素材（v3.4）：ontology 校验 / 受控词汇表 / embedding 三件套 / totalSize
```

完整定义见 [registry-server-contract.md §四](./registry-server-contract.md)。

### 11.4 不在本契约范围

以下属于 server 内部实现，对 client 完全透明：

```
✗ Publisher Portal / Upload API
✗ Review Queue / Signature Generation
✗ Upstream Proxy（HF / Civitai）
✗ Payment Processing / Webhook 内部
✗ Search Index / CDN 选型 / 数据库 schema
✗ Ontology 受控词汇表的 CRUD 与版本演进
```

详见独立项目 `neko-registry-server` 的 `README.md` 以及 [registry-server-contract.md §六](./registry-server-contract.md)。

### 11.5 历史详细内容（已迁移）

v3.4 及之前 §十一 包含完整 HTTP 端点 + 不变量定义。这部分已全量迁移到 [registry-server-contract.md](./registry-server-contract.md)：

```
原 §11.1（端点列表）   → registry-server-contract.md §三 API 端点
原 §11.2（13 条不变量）→ registry-server-contract.md §四 Server 必须保证的不变量
原 §11.3（Server 文档指针）→ registry-server-contract.md §六 不在本契约范围
```

后续维护以契约文档为准。本节保留迁移记录便于历史追溯。

---

## 十二、与现有系统的关系

### 12.1 职责边界

**工具型资产**（Shader / AI 模型 / Preset）由 neko-market 安装，由消费扩展直接读取，**不经过 neko-assets**：

```
neko-market 安装到 ~/.neko/{shaders|models|presets}/
    ↓ 消费扩展各自扫描目录 / 订阅 NekoMarketAPI 事件
neko-cut（EffectDispatcher / LUT 面板）
neko-agent（ModelManager）
```

**内容素材**（媒体文件 / 文档 / AI 生成内容）由 neko-assets 管理，neko-market 不参与索引。

### 12.2 系统关系表

| 现有系统 | 关系 | 说明 |
|---|---|---|
| AssetManifest | **扩展** | 补充 distributionKind / effects / contents 字段 |
| neko-assets / AssetLibrary | **平行** | 工具型资产不入 AssetLibrary；内容素材不经 market |
| SkillService | **集成** | 市场安装后触发 Skill 热加载（neko-agent 文件监听 + onDidInstall 事件双轨） |
| EffectDispatcher | **集成** | 订阅 `NekoMarketAPI.onDidInstall` 热重载 Shader |
| @neko/model-runtime | **集成** | onPostInstall 自动注册模型到对应运行时（Ollama/ComfyUI/ONNX） |
| neko-auth | **可选集成** | Bearer token 注入，无 neko-auth 时降级为匿名（仅可装免费包） |
| AssetFederationRegistry | **集成** | `identity` 安装触发 IdentityRegistry 注册 |
| Capability Protocol | **集成** | tooling 安装经 CapabilityRegistry 注册 + trustLevel 闸门 |
| ProviderCard | **集成** | `provider` 安装走 [adr-provider-expression-context.md](./adr-provider-expression-context.md) 三层分发的 Layer 1 |

### 12.3 AI 模型部署流程

> 详细架构见 [model-runtime.md](./model-runtime.md)

```
neko-market 安装模型文件 → ~/.neko/models/{framework}/{name}/
    ↓ ModelInstallTarget.onPostInstall()
    ↓ pickRuntime(framework, task)
    ├── GGUF → OllamaRuntime.registerModel() → ollama create
    ├── safetensors (image/video) → ComfyUIRuntime.registerModel() → symlink
    ├── ONNX → EngineOnnxRuntime.registerModel() → EngineClient
    └── safetensors (tts/audio) → PythonRuntime.registerModel()
    ↓
    ↓ GpuResourceManager 记录 VRAM 需求（来自 effects.resources.vramMB）
    ↓
消费扩展使用：
    ├── neko-agent: ComfyUIMediaAdapter / OllamaAdapter（本地优先，VRAM 不足回退云端）
    └── neko-engine: ONNX 模型直接加载到 GPU 管线
```

### 12.4 endpoint 与 provider 的关系

```
endpoint   "在哪调"      存 endpoint URL + credentials ref
provider   "怎么提示"    存 syntax profile + concept coverage（即原 ProviderCard）

二者 M:N
  一个 endpoint 可对多个 provider（同一服务的不同模型档位）
  一个 provider 可适配多个 endpoint（同一档位的多渠道）
```

### 12.5 媒体过期与创作产物完整性

License 过期最棘手的场景是 **media / identity 已被工程引用**。处理纪律：

#### 已渲染产物**永久保留**

```
✓ 用户用过期素材剪了一个广告片，已导出 → mp4 永远是用户的
✓ Canvas 里 shot-node 已生成的 image → 保留
✓ Sketch 里已合成的图层 → 保留
✓ 任何已写盘的 final output 都不被 license 状态影响

理由：用户购买的是"使用权"，使用产生的产物所有权归用户
      license 过期 ≠ 撤销已做出的劳动成果
```

#### 新引用拒绝

```
expired media       → AssetLibrary 隐藏（不能拖到时间线 / 画布）
expired identity    → 角色选择器隐藏（不能新增角色实例）
expired skill       → 聊天框命令失效（不能新调用）
expired LUT         → LUT 面板灰显（不能 apply 到新 clip）
```

#### 现有 timeline 引用的特殊处理

最棘手的中间态：用户两个月前把 expired LUT 应用到了 30 个 clip，现在打开工程：

```
方案 1  自动移除引用      × 破坏用户工作
方案 2  保持引用 + 红色警告  ✓ 采纳
方案 3  本地保留可继续用     × 让 license 形同虚设

采纳方案 2：
  · timeline 上 expired 引用标红（实际 LUT 不再渲染，回到原始画面）
  · 双击 clip → 弹对话框
      [续费 $X / 替换为可用 LUT / 移除引用]
  · 渲染时检查所有引用，任意 expired → 阻止导出 + 列出冲突清单
  · 用户可选"renderWithExpired: true"（高级选项）→ 仅本机预览，不可导出商用
```

#### identity 过期的特殊性

```
identity 含 3D + 2D + voice + bio 等多 forms，每 form 独立 license：
  · 全部过期         → 完整禁用
  · 部分过期（如 voice license 过期但 3D 仍有效）
                    → 角色仍可在 model 编辑器使用，但 voice 触发时回退默认
  · 已作为主角的工程   → 工程级"角色资产授权"提示，不阻止编辑
```

#### 三类 type 不受 license 过期影响（产物天然脱钩）

```
✓ project-template (starter) 一次性消费，已创建工程不受影响
✓ preset (export 导出预设)     已导出文件已写盘
✓ document                     已读过的内容已展示
```

#### 与 Asset Federation 的协作

`identity` 引用走 [adr-asset-federation.md](docs/architecture/adr-asset-federation.md) 的 IdentityRegistry：

```
license 过期 → IdentityRegistry 标该 identityId 为 'expired'
            → 跨包流转拒绝（neko-canvas 不再让 send-to neko-puppet 生效）
            → 但已存在的引用关系图保留（asset-knowledge-graph 不删边）
```

---

## 十三、消费端集成模式

### 13.1 NekoMarketAPI

参见 [packages/neko-market/packages/extension/src/market-api.ts](packages/neko-market/packages/extension/src/market-api.ts):

```typescript
export interface NekoMarketAPI {
  onDidInstall: vscode.Event<MarketAssetEvent>;
  onDidUninstall: vscode.Event<MarketAssetEvent>;
  onDidEnable: vscode.Event<MarketAssetEvent>;
  onDidDisable: vscode.Event<MarketAssetEvent>;
  getInstalled(options?: GetInstalledOptions): Promise<InstalledPackage[]>;
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;
  getFeatured(type?: AssetType): Promise<MarketSearchResult>;
  install(packageId: string, version: string, onProgress?: InstallProgressCallback): Promise<InstallResult>;
  uninstall(packageId: string): Promise<void>;
  checkUpdates(): Promise<UpdateInfo[]>;
  isInstalled(packageId: string): boolean;
}
```

### 13.2 推荐订阅模式

```typescript
// neko-cut 消费端示例
const market = vscode.extensions.getExtension<NekoMarketAPI>('neko.neko-market')?.exports;
if (market) {
  context.subscriptions.push(
    market.onDidInstall((event) => {
      if (event.type === 'shader') {
        effectDispatcher.reloadFromDisk();
      }
      if (event.type === 'preset') {
        const presetKind = event.manifest.typeMetadata?.data.presetKind;
        if (presetKind === 'lut') lutPanel.refresh();
        if (presetKind === 'transition') transitionSelector.refresh();
      }
    }),
    market.onDidUninstall((event) => {
      effectDispatcher.dropById(event.manifest.id);
    }),
  );
}
```

注意 v4 后筛选不再按 type 名（`shader-preset` / `lut`），而是按 `type + metadata.kind` 双轴。

### 13.3 首次启动 fallback

事件订阅只覆盖"运行期变更"。首次启动时消费扩展应**全量扫描**对应目录（如 `~/.neko/shaders/`），把已存在的资产载入。订阅事件后续保持增量同步。

### 13.4 消费扩展三档分类

每个消费扩展按"安装后影响深度"分三档：

```
档 1  纯数据读       不订阅事件，只在打开素材时按路径读盘
        └── neko-engine（GPU 着色 / ONNX 推理）
        └── neko-preview（打开文档）

档 2  列表刷新型     订阅 onDidInstall/onDidUninstall 刷新 UI 选择器
        └── 几乎所有创作扩展的"素材选择器 / 滤镜库 / 动作库 / LUT 列表"

档 3  行为改变型     安装即热加载，不仅刷 UI 还改运行时行为
        └── neko-agent（skill / provider / endpoint / model 都在此档）
        └── neko-tools（plugin 动态 require）
```

档 3 是最重的——必须正确解 `effects.registrations`，否则要么不生效要么漏清。

### 13.5 子包 × AssetType 影响矩阵

每个子包对每种 type 的反应：

| 安装的 type | neko-agent | neko-cut | neko-canvas | neko-model | neko-sketch | neko-puppet | neko-story | neko-assets |
|---|---|---|---|---|---|---|---|---|
| `skill` | ✅ 热加载 SkillService | — | — | — | — | — | — | — |
| `provider` | ✅ 注册 ProviderRouter | — | — | — | — | — | — | — |
| `endpoint` | ✅ 注册 LLM Router | — | — | — | — | — | — | — |
| `model` | ✅ 模型选择器刷新 | ⚪ 生成时使用 | ⚪ 生成时使用 | ⚪ 渲染辅助 | ⚪ 滤镜辅助 | ⚪ 动作辅助 | — | — |
| `plugin` | — | ⚪ 视 contribution | ⚪ 视 contribution | ⚪ 视 contribution | ⚪ 视 contribution | ⚪ 视 contribution | ⚪ 视 contribution | — |
| `shader` (standalone) | — | ✅ EffectDispatcher | — | ✅ 材质 | ✅ 滤镜 | — | — | — |
| `shader` (preset) | — | ✅ 效果库 | — | ✅ 材质预设 | ✅ 滤镜预设 | — | — | — |
| `preset` (lut) | — | ✅ LUT 面板 | — | ⚪ 视口色调 | ✅ 调色滤镜 | — | — | — |
| `preset` (transition) | — | ✅ 转场选择器 | — | — | — | — | — | — |
| `preset` (effect) | — | ✅ 效果面板 | — | — | ✅ 滤镜库 | — | — | — |
| `preset` (export) | — | ✅ 导出对话框 | — | ✅ 导出对话框 | ✅ 导出对话框 | ✅ 导出对话框 | — | — |
| `preset` (memory) | ✅ Memory Router | — | — | — | — | — | ✅ 风格库 | — |
| `preset` (theme/keybinding/convention) | — | ✅ 视口 | ✅ 视口 | ✅ 视口 | ✅ 视口 | ✅ 视口 | ✅ 视口 | — |
| `media` (video/audio/image) | — | ✅ 资产面板 | ✅ 引用素材 | ✅ 贴图 | ✅ 笔刷/参考 | — | — | ✅ 索引 |
| `media` (3d-model) | — | — | — | ✅ 3D 资产库 | — | — | — | ✅ 索引 |
| `media` (puppet-motion) | — | — | — | — | — | ✅ 动作库 | — | ✅ 索引 |
| `media` (document) | — | — | — | — | — | — | ✅ 引用 | ✅ 索引 |
| `starter` (cut/canvas/model/sketch/puppet/story) | — | ✅ New Project | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `identity` (3d-rigged) | ⚪ Agent 引用 | — | ✅ 角色选择器 | ✅ 角色选择器 | — | — | ⚪ Cast | ✅ 索引 |
| `identity` (2d-puppet) | ⚪ Agent 引用 | — | ✅ 角色选择器 | — | ⚪ 参考 | ✅ 角色选择器 | ⚪ Cast | ✅ 索引 |
| `identity` (portrait/voice/bio) | ⚪ Agent 引用 | — | ✅ Cast | — | ✅ 参考 | — | ✅ Cast | ✅ 索引 |
| `bundle` | — | — | — | — | — | — | — | — |

```
✅ = 必须反应（订阅 onDidInstall）
⚪ = 间接消费（按需读盘，不必订阅）
—  = 不相关
```

读法：**bundle 自身**不反应（它是编排），但其 `contents` 各自触发其它行的 ✅。

### 13.6 ContributionRegistry 标准模板

每个消费扩展应该长成这一份模板（举 neko-cut 为例）：

```typescript
class CutMarketBridge implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  // 子包内部按"用途位置"分桶，UI 各自订阅
  readonly luts          = new ContributionRegistry<LutContribution>();
  readonly shaders       = new ContributionRegistry<ShaderContribution>();
  readonly transitions   = new ContributionRegistry<TransitionContribution>();
  readonly effects       = new ContributionRegistry<EffectContribution>();
  readonly exportPresets = new ContributionRegistry<ExportPresetContribution>();
  readonly starters      = new ContributionRegistry<StarterContribution>();

  async activate(market: NekoMarketAPI) {
    // 1) 首次全量同步（启动 fallback）
    const installed = await market.getInstalled();
    for (const pkg of installed) this.absorb(pkg);

    // 2) 后续增量
    this.disposables.push(
      market.onDidInstall((event) => this.absorb(event)),
      market.onDidUninstall((event) => this.evict(event)),
      market.onDidEnable((event) => this.absorb(event)),
      market.onDidDisable((event) => this.evict(event)),
    );
  }

  private absorb(event: { manifest: AssetManifest; installedPath: string }) {
    const m = event.manifest;
    switch (m.type) {
      case 'preset': {
        const kind = (m.typeMetadata?.data as PresetMetadata).presetKind;
        if (kind === 'lut')         this.luts.add(toLut(m, event.installedPath));
        if (kind === 'transition')  this.transitions.add(toTransition(m, event.installedPath));
        if (kind === 'effect')      this.effects.add(toEffect(m, event.installedPath));
        if (kind === 'export')      this.exportPresets.add(toExport(m, event.installedPath));
        break;
      }
      case 'shader':                this.shaders.add(toShader(m, event.installedPath)); break;
      case 'starter': {
        const editor = (m.typeMetadata?.data as StarterMetadata).targetEditor;
        if (editor === 'cut')       this.starters.add(toStarter(m, event.installedPath));
        break;
      }
      // 其它 type 与 cut 无关，忽略
    }
  }
  private evict(event: { manifest: AssetManifest }) { /* 各 registry .remove(id) */ }

  dispose(): void { this.disposables.forEach((d) => d.dispose()); }
}
```

#### 三层架构纪律

```
EffectsManifest (manifest.effects.registrations)
    │     ① server 审核时落到 manifest
    ▼
NekoMarketAPI.onDidInstall  ←── 单点事件源
    │     ② Phase 6.5.6 起点亮的事件
    ▼
各子包的 ContributionRegistry  ←── 子包内部的"提供物表"
    │     ③ 子包自己定义"什么类型贡献到哪个菜单"
    ▼
右键菜单 / 选择器 / 选单 / 列表  ←── UI 自动渲染
          ④ 渲染层永远从 ContributionRegistry 读，不直接读盘
```

**核心纪律**：

```
✓ UI 渲染永远不直接读盘
✓ UI 永远只读 ContributionRegistry
✓ ContributionRegistry 永远只听 onDidInstall/onDidUninstall + 首次启动全量扫描
✓ switch(m.type) 之后必须再判 metadata.kind，否则 kind 子类型混入污染
```

### 13.7 右键菜单 / 命令面板的动态注入

右键菜单是 AIGC 创作工具最重要的 install 反馈面——创作者不会主动去翻 Settings；他们的工作流是"在素材/图层/clip 上右键 → 看到选项 → 应用"。**新装的 LUT / shader / character / motion 必须立刻出现在这条路径上**。

#### 受影响的右键菜单清单

| 子包 | 右键对象 | 受影响菜单项 | 来源 type |
|---|---|---|---|
| **neko-cut** | clip | "Apply LUT ▸" | `preset(lut)` |
|  | clip | "Add Effect ▸" | `shader` + `preset(effect)` |
|  | clip | "Add Transition ▸" | `preset(transition)` |
|  | clip | "Generate with..." | `provider` + `endpoint` |
|  | track | "Apply Track Effect ▸" | `shader` + `preset(effect)` |
|  | timeline | "Insert Project Template ▸" | `starter(cut)` |
| **neko-canvas** | shot-node | "Use Character ▸" | `identity(character)` |
|  | shot-node | "Apply Style ▸" | `identity(style)` |
|  | shot-node | "Generate Image..." | `provider` + `endpoint` |
|  | canvas | "Insert Layout Template ▸" | `starter(canvas)` |
| **neko-model** | viewport | "Add Character ▸" | `identity(3d-rigged)` |
|  | viewport | "Add Location ▸" | `identity(location)` |
|  | character | "Apply Animation ▸" | `media(puppet-motion)` |
|  | mesh | "Apply Material ▸" | `shader` + `media(3d-model material)` |
|  | scene | "Apply HDR Skybox ▸" | `media(image)` 中 panoramic 子集 |
| **neko-sketch** | layer | "Apply Filter ▸" | `shader` + `preset(effect)` |
|  | layer | "Apply LUT ▸" | `preset(lut)` |
|  | layer | "Insert Reference ▸" | `media(image)` + `identity(portrait)` |
|  | layer | "Generate with AI..." | `provider` + `endpoint` |
| **neko-puppet** | bone | "Apply Motion ▸" | `media(puppet-motion)` |
|  | puppet | "Replace Puppet from Identity ▸" | `identity(2d-puppet)` |
| **neko-story** | scene | "Apply Convention ▸" | `preset(convention)` |
|  | scene | "Apply Memory Style ▸" | `preset(memory)` |
|  | character | "Bind to Identity ▸" | `identity(*)` |
|  | character | "Use Voice ▸" | `identity(voice)` |
| **neko-agent** | chat input | "Switch Provider ▸" | `provider` |
|  | chat input | "Switch Endpoint ▸" | `endpoint` |
|  | chat input | "Switch Model ▸" | `model` |
|  | chat input | "Run Skill ▸" | `skill` |
|  | message | "Add to Memory ▸" | `preset(memory)` |
| **任何子包** | 文件资源管理器 | "Open in Marketplace" | (deep-link) |

注：**▸ 表示动态 submenu**，必须随 install/uninstall 增减项。

#### 两种实现方式

```
方式 1  Webview 内右键（推荐，子包大多数右键发生在 webview 内）
        webview 自己 render 菜单 → 直接从 ContributionRegistry 读 → 最简单
        ✓ 即装即现，无需 VSCode 重启
        ✓ 子菜单可以带 thumbnail / preview

方式 2  VSCode 原生菜单（仅限 explorer 等）
        package.json 写一个 root command
        点击后弹 QuickPick 列出 ContributionRegistry 内容
        ✓ 兼容文件资源管理器右键 / 命令面板
        ⚠ 看上去像两步操作，UX 略差但合规 VSCode
```

绝大多数场景用方式 1。仅 `Open in Marketplace` 这种文件浏览器右键用方式 2。

#### 命令面板（Cmd+Shift+P）也是注入点

```
"neko: Run Skill..."         → 列出所有 enabled 的 skill
"neko: Switch Provider..."   → 列出所有 provider
"neko: Apply LUT to Clip..." → 列出所有 LUT
"neko: New Project..."       → 列出所有 starter
"neko: Use Character..."     → 列出所有 identity
```

实现也是**从 ContributionRegistry 读**，不重新扫盘。

#### 按 kind 严格过滤（防污染）

```
✗ "Apply LUT ▸" 里出现一个 transition 预设
✗ "Use Character ▸" 里出现一个 location identity
✗ "Apply Filter ▸" 里出现一个 LUT
```

发生这种污染的根因都是"**只按 type 过滤，不按 metadata.kind 过滤**"。模板代码 `switch(m.type)` 之后必须再判 `metadata.kind`。

### 13.8 事件风暴 / 事务边界 / 偏好过滤

#### 风险 1：bundle 安装的事件风暴

```
现象：装一个含 30 个 contents 的 bundle → 触发 30 次 onDidInstall
      消费扩展全量刷 UI 30 次 → 看上去 UI 闪
修法：bundle 的递归 install 应在最后聚合一次 onDidInstallBatch 事件
      普通单包仍发 onDidInstall，bundle 发 onDidInstallBatch
```

```typescript
// NekoMarketAPI 扩展
export interface NekoMarketAPI {
  // ... 现有 ...
  onDidInstallBatch: vscode.Event<{
    bundleId: string;
    events: MarketAssetEvent[];
  }>;
}

// 消费扩展订阅模式：优先 batch，没有再退化到单事件
context.subscriptions.push(
  market.onDidInstallBatch((batch) => {
    // 一次性吸收 N 个事件，UI 只刷一次
    for (const e of batch.events) bridge.absorb(e);
    bridge.notifyUI();
  }),
  market.onDidInstall((event) => {
    // 仅当不在 batch 内时触发
    bridge.absorb(event);
    bridge.notifyUI();
  }),
);
```

#### 风险 2：identity 跨子包注册顺序

```
现象：identity 包含 3d-rigged + 2d-puppet + voice 三 forms
      neko-model / neko-puppet / neko-agent 三个扩展同时收事件
      若其中一个失败，其它两个已经注册 → 状态不一致

修法：identity 注册走 AssetFederationRegistry 的事务边界
      全装或全回滚（two-phase commit）

具体实现：
  Phase 1 prepare:  各子包 dryRun-register，回报 commitable
  Phase 2 commit:   全部 commitable → 各子包真正 register
                    任一不 commitable → 全体回滚 + 拒绝安装
```

#### 风险 3：UI 列表过多导致选不动

```
现象：创作者装了 50 个 LUT，"Apply LUT ▸" submenu 滚不动
修法：三档过滤
  ① 最近使用 (lastUsedAt 倒序前 5)
  ② 收藏 (用户星标)
  ③ 隐藏未启用 (enabled = false 默认折叠)

扩展 InstalledRegistry：
  + favorites: Set<packageId>
  + lastUsedAt: Map<packageId, timestamp>
  + lastUsedItemAt: Map<packageId.itemId, timestamp>  (sparse 包项目级)
```

#### 风险 4：消费扩展崩溃影响 market

```
现象：neko-cut absorb event 时 throw → market 收到未处理的 promise rejection
修法：market 派发事件用 Promise.allSettled，单个消费扩展崩溃不影响其它
      崩溃的扩展记录 health=degraded，下次启动时尝试 self-heal
```

```typescript
// market 内部派发逻辑
private async fireOnDidInstall(event: MarketAssetEvent): Promise<void> {
  const results = await Promise.allSettled(
    this._listeners.map((listener) => Promise.resolve(listener(event))),
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      this._logger.warn('Listener crashed during onDidInstall', r.reason);
      // 不 rethrow，不影响其它 listener
    }
  }
}
```

---

## 十四、信任与安全

### 14.1 三级信任（对齐 [adr-capability-protocol.md](./adr-capability-protocol.md)）

```
core         官方维护、已审核、已签名 → 任意分类，无限制
community    社区发布、签名验证通过   → 任意分类
                                       endpoint 需 publisher 实名
                                       provider 不可贡献全局默认
untrusted    本地手动放置 / 未签名     → registry 安装仅限 media 分类
                                       禁止 tooling / ai / bundle
                                       每次激活提示用户确认
                                       sideload 走 ${NEKO_HOME}/local 隔离与 type-specific 校验
```

### 14.2 签名验证现状

```
P0  presence-check       manifest.distribution.signature 字段存在即通过
P1  manifest 哈希校验    SHA256(manifest stable JSON) === signature.value
P2  crypto verification  ed25519 签名 + 公钥分发管线 + 撤销列表
```

### 14.3 untrusted 隔离细则

```
媒体素材路径    ~/.neko/local/{type}/   ← 与 market-installed/ 物理隔离
不进 InstalledRegistry
不参与 effects 注册（媒体素材本就无副作用）
仅可被 neko-assets 索引为本地资产
```

---

## 十五、实施路径

### 15.1 已完成

```
Phase 6.5.1 ✓ 基础设施（@neko/market-core）
Phase 6.5.2 ✓ Skill 市场 MVP（neko-agent 侧边栏）
Phase 6.5.3 ✓ 独立 Marketplace Webview 面板
Phase 6.5.4 ✓ 多品类 InstallTarget（11 种）
```

### 15.2 当前 / 计划

```
Phase 6.5.5 — 消费端集成 + 热加载
├── neko-cut EffectDispatcher 订阅 onDidInstall
├── neko-cut LUT 面板 / 转场选择器扫描 ~/.neko/presets/
├── neko-agent ModelManager 扫描 ~/.neko/models/
└── 首次启动 fallback 全量扫描

Phase 6.5.6 — AssetType v4 + DistributionKind + EffectsManifest（P0，破坏性 schema 升级，一次性合并）
├── AssetType 21 → 11 重整（合并 + 重命名，详见 §四）
│   ├── 加 mediaKind / modelKind / shaderKind / presetKind 子类型字段
│   ├── 11 个 metadata 接口替换原 21+ 个
│   └── InstalledRegistry 启动期就地迁移脚本（旧 type → 新 type）
├── manifest.ts 扩 distributionKind / effects / contents 字段
├── InstallManager 按 distributionKind 分发（archive / orchestration / registration）
├── 反演卸载（按 effects 调 unregister）
├── 11 个 InstallTarget 落地（合并 ShaderTarget / ModelTarget / PresetTarget；新增 PluginTarget / BundleTarget；其它重命名）
└── 测试与文档同步

Phase 6.5.6a — 中间件链路（P1）
├── TrustGateMiddleware
├── QuotaCheckMiddleware
├── ConflictResolveMiddleware
└── DependencyResolveMiddleware

Phase 6.5.6b — 4 Tab UI 信息架构（P1）
├── BrowseView segmented sort + category chips
├── BrowseView Type → metadata.kind 二级筛选
├── OwnedView（含已购未装快捷安装 + entitlement 5min 缓存 + deep-link refresh handler）
├── InstalledView 分组折叠
├── 详情页购买按钮状态机（§六.6）
└── i18n 完善

Phase 6.5.6c — InstallTargetRegistry 协议升级（P1，为 §九.4-9.5 落码）
├── @neko/market-core 加 IInstallTarget.register/unregister/discover API
├── neko-market 加 contribution-discovery.ts 扫描 contributes.neko.installTargets
├── activationEvents: onInstallType:* / onInstallKind:*.* 命名约定落地
├── 详情页/安装流程：未安装贡献者时显示"需要安装扩展 X"提示
├── §九.5 五条不变量的强制实现（重复检测 / 激活失败处理 / unregister）
└── 测试 mock 子包贡献场景

Phase 6.5.6d — 过期管理 A/B/C 三类（P1，为 §五.7 / §六.10 / §九.6 落码）
├── InstalledPackage 加 status / expiresAt / graceEndsAt / lastUsedAt / compatibilityIssue / deprecation 字段
├── ExpiryEvaluator 中间件（refreshAll / tick / evaluate / runCleanup / onStatusChange）
├── 5 优先级 status 派生规则
├── Grace Period 三阶（7d/30d/90d）+ 大素材 / AI 模型特例
├── 5 种 UI 徽章（active / expiring-soon / expired / incompatible / deprecated）
├── timeline / canvas 引用的"红标 + [续费/替换/移除]"对话框
├── server entitlement webhook 接入（与 §九.6.9 端点对齐）
└── Bundle 独立过期策略（不连带 contents）

Phase 6.5.6e — Storage Manager UI（P2，为 §六.10 D+E 类落码）
├── settings 子页 "Storage Manager"
├── 包列表（按大小 / 上次使用 / 安装时间排序 + 类型分组）
├── "全选未用 N 天+" + 二次确认 > 1GB
├── 缓存预算 settings（market-cache / stock-cache / ai-cache / embedding / thumbnail）
├── "Clear all caches" 按钮 + 实时用量显示
└── 闲置 vs 过期 文案区分

Phase 6.5.6f — 大素材策略（P1，为 §五.8 / §六.11 / §六.12 / §七.4 落码）
├── manifest.ts 加 LargeAssetStrategy + SparseItem / ProxyVariant / ModelVariant
├── 5 态状态机扩展（manifest-only / proxy / partial / full + 现有 owned）
├── InstallManager 8 阶段加大素材分支（preflight 增强 + stage 按 modes 分发）
├── Mini 8 阶段子下载（sparse 子项 / proxy upgrade / variant download）
├── VariantPicker UI（model 类专属）
├── SparseSelector UI（合集包）
├── ProxyUpgrade UI（按需升级流）
├── 进度 / 续传 / 网络断开自动暂停
└── AssetLibrary 状态规则落实（§六.11 表）

Phase 6.5.6g — 语义 + 意图 + 向量层（P1，为 §五.9 / §五.10 / §五.11 落码）
├── manifest.ts 加 semantics / intent / embeddings 字段
├── 11 种 type 各自的 typed facet schema（LutSemantics / SkillIntent / ...）
├── server ontology 受控词汇表对接（GET /ontology/semantic / intent）
├── PackageEmbeddings 验证（modelId / version / dimension 必填）
├── client engine-vector-index 集成（与 [adr-asset-federation.md] AssetHandler.computeEmbeddings 协作）
├── 卸载时反演 vector-index 与 IdentityRegistry rows
├── Browse Tab facet 范围 slider + intent multi-select chips
└── 向量混合排序（intent 强过滤 + semantic 范围 + vector 排序）

Phase 6.5.6h — 消费集成深化（P2，为 §十三.4-8 落码）
├── ContributionRegistry 标准模板推广到所有创作扩展（cut / canvas / model / sketch / puppet / story / agent）
├── 右键菜单动态注入（§十三.7 表清单）
├── 命令面板入口（neko: Run Skill... / Apply LUT... / 等）
├── onDidInstallBatch 事件聚合（避免 bundle 安装事件风暴）
├── identity 跨子包注册的事务边界（two-phase commit 与 AssetFederationRegistry）
├── InstalledRegistry 加 favorites / lastUsedAt / lastUsedItemAt 字段
├── 列表过滤三档（最近使用 / 收藏 / 隐藏未启用）
└── Promise.allSettled 派发，单 listener 崩溃不影响其它

Phase 6.5.8 — Delta 更新 + 健康检查（P2）
├── 大模型增量更新（避免 50GB 重下载）
├── onHealthCheck 周期性自检
└── 8 阶段全状态机（含 onActivate / onMigrate）

Phase 6.5.9 — Y 类 InstallTarget 渐进迁移（P2，每子包一个独立 PR）
├── SkillInstallTarget    → neko-agent
├── PluginInstallTarget   → neko-tools 或 PluginHost
├── ShaderInstallTarget   → neko-cut（默认）+ neko-model 通过 onInstallKind:shader.material 覆盖
├── IdentityInstallTarget → neko-assets（AssetFederationRegistry 所在包）
├── EndpointInstallTarget → neko-agent（LLM Router）
├── ProviderInstallTarget → neko-agent（ProviderRouter）
├── ModelInstallTarget    → @neko/model-runtime
└── 完成标志：neko-market/extension/package.json 不依赖任何 @neko/{agent,cut,model,sketch,puppet,canvas,story,assets} 子包
```

### 15.3 已移出本项目

```
Phase 6.5.7（Registry Server + 商业化）
  → 全部移到独立项目 neko-registry-server
  → 本项目不再持有该实施清单
```

### 15.4 实现状态（2026-05-05）

本节记录 `align-neko-market-registry-contracts` 变更在本仓的落地范围，避免架构文档只停留在目标态。

```
已落地（P0 / P1 基线）
├── AssetManifest v4
│   ├── @neko/shared 暴露 11 种 AssetType + AssetCategory 映射
│   ├── typeMetadata / distributionKind / effects / dependencies / contents / largeAsset / semantics / intent / embeddings / deprecation
│   └── parse / type guard / legacy type migration diagnostics + fixture tests
├── Registry API client
│   ├── registryUrl 可配置，默认 https://market.neko.dev/api/v1
│   ├── JSON headers / Bearer token / timeout / ETag / RFC 7807 Problem Details
│   ├── version capability probe + fallback
│   ├── search/detail/versions/featured/download/entitlement/checkout/ontology/deprecation DTO
│   └── sparse / proxy / delta descriptor 方法已建模并受 capability gate 控制
├── Install runtime
│   ├── discover → resolve → preflight → fetch → verify → stage → activate → record → rollback/done/error
│   ├── archive / orchestration / registration 分发
│   ├── integrity + P0 signature presence check
│   ├── EffectsManifest 反演卸载
│   ├── bundle 引用计数
│   └── InstalledPackage status + large asset state + ensureFull(packageId, itemId?)
├── InstallTarget contribution
│   ├── market 内建 X 类 media / starter / preset / bundle
│   ├── NekoMarketAPI.registerInstallTarget(target, kind?) + Disposable unregister
│   ├── contributes.neko.installTargets 静态发现 + onInstallType/onInstallKind 懒激活
│   ├── duplicate / X-Y overlap / activation failure / promised-but-not-registered diagnostics
│   └── market extension architecture guard：不 import agent/cut/assets/model/tools/React，webview 不 import vscode
├── Extension host adapter
│   ├── storage path 来自 context.globalStorageUri
│   ├── registryUrl setting change 热更新
│   ├── neko-auth session token 注入和 session-change 刷新
│   ├── checkout / renew / invoice / support 全部 openExternal
│   └── vscode://neko.market/refresh deep-link 刷 entitlement + package detail
├── Webview management surfaces
│   ├── Browse / Installed / Owned / Updates 四 Tab
│   ├── category → type → metadata kind filter + featured/created P0 sort
│   ├── Owned entitlement projection：owned-installed / owned-not-installed / expiring / expired / pending
│   ├── Updates blocked state
│   ├── detail primary action：free install / paid checkout / owned install / installed / expired renew / pending
│   └── large asset variant picker + sparse toolbar + proxy progress/cancel controls
└── Consumer projections
    ├── AssetLibrary 仅投影 usable media / identity installed records，显示 market source + detail deep-link
    ├── owned-not-installed 不进入 AssetLibrary 或 domain consume surfaces
    ├── neko-agent skill/provider/endpoint 通过 typed market events 生成投影
    ├── neko-cut shader/LUT projection 使用 v4 shader + preset(kind=lut)，过滤 expired/incompatible
    └── public API 暴露 ensureFull(packageId, itemId?) 供导出/最终渲染前取 full-quality bytes
```

```
P0 明确延期（类型与 UI 已固定，但执行路径仍有后续增强）
├── delta patch apply：当前 P0 会读取 delta descriptor，但执行 full fallback 下载 + SRI 校验；xdelta3/bsdiff/rsync patch applier 延到 P1
├── signature P1/P2：当前为 distribution.signature presence check；stable JSON hash 与 ed25519 verification 仍走同一 verifier interface 后续替换
└── ontology-driven 动态 facet UI：P0 使用固定 category/type/kind 控件，server ontology endpoint 和 cache TTL 已在 client contract 建模
```

---

## 十六、反模式清单

```
MK-1   "客户端做支付"
       现象：webview 内嵌支付 SDK
       代价：CSP / PCI / VSCode 商店审查 / 退款流程复杂
       修法：deep-link 到 server，client 只验证 entitlement

MK-2   "客户端写 manifest"
       现象：客户端工具帮发布者拼装 manifest 并提交
       代价：发布逻辑漂到客户端，server 失去权威性
       修法：manifest 是 server 权威产物，client 只消费

MK-3   "InstallTarget 内部硬编码副作用"
       现象：每个 Target 自己 fs.writeFile / register / spawn
       代价：卸载漏清、新增类型重蹈覆辙
       修法：写到 manifest.effects，InstallManager 反演

MK-4   "Bundle 不解析依赖"
       现象：bundle 包内不递归装 contents
       代价：bundle 形同虚设
       修法：DependencyResolveMiddleware 在 resolve 阶段展开

MK-5   "trustLevel 各 Target 自己判"
       现象：ProviderCardInstallTarget 拦 untrusted，Skill / Plugin 不拦
       代价：信任规则不一致
       修法：TrustGateMiddleware 在 preflight 统一拦

MK-6   "已购视图 = Installed 子集"
       现象：把 Owned Tab 实现成 listInstalled().filter(paid)
       代价：换机器后买过的东西消失
       修法：Owned 来自 server `/me/entitlements`，与本地 Installed 解耦

MK-7   "热门做成独立 Tab"
       现象：推荐 / 热门 / 最新 各开一 Tab
       代价：Tab 数爆炸，移动端挤成一坨
       修法：segmented control，server 用 sort 参数区分

MK-8   "Endpoint 把 API Key 写进 manifest"
       现象：发布者把 demo key 塞 manifest，用户安装后用 demo key
       代价：Key 泄漏 / 配额耗尽 / 计费混乱
       修法：manifest 里只放 credentialSchema，安装时弹表单经 keytar 落盘

MK-9   "Bundle 卸载直接 rm 子包"
       现象：卸载 bundle 时连带卸载所有 contents
       代价：与其他 bundle 共享的子包被误删
       修法：引用计数，归零再卸

MK-10  "untrusted 给 tooling / ai 通道"
       现象：本地手动塞 plugin 到 ~/.neko/plugins/ 自动激活
       代价：任意代码执行 / 模型耗 GPU
       修法：untrusted 仅 media，其他分类硬拒

MK-11  "为子类型新加 AssetType"
       现象：要支持新的 LUT 变体 → 新增 'lut-cinematic' AssetType
       代价：21→N 类型爆炸，重蹈 v3 覆辙；每加一种 type 要写新 InstallTarget
       修法：扩 metadata.kind 枚举（如 presetKind 新增值），不动 AssetType 联合

MK-12  "AssetType 命名混风格"
       现象：新加的 type 用复合词 / 前缀（如 'lora-v2' / 'ai-prompt-template'）
       代价：v3 累积的命名债务复发，文档 / Server / 第三方 manifest 一起乱
       修法：v4 命名纪律（单数单词 / 无实现细节后缀 / 无冗余前缀），违反者拒收

MK-13  "client 端嵌入支付 SDK 抢占小额场景"
       现象：单 LUT 单 LoRA 强行用 webview Stripe Element 闭环
       代价：CSP 配置 / 3DS 拦截 / VSCode 商店审查累积复杂度
       修法：方案 A 唯一路径，方案 B 仅在 §二决策 4 升级触发条件全满足后启用

MK-14  "neko-market 反向依赖子包领域类型"
       现象：market/extension/ 的 InstallTarget import @neko/agent 的 SkillDef
              或 import @neko-engine 的模型类型
       代价：协议层变成 god module，dep-cruiser no-cross-extension-deps-* 实质失效；
              加任何新子包要先改 market；测试要 mock 全宇宙
       修法：Y 类 Target 必须迁到对应子包贡献，X 类 Target 不许 import 领域包
              （§九.4 判定守则 + §九.5 贡献协议）

MK-15  "Y 类 Target 留在 neko-market 凑合用"
       现象：以"反正能跑"为由，让 SkillInstallTarget 长期住在 neko-market
       代价：每加一个领域细节就破坏 market 边界，迁移成本随时间指数增长
       修法：Phase 6.5.9 必须按表迁完 7 个 Y 类，不允许"暂留"

MK-16  "贡献激活失败时静默降级"
       现象：子包 activate throw → market 用一个 stub Target 装上去（看似成功）
       代价：用户以为装好了，但实际没注册到运行时，等用时才报错
       修法：激活失败硬拒绝该次 install，详情页显示具体错误
              （§九.5 不变量 ③）

MK-17  "AssetLibrary 一锅端显示所有已装"
       现象：把 skill / endpoint / shader / preset 也塞 AssetLibrary
       代价：素材库变什锦盘，创作心智撕裂；shader / skill 不存在"拖到时间线"交互
       修法：AssetLibrary 仅显示 media + identity；其它 9 种 type 各归领域面板
              （§六.7 三面分工表 / §六.8 边界）

MK-18  "AssetLibrary 加'市场已购买' Tab"
       现象：Market.Installed 之外，AssetLibrary 再做一遍
       代价：双源 / SRP 违反 / 状态不一致 / 卸载语义混乱 / 已购未装幽灵项
       修法：本地 Tab 用 source badge 标注 market 来源 + deep-link 到 Market 详情页
              （§六.8 双向桥）

MK-19  "本地素材库直接显示云端待下载"
       现象：把 server 上数百万 stock 全量下发到 AssetLibrary 渲染
       代价：必联网 / 流量爆炸 / 已装 vs 未装糊涂 / 离线即废
       修法：云端走 service-endpoint + 动态 Tab，stock 下载后才入本地 Tab
              （§六.8 1+N+1 结构 / §六.9 P2）

MK-20  "License 过期立即删文件"
       现象：entitlement 撤销 → 立刻 rm -rf 该包
       代价：用户 30 秒后想续费要重新下 50GB；或 timeline 引用瞬间失效
       修法：硬禁用 + 7 天 grace 保留文件 + 30 天 hardCleanup
              （§九.6.4 Grace Period 三阶）

MK-21  "把 5 种过期混作一种"
       现象：A/B/C/D/E 用一个 'expired' flag 处理
       代价：deprecated 包被错误禁用 / 缓存 LRU 当 license 撤销 / 闲置自动删
       修法：5 类独立判定，status 5 优先级派生，处理策略各异
              （§九.6.3 表）

MK-22  "Bundle 过期连带删 contents"
       现象：bundle license 过期 → 50 个 contents 一起停 / 一起删
       代价：用户为 contents 付的钱失效 / 已使用素材瞬间消失
       修法：bundle 与 contents 独立 entitlement，bundle 仅"组合权"
              （§九.6.7）

MK-23  "Curation 过期硬禁用"
       现象：publisher 标 deprecated → client 立刻禁用该包
       代价：仍可工作的素材被 publisher 单方面停掉
       修法：deprecated 仅软警告 + 推荐替代品，不禁用
              （§九.6.3 C 类策略）

MK-24  "License 过期 = 删文件 = 删用户产物"
       现象：license 过期连带处理已渲染产物 / timeline 引用强制移除
       代价：用户的劳动成果消失 / 工程被破坏
       修法：已渲染产物永久保留，引用红标 + 弹"续费/替换/移除"对话框
              （§十二.5 创作产物完整性）

MK-25  "闲置清理无二次确认"
       现象：Storage Manager 一键清理 25GB 不弹确认
       代价：用户手滑删了关键模型，重下要 1 小时
       修法：> 1GB 必二次确认；显示"该资产是否被工程引用"
              （§六.10 Storage Manager 纪律）

MK-26  "把 intent 塞进 semantics"
       现象：semantics: { warmth: 0.85, useCases: ['wedding'] }
       代价：客观属性与主观判断混在一起，向量化 / 升级模型时纠缠
       修法：semantics 与 intent 平行字段，分开
              （§五.9 / §五.11 边界）

MK-27  "intent 用 free-form tag"
       现象：intent.useCases: ['vlog', 'wedding', 'whatever-publisher-wrote']
       代价：取值漂移，跨包无法对齐
       修法：server 受控词汇表，不在表内的拒收
              （§十一 不变量 ⑪）

MK-28  "缺 notFor 字段"
       现象：付费素材没声明 notFor，用户用于商业被起诉
       代价：合规风险 / market 责任纠纷
       修法：付费包必填 notFor 至少一项（或显式声明 'no-restriction'）

MK-29  "Manifest 直接带向量"
       现象：发布者把 1024-d float32 向量塞 manifest
       代价：manifest 膨胀 / 模型版本绑死 / server 重复存
       修法：仅带 embeddingHash 指针，向量在 server DB / Payload bin
              （§五.10 Layer 1）

MK-30  "free tag 当语义"
       现象：semantics 退化成 string[] tag 数组
       代价：跨包对齐失败 / 范围搜索失效 / agent 推理混乱
       修法：typed facet schema，server 审核取值范围
              （§五.9）

MK-31  "Payload 带 embedding 不写 modelId"
       现象：黑盒向量包，装到不同 engine 行为不一致
       代价：客户端必须重算 → 反而比不带还慢
       修法：modelId/version/dimension 必填，不符即降级
              （§十一 不变量 ⑫）

MK-32  "购买和下载在 UI 上一步"
       现象：详情页"购买并下载"按钮，30 分钟后还在转
       代价：用户以为卡了 / 重复点击 / 重复扣费风险
       修法：购买 = entitlement，下载 = bytes，必须分两步
              详情页按钮状态机（§六.6）

MK-33  "sparse 包默认全选"
       现象：25 GB pack 默认全装
       代价：用户骂街
       修法：默认 = defaultSelected:true 的 + 用户星标过的；其它由用户主动勾
              （§六.12 Sparse Selector）

MK-34  "proxy 当 full 用，导出时才发现质量不对"
       现象：编辑器不区分 proxy / full，渲染输出低质
       代价：商用导出质量灾难
       修法：编辑器导出前调 ensureFull()，proxy 触发自动升级
              （§六.11 Proxy / Full 隐式 upgrade）

MK-35  "网络断开静默失败，无续传 UI"
       现象：下到 7GB / 8GB 时断网，整个失败重来
       代价：流量 / 时间浪费
       修法：自动暂停 + 显式"已暂停，恢复网络后可续传"
              （§六.12 进度 / 续传 / 网络断开）

MK-36  "variant 选择藏在高级选项"
       现象：model 默认装最大档（fp16），用户找不到 int8
       代价：8GB VRAM 用户装 8GB 模型挂掉
       修法：必须显式呈现 picker，default 标推荐档
              （§六.12 Variant Picker 强制规则）

MK-37  "消费端按 type 不按 metadata.kind 过滤"
       现象：'Apply LUT ▸' 子菜单出现 transition 预设
       代价：UI 污染，用户混乱
       修法：switch(m.type) 之后必判 metadata.kind
              （§十三.7 按 kind 严格过滤）

MK-38  "identity 跨子包注册不做事务"
       现象：identity 含 3 forms，第 2 个注册失败，第 1 个已 register
       代价：状态不一致
       修法：two-phase commit (prepare → commit/rollback)
              与 AssetFederationRegistry 协作（§十三.8 风险 2）

MK-39  "命令面板从磁盘扫描而非 ContributionRegistry"
       现象：每次打开命令面板重新扫 ~/.neko/skills/
       代价：延迟 / 不一致 / 双源
       修法：命令面板从 ContributionRegistry 读，启动时一次性 fallback
              （§十三.6 命令面板入口）

MK-40  "bundle 安装事件风暴刷 UI"
       现象：装 30 个 contents 的 bundle，UI 闪 30 次
       代价：UX 灾难
       修法：onDidInstallBatch 聚合，bundle 完成后一次性 fire
              （§十三.8 风险 1）
```

---

## 附录 A：版本演进

### v1 → v2 主要变化

```
+ 边界声明：本文仅描述客户端，server 移到独立项目
+ AssetType: 17 种 → 21 种（+ bundle / project-template / service-endpoint / identity-pack）
+ DistributionKind 一等公民（archive / orchestration / registration）
+ EffectsManifest 声明式副作用 + 反演卸载
+ 8 阶段生命周期状态机 + onPreInstall / onRollback
+ 中间件链路（Trust / Quota / Conflict / Dependency）
+ 4 Tab 信息架构（Browse / Installed / Owned / Updates）
+ Browse Tab segmented control（推荐 / 最新 / 热门 / 免费）
+ 购买 deep-link + 已购视图 + entitlement 校验
+ ServiceEndpoint 凭证表单 + keytar
+ IdentityPack 与 Asset Federation 集成
+ Bundle 引用计数与卸载策略
+ 反模式清单 10 条
- 移除：§九 Registry Server 详细架构（移到 neko-registry-server）
- 移除：Phase 6.5.7 Registry Server / 商业化的实施步骤
```

### v3.6 → v3.7 主要变化（2026-05-05）

```
± marketplace-plugin-governance.md 重要修订
        从 v1.0 → v1.1

        决策：不支持 WASM
          · neko-engine 当前仅 native cdylib
          · WASM 不在当前范围，也不计划支持
          · 社区贡献通过其它 10 种 AssetType（skill / preset / shader / identity / ...）

        Trust Tier 从 4 档改为 3 档
          · T1 Core / T2 Verified / T4 Sideload (dev-mode only)
          · T3 Community 在 plugin 这一类不存在通道

        Permission 模型重写
          · 从旧的强制沙箱表述改为"声明性 + 审核 + host-api audit"
          · Native plugin 没有运行时沙箱（事实声明）
          · Permission 用于：用户告知 / KYC 审核 / engine host-api audit log / publisher 信誉
          · 超出声明范围靠 server 累积上报触发处分

        反模式新增 +2 (MK-P10 / MK-P15)
          · MK-P10 把 permission 当沙箱
          · MK-P15 强行让 plugin 承载社区贡献

± §四.1 plugin 描述更新
        从旧的 native/WASM 混合表述
        改为 "neko-engine 原生 cdylib 扩展（KYC publisher 必需，无 WASM 通道）"
        加注 "社区贡献请用 skill / preset / shader / identity 等其它 type"

不变（v3.6 保持稳定）：
  · 11 种 AssetType / 4 Tab / X-Y 归属 / 5 类过期 / 大素材 / 语义意图 / ...
  · 决策 4 购买策略（方案 A）
  · 8 阶段生命周期 / DistributionKind / EffectsManifest
  · Server 契约 13 条不变量
  · 40 条反模式（plugin-governance 反模式独立编号 MK-P1~P15）

仍待修订（建议 Phase 6.5.6i 实施时同步落地）：
  · 代码实现侧落地 PluginMetadata / PluginPermission 校验
  · 代码实现侧落地 Plugin Build / KYC API client binding
  · 代码实现侧落地 Engine PluginManager license / trust / workspace 闸门
```

### v3.5 → v3.6 主要变化（2026-05-05）

```
+ 抽出独立文档 docs/architecture/marketplace-plugin-governance.md
        plugin / shader 治理权威定义
        覆盖：
          · 范围澄清：plugin = neko-engine 原生 cdylib 扩展，不是 VSCode 扩展
          · 三档 Trust Tier (T1 Core / T2 Verified / T4 Sideload；T3 Community 无 plugin 通道)
          · 决策：不支持 WASM runtime
          · PluginPermission 声明模型 + host-api audit（非沙箱）
          · 用户安装流程（按 tier 不同对话框）
          · Workspace Trust（trusted / restricted / limited）
          · 不加密防盗用 8 战术（编译 / watermark / heartbeat / hardware binding /
            签名 / cloud IP / anti-tamper / 法律）
          · 三档保护策略（Tier B/A/S 按价值）
          · Server-side compilation pipeline（per-user binary watermark）
          · Engine 内 license 闸门 7 步流程
          · 威胁 × 防御矩阵
          · 商业化两条路径（方案 X / Y / Z）
          · Shader 三档保护（WGSL source / SPIR-V binary / cloud-only）
          · Server 契约扩展（Build API / KYC API / 不变量 ㉒-㉗）
          · 13 条反模式 (MK-P1 ~ MK-P13)
          · 实施路径 Phase 6.5.6i / 6j / 6k / 6l

修订主文档：
± §四.1 AssetType 终态清单
        plugin 描述从 "VSCode 扩展代码包" 改为 "neko-engine 原生 cdylib 扩展"

± §九 顶部加 link out 提示
        plugin / shader 治理细节以 plugin-governance.md 为准
        本节仅保留 InstallTarget 概览

不变（v3.5 保持稳定）：
  · 11 种 AssetType / 4 Tab / X-Y 归属 / 5 类过期 / 大素材 / 语义意图 / ...
  · 决策 4 购买策略（方案 A）
  · 8 阶段生命周期 / DistributionKind / EffectsManifest
  · §六 / §七 / §十 / §十二 / §十三 / §十四 / §十五 / §十六 内容
  · Server 契约 13 条不变量
  · 40 条反模式清单（plugin-governance 加 13 条独立编号 MK-P1~P13）

本轮已同步：
  · manifest-schema-spec.md §三 + §五.8 plugin 描述纠正
  · manifest-schema-spec.md 加 PluginPermission 联合枚举
  · registry-server-contract.md 加 Plugin Governance 端点组（Build / Publisher KYC / Permission Audit）
  · registry-server-contract.md 加 Plugin Governance server 不变量
```

### v3.4 → v3.5 主要变化（2026-05-05）

```
+ 抽出独立文档 docs/architecture/registry-server-contract.md
        Client/Server HTTP 契约权威定义
        覆盖 §十一 全部内容（5 大端点组 / 13 不变量 / 字段权威性 / 签名 / 限流 / 演进）
        本仓与 neko-registry-server（独立仓）共同遵守

+ 抽出独立文档 docs/architecture/manifest-schema-spec.md
        AssetManifest 完整字段权威定义
        覆盖 §四 + §五 全部 schema（11 种 AssetType / 11 个 metadata / 大素材 /
              语义 / 意图 / 向量 / 过期 / 必填矩阵 / 校验规则 / 演进策略）
        Client / Server 实现从 spec 文档导出 TypeScript 类型

修订主文档：
± §十一 精简为 4 小节概览 + link out
        11.1 概要 / 11.2 五大端点组 / 11.3 不变量 / 11.4 不在范围 / 11.5 历史迁移
        所有详细 HTTP 端点列表移到 registry-server-contract.md §三
        所有 13 条不变量详细定义移到 registry-server-contract.md §四

± §五 顶部加 link out 提示
        架构决策说明保留，字段定义改由 manifest-schema-spec.md 权威
        TypeScript 示例仅作架构说明用

不变（v3.4 保持稳定）：
  · 所有架构决策（11 种 AssetType / 4 Tab / X-Y 归属 / 5 类过期 / 大素材 / 语义意图 / ...）
  · 所有 §六 / §七 / §九 / §十 / §十二 / §十三 / §十四 / §十五 / §十六 内容
  · Phase 6.5.5 / 6.5.6 / 6.5.6a-h / 6.5.8 / 6.5.9 / 6.6 实施路径
  · 40 条反模式清单
```

### v3.3 → v3.4 主要变化（2026-05-05）

```
+ §五.8 大素材策略 LargeAssetStrategy
        5 种 modes：eager / sparse / proxy / delta / variant
        SparseItem / ProxyVariant / ModelVariant 三个子接口
        按 type × 档位的策略推荐表
        5 态状态机扩展（manifest-only / proxy / partial / full + owned）
        totalSize 必填 + Quota 中间件接入
+ §五.9 Manifest 语义层（typed semantic facets）
        AssetSemantics 联合（按 type/kind 判别）
        各 type facet schema 草案（LUT/Audio/Image/Identity/Skill/Model 等）
        替代 free tag，server ontology 受控词汇表校验
+ §五.10 Payload 向量与 Client 端索引
        四层独立决策：Manifest 不带 / Payload 视情况 / 语义 facets / Client engine 库
        PackageEmbeddings schema (modelId/version/dimension 必填)
        各 type 是否带 embedding 决策表
        与 Asset Federation AssetHandler.computeEmbeddings 对接
        卸载时反演 vector-index + IdentityRegistry rows
+ §五.11 Manifest 意图层（typed intent facets）
        AssetIntent 通用接口 + type-specific 扩展（Skill/Lut/Model/Media/Starter）
        与 semantics 平行字段（不混合）
        notFor 合规边界字段
        三层混合搜索（intent 强过滤 + semantics 范围 + vector 排序）
+ §六.11 AssetLibrary 显示状态规则
        5+1 态显示规则表
        Proxy / Full 隐式 upgrade 触发流程
        ensureFull() 编辑器导出前调用
+ §六.12 大素材安装 UI 规范
        VariantPicker（model）/ SparseSelector（合集）/ ProxyUpgrade
        进度 / 续传 / 网络断开自动暂停
        Sparse 包后续追加下载流程
+ §七.4 大素材在 8 阶段中的分支
        preflight 加 disk / VRAM / variant 检查
        stage 按 modes 分发到 5 个子流程
        Mini 8 阶段（跳过 discover/resolve）
        delayed activate（防止引用未下载子项）
+ §十三.4 消费扩展三档分类（纯数据读 / 列表刷新型 / 行为改变型）
+ §十三.5 子包 × AssetType 影响矩阵（8 子包 × 21 类型 / kind 大表）
+ §十三.6 ContributionRegistry 标准模板（典型 CutMarketBridge）
+ §十三.7 右键菜单 / 命令面板的动态注入
        各子包受影响菜单清单
        webview 内右键 vs VSCode 原生 QuickPick
        按 kind 严格过滤防污染
+ §十三.8 事件风暴 / 事务边界 / 偏好过滤
        bundle onDidInstallBatch 聚合
        identity 跨子包 two-phase commit
        InstalledRegistry 加 favorites / lastUsedAt
        Promise.allSettled 派发
+ §十一 Server 契约新增端点 + 不变量
        语义 / 意图 / 向量搜索端点
        sparse-manifest / variants / proxy-variants / delta 端点
        ontology 端点（GET /ontology/semantic / intent）
        新增不变量 ⑩~⑬（共 13 条）
+ §十五 加 Phase 6.5.6f / 6.5.6g / 6.5.6h
        6.5.6f 大素材策略
        6.5.6g 语义 + 意图 + 向量层
        6.5.6h 消费集成深化
+ §十六 反模式 +15 条（MK-26 ~ MK-40）

不变（v3.3 保持稳定）：
  · 11 种 AssetType + metadata.kind 子类型
  · 决策 4 购买策略（方案 A）
  · 8 阶段生命周期 / DistributionKind / EffectsManifest
  · 4 Tab Market UI / 4 大 Category
  · §六.7-9 三面分工 + AssetLibrary 1+N+1 结构
  · §九.4-5 InstallTarget X/Y 归属 + 贡献协议
  · §九.6 ExpiryEvaluator + Grace Period
  · §六.10 过期 UI / §十二.5 创作产物完整性
```

### v3.2 → v3.3 主要变化（2026-05-05）

```
+ §五.7 过期与弃用 schema
        5 类过期分型（A License / B 兼容性 / C Curation / D 缓存 / E 闲置）
        AssetCompatibility 扩 knownIncompatible / upgradeTo
        新增 AssetDeprecation 接口（C 类）
        License 信息（A 类）不进 manifest，由 server entitlement 持有
+ §六.10 过期素材的 UI 表现
        Market.Installed 5 种状态徽章
        Market.Owned "即将过期" 区块
        AssetLibrary 过期素材隐藏 / 标记策略
        timeline 引用 expired 素材的红标 + 对话框
        Storage Manager 面板（D + E 类专属）
+ §九.6 ExpiryEvaluator 与 Grace Period
        InstalledPackage 6 个新字段（status / expiresAt / graceEndsAt / ...）
        status 派生规则 5 优先级
        5 类处理策略对照表（禁用？/ 自动删？）
        Grace Period 三阶（7d / 30d / 90d）+ 大素材/AI模型特例
        ExpiryEvaluator 中间件 + 6 个触发点
        Bundle 独立过期策略（contents 不连带）
        D 类缓存预算表（5 种缓存默认值）
        Server 端 3 个新增端点 + 3 条新增不变量
+ §十二.5 媒体过期与创作产物完整性
        已渲染产物永久保留
        新引用拒绝
        timeline 引用的"红标 + 续费/替换/移除"对话框
        identity 多 forms 部分过期处理
        与 Asset Federation IdentityRegistry 协作
+ §十五 加 Phase 6.5.6d（过期管理 A/B/C）+ 6.5.6e（Storage Manager UI）
+ §十六 反模式 +6 条（MK-20 ~ MK-25）

不变（v3.2 保持稳定）：
  · 11 种 AssetType + metadata.kind 子类型
  · 决策 4 购买策略（方案 A）
  · 8 阶段生命周期 / DistributionKind / EffectsManifest
  · 4 Tab Market UI / 4 大 Category
  · §六.7-9 三面分工 + AssetLibrary 1+N+1 结构
  · §九.4-9.5 InstallTarget X/Y 归属 + 贡献协议
  · Phase 6.5.6c / 6.5.9 / 6.6 路径
  · Server 契约现有 6 端点 + 6 不变量
```

### v3.1 → v3.2 主要变化（2026-05-05）

```
+ §六.7 按 type 显示三面分工（浏览面 / 取用面 / 管理面）
        11 种 type 的归位表，每种 type 浏览面只能有一个，避免双源
+ §六.8 AssetLibrary 与 Market 的边界
        AssetLibrary 仅显示 media + identity
        否决 3 Tab "本地/云端/市场已购买"（状态空间重叠）
        采用 1+N+1 结构（[本地] + [Pexels/Freesound/...] + [+找更多]）
        本地 Tab 含 source filter chips + 5 种 source badge
        市场已装媒体在本地 Tab 出现，badge 标注，点击 deep-link 到 Market
        双向桥 deep-link，不复刻管理职责
+ §六.9 AssetLibrary Tab 演进路径
        P0 单 Tab → P1 加 source 标识 + 找更多按钮 → P2 动态 Stock Tab
        Stock Tab 由 endpoint.capabilities='stock-*' 自动注入
+ §十六 反模式 +3 条
        MK-17 AssetLibrary 一锅端
        MK-18 加"市场已购买"Tab
        MK-19 本地直接显示云端待下载

不变（v3.1 保持稳定）：
  · 11 种 AssetType + metadata.kind 子类型
  · 决策 4 购买策略（方案 A）
  · 8 阶段生命周期 / DistributionKind / EffectsManifest
  · 4 Tab Market UI / 4 大 Category
  · §九.4-9.5 InstallTarget 归属边界 + 贡献协议契约
  · Phase 6.5.6c / 6.5.9 实施路径
  · Server 契约 6 端点 + 6 不变量
```

### v3 → v3.1 主要变化（2026-05-05）

```
+ §九.4 InstallTarget 归属边界（X 类 4 个 / Y 类 7 个）
        判定守则：是否 import 领域包决定归属
+ §九.5 贡献协议契约（两阶段发现 + 5 条不变量 + 激活事件命名）
        Stage 1: contributes.neko.installTargets 静态声明
        Stage 2: onInstallType:* activationEvent 按需引爆
+ §三 包结构反映 X/Y 分工（market 持 4 个 builtin，Y 类由子包贡献）
+ §十五 加 Phase 6.5.6c（InstallTargetRegistry 协议升级）
+ §十五 加 Phase 6.5.9（Y 类 Target 迁移到子包，7 个 PR）
+ §十六 反模式 +3 条（MK-14 反向依赖 / MK-15 凑合留 market / MK-16 静默降级）

不变（v3 保持稳定）：
  · 11 种 AssetType + metadata.kind 子类型
  · 决策 4 购买策略（方案 A）
  · 8 阶段生命周期 / DistributionKind / EffectsManifest
  · 4 Tab UI / 4 大 Category
  · Server 契约 6 端点 + 6 不变量
```

### v2 → v3 主要变化

```
+ 决策 4 重写：方案 A（纯 web jump）锁为 P0 唯一路径
+ 方案 B（webview 嵌入式）下推 P2，明确升级触发条件（4 项全满足）
+ 方案 C（完全 in-app）永久排除并写入"客户端永不做"清单
+ 决策 5 重写：AssetType 21 种 → 11 种（合并 + 重命名）
  · v3 (21):  video / audio / image / sequence / 3d-model / puppet-motion / document
              + project-template / identity-pack
              + ai-model / lora / embedding
              + service-endpoint / provider-card
              + skill / plugin
              + shader / shader-preset
              + preset / template / lut
              + bundle
  · v4 (11):  media / starter / identity
              + model / endpoint / provider
              + skill / plugin / shader / preset
              + bundle
+ 命名纪律：单数单词 / 丢实现细节后缀（-pack/-card）/ 丢冗余前缀（ai-/service-/project-）
+ metadata 子类型字段：mediaKind / modelKind / shaderKind / presetKind 替代类型联合爆炸
+ §六.6 购买流水细化（详情页按钮状态机 + 三路径 entitlement 感知 + 失败兜底）
+ §九 InstallTarget 重整：v3 11+4=15 个 → v4 11 个（合并 6 + 新增 2 + 重命名 4）
+ 反模式 +3 条（MK-11 子类型造 type / MK-12 命名混风格 / MK-13 嵌入式支付抢占小额）
± 全文 provider-card / service-endpoint / project-template / identity-pack 引用同步重命名

破坏性变更（迁移路径见 Phase 6.5.6）：
× manifest.type 字符串值变更：21 个旧值 → 11 个新值
× InstalledRegistry 启动期就地迁移（自动）
× InstallTarget 类名 / 注册位置变更（消费扩展无感，统一通过 NekoMarketAPI 事件）
```
