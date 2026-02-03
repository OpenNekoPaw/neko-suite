# Neko Creative Suite

> 门户总管：管理全家桶安装、全局配置与插件间通讯

## Context Summary

- **项目**：Neko Creator Suite - VS Code 全能内容创作工作站
- **角色**：Extension Pack，一键安装所有子插件
- **规范**：[README.md](../../README.md)

---

## 概述

**Neko Creative Suite** 是 Neko Creator Suite 的门户入口，作为 VS Code Extension Pack，它将所有子插件打包在一起，用户只需安装这一个扩展即可获得完整的创作能力。

---

## 包含的扩展

| 扩展 | 功能 |
|------|------|
| **neko-server** | Sidecar 计算引擎，FFmpeg 编解码 |
| **neko-story** | 剧本编辑器，LSP 支持 |
| **neko-cut** | 视频剪辑器，时间线编辑 |
| **neko-canvas** | 画布编辑器，2D/3D 渲染 |
| **neko-sketch** | 绘图工具，压感手绘 |
| **neko-audio** | 音频工作站，波形编辑 |
| **neko-agent** | AI Agent，自然语言驱动 |
| **neko-live** | 虚拟直播，动捕 AR |
| **neko-script** | 脚本协议，自动化剪辑 |
| **neko-assets** | 资产管理，Git/LFS 同步 |
| **neko-tools** | 媒体工具，Diff 比较 |

---

## 安装方式

### 方式一：完整安装（推荐）

安装 `Neko Creative Suite` 即可获得所有功能：

```
ext install neko.neko-creative-suite
```

### 方式二：按需安装

根据需求单独安装子插件：

- **仅剪辑**：`neko-cut` + `neko-server`
- **仅直播**：`neko-live` + `neko-canvas`
- **仅 AI**：`neko-agent`

---

## 依赖关系

```
neko-creative-suite (Extension Pack)
    ├── neko-server      (独立)
    ├── neko-story       (独立)
    ├── neko-cut         (依赖 neko-server)
    ├── neko-canvas      (独立)
    ├── neko-sketch      (依赖 neko-canvas)
    ├── neko-audio       (独立)
    ├── neko-agent       (独立)
    ├── neko-live        (独立)
    ├── neko-script      (独立)
    ├── neko-assets      (独立)
    └── neko-tools       (独立)
```

---

## License

MIT
