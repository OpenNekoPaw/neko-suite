# AI 能力全景分析

> neko-agent AI 能力全景：基础生成 + 创作流程 + Pipeline 编排架构

---

## 执行摘要

### 一、AI 能力矩阵

| 层级 | 状态 | 能力 | 提供商 |
|------|------|------|--------|
| **L0 基础生成** | ✅ 完成 | 图片/视频/音乐/TTS 生成 + 角色一致性 + 风格迁移 + 增强优化 | 10+ 提供商（DALL-E/Sora/Runway/Suno 等）|
| **L1 内容理解** | ✅ 完成 | 多模态视觉分析 + 文本文件读取 | Claude/GPT-4V/Gemini |
| **L2 剧本创作** | ⚠️ 部分 | Fountain 解析 ✅ / AI 剧本生成（无专用 Skill）⚠️ | LLM 通用能力 |
| **L3 文档理解** | ⚠️ 部分 | .md/.txt ✅ / PDF ❌ / DOCX ❌ | Read 工具 |
| **L4 高级编排** | ❌ 缺失 | 分镜→批量生成→时间线自动排列 | — |

### 二、6 种创作流程

| Flow | 路径 | 场景 | 当前状态 | P1 后 |
|------|------|------|:---:|:---:|
| **A** | 素材→剧本→分镜→视频 | 小说改编/纪录片 | ❌ | ✅ |
| **B** | 素材→视频 | 快速混剪 | **✅ 已可用** | ✅ |
| **C** | 素材→分镜→视频 | 概念→成片 | ❌ | ✅ |
| **D** | 剧本→视频 | 有剧本快速出片 | **✅ 已可用** | ✅ |
| **E** | 漫画→分镜→视频 | 漫改动画 | ❌ | ⚠️ |
| **F** | 剧本→分镜→视频 | **最常用路径** | ❌ | ✅ |

**打通 Flow F 即解锁 A/C/E**，5 个可复用 Stage 自由组合覆盖全部流程。

### 三、编排架构（5 个关键决策）

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 通用 vs 专用 | **通用 Pipeline** | 6 种流程共享相同原子操作，仅组合顺序不同 |
| 2 | Pipeline vs Workflow | **Pipeline** | 路径固定、开发者定义；Workflow 是 Phase 6+ 远期需求 |
| 3 | 循环模式 | **双层 ReAct** | 内层规则驱动（阈值），外层 LLM 驱动（escalate） |
| 4 | 配置载体 | **Skill = Pipeline 配置** | 复用已有 Skill 系统，不需要独立配置 |
| 5 | 用户扩展 | **三层注入** | 参数级 + Hook 级 + Stage 级，全部通过 Skill frontmatter |

### 四、架构总览

```
L3 用户入口    Skill 匹配 → 解析 pipeline-* frontmatter → 确认门交互
L2 Pipeline   Stage 链编排 + 进度聚合 + Hook 注入 + 数据流转（新增）
L1 任务执行    TaskManager / AgentExecutor / SubAgentManager（已有）
L0 原子服务    MediaGeneration / NekoCutAPI / Parser / Engine（已有）
```

### 五、Stage 类型

| 类型 | 模式 | 实现阶段 | 示例 |
|------|------|----------|------|
| **linear** | 执行一次 | Phase 2 | parseStoryboard, arrange |
| **parallel** | 多任务并发 | Phase 2 | batchGenerate ×N |
| **reactive** | 执行→评估→重试循环 | Phase 3+ | 导出质检, CLIP 筛选 |

### 六、用户扩展（Skill 即配置）

```markdown
---
name: my-product-video
pipeline: flowA
pipeline-skip: [generateMusic]              # 层级1: 跳过 Stage
pipeline-params:                            # 层级1: 调参数
  batchGenerate: { style: corporate }
pipeline-hooks:                             # 层级2: 注入 Hook
  - stage: arrange, timing: before, action: addWatermark
pipeline-stages:                            # 层级3: 替换 Stage
  - name: comfyGenerate, type: mcp, server: comfyui, replace: batchGenerate
---
```

### 七、实现状态

```
Phase 2 ✅ 已完成：Pipeline linear + parallel + Skill 配置    ~1990 LOC + 69 tests
  → Flow A/B/C/D/F 全部打通，Phase 2 结项
Phase 3+ 待开发：  + ReactiveStage + 漫画Skill + 命令入口     ~1000 LOC
Phase 6+ 远期：    → Workflow（Stage 包装为 Node）              ~3000 LOC
```

---

## 目录

1. [能力总览](#能力总览)
2. [基础能力](#基础能力)
   - [AI 生成剧本](#1-ai-生成剧本)
   - [AI 生成图片](#2-ai-生成图片)
   - [AI 生成视频](#3-ai-生成视频)
   - [AI 生成音频](#4-ai-生成音频)
3. [高级能力](#高级能力)
   - [文档分析→剧本生成](#5-文档分析剧本生成)
   - [图片/漫画分析→剧本生成](#6-图片漫画分析剧本生成)
   - [分镜→批量视频生成→时间线排列](#7-分镜批量视频生成时间线排列)
4. [创作流程矩阵](#创作流程矩阵)
   - [流程总览](#流程总览)
   - [Flow A-F 详细分析](#flow-a-素材剧本分镜视频-1234)
   - [流程对比与选择指南](#流程对比与选择指南)
5. [编排能力总结](#编排能力总结)
   - [编排架构全景](#编排架构全景)
   - [Stage 类型体系 + 双层 ReAct](#stage-类型体系)
   - [Pipeline vs Workflow 决策](#pipeline-vs-workflow-决策)
   - [扩展性与用户注入（Skill 即配置）](#扩展性与用户注入分析)
6. [能力依赖图](#能力依赖图)
7. [实现状态与路线图](#实现状态与路线图)

---

## 能力总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                         neko-agent AI 能力矩阵                       │
├─────────────┬───────────┬───────────────────────────────────────────┤
│ 层级         │ 状态      │ 能力                                     │
├─────────────┼───────────┼───────────────────────────────────────────┤
│ L0 基础生成  │ ✅ 完成   │ 图片/视频/音乐/TTS 生成                    │
│ L1 内容理解  │ ✅ 完成   │ 多模态视觉分析 + 文本文件读取               │
│ L2 剧本创作  │ ⚠️ 部分   │ Fountain 解析 ✅ / AI 剧本生成 ⚠️          │
│ L3 文档理解  │ ⚠️ 部分   │ 文本文件 ✅ / PDF ❌ / DOCX ❌              │
│ L4 高级编排  │ ❌ 缺失   │ 分镜→批量生成→时间线自动排列               │
└─────────────┴───────────┴───────────────────────────────────────────┘
```

---

## 基础能力

### 1. AI 生成剧本

**当前状态**: ⚠️ 部分实现（LLM 对话能力 ✅ + Fountain 解析 ✅ + 专用 Skill ❌）

#### 已有能力

| 组件 | 状态 | 位置 | 说明 |
|------|------|------|------|
| LLM 对话生成 | ✅ | `neko-agent/packages/platform/src/llm/` | Claude/GPT-4/Gemini 均可生成剧本文本 |
| Fountain 格式解析 | ✅ | `neko-story/packages/parser/src/parser.ts` | 完整 AST：场景/角色/对白/动作/转场/注释 |
| 剧本→时间线转换 | ✅ | `neko-story/packages/extension/src/converters/TimelineConverter.ts` | Fountain → ProjectData（场景轨 + 对白轨）|
| LSP 诊断 + 导航 | ✅ | `neko-story/packages/extension/src/` | 语法检查 + 悬停 + 符号 + 跨文件索引 |
| Script-to-Timeline Skill | ✅ | `neko-agent/packages/agent/src/skill/builtins/` | `.fountain/.nks` → neko-cut 时间线项目 |

#### 工作流程

```
用户描述故事想法
    ↓
LLM 生成 Fountain 格式剧本（对话能力，无专用 Skill）
    ↓
Write 工具保存为 .fountain 文件
    ↓
neko-story LSP 实时诊断 + 预览
    ↓
Script-to-Timeline Skill → neko-cut 时间线项目
```

#### 支持的 Fountain 元素

| 元素 | 语法 | 示例 |
|------|------|------|
| 场景标题 | `INT./EXT.` | `INT. 咖啡店 - 白天` |
| 角色 | 全大写 | `ALICE` |
| 对白 | 角色后缩进 | `Hello, world.` |
| 动作 | 普通段落 | `She walks to the door.` |
| 括注 | `()` | `(whispering)` |
| 转场 | `TO:` 结尾 | `CUT TO:` |
| 居中 | `>text<` | `>THE END<` |
| 歌词 | `~` 前缀 | `~Birds are singing` |

#### 缺失项

- **专用剧本生成 Skill**：当前依赖 LLM 通用能力，无结构化引导（体裁/节奏/角色弧线）
- **剧本模板库**：无预设模板（短片/广告/MV/教程）
- **多轮迭代改写**：无专用 Skill 做「修改第三幕」「增加角色动机」等结构化改写

---

### 2. AI 生成图片

**当前状态**: ✅ 完成

#### 工具定义

**`GenerateImage`** — 文本→图片 / 图片→图片

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompt` | string | 必填 | 图片描述 |
| `size` | enum | `1024x1024` | `256x256` / `512x512` / `1024x1024` / `1792x1024` / `1024x1792` |
| `quality` | enum | `standard` | `standard` / `hd` |
| `style` | enum | `vivid` | `natural` / `vivid` |
| `n` | 1-4 | 1 | 生成数量 |

**`GenerateCharacter`** — 一致性角色生成

| 参数 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 角色描述 |
| `referenceImageUrl` | string? | 参考图（保持一致性）|
| `style` | enum | `realistic` / `anime` / `cartoon` / `3d` |
| `pose` | enum | `standing` / `sitting` / `action` / `dynamic` |
| `expression` | enum | `happy` / `sad` / `neutral` / `angry` / `surprised` |

**`TransferStyle`** — 风格迁移

| 参数 | 类型 | 说明 |
|------|------|------|
| `sourceImageUrl` | string | 原图 |
| `stylePrompt` | string | 目标风格（如 "oil painting", "cyberpunk neon"）|
| `styleStrength` | 0.0-1.0 | 风格强度（默认 0.7）|

#### 提供商支持

| 提供商 | text-to-image | image-to-image | 适配器 |
|--------|:---:|:---:|------|
| OpenAI (DALL-E 3) | ✅ | ✅ | AI SDK 原生 |
| NewAPI/OneAPI 代理 | ✅ | ✅ | AI SDK 自定义 |
| Midjourney | ✅ | ✅ | Legacy Bridge |
| Liblib AI | ✅ | ✅ | Legacy Bridge |
| MiniMax | ✅ | — | Legacy Bridge |
| Runway | ✅ | — | Legacy Bridge |

#### 执行模式

```
GenerateImage 调用 → 立即返回 { backgroundMode: true, taskId }
    ↓
MediaRoutingManager 选择提供商
    ↓
MediaTaskExecutor 提交任务（AI SDK 或 Legacy Bridge）
    ↓
后台轮询（5s 间隔）→ WebView BatchTaskCard 显示进度
    ↓
完成 → 自动下载到 .neko/generated/ → 通知用户
```

---

### 3. AI 生成视频

**当前状态**: ✅ 完成

#### 工具定义

**`GenerateVideo`** — 文本→视频 / 图片→视频 / 视频→视频

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompt` | string | 必填 | 视频描述 |
| `duration` | 1-30 | 4 | 时长（秒）|
| `resolution` | enum | `720p` | `480p` / `720p` / `1080p` |
| `fps` | enum | 24 | `24` / `30` / `60` |
| `referenceImageUrl` | string? | — | 首帧参考图（image-to-video）|
| `referenceVideoUrl` | string? | — | 参考视频（video-to-video）|
| `motionStrength` | number? | — | 运动强度 |

**`EnhanceVideo`** — 视频增强

| 参数 | 类型 | 说明 |
|------|------|------|
| `videoUrl` | string | 原视频 |
| `targetResolution` | enum | `720p` / `1080p` / `4k` |
| `denoise` | boolean | 降噪（默认 true）|
| `stabilize` | boolean | 稳定（默认 false）|
| `interpolateFps` | number | 插帧目标帧率 |

#### 提供商支持

| 提供商 | text-to-video | image-to-video | video-to-video | 适配器 |
|--------|:---:|:---:|:---:|------|
| OpenAI (Sora) | ✅ | ✅ | — | AI SDK 原生 |
| Google (Veo) | ✅ | ✅ | — | AI SDK 原生 |
| NewAPI/OneAPI | ✅ | ✅ | ✅ | AI SDK 自定义（`/v1/video/generations`）|
| Luma AI | ✅ | ✅ | — | Legacy Bridge |
| Runway ML | ✅ | ✅ | ✅ | Legacy Bridge |
| Kling | ✅ | ✅ | — | Legacy Bridge |
| VIDU | ✅ | ✅ | — | Legacy Bridge |
| MiniMax | ✅ | — | — | Legacy Bridge |

#### 视频生成类型

```typescript
type VideoGenerationType =
  | 'text-to-video'    // 纯文本描述生成
  | 'image-to-video'   // 首帧图片 + 运动描述
  | 'video-to-video'   // 参考视频 + 风格/内容变换
```

---

### 4. AI 生成音频

**当前状态**: ✅ 完成

#### 工具定义

**`GenerateTTS`** — 文本转语音

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `text` | string | 必填 | 要朗读的文本 |
| `voice` | enum | — | `alloy` / `echo` / `onyx` / `nova` |
| `language` | string | — | `en` / `zh` / `ja` 等 |
| `speed` | 0.5-2.0 | 1.0 | 语速倍率 |

**`GenerateMusic`** — 音乐生成

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `prompt` | string | 必填 | 音乐描述 |
| `duration` | 5-300 | 30 | 时长（秒）|
| `genre` | string? | — | `corporate` / `ambient` / `electronic` / `lofi` / `cinematic` |
| `mood` | string? | — | `upbeat` / `calm` / `dramatic` / `energetic` / `peaceful` |

**`OptimizeAudio`** — 音频优化

| 参数 | 类型 | 说明 |
|------|------|------|
| `audioUrl` | string | 原音频 |
| `denoise` | boolean | AI 降噪 |
| `normalize` | boolean | 响度标准化 |
| `enhanceVoice` | boolean | 人声增强 |
| `removeBackground` | boolean | 去除背景音 |

#### 提供商支持

| 提供商 | TTS | 音乐 | 适配器 |
|--------|:---:|:---:|------|
| OpenAI TTS | ✅ | — | AI SDK 原生 |
| NewAPI/OneAPI | ✅ | ✅ | AI SDK 自定义 |
| Suno AI | — | ✅ | Legacy Bridge |
| ElevenLabs | ✅ | — | 可通过 NewAPI 代理 |

---

## 高级能力

### 5. 文档分析→剧本生成

**当前状态**: ⚠️ 部分可用（文本文件 ✅ / PDF ❌ / DOCX ❌）

#### 当前能力

| 输入格式 | 状态 | 实现方式 | 说明 |
|----------|------|----------|------|
| `.md` Markdown | ✅ | Read 工具直接读取 | 全格式支持 |
| `.txt` 纯文本 | ✅ | Read 工具直接读取 | 无限制 |
| `.fountain` 剧本 | ✅ | Read + neko-story 解析 | AST 级别理解 |
| `.json/.yaml` 结构化 | ✅ | Read 工具直接读取 | 可解析结构 |
| `.html` 网页 | ✅ | Read 工具直接读取 | 含标签 |
| `.pdf` PDF | ✅ | pdf-parse | 全格式支持 |
| `.docx` Word | ✅ | mammoth.js | 全格式支持 |
| `.pptx` PowerPoint | ✅ | officeparser | 文本 + 元数据 |
| `.epub` 电子书 | ✅ | epub2 | 全格式支持 |

#### 文本文件→剧本的当前工作流

```
用户上传/引用 .md/.txt 文件
    ↓
Read 工具读取全文（最大 2000 行，可分批）
    ↓
LLM 分析文档内容（主题/情节/角色/情感）
    ↓
LLM 生成 Fountain 格式剧本
    ↓
Write 工具保存为 .fountain 文件
    ↓
neko-story 解析 + LSP 诊断
```

#### 缺失：PDF/DOCX 支持方案

```
方案 A：Extension 侧文件转换（推荐）
├─ 安装 pdf-parse + mammoth.js（Extension Host 有 Node.js 完整能力）
├─ 新增 DocumentReader 服务
│   ├─ readPdf(path): Promise<{ text: string, pages: PageInfo[] }>
│   ├─ readDocx(path): Promise<{ text: string, styles: StyleInfo[] }>
│   └─ readPptx(path): Promise<{ text: string, slides: SlideInfo[] }>
├─ 注册为 Agent 工具 `ReadDocument`
└─ 预估工作量：~300 行 TS

方案 B：MCP 服务器代理
├─ 独立 MCP 服务器处理文档解析
├─ 支持 PDF OCR（tesseract.js）
└─ 预估工作量：~500 行 TS + 部署

方案 C：Webview 文件附件预处理
├─ attachmentProcessor.ts 扩展
├─ 上传时自动提取文本 → 注入消息上下文
└─ 预估工作量：~200 行 TS（仅文本提取，无 OCR）
```

#### 文档→剧本转换策略

```
小说/故事文档
    ↓ LLM 分析
    ├─ 提取角色列表 + 性格特征
    ├─ 识别场景划分 + 时间线索
    ├─ 提炼核心冲突 + 情感弧线
    ↓
    ├─ 模式 1：忠实改编（保留原文对白/动作）
    ├─ 模式 2：概念提取（只取核心梗概，重写剧本）
    └─ 模式 3：分镜提取（只提取视觉场景描述）
    ↓
Fountain 格式剧本

企业文档/产品介绍
    ↓ LLM 分析
    ├─ 提取核心卖点 + 使用场景
    ├─ 识别目标受众
    ↓
    ├─ 模式 A：产品宣传片剧本
    ├─ 模式 B：使用教程剧本
    └─ 模式 C：客户故事剧本
    ↓
Fountain 格式剧本
```

---

### 6. 图片/漫画分析→剧本生成

**当前状态**: ⚠️ 基础可用（多模态视觉分析 ✅ + 专用 Skill ❌）

#### 当前能力

| 能力 | 状态 | 实现方式 |
|------|------|----------|
| 单张图片分析 | ✅ | LLM 视觉（Claude/GPT-4V/Gemini）|
| 多张图片对比 | ✅ | 消息支持 `ContentPart[]` 混合文本+图片 |
| 图片附件处理 | ✅ | `attachmentProcessor.ts` base64 提取 |
| 漫画分格识别 | ⚠️ | LLM 视觉可理解，但无专用算法 |
| OCR 文字识别 | ⚠️ | LLM 视觉可识别，精度依赖模型 |
| 角色一致性追踪 | ❌ | 跨图片角色识别需专用方案 |

#### 多模态消息格式

```typescript
// 当前支持的消息格式
interface ChatMessage {
  role: 'user';
  content: ContentPart[];  // 混合文本和图片
}

type ContentPart = TextPart | ImagePart;

interface ImagePart {
  type: 'image';
  imageUrl: string;       // base64 data URL 或 HTTP URL
  detail?: 'auto' | 'low' | 'high';  // 分辨率控制
}
```

#### 图片→剧本的当前工作流

```
用户附加图片（拖拽 / 粘贴 / @ 引用）
    ↓
attachmentProcessor 提取 base64
    ↓
LLM 视觉分析（需 vision 能力模型）
    ├─ 描述画面内容
    ├─ 识别角色/场景/情感
    ├─ 推断故事上下文
    ↓
LLM 生成 Fountain 格式剧本
    ↓
Write 保存 → neko-story 解析
```

#### 漫画分析→剧本的增强方案

```
漫画页面（多格）
    ↓ Phase 1: LLM 视觉分析（当前可用）
    ├─ 识别分格布局（从左到右，从上到下）
    ├─ 每格场景描述
    ├─ 气泡文字 OCR
    ├─ 角色表情/动作
    ↓
    ├─ 输出：结构化场景列表
    │   Scene 1: { 画面描述, 对白, 角色, 情感 }
    │   Scene 2: ...
    ↓ Phase 2: 剧本生成
    ├─ 每格 → Fountain 场景
    ├─ 气泡文字 → 对白
    ├─ 动作线/效果线 → 动作描写
    ├─ 补充过渡/节奏（LLM 创作）
    ↓
完整 Fountain 剧本

    ↓ Phase 3: 视频化（依赖「分镜→批量生成→时间线」）
    ├─ 每个场景 → GenerateImage/Video
    ├─ 对白 → GenerateTTS
    ├─ 背景音乐 → GenerateMusic
    └─ 自动排列到时间线
```

#### 支持的视觉模型

| 模型 | 视觉能力 | 漫画理解 | OCR 精度 |
|------|:---:|:---:|:---:|
| Claude 3.5/4 Sonnet | ✅ 强 | ✅ 优秀 | ✅ 高 |
| Claude 4 Opus | ✅ 强 | ✅ 优秀 | ✅ 高 |
| GPT-4V / GPT-4o | ✅ 强 | ✅ 良好 | ✅ 高 |
| Gemini Pro/Ultra | ✅ 强 | ✅ 良好 | ✅ 高 |
| DeepSeek VL | ⚠️ 一般 | ⚠️ 一般 | ⚠️ 中 |

---

### 7. 分镜→批量视频生成→时间线排列

**当前状态**: ❌ 编排层缺失（原子能力全部就绪）

#### 已有 vs 缺失

```
✅ 已有原子能力                          ❌ 缺失编排层
─────────────────────────                ─────────────────────────
• Fountain 剧本解析                      • 场景→生成提示词的自动编排
• GenerateImage / GenerateVideo          • 批量任务协调 + 等待 + 收集
• TaskManager 并发控制（max 10）         • 生成结果→时间线自动排列
• BatchTaskCard 进度展示                 • neko-story API 暴露给 Agent
• NekoCutAPI.addElement()               • Storyboard-to-Timeline Skill
• 29 种 EditOperation                   • 失败重试 + 部分排列逻辑
• 文件下载 → .neko/generated/
```

#### 推荐方案：混合编排（Skill + 原子工具）

**设计理念**：Skill 负责「理解」（语义），工具负责「执行」（确定性）

```
┌─────────────────────────────────────────────────┐
│          Storyboard-to-Timeline Skill            │
│  （系统提示词：引导 Agent 按步骤执行）              │
└──────────────────┬──────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ↓             ↓             ↓
┌──────────┐ ┌──────────────┐ ┌──────────────┐
│ Parse    │ │ BatchGenerate│ │ ArrangeOn    │
│Storyboard│ │ Media        │ │ Timeline     │
│（解析）   │ │（批量生成）   │ │（排列）      │
└──────────┘ └──────────────┘ └──────────────┘
  新工具 1      新工具 2          新工具 3
```

#### 新增工具 1: `ParseStoryboard`

```typescript
// 解析剧本或自由文本分镜描述 → 结构化场景列表
interface ParseStoryboardInput {
  source: string;                    // 文件路径(.fountain) 或内联文本
  format: 'fountain' | 'freeform';   // 剧本格式 或 自由分镜描述
}

interface ParseStoryboardOutput {
  scenes: Array<{
    index: number;
    heading: string;            // "INT. 咖啡店 - 白天"
    description: string;        // 场景动作描述
    dialogue: string[];         // 对白列表
    estimatedDuration: number;  // 预估时长（秒）
    suggestedPrompt: string;    // AI 为该场景生成的视频提示词
  }>;
}
```

**实现方式**：
- `fountain` 格式：调用 neko-story 解析器 API
- `freeform` 格式：LLM 分析文本，提取场景结构

#### 新增工具 2: `BatchGenerateMedia`

```typescript
// 批量提交场景生成任务
interface BatchGenerateMediaInput {
  scenes: Array<{
    sceneIndex: number;
    prompt: string;              // 生成提示词
    type: 'image' | 'video';    // 生成类型
    duration?: number;           // 视频时长
    referenceImage?: string;     // 参考图（保持一致性）
  }>;
  globalSettings: {
    resolution?: string;         // "1080p"
    style?: string;              // "cinematic" / "anime" / "realistic"
    aspectRatio?: string;        // "16:9" / "9:16" / "1:1"
  };
}

interface BatchGenerateMediaOutput {
  batchId: string;
  taskIds: string[];             // 每个场景对应的任务 ID
  totalScenes: number;
}
```

**实现方式**：
- 内部调用 `MediaGenerationService.generateVideo()` × N
- 复用 TaskManager 并发控制（建议限制 3-5 并发）
- WebView 通过 BatchTaskCard 显示聚合进度

#### 新增工具 3: `ArrangeOnTimeline`

```typescript
// 将批量生成结果按序排列到时间线
interface ArrangeOnTimelineInput {
  batchId: string;                    // 来自 BatchGenerateMedia
  arrangement: 'sequential' | 'custom';
  trackName?: string;                 // 目标轨道名称（默认 "Generated Scenes"）
  startTime?: number;                 // 起始时间（秒，默认 0）
  gap?: number;                       // 场景间隔（秒，默认 0）
  includeSubtitles?: boolean;         // 同时添加字幕轨
  transitions?: {
    type: string;                     // "crossfade" / "fade" / "dissolve"
    duration: number;                 // 转场时长（秒）
  };
}

interface ArrangeOnTimelineOutput {
  elementIds: string[];               // 添加的元素 ID 列表
  totalDuration: number;              // 总时长
  failedScenes: number[];             // 生成失败未排列的场景索引
}
```

**实现方式**：
- 等待 batchId 所有任务完成
- 调用 NekoCutAPI.addElement() 逐个添加
- 使用实际生成结果的 duration（非预估值）
- 失败场景跳过，留空位或报告

#### Skill 定义：`storyboard-to-timeline`

```markdown
---
name: storyboard-to-timeline
display-name: 分镜→视频时间线
description: 将剧本或分镜描述转换为视频并自动排列到时间线
trigger: 分镜|storyboard|批量生成视频|剧本转视频|脚本转视频
tool-sets: [element-editing, effects-transitions]
---

工作流程：

Step 1: 解析分镜
  调用 ParseStoryboard → 获取结构化场景列表
  审查并优化每个场景的 suggestedPrompt（视觉连贯性 + 镜头语言 + 光照氛围）

Step 2: 确认生成计划
  向用户展示场景清单和提示词，确认后继续
  显示预估费用和等待时间

Step 3: 批量生成
  调用 BatchGenerateMedia → 后台任务自动显示进度
  通知用户预计等待时间

Step 4: 排列到时间线
  调用 ArrangeOnTimeline → 结果排列到时间线
  失败场景询问用户处理方式

Step 5: 后期调整建议
  提示可进一步操作：添加转场/配乐/字幕/调色
```

#### 数据流全景

```
输入（剧本 / 自由文本 / 文档 / 漫画图片）
    │
    ├─ .fountain 文件 ──→ ParseStoryboard(format: 'fountain')
    ├─ 自由文本描述 ────→ ParseStoryboard(format: 'freeform')
    ├─ PDF/DOCX ────────→ [ReadDocument → 文本] → ParseStoryboard
    └─ 漫画图片 ────────→ [LLM 视觉分析 → 场景列表] → ParseStoryboard
    │
    ↓
┌──────────────────────────────┐
│ 结构化场景列表                 │
│ Scene[] { heading, desc,     │
│   dialogue, suggestedPrompt } │
└──────────────┬───────────────┘
               │
    Agent 审查 & 优化提示词（LLM 语义理解）
    ├─ 视觉连贯性（角色外貌/场景风格一致）
    ├─ 镜头语言（wide/close-up/tracking）
    ├─ 用户确认生成计划
               │
               ↓
┌──────────────────────────────┐
│ BatchGenerateMedia            │
│ 并发提交 × N（max 3-5 并发）   │
│ TaskManager + BatchTaskCard   │
│ 自动下载到 .neko/generated/   │
└──────────────┬───────────────┘
               │
    后台执行（30s ~ 5min / 场景）
    WebView 显示批量进度条
               │
               ↓
┌──────────────────────────────┐
│ ArrangeOnTimeline             │
│ 顺序排列到视频轨              │
│ 可选：转场 + 字幕轨 + 间隔    │
│ 失败场景跳过/重试             │
└──────────────┬───────────────┘
               │
               ↓
    时间线就绪
    ├─ 添加转场效果
    ├─ GenerateMusic → 配乐轨
    ├─ GenerateTTS → 旁白轨
    └─ 手动微调时长/顺序
```

#### 编排服务接口

```typescript
// StoryboardOrchestrator — Extension 侧编排服务
interface IStoryboardOrchestrator {
  // 解析剧本/自由文本 → 结构化场景
  parseStoryboard(
    source: string,
    format: 'fountain' | 'freeform'
  ): Promise<StoryboardScene[]>;

  // 批量提交生成任务
  batchGenerate(
    scenes: SceneGenerationRequest[],
    settings: GlobalSettings
  ): Promise<BatchResult>;

  // 等待批量任务完成
  waitForBatch(
    batchId: string,
    onProgress?: (progress: BatchProgress) => void
  ): Promise<BatchCompletionResult>;

  // 排列到时间线
  arrangeOnTimeline(
    results: BatchCompletionResult,
    options: ArrangementOptions
  ): Promise<ArrangementResult>;
}
```

#### 工作量估算

| 组件 | 估算 LOC | 说明 |
|------|----------|------|
| `storyboard-to-timeline.md` Skill | ~60 | 提示词模板 |
| `storyboardTools.ts` 3 个工具注册 | ~150 | 参数校验 + 调用编排 |
| `StoryboardOrchestrator.ts` 编排服务 | ~250 | 解析→批量→等待→排列 |
| neko-story API 暴露 | ~30 | `parseScript()` extension API |
| 接口定义 | ~40 | 类型契约 |
| 单元测试 | ~200 | 解析/编排/排列测试 |
| **合计** | **~730** | |

#### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 编排层级 | Extension（确定性）| 批量状态追踪不能依赖 LLM |
| 提示词生成 | Agent（LLM）| 场景→视频提示词需语义理解 |
| 用户确认 | Step 2 必须确认 | 批量生成消耗配额，防止误触发 |
| 并发策略 | 3-5 并发 | 大多数视频提供商有速率限制 |
| 失败处理 | 跳过 + 允许重试 | 部分失败不阻塞整体 |
| 自由文本 | `freeform` 格式 | 降低门槛，不强制 Fountain |

#### 风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| 视频生成耗时长（每个 30s-5min）| 10 场景等 30min+ | 并发 + 进度展示 + 允许部分排列 |
| 提供商配额/费用 | 批量成本高 | Step 2 强制确认 + 显示预估费用 |
| 视觉一致性差 | 不同场景风格不统一 | Skill 提示词强调一致性描述 |
| 时长偏差 | 预估 vs 实际不符 | ArrangeOnTimeline 使用实际 duration |

---

## 创作流程矩阵

### 流程总览

创作流程分为 4 个阶段，可按需组合跳过：

```
┌──────────────────────────────────────────────────────────────────────┐
│                        创作流程四阶段                                  │
│                                                                      │
│  ① 前期素材          ② 剧本           ③ 分镜            ④ 视频后期    │
│  ─────────          ──────           ──────            ──────────    │
│  PDF/DOCX           Fountain         场景提示词          时间线编排    │
│  Markdown           .fountain        视觉描述           剪辑/转场     │
│  图片/漫画           .nks            参考图              配乐/配音     │
│  网页/文章           自由文本          时长预估           调色/特效     │
│  产品文档                            画布可视化          导出渲染      │
│  故事梗概                                                            │
└──────────────────────────────────────────────────────────────────────┘
```

### 六种创作流程

```
Flow A: ①→②→③→④  完整流程（文档→剧本→分镜→视频）— 专业影视制作
Flow B: ①→④        直达流程（素材→视频）— 快速混剪/宣传片
Flow C: ①→③→④      跳过剧本（素材→分镜→视频）— 视觉驱动创作
Flow D: ②→④        跳过分镜（剧本→视频）— 文字驱动快速出片
Flow E: ①→③→④      漫画变体（漫画→分镜→视频）— 漫改动画
Flow F: ②→③→④      标准流程（剧本→分镜→视频）— 最常用路径
```

---

### Flow A: 素材→剧本→分镜→视频 (1→2→3→4)

**适用场景**：小说改编、产品宣传片、教程视频、纪录片

```
① 前期素材输入
│
├─ 文档类
│  ├─ .md/.txt ──→ Read 工具直读 ✅
│  ├─ .pdf ──────→ ReadDocument 工具（❌ 待实现）
│  └─ .docx ─────→ ReadDocument 工具（❌ 待实现）
│
├─ 网页/文章
│  └─ URL ───────→ WebSearch 工具 ✅
│
└─ 产品资料
   └─ 多文件 ───→ @file 引用 + Glob 批量读取 ✅
│
↓ LLM 分析文档内容
↓ 提取：主题/角色/情节/核心信息
│
② 剧本生成
│
├─ LLM 生成 Fountain 格式剧本
├─ Write 工具保存为 .fountain
├─ neko-story LSP 实时诊断 + 预览
└─ 用户在 neko-story 编辑器中修改润色
│
↓ Script-to-Timeline Skill 或 ParseStoryboard
│
③ 分镜阶段
│
├─ ParseStoryboard 解析场景结构（❌ 待实现）
├─ LLM 为每个场景生成视频提示词
├─ 用户审查 & 确认生成计划
├─ BatchGenerateMedia 批量提交（❌ 待实现）
└─ 可选：neko-canvas StoryboardNode 可视化编排
│
↓ ArrangeOnTimeline 自动排列（❌ 待实现）
│
④ 视频后期
│
├─ 时间线排列（NekoCutAPI.addElement）
├─ 添加转场（SetTransition）
├─ 配乐（GenerateMusic → audio 轨）
├─ 配音/旁白（GenerateTTS → audio 轨）
├─ 字幕（对白 → subtitle 轨）
├─ 调色（SetColorCorrection）
├─ 特效（AddEffect → GPU shader）
└─ 导出渲染（ExportVideo → neko-engine GPU）
```

**涉及系统**：

| 阶段 | 系统 | 工具/API |
|------|------|----------|
| ①→② | neko-agent | Read, WebSearch, LLM 对话, Write |
| ② | neko-story | Fountain 解析器, LSP, 编辑器 |
| ②→③ | neko-agent | ParseStoryboard, LLM 提示词优化 |
| ③ | neko-agent + neko-canvas | BatchGenerateMedia, StoryboardNode |
| ③→④ | neko-agent | ArrangeOnTimeline |
| ④ | neko-cut + neko-engine | 时间线编辑, GPU 渲染, 导出 |

---

### Flow B: 素材→视频 (1→4)

**适用场景**：快速混剪、素材拼接、产品展示、社交媒体短视频

```
① 前期素材
│
├─ 已有视频/图片文件
│  └─ 用户拖拽到 neko-cut 时间线 ✅
│
├─ 文字描述 → 直接生成
│  ├─ "生成一段日落海滩的视频" → GenerateVideo ✅
│  ├─ "生成产品展示图" → GenerateImage ✅
│  └─ "生成背景音乐" → GenerateMusic ✅
│
└─ 文档中提取关键信息 → 直接生成
   ├─ Read 文档 → LLM 提取关键视觉元素
   └─ 逐个调用 GenerateImage/Video
│
↓ 跳过 ②③，直接进入后期
│
④ 视频后期
│
├─ Agent 使用 AddElement 添加到时间线
├─ Agent 使用 UpdateElement 调整时长/位置
├─ 手动或 Agent 添加转场/特效
└─ 导出
```

**特点**：最快速，适合已有明确素材或简单生成需求，无需剧本和分镜规划。

**现有工具链**：

```
用户: "帮我生成3张产品图和一段展示视频，拼成30秒宣传片"
  ↓
Agent:
  1. GenerateImage × 3（并发）     ← ✅ 已有
  2. GenerateVideo × 1             ← ✅ 已有
  3. 等待完成                      ← ✅ TaskManager
  4. GetTimelineInfo               ← ✅ 已有
  5. AddElement × 4（顺序排列）    ← ✅ 已有
  6. SetTransition × 3（添加转场） ← ✅ 已有
  7. GenerateMusic（配乐）         ← ✅ 已有
  8. AddElement（音频轨）          ← ✅ 已有
```

**状态**：✅ **当前已可实现**（Agent 逐步工具调用，无需编排层）

---

### Flow C: 素材→分镜→视频 (1→3→4)

**适用场景**：视觉驱动创作、概念艺术→动画、参考图→成片

```
① 前期素材
│
├─ 参考图片集
│  ├─ 用户提供场景参考图 → LLM 视觉分析 ✅
│  └─ 提取视觉元素：色调/构图/氛围
│
├─ 概念设计稿
│  ├─ neko-sketch 手绘分镜草图 ✅
│  └─ 导出为 PNG → 作为 image-to-video 参考
│
└─ 文字场景描述（非完整剧本）
   └─ "场景1: 城市日出；场景2: 街头咖啡；场景3: 办公室"
│
↓ 跳过剧本，直接构建分镜
│
③ 分镜阶段
│
├─ ParseStoryboard(format: 'freeform') 解析场景列表
├─ 参考图 → image-to-video（保持视觉一致性）
├─ 文字描述 → text-to-video
├─ BatchGenerateMedia 批量提交
└─ neko-canvas 可视化编排（可选）
│
↓
│
④ 视频后期（同 Flow A）
```

**与 Flow A 的区别**：没有完整剧本，场景之间靠视觉逻辑（而非叙事逻辑）连接。

**关键能力**：`image-to-video`（参考图→视频）是此流程的核心，确保视觉一致性。

---

### Flow D: 剧本→视频 (2→4)

**适用场景**：已有剧本、字幕视频、演讲配画面、有声读物可视化

```
② 剧本（已有 .fountain 文件）
│
↓ Script-to-Timeline Skill ✅
↓ TimelineConverter 转换 ✅
│
④ 视频后期
│
├─ 场景标题 → text 轨（自动）✅
├─ 对白 → subtitle 轨（自动）✅
├─ 手动添加视频素材到 media 轨
├─ 或 Agent 按场景描述逐个 GenerateVideo
│  （当前需逐个调用，无批量编排）
├─ GenerateTTS → 旁白轨
└─ GenerateMusic → 配乐轨
```

**特点**：跳过分镜阶段，直接从剧本生成时间线骨架。视频素材通过手动添加或 Agent 逐个生成。

**现有能力**：
- TimelineConverter 生成 2 轨骨架 ✅
- Agent 可逐个调用 GenerateVideo 并 AddElement ✅
- 但缺少**批量编排**（需要逐个手动触发，无法"一键全部生成"）

---

### Flow E: 漫画→分镜→视频 (1→3→4 视觉变体)

**适用场景**：漫改动画、绘本动画化、插画→短片

```
① 漫画/插画输入
│
├─ 漫画页面（多格）
│  ├─ 用户附加图片 → attachmentProcessor base64 ✅
│  └─ LLM 视觉分析 ✅
│      ├─ 识别分格布局
│      ├─ 每格场景描述
│      ├─ 气泡文字 OCR
│      └─ 角色表情/动作
│
├─ 连续插画集
│  └─ 多张图片 → ContentPart[] 混合分析 ✅
│
└─ neko-sketch 手绘原稿
   └─ 导出 PNG → 同上分析流程
│
↓ LLM 结构化输出
│
③ 分镜阶段
│
├─ 每格漫画 → 一个 StoryboardScene
│  ├─ heading: 场景位置
│  ├─ description: 画面动作
│  ├─ dialogue: 气泡文字
│  └─ suggestedPrompt: 动画化提示词
│
├─ 关键帧策略
│  ├─ 方案 A: image-to-video（漫画原图→动画）
│  │  └─ 保持原始画风，添加运动
│  ├─ 方案 B: text-to-video（重新生成）
│  │  └─ 提示词包含"anime style matching [原图描述]"
│  └─ 方案 C: 混合（关键帧用原图，补间用生成）
│
├─ GenerateCharacter 保持角色一致性
│  └─ referenceImageUrl: 漫画中的角色特写
│
└─ BatchGenerateMedia 批量提交
│
↓
│
④ 视频后期
│
├─ ArrangeOnTimeline 按漫画阅读顺序排列
├─ 对白 → GenerateTTS → 配音轨
├─ 效果音 → GenerateMusic(sfx) 或手动
├─ 漫画式转场（wipe/page-turn 效果）
└─ 导出
```

**关键挑战**：

| 挑战 | 当前状态 | 解决方案 |
|------|----------|----------|
| 漫画分格识别 | ⚠️ LLM 可理解 | 依赖 Claude/GPT-4V 视觉能力 |
| 角色一致性 | ⚠️ GenerateCharacter | referenceImage + 风格描述 |
| 画风保持 | ⚠️ image-to-video | 原图作为首帧参考 |
| 气泡文字 OCR | ⚠️ LLM 视觉 | 多语言支持依赖模型能力 |

---

### Flow F: 剧本→分镜→视频 (2→3→4)

**适用场景**：最常用的标准创作流程，适合短片、MV、广告

```
② 剧本
│
├─ 已有 .fountain 文件
│  └─ ParseStoryboard(format: 'fountain')
│
└─ 用户口述/简述
   └─ LLM 生成 Fountain → Write → ParseStoryboard
│
↓ Fountain 解析 → 结构化场景
│
③ 分镜阶段
│
├─ 每个 SceneHeading → 一个 StoryboardScene
│  ├─ Action 段落 → description（视觉描述）
│  ├─ Dialogue → dialogue（对白）
│  ├─ Transition → 场景切换方式
│  └─ LLM 生成 suggestedPrompt
│
├─ neko-canvas 可视化（可选）
│  ├─ 每个场景 → StoryboardNode
│  ├─ 用 sequence connection 连接
│  ├─ 拖拽调整顺序
│  └─ linkedProject → .nkv 文件
│
├─ 用户审查 & 确认
│  ├─ 修改场景顺序
│  ├─ 调整提示词
│  └─ 设置全局风格
│
└─ BatchGenerateMedia 批量生成
│
↓
│
④ 视频后期
│
├─ ArrangeOnTimeline 自动排列
├─ Dialogue → GenerateTTS → 配音
├─ 整体氛围 → GenerateMusic → 配乐
├─ Transition 指示 → SetTransition
├─ 调色 + 特效
└─ 导出
```

**这是分镜→批量生成→时间线排列功能的主要目标流程。**

---

### 流程对比与选择指南

#### 流程选择矩阵

```
                    有完整剧本？
                   /          \
                 YES           NO
                 /               \
           需要分镜？          有视觉素材？
           /      \            /        \
         YES      NO         YES        NO
         /          \        /            \
    Flow F        Flow D   Flow C/E     Flow B
   ②→③→④         ②→④      ①→③→④       ①→④
  标准流程      快速出片  视觉驱动    极速生成
```

#### 详细对比

| 维度 | Flow A | Flow B | Flow C | Flow D | Flow E | Flow F |
|------|--------|--------|--------|--------|--------|--------|
| **路径** | ①→②→③→④ | ①→④ | ①→③→④ | ②→④ | ①→③→④ | ②→③→④ |
| **场景** | 小说改编/纪录片 | 快速混剪 | 概念→成片 | 有剧本出片 | 漫改动画 | 标准创作 |
| **耗时** | 最长 | 最短 | 中等 | 较短 | 中等 | 中等 |
| **质量** | 最高（全流程把控） | 较低 | 中高 | 中等 | 中高 | 高 |
| **AI 依赖** | 高 | 中 | 高 | 低 | 高 | 高 |
| **人工介入** | 每阶段审查 | 最少 | 视觉审查 | 剧本阶段 | 视觉+文字 | 分镜审查 |
| **当前可行** | ⚠️ 部分 | ✅ 完全 | ⚠️ 部分 | ✅ 完全 | ⚠️ 部分 | ⚠️ 部分 |

#### 各流程缺失项

| 流程 | 缺失组件 | 优先级 |
|------|----------|--------|
| **Flow B** | 无（全部已有） | — |
| **Flow D** | 无（全部已有，但缺批量编排） | P2 |
| **Flow F** | ParseStoryboard + BatchGenerate + ArrangeOnTimeline | **P1** |
| **Flow A** | Flow F 全部 + ReadDocument（PDF/DOCX） | P1 |
| **Flow C** | Flow F 全部 | P1 |
| **Flow E** | Flow F 全部 + 漫画分析 Skill | P1+P2 |

#### 实现顺序建议

```
Phase 1: 打通 Flow F（②→③→④）— 最常用路径
├─ ParseStoryboard + BatchGenerateMedia + ArrangeOnTimeline
├─ storyboard-to-timeline Skill
└─ 完成后 Flow C/D/E 自动受益

Phase 2: 扩展输入能力，打通 Flow A
├─ ReadDocument 工具（PDF/DOCX/PPTX）
└─ 文档→剧本 Skill

Phase 3: 漫画专项，完善 Flow E
├─ 漫画分析 Skill（分格识别+OCR+角色追踪）
└─ image-to-video 优化（画风保持）
```

---

---

## 架构决策：是否需要通用编排层？

### 现状分析

当前系统**没有统一编排抽象**，使用分层专用编排器：

| 层 | 职责 | 模式 | 支持依赖链？ |
|---|---|---|:---:|
| **TaskManager** | 异步媒体任务 | 并发池 + 轮询 | ❌ |
| **AgentExecutor** | LLM 推理循环 | ReAct (think-act-observe) | ❌（隐式） |
| **SubAgentManager** | 子 Agent 并发 | 事件驱动 + 资源限制 | ❌ |
| **SkillService** | Skill 发现注入 | 无状态模式匹配 | ❌ |

6 种创作流程的原子操作完全相同，区别仅在**组合顺序和数据流转**：

```
所有流程共享的原子操作：
├─ ReadDocument / Read       （输入解析）
├─ LLM 分析理解              （内容理解）
├─ ParseStoryboard            （结构化）
├─ GenerateImage/Video/Audio  （媒体生成）
├─ BatchGenerateMedia          （批量生成）
├─ ArrangeOnTimeline           （时间线排列）
└─ 后期工具 (Effect/Transition/Color) （后期处理）
```

### 三种方案对比

#### 方案 A：不要编排层，全靠 LLM + Skill

```
Skill 提示词教 Agent 按步骤执行 → Agent 逐个调用工具
```

| 维度 | 评估 |
|------|------|
| 优点 | 零后端改动，纯提示词工程，最灵活 |
| 缺点 | LLM 可能跳步/乱序，批量等待不可靠，无法聚合进度 |
| 适用 | Flow B/D（简单线性，<5 步） |
| 不适用 | Flow F/A/E（10+ 步，含并发等待 + 进度聚合） |
| 工作量 | ~100 LOC（Skill 定义） |

#### 方案 B：通用 DAG 编排引擎

```
定义 WorkflowDAG → 拓扑排序 → 自动执行 → 条件分支 → 重试/回滚
```

| 维度 | 评估 |
|------|------|
| 优点 | 可视化编排、复杂流程、可复用 |
| 缺点 | 过度工程（当前流程全是线性 pipeline），开发成本高 |
| 适用 | 交互视频（Phase 8）等真正有分支的场景 |
| 不适用 | 当前 Phase 2 需求 |
| 工作量 | ~2000+ LOC |

#### 方案 C：轻量 Pipeline 抽象（推荐）

```
Pipeline = Stage[] → 每个 Stage 可含并发任务 → Stage 间有确认门
```

| 维度 | 评估 |
|------|------|
| 优点 | 确定性执行，进度聚合，用户确认门，复用性好 |
| 缺点 | 不支持分支（但当前不需要） |
| 适用 | 所有当前流程（线性 pipeline + 并发生成） |
| 可扩展 | 未来需要分支时可升级为 DAG |
| 工作量 | ~500 LOC |

### 推荐：方案 C — 轻量 Pipeline

**核心洞察**：6 种流程虽路径不同，但都是**线性 Pipeline + 中间有并发任务池**。不需要 DAG。

```
Pipeline 结构：

Stage 1 (输入解析)  ──→  Stage 2 (分镜) ──→  Stage 3 (批量生成) ──→  Stage 4 (排列)
     │                      │                    │                       │
   单任务                 单任务              并发任务池               单任务
   Read/LLM              ParseStoryboard    GenerateMedia ×N        Arrange
                              │                    │
                          [确认门]              [进度聚合]
                        用户审查提示词         BatchTaskCard
```

#### Pipeline 接口设计

```typescript
// 轻量 Pipeline — 不是通用 DAG，而是有序 Stage 链
interface IPipeline<TContext> {
  readonly id: string;
  readonly name: string;
  readonly stages: PipelineStage<TContext>[];

  execute(input: TContext): AsyncIterable<PipelineEvent>;
  cancel(): Promise<void>;
  getProgress(): PipelineProgress;
}

interface PipelineStage<TContext> {
  readonly name: string;
  readonly gate?: 'auto' | 'confirm';     // 是否需要用户确认才进入下一阶段

  // 执行逻辑：接收上下文，返回更新后的上下文
  execute(ctx: TContext): Promise<TContext>;

  // 可选：阶段内并发任务
  parallelTasks?(ctx: TContext): ParallelTask[];
}

interface ParallelTask {
  id: string;
  name: string;
  execute(): Promise<TaskResult>;
}

// 进度事件
type PipelineEvent =
  | { type: 'stage_start'; stage: string }
  | { type: 'stage_complete'; stage: string; result: unknown }
  | { type: 'gate_waiting'; stage: string; preview: unknown }  // 等待用户确认
  | { type: 'gate_confirmed'; stage: string }
  | { type: 'task_progress'; stage: string; taskId: string; progress: number }
  | { type: 'pipeline_complete'; result: unknown }
  | { type: 'pipeline_error'; error: Error; stage: string };
```

#### 6 种流程如何映射到 Pipeline

```typescript
// Flow F: 剧本→分镜→视频（标准流程）
const flowF: PipelineStage[] = [
  { name: 'parse',    execute: parseStoryboard,    gate: 'auto' },
  { name: 'prompt',   execute: generatePrompts,    gate: 'confirm' },  // 用户审查提示词
  { name: 'generate', execute: batchGenerate,      gate: 'auto',
    parallelTasks: (ctx) => ctx.scenes.map(s => generateMediaTask(s))
  },
  { name: 'arrange',  execute: arrangeOnTimeline,  gate: 'auto' },
];

// Flow A: 文档→剧本→分镜→视频（完整流程）= 前置 Stage + Flow F
const flowA: PipelineStage[] = [
  { name: 'read',     execute: readDocument,       gate: 'auto' },
  { name: 'script',   execute: generateScript,     gate: 'confirm' },  // 用户审查剧本
  ...flowF,  // 复用 Flow F 的全部阶段
];

// Flow B: 素材→视频（直达）= 简化 Pipeline
const flowB: PipelineStage[] = [
  { name: 'generate', execute: generateFromPrompts, gate: 'confirm',
    parallelTasks: (ctx) => ctx.prompts.map(p => generateMediaTask(p))
  },
  { name: 'arrange',  execute: arrangeOnTimeline,  gate: 'auto' },
];

// Flow D: 剧本→视频（跳过分镜）
const flowD: PipelineStage[] = [
  { name: 'parse',    execute: parseScript,        gate: 'auto' },
  { name: 'arrange',  execute: scriptToTimeline,   gate: 'auto' },  // TimelineConverter
];

// Flow E: 漫画→分镜→视频 = 替换 parse Stage + Flow F
const flowE: PipelineStage[] = [
  { name: 'analyze',  execute: analyzeComic,       gate: 'auto' },   // LLM 视觉分析
  { name: 'prompt',   execute: generatePrompts,    gate: 'confirm' },
  { name: 'generate', execute: batchGenerate,      gate: 'auto',
    parallelTasks: (ctx) => ctx.scenes.map(s => generateMediaTask(s))
  },
  { name: 'arrange',  execute: arrangeOnTimeline,  gate: 'auto' },
];
```

#### 与现有系统的关系

```
Pipeline 与现有层的关系（新增，不替换）：

┌─────────────────────────────────────────────┐
│ Pipeline（新增编排层）                        │
│  ├─ 定义 Stage 链 + 确认门                   │
│  ├─ 聚合进度 → WebView PipelineProgressCard  │
│  └─ 数据在 Stage 间流转                      │
├─────────────────────────────────────────────┤
│ TaskManager（已有，Pipeline 内部使用）         │
│  └─ 并发 Stage 的任务池管理                   │
├─────────────────────────────────────────────┤
│ Agent + Skill（已有，Pipeline 触发入口）       │
│  └─ Skill 判断使用哪个 Pipeline               │
│  └─ Agent 在确认门处与用户交互                 │
├─────────────────────────────────────────────┤
│ NekoCutAPI / MediaGenerationService（已有）    │
│  └─ Stage 内部调用的原子服务                   │
└─────────────────────────────────────────────┘
```

#### 为什么不用 DAG？

| 考量 | Pipeline | DAG |
|------|----------|-----|
| 当前 6 种流程 | 全部是线性（无分支） | 过度 |
| 用户确认门 | 天然支持（Stage 间） | 需额外抽象 |
| 进度聚合 | 简单（Stage 序号/总数） | 复杂（DAG 完成百分比） |
| 复用 Stage | 数组拼接即可 | 需要子图合并 |
| 未来升级 | Pipeline → DAG 仅需添加分支逻辑 | — |
| 当前需要 DAG 的场景 | **零**（Phase 8 交互视频才需要） | Phase 8+ |

---

### 扩展考量：ReAct 循环 Stage

#### 未来场景分析

当前 6 种创作流程是线性 Pipeline，但后续能力扩展会引入**反馈循环**：

| 场景 | 模式 | 循环逻辑 |
|------|------|----------|
| **视频导出质量检查** | 执行→检测→重试 | 导出 → SSIM/PSNR 检测 → 低于阈值 → 调参重渲染 |
| **视频提取/场景分割** | 分析→分段→再分析 | 全片分析 → 切割场景 → 每段再提取关键帧 |
| **视频理解** | 分析→推理→验证 | 视觉分析 → LLM 推理内容 → 对比源素材验证 |
| **AI 生成质量筛选** | 生成→评估→重生成 | 批量生成 → CLIP 打分 → 低分重新生成 |
| **风格一致性修正** | 检测→调整→再检测 | 检查帧间一致性 → 风格迁移修正 → 再检测 |
| **自动配乐匹配** | 生成→分析→调整 | 生成配乐 → 分析情绪匹配度 → 不匹配则重生成 |

这些场景的共同模式是 **ReAct 循环**（Execute → Evaluate → Decide → Re-execute），与 AgentExecutor 的 think-act-observe 同构。

#### Stage 类型扩展

Pipeline Stage 从单一执行类型扩展为三种：

```typescript
type StageType = 'linear' | 'parallel' | 'reactive';

// 线性 Stage（当前）— 执行一次，通过即进入下一阶段
interface LinearStage<TContext> {
  type: 'linear';
  name: string;
  gate?: 'auto' | 'confirm';
  execute(ctx: TContext): Promise<TContext>;
}

// 并发 Stage（当前）— 多任务并发执行
interface ParallelStage<TContext> {
  type: 'parallel';
  name: string;
  gate?: 'auto' | 'confirm';
  tasks(ctx: TContext): ParallelTask[];
  merge(ctx: TContext, results: TaskResult[]): TContext;
}

// 反馈循环 Stage（新增）— Execute → Evaluate → Decide
interface ReactiveStage<TContext> {
  type: 'reactive';
  name: string;
  gate?: 'auto' | 'confirm';
  maxIterations: number;                    // 防止无限循环

  execute(ctx: TContext): Promise<TContext>; // 执行动作
  evaluate(ctx: TContext): Promise<EvalResult>; // 评估结果
  // decide 逻辑：
  //   pass → 进入下一 Stage
  //   retry → 重新 execute（可修改 ctx）
  //   escalate → 交给用户/Agent 决策
}

interface EvalResult {
  verdict: 'pass' | 'retry' | 'escalate';
  score?: number;                           // 0-1 质量分数
  reason?: string;                          // 评估说明
  adjustments?: Partial<TContext>;           // retry 时的参数调整
}
```

#### 未来场景映射

```typescript
// 场景 1：视频导出质量检查
const exportQualityStage: ReactiveStage = {
  type: 'reactive',
  name: 'export-with-quality-check',
  maxIterations: 3,
  async execute(ctx) {
    // 调用 neko-engine 导出
    await exportService.enqueueExport(ctx.project, ctx.exportConfig);
    return { ...ctx, exportedPath: result.path };
  },
  async evaluate(ctx) {
    // 分析导出质量（SSIM/PSNR + 黑帧检测）
    const metrics = await analyzeVideoQuality(ctx.exportedPath);
    if (metrics.ssim > 0.95 && !metrics.hasBlackFrames) {
      return { verdict: 'pass', score: metrics.ssim };
    }
    if (metrics.ssim < 0.8) {
      return { verdict: 'escalate', reason: '质量严重不足，需用户确认' };
    }
    return {
      verdict: 'retry',
      reason: `SSIM ${metrics.ssim} < 0.95`,
      adjustments: { exportConfig: { ...ctx.exportConfig, quality: 'high' } }
    };
  }
};

// 场景 2：AI 生成质量筛选
const generateWithScreening: ReactiveStage = {
  type: 'reactive',
  name: 'generate-and-screen',
  maxIterations: 3,
  async execute(ctx) {
    const task = await mediaService.generateVideo(ctx.request);
    return { ...ctx, generatedPath: task.outputs[0].url };
  },
  async evaluate(ctx) {
    // CLIP 打分：提示词 ↔ 生成结果 对齐度
    const score = await clipScore(ctx.request.prompt, ctx.generatedPath);
    if (score > 0.7) return { verdict: 'pass', score };
    return {
      verdict: 'retry',
      reason: `CLIP score ${score} < 0.7`,
      adjustments: { request: { ...ctx.request, prompt: refinePrompt(ctx.request.prompt) } }
    };
  }
};

// 场景 3：视频场景分割 → 递归分析
const sceneExtraction: ReactiveStage = {
  type: 'reactive',
  name: 'scene-extraction',
  maxIterations: 5,
  async execute(ctx) {
    // 检测场景边界
    const scenes = await detectSceneBoundaries(ctx.videoPath, ctx.threshold);
    return { ...ctx, scenes, sceneCount: scenes.length };
  },
  async evaluate(ctx) {
    // 场景数量合理性检查
    if (ctx.sceneCount >= ctx.minScenes && ctx.sceneCount <= ctx.maxScenes) {
      return { verdict: 'pass' };
    }
    if (ctx.sceneCount < ctx.minScenes) {
      return { verdict: 'retry', adjustments: { threshold: ctx.threshold * 0.8 } }; // 降低阈值，检测更多
    }
    return { verdict: 'retry', adjustments: { threshold: ctx.threshold * 1.2 } };   // 提高阈值，减少碎片
  }
};
```

#### Pipeline 执行器对 ReactiveStage 的处理

```typescript
// Pipeline 核心执行逻辑扩展
async function* executeStage(stage, ctx): AsyncIterable<PipelineEvent> {
  if (stage.type === 'linear') {
    ctx = await stage.execute(ctx);
    yield { type: 'stage_complete', stage: stage.name };

  } else if (stage.type === 'parallel') {
    const tasks = stage.tasks(ctx);
    const results = await Promise.allSettled(tasks.map(t => t.execute()));
    ctx = stage.merge(ctx, results);
    yield { type: 'stage_complete', stage: stage.name };

  } else if (stage.type === 'reactive') {
    let iteration = 0;
    while (iteration < stage.maxIterations) {
      // Execute
      ctx = await stage.execute(ctx);
      yield { type: 'reactive_executed', stage: stage.name, iteration };

      // Evaluate
      const eval = await stage.evaluate(ctx);
      yield { type: 'reactive_evaluated', stage: stage.name, eval };

      if (eval.verdict === 'pass') {
        yield { type: 'stage_complete', stage: stage.name, iterations: iteration + 1 };
        break;
      }
      if (eval.verdict === 'escalate') {
        yield { type: 'gate_waiting', stage: stage.name, reason: eval.reason };
        // 等待用户/Agent 决策
        break;
      }
      // retry: 应用调整，继续循环
      if (eval.adjustments) {
        ctx = { ...ctx, ...eval.adjustments };
      }
      iteration++;
    }
    if (iteration >= stage.maxIterations) {
      yield { type: 'reactive_max_iterations', stage: stage.name };
    }
  }
}
```

#### 与 AgentExecutor ReAct 的关系

```
AgentExecutor (已有)               Pipeline ReactiveStage (新增)
─────────────────────              ──────────────────────────────
Think: LLM 推理                   Execute: 调用具体服务
Act:   执行工具                    Evaluate: 质量/结果评估
Observe: 观察结果                  Decide: pass/retry/escalate
↓                                  ↓
LLM 决定下一步                     规则引擎决定下一步
（灵活但不确定）                    （确定性，可配置阈值）
```

**关键区别**：
- AgentExecutor 的循环由 **LLM 驱动**（灵活但不可靠）
- ReactiveStage 的循环由 **规则驱动**（确定性，可配置阈值）
- 两者可**嵌套**：Agent 启动 Pipeline → Pipeline 内 ReactiveStage 自动循环 → escalate 时回到 Agent 让 LLM 决策

```
Agent ReAct 循环（外层，LLM 驱动）
  └─ 调用 StartPipeline 工具
       └─ Pipeline 执行
            └─ ReactiveStage（内层，规则驱动）
                 ├─ pass → 自动继续
                 ├─ retry → 自动重试（规则控制）
                 └─ escalate → 返回 Agent → LLM 判断 → 再次调用工具
```

---

### 架构决策：Pipeline vs Workflow

#### 概念区分

| 维度 | Pipeline | Workflow |
|------|----------|----------|
| **定义方** | 开发者（代码定义） | 用户（可视化/配置定义） |
| **结构** | 线性 Stage 链 | 任意 DAG（节点+边） |
| **可变性** | 编译时固定，运行时选择 | 运行时用户自由编排 |
| **持久化** | 无（一次性执行） | 有（保存/加载/版本） |
| **可恢复** | 否（失败重跑整个） | 是（从失败节点恢复） |
| **可视化** | 进度条 | 节点图编辑器 |
| **典型代表** | CI/CD Pipeline | n8n / ComfyUI / Temporal |

#### 当前需求分析

```
6 种创作流程的实际特征：

1. 执行路径固定（不需要用户编排节点图）
2. 变化点在"选哪条 Pipeline"而非"怎么连节点"
3. 并发任务内部是同质的（全是 GenerateMedia）
4. 用户交互点是"确认/取消"而非"拖拽连线"
5. 没有跨会话恢复需求（失败重跑即可）

结论：当前需求是 Pipeline，不是 Workflow。
```

#### 未来是否需要 Workflow？

| 场景 | 需要 Workflow？ | 理由 |
|------|:---:|------|
| 6 种创作流程 | ❌ | 路径固定，Pipeline 足够 |
| 视频导出质量检查 | ❌ | ReactiveStage 覆盖 |
| AI 生成批量筛选 | ❌ | ReactiveStage 覆盖 |
| **ComfyUI 式 AI 图片流水线** | ✅ | 用户自定义节点链（denoise→upscale→face-fix→...） |
| **批量视频处理工厂** | ✅ | 用户定义：输入文件夹→转码→加水印→分发 |
| **跨扩展自动化** | ✅ | 用户定义：story→cut→export→upload→notify |

**结论**：Workflow 是**远期需求**（Phase 6+ 资产管理/社区分发 或 Phase 8+ 自动化），不是 Phase 2。

#### 如果未来要做 Workflow，架构预留

Pipeline 的 Stage 可以作为 Workflow 的**原子节点**复用：

```
远期 Workflow 架构（不在当前实现范围）：

WorkflowDefinition（用户可编辑的 DAG）
  ├─ WorkflowNode（每个节点包装一个 PipelineStage 或原子工具）
  ├─ WorkflowEdge（数据流转 + 条件分支）
  ├─ WorkflowTrigger（手动 / 定时 / 文件变更 / webhook）
  └─ WorkflowPersistence（.nkw 文件 / JSON Schema）

Pipeline Stage → Workflow Node 的映射：
  LinearStage   → 普通执行节点
  ParallelStage → 并发分支节点
  ReactiveStage → 循环/条件节点
  Agent 工具     → 工具调用节点
```

**当前不做 Workflow 的理由**：
1. Workflow 引擎本身是重量级基础设施（~3000-5000 LOC）
2. 可视化编辑器需要独立 Webview（非 neko-canvas，职责不同）
3. 当前无用户自定义编排的需求
4. Pipeline Stage 设计已预留向 Workflow Node 的映射路径

**决策**：Phase 2 只做 Pipeline。Stage 接口设计时考虑未来可包装为 Workflow Node，但不提前实现 Workflow 引擎。

#### 分阶段实现策略

```
Phase 2（当前）：仅实现 linear + parallel Stage
├─ 满足 6 种创作流程
├─ ~710 LOC
└─ ReactiveStage 接口预留，不实现

Phase 3+：实现 ReactiveStage
├─ 导出质量检查（SSIM/PSNR + 黑帧检测）
├─ AI 生成质量筛选（CLIP 打分）
├─ ~200 LOC（Stage 类型 + 执行器扩展）

Phase 4+：高级循环场景
├─ 视频场景分割（自适应阈值）
├─ 视频理解（多模态分析 + LLM 推理）
├─ 风格一致性修正
└─ ~300 LOC（具体 Stage 实现）
```

#### 工作量重估（含 ReactiveStage 预留）

| 组件 | Phase 2 LOC | Phase 3+ LOC | 说明 |
|------|-------------|-------------|------|
| `Pipeline` 核心 | ~150 | +50 | Stage 链 + 确认门 + ReactiveStage 执行 |
| `PipelineStages` | ~200 | +150 | 5 个 linear/parallel + 3 个 reactive |
| `PipelineRegistry` | ~50 | +30 | 流程组合 + 新增质量检查流程 |
| `pipelineTools.ts` | ~80 | — | Agent 工具注册 |
| `Skill 定义` | ~60 | +40 | 扩展 Skill 支持反馈循环 |
| 单元测试 | ~200 | +100 | reactive 循环测试 |
| **合计** | **~740** | **+370** | Phase 2 可独立交付 |

**关键收益**：Phase 2 预留 `StageType = 'reactive'` 接口但不实现执行逻辑，Phase 3+ 无需重构 Pipeline 核心。

---

## 编排能力总结

### 编排架构全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                    neko-agent 编排能力架构                            │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ L3 用户入口                                                    │  │
│  │                                                               │  │
│  │  Skill 匹配 ──→ 选择 Pipeline ──→ Agent 确认门交互            │  │
│  │  "帮我把这个剧本做成视频" → Flow F Pipeline                    │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │ L2 Pipeline 编排层（新增）                                      │  │
│  │                                                               │  │
│  │  Stage 链：[linear] → [confirm] → [parallel] → [linear]      │  │
│  │  进度聚合：Stage 3/4 完成，总进度 75%                          │  │
│  │  数据流转：Stage 输出 → 下一 Stage 输入                        │  │
│  │  确认门：  用户审查 → confirm/cancel                           │  │
│  │  循环反馈：ReactiveStage execute→evaluate→retry (Phase 3+)    │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │ L1 任务执行层（已有）                                           │  │
│  │                                                               │  │
│  │  TaskManager        并发池（global max 10 + per-type max 5）  │  │
│  │  AgentExecutor      ReAct 推理循环（think-act-observe）        │  │
│  │  SubAgentManager    子 Agent 并发（max 5 concurrent）          │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │ L0 原子服务层（已有）                                           │  │
│  │                                                               │  │
│  │  MediaGenerationService   图片/视频/音频/TTS 生成              │  │
│  │  NekoCutAPI               时间线元素 CRUD + 29 种操作          │  │
│  │  neko-story Parser        Fountain 剧本解析                    │  │
│  │  neko-engine              GPU 渲染 + 编解码 + 导出             │  │
│  │  Read/Write/WebSearch     文件 I/O + 网络                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 三个关键架构决策

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| **1** | Pipeline vs Workflow | **Pipeline** | 6 种流程路径固定、开发者定义；Workflow 是远期需求（Phase 6+），当前无用户自定义编排场景 |
| **2** | 通用编排 vs 专用编排 | **通用 Pipeline** | 原子操作相同，仅组合顺序不同；一套 Pipeline + 5 个可复用 Stage 覆盖 6 种流程 |
| **3** | 循环驱动方式 | **双层 ReAct** | 内层规则驱动（确定性阈值检查），外层 LLM 驱动（灵活 escalate 决策） |

### Stage 类型体系

```
StageType
├── linear      执行一次，通过即进入下一阶段
│   适用：解析、转换、排列
│   示例：parseStoryboard, arrangeOnTimeline
│
├── parallel    多任务并发执行，全部完成后合并
│   适用：批量生成
│   示例：batchGenerateMedia (GenerateVideo ×N)
│
└── reactive    执行→评估→决策循环（Phase 3+）
    适用：质量检查、参数自适应、迭代优化
    示例：exportQualityCheck, clipScoreScreening
    决策：pass（通过）| retry（自动重试）| escalate（交给 LLM）
```

### 双层 ReAct 嵌套

```
┌─────────────────────────────────────────────────┐
│ Agent ReAct（外层 — LLM 驱动）                    │
│                                                 │
│  Think: "用户要把剧本做成视频，应该用 Flow F"     │
│  Act:   调用 StartPipeline(flowF, params)        │
│  │                                               │
│  │  ┌─────────────────────────────────────────┐  │
│  │  │ Pipeline 执行（内层 — 规则驱动）          │  │
│  │  │                                         │  │
│  │  │  Stage 1 [linear]  parseStoryboard      │  │
│  │  │  Stage 2 [confirm] 用户审查提示词  ←──── Gate │
│  │  │  Stage 3 [parallel] batchGenerate ×N    │  │
│  │  │  Stage 4 [reactive] qualityScreen       │  │
│  │  │    ├─ execute: 检查 CLIP score           │  │
│  │  │    ├─ pass → Stage 5                    │  │
│  │  │    ├─ retry → 自动重生成（max 3次）      │  │
│  │  │    └─ escalate ──────────────────────→   │  │
│  │  │  Stage 5 [linear]  arrangeOnTimeline    │  │
│  │  └─────────────────────────────────────────┘  │
│  │                                               │
│  Observe: "Pipeline 完成，10 个场景已排列到时间线" │
│  Think: "建议用户添加配乐和转场"                  │
└─────────────────────────────────────────────────┘
```

### 6 种流程的 Stage 组合

```
可复用 Stage 池（5 个）：
  [R] readDocument      — 读取 PDF/DOCX/MD
  [P] parseStoryboard   — 解析剧本/自由文本/漫画
  [G] generatePrompts   — LLM 优化视频提示词（含确认门）
  [B] batchGenerate     — 并发批量生成
  [A] arrangeOnTimeline — 排列到时间线

Flow 组合：
  Flow A  ①→②→③→④  =  [R] → [P] → [G] → [B] → [A]   完整流程
  Flow F  ②→③→④    =        [P] → [G] → [B] → [A]   标准流程
  Flow C  ①→③→④    =  [R] →       [G] → [B] → [A]   跳过剧本
  Flow E  ①→③→④    =  [P*] →      [G] → [B] → [A]   漫画变体（P*=视觉分析）
  Flow D  ②→④      =        [P] →             [A]   跳过分镜
  Flow B  ①→④      =              [G] → [B] → [A]   直达生成

新增流程只需从 Stage 池中选取组合，无需写新代码。
```

### 分阶段实现路线

```
                     Phase 2                    Phase 3+               Phase 6+
                   （当前实现）                  （迭代增强）            （远期规划）
                 ┌─────────────┐           ┌─────────────┐        ┌─────────────┐
Stage 类型       │ linear      │           │ reactive    │        │             │
                 │ parallel    │           │             │        │             │
                 │ (reactive   │           │             │        │             │
                 │  接口预留)  │           │             │        │             │
                 ├─────────────┤           ├─────────────┤        ├─────────────┤
编排能力          │ Pipeline    │           │ Pipeline    │        │ Workflow    │
                 │ 线性+并发   │           │ +循环反馈   │        │ 用户 DAG    │
                 ├─────────────┤           ├─────────────┤        ├─────────────┤
覆盖流程          │ Flow        │           │ 导出质检    │        │ 自定义      │
                 │ A/B/C/D/E/F │           │ 生成筛选    │        │ AI 流水线   │
                 │             │           │ 场景分割    │        │ 批量处理    │
                 ├─────────────┤           ├─────────────┤        ├─────────────┤
工作量            │ ~740 LOC    │           │ +370 LOC    │        │ ~3000+ LOC  │
                 └─────────────┘           └─────────────┘        └─────────────┘

升级路径：
  Pipeline Stage → ReactiveStage（添加 evaluate/decide）→ Workflow Node（包装 Stage）
  每次升级不重构前一层，只扩展。
```

### 扩展性与用户注入分析

#### 扩展场景梳理

| 场景 | 谁扩展 | 示例 |
|------|--------|------|
| **新增 Stage** | 开发者 | 添加"AI 字幕生成"Stage |
| **新增 Flow** | 开发者 | 组合现有 Stage 为新流程 |
| **跳过某 Stage** | 用户 | "不要配乐，我有自己的" |
| **替换 Stage 实现** | 用户 | "用我自己的提示词模板" |
| **插入自定义步骤** | 用户 | "生成后加水印再排列" |
| **外部工具接入** | 用户 | "调用我的 ComfyUI 服务生成" |
| **完全自定义流程** | 用户 | "按我的顺序组合步骤" |

#### 当前设计的扩展能力评估

```
开发者扩展
├─ 新增 Stage        ✅ 实现 PipelineStage 接口即可
├─ 新增 Flow         ✅ 从 Stage 池组合数组
├─ 新增 Stage 类型   ✅ StageType 联合类型扩展
└─ 评估：充分，符合 OCP

用户扩展
├─ 跳过 Stage        ❌ 无机制（Pipeline 定义写死）
├─ 替换 Stage 实现   ❌ 无机制
├─ 插入自定义步骤    ❌ 无机制
├─ 外部工具接入      ❌ 无机制
└─ 评估：不足，Pipeline 对用户是黑盒
```

**问题**：当前 Pipeline 满足**开发者扩展**（OCP），但不满足**用户扩展**。用户只能选择预定义的 Flow A-F，不能修改流程。

#### 用户注入的三个层级

```
层级 1: 参数级（最轻量）
  "生成视频时用 anime 风格" → Pipeline 参数透传
  "跳过配乐" → Stage 启用/禁用标志

层级 2: Hook 级（中等）
  "生成后加水印" → Stage 前后注入自定义操作
  "完成后通知我" → Pipeline 生命周期 Hook

层级 3: Stage 级（最灵活）
  "用我的 MCP 服务替换生成步骤" → Stage 实现可替换
  "插入一个自定义分析步骤" → Stage 列表可修改
```

#### 推荐方案：三层扩展机制

##### 层级 1: Pipeline 参数 + Stage 开关

```typescript
interface PipelineOptions {
  // Stage 开关 — 用户可跳过特定 Stage
  skipStages?: string[];           // ['generateMusic', 'addSubtitles']

  // Stage 参数覆盖 — 用户可调整 Stage 行为
  stageParams?: Record<string, Record<string, unknown>>;
  // 示例: { batchGenerate: { style: 'anime', maxConcurrency: 3 } }

  // 全局参数
  globalStyle?: string;            // 全局风格（透传到所有生成 Stage）
  confirmEveryStage?: boolean;     // 每个 Stage 都暂停确认（调试模式）
}

// Pipeline 执行时检查
for (const stage of stages) {
  if (options.skipStages?.includes(stage.name)) {
    yield { type: 'stage_skipped', stage: stage.name };
    continue;
  }
  const params = options.stageParams?.[stage.name] ?? {};
  ctx = { ...ctx, ...params };
  // ... execute stage
}
```

**用户体验**：
```
用户: "把这个剧本做成视频，不要配乐，风格用 anime"
Agent: 启动 Flow F Pipeline，skipStages: ['generateMusic']，globalStyle: 'anime'
```

##### 层级 2: Stage Hook（前后注入）

```typescript
interface StageHook {
  stageName: string;               // 绑定到哪个 Stage
  timing: 'before' | 'after';     // 在 Stage 前/后执行
  execute(ctx: TContext): Promise<TContext>;
}

interface PipelineOptions {
  // ... 层级 1 参数
  hooks?: StageHook[];             // 用户自定义 Hook
}

// 内置 Hook 模板
const BUILTIN_HOOKS = {
  addWatermark: {
    stageName: 'arrangeOnTimeline',
    timing: 'before',
    async execute(ctx) {
      // 给每个生成的视频加水印
      for (const output of ctx.outputs) {
        await addWatermark(output.path, ctx.watermarkConfig);
      }
      return ctx;
    }
  },
  notifyOnComplete: {
    stageName: '*',                 // 绑定到最后一个 Stage
    timing: 'after',
    async execute(ctx) {
      await sendNotification('Pipeline 完成', ctx.summary);
      return ctx;
    }
  }
};
```

**用户体验**：
```
用户: "生成完视频后加上我的 logo 水印"
Agent: 启动 Flow F，hooks: [addWatermark({ logo: '/path/to/logo.png' })]
```

##### 层级 3: 自定义 Stage（MCP / 配置）

```typescript
// 方式 A: MCP 工具包装为 Stage
interface MCPStageConfig {
  type: 'mcp';
  name: string;
  serverId: string;                // MCP 服务器 ID
  toolName: string;                // MCP 工具名
  inputMapping: Record<string, string>;   // ctx 字段 → 工具参数映射
  outputMapping: Record<string, string>;  // 工具结果 → ctx 字段映射
}

// 方式 B: Bash 命令包装为 Stage
interface ShellStageConfig {
  type: 'shell';
  name: string;
  command: string;                 // 模板字符串，支持 ${ctx.xxx}
  outputParser?: 'json' | 'lines' | 'none';
}

// 方式 C: Agent 子任务包装为 Stage
interface AgentStageConfig {
  type: 'agent';
  name: string;
  prompt: string;                  // 子 Agent 的任务描述（模板）
  allowedTools?: string[];         // 子 Agent 可用工具
  maxIterations?: number;
}

// 用户可在配置中定义自定义 Stage
type CustomStageConfig = MCPStageConfig | ShellStageConfig | AgentStageConfig;

// 注册到 Stage 池
interface PipelineRegistry {
  registerStage(config: CustomStageConfig): void;    // 用户注册
  getStage(name: string): PipelineStage;             // 获取（内置或自定义）
  listStages(): StageInfo[];                          // 列出所有可用 Stage
}
```

**用户体验**：
```
用户: "我有一个 ComfyUI MCP 服务，用它来生成图片替换默认的 GenerateImage"

配置 (~/.neko/pipeline-stages.json):
{
  "stages": [{
    "type": "mcp",
    "name": "comfyGenerate",
    "serverId": "comfyui",
    "toolName": "generate_image",
    "inputMapping": { "prompt": "ctx.suggestedPrompt" },
    "outputMapping": { "image_path": "ctx.generatedPath" }
  }]
}

Agent: 启动 Flow F，用 comfyGenerate 替换 batchGenerate 中的 GenerateImage
```

#### 用户注入 Flow 的完整能力

```
用户自定义 Flow（层级 3 完成后）：

配置 (~/.neko/pipelines.json):
{
  "flows": {
    "myProductVideo": {
      "description": "我的产品宣传片流程",
      "stages": [
        "readDocument",                    // 内置 Stage
        "parseStoryboard",                 // 内置 Stage
        { "ref": "comfyGenerate" },        // 自定义 MCP Stage
        "addWatermark",                    // 自定义 Hook 升级为 Stage
        "arrangeOnTimeline"                // 内置 Stage
      ],
      "defaultParams": {
        "globalStyle": "corporate",
        "batchGenerate": { "resolution": "1080p" }
      }
    }
  }
}

用户: "用我的产品视频流程处理这个文档"
Agent: Skill 匹配 → 发现用户自定义 Flow "myProductVideo" → 执行
```

#### 扩展能力覆盖矩阵

| 场景 | 层级 1 参数 | 层级 2 Hook | 层级 3 Stage | 实现阶段 |
|------|:---:|:---:|:---:|------|
| 跳过某 Stage | ✅ | — | — | Phase 2 |
| 调整生成参数 | ✅ | — | — | Phase 2 |
| 全局风格设置 | ✅ | — | — | Phase 2 |
| 生成后加水印 | — | ✅ | — | Phase 2 |
| 完成后通知 | — | ✅ | — | Phase 2 |
| 自定义质量检查 | — | ✅ | — | Phase 3 |
| MCP 工具替换生成 | — | — | ✅ | Phase 3+ |
| Bash 命令注入 | — | — | ✅ | Phase 3+ |
| Agent 子任务 Stage | — | — | ✅ | Phase 3+ |
| 完全自定义 Flow | — | — | ✅ | Phase 3+ |

#### 分阶段实现

```
Phase 2（当前）：层级 1 + 层级 2 基础
├─ PipelineOptions: skipStages + stageParams + globalStyle
├─ StageHook: before/after timing
├─ 工作量: +80 LOC（在 Pipeline 核心 ~740 中已包含）

Phase 3：层级 2 完善 + 层级 3 基础
├─ 内置 Hook 模板库（watermark, notify, validate）
├─ MCPStageConfig: MCP 工具 → Stage 包装
├─ ShellStageConfig: Bash 命令 → Stage 包装
├─ 工作量: +200 LOC

Phase 3+：层级 3 完善
├─ AgentStageConfig: 子 Agent → Stage 包装
├─ PipelineRegistry: 用户注册自定义 Stage + Flow
├─ 配置文件: ~/.neko/pipeline-stages.json + pipelines.json
├─ 工作量: +300 LOC
```

#### 架构决策：Skill 即 Pipeline 配置

**核心洞察**：Skill 已经是用户定义的"做什么 + 怎么做"入口。Pipeline 配置天然属于 Skill，不需要独立配置系统。

##### 当前 Skill 系统回顾

```
Skill 已有能力：
├─ 触发匹配（trigger 关键词）
├─ 系统提示词注入（引导 Agent 行为）
├─ 工具集激活（tool-sets）
├─ 用户可创建自定义 Skill（.md 文件）
└─ SkillInjectionCoordinator 管理生命周期
```

##### Skill Frontmatter 扩展 Pipeline 字段

```markdown
---
name: my-product-video
display-name: 产品宣传片
description: 从产品文档生成宣传视频
trigger: 产品视频|宣传片|product video
tool-sets: [element-editing, effects-transitions]

# ──── Pipeline 扩展字段 ────
pipeline: flowA                          # 使用哪个 Flow
pipeline-skip: [generateMusic]           # 跳过的 Stage
pipeline-params:                         # Stage 参数覆盖
  batchGenerate:
    style: corporate
    resolution: 1080p
  arrangeOnTimeline:
    transitions: { type: crossfade, duration: 0.5 }
pipeline-hooks:                          # 注入 Hook
  - stage: arrange
    timing: before
    action: addWatermark
    params: { logo: ./assets/logo.png }
pipeline-stages:                         # 自定义 Stage（层级 3）
  - name: comfyGenerate
    type: mcp
    server: comfyui
    tool: generate_image
    replace: batchGenerate               # 替换哪个内置 Stage
---

## 工作流程说明

你是产品宣传片制作助手。当用户提供产品文档时...
（系统提示词，引导 Agent 在确认门处的行为）
```

##### 为什么 Skill 是最佳载体

| 维度 | Skill 配置 | 独立配置文件 |
|------|:---:|:---:|
| 发现机制 | ✅ SkillService 已有语义匹配 | ❌ 需新建发现逻辑 |
| 用户创建 | ✅ 写 .md 文件即可 | ⚠️ 需写 JSON + 理解 Schema |
| 提示词 + 配置一体 | ✅ 同一文件 | ❌ 配置和提示词分离 |
| 工具激活 | ✅ tool-sets 已有 | ❌ 需要额外关联 |
| 社区分享 | ✅ 复制 .md 文件 | ⚠️ 需复制多个文件 |
| 版本管理 | ✅ Git 友好 | ✅ Git 友好 |
| 已有基础设施 | ✅ 解析/注入/激活全链路 | ❌ 从零实现 |

**结论**：**不需要 `~/.neko/pipelines.json`**，Skill .md 文件就是 Pipeline 的配置文件。

##### 内置 Skill ↔ Flow 映射

```markdown
# 内置 Skill（开发者提供）

storyboard-to-timeline.md          → pipeline: flowF   (②→③→④)
document-to-video.md               → pipeline: flowA   (①→②→③→④)
quick-video.md                     → pipeline: flowB   (①→④)
visual-to-video.md                 → pipeline: flowC   (①→③→④)
script-to-video.md                 → pipeline: flowD   (②→④)
comic-to-video.md                  → pipeline: flowE   (①→③→④)

# 用户自定义 Skill（用户创建）

my-product-video.md                → pipeline: flowA + skip + hooks
anime-music-video.md               → pipeline: flowF + style: anime
daily-vlog.md                      → pipeline: flowB + params
```

##### Skill → Pipeline 解析流程

```
用户输入: "帮我把这个产品文档做成宣传片"
    │
    ↓
SkillService.match()
    ├─ 匹配到 "my-product-video" Skill（用户自定义）
    ├─ trigger: "产品视频|宣传片"
    │
    ↓
SkillInjectionCoordinator.inject()
    ├─ 注入系统提示词（Skill body）
    ├─ 激活 tool-sets: [element-editing, effects-transitions]
    │
    ↓
PipelineResolver.resolve(skill)    ← 新增：从 Skill frontmatter 解析 Pipeline 配置
    ├─ pipeline: flowA
    ├─ skipStages: [generateMusic]
    ├─ stageParams: { batchGenerate: { style: corporate } }
    ├─ hooks: [{ stage: arrange, timing: before, action: addWatermark }]
    ├─ customStages: [{ name: comfyGenerate, replace: batchGenerate }]
    │
    ↓
Pipeline.execute(resolvedConfig)
    ├─ [readDocument] → [parseStoryboard] → [confirm] → ...
    └─ 按 Skill 配置执行
```

##### 三层扩展 → Skill 映射

```
层级 1 参数级  →  pipeline-skip + pipeline-params（Skill frontmatter）
层级 2 Hook级  →  pipeline-hooks（Skill frontmatter）
层级 3 Stage级 →  pipeline-stages（Skill frontmatter）

用户只需学会一种配置方式：写 Skill .md 文件。
```

##### 示例：用户创建自定义 Skill

```markdown
文件: ~/.neko/skills/anime-mv.md

---
name: anime-mv
display-name: 动漫 MV 制作
description: 用 anime 风格从歌词生成音乐视频
trigger: 动漫MV|anime MV|歌词转视频

pipeline: flowF
pipeline-params:
  parseStoryboard:
    format: freeform
  batchGenerate:
    style: anime
    resolution: 1080p
    aspectRatio: "16:9"
  arrangeOnTimeline:
    transitions: { type: fade, duration: 1.0 }
    includeSubtitles: true
tool-sets: [element-editing, effects-transitions, audio-editing]
---

## 你是动漫 MV 制作助手

当用户提供歌词时：
1. 将每段歌词理解为一个视觉场景
2. 为每个场景生成 anime 风格的视频提示词
3. 强调视觉连贯性：保持角色设计、色彩方案一致
4. 节奏匹配：场景切换与歌曲节奏对齐
5. 完成后建议用户添加音乐轨道
```

##### 对现有 Skill 系统的改动

| 组件 | 改动 | 工作量 |
|------|------|--------|
| Skill frontmatter 解析 | 新增 `pipeline-*` 字段解析 | ~50 LOC |
| `PipelineResolver` | 从 Skill metadata 构建 PipelineConfig | ~80 LOC |
| Skill 校验 | 验证 pipeline/stage 名称合法性 | ~30 LOC |
| 文档 | Skill 配置 Pipeline 使用指南 | — |
| **合计** | | **~160 LOC** |

**对比独立配置系统**（~300 LOC 配置解析 + ~200 LOC 发现逻辑 = ~500 LOC）：**节省 ~340 LOC 且复用已有基础设施**。

#### 设计原则

| SOLID | 如何体现 |
|-------|----------|
| **S** 单一职责 | Skill 负责"做什么"（匹配+配置），Pipeline 负责"怎么做"（执行） |
| **O** 开闭原则 | 新 Flow/Stage/Hook 通过新 Skill 文件扩展，不修改核心 |
| **L** 里氏替换 | 自定义 Stage 实现 PipelineStage 接口，可替换内置 Stage |
| **I** 接口隔离 | Stage 只需 execute()；Hook 只需 timing + execute()；Skill 只需 frontmatter |
| **D** 依赖倒置 | Pipeline 依赖 Stage 接口；Skill 依赖 Pipeline 接口；具体实现可替换 |

---

### 与现有系统的关系（不替换，新增 L2）

| 已有层 | 职责 | Pipeline 如何使用 |
|--------|------|-------------------|
| **TaskManager** | 异步任务并发池 | parallel Stage 内部调用 |
| **AgentExecutor** | LLM ReAct 推理 | Pipeline 的触发者和 escalate 接收者 |
| **SubAgentManager** | 子 Agent 并发 | 不直接使用（Pipeline 取代其编排角色） |
| **SkillService** | Skill 匹配注入 | 发现 Skill → 解析 Pipeline 配置 → 激活 |
| **SkillInjectionCoordinator** | Skill 生命周期 | 注入提示词 + Pipeline 配置一体 |
| **MediaGenerationService** | 媒体生成 | Stage 内调用的原子服务 |
| **NekoCutAPI** | 时间线操作 | arrangeOnTimeline Stage 调用 |

---

## 能力依赖图

```
L0 基础生成层
─────────────────────────────────────────────────────────
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ LLM 对话 │    │ 多模态   │    │ 文件读取 │
   │ ✅ 完成  │    │ 视觉 ✅  │    │ ⚠️ 部分  │
   └────┬─────┘    └────┬─────┘    └────┬─────┘
        │               │               │
   ┌────┴─────┐    ┌────┴─────┐    ┌────┴─────┐
   │生成图片✅│    │生成视频✅│    │生成音频✅│
   │角色/风格 │    │增强/插帧 │    │TTS/音乐 │
   └──────────┘    └──────────┘    └──────────┘

L1 内容理解层
─────────────────────────────────────────────────────────
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ 文档分析     │  │ 图片/漫画    │  │ 剧本解析     │
   │ .md/.txt ✅  │  │ 分析 ✅      │  │ Fountain ✅  │
   │ PDF/DOCX ❌  │  │ 分格/OCR ⚠️  │  │ 转时间线 ✅  │
   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
          │                 │                  │
L2 创作编排层                                  │
─────────────────────────────────────────────────────────
          ↓                 ↓                  ↓
   ┌─────────────────────────────────────────────────┐
   │              分镜编排 (❌ 待实现)                 │
   │  ParseStoryboard → BatchGenerate → Arrange      │
   └──────────────────────┬──────────────────────────┘
                          │
L3 后期制作层              ↓
─────────────────────────────────────────────────────────
   ┌─────────────────────────────────────────────────┐
   │            neko-cut 时间线 ✅                     │
   │  剪辑 + 转场 + 特效 + 调色 + 导出                │
   │  29 种 EditOperation + GPU 渲染                  │
   └─────────────────────────────────────────────────┘
```

### 流程能力覆盖

```
Flow F (②→③→④) 标准流程 — 打通此路径即解锁所有流程
     │
     ├─ + ReadDocument ──→ Flow A (①→②→③→④)
     ├─ + 漫画 Skill ───→ Flow E (①→③→④)
     └─ 已有能力足够 ──→ Flow B (①→④) ✅
                         Flow D (②→④)  ✅
```

---

## 实现状态与路线图

### 已完成（P1-P3）

| 优先级 | 能力 | 状态 | LOC |
|--------|------|------|-----|
| **P1** | Pipeline 核心（Executor + Registry + Resolver + 5 Stage） | ✅ | ~900 |
| **P1** | ReadDocument（PDF/DOCX，pdf-parse + mammoth） | ✅ | ~140 |
| **P1** | Stage 依赖适配器（7 个 Adapter + Bootstrap 接线） | ✅ | ~350 |
| **P1** | Agent 工具（StartPipeline + ConfirmGate + RetryPipelineScenes） | ✅ | ~210 |
| **P1** | Skill 类型扩展（pipeline-* frontmatter + parsePipelineSkip/Params） | ✅ | ~80 |
| **P1** | storyboardToTimelineSkill + pipeline-control ToolSet | ✅ | ~80 |
| **P1** | neko-story parseScript API 暴露 | ✅ | ~15 |
| **P2** | Pipeline 进度→WebView 桥接 | ✅ | ~150 |
| **P2** | 漫画分析 Skill（comic-to-storyboard） | ✅ | ~170 |
| **P2** | 专用剧本生成 Skill（script-generation） | ✅ | ~235 |
| **P3** | 单元测试（executor + registry + resolver + stages + parse） | ✅ | 69 tests |
| **P3** | Builtin Skills 单元测试 | ✅ | 33 tests |
| **P3** | @neko/agent pipeline 子路径导出 | ✅ | ~5 |
| **P3** | 错误恢复（RetryPipelineScenes + completedPipelines 缓存） | ✅ | ~60 |

**合计**: ~2395 LOC + 102 tests | 构建 23/23 ✅

### 当前流程可行性

| 流程 | 路径 | 状态 |
|------|------|------|
| **Flow A** | 素材→剧本→分镜→视频 | ✅ 完全打通 |
| **Flow B** | 素材→视频 | ✅ 完全可用 |
| **Flow C** | 素材→分镜→视频 | ✅ 完全打通 |
| **Flow D** | 剧本→视频 | ✅ 完全打通 |
| **Flow E** | 漫画→分镜→视频 | ✅ 完全打通 |
| **Flow F** | 剧本→分镜→视频 | ✅ 完全打通 |

**6 种创作流程全部打通 ✅**

### 待开发（后续迭代）

| 优先级 | 能力 | 估算 | 说明 |
|--------|------|------|------|
| P2 | ReactiveStage 执行器 | ~200 LOC | 导出质检 / CLIP 筛选 |
| P3 | Pipeline VSCode 命令 | ~100 LOC | 右键菜单 startFromFile + Command Palette |
| P3 | Pipeline Slash 命令 | ~50 LOC | `/pipeline flowF script.fountain` |
| P3 | 角色一致性追踪 | 研究中 | 跨场景外貌锁定 |
| P3 | Canvas 分镜可视化 | ~400 LOC | StoryboardNode 交互编排 |
| Phase 3+ | 高级循环 Stage | ~300 LOC | 场景分割 / 视频理解 / 风格修正 |
| Phase 6+ | Workflow 引擎 | ~3000 LOC | 用户 DAG 编排（Stage 包装为 Node） |

---

*最后更新: 2026-03-24（Phase 2 完成，6 种创作流程全部打通）*
