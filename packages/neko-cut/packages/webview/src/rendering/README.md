# rendering/

渲染引擎模块，提供 Canvas 2D 的视频渲染能力。

## 职责

封装视频帧渲染和合成能力，提供 Webview 层的渲染接口。

## 架构

```
预览渲染流程：
Timeline (React)
    ↓ IPC (MediaRequestProxy)
Extension FFmpeg 提取帧 (JPEG)
    ↓
Webview ImageBitmap Cache (LRU)
    ↓
Canvas2DRenderEngine 渲染
    ↓
Canvas 显示
```

## 结构

```
rendering/
├── index.ts              # 模块导出
├── canvas2d/             # Canvas 2D 渲染
│   ├── Canvas2DRenderEngine.ts   # 渲染引擎
│   ├── Canvas2DCompositor.ts     # 合成器
│   └── types.ts                  # 类型定义
└── unified/              # 统一渲染管道
    ├── unifiedRenderEngine.ts    # 统一渲染引擎
    ├── mediaFrameProvider.ts     # 帧提供器 (IPC 代理)
    ├── types.ts                  # 类型定义
    ├── renderers/                # 元素渲染器
    │   ├── mediaRenderer.ts      # 视频/图片渲染
    │   ├── textRenderer.ts       # 文本渲染
    │   └── shapeRenderer.ts      # 形状渲染
    └── processors/               # 后处理器
        ├── transitionProcessor.ts    # 转场处理
        └── colorCorrectionProcessor.ts # 颜色校正
```

## 接口

| 导出 | 类型 | 用途 |
|------|------|------|
| `Canvas2DRenderEngine` | 类 | Canvas 2D 渲染引擎 |
| `Canvas2DCompositor` | 类 | Canvas 2D 合成器 |
| `UnifiedRenderEngine` | 类 | 统一渲染引擎 |
| `MediaFrameProvider` | 类 | 帧提供器 (通过 IPC 获取) |

## 依赖

```
→ services/MediaRequestProxy  # IPC 代理，请求 Extension 处理
← hooks/                      # useCompositorRender
← components/                 # PreviewPanel
```

## 技术说明

- **预览渲染**: 使用 Canvas 2D API，帧数据通过 IPC 从 Extension FFmpeg 获取
- **导出渲染**: 由 Extension 端 FFmpeg 完成，Webview 仅显示进度
- **缓存策略**: LRU 缓存 ImageBitmap，减少 IPC 请求
