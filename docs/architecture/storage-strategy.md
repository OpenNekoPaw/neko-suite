# 存储策略

> 关联：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [format-strategy.md](./format-strategy.md) · [marketplace.md](./marketplace.md) · [media-lsp.md](./media-lsp.md)
>
> **合并自**：`local-storage-strategy.md` · `remote-storage.md` · `project-data-management.md`

---

## 一、项目数据分层与 Git 策略

### 数据分类

| 层级 | 数据类型 | 格式 | 示例 | 变更频率 |
|------|---------|------|------|---------|
| **L0 项目文件** | 编辑项目 | JSON 文本 | `.nkv` `.nkc` `.nks` `.nka` `.fountain` | 高 |
| **L1 项目元数据** | 配置/字典 | JSON 文本 | `project.json` `characters.json` | 低 |
| **L2 媒体素材** | 图片/音视频/3D | 二进制 | `.mp4` `.png` `.wav` `.gltf` | 低 |
| **L3 AI 生成物** | 生成媒体 | 二进制 | AI 图片/视频/音频 | 中 |
| **L4 运行时数据** | 缓存/历史 | 混合 | `.nkv-ops` `cache/` `memory.md` | 高 |

### Git 管理策略

```
✅ Git 直接管理（文本/JSON，可 diff/merge）:
├─ L0: .nkv / .nkc / .nks / .nka / .fountain
├─ L1: project.json / characters.json
└─ L1: .gitattributes / .gitignore

⚠️ Git LFS 管理（二进制，不可 diff/merge）:
├─ L2: 参考图 / 概念图 / 原始录音 / 3D 模型源文件
└─ L3: 保留的 AI 生成物（用户筛选后的最终版本）

❌ 不进 Git（运行时/可重建）:
├─ L3: AI 生成的中间产物（可重新生成）
├─ L4: .nkv-ops 操作历史（session 级）
├─ L4: .neko/.cache/ 全部缓存
└─ L4: .neko/memory.md Agent 记忆（个人偏好）
```

### .gitignore 模板

项目初始化时自动生成：

```gitignore
# neko-suite caches (rebuildable)
.neko/.cache/

# Personal settings
.neko/settings.local.json

# Operation history (session-level)
*.nkv-ops
*.nks-ops
*.nka-ops
```

### .gitattributes 模板

```gitattributes
# neko-suite project files — text, mergeable
*.nkv text diff merge
*.nkc text diff merge
*.nks text diff merge
*.nka text diff merge
*.fountain text diff

# Media assets — Git LFS + custom diff driver
*.mp4 filter=lfs diff=neko-media merge=binary
*.mov filter=lfs diff=neko-media merge=binary
*.wav filter=lfs diff=neko-media merge=binary
*.png filter=lfs diff=neko-media merge=binary
*.jpg filter=lfs diff=neko-media merge=binary
*.gltf filter=lfs diff=lfs merge=lfs -text
*.glb  filter=lfs diff=lfs merge=lfs -text
*.vrm  filter=lfs diff=lfs merge=lfs -text
```

### neko-media Diff Driver

包装 neko-engine 已有的 probe + diff 能力，作为 Git diff driver：

```
$ neko-diff old.mp4 new.mp4
Media Diff: old.mp4 → new.mp4
┌────────────┬──────────────────┬──────────────────┐
│ Property   │ old              │ new              │
├────────────┼──────────────────┼──────────────────┤
│ Duration   │ 00:02:30.00      │ 00:02:45.50      │
│ Codec      │ H.264 High       │ H.265 Main       │
│ SSIM       │ —                │ 0.847 (moderate) │
│ Size       │ 156 MB           │ 124 MB (-20.5%)  │
└────────────┴──────────────────┴──────────────────┘
```

```gitconfig
[diff "neko-media"]
  command = neko-diff
  binary = true
```

---

## 二、本地存储布局

### 核心决策：源数据与派生数据物理分离

```
~/.neko/                              # L0: 用户级（全局）
├── config.json                       #   用户配置（LLM 偏好等）
├── AGENTS.md                         #   用户显式提示词配置（跨项目）
├── market-cache/                     #   市场包下载缓存（LRU）
├── market-installed.json             #   已安装包注册表
├── auth.json                         #   认证令牌
└── conversations/                    #   对话历史（按项目 hash 分片）

<project>/.neko/                      # L1: 项目级（提交 Git）
├── settings.json                     #   团队共享设置（媒体库路径等）
├── settings.local.json               #   个人覆盖（.gitignore）
├── config.json                       #   MCP 服务器配置
└── memory.md                         #   项目 Agent 记忆

<project>/.neko/.cache/               # L2: 项目级缓存（不提交，可重建）
├── media-metadata.json               #   媒体元数据缓存
├── asset-graph.json                  #   资产关系图
├── vectors/                          #   向量持久化
│   ├── scripts.json
│   └── assets.json
├── proxies/                          #   代理视频
│   ├── manifest.json
│   └── <hash>_proxy.mp4
├── generated/                        #   AI 生成物
│   ├── index.json
│   ├── images/ / videos/ / audios/
└── thumbnails/                       #   缩略图缓存
```

`.gitignore` 只需一行 `.neko/.cache/` 覆盖全部缓存，对比旧方案需逐个排除子目录。

### IStorageLayout 接口

```typescript
// @neko/shared/types/storage.ts

interface IStorageLayout {
  global: {
    root: string; config: string; agentsMd: string;
    marketCache: string; marketInstalled: string; conversations: string;
  };
  project: {
    root: string; settings: string; settingsLocal: string;
    config: string; memory: string;
  };
  cache: {
    root: string; mediaMetadata: string; assetGraph: string;
    vectors: string; proxies: string; proxyManifest: string;
    generated: string; generatedIndex: string; thumbnails: string;
  };
}

function resolveStorageLayout(workspaceRoot: string): IStorageLayout {
  const globalRoot = path.join(os.homedir(), '.neko');
  const projectRoot = path.join(workspaceRoot, '.neko');
  const cacheRoot = path.join(projectRoot, '.cache');
  return {
    global: { root: globalRoot, config: path.join(globalRoot, 'config.json'),
      agentsMd: path.join(globalRoot, 'AGENTS.md'),
      marketCache: path.join(globalRoot, 'market-cache'),
      marketInstalled: path.join(globalRoot, 'market-installed.json'),
      conversations: path.join(globalRoot, 'conversations') },
    project: { root: projectRoot, settings: path.join(projectRoot, 'settings.json'),
      settingsLocal: path.join(projectRoot, 'settings.local.json'),
      config: path.join(projectRoot, 'config.json'),
      memory: path.join(projectRoot, 'memory.md') },
    cache: { root: cacheRoot,
      mediaMetadata: path.join(cacheRoot, 'media-metadata.json'),
      assetGraph: path.join(cacheRoot, 'asset-graph.json'),
      vectors: path.join(cacheRoot, 'vectors'),
      proxies: path.join(cacheRoot, 'proxies'),
      proxyManifest: path.join(cacheRoot, 'proxies', 'manifest.json'),
      generated: path.join(cacheRoot, 'generated'),
      generatedIndex: path.join(cacheRoot, 'generated', 'index.json'),
      thumbnails: path.join(cacheRoot, 'thumbnails') },
  };
}
```

### 旧路径迁移

| 旧路径 | 新路径 |
|--------|--------|
| `.neko/cache/` | `.neko/.cache/` |
| `.neko/proxies/` | `.neko/.cache/proxies/` |
| `.neko/generated/` | `.neko/.cache/generated/` |

---

## 三、资产库跨项目策略

### 四个独立资产域

| 域 | 存储位置 | 作用域 | 管理方式 |
|---|---|---|---|
| **AssetLibrary** | `<project>/.neko/assets/library.json` | 项目 | Entity→Variant→File 层级 |
| **MediaLibraryPaths** | `<project>/.neko/settings.json` | 团队 | 路径变量（`${VARIABLE}`） |
| **GeneratedAssets** | `<project>/.neko/.cache/generated/` | 项目 | JSON index + 二进制文件 |
| **Marketplace** | `~/.neko/market-installed.json` | 用户 | IAssetHandler 注册 |

### 决策：共享素材库描述符模式

选择方案 C（共享素材库目录 + 各项目按需引用），理由：现有基础设施已覆盖大部分（MediaLibraryEntry / PathResolver / settings.local.json / AssetOwnership.scope='team'）。

共享素材库根目录包含 `.neko-library.json` 描述文件：

```typescript
interface LibraryDescriptor {
  version: 1;
  name: string;   // "Team Characters"
  id: string;     // UUID，跨重命名稳定
  entities: AssetEntity[];
}
```

通过 `settings.json` 中已有的 `mediaLibraries` 配置引用共享目录：

```json
{ "mediaLibraries": [{ "name": "Team Characters",
    "path": "/Volumes/TeamNAS/characters", "variable": "TEAM_CHARS" }] }
```

### AssetRegistry 多源合并

```
AssetRegistry.query(filter)
  ├─ 1. 项目 library.json        (read-write, scope: 'project')
  ├─ 2. 共享库 .neko-library.json (read-only, scope: 'shared')
  └─ 3. IAssetHandler (Marketplace) (read-only, scope: 'marketplace')
```

---

## 四、资产关系图（Asset Graph）

### 设计

```typescript
type AssetRelation =
  | 'uses' | 'proxy-of' | 'derived-from' | 'generated-by'
  | 'variant-of' | 'exported-from' | 'linked-audio';

interface IAssetGraph {
  addNode(node: AssetNode): void;
  addEdge(edge: AssetEdge): void;
  removeNode(id: string): void;
  getUsedBy(id: string): AssetEdge[];
  getDependencies(id: string): AssetEdge[];
  getOrphans(): AssetNode[];
  persist(): Promise<void>;
  load(): Promise<void>;
}
```

图不主动扫描，从各服务已有事件中被动构建：LSP（`uses`）、ProxyService（`proxy-of`）、GeneratedAssetIndex（`generated-by`）、ExportService（`exported-from`）。

持久化：Phase 1 用 JSON 邻接表（< 5K 节点），Phase 2 按需切换 SQLite（接口不变）。

---

## 五、向量持久化

### 决策：不引入向量数据库，IVectorStore + JSON 持久化

```typescript
interface IVectorStore {
  upsert(id: string, vector: number[], metadata: Record<string, unknown>): void;
  delete(id: string): void;
  search(query: number[], topK: number): VectorSearchResult[];
  persist(): Promise<void>;
  load(): Promise<void>;
}
```

存储：`.neko/.cache/vectors/scripts.json`（剧本嵌入）、`assets.json`（资产描述）。  
升级阈值：单项目向量 > 50K 条时替换为 SQLite + vec 扩展，接口不变。

---

## 六、远程存储与代理文件

### 存储后端：S3 兼容对象存储（MinIO）

| 维度 | OSS（MinIO） | 云盘（Nextcloud 等） |
|------|-------------|-------------------|
| HTTP Range Seek | ✅ 原生支持 | ⚠️ WebDAV 中转 |
| 预签名 URL | ✅ 原生支持 | ❌ 需额外开发 |
| 私有部署 | ✅ MinIO 单二进制 | ⚠️ PHP + MySQL |
| 流式播放 | ✅ 预签名 URL 直用 | ❌ 需整文件下载 |

Bucket 隔离：`neko-team-{teamId}/` · `neko-user-{userId}/` · `neko-project-{projId}/`

### 远程素材文件结构

```
assets/{entityId}/
├── original/      ← 原始文件（用户上传，GB 级）
├── proxy/         ← 代理文件（服务端生成，H.264 720p faststart）
├── thumbnail/     ← 缩略图（poster.webp + strip.webp）
└── meta.json
```

### 核心流程：上传 → 编辑 → 导出

**上传**：分片上传原始文件 → FFmpeg Worker 异步生成代理 + 缩略图（4K ProRes 2.3GB → 720p H.264 ~45MB，约 1:50）。代理必须 `-movflags +faststart`。

**编辑**：ProxyService 检查本地缓存（`.neko/.cache/proxies/`）→ 命中直接用 / 未命中下载代理 → Engine 读本地代理，体验与纯本地项目一致。

**导出**：
| 导出类型 | 质量 | 是否拉原始 |
|---------|------|-----------|
| 预览/社交媒体 | 720p-1080p | ❌ 代理直出 |
| 最终交付 | 原始质量 | ✅ 增量拉取（按 time range 计算 byte range） |

### IFileTransport 接口

```typescript
interface IFileTransport {
  readonly scheme: string;  // 'file' | 's3' | 'webdav'
  exists(uri: string): Promise<boolean>;
  pull(uri: string, localPath: string, progress?: TransferProgress): Promise<void>;
  push(localPath: string, uri: string, progress?: TransferProgress): Promise<void>;
  pullRange(uri: string, range: ByteRange, localPath: string): Promise<void>;
  presign(uri: string, options?: PresignOptions): Promise<string>;
}
```

包归属：接口定义在 `@neko/shared`，`S3Transport` 实现在 `neko-assets` 扩展层。

### ProxyService 扩展

```typescript
class ProxyService {
  // 优先级: 本地缓存 → 远程代理下载 → 触发服务端生成
  async ensureProxy(source: AssetFileRef): Promise<ProxyResolution>;
  onProgress: vscode.Event<ProxyProgressEvent>;
}
```

### neko:// 引用协议（Phase 6.6）

`.nkv` 元素 `src` 字段支持三种格式：

```
assets/clip.mp4              项目内（相对路径）          ✅ 已实现
${FOOTAGE}/scene.mov         外部本地（PathVariable）    ✅ 已实现
neko://entityId/varId/fileId Asset Library 间接引用      Phase 6.6
```

`MediaResolver.resolve(src, baseDir, intent: 'preview' | 'export')` 决策：本地存在 → 直接用；preview 且无本地 → 下载代理；export → 下载原始。

### 全品类代理策略

| 类型 | 代理方案 | 服务端工具 |
|------|---------|-----------|
| 视频 | H.264 720p faststart | FFmpeg |
| 音频 | AAC 128k + waveform | FFmpeg |
| 高清图片（≥5MB / PSD/TIFF/RAW） | WebP 2K | libvips |
| 图片序列 | H.264 720p（合成为视频） | FFmpeg |
| 3D 模型 | LOD 简化 + Draco 压缩 | gltf-transform |
| PDF（>10MB） | 逐页 WebP + 结构 JSON | poppler/mupdf |
| PPT | LibreOffice → PDF → 逐页 WebP | LibreOffice |
| Word | HTML + 嵌入资源 | pandoc |
| EPUB（>20MB） | 封面 + 目录 JSON | 解压 |
| CBZ | 缩小逐页 WebP | libvips |
| Markdown / FDX / Shader / 小文件 | 直接下载 | — |
| AI 模型 | 无代理（必须完整下载） | — |

---

## 七、多用户协作策略

### 协作场景

**场景 A（独立创作，当前主要）**：本地 Git，无需额外功能。

**场景 B（小团队分工，2-5 人）**：按文件/模块分工，冲突概率低。Git LFS File Locking 保护二进制文件：
```bash
git lfs lock assets/hero.png   # 阻止他人同时修改
git lfs unlock assets/hero.png
```

**场景 C（实时协作，远期）**：EditOperation 体系已具备 OT/CRDT 所需基础（不可变 + 唯一 id + 对称 apply/invert）。远期优先评估 Yjs CRDT。

---

## 八、缩略图 Tooltip（VSCode 原生 TreeView）

**策略：缓存预热 + 同步读取**。tooltip 只检查缓存文件是否存在，有则 `<img>`，没有则纯文本，零异步零闪烁。

```typescript
const md = new vscode.MarkdownString(undefined, true);
md.isTrusted = true; md.supportHtml = true;
md.appendMarkdown(`<img src="${vscode.Uri.file(thumbnailPath)}" width="200" />`);
item.tooltip = md;
```

预热时机：树节点展开（高优先）、媒体库首次扫描（低优先后台）、素材导入/AI 生成时（立即）。

当前断裂点：`neko.engine.extractThumbnail` 命令在 neko-engine/extension.ts 中**未注册**，底层 `videos:capture` action 已实现，只需补命令映射。

---

## 九、实施优先级

| 优先级 | 任务 |
|--------|------|
| **P0** | `IStorageLayout` + `resolveStorageLayout()` + 旧路径迁移 |
| **P1** | `LibraryDescriptor` + 共享库加载 + AssetRegistry 多源合并 |
| **P1** | `IAssetGraph` 接口 + JSON 实现 + 各服务被动写入 |
| **P1** | `IVectorStore` + JSON 实现 + ScriptEmbeddingIndex 适配 |
| **P1** | IFileTransport + S3Transport + ProxyService 远程扩展 |
| **P2** | `.gitignore` + `.gitattributes` 模板自动生成 |
| **P2** | `neko-diff` CLI（Git diff driver）+ pHash 感知哈希 |
| **P2** | `ICacheStats` 标准化 + 监控面板 |
| **P2** | ThumbnailService 磁盘持久化 + tooltip 改造 |
| **P3** | SQLite 替换（IAssetGraph / IVectorStore，按需触发） |
| **P3** | LSP 索引缓存（大项目启动加速） |
| **远期** | neko:// 引用协议（Phase 6.6） |
| **远期** | OT/CRDT 实时协作 |
