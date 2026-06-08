# Canvas 交互叙事工作流

> 关联：[Canvas 交互叙事 ADR](../architecture/adr-canvas-interactive-narrative.md)

Canvas 交互叙事使用 `.nkc` 作为分支故事图的单一事实来源，使用标准 `.fountain` 文件保存场景正文。不要为新工作流创建 `.nks`、`.story` 或独立 `.nkstory` 叙事文件。

## 一、创建分支叙事图

1. 在命令面板创建或打开一个 Canvas 文件，例如 `narrative.nkc`。
2. 从节点库添加 `narrative-start`，作为运行时入口。一个叙事图最多保留一个 start 节点。
3. 添加 `narrative-scene`、`choice`、`merge` 和 `narrative-ending` 节点。
4. 用连线表达分支结构：start 到场景，场景到 choice，choice 到后续场景或 ending。
5. 在 choice 连线或 choice 节点数据中维护选项文字、条件和变量效果。

`narrative-note` 可以用于策划备注和协作提示，但它只激活 narrative 编辑能力，不参与 Preview、导出或运行时路径。

## 二、编辑 `.fountain` 场景

1. 为每个 `narrative-scene` 设置 `sceneRef`，例如 `scenes/cafe-encounter.fountain`。
2. 双击 `narrative-scene`，让 Canvas 委托 Story/Fountain 编辑器打开对应文件。
3. 在 `.fountain` 中只写标准 Fountain 内容：场景标题、动作、角色名、对白、括注、转场和 notes。
4. 分支选择、变量和条件仍留在 `.nkc` Canvas 图中，不写进 Fountain 自定义语法。
5. 可在 `characters.yaml` 维护角色立绘、表情、背景和声音映射；路径使用项目相对引用。

如果 `.fountain` 被拖进 Canvas 生成 `script` 节点，它仍是 storyboard 引用源，不会自动成为运行时叙事节点。需要参与交互叙事时，请创建 `narrative-scene` 并让 `sceneRef` 指向同一个 `.fountain` 文件。

## 三、打开 Narrative Preview

1. 在 Canvas 中选择打开 Narrative Preview 的命令或工具栏入口。
2. Preview 面板会通过 `NarrativePreviewBridge` 获取当前 Canvas 的 in-memory `NarrativeGraphSnapshot`，因此未保存编辑也能预览。
3. Preview 使用 `narrative-start` 作为入口；没有 start 时才回退到 `entryNodeId` 或第一个可遍历节点。
4. 在 Preview 中选择分支后，Canvas 会高亮当前节点、已访问路径和选择过的边。
5. 修改 Canvas 节点、连线、条件或变量后，Preview 通过 revisioned refresh 丢弃过期消息并刷新到最新图。

Canvas 节点卡只显示轻量摘要和修复入口，不挂载完整 Narrative Preview runtime，也不保存当前游玩节点、历史、变量快照、renderer state 或 resolved Webview URL。

## 四、检查诊断

Preview、Agent 和导出前检查会关注以下问题：

- 缺少 `narrative-start` 或可运行入口。
- 存在不可达运行时节点。
- 非 ending 节点形成意外死端。
- 缺少 `narrative-ending`。
- `narrative-scene.sceneRef` 缺失或不是 `.fountain`。
- 条件表达式引用不存在变量或使用非白名单语法。
- 资产引用是 Webview URI、blob/object URL、engine token 或本地绝对路径。

Agent structured context 可以读取节点角色、sceneRef、choice label、条件、ending metadata 和变量效果，但不会包含 resolved Preview URL、renderer state 或 runtime handle。

## 五、导出 HTML5

1. 从 Canvas 或命令面板触发交互叙事 HTML5 导出。
2. 导出器接收当前 `NarrativeGraphSnapshot`，读取 `sceneRef` 指向的 `.fountain`，并解析 `characters.yaml`。
3. 资产解析会重新使用 `final-export` 和 `package` intent，不复用 Preview 的 Webview URI 或缓存路径。
4. 产物包含 `index.html`、`data/story.json`、共享 runtime bundle、renderer bundle 和相对路径资产。
5. 导出前需要修复 error 级诊断，尤其是缺少场景、缺少 ending、不支持条件和不可移植资产引用。

Preview 和导出共享 `@neko/shared` 的 `NarrativeRuntime` 与白名单条件求值器；区别只在 host adapter、资源解析和文件打包。
