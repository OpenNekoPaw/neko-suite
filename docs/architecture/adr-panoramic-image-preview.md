# ADR: 全景图片预览能力 (Panoramic Image Preview)

> 状态：**Proposed (2026-04-25)**
> 关联：[document-preview.md](./document-preview.md) · [format-strategy.md](./format-strategy.md) · [agent-media-architecture.md](./agent-media-architecture.md) · [model-runtime.md](./model-runtime.md)

---

## 一、背景与动机

neko-preview 目前覆盖视频 (H.264 + PCM + fMP4)、音频、文档 (PDF/EPUB/CBZ/DOCX/XLSX/PPTX) 三类预览，**没有专门的图片预览路径**——普通图片借由 VSCode 内置图片预览或 Document Viewer 间接处理。随着以下趋势出现，"全景 / 360° / HDRI 图片"作为一类**有独立交互需求的素材**，已具备纳入 neko-preview 的价值。

### 1.1 来自创作侧的需求

| 来源 | 现状 | 与全景图的耦合点 |
|------|------|------------------|
| **AI 图像生成** ([agent-media-architecture.md](./agent-media-architecture.md)) | `MediaGenerationService` + Provider Registry，已支持 OpenAI / Luma / Runway 等多 Provider；`GeneratedAsset` 落盘 | 多家 Provider (Skybox AI / Blockade Labs / Luma) 直接产出 equirectangular 全景图；目前预览这类产物会被当成普通宽幅图片，无法球面浏览 |
| **3D 场景** ([3D capabilities](../../CLAUDE.md)) | `runtime-scene` (bevy_ecs) + `engine-kernel` 已实现 IBL（`Environment` 含 skybox cubemap / irradiance / prefilter / BRDF LUT） | 3D 编辑器需要 HDRI 作为环境贴图与天空盒；预览阶段就能"试装"是创作闭环的关键 |
| **2D 创作** | neko-sketch / neko-puppet 偶发产出 360° 背景 | 暂不强需求，视为 Phase 2 |
| **VR / 沉浸式叙事** | neko-story 屏幕剧本目前仅二维 | 长期路线（≥ 2027 Q1），不在本 ADR 范围 |

### 1.2 当前缺口

1. **无球面渲染路径**：webview 现有 GPU 渲染管线只服务于视频帧调度（`VideoPlayer.tsx` H.264 → Canvas），没有 sphere mesh / equirect shader。
2. **无投影类型识别**：`MediaInfo` 只暴露 `width/height/codec/duration` 等线性媒体字段，没有 `projectionType` / `isPanoramic` / `xmpGPano` 元数据。
3. **不接通 3D**：neko-model 当前 R3F 视口未挂 `<Environment>`，无 HDRI 加载入口；预览到 3D 的"使其成为天空盒" Send-to 通路不存在。
4. **AI 产物盲区**：`ImageGenerationRequest` 无 `panoramic?: boolean` / `projection?: 'equirectangular' | 'cubemap'` 字段；`MediaOutput` 也没有 projection 元数据，全景信息丢失在生成 → 落盘 → 预览之间。

### 1.3 为什么不直接用社区扩展？

- VSCode Marketplace 现有 360° 图片预览扩展极少 (`vscode-pano` / `Panorama Viewer` 之类) 且年久失修，无 HDR 支持，无法集成进 neko 跨扩展协议。
- 我们需要"预览 → 3D 天空盒"、"预览 → AI 重生成"等横向闭环，第三方扩展无法满足。
- 已有 wgpu cubemap 与 IBL 基础设施 ([engine-kernel/.../environment.rs](../../packages/neko-engine/packages/engine-kernel/src/gpu/scene_renderer/)) 可被复用，自建成本可控。

---

## 二、使用场景 (User Scenarios)

### 场景 A：AI 生成天空盒 → 预览 → 装入 3D 场景

```
neko-agent 调用 Skybox AI Provider
  → 产出 4096×2048 equirectangular HDR (.hdr)
  → MediaPreprocessor 落盘到 .neko/assets/.../skybox-xxx.hdr
  → 用户在资源面板双击
  → neko-preview 球面查看器（拖拽环视、滚轮缩放、信息条）
  → 右键 "Use as Environment in neko-model"
  → neko-model R3F <Environment> 自动加载，作为 IBL + skybox
```

### 场景 B：第三方 HDRI 资产管理

用户从 Poly Haven / HDRI-Haven 下载 `.hdr` / `.exr` 拖入工作区。预览界面应：
1. 自动识别 equirectangular（2:1 比例 + EXIF/XMP 提示）。
2. 提供球面 / 平面 / cubemap 展开三种查看模式切换。
3. 显示色调映射 (Reinhard / ACES / Linear)、曝光、伽马调整滑杆。

### 场景 C：移动端拍摄的 360° 照片

iPhone / Insta360 / Theta Z1 拍摄的 JPEG 携带 XMP `GPano` namespace。预览应识别并默认进入球面模式，否则容易被误判为奇怪宽高比的普通图。

### 场景 D：cubemap 六面图

来自游戏引擎导出的 `posx/negx/posy/negy/posz/negz` 六面图（或 cross / strip 布局）。Phase 2 范围。

### 场景 E：从预览反向触发 AI 修补

"提示词 → 生成 360° → 球面预览 → 圈选区域 → Send to neko-agent inpaint" —— 复用 neko-sketch 的 inpaint 能力，但作用在球面坐标上。Phase 3。

---

## 三、功能需求 (Functional Requirements)

### FR-1 投影类型识别

- **FR-1.1** 引擎 probe 必须返回 `projectionType: 'equirectangular' | 'cubemap-cross' | 'cubemap-strip' | 'flat' | 'unknown'`。
- **FR-1.2** 识别优先级：XMP `GPano:ProjectionType` → EXIF `ProjectionType` → 文件名约定 (`*_pano.jpg` / `*.hdr` / `*.exr`) → 宽高比启发式 (2:1 ± 1%)。
- **FR-1.3** 启发式不可独占决定权：必须允许用户在 UI 上手动覆盖 ("Treat as flat" / "Treat as 360°")。

### FR-2 球面查看器（Phase 1 核心）

- **FR-2.1** 鼠标拖拽改变球面相机朝向（yaw / pitch），滚轮调 FOV (30° ~ 120°)，双击复位。
- **FR-2.2** 渲染应 GPU 加速：webview 内 WebGL2 / WebGPU sphere mesh + equirect 采样 shader。**不**通过 CPU 像素映射。
- **FR-2.3** 支持 SDR (`.jpg/.png/.webp`) 与 HDR (`.hdr/.exr`)；HDR 必须暴露曝光 (-5 ~ +5 EV) 与色调映射算法选择。
- **FR-2.4** 信息条：宽高、文件大小、投影类型、HDR/SDR 标签、比特深度。
- **FR-2.5** 多视图模式切换：球面 (Sphere) / 等距柱状原图 (Flat) / 小行星 (Little Planet)；模式间无重新解码。

### FR-3 与 neko-model 的 Send-to 联动

- **FR-3.1** `NekoPreviewAPI` 增加 `sendToModelAsEnvironment(filePath: string): Promise<void>`。
- **FR-3.2** `NekoModelAPI` 暴露 `setEnvironment(spec: { filePath: string; intensity?: number; rotation?: number; useAsBackground?: boolean }): Promise<void>`。
- **FR-3.3** 预览右键菜单出现 "Use as Skybox in 3D" / "Use as IBL only"（背景透明、仅光照）。
- **FR-3.4** 若 neko-model 未激活：自动 `vscode.commands.executeCommand('neko.model.openWithEnvironment', filePath)`，新建匿名场景挂载。

### FR-4 与 neko-agent 的 Send-to 联动

- **FR-4.1** 预览右键 "Send to Agent" 携带投影元数据：
  ```typescript
  {
    type: 'image',
    filePath: '...',
    metadata: {
      projectionType: 'equirectangular',
      isHDR: true,
      width, height,
    }
  }
  ```
- **FR-4.2** 当 Agent 拿到 `projectionType: 'equirectangular'` 时，应允许在球面坐标系上选 ROI（Phase 3 起）。

### FR-5 AI 生成端字段补齐

- **FR-5.1** `ImageGenerationRequest` 增加：
  ```typescript
  panoramic?: {
    enabled: boolean;
    projection: 'equirectangular' | 'cubemap';
    fov?: number;        // 仅平面输出有意义
  };
  hdr?: boolean;
  ```
- **FR-5.2** `MediaOutput` 增加 `projectionType?` 字段；落盘时由 `MediaPreprocessor` 写入 sidecar JSON。
- **FR-5.3** Provider Adapter 不支持时应在 `capability.supportsPanoramic` 暴露 `false`，由 `ProviderRouter` 转选可用 Provider（依赖 [adr-provider-expression-context.md](./adr-provider-expression-context.md)）。

### FR-6 cubemap 支持（Phase 2）

- **FR-6.1** 识别 cross / strip / 6 个独立面三种布局。
- **FR-6.2** 引擎 (`engine-kernel`) 增加 `equirect_to_cubemap(equirect: Texture, face_size: u32) -> CubemapTexture` 计算 shader（已有 IBL 基础，复用纹理坐标变换）。
- **FR-6.3** webview 端等距柱状默认在浏览器侧渲染；cubemap 视图模式可选择 "Bake via engine"（出大尺寸 cubemap 时降低 webview 显存压力）。

---

## 四、非功能需求 (Non-Functional Requirements)

| 维度 | 指标 |
|------|------|
| **首帧延迟** | 4K equirectangular JPEG ≤ 800ms（M1 / M2 Mac），8K HDR ≤ 2.5s |
| **交互帧率** | 拖拽时 ≥ 55fps（4K 输入，FOV 75°，1080p 视口） |
| **显存占用** | 单张 4K equirect 不超过 80MB GPU；8K HDR 不超过 350MB；超阈值 mipmap 下采样 |
| **HDR 精度** | 至少 RGB16F 内部纹理；Tone mapping 在着色器内完成 |
| **可复用** | 球面查看器组件需可被 neko-model（环境贴图编辑）、neko-canvas（全景背景节点）复用 |
| **降级** | WebGPU 不可用时回退 WebGL2；WebGL2 不可用时回退 Flat 平面查看器 + 提示 |
| **可访问性** | 键盘箭头键控制视角，`Home` 复位，`+ / -` 缩放 |
| **国际化** | 使用 `@neko/shared` i18n，新增字符串走 `packages/neko-types/src/i18n/locales/{en,zh-cn}` |

---

## 五、格式与检测策略

### 5.1 文件类型矩阵

| 扩展名 | 比特深度 | 投影 | 默认查看器 | 备注 |
|--------|----------|------|------------|------|
| `.jpg / .jpeg` (XMP `GPano`) | 8 | equirectangular | Sphere | iPhone / Insta360 等典型来源 |
| `.png` (2:1) | 8 | equirectangular (启发式) | Sphere（需用户确认） | 启发式低置信度 |
| `.png / .jpg` (其他比例) | 8 | flat | 平面 | 不在本 ADR Phase 1 直接处理（走系统/已有图片预览） |
| `.hdr` (Radiance RGBE) | float | equirectangular | Sphere + Tone map | HDRI 主流格式 |
| `.exr` | float (16/32) | equirectangular / multi-layer | Sphere + Tone map | Phase 1.5：先支持单层 |
| `.cube / .ktx2 / .dds` | varies | cubemap | cubemap 展开 | Phase 2 |

### 5.2 检测层级

```
┌─────────────────────────────────────────────────┐
│ Layer A：扩展名 (.hdr/.exr 一律视为全景候选)     │  确定性高
├─────────────────────────────────────────────────┤
│ Layer B：XMP / EXIF GPano 命名空间                │  确定性高
├─────────────────────────────────────────────────┤
│ Layer C：宽高比启发 (2:1 ± 1%)                    │  确定性中（提示用户确认）
├─────────────────────────────────────────────────┤
│ Layer D：用户手动标记（持久化到 sidecar JSON）    │  权威
└─────────────────────────────────────────────────┘
```

引擎 probe 输出统一 schema：

```typescript
interface ImageProbeInfo extends MediaInfo {
  projectionType: 'equirectangular' | 'cubemap-cross' | 'cubemap-strip' | 'flat' | 'unknown';
  projectionConfidence: 'explicit' | 'heuristic' | 'user-set';
  isHDR: boolean;
  bitDepth: 8 | 16 | 32;
  colorSpace: 'sRGB' | 'Linear' | 'Rec.2020' | 'unknown';
  xmpGPano?: { croppedAreaImageWidthPixels?: number; /* ... */ };
}
```

### 5.3 sidecar 元数据

参考 [format-strategy.md](./format-strategy.md) 与 [agent-media-architecture.md](./agent-media-architecture.md)，全景投影信息写入资产同名 sidecar：

```
my-skybox.hdr
my-skybox.hdr.nkmeta.json   # { projectionType, hdr, generatedBy?, prompt?, ... }
```

`MediaPreprocessor` 在 AI 生成产物落盘时**强制**写 sidecar；外部导入时由 `nkmeta` Format SDK 按需生成。

---

## 六、架构集成

### 6.1 模块分层

```
┌─────────────────────────────────────────────────────────────┐
│ neko-preview / packages/webview                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ PanoramicViewer (新)                                     │ │
│ │  ├─ SphereRenderer (WebGL2/WebGPU equirect shader)       │ │
│ │  ├─ ToneMappingPanel (HDR only)                          │ │
│ │  ├─ ProjectionModeSwitch (Sphere / Flat / LittlePlanet)  │ │
│ │  └─ InfoBar                                              │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
            ▲                                ▲
            │ resolveCustomEditor            │ postMessage
            │                                │
┌─────────────────────────────────────────────────────────────┐
│ neko-preview / packages/extension                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ PanoramicImageProvider (新, CustomReadonlyEditorProvider)│ │
│ │  └─ 注册 viewType: 'neko.preview.panoramicImage'         │ │
│ │ PreviewService (扩展)                                    │ │
│ │  └─ probeMedia → ImageProbeInfo (新增 projectionType)    │ │
│ │ NekoPreviewAPI (扩展)                                    │ │
│ │  ├─ sendToModelAsEnvironment(...)                        │ │
│ │  └─ getProjectionInfo(filePath)                          │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
            ▲                          ▲
            │ HTTP/N-API               │ extension API
            │                          │
┌──────────────────────────┐    ┌─────────────────────────────┐
│ neko-engine              │    │ neko-model                  │
│ ┌──────────────────────┐ │    │ NekoModelAPI.setEnvironment │
│ │ runtime-media        │ │    │ (R3F <Environment> 加载)    │
│ │  └─ image_probe.rs   │ │    └─────────────────────────────┘
│ │     (XMP / EXIF /    │ │
│ │      HDR header)     │ │
│ ├──────────────────────┤ │
│ │ engine-kernel/gpu    │ │
│ │  └─ equirect_to_     │ │
│ │     cubemap.wgsl     │ │  Phase 2
│ │  └─ environment.rs   │ │  (复用)
│ └──────────────────────┘ │
└──────────────────────────┘
```

### 6.2 关键接口

```typescript
// @neko/shared/types/extension-api.ts (扩展)
export interface NekoPreviewAPI {
  probeMedia(filePath: string): Promise<MediaInfo | ImageProbeInfo>;
  sendToModelAsEnvironment(filePath: string, opts?: {
    intensity?: number;
    rotation?: number;
    useAsBackground?: boolean;
  }): Promise<void>;
  // ... existing
}

export interface NekoModelAPI {
  setEnvironment(spec: EnvironmentSpec): Promise<void>;
  clearEnvironment(): Promise<void>;
  // ... existing
}

export interface EnvironmentSpec {
  filePath: string;        // 必须是 equirectangular 或 cubemap
  intensity?: number;      // 默认 1.0
  rotation?: number;       // yaw 弧度
  useAsBackground?: boolean; // 默认 true；false 时仅作为 IBL 不渲染天空
}
```

### 6.3 与 ADR 家族的契合

| ADR | 契合点 |
|-----|--------|
| [format-strategy.md](./format-strategy.md) | sidecar (`*.nkmeta.json`) 复用现有 Format SDK；不引入新文件格式 |
| [agent-media-architecture.md](./agent-media-architecture.md) | `GeneratedAsset` 元数据扩展 `projectionType`；MediaPreprocessor 自动判断；预览作为 Send-to-Agent 入口之一 |
| [adr-capability-protocol.md](./adr-capability-protocol.md) | 球面查看器作为 Capability 注册（`viewer.panoramic.image`），Tool 投影使预览可被 Agent 程序化调用 |
| [adr-provider-expression-context.md](./adr-provider-expression-context.md) | `panoramic` 作为 Provider Capability Card 的能力位；Router 据此选 Provider |
| [model-runtime.md](./model-runtime.md) | HDRI 作为 IBL 输入，复用现有 `Environment` cubemap 管线 |
| [device-access.md](./device-access.md) | 暂无直接耦合（未涉及陀螺仪），但若未来支持 VR Headset 预览将复用其抽象 |

---

## 七、用户体验流程

### 7.1 默认进入预览

```
用户双击 .hdr 文件
  → VSCode 路由到 viewType=neko.preview.panoramicImage
  → PanoramicImageProvider.resolveCustomEditor
  → PreviewService.probe → projectionType=equirectangular, isHDR=true
  → webview 渲染 <PanoramicViewer src=... mode=sphere exposure=0 toneMap=ACES>
  → InfoBar 显示 "8192×4096 · HDR · Equirectangular · 78MB"
```

### 7.2 启发式触发的确认

```
用户双击 2:1 .png（无 XMP / EXIF）
  → projectionConfidence=heuristic
  → 顶部条带提示："Detected 2:1 aspect ratio. Treat as 360° panorama? [Yes] [No, Flat]"
  → 选择持久化到 *.nkmeta.json
```

### 7.3 Send-to-Model

```
右键预览 → "Use as Skybox in 3D"
  → 若 neko-model 未激活：弹出已存在的 .nkm 列表 + "New Scene"
  → 选中 → setEnvironment(filePath, { useAsBackground: true })
  → R3F Environment 加载 → 视口实时刷新天空盒
```

---

## 八、阶段交付计划

| Phase | 范围 | 估时 | 阻塞 |
|-------|------|------|------|
| **Phase 1：基础球面预览** | FR-1.1 ~ FR-1.3 / FR-2.1 ~ FR-2.5 (SDR 全部 + HDR `.hdr`) / FR-3.1 ~ FR-3.4 | ~5 eng-days | 无 |
| **Phase 1.5：HDR 增强** | `.exr` 单层支持 + ACES 完整管线 + 曝光/伽马持久化 | ~2 eng-days | 依赖 OpenEXR.js 或 wasm 解码 |
| **Phase 2：cubemap + 引擎管线** | FR-6 全部 / FR-3 增加 cubemap 输入 / engine `equirect_to_cubemap.wgsl` | ~4 eng-days | engine PR 落地 |
| **Phase 3：AI 端到端闭环** | FR-4.2 (球面 ROI) / FR-5.1 ~ FR-5.3 / "球面 inpaint" | ~6 eng-days | 依赖 [adr-provider-expression-context.md](./adr-provider-expression-context.md) `panoramic` 能力位先落地 |
| **Phase 4 (可选)：协作 / VR** | OrbitControls 跨用户同步、WebXR 预览 | TBD | 不在当前路线图 |

每个 Phase 独立开关 (`AblationToggle`)：`viewer.panoramic.enabled`、`viewer.panoramic.hdr`、`viewer.panoramic.cubemap`、`viewer.panoramic.aiLoop`。默认 Phase 1 ON、其余 OFF，遵循 [ablation-experiment-framework.md](./ablation-experiment-framework.md)。

---

## 九、风险与权衡

### 9.1 显存占用
**风险**：8K HDR (16384×8192 × RGB16F) 单张 ≈ 750MB GPU。
**缓解**：自适应下采样到 4K 内部纹理；保留原图用于 "Send to Model" 时按需上传到 engine（不经 webview）。

### 9.2 启发式误判
**风险**：2:1 PNG 中存在大量"全景平铺纹理 / 长条横幅"误判。
**缓解**：提示条带让用户确认；持久化决定到 sidecar；不做静默切换。

### 9.3 webview 与 engine 双 GPU 路径
**风险**：webview WebGL2 / WebGPU 与 engine wgpu 是两条独立 GPU 上下文，纹理跨上下文共享代价高。
**缓解**：Phase 1 不共享——预览全在 webview 完成；Phase 2 cubemap 烘焙跑在 engine，结果回传 KTX2 给 webview。

### 9.4 HDR Tone Mapping 一致性
**风险**：预览 ACES 与 neko-model 的 IBL Tone Mapping 不一致 → "预览好看，3D 装上变样"。
**缓解**：Phase 1.5 把 Tone Mapping 算法 / 参数下发到 `EnvironmentSpec`，让 neko-model 用同一组系数 fallback。

### 9.5 与 VSCode 内置图片预览冲突
**风险**：VSCode 默认会把 `.png/.jpg` 路由到内置预览。
**缓解**：仅对 `.hdr/.exr` / 文件名带 `_pano` `_360` `_equirect` / 带 `GPano` XMP 的文件**强制**走 `neko.preview.panoramicImage`；其余通过右键 "Open as Panorama" 显式打开，不抢路由。

### 9.6 包体积
**风险**：HDR / EXR 解码库（hdr-loader、exr-wasm）拖大 webview bundle。
**缓解**：动态 `import()`，仅在检测到 HDR 输入时按需加载。

---

## 十、明确不在范围内 (Out of Scope)

- **全景视频** (`.mp4` 360°)：与本 ADR 架构同源，但需要复用视频帧调度；放在后续 ADR `panoramic-video-preview` 中。
- **多分辨率瓦片 (Deep Zoom / Pannellum tile)**：超大全景图（≥ 16K）的瓦片化加载；先用整图下采样应付。
- **VR Headset 直连**：WebXR / OpenXR 输出，待 `device-access.md` 引入对应 trait。
- **空间音频**：Ambisonics B-format 解码，与 audio 预览相关，独立 ADR。
- **模板/编辑**：在球面预览中绘制 / 标注 / 重投影；那是 neko-sketch 范畴，本 ADR 仅做 Send-to。

---

## 十一、开放问题 (Open Questions)

1. **q1**：`.exr` 多 channel / multi-layer（如 `cryptomatte`）是否在 Phase 1.5 内？倾向**否**（只支持 RGB[A]）。
2. **q2**：球面查看器是否抽出独立 npm 包（`@neko/panorama-viewer`）供 neko-model / neko-canvas 复用？倾向**是**，Phase 1 落地后立即抽离，避免再次重写。
3. **q3**：sidecar `*.nkmeta.json` 与 [format-strategy.md](./format-strategy.md) 的 nkv 体系如何精确对齐？需要 Format SDK 给 image 类一个具名 schema (`nki`?)。
4. **q4**：Send-to-Model 是否区分"作为环境光"和"作为 SkyDome geometry"？前者是 IBL，后者会出现在世界中（影响阴影）。建议两个独立菜单项。
5. **q5**：是否对 Provider 强制要求 `panoramic` 能力位**早于** Phase 1 落地，以便 AI 产物的 sidecar 元数据从一开始就完整？需要与 [adr-provider-expression-context.md](./adr-provider-expression-context.md) 排期对齐。

---

## 十二、决策摘要 (Decision Summary)

| 维度 | 决策 |
|------|------|
| **是否做** | **是**，作为 neko-preview 的独立 viewer 模式；不抢 VSCode 内置图片预览路由，仅识别 `.hdr/.exr/*_pano*/GPano XMP` |
| **范围** | Phase 1 仅图片（不含视频）；HDR 一等公民；优先服务 AI 天空盒 + 第三方 HDRI |
| **GPU 路径** | webview WebGL2 (基线) / WebGPU (优先)；Phase 2 才接 engine wgpu |
| **复用** | 球面查看器组件后续被 neko-model / neko-canvas 复用 |
| **联动** | 与 neko-agent (Send-to)、neko-model (setEnvironment) 通过 `NekoPreviewAPI` 走跨扩展 API |
| **质量门** | 4K SDR ≤ 800ms 首帧、≥ 55fps 拖拽、显存 ≤ 80MB；HDR 显存 ≤ 350MB |
| **风险等级** | 中：核心是新写球面渲染管线；engine / 跨扩展协议复用度高，无新基础设施 |

---

## 参考

- [agent-media-architecture.md](./agent-media-architecture.md) - GeneratedAsset / MediaPreprocessor / Send-to-Agent 协议
- [format-strategy.md](./format-strategy.md) - nkv 与 sidecar 元数据规范
- [model-runtime.md](./model-runtime.md) - 3D 引擎 IBL / Environment 现状
- [adr-capability-protocol.md](./adr-capability-protocol.md) - viewer 作为 Capability 的注册路径
- [adr-provider-expression-context.md](./adr-provider-expression-context.md) - Provider Capability Card 的 panoramic 能力位
- [document-preview.md](./document-preview.md) - 现有预览扩展的实现参考
- [ablation-experiment-framework.md](./ablation-experiment-framework.md) - Phase 灰度发布开关
