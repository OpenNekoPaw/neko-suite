# @uniedit/webview

UniEdit 视频编辑器的 Webview UI 包，基于 React + Zustand + Tailwind CSS 构建，运行在 VSCode Webview 沙箱中。

## 概述

本包提供视频编辑器的主界面，包括：
- 时间线编辑器（多轨道、拖拽、缩放）
- 预览画布（实时渲染、GPU 加速）
- 属性面板（元素属性编辑）
- 特效、转场、遮罩、字幕编辑
- 视频导出功能

## 目录结构

```
src/
├── main.tsx            # 入口文件
├── App.tsx             # 主应用组件
├── constants.ts        # 常量定义
├── index.css           # 全局样式
├── propertyPanel.tsx   # 属性面板入口
├── types.ts            # 本地类型定义
│
├── components/         # UI 组件
│   ├── Timeline/       # 时间线组件
│   ├── PropertyPanel/  # 属性面板组件
│   ├── AudioWaveform/  # 音频波形显示
│   ├── ColorCorrection/# 色彩校正
│   ├── Effects/        # 特效编辑器
│   ├── Mask/           # 遮罩编辑器
│   ├── Subtitles/      # 字幕编辑器
│   ├── SpeedControl/   # 速度控制
│   ├── TransitionPicker/ # 转场选择器
│   ├── Toast/          # 消息提示
│   └── ErrorBoundary/  # 错误边界
│
├── stores/             # Zustand 状态管理
│   └── slices/         # 状态切片
│
├── hooks/              # 自定义 Hooks
│
├── utils/              # 工具函数
│   └── export/         # 导出相关
│
├── rendering/          # 渲染引擎
│   └── unified/        # 统一渲染器
│       ├── renderers/  # WebGPU/WebGL 渲染器
│       └── processors/ # 效果处理器
│
├── tools/              # AI Tools 处理
│   └── handlers/       # 工具处理器
│
├── types/              # 类型定义
│
├── i18n/               # 国际化
│   └── locales/        # 语言包
│
└── __tests__/          # 测试文件
```

## 核心模块

### components/Timeline/
时间线编辑器核心组件：
- 多轨道管理
- 拖拽编辑
- 缩放和滚动
- 选择和多选
- 关键帧编辑

### stores/
Zustand 状态管理：
- 项目状态（时间线、轨道、元素）
- UI 状态（选中项、播放位置）
- 渲染状态（预览、导出进度）

### rendering/unified/
统一渲染引擎：
- WebGPU 渲染器（首选）
- WebGL 渲染器（降级）
- 效果处理器（滤镜、转场）

### hooks/
自定义 Hooks：
- `useTimeline` - 时间线操作
- `usePlayback` - 播放控制
- `useSelection` - 选择管理
- `useRendering` - 渲染控制

## 依赖关系

```
webview
    ├── @uniedit/shared        # 共享类型定义
    ├── react / react-dom      # UI 框架
    ├── zustand                # 状态管理
    ├── tailwindcss            # CSS 框架
    └── mediabunny             # 媒体编解码
```

## 构建命令

```bash
# 开发模式
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

## 与 Extension Host 通信

Webview 运行在沙箱中，无法直接访问 Node.js API 或文件系统。所有需要 Node.js 能力的操作通过 postMessage 请求 Extension Host 代理：

```typescript
// 发送消息到 Extension Host
vscode.postMessage({ type: 'readFile', path: '/path/to/file' });

// 接收来自 Extension Host 的消息
window.addEventListener('message', (event) => {
  const message = event.data;
  // 处理响应
});
```

## 技术限制

1. **无 Node.js API**：不能使用 `fs`、`path` 等模块
2. **无 VSCode API**：不能直接调用 `vscode.workspace` 等
3. **资源加载**：只能加载经过 `asWebviewUri()` 转换的资源
4. **独立进程**：Webview 运行在独立渲染进程中

## 性能优化

- 使用 Canvas 2D 渲染，帧数据通过 IPC 从 Extension FFmpeg 获取
- 虚拟化长列表（时间线轨道）
- 防抖/节流频繁操作
- 懒加载组件和资源
