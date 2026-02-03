# NekoCanvas

> 渲染核心：支持 2D/3D 混合、后期特效与 4K 实时预览

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：画布编辑器，WebGPU 渲染核心
- **规范**：[README.md](../../README.md)

---

## 概述

**NekoCanvas** 是 Neko Suite 的渲染核心，提供 2D/3D 混合渲染能力。利用 WebGPU 在 GPU 显存中直接合成视频帧、3D 模型与手绘图层，支持非破坏性编辑和 4K 实时预览。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **画布编辑** | 无限画布、自由缩放、平移 |
| **形状绘制** | 矩形、圆形、多边形、路径 |
| **图层管理** | 图层堆叠、混合模式、透明度 |
| **资产库** | 素材管理、分类、搜索 |
| **模板系统** | 模板保存、应用、分享 |
| **WebGPU 渲染** | GPU 加速合成、实时预览 |

---

## 文件格式

| 扩展名 | 说明 |
|--------|------|
| `.jvc` | JSON Visual Canvas - 画布项目文件 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `NekoCanvas: New Canvas` | 新建画布 |
| `NekoCanvas: Add Shape` | 添加形状 |
| `NekoCanvas: Import Asset` | 导入资产 |
| `NekoCanvas: Search Assets` | 搜索资产 |
| `NekoCanvas: Apply Template` | 应用模板 |
| `NekoCanvas: Save as Template` | 保存为模板 |

---

## 架构

```
neko-canvas/
├── packages/
│   ├── extension/           # VS Code 扩展 (Host)
│   │   └── src/
│   │       ├── extension.ts # 扩展入口
│   │       ├── api.ts       # 导出 API
│   │       ├── editor/      # 画布编辑器
│   │       └── views/       # 资产库视图
│   │
│   └── webview/             # React UI (Webview)
│       └── src/
│           ├── components/  # UI 组件
│           │   ├── InfiniteCanvas.tsx
│           │   ├── nodes/   # 节点组件
│           │   ├── connections/
│           │   └── controls/
│           ├── hooks/       # 自定义 Hooks
│           ├── stores/      # Zustand 状态
│           └── services/    # 通信服务
│
├── dist/                    # 构建产物
│   ├── extension.js
│   └── webview/
│
└── package.json             # VS Code 扩展配置
```

---

## WebGPU 渲染管线

```
输入层
    │
    ├── 视频帧 (WebCodecs)
    ├── 图片资源 (ImageBitmap)
    ├── 3D 模型 (glTF)
    └── 手绘路径 (neko-sketch)
            │
            ▼
    ┌─────────────────┐
    │  GPU Compositor │
    │  (WebGPU)       │
    ├─────────────────┤
    │ • 纹理合成      │
    │ • 混合模式      │
    │ • 特效处理      │
    │ • 色彩校正      │
    └─────────────────┘
            │
            ▼
    输出 (Canvas / 导出)
```

---

## 依赖关系

```
neko-canvas
    └── @neko/shared (类型)
```

---

## 技术栈

- **渲染**：WebGPU / WebGL
- **UI**：React 18 + Zustand
- **构建**：Vite

---

## License

MIT
