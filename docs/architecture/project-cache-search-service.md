# 项目级统一缓存与搜索服务

> ADR Status: Proposed / In Progress  
> Date: 2026-05-18  
> Scope: neko-search · neko-agent · neko-story · neko-assets · neko-dashboard · @neko/shared

## 背景

项目搜索曾由多个消费者直接读取不同缓存：

- Agent mention 直接读 `neko/assets/library.json`、`.neko/.cache/search-index.json`、`.neko/.cache/media-metadata.json`、`.neko/.cache/asset-graph.json`。
- Story 的脚本索引在激活时预热，但创意实体图不一定预热。
- Assets 的媒体搜索索引在第一次搜索时才加载或重建。
- Webview 只拿到较薄的候选字段，无法统一使用别名、来源、freshness、导航数据。

这会导致打开项目后 `@` 补全结果和素材库/统一实体/脚本预览不一致，尤其在新建项目、刚编辑 Fountain、删除 `.neko/.cache` 或多 workspace 场景中明显。

## 决策

引入 `packages/neko-search` 作为中立运行时包。`ProjectCacheSearchService` 与
`ProjectIndexCoordinator` 不再由 Agent 拥有，Agent、Dashboard、Assets UI、Story UI
都通过共享契约或 host-mediated projection 消费搜索结果。

```text
Webview
  只渲染 mention/search 投影，不读缓存和文件
        |
        v
Extension Host
  neko.projectSearch.query
  Dashboard global search projection
        |
        v
packages/neko-search
  ProjectCacheSearchService
  ProjectIndexCoordinator
        |
        v
Partition adapters
  story-symbols / creative-entities / asset-library /
  media-library / documents / generated-assets
        |
        v
Facts and caches
  facts: neko/ 和源文件
  cache: .neko/.cache/
```

### 包职责

- `@neko/shared`：唯一 DTO/类型守卫来源，包括 `ProjectSearchQuery`、`ProjectSearchItem`、
  `ProjectSearchPartitionStatusSnapshot`、provider capability 与 semantic freshness metadata。
- `@neko/search/core`：搜索生命周期、provider fan-out、集中式过滤、确定性排序、freshness 聚合、
  cache manifest helper、Webview 安全投影 DTO。
- `@neko/search/providers`：纯 provider 注册契约和 Story/Assets/Documents projection helper；
  不导入 VSCode、Agent、Story、Assets、Dashboard 或 React。
- `@neko/search/host-vscode`：VSCode 命令、watcher、workspace/path resolver、兼容 adapter、
  Dashboard/global search command projection。
- `neko-agent`：只保留 mention projection，把 `ProjectSearchItem` 映射为
  `AgentProjectMentionCandidate`。
- `neko-dashboard`：通过 `queryProjectGlobalSearch()` 或等价 host projection 获取全局搜索 DTO；
  不解析 Story/Assets 内部结构，不读 `.neko/.cache`。

### 事实与缓存分层

权威事实必须保留在 Git 可同步位置：

- Fountain / story / document source files
- `neko/assets/library.json`
- `characters.json`
- `neko/entity-bindings.json`
- `neko/entity-asset-requirements.json`
- `neko/visual-identity-drafts.json`

派生索引必须保留在可删除、可重建的本地缓存：

- `.neko/.cache/search-index.json`
- `.neko/.cache/media-metadata.json`
- `.neko/.cache/asset-graph.json`
- 后续的 `.neko/.cache/project-search-index.json`

删除 `.neko/.cache/` 不应删除任何确认的实体、绑定、需求或素材库事实。

### 查询契约

共享类型位于 `@neko/shared` 的 `project-cache-search` 契约中：

- `ProjectSearchQuery`
- `ProjectSearchItem`
- `ProjectSearchSourceRef`
- `ProjectSearchPartitionStatusSnapshot`
- `ProjectIndexChangeEvent`
- `ProjectSearchCacheManifest`
- `ProjectSearchProviderCapabilities`
- `ProjectSemanticProviderMetadata`

`ProjectSearchQuery` 支持 additive filters：`mode`、`kinds`、`partitions`、`fileTypes`、
`mediaTypes`、`scopes`、`freshness`、`limit`。provider 可以预过滤，但 coordinator 必须做最终过滤，
避免某个分区返回违反显式查询条件的结果。

Agent mention 通过 `neko.projectSearch.query` 查询统一服务，再映射到现有
`AgentProjectMentionCandidate`，不再拥有缓存 JSON schema。Dashboard/global search 使用同一命令
和 `mode: 'global'`，再投影为面向 Dashboard 的轻量 DTO。

### 后台索引策略

项目打开后只做轻量预热：

1. 加载现有轻量缓存和状态。
2. 扫描 Story 文件、项目事实、素材库、生成索引。
3. 加载已有媒体文件名索引并安装 watcher。
4. 大型媒体 probing、缩略图、OCR、embedding 延迟到 idle 或明确请求。

### 增量更新

Extension Host 监听以下变化并按分区 debounce 刷新：

- Story 文档变更与 `*.fountain` / `*.nks` / `*.story` 文件事件。
- `neko/assets/library.json`。
- `neko/entity-asset-requirements.json`、`entity-bindings.json`、`visual-identity-drafts.json`。
- `.neko/.cache/generated/index.json`。
- `neko/settings.json` 与 `.neko/settings.local.json`。

刷新事件携带 `projectRoot`、`partition`、`reason`、`changedRefs`、`generation` 和 `freshness`，供 Agent/Webview 后续做菜单刷新或状态提示。

### Provider 边界

`neko-search` 只拥有派生搜索平面，不拥有事实：

- Story provider 负责 story-symbol、script-role、scene、section、creative-entity candidate 投影。
- Assets provider 负责 asset-library、media-library、generated-assets 投影。
- Documents provider 负责 manifest、entry、source ref、range/chunk locator 的轻量投影。
- Future `neko-entity` provider 负责 confirmed entity lifecycle 的搜索投影。
- `@neko/entity/projections` 提供 first-class read-only adapter，把 confirmed entities 和 candidates 投影为
  `creative-entity` / `entity-candidate`；Search 不调用实体 mutation API，也不持久化实体事实。
- Semantic/RAG provider 是可选能力；没有语义 provider 时文本搜索仍可工作。

first-class provider 注册后，应替换同分区兼容 adapter，避免同一资产或实体从旧 JSON/cache 和新事实源
重复返回。迁移期的兼容 adapter 可以继续读取公开事实和可重建缓存，但只能位于 host adapter 层。

### RAG 与多模态索引

RAG、向量、OCR、embedding 和多模态解析不进入基础搜索必需路径。provider status 可报告：

- `providerId`
- `model` / `modelVersion`
- `chunkingVersion`
- `sourceIdentity`
- `indexVersion`

这些字段用于判断语义索引是否因模型、分块策略、源内容或索引版本变化而 stale。语义结果仍必须保留
`ProjectSearchSourceRef`，文档结果还应保留 document/range locator，保证 Agent 上下文和 Preview range
读取对齐。

## 实施迁移

当前迁移路径是兼容优先：

1. `@neko/shared` 先提供统一契约和守卫。
2. `packages/neko-search` 提供 core runtime、provider registry、VSCode host adapter、测试 fake。
3. Agent Extension 通过 `@neko/search/host-vscode` 注册 `neko.projectSearch.query` 与 watcher。
4. 兼容 adapter 仍可读取既有事实/缓存文件，但这些读取被收束到 host adapter 内部。
5. `projectMentionSearch.ts` 不再直接读取 `.neko/.cache/*.json`。
6. Dashboard 通过全局搜索投影消费同一结果，不读 Dashboard creative-entity source internals。
7. Story/Assets 后续可注册更权威的 first-class adapter，替换兼容 adapter 的读取逻辑。

## 边界

- Webview 不直接读本地文件或 `.neko/.cache`。
- `@neko/search/core` 不依赖 VSCode、Agent、Story、Assets、Dashboard、React 或 Webview。
- Webview 包只接收投影 DTO，不导入 `@neko/search/host-vscode`。
- Agent Extension 可以保留兼容 re-export，但不应继续扩散缓存文件 schema。
- Engine 不拥有项目搜索契约；只在媒体 probing、缩略图、embedding 等重操作上提供底层能力。
