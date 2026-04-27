# ADR: 多模态 Git 集成与语义审阅

## 状态

Proposed

## 关联

- [storage-strategy.md](./storage-strategy.md)
- [media-lsp.md](./media-lsp.md)
- [adr-character-unified-index.md](./adr-character-unified-index.md)

---

## 一、背景

当前仓库已经具备部分“多模态版本对比”能力，但这些能力仍是分散的：

- `neko-tools` 已有 `MediaDiffService` / `GitMediaService`
- 图片、音频、视频、JVI 时间线已有专用 diff 分析器
- VSCode Webview 已能展示图片/音频/视频/JVI 的对比结果
- 项目数据管理文档已提出 `Git LFS + neko-media diff driver`
- 创作实体统一索引 ADR 已提出 `Registry + Graph + OccurrenceIndex + VectorStore`

但从 Git 工作流视角看，当前系统仍主要面向“文件差异”，尚未形成面向创作实体的多模态审阅链路。

这导致以下现实问题仍未解决：

1. Git 能看到 `hero_v2.png` 变了，但不能直接回答“这是 Alice 的默认形象变了”
2. Git 能列出 `library.json` 改了，但很难可视化理解“哪个人物、哪个场景、哪个道具的绑定发生了变化”
3. Git 对二进制素材默认只擅长存储，不擅长审阅
4. 现有媒体 diff 更像独立工具，而不是 Git / SCM / 提交审阅主流程的一部分
5. 关系图、出现点、实体注册表未来都会参与变更，但 Git 当前没有“语义投影层”

根因不是 Git 不能存多模态，而是 **Git 只管理对象版本，不负责解释创作语义**。

---

## 二、问题定义

### 2.1 当前能力边界

| 领域 | 当前情况 | 问题 |
|---|---|---|
| 代码 / 文本 | Git 原生支持强 | 无明显问题 |
| 图片 / 音视频 | 已有 diff 引擎与 Webview | 未进入 Git 主工作流 |
| JSON 元数据 | 仍主要依赖文本 diff | 对创作实体不友好 |
| Graph / Index / Registry | 尚未形成统一审阅模型 | 无法做实体级 review |
| 合并协作 | 二进制仍是整文件替换思路 | 缺锁定、冲突解释与 review 入口 |

### 2.2 目标

本 ADR 解决的是：

- 明确多模态版本管理应如何建立在 Git 之上
- 确立 Git、LFS、diff driver、VSCode 插件、语义审阅层之间的职责边界
- 为二进制素材和结构化 JSON 元数据提供统一的 review 入口
- 让未来的 `CreativeEntityGraph` / `Entity Registry` 能参与版本审阅

本 ADR 不直接解决：

- 自研 Git fork 或修改 Git core
- 二进制文件的自动三方 merge
- 远端代码托管平台如何原生渲染多媒体 diff
- 所有语义识别模型的最终选型

### 2.3 核心判断

需要回答的不是“Git 能不能管理多模态”，而是：

1. 是否要修改 Git 本体？
2. 是否要开发 Git 插件 / VSCode SCM 扩展？
3. 哪些数据应交给 Git 管，哪些只应作为缓存或派生层？
4. 多模态 diff 是文件级，还是实体级，还是两者都要？

---

## 三、决策

### 3.1 不修改 Git core，采用“Git 底座 + Neko 语义扩展”方案

本 ADR 明确不修改 Git 本体，也不尝试自定义 Git 对象模型。

原因：

- Git 已经提供了稳定的对象版本、提交图、索引区、hook、attributes、diff/merge driver 扩展点
- 多模态能力缺口主要在“解释层”和“审阅层”，不在存储层
- 修改 Git core 的成本极高，且难以与现有 Git 托管生态兼容

结论：

- **Git 负责版本底座**
- **Neko 负责多模态解释与语义审阅**

### 3.2 采用“四层集成模型”

多模态 Git 集成采用四层模型：

1. **Git / LFS 层**
   - 负责对象版本、提交历史、ref、LFS 大文件管理
2. **Diff 能力层**
   - 负责图片 / 视频 / 音频 / 时间线 / JSON 的对比计算
3. **语义投影层**
   - 把文件变化解释为实体、关系、出现点、绑定变化
4. **审阅交互层**
   - 在 VSCode SCM / Webview / 自定义 editor 中展示 review 结果

### 3.3 二进制素材采用“LFS + diff driver + 交互式 viewer”

对图片、视频、音频等大文件：

- 存储层采用 Git LFS
- CLI 层采用 `neko-media` diff driver
- UI 层采用现有 `MediaDiff` Webview 深度查看

原则：

- 终端 / Git CLI 看到的是**摘要 diff**
- VSCode / Webview 看到的是**交互式深度 diff**

### 3.4 JSON 元数据不只做文本 diff，还要做语义 diff

以下类型不应只依赖文本行级 diff：

- `characters.json`
- `project.json`
- `library.json`
- future: `entities.json`
- future: `CreativeEntityGraph` 的持久化表达

这些文件需要额外的**语义变更投影**，例如：

- 人物被重命名
- 默认形象发生切换
- 新增了人物别名
- 某个素材从 `inferred` 变为 `confirmed`
- 某个场景与 `SceneGroupNode` 建立或解除绑定

### 3.5 不应把可重建缓存纳入 Git 审阅主链

以下内容默认不应进入 Git 主审阅链路：

- `.neko/.cache/asset-graph.json`
- `.neko/.cache/vectors/*`
- `.neko/.cache/generated/index.json`
- 代理文件、缩略图、probe 缓存

原因：

- 它们属于派生数据或缓存
- 容易引入噪音变更
- 它们应由权威层重建，而不是被当作事实源审阅

### 3.6 “文件级 diff”和“实体级 diff”必须并存

单一视角都不够：

- 只有文件级 diff：无法回答“影响了谁”
- 只有实体级 diff：无法回答“底层到底改了什么文件”

因此审阅必须同时支持：

- **文件视角**：哪个文件、哪个 ref、哪段内容变化了
- **实体视角**：哪个人物/场景/物品/动作受影响

---

## 四、架构设计

### 4.1 总体分层

```text
Git / LFS Layer
├─ git objects / refs / commits
├─ gitattributes
├─ diff=neko-media
└─ git-lfs

Diff Capability Layer
├─ ImageDiff
├─ AudioDiff
├─ VideoDiff
├─ TimelineDiff
└─ JsonSemanticDiff

Semantic Projection Layer
├─ EntityRegistryProjection
├─ CreativeEntityGraphProjection
├─ OccurrenceProjection
└─ ChangeImpactResolver

Review Interaction Layer
├─ SCM decorations
├─ Commit review panel
├─ MediaDiff Webview
└─ Semantic change viewer
```

### 4.2 Git / LFS 层职责

Git / LFS 层只负责：

- 文件版本
- 提交历史
- ref 比较
- 大文件存储与下载
- 基础 diff / merge driver 挂载点

Git / LFS 层不负责：

- 判断一个文件属于哪个人物
- 解释某个 JSON 字段变化的创作含义
- 推断某个媒体素材在叙事上的影响范围

### 4.3 Diff 能力层职责

Diff 能力层负责“算差异”，但不直接做创作语义解释。

能力组成：

- `ImageDiff`: SSIM / PSNR / pHash / 热力图
- `AudioDiff`: SNR / 波形 / 区域差异
- `VideoDiff`: 关键帧 SSIM / 音视频联合差异
- `TimelineDiff`: JVI 结构差异
- `JsonSemanticDiff`: 结构化 JSON 的语义差异

其中 `JsonSemanticDiff` 需要按领域定制 schema，而不是做通用 JSON tree diff 就结束。

### 4.4 语义投影层职责

语义投影层负责把文件变化转换为创作系统可读的变更。

例子：

- `characters.json` 中 `defaults.galleryNodeId` 变化
  -> “人物 Alice 的默认视觉入口发生变化”
- `library.json` 新增 `AssetFile`
  -> “人物 Bob 增加一个新形象变体文件”
- 某个视频素材被替换
  -> “影响 scene_12、shot_031、角色 Alice 的默认镜头候选”

语义投影层依赖：

- `Entity Registry`
- `CreativeEntityGraph`
- `OccurrenceIndex`
- Asset Library
- Generated Asset Index

### 4.5 审阅交互层职责

审阅交互层负责把差异变成可审核、可解释、可确认的界面。

建议入口：

- Source Control 面板中的文件项摘要
- 提交详情中的“媒体差异”按钮
- JSON 索引文件的“语义差异”视图
- 实体详情页中的“版本历史 / 变更影响”

---

## 五、数据与文件策略

### 5.1 哪些数据应进入 Git

应进入 Git 的权威数据：

- `project.json`
- `characters.json`
- `.nkv` / `.nkc` / `.nks` / `.nka`
- `library.json`
- future: `entities.json`

特点：

- 是事实源
- 需要协作审阅
- 需要 merge / blame / history

### 5.2 哪些二进制素材应进入 Git LFS

建议进入 Git LFS：

- 最终采用的参考图
- 保留的角色形象图
- 确认使用的视频 / 音频素材
- 关键 3D 模型源文件

不建议默认进入 Git 的：

- 大量中间生成物
- 可重建代理文件
- 实验性批量输出

### 5.3 哪些数据不应进入 Git

不应进入 Git 的派生或缓存数据：

- `.neko/.cache/asset-graph.json`
- `.neko/.cache/vectors/`
- `.neko/.cache/generated/index.json`
- `thumbnails/`
- `proxies/`

这类数据即使将来需要“变更可视化”，也应通过权威层重建，而不是直接审阅缓存文件。

---

## 六、语义 Diff 模型

### 6.1 文件级结果

```ts
interface FileChangeSummary {
  path: string;
  kind: 'text' | 'json' | 'image' | 'video' | 'audio' | 'timeline' | 'binary';
  gitStatus: 'added' | 'modified' | 'deleted' | 'renamed';
  summary: string[];
}
```

### 6.2 语义变更投影

```ts
interface SemanticChange {
  id: string;
  entity?: {
    kind: 'character' | 'scene' | 'object' | 'location' | 'action';
    id: string;
    label?: string;
  };
  category:
    | 'entity-created'
    | 'entity-renamed'
    | 'binding-updated'
    | 'default-changed'
    | 'relation-added'
    | 'relation-removed'
    | 'occurrence-shifted'
    | 'media-replaced';
  sourceFiles: string[];
  summary: string;
  impact?: string[];
  confidence?: 'confirmed' | 'inferred';
}
```

### 6.3 语义 diff 的输出原则

- 输出“业务含义”，不只是字段变化
- 保留到源文件的反向链接
- 必须可解释，不允许黑箱“猜测式结论”
- 对 `inferred` 结果明确标注，不混入权威变更

---

## 七、Git 插件与扩展点设计

### 7.1 不开发 Git fork，开发 Git 集成插件

建议实现方向：

- 复用 VSCode 内置 Git 扩展 API
- 在 `neko-tools` 或独立 `neko-git` 模块中增加多模态 Git 适配层
- 与 Source Control、Custom Editor、Webview 联动

### 7.2 推荐扩展点

#### Diff Driver

通过 `.gitattributes` 配置：

```gitattributes
*.png  filter=lfs diff=neko-media merge=binary
*.jpg  filter=lfs diff=neko-media merge=binary
*.mp4  filter=lfs diff=neko-media merge=binary
*.wav  filter=lfs diff=neko-media merge=binary
```

CLI 侧提供：

```text
neko-diff old.bin new.bin
```

输出面向 Git CLI 的摘要文本。

#### Merge Driver

对二进制媒体默认维持：

- `merge=binary`
- 必要时结合 Git LFS lock

不建议对媒体文件尝试自动三方 merge。

#### VSCode SCM 集成

在 SCM 面板中为多模态文件提供：

- 变更摘要
- “打开媒体差异”
- “打开语义差异”
- “查看受影响实体”

#### Commit Review 面板

提交审阅不应只展示文件列表，还应增加：

- 受影响人物
- 受影响场景
- 受影响物品
- 默认绑定变化
- 关系边变化

---

## 八、与统一实体索引 ADR 的衔接

多模态 Git 集成必须建立在统一实体索引之上。

依赖关系如下：

```text
Git Change
  -> File Diff
  -> Semantic Projection
     -> Entity Registry
     -> CreativeEntityGraph
     -> OccurrenceIndex
  -> Review UI
```

没有统一实体索引时：

- 只能做文件级 diff
- 很难可靠回答“哪个人物受影响”
- JSON diff 只能停留在字段级，而无法进入实体级

因此：

- `adr-character-unified-index.md` 提供身份与关系基础
- 本 ADR 提供版本管理与审阅基础

两者是正交但强耦合的两层能力。

---

## 九、典型场景

### 9.1 人物默认形象替换

变更：

- 一张角色图进入 Git LFS 新版本
- `characters.json` 的 `defaults.assetEntityId` 或默认绑定变化

期望审阅结果：

- 文件视角：角色图发生替换，显示图像差异摘要
- 实体视角：人物 Alice 的默认视觉入口切换
- 影响视角：scene_03、scene_07、shot_021 等引用该默认形象的地方可能受影响

### 9.2 场景素材更新

变更：

- 某个环境图或场景视频被替换
- `library.json` 中 variant/file 更新

期望审阅结果：

- 元数据变化：尺寸、时长、编码、pHash/SSIM
- 语义变化：该素材归属的 `sceneId` / `locationId`
- 影响范围：哪些 storyboard / shot / timeline 元素引用它

### 9.3 关系从 inferred 变 confirmed

变更：

- 用户确认一张图属于某个人物
- Graph 边 `strength` 从 `inferred` 变 `confirmed`

期望审阅结果：

- 明确这是“确权变更”而不是普通标签变化
- 展示来源：user confirm
- 展示受益能力：Definition / References / Rename 结果将更稳定

---

## 十、方案比较

### 方案 A：只用 Git 原生能力

优点：

- 最简单
- 不需要额外系统

缺点：

- 二进制只能看到 `Binary files differ`
- JSON 索引缺少语义解释
- 无法支撑创作实体级 review

### 方案 B：修改 Git 本体

优点：

- 理论上最深度集成

缺点：

- 成本极高
- 与 Git 生态不兼容
- 维护风险不可接受

### 方案 C：Git 底座 + diff driver + 插件 + 语义审阅

优点：

- 与现有 Git / VSCode 生态兼容
- 可增量落地
- 能同时覆盖 CLI、SCM、Webview、实体级 review

缺点：

- 需要维护一层投影逻辑
- 需要定义多个 JSON schema 的语义 diff 规则

**决策：选择方案 C。**

---

## 十一、实施顺序

### Phase 1：接入 Git 主流程

- 梳理 `.gitattributes` 模板
- 明确 Git LFS 管理范围
- 在 SCM 中接通现有 `MediaDiff` 打开入口
- 为媒体文件显示基础摘要

### Phase 2：CLI diff driver

- 实现 `neko-diff`
- 输出图片 / 音频 / 视频的轻量摘要
- 让命令行 `git diff` 不再只显示 `Binary files differ`

### Phase 3：JSON 语义 diff

- 为 `characters.json` 定义语义 diff schema
- 为 `library.json` 定义实体 / variant / file diff schema
- 在 Webview 中增加 JSON 语义审阅视图

### Phase 4：实体影响分析

- 将 JSON diff 与 `Entity Registry + Graph + OccurrenceIndex` 关联
- 支持“受影响人物 / 场景 / 物品 / 动作”视图
- 支持从变更回跳到 Definition / References

### Phase 5：提交级语义审阅

- 提供 commit / staged changes 聚合视图
- 展示多文件合成后的实体变化
- 区分 `confirmed` 与 `inferred` 变更

### Phase 6：远端协作增强

- 评估 Git LFS lock 工作流
- 评估 PR / patch 导出能力
- 评估与远端代码托管平台的集成桥接

---

## 十二、收益

落地后，Git 在创作工作流中的角色将从“文件版本仓库”提升为“多模态创作审阅底座”：

- 二进制素材不再是黑盒变更
- JSON 元数据不再只能看文本行 diff
- 人物、场景、物品、动作可以参与提交审阅
- 媒体变化与 LSP/实体索引能力打通
- 代码、结构化元数据、媒体素材可以进入统一 review 体验

---

## 十三、风险与约束

### 风险

- 语义投影规则设计不当会产生误导性解释
- JSON schema 演进后，diff 规则需要同步升级
- 如果缓存层误入 Git，会显著增加噪音
- 多层 viewer 可能造成实现复杂度上升

### 约束

- 权威层与缓存层必须严格区分
- `inferred` 语义变化不能伪装成 `confirmed`
- 二进制 merge 仍应保守处理
- 语义 diff 必须保留到底层文件的可追溯链接

---

## 十四、结论

多模态 Git 集成不应通过修改 Git 本体来完成，而应通过 **Git / LFS 底座 + diff driver + VSCode 插件 + 语义审阅层** 来完成。

本 ADR 的最终结论是：

- 不修改 Git core
- 通过 Git LFS 管理大文件素材
- 通过 `neko-media` / `neko-diff` 提供二进制差异摘要
- 通过 VSCode / Webview 把现有媒体 diff 变成 Git 主工作流的一部分
- 为 `characters.json`、`library.json`、future `entities.json / CreativeEntityGraph` 提供语义 diff
- 通过 `Entity Registry + CreativeEntityGraph + OccurrenceIndex` 将文件变更投影为创作实体变更

这是一条兼容 Git 生态、适合渐进落地、且能真正服务多模态创作协作的最小可行路径。
