# Canvas × Agent 集成设计

**状态**: 实现中（Ph1–Ph3 完成，Ph4–Ph6 完成）
**日期**: 2026-03-29（最后更新）
**关联**: neko-canvas BottomSheet、neko-agent Canvas 工具

---

## 背景与设计意图

用户愿景：**AI 负责细节，人负责编排**。创作者不应花精力填写技术字段（景别、运镜、角度），
而应专注于叙事意图（"这场戏节奏太慢"、"Alice 此刻应该更绝望"）。

---

## 两种交互方式的本质差异

### Panel 方式 — 字段级交互

```
选中镜头 → 看到字段 → 一个个点[↺]重新生成 → 调整参数 → 生成图片
```

瓶颈：创作者还在**思考字段**，不是在**思考故事**。

### Agent 方式 — 意图级交互

```
"第二场，Alice 在废弃工厂发现 Bob，紧张对峙，3个镜头"
→ Agent 理解叙事意图 → 填所有字段 → 批量生图 → 人来确认
```

创作者**只表达意图**，AI 负责把意图翻译成技术参数。

---

## 按任务类型对比

| 创作任务 | Panel | Agent | 推荐 |
|---------|-------|-------|------|
| 生成单张图片 | ✅ 1次点击 | 需对话 | Panel |
| 调整景别/运镜 | ✅ 下拉选择 | 也可以 | Panel |
| 批量生成场景全部镜头 | ❌ 一个个点 | ✅ 一句话 | Agent |
| "这场戏节奏太慢，重构" | ❌ 不支持 | ✅ 核心能力 | Agent |
| 从剧本自动拆镜头 | ❌ | ✅ | Agent |
| 维护角色跨场景一致性 | ❌ 手动引用 | ✅ 理解关系 | Agent |
| 快速微调已有内容 | ✅ 就地编辑 | 略繁琐 | Panel |

---

## 职责划分（不是竞争关系）

```
Agent Panel              BottomSheet
─────────────────────    ──────────────────────
宏观编排（场景级）         微观调整（节点级）
意图表达                  参数确认
创作起点                  审查终点
多轮对话上下文             即时操作
```

### 理想工作流

```
① Agent: "第三幕，Alice 在雨中等待，4个镜头，从远到近"
         ↓ Agent 创建4个 ShotNode，填好描述/景别/情绪
         ↓ 批量生图
② 画布: 用户看到4张图排好
③ BottomSheet: 选中第2张 → 调整台词 → 点[重新生图]
④ Agent: "第3个镜头加上 Bob 的剪影出现在远处"
         ↓ Agent 更新 visualDescription → 重新生图
```

---

## 架构决策

### BottomSheet — 精简为"快速操作卡"

**去掉 inline 生成参数表单**，改为：

```
┌─────────────────────────────────────────┐
│ #003  [MS▼] [PAN▼] [EYE▼]  3s  [生成▶] │
├─────────────────────────────────────────┤
│ "Alice 靠着墙，雨水打湿了她的发..."      │  ← AI 生成，可直接编辑
│ [台词]  "我一直都知道..."               │  ← 折叠
└─────────────────────────────────────────┘
```

`[生成▶]` 直接使用节点现有元数据构建 prompt，无需用户填写生成参数。
复杂 AI 能力（提示词优化、风格控制）转移到 Agent Panel。

### neko-agent Canvas 工具集

Agent 通过 `CanvasNodeAPI`（neko-canvas extension exports）操作画布：

```typescript
// neko-canvas 对外 exports
interface CanvasNodeAPI {
  listNodes(type?: CanvasNodeType): CanvasNode[];
  getNode(nodeId: string): CanvasNode | undefined;
  updateNode(nodeId: string, data: Partial<ShotNodeData | SceneGroupNodeData | GalleryNodeData>): void;
  createNode(type: CanvasNodeType, position: {x: number, y: number}, data: object): string;
  generateImage(nodeId: string, cellId?: string): void;
}

// neko-agent MCP 工具（调用 CanvasNodeAPI）
canvas_list_nodes(type?: string)         → CanvasNode[]
canvas_get_node(nodeId: string)          → CanvasNode
canvas_update_node(nodeId, data)         → void
canvas_create_node(type, position, data) → nodeId
canvas_generate_image(nodeId, cellId?)   → void
```

**访问方式**（遵循 neko-suite 跨扩展模式）：
```typescript
// neko-agent extension.ts
const canvasApi = vscode.extensions.getExtension<CanvasNodeAPI>('neko.neko-canvas')?.exports;
```

### Agent 常驻感知选中节点（Ambient Context）

当用户在画布上选中节点，agent 的系统 prompt 注入摘要：

```
[Canvas Context] Selected: Shot #3 "Alice 靠着墙" (Scene 2, status: idle)
```

用户直接说 "帮我优化这个镜头的描述" — agent 知道上下文，无需额外解释。

实现：neko-canvas 向 neko-agent 推送选中节点变化事件，agent 更新 ambient context layer。

---

## 实施顺序

```
Step 1: 精简 BottomSheet
  └─ 去掉 inline generation section（prompt textarea + 参数）
  └─ [生成▶] 直接 postMessage，不需用户填参数
  └─ 保留字段就地编辑（visualDescription、台词等）

Step 2: neko-canvas 导出 CanvasNodeAPI
  └─ canvasEditorProvider 实现 ICanvasNodeAPI
  └─ extension.ts exports

Step 3: neko-agent 增加 Canvas MCP 工具
  └─ createNekoCanvasTools(canvasApi)
  └─ 注册到 agent tool registry

Step 4: Ambient Context 注入
  └─ canvas 选中变化 → postMessage to agent
  └─ agent 更新 environment layer
```

---

## 媒体类型切换与生成参数

### 不同媒体类型的参数需求

```
图片生成   → 比例 (16:9 / 9:16 / 1:1)    时长 ✗
视频生成   → 比例 + 时长（关键，模型上限 4s/8s）
音频生成   → 时长 + 类型（音乐/音效/环境音/人声）  比例 ✗
```

### 参数随媒体类型自动收缩

切换类型时，BottomSheet 只显示该类型需要的字段：

```
图片模式:  [生成▶]   [16:9 ▼]
视频模式:  [生成▶]   [16:9 ▼]  [4s ▼]
音频模式:  [生成▶]   [音效 ▼]   [3s ▼]
```

切换入口为 BottomSheet 头部的小下拉（默认图片）：

```
ShotSheet: [图片▼] [生成▶]
           切换为视频: [视频▼] [4s ▼] [生成▶]
           切换为音频: [音频▼] [音效▼] [3s ▼] [生成▶]
```

### 默认值来源（无需用户重复填写）

| 参数 | 默认值来源 |
|------|-----------|
| 比例 | 项目设置（全局默认） |
| 时长（视频） | ShotNode.duration 字段 |
| 时长（音频） | ShotNode.duration 字段 |
| 音频类型 | ShotNode.soundCue 字段推断 |

**切换到视频模式时，时长自动取该镜头的 duration，不需再填。**

Agent 同样可以驱动媒体类型切换：

```
"为第3个镜头生成参考视频"
→ canvas_generate_image(nodeId, { mediaType: 'video', duration: shot.duration })
```

### 项目级 vs 节点级参数

```
项目设置（一次配置，全局默认）
  └─ 默认比例：16:9
  └─ 默认分辨率：1920×1080
  └─ 默认时长：3s/shot

场景级覆盖（偶尔）
  └─ "这场用手机竖拍" → Agent 设置 ratio=9:16

镜头级覆盖（极少，BottomSheet 就地修改）
  └─ 单个时长微调
```

Agent 理解叙事约束，自动翻译为技术参数，不直接让用户填写分辨率数字：

```
"短视频风格"  → Agent 推断: duration=2s, ratio=9:16
"电影感"     → Agent 推断: ratio=2.39:1, duration=5~8s, cameraMovement=dolly
```

---

## 统一生成配置架构

### 多扩展共用生成能力

生成能力不只画布在用，需要项目级统一配置：

```
neko-canvas   → 镜头图片、角色画廊、参考视频
neko-sketch   → 图层生成、笔触扩展
neko-cut      → B-roll 素材、转场
neko-story    → 场景可视化
neko-agent    → 任意生成任务
```

各扩展独立配置 → 参数不统一、无法全局切换。

### 项目级生成配置（@neko/shared）

直接使用具体参数，不抽象质量档位：

```typescript
// @neko/shared/types/generation.ts

interface ProjectGenerationConfig {
  image: {
    ratio: '16:9' | '9:16' | '1:1' | '4:3' | '2.39:1';
    resolution: '512' | '720p' | '1080p' | '2K';
  };
  video: {
    ratio: '16:9' | '9:16' | '1:1';
    resolution: '480p' | '720p' | '1080p';
    duration: number;  // seconds, default per generation
    fps: 24 | 30;
  };
  audio: {
    duration: number;
  };
}
```

**参数优先级**（运行时合并）：
```
节点 oneshot 覆盖（一次性，不持久化，最高）
  ↑
节点 generationConfig（持久化）
  ↑
工具上下文配置（sketch 图层 / cut 时间线片段）
  ↑
项目 ProjectGenerationConfig（全局默认）
  ↑
系统兜底
```

### 参数必须持久化，不能浮在对话上下文

对话压缩、任务并发均可导致参数丢失：

```typescript
// ❌ 参数浮在工具调用里（对话压缩后丢失）
canvas_generate_image(nodeId, { ratio: '16:9', resolution: '512' })

// ✅ 先写入持久化配置，再触发生成
set_project_generation_config({ image: { resolution: '512' } })
canvas_update_node(nodeId, { generationConfig: { ratio: '16:9' } })
canvas_generate_image(nodeId)  // 从持久化配置读取，与对话上下文无关
```

### Agent 工具集（完整）

配置工具和生成工具分离；节点绑定生成不接受参数：

```typescript
// ── 项目级配置（持久化，影响所有扩展）──
set_project_generation_config(config: Partial<ProjectGenerationConfig>)

// ── 一次性生成（per-call params 合理，结果再决定保存到哪）──
generate_image(prompt: string, params?: Partial<ProjectGenerationConfig['image']>)
generate_video(prompt: string, params?: Partial<ProjectGenerationConfig['video']>)
generate_audio(prompt: string, params?: Partial<ProjectGenerationConfig['audio']>)

// ── 节点绑定生成（从节点+项目配置读参数，不接受 params）──
canvas_generate_image(nodeId, cellId?)
canvas_generate_batch(nodeIds: string[])

// ── 其他工具节点绑定生成 ──
sketch_generate_layer(layerId)
cut_generate_clip(clipId)
```

### 两类生成场景，参数策略不同

```
节点绑定生成（反复迭代）          一次性生成（临时创作）
────────────────────────         ─────────────────────────
ShotNode 重新生图                 "给我生成一张概念图"
GalleryCell 换图                  sketch 新建图层时生成
参数写入节点持久化                 per-call params 合理
canvas_generate_image(nodeId)     generate_image(prompt, params)
```

### 典型工作流（低分辨率验证 → 提升质量）

```
用户: "先跑低分辨率看看镜头逻辑"

Agent:
  1. set_project_generation_config({ image: { resolution: '512' } })
  2. canvas_generate_batch([...allShots])
  → "低分辨率草稿已生成，请确认镜头逻辑"

用户: "没问题，出 1080p"

Agent:
  1. set_project_generation_config({ image: { resolution: '1080p' } })
  2. canvas_generate_batch([...allShots])
```

### BottomSheet 媒体类型切换

参数随媒体类型自动收缩，默认值从节点和项目配置取：

```
图片模式:  [生成▶]  [16:9▼]  [1080p▼]
视频模式:  [生成▶]  [16:9▼]  [1080p▼]  [4s▼]    ← 时长默认取 ShotNode.duration
音频模式:  [生成▶]  [音效▼]  [3s▼]
```

节点级 oneshot 覆盖（不改持久化配置，仅单次生效）：
```typescript
canvas_generate_image(nodeId, { oneshot: { resolution: '2K' } })
```

---

## Agent 输入框布局

### 整体结构

```
┌────────────────────────────────────────────────────────┐
│ [Chat▼]  [Claude Sonnet▼]  │  [图片▼] [16:9▼] [1080p▼] │  ← 上栏
├────────────────────────────────────────────────────────┤
│ [🎬 镜头 #3 MS] [×]  [📄 script.nks] [×]              │  ← 附件 chips（有时才显示）
│                                                        │
│  输入文字...                                           │
│                                                        │
├────────────────────────────────────────────────────────┤
│ [+]                                  2.4k tokens  [↵]  │  ← 下栏
└────────────────────────────────────────────────────────┘
```

**上栏（左）**：模式选择 + 模型选择（始终可见，1 行固定高度）
**上栏（右）**：生成参数（有生成上下文时展开，否则收起为 ⚙）
**输入框内部**：附件 chips 内嵌于输入框顶部，与文字输入共用容器
**下栏**：`[+]` 附件/引用 + token 用量 + 发送按钮

### 附件 chips 布局原则

附件内嵌输入框内部（顶部），不单独占一个区域，避免面板垂直空间被过多分割：

```
空态（最常见）：
┌────────────────────────────────────────┐
│ [Chat▼] [Sonnet▼]  │  ⚙               │  ← 仅上栏 1 行
├────────────────────────────────────────┤
│ 输入...                                 │  ← 输入区最大化
├────────────────────────────────────────┤
│ [+]             2.4k tokens  [↵]      │
└────────────────────────────────────────┘

有附件时：
┌────────────────────────────────────────┐
│ [Chat▼] [Sonnet▼] │ [图▼][16:9▼][1080p▼]│
├────────────────────────────────────────┤
│ [🎬 #3 MS] [×]  [📄 script] [×]  ···  │  ← chips 占输入框顶部 1 行
│                                        │
│ 输入...                                 │
├────────────────────────────────────────┤
│ [+]             2.4k tokens  [↵]      │
└────────────────────────────────────────┘
```

**Chip 类型与形态**：

| 来源 | Chip 外观 | 点击行为 |
|------|----------|---------|
| 节点上下文（`发送到 Agent`） | `[🎬 镜头 #3 MS]` | 展开节点详情浮层 |
| 文件（`@文件` / 拖入）| `[📄 script.nks]` | 在编辑器中打开 |
| 粘贴图片 | `[🖼 thumbnail]` | 预览大图 |
| 文本选段 | `[✂ 第三幕 L.42]` | 跳转到源位置 |

多个 chips 横向排列，超出宽度时横向滚动（不换行，保持单行）。

### 上栏详细布局

**普通对话状态**（无生成上下文）：

```
[Chat▼]  [Claude Sonnet 4.6▼]  │  ⚙
```

**有生成上下文 / 检测到生成意图**：

```
[Chat▼]  [Claude Sonnet 4.6▼]  │  [图片▼] [16:9▼] [1080p▼]
```

**绑定节点上下文**（来源标注，chip 同步显示在输入框内）：

```
[Chat▼]  [Claude Sonnet 4.6▼]  │  [图片▼] [16:9 节点▼] [1080p 项目▼] [3s 节点▼]
```

**绑定 Cut 片段**（锁定参数）：

```
[Chat▼]  [Claude Sonnet 4.6▼]  │  [视频▼] [16:9 项目▼] [1080p 项目▼] [3s 🔒]
```

### 模式选择项

```
Chat     普通对话
Task     自主任务执行（agent loop）
```

### 生成参数展示时机

```
收起为 ⚙   普通对话，无生成相关上下文
自动展开   检测到生成意图关键词（"生成"、"画"、"制作"）
           或有节点/片段上下文绑定
手动展开   点击 ⚙
```

展开后参数随媒体类型自动收缩：
- 图片：`[图片▼] [比例▼] [分辨率▼]`
- 视频：`[视频▼] [比例▼] [分辨率▼] [时长▼]`
- 音频：`[音频▼] [类型▼] [时长▼]`

### 参数修改的持久化规则

| 参数来源标注 | 修改后写入 |
|------------|----------|
| 节点        | 该节点 `generationConfig` |
| 项目        | `ProjectGenerationConfig` |
| 无标注（一次性）| 仅本次发送，不持久化 |
| 🔒 锁定     | 不可修改，点击提示来源 |

### 与工具调用的关系

发送时，Agent 直接从参数栏读取当前值传入生成工具，不再重新解析配置：

```
参数栏: 图片 / 16:9 / 1080p
用户: "生成第三幕4个镜头"
→ canvas_generate_batch(nodeIds, { mediaType:'image', ratio:'16:9', resolution:'1080p' })
```

---

## 各场景生成入口分析

### 场景对比

| 场景 | 快速生成 | 发送到 Agent |
|------|---------|-------------|
| 已知想要什么，单节点重新生图 | ✅ | |
| 需要 AI 辅助决策 | | ✅ |
| 从剧本拆分镜头 | | ✅ |
| 批量复杂编排操作 | | ✅ |

```
快速生成    → 立即执行，使用当前项目参数，不经过 Agent
发送到Agent → 注入上下文到 Agent 输入框，用户补充指令再发送
```

### 参数归属汇总

| 参数 | Canvas 节点 | Cut 片段 | Sketch | Audio | 一次性 |
|------|------------|---------|--------|-------|--------|
| ratio | 节点配置 → 项目默认 | 项目时间线 🔒 | 画布尺寸 🔒 | N/A | per-call |
| resolution | 项目配置 | 项目时间线 🔒 | 画布尺寸 🔒 | N/A | per-call |
| duration | 节点字段 | 片段时长 🔒 | N/A | 节点/片段/per-call | per-call |
| 内容/风格 | Agent prompt | Agent prompt | Agent prompt | Agent prompt | Agent prompt |

🔒 = 硬约束，Agent 不可覆盖，工具层报错拦截。

### 快速生成参数来源

```
节点右键快速生成   → 节点 generationConfig → 项目默认
片段右键快速生成   → 片段时长（🔒）+ 项目默认
文本右键快速生成   → 项目默认（无绑定上下文）
```

若项目参数未配置（首次使用），快速生成前弹出参数确认，之后记住。

---

## 右键菜单触发生成

### AI 功能分类原则

两类，不设 Inline AI：

```
快速执行（媒体生成，输入参数已知 → 直接调用生成模型 → 结果插回）
  └─ 仅限图片/视频/音频生成类，模型来自项目配置，用户已知

发送到 Agent（所有 LLM 调用，必须经过 Agent 面板）
  └─ 用户在面板里看到并控制用哪个模型，不绕过模型选择
```

**不做 Inline AI 的原因**：续写/优化等文本操作直接在编辑器内调模型，绕过 Agent 面板的模型选择，默认模型配置可能与用户意图不一致。所有 LLM 操作统一走 Agent。

### AI 功能归属映射

| 功能 | 触发上下文 | 分类 | 实现归属 |
|------|----------|------|---------|
| 续写剧本 | story 编辑器光标 | **→ Agent** | neko-story → sendContext（注入上文） |
| 优化剧本 | story 选中段落 | **→ Agent** | neko-story → sendContext（注入选段） |
| 总结剧本 | story 文档/选段 | **→ Agent** | neko-story → sendContext |
| 生成剧本 | story / 空白 | **→ Agent** | neko-agent |
| 风格迁移 | canvas/sketch | **快速执行** | neko-canvas extension |
| 图片融合 | canvas 多选 | **快速执行** | neko-canvas extension |
| 首尾帧补间 | cut / canvas 两节点 | **快速执行** | neko-cut extension |
| 生成图片/视频/音频 | canvas / story | **快速 + → Agent** | 快速走各包；复杂走 Agent |
| 调整镜头机位 | canvas ShotNode | **→ Agent** | neko-canvas → sendContext |
| 理解图片/视频 | 任意含媒体上下文 | **→ Agent** | 各包 → sendContext |
| 理解剪辑/分镜/特效 | cut / canvas | **→ Agent** | 各包 → sendContext |

### 统一 ContextMenu 框架

**现状**：neko-canvas 和 neko-cut 已共用同一套 `@neko/shared/components` ContextMenu，支持 submenu。

**扩展方案**：在 `@neko/shared` 增加 `buildAIMenuSection()` helper，各包 menu builder 统一附加：

```typescript
// @neko/shared/components/contextMenuAI.ts

export interface AIMenuContext {
  onSendToAgent: (payload: AgentContextPayload) => void;
  onQuickGenerate?: () => void;
  onQuickStyle?: () => void;       // 风格迁移
  onQuickFirstLastFrame?: () => void;
}

export function buildAIMenuSection(ctx: AIMenuContext): MenuItem[] {
  const items: MenuItem[] = [{ separator: true }];
  if (ctx.onQuickGenerate)        items.push({ label: '生成图片', icon: '✨', onClick: ctx.onQuickGenerate });
  if (ctx.onQuickStyle)           items.push({ label: '风格迁移', icon: '🎨', onClick: ctx.onQuickStyle });
  if (ctx.onQuickFirstLastFrame)  items.push({ label: '首尾帧补间', icon: '🎞', onClick: ctx.onQuickFirstLastFrame });
  items.push({
    label: '发送到 Agent ▶', icon: '🤖',
    submenu: [
      { label: '优化描述', onClick: () => ctx.onSendToAgent({ intent: 'optimize' }) },
      { label: '调整机位', onClick: () => ctx.onSendToAgent({ intent: 'camera' }) },
      { label: '理解内容', onClick: () => ctx.onSendToAgent({ intent: 'understand' }) },
    ],
  });
  return items;
}
```

各包 menu builder 只需追加：

```typescript
export function buildShotNodeMenuItems(ctx: CanvasMenuContext & AIMenuContext): MenuEntry[] {
  return [
    ...buildNodeMenuItems(ctx),   // 现有项
    ...buildAIMenuSection(ctx),   // AI section 统一附加
  ];
}
```

实际菜单效果：
```
复制 / 剪切 / 重复
────────────────
删除
────────────────
置于顶层 / 置于底层
────────────────
✨ 生成图片          ← 快速执行
🎨 风格迁移          ← 快速执行
🤖 发送到 Agent ▶   ← submenu
   优化描述
   调整机位
   理解内容
```

### 各上下文右键菜单

**Story / 文本编辑器（选中段落）** — VSCode `editor/context`，由 neko-story 注册：
```
✨ 快速生成图片      → 快速执行（项目参数）
─────────────────
🤖 发送到 Agent ▶
   续写              → 注入上文光标位置，Agent 生成后插回
   优化              → 注入选中段落，Agent 返回优化版本
   生成分镜          → Agent 拆分 ShotNodes
   总结选段          → Agent 分析
   生成视频          → Agent + 生成参数
```

**Canvas 节点（单选）** — Webview 自定义菜单：
```
复制 / 剪切 / 重复 / 删除
────────────────
✨ 生成图片 / 重新生成  → 快速执行（节点参数）
🎨 风格迁移             → 快速执行
🤖 发送到 Agent ▶
   优化描述 / 调整机位 / 理解内容
```

**Canvas 节点（多选）** — Webview 自定义菜单：
```
批量生成               → 快速批量（项目参数）
🤖 发送到 Agent 编排   → 注入所有节点摘要，适合"重构这场戏"
```

**Timeline 片段** — Webview 自定义菜单：
```
替换素材               → 文件选择器
✨ 生成素材             → 快速生成（片段时长 🔒）
🎞 首尾帧补间           → 快速执行
🤖 发送到 Agent ▶
   理解内容 / 生成替换素材
```

**文件树** — VSCode `explorer/context`，由 neko-agent 注册：
```
🤖 发送到 Agent        → 等同于 @文件，注入输入框
✨ 生成相关素材         → 以文件为参考快速生成
```

### 快速执行默认模型

快速执行不经过 Agent 对话，模型选择优先级：

```
节点 generationConfig.model（节点级覆盖）
  ↑
项目 ProjectGenerationConfig.*.model（workspace config 强制指定）
  ↑
ConfigManager.getEnabledModels(type)（~/.neko/config.json 用户配置的生成模型）
  ↑
系统云端默认（未配置时的兜底）
```

**模型来源说明**：生成模型从 neko-agent 的 `ConfigManager` 读取，而非 neko-market。
`ModelConfig.type` 字段区分 `llm / image / video / audio / music`，`getEnabledModels()`
按 type 过滤后作为 `resolveGenerationParams()` 的 `market` 参数层。neko-market 仅负责
包安装/卸载，安装完成后触发 `neko.agent.refreshModels` 写入 `~/.neko/config.json`，
不参与运行时模型选择。

`ProjectGenerationConfig` 扩展 model 字段：

```typescript
interface ProjectGenerationConfig {
  image: {
    ratio: '16:9' | '9:16' | '1:1' | '4:3' | '2.39:1';
    resolution: '512' | '720p' | '1080p' | '2K';
    model?: string;  // 项目级强制指定，留空则走 ConfigManager 用户配置
  };
  video: {
    ratio: '16:9' | '9:16' | '1:1';
    resolution: '480p' | '720p' | '1080p';
    duration: number;
    fps: 24 | 30;
    model?: string;
  };
  audio: {
    duration: number;
    model?: string;
  };
}
```

用户无需在右键菜单里选模型；如需更换，通过 Agent 输入框生成参数栏或编辑 `~/.neko/config.json`。

### 架构职责划分

```
neko-agent（命令层，统一实现 AI 逻辑）
  ├─ 注册 editor/context 和 explorer/context AI 菜单项
  ├─ neko.agent.sendContext 命令（统一上下文注入协议）
  └─ 所有 Agent 对话逻辑

@neko/shared（框架层）
  ├─ ContextMenu 组件（canvas/cut/sketch 共用）
  └─ buildAIMenuSection() helper（统一 AI 菜单结构）

各子包 extension（数据层，不重复实现 AI 逻辑）
  ├─ Webview 菜单渲染（无法绕过，各包负责）
  ├─ 快速执行（调用 MediaGenerationService）
  └─ 上下文序列化（把节点/片段/选段序列化为 sendContext payload）
```

### "发送到 Agent" 交互流

```
用户右键 → "发送到 Agent"
  ↓
Agent 面板聚焦 / 展开
  ↓
输入框注入 chip + 生成参数自动展开：

┌──────────────────────────────────────────────┐
│ [Chat▼] [Sonnet▼] │ [图片▼] [16:9 节点▼] [1080p▼]│
├──────────────────────────────────────────────┤
│ [🎬 镜头 #3 MS] [×]                          │  ← chip
│ 光线更暗，强调压迫感，重新生成|               │  ← 光标
├──────────────────────────────────────────────┤
│ [+]                          2.4k tokens [↵] │
└──────────────────────────────────────────────┘
```

### 技术实现

```
VSCode 文本编辑器   → editor/context（neko-story / neko-agent 注册）
文件树             → explorer/context（neko-agent 统一注册）
Canvas / Timeline  → Webview 自定义右键菜单
                     → postMessage → Extension
                     → executeCommand('neko.agent.sendContext', payload)
```

`neko.agent.sendContext` 为 neko-agent 暴露的命令，接收结构化上下文，注入 Agent 输入框。

---

## Webview 深度 AI 集成

深度集成 ≠ 在 webview 里重新实现 LLM 调用，而是让 AI 结果在哪产生就在哪展示和操作。

```
Agent 面板负责：              Webview 深度集成负责：
─────────────────────         ──────────────────────────
AI 发起（意图输入）             生成触发按钮（固定参数，就地）
模型选择                       生成状态渲染（spinner / done / error）
Prompt 构建 / 多轮对话          结果预览（in-context 展示）
配置决策                       接受 / 拒绝 / 重试操作
```

### neko-story — Inline Diff View

Agent 返回优化/续写结果后，在编辑器内展示 diff，不需要用户 copy-paste：

```
Agent 返回优化段落 → story webview 渲染 inline diff：

  原文: "Alice 推开门，看到了 Bob。"
  建议: "Alice 缓缓推开门，昏黄灯光里
         Bob 的轮廓映入眼帘。"
        [✓ 接受]  [✗ 拒绝]  [↻ 重新生成]
```

postMessage 协议：`{ type: 'inlineDiff', range: {start, end}, newText, source: 'agent' }`

### neko-canvas — 选中工具栏 + 节点状态

节点选中时浮出轻量工具条（比 BottomSheet 更小，不展开面板）：

```
选中 1 个 ShotNode:
┌──────────────────────────────────┐
│ ✨ 生成  🔁 重新生成  🤖 → Agent │  ← 浮在节点上方
└──────────────────────────────────┘

选中多个节点:
┌──────────────────────────────────────┐
│ ✨ 批量生成 (3)  🤖 → Agent 编排     │
└──────────────────────────────────────┘
```

节点自身渲染生成状态：

```
idle:        虚线占位框 + [+]
generating:  旋转动画 + 进度条
done:        生成图 + 右下角 [1/3 ▼]（版本切换）
error:       红色边框 + [↻ 重试]
```

### neko-cut — Placeholder Clip 内嵌入口

占位片段内嵌生成按钮，不用右键：

```
┌──────────────────────┐       生成中:  ┌──────────────────────┐
│  ✨ 生成素材  3.0s   │               │  ████████░░  67%     │
│  🤖 发送到 Agent     │               └──────────────────────┘
└──────────────────────┘
```

### 统一结果回写协议

Agent 执行完成后 postMessage 到对应 webview，webview 只处理展示和接受：

```
canvas: { type: 'node:generationDone', nodeId, imageData }
story:  { type: 'inlineDiff', range, newText, source: 'agent' }
cut:    { type: 'clip:generationDone', clipId, assetPath }
sketch: { type: 'layer:generationDone', layerId, imageData }
```

---

## 状态栏模型显示

### 两类模型都在状态栏展示

```
状态栏:  🤖 Sonnet  │  ✨ flux-dev  🎬 wan-2.1
         └─ LLM         └─ 生成模型（上下文感知）
```

- **LLM 模型**：影响所有 Agent 操作（文本优化、剧本续写、理解内容）
- **生成模型**：影响快速执行（图片/视频/音频生成）

### 与 Agent 输入框同步

状态栏和 Agent 输入框上栏是同一状态的两个入口：

```
状态栏 [🤖 Sonnet]  ←── 同步 ──→  Agent 输入框 [Claude Sonnet▼]

修改任意一处 → 两处同时更新 → 写入 ProjectConfig（持久化）
```

Agent 输入框支持 per-send 临时覆盖（「这次用 Opus」），发送后恢复项目默认。

### 上下文感知显示

```
canvas 聚焦:   🤖 Sonnet  │  ✨ flux-dev  🎬 wan-2.1
cut 聚焦:      🤖 Sonnet  │  🎬 wan-2.1
sketch 聚焦:   🤖 Sonnet  │  ✨ flux-dev
story 聚焦:    🤖 Sonnet  │  （生成模型隐藏）
```

Hover tooltip 展示完整参数：
```
hover 🤖 Sonnet    → LLM: Claude Sonnet 4.6
hover ✨ flux-dev  → 图片: flux-dev · 1080p · 16:9
hover 🎬 wan-2.1  → 视频: wan-2.1 · 720p · 16:9 · 4s
```

点击任意项 → VSCode Quick Pick 切换，同步更新另一处。

### 优先级层级（完整）

```
Agent 输入框 per-send 临时覆盖（不持久）
  ↑
状态栏 / ProjectConfig.llmModel（项目级，持久化）
  ↑
系统全局默认
```

---

## AI 智能补全

### Story / Markdown 编辑器

两层补全，本地规则优先：

**第一层：本地规则（无 LLM，< 50ms）**

```
角色名补全      → 输入 "AL" → "ALICE"（从剧本角色库）
场景位置补全    → 输入 "INT. OF" → "INT. OFFICE - DAY"（历史场景）
Fountain 格式   → 角色名后回车 → 自动插入对白缩进
转场提示        → 输入 "C" → "CUT TO:" / "CROSS FADE:"
```

**第二层：LLM Ghost Text（用状态栏当前 LLM，200–800ms）**

```
场景描述续写    → "Alice 推开门，" → "昏黄灯光里..." (ghost text)
对白延续        → 基于角色历史语气建议后续台词
段落续写        → Markdown 段落自然延伸
```

防抖 400ms 触发，用户继续输入时立即取消 pending 请求，Tab 接受 / 继续输入忽略。

**透明度保障**：补全使用的模型 = 状态栏 LLM，用户始终可见，可从状态栏切换。

**可配置**：
```
AI 补全: [开启 ▼]
  开启（使用当前 LLM）
  仅本地规则
  关闭
```

### Agent 输入框

Agent 输入框不做 LLM Ghost Text（AI 帮你构造指令，引入递归感，且 Agent 本身对模糊指令有足够理解能力）。

做三类非 LLM 补全：

**① @提及补全（本地 UI）**

```
输入 @           → 弹出选择器：文件 / 节点 / 角色 / 场景
输入 @Ali        → 过滤到 Alice（角色）+ alice.png（文件）
输入 @镜头       → 列出 canvas 所有 ShotNode
```

**② / 斜杠命令**

```
输入 /           → 显示可用命令列表
/task            切换到 Task 模式
/batch           批量生成所有镜头
/export          导出分镜
/clear           清空上下文
```

**③ 上下文感知建议 Chip**

基于当前选中内容，在输入框上方展示建议操作，点击填入输入框（不直接发送）：

```
选中 3 个 ShotNode 后：
┌────────────────────────────────────────────────┐
│ 💡 [批量生成图片]  [重构这场戏]  [优化镜头描述]  │
└────────────────────────────────────────────────┘
│ [🎬 #1] [🎬 #2] [🎬 #3] [×]                    │
│ 输入...                                         │
```

---

## 关键原则

> 如果 BottomSheet 保留复杂生成表单，用户会习惯在里面逐字段操作，
> 永远不会学会 Agent 的宏观编排能力 — 这是更低效的工作流，影响产品定位。

**BottomSheet 的存在是为了"确认和微调"，不是"创作入口"。**
**创作入口是 Agent Panel。**

---

## 类型设计：GenerationParams + GenerationModelConfig 拆分

`ProjectGenerationConfig` 拆分为两个正交职责：

### `GenerationParams` — 输出规格（和 AI 模型无关）

```typescript
// packages/neko-types/src/types/generation.ts

export interface ImageGenerationParams {
  ratio: '16:9' | '9:16' | '1:1' | '4:3' | '2.39:1';
  resolution: '512' | '720p' | '1080p' | '2K';
}

export interface VideoGenerationParams {
  ratio: '16:9' | '9:16' | '1:1';
  resolution: '480p' | '720p' | '1080p';
  duration: number;   // seconds
  fps: 24 | 30;
}

export interface AudioGenerationParams {
  duration: number;
  audioType: 'music' | 'sfx' | 'ambient' | 'voice';
}

export interface GenerationParams {
  image: ImageGenerationParams;
  video: VideoGenerationParams;
  audio: AudioGenerationParams;
}
```

### `GenerationModelConfig` — AI 引擎选择

```typescript
export interface GenerationModelConfig {
  llm: string;      // e.g. 'claude-sonnet-4-6'
  image?: string;   // e.g. 'flux-dev'
  video?: string;   // e.g. 'wan2.1'
  audio?: string;   // e.g. 'stable-audio'
}
```

### `NodeGenerationConfig` — 节点级参数覆盖

```typescript
// Per-node partial override; merged at runtime
export interface NodeGenerationConfig {
  image?: Partial<ImageGenerationParams> & { model?: string };
  video?: Partial<VideoGenerationParams> & { model?: string };
  audio?: Partial<AudioGenerationParams> & { model?: string };
}
```

### `ResolvedGenerationParams` — 运行时合并结果

```typescript
export type ParamSource = 'node' | 'project' | 'config' | 'system';
// 'config' = ConfigManager (~/.neko/config.json), 原 'market' 已废弃

export interface ResolvedGenerationParams {
  image: ImageGenerationParams & { model: string; modelSource: ParamSource };
  video: VideoGenerationParams & { model: string; modelSource: ParamSource };
  audio: AudioGenerationParams & { model: string; modelSource: ParamSource };
  llm: string;
}
```

**参数优先级**（从高到低）：
```
node oneshot → node.generationConfig → project.generationParams
→ ConfigManager.getEnabledModels(type)（~/.neko/config.json） → system default
```

**锁定参数**（🔒）：剪辑时长由 neko-cut timeline 锁定，tool layer 拒绝覆盖。

### `AgentContextPayload` — 统一上下文协议

```typescript
// packages/neko-types/src/types/agent-context.ts

export type AgentContextType =
  | 'canvas-node'
  | 'cut-clip'
  | 'story-selection'
  | 'file'
  | 'image';

export interface AgentContextPayload {
  type: AgentContextType;
  id: string;
  label: string;
  summary: string;
  data: unknown;
  intent?: string;
  generationParams?: Partial<ResolvedGenerationParams>;
}
```

### `NekoCanvasAPI.nodes` 命名空间

```typescript
// packages/neko-types/src/types/extension-api.ts — 扩展 NekoCanvasAPI

nodes: {
  list(type?: CanvasNodeType): Promise<CanvasNode[]>;
  get(nodeId: string): Promise<CanvasNode | undefined>;
  update(
    nodeId: string,
    data: Partial<ShotNodeData | SceneGroupNodeData | GalleryNodeData>
  ): Promise<void>;
  create(
    type: CanvasNodeType,
    position: { x: number; y: number },
    data: object
  ): Promise<string>;
  generateImage(nodeId: string, cellId?: string): Promise<void>;
  generateBatch(nodeIds: string[]): Promise<void>;
  onSelectionChange: vscode.Event<CanvasNode[]>;
};
```

---

## 开发方案 Phase 1–6

### Phase 1 — 基础设施（@neko/shared 类型 + API 接口）✅

**目标**：铺设所有后续阶段依赖的类型和接口，不含任何 UI。

**1.1 `packages/neko-types/src/types/generation.ts`** ✅
- `ImageGenerationParams`, `VideoGenerationParams`, `AudioGenerationParams`
- `GenerationParams`, `GenerationModelConfig`, `NodeGenerationConfig`
- `ResolvedGenerationParams`, `ParamSource`
- `resolveGenerationParams(node, project, config, system)` — 合并函数

**1.2 `packages/neko-types/src/types/agent-context.ts`** ✅
- `AgentContextType`, `AgentContextPayload`

**1.3 `packages/neko-types/src/types/extension-api.ts`** ✅
- `NekoCanvasAPI.nodes` 命名空间（list/get/update/create/generateImage/generateBatch/onSelectionChange）

**1.4 neko-canvas extension 实现 `nodes` API** ✅
- 文件：`packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
- 实现 `nodes.list/get/update/create` — 读写 canvasData
- `nodes.generateImage/generateBatch` — 委托 BatchGenerationScheduler（已有）
- `nodes.onSelectionChange` — 监听 webview postMessage `{ type: 'selectionChange', nodeIds[] }`

**1.5 ~~neko-market activeModel API~~（已取消）**

生成模型不通过 neko-market 查询。neko-agent `ConfigManager` 已有完整基础设施：
- `ConfigManager.getEnabledModels()` — 返回 `~/.neko/config.json` 中 `enabled: true` 的模型列表
- `ModelConfig.type` 字段区分 `llm / image / video / audio / music`
- 安装新模型后，neko-market 触发 `neko.agent.refreshModels` 写入配置，无需额外 API

**生成工具调用时的模型解析**（`extensionTools.ts` 已实现，`ensureProjectModel()` 自动写入 workspace config）：
```typescript
// canvas_generate_image / canvas_generate_batch 工具执行前
await ensureProjectModel('image');  // 从 ConfigManager 解析并写入 workspace config（若未配置）
```

**验证**：`cd packages/neko-types && npx tsc --noEmit`

---

### Phase 2 — Canvas × Agent 核心流程 ✅

**目标**：Agent 能读写 Canvas 节点，Ambient Context 自动注入，节点生图状态同步。

**2.1 Canvas MCP Tools（neko-agent extensionTools）** ✅
- 文件：`packages/neko-agent/packages/extension/src/tools/extensionTools.ts`
- `createNekoCanvasTools(media?, config?)` — 接受 `ConfigManager`，`ensureProjectModel()` 自动解析
- 工具列表（全部已实现）：
  - `canvas_list_nodes(type?)` → `nodes.list(type)`
  - `canvas_get_node(nodeId)` → `nodes.get(nodeId)`
  - `canvas_update_node(nodeId, data)` → `nodes.update(nodeId, data)` + 写 NodeGenerationConfig
  - `canvas_create_node(type, position, data)` → `nodes.create(...)`
  - `canvas_generate_image(nodeId, cellId?)` → 先 `ensureProjectModel('image')` → `nodes.generateImage(...)`
  - `canvas_generate_batch(nodeIds[])` → 先 `ensureProjectModel('image')` → `nodes.generateBatch(...)`
  - `set_project_generation_config(params, models)` → 写 workspace config
- `index.ts` 传入：`createNekoCanvasTools(platform.media, platform.config)`

**2.2 Ambient Context 自动注入** ✅
- `packages/neko-agent/packages/extension/src/services/canvasAmbientContext.ts` — 节点存储与摘要、导出 `SelectedNodeSummary` + `onDidChangeCanvasSelection` 事件
- `packages/neko-agent/packages/extension/src/index.ts` — 订阅 `NekoCanvasAPI.nodes.onSelectionChange`，触发 `chatViewProvider.sendAmbientCanvasContext()`
- `packages/neko-agent/packages/extension/src/chat/messageHandler.ts` — 系统提示注入（最多 5 个节点）
- `packages/neko-agent/packages/extension/src/chat/chatProvider.ts` — `sendAmbientCanvasContext()` postMessage 到 webview（`type: 'ambientCanvasUpdate'`）
- `packages/neko-agent/packages/webview/src/components/index.tsx` — 接收 `ambientCanvasUpdate`，更新 `ambientNodes` state
- `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/InputArea.tsx` — 渲染不可删除 ambient chips（`AgentContextChip` 无 `onRemove`）

**2.3 BottomSheet 精简** ✅
- 文件：`packages/neko-canvas/packages/webview/src/components/panels/BottomSheet.tsx`
- 保留：生图参数（比例/分辨率/时长）、生成历史候选图切换、接受/拒绝按钮
- 移除：完整 prompt 编辑器、风格选择（→ Agent）、角色引用选择（→ Agent）

**2.4 节点生图状态同步** ✅
- neko-canvas webview：`ShotNode` / `GalleryNode` 监听 `generationStatus` 字段变化
- Extension 通过 `generationProgress` postMessage 推送状态 → webview 更新 canvasStore
- 处理：`packages/neko-canvas/packages/webview/src/hooks/useVSCodeMessages.ts:138`

**验证**：手动测试 Agent 指令 "列出所有镜头" → `canvas_list_nodes('shot')` 返回正确数据

---

### Phase 3 — Agent 输入框 UI + 状态栏 ✅

**目标**：完成 Agent 输入框的附件 Chip + 建议 Chip，以及状态栏模型显示。

**3.1 附件 Chip 区域** ✅
- 实际路径：`packages/neko-agent/packages/webview/src/components/ChatView/InputArea/`
  - `InputArea.tsx` — 主组件，渲染 ambient chips（无 ×）+ contextChips（有 ×）
  - `AgentContextChip.tsx` — `onRemove` 可选，不传时不显示 × 按钮
- Ambient chips 来源：`canvasAmbientContext.onDidChangeCanvasSelection` → webview `ambientCanvasUpdate` 消息
- 用户 chips 来源：`@` mention / 右键菜单 `neko.agent.sendContext`

**3.2 建议 Chip（上下文感知）** ✅
- 文件：`packages/neko-agent/packages/webview/src/components/ChatView/InputArea/SuggestionChips.tsx`

**3.3 / 斜杠命令** ✅
- 文件：`packages/neko-agent/packages/webview/src/components/ChatView/InputArea/SlashCommandMenu.tsx`

**3.4 状态栏** ✅
- 文件：`packages/neko-agent/packages/extension/src/statusBar.ts`
- 左侧：`$(hubot) claude-sonnet-4-6`（LLM 模型，点击切换）
- 右侧（context-aware）：
  - canvas 激活时：`🖼 flux-dev  🎬 wan2.1`
  - cut 激活时：`🎬 wan2.1`
  - story 激活时：仅显示 LLM
- 点击生成模型图标 → 打开 ModelConfig 快速选择器（QuickPick）
- 状态与 Agent 输入框上方模型栏双向同步（写入 `workspace.config neko.project.modelConfig`）

**验证**：`cd packages/neko-agent/packages/webview && npx tsc --noEmit`

---

### Phase 4 — neko-story + neko-cut 跨工具集成 ✅

**目标**：剧本编辑器内联 AI Diff，neko-cut 占位符 clip 生成。

**4.1 neko-story 编辑器上下文** ✅
- 实际文件：`packages/neko-story/packages/extension/src/extension.ts`（lines 186–234）
  - 非独立 storyEditorProvider.ts，上下文注入直接在 extension.ts 激活逻辑中
- 监听文本选中事件 → 更新 AgentContext `storyContext: { filePath, selectedRange, selectedText }`
- 右键菜单 "→ Agent 续写/优化" → postMessage `sendToAgent` → Extension 注入 `AgentContextPayload`

**4.2 Story InlineDiff** ✅
- Agent 工具 `story_apply_suggestion` — `packages/neko-agent/packages/extension/src/tools/extensionTools.ts`
  - 参数：`script_path`, `start_line`, `end_line`, `new_text`
  - 调用 `neko.story.applyInlineDiff` 命令 → 弹出 accept/reject 模态框
- 命令实现：`packages/neko-story/packages/extension/src/extension.ts:142`
  - 接受：`vscode.workspace.applyEdit()` 应用 WorkspaceEdit；拒绝：关闭模态框

**4.3 neko-cut 占位符 Clip** ✅
- 命令侧：
  - `neko.cut.importGeneratedClip` — `packages/neko-cut/packages/extension/src/commands/index.ts:107`
  - `neko.cut.importStoryboard` — `packages/neko-cut/packages/extension/src/commands/timeline-commands.ts:441`
- 触发侧：`packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
  - `generateImageForNode()` — `onProgress('done', dataUrl)` 时调用 `pushGeneratedToCut()`
  - `pushGeneratedToCut()` — 仅在 `neko.neko-cut` 扩展激活时触发：
    1. `saveGeneratedImage()` 将 base64 dataUrl 写入 `<workspace>/.neko/generated/<nodeId>-<ts>.jpg`
    2. `executeCommand('neko.cut.importGeneratedClip', { assetPath })` → 插入占位符 Clip
  - 条件：workspace folder 存在 + neko-cut 处于激活状态；失败时仅 warn 不中断生成流程

**4.4 Script→Shot 跨工具链路** ✅
- Agent 工具 `import_script_to_canvas(scriptPath)` — `extensionTools.ts:1325`
  1. 调用 `neko.story.getScriptIndex(scriptPath)` 获取场景列表
  2. 为每个场景调用 `canvas_create_node('scene', ...)` 创建 SceneGroupNode
  3. 解析场景内对话行，为每句调用 `canvas_create_node('shot', ...)` 创建 ShotNode
  4. 返回创建汇总

**验证**：手动测试 "从剧本导入" 完整链路

---

### Phase 5 — 智能补全（Story + Agent）✅

**目标**：story/markdown 双层补全，Agent 输入框 @mention 补全。

**5.1 Story 本地规则补全** ✅
- 文件：`packages/neko-story/packages/extension/src/providers/completion.ts`
- 注册 `vscode.languages.registerCompletionItemProvider(['nks', 'fountain', 'markdown'])`
- 本地规则（< 50ms）：
  - `INT.` / `EXT.` → 场景位置模板
  - 角色名大写 → 台词块模板（`CHARACTER\n\t(action)\n\tDIALOGUE`）
  - `@` → 角色名列表（从 ScriptIndex 提取）
  - Markdown 标题 `#` → 结构模板

**5.2 Story LLM Ghost Text** ✅
- 文件：`packages/neko-story/packages/extension/src/providers/inlineCompletion.ts`
- 400ms debounce，仅在行尾触发
- `executeCommand('neko.agent.internalChat', { text, context })` → 返回 ghost text
- Tab 接受，Esc / 继续输入忽略
- 模型使用 `ModelConfig.llm`（状态栏可见）

**5.3 Agent @mention 补全** ✅
- 文件：`packages/neko-agent/packages/webview/src/components/ChatView/InputArea/MentionMenu.tsx`
- `@` 触发 → 本地搜索：文件树 + canvas nodes + story 角色列表
- 补全结果为 `AgentContextPayload`，选中后生成 Chip

**5.4 Agent / 斜杠命令扩展** ✅
- 文件：`packages/neko-agent/packages/webview/src/components/ChatView/InputArea/SlashCommandMenu.tsx`
- 允许插件注册自定义斜杠命令：`registerSlashCommand(name, description, handler)`
- neko-canvas 注册：`/batch` `/export` `/storyboard`
- neko-cut 注册：`/render` `/timeline`

**验证**：`cd packages/neko-story/packages/extension && npx tsc --noEmit`

---

### Phase 6 — 高级生成功能 ✅

**目标**：首尾帧、风格迁移、neko-sketch 集成。

**6.1 首尾帧生成（video）** ✅
- `canvas_generate_video_with_keyframes(nodeId, firstFrameNodeId, lastFrameNodeId)` — `extensionTools.ts:859`
- Extension 调用 MediaGenerationService video 模型，传入首尾帧 base64
- 结果写回 ShotNode `generatedVideo` 字段

**6.2 风格迁移** ✅
- `canvas_apply_style_transfer(targetNodeIds[], referenceNodeId)` — `extensionTools.ts:789`
- referenceNodeId 为 GalleryNode（IP-Adapter reference）
- BatchGenerationScheduler 批量处理，逐一更新状态

**6.3 neko-sketch 集成** ✅
- Agent 工具 `sketch_generate(prompt)` — `createNekoSketchTools()` in `extensionTools.ts:1458`
- 调用 `NekoSketchAPI.importImageData(base64, name)` 将生成图导入 sketch 图层
- neko-sketch 右键菜单 "→ Agent 优化" → sendToAgent + canvas 节点 Chip

**6.4 分镜导出增强** ✅
- `export_storyboard(format: 'pdf'|'zip'|'neko-cut')` — `extensionTools.ts:599`
- PDF：每页一个 ShotNode，jsPDF 渲染
- ZIP：JSZip 打包，`shots/001_[MS]_Alice.png` + `manifest.json`
- neko-cut：`executeCommand('neko.cut.importStoryboard', shots[])` — `timeline-commands.ts:441`

**验证**：`pnpm build:neko-canvas && pnpm build:neko-agent`

---

### 关键文件清单

#### 新增文件

| 文件 | 阶段 | 状态 |
|------|------|------|
| `packages/neko-types/src/types/generation.ts` | Ph1 | ✅ |
| `packages/neko-types/src/types/agent-context.ts` | Ph1 | ✅ |
| `packages/neko-canvas/packages/webview/src/components/panels/BottomSheet.tsx` | Ph2 | ✅ |
| `packages/neko-agent/packages/extension/src/services/canvasAmbientContext.ts` | Ph2 | ✅ |
| `packages/neko-story/packages/extension/src/providers/completion.ts` | Ph5 | ✅ |
| `packages/neko-story/packages/extension/src/providers/inlineCompletion.ts` | Ph5 | ✅ |

#### 修改文件

| 文件 | 变更 | 阶段 | 状态 |
|------|------|------|------|
| `packages/neko-types/src/types/extension-api.ts` | `NekoCanvasAPI.nodes` 命名空间 | Ph1 | ✅ |
| `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts` | 实现 `nodes` API + selectionChange | Ph1 | ✅ |
| `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts` | `pushGeneratedToCut` + `saveGeneratedImage` — 生成完自动推 cut | Ph4 | ✅ |
| `packages/neko-agent/packages/extension/src/tools/extensionTools.ts` | `createNekoCanvasTools(media, config)` + `ensureProjectModel` + 全部工具 | Ph2 | ✅ |
| `packages/neko-agent/packages/extension/src/index.ts` | 传 `platform.config`，订阅 `onDidChangeCanvasSelection` | Ph2 | ✅ |
| `packages/neko-agent/packages/extension/src/chat/chatProvider.ts` | `sendAmbientCanvasContext()` | Ph2 | ✅ |
| `packages/neko-agent/packages/extension/src/chat/messageHandler.ts` | 系统提示注入 ambient 节点 | Ph2 | ✅ |
| `packages/neko-agent/packages/webview/src/components/index.tsx` | `ambientCanvasUpdate` 消息处理 + state | Ph2 | ✅ |
| `packages/neko-agent/packages/webview/src/components/ChatView/InputAreaContext.tsx` | `ambientNodes` prop | Ph2 | ✅ |
| `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/InputArea.tsx` | 渲染 ambient chips + contextChips | Ph3 | ✅ |
| `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/AgentContextChip.tsx` | `onRemove` 可选 | Ph3 | ✅ |
| `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/SuggestionChips.tsx` | 上下文感知建议 chip | Ph3 | ✅ |
| `packages/neko-agent/packages/webview/src/components/ChatView/InputArea/SlashCommandMenu.tsx` | / 斜杠命令 + MentionMenu | Ph3 | ✅ |
| `packages/neko-agent/packages/extension/src/statusBar.ts` | LLM + 生成模型展示 | Ph3 | ✅ |
| `packages/neko-story/packages/extension/src/extension.ts` | 上下文注入 + 右键菜单（lines 186–234） | Ph4 | ✅ |
| `packages/neko-cut/packages/extension/src/commands/index.ts` | `neko.cut.importGeneratedClip` (line 107) | Ph4 | ✅ |
| `packages/neko-cut/packages/extension/src/commands/timeline-commands.ts` | `neko.cut.importStoryboard` (line 441) | Ph4 | ✅ |

> **已取消**：`packages/neko-market/packages/extension/src/index.ts` — `getActiveModel()` 方案废弃，
> 改用 neko-agent `ConfigManager.getEnabledModels()` 读取 `~/.neko/config.json`。

---

### 依赖关系

```
Ph1 (类型基础设施)
  → Ph2 (Canvas × Agent 核心流程)
      → Ph3 (Agent UI + 状态栏)
      → Ph4 (story/cut 跨工具)
          → Ph5 (智能补全)
          → Ph6 (高级生成)
```

Ph2 完成后 Ph3/Ph4 可并行；Ph5/Ph6 在 Ph4 后并行。

---

### 阶段验证命令

```bash
# Ph1
cd packages/neko-types && npx tsc --noEmit

# Ph2
cd packages/neko-canvas/packages/extension && npx tsc --noEmit
cd packages/neko-agent/packages/extension && npx tsc --noEmit

# Ph3
cd packages/neko-agent/packages/webview && npx tsc --noEmit

# Ph4
cd packages/neko-story/packages/extension && npx tsc --noEmit

# Ph5/Ph6
pnpm build:neko-canvas && pnpm build:neko-agent
```
