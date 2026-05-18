# Neko Entity 统一实体运行时

> ADR Status: Proposed / In Progress
> Date: 2026-05-18
> Scope: @neko/entity · @neko/shared · neko-story · neko-assets · neko-dashboard · neko-search

## 背景

创意实体过去主要由 Story 工作流驱动：`characters.json` 保存角色身份，Story 命令和 Dashboard
source 负责实际管理，`@neko/shared/vscode/extension` 同时放了若干文件读写 helper。随着统一实体需要被
Dashboard、Agent、Assets、Canvas、Search 和文档读取共同使用，Story 继续作为唯一事实 owner 会让非剧本实体、
素材绑定和搜索投影耦合到 Story 扩展。

## 决策

引入 `packages/neko-entity` 作为中立运行时包：

- `@neko/shared` 只保留 DTO、类型守卫和跨包契约。
- `@neko/entity/core` 拥有实体事实、候选生命周期、绑定、需求、视觉草稿、representation resolver 和事件。
- `@neko/entity/host-vscode` 拥有 VSCode/Node 文件系统适配、命令 source 注册和兼容工厂。
- `@neko/entity/providers` 定义 Story/Assets/Agent/文档等 provider 投影接口。
- `@neko/entity/dashboard` 提供 neutral Dashboard creative entity source。
- `@neko/entity/projections` 提供只读搜索投影 adapter。

`@neko/entity/core` 不导入 Story、Assets、Agent、Dashboard、Search、React、Webview 或 VSCode API。

## 事实存储

角色兼容源保持不变：

- `<project>/characters.json`

非角色一等实体写入 Git 可追踪事实文件：

- `<project>/neko/entities/scenes.json`
- `<project>/neko/entities/locations.json`
- `<project>/neko/entities/objects.json`
- `<project>/neko/entities/styles.json`
- `<project>/neko/entities/candidates.json`

既有实体相关事实继续保留：

- `<project>/neko/entity-bindings.json`
- `<project>/neko/entity-asset-requirements.json`
- `<project>/neko/visual-identity-drafts.json`

`.neko/.cache/` 只保存可删除派生索引，删除缓存不得删除确认实体。

## 生命周期

`CreativeEntityService` 提供：

- 创建/确认候选/拒绝/忽略/候选合并为别名。
- 重命名、display name 更新、别名增删、metadata 更新、废弃、恢复。
- 保守合并重复实体，保留 surviving entity id，并重定向 entity-owned bindings、requirements 和 drafts。
- 绑定、默认绑定、需求、视觉草稿更新。

每个写操作返回 `CreativeEntityOperationResult`，包含 affected refs、changed fact refs、generation、
freshness 和 updatedAt，并发出 `CreativeEntityChangeEvent`。Dashboard 和 Search 只消费这些刷新元数据，
不直接写实体文件。

## Provider 边界

Story 继续拥有：

- Fountain 解析。
- 角色/场景 occurrence 和 source navigation。
- script-derived candidates。

Story 通过 `StoryEntityProviderAdapter` 贡献候选和 occurrence 投影，但确认实体事实由 `neko-entity` 管理。

Assets 继续拥有：

- 素材文件、素材库 metadata、representation package、thumbnail、media probing。

Assets 可通过 binding hint 或 sync suggestion 参与实体工作流，但不成为实体身份权威。实体重命名不会自动改写
素材 metadata，只能返回同步建议或由用户触发 source-approved command。

Search 继续拥有：

- 派生搜索结果、索引 freshness、RAG/semantic provider。

Search adapter 从 `neko-entity` 读取 confirmed entities 和 candidates，只读投影为
`creative-entity` / `entity-candidate`，不调用 mutation API。

Dashboard 继续拥有：

- UI 聚合、详情显示和 action 委派。

Dashboard 会发现 `neko.entity.getDashboardCreativeEntitySource`。当 Story compatibility source 和 neutral
source 同时暴露同一个 confirmed entity，聚合器用 stable entity id 去重，并优先显示 `neko-entity` 行。

## 迁移说明

第一阶段采用兼容优先：

1. `@neko/shared` 增加 entity ref、candidate、provider、operation result、change event 等纯契约。
2. `@neko/entity` 接管新的运行时实现和 VSCode host 工厂。
3. Story creative entity commands 和 Story Dashboard source 使用 `createVSCodeEntityServices()` 获取 registry、
   bindings、requirements、drafts。
4. Assets 和 Live 直接依赖 `@neko/entity` 运行时，不再新引入 shared VSCode helper。
5. `@neko/shared/vscode/extension` 中旧 helper 暂留为迁移窗口，后续在消费者完成迁移后再清理。

## 测试策略

- `@neko/entity` core tests 覆盖 `characters.json` 兼容、非角色事实写入、候选确认/合并、实体合并与事件。
- 架构边界测试禁止 core/provider 导入 feature package、VSCode、React 或 Webview。
- Dashboard 聚合测试覆盖 neutral source discovery、confirmed entity 去重和 Story 兼容 source 共存。
- Search adapter 测试覆盖只读投影和 kind filter。
