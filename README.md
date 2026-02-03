# Neko Suite

> 全能内容创作 IDE - 深度集成于 VS Code 的视频编辑工作站

[![Status](https://img.shields.io/badge/Status-Alpha-orange)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-blue)]()

**Neko Suite** 是一款专为开发者设计的、深度集成于 VS Code 的「全能内容创作工作站」。它通过 **Sidecar 独立进程架构** 突破了编辑器性能限制，实现了从剧本创作到 4K 视频合成、3D 渲染及虚拟直播的完整闭环。

📋 **[查看开发路线图 →](./ROADMAP.md)**

---

## 特性亮点

- **AI 驱动创作** - 通过 Agent Skills 将自然语言转化为剪辑操作
- **专业级时间线** - 多轨道、关键帧动画、精确到帧的编辑
- **高性能渲染** - WebGPU/WebCodecs 加速，4K 实时预览
- **Git 原生支持** - 项目文件为文本格式，支持版本控制和协作
- **模块化架构** - 按需安装，独立升级

---

## 快速开始

### 安装依赖

```bash
npm install
```

### 构建 + 打包

```bash
./build.sh
```

### 安装到 VS Code

```bash
./install.sh
```

### 开发模式

```bash
npm run dev
```

---

## 模块架构

Neko Suite 采用 **Monorepo（单仓多插件）** 模式，包含 1 个主包 + 10 个子插件：

| 模块 | 职能 | 状态 |
|------|------|------|
| **neko-suite** | Extension Pack 门户 | Stable |
| **neko-cut** | 视频剪辑器 - 时间线编辑 | Alpha |
| **neko-engine** | 媒体引擎 - FFmpeg 编解码 | Alpha |
| **neko-agent** | AI Agent - 智能创作助手 | Alpha |
| **neko-canvas** | 画布渲染 - 2D/3D 合成 | WIP |
| **neko-story** | 剧本编辑器 - LSP 支持 | Planned |
| **neko-sketch** | 绘图工具 - 压感手绘 | Planned |
| **neko-audio** | 音频工作站 - 波形编辑 | Planned |
| **neko-live** | 虚拟直播 - 动捕 AR | Planned |
| **neko-assets** | 资产管理 - Git/LFS 同步 | Planned |
| **neko-tools** | 媒体工具 - Diff 比较 | WIP |

---

## 核心技术

### 1. AI Agent Skills 驱动

用户无需手动剪辑，通过 **neko-agent** 直接将剧本转化为操作指令。AI 通过 Agent Skills 直接操作渲染引擎，实现"所见即所得"的无感创作。

```
用户意图 → neko-agent (LLM + Skills) → neko-cut/canvas 执行
```

### 2. WebGPU 渲染闭环

利用 **neko-canvas** 将 3D 模型、视频帧与 **neko-sketch** 的手绘路径在 GPU 显存中直接合成。支持非破坏性改图，渲染性能超越传统 CPU 剪辑软件。

```
视频帧 + 3D 模型 + 手绘图层 → WebGPU Compositor → 实时预览/导出
```

### 3. Sidecar 性能隔离

核心计算逻辑驻留在 **neko-engine** 独立进程中。通过 WebSocket 或共享内存与 VS Code 通讯，彻底解决大文件读写与 FFmpeg 运行导致的编辑器卡顿问题。

```
VS Code Extension Host ←─ WebSocket ─→ neko-engine (Rust/Node.js)
                                              │
                                              ├─ FFmpeg 编解码
                                              ├─ 帧缓存服务
                                              └─ 导出渲染
```

---

## 工作流

```
┌─────────────────────────────────────────────────────────────────────┐
│  文 → 智 → 画 → 音 → 发                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 文：在 VS Code 原生编辑器中使用 Markdown 编写 neko-story 剧本     │
│         ↓                                                           │
│  2. 智：neko-agent 自动解析剧本，在时间线摆放素材并生成预览           │
│         ↓                                                           │
│  3. 画：在 neko-canvas 中使用手写板通过 neko-sketch 进行实时改图      │
│         ↓                                                           │
│  4. 音：在 neko-audio 中录制画外音，并由 AI 自动完成降噪对齐          │
│         ↓                                                           │
│  5. 发：通过 Git 提交代码即触发 neko-assets 的 CI/CD 自动渲染并发布   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
neko-suite/
├── packages/
│   ├── neko-suite/            # Extension Pack 门户
│   ├── neko-engine/           # Sidecar 计算引擎
│   ├── neko-story/            # 剧本编辑器 (LSP)
│   ├── neko-cut/              # 视频剪辑器
│   │   └── packages/
│   │       └── webview/       # React UI
│   ├── neko-canvas/           # 画布编辑器
│   │   └── packages/
│   │       └── canvas/        # Canvas UI
│   ├── neko-sketch/           # 绘图工具
│   ├── neko-audio/            # 音频工作站
│   ├── neko-agent/            # AI Agent
│   │   └── packages/
│   │       └── assistant/     # AI 助手 UI
│   ├── neko-live/             # 虚拟直播
│   ├── neko-assets/           # 资产管理
│   ├── neko-tools/            # 媒体工具
│   └── neko-types/            # 共享类型
├── package.json               # 根 package.json (workspaces)
├── ROADMAP.md                 # 开发路线图
├── CLAUDE.md                  # 开发规范
└── tsconfig.json              # 全局 TS 配置
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **Frontend** | React 18 + Zustand + Tailwind CSS + Vite |
| **Extension** | VS Code Extension API + TypeScript + esbuild |
| **Media** | WebCodecs + WebGPU/WebGL + FFmpeg |
| **AI** | Claude API + OpenAI API + MCP Protocol |
| **Testing** | Vitest |
| **Build** | pnpm workspaces + Turbo (Monorepo) |

---

## 支持的媒体格式

| 类型 | 格式 |
|------|------|
| **视频** | MP4, MOV, AVI, MKV, WebM, M4V |
| **音频** | MP3, WAV, OGG, FLAC, AAC, M4A |
| **图片** | PNG, JPG, JPEG, GIF, WebP, BMP, SVG |
| **项目** | .jvi (视频项目), .jvc (画布项目), .nks (剧本) |

---

## 安装方式

### 方式一：完整安装（推荐）

安装 `Neko Suite` 即可获得所有功能：

```
ext install neko.neko-suite
```

### 方式二：按需安装

根据需求单独安装子插件：

- **仅剪辑**：`neko-cut` + `neko-engine`
- **仅直播**：`neko-live` + `neko-canvas`
- **仅 AI**：`neko-agent`

---

## 文档

- [ROADMAP.md](./ROADMAP.md) - 开发路线图和功能规划
- [CLAUDE.md](./CLAUDE.md) - 开发规范和架构指南
- [packages/neko-types/README.md](./packages/neko-types/README.md) - 类型定义文档

---

## 贡献

欢迎参与 Neko Suite 的开发！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

详细开发规范请参考 [CLAUDE.md](./CLAUDE.md)。

---

## License

MIT

---

## 致谢

- [VS Code](https://code.visualstudio.com/) - 强大的编辑器平台
- [FFmpeg](https://ffmpeg.org/) - 媒体处理基础设施
- [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) - 浏览器原生编解码
