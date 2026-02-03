# components/

UI 组件库，提供视频编辑器的所有 React 组件。

## 职责

实现视频编辑器的 UI 组件，包括时间线、属性面板、特效编辑等。

## 结构

```
components/
├── index.ts              # 组件导出
├── PreviewPanel.tsx      # 预览面板
├── Toolbar.tsx           # 工具栏
├── Timeline/             # 时间线组件
│   └── TimelineMinimap/  # 时间线缩略图
├── PropertyPanel/        # 属性面板
├── AudioWaveform/        # 音频波形
├── ColorCorrection/      # 色彩校正
├── Effects/              # 特效编辑
├── Mask/                 # 遮罩编辑
├── Subtitles/            # 字幕编辑
├── SpeedControl/         # 速度控制
├── TransitionPicker/     # 转场选择
├── Toast/                # 消息提示
└── ErrorBoundary/        # 错误边界
```

## 主要组件

| 组件 | 用途 |
|------|------|
| `Timeline` | 多轨道时间线编辑器 |
| `PreviewPanel` | 视频预览画布 |
| `PropertyPanel` | 元素属性编辑 |
| `Effects` | 特效参数编辑 |
| `Subtitles` | 字幕编辑器 |
| `TransitionPicker` | 转场效果选择 |

## 依赖

```
→ hooks/          # 自定义 Hooks
→ stores/         # 状态管理
→ utils/          # 工具函数
→ types/          # 类型定义
← App.tsx         # 主应用组件
```
