# NekoCut

> 剪辑中枢：管理时间线轨道、关键帧动画与素材同步

## Context Summary

- **项目**：Neko Suite - VS Code 全能内容创作工作站
- **角色**：视频剪辑器，时间线编辑核心
- **规范**：[README.md](../../README.md)

---

## 概述

**NekoCut** 是 Neko Suite 的视频剪辑核心，提供专业级的时间线编辑能力。支持多轨道合成、关键帧动画、特效转场、色彩校正等完整的视频制作功能。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **时间线编辑** | 多轨道、拖拽操作、吸附对齐 |
| **关键帧动画** | 位置、缩放、旋转、透明度动画 |
| **特效系统** | 滤镜、模糊、色彩校正 |
| **转场效果** | 淡入淡出、滑动、缩放等 |
| **遮罩编辑** | 形状遮罩、路径遮罩 |
| **音频处理** | 波形显示、音量调节、淡入淡出 |
| **字幕编辑** | SRT/VTT 导入、样式设置 |
| **视频导出** | MP4、WebM 等格式导出 |

---

## 文件格式

| 扩展名 | 说明 |
|--------|------|
| `.jvi` | JSON Video Instructions - 视频项目文件 |

---

## 项目文件结构

```json
{
  "name": "My Video Project",
  "resolution": { "width": 1920, "height": 1080 },
  "fps": 30,
  "tracks": [
    {
      "id": "track-1",
      "name": "Video Track",
      "type": "media",
      "elements": [
        {
          "id": "element-1",
          "type": "media",
          "src": "intro.mp4",
          "startTime": 0,
          "duration": 10
        }
      ]
    }
  ]
}
```

---

## 命令

| 命令 | 说明 |
|------|------|
| `NekoCut: New Project` | 新建项目 |
| `NekoCut: Add to Timeline` | 添加素材到时间线 |
| `NekoCut: Export Video` | 导出视频 |
| `NekoCut: Add Track` | 添加轨道 |
| `NekoCut: Add Effect` | 添加特效 |
| `NekoCut: Add Transition` | 添加转场 |
| `NekoCut: Add Keyframe` | 添加关键帧 |

---

## 快捷键

| 快捷键 | 操作 |
|--------|------|
| `Space` | 播放/暂停 |
| `Cmd/Ctrl + Z` | 撤销 |
| `Cmd/Ctrl + Shift + Z` | 重做 |
| `N` | 切换吸附 |
| `R` | 切换波纹编辑 |
| `F` | 切换帧对齐 |
| `Delete` | 删除选中元素 |

---

## 架构

```
NekoCut Extension
    │
    ├── src/extension.ts      # 扩展入口
    │
    └── packages/webview/     # React UI
            │
            ├── components/   # UI 组件
            │   ├── Timeline/
            │   ├── Preview/
            │   └── PropertyPanel/
            │
            ├── stores/       # Zustand 状态
            │
            └── rendering/    # WebGPU/WebGL 渲染
```

---

## 依赖关系

```
neko-cut
    ├── neko-engine (扩展依赖)
    ├── @neko/platform (平台服务)
    ├── @neko/shared (类型)
    └── @neko/native-napi (媒体处理)
```

---

## 技术栈

- **UI**：React 18 + Zustand + Tailwind CSS
- **渲染**：WebGPU / WebGL
- **媒体**：WebCodecs + FFmpeg
- **构建**：Vite + esbuild

---

## License

MIT
