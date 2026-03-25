# 市场 Registry Server 架构

> 关联：[marketplace.md](./marketplace.md) · [model-runtime.md](./model-runtime.md) · [remote-storage.md](./remote-storage.md)

---

## 一、背景

neko-market 客户端（`MarketClient`）已实现完整的搜索/安装/管理协议，但缺少对应的后端服务。当前 `DEFAULT_REGISTRY_URL` 指向 `https://market.neko.dev/api/v1`，需要实现该服务端。

### 需求

| 需求 | 说明 |
|------|------|
| 官方分发 | Neko 团队发布 Skill / Shader / Model / Preset |
| 社区发布 | 第三方发布者上传自己的资产包 |
| 非开源模型 | 商业/闭源模型的授权分发 |
| 私有部署 | 企业/团队可自建私有 registry（Docker 一键启动） |
| 上游代理 | 代理 HuggingFace / Civitai 等第三方源，本地缓存 |
| 大文件下载 | AI 模型 GB 级，需预签名直传 + 断点续传 |

---

## 二、核心架构决策

### 决策 1：薄 API + 对象存储直传

**结论**：API 服务器只处理元数据和鉴权，文件下载通过对象存储预签名 URL 直传。

**理由**：
- AI 模型 2-15 GB，不能过 API 代理（带宽/内存/延迟）
- 预签名 URL 让客户端直接从存储下载，API 服务器零带宽压力
- 对象存储原生支持 Range 请求（断点续传）

```
客户端                      Registry Server                 对象存储
  │                              │                             │
  │─── GET /download ───────────▶│                             │
  │                              │── 鉴权 + 生成预签名 URL ──▶│
  │◀── { url: "签名URL" } ──────│                             │
  │                              │                             │
  │─── GET 签名URL（直传）──────────────────────────────────▶│
  │◀── 文件流（支持 Range）──────────────────────────────────│
```

### 决策 2：不单独配 CDN，存储选型自带加速

**结论**：CDN 不作为独立架构组件。通过选择自带加速能力的存储来获得分发加速。

**理由**：

- **品类分析**：90% 的资产（Skill/Shader/Preset/LUT）在 KB-MB 级别，任何存储直传都够快
- **模型下载模式**：大文件低频单次下载，CDN 缓存命中率极低
- **存储自带加速**：Cloudflare R2 零出站 + 自带 CDN；阿里云 OSS 可开启 CDN 加速
- **用户规模**：Alpha → Growth 阶段无需独立 CDN 架构

**按用户地域选存储**：

| 用户分布 | 推荐存储 | 加速能力 | 成本 |
|---------|---------|---------|------|
| 中国为主 | 阿里云 OSS | OSS 加速 + 按需开 CDN | 存储低，流量按量 |
| 海外为主 | Cloudflare R2 | 自带 Cloudflare CDN | 存储低，**零出站费** |
| 全球分布 | OSS（国内）+ R2（海外）双存储 | 各自加速 | 按需扩展 |

### 决策 3：上游代理模式（借鉴 Verdaccio）

**结论**：支持配置上游源（HuggingFace / Civitai / 其他 neko registry），首次请求代理下载并缓存到本地存储。

**理由**：
- 用户无需离开 neko-market 即可访问 HF / Civitai 模型
- 企业私有 registry 可代理官方 registry，内网缓存加速
- 与 Verdaccio 代理 npmjs.com 的模式完全一致，已被大规模验证

### 决策 4：API 协议复用现有 MarketClient 接口

**结论**：Registry Server 的 API 就是 `IMarketClient` 接口的服务端实现，零客户端改动。

**理由**：`MarketClient` 已定义完整的 HTTP API 契约（search/getPackage/getVersions/getDownloadUrl/getFeatured），服务端直接实现这些端点即可。

---

## 三、系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                   Neko Market Registry Server                 │
│                                                               │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│  │ Package   │  │ Upload    │  │ Upstream   │  │ Auth      │ │
│  │ API       │  │ Service   │  │ Proxy      │  │ Service   │ │
│  │           │  │           │  │            │  │           │ │
│  │ 搜索/详情 │  │ 分片上传   │  │ HF 适配    │  │ JWT 验证   │ │
│  │ 版本管理  │  │ 完整性校验 │  │ Civitai    │  │ 发布者    │ │
│  │ 下载 URL  │  │ 元数据提取 │  │ 缓存管理   │  │ 可见性    │ │
│  │ 推荐列表  │  │           │  │            │  │ 付费授权  │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬──────┘  └─────┬─────┘ │
│        │              │              │                │        │
│  ┌─────┴──────────────┴──────────────┴────────────────┴─────┐ │
│  │                     Storage Layer                         │ │
│  │                                                           │ │
│  │  Metadata DB                      Object Store            │ │
│  │  (PostgreSQL / SQLite)            (S3 / OSS / R2)         │ │
│  │  ├─ packages                      ├─ 资产文件             │ │
│  │  ├─ versions                      ├─ 截图/预览            │ │
│  │  ├─ publishers                    └─ 校验和               │ │
│  │  ├─ downloads (统计)                                      │ │
│  │  └─ licenses                                              │ │
│  └───────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、API 设计

### 4.1 Package API（复用 IMarketClient 契约）

```
# 读操作（匿名可用）
GET  /api/v1/packages?q=&types=&tags=&sort=&page=&pageSize=   搜索
GET  /api/v1/packages/:id                                      包详情
GET  /api/v1/packages/:id/versions                             版本列表
GET  /api/v1/packages/:id/versions/:ver/download               下载 URL（预签名）
GET  /api/v1/featured?type=                                    推荐列表

# 写操作（需认证）
POST /api/v1/packages                                          发布新包
POST /api/v1/packages/:id/versions                             发布新版本
PUT  /api/v1/packages/:id                                      更新包元数据
DEL  /api/v1/packages/:id/versions/:ver                        撤回版本
```

### 4.2 LocalAI Gallery 端点

> 详见 [model-runtime.md](./model-runtime.md)

```
GET  /api/v1/gallery.yaml            → LocalAI Gallery 格式的 AI 模型列表
```

LocalAI 通过 `GALLERIES` 配置指向此端点，自行完成模型下载和加载。客户端安装 AI 模型时，调用 LocalAI `POST /models/apply` 而非 neko-market 的 `InstallManager`。

### 4.3 Upload API（大文件分片直传）

```
# 分片上传流程
POST /api/v1/upload/init
  Body: { packageId, version, filename, fileSize, checksum }
  Response: { uploadId, parts: [{ partNumber, presignedUrl }] }

POST /api/v1/upload/complete
  Body: { uploadId, parts: [{ partNumber, etag }] }
  Response: { success, downloadUrl }

# 小文件直传（< 100MB）
POST /api/v1/upload/direct
  Body: multipart/form-data
  Response: { success, downloadUrl }
```

### 4.3 Publisher API

```
POST /api/v1/publishers/register                  注册发布者
GET  /api/v1/publishers/:id                        发布者信息
GET  /api/v1/publishers/:id/packages               发布者的所有包
PUT  /api/v1/publishers/:id                        更新发布者信息
```

### 4.4 下载 URL 生成策略

```typescript
// GET /api/v1/packages/:id/versions/:ver/download
async function getDownloadUrl(req, res) {
  const { id, ver } = req.params;
  const pkg = await db.getVersion(id, ver);

  // 1. 权限检查
  if (pkg.visibility === 'paid') {
    await licenseService.verifyEntitlement(req.user, id);
  }

  // 2. 生成预签名 URL（有效期 1 小时）
  const url = await objectStore.getPresignedUrl(pkg.storagePath, {
    expiresIn: 3600,
    responseContentDisposition: `attachment; filename="${pkg.filename}"`,
  });

  // 3. 记录下载统计
  await db.incrementDownloads(id, ver);

  return { url };
}
```

---

## 五、上游代理

### 配置

```yaml
# registry-config.yaml
upstreams:
  huggingface:
    url: "https://huggingface.co"
    protocol: "huggingface"       # HF API 适配器
    enabled: true
    cache: true                   # 首次拉取缓存到本地存储
    cache_ttl: "7d"               # 元数据缓存 7 天，文件永久缓存
    types: ["ai-model", "lora", "embedding"]
    auth_token: "${HF_TOKEN}"     # 可选：访问私有模型

  civitai:
    url: "https://civitai.com/api/v1"
    protocol: "civitai"           # Civitai API 适配器
    enabled: true
    cache: true
    types: ["ai-model", "lora", "embedding"]
    read_only: true               # 只读

  team-registry:                  # 上游另一个 neko registry
    url: "https://market.mycompany.com/api/v1"
    protocol: "neko"              # 同协议，直接代理
    enabled: true
    cache: true
    auth_token: "${TEAM_TOKEN}"
```

### 搜索聚合流程

```
客户端搜索 "SDXL"
  │
  ▼
Registry Server
  ├── 查询本地 DB（< 10ms）
  ├── 并发查询上游 HF（转换 HF 格式 → MarketPackage）
  ├── 并发查询上游 Civitai（转换 Civitai 格式 → MarketPackage）
  │
  ▼
合并 + 去重 + 标记来源
  │
  ▼
返回 MarketSearchResult
  items: [
    { id: "sdxl-turbo", source: "local", ... },
    { id: "hf://stabilityai/sdxl-turbo", source: "huggingface", ... },
    { id: "civitai://12345", source: "civitai", ... },
  ]
```

### 上游模型下载（透明缓存）

```
客户端下载 hf://stabilityai/sdxl-turbo
  │
  ▼
Registry Server
  ├── 本地缓存命中？ → YES → 返回本地存储预签名 URL
  └── NO → 从 HF 下载到本地存储 → 返回本地存储预签名 URL
               （后台异步，客户端等待或直接给 HF 原始 URL）
```

---

## 六、数据模型

```sql
-- 包
CREATE TABLE packages (
  id          TEXT PRIMARY KEY,         -- @publisher/name
  name        TEXT NOT NULL,
  publisher_id TEXT NOT NULL REFERENCES publishers(id),
  type        TEXT NOT NULL,            -- skill/shader/ai-model/lora/...
  visibility  TEXT NOT NULL DEFAULT 'public',  -- public/private/paid
  description TEXT,
  tags        TEXT[],                   -- 标签数组
  homepage    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 版本
CREATE TABLE versions (
  id          SERIAL PRIMARY KEY,
  package_id  TEXT NOT NULL REFERENCES packages(id),
  version     TEXT NOT NULL,            -- semver
  changelog   TEXT,
  storage_path TEXT NOT NULL,           -- S3 key
  filename    TEXT NOT NULL,
  file_size   BIGINT NOT NULL,
  checksum    TEXT NOT NULL,            -- sha256
  manifest    JSONB NOT NULL,           -- AssetManifest 完整快照
  compatibility JSONB,                  -- { nekoVersion, engineVersion }
  downloads   BIGINT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(package_id, version)
);

-- 发布者
CREATE TABLE publishers (
  id          TEXT PRIMARY KEY,         -- publisher slug
  display_name TEXT NOT NULL,
  email       TEXT,
  verified    BOOLEAN NOT NULL DEFAULT false,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 授权（付费资产）
CREATE TABLE licenses (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  package_id  TEXT NOT NULL REFERENCES packages(id),
  license_type TEXT NOT NULL,           -- one-time/subscription
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ
);
```

---

## 七、权限模型

```
访问级别：
├── anonymous      搜索 + 下载 public 包
├── registered     + 发布包 + 管理自己的包
├── team           + 访问 team-scoped 私有包
├── purchased      + 访问已购买的 paid 包
└── admin          + 管理所有包 + 审核 + 推荐设置
```

**认证方式**：复用 neko-auth JWT。Registry Server 验证 JWT 签名，提取 userId 和 roles。

---

## 八、部署模式

### 模式 1：Neko 官方托管（SaaS）

```
market.neko.dev
├── API Server（轻量 VPS / Serverless）
├── PostgreSQL（Supabase / Neon 免费层）
├── Cloudflare R2（零出站 + CDN）或 阿里云 OSS
└── 用户零配置，MarketClient 默认连接
```

### 模式 2：私有部署（Docker 单容器）

```bash
docker run -d -p 4873:4873 \
  -v neko-registry-data:/data \
  -e DATABASE_TYPE=sqlite \
  -e STORAGE_TYPE=local \
  neko/market-registry
```

- SQLite 元数据 + 本地文件存储（零外部依赖）
- 可选配 S3/OSS 存储后端
- 可配置 upstreams 代理官方 registry 到内网

**注意**：客户端 `registryUrl` 固定为官方地址（`market.neko.dev`）。私有部署的 Registry 不直接面向客户端，而是作为官方 Registry 的**上游数据源**（官方 Registry 通过 upstreams 聚合私有 registry 的包），或者用于企业内部独立使用场景。

---

## 九、客户端连接模式

**设计决策**：客户端 `registryUrl` 固定为 `https://market.neko.dev/api/v1`，不支持用户配置多 Registry。

**理由**：
- 简化客户端复杂度（无搜索聚合、无来源标记、无冲突解决）
- 避免碎片化（所有用户看到同一个市场，社区集中）
- 第三方源聚合是**服务端职责**（通过 upstreams 代理 HF/Civitai，对客户端透明）
- 私有部署场景通过服务端 upstreams 链式代理解决，不暴露给客户端

```
客户端 → market.neko.dev/api/v1（唯一入口）
               │
               ▼
         Registry Server
         ├── 本地 DB（官方 + 社区发布的包）
         ├── upstream: HuggingFace（代理 + 缓存）
         ├── upstream: Civitai（代理 + 缓存）
         └── upstream: 企业私有 registry（可选）
```

---

## 十、技术选型

| 组件 | 推荐 | 备选 | 理由 |
|------|------|------|------|
| API 框架 | Hono (TS) | Fastify / Axum (Rust) | 轻量，Cloudflare Workers 兼容，TS 与客户端类型共享 |
| 数据库 | PostgreSQL | SQLite（私有部署） | PostgreSQL 生产级；SQLite 零依赖私有部署 |
| 对象存储 | Cloudflare R2 | 阿里云 OSS / AWS S3 / SeaweedFS | R2 零出站 + CDN；OSS 国内最优 |
| 认证 | neko-auth JWT | — | 复用现有 SSO 基础设施 |
| 容器 | Docker 单镜像 | — | 私有部署一条命令启动 |
| 搜索 | PostgreSQL 全文搜索 | MeiliSearch（规模大时） | 初期 PG tsvector 足够 |

### 成本估算

| 部署模式 | API 服务器 | 数据库 | 存储 | 出站流量 | 总计/月 |
|---------|-----------|--------|------|---------|--------|
| 官方 (R2) | $5-20 | $0 (Neon 免费) | $15/TB | **$0** | **~$20** |
| 官方 (OSS) | ¥50-100 | ¥0 | ¥10/TB | ¥50-200/TB | **¥100-300** |
| 私有 (Docker) | 已有服务器 | SQLite ($0) | 本地 ($0) | 内网 ($0) | **$0** |

---

## 十一、实施路径

```
Phase S1 — 最小 Registry Server
├── Package API（search/getPackage/getVersions/getDownloadUrl/getFeatured）
├── SQLite 元数据 + 本地文件存储
├── 基础认证（API key）
└── Docker 镜像

Phase S2 — 对象存储 + 发布能力
├── S3/R2/OSS 存储后端
├── 预签名 URL 直传
├── Upload API（小文件直传 + 大文件分片）
├── Publisher 注册 + 包发布
└── neko-auth JWT 集成

Phase S3 — 上游代理
├── HuggingFace 上游适配器 + 透明缓存
├── Civitai 上游适配器
├── Webview 搜索结果来源标记（local / huggingface / civitai）
└── 私有 registry 上游链式代理

Phase S4 — 商业化
├── 可见性控制（public/private/paid）
├── LicenseManager 服务端实现
├── 支付集成
├── 发布者 Portal Web UI
└── 评分评论系统
```

---

*最后更新：2026-03-25（新建 ADR，定义 Registry Server 架构：薄 API + 对象存储直传 + 上游代理；客户端 registryUrl 固定，不做多 Registry）*
