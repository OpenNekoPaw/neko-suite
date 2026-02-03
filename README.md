# Neko Suite：全能内容创作 IDE 架构白皮书

**Neko Suite** 是一款专为开发者设计的、深度集成于 VS Code 的「全能内容创作工作站」。它通过 **Sidecar 独立进程架构** 突破了编辑器性能限制，实现了从剧本创作到 4K 视频合成、3D 渲染及虚拟直播的完整闭环。

---

## 一、核心架构：1 主包 + 11 子插件

为了保证极致的性能和按需加载，套件采用了 **Monorepo（单仓多插件）** 模式开发。

| 模块名称 | 定位与核心职能 | 技术底座 |
|---------|--------------|---------|
| **neko-suite** | 门户总管：管理全家桶安装、全局配置与插件间通讯 | VS Code Extension Pack |
| **neko-engine** | 动力引擎：独立侧边进程，处理 FFmpeg 编解码与重度计算 | Rust / Node.js + FFmpeg |
| **neko-story** | 文学入口：利用 VS Code 原生编辑器，实现「文驱动制片」 | LSP (语言服务器协议) |
| **neko-cut** | 剪辑中枢：管理时间线轨道、关键帧动画与素材同步 | Webview + React |
| **neko-canvas** | 渲染核心：支持 2D/3D 混合、后期特效与 4K 实时预览 | WebGPU + WebCodecs |
| **neko-sketch** | 绘图增强：注入 Canvas 的 Krita 级改图工具，支持压感手绘 | Canvas 2D/GPU Pipeline |
| **neko-audio** | 音频工站：独立波形编辑、频谱分析、麦克风录制与降噪 | Web Audio API |
| **neko-agent** | AI 大脑：接收自然语言意图，分发 Neko-Script 指令 | LLM / Copilot API |
| **neko-live** | 虚拟制片：摄像头驱动 3D 虚拟形象，支持动捕与 AR 直播 | MediaPipe + VMC |
| **neko-script** | 通讯协议：AI 指令流与自动化剪辑的底层标准语言 | TypeScript / JSON |
| **neko-assets** | 资产管理：版本控制 (Git/LFS)、云端同步、CI/CD 自动渲染 | rclone / GitHub Actions |
| **neko-tools** | 通用工具：图片、视频、音频 diff 工具，媒体信息查看 | Sharp / WebCodecs |
| **neko-types** | 交互契约：跨包共享的类型定义与通信协议 | TypeScript |

---

## 二、三大核心技术突破

### 1. AI 指令驱动（Neko-Script）

用户无需手动剪辑，通过 **neko-agent** 直接将剧本转化为 Neko-Script 指令流。AI 成为「隐形的手」，直接操作渲染引擎，实现"所见即所得"的无感创作。

```
用户意图 → neko-agent (LLM) → Neko-Script 指令 → neko-cut/canvas 执行
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

## 三、开发者工作流（Workflow）

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

## 四、独立性与扩展性

### 跨平台能力

架构设计实现了「核壳分离」。核心引擎（Server/Canvas/Script）不依赖 VS Code API，可快速通过 Tauri 封装为独立桌面软件 **Neko Studio**。

### 版本管理

原生支持 Git。视频剪辑的所有改动均为文本指令（.jvi / .nksc），支持分支创作、回滚与协同。

### 插件化架构

每个子插件可独立安装、独立升级。用户可根据需求选择安装：
- 仅剪辑：`neko-cut` + `neko-engine`
- 仅直播：`neko-live` + `neko-canvas`
- 全功能：`neko-suite`（Extension Pack）

---

## 五、技术栈

| 层级 | 技术 |
|------|------|
| **Frontend** | React 18 + Zustand + Tailwind CSS + Vite |
| **Extension** | VS Code Extension API + TypeScript + esbuild |
| **Media** | WebCodecs + WebGPU/WebGL + FFmpeg |
| **AI** | Claude API + OpenAI API + MCP Protocol |
| **Testing** | Vitest |
| **Build** | npm workspaces (Monorepo) |

---

## 六、项目结构

```
neko-suite/
├── packages/
│   ├── neko-suite/   # Extension Pack 门户
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
│   ├── neko-script/           # 脚本协议
│   ├── neko-assets/           # 资产管理
│   ├── neko-tools/            # 媒体工具
│   └── neko-types/            # 共享类型
├── package.json               # 根 package.json (workspaces)
└── tsconfig.json              # 全局 TS 配置
```

---

## 七、快速开始

### 安装依赖

```bash
# 在仓库根目录执行
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

## 八、支持的媒体格式

| 类型 | 格式 |
|------|------|
| **视频** | MP4, MOV, AVI, MKV, WebM, M4V |
| **音频** | MP3, WAV, OGG, FLAC, AAC, M4A |
| **图片** | PNG, JPG, JPEG, GIF, WebP, BMP, SVG |
| **项目** | .jvi (视频项目), .jvc (画布项目), .nks (剧本), .nksc (脚本) |

---

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
