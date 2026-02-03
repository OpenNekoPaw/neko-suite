# utils/

工具函数库，提供通用工具函数和导出适配器。

## 职责

提供 ID 生成、时间格式化、媒体类型检测、导出适配器等工具。

## 结构

```
utils/
├── index.ts                  # 工具导出
├── framePreloader.ts         # 帧预加载器
├── vscodeApi.ts              # VSCode API 封装
└── export/                   # 导出相关
    ├── IExportEngine.ts              # 导出引擎接口
    ├── ExportEngineFactory.ts        # 导出引擎工厂
    ├── StreamingFFmpegExportAdapter.ts  # 流式 FFmpeg 导出适配器 (MP4/WebM)
    ├── WebviewExportAdapter.ts       # 纯 Webview 导出适配器 (MP4/WebM)
    └── CanvasExportAdapter.ts        # Canvas 导出适配器 (GIF/图片序列)
```

## 主要导出

| 函数/类 | 用途 |
|---------|------|
| `generateId()` | 生成唯一 ID |
| `formatTimeShort()` | 格式化时间（MM:SS） |
| `formatTimeFull()` | 格式化时间（MM:SS.ms） |
| `getEffectiveDuration()` | 计算有效时长 |
| `getMediaType()` | 检测媒体类型 |
| `createExportEngine()` | 创建导出引擎 |
| `FramePreloader` | 帧预加载器 |

## 依赖

```
→ @uniedit/shared        # 类型定义
→ services/              # IPC 代理
← components/            # UI 组件
← hooks/                 # Hooks
```

## 工具分类

```
ID 生成: generateId
时间处理: formatTimeShort, formatTimeFull
时间线计算: getEffectiveDuration, getElementEndTime, rangesOverlap
媒体检测: getMediaType, isVideoFile, isAudioFile, isImageFile
DOM 工具: isInputElement, hasParentWithClass
导出: createExportEngine, ExportEngineFactory
预加载: FramePreloader
```

## 导出架构

```
ExportPanel (React)
    ↓
ExportEngineFactory.create(format)
    ├─ MP4/WebM → StreamingFFmpegExportAdapter (GPU 渲染 → Extension FFmpeg 编码)
    ├─ MP4/WebM → WebviewExportAdapter (纯 Webview: WebCodecs + libav.js)
    └─ GIF/图片序列 → CanvasExportAdapter (Webview 端 Canvas 2D 渲染)
```
