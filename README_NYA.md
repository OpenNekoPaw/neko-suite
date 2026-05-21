# ✨ Neko Suite ✨

### ～ AIGC 猫娘的创作魔法工坊，喵！ ～

```
    /\_____/\
   /  o   o  \      "你好呀主人～ 我是 AIGC 猫娘 Neko，
  ( ==  ^  == )      只要动动嘴，全多模态创作都包在我身上喵！"
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

**Neko Suite** 是住在你 VS Code 里的 **AIGC IDE + AIGC Agent 猫娘**～
- 🧠 **AIGC Agent 猫娘**负责读心术,把主人的话变成创作动作
- 🎀 **Skill 猫娘**负责编排工作流,把复杂的流程打包成一声令下
- 📦 **素材库猫娘**负责把所有图片、视频、模型、声音整理得整整齐齐
- ⚡ **Rust 引擎猫娘**负责 GPU 加速,保证主人 4K 视频也不卡喵！

> 📋 **[查看主人的愿望清单（路线图）→](./ROADMAP.md)**

---

## 猫娘的技能树，喵！

| 技能                | 描述                                            | 猫娘评价                                 |
| ------------------- | ----------------------------------------------- | ---------------------------------------- |
| **AIGC Agent 核心** | 自然语言驱动跨视频/3D/2D/音频的多模态创作       | "主人动动嘴,猫娘全模态出手喵～"           |
| **Skill 编排**      | 打包提示词+工具+权限+上下文预算,一键激活        | "Skill 就像猫娘的小法术书喵！"           |
| **统一素材库**      | 所有素材集中管理 + 搜索索引 + 外部媒体库挂载    | "猫娘的储藏室整整齐齐,什么都找得到喵！"   |
| **多模态创作面板**  | 剧本 → 分镜画布 → 时间线 → 3D/2D → 音频        | "从零到成片一条龙,猫娘全程陪伴喵！"      |
| **资产市场**        | Skills/着色器/模型一键安装 + 本地模型部署       | "逛市场最开心了喵！"                     |
| **Rust GPU 引擎**   | wgpu PBR + 粒子 + 后处理,4K 实时预览            | "速度快得连猫都追不上喵！"               |
| **Git 原生支持**    | .nkv / .nkc / .nkm / .nks 文件可以版本控制      | "不怕改坏,随时后悔喵～"                   |
| **模块化架构**      | 19 个小模块,按需食用                            | "像猫粮一样,吃多少开多少包喵！"          |

---

## 快速开始，喵！

### 第一步：准备猫粮（安装依赖）

```bash
pnpm install
# 正在搬运猫粮中... 请稍候喵 ฅ^•ω•^ฅ
```

### 第二步：猫娘变身！（构建）

```bash
./build.sh
# ✨ 施放魔法中... 喵！
```

### 第三步：开始玩耍（开发模式）

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
│   Alpha 99%      Alpha 95%       Alpha 99%          │
└─────────────────────────────────────────────────────┘
```

### 基础设施猫娘（默默支撑的幕后英雄喵）

| 猫娘               | 技能                                                | 状态        |
| ------------------ | --------------------------------------------------- | ----------- |
| **neko-types** 📦  | 共享类型小猫，Logger/i18n/Theme + entity-uri 全靠她 | Alpha 94%   |
| **neko-client** 🌊 | 流媒体猫娘，H264/fMP4/PCM + MediaPlaybackService    | Alpha 85%   |
| **neko-proto** 📜  | 协议守护猫，timeline + diff IDL 全齐了              | Stable 100% |
| **neko-auth** 🔐   | 安全猫娘，OAuth 2.0 + PKCE SSO 守护大门             | Alpha 90%   |
| **neko-suite** 🏠  | 大家庭的猫窝，管理所有插件                          | Stable 90%  |

### 功能模块猫娘（各有专长喵！）

| 猫娘                | 专长                                                       | 当前状态  |
| ------------------- | ---------------------------------------------------------- | --------- |
| **neko-preview** 👁️ | 媒体预览，"全景图 + 引擎优先 HDR + WebCodecs 播放喵！"     | Alpha 91% |
| **neko-story** 📖   | 剧本创作，"5 列分镜表 + 视频就绪评估 + 语义管线喵！"       | Alpha 97% |
| **neko-market** 🛒  | 资产市场，"Skills/着色器/模型一键安装 + 本地模型部署喵！"  | Alpha 90% |
| **neko-assets** 🗂️  | 资产管理，"持久化搜索索引 + 外部媒体库 + 缩略图喵！"       | Alpha 88% |
| **neko-tools** 🔧   | 媒体工具，"视频对比 + JVI LSP + 静音检测喵！"              | Alpha 72% |
| **neko-canvas** 🎨  | 无限画布，"15 种节点 + Block 容器 + 组合预设 + MCP Tools 喵！" | Alpha 95% |

### 创作猫娘（已经出师了喵！）

| 猫娘               | 专长                                                                  | 当前状态  |
| ------------------ | --------------------------------------------------------------------- | --------- |
| **neko-model** 🧊  | 3D 创作，"PBR + CSG + 捏脸 + IK + 关键帧，glTF 不难喵！"              | Alpha 87% |
| **neko-sketch** ✏️ | 2D 创作，"8 种笔刷 + PSD 导入 + AI 工具 + 2D 光照喵！"                | Alpha 68% |
| **neko-audio** 🎵  | 音频工作站，"DAW UI + 12 种效果 + Agent 工具，唱给主人听喵！"         | Alpha 82% |
| **neko-puppet** 🐱 | 2D 骨骼，"Live2D MOC3 + 表情 + 动作 + 物理 + 60fps 喵！"              | Alpha 92% |

### 还在修炼的猫娘（敬请期待喵）

```
neko-live  →  直播猫娘，VMC + VRM + 录制 + 设备管理... Alpha 58% 📡 喵！
```

---

## 猫娘的魔法原理，喵！

### 魔法一：Rust 铠甲（超高性能引擎）

```
VS Code 主人 ←─ HTTP/NAPI ─→ neko-engine（猫娘的 Rust 铠甲）
                                    │
                                    ├─ wgpu 魔法阵（20+ WGSL 咒文，PBR + IBL + 粒子 + 后处理）
                                    ├─ FFmpeg 炼金术（硬件加速 VideoToolbox/NVENC）
                                    ├─ DSP 效果宝箱（混音管线 solo/pan）
                                    ├─ 导出魔法通道（GPU 高速导出 + 响度标准化）
                                    ├─ runtime-scene 3D 幻境（bevy_ecs + glTF/VRM + IK + 动画混合）
                                    ├─ runtime-puppet 2D 骨骼（bevy_ecs + MOC3 + 60fps 流）
                                    ├─ runtime-device 设备感知（麦克风/MIDI/手柄）
                                    ├─ runtime-media 媒体魔法（探测/对比/字幕）
                                    └─ runtime-ml 推理水晶球（ONNX + macOS CoreML 加速）
```

> "穿上 Rust 铠甲的猫娘，4K 视频说处理就处理，喵！"

### 魔法二：AI 心灵感应 + Skill 小法术书

```
主人的想法 → neko-agent（读心术 + MCP + 多模态感知 + Capability Discovery）
              └─ 激活 Skill（原子注入提示词+工具集+权限+上下文）
              └─ 驱动 story/canvas/cut/model/sketch/audio 多模态创作
```

> "主人说'帮我生成一套古风分镜',Skill 猫娘就把提示词、工具、权限一把打包,我动动爪子就上工,喵！"

### 魔法三：统一素材库 —— 猫娘的储藏室

```
本地文件 + 外部媒体库 + Agent 生成 → neko-assets（注册表 + 搜索索引 + PathResolver）
                                        ↓
                        canvas / cut / model / sketch / puppet / audio
```

> "所有素材都在一个地方,猫娘的小爪爪一秒就能找到要的那张图喵！"

### 魔法四：GPU 炼金阵

```
视频帧 + 特效 + 转场 → wgpu 炼金阵 → 实时预览
```

> "在显存里直接炼金，不经过 CPU，快得飞起来，喵！"

---

## 猫娘的创作闭环，喵！

> 不是流水线,是**闭环**!每一轮都经过 5 个平面,反哺下一次迭代喵～

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
 ①  意图创作         主人的话 + 上下文 + 常驻 Skill      │
     "主人想做什么?                                     │
      AGENTS.md 里有偏好吗?"                            │
        │                                              │
        ▼                                              │
 ②  动态编排         SkillRegistry 原子激活 Prompt +    │
     "猫娘打开小法术书,          Tools + Permissions +  │
      选一张最合适的 Skill"      Context(IDC 三阶段)   │
        │                                              │
        ▼                                              │
 ③  内容生成         story / canvas / cut / model /    │
     "跨界面动手:                sketch / puppet / audio│
      画画 + 剪辑 + 录音"                              │
        │                                              │
        ▼                                              │
 ④  质量审查         Pipeline QC:                      │
     "猫娘亲自验收,              音频响度 / 多帧一致性 / │
      不过关就返工喵!"            schema / 置信度        │
        │                                              │
        ▼                                              │
 ⑤  感知反馈         PerceptionCard 重新接地,          │
     "把实际产物的情况             Evaluator 写进 memory │
      告诉 Agent,下一轮更准!"     / project cards       │
        │                                              │
        └────────►  回到 ①,开启下一轮创作 (闭环喵!)
```

> "创作不是一条道走到黑,是猫娘和主人一起打磨,一轮比一轮好,喵～" ฅ(^•ω•^ฅ)

---

## 猫娘支持的文件格式，喵！

| 类型        | 格式                          | 猫娘点评               |
| ----------- | ----------------------------- | ---------------------- |
| **视频**    | MP4, MOV, AVI, MKV, WebM, M4V | "常见格式统统吃下喵！" |
| **音频**    | MP3, WAV, OGG, FLAC, AAC, M4A | "耳朵好灵敏喵～"       |
| **图片**    | PNG, JPG, GIF, WebP, BMP, SVG | "看！猫咪图片！喵！"   |
| **3D 模型** | glTF, GLB, VRM, .nkm          | "3D 也难不倒猫娘喵！"  |
| **2D 动画** | MOC3 (Live2D), .nks           | "骨骼动画，扭起来喵！" |
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
| [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)                                                        | "VRM 支持，让猫娘动起来了，喵！"                   |
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
