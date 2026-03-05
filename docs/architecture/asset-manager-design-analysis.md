# neko-assets 资产管理器设计分析

> 日期：2026-03-05
> 状态：设计分析完成，待实施
> 范围：neko-assets 功能定位、包结构、与其他扩展的关系

---

## 1. 背景与问题

### 1.1 当前状态

**neko-assets 已完成 Phase 1-3（65% 进度）**：
- ✅ 基础设施：AssetRegistry、AssetManifest、ThumbnailService、AssetDiffService
- ✅ Activity Bar 树视图：AssetManagerTreeProvider、MediaLibraryTreeProvider、AssetHistoryTreeProvider
- ❌ 缺少：完整的 Webview UI、搜索/过滤/排序功能、云端同步 UI

**neko-tools 已有完整的媒体对比功能**：
- ✅ MediaDiffService（图片/视频/音频对比）
- ✅ 三种可视化模式（侧边/叠加/滑块）
- ✅ 支持 Git 版本对比、相似度评分（SSIM/PSNR）

### 1.2 核心问题

1. **功能边界**：文件管理器 vs 资产管理器？
2. **包结构**：是否拆分成两个独立的包？
3. **三个功能的定位**：本地/远程文件管理器 vs 资产管理面板 vs 无限画布？

---

## 2. 三个功能的定位与边界

### 2.1 功能对比矩阵

| 维度 | 本地/远程文件管理器<br>（MediaLibraryTreeProvider） | 资产管理面板<br>（AssetManagerTreeProvider） | 无限画布<br>（neko-canvas） |
|------|------|------|------|
| **核心定位** | 外部文件系统访问 | 项目内资产结构化管理 | 可视化编排工作台 |
| **数据源** | `.neko/media-libraries.json`<br>（路径变量配置） | `.neko/assets/library.json`<br>（AssetLibrary） | `.jvc` 画布文件<br>（Node + Connection） |
| **数据模型** | 文件系统树（目录 + 文件） | Entity + Variant 两层结构 | Node + Connection 图结构 |
| **UI 形态** | Activity Bar 树视图 | Activity Bar 树视图 | CustomEditor 全屏编辑器 |
| **核心功能** | • 配置外部媒体库<br>• 路径变量（`${TEAM_FOOTAGE}`）<br>• 本地路径覆盖<br>• 懒加载目录树<br>• 拖拽到 Timeline/Canvas | • 按类别分组（8 种）<br>• 变体管理（多版本）<br>• 缩略图显示<br>• 标签搜索<br>• 健康检查（offline/missing）<br>• 拖拽到 Timeline/Canvas | • 无限画布（平移/缩放）<br>• 节点系统（5 种类型）<br>• 端口连接（类型验证）<br>• 内联媒体播放<br>• 故事板规划 |
| **使用场景** | 访问团队共享素材库、外部硬盘、NAS 存储 | 管理项目核心资产、支持变体管理 | 故事板、节点图、媒体预览 |
| **资产来源** | 外部文件系统（本地/远程/NAS） | 项目内 + 导入的资产 | 依赖 neko-assets 提供 |
| **拖拽协议** | `application/vnd.neko.media-file` | `ASSET_DRAG_MIME` | 接收拖拽创建 MediaNode |
| **跨扩展集成** | 右键"导入到资产库" | 提供 `neko.assets.getAllEntities` API | 调用 neko-assets API 获取资产 |

### 2.2 用户工作流中的角色

```
┌─────────────────────────────────────────────────────────────┐
│ 用户工作流：从素材导入到可视化编排                            │
└─────────────────────────────────────────────────────────────┘

1️⃣ 访问外部素材
   └─ MediaLibraryTreeProvider（本地/远程文件管理器）
      ├─ 配置 ${TEAM_FOOTAGE} → /Volumes/NAS/footage
      ├─ 浏览目录树
      └─ 拖拽到 Timeline 或右键"导入到资产库"

2️⃣ 管理项目资产
   └─ AssetManagerTreeProvider（资产管理面板）
      ├─ 导入后自动分类（Character/Environment/Effect...）
      ├─ 创建变体（角色的不同服装、武器的不同材质）
      ├─ 添加标签、生成缩略图
      └─ 健康检查（检测 offline/missing 文件）

3️⃣ 可视化编排
   └─ neko-canvas（无限画布）
      ├─ 打开 .jvc 文件
      ├─ 从 AssetLibrary 拖拽资产到画布 → 创建 MediaNode
      ├─ 连接节点、添加注释
      └─ 内联播放媒体预览效果
```

### 2.3 功能重叠与互补

**重叠部分**：
- **资产浏览**：
  - MediaLibraryTreeProvider：文件系统树（外部）
  - AssetManagerTreeProvider：结构化树（项目内）
  - neko-canvas AssetLibraryProvider：简化视图（仅用于拖拽）
- **媒体预览**：
  - 三者都通过 `neko.canvas.previewMedia` 调用 neko-preview

**互补关系**：
- MediaLibraryTreeProvider：**外部素材访问**（无需复制到项目）
- AssetManagerTreeProvider：**项目内资产管理**（结构化、版本控制）
- neko-canvas：**可视化编排**（节点连接、故事板）

### 2.4 架构评估

**当前设计的优点**：
1. ✅ **职责清晰**：外部访问 vs 项目管理 vs 可视化编排
2. ✅ **松耦合**：通过 VSCode 命令通信，无直接依赖
3. ✅ **可扩展**：neko-canvas 可接入其他资产源（如云端 API）

**潜在改进方向**：
1. ⚠️ **统一拖拽协议**：MediaLibrary 的拖拽数据结构与 AssetManager 略有差异
2. ⚠️ **资产预览缓存**：ThumbnailService 可暴露 API 给 neko-canvas 使用
3. ⚠️ **外部媒体库增强**：支持远程 URL（HTTP/S3）、云端同步状态显示

---

## 3. 关键决策

### 3.1 决策 1：功能边界（文件管理器 vs 资产管理器）

**结论**：统一的资产管理器，不拆分功能

**理由**：
1. **对比功能已完整实现**：neko-tools 有完整的 MediaDiffService，无需重复开发
2. **缺少的是浏览 UI**：不是功能缺失，而是入口缺失
3. **用户体验一致**：统一入口，避免在多个工具间切换

**推荐方案**：渐进式统一架构
```
统一资产管理器 (Asset Manager)
├─ Phase 4A：核心浏览功能（文件管理器能力）
│   ├─ 网格/列表视图
│   ├─ 搜索/过滤/排序
│   └─ 拖拽到编辑器
├─ Phase 4B：高级管理功能（资产管理器能力）
│   ├─ 集成现有对比功能
│   ├─ 元数据编辑
│   └─ 批量操作
└─ Phase 5：云端协作（长期规划）
    ├─ 云端同步 UI
    └─ 冲突解决
```

### 3.2 决策 2：包结构（是否拆分成两个包）

**结论**：不拆分，保持单扩展包 + 添加 Webview 子包

**架构设计文档的论述**（`docs/architecture/asset-management-design.md` 第 2.2 节）：

> 拆分的唯一好处是"关注点分离"，但这个分离在 handler 层就能做到，不需要拆包。

**为什么不拆分？**

| 拆分方案 | 问题 |
|----------|------|
| neko-assets（媒体）+ neko-registry（shader/模型） | • 用户搜索"我的资源"要查两个地方<br>• shader 预览需要缩略图，又得依赖 neko-assets<br>• 依赖关系变复杂 |
| neko-assets（用户）+ neko-marketplace（社区） | • 同一个 shader 可能先从社区安装，再本地修改<br>• 身份在两个系统间跳转<br>• 版本管理割裂 |

**正确的分层方式**：

```
neko-assets/                          # 单一扩展包（发布单元）
├── src/                              # Extension Host 层
│   ├── extension.ts
│   ├── providers/                    # VSCode Providers
│   ├── services/                     # VSCode 集成服务
│   └── webview/                      # 🆕 Webview 提供者（Phase 4A）
│
├── packages/asset/                   # 核心库（vscode-free）
│   ├── src/
│   │   ├── service/
│   │   │   ├── AssetLibrary.ts       # Facade
│   │   │   ├── EntityService.ts      # 媒体资产（Entity/Variant/File）
│   │   │   └── AssetDiffService.ts
│   │   ├── handlers/                 # 🆕 类型特化处理（Phase 4）
│   │   │   ├── MediaHandler.ts       # 媒体资产 Handler
│   │   │   ├── ShaderHandler.ts      # Shader Handler
│   │   │   └── ModelHandler.ts       # AI 模型 Handler
│   │   ├── storage/
│   │   │   ├── LocalFileStorage.ts
│   │   │   └── CloudStorage.ts       # 🆕 Phase 5
│   │   └── classifier/
│   └── package.json                  # @neko/asset
│
└── packages/webview/                 # 🆕 Asset Manager UI（Phase 4A）
    ├── src/
    │   ├── AssetBrowserApp.tsx
    │   ├── components/
    │   └── stores/
    └── package.json
```

**关键设计原则**：
1. **统一注册表**：`AssetRegistry` + `AssetManifest`（通用）
2. **类型特化处理**：`MediaHandler` / `ShaderHandler` / `ModelHandler`（专用）
3. **分层存储**：`LocalFileStorage` / `LfsStorage` / `LazyStorage`（按需）

**与其他扩展的一致性**：

| 扩展 | 子包结构 | 模式 |
|------|---------|------|
| neko-cut | extension + webview | 标准双进程 |
| neko-canvas | extension + webview | 标准双进程 |
| neko-tools | extension + webview | 标准双进程 |
| **neko-assets（当前）** | asset | 单核心库 |
| **neko-assets（Phase 4A 后）** | asset + webview | 核心库 + UI |

### 3.3 决策 3：三个功能的关系

**结论**：三者职责不同，互补协作，不应合并

**功能定位**：
- **MediaLibraryTreeProvider**（本地/远程文件管理器）：外部文件系统访问，无需复制到项目
- **AssetManagerTreeProvider**（资产管理面板）：项目内资产结构化管理，支持变体和版本控制
- **neko-canvas**（无限画布）：可视化编排工作台，节点连接和故事板规划

**协同工作流**：
```
外部素材 → MediaLibrary 浏览 → 导入到 AssetManager → 拖拽到 Canvas 编排
```

**不应合并的理由**：
1. **数据源不同**：外部文件系统 vs 项目内资产库 vs 画布文件
2. **UI 形态不同**：Activity Bar 树视图 vs 全屏编辑器
3. **使用频率不同**：MediaLibrary 偶尔访问，AssetManager 高频使用，Canvas 专注编排
4. **职责清晰**：符合单一职责原则（SRP）

**当前设计已经很好**：三者通过 VSCode 命令松耦合，各司其职。

---

## 4. 实施计划

### 4.1 Phase 4A：资产浏览器 Webview（优先级 P0）

**目标**：提供统一的资产浏览和管理界面

**功能范围**：
- ✅ 网格视图 + 列表视图切换
- ✅ 搜索栏（模糊搜索）
- ✅ 过滤面板（类型/类别/标签/状态）
- ✅ 排序下拉（名称/时间/大小/类型）
- ✅ 类别标签页（All/Video/Audio/Image/Shader...）
- ✅ 缩略图预览
- ✅ 拖拽到时间线/画布
- ✅ 右键菜单（导入/预览/添加到...）

**包结构变更**：

```diff
neko-assets/
├── src/
│   ├── services/
+│   │   ├── AssetQueryService.ts        # 🆕 查询/过滤/搜索
+│   │   └── AssetSortService.ts         # 🆕 排序
+│   └── webview/
+│       ├── AssetBrowserWebview.ts      # 🆕 Webview 提供者
+│       └── BrowserMessageHandler.ts    # 🆕 消息处理器
│
+└── packages/webview/                   # 🆕 React UI
+    ├── src/
+    │   ├── AssetBrowserApp.tsx         # 主应用
+    │   ├── components/
+    │   │   ├── AssetGrid.tsx           # 网格视图
+    │   │   ├── AssetList.tsx           # 列表视图
+    │   │   ├── SearchBar.tsx           # 搜索栏
+    │   │   ├── FilterPanel.tsx         # 过滤面板
+    │   │   └── SortDropdown.tsx        # 排序下拉
+    │   └── stores/
+    │       └── assetBrowserStore.ts    # Zustand 状态管理
+    ├── package.json
+    ├── tsconfig.json
+    └── vite.config.ts
```

**关键接口**：
```typescript
// 查询服务
interface IAssetQueryService {
  query(filter: AssetQueryFilter): Promise<AssetManifest[]>;
  search(text: string, options?: SearchOptions): Promise<AssetManifest[]>;
}

// 排序服务
interface IAssetSortService {
  sort(assets: AssetManifest[], by: SortBy, order: SortOrder): AssetManifest[];
}

// 查询过滤器
interface AssetQueryFilter {
  types?: AssetType[];
  categories?: EntityCategory[];
  tags?: string[];
  searchText?: string;
  status?: ('online' | 'offline' | 'missing')[];
  limit?: number;
  offset?: number;
}
```

**工作量估算**：2-3 周

### 4.2 Phase 4B：集成对比功能（优先级 P1）

**目标**：在资产浏览器中直接触发对比

**功能范围**：
- ✅ 选择两个资产 → 右键"对比"
- ✅ 调用现有的 MediaDiffService
- ✅ 在对比视图中打开（复用 neko-tools 的 UI）
- ✅ 对比历史记录（最近对比的资产对）

**技术实现**：
```typescript
// 在 AssetBrowserApp 中添加
function handleCompare(assetA: AssetManifest, assetB: AssetManifest) {
  // 调用 neko-tools 的对比命令
  vscode.commands.executeCommand('neko.tools.compareFiles',
    assetA.source.path,
    assetB.source.path
  );
}

// 或者调用 neko-assets 的变体对比
function handleCompareVariants(entityId: string, variantA: string, variantB: string) {
  vscode.commands.executeCommand('neko.tools.compareAssetVariants',
    entityId,
    variantA,
    variantB
  );
}
```

**工作量估算**：1 周

### 4.3 Phase 5：云端同步 UI（优先级 P2，长期规划）

**目标**：实现云端同步的可视化管理

**功能范围**：
- ✅ 同步状态指示器（已同步/本地修改/同步中/冲突）
- ✅ 同步历史记录
- ✅ 冲突解决 UI
- ✅ 上传/下载进度条
- ✅ 同步设置面板

**前置条件**：
- CloudSyncService 实现（Phase 5 规划）
- 远程注册表基础设施

**工作量估算**：4-6 周

---

## 5. 总结

### 5.1 核心结论

**Q1: 对比 完整资产管理 vs 本地/云端素材文件管理，哪种方案更适合？**

**A: 两者不是互斥的，而是同一系统的不同阶段。**

推荐构建"统一的资产管理器"，分阶段实现功能：
1. Phase 4A：资产浏览器（文件管理器能力）
2. Phase 4B：集成对比功能（资产管理器能力）
3. Phase 5：云端同步 UI（完整资产管理器）

**Q2: 是否应该拆分成两个包？**

**A: 不拆分。保持单一扩展包，通过内部分层实现关注点分离。**

**核心理由**：
1. **设计文档已明确论述**：拆分的唯一好处是"关注点分离"，但这个分离在 handler 层就能做到，不需要拆包
2. **用户体验一致**：统一入口，避免在多个工具间切换
3. **避免依赖复杂化**：shader 预览需要缩略图，拆包后会产生循环依赖
4. **符合项目实践**：neko-cut/canvas/tools 都是单扩展包 + 子包结构

**正确的分层方式**：
- **统一注册表**：`AssetRegistry` + `AssetManifest`（14 种资产类型）
- **类型特化处理**：`MediaHandler` / `ShaderHandler` / `ModelHandler`
- **分层存储**：`LocalFileStorage` / `LfsStorage` / `LazyStorage`

**Q3: 本地/远程文件管理器 vs 资产管理面板 vs 无限画布，三者的关系？**

**A: 三者职责不同，互补协作，不应合并。**

**功能定位**：
- **MediaLibraryTreeProvider**（本地/远程文件管理器）：外部文件系统访问，无需复制到项目
- **AssetManagerTreeProvider**（资产管理面板）：项目内资产结构化管理，支持变体和版本控制
- **neko-canvas**（无限画布）：可视化编排工作台，节点连接和故事板规划

**协同工作流**：
```
外部素材 → MediaLibrary 浏览 → 导入到 AssetManager → 拖拽到 Canvas 编排
```

### 5.2 包结构演进

```
当前（Phase 1-3）：
neko-assets/
├── src/                    # Extension Host
└── packages/asset/         # 核心库

Phase 4A（资产浏览器）：
neko-assets/
├── src/                    # Extension Host
├── packages/asset/         # 核心库
└── packages/webview/       # 🆕 Asset Manager UI

Phase 5（可选 CLI）：
neko-assets/
├── src/                    # Extension Host
├── packages/asset/         # 核心库
├── packages/webview/       # Asset Manager UI
└── packages/cli/           # 🆕 CLI 工具（可选）
```

### 5.3 关键洞察

- ✅ 对比功能已完整实现（neko-tools），无需重复开发
- ✅ 缺少的是统一的浏览和管理 UI
- ✅ 应该构建"统一的资产管理器"，而不是两个独立工具
- ✅ 通过 Handler 模式实现类型特化，不需要拆包
- ✅ 三个功能（MediaLibrary/AssetManager/Canvas）职责清晰，当前设计已经很好

---

*最后更新: 2026-03-05*
