# 市场平台架构

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [format-strategy.md](./format-strategy.md) · [storage-strategy.md](./storage-strategy.md) · [model-runtime.md](./model-runtime.md)

> **协议地基对齐（Proposed 2026-04-25）**：[adr-capability-protocol.md](./adr-capability-protocol.md) 规定市场下发的能力（Skill / Tool / ProviderCard / ToolGroup）在签名审核时必须标记 **trustLevel**。默认审核通过的社区包标记 `community`（见协议地基 §6 三级信任）；未认证或用户本地 `.neko/plugins/` 的能力标记 `untrusted`（默认限制：不可贡献 ProviderCard、Operation 强制 approval='ask'、每次激活要求用户确认）。Market 需要在 Phase 推进时对接 trustLevel 审核流程，作为能力审核的新维度。
>
> **Provider Card 分发（Proposed 2026-04-24）**：[adr-provider-expression-context.md](./adr-provider-expression-context.md) 引入 `provider-card` 作为 Market 新分发品类（三层分发模型的 Layer 1 Market 层，承载社区/长尾生成模型的能力画像）。本文档的覆盖品类在 Provider ADR 落地时需追加。
> **Provider Card 安装校验（2026-04-26）**：`provider-card` 安装目标在本地安装前执行 manifest 校验：`untrusted` 禁止作为 Market ProviderCard 安装；`community` 必须带签名元数据或来自 verified publisher。当前为 manifest-level gate，真实 cryptographic verification 与服务端审核流水后续接入。
>
> **Skill Prompt-Chain 审核（2026-04-26）**：[adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md) 已移除 Skill workflow DSL。Market Skill 包不得包含 `phases` / `pipelines` / `workflow` / `stages` 字段；安装目标会在 `SKILL.md` 与 `manifest.json` 中拒绝这些字段。工作流程必须写成 Skill body 的 prompt-chain 章节。

---

## 一、背景

Neko Suite 需要一个统一的市场平台，管理官方、私有、共享、售卖的各类资产分发。

### 覆盖品类

| 品类 | 类型标识 | 典型大小 | 来源 |
|------|---------|---------|------|
| Agent Skill | `skill` | KB | Prompt-chain Skill + 工具/权限 metadata |
| 本地模型 | `ai-model` / `lora` / `embedding` | MB~GB | ONNX / PyTorch / safetensors |
| Shader | `shader` / `shader-preset` | KB~MB | WGSL / GLSL 效果 |
| 插件 | `plugin` | KB~MB | 扩展 Neko 功能的代码包 |
| 创作素材 | `video` / `audio` / `image` / `sequence` | MB~GB | 媒体文件 |
| 预设/模板/LUT | `preset` / `template` / `lut` | KB~MB | 效果预设、项目模板 |

### 分发模式

| 模式 | 说明 |
|------|------|
| 官方 | Neko 团队发布，内置/推荐 |
| 私有 | 团队/企业内部使用，私有 registry |
| 共享 | 社区免费分享 |
| 售卖 | 付费资产，需支付集成 |

---

## 二、核心架构决策

### 决策 1：统一协议层 + 分离 UI 入口

**结论**：底层市场基础设施统一，UI 入口跟随各扩展使用场景。

**理由**：用户在不同上下文下寻找不同类型的资产——在 neko-agent 里找 Skill，在 neko-cut 里找 Shader/LUT。但底层的搜索、下载、校验、授权逻辑完全相同，重复建设无意义。

### 决策 2：市场基础设施独立为 neko-market，不放在 neko-assets

**结论**：新建 `neko-market` 顶层包。

**消费者分析**：

```
谁需要市场能力？               谁需要本地素材管理？
├── neko-agent  → Skill        ├── neko-cut    → 媒体素材
├── neko-cut    → Shader/LUT   ├── neko-canvas → 画布素材
├── neko-canvas → 素材         ├── neko-story  → 引用素材
├── neko-model  → 3D 模型      └── neko-tools  → Diff
├── neko-sketch → 笔刷/素材
└── 几乎所有扩展
```

**关键矛盾**：neko-agent 需要 Skill 市场，但完全不需要 Entity→Variant→File 三层层级。如果市场放在 neko-assets 里，neko-agent 被迫依赖不需要的本地素材管理模块。

**对比**：

| 因素 | 放 neko-assets | 独立 neko-market |
|------|---------------|-----------------|
| neko-agent 依赖 | 被迫依赖不需要的 AssetLibrary | 只依赖 market-core |
| 职责 | 本地管理 + 远程分发混在一起 | 各司其职（SRP） |
| 依赖隔离 | HTTP/auth 库污染 neko-assets | 隔离在 market-core |
| 复用性 | 新扩展要市场 → 必须依赖 neko-assets | 只依赖轻量 market-core |
| 独立演进 | 市场 API 变化频繁，拖累 neko-assets | 独立版本迭代 |

### 决策 3：市场类型定义放 @neko/shared

**结论**：市场专有类型在 `neko-types/src/types/asset/market.ts`，与 `AssetManifest` / `AssetDistribution` 放在一起。

**理由**：类型契约源统一在 @neko/shared，市场类型是 AssetManifest 的自然扩展。

---

## 三、包结构

```
packages/
├── neko-types/src/types/asset/          ← 所有类型定义（含市场类型）
│   ├── manifest.ts                        AssetManifest / AssetDistribution（扩展）
│   ├── registry.ts                        IAssetRegistry / IAssetHandler
│   └── market.ts                          MarketQuery / MarketPackage / 市场专有类型 ✅
│
├── neko-market/                         ← 市场基础设施 ✅
│   └── packages/
│       ├── core/                          @neko/market-core（零 vscode 依赖）✅
│       │   ├── MarketClient.ts            HTTP API 客户端（搜索/详情/下载 URL）
│       │   ├── InstallManager.ts          下载/校验/解压 + InstallTargetRegistry
│       │   ├── LicenseManager.ts          授权验证（stub，Phase 6.5.5 完整实现）
│       │   ├── CacheManager.ts            .neko/market-cache/ 管理
│       │   ├── VersionResolver.ts         semver 解析/兼容性检查
│       │   └── InstalledRegistry.ts       ~/.neko/market-installed.json 持久化
│       │
│       ├── extension/                     neko.neko-market VSCode 扩展 ✅
│       │   └── src/
│       │       ├── index.ts               activate/deactivate + 命令注册
│       │       ├── MarketplaceProvider.ts WebviewViewProvider（Activity Bar 侧边栏）
│       │       ├── MarketplaceService.ts  包装 market-core，注入 Bearer token
│       │       ├── MarketplaceHandler.ts  market:* postMessage 路由
│       │       └── SkillInstallTarget.ts  IInstallTarget for Skill 类型
│       │
│       └── webview/                       @neko/market-webview React UI ✅
│           └── src/
│               ├── components/
│               │   ├── MarketplaceApp.tsx  根组件（Tab 路由 + 消息处理）
│               │   ├── BrowseView.tsx      Featured + 搜索结果
│               │   ├── InstalledView.tsx   已安装列表
│               │   ├── UpdatesView.tsx     可用更新
│               │   ├── AssetCard.tsx       统一资产卡片
│               │   └── SearchBar.tsx       搜索 + 类型过滤
│               ├── stores/marketplaceStore.ts  Zustand（slices + error state）
│               ├── messages/index.ts       类型安全 postMessage builder
│               └── i18n/                   EN + ZH-CN 国际化
│
├── neko-assets/                         ← 现有：本地素材管理（Phase 6.5.4 扩展）
│   └── …
│
└── neko-agent/                          ← 现有：Skill 市场深链接入口 ✅
    └── …SkillMarketPanel               "Open in Marketplace" banner
```

### 依赖关系

```
                    @neko/shared (types + i18n + logger + theme)
                         ▲
                         │
                  @neko/market-core          ← 纯协议 + HTTP + 下载（Layer 0）
                    ▲         ▲
                    │         │
          neko-market/      neko-agent        ← 各自的 UI + 安装逻辑
          extension/        SkillMarket
          webview/          (深链接入口)
             ▲
             │
         cli-tui             ← /market 命令（直接依赖 market-core，无 vscode）
```

---

## 四、类型扩展

### 4.1 AssetDistribution — 补充市场字段

```typescript
// manifest.ts — 扩展现有 AssetDistribution

/** 分发信息 */
export interface AssetDistribution {
  // --- 现有字段 ---
  license: string;
  author: string;
  tags: string[];
  description?: string;
  homepage?: string;
  downloads?: number;
  checksum: string;

  // --- 市场扩展 ---
  /** 可见性 */
  visibility: 'public' | 'private' | 'shared' | 'paid';
  /** 发布者 ID */
  publisherId: string;
  /** 发布者显示名 */
  publisherName: string;
  /** 官方认证 */
  verified?: boolean;
  /** 定价信息 */
  pricing?: AssetPricing;
  /** 评分 */
  rating?: { average: number; count: number };
  /** 预览截图 URL */
  screenshots?: string[];
  /** 变更日志 */
  changelog?: string;
  /** 兼容性要求 */
  compatibility?: AssetCompatibility;
}

/** 定价模型 */
export interface AssetPricing {
  model: 'free' | 'one-time' | 'subscription';
  amount?: number;
  currency?: string;
}

/** 兼容性约束 */
export interface AssetCompatibility {
  /** Neko Suite 版本要求（semver range） */
  nekoVersion: string;
  /** Rust 引擎版本要求 */
  engineVersion?: string;
}
```

### 4.2 AssetManifestSource.registry — 扩展

```typescript
// manifest.ts — 扩展 registry source

export type AssetManifestSource =
  | { kind: 'local'; path: string }
  | { kind: 'git-lfs'; oid: string; path: string }
  | {
      kind: 'registry';
      registry: string;      // 注册表 URL（官方/私有）
      package: string;        // 命名空间包名: @publisher/package
      version: string;        // semver
      integrity?: string;     // SRI hash（sha256-xxx / sha384-xxx）
    }
  | { kind: 'ai-generated'; taskId: string; model: string };
```

### 4.3 SkillMetadata — 新增

```typescript
// manifest.ts — 加入 AssetTypeMetadata 联合

/** Skill 元数据 */
export interface SkillMetadata {
  /** 领域标签 */
  domain: string[];
  /** 依赖的 ToolSet */
  toolSets?: string[];
  /** 依赖的 MCP 服务 */
  mcpServers?: string[];
  /** LLM 能力要求 */
  llmRequirements?: {
    capabilities: ('vision' | 'function-calling' | 'streaming')[];
    minContextWindow?: number;
  };
}

/** 类型特化元数据联合 */
export type AssetTypeMetadata =
  | { type: 'shader'; data: ShaderMetadata }
  | { type: 'model'; data: ModelMetadata }
  | { type: 'plugin'; data: PluginMetadata }
  | { type: 'preset'; data: PresetMetadata }
  | { type: 'skill'; data: SkillMetadata };     // ← 新增
```

---

## 五、安装生命周期

```
用户点击安装
  │
  ▼
MarketClient.fetchManifest(packageId, version)
  │
  ▼
LicenseManager.verify(manifest, userCredentials)
  │  ← 付费资产需验证授权
  ▼
InstallManager.download(manifest.source)
  │  ← 下载到 .neko/market-cache/
  ▼
InstallManager.verify(file, manifest.distribution.checksum)
  │  ← SRI 完整性校验
  ▼
IAssetHandler.validate(filePath)
  │  ← 类型特化校验（Shader 语法 / 模型格式 / Skill 依赖）
  ▼
IAssetHandler.onInstall(id, manifest)
  │  ← 类型特化安装（复制到目标位置 + 注册到运行时）
  ▼
IAssetRegistry.register(manifest)    // source.kind = 'registry'
  │
  ▼
AssetChangeEvent { kind: 'registered' }
  │  ← 通知所有消费者
  ▼
完成
```

### 各类型安装目标

| 类型 | 安装位置 | 运行时注册 |
|------|----------|-----------|
| Skill | `.neko/skills/{publisher}/{name}/` | 安装时拒绝 workflow DSL 字段；SkillService 扫描加载 |
| 本地模型 | `.neko/models/{framework}/{name}/` | EngineClient 注册 |
| Shader | `.neko/shaders/{name}/` | EffectDispatcher 注册 |
| 插件 | `.neko/plugins/{name}/` | PluginHost 动态加载 |
| 素材 | 用户指定的 MediaLibrary 路径 | AssetLibrary 索引 |
| LUT/预设/模板 | `.neko/presets/{type}/{name}/` | 各编辑器加载 |

---

## 六、@neko/market-core 接口设计

### MarketClient

```typescript
/**
 * IMarketClient — market registry HTTP API client.
 *
 * Handles communication with market backend (official / private registries).
 * Zero vscode dependency.
 */
export interface IMarketClient {
  /** Search packages across all types */
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;

  /** Get full package detail */
  getPackage(packageId: string): Promise<MarketPackage | undefined>;

  /** Get all versions of a package */
  getVersions(packageId: string): Promise<MarketPackageVersion[]>;

  /** Get download URL for a specific version */
  getDownloadUrl(packageId: string, version: string): Promise<string>;

  /** List featured / recommended packages */
  getFeatured(type?: AssetType): Promise<MarketPackage[]>;

  /** Get packages by publisher */
  getByPublisher(publisherId: string): Promise<MarketPackage[]>;
}

/** Market search query */
export interface MarketSearchQuery {
  text?: string;
  types?: AssetType[];
  tags?: string[];
  visibility?: ('public' | 'shared' | 'paid')[];
  sort?: 'relevance' | 'downloads' | 'rating' | 'updated';
  limit?: number;
  offset?: number;
}

/** Market search result */
export interface MarketSearchResult {
  items: MarketPackage[];
  total: number;
  hasMore: boolean;
}

/** Market package (remote manifest + market metadata) */
export interface MarketPackage {
  /** Package ID (@publisher/name) */
  id: string;
  /** Latest manifest snapshot */
  manifest: AssetManifest;
  /** Install state on current machine */
  installState: 'not-installed' | 'installed' | 'update-available' | 'installing';
  /** Installed version (if any) */
  installedVersion?: string;
}

/** Package version entry */
export interface MarketPackageVersion {
  version: string;
  releasedAt: number;
  changelog?: string;
  compatibility?: AssetCompatibility;
  downloadSize: number;
}
```

### InstallManager

```typescript
/**
 * IInstallManager — handles download, verification, and installation.
 */
export interface IInstallManager {
  /** Install a package from market */
  install(packageId: string, version: string): Promise<InstallResult>;

  /** Uninstall a package */
  uninstall(packageId: string): Promise<void>;

  /** Update to a new version */
  update(packageId: string, targetVersion: string): Promise<InstallResult>;

  /** List all installed market packages */
  listInstalled(): Promise<InstalledPackage[]>;

  /** Check for updates across all installed packages */
  checkUpdates(): Promise<UpdateInfo[]>;

  /** Subscribe to install progress */
  onProgress: vscode.Event<InstallProgress>;
}

export interface InstallProgress {
  packageId: string;
  phase: 'downloading' | 'verifying' | 'validating' | 'installing' | 'done' | 'error';
  /** 0-100 */
  percent: number;
  error?: string;
}

export interface InstallResult {
  success: boolean;
  installedPath: string;
  manifest: AssetManifest;
  error?: string;
}

export interface InstalledPackage {
  packageId: string;
  version: string;
  installedAt: number;
  installedPath: string;
  manifest: AssetManifest;
}

export interface UpdateInfo {
  packageId: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
}
```

### LicenseManager

```typescript
/**
 * ILicenseManager — handles authorization and entitlement verification.
 */
export interface ILicenseManager {
  /** Verify user is entitled to install this package */
  verify(manifest: AssetManifest): Promise<LicenseVerifyResult>;

  /** Initiate purchase flow for paid assets */
  purchase(packageId: string): Promise<PurchaseResult>;

  /** Get current user's entitlements */
  getEntitlements(): Promise<Entitlement[]>;
}

export interface LicenseVerifyResult {
  allowed: boolean;
  reason?: 'free' | 'purchased' | 'subscription' | 'private-access';
  error?: 'not-purchased' | 'expired' | 'no-access';
}
```

---

## 七、实施路径

```
Phase 6.5.1 ✅ — 基础设施（@neko/market-core）
├── 扩展 @neko/shared 类型（25+ 类型 + 6 核心接口）
├── MarketClient / InstallManager / CacheManager / VersionResolver
├── IntegrityChecker / InstalledRegistry / LicenseManager（stub）
├── DownloadService + InstallTargetRegistry（注册表模式，支持多品类）
└── dependency-cruiser Layer 0 隔离规则 + 7 测试文件 / 58 用例

Phase 6.5.2 ✅ — Skill 市场 MVP（neko-agent 侧边栏）
├── SkillInstallTarget → ~/.neko/skills/{publisher}/{name}/ + SkillService 热加载
├── SkillAssetHandler：SKILL.md 校验 + 元数据提取
├── SkillMarketService + SkillMarketHandler
└── 基础 Browse / Installed / Updates UI（嵌入 neko-agent webview）

Phase 6.5.3 ✅ — 独立 Marketplace Webview 面板
├── neko.neko-market 独立 VSCode 扩展（Activity Bar 侧边栏）
├── MarketplaceProvider + MarketplaceService + MarketplaceHandler
├── React Webview：Browse / Installed / Updates 三 Tab
├── 统一基础设施：nekoTailwindPreset + I18nService + ConsoleLogger + toBaseError
├── CLI TUI /market 命令（Layer 0，直接依赖 market-core）
└── neko-agent SkillMarketPanel 深链接入口

Phase 6.5.4 ✅ — 多品类 InstallTarget
├── ShaderInstallTarget：shader / shader-preset → ~/.neko/shaders/{publisherId}/{name}/
├── ModelInstallTarget：ai-model / lora / embedding → ~/.neko/models/{framework}/{name}/
├── PresetInstallTarget：preset / template / lut → ~/.neko/presets/{presetType}/{name}/
└── MarketplaceService 注册全 9 种类型（skill + 2 shader + 3 model + 3 preset）

Phase 6.5.5 — 消费端集成 + 热加载（待开发）
├── neko-market activate() 导出 NekoMarketAPI（onDidInstall / onDidUninstall / getInstalled）
├── neko-cut EffectDispatcher 扫描 ~/.neko/shaders/ + 订阅 onDidInstall 热重载
├── neko-cut LUT 面板扫描 ~/.neko/presets/lut/ + 转场选择器扫描 ~/.neko/presets/transition/
├── neko-agent ModelManager 扫描 ~/.neko/models/（generation 工具自动发现可用模型）
└── 私有 registry 支持（MarketClient 可配 registryUrl，团队/企业自建）

Phase 6.5.7 — Registry Server + 商业化（待开发）
├── Registry Server 实现（详见第九节）
│   ├── S1: 最小 Server（Package API + SQLite + Docker）
│   ├── S2: 对象存储 + 预签名直传 + 发布能力
│   ├── S3: 上游代理（HF/Civitai 适配器 + 缓存，对客户端透明）
│   └── S4: 商业化（付费授权 + 支付 + 发布者 Portal）
├── 客户端 registryUrl 固定为官方地址，第三方源聚合为服务端职责
├── LicenseManager 完整实现（JWT + 在线校验）
├── 付费资产 + 支付集成
├── 发布者后台（上传/审核/数据分析）
└── 评分/评论系统 + 推荐算法
```

---

## 八、与现有系统的关系

### 职责边界

**工具型资产**（Shader / AI 模型 / Preset）由 neko-market 负责安装，由消费扩展直接读取，**不经过 neko-assets**：

```
neko-market 安装到 ~/.neko/{shaders|models|presets}/
    ↓ 消费扩展各自扫描目录
neko-cut（EffectDispatcher / LUT 面板）
neko-agent（ModelManager）
```

**内容素材**（媒体文件 / 文档 / AI 生成内容）由 neko-assets 管理，neko-market 不参与索引。

### 系统关系表

| 现有系统 | 关系 | 说明 |
|----------|------|------|
| AssetManifest | **扩展** | 补充 Distribution / SkillMetadata 字段 |
| neko-assets / AssetLibrary | **平行** | 工具型资产不入 AssetLibrary；内容素材不经 market |
| SkillService | **集成** | 市场安装后触发 Skill 热加载（neko-agent 文件监听）|
| EffectDispatcher | **集成（Phase 6.5.5）** | 订阅 NekoMarketAPI.onDidInstall 热重载 Shader |
| @neko/model-runtime | **集成（Phase 6.5.5）** | onPostInstall 自动注册模型到对应运行时（Ollama/ComfyUI/ONNX） |
| neko-auth | **可选集成** | Bearer token 注入，无 neko-auth 时降级为匿名 |

### AI 模型部署流程

> 详细架构见 [model-runtime.md](./model-runtime.md)

市场安装的 AI 模型（`ai-model` / `lora` / `embedding`）通过 `@neko/model-runtime` 自动部署到对应运行时：

```
neko-market 安装模型文件 → ~/.neko/models/{framework}/{name}/
    ↓ ModelInstallTarget.onPostInstall()
    ↓ pickRuntime(framework, task)
    ├── GGUF → OllamaRuntime.registerModel() → ollama create
    ├── safetensors (image/video) → ComfyUIRuntime.registerModel() → symlink
    ├── ONNX → EngineOnnxRuntime.registerModel() → EngineClient
    └── safetensors (tts/audio) → PythonRuntime.registerModel()
    ↓
    ↓ GpuResourceManager 记录 VRAM 需求
    ↓
消费扩展使用：
    ├── neko-agent: ComfyUIMediaAdapter / OllamaAdapter（本地优先，VRAM 不足回退云端）
    └── neko-engine: ONNX 模型直接加载到 GPU 管线
```

---

## 九、Registry Server 架构

> neko-market 客户端（`MarketClient`）已实现完整的搜索/安装/管理协议，本节描述对应的后端服务架构。当前 `DEFAULT_REGISTRY_URL` 指向 `https://market.neko.dev/api/v1`。

### 核心架构决策

**决策 1：薄 API + 对象存储直传**

API 服务器只处理元数据和鉴权，文件下载通过对象存储预签名 URL 直传。AI 模型 2-15 GB，不能过 API 代理；预签名 URL 让客户端直接从存储下载，对象存储原生支持 Range 请求（断点续传）。

```
客户端                      Registry Server                 对象存储
  │─── GET /download ───────────▶│                             │
  │                              │── 鉴权 + 生成预签名 URL ──▶│
  │◀── { url: "签名URL" } ──────│                             │
  │─── GET 签名URL（直传）──────────────────────────────────▶│
  │◀── 文件流（支持 Range）──────────────────────────────────│
```

**决策 2：不单独配 CDN，存储选型自带加速**

90% 的资产（Skill/Shader/Preset/LUT）在 KB-MB 级别，任何存储直传都够快；大文件低频单次下载，CDN 缓存命中率极低。按用户地域选存储：

| 用户分布 | 推荐存储 | 加速能力 |
|---------|---------|---------|
| 中国为主 | 阿里云 OSS | OSS 加速 + 按需开 CDN |
| 海外为主 | Cloudflare R2 | 自带 Cloudflare CDN，**零出站费** |
| 全球分布 | OSS（国内）+ R2（海外）双存储 | 各自加速 |

**决策 3：上游代理模式（借鉴 Verdaccio）**

支持配置上游源（HuggingFace / Civitai / 其他 neko registry），首次请求代理下载并缓存到本地存储，用户无需离开 neko-market 即可访问 HF / Civitai 模型。

**决策 4：客户端 registryUrl 固定，不支持多 Registry**

客户端 `registryUrl` 固定为 `https://market.neko.dev/api/v1`，第三方源聚合是**服务端职责**（通过 upstreams 代理 HF/Civitai，对客户端透明），避免碎片化。

### 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                   Neko Market Registry Server                 │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│  │ Package   │  │ Upload    │  │ Upstream  │  │ Auth      │ │
│  │ API       │  │ Service   │  │ Proxy     │  │ Service   │ │
│  │ 搜索/详情 │  │ 分片上传   │  │ HF 适配   │  │ JWT 验证  │ │
│  │ 版本管理  │  │ 完整性校验 │  │ Civitai  │  │ 发布者    │ │
│  │ 下载 URL  │  │ 元数据提取 │  │ 缓存管理  │  │ 付费授权  │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │
│  ┌─────┴──────────────┴───────────────┴───────────────┴─────┐ │
│  │  Metadata DB (PostgreSQL / SQLite)  Object Store (S3/R2) │ │
│  └───────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### API 设计

**Package API（复用 IMarketClient 契约）**

```
# 读操作（匿名可用）
GET  /api/v1/packages?q=&types=&tags=&sort=&page=&pageSize=
GET  /api/v1/packages/:id
GET  /api/v1/packages/:id/versions
GET  /api/v1/packages/:id/versions/:ver/download    # 返回预签名 URL
GET  /api/v1/featured?type=

# 写操作（需认证）
POST /api/v1/packages
POST /api/v1/packages/:id/versions
PUT  /api/v1/packages/:id
DEL  /api/v1/packages/:id/versions/:ver

# LocalAI Gallery（供 LocalAI GALLERIES 配置使用）
GET  /api/v1/gallery.yaml
```

**Upload API（大文件分片直传）**

```
POST /api/v1/upload/init     → { uploadId, parts: [{ partNumber, presignedUrl }] }
POST /api/v1/upload/complete → { success, downloadUrl }
POST /api/v1/upload/direct   multipart/form-data（< 100MB）
```

**Publisher API**

```
POST /api/v1/publishers/register
GET  /api/v1/publishers/:id
GET  /api/v1/publishers/:id/packages
PUT  /api/v1/publishers/:id
```

### 上游代理配置

```yaml
# registry-config.yaml
upstreams:
  huggingface:
    url: "https://huggingface.co"
    protocol: "huggingface"
    enabled: true
    cache: true
    cache_ttl: "7d"
    types: ["ai-model", "lora", "embedding"]
    auth_token: "${HF_TOKEN}"

  civitai:
    url: "https://civitai.com/api/v1"
    protocol: "civitai"
    enabled: true
    cache: true
    types: ["ai-model", "lora", "embedding"]
    read_only: true

  team-registry:
    url: "https://market.mycompany.com/api/v1"
    protocol: "neko"
    enabled: true
    cache: true
    auth_token: "${TEAM_TOKEN}"
```

搜索时并发查询本地 DB + 上游，合并去重后标记来源（`source: 'local' | 'huggingface' | 'civitai'`）。上游模型下载时：本地缓存命中直接返回预签名 URL，未命中则从上游下载后缓存。

### 数据模型

```sql
CREATE TABLE packages (
  id          TEXT PRIMARY KEY,         -- @publisher/name
  name        TEXT NOT NULL,
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  type        TEXT NOT NULL,            -- skill/shader/ai-model/lora/...
  visibility  TEXT NOT NULL DEFAULT 'public',
  tags        TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE versions (
  id          SERIAL PRIMARY KEY,
  package_id  TEXT NOT NULL REFERENCES packages(id),
  version     TEXT NOT NULL,
  storage_path TEXT NOT NULL,           -- S3 key
  checksum    TEXT NOT NULL,            -- sha256
  manifest    JSONB NOT NULL,           -- AssetManifest 完整快照
  compatibility JSONB,
  downloads   BIGINT NOT NULL DEFAULT 0,
  UNIQUE(package_id, version)
);

CREATE TABLE licenses (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  package_id  TEXT NOT NULL REFERENCES packages(id),
  license_type TEXT NOT NULL,           -- one-time/subscription
  expires_at  TIMESTAMPTZ
);
```

### 权限模型

```
anonymous      搜索 + 下载 public 包
registered     + 发布包 + 管理自己的包
purchased      + 访问已购买的 paid 包
admin          + 管理所有包 + 审核 + 推荐设置
```

认证方式：复用 neko-auth JWT，Registry Server 验证签名，提取 userId 和 roles。

### 部署模式

**官方托管（SaaS）**：`market.neko.dev` — 轻量 VPS/Serverless + PostgreSQL（Neon 免费层）+ Cloudflare R2 或阿里云 OSS。月成本约 $20（R2 方案）或 ¥100-300（OSS 方案）。

**私有部署（Docker 单容器）**：

```bash
docker run -d -p 4873:4873 \
  -v neko-registry-data:/data \
  -e DATABASE_TYPE=sqlite \
  -e STORAGE_TYPE=local \
  neko/market-registry
```

SQLite 元数据 + 本地文件存储（零外部依赖）。私有部署的 Registry 作为官方 Registry 的上游数据源，或用于企业内部独立使用。

### 技术选型

| 组件 | 推荐 | 理由 |
|------|------|------|
| API 框架 | Hono (TS) | 轻量，Cloudflare Workers 兼容，TS 与客户端类型共享 |
| 数据库 | PostgreSQL / SQLite（私有） | PostgreSQL 生产级；SQLite 零依赖私有部署 |
| 对象存储 | Cloudflare R2 / 阿里云 OSS | R2 零出站 + CDN；OSS 国内最优 |
| 搜索 | PostgreSQL 全文搜索 / MeiliSearch（大规模时） | 初期 PG tsvector 足够 |

### 实施路径

```
Phase S1 — 最小 Registry Server
├── Package API + SQLite + 本地文件存储 + 基础认证（API key）+ Docker 镜像

Phase S2 — 对象存储 + 发布能力
├── S3/R2/OSS 存储后端 + 预签名 URL 直传
├── Upload API（小文件直传 + 大文件分片）
└── Publisher 注册 + 包发布 + neko-auth JWT 集成

Phase S3 — 上游代理
├── HuggingFace + Civitai 上游适配器 + 透明缓存
└── 私有 registry 上游链式代理

Phase S4 — 商业化
├── 可见性控制（public/private/paid）
├── LicenseManager 服务端实现 + 支付集成
└── 发布者 Portal Web UI + 评分评论系统
```
