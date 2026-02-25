# 资产管理统一架构设计

> 日期：2026-02-25
> 状态：架构决策
> 范围：neko-assets / neko-cut / neko-canvas / neko-agent / neko-engine / neko-tools

---

## 1. 现状分析：资产管理碎片化

### 1.1 各包资产处理方式

| 包 | 资产模型 | 存储 | 元数据提取 | 缩略图 | 类型检测 |
|---|---|---|---|---|---|
| neko-assets | `AssetEntity/Variant/File` 三层 | JSON 持久化 | 仅 fileSize + MIME | 字段存在但未实现 | `detectMediaType` |
| neko-cut | 适配 neko-assets | 委托 neko-assets | **重复实现** `extractMetadata` | **独立实现** ThumbnailService | **重复实现** `detectMediaType` |
| neko-canvas | **独立 `Asset` 类型**（扁平） | 内存数组，无持久化 | 无 | 字段存在但未填充 | **重复实现** `getAssetType` |
| neko-engine | 不管理资产 | — | `probeMedia`（Rust FFmpeg，最强） | — | — |
| neko-agent | 不使用资产库 | — | 无 | — | URL/taskId 引用 |
| neko-tools | 独立 MediaDiffService | — | Git 版本历史 | — | — |

### 1.2 四个核心问题

**代码重复**（至少 4 处）：
- 媒体类型检测：neko-assets `FileService` / neko-cut `AssetService` / neko-canvas `AssetLibraryProvider` 各写了一遍
- MIME 映射：3 处独立实现
- Variant diff：neko-assets `AssetDiffService` 和 neko-cut `AssetService` 各写了一遍
- 文件导入对话框：neko-cut 和 neko-canvas 各写了一遍

**元数据提取断裂**：
- neko-engine 有最强的 `probeMedia`（Rust FFmpeg，能提取 duration/codec/分辨率）
- neko-assets 的 `MetadataExtractor` 只用了 `fs.stat`
- 视频/音频的核心元数据（时长、编码格式、分辨率）至今未接入资产库

**缩略图系统孤立**：
- neko-cut 的 `ThumbnailService` 功能完善（LRU 缓存 + 并发控制 + 优先级队列），但与 neko-assets 的 `thumbnailFileId` 字段完全无关联
- neko-canvas 的 `Asset.thumbnail` 从未被填充

**neko-canvas 完全独立**：
- 自己的 `Asset` 类型（扁平结构，无 variant/category），与 `neko-types` 中定义的 `AssetEntity` 完全不同
- 内存存储，无持久化，关闭后丢失

---

## 2. 架构决策：统一注册，分层存储

### 2.1 核心结论

**一个 neko-assets 包，内部 handler 分层。统一注册 + 统一查询 + 统一分发，存储和处理逻辑按类型特化。**

### 2.2 为什么不拆两个包

| 拆分方案 | 问题 |
|----------|------|
| neko-assets（媒体）+ neko-registry（shader/模型/插件） | 用户搜索"我的资源"要查两个地方；shader 预览需要缩略图，又得依赖 neko-assets 的缩略图服务；依赖关系变复杂 |
| neko-assets（用户资产）+ neko-marketplace（社区资产） | 同一个 shader 可能先从社区安装，再本地修改，身份在两个系统间跳转；版本管理割裂 |

拆分的唯一好处是"关注点分离"，但这个分离在 handler 层就能做到，不需要拆包。

### 2.3 为什么不简单合并

当前 neko-assets 的 `AssetEntity/Variant/File` 三层模型是为媒体素材设计的（一个角色有多个变体，每个变体有多个文件）。Shader 和 AI 模型不需要 variant 概念，硬套会很别扭。

需要一个更通用的 `AssetManifest` 作为统一注册层，现有的 `AssetEntity` 体系作为 `MediaHandler` 的内部实现保留。

---

## 3. 资产分类

### 3.1 两个维度

```
                    用户创作的              外部获取的
                 ┌──────────────┐    ┌──────────────┐
  媒体素材       │ 拍摄的视频     │    │ 素材库购买的   │
  (图文音视频)   │ 录制的音频     │    │ 免费素材下载   │
                 │ AI 生成的图片  │    │ 团队共享素材   │
                 └──────────────┘    └──────────────┘
  创作资源       │ 自定义 Shader  │    │ 社区 Shader   │
  (Shader/模型/  │ 微调的 AI 模型 │    │ 预训练模型    │
   插件/预设)    │ 自写的插件     │    │ 社区插件/预设  │
                 └──────────────┘    └──────────────┘
```

### 3.2 资产类型与存储特征

| 资产类型 | 生命周期操作 | 存储特征 | 版本管理 |
|----------|-------------|----------|----------|
| 媒体素材 | 导入/编辑/导出/分享 | 大文件，二进制 | Git LFS |
| Shader | 安装/卸载/更新/编写/分享 | 小文件，文本 | Git 原生 |
| AI 模型 | 下载/切换/微调/分享 | 超大文件（GB 级） | 版本号 + 校验和 |
| 插件/Skill | 安装/卸载/更新/配置/分享 | 中等，混合 | 语义化版本 |
| 预设/LUT/模板 | 导入/导出/分享 | 小文件 | Git 原生 |

---

## 4. 目标架构

### 4.1 包内结构

```
neko-assets/
├── src/
│   ├── core/                    # 统一注册表（所有资产共享）
│   │   ├── AssetRegistry.ts     # 统一 CRUD + 查询 + 事件
│   │   ├── AssetResolver.ts     # ID → 实际路径/URL
│   │   └── AssetManifest.ts     # 统一清单格式
│   │
│   ├── handlers/                # 按类型特化处理
│   │   ├── MediaHandler.ts      # 媒体：元数据(→engine probe) + 缩略图
│   │   ├── ShaderHandler.ts     # Shader：编译验证 + 预览 + 热重载
│   │   ├── ModelHandler.ts      # AI 模型：下载 + 校验 + 量化选择
│   │   ├── PluginHandler.ts     # 插件/Skill：依赖解析 + 沙箱加载
│   │   └── PresetHandler.ts     # 预设/LUT/模板：参数验证
│   │
│   ├── storage/                 # 按特征选择存储策略
│   │   ├── LocalFileStorage.ts  # 本地文件（媒体、shader、预设）
│   │   ├── LfsStorage.ts        # Git LFS（大媒体文件）
│   │   ├── LazyStorage.ts       # 懒加载（AI 模型，GB 级）
│   │   └── RegistryStorage.ts   # 远程注册表（社区/私有源）
│   │
│   ├── services/                # 现有服务（保留 + 增强）
│   │   ├── EntityService.ts     # 保留，作为 MediaHandler 内部
│   │   ├── FileService.ts       # 统一媒体类型检测/MIME（消除重复）
│   │   ├── VariantService.ts    # 保留，作为 MediaHandler 内部
│   │   └── AssetDiffService.ts  # 保留，增强
│   │
│   └── distribution/            # 分发（Phase 4）
│       ├── PackageFormat.ts     # .neko 包格式
│       └── RegistryClient.ts    # push/pull/search
```

### 4.2 统一的 AssetManifest

```typescript
// neko-types 中定义
interface AssetManifest {
  id: string;
  name: string;
  version: string;
  type: AssetType;

  // source
  source:
    | { kind: 'local'; path: string }
    | { kind: 'git-lfs'; oid: string }
    | { kind: 'registry'; registry: string; package: string }
    | { kind: 'ai-generated'; taskId: string; model: string };

  // type-specific metadata
  metadata: MediaMetadata | ShaderMetadata | ModelMetadata | PluginMetadata;

  // distribution info
  distribution?: {
    license: string;
    author: string;
    tags: string[];
    downloads?: number;
    checksum: string;
  };

  // dependencies
  dependencies?: AssetDependency[];
}

type AssetType =
  | 'video' | 'audio' | 'image' | 'sequence'    // media
  | 'shader' | 'shader-preset'                    // shader
  | 'ai-model' | 'lora' | 'embedding'            // AI model
  | 'plugin' | 'skill'                            // plugin / Agent Skill
  | 'preset' | 'template' | 'lut';               // preset / template / LUT
```

### 4.3 类型特化的 Metadata

```typescript
interface ShaderMetadata {
  language: 'wgsl' | 'glsl';
  stage: 'vertex' | 'fragment' | 'compute';
  inputs: ShaderInput[];
  preview?: string;           // preview image path
  compatibleWith: string[];   // compatible engine versions
}

interface ModelMetadata {
  framework: 'onnx' | 'pytorch' | 'safetensors';
  task: 'image-gen' | 'tts' | 'style-transfer' | 'upscale' | string;
  size: number;               // file size
  quantization?: string;      // quantization level
  minVram?: number;           // minimum VRAM requirement
}

interface PluginMetadata {
  entryPoint: string;
  apiVersion: string;
  permissions: string[];
  configSchema?: Record<string, unknown>;
}
```

### 4.4 各消费方的关系

```
neko-engine
├─ consume shader assets (via AssetResolver → .wgsl path)
├─ consume AI models (via AssetResolver → model path)
└─ provide MediaHandler capabilities (probeMedia / thumbnail extraction)

neko-cut
├─ consume media assets (video/audio/image)
├─ consume preset assets (export presets / LUT / transition presets)
└─ access via AssetLibrary Facade (no more duplicate code)

neko-canvas
├─ consume media assets (image/video embedded in nodes)
├─ consume template assets (canvas templates)
└─ use unified AssetEntity (retire independent Asset type)

neko-agent
├─ consume AI model assets (for inference)
├─ consume Skill assets (Agent Skills as installable assets)
├─ produce media assets (AI-generated results auto-imported)
└─ provide AI classification for AssetClassifier

neko-tools
├─ consume media assets (for diff comparison)
└─ access version history via AssetDiffService
```

---

## 5. 实施路线

### Phase 1：统一核心 + 消除重复（当前可做）

**目标**：消除 4 处代码重复，接入 engine probeMedia

| 动作 | 从 | 到 | 影响 |
|------|----|----|------|
| 统一媒体类型检测 | 3 处重复 | neko-assets `FileService` 唯一实现 | neko-cut / neko-canvas 删除重复代码 |
| 统一 MIME 映射 | 3 处重复 | neko-assets `FileService` | 同上 |
| 接入 engine probeMedia | neko-engine 独立 | neko-assets `MetadataExtractor` 调用 engine | 资产库获得完整媒体元数据 |
| 统一 Variant diff | 2 处重复 | neko-assets `AssetDiffService` 唯一实现 | neko-cut 删除重复 |

### Phase 2：neko-canvas 接入 + 缩略图下沉

**目标**：neko-canvas 使用统一资产库，缩略图服务下沉到 Extension Host

neko-canvas 接入：
```
current: neko-canvas independent Asset type (flat, in-memory)
target:  neko-canvas uses AssetEntity (3-layer, persistent)

approach:
├─ define CanvasAssetAdapter
│   └─ map AssetEntity to simplified canvas view
├─ canvas nodes reference AssetFile.id instead of file path
└─ share .neko/assets/library.json
```

缩略图服务下沉：
```
current: ThumbnailService in neko-cut webview
target:  thumbnail generation in Extension Host layer

reason:
├─ thumbnail generation needs MediaProxy (WebCodecs or Native FFmpeg)
├─ multiple packages (cut/canvas/preview) need thumbnails
├─ Extension Host can unify caching and persistence
└─ generated results write to AssetVariant.thumbnailFileId

approach:
├─ neko-assets adds ThumbnailService (Extension Host)
├─ extract keyframes via neko-engine probeMedia
├─ cache to .neko/assets/thumbnails/
└─ neko-cut / neko-canvas webview request via postMessage
```

### Phase 3：Shader / 预设资产化（neko-model 启动时）

- `ShaderAssetHandler`：编译验证 + 预览 + 热重载
- `PresetAssetHandler`：LUT / 转场预设 / 导出预设
- 本地 `.neko/assets/` 目录结构扩展
- `AssetManifest` 类型定义落地到 neko-types

### Phase 4：AI 模型资产化（neko-agent 成熟后）

- `ModelAssetHandler`：下载 + 校验 + 量化选择
- 模型存储策略（懒加载 + 缓存 + 磁盘空间管理）
- AI 生成结果自动入库
- neko-agent 生成完成 → Extension Host 调用 `AssetLibrary.importFile()` → 自动分类 + 元数据 + 缩略图

### Phase 5：社区分发（产品成熟后）

- `.neko` 包格式定义（manifest + content）
- 远程注���表（类似 npm registry）
- push / pull / search / install CLI
- 私有化部署支持
- 依赖解析（Shader 依赖 common.wgsl 等）

---

## 6. Git 与社区资产共存设计

### 6.1 核心矛盾

社区安装的资产（shader/模型/插件）和 Git 仓库管理之间存在冲突：

| 场景 | 问题 |
|------|------|
| 社区 shader 入 Git | 成员 A 安装了 shader X，B 没装，pull 后 B 多了不需要的文件 |
| AI 模型入 Git | GB 级模型文件进 LFS，clone 时间爆炸 |
| registry 全入 Git | 合并冲突频繁（每个人安装的资产不同） |
| 全部不入 Git | 换机器后所有安装的资产丢失，团队无法共享配置 |

### 6.2 解决方案：声明与实体分离（npm/pnpm 模式）

借鉴 `package.json` + `pnpm-lock.yaml` + `node_modules/` 的模式：

| 文件 | 类比 | Git 跟踪 | 内容 |
|------|------|----------|------|
| `project.json` | `package.json` | Yes | 声明项目依赖的资产（名称 + 版本范围） |
| `lock.json` | `pnpm-lock.yaml` | Yes | 精确版本 + 校验和（可复现） |
| `local.json` | — | No | 个人偏好（额外安装的资产、UI 状态） |
| `.installed/` | `node_modules/` | No | 实际文件（从 registry 下载或本地缓存） |

### 6.3 project.json 示例

```jsonc
{
  "version": 1,
  // project media assets (tracked by Git/LFS)
  "media": {
    "tracking": "git-lfs",
    "patterns": ["*.mp4", "*.mov", "*.wav"]
  },
  // shared dependencies (like package.json dependencies)
  "dependencies": {
    "shaders": {
      "neon-glow": "^1.2.0",
      "film-grain": "~2.0.0"
    },
    "models": {
      "sdxl": { "version": "^1.0", "lazy": true },
      "whisper-large": { "version": "^3.0", "lazy": true }
    },
    "presets": {
      "cinematic-lut-pack": "^1.0.0"
    }
  },
  // registry sources (support private deployment)
  "registries": {
    "default": "https://registry.neko.dev",
    "private": "https://assets.company.internal"
  }
}
```

### 6.4 团队协作工作流

```
1. A installs community shader "neon-glow@1.2.0"
   → project.json: add dependency declaration
   → lock.json: record exact version + checksum
   → .installed/: download actual files
   → git commit project.json + lock.json

2. B pulls
   → detects project.json change
   → auto-run "neko assets install" (like pnpm install)
   → download from registry to .installed/
   → done, B also has neon-glow shader

3. A installs experimental shader (personal only)
   → writes to local.json (not in Git)
   → .installed/: download actual files
   → only available on A's machine
```

### 6.5 AI 模型的懒加载策略

```
1. Project declares "stable-diffusion-xl" model
   → project.json: { "models": { "sdxl": { "version": "^1.0", "lazy": true } } }
   → lock.json: { "sdxl": { "version": "1.0.1", "checksum": "abc123", "size": "6.5GB" } }
   → NOT downloaded at clone/install time

2. First use triggers download
   → ModelHandler detects model not in .cache/
   → downloads to .cache/ with progress bar
   → verifies checksum
   → ready to use

3. Disk space management
   → "neko assets prune" removes unused model caches
   → configurable max cache size
```

### 6.6 .gitignore 规则

```gitignore
# neko assets - installed files (like node_modules)
.neko/assets/.installed/
.neko/assets/models/.cache/
.neko/assets/local.json
.neko/assets/thumbnails/

# neko assets - tracked (do NOT ignore)
# .neko/assets/project.json    (tracked - dependency declarations)
# .neko/assets/lock.json       (tracked - reproducible installs)
# .neko/assets/media/           (tracked via LFS - project media)
# .neko/assets/shaders/custom/  (tracked - user-created shaders)
```

---

## 7. 本地存储结构

```
<workspace>/
└── .neko/
    └── assets/
        ├── project.json          # dependency declarations (Git tracked)
        ├── lock.json             # exact versions + checksums (Git tracked)
        ├── local.json            # personal preferences (.gitignore)
        │
        ├── media/                # project media files (Git LFS)
        ├── thumbnails/           # generated thumbnails (.gitignore)
        │
        ├── shaders/
        │   ├── custom/           # user-created shaders (Git tracked)
        │   └── .installed/       # community shaders (.gitignore)
        ├── models/
        │   └── .cache/           # AI models, lazy-loaded (.gitignore)
        ├── plugins/
        │   └── .installed/       # plugins / Agent Skills (.gitignore)
        ├── presets/
        │   ├── custom/           # user-created presets (Git tracked)
        │   └── .installed/       # community presets (.gitignore)
        └── .lock                 # concurrent access lock
```

---

## 8. 前端 Webview 设计

### 8.1 现状：两套独立实现

| 维度 | neko-cut AssetLibrary | neko-canvas AssetLibraryProvider |
|---|---|---|
| 渲染 | React + Vite 独立入口 | 内联 HTML 原生 JS |
| 数据模型 | Entity/Variant（`@neko/shared`） | 扁平 Asset（独立类型） |
| 功能 | 分类/过滤/多选/拖拽/对比/合并 | 搜索/导入/拖拽（基础） |
| 注册 | ViewProvider **未注册**（构建了但没挂上） | 已注册 `neko.assetLibrary` |

### 8.2 决策：不做独立资产面板

在已有 Explorer 目录树和 neko-canvas 画布的情况下，独立资产面板的价值有限：

| 需求 | 目录树 | 画布 | 独立面板 |
|------|--------|------|----------|
| 浏览文件结构 | ✅ 原生能力 | — | 重复 |
| 视觉组织素材 | — | ✅ 空间布局 | 重复 |
| 缩略图预览 | ❌ | ✅ 节点内嵌 | ✅ |
| 媒体元数据 | ❌ | ❌ | ✅ |
| 语义分类/标签 | ❌ | ❌ | ✅ |
| 社区资产搜索/安装 | ❌ | ❌ | ✅ |
| AI 模型管理 | ❌ | ❌ | ✅ |
| Shader 预览 | ❌ | ❌ | ✅ |

独立面板的独特价值集中在**结构化检索 + 元数据 + 资产生命周期管理**，但这些可以通过增强目录树 + 按需侧边栏实现，不需要重量级独立面板。

### 8.3 目标方案：增强目录树 + 按需侧边栏

```
日常浏览 → 增强 Explorer 目录树（用户已经习惯的地方）
视觉组织 → neko-canvas 画布（保持纯粹的创作工具）
资产管理 → 按需侧边栏（社区/模型/shader 管理时才出现）
```

#### 8.3.1 增强 Explorer 目录树

通过 `FileDecorationProvider` + `TreeDataProvider` 增强现有目录树：

```typescript
// neko-assets extension: enhance Explorer tree
class AssetFileDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const asset = this.registry.getByPath(uri.fsPath);
    if (!asset) return undefined;

    // show media duration / resolution as badge
    return {
      badge: asset.metadata.duration ? formatDuration(asset.metadata.duration) : undefined,
      tooltip: this.formatTooltip(asset),  // full metadata on hover
    };
  }
}

// enhanced right-click menu
vscode.commands.registerCommand('neko.assets.addToTimeline', (uri) => {
  // resolve asset metadata, send to active editor
  const asset = this.registry.getByPath(uri.fsPath);
  vscode.commands.executeCommand('neko.cut.addElement', {
    path: uri.fsPath,
    metadata: asset?.metadata,  // carry metadata, not just path
  });
});
```

增强内容：
- 文件图标旁显示时长/分辨率 badge
- Hover 显示完整媒体元数据（编码/码率/采样率等）
- 右键菜单：添加到时间线 / 添加到画布 / 查看变体 / 安装为资产
- 拖拽增强：拖拽时携带资产元数据（不只是文件路径）

#### 8.3.2 按需资产管理侧边栏

仅在需要管理社区资产/AI 模型/Shader 时出现，不常驻：

```jsonc
// neko-assets/package.json
{
  "views": {
    "neko-assets": [{
      "type": "webview",
      "id": "neko.assets.manager",
      "name": "Asset Manager",
      "when": "neko.showAssetManager"
    }]
  },
  "commands": [{
    "command": "neko.assets.openManager",
    "title": "Open Asset Manager",
    "category": "Neko"
  }]
}
```

侧边栏内容（按 tab 切换）：
- **Community**：搜索/浏览/安装社区资产
- **Models**：AI 模型下载/切换/量化选择/磁盘管理
- **Shaders**：Shader 浏览/预览/安装/编辑
- **Presets**：导出预设/LUT/模板管理

#### 8.3.3 各编辑器的拖拽协议

统一拖拽数据格式，各编辑器按需消费：

```typescript
// unified drag data (from Explorer tree or Asset Manager sidebar)
interface AssetDragData {
  assetId?: string;           // registry ID (if registered)
  path: string;               // file path (always available)
  type: AssetType;            // media type
  metadata?: AssetMetadata;   // pre-extracted metadata

  // editor-specific hints
  suggestedTrack?: 'video' | 'audio' | 'text';  // for neko-cut
  suggestedNodeType?: string;                     // for neko-canvas
}

// neko-cut consumes drag data
function handleDrop(data: AssetDragData) {
  // use metadata to auto-configure element (duration, resolution, etc.)
  addTimelineElement({
    source: data.path,
    duration: data.metadata?.duration,
    track: data.suggestedTrack ?? inferTrack(data.type),
  });
}

// neko-canvas consumes drag data
function handleDrop(data: AssetDragData) {
  addCanvasNode({
    type: data.suggestedNodeType ?? 'MediaNode',
    source: data.path,
    thumbnail: data.metadata?.thumbnail,
  });
}
```

### 8.4 迁移计划

| 步骤 | 动作 | 影响 |
|------|------|------|
| 1 | neko-assets extension 实现 `AssetFileDecorationProvider` | Explorer 目录树增强 |
| 2 | neko-assets extension 实现统一右键菜单 + 拖拽协议 | 各编辑器统一消费 |
| 3 | neko-cut 删除独立 `assetLibrary.html` 入口 | 减少维护成本 |
| 4 | neko-canvas 删除 `AssetLibraryProvider`（内联 HTML） | 消除重复 |
| 5 | neko-assets 实现按需 Asset Manager 侧边栏 | 社区/模型/shader 管理 |

### 8.5 各 Webview 职责边界（最终状态）

```
neko-cut webview
├── CustomEditor: 时间线 + 预览（主编辑区）
└── WebviewView: 属性面板（侧边栏）
    （不再有独立资产面板）

neko-canvas webview
├── CustomEditor: 无限画布（主编辑区）
    （不再有独立资产面板）

neko-agent webview
└── WebviewView: AI 助手（侧边栏）

neko-preview webview
├── CustomEditor: 视频播放器
└── CustomEditor: 音频播放器

neko-assets（新增）
├── FileDecorationProvider: Explorer 目录树增强
├── 右键菜单 + 拖拽协议: 统一资产操作
└── WebviewView: Asset Manager 侧边栏（按需出现）
    ├── Community tab: 社区资产搜索/安装
    ├── Models tab: AI 模型管理
    ├── Shaders tab: Shader 预览/管理
    └── Presets tab: 预设/LUT/模板
```

---

## 9. 关键接口

### 7.1 AssetRegistry（统一注册表）

```typescript
interface IAssetRegistry {
  // CRUD
  register(manifest: AssetManifest): Promise<string>;
  unregister(id: string): Promise<void>;
  update(id: string, patch: Partial<AssetManifest>): Promise<void>;

  // query
  get(id: string): Promise<AssetManifest | undefined>;
  query(filter: AssetQuery): Promise<AssetManifest[]>;
  search(text: string, types?: AssetType[]): Promise<AssetManifest[]>;

  // events
  onDidChange: vscode.Event<AssetChangeEvent>;

  // lifecycle (delegated to handlers)
  install(source: AssetSource): Promise<string>;
  uninstall(id: string): Promise<void>;
}
```

### 7.2 AssetResolver（路径解析）

```typescript
interface IAssetResolver {
  // resolve asset ID to actual file path or URL
  resolve(id: string): Promise<string>;

  // resolve with specific version
  resolveVersion(id: string, version: string): Promise<string>;

  // get webview-safe URI
  resolveForWebview(id: string, webview: vscode.Webview): Promise<vscode.Uri>;
}
```

### 7.3 IAssetHandler（类型特化处理）

```typescript
interface IAssetHandler<T extends AssetType = AssetType> {
  type: T;

  // validate asset before registration
  validate(path: string): Promise<ValidationResult>;

  // extract type-specific metadata
  extractMetadata(path: string): Promise<AssetMetadata>;

  // generate preview/thumbnail
  generatePreview(id: string): Promise<string | undefined>;

  // type-specific lifecycle
  onInstall?(id: string): Promise<void>;
  onUninstall?(id: string): Promise<void>;
  onUpdate?(id: string, oldVersion: string): Promise<void>;
}
```

---

## 附录：关键约束

| 约束 | 原因 | 影响 |
|------|------|------|
| Webview 无 Node.js | VSCode 安全沙箱 | 缩略图/元数据提取必须在 Extension Host |
| AI 模型 GB 级 | 存储和网络成本 | 必须懒加载 + 缓存管理 |
| Shader 需要热重载 | 编辑体验 | ShaderHandler 需要 file watcher |
| 多包共享资产库 | 避免重复 | AssetRegistry 必须是单例服务 |
| Git LFS 大文件 | 版本控制 | 媒体文件需要 LFS 策略 |

---

*基于 2026-02-25 代码分析*
