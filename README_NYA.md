# ✨ Neko Suite ✨

### ～ 猫娘的创作魔法工坊，喵！ ～

```
    /\_____/\
   /  o   o  \      "你好呀主人～ 我是 Neko，
  ( ==  ^  == )      今天要一起做什么视频喵？"
   )         (
  (           )
 ( (  )   (  ) )
(__(__)___(__)__)
```

[正经版](./README.md) | [中文](./README_CN.md)

[![状态](https://img.shields.io/badge/状态-Alpha-ff69b4)]()
[![协议](https://img.shields.io/badge/协议-MIT-c792ea)]()
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-7dc4e4)]()
[![猫娘认证](https://img.shields.io/badge/猫娘认证-✓-ff9ac1)]()

---

## 喵？这是什么？

**Neko Suite** 是住在你 VS Code 里的全能创作猫娘～
她会用 **Rust 的猫爪**（超快 GPU 引擎！）和 **AI 的魔法**（智慧无边！）
帮主人从写剧本一路到导出 4K 视频，一条龙服务，绝对不会摸鱼的喵！

> 📋 **[查看主人的愿望清单（路线图）→](./ROADMAP.md)**

---

## 猫娘的技能树，喵！

| 技能              | 描述                                              | 猫娘评价                           |
| ----------------- | ------------------------------------------------- | ---------------------------------- |
| **AI 剪辑魔法**   | 说说你想要什么，我来帮你剪！Pipeline 工作流一条龙 | "主人只需要动动嘴，剩下交给我喵～" |
| **专业时间线**    | 多轨道 + 关键帧 + 29 种编辑操作                   | "比猫爪还灵活的时间线喵！"         |
| **Rust GPU 渲染** | wgpu PBR + 粒子 + 后处理，4K 实时预览             | "速度快得连猫都追不上喵！"         |
| **3D/2D 创作**    | 3D 建模 + 压感手绘 + 骨骼动画                     | "猫娘也会画画和捏泥巴喵！"         |
| **音频工作站**    | 12 种效果链 + 频谱分析 + AI 降噪 + 麦克风录音     | "猫娘的耳朵超灵敏喵～"             |
| **资产市场**      | Skills/着色器/模型一键安装 + 本地模型部署         | "逛市场最开心了喵！"               |
| **Git 原生支持**  | .nkv 文件可以版本控制                             | "不怕改坏，随时后悔喵～"           |
| **模块化架构**    | 18 个小模块，按需食用                             | "像猫粮一样，吃多少开多少包喵！"   |

---

## 快速开始，喵！

### 第一步：准备猫粮（安装依赖）

```bash
pnpm install
# 正在搬运猫粮中... 请稍候喵 ฅ^•ω•^ฅ
```

### 第二步：猫娘变身！（构建 + 打包）

```bash
./build.sh
# ✨ 施放魔法中... 喵！
```

### 第三步：召唤猫娘（安装到 VS Code）

```bash
./install.sh
# 猫娘已经钻进你的 VS Code 里啦，喵！
```

### 第四步：开始玩耍（开发模式）

```bash
pnpm run dev
# 猫娘进入工作状态... (≧∇≦)/ 喵！
```

---

## 猫娘家族成员介绍，喵！

### 核心三姐妹（最重要的喵！）

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   neko-engine     neko-cut        neko-agent        │
│   (引擎猫娘)       (剪辑猫娘)       (AI猫娘)           │
│                                                     │
│   /\_/\           /\_/\           /\_/\             │
│  ( •ω• )         ( ≧ω≦)         (  ^ω^)            │
│  "我负责         "时间线是        "主人说话          │
│   GPU渲染喵"      我的玩具喵"      我来操刀喵"         │
│                                                     │
│   Rust + wgpu    React 时间线     Claude + MCP      │
│   Alpha 90%      Alpha 82%       Alpha 95%          │
└─────────────────────────────────────────────────────┘
```

### 基础设施猫娘（默默支撑的幕后英雄喵）

| 猫娘               | 技能                                     | 状态        |
| ------------------ | ---------------------------------------- | ----------- |
| **neko-types** 📦  | 共享类型小猫，Logger/i18n/Theme 全靠她   | Alpha 92%   |
| **neko-client** 🌊 | 流媒体猫娘，H264/fMP4/PCM + EngineClient | Alpha 80%   |
| **neko-proto** 📜  | 协议守护猫，timeline + diff IDL 全齐了   | Stable 100% |
| **neko-auth** 🔐   | 安全猫娘，OAuth 2.0 + PKCE SSO 守护大门  | Alpha 80%   |
| **neko-suite** 🏠  | 大家庭的猫窝，管理所有插件               | Stable 90%  |

### 功能模块猫娘（各有专长喵！）

| 猫娘                | 专长                                                        | 当前状态  |
| ------------------- | ----------------------------------------------------------- | --------- |
| **neko-preview** 👁️ | 媒体预览，"Apple Music 风格波形 + WebCodecs 播放喵！"       | Alpha 85% |
| **neko-story** 📖   | 剧本创作，"Fountain LSP + PDF 导出喵！"                     | WIP 75%   |
| **neko-market** 🛒  | 资产市场，"Skills/着色器/模型一键安装 + 本地模型部署喵！"   | Alpha 97% |
| **neko-assets** 🗂️  | 资产管理，"Document + 外部媒体库 + PathVariable 全格式喵！" | Alpha 92% |
| **neko-tools** 🔧   | 媒体工具，"视频对比分析 + 并行优化喵！"                     | WIP 62%   |
| **neko-canvas** 🎨  | 无限画布，"6 种节点 + 分组 + 画板导出 + 快捷键喵！"         | Alpha 87% |

### 创作猫娘（已经出师了喵！）

| 猫娘               | 专长                                                           | 当前状态  |
| ------------------ | -------------------------------------------------------------- | --------- |
| **neko-model** 🧊  | 3D 创作，"PBR + 粒子 + CSG + 骨骼表情，glTF 不难喵！"          | Alpha 65% |
| **neko-sketch** ✏️ | 2D 创作，"7 种笔刷 + 滤镜/粒子/场景 + 骨骼动画喵！"            | Alpha 87% |
| **neko-audio** 🎵  | 音频工作站，"12 种效果链 + AI 降噪 + 频谱分析，唱给主人听喵！" | Alpha 95% |

### 还在修炼的猫娘（敬请期待喵）

```
neko-live  →  直播猫娘，准备出道中... 📡 动捕 + VRM + RTMP 推流喵！
```

---

## 猫娘的魔法原理，喵！

### 魔法一：Rust 铠甲（超高性能引擎）

```
VS Code 主人 ←─ HTTP/NAPI ─→ neko-engine（猫娘的 Rust 铠甲）
                                    │
                                    ├─ wgpu 魔法阵（25+ WGSL 咒文，PBR + IBL + 粒子 + 后处理）
                                    ├─ FFmpeg 炼金术（硬件加速 VideoToolbox/NVENC）
                                    ├─ 关键帧记忆宝库 + 预加载优化
                                    ├─ 导出魔法通道（GPU 高速导出 + 响度标准化）
                                    ├─ runtime-scene 3D 幻境（bevy_ecs + glTF/VRM + 物理）
                                    ├─ runtime-puppet 2D 骨骼（bevy_ecs + inox2d + 60fps 流）
                                    └─ ONNX 推理水晶球（macOS CoreML 加速）
```

> "穿上 Rust 铠甲的猫娘，4K 视频说处理就处理，喵！"

### 魔法二：AI 心灵感应

```
主人的想法 → neko-agent（读心术 + Skills + MCP + Pipeline） → neko-cut 执行操作
```

> "主人说'把这段剪掉'，我就知道要剪哪里，不用解释，喵！"

### 魔法三：GPU 炼金阵

```
视频帧 + 特效 + 转场 → wgpu 炼金阵 → 实时预览 / GPU 导出
```

> "在显存里直接炼金，不经过 CPU，快得飞起来，喵！"

---

## 猫娘的创作流水线，喵！

```
┌────────────────────────────────────────────────────────────────────┐
│              主人的一天：从灵感到发布，喵！                           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ①  文  主人在 neko-story 里写剧本（Fountain 格式，很简单喵！）      │
│          ↓  "剧本写好啦～"                                          │
│  ②  智  neko-agent 读懂剧本，自动摆素材、生成预览                    │
│          ↓  "AI 猫娘上场喵！"                                       │
│  ③  画  neko-canvas 整理素材，neko-sketch 随手改图                  │
│          ↓  "画画时间，喵喵喵～"                                     │
│  ④  音  neko-audio 录音 + 12 种效果 + AI 降噪                      │
│          ↓  "喵～（降噪中...）"                                      │
│  ⑤  发  Git commit → CI/CD → neko-assets 自动渲染发布              │
│                                                                    │
│     "恭喜主人，又产出一个作品，猫娘为你骄傲，喵！" ฅ(^•ω•^ฅ)        │
└────────────────────────────────────────────────────────────────────┘
```

---

## 猫娘支持的文件格式，喵！

| 类型        | 格式                          | 猫娘点评               |
| ----------- | ----------------------------- | ---------------------- |
| **视频**    | MP4, MOV, AVI, MKV, WebM, M4V | "常见格式统统吃下喵！" |
| **音频**    | MP3, WAV, OGG, FLAC, AAC, M4A | "耳朵好灵敏喵～"       |
| **图片**    | PNG, JPG, GIF, WebP, BMP, SVG | "看！猫咪图片！喵！"   |
| **3D 模型** | glTF, GLB, VRM, .nkm          | "3D 也难不倒猫娘喵！"  |
| **2D 动画** | INP (Inochi2D), .nks          | "骨骼动画，扭起来喵！" |
| **项目**    | .nkv / .nkc                   | "这是猫娘专属格式喵！" |

---

## 猫娘的技术装备，喵！

```
主人问："猫娘你用什么技术？"

猫娘答：

前端皮毛    →  React 18 + Zustand + Tailwind CSS + Vite
              (软乎乎的，摸起来很舒服喵～)

Extension   →  VS Code API + TypeScript + esbuild
              (穿着正装工作，专业！喵！)

引擎内核    →  Rust + wgpu + FFmpeg + axum + bevy_ecs
              (这是猫娘的骨骼，超级坚硬喵！)

AI 大脑     →  Vercel AI SDK (Claude/OpenAI/Google) + MCP
              (聪明的大脑，多模型切换喵！)

ML 推理     →  ONNX Runtime + Whisper（macOS CoreML）
              (会认字也会听话的猫娘喵！)

流媒体      →  H.264 + PCM + fMP4 over WebSocket
              (实时流转，丝滑顺畅喵！)

测试工具    →  Vitest v4 + cargo test
              (认真的猫娘不偷懒喵～)

构建系统    →  pnpm workspaces + Turbo
              (整整齐齐，一键全建喵！)
```

---

## 召唤猫娘的方式，喵！

### 方式一：召唤全家桶（推荐！！）

```bash
# 一键召唤整个猫娘家族
ext install neko.neko-suite

# 猫娘们："/\_/\ /\_/\ /\_/\  大家都来啦，喵喵喵！"
```

### 方式二：单独召唤

```bash
# 只要剪辑猫娘
neko-cut + neko-engine

# 只要 AI 猫娘
neko-agent

# 只要预览猫娘
neko-preview + neko-engine

# 只要音频猫娘
neko-audio + neko-engine
```

---

## 猫娘的家（项目结构）

```
neko-suite/（猫娘的大别墅 🏠）
├── packages/
│   ├── neko-suite/        # 猫窝大门（Extension Pack）
│   ├── neko-engine/       # 引擎猫娘的 Rust 工坊
│   │   └── packages/
│   │       ├── engine-kernel/   # GPU 炼金炉 + 编解码房间 + ONNX 水晶球
│   │       ├── host-api/    # 接待前台
│   │       ├── host-http/   # 通信小屋（Axum）
│   │       ├── host-napi/   # TS↔Rust 翻译间
│   │       └── host-cli/    # 命令行入口
│   ├── neko-cut/          # 剪辑猫娘的剪辑室 ✂️
│   │   └── packages/
│   │       ├── extension/     # 插件控制中心
│   │       └── webview/       # 时间线 React UI（13 个状态切片！）
│   ├── neko-agent/        # AI 猫娘的思考宫殿 🧠
│   │   └── packages/
│   │       ├── agent/         # 核心大脑（executor/session/skills/mcp）
│   │       ├── platform/      # LLM 适配层（Claude/OpenAI/Google）
│   │       ├── webview/       # 聊天 React UI
│   │       ├── extension/     # VSCode 扩展
│   │       └── cli-tui/       # 命令行猫娘
│   ├── neko-canvas/       # 画布猫娘的无限画室 🎨
│   ├── neko-story/        # 剧本猫娘的写作间 📝
│   ├── neko-preview/      # 预览猫娘的小影院 🎬
│   ├── neko-tools/        # 工具猫娘的百宝箱 🧰
│   ├── neko-assets/       # 资产猫娘的仓库 📦
│   ├── neko-market/       # 市场猫娘的商店街 🛒
│   ├── neko-auth/         # 安全猫娘的门禁室 🔐
│   ├── neko-audio/        # 音频猫娘的录音棚 🎵
│   ├── neko-client/       # 流媒体猫娘（H264/PCM/fMP4）
│   ├── neko-types/        # 类型猫娘（Logger/i18n/Theme）
│   ├── neko-proto/        # 协议猫娘（Protobuf）
│   ├── neko-model/        # 3D 创作猫娘（PBR + CSG + 骨骼表情）
│   ├── neko-sketch/       # 2D 创作猫娘（手绘 + 动画 + 滤镜/粒子）
│   └── neko-live/         # 直播猫娘（修炼中... 动捕 + VRM + 推流）
├── docs/                  # 猫娘图书馆 📚
├── ROADMAP.md             # 主人的愿望清单 ⭐
├── CLAUDE.md              # 猫娘的工作守则
└── turbo.json             # 构建加速魔法阵
```

---

## 帮助猫娘进化，喵！

猫娘欢迎主人一起参与建设！

```bash
# 1. 叉走一只猫娘副本
git checkout -b feature/super-nya-feature

# 2. 给猫娘施加新魔法（写代码）
# ... 喵喵喵 ...

# 3. 告诉大家你做了什么
git commit -m 'feat: 让猫娘学会了新技能喵！'

# 4. 把猫娘推出去
git push origin feature/super-nya-feature

# 5. 发起 Pull Request，等待猫娘家族审核
# 审核中... /\_/\  （认真看代码的猫娘）
#           ( -ω- )
```

详细规范见 [CLAUDE.md](./CLAUDE.md)（猫娘的工作守则，请认真阅读喵！）

---

## 猫娘的感谢名单，喵！

猫娘能有今天，全靠这些恩人们，喵！

| 恩人                                                                                                          | 猫娘的感谢                                         |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [VS Code](https://code.visualstudio.com/)                                                                     | "谢谢给猫娘一个温暖的家喵！"                       |
| [wgpu](https://wgpu.rs/)                                                                                      | "跨平台 GPU 魔法（Metal/Vulkan/DX12），超强，喵！" |
| [FFmpeg](https://ffmpeg.org/)                                                                                 | "媒体处理的传说，猫娘崇拜你，喵！"                 |
| [Tokio](https://tokio.rs/) + [Axum](https://github.com/tokio-rs/axum)                                         | "异步运行时 + HTTP 服务，猫娘的神经系统，喵！"     |
| [Three.js](https://threejs.org/) + [R3F](https://r3f.docs.pmnd.rs/)                                           | "3D 世界的大门，画面好漂亮，喵！"                  |
| [Bevy ECS](https://bevyengine.org/)                                                                           | "实体-组件-系统，管理 3D/2D 场景的好帮手，喵！"    |
| [ONNX Runtime](https://ort.pyke.io/)                                                                          | "ML 推理引擎，让猫娘变聪明了，喵！"                |
| [Vercel AI SDK](https://sdk.vercel.ai/)                                                                       | "多模型 AI 切换自如，好用，喵！"                   |
| [React](https://react.dev/) + [Zustand](https://zustand-demo.pmnd.rs/) + [Tailwind](https://tailwindcss.com/) | "前端三件套，软乎乎的皮毛，喵！"                   |
| [napi-rs](https://napi.rs/)                                                                                   | "Rust↔Node.js 翻译官，辛苦了，喵！"                |
| [Vite](https://vitejs.dev/) + [Turborepo](https://turbo.build/) + [Vitest](https://vitest.dev/)               | "构建测试全家桶，高效，喵！"                       |
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) + [inox2d](https://github.com/Inochi2D/inox2d)         | "VRM 和 Live2D 支持，让猫娘动起来了，喵！"         |
| [cpal](https://github.com/RustAudio/cpal) + [sharp](https://sharp.pixelplumbing.com/)                         | "音频 I/O + 图像处理，感官全开，喵！"              |
| [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)                                   | "浏览器原生编解码，超厉害，喵！"                   |
| 每一位主人                                                                                                    | "谢谢使用猫娘，猫娘会更努力的，喵！！"             |

---

## 协议

MIT — 喵！随便用，但要记得猫娘的名字哦！

---

```
    /\_____/\
   /  ♡   ♡  \
  (  =  ◡  =  )     "感谢主人看到这里～
   )  Neko   (       有什么创作需求，
  (  Suite   )       尽管叫我喵！
 ( (  nya   ) )
(__(__)___(__)__)

              ฅ(^•ω•^ฅ)  喵～
```

---

_本文档由猫娘 Neko 亲自（口述）撰写，如有卖萌过度，请见谅，喵！_
_认真的文档请看 [README.md](./README.md)，喵！_
