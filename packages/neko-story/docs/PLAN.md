# Neko Story 开发计划

## 进度概览

| Phase | 状态 | 描述 |
|-------|------|------|
| Phase 1 | ✅ 完成 | 基础功能：类型、解析器、语法高亮、大纲 |
| Phase 2 | ✅ 完成 | LSP 功能：补全、跳转、悬停、引用 |
| Phase 3 | 🚧 进行中 | 预览 + neko-suite 集成 |

---

## Phase 1: 基础功能 ✅

### 1. types 子包
- [x] 创建 package.json
- [x] 定义 Fountain AST 类型
- [x] 定义 Range/Position 类型

### 2. parser 子包
- [x] 创建 package.json
- [x] 实现 Parser（语法分析）
- [x] 支持所有 Fountain 元素

### 3. 语法高亮
- [x] 创建 TextMate Grammar (nekostory.tmLanguage.json)
- [x] 创建 language-configuration.json

### 4. 大纲视图
- [x] 实现 DocumentSymbolProvider
- [x] 注册到 extension

---

## Phase 2: LSP 功能 ✅

### 已实现功能

| 功能 | Provider | 描述 |
|------|----------|------|
| 自动补全 | CompletionProvider | 角色名、场景位置、转场、时间 |
| 定义跳转 | DefinitionProvider | Cmd+Click 跳转到角色首次出场 |
| 引用查找 | ReferenceProvider | 查找角色所有出场位置 |
| 悬停提示 | HoverProvider | 显示角色/场景统计信息 |
| 大纲视图 | DocumentSymbolProvider | 章节和场景层级结构 |

### 项目结构

```
packages/extension/src/
├── extension.ts
└── providers/
    ├── documentSymbol.ts   # 大纲视图
    ├── completion.ts       # 自动补全
    ├── definition.ts       # 定义跳转 + 引用查找
    └── hover.ts            # 悬停提示
```

### 悬停提示显示

- **角色**：出场次数、对话行数、首次/末次出场位置
- **场景**：位置、时间、出场角色、对话数量

---

## Phase 3: 预览 + 集成 🚧

### 3.1 webview 子包 ✅

创建 React + Vite 预览界面。

#### 目录结构
```
packages/webview/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── components/
    │   ├── ScriptRenderer.tsx    # 剧本渲染器
    │   ├── TitlePage.tsx         # 标题页
    │   ├── SceneHeading.tsx      # 场景标题
    │   ├── DialogueBlock.tsx     # 对话块
    │   └── ActionBlock.tsx       # 动作描述
    ├── hooks/
    │   └── useVSCodeMessaging.ts # VSCode 通信
    └── styles/
        └── screenplay.css        # 标准剧本样式
```

#### 任务清单
- [x] 创建 package.json（React 18 + Vite）
- [x] 配置 Vite 构建（输出到 dist/webview）
- [x] 实现 ScriptRenderer 组件
- [x] 实现标准剧本样式（Courier 字体、边距）
- [x] 实现 VSCode 消息通信 Hook

### 3.2 预览面板 ✅

在 Extension 中实现 WebviewPanel。

#### 目录结构
```
packages/extension/src/
├── panels/
│   └── PreviewPanel.ts           # Webview 面板管理
└── extension.ts                  # 注册预览命令
```

#### 任务清单
- [x] 实现 PreviewPanel 类（Webview 管理）
- [x] 实现 neko.story.preview 命令
- [x] 实现编辑器 → 预览同步（文档变更）
- [x] 实现预览 → 编辑器同步（点击定位）
- [x] 实现滚动同步

### 3.3 neko-suite 集成 🚧

与 neko-cut、neko-assets 等模块集成。

#### 接口设计

```typescript
// Timeline conversion interface
interface ITimelineConverter {
  convert(doc: FountainDocument): TimelineProject;
}

// Asset linking interface
interface IAssetLinker {
  linkCharacter(name: string): AssetReference | null;
  linkLocation(location: string): AssetReference | null;
}

// Storyboard generation interface
interface IStoryboardGenerator {
  generate(scene: SceneHeading): Promise<StoryboardFrame[]>;
}
```

#### 任务清单
- [x] 定义 TimelineProject 类型（与 neko-cut 对接）✅
- [x] 实现 TimelineConverter（场景 → 时间线片段）✅
- [x] 实现 neko.story.toTimeline 命令 ✅
- [x] 实现资产链接服务（查找关联资产，内部命令：`neko.story.linkCharacterAsset` / `neko.story.linkLocationAsset`）
- [x] 实现 `neko.story.generateStoryboard` 命令入口（发送当前场景到 Agent）
- [x] 实现 `PreviewPanel.sendToCanvas` 机械式场景导入（`neko.canvas.importStoryboard`）
- [x] 提供 `GenerateScenePlan` / `GenerateShotPlan` Agent 工具
- [x] 将 `GenerateScenePlan` / `GenerateShotPlan` 接入 Agent 主流程与 semantic 导入闭环
- [x] 为 `NekoStoryAPI` 暴露 `generateScenePlans()` / `generateShotPlan()`，供 Agent pipeline 直接消费
- [x] 新增 `importStoryboardToCanvas` pipeline stage，将 semantic storyboard 正式导入 `canvas`
- [x] 将 `neko.story.generateStoryboard` 升级为直接启动标准 pipeline，而不只是发送 context
- [x] 为轻量分镜表接入 Agent / Canvas 真实状态回写
- [x] 增加 `neko.story.startVideoCreation` 正式命令，作为从剧本场景启动 `flowF` 视频主流程入口
- [x] 为 `StorySceneStateStore` 接入 `workspaceState` 持久化与恢复

---

## 模块依赖

```
extension → parser → types
    │
    ├── panels/PreviewPanel → webview (React)
    │
    └── services/
        ├── TimelineConverter → neko-cut
        └── AssetLinker → neko-assets
```

## 验收标准

1. ✅ `.fountain` / `.nks` / `.story` 文件有语法高亮
2. ✅ 大纲视图显示场景和章节结构
3. ✅ 自动补全角色名和场景位置
4. ✅ Cmd+Click 跳转到角色定义
5. ✅ 悬停显示角色/场景统计
6. ✅ 预览面板渲染剧本（标准格式）
7. ✅ 编辑器与预览双向同步
8. ✅ 转换为 neko-cut 时间线（Fountain → ProjectData JSON 语义 Skill）
9. ✅ AI 生成分镜脚本与语义导入主流程
   - 已具备 `ScenePlan / ShotPlan -> canvas semantic import` pipeline 主链
   - `story.generateStoryboard` 已直连标准 pipeline
   - 轻量分镜表已接入 extension 侧统一状态源与 pipeline 事件回写
   - 轻量分镜表状态已通过 `workspaceState` 跨会话持久化
   - 已新增“从剧本开始视频创作”标准入口 `neko.story.startVideoCreation`

### 当前收口状态

- [x] 将 `canvasStatus = opened` 从按钮驱动升级为 canvas 实时事件回写
- [x] 对 `story + agent + canvas` 主链补更大范围回归验证
  已完成 `@neko/shared` / `@neko-agent/extension` / `@neko-story/extension` /
  `@neko-canvas/extension` 关键测试，以及 `@neko-story/extension` /
  `@neko-canvas/extension` 包级构建；根 `pnpm test` 已尝试，但当前环境失败点为
  与本轮无关的 `@neko/auth-core` 本地回环端口监听 `EPERM`

### 后续 TODO

- `TODO(P1)` 为角色身份层补充“剧本文字替换”独立入口：与注册表 Rename 分离，作为显式 Code Action 或批处理执行，不隐式改写剧本文本
- `TODO(P1)` 在共享层定义并落地最小可用的 `CreativeEntityGraph` / `OccurrenceIndex` 契约，停止让 `CreativeEntityWorkspaceIndexService` 只停留在 character-first 聚合器
- `TODO(P1)` 将 `CreativeEntityWorkspaceIndexService` 升级为依赖 `Graph + OccurrenceIndex` 的统一查询底座，作为 Definition / References / Hover / Rename 的共享入口
- `TODO(P1)` 把统一实体层从 `character` 扩到 `scene / location`：先建立稳定定义、引用与写路径，再决定是否升格独立 registry
- `TODO(P1)` 让资产侧、画布侧开始消费统一实体写路径：至少支持从 `AssetEntity` / `GalleryNode` / `SceneGroupNode` 回跳 registry 定义，并补最小 Rename / CodeAction 入口
- `TODO(P2)` 将 `object` 接入统一实体层：复用 Asset Library 分类与 tags / aliases，补跨场景引用与默认资产绑定
- `TODO(P2)` 将 `action` 先落在语义出现点层，而不是独立 registry：支持 script line / shot / media segment 级索引与引用查询

## 构建与测试

### 影响范围

本轮 `story-agent-canvas` 收敛主要影响以下包：

- `@neko-story/extension`
- `@neko-canvas/extension`
- `@neko-agent/extension`
- `@neko/shared`

### 建议构建顺序

1. 根仓库验证共享层与依赖图：

```bash
pnpm build
pnpm check
```

2. 聚焦 story / canvas / agent 相关扩展：

```bash
pnpm --filter @neko-story/extension build
pnpm --filter @neko-canvas/extension build
pnpm --filter @neko-agent/extension test:run
```

3. 若需要整包扩展产物，使用 monorepo 编译入口：

```bash
pnpm build:dev
```

### 建议测试范围

针对当前改动，最小必要验证应包含：

```bash
pnpm --filter @neko-story/extension test
pnpm --filter @neko-agent/extension test:run
pnpm exec vitest run packages/neko-agent/packages/agent/src/pipeline/__tests__/stages.test.ts
pnpm test
```

### 当前环境注意事项

- 根仓库脚本依赖 `pnpm` workspace 正常安装的 devDependencies
- 若本地未完成 `pnpm install`，`vitest` / `turbo` / `esbuild` 可能不可执行
- 当前迭代新增了多组 source-contract tests，适合先跑包级测试，再扩大到仓库级测试

---

## 技术决策

### 预览渲染方案

| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| React + Vite | 组件化、热更新、生态丰富 | 构建复杂度 | ✅ 采用 |
| 纯 HTML/CSS | 简单、无依赖 | 难以维护 | ❌ |
| Markdown 渲染 | 复用现有 | 样式受限 | ❌ |

### 同步策略

| 场景 | 策略 |
|------|------|
| 文档变更 | debounce 300ms 后发送完整 AST |
| 滚动同步 | 基于行号映射，throttle 100ms |
| 点击定位 | 元素携带 range 信息，直接跳转 |

### 时间线转换规则

| Fountain 元素 | Timeline 映射 |
|---------------|---------------|
| SceneHeading | 新片段（Clip）起点 |
| Action | 字幕轨道 |
| Dialogue | 字幕轨道 + 角色标记 |
| Transition | 转场效果 |
| Section | 时间线标记（Marker） |
