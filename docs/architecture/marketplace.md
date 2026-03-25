# 市场平台架构

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [format-strategy.md](./format-strategy.md) · [remote-storage.md](./remote-storage.md)

---

## 一、背景

Neko Suite 需要一个统一的市场平台，管理官方、私有、共享、售卖的各类资产分发。

### 覆盖品类

| 品类 | 类型标识 | 典型大小 | 来源 |
|------|---------|---------|------|
| Agent Skill | `skill` | KB | 提示词模板 + 工具集声明 |
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
| Skill | `.neko/skills/{publisher}/{name}/` | SkillService 扫描加载 |
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

Phase 6.5.6 — 商业化（待开发）
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
| EngineClient | **集成（Phase 6.5.5）** | ModelManager 扫描 ~/.neko/models/ 自动发现模型 |
| neko-auth | **可选集成** | Bearer token 注入，无 neko-auth 时降级为匿名 |
