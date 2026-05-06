# neko-market Registry Server Contract

> **范围**：本文档是 `neko-market` 客户端（本仓）与 `neko-registry-server`（独立仓）之间的 **HTTP 契约权威定义**。
> **关联**：[marketplace.md](./marketplace.md) · [manifest-schema-spec.md](./manifest-schema-spec.md)

> **修订**：2026-05-05 · 抽出自 [marketplace.md §十一](./marketplace.md)，扩为完整契约文档。

---

## 一、责任边界（再次声明）

```
┌─ neko-market 客户端（本仓）─────────────────────────┐
│  装 (Install)     下载 / 校验 / 解包-编排-注册 / 反演 │
│  说 (Describe)    清单展示 / 截图 / 信任徽章 / 依赖图 │
│  管 (Manage)      列表 / 启停 / 更新 / 缓存 / 事件   │
└──────────────────────────────────────────────────────┘
                       │ HTTP only
                       ▼
┌─ neko-registry-server（独立仓）────────────────────┐
│  发布 (Publish)   Publisher 注册 / Upload API       │
│  审核 (Review)    Moderation / TrustLevel 评定      │
│  签名 (Sign)      Manifest 哈希 + 签名生成           │
│  结算 (Billing)   付费授权 / Entitlement 颁发        │
│  代理 (Upstream)  HF / Civitai 代理 + 缓存          │
│  搜索 (Index)     全文 / 推荐 / 评分                │
│  Ontology         受控词汇表（语义 / 意图）          │
└──────────────────────────────────────────────────────┘
```

### 客户端绝不做

```
✗ 生成 manifest（manifest 是 server 权威产物，client 只消费）
✗ 计算签名（client 只验证 server 下发）
✗ 评级 / 评论写回（client 只浏览，写入是 server 端 POST）
✗ 直传上传（client 无 Upload API 调用）
✗ 发布者 / 用户注册（neko-auth + server）
✗ 维护搜索索引（client 永远是 server 的 query 客户端）
✗ 重算 entitlement / trustLevel（server 权威，client 透传）
✗ 维护 ontology 受控词汇表（server 唯一权威）
```

### 服务端绝不做

```
✗ 直接读 client 文件系统
✗ 假设 client 持久化某条 manifest（client 缓存随时可清）
✗ 在 manifest 里嵌入 user-specific 信息（license / entitlement）
```

---

## 二、协议版本与基础约定

### 2.1 API 版本

```
当前版本：v1
基础路径：https://market.neko.dev/api/v1
私有部署：https://market.{your-org}.com/api/v1
```

`registryUrl` 通过 `vscode.workspace.getConfiguration('neko.market').get('registryUrl')` 在 client 端配置；缺省走官方域名。

### 2.2 认证

```
方式：HTTP Authorization: Bearer <token>
来源：neko-auth 扩展（neko.neko-auth）
匿名：允许，但仅可访问 visibility=public 的免费资源

token 注入流程：
  1. client startup → 从 neko-auth.getSession() 取 token
  2. MarketClient.setAuthToken(token)
  3. 所有 HTTP 请求带 Authorization 头
  4. neko-auth.onDidChangeSession → 刷新 token
```

### 2.3 内容协商

```
请求：Accept: application/json
响应：Content-Type: application/json; charset=utf-8
错误：标准 RFC 7807 Problem Details
压缩：Accept-Encoding: gzip, br
缓存：标准 HTTP cache headers + ETag
```

### 2.4 错误码约定

```
200  OK
201  Created
204  No Content（subscribe / 删除等）
304  Not Modified（ETag 命中）
400  Bad Request（参数错）
401  Unauthorized（无 token / token 无效）
402  Payment Required（付费资产未购）
403  Forbidden（trustLevel 不足 / 地区限制）
404  Not Found
409  Conflict（版本冲突 / 唯一性约束）
410  Gone（包已下架）
413  Payload Too Large
422  Unprocessable Entity（manifest 校验失败）
429  Too Many Requests
451  Unavailable For Legal Reasons（合规下架）
500  Internal Server Error
503  Service Unavailable
```

---

## 三、API 端点

### 3.1 Discovery（包发现）

#### GET /api/v1/packages

通用搜索 + 排序 + 过滤。

**Query Parameters**：

```
基础：
  q            string      文本搜索（OR 匹配 name / description / tags）
  types        string[]    按 AssetType 过滤
  category     string      按 AssetCategory 过滤（media/ai/tooling/bundle）
  tags         string[]    按 tag 过滤
  visibility   string[]    public / shared / paid（默认 all）
  pricing      string      free | paid | all（默认 all）
  publisher    string      按发布者过滤

排序：
  sort         string      featured | trending | created | downloads | rating
  order        string      asc | desc（默认 desc）

语义 facet（详见 §三.2）：
  semantic.<facet>=value           精确匹配
  semantic.<facet>>=value           最小值
  semantic.<facet><=value           最大值
  semantic.<facet>=<v1>,<v2>        集合匹配（OR）

意图 facet：
  intent.useCase=vlog,wedding       多选 OR
  intent.audience=beginner          精确
  intent.workflowStage=color-grading
  intent.notFor=NSFW                排除（取反）

向量搜索：
  embedding.modelId    string      向量模型 id（必须在 server 白名单）
  embedding.query      string      自然语言查询（server 编码后做 ANN 搜索）

分页：
  limit        number      默认 20，最大 100
  offset       number      默认 0
  cursor       string      可选，cursor-based 分页（替代 offset）
```

**Response**：

```typescript
{
  items: MarketPackage[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}
```

#### GET /api/v1/packages/:id

获取单个包的完整 detail。

**Path Parameter**：`id` = `@publisher/name`（URL-encoded）

**Response**：

```typescript
{
  id: string;
  manifest: AssetManifest;       // 完整 schema 见 manifest-schema-spec.md
  installState: 'not-installed' | 'installed' | 'update-available' | 'installing';
  installedVersion?: string;     // 仅 client 端推断，server 可忽略
}
```

#### GET /api/v1/packages/:id/versions

包的所有版本列表。

**Response**：

```typescript
{
  versions: Array<{
    version: string;
    releasedAt: number;
    changelog?: string;
    compatibility?: AssetCompatibility;
    downloadSize: number;
    deprecated?: boolean;
  }>;
}
```

#### GET /api/v1/featured

推荐包列表（编辑精选）。

**Query**：`type?: AssetType`（可选过滤）

**Response**：

```typescript
{
  items: MarketPackage[];
}
```

### 3.2 Sort & Search 详细规则

#### Sort 字段

```
featured     编辑精选（server 维护，无固定顺序）
trending     最近 N 天下载量（默认 7 天，server 端衰减算法）
created      按 createdAt 倒序（最新发布）
downloads    总下载量倒序
rating       平均评分倒序（rating count >= 10 才计）
```

P0 必须支持 `featured` + `created`；P1 加 `trending`；P2 加 `downloads` + `rating`。

#### Semantic Facet 范围

```
GET /api/v1/packages?type=preset&semantic.warmth>=0.7&semantic.mood=cinematic,nostalgic

server 行为：
  · 对每个 facet 做范围或集合匹配
  · 不在 ontology 内的 facet → 返回 422
  · 不在受控词汇表的取值 → 忽略该值（继续匹配其它）+ warning
  · 多个 facet 之间 AND
```

#### Intent Facet 多选

```
GET /api/v1/packages?intent.useCases=vlog,wedding&intent.audience=beginner

server 行为：
  · useCases 多个值 OR
  · audience / workflowStage / domain 可多次出现，多次之间 AND
  · notFor 取反（排除）
```

`intent.useCase` 单数 query key 仅为旧 client 兼容 alias，计划在 marketplace contract v1.1 / 下个 minor 迁移窗口后移除；新 client 必须发送 `intent.useCases`。

#### Vector Search 混合排序

```
GET /api/v1/packages?embedding.query=warm vintage cinematic&embedding.modelId=clip-vit-base

server 流程：
  1. 用 modelId 编码 query → query vector
  2. 在向量 DB 做 ANN 召回（top 200）
  3. 应用 facet 过滤（其它参数）
  4. semantic + intent 加权评分
  5. 返回 top N

modelId 必须在 server 白名单内，否则 422。
```

### 3.3 Download（下载）

#### GET /api/v1/packages/:id/versions/:ver/download

获取预签名下载 URL（直传对象存储）。

**Response**：

```typescript
{
  url: string;             // 预签名 URL，5 分钟有效
  expiresAt: number;       // 绝对时间戳
  size: number;            // 字节
  integrity: string;       // SRI hash
  resumable: boolean;      // 是否支持 Range 请求
}
```

**约定**：

```
✓ URL 必须支持 HTTP Range（断点续传）
✓ URL 寿命 ≥ 5 分钟（client 可能下载大文件）
✓ 过期后 client 重新调用本端点续期
✓ integrity 与 manifest.source.integrity 一致（双重校验）
```

#### GET /api/v1/packages/:id/sparse-manifest

返回 sparse 模式包的子项目清单。

**Response**：

```typescript
{
  items: SparseItem[];     // 详见 manifest-schema-spec.md
  totalSize: number;
}
```

#### POST /api/v1/me/downloads/select

上报用户在 SparseSelector 中选中的子项目（用于 server 端推荐 + 流量预算）。

**Body**：

```typescript
{
  packageId: string;
  version: string;
  selectedItems: string[];     // SparseItem.itemId 列表
}
```

**Response**：`204 No Content`

#### GET /api/v1/packages/:id/variants/:vid/download

按 variantId 获取预签名 URL（model 量化档专用）。

**Path**：`vid` = `ModelVariant.variantId`（如 `fp16` / `q4_k_m`）

**Response**：与 §3.3 download 同结构。

#### GET /api/v1/packages/:id/proxy-variants/:tag/download

按 ProxyVariant.qualityTag 获取预签名 URL。

**Path**：`tag` = `'low' | 'medium' | 'high' | 'original'`

**Response**：与 §3.3 download 同结构。

#### GET /api/v1/packages/:id/delta

获取增量更新包。

**Query**：

```
from   string   起始版本（client 当前版本）
to     string   目标版本
```

**Response**：

```typescript
{
  url: string;             // delta 包预签名 URL
  size: number;            // delta 大小
  integrity: string;
  patchFormat: 'bsdiff' | 'xdelta3' | 'rsync';
  fallbackUrl?: string;    // 若 client 不支持 patchFormat，用整包 URL
}
```

### 3.4 Entitlement & Billing（购买与授权）

#### GET /api/v1/me/entitlements

当前用户所有授权列表。

**Response**：

```typescript
{
  entitlements: Array<{
    packageId: string;
    grantedAt: number;
    expiresAt?: number;          // 无限期则 null
    source: 'free' | 'purchase' | 'subscription' | 'team' | 'gift';
    reason?: string;
  }>;
  etag: string;                  // 用于 /changes 端点
}
```

#### GET /api/v1/me/entitlements/changes

差量同步（基于 ETag）。

**Headers**：`If-None-Match: <previous-etag>`

**Response**：

- `304 Not Modified` 若无变化
- `200 OK` 携带变化集：

```typescript
{
  added: Entitlement[];
  removed: string[];           // packageId 列表
  updated: Entitlement[];
  etag: string;
}
```

#### POST /api/v1/me/entitlements/refresh

强制刷新（client 详情页"刷新已购"按钮触发）。

**Response**：与 `GET /me/entitlements` 同。

#### POST /api/v1/me/entitlements/check

安装前授权校验。

**Body**：

```typescript
{
  packageId: string;
  version: string;
}
```

**Response**：

```typescript
{
  allowed: boolean;
  reason?: 'free' | 'purchased' | 'subscription' | 'private-access' | 'expired' | 'not-purchased';
  expiresAt?: number;
}
```

Client 缓存 5 分钟 TTL，避免每次安装都打 server。

#### GET /api/v1/billing/checkout-url

返回支付页 deep-link。

**Query**：

```
packageId    string    必填
returnTo     string    可选，购买完成后浏览器跳回的 URL（推荐 vscode://neko.market/refresh）
locale       string    可选，UI 语言
```

**Response**：

```typescript
{
  url: string;             // server 网页 URL，client 直接 openExternal
  sessionId: string;       // 可选，用于 client 轮询订单状态
  expiresAt: number;
}
```

#### WS /api/v1/me/entitlements/stream（可选）

WebSocket 实时推送 entitlement 变化（替代轮询）。

**Frame Format**：

```typescript
{
  type: 'added' | 'removed' | 'updated';
  entitlement?: Entitlement;
  packageId?: string;          // type='removed' 时
}
```

服务端实现可选；client 优先订阅 WS，失败回退到 5 分钟轮询。

### 3.4a Plugin Governance（native cdylib 专用）

> 治理决策见 [marketplace-plugin-governance.md](./marketplace-plugin-governance.md)。本节只定义 client / engine 需要调用或消费的 HTTP 契约。

#### Distribution publisher 投影

Server 在最终 manifest 中投影 publisher verification 状态：

```typescript
interface AssetDistribution {
  trustLevel?: 'core' | 'community' | 'untrusted';
  publisher?: {
    id: string;
    displayName: string;
    verified: boolean;
    verificationTier?: 'core' | 'verified';
    verifiedAt?: number;
  };
}
```

Plugin market 发布判定：

```
trustLevel === 'core'                         → 允许发布 plugin（T1 Core）
trustLevel === 'community' && publisher.verified === true
                                                → 允许发布 plugin（T2 Verified）
trustLevel === 'community' && publisher.verified !== true
                                                → 422 拒收 plugin；其它开放 type 不受影响
trustLevel === 'untrusted'                    → 不允许进入 market；仅表示本地 sideload / dev-mode 状态
```

#### POST /api/v1/plugins/:id/build

触发 Tier A/S commercial plugin 的 per-user build。免费 / 开源 plugin 可继续走普通 download 端点。

**Body**：

```typescript
{
  version: string;
  targetTriple: string;    // x86_64-apple-darwin / aarch64-apple-darwin / ...
  sessionId: string;
}
```

用户身份由 `Authorization: Bearer <token>` 推导；client 请求体不得携带可作为授权依据的 `userId`。

**Response**：

```typescript
// cached or fast path
{
  url: string;
  expiresAt: number;
  integrity: string;
  watermarkInfo: { purchaserId: string; sessionId: string };
}

// async path
{
  buildId: string;
  status: 'queued';
  estimatedDuration: number;
}
```

#### GET /api/v1/plugins/:id/build-status

**Query**：`buildId`

**Response**：

```typescript
{
  status: 'queued' | 'building' | 'done' | 'failed';
  progress?: number;
  eta?: number;
  reason?: string;
}
```

#### GET /api/v1/plugins/:id/build-result

**Query**：`buildId`

**Response**：

```typescript
{
  url: string;
  expiresAt: number;
  integrity: string;
}
```

仅 `build-status.status === 'done'` 后可用；否则返回 `409 Conflict`。

#### POST /api/v1/publishers/verify

提交 publisher KYC / verified 申请。客户端只打开 Publisher Portal 或调用该端点；审核、证件存储和风控在 server / portal 侧完成。

**Body**：

```typescript
{
  legalName: string;
  country: string;
  documentType: 'passport' | 'business-license' | 'tax-id';
  documentRef: string;
  contactEmail: string;
  publicKeyPem: string;
}
```

**Response**：

```typescript
{
  applicationId: string;
  status: 'submitted';
  expectedReviewDays: number;
}
```

#### GET /api/v1/publishers/:id/verification-status

**Response**：

```typescript
{
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  badgeIssuedAt?: number;
}
```

#### POST /api/v1/audit/permission-violation

Engine 上报 host-api audit 中发现的 permission 声明违规。该端点只覆盖 engine 可观测的 host-api 调用，不代表 native direct syscall 已被拦截。

**Body**：

```typescript
{
  pluginId: string;
  purchaserId?: string;
  sessionId?: string;
  permission: PluginPermission;
  declared: false;
  timestamp: number;
}
```

**Response**：`204 No Content`

### 3.5 Curation & Ontology

#### GET /api/v1/packages/:id/deprecation

C 类弃用元数据查询。

**Response**：

```typescript
{
  deprecation?: {
    since: number;
    replacedBy?: string;
    reason?: string;
    delistAt?: number;
  };
}
```

无 deprecation 返回空对象。

#### GET /api/v1/ontology/semantic

各 type/kind 的 semantic facet schema。

**Query**：`type?` `kind?`（可选过滤）

**Response**：

```typescript
{
  schemas: Record<string, FacetSchema>;     // key: 'preset.lut' / 'media.audio' 等
}

interface FacetSchema {
  fields: Array<{
    name: string;
    kind: 'enum' | 'range' | 'set' | 'string';
    values?: string[];          // enum / set 的取值
    min?: number;               // range 的范围
    max?: number;
    description?: string;
  }>;
}
```

Client 用此响应渲染 Browse Tab 的 facet UI。

#### GET /api/v1/ontology/intent

各 intent 字段受控词汇表。

**Response**：

```typescript
{
  useCases: string[];
  workflowStage: string[];
  goals: string[];
  audience: string[];
  domain: string[];
  notFor: string[];
}
```

---

## 四、Server 必须保证的不变量（13 条）

### 现有（v3.2 已锁定）

```
① Package detail 里 AssetManifest 已是最终形态（client 不再二次组装）
② source.kind == 'registry' 必带 integrity（SRI hash）
③ distribution 必带 signature 元数据（即使现在只是 presence-check）
④ trustLevel 必由 server 评定后下发，client 不重算
⑤ effects 字段（声明式副作用清单）由发布者声明 + server 审核后落到 manifest
⑥ bundle 的 contents 必经 server 校验（无环、版本兼容、内容存在）
```

### v3.3 新增（过期）

```
⑦ entitlement 必带 expiresAt（无限期则用 0 / null 表示）
⑧ deprecation 必带 since 时间戳，replacedBy 必经合法 packageId 校验
⑨ 删除 entitlement（退款 / 撤销）必通过 webhook 立即推 client，不靠下次轮询
```

### v3.4 新增（语义 / 意图 / 向量 / 大素材）

```
⑩ 发布者声明的 semantics 必经 server ontology 校验（取值在受控词汇表内）
⑪ 发布者声明的 intent.useCases / domain / workflowStage 必落 server 受控词汇表
⑫ Payload embeddings 必带 modelId / modelVersion / dimension 三件套
   不在 server 白名单的 modelId 拒收
⑬ totalSize 必填；sparse / proxy / variant 模式必填对应子字段
   bundle.contents 的 totalSize 累加必等于 bundle.totalSize
```

### v3.5 新增（Plugin Governance）

```
⑭ engine native plugin 必由 core 或 verified publisher 发布
   trustLevel=community 但 publisher.verified!=true → type=plugin 422 拒收

⑮ plugin manifest 必带 targetTriple，client / engine 只下载匹配平台产物
   不匹配 → 404 或 422（取决于是查询不存在还是 manifest 非法）

⑯ Tier A/S plugin 的下载 URL 必为 per-user build 产物，不许跨 user 共用
   server build cache key 至少包含 authenticated userId / pluginId / version / targetTriple
   authenticated userId 必须由 Bearer auth / server session 推导，不能信任请求体

⑰ Native cdylib 上传和 server-side build 必经 verified publisher 流水
   未 KYC 或公钥未登记 → 422 拒收

⑱ Workspace trust 状态由 client / engine 本地持有，server 不接收、不存储、不推断

⑲ Permission violation 上报必须落 server 审计记录；连续违规触发 publisher 风险处分
   注意：该上报仅覆盖 engine host-api audit，不代表 native direct syscall 可被可靠拦截
```

---

## 五、Manifest 权威性规则

### 5.1 Server 是 Manifest 的唯一权威产物源

```
发布者通过 server 上传素材 + 元数据
   ↓
Server 校验 + 签名 + 拼装 → 最终 AssetManifest
   ↓
Client 通过 GET /packages/:id 获取（只读）
   ↓
Client 安装时直接使用，绝不修改 / 二次拼装
```

### 5.2 字段权威性矩阵

| 字段 | 来源 | Client 是否可见 |
|---|---|---|
| `id / name / version / type` | publisher 声明 + server 校验 | ✓ |
| `source` | server 生成（含 integrity） | ✓ |
| `distribution.signature` | server 签名 | ✓（client 验证） |
| `distribution.author / publisherId / publisher` | server 验证（实名认证 / verified 状态投影） | ✓ |
| `distribution.trustLevel` | server 评定 | ✓（client 拦闸） |
| `effects` | publisher 声明 + server 审核 | ✓（client 反演卸载） |
| `dependencies / contents` | publisher 声明 + server 校验（无环 / 存在） | ✓ |
| `largeAsset` | publisher 声明 + server 验证（约束 §4.⑬） | ✓ |
| `semantics` | publisher 声明 + server ontology 校验 | ✓ |
| `intent` | publisher 声明 + server 受控词汇表校验 | ✓ |
| `embeddings` | publisher 声明 + server 验证（约束 §4.⑫） | ✓ |
| `deprecation` | server 注入（publisher 不可绕过） | ✓ |
| `compatibility` | publisher 声明 + server 校验 | ✓ |

License / entitlement 信息**不在 manifest** 中——属于 server 端 user-specific 状态，通过 `/me/entitlements` 端点返回。

### 5.3 签名机制分阶段

```
P0  presence-check       manifest.distribution.signature 字段存在即通过
P1  manifest 哈希校验    SHA256(manifest stable JSON) === signature.value
P2  crypto verification  ed25519 签名 + 公钥分发管线 + 撤销列表
```

`signature.algorithm` 字段标明阶段：

```typescript
{
  algorithm: 'sha256' | 'sha512' | 'ed25519';
  value: string;
  signedBy?: string;        // ed25519 阶段必填
  publicKeyId?: string;     // ed25519 阶段必填
}
```

### 5.4 Trust Level 分发

```
core         官方维护、已审核、已签名
community    社区发布、签名验证通过
untrusted    本地手动放置 / 未签名
```

Server 评定后写入 `manifest.distribution.trustLevel`，client 不重算。Client 拦闸规则详见 [marketplace.md §十四 信任与安全](./marketplace.md)。

---

## 六、不在本契约范围（Server 内部实现）

以下内容是 server 内部职责，对 client 完全透明，由 `neko-registry-server` 项目的 `docs/` 持有：

```
✗ Publisher Portal（Web UI 上传 / 审核状态查询）
✗ Upload API（分片上传 / 完整性校验 / 元数据提取）
✗ Review Queue（人工审核 + AI 辅助审核）
✗ Signature Generation（密钥管理 / 撤销）
✗ Upstream Proxy（HF / Civitai 适配器 + 透明缓存）
✗ Payment Processing（Stripe / Alipay / 微信支付通道）
✗ Webhook Out（→ client / publisher / payment provider）
✗ Search Index 维护（PostgreSQL / MeiliSearch / Qdrant 选型）
✗ CDN / 对象存储选型（Cloudflare R2 / 阿里云 OSS / S3）
✗ Ontology 维护（受控词汇表的 CRUD + 版本演进）
✗ 数据库 schema（packages / versions / licenses 表）
✗ 部署架构（容器 / Kubernetes / Serverless）
```

详见独立项目 `neko-registry-server` 的 `README.md`。

---

## 七、客户端订阅 Server 事件（Webhook → deep-link）

支付完成 / 订阅续费 / 退款撤销等事件的 server → client 通知：

```
方式 1：deep-link 跳回（购买流程）
  浏览器完成支付 → server 重定向到 vscode://neko.market/refresh?packageId=...
  → client deep-link handler 触发 entitlements/refresh

方式 2：WebSocket 推送（可选）
  server 维持长连接，事件即时推送
  client 重连机制 + 5 分钟轮询作为兜底

方式 3：Webhook 转 deep-link（server 内部）
  支付成功 → server 收到 webhook → 颁发 entitlement
  → 若 client 在线（WS 已连）→ 推 added 事件
  → 若 client 离线 → 等 client 下次启动 refreshAll() 拉取
```

Client 永远不持有 webhook secret，永远不接收 server → client 主动 HTTP POST。

---

## 八、版本演进与兼容性

### 8.1 API 版本策略

```
v1                  当前主版本，破坏性变更进 v2
v1 + 新字段         向后兼容（client 忽略未知字段）
v1 + 新端点         向后兼容（老 client 不调即可）
v1 → v2             破坏性，必须 server 同时支持两版本 ≥ 6 个月
```

### 8.2 Manifest 字段演进

```
新增字段        必标 optional（老 client 忽略）
删除字段        v2 才能做（v1 仍保留并标 deprecated）
字段含义改变    必须改名（不允许同名异义）
```

### 8.3 Server 兼容性矩阵

| Server 版本 | 支持 Client 版本 |
|---|---|
| `1.0.x` | `1.0.x` |
| `1.1.x` | `1.0.x` + `1.1.x`（新功能 graceful degradation） |
| `2.0.x` | `1.x.x`（≥ 6 个月并存）+ `2.0.x` |

### 8.4 Client 调用 Server 的兼容策略

```
✓ 先调 GET /api/v1/version 探测 server 能力
✓ 不在 server.capabilities 列表的端点不调
✓ 已知不可用的字段忽略，不让 UI 崩溃
✓ Schema 校验失败 → log warning + 跳过该项，不阻塞列表渲染
```

### 8.5 本仓 client 实现备注（2026-05-05）

`@neko/market-core` 的 `MarketClient` 已按本契约实现 P0 调用面，并为 P1/P2 endpoint 保留 capability-gated 方法。

```
P0 已实现并有 contract tests
├── GET /version capability probe
├── GET /packages search envelope，支持 q/types/category/tags/visibility/pricing/publisher/sort/order/semantic/intent/embedding/limit/offset/cursor
├── GET /packages/:id detail envelope
├── GET /packages/:id/versions envelope
├── GET /featured envelope
├── GET /packages/:id/versions/:ver/download descriptor
├── GET /me/entitlements
├── GET /me/entitlements/changes + If-None-Match / 304
├── POST /me/entitlements/refresh
├── POST /me/entitlements/check
└── GET /billing/checkout-url

已建模但按 capability gate 调用
├── GET /packages/:id/sparse-manifest
├── POST /packages/:id/sparse-selection
├── GET /packages/:id/variants/:variantId/download
├── GET /packages/:id/proxy-variants/:tag/download
├── GET /packages/:id/delta
├── GET /ontology/semantic
├── GET /ontology/intent
└── GET /packages/:id/deprecation
```

Fallback 行为：

```
✓ /version 不存在或失败 → 假定仅 P0 discovery/detail/versions/download/entitlement/check 可用
✓ capability 缺失 → client 不调用 sparse/proxy/delta 等 optional endpoint，webview 控件隐藏或 disabled
✓ delta P0 → client 可请求 `/packages/:id/delta`，但本仓运行时使用 descriptor 的 full fallback 下载并校验；patch apply 留到 P1
✓ Problem Details → 抛 typed error，保留 status/title/detail/type/instance/extensions
✓ 304 Not Modified → entitlement cache 保持不变
✓ 429 Retry-After → client contract tests 覆盖 retry/backoff 入口；UI 按 retryable throttled state 展示
✓ checkout/renew/invoice/support → extension host 使用 vscode.env.openExternal，不在 webview 中渲染支付表单
```

---

## 九、性能与限流

### 9.1 Client 端缓存策略

| 端点 | 缓存 | TTL |
|---|---|---|
| `GET /packages` (search) | 内存 | 5 分钟 |
| `GET /packages/:id` | 内存 | 30 分钟 |
| `GET /packages/:id/versions` | 内存 | 30 分钟 |
| `GET /me/entitlements` | 内存 | 5 分钟 |
| `GET /ontology/*` | 内存 + 磁盘 | 24 小时（client 重启保留） |
| `GET /featured` | 内存 | 1 小时 |
| download URL | 不缓存 | 一次性使用 |

### 9.2 Server 端限流

```
匿名用户：     60 req/min
已登录用户：    600 req/min
认证发布者：    1000 req/min（含发布相关端点）
```

超限返回 `429 Too Many Requests` + `Retry-After` header。Client 必须实现指数退避重试。

### 9.3 长操作

```
search             同步返回，最多 5 秒
detail             同步返回，最多 2 秒
versions           同步返回，最多 2 秒
entitlements       同步返回，最多 3 秒
download URL       同步返回，最多 5 秒（含对象存储签名生成）

所有同步端点超时 → client 显示 loading + retry 按钮
```

---

## 十、安全与合规

### 10.1 Client 永不持有的凭证

```
✗ 卡号 / Stripe customer id / 支付通道 user id
✗ Webhook secret
✗ 签名私钥
✗ Server 内部 API key
✗ 其它 client 的 auth token
```

### 10.2 Server 永不下发的内容

```
✗ user-specific PII（除当前用户自身）
✗ Webhook 内部 metadata
✗ 未审核的 manifest（必须先经 server 审核流水）
✗ 上游代理的原始 token（HF/Civitai 的 user token）
```

### 10.3 地区合规

```
client 请求带 Accept-Language + IP（server 看 request origin）
server 按地区下架部分包（返 451 Unavailable For Legal Reasons）
client 不缓存 451 响应
```

---

## 十一、变更日志

### v1.0（2026-05-05）

```
+ 抽出自 marketplace.md §十一
+ 完整描述 5 大端点组（Discovery / Sort & Search / Download / Entitlement / Curation）
+ 补充 Plugin Governance 端点组（Build / Publisher KYC / Permission Audit）
+ 19 条 Server 不变量
+ Manifest 权威性规则 + 字段权威性矩阵
+ 签名机制分阶段（P0 presence / P1 hash / P2 crypto）
+ 长操作 / 限流 / 缓存策略
+ 不在范围声明（11 条 server 内部职责）
```
