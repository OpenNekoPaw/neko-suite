# 本地存储与缓存策略

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [format-strategy.md](./format-strategy.md) · [marketplace.md](./marketplace.md)

---

## 一、背景

neko-suite 各扩展在本地存储了多种数据：项目配置、媒体缓存、代理视频、AI 生成物、向量索引等。当前存在三个问题：

1. **源数据与派生数据混放** — `.neko/` 目录下既有应提交 Git 的配置（settings.json），又有不应提交的缓存（cache/、proxies/、generated/），`.gitignore` 需精确排除每个子目录，容易遗漏
2. **路径硬编码分散** — 各服务各自拼路径（`path.join(workspaceRoot, '.neko', 'cache', ...)`），无统一管理
3. **缺少关系索引** — 二进制文件之间的引用关系隐式嵌在各项目文件的 `src` 字段中，无法回答"谁引用了这个视频"或"哪些素材没人用"

本 ADR 统一了存储布局、明确了缓存策略、设计了资产关系图。

---

## 二、三级存储布局

### 核心决策：源数据与派生数据物理分离

```
~/.neko/                              # L0: 用户级（全局，跨项目共享）
├── config.json                       #   用户配置（LLM 偏好等）
├── global-memory.md                  #   全局 Agent 记忆
├── market-cache/                     #   市场包下载缓存（LRU）
├── market-installed.json             #   已安装包注册表
├── auth.json                         #   认证令牌
└── conversations/                    #   对话历史（按项目 hash 分片）

<project>/.neko/                      # L1: 项目级（提交 Git）
├── settings.json                     #   团队共享设置（媒体库路径等）
├── settings.local.json               #   个人覆盖（.gitignore）
├── config.json                       #   MCP 服务器配置
└── memory.md                         #   项目 Agent 记忆

<project>/.neko/.cache/               # L2: 项目级缓存（不提交 Git，可重建）
├── media-metadata.json               #   媒体元数据缓存
├── asset-graph.json                  #   资产关系图
├── vectors/                          #   向量持久化
│   ├── scripts.json                  #     剧本场景嵌入
│   └── assets.json                   #     资产描述嵌入
├── proxies/                          #   代理视频
│   ├── manifest.json
│   └── <hash>_proxy.mp4
├── generated/                        #   AI 生成物
│   ├── index.json
│   ├── images/
│   ├── videos/
│   └── audios/
└── thumbnails/                       #   缩略图缓存
```

### 分层理由

| 层级 | 生命周期 | 可提交 Git | 可删除重建 | 示例 |
|------|----------|-----------|-----------|------|
| **L0 用户级** | 随用户账号 | N/A | 部分（缓存可以，配置不行） | market-cache, config |
| **L1 项目级** | 随项目 | ✅ 应当提交 | ❌ 不可重建 | settings, memory |
| **L2 项目缓存** | 随项目 | ❌ 不提交 | ✅ 可重建/重新生成 | metadata cache, proxies, vectors |

### .gitignore 策略

```gitignore
# L2 缓存整目录排除 — 一行搞定
.neko/.cache/

# L1 中个人覆盖文件排除
.neko/settings.local.json
```

对比当前方案需要逐个排除 `cache/`、`proxies/`、`generated/` 等目录，新方案只需一行。

### generated/ 归属说明

AI 生成物严格来说不可精确复现（同 prompt 不同结果），但归入 `.cache/` 是合理的：

- `index.json` 记录了 prompt/model/参数，可"近似重建"
- 二进制大文件不适合提交 Git
- 用户若需要版本控制某个生成物，应通过 AssetLibrary 显式导入为正式资产
- `.cache/` 的语义是"本地持久但不提交"，而非"可随意丢弃"

---

## 三、统一路径管理

### IStorageLayout 接口

```typescript
// @neko/shared/types/storage.ts

interface IStorageLayout {
  /** L0: ~/.neko/ */
  global: {
    root: string;
    config: string;
    marketCache: string;
    marketInstalled: string;
    conversations: string;
    globalMemory: string;
  };

  /** L1: <workspace>/.neko/ */
  project: {
    root: string;
    settings: string;
    settingsLocal: string;
    config: string;
    memory: string;
  };

  /** L2: <workspace>/.neko/.cache/ */
  cache: {
    root: string;
    mediaMetadata: string;
    assetGraph: string;
    vectors: string;
    proxies: string;
    proxyManifest: string;
    generated: string;
    generatedIndex: string;
    thumbnails: string;
  };
}
```

### 工厂函数

```typescript
import * as path from 'path';
import * as os from 'os';

function resolveStorageLayout(workspaceRoot: string): IStorageLayout {
  const globalRoot = path.join(os.homedir(), '.neko');
  const projectRoot = path.join(workspaceRoot, '.neko');
  const cacheRoot = path.join(projectRoot, '.cache');

  return {
    global: {
      root: globalRoot,
      config: path.join(globalRoot, 'config.json'),
      marketCache: path.join(globalRoot, 'market-cache'),
      marketInstalled: path.join(globalRoot, 'market-installed.json'),
      conversations: path.join(globalRoot, 'conversations'),
      globalMemory: path.join(globalRoot, 'global-memory.md'),
    },
    project: {
      root: projectRoot,
      settings: path.join(projectRoot, 'settings.json'),
      settingsLocal: path.join(projectRoot, 'settings.local.json'),
      config: path.join(projectRoot, 'config.json'),
      memory: path.join(projectRoot, 'memory.md'),
    },
    cache: {
      root: cacheRoot,
      mediaMetadata: path.join(cacheRoot, 'media-metadata.json'),
      assetGraph: path.join(cacheRoot, 'asset-graph.json'),
      vectors: path.join(cacheRoot, 'vectors'),
      proxies: path.join(cacheRoot, 'proxies'),
      proxyManifest: path.join(cacheRoot, 'proxies', 'manifest.json'),
      generated: path.join(cacheRoot, 'generated'),
      generatedIndex: path.join(cacheRoot, 'generated', 'index.json'),
      thumbnails: path.join(cacheRoot, 'thumbnails'),
    },
  };
}
```

### 迁移策略

启动时一次性迁移旧路径：

| 旧路径 | 新路径 |
|--------|--------|
| `.neko/cache/media-metadata.json` | `.neko/.cache/media-metadata.json` |
| `.neko/proxies/` | `.neko/.cache/proxies/` |
| `.neko/generated/` | `.neko/.cache/generated/` |

```typescript
async function migrateStorageLayout(layout: IStorageLayout): Promise<void> {
  const migrations: Array<[string, string]> = [
    [path.join(layout.project.root, 'cache'), path.join(layout.cache.root)],
    [path.join(layout.project.root, 'proxies'), layout.cache.proxies],
    [path.join(layout.project.root, 'generated'), layout.cache.generated],
  ];

  for (const [oldPath, newPath] of migrations) {
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
      await fs.promises.rename(oldPath, newPath);
    }
  }
}
```

---

## 四、资产库跨项目策略

### 问题

AssetLibrary（`library.json`）当前是项目级的，每个项目独立维护一份素材 Entity/Variant/File 层级。但创意团队有跨项目共享资产的核心需求：

- 同一角色在多个项目中使用（电影、预告片、海报）
- 团队共享素材库放在 NAS/共享盘上
- Marketplace 安装的工具（Shader/Model/Preset）天然是全局的

### 现状：四个独立的资产域

| 域 | 存储位置 | 作用域 | 管理方式 |
|---|---|---|---|
| **AssetLibrary** | `<project>/.neko/assets/library.json` | 项目 | Entity→Variant→File 层级 |
| **MediaLibraryPaths** | `<project>/.neko/settings.json` | 团队 | 路径变量（`${VARIABLE}`） |
| **GeneratedAssets** | `<project>/.neko/.cache/generated/` | 项目 | JSON index + 二进制文件 |
| **Marketplace** | `~/.neko/market-installed.json` | 用户 | IAssetHandler 注册 |

### 决策：不做全局 AssetLibrary，用"共享素材库描述符"模式

| 方案 | 优点 | 缺点 |
|------|------|------|
| A: 全局 `~/.neko/library.json` | 简单 | 所有项目素材混在一起，无法区分归属 |
| B: 全局数据库（SQLite） | 可查询 | 重依赖，单项目也要跑数据库 |
| **C: 共享素材库目录 + 各项目按需引用** | 现有架构已支持；项目间松耦合 | 需要"导入引用"的 UI |

选择方案 C，因为现有基础设施已覆盖大部分：

- `MediaLibraryEntry` 可指向共享目录
- `PathResolver` 用 `${VARIABLE}` 做路径可移植
- `settings.local.json` 做跨机器路径适配
- `AssetOwnership.scope` 已预留 `'team'` 枚举值

### 共享素材库描述符（`.neko-library.json`）

共享素材库是一个独立于任何项目的目录，内含 `.neko-library.json` 描述文件：

```
/Volumes/TeamNAS/characters/          # 共享素材库根目录
├── .neko-library.json                # 素材库描述符（Entity/Variant 元数据）
├── hero/
│   ├── front_neutral.png
│   ├── front_angry.png
│   └── side_walk.png
└── villain/
    ├── portrait.png
    └── full_body.png
```

```typescript
// @neko/shared/types/asset/library-descriptor.ts

/** A standalone library descriptor, lives alongside the media files */
interface LibraryDescriptor {
  version: 1;
  name: string;                    // "Team Characters"
  id: string;                      // UUID, stable across renames
  entities: AssetEntity[];         // Same type as project library
}
```

### 项目引用共享库

通过 `settings.json` 中已有的 `mediaLibraries` 配置指向共享目录：

```json
// <project>/.neko/settings.json (team-shared, in git)
{
  "mediaLibraries": [
    {
      "name": "Team Characters",
      "path": "/Volumes/TeamNAS/characters",
      "variable": "TEAM_CHARS",
      "enabled": true
    }
  ]
}

// <project>/.neko/settings.local.json (machine-specific override)
{
  "mediaLibraryOverrides": {
    "TEAM_CHARS": "Z:\\TeamNAS\\characters"
  }
}
```

**行为规则**：

| 场景 | 行为 |
|------|------|
| 共享目录有 `.neko-library.json` | AssetRegistry 合并为**只读**实体 |
| 共享目录无 `.neko-library.json` | 仅作为文件搜索源（当前行为） |
| 项目内引用共享素材 | `.nkv` 中 `src: "${TEAM_CHARS}/hero/front_neutral.png"` |
| 共享库元数据变更 | FileWatcher 检测 → 触发 AssetChangeEvent |
| 共享目录离线（NAS 断开） | 实体标记 `status: 'offline'`，不从 registry 删除 |

### AssetRegistry 多源合并

```
AssetRegistry.query(filter)
  ↓ 合并三个来源（优先级从高到低）
  ├─ 1. 项目 library.json              (read-write, scope: 'project')
  ├─ 2. 共享库 .neko-library.json × N  (read-only, scope: 'shared')
  └─ 3. IAssetHandler (Marketplace)     (read-only, scope: 'marketplace')
```

```typescript
// AssetSource abstraction

interface AssetSource {
  id: string;
  name: string;
  type: 'project' | 'shared' | 'marketplace';
  readonly: boolean;
  entities(): AssetEntity[];
}

interface IAssetRegistry {
  // Existing
  register(manifest: AssetManifest): Promise<void>;
  query(filter: AssetFilter): AssetEntity[];
  search(text: string): AssetEntity[];

  // New: multi-source awareness
  getSources(): AssetSource[];
  getEntitySource(entityId: string): AssetSource;
}
```

### 项目 library.json 职责收窄

```
项目 library.json 只存：
├─ 项目自有素材的 Entity/Variant/File
├─ 对共享库素材的"标注覆盖"（项目特定的 tags/notes）
└─ AI 生成物导入后的本地实体

不存：
├─ 共享库的 Entity 副本（来自 .neko-library.json，实时合并）
└─ Marketplace 安装的工具资产（来自 ~/.neko/）
```

### 各域配置方式总结

| 组件 | 跨项目？ | 需要配置？ | 方式 |
|------|----------|-----------|------|
| Marketplace 安装 | ✅ 全局 | ❌ 自动 | `~/.neko/` 全局目录 |
| 共享素材库 | ✅ 多项目共享 | ✅ 一次 | `settings.json` 指向共享目录 |
| 项目 library.json | ❌ 项目独立 | ❌ 自动 | `.neko/assets/library.json` |
| 向量索引 | ❌ 项目独立 | ❌ 自动 | `.neko/.cache/vectors/` |
| 资产关系图 | ❌ 项目独立 | ❌ 自动 | `.neko/.cache/asset-graph.json` |
| 缩略图缓存 | ❌ 项目独立 | ❌ 自动 | `.neko/.cache/thumbnails/` |

### 素材面板（neko.assetManager）合并视图

素材面板本身不跨项目，但展示来自多源的合并视图。项目自有素材可编辑，共享库和市场素材只读。

**树形结构变化**：

```
┌─ 素材管理 ──────────────────────────────────┐
│                                              │
│  ▼ 项目素材                   (read-write)   │  ← library.json
│    > Characters 3                            │
│    > Documents 1                             │
│                                              │
│  ▼ Team Characters [共享]      (read-only)   │  ← .neko-library.json
│    > Characters 2                            │
│      > Hero  5 variants                      │
│      > Villain  2 variants                   │
│                                              │
│  ▼ My Asset Pack [市场]       (read-only)    │  ← ~/.neko/ marketplace
│    > Shaders 12                              │
│    > Presets 5                               │
│                                              │
└──────────────────────────────────────────────┘
```

根节点按 AssetSource 分组，每个 Source 内按 Category → Entity → Variant 展开。

**Provider 改造**：

```typescript
// AssetManagerTreeProvider — before
const entities = this.assetLibrary.getAllEntities();

// AssetManagerTreeProvider — after
const sources = this.assetRegistry.getSources();
// Root level: AssetSource nodes (project / shared × N / marketplace)
// Each source: Category → Entity → Variant (same as before)
```

**各源交互权限**：

| 操作 | 项目素材 | 共享库素材 | 市场素材 |
|------|----------|-----------|----------|
| 预览 | ✅ | ✅ | ✅ |
| 添加到时间线/画布 | ✅ | ✅ | ✅ |
| 重命名 / 删除 | ✅ | ❌ | ❌ |
| 添加变体 | ✅ | ❌ | ❌ |
| 复制到项目 | — | ✅ 创建本地副本 | ✅ |
| 编辑标注（tags/notes） | ✅ | ⚠️ 项目级覆盖 | ❌ |

**"复制到项目"** 是关键操作：将共享库的 Entity 复制为项目自有素材（写入 library.json），之后可独立修改，不影响共享库原数据。

**项目级标注覆盖**：对共享库素材，项目可存储自己的 tags/notes 到 library.json 中（以 `overrides` 形式），不修改 `.neko-library.json` 本身：

```typescript
// library.json 中的覆盖条目
interface EntityOverride {
  sourceId: string;        // 共享库 ID
  entityId: string;        // 原始 Entity ID
  tags?: string[];         // 项目特定标签
  notes?: string;          // 项目备注
  projectAlias?: string;   // 项目内别名
}
```

### 素材面板与媒体库面板的分工

| 维度 | 素材（结构化视图） | 媒体库（文件系统视图） |
|------|-------------------|---------------------|
| **展示方式** | Source → Category → Entity → Variant | LibraryRoot → Directory → File |
| **数据来源** | library.json + .neko-library.json + marketplace | 磁盘目录浏览（settings.json 配置路径） |
| **核心价值** | 已整理、有结构的资产 | 未整理的原始素材文件 |
| **跨项目** | 共享库只读合并 | 直接浏览共享目录 |
| **编辑能力** | 管理 Entity/Variant 层级 | 纯浏览，不修改元数据 |
| **典型流程** | 媒体库浏览 → 拖入素材面板 → 整理为 Entity/Variant |

**简言之：媒体库是"仓库"（浏览原始文件），素材库是"货架"（结构化管理）。共享的是货架结构（`.neko-library.json`），不是把所有仓库混在一起。**

### 数据流全景

```
┌──────────────────────────────────────────────────────────────┐
│                     AssetRegistry (Facade)                    │
│                                                              │
│  ┌───────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ Project        │  │ Shared Libs    │  │ Marketplace    │  │
│  │ library.json   │  │ .neko-library  │  │ IAssetHandler  │  │
│  │ (read-write)   │  │ × N (readonly) │  │ (read-only)    │  │
│  └───────┬───────┘  └───────┬────────┘  └───────┬────────┘  │
│          │                   │                    │           │
│          └───────────┬───────┘────────────────────┘           │
│                      ▼                                        │
│          Unified query/search API                             │
│          (with source attribution)                            │
└──────────────────────────────────────────────────────────────┘
          │                    │                    │
     项目独有素材          共享角色库           全局 Shader
   (.neko/assets/)     (/NAS/characters/)    (~/.neko/shaders/)
```

### 历史面板（neko.assetHistory）演进

当前实现为简单的"最近 20 条 Entity"列表，价值有限——与 VSCode 内置的"最近打开文件"功能重叠，且无法回答"这个素材在哪里用了"。

**保留面板，分阶段增强**：

**Phase 1（当前）**：维持现状，简单的最近访问列表。

**Phase 2（依赖 AssetGraph）**：升级为"使用轨迹"，展示 Entity + 被引用的上下文：

```
┌─ 历史 ──────────────────────────────────────┐
│                                              │
│  ▼ 今天                                      │
│    🎬 hero/front_angry.png                   │
│       用于 scene-03.nkv (track 2)            │
│       用于 poster.nkc (node "hero-shot")     │
│                                              │
│    🎵 bgm_battle.wav                         │
│       用于 scene-03.nkv (audio track)        │
│                                              │
│  ▼ 昨天                                      │
│    🖼 villain/portrait.png                    │
│       AI 生成 → 导入素材库                    │
│                                              │
└──────────────────────────────────────────────┘
```

**数据来源**：
- 时间线：`entity.lastUsedAt`（已有）
- 使用上下文：`AssetGraph.getUsedBy(id)` 的 `uses` 边（Phase 2 新增）
- 操作类型：从 AssetGraph 的 `generated-by` / `derived-from` / `exported-from` 边推导

**与简单历史的差异**：

| 维度 | 当前（最近打开） | Phase 2（使用轨迹） |
|------|-----------------|-------------------|
| 展示 | Entity 名称 + 类型 | Entity + 在哪些项目文件中被引用 |
| 分组 | 无 | 按日期分组 |
| 可回答的问题 | "最近用了什么" | "这个素材在哪里用了""上次编辑涉及哪些素材" |
| 数据依赖 | library.json | library.json + AssetGraph |

---

## 五、资产关系图（Asset Graph）

### 问题

当前引用关系隐式分散在各项目文件中：

- `.nkv` 中 `MediaElement.src` 引用视频/图片
- `.nkc` 中节点引用生成图片
- `ProxyManifest` 记录代理映射
- `GeneratedAssetIndex` 记录 AI 生成物

无法回答：
- "谁在用 intro.mp4？" — 需遍历所有 .nkv 文件
- "哪些素材没被引用？" — 需交叉比对全部项目文件与文件系统
- "删除这个文件会影响什么？" — 无法评估

### 设计

```typescript
// @neko/shared/types/asset-graph.ts

/** Relation types between assets */
type AssetRelation =
  | 'uses'           // project.nkv uses intro.mp4
  | 'proxy-of'       // proxy.mp4 is proxy-of intro.mp4
  | 'derived-from'   // upscaled.png derived-from original.png
  | 'generated-by'   // image.png generated-by AI task
  | 'variant-of'     // hero_angry.png variant-of hero entity
  | 'exported-from'  // clip.mp4 exported-from project.nkv
  | 'linked-audio';  // video element linked to audio element

/** Graph edge */
interface AssetEdge {
  from: string;       // resourceId or relative path
  to: string;
  relation: AssetRelation;
  metadata?: Record<string, unknown>;
}

/** Graph node (lightweight, not duplicating AssetManifest) */
interface AssetNode {
  id: string;
  path: string;                // relative to project root
  mediaType: string;
  fingerprint: string;         // `${mtimeMs}:${size}` for fast staleness check
}

interface IAssetGraph {
  // Mutation
  addNode(node: AssetNode): void;
  addEdge(edge: AssetEdge): void;
  removeNode(id: string): void;
  removeEdgesFor(id: string): void;

  // Query
  getUsedBy(id: string): AssetEdge[];
  getDependencies(id: string): AssetEdge[];
  getOrphans(): AssetNode[];
  getRelated(id: string, depth?: number): AssetNode[];

  // Persistence
  persist(): Promise<void>;
  load(): Promise<void>;
}
```

### 数据来源（被动收集）

图不主动扫描文件系统，而是从各服务的已有事件中被动构建：

| 来源 | 触发时机 | 产生的边 |
|------|----------|----------|
| LSP MediaWorkspaceIndex | .nkv/.nkc/.nks 打开/保存 | `uses` |
| ProxyService | 代理生成完成 | `proxy-of` |
| GeneratedAssetIndex | AI 生成物写入 | `generated-by` |
| AssetRegistry | 资产注册 | `variant-of` |
| ExportService | 导出完成 | `exported-from` |
| 跨扩展工作流 | editImage / sendToTimeline | `derived-from` |

### 持久化

```
Phase 1: .neko/.cache/asset-graph.json — 邻接表 JSON
  适用：< 5K 节点（满足 99% 个人项目）
  格式：{ version: 1, nodes: AssetNode[], edges: AssetEdge[] }
  写入：debounced 1000ms atomic write

Phase 2（未来）: SQLite（若需要）
  触发条件：节点 > 5K 或需要复杂聚合查询
  实现：替换 IAssetGraph 实现，接口不变
```

### 指纹策略

```typescript
// Fast fingerprint: mtime + size (no full-file hash)
// Only compute content hash when deduplication is needed
function quickFingerprint(stat: fs.Stats): string {
  return `${stat.mtimeMs}:${stat.size}`;
}
```

---

## 六、向量持久化

### 问题

`ScriptEmbeddingIndex` 当前为纯内存实现，重启后丢失全部向量，需重新调用 Embed API（增加延迟和费用）。

### 决策：不引入向量数据库，用 IVectorStore 接口 + JSON 持久化

**理由**：

| 因素 | 分析 |
|------|------|
| 数据规模 | 单项目几百到几千条嵌入，线性扫描 < 1ms |
| 查询模式 | top-K cosine，K < 20 |
| 依赖成本 | 引入 sqlite-vec / hnswlib 增加 native 依赖负担 |
| 升级路径 | 接口抽象后，未来可透明切换 |

### IVectorStore 接口

```typescript
// @neko/shared/types/vector-store.ts

interface VectorEntry {
  id: string;
  vector: readonly number[];
  metadata: Record<string, unknown>;
}

interface VectorSearchResult {
  id: string;
  score: number;  // cosine similarity [0, 1]
  metadata: Record<string, unknown>;
}

interface IVectorStore {
  upsert(id: string, vector: number[], metadata: Record<string, unknown>): void;
  delete(id: string): void;
  search(query: number[], topK: number): VectorSearchResult[];
  size(): number;
  clear(): void;
  persist(): Promise<void>;
  load(): Promise<void>;
}
```

### 存储文件

```
.neko/.cache/vectors/
├── scripts.json       # ScriptEmbeddingIndex persistence
└── assets.json        # Asset description vectors (future)
```

格式：

```json
{
  "version": 1,
  "dimension": 1536,
  "entries": [
    {
      "id": "scene:file.fountain:3",
      "vector": [0.012, -0.034, ...],
      "metadata": { "heading": "INT. OFFICE - DAY", "lineStart": 10, "lineEnd": 25 }
    }
  ]
}
```

### 升级阈值

当单项目向量 > 50K 条，或需要跨项目全局搜索时，替换为 SQLite + vec 扩展。接口不变。

---

## 七、缓存契约标准化

### 问题

当前 6 套缓存各自实现，无法统一监控或管理。

### 决策：不统一实现，但标准化接口

各缓存的失效策略不同（mtime / TTL / LRU / 容量），强行统一是过度抽象。但应提取共享接口用于监控和管理。

```typescript
// @neko/shared/types/cache.ts

interface ICacheStats {
  name: string;
  hits: number;
  misses: number;
  evictions: number;
  entryCount: number;
  sizeBytes?: number;
}

interface ICacheManager {
  /** Report stats for monitoring */
  stats(): ICacheStats;
  /** Clear all cached data */
  clear(): void;
  /** Invalidate specific entry */
  invalidate(key: string): void;
}
```

### 现有缓存改进方向

| 缓存 | 当前问题 | 改进 | 优先级 |
|------|----------|------|--------|
| MediaMetadataCache | 全量加载 JSON，大项目启动慢 | 按需加载 + 分片 | P2 |
| ThumbnailService | 纯内存，跨会话丢失 | 加磁盘层到 `.cache/thumbnails/` | P2 |
| ScriptEmbeddingIndex | 纯内存，重启重算 | 持久化到 `.cache/vectors/` | P1 |
| MediaProbeCache | TTL 60s，无持久化 | 可接受（实时性要求高） | — |
| Market CacheManager | 已有 LRU + 磁盘 | 无需改动 | — |
| GPU AssetCache | VRAM 内存 | 无需改动 | — |

---

## 八、缩略图 Tooltip（原生 Tree）

### 目标

素材面板、媒体库面板、历史面板的 TreeItem 悬停时显示缩略图预览。使用 VSCode 原生 TreeView（非 Webview）。

### API 基础

VSCode TreeItem tooltip 支持 `MarkdownString`，允许的 HTML 标签**包含 `<img>`**：

```typescript
const md = new vscode.MarkdownString(undefined, true);
md.isTrusted = true;
md.supportHtml = true;
md.appendMarkdown(`<img src="${vscode.Uri.file(thumbnailPath)}" width="200" />\n\n`);
md.appendMarkdown(`**Resolution:** 1920×1080  \n**Duration:** 00:03:22`);
item.tooltip = md;
```

### 核心约束

**原生 Tree 的 tooltip 是同步渲染的**——`<img src>` 指向的文件必须在悬停时已存在于磁盘。`fire(onDidChangeTreeData)` 会关闭当前 tooltip，无法实现"先文本后图片"的异步刷新。

### 策略：缓存预热 + 同步读取

```
                    预热阶段（后台）                    展示阶段（同步）
                    
树节点展开 ──→ 批量请求缩略图 ──→ engine 生成     用户悬停 ──→ 缓存文件存在？
媒体库扫描 ──→ 低优先级后台    ──→ 写入 .cache/       ├─ 是 → <img> tooltip ✅
素材导入时 ──→ 导入流程顺带    ──→ thumbnails/         └─ 否 → 纯文本 metadata
```

**tooltip 只做一件事：检查缓存文件是否存在。有就 `<img>`，没有就纯文本。零异步、零闪烁。**

### 缓存预热时机

| 时机 | 范围 | 优先级 | 说明 |
|------|------|--------|------|
| 树节点展开 | 当前可见子节点 | 高 | 用户即将悬停的节点，优先生成 |
| 媒体库首次扫描 | 全部文件 | 低 | 后台空闲时批量，不阻塞 UI |
| 素材导入 | 单个文件 | 高 | 导入流程顺带生成 |
| AI 生成物写入 | 单个文件 | 高 | 生成完成时立即缓存 |

### 缩略图生成管线（走 neko-engine）

```
ThumbnailService.generate(filePath)
  ├─ 缓存命中？(.neko/.cache/thumbnails/<md5>.jpg)
  │   └─ 返回路径，不调 engine
  └─ 缓存未命中？
      └─ vscode.commands.executeCommand('neko.engine.extractThumbnail')
          └─ neko-engine extension.ts（需补注册）
              └─ dispatch('videos', 'capture', { path, width: 200, format: 'jpeg' })
                  └─ Rust VideoService::capture
                      ├─ HwAccelDecoder → FFmpeg 硬件解码
                      ├─ GPU NV12 → RGBA 转换
                      ├─ bilinear_downscale_rgba 缩放
                      └─ JPEG 编码 → 写入 .cache/thumbnails/
```

### 当前断裂点

`neko.engine.extractThumbnail` 命令在 neko-assets ThumbnailService 中调用，但 **neko-engine/extension.ts 中未注册**。底层 Rust 能力完整（`videos:capture` action 已实现），只需补一个命令映射。

### 各媒体类型支持

| 类型 | 缩略图方案 | engine 支持 | 状态 |
|------|-----------|-------------|------|
| **视频** | FFmpeg 抽帧 + GPU 缩放 + JPEG | `videos:capture` | ✅ 已实现 |
| **图片** | 读取 + 缩放 + JPEG | 可复用 capture 管线 | ✅ 可实现 |
| **音频** | 波形图渲染 | `videos:waveform` | ⚠️ 需封装为图片 |
| **文档** | PDF 首页光栅化 | 未实现 | ❌ 需新增 |
| **3D 模型** | 离屏渲染截图 | GPU scene_renderer 已有 | ⚠️ 需封装 |
| **图片序列** | 取中间帧 | 复用 capture | ⚠️ 需适配 |

### 实施步骤

| 步骤 | 内容 | 改动位置 |
|------|------|----------|
| 1 | 注册 `neko.engine.extractThumbnail` 命令 | neko-engine/extension.ts |
| 2 | 缩略图缓存路径迁移到 `.neko/.cache/thumbnails/` | neko-assets ThumbnailService |
| 3 | 树节点展开时触发批量预热 | 三个 TreeProvider |
| 4 | TreeItem tooltip 改为 `MarkdownString` + `<img>` | 三个 TreeProvider |

### Explorer 文件树的限制

VSCode 原生 Explorer 的 TreeItem tooltip **不可被扩展覆盖**。`FileDecorationProvider` 只支持 badge（2 字符）+ 纯文本 tooltip。因此缩略图 tooltip 仅适用于 neko-assets 自己的三个面板，不适用于 Explorer。

---

## 九、实施优先级

| 阶段 | 内容 | 影响范围 |
|------|------|----------|
| **P0** | `IStorageLayout` + `resolveStorageLayout()` + 迁移逻辑 | @neko/shared, 所有扩展启动路径 |
| **P1** | `LibraryDescriptor` 类型 + 共享库加载 + AssetRegistry 多源合并 | neko-assets, @neko/shared |
| **P1** | `IAssetGraph` 接口 + JSON 实现 | neko-assets（新文件） |
| **P1** | `IVectorStore` 接口 + JSON 实现 + ScriptEmbeddingIndex 适配 | neko-agent |
| **P1** | 各服务被动写入 AssetGraph | neko-cut, neko-canvas, neko-agent |
| **P2** | `ICacheStats` 标准化 + 监控面板 | 所有缓存服务 |
| **P2** | MediaMetadataCache 分片加载 | neko-assets |
| **P2** | ThumbnailService 磁盘持久化 | neko-cut webview |
| **P3** | 媒体内容语义向量（ONNX 推理 → IVectorStore） | neko-engine, neko-assets |
| **P3** | SQLite 替换（若达到阈值） | IAssetGraph / IVectorStore 实现层 |
