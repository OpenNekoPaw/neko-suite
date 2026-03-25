# 远程存储与代理文件策略

> 关联：[marketplace.md](./marketplace.md) · [diff.md](./diff.md) · [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## 一、背景

Neko Suite 需要支持远程协作场景：团队成员在不同地点共享素材、协同编辑。核心需求包括素材缩略图浏览、代理文件编辑预览、快速 Seek 操作、最终导出。

### 设计约束

| 约束 | 说明 |
|------|------|
| Seek 延迟 | 拖动时间线跳转需 < 100ms 响应 |
| 多轨合成 | 时间线预览需 GPU 实时合成，仅 neko-engine 可完成 |
| 代理文件 | 必须 H.264 + faststart（moov 前置），支持 HTTP Range |
| Engine 零改动 | 代理下载到本地后，Engine 视为普通本地文件 |

---

## 二、存储后端选型：OSS（MinIO）

### 决策：使用 S3 兼容对象存储，不使用云盘

**理由**：

| 维度 | OSS（MinIO） | 云盘（Nextcloud 等） |
|------|-------------|-------------------|
| HTTP Range Seek | ✅ 原生支持，零开销 | ⚠️ WebDAV 中转，PHP 瓶颈 |
| 预签名 URL | ✅ 原生支持 | ❌ 需额外开发 |
| CDN 集成 | ✅ 直接对接 | ❌ WebDAV 不适合 CDN |
| 并发性能 | 万级 QPS | 百级 QPS |
| 私有部署 | ✅ MinIO 单二进制 | ⚠️ PHP + MySQL + Redis |
| 流式播放 | ✅ 预签名 URL → `<video>` 直接用 | ❌ 需整文件下载 |

**云盘定位**：不作为存储后端，仅作为"导入来源"（从 Google Drive / OneDrive 导入素材）。

### 部署方案

```
个人/小团队:
  Docker Compose: MinIO(1) + Neko Storage Service(1)
  存储: 本机磁盘或 NAS 挂载

中型团队:
  MinIO 分布式（4 节点，纠删码）
  Neko Storage Service × 2（负载均衡）
  + CDN（加速远程访问）

云托管（不想自建）:
  直接用 AWS S3 / Aliyun OSS / Cloudflare R2
  S3 协议兼容 → 代码零改动切换
```

### Bucket 隔离策略

```
neko-official/              ← 官方素材（只读）
neko-market/                ← 市场资产（按购买授权）
neko-team-{teamId}/         ← 团队素材（团队成员读写）
neko-user-{userId}/         ← 个人素材（仅本人）
neko-project-{projId}/      ← 项目素材（项目成员读写）
```

---

## 三、服务架构

### Neko Storage Service（薄服务层）

用户不直接配置 AK/SK，通过 Neko 账号体系授权，后端代理 OSS 访问。

```
┌──────────────────────────────────────────────┐
│          Neko Storage Service                │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Auth     │ │ Team/    │ │ Transcode    │  │
│  │ Service  │ │ Project  │ │ Worker       │  │
│  │          │ │ Isolation│ │ (FFmpeg)     │  │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘  │
│       │            │               │          │
│  ┌────▼────────────▼───────────────▼───────┐  │
│  │         MinIO (S3 API)                  │  │
│  │    纠删码 — 分片上传 — 版本控制           │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**职责**：
- 用户认证（Neko 账号 → JWT）
- 权限控制（团队/项目/个人隔离）
- 预签名 URL 生成（给 Webview 和 Engine 使用）
- 代理文件/缩略图生成调度（FFmpeg Worker）
- 上传调度（分片 + 断点续传）
- 配额管理（每用户/每团队存储上限）

---

## 四、远程素材文件结构

每个素材在 MinIO 中的存储结构：

```
assets/{entityId}/
├── original/              ← 原始文件（用户上传，GB 级）
│   └── scene01.mov           ProRes 4K, 2.3GB
│
├── proxy/                 ← 代理文件（服务端生成，编辑用）
│   └── scene01.mp4           H.264 720p faststart, ~45MB
│
├── thumbnail/             ← 缩略图（服务端生成，浏览用）
│   ├── poster.webp           封面帧, ~20KB
│   └── strip.webp            时间线缩略条, ~50KB
│
└── meta.json              ← 元数据（duration/codec/dimensions）
```

---

## 五、核心流程：上传 → 编辑 → 导出

### 5.1 上传阶段

```
用户上传 original.mov (4K ProRes, 2.3GB)
  │
  ▼
分片上传 → MinIO: assets/{id}/original/scene01.mov
  │
  ▼
FFmpeg Worker 异步生成:
  │
  ├── proxy.mp4 (H.264 720p faststart, CRF 28)
  │     ffmpeg -i original.mov \
  │       -movflags +faststart \
  │       -c:v libx264 -preset fast -crf 28 \
  │       -vf scale=1280:-2 \
  │       -c:a aac -b:a 128k \
  │       -y proxy.mp4
  │
  ├── poster.webp (封面帧)
  │
  └── strip.webp (时间线缩略条)
  │
  ▼
写回 MinIO: assets/{id}/proxy/ + thumbnail/
标记状态: proxyReady = true
通知客户端: 代理文件可用
```

**代理体积比**：4K ProRes 2.3GB → 720p H.264 ~45MB（约 1:50 压缩）。

**关键要求**：代理文件必须 `-movflags +faststart`（moov 前置），确保 HTTP Range Seek 无需整文件下载。

**服务端 Worker ≠ neko-engine**：
- neko-engine：桌面端 GPU sidecar，实时合成 + 低延迟流式
- FFmpeg Worker：服务端 CPU 容器，批量转码 + 不需要实时

### 5.2 编辑阶段

```
用户打开项目，时间线引用远程素材
  │
  ▼
ProxyService 检查本地缓存 (.neko/proxies/)
  │
  ├── 有缓存 → 直接使用（与纯本地项目体验一致）
  │
  └── 无缓存 → 下载代理文件到本地
      │  proxy.mp4 ~45MB → 几秒下载
      │  存入 .neko/proxies/{hash}_proxy.mp4
      ▼
Engine 读本地代理文件（现有流程零改动）
  → GPU 多轨合成 → H.264 流式 → WebSocket → WebCodecs
  → Seek 延迟 ~50ms（本地读取）
```

**分层预览策略**：

| 场景 | 路径 | 是否走 Engine |
|------|------|-------------|
| 素材列表浏览 | 预签名 URL → `<img>` 缩略图 | ❌ 不需要 |
| 单文件预览 | 本地代理 → `<video>` 或 Engine | 可选 |
| 时间线多轨预览 | 本地代理 → Engine GPU 合成 → 流式 | ✅ 必须 |

**用户感知**：代理下载完成后，远程项目 = 本地项目，编辑体验完全一致。

### 5.3 导出阶段

#### 导出质量分级

并非所有导出都需要原始文件：

| 导出类型 | 质量需求 | 是否拉原始 | 适用场景 |
|----------|---------|-----------|---------|
| 预览导出 | 720p/1080p | ❌ 用代理直出 | 分享草稿、审片 |
| 社交媒体导出 | 1080p | 视情况 | 短片用代理，长片拉原始 |
| 最终导出 | 原始质量 | ✅ 拉原始文件 | 成片交付 |

#### 本地导出 vs 平台导出

| 维度 | 本地导出 | 平台导出 |
|------|---------|---------|
| 下载量 | 拉取用到的原始文件 | 零（服务端直读 MinIO） |
| 等待 | 下载 + 本地渲染 | 提交后可关机 |
| GPU | 用户本地 GPU | 服务端 GPU/CPU |
| 质量 | 完全可控 | 服务端需复刻 Engine 渲染逻辑 |
| 适合 | 专业用户、最终交付 | 轻量用户、团队审片 |

#### 增量拉取优化（减少下载量）

导出时不拉完整原始文件，只拉用到的时间段：

```
完整拉取:
  10 条素材 × 平均 2GB = 20GB  ← 不可接受

增量拉取:
  时间线分析 → 每条素材实际用到的 time range
  → 通过 moov atom 索引计算对应字节 range
  → HTTP Range 请求只拉需要的部分
  → 10 条素材各用 10% ≈ 2GB   ← 可接受
```

```typescript
// ExportService 增量拉取逻辑
async prepareAssets(timeline: Timeline): Promise<PreparedAsset[]> {
  for (const clip of timeline.clips) {
    const usedRange = { start: clip.inPoint, end: clip.outPoint };
    const byteRange = await moovIndex.timeToBytes(clip.sourceUri, usedRange);
    // HTTP Range 部分下载到临时文件
    await transport.pullRange(clip.sourceUri, byteRange, tempPath);
  }
}
```

---

## 六、ProxyService 扩展

现有 ProxyService 只管本地代理，扩展为支持远程：

```typescript
interface ProxyResolution {
  kind: 'local' | 'downloading' | 'generating';
  /** Local file path */
  localPath?: string;
  /** Download/generation progress 0-100 */
  progress?: number;
}

class ProxyService {
  /**
   * Ensure proxy is available locally.
   *
   * Priority:
   * 1. Local cache hit → return immediately
   * 2. Remote proxy exists → download to local cache
   * 3. No proxy → request server-side generation (remote file)
   *              or generate locally (local file, existing logic)
   */
  async ensureProxy(source: AssetFileRef): Promise<ProxyResolution>;

  /** Check proxy status without triggering download */
  async proxyStatus(source: AssetFileRef): Promise<ProxyResolution>;

  /** Subscribe to proxy download/generation progress */
  onProgress: vscode.Event<ProxyProgressEvent>;
}
```

---

## 七、IFileTransport 接口

### 存储传输抽象

```typescript
/**
 * IFileTransport — abstract file transfer protocol.
 *
 * Implementations handle specific storage backends.
 * Zero vscode dependency.
 */
interface IFileTransport {
  readonly scheme: string;  // 'file' | 's3' | 'oss' | 'azure' | 'webdav'

  /** Check file accessibility */
  exists(uri: string): Promise<boolean>;

  /** Download remote file to local path */
  pull(uri: string, localPath: string, progress?: TransferProgress): Promise<void>;

  /** Upload local file to remote */
  push(localPath: string, uri: string, progress?: TransferProgress): Promise<void>;

  /** Download partial content (byte range) */
  pullRange(uri: string, range: ByteRange, localPath: string): Promise<void>;

  /** Delete remote file */
  delete(uri: string): Promise<void>;

  /** Get file metadata without downloading */
  stat(uri: string): Promise<RemoteFileStat>;

  /** List files under a prefix */
  list(prefix: string): Promise<RemoteFileEntry[]>;

  /** Generate pre-signed URL for direct browser/Engine access */
  presign(uri: string, options?: PresignOptions): Promise<string>;
}

type TransferProgress = (transferred: number, total: number) => void;

interface ByteRange {
  start: number;
  end: number;
}

interface PresignOptions {
  /** Expiry in seconds (default: 900) */
  expiresIn?: number;
  /** HTTP method */
  method?: 'GET' | 'PUT';
}

interface RemoteFileStat {
  size: number;
  lastModified: number;
  contentType?: string;
  checksum?: string;
}
```

### 包归属

```
@neko/shared:        IFileTransport / ICacheManager 接口定义
@neko/asset:         LocalFileTransport 实现
neko-assets ext:     S3Transport 实现（通过 Neko Storage Service 中转）
@neko/market-core:   复用 IFileTransport 做市场资产下载
```

### 实现优先级

| Transport | 优先级 | 理由 |
|-----------|--------|------|
| S3 协议 | P1 | AWS + MinIO + Aliyun OSS + R2，一套覆盖最广 |
| WebDAV | P2 | NAS 用户（群晖/QNAP）常用协议 |
| Azure Blob | P3 | 企业用户 |

---

## 八、本地缓存管理

```typescript
/**
 * ICacheManager — local cache for remote files.
 *
 * Manages .neko/cache/remote/ directory.
 */
interface ICacheManager {
  /** Get local path if cached, or download and cache */
  ensure(uri: string, transport: IFileTransport): Promise<string>;

  /** Check if URI is cached locally */
  has(uri: string): boolean;

  /** Get cached local path (undefined if not cached) */
  get(uri: string): string | undefined;

  /** Invalidate cache entry */
  invalidate(uri: string): Promise<void>;

  /** Cache stats */
  stats(): Promise<{ totalSize: number; entryCount: number }>;

  /** Evict LRU entries to stay under size limit */
  evict(maxSize: number): Promise<number>;
}
```

---

## 九、AssetOwnership 扩展

当前 AssetEntity 无归属概念，需补充：

```typescript
interface AssetOwnership {
  /** Scope of ownership */
  scope: 'personal' | 'project' | 'team' | 'purchased' | 'public';
  /** Owner identifier */
  ownerId?: string;
  /** Access level */
  access: 'private' | 'readonly' | 'editable';
}
```

---

## 九-b、AssetOwnership — 已实现 ✅

`AssetOwnership` 已在 `packages/neko-types/src/types/asset/entity.ts` 中实现，包含 `OwnershipScope`、`AccessLevel`、`AssetOwnership` 接口，`AssetEntity.ownership?` 可选字段，`AssetQuery.ownershipScopes` 过滤。

---

## 十、AssetManifestSource 扩展 — 已实现 ✅

`'remote'` kind 已添加到 `AssetManifestSource` 类型中。

```typescript
export type AssetManifestSource =
  | { kind: 'local'; path: string }
  | { kind: 'git-lfs'; oid: string; path: string }
  | { kind: 'registry'; registry: string; package: string; version: string; integrity?: string }
  | { kind: 'ai-generated'; taskId: string; model: string }
  | { kind: 'remote'; uri: string; checksum?: string };
```

---

## 十-b、neko:// 引用协议与 MediaResolver（Phase 6.6 设计）

### 素材路径层级

`.nkv` / `.nkc` / `.nka` 的 `element.src` 字段支持三种路径格式：

```
1. assets/clip.mp4                      项目内素材（相对路径）          ✅ 已实现
2. ${FOOTAGE}/scene.mov                 外部本地素材（PathVariable）    ✅ 已实现
3. neko://entity-id/variant-id/file-id  Asset Library 间接引用         Phase 6.6
```

PathVariable 解决"同一文件在不同机器上路径不同"（`settings.local.json` 覆盖）。
`neko://` 解决"文件可能在远程存储，需要代理/原始自动切换"。

### neko:// 协议

```
neko://abc123/v1/f1
       │      │  └─ AssetFile.id
       │      └─── AssetVariant.id
       └────────── AssetEntity.id
```

解析流程：
1. 从 AssetManifest（`library.json`）查找 entity → variant → file
2. 获得 `AssetFile.path`（本地路径，可能是 `${VAR}/...`）和 `AssetFile.source`（来源信息）
3. 交给 MediaResolver 决策

### MediaResolver

```typescript
interface MediaResolution {
  /** Local file path for Engine to read */
  localPath: string;
  /** Whether this is a proxy (lower quality) */
  isProxy: boolean;
  /** Original quality info */
  original?: { width: number; height: number; codec: string; size: number };
  /** Proxy quality info */
  proxy?: { width: number; height: number; codec: string; size: number };
}

class MediaResolver {
  /**
   * Resolve a stored path to a local file path.
   *
   * @param intent - 'preview' allows proxy; 'export' requires original
   */
  async resolve(
    storedPath: string,
    baseDir: string,
    intent: 'preview' | 'export' = 'preview',
  ): Promise<MediaResolution>;
}
```

决策逻辑：

```
resolve("neko://abc/v1/f1", baseDir, intent)
  │
  ├─ AssetManifest 查找 → AssetFile
  │   ├─ file.path = "${FOOTAGE}/scene01.mov"
  │   └─ file.source = { kind: 'remote', uri: 's3://bucket/scene01.mov' }
  │
  ├─ PathResolver.resolve(file.path) → /Volumes/NAS/footage/scene01.mov
  │   ├─ fs.access OK → { localPath: 原始路径, isProxy: false }  ✅ 最优
  │   └─ fs.access FAIL → 原始不在本地
  │       │
  │       ├─ intent = 'preview'
  │       │   ├─ file.proxy?.localPath 存在 → { localPath: 代理路径, isProxy: true }
  │       │   └─ 代理也没有 → 触发 ProxyService 下载 → 等待 → 返回代理路径
  │       │
  │       └─ intent = 'export'
  │           └─ 通过 IFileTransport.pull() 下载原始文件 → 阻塞等待 → 返回原始路径
  │
resolve("${FOOTAGE}/scene.mov", baseDir, intent)
  → PathResolver.resolve() → 绝对路径 → { localPath, isProxy: false }

resolve("assets/clip.mp4", baseDir, intent)
  → path.resolve(baseDir, src) → { localPath, isProxy: false }
```

### AssetFile.proxy 字段扩展

```typescript
interface AssetFileProxy {
  /** Local path to the proxy file */
  localPath: string;
  /** Proxy resolution */
  resolution: number;
  /** Proxy codec */
  codec: string;
  /** When the proxy was generated */
  generatedAt: number;
}

// AssetFile 扩展
interface AssetFile {
  // ... existing fields
  /** Proxy file info (for remote assets with local proxy cache) */
  proxy?: AssetFileProxy;
  /** File status: 'proxy' = original not local, proxy available */
  status?: 'online' | 'offline' | 'missing' | 'remapped' | 'proxy';
}
```

### 自动切换场景

| 操作 | intent | 用什么 | 原因 |
|------|--------|-------|------|
| 时间线预览 | preview | 代理 | 720p 够用，多轨实时合成 |
| 单文件预览 | preview | 代理 | 浏览够用 |
| 拖拽 Seek | preview | 代理 | 低延迟 < 100ms |
| 导出 720p | preview | 代理 | 质量匹配 |
| 导出 4K 最终版 | export | 原始 | 质量要求 |
| 色彩精确调整 | export | 原始 | 代理有损 |

### 与 PathVariable 的关系

```
PathVariable（✅ 已完成）       neko://（Phase 6.6）
├─ 解决路径映射                 ├─ 解决远程素材引用
├─ 同一文件不同机器不同路径     ├─ 文件可能不在本地
├─ 无代理概念                   ├─ 代理/原始自动切换
├─ Engine 直接读本地文件        ├─ Engine 仍然读本地文件
└─ 适用：NAS + Git 团队协作     └─ 适用：云存储 + 分布式团队
```

两者共存：`neko://` 解析后可能得到 `${VAR}/...` 路径，再由 PathResolver 展开为绝对路径。

---

## 十一、实施路径

```
Phase 1 — 基础设施
├── IFileTransport 接口 + S3Transport 实现
├── ICacheManager 本地缓存
├── ProxyService 扩展（支持远程代理下载）
├── AssetManifestSource 增加 'remote' kind
└── Neko Storage Service 基础版（认证 + 预签名）

Phase 2 — 上传 + 代理生成
├── 分片上传（S3 Multipart）
├── FFmpeg Worker 服务端代理/缩略图生成
├── 上传进度 UI
└── 代理就绪通知

Phase 3 — 导出优化
├── 预览导出（代理直出，无需原始文件）
├── 增量拉取（按 time range 计算 byte range）
├── 导出进度 + 断点续传
└── AssetOwnership 权限控制

Phase 4 — 平台导出（远期）
├── 服务端草稿导出（FFmpeg filter_complex 基础合成）
├── neko-engine headless 模式（服务端 GPU，完整渲染）
└── 导出任务队列 + 产物下载
```

---

## 十二、流程总览

```
上传                  编辑                       导出
─────                ─────                      ─────

original ──→ MinIO
     │
     ▼
FFmpeg Worker
     │
     ├─ proxy.mp4 ──→ MinIO
     ├─ poster.webp ──→ MinIO
     └─ strip.webp ──→ MinIO
                           │
                      下载 proxy (~45MB)
                           │
                           ▼
                      .neko/proxies/
                           │
                           ▼
                      Engine 读本地代理         预览导出 → 代理直出
                      多轨 GPU 合成             最终导出 → 增量拉原始
                      Seek / 播放 / 暂停                 → Engine 渲染
                      （与本地项目完全一致）              (或) 平台导出
```

---

## 十三、全品类代理策略

### 素材特性总览

| 素材类型 | 典型大小 | 实时预览？ | Seek？ | 能做代理？ | 编辑时需原始？ |
|---------|---------|-----------|--------|----------|-------------|
| 视频 | 500MB~10GB | ✅ 播放 | ✅ 时间线拖拽 | ✅ 720p H.264 | ❌ 代理够用 |
| 音频 | 10MB~500MB | ✅ 播放 | ✅ 波形拖拽 | ✅ AAC 128k | ❌ 代理够用 |
| 高清图片 | 10MB~500MB | ✅ 画布/时间线 | ❌ | ✅ 缩小分辨率 | ❌ 代理够用 |
| 图片序列 | 1GB~50GB | ✅ 播放 | ✅ 逐帧 | ✅ 合成为视频 | ❌ 代理够用 |
| 3D 模型 | 5MB~500MB | ✅ 视口旋转 | ❌ | ⚠️ LOD 简化 | ⚠️ 视场景 |
| AI 模型 | 100MB~10GB | ❌ | ❌ | ❌ 无意义 | ✅ 推理必须完整 |
| Shader | 1KB~100KB | ✅ 效果预览 | ❌ | ❌ 已很小 | ✅ 直接用 |
| LUT/预设 | 1KB~5MB | ✅ 效果预览 | ❌ | ❌ 已很小 | ✅ 直接用 |
| Skill | 1KB~50KB | ❌ | ❌ | ❌ | ✅ 直接用 |
| PDF | 1~500MB | ✅ 翻页 | ❌ | ✅ 逐页图片 | ❌ 代理够用 |
| PPT | 5~200MB | ✅ 翻页 | ❌ | ✅ 逐页图片 | ❌ 代理够用 |
| Word | 1~50MB | ✅ 阅读 | ❌ | ⚠️ 转 HTML | ❌ 代理够用 |
| Excel | KB~10MB | ✅ 查看 | ❌ | ⚠️ 转 JSON | ❌ 代理够用 |
| EPUB | 1~50MB | ✅ 阅读 | ❌ | ⚠️ 封面+目录 | ❌ 多数直接下载 |
| CBZ | 10~500MB | ✅ 翻页 | ❌ | ✅ 缩小逐页 | ❌ 代理够用 |
| Markdown | KB | ✅ 阅读 | ❌ | ❌ | ✅ 直接用 |
| FDX | KB~MB | ✅ 阅读 | ❌ | ❌ | ✅ 直接用 |

### 处理管线分类

```
管线 A — 直接使用（文本/小文件，无需服务端处理）
  Markdown / FDX / Shader / LUT / Skill / 小型 Excel
  → 直接下载原始文件
  → 客户端本地解析/渲染

管线 B — 媒体转码（大文件 + 实时预览）
  视频:     FFmpeg → H.264 720p faststart proxy + poster + strip
  音频:     FFmpeg → AAC 128k proxy + waveform
  图片:     libvips → WebP 2K proxy + 256px thumbnail
  序列帧:   FFmpeg → H.264 720p faststart proxy（合成为视频）
  → 代理下载到本地后走 Engine 现有流程

管线 C — 3D 简化（模型 LOD）
  3D 模型:  gltf-transform → Draco 压缩 + 512px 贴图 + 渲染预览图
  → LOD 代理用于场景编排，细节调整时拉原始

管线 D — 文档转换（排版/结构化文档）
  PDF:      poppler/mupdf → 逐页 WebP + 结构 JSON
  PPT:      LibreOffice → PDF → 逐页 WebP
  Word:     pandoc → HTML + 嵌入资源提取
  EPUB:     解压 → 封面图 + 目录 JSON + HTML
  CBZ:      解压 → 缩小逐页 WebP
  Excel:    sheetjs → JSON 数据 + Sheet 结构

管线 E — 完整下载（无法做代理）
  AI 模型:  必须完整下载后才能推理
  → 显示下载进度 + 断点续传 + 示例输出图作为预览
```

### 媒体代理详细参数

#### 视频（已在前文详述）

```
ffmpeg -i original.mov \
  -movflags +faststart -c:v libx264 -preset fast -crf 28 \
  -vf scale=1280:-2 -c:a aac -b:a 128k -y proxy.mp4
```

#### 音频

```
原始: recording.wav       48kHz/24bit 立体声, 300MB (1小时)
代理: recording.aac       AAC 128kbps, ~7MB
缩略: waveform.webp       波形图, ~30KB
压缩比: 约 1:40

生成:
  ffmpeg -i recording.wav -c:a aac -b:a 128k -ar 44100 -ac 2 -y proxy.aac
  Engine audios:waveform → 800 点降采样 → waveform.webp

编辑时: 代理足够（波形显示 + 播放 + 混音预览）
导出时: 拉原始 WAV
```

#### 高清图片（PSD / TIFF / RAW / EXR）

```
原始: poster.psd          8K, 16bit, 多图层, 450MB
代理: poster.webp         2K 扁平化, quality=80, ~200KB
缩略: poster_thumb.webp   256px, ~10KB
压缩比: 约 1:2000

生成（libvips，比 ImageMagick 快 5-10 倍）:
  vips thumbnail poster.psd proxy.webp 2048 --export-profile srgb

阈值:
  < 5MB 的普通 JPEG/PNG → 直接下载原始，不生成代理
  ≥ 5MB 或 PSD/TIFF/RAW/EXR → 始终生成代理

编辑时: 代理足够（画布放置、缩放、位置调整）
导出时: 拉原始（保留图层/色彩精度）
```

#### 图片序列（PNG 序列 / EXR 序列）

```
原始: seq_0001.exr ~ seq_0720.exr    720帧, 4K EXR, 总计 25GB
代理: sequence_proxy.mp4              H.264 720p faststart, ~30MB
压缩比: 约 1:800

生成:
  ffmpeg -i seq_%04d.exr \
    -movflags +faststart -c:v libx264 -crf 28 \
    -vf scale=1280:-2 -r 24 -y proxy.mp4

编辑时: 代理视频文件（与视频代理流程统一）
导出时: 拉原始序列帧
```

### 3D 模型代理

```
原始: character.glb       高精度网格 + 4K 贴图, 200MB
  ├── 几何: 500K 三角面
  ├── 贴图: diffuse(4K) + normal(4K) + roughness(4K) = 150MB
  └── 动画: 12 clips

代理（三层）:
  缩略图:   rendered_preview.webp     固定角度渲染, 20KB
  LOD 代理: character_lod.glb         简化网格 + 512px 贴图, ~5MB
  原始:     character.glb             完整模型, 200MB

生成（gltf-transform）:
  gltf-transform simplify input.glb lod.glb --ratio 0.04
  gltf-transform resize lod.glb lod.glb --width 512
  gltf-transform compress lod.glb lod.glb --compress draco

使用场景:
  浏览选择  → 缩略图
  场景编排  → LOD 代理（位置/旋转/缩放足够）
  细节调整  → 拉原始模型
```

### 文档类代理详细

#### PDF

```
缩略图:  首页渲染图
代理:    逐页 WebP（按需加载，先加载前几页）
预览:    图片浏览器 / pdf.js（小文件直接用 pdf.js）

阈值:
  < 10MB → 直接下载，客户端 pdf.js 渲染
  10~100MB → 服务端提取前 N 页为图片 + 目录结构
  > 100MB → 全部逐页图片化

服务端:
  pdftoppm -webp -r 150 input.pdf pages/page
  → pages/page-001.webp, page-002.webp, ...
  → structure.json（页数/目录/标注）

集成:
  neko-story: 分镜 PDF → 场景分解
  neko-canvas: 美术参考图 → 拖入画布
  neko-agent: AI 分析内容
  neko-cut: 分镜页 → 时间线占位
```

#### PPT (.pptx)

```
缩略图:  首页渲染图
代理:    逐页 WebP + 结构 JSON（备注/文本）

服务端:
  libreoffice --headless --convert-to pdf input.pptx
  → pdftoppm → 逐页 WebP
  → 提取 speaker notes → structure.json

集成:
  neko-story: 故事板 → 场景分解
  neko-canvas: 每页作为画布元素
  neko-cut: 每页 → 时间线图片序列（故事板转视频）
```

#### Word (.docx)

```
缩略图:  首页渲染图（或文本摘要）
代理:    HTML + 嵌入资源

阈值:
  < 10MB → 直接下载
  > 10MB → 服务端转 HTML + 提取嵌入图片

服务端:
  pandoc input.docx -o content.html --extract-media=media/

集成:
  neko-story: 脚本/大纲 → Fountain 转换
  neko-agent: AI 读取文档分析
  neko-cut: 配音稿 → 字幕时间轴
```

#### Excel (.xlsx)

```
缩略图:  首个 Sheet 前几行渲染 / 表格图标
代理:    JSON 数据 + Sheet 结构

服务端（可选，客户端 sheetjs 也能解析）:
  sheetjs 解析 → data.json

集成:
  neko-cut: 排期表 → 时间线标记点
  neko-story: 角色/场景清单 → 结构化数据
  neko-assets: 资产清单 → 批量创建 Entity
```

#### EPUB

```
缩略图:  封面图提取（META-INF → cover image）
代理:    封面 + 目录 JSON + HTML 章节

阈值:
  < 20MB → 直接下载，客户端内嵌阅读器
  > 20MB → 提取封面 + 目录结构 + 按需加载章节

集成:
  neko-story: 原作参考，章节结构导入
  neko-agent: AI 读取全文用于改编分析
```

#### CBZ（漫画/分镜）

```
缩略图:  首页图片
代理:    解压 → 每页缩小为 1024px WebP

服务端:
  unzip input.cbz -d raw/
  → libvips 逐页: vips thumbnail raw/page01.png pages/001.webp 1024

集成:
  neko-story: 分镜参考 → 场景分解
  neko-canvas: 页面拖入画布作为参考层
  neko-cut: 每页 → 时间线图片序列
  neko-agent: AI 视觉分析（角色/场景识别）
```

#### Markdown / FDX

```
直接下载，客户端渲染:
  Markdown → VSCode 原生预览
  FDX → neko-story XML 解析（支持 FDX ↔ Fountain 双向转换）

集成:
  Markdown: 世界观设定/角色描述 → neko-story Notes / neko-agent 上下文
  FDX: Final Draft 剧本 → Fountain 导入 → 场景分解
```

### AssetType 扩展

```typescript
export type AssetType =
  // 媒体素材（已有）
  | 'video' | 'audio' | 'image' | 'sequence'
  // Shader（已有）
  | 'shader' | 'shader-preset'
  // AI 模型（已有）
  | 'ai-model' | 'lora' | 'embedding'
  // 插件 / Skill（已有）
  | 'plugin' | 'skill'
  // 预设（已有）
  | 'preset' | 'template' | 'lut'
  // 3D 模型
  | '3d-model'
  // 文档（新增）
  | 'document';

/** Document sub-type metadata */
export interface DocumentMetadata {
  subtype: 'markdown' | 'pdf' | 'word' | 'pptx' | 'xlsx' | 'epub' | 'cbz' | 'fdx';
  pageCount?: number;
  wordCount?: number;
  language?: string;
  /** Whether text content can be extracted for AI analysis */
  textExtractable: boolean;
}
```

### Transcode Worker 统一管线

```
Transcode Worker（服务端容器化）
│
├── 媒体管线
│   ├── 视频:      FFmpeg → H.264 proxy + thumbnail
│   ├── 音频:      FFmpeg → AAC proxy + waveform
│   ├── 图片:      libvips → WebP proxy + thumbnail
│   ├── 序列帧:    FFmpeg → H.264 proxy
│   └── 3D 模型:   gltf-transform → LOD proxy + 渲染预览
│
├── 文档管线
│   ├── PDF:       poppler/mupdf → 逐页 WebP + 结构 JSON
│   ├── PPT:       LibreOffice → PDF → 逐页 WebP
│   ├── Word:      pandoc → HTML + 资源提取
│   ├── EPUB:      解压 → 封面 + 目录 JSON
│   ├── CBZ:       解压 + libvips → 缩小逐页 WebP
│   └── Excel:     sheetjs → JSON 数据
│
└── 不需要服务端处理
    ├── Markdown → 客户端原生渲染
    ├── FDX → 客户端 XML 解析
    ├── Shader/LUT/Skill → 直接下载
    └── 小文件（< 5MB 图片 / < 10MB 文档）→ 直接下载
```

### 任务队列设计

```json
{
  "taskId": "tx-001",
  "type": "generate-proxy",
  "assetId": "asset-xxx",
  "assetType": "video",
  "source": "s3://bucket/assets/xxx/original/scene01.mov",
  "outputs": {
    "proxy": "s3://bucket/assets/xxx/proxy/scene01.mp4",
    "thumbnail": "s3://bucket/assets/xxx/thumbnail/poster.webp",
    "strip": "s3://bucket/assets/xxx/thumbnail/strip.webp"
  },
  "params": {
    "proxyResolution": 720,
    "proxyCodec": "h264",
    "thumbnailWidth": 256
  }
}
```

### MinIO 存储结构（统一）

```
assets/{entityId}/
├── original/
│   └── scene01.mov / recording.wav / poster.psd / character.glb
│       / storyboard.pptx / model.safetensors / ...
│
├── proxy/
│   ├── scene01.mp4              媒体: H.264 / AAC / WebP
│   ├── character_lod.glb        3D: LOD 简化
│   ├── pages/                   文档: 逐页渲染
│   │   ├── 001.webp
│   │   ├── 002.webp
│   │   └── ...
│   ├── content.html             文档: HTML 转换
│   └── data.json                文档: 结构化数据
│
├── thumbnail/
│   ├── poster.webp              封面/预览（所有类型统一）
│   ├── strip.webp               时间线缩略条（视频/音频/序列帧）
│   └── waveform.webp            波形图（音频）
│
└── meta.json
```

### 客户端下载优先级

```
P0: 缩略图（所有类型，几 KB，立即显示列表）
P1: 当前可见时间线范围内的媒体代理
P2: 文档代理（逐页 WebP / HTML，按需加载前几页）
P3: 剩余媒体代理
P4: 小文件原始（Markdown / FDX / Shader / LUT / Skill）
P5: 原始文件（仅导出 / 高清查看时按需拉取）
```
