# ADR: 创作成品管理 — 声明式 Manifest + 导出编排 + CLI 无头渲染

## 状态

Proposed (2026-05-27)

## 关联 ADR

| 关联文档 | 关系 |
|---|---|
| [format-strategy.md](./format-strategy.md) | nk* 格式体系 + Format SDK + JSON Schema SSOT — 本 ADR 在其上层增加成品声明与编排 |
| [adr-asset-federation.md](./adr-asset-federation.md) | 素材联邦管理输入侧资产；本 ADR 管理输出侧成品，两者通过 AssetManifest 共享元数据契约 |
| [agent-media-architecture.md](./agent-media-architecture.md) | Agent 生成物落盘 + JSON 引用；成品管理将 Agent 产出纳入统一记录 |
| [adr-engine-interface-pipeline-decoupling.md](./adr-engine-interface-pipeline-decoupling.md) | 引擎管线解耦为 CLI 无头渲染提供基础 |
| [marketplace.md](./marketplace.md) | Market 分发协议；成品管理的发布管线对接 Market 上传 |
| [adr-structured-data-persistence.md](./adr-structured-data-persistence.md) | SQLite 缓存层可索引成品记录 |
| [vscode-constraints.md](./vscode-constraints.md) | Webview 沙盒约束 — 导出 UI 在 Webview，实际 I/O 在 Extension/Engine |

---

## 1. 背景

### 1.1 用户创作产品形式光谱

Neko Suite 用户的创作横跨 7 个编辑器，最终交付物覆盖 6 大类：

| 类别 | 产品形式 | 来源模块 | 典型交付场景 |
|------|---------|---------|------------|
| **影视成片** | 短视频/长视频/MV/预告片/片头 | neko-cut | 社交媒体/流媒体/院线 |
| **音频成品** | 配乐/音效/播客/有声书/混音母带 | neko-audio | 音乐平台/播客平台/影视配音 |
| **静态图像** | 海报/封面/分镜/概念图/漫画单页 | neko-canvas, neko-sketch | 印刷/社交媒体封面/游戏素材 |
| **角色资产** | 2D Live2D 模型/3D 角色/VRM | neko-puppet, neko-model | 虚拟主播/游戏引擎/动画制作 |
| **动画片段** | 2D 骨骼动画/3D 动作/表情序列 | neko-puppet, neko-model | 游戏引擎/视频合成/虚拟直播 |
| **剧本文档** | 分场景剧本/对白本/分镜脚本 | neko-story | 影视前期/动画前期 |

### 1.2 用户的创作流是多模块协作的

```
剧本 ──→ 分镜画布 ──→ 角色建模/绘画 ──→ 动画/动作 ──→ 视频剪辑 ──→ 音频混音
(story)   (canvas)     (model/sketch)    (puppet)      (cut)        (audio)
   │         │              │                │            │             │
   ▼         ▼              ▼                ▼            ▼             ▼
 脚本文档   分镜图/海报   角色立绘/模型    角色动画     成片视频      音轨/配乐
```

一个完整作品（如一部短片）的交付物可能包含：成片视频（多码率）+ 配乐音频 + 封面海报 + 缩略图 + 角色资产包 + 剧本 PDF。这些产出分散在不同模块，**当前没有统一的"作品"概念将它们关联起来**。

### 1.3 当前导出能力的碎片化现状

| 模块 | 导出服务 | 导出格式 | 跟踪能力 | CLI 支持 |
|------|---------|---------|---------|---------|
| neko-cut | `ExportService` (FIFO queue) | MP4/MOV/WebM/MKV/AVI/TS × H.264/H.265/VP9/AV1/ProRes | Job 级进度+性能指标 | ✅ `timelines export` |
| neko-audio | `audios mix-export` (engine) | WAV/MP3/AAC/FLAC/Opus | 无 | ✅ `audios mix-export` |
| neko-canvas | `artboardExport` (DOM) | PNG/SVG | 无 | ❌ 纯 Webview 侧 |
| neko-sketch | spritesheet/SVG export | PNG+JSON/SVG | 无 | ❌ 纯 Webview 侧 |
| neko-puppet | `PuppetAssetExportService` | ZIP bundle (model/motions/config) | Manifest 元数据 | ❌ |
| neko-model | `ModelAssetExportService` | .nkma/.nkmc/GLB | Manifest 元数据 | ✅ `scenes export-gltf` |
| neko-story | Fountain 文本 | .fountain | 无 | ❌ |
| neko-live | `RecordingService` | WebM(VP9) + WAV | 时间戳文件名 | ❌ |

**关键发现**：
- 每个模块各自管理导出路径和生命周期，**输出后文件散落各处**
- 无法描述"一个作品由哪些成品组成"
- 无法批量重新渲染（换分辨率/换编码/换平台制式）
- 跨模块无法编排（先渲染动画 → 合成视频 → 混音）
- 导出记录无法关联回项目版本（仅时间戳，无 git SHA）
- 社交媒体/流媒体平台需要同一内容的多种制式（横屏/竖屏/缩略图套件），当前只能手动逐个导出

### 1.4 host-cli 已有的无头渲染能力

Rust engine 的 `host-cli` crate 已实现命令行入口，当前支持：

```bash
# 视频导出（已实现，含 progress bar）
neko-engine timelines export -i project.nkv -o output.mp4 \
  --codec h264 --bitrate 5000000 --preset medium --hw-encoder auto

# 音频混音导出（已实现）
neko-engine audios mix-export -i project.nka --options '{"output":"mix.wav"}'

# 3D 场景导出（已实现）
neko-engine scenes export-gltf --id scene-1 --options '{"output":"model.glb"}'

# 画布合成（已实现）
neko-engine canvas export --options '{"output":"poster.png"}'
```

**这意味着引擎的无头渲染管线已具备基础能力**，缺少的是上层的声明式编排和统一成品管理。

---

## 2. 核心问题

### 2.1 三个层次的需求

```
Level 1 — 成品声明：用户的创作项目应产出哪些成品？以什么规格？
Level 2 — 导出编排：多个模块的导出如何协调顺序和依赖？
Level 3 — 渲染执行：同一声明在 VSCode 交互/本地 CLI/云端 CI 三种环境下均可执行
```

### 2.2 不变量

```
INV-1: 成品清单（DeliverableManifest）是声明式 JSON，可 git 版本控制
INV-2: 每个模块的 ExportService 保持现有职责不变，成品管理是上层编排
INV-3: host-cli 是无头渲染的唯一入口，不引入第二个 CLI 工具
INV-4: 成品记录（DeliverableRecord）必须关联到源项目文件 + git SHA（如可用）
INV-5: 成品管理不拥有渲染逻辑，仅编排调度 + 记录元数据
```

---

## 3. 设计

### 3.1 概念模型

```
DeliverableManifest (.nkdeliverables)
│   声明一个作品的所有成品及其导出规格
│
├── DeliverableEntry[]
│   │   每个 entry 描述一个成品产出
│   │
│   ├── source: 源项目文件路径 (.nkv/.nka/.nkc/.nks/.nkp/.nkm/.fountain)
│   ├── kind: 成品类型 (video/audio/image/animation/model/document)
│   ├── profile: 导出预设引用 (ExportProfileId)
│   └── outputPath?: 输出路径模板（支持变量展开）
│
├── ExportProfile
│   │   可复用的导出预设（编码/分辨率/质量参数集合）
│   │
│   ├── 内建预设 (social-media-1080p / master-4k / web-720p / ...)
│   ├── 用户预设 (存储在 .nkdeliverables 或 .neko/profiles/)
│   └── 平台预设 (youtube-short / tiktok / bilibili / podcast / ...)
│
└── DeliverableRecord
    │   每次导出的产出记录（不在 manifest 中，在 .neko/deliverables/ 下）
    │
    ├── outputPath, fileSize, checksum (SHA-256)
    ├── sourceProject, sourceVersion (git SHA)
    ├── profile, duration, codec
    ├── exportedAt, exportDuration (渲染耗时)
    └── executor: 'vscode' | 'cli' | 'ci'
```

### 3.2 DeliverableManifest 文件格式

文件名：`.nkdeliverables`（项目根目录，git 版本控制）

```jsonc
{
  "$schema": "https://neko-suite.dev/schemas/nkdeliverables.v1.json",
  "version": "1.0.0",
  "name": "EP01-预告片",
  "description": "第一集预告片全套交付物",

  // 导出预设定义（可选，也可引用全局预设）
  "profiles": {
    "bilibili-1080p": {
      "kind": "video",
      "container": "mp4",
      "videoCodec": "h264",
      "audioCodec": "aac",
      "width": 1920,
      "height": 1080,
      "fps": 60,
      "videoBitrate": 8000000,
      "audioBitrate": 192000,
      "quality": "high",
      "hwEncoder": "auto"
    },
    "youtube-4k": {
      "kind": "video",
      "container": "mp4",
      "videoCodec": "h265",
      "audioCodec": "aac",
      "width": 3840,
      "height": 2160,
      "fps": 60,
      "videoBitrate": 35000000,
      "audioBitrate": 320000,
      "quality": "high",
      "hwEncoder": "auto"
    },
    "podcast-flac": {
      "kind": "audio",
      "format": "flac",
      "sampleRate": 48000,
      "channels": "stereo"
    },
    "poster-4k": {
      "kind": "image",
      "format": "png",
      "width": 3840,
      "height": 2160,
      "pixelRatio": 2
    },
    "youtube-thumb": {
      "kind": "image",
      "format": "jpeg",
      "width": 1280,
      "height": 720,
      "quality": 90
    }
  },

  // 成品清单
  "deliverables": [
    {
      "id": "main-video-bilibili",
      "name": "B站正片",
      "kind": "video",
      "source": "./ep01.nkv",
      "profile": "bilibili-1080p",
      "outputPath": "./output/ep01-bilibili.mp4"
    },
    {
      "id": "main-video-youtube",
      "name": "YouTube 4K",
      "kind": "video",
      "source": "./ep01.nkv",
      "profile": "youtube-4k",
      "outputPath": "./output/ep01-youtube-4k.mp4"
    },
    {
      "id": "ost",
      "name": "原声音轨",
      "kind": "audio",
      "source": "./ep01-ost.nka",
      "profile": "podcast-flac",
      "outputPath": "./output/ep01-ost.flac"
    },
    {
      "id": "cover",
      "name": "封面海报",
      "kind": "image",
      "source": "./ep01-cover.nkc",
      "profile": "poster-4k",
      "outputPath": "./output/ep01-cover.png"
    },
    {
      "id": "thumbnail",
      "name": "YouTube 缩略图",
      "kind": "image",
      "source": "./ep01.nkv",
      "profile": "youtube-thumb",
      "outputPath": "./output/ep01-thumb.jpg",
      // 视频成品的特殊参数：指定帧
      "options": { "timestamp": 3.5 }
    },
    {
      "id": "character-pack",
      "name": "角色资产包",
      "kind": "model",
      "source": "./characters/hero.nkp",
      "profile": "spine-export",
      "outputPath": "./output/hero-character.zip"
    }
  ],

  // 编排依赖（可选）
  "orchestration": {
    "order": [
      // 并行组：同时渲染
      ["main-video-bilibili", "main-video-youtube", "ost"],
      // 串行：封面依赖视频渲染完成（如需要从视频抽帧）
      ["cover", "thumbnail"],
      // 最后打包
      ["character-pack"]
    ]
  }
}
```

### 3.3 ExportProfile 类型体系

```
ExportProfile (联合类型)
├── VideoExportProfile    — 视频导出参数
├── AudioExportProfile    — 音频导出参数
├── ImageExportProfile    — 图像导出参数
├── AnimationExportProfile — 动画资产导出参数
├── ModelExportProfile    — 3D 模型导出参数
└── DocumentExportProfile — 文档导出参数
```

**与现有类型的关系**：

- `VideoExportProfile` 是 `ExportPresetSettings`（exportProtocol.ts）的超集，增加 `hwEncoder` / `zeroCopy` / `preset` 等 CLI 级参数
- `AudioExportProfile` 对齐 `MixdownConfig`（nka_loader.rs）
- `ImageExportProfile` 新增，覆盖 PNG/JPEG/SVG/WebP + 分辨率 + 色彩空间
- 内建预设通过 `isBuiltin: true` 标记，与现有 `ExportPreset` 兼容

### 3.4 DeliverableRecord

每次导出产生一条记录，存储在 `.neko/deliverables/records/` 下：

```jsonc
// .neko/deliverables/records/2026-05-27T14-30-00Z-main-video-bilibili.json
{
  "deliverableId": "main-video-bilibili",
  "manifestVersion": "1.0.0",
  "source": {
    "projectFile": "./ep01.nkv",
    "projectVersion": "2.0",
    "gitSha": "a1b2c3d4",        // git HEAD at export time (null if not in git)
    "gitBranch": "main",
    "gitDirty": false             // working tree had uncommitted changes
  },
  "output": {
    "path": "./output/ep01-bilibili.mp4",
    "fileSize": 157286400,
    "checksum": "sha256:abcdef...",
    "duration": 180.5,            // seconds (video/audio only)
    "codec": "h264",
    "container": "mp4",
    "resolution": "1920x1080",
    "fps": 60
  },
  "execution": {
    "executor": "cli",            // 'vscode' | 'cli' | 'ci'
    "startedAt": "2026-05-27T14:30:00Z",
    "completedAt": "2026-05-27T14:35:42Z",
    "exportDuration": 342000,     // ms
    "hwEncoder": "videotoolbox",
    "platform": "darwin-arm64",
    "engineVersion": "0.0.1"
  },
  "profile": "bilibili-1080p"
}
```

### 3.5 三种执行环境

```
                    .nkdeliverables（声明式，git 版本控制）
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        本地交互渲染      本地 CLI 渲染    云端 CI 渲染
        (VSCode 内)     (neko-engine)    (GitHub Actions)
              │               │               │
              │               │               │
  ┌───────────┴──┐    ┌──────┴──────┐  ┌─────┴──────────┐
  │ Extension    │    │ host-cli    │  │ Docker          │
  │ DeliverableService │ deliverables│  │ neko-engine     │
  │ → ExportService    │ render      │  │ deliverables    │
  │ → AudioMixdown     │ subcommand  │  │ render          │
  │ → artboardExport   │             │  │                 │
  └──────────────┘    └─────────────┘  └────────────────┘
              │               │               │
              ▼               ▼               ▼
        DeliverableRecord（统一产出记录）
```

#### 3.5.1 VSCode 交互渲染

用户在编辑器内通过 UI 触发导出：

```
DeliverablePanel (Webview)
  → postMessage('deliverables:render', { ids: ['main-video-bilibili'] })
  → Extension: DeliverableService.render()
  → 读取 .nkdeliverables
  → 根据 kind 分派到对应模块 ExportService
  → 进度回传到 Webview
  → 完成后写入 DeliverableRecord
```

#### 3.5.2 本地 CLI 无头渲染

```bash
# 渲染全部成品
neko-engine deliverables render -i .nkdeliverables

# 渲染指定成品
neko-engine deliverables render -i .nkdeliverables --ids main-video-bilibili,ost

# 渲染并指定输出目录（覆盖 manifest 中的 outputPath）
neko-engine deliverables render -i .nkdeliverables --output-dir ./release/

# 查看成品清单
neko-engine deliverables list -i .nkdeliverables

# 验证成品完整性（校验 checksum）
neko-engine deliverables verify -i .nkdeliverables --records .neko/deliverables/records/
```

**host-cli 扩展**：在现有 `Command` 枚举中新增 `Deliverables` 子命令：

```rust
// args.rs — 新增
Deliverables {
    #[command(subcommand)]
    action: DeliverableAction,
},

define_actions!(DeliverableAction {
    /// Render deliverables from manifest
    Render => "render",
    /// List deliverables in manifest
    List => "list",
    /// Verify rendered outputs against records
    Verify => "verify",
});
```

`Render` action 的执行流程：
1. 解析 `.nkdeliverables` JSON
2. 按 `orchestration.order` 确定执行顺序（无声明则全部并行）
3. 对每个 entry，根据 `kind` 映射到现有 action：
   - `video` → `timelines:export_enqueue`
   - `audio` → `audios:mix_export`
   - `image` → `canvas:export` 或 `images:capture`
   - `model` → `scenes:export_gltf`
4. 轮询进度，输出 progress bar
5. 完成后计算 checksum，写入 DeliverableRecord

#### 3.5.3 CI/CD 云端渲染

```yaml
# .github/workflows/render.yml
name: Render Deliverables

on:
  push:
    tags: ['render-*']
  workflow_dispatch:
    inputs:
      deliverable_ids:
        description: 'Comma-separated deliverable IDs (empty = all)'
        required: false

jobs:
  render:
    runs-on: ubuntu-latest  # or self-hosted with GPU
    steps:
      - uses: actions/checkout@v5
        with:
          lfs: true  # media assets may be in LFS

      - name: Download neko-engine
        uses: actions/download-artifact@v6
        with:
          name: neko-engine-linux-x64
          path: ./bin/

      - name: Render deliverables
        run: |
          chmod +x ./bin/neko-engine
          ./bin/neko-engine deliverables render \
            -i .nkdeliverables \
            --output-dir ./release/ \
            ${{ inputs.deliverable_ids && format('--ids {0}', inputs.deliverable_ids) || '' }}

      - name: Upload rendered artifacts
        uses: actions/upload-artifact@v6
        with:
          name: deliverables-${{ github.sha }}
          path: ./release/

      - name: Attach to release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: ./release/*
```

### 3.6 ExportProfile 预设体系

```
预设来源（优先级从高到低）：
1. .nkdeliverables 内联 profiles       — 项目级
2. .neko/profiles/*.json               — 工作区级
3. ~/.neko/profiles/*.json             — 用户级
4. 内建预设 (BUILTIN_PROFILES)          — 引擎内置
```

**内建预设清单**（覆盖主流平台/场景）：

| ID | 类别 | 规格 |
|----|------|------|
| `social-1080p60` | 视频-社交 | 1080p 60fps H.264+AAC MP4, 8Mbps |
| `social-vertical` | 视频-竖屏 | 1080x1920 60fps H.264+AAC MP4, 6Mbps |
| `web-720p30` | 视频-Web | 720p 30fps VP9+Opus WebM, 2Mbps |
| `master-4k` | 视频-母版 | 4K 60fps H.265+AAC MOV, 35Mbps |
| `prores-master` | 视频-专业 | 4K 60fps ProRes+PCM MOV |
| `audio-master-wav` | 音频-母版 | 48kHz 24bit WAV |
| `audio-master-flac` | 音频-母版 | 48kHz FLAC |
| `audio-podcast` | 音频-播客 | 48kHz 192kbps MP3 |
| `audio-web-opus` | 音频-Web | 48kHz 128kbps Opus |
| `image-poster-4k` | 图像-海报 | 3840×2160 PNG 2x DPI |
| `image-thumb-hd` | 图像-缩略图 | 1280×720 JPEG q90 |
| `image-social-cover` | 图像-封面 | 1200×630 PNG (OG) |
| `spine-json` | 动画-Spine | Spine 4.1 JSON + atlas |
| `lottie-web` | 动画-Lottie | Lottie JSON (受限) |
| `spritesheet-4k` | 动画-序列帧 | 4096×4096 PNG atlas + JSON |
| `glb-standard` | 模型-GLB | glTF Binary, Draco 压缩 |
| `vrm-avatar` | 模型-VRM | VRM 1.0 |
| `pdf-script` | 文档-剧本 | A4 PDF, Fountain 排版 |

### 3.7 产品形式扩展方向

当前格式覆盖了基础创作需求。以下是用户可能需要的扩展方向以及 Manifest 如何支持：

| 扩展方向 | 所需能力 | Manifest 支持方式 |
|---------|---------|-----------------|
| **漫画/条漫** | 多页 Canvas → 有序图像序列 → PDF/WebP 拼接 | `kind: 'document'`, profile 增加 `pages` 参数，Canvas 多 artboard 按序导出 |
| **GIF/APNG 动图** | 短视频/动画 → 帧序列 → 动图编码 | `kind: 'image'`, profile `format: 'gif' \| 'apng'`, 新增帧率/循环参数 |
| **Spine/Lottie 运行时动画** | Puppet 骨骼 → 游戏引擎格式 | `kind: 'animation'`, 对接 PuppetAssetExportService 的 Spine JSON 导出 |
| **多码率 HLS/DASH** | 同一视频 → 自适应流媒体包 | `kind: 'video'`, profile 增加 `adaptiveStreaming` 参数，引擎侧多码率编码 + 分片 |
| **字幕文件** | 时间线文本轨 → SRT/ASS/VTT | `kind: 'document'`, 新增 subtitle profile |
| **Live2D 运行时包** | Puppet → MOC3 + 物理 + 表情 bundle | `kind: 'model'`, profile 对接 PuppetAssetExportService |
| **项目归档** | 工程+素材+成品+元数据 → ZIP/tar | `kind: 'archive'`, 新增 ArchiveExportProfile |

这些扩展通过新增 ExportProfile 子类型和对应的 engine action 实现，**不改变 Manifest 结构**。

### 3.8 成品管理面板（VSCode 侧）

```
┌──────────────────────────────────────────────────┐
│ Deliverables: EP01-预告片            [Render All] │
├──────────────────────────────────────────────────┤
│ ○ B站正片         ep01.nkv → bilibili-1080p      │
│   └ 上次: 2026-05-27 14:35 · 150MB · a1b2c3d    │
│ ○ YouTube 4K      ep01.nkv → youtube-4k          │
│   └ 未渲染                                       │
│ ● 原声音轨        ep01-ost.nka → podcast-flac    │  ← 渲染中 [██████░░░░] 65%
│ ○ 封面海报        ep01-cover.nkc → poster-4k     │
│ ○ 缩略图          ep01.nkv → youtube-thumb       │
│ ○ 角色资产包      hero.nkp → spine-export        │
├──────────────────────────────────────────────────┤
│ Records: 3 rendered · 1 outdated · 2 pending     │
└──────────────────────────────────────────────────┘
```

**面板功能**：
- 展示 .nkdeliverables 中的所有 entry
- 每个 entry 显示最新 DeliverableRecord 状态
- "Outdated" 检测：源项目 git SHA 与记录中的不一致
- 右键菜单：Render / Render All / Open Output / Show Record / Reveal in Explorer
- 可选择使用 VSCode TreeView（原生 UI）或 Webview Panel

**不建 Webview，使用原生 VSCode UI**：成品管理面板是信息展示+操作触发，非创作表面，适合 TreeView + QuickPick + StatusBar 组合（对齐 adr-device-management.md 裁定）。

---

## 4. 层归属

| 新增概念 | 归属层 | 职责 |
|---------|-------|------|
| `DeliverableManifest` (schema + types) | L0 `@neko/shared` | Manifest JSON Schema + TS 类型 + 验证器 |
| `ExportProfile` (types + builtin presets) | L0 `@neko/shared` | 导出预设类型 + 内建预设常量 |
| `DeliverableRecord` (types) | L0 `@neko/shared` | 产出记录类型 |
| `DeliverableService` | Extension Bridge (`neko-tools` 或新包) | 编排多模块导出、管理 Record、面板 UI |
| `DeliverableAction` (CLI subcommand) | Rust `host-cli` | 无头渲染入口 |
| `DeliverableOrchestrator` (Rust) | Rust `host-api` | 解析 Manifest → 分派到现有 controller |
| Deliverables TreeView | Extension UI | 原生 VSCode TreeView 展示成品清单 |

**不新建独立包**——类型放 `@neko/shared`，Extension 服务放 `neko-tools`（工具箱定位），CLI 放 `host-cli`。

---

## 5. 与现有系统的集成

### 5.1 与现有 ExportService 的关系

```
现有:
  neko-cut ExportService → timelines:export_enqueue → 视频文件

新增:
  DeliverableService
    → 读取 .nkdeliverables
    → 对每个 entry 调用对应模块的 ExportService
    → ExportService 行为完全不变
    → DeliverableService 收集结果 → 写 DeliverableRecord
```

**零侵入**：现有 ExportService 不需要知道 DeliverableManifest 的存在。

### 5.2 与 Format SDK 的关系

`.nkdeliverables` 作为新的 nk* 格式加入 Format SDK 管线：

```
format-strategy.md 补充:
  .nkdeliverables | Neko Deliverables | neko-tools | 成品声明清单
```

Schema 验证、版本迁移遵循 Format SDK 既有模式（JSON Schema + 手写验证器）。

### 5.3 与 Asset Federation 的关系

- **输入侧**：Asset Federation 管理创作素材（视频/音频/图片/模型源文件）
- **输出侧**：Deliverable Management 管理导出成品
- **交叉点**：角色资产包（.nkentity）既是某个项目的成品，也可能是另一个项目的输入素材。通过 AssetManifest 共享元数据格式，DeliverableRecord 增加 `assetManifest?: AssetManifest` 可选字段，导出的资产包可直接注册到素材库。

### 5.4 与 Structured Data Persistence (SQLite) 的关系

DeliverableRecord 是 Tier 1 数据（关系清晰、查询频繁），适合索引到 SQLite：

```sql
CREATE TABLE deliverable_records (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL,
  source_project TEXT NOT NULL,
  source_git_sha TEXT,
  output_path TEXT NOT NULL,
  file_size INTEGER,
  checksum TEXT,
  exported_at TEXT NOT NULL,
  profile TEXT NOT NULL,
  executor TEXT NOT NULL
);
CREATE INDEX idx_deliverable_source ON deliverable_records(source_project, source_git_sha);
```

但 SQLite ADR 处于 Proposed 阶段，DeliverableRecord 先以 JSON 文件存储（`.neko/deliverables/records/`），后续可迁入。

---

## 6. 迁移路径

### Phase 0: 契约层（~3d）

| PR | 内容 |
|----|------|
| PR1 | `@neko/shared` 新增 `deliverables/` 目录：`DeliverableManifest` / `DeliverableEntry` / `ExportProfile` (联合类型) / `DeliverableRecord` 类型定义 + JSON Schema + 验证器 |
| PR2 | `@neko/shared` 新增 `BUILTIN_EXPORT_PROFILES` 常量（18 个内建预设），对齐现有 `ExportPresetSettings` |
| PR3 | `format-strategy.md` 补充 `.nkdeliverables` 格式条目 |

### Phase 1: CLI 无头渲染（~5d）

| PR | 内容 |
|----|------|
| PR4 | `host-cli/args.rs` 新增 `Deliverables` 子命令（render/list/verify） |
| PR5 | `host-api` 新增 `DeliverableOrchestrator`：解析 Manifest → 按 orchestration 排序 → 分派到现有 controller action → 收集结果 → 写 Record JSON |
| PR6 | `host-cli/runner.rs` 集成 `DeliverableOrchestrator`，实现 `deliverables render` 进度输出（复用现有 progress bar） |
| PR7 | CLI 集成测试：用样例 `.nkdeliverables` + 最小 `.nkv`/`.nka` 运行 render → 验证产出文件 + Record |

### Phase 2: VSCode 面板（~4d）

| PR | 内容 |
|----|------|
| PR8 | `neko-tools` Extension 新增 `DeliverableService`：读取/监听 `.nkdeliverables`，调用各模块 ExportService，写 Record |
| PR9 | `neko-tools` 新增 `DeliverableTreeView`（原生 VSCode TreeView）：展示清单 + 状态 + 右键操作 |
| PR10 | StatusBar 集成：渲染进度 + outdated 提示 |

### Phase 3: CI 模板 + 扩展预设（~3d）

| PR | 内容 |
|----|------|
| PR11 | `.github/workflows/render.yml` 模板 + 文档 |
| PR12 | 扩展预设：GIF/APNG、SRT 字幕、多码率 HLS 的 ExportProfile 子类型定义（实现 deferred） |
| PR13 | `deliverables verify` 子命令：校验 Record checksum vs 实际文件，检测 outdated（git SHA 不匹配） |

**总计 ~15d，13 PR**。

---

## 7. 当前不做的事

| 不做 | 原因 |
|------|------|
| 漫画/条漫排版引擎 | 需要专门的多页排版能力，超出 Manifest 编排范围 |
| 互动视频/分支剧情导出 | 需要交互运行时，非线性渲染管线 |
| 社交媒体 API 直传 | 第三方 API 集成复杂且易变，先导出文件，用户手动上传 |
| 多码率 HLS/DASH 实现 | 仅定义 Profile 类型，引擎侧分片编码 deferred |
| Webview 成品管理面板 | 信息展示用 TreeView 即可，不值得建 Webview |
| 实时协作渲染 | 多人同时编辑+渲染超出当前范围 |
| 增量渲染/缓存 | 仅变更部分重新渲染需要帧级依赖分析，复杂度过高 |

---

## 8. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Canvas/Sketch 导出依赖 Webview DOM，CLI 无法执行 | `kind: 'image'` 的 canvas/sketch 项目在 CLI 下失败 | P1 优先覆盖 engine 侧有能力的 kind（video/audio/model）；canvas/image 在 Phase 2+ 通过 engine `canvas:export` / `images:capture` 补全 |
| 大型项目 Manifest 中 entry 过多 | 渲染队列管理复杂 | `orchestration.order` 支持并行组 + 引擎现有 MAX_CONCURRENT 限制 |
| CI 环境无 GPU | 硬件加速编码不可用 | Profile 的 `hwEncoder: 'auto'` 自动 fallback 到 CPU；CI 可选 self-hosted GPU runner |
| 媒体素材未 commit / 未 LFS | CI 渲染找不到素材 | `deliverables verify` 预检 source 文件是否存在；文档建议 Git LFS |
| Manifest 格式演进 | 旧版 .nkdeliverables 不兼容 | Format SDK 管线：版本检测 + 迁移链 |

---

## 9. 附录

### 附录 A: host-cli 现有 action 与成品 kind 的映射

| Deliverable kind | host-cli action | 已实现 | 备注 |
|-----------------|----------------|-------|------|
| `video` | `timelines export` | ✅ | 完整，含 progress bar、codec/bitrate/preset/hw_encoder 参数 |
| `audio` | `audios mix-export` | ✅ | .nka → MixdownConfig → 混音输出 |
| `model` (GLB) | `scenes export-gltf` | ✅ | 3D 场景 → GLB |
| `model` (puppet) | — | ❌ | Puppet 导出在 TS Extension 侧，需新增 engine action 或 TS CLI 入口 |
| `image` (canvas) | `canvas export` | ✅ (action 已定义) | 需验证是否已实现 |
| `image` (capture) | `images capture` / `videos capture` | ✅ | 单帧截取 |
| `document` (PDF) | — | ❌ | Fountain → PDF 排版需新增 |
| `animation` (Spine) | — | ❌ | Puppet → Spine JSON 在 TS 侧 |

### 附录 B: 导出格式覆盖矩阵

| 格式 | 视频 | 音频 | 图像 | 动画 | 模型 | 文档 |
|------|:----:|:----:|:----:|:----:|:----:|:----:|
| MP4 | ✅ | — | — | — | — | — |
| MOV | ✅ | — | — | — | — | — |
| WebM | ✅ | — | — | — | — | — |
| MKV | ✅ | — | — | — | — | — |
| WAV | — | ✅ | — | — | — | — |
| MP3 | — | ✅ | — | — | — | — |
| AAC | — | ✅ | — | — | — | — |
| FLAC | — | ✅ | — | — | — | — |
| Opus | — | ✅ | — | — | — | — |
| PNG | — | — | ✅ | — | — | — |
| JPEG | — | — | ✅ | — | — | — |
| SVG | — | — | ✅ | — | — | — |
| GIF | — | — | P2 | P2 | — | — |
| WebP | — | — | P2 | — | — | — |
| Spine JSON | — | — | — | P2 | — | — |
| Lottie JSON | — | — | — | P3 | — | — |
| Spritesheet | — | — | — | ✅ | — | — |
| GLB | — | — | — | — | ✅ | — |
| VRM | — | — | — | — | P2 | — |
| ZIP bundle | — | — | — | — | ✅ | — |
| PDF | — | — | — | — | — | P2 |
| SRT/VTT | — | — | — | — | — | P2 |
| Fountain | — | — | — | — | — | ✅ |

### 附录 C: CLI 用例速查

```bash
# 查看成品清单
neko-engine deliverables list -i .nkdeliverables

# 渲染全部
neko-engine deliverables render -i .nkdeliverables

# 仅渲染视频成品
neko-engine deliverables render -i .nkdeliverables --ids main-video-bilibili,main-video-youtube

# 覆盖输出目录
neko-engine deliverables render -i .nkdeliverables --output-dir ./release/

# 验证已渲染成品完整性
neko-engine deliverables verify -i .nkdeliverables

# CI: dry-run（仅检查 source 文件是否存在）
neko-engine deliverables render -i .nkdeliverables --dry-run

# 查看单个成品的最新 Record
neko-engine deliverables status -i .nkdeliverables --id main-video-bilibili
```
