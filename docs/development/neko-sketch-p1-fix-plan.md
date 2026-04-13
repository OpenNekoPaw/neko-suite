# neko-sketch P1 收尾修复方案

## 状态

`neko-sketch` 当前存在 4 个已识别但未端到端打通的 P1 缺口：

- `SketchCanvas.tsx:1171` 文本工具 overlay 未实现
- `SketchCanvas.tsx:1177` 仿制图章交互逻辑缺失
- `SketchCanvas.tsx:1535` 渐变着色器未渲染到图层 FBO
- `LayerPanel.tsx:65` 图层向下合并未实现

这些问题并非单点 bug，而是“工具入口已存在、算法或 shader 已部分落地，但输入契约、渲染能力、组件通信和历史记录没有闭环”的系统性缺口。

---

## 1. 目标

本方案目标不是继续在 `SketchCanvas.tsx` 中堆叠分支，而是在不破坏现有渲染架构的前提下，补齐以下能力：

1. 为 `text / clone / gradient / merge` 提供可执行的端到端链路。
2. 保持 `WebGLTexture`、`WebGLFramebuffer`、`SketchRenderer` 只存在于 Canvas/Renderer 边界内，不进入 Zustand store。
3. 将“工具事件处理”和“像素/渲染操作”拆分，降低 `SketchCanvas` 复杂度。
4. 为后续 `flatten visible`、可重编辑文本图层、更多像素工具复用同一套基础设施。

---

## 2. 现状与根因

### 2.1 文本工具

现状：

- `SketchCanvas.tsx` 在激活 `text` 工具时直接返回，没有任何编辑态或 overlay。
- `tools/text-tool.ts` 已提供 `renderTextToImageData()`，只能完成文本栅格化。
- `LayerData` 当前没有文本内容、字体、字号、对齐方式等文本元数据字段。

根因：

- 缺少 DOM overlay 编辑层。
- 缺少文本图层数据契约。
- 缺少“确认编辑后写回图层纹理”的统一提交路径。

结论：

- 现在的实现最多只能支持“一次性贴图式文本”，还不能支撑“文本图层”。

### 2.2 仿制图章

现状：

- `tools/clone-tool.ts` 的 `cloneStamp()` CPU 算法已实现。
- `SketchCanvas.tsx` 对 `clone` 工具仅做了分支保护，没有按下、拖拽、源点设置逻辑。
- `StrokePoint` 与 `usePointerInput()` 不携带 `Alt/Ctrl/Shift/Meta` 修饰键。

根因：

- 缺少 `Alt+click` 源点设置能力。
- 缺少 clone 工具自身状态模型。
- 缺少“读取源图层像素 -> 生成工作副本 -> 连续上传纹理”的工具提交链路。

结论：

- 当前不是少写一次 `cloneStamp()` 调用，而是输入契约和工具状态都不完整。

### 2.3 渐变

现状：

- `engine/gradient-shaders.ts` 已定义线性/径向渐变 shader。
- `SketchCanvas.tsx` 仅记录拖拽起点，释放时仍是 TODO。
- `ShaderManager` 未注册 gradient program。
- `RenderPipeline` 没有面向外部的“将全屏 shader 渲染到指定 FBO”能力。

根因：

- 渐变 shader 只有源码，没有进入 renderer 的正式能力面。
- Canvas 工具层无法复用现有 `RenderPipeline` 的 quad/FBO 基础设施。

结论：

- 这里缺的是渲染能力抽象，而不仅是事件分支。

### 2.4 图层合并

现状：

- `LayerPanel.tsx` 右键菜单里存在“向下合并”，但回调为空。
- `LayerPanel` 与 `SketchCanvas` 在 `App.tsx` 中并列挂载，没有命令桥或 renderer 访问通道。
- `layerSlice.ts` 无 `mergeLayerDown` / `flattenVisible` action。
- `HistoryActionType` 已有 `layer-merge`，但 `sketchOperationStore.ts` 无对应记录方法。

根因：

- UI 层能发起意图，但没有应用服务层执行像素合并。
- store 只覆盖基础 CRUD，没有图层合并语义。
- 缺少历史记录与同步层支持。

结论：

- 图层合并是架构缺口，不是组件里补一个匿名函数就能完成。

---

## 3. 设计原则

在进入实现前，统一遵守以下约束：

1. 是否符合现有架构  
   `SketchRenderer`、`RenderPipeline`、`TextureManager` 继续作为唯一 WebGL 权威层；Canvas 仍然是 renderer 的拥有者。

2. 如何进一步降低耦合  
   `LayerPanel` 不直接依赖 renderer，通过 `App` 下发命令接口；像素操作抽到工具模块或渲染能力模块。

3. 是否易于扩展与测试  
   纯算法尽量保持纯函数；有副作用的提交逻辑收敛到少量命令接口，便于单元测试和后续复用。

补充约束：

- 不将 `WebGLTexture`、`WebGLFramebuffer`、`SketchRenderer` 放入 Zustand。
- 不在 `LayerPanel` 中直接进行像素读写。
- 不重复实现已有 GPU 混合逻辑，图层合并优先复用现有 blend 管线。

---

## 4. 推荐总体方案

推荐采用“Canvas 命令桥 + 渲染能力抽象 + 工具状态补全”的组合方案，而不是继续把逻辑堆进 `SketchCanvas.tsx`。

### 4.1 新增 Canvas 命令桥

在 `App.tsx` 维护一组由 `SketchCanvas` 注册的命令接口，供 `LayerPanel` 等并列组件调用。

建议接口：

```ts
export interface SketchCanvasCommands {
  mergeLayerDown(layerId: string): Promise<void>;
  flattenVisible(): Promise<void>;
}
```

职责分层：

- `SketchCanvas`：拥有 renderer，执行像素合并和 FBO 相关操作。
- `App`：桥接命令注册与分发。
- `LayerPanel`：只表达用户意图，不直接触碰 WebGL 对象。

收益：

- 解开 `LayerPanel` 对 renderer 的隐式依赖。
- 为未来 `export layer`、`rasterize selection`、`flatten visible` 复用同一命令面。

### 4.2 补全工具输入契约

扩展 `StrokePoint`，让工具层能读取修饰键。

建议新增字段：

```ts
readonly altKey: boolean;
readonly shiftKey: boolean;
readonly ctrlKey: boolean;
readonly metaKey: boolean;
```

同时更新 `usePointerInput()` 的 `toStrokePoint()`，在 `pointerdown/move/up` 三条路径统一透传。

收益：

- `clone` 能支持 `Alt+click`。
- 后续 `move/selection/zoom` 的组合操作也能复用。

### 4.3 抽离像素与渲染操作

建议把以下能力从 `SketchCanvas.tsx` 的事件分支中抽出：

- 文本提交：`text-raster-ops.ts`
- 仿制图章：`clone-session.ts` 或扩展 `clone-tool.ts`
- 图层合并：`layer-raster-ops.ts`
- 渐变填充：`render-pipeline.ts` 新增能力或独立 `gradient-pass.ts`

目标不是拆文件而拆责任：

- 事件处理保留在组件。
- 像素/纹理变更逻辑由可复用服务执行。

---

## 5. 分项修复方案

### 5.1 文本工具

#### 推荐实现范围

采用“两阶段落地”：

1. 第一阶段：实现最小可用文本 overlay
2. 第二阶段：补齐真正的可重编辑文本图层

#### 第一阶段：最小可用 overlay

在 `SketchCanvas` 内新增绝对定位文本编辑状态：

```ts
interface TextOverlayState {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
}
```

交互流程：

1. 文本工具点击画布，记录文档坐标和屏幕坐标。
2. 在 Canvas 容器上方渲染 `textarea` overlay。
3. 用户确认后，调用 `renderTextToImageData()` 生成 `ImageData`。
4. 获取或创建活动图层纹理，将文本栅格写回图层。
5. 更新当前帧数据、标记 dirty、关闭 overlay。

这一阶段收益：

- 最快恢复可用性。
- 不需要立即改动现有文档格式。

局限：

- 文本不可重编辑。
- 更接近“文本贴图”，不是完整的文本图层。

#### 第二阶段：可重编辑文本图层

给 `LayerData` 补充文本元数据：

```ts
readonly textData?: TextLayerData;
readonly textPosition?: { x: number; y: number };
readonly textBounds?: { x: number; y: number; width: number; height: number };
```

同时约定：

- `type: 'text'` 图层保存文本源数据。
- 纹理仍为渲染缓存。
- 双击文本图层进入 overlay 重新编辑。

建议：

- 若本轮目标是“修复缺口”，优先完成第一阶段。
- 若本轮目标是“实现真正文本图层”，则第一阶段只作为提交 UI，必须同步补 `LayerData` 契约和序列化。

### 5.2 仿制图章

#### 状态模型

建议引入 clone 会话状态：

```ts
interface CloneSessionState {
  readonly sourcePoint: { x: number; y: number } | null;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly baseImageData: ImageData | null;
  readonly workingImageData: ImageData | null;
}
```

#### 算法接口调整

当前 `cloneStamp()` 只接收一个 buffer，会在连续拖拽中污染采样源。建议改成双缓冲签名：

```ts
cloneStamp(
  sourceData: Uint8ClampedArray,
  targetData: Uint8ClampedArray,
  w: number,
  h: number,
  dstX: number,
  dstY: number,
  offsetX: number,
  offsetY: number,
  radius: number,
  hardness: number,
): void
```

#### 事件流

1. `Alt+click`
   设置 source point，并记录偏移基准。

2. 普通按下
   读取活动图层纹理为 `baseImageData`，复制为 `workingImageData`。

3. 拖拽中
   沿路径做插值，多次调用 `cloneStamp(base, working, ...)`，每次更新后上传 `workingImageData` 到图层纹理。

4. 结束
   清理会话状态，同步 frame/history，标记 dirty。

#### 关键决策

- 采样源应固定为 `baseImageData`，避免“已经克隆出来的像素再次被采样”。
- 工作结果写入 `workingImageData`，保证拖拽连续性。

### 5.3 渐变

#### 推荐改法

不建议把渐变直接写成 `SketchCanvas` 内的裸 WebGL 调用，推荐在 `RenderPipeline` 上新增正式能力：

```ts
renderGradientFill(
  state: GradientState,
  targetFbo: WebGLFramebuffer,
  width: number,
  height: number,
): void;
```

实现方式可选：

1. 在 `RenderPipeline` 内懒编译 gradient program
2. 新增独立 `GradientPass`

对当前代码规模而言，优先选择第一种，和现有 mask program 的实现风格保持一致。

#### 提交流程

1. `pointerdown` 记录起点。
2. `pointerup` 根据终点组装 `GradientState`。
3. 获取或创建活动图层纹理和对应 FBO。
4. 调用 `renderGradientFill()` 直接渲染到目标图层。
5. 更新 store、frame、dirty 状态。

#### 参数建议

如果当前没有独立 gradient UI，先采用最小参数集：

- `type`: 默认 `linear`
- `color0`: 当前画笔色
- `color1`: 当前画笔色透明版，或先固定为白到透明/黑到透明中的一种

更完整的实现应增加：

- `gradientType`
- `color0`
- `color1`

这些参数可后续进入 brush/tool slice，但不阻塞第一版可用修复。

### 5.4 图层合并

#### 推荐实现路径

通过命令桥由 `LayerPanel` 发起：

```ts
await canvasCommands.mergeLayerDown(layerId);
```

真正的像素合并在 `SketchCanvas` 内执行，并调用抽离后的图层栅格操作模块。

#### 不推荐方案

不建议在 CPU 侧重新实现 12 种混合模式，因为当前 blend 逻辑已经在 WebGL 管线里稳定存在，重写会导致行为漂移。

#### 推荐实现

新增离屏合成能力，例如：

```ts
compositeLayersToTexture(
  layers: ReadonlyArray<LayerData>,
  width: number,
  height: number,
): WebGLTexture
```

`mergeLayerDown` 流程：

1. 找到当前层和其下方目标层。
2. 仅将这两个图层按现有 blend 规则离屏合成到临时纹理。
3. 把合成结果写回下方目标层。
4. 删除上方源图层。
5. 保持结果层作为普通 raster 层继续存在。
6. 记录 `layer-merge` 历史和操作同步。

#### 语义细节

需要明确以下规则：

1. 偏移烘焙  
   `offsetX/offsetY` 应在合并时烘焙进像素结果，避免合并后再次偏移。

2. 结果层属性归属  
   推荐保留下方层作为结果层，保留其 `id/name/可见性/锁定状态`，纹理被覆盖。

3. blend 语义  
   上方层按当前 `blendMode + opacity` 混合到下方层。

4. adjustment / group / mask  
   第一版只支持 raster + fill + text 这类可栅格化层；若目标层或源层存在复杂掩码/调整层语义，需要在文档中明确“不支持”或额外展开。

#### store 与历史

`layerSlice.ts` 至少新增：

- `mergeLayerDown`
- `flattenVisible`

`sketchOperationStore.ts` 至少新增：

- `recordLayerMerge`

`HistoryActionType` 既然已有 `layer-merge`，实现层必须真正落地，不应继续只停留在类型定义。

---

## 6. 实施顺序

建议按依赖关系分 5 个阶段推进：

### 阶段 1：基础设施

- 增加 `SketchCanvasCommands`
- 在 `App.tsx` 中建立命令桥
- 扩展 `StrokePoint` 与 `usePointerInput()` 修饰键支持
- 抽通通用的纹理读写 helper

### 阶段 2：渐变

- 为 `RenderPipeline` 增加 gradient 渲染能力
- 接通 `gradient` 工具的 down/up 流程
- 验证线性渐变最小可用

原因：

- 依赖最少，能先验证新的 renderer 扩展路径是否合理。

### 阶段 3：仿制图章

- 引入 clone session 状态
- 改造 `cloneStamp()` 为双缓冲
- 接入 `Alt+click` 和拖拽连续提交

### 阶段 4：文本工具

- 先实现 overlay + commit MVP
- 若本轮范围允许，再补 `text` 图层元数据与重编辑能力

### 阶段 5：图层合并

- 实现离屏两层合成
- 接通 `LayerPanel` 菜单动作
- 补齐 `flattenVisible`
- 补齐操作同步和历史记录

---

## 7. 预期改动文件

以下为推荐改动集，不要求一次性全部提交，但建议按模块集中修改。

### 必改

- `packages/neko-sketch/packages/webview/src/components/SketchCanvas.tsx`
- `packages/neko-sketch/packages/webview/src/components/LayerPanel.tsx`
- `packages/neko-sketch/packages/webview/src/App.tsx`
- `packages/neko-sketch/packages/webview/src/hooks/usePointerInput.ts`
- `packages/neko-sketch/packages/webview/src/types/index.ts`
- `packages/neko-sketch/packages/webview/src/engine/render-pipeline.ts`
- `packages/neko-sketch/packages/webview/src/engine/types.ts`
- `packages/neko-sketch/packages/webview/src/stores/slices/layerSlice.ts`
- `packages/neko-sketch/packages/webview/src/stores/sketchOperationStore.ts`

### 建议新增

- `packages/neko-sketch/packages/webview/src/tools/layer-raster-ops.ts`
- `packages/neko-sketch/packages/webview/src/tools/text-overlay-types.ts`

### 可能改造

- `packages/neko-sketch/packages/webview/src/tools/text-tool.ts`
- `packages/neko-sketch/packages/webview/src/tools/clone-tool.ts`
- `packages/neko-sketch/packages/webview/src/tools/gradient-tool.ts`
- `packages/neko-sketch/packages/webview/src/utils/document-serializer.ts`

如果本轮同时实现可重编辑文本图层，则必须同步修改序列化逻辑。

---

## 8. 验收标准

### 文本工具

- 点击文本工具后能够在点击位置出现可输入 overlay。
- 确认后文本正确写入活动图层。
- 多行文本、字号、颜色至少有最小可用行为。
- 取消编辑不会污染图层。

### 仿制图章

- `Alt+click` 能设置源点。
- 正常拖拽能从源区域持续复制像素。
- 连续拖拽不会因采样污染出现结果回读。

### 渐变

- 拖拽一次后活动图层发生渐变填充。
- 线性渐变方向与拖拽方向一致。
- 目标纹理正确写入图层，非只显示在屏幕合成结果中。

### 图层合并

- “向下合并” 可在图层面板触发。
- 合并后图层数量减少 1。
- 结果图层像素与当前 blend/opacity 语义一致。
- 历史记录和操作同步链路不丢失。

---

## 9. 测试建议

### 单元测试

- `clone-tool.ts`
  验证双缓冲采样不会自污染。

- `text-tool.ts`
  验证多行文本、描边、字号输出尺寸与 alpha 合理。

- 新增的图层栅格操作模块
  验证简单的 merge 语义与偏移烘焙。

### 集成验证

- `gradient`
  验证 shader 渲染结果真实写回目标图层纹理。

- `merge`
  至少验证 `normal / multiply / overlay` 3 种典型混合模式。

### 手工回归

- 文本确认/取消
- `Alt+click` 仿制图章源点设置
- 线性渐变拖拽
- 合并后 frame 数据同步
- 合并后 dirty 状态与保存流程

---

## 10. 风险与取舍

### 风险 1：继续在 `SketchCanvas.tsx` 内堆逻辑

后果：

- 组件继续膨胀。
- 后续 `flattenVisible`、文本重编辑、更多像素工具会进一步耦合。

应对：

- 只保留事件调度与 overlay 状态。
- 把像素与渲染提交操作抽离出去。

### 风险 2：CPU 重写 blend 合并逻辑

后果：

- 与现有 GPU blend 行为不一致。
- `overlay / soft-light / dodge` 等模式容易失真。

应对：

- 优先复用现有 WebGL blend 管线做离屏合成。

### 风险 3：文本图层范围失控

后果：

- 只想修 TODO，结果引入大规模文档格式改造。

应对：

- 明确分阶段：本轮优先完成可用 overlay；是否补“可重编辑文本图层”单独决策。

### 风险 4：合并语义一次做太全

后果：

- 调整层、组、mask、偏移一起进入会显著放大实现成本。

应对：

- 第一版先限定在 raster 主路径。
- 复杂层类型在文档中显式标注后续支持策略。

---

## 11. 推荐结论

本轮修复建议采用以下优先级：

1. 先补命令桥和输入契约。
2. 再完成 gradient，打通 renderer 扩展路径。
3. 再完成 clone，复用新的 pointer modifier 契约。
4. 再完成 text overlay 的最小可用版本。
5. 最后完成 merge down / flatten visible，并补齐历史与操作同步。

这样做的原因是：

- 依赖关系最清晰。
- 对现有架构侵入最小。
- 可以在每个阶段都形成可验证、可提交的增量结果。

---

## 12. 后续文档同步建议

在实际代码落地后，建议同步更新以下文档，避免“文档显示已完成，但代码仍是半成品”的状态继续存在：

- `packages/neko-sketch/TODO.md`
- `packages/neko-sketch/ROADMAP.md`
- `packages/neko-sketch/ARCHITECTURE.md`
- 如涉及序列化语义变化，再同步 `README` 或相关 ADR
