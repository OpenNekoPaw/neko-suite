# Neko Tools

> 通用工具：图片、视频、音频 diff 工具，媒体信息查看

## Context Summary

- **项目**：Neko Creator Suite - VS Code 全能内容创作工作站
- **角色**：媒体工具，Diff 比较与信息查看
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Tools** 是 Neko Creator Suite 的通用工具集，提供图片、视频、音频的 Diff 比较功能，以及媒体信息查看等实用工具。帮助创作者快速对比不同版本的媒体文件，了解文件详细信息。

---

## 核心功能

| 功能 | 说明 |
|------|------|
| **图片 Diff** | 对比两张图片的差异 |
| **视频 Diff** | 对比两个视频的差异 |
| **音频 Diff** | 对比两个音频的差异 |
| **资产变体 Diff** | 对比资产的不同变体 |
| **媒体信息** | 查看媒体文件详细信息 |

---

## Diff 模式

| 模式 | 说明 |
|------|------|
| `side-by-side` | 左右并排对比 |
| `overlay` | 叠加对比 |
| `slider` | 滑动对比 |

---

## 支持格式

| 类型 | 格式 |
|------|------|
| **图片** | PNG, JPG, JPEG, GIF, WebP, BMP, SVG |
| **视频** | MP4, MOV, AVI, MKV, WebM, M4V |
| **音频** | MP3, WAV, OGG, FLAC, AAC, M4A |

---

## 配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `neko.tools.diffMode` | `side-by-side` | 默认 Diff 模式 |
| `neko.tools.showMetadata` | `true` | 显示元数据 |

---

## 命令

| 命令 | 说明 |
|------|------|
| `Neko Tools: Compare Files` | 比较文件 |
| `Neko Tools: Compare Images` | 比较图片 |
| `Neko Tools: Compare Videos` | 比较视频 |
| `Neko Tools: Compare Audio Files` | 比较音频 |
| `Neko Tools: Compare Asset Variants` | 比较资产变体 |
| `Neko Tools: Show Media Info` | 显示媒体信息 |

---

## 使用方式

### 方式一：右键菜单

1. 在资源管理器中选择两个媒体文件
2. 右键选择 `Compare Files`

### 方式二：命令面板

1. 打开命令面板 (`Cmd/Ctrl + Shift + P`)
2. 输入 `Neko Tools: Compare`
3. 选择要比较的文件

---

## 媒体信息

查看媒体文件的详细信息：

```
文件：video.mp4
────────────────────
格式：MP4 (H.264)
分辨率：1920 x 1080
帧率：30 fps
时长：00:05:30
比特率：8000 kbps
音频：AAC, 48000 Hz, Stereo
文件大小：328.5 MB
创建时间：2024-01-15 10:30:00
```

---

## 依赖关系

```
neko-tools (独立)
    ├── sharp (图片处理)
    └── @uniedit/shared (类型)
```

---

## 技术栈

- **图片处理**：Sharp
- **视频分析**：WebCodecs / FFprobe
- **UI**：React 18
- **类型**：@uniedit/shared

---

## License

MIT
