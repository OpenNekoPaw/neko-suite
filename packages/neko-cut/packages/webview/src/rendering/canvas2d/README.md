# canvas2d/

Canvas 2D 渲染引擎，提供基于 Canvas 2D API 的视频预览渲染能力。

## 职责

使用 Canvas 2D API 实现多图层合成、变换、混合模式、颜色校正等渲染功能。

## 架构

```
Canvas2DRenderEngine (主引擎)
    ↓
Canvas2DCompositor (合成器)
    ↓
Canvas 2D Context (浏览器 API)
```

## 文件说明

| 文件 | 职责 | 导出 |
|------|------|------|
| `Canvas2DRenderEngine.ts` | 渲染引擎主类 | `Canvas2DRenderEngine` |
| `Canvas2DCompositor.ts` | 图层合成器 | `Canvas2DCompositor` |
| `types.ts` | 类型定义和工具函数 | 接口、类型、常量 |
| `index.ts` | 模块导出 | 所有公开 API |

## 核心接口

### Canvas2DRenderEngine

主渲染引擎，负责协调整个渲染流程。

```typescript
class Canvas2DRenderEngine {
  // 初始化
  async initialize(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<boolean>

  // 渲染单帧
  async renderFrame(project: ProjectData, time: number): Promise<void>

  // 清理资源
  dispose(): void

  // 状态查询
  get isInitialized(): boolean
  get width(): number
  get height(): number
}
```

**使用场景**：
- 时间线预览渲染
- 实时播放
- 缩略图生成

### Canvas2DCompositor

图层合成器，负责多图层的合成和特效应用。

```typescript
class Canvas2DCompositor implements ICanvas2DCompositor {
  // 初始化
  async initialize(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<boolean>

  // 合成图层
  composite(layers: Canvas2DLayer[]): void

  // 清空画布
  clear(): void

  // 调整大小
  resize(width: number, height: number): void
}
```

**支持的功能**：
- 多图层合成
- 变换（位置、缩放、旋转）
- 混合模式（15 种 CSS 支持的模式）
- 颜色校正（亮度、对比度、饱和度等）
- 蒙版（基础支持）
- 不透明度

## 类型定义

### Canvas2DLayer

图层数据结构：

```typescript
interface Canvas2DLayer {
  id: string;                          // 图层 ID
  source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;
  transform?: Canvas2DTransform;       // 变换参数
  opacity?: number;                    // 不透明度 (0-1)
  blendMode?: BlendModeType;          // 混合模式
  colorCorrection?: Canvas2DColorCorrection;  // 颜色校正
  mask?: MaskInstance;                 // 蒙版
  zIndex?: number;                     // 层级
}
```

### Canvas2DTransform

变换参数：

```typescript
interface Canvas2DTransform {
  x: number;          // X 位置 (0-1 归一化)
  y: number;          // Y 位置 (0-1 归一化)
  scaleX: number;     // X 缩放
  scaleY: number;     // Y 缩放
  rotation: number;   // 旋转角度（度）
  anchorX: number;    // 锚点 X (0-1)
  anchorY: number;    // 锚点 Y (0-1)
}
```

### Canvas2DColorCorrection

颜色校正参数（使用 CSS filter）：

```typescript
interface Canvas2DColorCorrection {
  brightness?: number;   // 亮度 (-1 到 1)
  contrast?: number;     // 对比度 (-1 到 1)
  saturation?: number;   // 饱和度 (-1 到 1)
  hueRotate?: number;    // 色调旋转（度）
  invert?: number;       // 反转 (0 到 1)
  sepia?: number;        // 棕褐色 (0 到 1)
  grayscale?: number;    // 灰度 (0 到 1)
  blur?: number;         // 模糊（像素）
}
```

## 混合模式支持

支持 15 种 Canvas 2D 原生混合模式：

| 模式 | globalCompositeOperation |
|------|-------------------------|
| normal | source-over |
| multiply | multiply |
| screen | screen |
| overlay | overlay |
| darken | darken |
| lighten | lighten |
| color-dodge | color-dodge |
| color-burn | color-burn |
| hard-light | hard-light |
| soft-light | soft-light |
| difference | difference |
| exclusion | exclusion |
| hue | hue |
| saturation | saturation |
| color | color |
| luminosity | luminosity |

**不支持的混合模式**（需要自定义 shader）：
- vivid-light
- linear-light
- pin-light
- hard-mix
- subtract
- divide

## 渲染流程

```
1. 初始化
   Canvas2DRenderEngine.initialize(canvas)
       ↓
   Canvas2DCompositor.initialize(canvas)

2. 渲染帧
   renderFrame(project, time)
       ↓
   获取当前时间的所有可见元素
       ↓
   为每个元素准备 Canvas2DLayer
       ↓
   Canvas2DCompositor.composite(layers)
       ↓
   应用变换 → 混合模式 → 颜色校正 → 蒙版
       ↓
   绘制到画布

3. 清理
   dispose()
       ↓
   释放所有资源
```

## 性能优化

### 已实现

1. **ImageBitmap 缓存**：复用已解码的图像数据
2. **离屏渲染**：使用 OffscreenCanvas 减少主线程阻塞
3. **CSS Filter**：使用硬件加速的 CSS filter 进行颜色校正
4. **条件渲染**：跳过不可见或透明度为 0 的图层

### 性能指标

```
单图层渲染：1-2ms
4 图层合成：3-5ms
带颜色校正：+1-2ms
带蒙版：+2-3ms
```

## 限制

1. **混合模式**：仅支持 Canvas 2D 原生的 15 种模式
2. **蒙版**：仅支持简单的 alpha 蒙版，不支持复杂矢量蒙版
3. **特效**：复杂特效（如粒子、自定义 shader）需要逐帧渲染
4. **性能**：大分辨率（4K+）渲染可能较慢

## 与 Extension FFmpeg 的关系

```
预览渲染（Webview）：
  Extension FFmpeg 提取帧 → ImageBitmap → Canvas2DRenderEngine → Canvas 显示

导出渲染（Extension）：
  Extension FFmpeg 多轨合成 → 逐帧渲染 → 编码 → 输出文件
```

**职责划分**：
- **Canvas2DRenderEngine**：仅用于 Webview 预览渲染
- **Extension FFmpeg**：用于最终视频导出

## 使用示例

### 基础渲染

```typescript
import { Canvas2DRenderEngine } from './canvas2d';

const canvas = document.getElementById('preview') as HTMLCanvasElement;
const engine = new Canvas2DRenderEngine();

await engine.initialize(canvas);
await engine.renderFrame(project, currentTime);
```

### 自定义合成

```typescript
import { Canvas2DCompositor } from './canvas2d';

const compositor = new Canvas2DCompositor();
await compositor.initialize(canvas);

const layers: Canvas2DLayer[] = [
  {
    id: 'bg',
    source: backgroundImage,
    zIndex: 0,
  },
  {
    id: 'video',
    source: videoFrame,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    opacity: 0.8,
    blendMode: 'multiply',
    zIndex: 1,
  },
];

compositor.composite(layers);
```

## 依赖

```
→ types/                    # 项目类型定义
→ services/MediaRequestProxy  # IPC 代理（获取帧数据）
← hooks/useCanvas2DRender   # React Hook
← components/PreviewPanel   # 预览组件
```

## 测试

```bash
npm run test -- canvas2d
```

测试覆盖：
- ✅ 初始化和清理
- ✅ 基础渲染
- ✅ 变换应用
- ✅ 混合模式
- ✅ 颜色校正
- ✅ 多图层合成
