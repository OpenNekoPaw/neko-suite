## Why

`docs/architecture/marketplace.md`、`registry-server-contract.md` 和 `manifest-schema-spec.md` 已经把 neko-market 的客户端职责、Registry HTTP 契约和 AssetManifest v4 schema 拆成权威文档，但当前实现仍保留旧 AssetType、简单 HTTP 包络和 archive-only 安装路径。现在需要把本仓客户端实现收敛到这三份契约，避免 market、agent、assets、registry-server 继续围绕不同清单形态演进。

## What Changes

- **BREAKING**：将共享 `AssetManifest` 契约升级到 v4：11 种 `AssetType`、`AssetCategory` 映射、`DistributionKind`、`EffectsManifest`、`BundleContent`、`LargeAssetStrategy`、typed semantics / intent / embeddings / deprecation 字段。
- **BREAKING**：将旧类型名和 InstallTarget 路由从 `video` / `audio` / `ai-model` / `lora` / `template` / `provider-card` 等迁移到 `media` / `model` / `starter` / `provider` 等 v4 类型，并以 metadata kind 区分子类型。
- 对齐 Registry API v1：搜索、详情、版本、推荐、下载、大素材 sparse/variant/proxy、entitlement/billing、curation/ontology、version/capability probe、RFC 7807 错误处理、ETag/cache headers 和 Bearer token 注入。
- 将 `MarketClient` 的查询/响应类型对齐 server 契约，包括 `featured` / `created` P0 排序、cursor/offset 分页、semantic/intent/vector facets、`MarketPackage` 响应包络和 detail install state。
- 将安装生命周期升级为 preflight → license → download → verify → stage → activate → record → cleanup 的 8 阶段编排，按 `DistributionKind` 分发 archive / orchestration / registration。
- 引入声明式 `EffectsManifest` 激活与反演卸载，补齐 rollback、依赖、bundle 引用计数、缓存/配额、冲突和 trust gate 的可测试边界。
- 建立 InstallTarget 贡献协议：market-core 持有 Layer 0 registry 与 4 个 X 类默认目标，7 个 Y 类目标通过子包按需注册，避免 market extension 直接依赖 agent/cut/assets/model-runtime 领域实现。
- 对齐 Webview 管理面：Browse / Installed / Owned / Updates 四个顶级视图，Browse 内部 category chips + segmented sort，购买只走外部 checkout URL，client 不持有支付状态机。
- 更新文档、迁移说明和测试，确保 client/server 边界、webview sandbox、Layer 0/1/2 依赖方向可被验证。

## Capabilities

### New Capabilities

- `market-manifest-contract`: 定义 AssetManifest v4、11 种 AssetType、DistributionKind、EffectsManifest、大素材、语义/意图/向量、弃用和 schema 演进规则。
- `market-registry-client-contract`: 定义 neko-market 客户端如何调用 Registry API v1、处理认证、缓存、错误、搜索 facets、下载、授权、billing deep-link 和 server capability probe。
- `market-install-runtime`: 定义 market-core 的安装生命周期、DistributionKind 分发、EffectsManifest 激活/反演、rollback、依赖、bundle 引用计数、缓存/配额/冲突/trust 中间件和 InstalledRegistry 行为。
- `market-install-target-contributions`: 定义 11 种 InstallTarget 的职责、X/Y 归属、贡献注册协议、激活事件、反注册和跨扩展解耦规则。
- `marketplace-management-surfaces`: 定义 Webview 和消费扩展看到的 Browse / Installed / Owned / Updates、购买跳转、事件广播、AssetLibrary deep-link 和状态显示规则。

### Modified Capabilities

- 无。当前 `openspec/specs/` 尚无 neko-market / AssetManifest / Registry API 相关归档能力，本变更新增 market 契约基线。

## Impact

- `packages/neko-types/src/types/asset/*`: 升级 manifest、market、effects、registry 类型与导出，增加 type guard / parse helper / schema fixtures。
- `packages/neko-market/packages/core`: 升级 `MarketClient`、安装管理器、DistributionKind dispatcher、effects inverter、target registry、cache/license/version/installed registry 集成。
- `packages/neko-market/packages/extension`: 压薄 VSCode host 入口，接入 `neko-auth` token、external checkout、贡献发现、Disposable 注册和 webview message adapter。
- `packages/neko-market/packages/webview`: 对齐四 Tab 信息架构、category chips、P0 排序、Owned/Updates 视图、错误/空态/安装状态投影和 i18n。
- `packages/neko-agent`、`neko-assets`、`neko-cut`、`neko-model`、`neko-tools`: 通过 `NekoMarketAPI.registerInstallTarget` 或事件订阅接入 Y 类目标，不允许 market extension 反向 import 领域包。
- `docs/architecture/marketplace.md`、`registry-server-contract.md`、`manifest-schema-spec.md`: 保持为权威来源；实现备注、迁移状态和测试命令需同步更新。
