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
- `~/.agents/skills/` 保留用户可编辑 portable Skills；`~/.neko/` 保留配置、Command、Processor manifest、AGENTS 和 journal 文件。两者都只把 catalog/search/index/read model 等派生投影放入用户级 SQLite store。
- 如果未来出现非 Git、非缓存、不可重建但本机有价值的项目本地状态，必须单独设计 `.neko/neko-local.db` 或等价 store；不得把不可重建数据塞进 `.neko/.cache/neko-cache.db`。
- SQLite 的推荐角色是本机索引层、账本层和查询层，而不是 `neko/` 项目事实的替代格式。当前模型是“文本/JSON 维护项目事实，SQLite 维护可重建 read model”。

### SQLite 放置策略

SQLite 数据库放在用户区还是工作区，取决于数据的身份锚点，而不是取决于调用方是谁：

| 数据身份                                                          | 默认位置                                                       | 说明                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 绑定到某个 workspace/project source ref 的可重建投影              | `<workspace>/.neko/.cache/neko-cache.db`                       | 例如 resource cache manifest、文档页图状态、media metadata、Project Search FTS、semantic coverage ledger、语义 evidence read model、entity occurrence projection。删除后可以从项目事实、source ref、provider 重新生成。 |
| 绑定到某个 workspace 但不可重建、且是本机私有状态                 | `<workspace>/.neko/neko-local.db` 或等价单独 store             | 只有在明确需要时才设计，例如不可重建的项目本机历史。不得放进 `.neko/.cache/neko-cache.db`，否则 cache 清理会误删有价值状态。                                                                                            |
| 跨项目、用户级、可重建的 catalog/search/read model                | `~/.neko/` 下的用户级 SQLite store                             | 例如 Skill/Command/Processor catalog 投影、conversation 列表/搜索投影、用户级最近资源索引。Portable Skill package、processor descriptor、配置和 journal 仍是文件事实。                                                  |
| Extension 私有、无 workspace 或不应暴露给用户直接管理的运行时索引 | VS Code `globalStorageUri` 下的 extension-private SQLite store | 例如 no-workspace cache metadata、Market catalog cache、provider catalog cache、extension-private generated draft projection。不要把它当成 `~/.neko` 用户事实。                                                         |

因此，项目语义索引的默认落点应是工作区 cache DB：`<workspace>/.neko/.cache/neko-cache.db`。原因是语义 evidence、FTS 项、coverage ledger、分析任务状态和 source fingerprint 都锚定到项目 source ref / ResourceRef / document range；它们是项目上下文的派生索引，不应污染用户级跨项目数据库，也不应写入 `neko/` 项目事实目录。

用户区只保存跨项目的索引和投影；工作区 cache DB 保存项目可重建索引；工作区 local DB 只给不可重建的本机私有项目状态预留。任何 store 都不得把 Webview URI、Engine token、cache path 或 provider runtime handle 作为稳定身份。

SQLite 数据库默认不随项目共享，也不进入 Git-tracked 项目事实目录。团队共享、项目打包、迁移和跨机器恢复应共享 `neko/` 下的事实文件、domain project files、source media refs 和导出格式；每台机器再从这些事实和源文件重建 `.neko/.cache/neko-cache.db`。如果未来决定共享 SQLite 本身，则这不再是本地 metadata store，而是新的 Neko 项目数据库格式，需要单独 ADR 覆盖 diff/merge、迁移、备份、修复、审计、锁和同步策略。

## 判断规则

| 数据特征                                                                    | 默认存储                                    |
| --------------------------------------------------------------------------- | ------------------------------------------- |
| 用户可编辑、需要 Git diff/merge、团队共享、是项目事实源                     | JSON/Markdown/TOML/`nk*` 文件               |
| 本机可重建、派生自 source ref/ResourceRef/provider、可删除后重建            | SQLite metadata + 文件 artifact             |
| 高频更新、需要事务、去重、引用计数、LRU/GC、分页查询                        | SQLite                                      |
| 多领域共享的查询投影、反向索引、availability/read model                     | SQLite                                      |
| 大型二进制、媒体、文档页图、缩略图、proxy、模型、音视频                     | 文件 artifact，由 SQLite 记录 metadata      |
| 用户显式保留的媒体或项目资产                                                | workspace/media-library 文件 + 项目事实引用 |
| 日志、journal、AGENTS、portable Skill package、Processor manifest、用户配置 | 文件                                        |

SQLite 存的是本地账本和索引，不是项目事实本身。业务层必须继续通过 `ContentAccessService`、`ResourceCacheService`、Search/Entity/Asset facade 或 Host adapter 访问这些数据，不直接读取 SQLite 表。

### 文本事实与 SQLite 投影

用户通常不会直接编辑 `neko/assets/library.json`、`characters.json` 或 `neko/entities/*.json`，但这些文件仍然是项目事实格式。保留文本/JSON 的目的不是鼓励用户手写，而是让项目事实能被 Git、导出包、迁移脚本、诊断工具和未来版本稳定理解。

当前 ADR 选择以下数据流：

```text
用户通过 UI / Agent review path 修改事实
  -> domain service 写入 JSON/Markdown/TOML/nk* 项目事实
  -> LocalMetadataStore 从事实和 source refs 重建 SQLite 投影
  -> UI / Agent / Search 通过 facade 查询投影
```

不采用以下模型：

```text
SQLite 作为项目事实
  -> JSON 仅作为导出副本或调试副本
```

原因是 SQLite 作为项目事实会把 Git diff、分支合并、PR review、局部修复、云盘同步、打包导出和 Agent 审计都推到额外工具上。除非项目格式整体切换为 `neko/project.db` 之类的数据库格式，否则 SQLite 不应成为 confirmed assets、entities、bindings、requirements 或 visual drafts 的 canonical source。

SQLite 仍然有明确价值：它替代的是“用多个 JSON manifest 手搓数据库”的部分，包括 search/FTS、semantic evidence coverage、media metadata、resource cache ledger、binding reverse index、entity occurrence、analysis jobs、LRU/GC 和 provider diagnostics。也就是说，SQLite 不是第二套事实源，而是一套可删除重建的本机 read model。

## 应直接进入 SQLite 的数据

以下数据应从多个 JSON manifest / index 收敛到 `LocalMetadataStore`。这里的“进入 SQLite”指记录、状态、索引和诊断进入数据库；实际媒体 artifact 仍保存在受管目录中。

| 当前或计划数据                                | 建议 SQLite 表/分区                                                                    | 说明                                                                                                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource cache manifest                       | `resource_cache_entries`、`resource_cache_variants`、`cache_files`                     | 替代 `.neko/.cache/resources/manifest.json`；记录 `ResourceRef`、variant、fingerprint、status、size、provider、materialized path relative to cache root。                                                                                   |
| 文档页图、缩略图、preview variant、proxy 记录 | `resource_cache_variants`、`resource_cache_jobs`                                       | 统一记录 page-image、thumbnail、proxy、preview、fov-crop 等变体状态。                                                                                                                                                                       |
| Proxy manifest                                | `proxy_variants` 或并入 `resource_cache_variants`                                      | 替代 `.neko/.cache/proxies/manifest.json`，避免媒体代理单独维护一套 manifest。                                                                                                                                                              |
| Generated draft index                         | `generated_drafts`、`generated_asset_projection`                                       | 替代 `.neko/.cache/generated/index.json` 中未保存草稿的运行时索引；只记录会话可见草稿、retention、诊断和投影。已保存/提升的生成资产事实写 AssetStore 或 `neko/assets/library.json`，不能以 cache 路径作为事实。                             |
| Media probe metadata                          | `media_metadata`                                                                       | 替代 `.neko/.cache/media-metadata.json`；记录 Engine/provider version、source fingerprint、duration、dimension、codec、diagnostics。                                                                                                        |
| Search index 和 FTS/read model                | `search_documents`、`search_terms`、`search_partitions`                                | 替代 `.neko/.cache/search-index.json`；Search 仍只暴露 service API，不暴露 DB。                                                                                                                                                             |
| Semantic evidence、coverage ledger 和分析 job | `semantic_sources`、`semantic_evidence`、`semantic_coverage`、`semantic_analysis_jobs` | 替代散落的 semantic sidecar/read model。记录 source ref、range、provider/model/schema/skill version、source fingerprint、freshness、diagnostics 和 job 状态；不保存模型 prompt context、cache path、Webview URI 或 confirmed entity facts。 |
| Asset graph projection                        | `asset_graph_edges`、`asset_graph_nodes`                                               | 替代 `.neko/.cache/asset-graph.json`；仅保存关系投影，不拥有 Asset/Entity 事实。                                                                                                                                                            |
| Entity occurrence / relationship projection   | `entity_occurrences`、`entity_relationships`                                           | 派生自 Story、Canvas、Agent、Documents、Assets；confirmed entity 仍在 `neko/` 事实文件。                                                                                                                                                    |
| Entity binding availability / reverse index   | `entity_binding_projection`                                                            | 记录绑定可用性、orphaned 状态、反向查询和展示排序；用户确认绑定事实仍在 `neko/entity-bindings.json`。                                                                                                                                       |
| Media library availability projection         | `media_library_status`                                                                 | 记录当前机器 resolved root、accessible、missing、remapped diagnostics；不回写 `.neko/settings.local.json` 或 `neko/settings.json`。                                                                                                         |
| Cache touch、LRU、quota、GC 状态              | `cache_touches`、`cache_gc_runs`                                                       | 避免高频更新 JSON manifest；GC 只删除 cache artifact 和 metadata。                                                                                                                                                                          |
| Provider diagnostics 和 rebuild jobs          | `provider_diagnostics`、`resource_cache_jobs`                                          | 记录 failed/missing/stale/unsupported 等可观察状态，支持 retry 和 fail-visible。                                                                                                                                                            |
| Skill/Command/Processor catalog projection    | user/extension `catalog_items`                                                         | 派生自 manifest 文件和 Market contribution；manifest 仍是文件事实。                                                                                                                                                                         |
| Conversation list/search projection           | user `conversation_index`                                                              | `Journal` 或消息文件仍是用户数据事实；列表、搜索、最近使用和统计可进 SQLite。                                                                                                                                                               |
| Market catalog/cache projection               | user/extension `market_catalog_cache`                                                  | 包 catalog、搜索、下载缓存 metadata 可进 SQLite；用户级安装事实是否迁入 DB 需要单独兼容/导出设计。                                                                                                                                          |
| Dashboard activity projection                 | project-local `dashboard_activity`                                                     | 若仅为可重建/可丢弃活动投影可进 cache DB；若是用户有价值的本机历史，应放项目本地 DB 而不是 cache DB。                                                                                                                                       |

## 应继续使用 JSON/Markdown/TOML/项目文件的数据

以下数据不应因为引入 SQLite 而迁入数据库：

| 数据                                                | 位置                                                                                                                    | 原因                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 项目设置和媒体库变量                                | `neko/settings.json`                                                                                                    | 团队共享、可审阅、需要 Git diff。                                 |
| 本机媒体库 override                                 | `.neko/settings.local.json`                                                                                             | 用户可编辑、体积小、排查直观。                                    |
| 素材库事实                                          | `neko/assets/library.json`                                                                                              | AssetEntity、Variant、File、provenance 是项目事实。               |
| 统一实体事实                                        | `characters.json`、`neko/entities/*.json`                                                                               | Entity ID、名称、状态和语义 metadata 是项目事实。                 |
| 用户确认实体绑定                                    | `neko/entity-bindings.json`                                                                                             | 绑定是用户确认事实，不是缓存。                                    |
| 实体需求和视觉草案                                  | `neko/entity-asset-requirements.json`、`neko/visual-identity-drafts.json`                                               | 可审阅、可合并、用户确认或待确认事实。                            |
| Domain project files                                | `.nkc`、`.nkv`、`.nks`、`.nkm`、`.nkp` 等                                                                               | 项目格式契约，不由 SQLite 隐式改写。                              |
| AGENTS / memory / Skill / Command / Processor files | `AGENTS.md`、`.neko/memory.md`、`.agents/skills/*`、`~/.agents/skills/*`、`.neko/commands/*`、`.neko/processors/*.json` | 用户可读写、可复制、可审计；Skill package 不进入 SQLite。         |
| 用户配置                                            | `~/.neko/config.toml` 或配置文件                                                                                        | 用户管理，不是运行时索引。                                        |
| Conversation journal / message records              | `~/.neko/conversations/*` 或 journal 文件                                                                               | 属于用户历史事实；SQLite 可做索引，但不能成为唯一不可导出的黑盒。 |
| 日志                                                | `.neko/logs/*`                                                                                                          | append-only 文本更易排查；需要索引时再投影到 SQLite。             |
| 用户确认 retained media                             | workspace/media-library 文件                                                                                            | 二进制源文件不应作为 SQLite blob 隐藏。                           |

### 项目事实 JSON 不迁入 SQLite 的理由

以下文件即使由 UI 写入、普通用户不会手工维护，也不应直接迁入 SQLite 作为事实源：

| 文件                                      | 事实语义                                                                                          | 可进入 SQLite 的部分                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `neko/assets/library.json`                | 项目拥有哪些 Asset、Variant、File、source/provenance。它影响导出、绑定、复用和跨机器共享。        | asset 搜索索引、缩略图/preview/proxy metadata、media probe metadata、可用性诊断、反向引用。      |
| `characters.json`、`neko/entities/*.json` | 已确认实体身份、名称、别名、状态和语义 metadata。Entity ID 是稳定语义身份，不能降级成 cache row。 | entity name/alias index、occurrence projection、候选匹配、相似实体建议、semantic evidence 引用。 |
| `neko/entity-bindings.json`               | 用户确认的实体与素材/表现形式绑定，是创作决策。AI 或后台任务不能静默覆盖。                        | binding availability、orphaned/missing diagnostics、reverse lookup、展示排序和搜索投影。         |
| `neko/entity-asset-requirements.json`     | 实体资产需求、缺口和制作状态，是可审阅的项目计划/制作事实。                                       | requirement status aggregation、Dashboard projection、提醒、搜索和筛选索引。                     |
| `neko/visual-identity-drafts.json`        | 可审阅的视觉设定草案和创作意图。即使未确认，也不应因 cache 清理丢失。                             | 视觉草案搜索索引、相似检索、关联 semantic evidence、生成预览/thumbnail metadata。                |

这些文件可通过 domain service、transaction-like write helper、schema validation 和测试来降低直接文件维护成本；不要通过迁入 cache/user SQLite 来解决写入封装问题。底层实现未来可以在 `ProjectFactStore` 之类接口后替换，但替换目标必须仍然满足项目事实格式的共享、审计、迁移和恢复要求。

## 存储区域分析

### 用户区

适合继续文件管理：

- `~/.neko/config.toml` / `config.json`
- `~/.neko/AGENTS.md`
- `~/.agents/skills/`
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

- 用户配置、AGENTS、portable Skill package、Processor manifest、prompt 正文。
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
- 未来 team-shared prompts/processors 的显式项目事实位置

适合 SQLite 的只有派生投影，但不应放在 `neko/` 下。比如实体出现点、绑定可用性、素材关系图、搜索索引应进入 `.neko/.cache/neko-cache.db`。

共享语义上，`neko/` 和 `.agents/skills/` 下的事实文件是团队和导出包看到的 canonical state；`.neko/.cache/neko-cache.db` 是每台机器的本机加速器。项目协作者拉取或打开项目后，应能从 `neko/` 事实、domain files 和 source refs 重建索引，而不依赖别人机器上的 SQLite 文件。若需要共享 AI 分析结果，应共享可审阅的 evidence/export 格式或提升为用户确认事实，而不是直接提交 SQLite 数据库。

### 工作区本机状态 `.neko/`

项目 portable Skills 位于 `.agents/skills/`，是可检入、可复制的用户内容，不属于 `.neko/` 本机状态。

`.neko/` 是 gitignored project-local state。继续文件管理：

- `.neko/settings.local.json`
- `.neko/memory.md`
- `.neko/commands/`、`.neko/prompts/` 中用户明确创建的 project-local 内容
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

#### 语义索引与当前实现对照

当前代码已经具备语义索引的契约和查询骨架，但还没有完成自动持久化闭环：

| 能力                   | 当前状态                                                                                                     | ADR 目标                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 统一内容访问读取资源   | 已有 `ContentAccessService`、`ContentIngestService` 和 Agent typed runtime adapter                           | 继续只负责 source/ref/intent/target、授权、bytes/local-path/Webview projection/Engine source，不拥有语义 evidence。                   |
| 内容访问协议的语义参数 | 只有通用 `metadata`，没有一等 `semantic`、`analysisKind` 或 `returnSemanticEvidence`                         | 不在 ContentAccess 上扩语义协议；语义查询走 Search/Semantic facade。                                                                  |
| 文档读取               | `ReadDocument` 支持 `content`、`manifest`、`range`、`next`、cursor 和 `imageInfo`                            | 文档读取继续返回文本、locator、image ref；语义复用通过 semantic coverage 查询获得。                                                   |
| 图片读取               | `ReadImage` 只读取 metadata 并暴露 native multimodal attachment；不做独立 vision model analysis              | 图片视觉分析结果若要复用，必须通过语义 evidence 写入端口持久化，而不是由 ReadImage 隐式写 cache。                                     |
| 语义 evidence 契约     | `MediaSemanticIndex` 可表达 OCR、ASR、caption、agent segment、entity mention、semantic tag 和 perception ref | 作为 semantic store 的数据契约基础，保留 source ref、range、confidence、provenance、provider/model/schema version。                   |
| coverage 查询          | `QuerySemanticCoverage` 可返回 freshness、matched ranges、stale reasons 和 reusable/analyze planning         | 后续从 workspace cache DB 查询，而不是直接读取 sidecar 路径。                                                                         |
| 当前 coverage 数据源   | VS Code provider 读取 `.neko/semantic-index/**/*.json` 和 character memory 文件                              | 迁移到 `LocalMetadataStore` 后，sidecar 只作为迁移/诊断输入；新成功路径不得 dual-read sidecar。                                       |
| Agent 分析后写入       | 实体贡献已有 candidate 自动化；通用 semantic evidence 自动写入尚未闭环                                       | 新增 Host-owned `SemanticEvidenceService` 或等价 port，接收 Agent/processor 输出并写入 workspace semantic partitions。                |
| 避免重复分析           | 目前依赖 Skill 调用 `QuerySemanticCoverage` 的协作约束                                                       | 由 `semantic_coverage` + source/range fingerprint + provider/schema/skill version 判断 fresh/stale/missing，缺口进入 job queue。      |
| 新增大文档             | 当前 Project Search watcher 未形成通用大文档语义分析队列                                                     | import/idle/on-demand 触发 `semantic_analysis_jobs`，按 manifest/range 分块，project open 只投影已有 ledger，不执行重 OCR/embedding。 |
| SQLite/FTS/vector      | ADR 已提出 SQLite 和 FTS/read model；统一 vector store 尚未落地                                              | SQLite + FTS 是 MVP；embedding/vector sidecar 或 vector store 二期接入，仍通过 Search/Semantic facade 暴露。                          |

语义 evidence 的语义级别是 reference/index/evidence，不是最终项目事实。自动分析可以进入 `semantic_evidence`、`semantic_coverage` 和 entity candidate/review payload；只有用户确认或确定性来源提升后，才写入 `neko/` 下的 confirmed entity、binding、asset requirement 或 domain project facts。

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

| 方案                       | 优点                    | 风险                                                         |
| -------------------------- | ----------------------- | ------------------------------------------------------------ |
| Node native SQLite package | 性能好，事务和 WAL 成熟 | VS Code/Electron ABI、跨平台预编译、扩展打包和签名风险       |
| WASM SQLite                | 打包简单，跨平台稳定    | 大库性能、文件持久化、并发和内存占用需要验证                 |
| Rust/N-API SQLite adapter  | 可控、可复用 Rust 生态  | 不应把 Engine 变成本地项目数据库；需要独立 host adapter 边界 |
| 保持 JSON                  | 依赖最低，易手工排查    | 多 manifest 膨胀、并发、事务、查询和 GC 问题继续存在         |

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
- 把 `neko/assets/library.json`、`characters.json`、`neko/entities/*.json`、`neko/entity-bindings.json`、`neko/entity-asset-requirements.json` 或 `neko/visual-identity-drafts.json` 直接迁入 `.neko/.cache/neko-cache.db`、`~/.neko` 用户库或 `globalStorageUri`：这些位置不是项目事实源，会导致共享、导出和数据恢复语义错误。
- 把用户区 SQLite 当成项目事实共享层：用户区适合跨项目 catalog/search/read model，不适合保存某个 workspace 的 confirmed entities、assets 或 bindings。
- 在没有 diff/merge、导出、备份、修复、审计和锁策略前引入 `neko/project.db` 作为项目格式：这属于单独的项目格式迁移，不是本 ADR 的 local metadata store。
- 每个包各自维护 SQLite：会重复 schema/migration/cleanup，并重新制造跨包耦合。
- 把缩略图、文档页图、proxy 等媒体 bytes 直接作为 SQLite blob：不利于 Webview URI、Engine Range、外部工具和大文件清理。
- 继续无限扩展多个 JSON manifest：短期简单，但已经暴露出大型 manifest、legacy 字段污染、GC 和查询复杂度问题。
