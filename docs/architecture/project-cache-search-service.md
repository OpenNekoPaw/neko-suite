# 项目级统一缓存与搜索服务

> ADR Status: Proposed / In Progress  
> Date: 2026-05-18  
> Scope: neko-agent · neko-story · neko-assets · @neko/shared

## 背景

项目搜索曾由多个消费者直接读取不同缓存：

- Agent mention 直接读 `neko/assets/library.json`、`.neko/.cache/search-index.json`、`.neko/.cache/media-metadata.json`、`.neko/.cache/asset-graph.json`。
- Story 的脚本索引在激活时预热，但创意实体图不一定预热。
- Assets 的媒体搜索索引在第一次搜索时才加载或重建。
- Webview 只拿到较薄的候选字段，无法统一使用别名、来源、freshness、导航数据。

这会导致打开项目后 `@` 补全结果和素材库/统一实体/脚本预览不一致，尤其在新建项目、刚编辑 Fountain、删除 `.neko/.cache` 或多 workspace 场景中明显。

## 决策

引入 `ProjectCacheSearchService` 与 `ProjectIndexCoordinator`：

```text
Webview
  只渲染 mention/search 投影，不读缓存和文件
        |
        v
Agent Extension / Platform
  neko.projectSearch.query
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

Agent mention 通过 `neko.projectSearch.query` 查询统一服务，再映射到现有 `AgentProjectMentionCandidate`，不再拥有缓存 JSON schema。

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

## 实施迁移

当前迁移路径是兼容优先：

1. `@neko/shared` 先提供统一契约和守卫。
2. Agent Extension 注册 `neko.projectSearch.query`。
3. 兼容 adapter 仍可读取既有事实/缓存文件，但这些读取被收束到 service 内部。
4. `projectMentionSearch.ts` 不再直接读取 `.neko/.cache/*.json`。
5. Story/Assets 后续可注册更权威的 adapter，替换兼容 adapter 的读取逻辑。

## 边界

- Webview 不直接读本地文件或 `.neko/.cache`。
- Agent runtime 不依赖 VSCode、Story、Assets 具体实现。
- Agent Extension 可以作为 host facade，但不应继续扩散缓存文件 schema。
- Engine 不拥有项目搜索契约；只在媒体 probing、缩略图、embedding 等重操作上提供底层能力。
