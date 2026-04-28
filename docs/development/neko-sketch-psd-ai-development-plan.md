# neko-sketch PSD 与 AI 增强开发方案

## 状态

**实施中** — PSD 导入 MVP、RasterSource 收口、AI 结果应用器、AI 上下文 `fileUri` 桥、AI 进度浮层、结果预览/应用/丢弃、AI 面板参数化上下文桥、图层/选区级 undo/redo、像素区域 history replay 与底层媒体任务取消链路已落地；面板内直接执行工具和更复杂的像素操作回放策略仍待后续迭代。

## 相关文档

- [packages/neko-sketch/ARCHITECTURE.md](../../packages/neko-sketch/ARCHITECTURE.md) — neko-sketch 当前架构
- [packages/neko-sketch/ROADMAP.md](../../packages/neko-sketch/ROADMAP.md) — neko-sketch 功能路线
- [sketch-phase-next.md](./sketch-phase-next.md) — 2D 光照与专业工具阶段计划
- [sketch-feature-gap-analysis.md](../architecture/assessments/sketch-feature-gap-analysis.md) — 专业 2D 工具差距分析
- [agent-media-architecture.md](../architecture/agent-media-architecture.md) — GeneratedAsset 落盘与零 base64 跨进程协议
- [neko-agent-media-requirements-fit.md](../architecture/neko-agent-media-requirements-fit.md) — AgentCapabilityProvider 与跨子包 AI 能力接入

---

## 1. 产品定位

`neko-sketch` 不是 Photoshop 兼容编辑器，而是 **AI-first 的轻量 2D 创作工具**。

核心原则：

- `.nks` / `LayerData` 是唯一编辑真源。
- PSD 是有损导入与资产迁移格式，不是内部编辑模型。
- AI 能力必须落到 Canvas / Layer / Selection / Palette / BrushPreset 等原生对象。
- WebGL2 渲染管线继续保持 webview 内独立，不因 PSD 或 AI 引入 engine 强依赖。

非目标：

- 不承诺 PSD 无损往返。
- PSD 导入有损，文档进入 `.nks` 后视为新文件，不再追溯 PSD 来源。
- 不把 AI 结果作为不可管理的外部图片堆放。
- 不把模型供应商或推理运行时耦合进 `neko-sketch` 核心。

---

## 2. 架构三问

### 2.1 是否符合现有架构？

符合。PSD 与 AI 都作为 adapter / operation 接入：

- PSD：文件格式适配器，输出原生 `LayerData` 图层树。
- AI：能力适配器，输入原生上下文，输出原生编辑结果。
- 渲染：继续使用 webview 内 WebGL2 自建引擎。
- 引擎：仅作为未来本地推理可选后端，不进入渲染主路径。

### 2.2 如何进一步降低耦合？

按职责切分模块：

- PSD parser 只负责外部格式解析。
- PSD mapper 只负责 PSD 标准层树到 `LayerData` 的转换。
- Raster bridge 统一处理图片、PSD、AI 结果的像素落地。
- AI operation 只描述意图、上下文和结果，不绑定具体模型。
- `neko-agent` 或 platform 层负责模型编排和 provider 选择。

### 2.3 是否易于扩展与测试？

易于扩展。关键转换逻辑都可以纯函数化：

- PSD layer tree -> `LayerData[]`
- unsupported feature -> `PsdImportIssue[]`
- AI result -> layer / selection / palette / brush preset
- edit operation -> history entry

---

## 3. 五层分析

### 3.1 职责

| 模块 | 职责 |
|------|------|
| `neko-sketch` webview | 编辑体验、图层状态、选区、画布渲染、AI 结果落地 |
| `neko-sketch` extension | VS Code 文件入口、PSD 解析、AI capability provider、跨扩展命令调用 |
| PSD adapter | 在 Extension Host 解析 PSD 并生成中间层树 |
| PSD mapper | 在 Webview 把中间层树转换为原生 `LayerData` |
| AI capability provider | 已存在于 `packages/neko-sketch/packages/extension/src/agentCapabilityProvider.ts`，负责工具注册、参数校验与 media service 调用 |
| AI result applier | Webview 新增，负责把 extension 发来的 AI 结果落到 `LayerData` / `SelectionMask` / palette / brush preset |
| `neko-agent` | 模型编排、提示词、任务状态、provider 路由 |
| engine runtime-ml | 未来可选本地 ONNX 推理后端 |

### 3.2 依赖

推荐依赖方向：

```text
neko-sketch webview
  -> @neko/shared
  -> PSD tree / AI result 消息契约
  -> raster-source / psd-layer-mapper / ai-result-applier

neko-sketch extension
  -> @neko/shared
  -> vscode command / extension API
  -> ag-psd（Extension Host 侧解析；代码路径仅 PSD import 使用）
  -> agentCapabilityProvider.ts（已存在）

neko-agent
  -> AI provider / runtime / optional engine
```

禁止方向：

```text
neko-sketch core renderer -> ag-psd
neko-sketch core renderer -> neko-agent
neko-sketch core renderer -> engine
neko-sketch webview -> vscode
neko-sketch extension -> React
neko-sketch native layer model -> PSD 专有类型
@neko/shared(L0) -> DOM types
```

### 3.3 接口

PSD 已定义契约入口：

```text
packages/neko-sketch/packages/webview/src/utils/psd-import.ts
```

M2 实现时需要把跨 Extension-Webview 的 PSD 消息契约上移到 `@neko/shared`，或在 extension/webview 之间建立生成式共享类型；Extension 不应直接导入 webview 源码。`@neko/shared` 对应仓库路径 `packages/neko-types/`，wire 契约文件落地路径见 §4.4。

上移到 `@neko/shared` 的只能是 wire 类型，不能带 `ImageData` / `ImageBitmap` / `OffscreenCanvas` 等 DOM 类型：

```typescript
export interface PsdDocumentTreeWire {
  readonly canvas: CanvasConfig;
  readonly layers: readonly PsdLayerNodeWire[];
}

export interface PsdLayerNodeWire {
  readonly id?: string;
  readonly name: string;
  readonly kind: 'group' | 'raster';
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: string;
  readonly clippingMask: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly children?: readonly PsdLayerNodeWire[];
  readonly pixels?: {
    readonly kind: 'encoded';
    readonly dataBase64: string;
    readonly mimeType: 'image/png';
  };
}
```

现有 `psd-import.ts` 里的 `PsdPixelSource` 保留为 webview 内部类型，不上移到 L0。Extension 侧从 PSD 解出像素后编码成 PNG base64 wire payload，Webview 再通过 `RasterSource` 落地。Wire payload 必须 JSON-safe，不能直接传 `Uint8Array` / `ArrayBuffer`。

AI 契约分两层，避免和现有能力注册重复：

```text
Extension 层（已存在）
  packages/neko-sketch/packages/extension/src/agentCapabilityProvider.ts
    - 注册 TOOL_NAMES_SKETCH 下的 generate / smart-selection / inpaint / style-transfer / upscale / auto-layer / lineart-colorize
    - 校验工具参数
    - 调用 ICapabilityMediaService
    - 维护长任务状态、进度、取消与结果路径

Webview 层（新增）
  packages/neko-sketch/packages/webview/src/ai/
    ai-result-applier.ts
    ai-session-store.ts
    ai-progress-types.ts
```

共享协议需要跨扩展时，再上移到 `@neko/shared`：

```text
SketchAIOperationType
SketchAIAssetRef
SketchAIContext
SketchAIResult
SketchAIRun
SketchAIRunState
SketchAIOperationParams
SketchAIOpenAgentMessage
```

`postMessage` payload 类型在 `ai-progress-types.ts` 中单列，避免和持久化/共享数据模型混在一起。

### 3.4 扩展

PSD 扩展点：

- 新增 PSD 特性映射。
- 增强文本层转换。
- 增强蒙版映射。
- 增强调整层映射。
- 增加有限 PSD 导出，但不承诺无损。

AI 扩展点：

- 智能选区。
- 局部重绘。
- 扩图。
- 超分。
- 自动分层。
- 线稿上色。
- 风格迁移。
- palette / brush preset 生成。

### 3.5 测试

Unit：

- PSD mapper 单测。
- raster bridge 单测。
- AI result applier 单测。
- history undo / redo 单测。

Integration：

- webview 集成测试：导入 PSD、生成 AI 图层、保存 `.nks`。

Contract：

- Mapping completeness test：遍历 ag-psd `BlendMode` 枚举或源码导出的所有值，断言每个值都有映射或显式 fallback。
- Contract issue test：断言每个不支持 PSD 能力都会产生 `PsdImportIssue`，不能静默丢失。

---

## 4. PSD 支持策略

### 4.1 原则

以原生模型为准，PSD 只作为导入格式。

导入规则：

- 能映射的能力直接映射。
- 不能映射的能力降级。
- 降级必须记录 issue。
- 导入完成后文档进入 `.nks` 原生编辑模型。

### 4.2 MVP 支持范围

| PSD 能力 | 原生处理 |
|----------|----------|
| 普通像素层 | 转 `LayerData.type = 'raster'` |
| 图层组 | 转 `LayerData.type = 'group'` |
| 图层名称 | 保留 |
| 可见性 | 保留 |
| 不透明度 | 保留 |
| 图层位置 | 写入 `offsetX` / `offsetY` |
| 图层尺寸 | 写入 `width` / `height` |
| 常见混合模式 | 映射到 `SketchBlendMode`；详细映射见 §4.2.1，sketch 当前支持 12 个目标模式，其余降级为 `normal` |
| 未支持混合模式 | 降级 `normal`，记录 warning |
| 文本层 | MVP 栅格化，记录 warning |
| 智能对象 | 栅格化，记录 warning |
| 图层样式 | 栅格化或忽略，记录 warning |
| 图层蒙版 | 可映射则转换，不能映射则记录 warning |
| CMYK / 16bit | 转 RGBA8，记录 warning |

暂不支持：

- PSB。
- 无损 PSD 往返。
- 完整文本排版语义。
- Photoshop 组 pass-through 完整一致性。
- 智能对象可编辑语义。
- 复杂图层特效保真。

### 4.2.1 PSD 混合模式映射

映射表必须独立在 `psd-blend-mode-map.ts`，不要散落在 mapper 内部。实现时以 ag-psd 的 `BlendMode` 枚举或源码清单为权威来源；ag-psd 实际输出是 `multiply` / `color dodge` / `pass through` 这类语义字符串，而不是 PSD 四字符 key。实现需同时兼容 ag-psd 语义字符串和历史四字符 key，mapping completeness test 必须覆盖两类输入。

sketch 当前支持的 12 个目标模式：

```text
normal / multiply / screen / overlay / soft-light / hard-light /
darken / lighten / difference / exclusion / color-dodge / color-burn
```

| PSD blendMode | SketchBlendMode | 备注 |
|---------------|-----------------|------|
| `norm` | `normal` | 普通模式 |
| `diss` | `normal` | dissolve 暂未实现，降级并记录 `unsupported-blend-mode` |
| `pass` / `pass through` | `normal` | 仅作为 fallback；PSD pass-through 对 group 有特殊语义，M2 应在 mapper 中记录 `group-isolation-mismatch` |
| `mul ` | `multiply` | PSD 四字符 key 带尾部空格 |
| `scrn` | `screen` | 直接映射 |
| `over` | `overlay` | 直接映射 |
| `sLit` | `soft-light` | 直接映射 |
| `hLit` | `hard-light` | 直接映射 |
| `dark` | `darken` | 直接映射 |
| `lite` | `lighten` | 直接映射 |
| `diff` | `difference` | 直接映射 |
| `smud` | `exclusion` | 直接映射 |
| `cDdg` | `color-dodge` | color dodge |
| `cBrn` / `cbrn` | `color-burn` | color burn，大小写以 ag-psd 实际枚举为准 |
| `lddg` | `normal` | linear dodge / add；sketch 当前无 linear-dodge，降级并记录 `unsupported-blend-mode` |
| `lbrn` | `normal` | linear burn 暂未实现，记录 `unsupported-blend-mode` |
| `pLit` / `vLit` / `lLit` / `pinL` / `hMix` | `normal` | 降级并记录 warning |
| `fsub` / `fdiv` | `normal` | 降级并记录 warning |
| `hue ` / `sat ` / `colr` / `lum ` | `normal` | sketch 当前没有 HSL 类混合，注意四字符 key 尾空格，降级并记录 warning |
| ag-psd semantic names | 对应 sketch 模式或 `normal` | `normal`、`multiply`、`screen`、`overlay`、`soft light`、`hard light`、`darken`、`lighten`、`difference`、`exclusion`、`color dodge`、`color burn` 直接映射；`linear dodge`、`linear burn`、`hue` 等降级 |
| unknown | `normal` | 降级并记录 warning |

注意：`psd-blend-mode-map.ts` 只处理 raster layer 的 blend key。PSD group 的 pass-through / isolation 语义应在 `psd-layer-mapper.ts` 中处理，M2 可将 pass-through group 降级为普通 group，并记录 `group-isolation-mismatch` warning。

### 4.3 推荐数据流

```text
用户选择/拖入 PSD
  -> Extension Host readFile
  -> Extension Host import('ag-psd') 并解析
  -> Extension Host 生成 PsdDocumentTreeWire + PsdImportIssue[]
  -> postMessage(file:importedPsdTree, { tree, issues })
  -> Webview psd-layer-mapper 转 LayerData[]
  -> raster bridge 上传纹理或生成 pendingData
  -> Zustand 写入 layers / canvas
  -> history 记录导入操作
  -> UI 展示导入降级信息
```

实现约束：

- `ag-psd` 必须放在 Extension Host 侧，不能进入 webview bundle。
- `import('ag-psd')` 必须使用字面量模块名，保证 esbuild 能把依赖打进 VSCode extension bundle；不要写成 `import(moduleName)`，否则 `vsce package --no-dependencies` 后运行时可能找不到解析器。
- 当前实测 bundle 影响：`ag-psd@28.5.1` 在本地 pnpm 实体包约 12.5 MiB，`dist-es/*.js` 合计约 519 KiB；esbuild 打包后 extension bundle 约 686.4 KiB，gzip 约 128.7 KiB。Webview bundle 不受影响。
- Extension Host 没有 DOM Canvas；即使 `readPsd({ useImageData: true })`，ag-psd 仍需要 `initializeCanvas()` 提供 `createImageData`。adapter 必须初始化一个只支持 `ImageData` buffer 的 bridge，并让 canvas 输出路径显式失败。
- 包体不是主要风险；大 PSD 的原始 RGBA 像素内存才是主要风险，必须优先执行 §4.5 的 `maxTextureSize` / `memoryBudget` 防御。

### 4.4 建议模块

```text
packages/neko-sketch/packages/webview/src/utils/
  psd-import.ts          # 现有 webview 内部契约扩展：补 IssueCode；DOM 像素类型仅限 webview 内部
  psd-layer-mapper.ts    # PSD 中间层树 -> LayerData
  psd-blend-mode-map.ts  # PSD blendMode -> SketchBlendMode 映射与 fallback
  raster-source.ts       # ImageData / ImageBitmap / Canvas / fileUri / legacy base64 -> 原生像素源
  psd-import.test.ts     # PSD 映射测试

packages/neko-types/src/types/
  sketch-psd-import.ts   # Wire 契约：PsdDocumentTreeWire / PsdLayerNodeWire / PsdImportIssue

packages/neko-sketch/packages/extension/src/psd/
  psd-ag-adapter.ts      # ag-psd 适配器，禁止外泄 ag-psd 类型
  psd-import-limits.ts   # maxTextureSize / layerCount / memoryBudget 防御
```

Extension 侧：

```text
packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts
```

新增：

- `.psd` 文件过滤。
- `file:importedPsdTree` 消息。
- `file:importResult` 失败消息；kill switch 关闭时返回 `kill-switch-disabled`，parser 不可用和解析失败分别返回 `parser-unavailable` / `parse-failed`。
- drop request 中识别 `.psd`。
- PSD import output channel，用于展示每个 compatibility issue 的 code / severity / layerPath / message。
- 空 group 识别必须依赖 ag-psd `sectionDivider` / group metadata，不能只用 `children.length > 0` 判断。

### 4.5 验收标准

- 单层 PSD 可导入为 raster layer。
- 多层 PSD 可保留图层顺序和组结构。
- 导入后可保存为 `.nks`。
- 常见混合模式可正确映射。
- 不支持项不会静默丢失，必须产生 issue。
- 单层像素尺寸超过 `maxTextureSize` 时，产生 `texture-size-exceeded` issue 并跳过该层像素数据，不能崩溃 webview。
- 总图层数超过阈值（建议 100）时给用户确认提示。
- 导入完成后，warning 摘要必须可打开详情视图，不能只显示数量。
- 估算内存预算超过阈值时降级或中止导入。
- PSD 像素 wire payload 必须 JSON-safe；`PsdEncodedPixelsWire` 使用 PNG base64 字符串，webview mapper 必须通过 JSON round-trip 测试。
- 空 group 必须保留为 group layer，不得被误导入为空 raster layer。
- Contract issue test 必须通过：枚举文本层、智能对象、CMYK、超过 `maxTextureSize`、未支持 blend mode 等不支持特性，断言每种都至少产生一个 `PsdImportIssue`。
- 图层顺序测试必须通过：Extension 侧真实 `ag-psd` 读回后保持顶层与组内顺序，Webview mapper 不得反转 wire tree 顺序。
- 没有新增 `@neko/neko-client` 或 engine 依赖。

实施时内存预算应按 raster 图层实际像素区域累加，即 `sum(layer.width * layer.height * 4)`；不要按整张画布乘总图层数估算，group 节点不计入像素预算。

---

## 5. AI 增强策略

### 5.1 原则

AI 功能必须是 canvas-native，而不是独立聊天式图片生成。

```text
Canvas / Layer / Selection
  -> AI operation
  -> LayerData / SelectionMask / Palette / BrushPreset
  -> History
  -> .nks serialization
```

默认行为：

- AI 结果默认生成新图层，避免破坏用户原图。
- 支持应用、丢弃、重新生成。
- 支持取消长任务。
- 支持 undo / redo。
- 记录 AI 操作 metadata，便于追踪来源。

### 5.2 AI 能力优先级

| 优先级 | 能力 | 输入 | 输出 | 原因 |
|--------|------|------|------|------|
| P0 | 智能选区 / 抠图 | 当前层或合成图 | `SelectionMask` | 是 inpaint、auto-layer 的基础 |
| P0 | 局部重绘 | 图层/合成图 + selection + prompt | 新 raster layer | 最贴合轻量 2D 编辑 |
| P1 | 超分 | 当前层或合成图 | 新 raster layer | 低交互成本，高收益 |
| P1 | 自动分层 | 合成图 | 多个 raster layers | 强化 AI-first 差异化 |
| P1 | 线稿上色 | 线稿层 + prompt / palette | 色彩图层 | 贴合 sketch 场景 |
| P2 | 扩图 | 画布边界 + prompt | 新图层或扩展画布 | 依赖画布 resize 与边界处理 |
| P2 | 风格迁移 | 当前层/选区 + style | 新 raster layer | 需控制结果一致性 |
| P2 | Palette / Brush 生成 | 图像或 prompt | palette / brush preset | 低风险增强 |

AI 智能选区 MVP 输出建议使用 alpha mask PNG，Webview applier 负责转成当前 `SelectionMask` 使用的 `Uint8Array` bitmask；polygon path 可作为后续增强。

### 5.3 建议类型

```typescript
export type SketchAIOperationType =
  | 'smart-selection'
  | 'inpaint'
  | 'upscale'
  | 'auto-layer'
  | 'lineart-colorize'
  | 'outpaint'
  | 'style-transfer'
  | 'palette-generate'
  | 'brush-generate';

export type SketchAIAssetRef =
  | { readonly kind: 'webviewUri'; readonly ref: string; readonly mimeType: string }
  | { readonly kind: 'fileUri'; readonly ref: string; readonly mimeType: string }
  | { readonly kind: 'assetId'; readonly ref: string; readonly mimeType: string }
  | { readonly kind: 'engineHandle'; readonly ref: string; readonly mimeType: string };

export interface SketchAIContext {
  readonly canvas: CanvasConfig;
  readonly activeLayerId: string | null;
  readonly selectedLayerIds: readonly string[];
  readonly selection: SelectionMask | null;
  readonly compositeImage?: SketchAIAssetRef;
  readonly layerImage?: SketchAIAssetRef;
  readonly maskImage?: SketchAIAssetRef;
}

interface SketchAIResultBase {
  readonly issues: readonly string[];
  readonly metadata: Record<string, unknown>;
}

export type SketchAIResult =
  | (SketchAIResultBase & {
      readonly kind: 'layer';
      readonly data: SketchAIAssetRef;
    })
  | (SketchAIResultBase & {
      readonly kind: 'selection';
      readonly data: SketchAIAssetRef; // alpha mask PNG
    })
  | (SketchAIResultBase & {
      readonly kind: 'palette';
      readonly data: readonly string[];
    })
  | (SketchAIResultBase & {
      readonly kind: 'brushPreset';
      readonly data: BrushPreset;
    });

export type SketchAIRunState = 'idle' | 'preparing' | 'running' | 'applying' | 'completed' | 'failed' | 'cancelled';

export interface SketchAIRun {
  readonly runId: string;
  readonly operation: SketchAIOperationType;
  readonly state: SketchAIRunState;
  readonly progress: number;
  readonly stage?: string;
  readonly metadata: Record<string, unknown>;
}
```

`BrushPreset` 应从 sketch 现有类型导入；若实现期还没有可复用类型，先定义最小 placeholder，并保留 `TODO(P2)` 到 brush 生成能力落地时补全。

MVP 不应在 `SketchAIContext` 里传大段 base64。合成图、图层图和 mask 应落到 `.neko/cache/sketch-ai/<runId>/` 或 GeneratedAsset，再通过 `fileUri` / `assetId` 传引用，符合 `agent-media-architecture.md` 的零 base64 跨进程原则。Extension 发给 Webview 前必须把可直接读取的本地文件转换为 `webviewUri`，Webview 不直接读取 Node / VSCode file API。

实施现状：`NekoSketchAPI.createAIContextSnapshot()` 已提供 Extension 侧上下文缓存桥，返回 `SketchAIContextSnapshot` 与 `fileUri` 资产引用。`ImageGenerationRequest` 已支持 `referenceImageUri` / `maskUri` / `controlImageUri`，platform executor 会在 provider 执行前把本地 URI materialize 为现有 provider 可消费的 base64。`agentCapabilityProvider.ts` 已优先使用 context snapshot 的 `fileUri`，快照不可用时回退到 legacy base64，以兼容尚未升级的 media service 实现。

### 5.4 与 neko-agent 集成

`neko-sketch` 不直接绑定模型供应商。

推荐路径：

```text
neko-sketch webview
  -> postMessage(ai:request)
  -> neko-sketch extension
  -> agentCapabilityProvider.ts / ICapabilityMediaService
  -> provider / runtime / optional engine
  -> result asset file / GeneratedAsset
  -> postMessage(ai:resultApply)
  -> webview ai-result-applier
```

长任务协议：

```text
ai:request       { runId, operation, contextRef, params }
ai:progress      { runId, operation, percent, stage }
ai:resultApply   { runId, operation, result }
ai:resultApplied { runId, success, reason }
ai:error         { runId, message, issues }
ai:cancel        { runId }
```

`contextRef` 是 `SketchAIContext` 的轻量引用子集，形如 `{ compositeImage?: SketchAIAssetRef; layerImage?: SketchAIAssetRef; maskImage?: SketchAIAssetRef }`，禁止内联大图 base64。
`ai:progress.percent` 为 0..100 的协议值，Webview session store 内部归一化为 0..1；首个 progress 包必须带 `operation`，用于创建 `SketchAIRun`。
`ai:resultApplied` 是 Webview 到 Extension Host 的确认消息；Extension 收到后删除 `globalStorage/sketch-ai/<runId>` 下的结果缓存。AI 上下文快照由 capability provider 在对应工具结束后调用 `NekoSketchAPI.cleanupAIArtifacts(runId)` 清理，避免 auto-layer 多轮生成中提前删除共享上下文。
`NekoSketchAPI.reportAIProgress()` 用于 provider 在拿到 media task id 后立即向 webview 建立 run 状态；webview 的 AI run monitor 可基于该 runId 发出 `ai:cancel`。
`ai:resultApply` 在 Webview 内先进入 `previewing` 状态，不直接修改画布；用户点击 Apply 后才写入 `LayerData` / `SelectionMask`，点击 Discard 会回发 `ai:resultApplied { success: false, reason: 'discarded' }` 以清理 Extension 缓存。
`ai:openAgent` 是 Webview 到 Extension 的轻量入口：AI 面板把 operation + prompt 发给 Extension，由 Extension 调用 `neko.agent.sendContext` 注入 `sketch-layer` context 与 intent。当前不直接调用内部 tool 执行命令，避免绑定不稳定的 agent runtime 私有接口。
图层导入和 AI Apply 使用 state snapshot history：记录 layers / activeLayerId / selection 的 before/after，undo/redo 时由 HistorySlice 回放状态，并重新触发 dirty edit。
像素编辑使用 region snapshot history：记录受影响区域的 before/after RGBA 数据，HistorySlice 只调度快照，Webview renderer 通过注册的 region applier 恢复 WebGL texture；brush / eraser / pixel / fill / shape / transform / flip / rotate / clear / delete selection 已接入。

`SketchAIRun` 由 webview 持有 UI 状态；Extension 侧用 run registry 保存媒体任务取消回调与临时文件路径。取消时由 `ai:cancel` 触发 `NekoSketchAPI.cancelAIRun(runId)`，再调用 `ICapabilityMediaService.cancelTask(taskId)`；Extension 根据结果回发 `ai:cancel` 或 `ai:error`，并清理 runId 对应缓存。失败或取消不进入 history。

后端选择：

| 后端 | 适用场景 |
|------|----------|
| 云端模型 | inpaint / outpaint / style transfer，质量优先 |
| `neko-agent` 编排 | prompt、上下文、多步工作流 |
| engine runtime-ml | 未来本地 ONNX，如分割、超分、抠图 |

---

## 6. 里程碑

### M1：原生模型与像素桥接收口

目标：图片、PSD、AI 结果共用一套 raster 落地路径。

开发项：

- 新增 `raster-source.ts`，逐步取代现有 `image-import.ts`。
- 迁移 `SketchCanvas.tsx` 的 `file:imported` 处理、PSD mapper、AI result applier 三处入口，统一调用 `RasterSource.from(...)`。
- 修正普通图片导入路径，确保 bitmap / fileUri / ImageData 能可靠落为 texture 或 `pendingData`。
- 统一导入后 dirty / history / activeLayer 行为。
- 为 raster bridge 补单测。

验收：

- PNG/JPEG/WebP 导入后可显示、保存、重开。
- 导入行为不破坏现有 `.nks` serialization。
- brush / eraser / pixel / fill / shape / transform / flip / rotate / clear / delete selection 的 undo/redo 能恢复 WebGL texture，且只保存变化区域。

### M2：PSD 有损导入 MVP

目标：PSD 作为资产迁移格式可用。

开发项：

- extension 包通过 `import('ag-psd')` 字面量加载 PSD parser，确保 VSCode extension bundle 内包含 parser，但仅 PSD import path 调用。
- 新增 `file:importedPsdTree` 协议。
- 新增 extension 侧 `psd-ag-adapter.ts`。
- 新增 webview 侧 `psd-layer-mapper.ts` 与 `psd-blend-mode-map.ts`。
- 支持 warning 汇总。
- warning 详情写入 `Neko Sketch PSD Import` output channel。
- 增加 maxTextureSize、layerCount、memoryBudget 防御。

验收：

- 单层、多层、分组 PSD 可导入。
- 导入后可继续编辑并保存 `.nks`。
- 不支持特性有明确 warning。
- 超大图层、超多图层和超预算 PSD 只能降级或中止，不能卡死 webview。
- blend mode mapping completeness test 必须通过。
- Contract issue test 必须通过：文本层、智能对象、mask、图层样式、调整层、vector fill/stroke、超大纹理、未知 blend mode 等不支持能力都要产生 `PsdImportIssue`。
- 导入会触发 VSCode custom editor dirty edit；导入图层的 undo/redo 已通过 state snapshot history 接入。
- ag-psd integration test 必须通过：使用真实 `ag-psd` reader 解析生成的最小 PSD、分组 PSD 和顺序样本，验证 Extension Host 的 `initializeCanvas` bridge、像素编码路径、group / pass-through wire tree、顶层与组内 layer order 可用。
- package 级 `pnpm --dir packages/neko-sketch run compile` 必须通过，覆盖 extension/webview build 与发布资源 copy 流程。

### M3：AI 结果应用器（Webview 落地）

目标：复用已存在的 Extension 层 `agentCapabilityProvider.ts`，补齐 webview 侧结果应用链路。

开发项：

- 新增 `src/ai/ai-result-applier.ts`。
- 新增 `src/ai/ai-session-store.ts`。
- 新增 `src/ai/ai-progress-types.ts`。
- 新增 `ai:progress` / `ai:resultApply` / `ai:error` / `ai:cancel` postMessage 协议。
- 新增 cache file / GeneratedAsset 引用读取逻辑，禁止大图 base64 跨进程传输。
- AI 结果支持生成新图层或 selection mask。
- `SketchAIResult` 与 `ai:*` postMessage wire 类型上移到 `@neko/shared`，webview 只保留 applier/session 实现。
- `NekoSketchAPI.createAIContextSnapshot()` 可把 canvas / layer / selection mask 缓存为 `fileUri`；provider 优先传 `referenceImageUri` / `maskUri`，ControlNet 类输入可传 `controlImageUri`，并在快照不可用时回退 base64。
- `request:layerImageData` 已改为按 `layerId` / `activeLayerId` 导出单层 raster 数据；支持嵌套图层查找和 `pendingData` fallback，无法导出时返回 `null`，不再静默回退合成图。
- `NekoSketchAPI.registerAIRun()` / `unregisterAIRun()` / `cancelAIRun()` 已接入 Extension run registry；`agentCapabilityProvider.ts` 在每个 `generateImage()` media task 等待期间注册 `media.cancelTask()`，完成、失败或取消后注销。
- `NekoSketchAPI.reportAIProgress()` 已接入 provider 等待路径；webview AI run monitor 会显示 operation、stage、progress，并提供 `ai:cancel` 入口。
- `ai:resultApply` 已改为 preview-first：用户 Apply 才调用 `ai-result-applier`，Discard 会触发 Extension 缓存清理且不污染当前文档。
- Webview 侧 AI 面板已提供 operation + prompt 输入，并通过 `ai:openAgent` / `neko.agent.sendContext` 把当前 Sketch 文档和 intent 交给 Neko Agent。

验收：

- mock `ai:resultApply` 可以生成新图层。
- mock alpha mask PNG 可以写入 selection store。
- AI layer 结果会触发 dirty edit；AI layer / selection 结果的 undo/redo 已通过 state snapshot history 接入。
- 失败或取消会 dispose pending layer，不污染当前文档。

### M4：智能选区与局部重绘

目标：交付第一条高价值 AI 工作流。

开发项：

- 支持从当前画布/图层提取 AI 上下文。
- 支持 selection mask 作为 inpaint mask。
- 支持 prompt 与负面 prompt。
- 结果默认生成新图层。
- 支持取消与失败提示。

验收：

- 用户可框选区域后发起局部重绘。
- AI 智能选区可把 mask PNG 应用到 `SelectionMask`。
- 结果生成在新图层。
- 原始图层不被自动覆盖。
- 底层 media task cancellation、运行状态浮层、结果预览/应用/丢弃和 Agent 上下文桥已接入；AI 面板参数表单会把 scope、negative prompt、strength、style、scale、layerName、palette、auto-layer targets 作为 `SketchAIOperationParams` 注入 Agent context；面板内直接执行工具和工具结果联动仍属于后续项。

### M5：超分、自动分层、线稿上色

目标：补齐轻量 AI 创作的高频增强能力。

开发项：

- Upscale 当前层或合成图。
- Auto-layer 输出多图层。
- Lineart colorize 输出颜色层。
- 提供简单结果预览与应用/丢弃（已由 AI run monitor 覆盖 layer / selection 结果）。

验收：

- AI 输出均转成原生对象。
- 结果可保存到 `.nks`。
- M5 沿用 M3 的 `AISession` 失败处理：失败时清理 pending layer、临时文件和未提交 history entry。

### M6：PSD 增量增强

目标：根据真实使用反馈增强兼容性。

候选项：

- 文本层有限转换为原生 text layer。
- 图层蒙版映射为原生 mask。
- 常见调整层映射为原生 adjustment。
- 有限 layered export。

验收：

- 每个增强都有单测 fixture。
- 不承诺完整 PSD 无损导出。

---

## 7. 风险与规避

| 风险 | 影响 | 规避 | 对应章节 |
|------|------|------|----------|
| PSD 语义污染原生模型 | 架构复杂度失控 | 原生为准，PSD 只进 adapter | §1 / §4.1 |
| PSD 导入静默丢特性 | 用户误判文件保真 | 强制 `PsdImportIssue[]` | §3.5 / §4.5 |
| AI 结果不可撤销 | 编辑体验不可靠 | 所有 AI apply 都进入 history | §5.1 / §6 M3 |
| AI 覆盖原图 | 数据损失 | 默认新图层，覆盖需显式确认 | §5.1 / §6 M4 |
| 模型供应商耦合 | 后续迁移困难 | 通过 shared protocol / neko-agent 编排 | §3.3 / §5.4 |
| engine 依赖提前进入 sketch | 打破轻量独立性 | engine 仅作为可选推理后端 | §3.2 |
| 大 PSD / 大图导致内存压力 | Webview 卡顿或崩溃 | max texture size、分层降级、导入前提示 | §4.5 / §6 M2 |

---

## 8. 推荐开发顺序

依赖关系：

```text
M1 RasterSource
  ├── M2 PSD import
  └── M3 AI result applier
        └── M4 Smart selection + inpaint
              └── M5 Upscale / auto-layer / lineart colorize

M6 PSD enhancement depends on M2 and real-world fixtures.
```

PSD 先解决资产进入问题，AI 负责产品差异化。两者都必须服务 `.nks` 原生编辑模型，而不是反向定义核心架构。

真实 PSD 兼容性样本单独维护在 `packages/neko-sketch/test-fixtures/psd/`。M2 的自动化测试先覆盖 `ag-psd` 自生成样本与 contract 行为；Photoshop / Photopea / Krita 等外部样本进入仓库后，再把它们纳入 M6 兼容性回归，不用生成样本冒充真实外部兼容性。

---

## 9. 回滚与灰度策略

新增能力必须有 kill switch，默认可以按迭代阶段关闭或灰度开启：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `neko.sketch.psdImport.enabled` | M2 开发期 `false`；M2 验收通过后 `true` | 控制 PSD 导入入口 |
| `neko.sketch.aiOps.enabled` | `false` | AI 总开关，灰度阶段默认关闭 |
| `neko.sketch.aiOps.generate.enabled` | `true` | 受 AI 总开关约束 |
| `neko.sketch.aiOps.inpaint.enabled` | `true` | 受 AI 总开关约束 |
| `neko.sketch.aiOps.styleTransfer.enabled` | `true` | 受 AI 总开关约束 |
| `neko.sketch.aiOps.upscale.enabled` | `true` | 受 AI 总开关约束 |
| `neko.sketch.aiOps.autoLayer.enabled` | `true` | 受 AI 总开关约束 |
| `neko.sketch.aiOps.lineartColorize.enabled` | `true` | 受 AI 总开关约束 |
| `neko.sketch.aiOps.smartSelection.enabled` | `true` | 受 AI 总开关约束 |

有效开启条件为 `neko.sketch.aiOps.enabled && neko.sketch.aiOps.<feature>.enabled`。子开关默认 `true` 表示 AI 总开关打开后该子能力默认可用，并不表示灰度阶段独立开启。

回滚规则：

- PSD import 失败时不修改当前文档。
- AI run 失败或取消时不提交 history。
- 已生成的临时文件按 runId 清理。
- kill switch 关闭后，UI 入口隐藏，Extension 侧消息仍需返回 `kill-switch-disabled` 错误码，避免悬空调用。
- `neko.sketch.aiOps.enabled` 关闭时，`agentCapabilityProvider.ts` 不向 neko-agent 注册 sketch AI tools；子开关关闭时过滤对应工具。
