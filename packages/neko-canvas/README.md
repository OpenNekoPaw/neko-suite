# NekoCanvas

> 渲染核心：2D/3D 混合渲染、WebGPU 加速、4K 实时预览

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：Extension Host + Webview (React + WebGPU) 双进程
- 规范：[CLAUDE.md](../../CLAUDE.md)

## Quick Reference

- **职责**：无限画布编辑、2D/3D 混合 GPU 合成、图层管理、节点图
- **入口**：`packages/extension/src/extension.ts`
- **项目格式**：`.jvc`（JSON Visual Canvas）
- **子包**：`extension/`（Host）、`webview/`（React UI）
- **依赖**：`@neko/shared`
- **激活依赖**：neko-engine、neko-tools、neko-preview
- **节点类型**：Media / Storyboard / Annotation / Text / Artboard / Group（6 种）
- **核心功能**：富文本编辑、分组管理、连接标签、图层面板、画板导出、原地粘贴

## Architecture

```
Extension Host
  ├── CanvasEditorProvider  → CustomEditorProvider（.jvc 文件）
  └── AssetLibrary 视图

Webview (React + Vite)
  ├── InfiniteCanvas        → 无限画布，鼠标/触摸交互
  ├── GPU Compositor        → WebGPU 纹理合成管线
  │   ├── 视频帧（WebCodecs）
  │   ├── 图片（ImageBitmap）
  │   ├── 3D 模型（glTF）
  │   └── 手绘路径（neko-sketch 注入）
  ├── 图层管理（混合模式、透明度）
  └── Zustand Store         → 画布状态
```

### 包结构

```
packages/
├── extension/src/
│   ├── editor/     # CanvasEditorProvider
│   └── views/      # 资产库侧边栏
└── webview/src/
    ├── components/ # InfiniteCanvas + 节点组件
    ├── hooks/      # 交互 Hooks
    ├── stores/     # Zustand 状态
    └── services/   # postMessage 通信
```

### 技术栈

WebGPU / WebGL、React 18、Zustand、Tailwind CSS、Vite
