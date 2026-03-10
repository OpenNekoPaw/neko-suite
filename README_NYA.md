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

| 技能 | 描述 | 猫娘评价 |
|------|------|----------|
| **AI 剪辑魔法** | 说说你想要什么，我来帮你剪！ | "主人只需要动动嘴，剩下交给我喵～" |
| **专业时间线** | 多轨道 + 关键帧 + 特效蒙版 | "比猫爪还灵活的时间线喵！" |
| **Rust GPU 渲染** | wgpu 加速，4K 实时预览 | "速度快得连猫都追不上喵！" |
| **Git 原生支持** | .jvi 文件可以版本控制 | "不怕改坏，随时后悔喵～" |
| **模块化架构** | 15 个小模块，按需食用 | "像猫粮一样，吃多少开多少包喵！" |

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
│   Alpha 70%      Alpha 65%       Alpha 70%          │
└─────────────────────────────────────────────────────┘
```

### 基础设施猫娘（默默支撑的幕后英雄喵）

| 猫娘 | 技能 | 状态 |
|------|------|------|
| **neko-types** 📦 | 共享类型小猫，传递主人的命令 | Alpha 80% |
| **neko-client** 🌊 | 流媒体猫娘，H264/fMP4/PCM 超流畅 | Alpha 75% |
| **neko-proto** 📜 | 协议守护猫，确保消息不出错 | Early 30% |
| **neko-suite** 🏠 | 大家庭的猫窝，管理所有插件 | Stable 90% |

### 功能模块猫娘（各有专长喵！）

| 猫娘 | 专长 | 当前状态 |
|------|------|----------|
| **neko-preview** 👁️ | 媒体预览，"让主人看视频喵！" | WIP 60% |
| **neko-story** 📖 | 剧本创作，"Fountain 格式写剧本喵！" | WIP 55% |
| **neko-assets** 🗂️ | 资产管理，"帮主人整理素材库喵！" | WIP 55% |
| **neko-tools** 🔧 | 媒体工具，"视频对比分析喵！" | WIP 50% |
| **neko-canvas** 🎨 | 无限画布，"节点系统，无限延伸喵！" | WIP 40% |

### 还在修炼的猫娘（敬请期待喵）

```
neko-model  →  3D 建模猫娘，学习中... ( ˘•ω•˘ ).｡oO(glTF好难喵)
neko-sketch →  绘画猫娘，磨练画技中... ✏️ 喵～
neko-audio  →  音频猫娘，练习唱歌中... 🎵 喵喵喵～
neko-live   →  直播猫娘，准备出道中... 📡 喵！
```

---

## 猫娘的魔法原理，喵！

### 魔法一：Rust 铠甲（超高性能引擎）

```
VS Code 主人 ←─ HTTP/NAPI ─→ neko-engine（猫娘的 Rust 铠甲）
                                    │
                                    ├─ wgpu 魔法阵（12 个 WGSL 咒文，26 个 GPU 模块）
                                    ├─ FFmpeg 炼金术（硬件加速 + 解码器池）
                                    ├─ 关键帧记忆宝库
                                    ├─ 导出魔法通道（GPU 高速导出）
                                    └─ [修炼中] native-scene 3D 幻境（hecs ECS + PBR）
```

> "穿上 Rust 铠甲的猫娘，4K 视频说处理就处理，喵！"

### 魔法二：AI 心灵感应

```
主人的想法 → neko-agent（读心术 + Skills + MCP） → neko-cut 执行操作
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
│  ④  音  neko-audio 录音，AI 自动降噪对齐                            │
│          ↓  "喵～（降噪中...）"                                      │
│  ⑤  发  Git commit → CI/CD → neko-assets 自动渲染发布              │
│                                                                    │
│     "恭喜主人，又产出一个作品，猫娘为你骄傲，喵！" ฅ(^•ω•^ฅ)        │
└────────────────────────────────────────────────────────────────────┘
```

---

## 猫娘支持的文件格式，喵！

| 类型 | 格式 | 猫娘点评 |
|------|------|----------|
| **视频** | MP4, MOV, AVI, MKV, WebM, M4V | "常见格式统统吃下喵！" |
| **音频** | MP3, WAV, OGG, FLAC, AAC, M4A | "耳朵好灵敏喵～" |
| **图片** | PNG, JPG, GIF, WebP, BMP, SVG | "看！猫咪图片！喵！" |
| **项目** | .jvi / .jvc / .nks | "这是猫娘专属格式喵！" |

---

## 猫娘的技术装备，喵！

```
主人问："猫娘你用什么技术？"

猫娘答：

前端皮毛    →  React 18 + Zustand + Tailwind CSS + Vite
              (软乎乎的，摸起来很舒服喵～)

Extension   →  VS Code API + TypeScript + esbuild
              (穿着正装工作，专业！喵！)

引擎内核    →  Rust + wgpu + FFmpeg + WebCodecs
              (这是猫娘的骨骼，超级坚硬喵！)

AI 大脑     →  Claude API + OpenAI API + MCP Protocol
              (聪明的大脑，喵！)

测试工具    →  Vitest + cargo test
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
```

---

## 猫娘的家（项目结构）

```
neko-suite/（猫娘的大别墅 🏠）
├── packages/
│   ├── neko-suite/        # 猫窝大门（Extension Pack）
│   ├── neko-engine/       # 引擎猫娘的 Rust 工坊
│   │   └── packages/
│   │       ├── native-core/   # GPU 炼金炉 + 编解码房间
│   │       ├── native-api/    # 接待前台
│   │       ├── native-http/   # 通信小屋（Axum）
│   │       ├── native-napi/   # TS↔Rust 翻译间
│   │       └── native-cli/    # 命令行入口
│   ├── neko-cut/          # 剪辑猫娘的剪辑室 ✂️
│   │   └── packages/
│   │       ├── extension/     # 插件控制中心
│   │       └── webview/       # 时间线 React UI（13 个状态切片！）
│   ├── neko-agent/        # AI 猫娘的思考宫殿 🧠
│   │   └── packages/
│   │       ├── agent/         # 核心大脑（executor/session/skills/mcp）
│   │       ├── platform/      # LLM 适配层（Claude/OpenAI）
│   │       ├── webview/       # 聊天 React UI
│   │       ├── extension/     # VSCode 扩展
│   │       └── cli-tui/       # 命令行猫娘
│   ├── neko-canvas/       # 画布猫娘的无限画室 🎨
│   ├── neko-story/        # 剧本猫娘的写作间 📝
│   ├── neko-preview/      # 预览猫娘的小影院 🎬
│   ├── neko-tools/        # 工具猫娘的百宝箱 🧰
│   ├── neko-assets/       # 资产猫娘的仓库 📦
│   ├── neko-client/       # 流媒体猫娘（H264/PCM/fMP4）
│   ├── neko-types/        # 类型猫娘（Logger/i18n/Theme）
│   ├── neko-proto/        # 协议猫娘（Protobuf）
│   ├── neko-sketch/       # 绘画猫娘（修炼中...）
│   ├── neko-audio/        # 音频猫娘（修炼中...）
│   └── neko-live/         # 直播猫娘（修炼中...）
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

| 恩人 | 猫娘的感谢 |
|------|-----------|
| [VS Code](https://code.visualstudio.com/) | "谢谢给猫娘一个温暖的家喵！" |
| [wgpu](https://wgpu.rs/) | "跨平台 GPU 魔法，感谢感谢，喵！" |
| [FFmpeg](https://ffmpeg.org/) | "媒体处理的传说，猫娘崇拜你，喵！" |
| [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) | "浏览器原生编解码，超厉害，喵！" |
| 每一位主人 | "谢谢使用猫娘，猫娘会更努力的，喵！！" |

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

*本文档由猫娘 Neko 亲自（口述）撰写，如有卖萌过度，请见谅，喵！*
*认真的文档请看 [README.md](./README.md)，喵！*
