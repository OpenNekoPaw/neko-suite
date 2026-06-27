# ADR: SQLite 本地元数据 Store 与 JSON 事实文件边界

状态：Proposed
日期：2026-06-27
范围：`~/.neko/`、workspace `neko/`、workspace `.neko/`、workspace `.neko/.cache/`、VS Code `globalStorageUri`、ContentAccess、ResourceCache、Search、Assets、Entity、Agent、Market 和各创作领域的本地元数据。

本文定义 Neko Suite 何时应使用 SQLite 管理本地元数据，何时必须继续使用 JSON/Markdown/TOML/`nk*` 文件作为事实源。它补充 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、[`asset-library.md`](asset-library.md)、[`unified-entity.md`](unified-entity.md) 和 `normalize-neko-storage-scopes` OpenSpec。

## 背景

当前仓库已经形成四层本地存储模型：

- `~/.neko/`：用户级跨项目数据。
- `<workspace>/neko/`：可 Git 管理的项目事实。
- `<workspace>/.neko/`：工作区本机状态，默认 gitignored。
- `<workspace>/.neko/.cache/`：可删除、可重建的派生缓存。

实现中已有多个 JSON manifest / index / record 文件承载高频更新、本地索引或派生状态，例如：

- `.neko/.cache/resources/manifest.json`
- `.neko/.cache/proxies/manifest.json`
- `.neko/.cache/generated/index.json`（待迁移为 generated draft/projection 索引，不能作为已保存生成资产事实源）
- `.neko/.cache/media-metadata.json`
- `.neko/.cache/search-index.json`
- `.neko/.cache/asset-graph.json`
- `~/.neko/conversations-index.json`
- `~/.neko/market-installed.json`

其中一部分是可审阅的用户事实或配置，适合继续保持文件形式；另一部分是可重建、本机高频变化、需要查询/事务/GC 的本地元数据，继续拆成多个 JSON 文件会造成重复 manifest、跨文件一致性、并发写入、增量查询和清理策略复杂化。

`packages/neko-types/src/types/storage.ts` 已预留 `.neko/.cache/neko-cache.db`，但尚未定义哪些数据可以进入该数据库、谁拥有数据库、Webview/Agent 是否可感知数据库、以及 SQLite 与 JSON 事实文件的边界。

## 决策

引入统一的 Host-owned `LocalMetadataStore`，以 SQLite 作为本地元数据和派生 read model 的默认持久化实现。SQLite 不替代项目事实文件，不保存 Webview URI、Engine token、cache path 作为稳定身份，也不让 Agent/Webview 直接感知数据库或缓存目录。

核心决策：

- `neko/` 下的项目事实继续使用 JSON/Markdown/TOML/`nk*` 等可审阅文件。
- `.neko/.cache/neko-cache.db` 承接项目级可重建缓存 manifest、索引、投影、状态账本和 GC 元数据。
- `globalStorageUri` 使用 extension-private SQLite store 承接无 workspace 的资源缓存、Market extension cache、provider catalog cache 和运行时索引。
- `~/.neko/` 保留用户可编辑配置、Skill、Command、Processor manifest、AGENTS 和 journal 文件；只把 catalog/search/index/read model 等派生投影放入用户级 SQLite store。
- 如果未来出现非 Git、非缓存、不可重建但本机有价值的项目本地状态，必须单独设计 `.neko/neko-local.db` 或等价 store；不得把不可重建数据塞进 `.neko/.cache/neko-cache.db`。

## 判断规则

| 数据特征 | 默认存储 |
| --- | --- |
| 用户可编辑、需要 Git diff/merge、团队共享、是项目事实源 | JSON/Markdown/TOML/`nk*` 文件 |
| 本机可重建、派生自 source ref/ResourceRef/provider、可删除后重建 | SQLite metadata + 文件 artifact |
| 高频更新、需要事务、去重、引用计数、LRU/GC、分页查询 | SQLite |
| 多领域共享的查询投影、反向索引、availability/read model | SQLite |
| 大型二进制、媒体、文档页图、缩略图、proxy、模型、音视频 | 文件 artifact，由 SQLite 记录 metadata |
| 用户显式保留的媒体或项目资产 | workspace/media-library 文件 + 项目事实引用 |
| 日志、journal、AGENTS、Skill/Processor manifest、用户配置 | 文件 |

SQLite 存的是本地账本和索引，不是项目事实本身。业务层必须继续通过 `ContentAccessService`、`ResourceCacheService`、Search/Entity/Asset facade 或 Host adapter 访问这些数据，不直接读取 SQLite 表。

## 应直接进入 SQLite 的数据

以下数据应从多个 JSON manifest / index 收敛到 `LocalMetadataStore`。这里的“进入 SQLite”指记录、状态、索引和诊断进入数据库；实际媒体 artifact 仍保存在受管目录中。

| 当前或计划数据 | 建议 SQLite 表/分区 | 说明 |
| --- | --- | --- |
| Resource cache manifest | `resource_cache_entries`、`resource_cache_variants`、`cache_files` | 替代 `.neko/.cache/resources/manifest.json`；记录 `ResourceRef`、variant、fingerprint、status、size、provider、materialized path relative to cache root。 |
| 文档页图、缩略图、preview variant、proxy 记录 | `resource_cache_variants`、`resource_cache_jobs` | 统一记录 page-image、thumbnail、proxy、preview、fov-crop 等变体状态。 |
| Proxy manifest | `proxy_variants` 或并入 `resource_cache_variants` | 替代 `.neko/.cache/proxies/manifest.json`，避免媒体代理单独维护一套 manifest。 |
| Generated draft index | `generated_drafts`、`generated_asset_projection` | 替代 `.neko/.cache/generated/index.json` 中未保存草稿的运行时索引；只记录会话可见草稿、retention、诊断和投影。已保存/提升的生成资产事实写 AssetStore 或 `neko/assets/library.json`，不能以 cache 路径作为事实。 |
| Media probe metadata | `media_metadata` | 替代 `.neko/.cache/media-metadata.json`；记录 Engine/provider version、source fingerprint、duration、dimension、codec、diagnostics。 |
| Search index 和 FTS/read model | `search_documents`、`search_terms`、`search_partitions` | 替代 `.neko/.cache/search-index.json`；Search 仍只暴露 service API，不暴露 DB。 |
| Asset graph projection | `asset_graph_edges`、`asset_graph_nodes` | 替代 `.neko/.cache/asset-graph.json`；仅保存关系投影，不拥有 Asset/Entity 事实。 |
| Entity occurrence / relationship projection | `entity_occurrences`、`entity_relationships` | 派生自 Story、Canvas、Agent、Documents、Assets；confirmed entity 仍在 `neko/` 事实文件。 |
| Entity binding availability / reverse index | `entity_binding_projection` | 记录绑定可用性、orphaned 状态、反向查询和展示排序；用户确认绑定事实仍在 `neko/entity-bindings.json`。 |
| Media library availability projection | `media_library_status` | 记录当前机器 resolved root、accessible、missing、remapped diagnostics；不回写 `.neko/settings.local.json` 或 `neko/settings.json`。 |
| Cache touch、LRU、quota、GC 状态 | `cache_touches`、`cache_gc_runs` | 避免高频更新 JSON manifest；GC 只删除 cache artifact 和 metadata。 |
| Provider diagnostics 和 rebuild jobs | `provider_diagnostics`、`resource_cache_jobs` | 记录 failed/missing/stale/unsupported 等可观察状态，支持 retry 和 fail-visible。 |
| Skill/Command/Processor catalog projection | user/extension `catalog_items` | 派生自 manifest 文件和 Market contribution；manifest 仍是文件事实。 |
| Conversation list/search projection | user `conversation_index` | `Journal` 或消息文件仍是用户数据事实；列表、搜索、最近使用和统计可进 SQLite。 |
| Market catalog/cache projection | user/extension `market_catalog_cache` | 包 catalog、搜索、下载缓存 metadata 可进 SQLite；用户级安装事实是否迁入 DB 需要单独兼容/导出设计。 |
| Dashboard activity projection | project-local `dashboard_activity` | 若仅为可重建/可丢弃活动投影可进 cache DB；若是用户有价值的本机历史，应放项目本地 DB 而不是 cache DB。 |

## 应继续使用 JSON/Markdown/TOML/项目文件的数据

以下数据不应因为引入 SQLite 而迁入数据库：

| 数据 | 位置 | 原因 |
| --- | --- | --- |
| 项目设置和媒体库变量 | `neko/settings.json` | 团队共享、可审阅、需要 Git diff。 |
| 本机媒体库 override | `.neko/settings.local.json` | 用户可编辑、体积小、排查直观。 |
| 素材库事实 | `neko/assets/library.json` | AssetEntity、Variant、File、provenance 是项目事实。 |
| 统一实体事实 | `characters.json`、`neko/entities/*.json` | Entity ID、名称、状态和语义 metadata 是项目事实。 |
| 用户确认实体绑定 | `neko/entity-bindings.json` | 绑定是用户确认事实，不是缓存。 |
| 实体需求和视觉草案 | `neko/entity-asset-requirements.json`、`neko/visual-identity-drafts.json` | 可审阅、可合并、用户确认或待确认事实。 |
| Domain project files | `.nkc`、`.nkv`、`.nks`、`.nkm`、`.nkp` 等 | 项目格式契约，不由 SQLite 隐式改写。 |
| AGENTS / memory / Skill / Command / Processor manifest | `AGENTS.md`、`.neko/memory.md`、`~/.neko/skills/*`、`.neko/processors/*.json` | 用户可读写、可复制、可审计。 |
| 用户配置 | `~/.neko/config.toml` 或配置文件 | 用户管理，不是运行时索引。 |
| Conversation journal / message records | `~/.neko/conversations/*` 或 journal 文件 | 属于用户历史事实；SQLite 可做索引，但不能成为唯一不可导出的黑盒。 |
| 日志 | `.neko/logs/*` | append-only 文本更易排查；需要索引时再投影到 SQLite。 |
| 用户确认 retained media | workspace/media-library 文件 | 二进制源文件不应作为 SQLite blob 隐藏。 |

## 存储区域分析

### 用户区 `~/.neko/`

适合继续文件管理：

- `~/.neko/config.toml` / `config.json`
- `~/.neko/AGENTS.md`
- `~/.neko/skills/`
- `~/.neko/commands/`
- `~/.neko/prompts/`
- `~/.neko/processors/`
- conversation journal / message files
- 用户可直接备份、复制、编辑的 Market 或 provider manifest

适合 SQLite 管理：

- Skill / Command / Prompt / Processor catalog projection。
- Market catalog cache、搜索索引、下载缓存 metadata。
- Conversation list/search/recent/favorite/statistics index。
- Provider card catalog projection、启用状态投影、诊断。
- 用户级跨项目最近资源、最近项目、最近实体/素材引用的索引。

不应使用 SQLite 隐藏的内容：

- 用户配置、AGENTS、Skill/Processor manifest、prompt 正文。
- 未提供导出/备份/修复方案的 conversation 原文。
- trust state 或 entitlement 的唯一事实源，除非同时定义签名、导出和恢复策略。

### 工作区项目事实 `neko/`

`neko/` 是 Git-trackable project facts，不应引入 SQLite 作为默认项目格式。继续文件管理：

- `neko/settings.json`
- `neko/config.json`
- `neko/assets/library.json`
- `neko/entity-bindings.json`
- `neko/entity-asset-requirements.json`
- `neko/visual-identity-drafts.json`
- `neko/entities/*.json`
- 未来 team-shared skills/prompts/processors 的显式项目事实位置

适合 SQLite 的只有派生投影，但不应放在 `neko/` 下。比如实体出现点、绑定可用性、素材关系图、搜索索引应进入 `.neko/.cache/neko-cache.db`。

### 工作区本机状态 `.neko/`

`.neko/` 是 gitignored project-local state。继续文件管理：

- `.neko/settings.local.json`
- `.neko/memory.md`
- `.neko/skills/`、`.neko/commands/`、`.neko/prompts/` 中用户明确创建的 project-local 内容
- `.neko/processors/*.neko-processor.json`
- `.neko/logs/*`
- `.neko/state` 中需要人工排查或迁移的轻量快照

可考虑 SQLite，但需要先分类为不可重建项目本地状态：

- Dashboard 本地历史。
- Agent project-local activity index。
- 大量 project-local 最近使用/排序/展开状态。

这些数据如果不可重建，不得放入 `.neko/.cache/neko-cache.db`。需要时应设计 `.neko/neko-local.db` 或等价 store，并提供备份、清理和迁移策略。

### 工作区缓存 `.neko/.cache/`

`.neko/.cache/` 是 SQLite 最适合落地的区域。推荐结构：

```text
.neko/.cache/
  neko-cache.db
  resources/
  thumbnails/
  proxies/
  generated-drafts/
  vectors/
```

`neko-cache.db` 管理：

- resource cache entries / variants / files
- media metadata
- proxy metadata
- generated draft/projection index
- search partitions and FTS/read models
- asset/entity graph projections
- provider diagnostics
- materialize job queue
- GC touch/quota/pin/session-active 状态

受管目录保存实际 artifact：

- 文档页图
- 缩略图
- proxy media
- preview/fov-crop
- 未保存 generated 草稿的预览/投影文件；已保存生成资产的 thumbnail/preview/proxy 派生物
- embedding/vector sidecar 文件

规则：

- 删除 `.neko/.cache/` 不得损坏项目事实。
- DB 损坏应按 cache miss/rebuild 处理，并返回 typed diagnostic。
- SQLite 中的 materialized path 只能是相对 cache root 的内部定位，不能作为上层 durable identity。
- Webview、Agent、Canvas、Storyboard、Search UI 不读取 DB 或 cache path，只通过 Host service 获取 projection。

### VS Code `globalStorageUri`

适合 SQLite 管理：

- no-workspace resource cache metadata。
- extension-private Market cache/index。
- provider catalog cache。
- extension-private generated draft/projection metadata。
- extension session/read model。

继续文件管理：

- 大型下载包、生成 artifact、模型/媒体缓存文件。
- 需要用户手动拷贝或诊断的导出包。

`globalStorageUri` 不是 `~/.neko`。前者是 extension-owned implementation state，后者是 user-managed cross-project data。

## 接口边界

新增或实现 SQLite 时应先定义小接口，而不是让业务代码导入 SQLite client：

```text
LocalMetadataStore
  transaction()
  getPartitionVersion()
  migrate()
  putRecord()
  getRecord()
  queryRecords()
  deleteRecords()
  compact()
  dispose()
```

分层要求：

- L0 shared contracts 定义 store DTO、partition、migration version、diagnostic code，不依赖 VS Code、React、Agent 或领域包。
- VS Code Extension Host adapter 负责 SQLite 打开、WAL、migration、busy timeout、dispose、路径解析和文件锁。
- `ResourceCacheService`、Search、Assets、Entity projection、Agent catalog 只依赖 store interface。
- Webview 和 TUI 只接收投影 DTO，不接收数据库路径、表名、cache path 或 SQLite error 原文。
- `neko-engine` 继续负责二进制/媒体读取、Range、probe、decode 和派生计算；不负责纯本地元数据数据库。

## SQLite 依赖选择

实现前需要做 packaging spike。候选方案应按以下标准评估：

| 方案 | 优点 | 风险 |
| --- | --- | --- |
| Node native SQLite package | 性能好，事务和 WAL 成熟 | VS Code/Electron ABI、跨平台预编译、扩展打包和签名风险 |
| WASM SQLite | 打包简单，跨平台稳定 | 大库性能、文件持久化、并发和内存占用需要验证 |
| Rust/N-API SQLite adapter | 可控、可复用 Rust 生态 | 不应把 Engine 变成本地项目数据库；需要独立 host adapter 边界 |
| 保持 JSON | 依赖最低，易手工排查 | 多 manifest 膨胀、并发、事务、查询和 GC 问题继续存在 |

ADR 不指定具体库。实现提案必须先验证 VS Code Extension Host 的安装、打包、启动性能、dispose、migration、测试环境和跨平台行为。

## 迁移策略

优先迁移顺序：

1. `ResourceCacheService` manifest：从 `.neko/.cache/resources/manifest.json` 迁到 `.neko/.cache/neko-cache.db`。
2. proxy / thumbnail / document page / preview variant metadata：并入 resource cache variants。
3. media metadata、generated draft/projection index、GC touch 状态。
4. Search index、asset graph、entity occurrence / binding projection。
5. 用户级 catalog/search projection，例如 Skill catalog、Market cache、conversation index。

迁移规则：

- prelaunch 内部路径可以破坏性收敛，但不能静默损坏有价值本地数据。
- 旧 JSON 只能由显式 migrator、diagnostic 或 rejection path 读取；新成功路径不得继续 dual-read。
- 迁移完成后旧 JSON 可保留为 `.bak` 或 diagnostic input，但默认服务不得读取它返回成功。
- 测试必须 poison 旧 JSON 路径，证明 canonical path 命中 SQLite。
- cache DB 可删除重建；user/project-local DB 若承载不可重建数据，必须提供导出、备份、修复或迁移。

## 测试与质量门禁

引入 SQLite 后至少需要：

- store contract tests：migration、transaction、rollback、WAL/busy、dispose、corruption diagnostic。
- ResourceCache parity tests：JSON manifest fixture 迁移到 SQLite 后 resolve/ensure/project/gc 行为一致。
- legacy path poisoning：旧 `manifest.json`、`search-index.json`、`asset-graph.json` 不得被新成功路径读取。
- cache deletion tests：删除 `.neko/.cache/` 不影响 `neko/` 事实、domain project files、asset/entity facts。
- boundary tests：Webview/Agent/Search UI 不导入 SQLite client，不读取 DB/cache path。
- packaging smoke：VS Code Extension Host 启动、关闭、reload、multi-workspace、多 panel 生命周期。

## 后果

收益：

- 减少多个 JSON manifest 的重复实现和跨文件一致性问题。
- 支持事务、增量查询、FTS/read model、引用计数、LRU/GC 和高频 touch。
- 强化“缓存透明 + 可重建”，避免 Agent/Webview 感知 cache path。
- 让 ContentAccess、ResourceCache、Search、Entity projection、Assets projection 共用同一套本地元数据规则。

成本：

- 增加 SQLite runtime、migration、packaging、备份/修复和测试复杂度。
- 手工排查不如 JSON 直观，需要诊断命令或 inspector。
- 必须严格区分 cache DB 与不可重建 local DB，避免把用户数据误删。

拒绝的方案：

- 把所有 `neko/` 项目事实迁入 SQLite：会破坏 Git diff/merge、人工审阅和项目格式可移植性。
- 每个包各自维护 SQLite：会重复 schema/migration/cleanup，并重新制造跨包耦合。
- 把缩略图、文档页图、proxy 等媒体 bytes 直接作为 SQLite blob：不利于 Webview URI、Engine Range、外部工具和大文件清理。
- 继续无限扩展多个 JSON manifest：短期简单，但已经暴露出大型 manifest、legacy 字段污染、GC 和查询复杂度问题。
