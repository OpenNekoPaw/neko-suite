# Agent 统一工作流协议

**状态**: Proposed（22 / 22 ADR 章节已落地；2026-04-22 精简为三阶段 + Phase B 工具下线）
**日期**: 2026-04-20 · 三阶段重命名 2026-04-22 · Phase B 同日完成

## 落地进度快照（2026-04-22）

### 已完成（按 ADR 章节计）

| ADR 章节 | 动作 | 提交 |
|-------|-----|----|
| §3 L3 Mode 两档 | AutoMode / PlanMode | 已存在 |
| §3.2 | StagePlanner 6 入口规则 | 已存在 |
| §4 SDD 3 阶段 | Draft / Plan / Apply（合并原 Specify/Plan/Tasks/Implement）| Phase A（2026-04-22） |
| §4.2 lineage | WorkflowRun → SddRun rename；proposalId → draftId | W1.2.3 / Phase A |
| §5 Skill-as-package | SDD metadata / phases / pipelines 回落子包 | B1-B1.6 |
| §5.2.10 | requiredSubpackages 激活校验 | A1 |
| §5.3 | 内置 Skill prompt 原子化 | W1.3 |
| §5.4 | StageTracker + StageGuardian | A1-A3 |
| §5.7 三级懒加载 | LazySkill registry | 已存在 |
| §6.1 ApprovalEngine | engine + creation/execution strategy pack；channel 改名 draft-review | B1 / B3 / Phase A |
| §6.2 EventBus | typed channels + 三端 sink；`creation.draft.presented` / `execution.task.updated` / `execution.artifact.*` | C1-C6 / Phase A / Phase B |
| §6.3 TaskManager | 已是 TaskManager（文档对齐） | 已存在 |
| §6.4 RetryEngine | 5-level autoheal + example handlers | B2 |
| §6.5 StageTracker/Guardian | out-of-order / timeout / approval-skipped；Apply 为终态；ArtifactWatcher 补齐 post-write 校验 | A1-A3 / B3 / Phase A / Phase B |
| §7 产物格式二分 | MD serializers（draft / plan / task）+ JSONL sinks | C1-C8 / Phase A |
| §7.4 `.neko/` 布局 | NekoPaths 前缀命名：drafts/draft-*.md、plans/plan-*.md、tasks/task-*.md | C1-C9 / Phase A |
| §7.5 Frontmatter | 最小化 + AI 所有权；kind=draft/plan/task | C5 / C7 / C8 / Phase A |
| §8 资产引用 | PathResolver + asset:// URI | 已存在 |
| §9 审批治理 | preferencesStrategyPack + L0 不降级约束 | D |
| §9.3 preferences.md | parser + 双层合并 + auto-load | D |
| §10 术语一致性 | 撤销双轨，统一英文命令 | F |
| §11 轻量化 | 贯穿全局（Skill MD + frontmatter） | 已存在 |
| §5.1/§5.3 | CapabilityKind discriminant + `capabilityKindOf()` | 收尾 |

**小计**：22 / 22 章节全部有落地证据。2026-04-22 Phase A 将四阶段合并为三阶段（Draft/Plan/Apply），并把 `.nk*.md` 扩展名迁移为 `<kind>-<runId>.md` 前缀方案。

### 已延后（非 ADR 阻塞）

| 动作 | ADR 章节 | 状态 | 待做 |
|-----|--------|----|----|
| .nksession.md 会话摘要 | §7.4 | ⏳ | 需先理清 Journal/ConversationRecord/compact/memory 四合一（E 波） |
| .neko/cache/*.json 派生索引 | §7.4 | ⏳ | 按需，UI 侧提出索引需求再补 |

**关联范围**: neko-agent · neko-market · @neko/shared · 所有子包
**关联文档**:

- [dual-flow-architecture.md](./dual-flow-architecture.md) - 早期双流探索（本 ADR 的简化归宿）
- [capability-registration-and-distribution.md](./capability-registration-and-distribution.md) - 早期能力注册设计探索
- [perception-first-roadmap.md](./perception-first-roadmap.md) - 感知路线图
- [marketplace.md](./marketplace.md) - neko-market 分发基础

**取代说明**：本 ADR 在吸收 dual-flow 与 capability-registration 两份探索文档的有效洞察后，整合为更精简的四层架构 + 二分格式原则。前两份文档保留作为设计探索记录。

---

## 1. 背景与核心判断

早期的 dual-flow + capability-registration 设计经过深入讨论后，暴露出以下根本问题：

1. **外环 5 阶段过度设计** — Orchestration/Status 无真实需求验证，业界（Midjourney/Runway/Cursor/Speckit）共识是 2-4 阶段
2. **Plan 概念严重混淆** — 同一词承载"业务方案/技术步骤/Step 内部字段/行为模式"4 种语义
3. **能力注册协议过度复杂** — 10 类能力 + 8 层防御在无真实痛点时是 pre-build 复杂度
4. **对称美学诱导设计债** — 双流/四维/五原语的对称结构是"架构洁癖"而非用户需求
5. **产物格式分类混乱** — 未澄清"AI 产出 vs 程序产出"的本质二分

**本 ADR 的角色**：基于这些反思，定义一套**可落地、与业界对齐、预留演进空间**的整合架构。核心是四层职责分离 + 二分格式原则 + SDD 流程对齐 Speckit。

---

## 2. 四层整合架构

```
┌─────────────────────────────────────────────────────────────┐
│ L3 模式层（Mode）— 两档切换                                  │
│                                                             │
│       AutoMode（默认）    │    PlanMode（显式切换）         │
│       按任务特征自动判定  │    强制走完整 SDD 4 阶段        │
└─────────────┬───────────────────────────────────────────────┘
              │ 模式选择决定启用哪些流程
              ▼
┌─────────────────────────────────────────────────────────────┐
│ L2 流程层（Flow）— 对齐 Speckit SDD                          │
│                                                             │
│   AutoMode 简单任务:  直接 Step 循环                        │
│   AutoMode 复杂任务:  按入口判定规则进入 SDD 对应阶段       │
│   PlanMode:           Draft → Plan → Apply                  │
└─────────────┬───────────────────────────────────────────────┘
              │ 流程由能力编排
              ▼
┌─────────────────────────────────────────────────────────────┐
│ L1 能力层（Capability）— 扁平原子池                          │
│                                                             │
│   Tool / Operation / ProposalTemplate / ReviewGate /        │
│   ViewRecipe / StatusNarrator / Skill / Workflow            │
│   全部平级注册，子包通过单一 Provider 贡献                  │
└─────────────┬───────────────────────────────────────────────┘
              │ 所有能力调用走底层基础设施
              ▼
┌─────────────────────────────────────────────────────────────┐
│ L0 基础设施层（Infrastructure）— 默认全局透明               │
│                                                             │
│   ApprovalEngine │ EventBus │ TaskManager │ RetryEngine      │
│   审批引擎       │ 事件总线 │ 任务管理 │ 重试+自愈         │
│                                                             │
│   所有能力调用自动享受，业务层无需显式声明                  │
└─────────────────────────────────────────────────────────────┘
```

**四层职责正交**：
- L3 是**用户选择**（三档模式）
- L2 是**流程骨架**（条件激活 SDD 4 阶段）
- L1 是**能力原子**（扁平注册 + 自由组合）
- L0 是**基础设施**（默认全局透明）

---

## 3. L3 模式层

### 3.1 两种模式

| 模式 | 默认性 | 触发方式 | 特征 |
|-----|-------|---------|-----|
| **AutoMode** | ✅ **默认** | 自动 | Agent 按任务特征自动选入口阶段 + 路径 |
| **PlanMode** | 显式覆盖 | `/plan` 命令 | 强制走完整 SDD 3 阶段（Draft → Plan → Apply），深度参与 |

**两档足够**：AutoMode 已覆盖简单任务的快路径（无需单独的 DirectMode），PlanMode 承载需要深度参与的场景。早期设计的 DirectMode 与 AutoMode 功能重叠（AutoMode 已能自动判定简单任务走快路径）且"强制跳过审批"承诺无法完全兑现（critical 级 L0 强制拦截），已删除。

**Direct 调用**（UI 按钮直接调用工具，绕过 Agent 会话）是独立的**调用方式（Invocation Style）**概念，不属于 Agent Mode 层级，未来可作为独立维度扩展（P1+）。

### 3.2 入口阶段判定（AutoMode 核心）

AutoMode 下 Agent 按下列规则**判定从哪个 SDD 阶段开始**：

| 优先级 | 规则 | 入口阶段 | 可被覆盖 |
|------|-----|--------|--------|
| 1（最高）| 含 `reversible: false` 的 Operation | Draft | ❌ 不可（强制审批）|
| 2 | 用户引用已有产物（`@task-001` / `@plan-001` / `@draft-001`）| 对应阶段（继续）| ✅ |
| 3 | 用户匹配 Workflow 模板（`/tiktok-15s`）| 由 Workflow 定义 | ✅ |
| 4 | 用户给原子指令（"调音量 +3dB"）| Apply | ✅ |
| 5 | 用户给明确多步任务（"生成 3 张 16:9 封面"）| Plan | ✅ |
| 6（兜底）| 用户给模糊创作意图（"做个 TikTok 视频"）| Draft | ✅ |

**实现要点**：
- 规则 1（高风险）由 L0.ApprovalEngine 强制执行，**不依赖 LLM 判断**
- 规则 2/3/4 由代码模式匹配（语法/标签/能力清单），**不依赖 LLM**
- 规则 5/6 依赖 Sonnet 级 LLM 辅助判断意图明确度（中高可靠性）
- **绝大多数判定走规则**，LLM 只补充模糊意图识别

### 3.3 两种模式行为对照

| 模式 | 入口判定 | 可跳过阶段 | 高风险拦截 |
|-----|---------|---------|---------|
| **AutoMode** | 按 §3.2 规则 | 跳过判定结果之前的阶段 | ✅ 强制 |
| **PlanMode** | 永远从 Draft 开始 | 不跳过 | ✅ 强制 |

**永不可降级的硬约束**：
- 高成本 Operation（`reversible=false` 或超用户阈值）**必须经 Approve**
- 这是 L0 ApprovalEngine 强制，不依赖模式选择
```

---

## 4. L2 流程层（SDD 三阶段）

### 4.1 PlanMode 激活时的 3 阶段

2026-04-22 从 Speckit 四阶段简化为三阶段。合并理由：原 Plan + Tasks 两阶段共享 persona / 工具 / guardians / 失败语义，差异仅在产出物命名，合并消除状态机中的空转环节。动词阶梯"松→紧→动"借用 Terraform 的 `plan` / `apply` 范式，避开 `design` 在创作工具里与"视觉设计"的歧义。

| 阶段 | 产出物 | 生成者 | 用户角色 |
|-----|-------|-------|--------|
| **Draft** | Draft（业务声明式 `.md`）| AI | 审批对象 |
| **Plan** | ExecutionPlan（技术命令式）+ Task（用户可见清单）| AI（从 Draft 编译）| Plan 通常不看；Task 看进度 |
| **Apply** | Step Loop（tool call 执行）| AI + L0 基础设施 | 看结果 |

**阶段名与产出物同根**：Draft 阶段产出 Draft，Plan 阶段产出 ExecutionPlan（简称 Plan）+ Task。Apply 阶段不产独立产物，消费前两阶段的产物执行 tool call。

### 4.2 声明式与命令式分层

```
Draft（声明式 What）──► Plan（命令式 How + Task 派生）──► Apply
  业务目标                tool call 列表 + UI 进度清单         实际执行
  用户审批对象            Agent 自用 + UI 看进度              L0 接管
```

**核心原则**：
- **用户审批 Draft**（声明式业务目标），不审批 Plan（命令式技术步骤）
- **Agent 重试时重编译 Plan**（目标不变），不重新定义 Draft
- **Draft 失败 = 方向错**（用户介入），Plan 失败 = 技术问题（自愈）
- **lineage**：ExecutionPlan 通过 `draftId` 指向源 Draft（原 `proposalId` 字段已重命名）

### 4.3 AutoMode 简单任务的极简流程

AutoMode 判定为简单任务时**跳过 Draft / Plan**，直接进入 Apply 阶段的 Step 循环：

```
用户输入 → Step（think → act → observe）→ 返回结果
```

无 Draft 产出物，无 Plan 编译，无 Task 清单呈现。

---

## 5. L1 能力层（Skill 为核心 + 扁平工具池）

**重大简化**：能力分类从前期 10+ kind 收敛为 3 核心类。Skill 作为**场景包**内嵌编排声明（phases + pipelines），替代独立的 Workflow/Pipeline 文件。

### 5.1 三核心能力类

```typescript
type CapabilityKind =
  | 'skill'      // 场景包：人格 + 编排 + 加工链 + 引用资产
  | 'tool'       // 工具/Operation（扁平工具池）
  | 'operation'  // 业务语义操作（扁平工具池）
```

**设计哲学**：**AI 是最强的编排执行器**。传统 Workflow 引擎需要 DSL + 解析器 + 调度器是因为执行器是确定性程序；AI Agent 可直接读自然语言编排指令执行，不需要独立 DSL。

**删除**：独立 Workflow/Pipeline/ProposalTemplate/ReviewStrategy/OrchestrationSkill/StatusNarrator/ViewRecipe 等细分 kind，全部内嵌到 Skill。

### 5.2 Skill 作为场景包

Skill 是 neko-suite 原生的场景打包单元，一个文件/文件夹承载完整创作场景所需的所有声明：**人格 + 多阶段编排 + 加工链 + 资产引用 + 合规元数据 + 跨 Skill 协作**。Skill 格式为 neko 生态服务，不追求与其他 Agent 框架互操作。

#### 5.2.1 完整结构示例

```yaml
---
# === 核心字段（必填）===
name: cut-tiktok-creator              # ≤64 字符，小写+数字+连字符
description: |                        # ≤1024 字符，必须含 What + When 两部分
  TikTok 15 秒短视频创作剪辑师，懂 Z 世代审美与快节奏剪辑。
  Use when user wants to create TikTok/Douyin/Xiaohongshu short videos,
  vertical short-form content, or Z 世代 style viral videos.
version: 1.0.0                        # 版本号（支持升级/合规追溯）
domain: cut                           # 域标识（cut/story/canvas/...）

# === 子包依赖（必填时建议声明）===
requiredSubpackages:                  # 声明此 Skill 依赖哪些子包（分发/安装粒度）
  - id: neko-cut
    required: true                    # 必需，缺失则阻止激活
    minVersion: "1.0.0"
  - id: neko-audio
    required: false                   # 可选，缺失则降级
    fallback:
      message: "未安装 neko-audio，视频将无 BGM"

# === 工具与行为（可选）===
allowedTools:                         # 工具白名单
  - cut.trim-clip
  - cut.generate-shot
  - cut.compose-timeline
  - cut.export-mp4
  - audio.select-bgm
autoInvoke: true                      # 是否允许 AutoMode 自动激活（默认 true）

# === 多阶段编排（内嵌 Workflow，可选）===
phases:
  - name: style-calibration
    label: 风格校准
    approval: false
  - name: shot-breakdown
    label: 分镜拆解
    approval: true                    # 声明式审批点
  - name: shot-generation
    label: 镜头生成
    approval: false
    parallel: true
  - name: composition
    label: 合成配乐
    approval: false
  - name: export
    label: 导出
    approval: true

# === 加工链（内嵌 Pipeline，可选）===
pipelines:
  export:
    ops:
      - cut.upscale: { target: 1080p }
      - cut.color-grade: { preset: cinematic }
      - cut.encode: { codec: h264, bitrate: 8M }
      - cut.watermark
  preview:
    ops:
      - cut.downscale: { target: 360p }
      - cut.encode: { codec: h264, bitrate: 1M }

# === 资产引用（asset:// URI + 失效处理，可选）===
referencedAssets:
  - uri: asset://styles/cinematic-lut
    required: false
    purpose: "默认电影 LUT"
  - uri: asset://presets/tiktok-transitions
    required: false
    purpose: "TikTok 转场预设"

# === 跨 Skill 协作（可选）===
referencedSkills:
  - id: audio-expert
    relationship: collaborator

# === 合规元数据（可选）===
compliance:
  framework: creator-standard
  auditRequired: false
---

# TikTok 创作剪辑师

你是资深的 TikTok 短视频剪辑师，深谙 Z 世代审美与平台算法。
你理解快节奏剪辑、钩子镜头、情绪曲线的重要性。

## 使用场景
（对应 description 的 When 子句）

当用户想创作：
- TikTok / 抖音 / 小红书短视频
- 15-60 秒竖屏内容
- Z 世代审美风格

## 工作流程

### Phase 1: 风格校准
询问目标受众、平台、参考片...

### Phase 2: 分镜拆解 ⚠️ 需审批
默认 12 镜头（3+9+3 秒）...
**此阶段需要用户确认分镜表。**

### Phase 3: 镜头生成（并行）
并行生成所有镜头，失败时降分辨率重试。

### Phase 4: 合成配乐
按分镜合成 timeline，配合快节奏 BGM。

### Phase 5: 导出 ⚠️ 需审批
使用 `export` pipeline 导出。
**不可逆操作，需用户确认参数。**

## 失败处理
- OOM → 降分辨率重试
- API 失败 → 切换备用模型
- 质量低 → 调整 prompt 重生

## 跨 Skill 协作
处理音频细节时可切换到 `audio-expert` Skill。
```

**一个 Skill 文件打包**：元数据 + 人格（正文）+ 多阶段编排 + 加工链 + 资产引用 + 合规元数据 + 跨 Skill 协作。

#### 5.2.2 字段语义

| 字段 | 必填 | 职责 |
|-----|-----|-----|
| **name** | ✅ | Skill 唯一标识，严格命名规则 |
| **description** | ✅ | What + When，AutoMode 自动触发决策依据 |
| **version** | ✅ | 版本号，支持合规追溯（skillSha 证据链）|
| **domain** | ✅ | 域标识，便于跨子包组织（cut/story/canvas/...）|
| **requiredSubpackages** | 🟡 建议 | 子包依赖声明（激活前校验，避免运行时缺失）|
| **allowedTools** | ❌ | 工具白名单（不声明则允许所有子包贡献的工具）|
| **autoInvoke** | ❌ | 是否允许 AutoMode 自动激活（默认 true）|
| **phases** | ❌ | 多阶段编排（内嵌 Workflow，有则激活多阶段）|
| **pipelines** | ❌ | 加工链（内嵌 Pipeline，按 key 引用）|
| **referencedAssets** | ❌ | 资产引用（asset:// URI + required/fallback 失效处理）|
| **referencedSkills** | ❌ | 跨 Skill 协作声明（collaborator/delegator）|
| **compliance** | ❌ | 合规元数据（framework/auditRequired/...）|

#### 5.2.3 人格声明：正文即 prompt

人格描述在**正文**（不在 frontmatter），frontmatter 只承载结构化元数据。

```markdown
# TikTok 创作剪辑师        ← 人格声明在正文

你是资深的 TikTok 短视频剪辑师...
```

**禁用的旧模式**：
```yaml
# ❌ 不再使用 systemPrompt frontmatter 字段
systemPrompt: |
  你是...
```

**原因**：
- 避免 frontmatter 与正文人格声明重复
- 正文即 system prompt 最简洁
- AI 读取正文就是人格注入

#### 5.2.4 描述字段 What+When 模式

**强制规范**：`description` 必须包含两部分：

```yaml
description: |
  <What 做什么> ← 简洁描述能力
  Use when <When 何时使用> ← 触发条件（支持 AutoMode 自动激活）
```

**示例对比**：
```yaml
# ❌ 差: "A cut editor skill"（无 When，Agent 无法决策）
# ✅ 好:
description: |
  Edits TikTok-style 15s vertical videos with fast-paced cuts.
  Use when user wants to create content for TikTok, Douyin, or Xiaohongshu.
```

#### 5.2.5 命名规则

**name 字段限制**：
- ≤ 64 字符
- 仅小写字母 + 数字 + 连字符（`a-z0-9-`）
- 不含 XML 标签
- `neko-` 前缀保留给官方 Skill，第三方不可使用

**description 字段限制**：
- ≤ 1024 字符
- 非空
- 不含 XML 标签
- 必须含 What + When

**好处**：防注入、防冲突、便于索引。

#### 5.2.6 载体：单文件 vs 文件夹

neko-suite Skill 两种载体并存：

**载体 A: 单文件**（轻量场景）
```
cut-tiktok-creator.skill.md
```

适用：
- 纯声明式 Skill
- 无捆绑脚本 / 参考资料
- 引用已有资产（通过 asset:// URI）

**载体 B: 文件夹**（复杂场景）
```
cut-tiktok-creator/
  skill.md                    ← 入口文件
  scripts/                    ← 可选：捆绑脚本
    gen-shots.py
  references/                 ← 可选：参考资料
    tiktok-trends-2026.md
  assets/                     ← 可选：小型私有资产（仅供此 Skill 用）
```

适用：
- 需要捆绑脚本（Agent 可调用）
- 需要参考资料（Agent 按需阅读）
- 需要私有小型资产（不进 market 共享）

**载体选择规则**：
```
纯声明式 + 引用已有资产 → 单文件
需要捆绑资源（脚本/资料/私有资产）→ 文件夹
含大型资产（GB 级模型/LoRA）→ Plugin（见 §X）
```

#### 5.2.7 三级加载

为了 token 效率，Skill 采用三级懒加载：

```
Level 1: Frontmatter 元数据（始终常驻）
  - 所有 Skill 的 frontmatter 在系统启动时加载
  - Agent 根据 description 决定激活哪个 Skill
  - token 成本低（每 Skill 约 50-100 tokens）

Level 2: Skill 正文（激活时加载）
  - 只在 Skill 被激活时加载
  - 理想长度 < 500 行
  - 正文作为 system prompt 注入

Level 3: 捆绑资源（按需加载）
  - scripts/ / references/ / assets/ 按需读取
  - 不占用初始上下文
```

**效率对比**：
- 假设 100 个 Skills 注册
- 单级加载：每个 Skill 平均 500 行 → 50K 行 token 爆炸
- 三级加载：仅 frontmatter 常驻 → ~5K tokens，正文按需加载

#### 5.2.8 自动触发（AutoMode 核心）

AutoMode 下 Agent 基于 description 自动选择 Skill：

```
用户输入 → Agent 读取所有 Skill 的 frontmatter 元数据（Level 1，已常驻）
  ↓
匹配 description 中的 When 子句
  ↓
选出最相关 Skill（多个时用 LLM 排序 + 用户确认）
  ↓
加载选中 Skill 的正文（Level 2）
  ↓
作为 system prompt 激活
  ↓
按 phases 执行任务
```

**示例场景**：
```
用户: "帮我做个 TikTok 视频"
  ↓
Agent 匹配:
  - cut-tiktok-creator: description 含 "TikTok" ✅ 高相关
  - story-writer: description 无 TikTok ❌ 不相关
  - color-grader: description 无 TikTok ❌ 不相关
  ↓
激活 cut-tiktok-creator
```

**对 description 写作的要求**：
- When 子句必须覆盖用户可能的触发词
- 使用多个同义词提高匹配率
- 示例：
  ```
  Use when user wants to create TikTok, Douyin, Xiaohongshu,
  short videos, vertical content, Z 世代 content, or viral shorts.
  ```

#### 5.2.9 autoInvoke 精细控制

通过 `autoInvoke: false` 可禁用 AutoMode 的自动激活：

```yaml
# 某些 Skill 仅应显式激活（如高危操作 Skill）
name: production-deploy
autoInvoke: false   # AutoMode 不会自动选择此 Skill
```

适用场景：
- 高风险 Skill（部署 / 发布）
- 需要明确意图的 Skill（法律 / 医疗建议）
- 测试 / 调试用 Skill

默认 `autoInvoke: true`，大多数创作 Skill 无需显式设置。

#### 5.2.10 子包依赖声明

Skill 通过 `requiredSubpackages` 声明依赖的子包（分发/安装粒度），避免用户在运行时才发现能力缺失。

**为什么在子包粒度而非命令粒度**：
- 子包粒度用户易懂（"需要 neko-cut 子包"）
- 维护成本低（子包内新增/重构命令不影响 Skill）
- 对齐成熟生态（npm dependencies / VSCode extensionDependencies）

**字段结构**：

```yaml
requiredSubpackages:
  - id: neko-cut                  # 子包 ID
    required: true                # 必需 or 可选
    minVersion: "1.0.0"           # 可选，版本约束
  - id: neko-audio
    required: false
    fallback:
      message: "未装 neko-audio，视频将无 BGM"
```

**激活时校验流程**：

```
Skill 激活前:
  1. 读取 requiredSubpackages
  2. 对每个依赖:
     查询子包是否已安装 + 版本满足
     ├─ 满足 → 通过
     ├─ 缺失 + required → 阻止激活，提示安装
     └─ 缺失 + optional → warn + 降级
```

**UI 提示示例**：

```
用户激活 tiktok-creator Skill
  ↓
系统检测:
  ✅ neko-cut 已安装 (v1.0.0)
  ❌ neko-audio 未安装
  ↓
对话框:
  "tiktok-creator 需要以下子包："
  - neko-audio（可选，缺失则无 BGM）
  [安装 neko-audio] [继续（无 BGM）] [取消]
```

**执行时二次校验**（防运行时卸载）：

Agent 调用工具前检查子包是否仍加载，缺失则触发 L0.RetryEngine 级别 3（工具替代）或级别 5（升级用户）。

**简化策略**：

当前阶段仅做子包级依赖声明。未来如果真实场景需要更细粒度（如"只需要 video-editing 功能组"），可扩展到场景/Tool Group 维度；如果需要精确到单命令级别，则由 L0.RetryEngine 运行时处理（不进入 Skill 声明）。

### 5.3 Tool/Operation 扁平工具池

编程接口级的工具由子包贡献，保持扁平：

```json
{
  "contributes": {
    "neko": {
      "capabilities": [
        { "kind": "operation", "id": "cut.trim-clip", "schema": {...}, "costProfile": {...} },
        { "kind": "operation", "id": "cut.export-mp4", "costProfile": { "reversible": false } },
        { "kind": "tool", "id": "cut.list-clips", "costProfile": { "reversible": true } }
      ]
    }
  }
}
```

**子包职责**：
- 贡献原子工具（Tool/Operation）
- 可提供默认 Skill（作为子包能力的"使用示例"）
- 不贡献 Workflow/Pipeline（内嵌到 Skill）

### 5.4 AI 原生执行：注入 + 巡检

L0 基础设施支持 Skill 内嵌 phases 的运行时执行：

```typescript
// L0.StageTracker - 轻量追踪器（不是调度器）
interface StageTracker {
  current: StageInfo | null;
  history: StageInfo[];
  enter(stageName: string): void;
  exit(success: boolean): void;
  inject(promptHint: string): void;  // 注入 stage 提示给 Agent
}

// L0.StageGuardian - 巡检器
interface StageGuardian {
  check(skill: Skill, state: AgentState): GuardResult;
  // 巡检: stage 顺序 / 审批跳过 / 超时 / 声明偏离
  // 自动修正: 注入提示 / 强制 ReviewGate
}
```

**分工**：
- **Skill 是声明**（phases + pipelines）
- **Agent 是执行**（读声明 + 按序执行）
- **L0 是 guardian**（巡检 + 注入 + 强制审批）

**避免的反模式**：
- ❌ 全 AI 推进（LLM 幻觉导致 stage 错乱 + token 爆炸）
- ❌ 全程序推进（参数呆板 + 失败机械 + 无创作审美）
- ✅ 程序驱动执行流程，AI 在决策节点注入智能（对齐 LangGraph/CrewAI 共识）

### 5.5 跨域组合天然支持

扁平工具池 + Skill 协作声明：

```
"做一张电影风格海报"
  → 用户激活 cut-editor Skill
  → Skill 声明 referencedSkills: [canvas-expert]
  → Agent 从扁平工具池组合:
    - canvas.generate-background（canvas 域）
    - cut.extract-frame（cut 域）
    - canvas.compose-subject（canvas 域）
    - canvas.layout-text（canvas 域）
  → 需要时切换到 canvas-expert Skill 的人格
```

### 5.6 能力消费

```typescript
// Agent 激活 Skill
const skill = registry.get('cut-tiktok-creator');
stageTracker.load(skill.phases);

// Agent 执行时按 Skill 声明调度
for (const phase of skill.phases) {
  stageTracker.enter(phase.name);
  if (phase.approval) await reviewGate.wait();
  await executePhase(skill, phase);
  stageTracker.exit(true);
}

// 扁平工具池按需查询
const ops = registry.filter({ kind: ['tool', 'operation'] });
```

### 5.7 按需升级路径

当前（P0）：Skill 内置轻量声明式（覆盖 90% 场景）
  ↓
P1（有复用需求时）：抽取共享 Pipeline 文件（多 Skill 引用同一 pipeline）
  ↓
P2（市场需求时）：独立 Workflow 市场（社区分享编排模板）
  ↓
P3（企业需求时）：严格 DSL + schema 校验（极严合规场景）

**关键**：每一步由真实需求驱动，**不 pre-build**。当前信号都没触发，停留 P0。

---

## 6. L0 基础设施（默认透明）

L0 是**横切关注点**的统一实现，所有能力调用自动享受，业务层无感知。

### 6.1 ApprovalEngine（审批引擎）

**职责**：基于能力 `costProfile` 自动决定是否拦截审批。

```typescript
interface ApprovalEngine {
  evaluate(subject: ApprovalSubject): Decision;
  // subject: Proposal（用户审批） / Operation（自动决策）
}

// 单引擎 + 双策略包
- CreationStrategyPack: Proposal/Review 决策
- ExecutionStrategyPack: Operation 授权（按 costProfile）
```

**能力侧只需声明**：
```typescript
Operation {
  costProfile: { reversible: false, tokens: 'high' }
  // ApprovalEngine 自动拦截
}
```

### 6.2 EventBus（事件总线）

**职责**：统一事件通道，所有阶段转换、能力调用、错误都发事件。

```typescript
// 标准频道
'mode.changed'         // AutoMode ↔ PlanMode
'proposal.generated'   // Proposal 产出
'review.decided'       // ReviewGate 决策
'task.queued' / 'task.started' / 'task.completed' / 'task.failed'
'step.think' / 'step.act' / 'step.observe'
```

**能力侧**：return 结果即可，框架自动 emit 事件。

### 6.3 TaskManager（任务管理）

**职责**：长短任务统一入口，异步任务托管。

**代码命名**：`TaskManager`（`packages/neko-agent/packages/agent/src/task/
task-manager.ts`）。ADR 早期版本写作 "TaskQueue" 是功能描述性命名；代码
落地时选择 `TaskManager` 以反映职责广度（除入队出队，还负责 persistence、
recovery、并发池、清理策略）。文档与代码自 2026-04-22 起统一使用 `TaskManager`。

```typescript
interface ITaskManager {
  submit(input: TaskInput): Promise<string>;          // 返回 taskId
  get(id: string): Promise<Task | undefined>;
  cancel(id: string): Promise<void>;
  list(status?: TaskStatus): Promise<Task[]>;
  onProgress(id: string, callback: ProgressCallback): void;
  waitForCompletion(id: string, timeoutMs?: number): Promise<Task>;
}

// 自动判定
Operation.execute() →
  短任务（< 1s）: 同步返回
  长任务（> 1s）: 返回 taskId，后台执行
```

**TodoList 是 TaskManager 的 UI 投影**（AI 产出 MD，TaskManager 产出
JSONL 技术日志）。

**与 subagent/coordinator/task-pool 的区别**：task-pool 是 subagent
协作内部的**无状态派单池**（claim-based、依赖感知），专用于多 subagent
之间的工作分配，不是用户面向的异步任务 API。

### 6.4 RetryEngine（重试+自愈）

**职责**：五级自愈链条统一实现。

```
级别 1: 原样重试（指数退避）
级别 2: 参数降级重试
级别 3: 工具替代
级别 4: Subagent 诊断
级别 5: 升级用户
```

**目标**：80%+ 技术错误在级别 1-4 自愈，级别 5 频率 ≤ 5%。

### 6.5 StageTracker + StageGuardian（Skill 编排支持）

支持 Skill 内嵌 phases 声明的运行时执行（对齐 §5.4）。

#### StageTracker（轻量追踪器）

```typescript
interface StageTracker {
  current: StageInfo | null;
  history: StageInfo[];
  
  load(phases: SkillPhase[]): void;
  enter(stageName: string, metadata?: any): void;
  exit(success: boolean): void;
  inject(promptHint: string): void;  // 注入 stage 提示给 Agent
}
```

**职责极简**：
- 追踪当前 stage
- 发布 stage.* 事件（EventBus）
- 按需注入 prompt

**不做**：DAG 解析 / 依赖管理 / 并发调度（不是重型编排器）

#### StageGuardian（巡检器）

```typescript
interface StageGuardian {
  check(skill: Skill, state: AgentState): GuardResult;
  autofix?(issue: StageIssue): void;
}

type StageIssue =
  | 'stage-not-entered'      // Agent 未进入声明的 stage
  | 'approval-skipped'        // 跳过了声明的审批点
  | 'stage-timeout'           // stage 超时
  | 'out-of-order';           // stage 顺序违反声明
```

**触发时机**：
- Step 执行前后
- Stage 进入/退出
- 定期 tick（长任务）

**作用**：**安全兜底**，确保 Agent 遵循 Skill 声明（关键审批点由 L0 强制插入 ReviewGate）。

#### 分工原则

```
Skill（声明）     ──► phases + pipelines
       │
       ▼
Agent（执行）     ──► 读声明 + 按序执行 + 决策
       │
       ▼
L0（guardian）    ──► 巡检 + 注入 + 强制审批
```

**避免的反模式**：
- ❌ 全 AI 推进（LLM 幻觉导致 stage 错乱 + token 爆炸）
- ❌ 全程序推进（参数呆板 + 失败机械 + 无创作审美）
- ✅ 程序驱动流程 + AI 决策点注入智能

---

## 7. 产物格式原则（核心原则）

### 7.1 二分法（唯一规则）

```
看内容由谁产出？
  ├─ AI 产出（或人产出） → Markdown
  └─ 程序自动记录      → JSON / JSONL
```

**唯一例外**：协议强制格式（如 VSCode `package.json`）。

### 7.2 AI 拥有所有语义产物的所有权

**核心原则**：
- AI 产出的文件（含 frontmatter）**全部字段由 AI 写入**
- 程序**不直接修改** AI 产出的内容
- 程序只做 I/O（读写文件）、事件广播、索引构建、并发控制

**对比 Claude Code 的 TodoWrite**：
- Agent 调用 TodoWrite(完整新内容)
- 工具只负责落盘
- 程序不自主改 `status: pending → in_progress`

### 7.3 分类规则

#### AI 产出 → Markdown

SDD 三件套采用 `<kind>-<runId>.md` 前缀命名（2026-04-22 从 `.nk*.md` 扩展名迁移；收益：ls 输出按 kind 分组、普通 MD 编辑器零配置打开、Git diff 原生识别 YAML frontmatter）。其余非 SDD 核心产物保留原扩展名直至独立迁移。

| 产物 | 文件模式 |
|-----|--------|
| Draft | `drafts/draft-<runId>.md` |
| ExecutionPlan | `plans/plan-<runId>.md` |
| Task（用户可见清单）| `tasks/task-<runId>.md` |
| Session 摘要 | `sessions/session-<runId>.md` |
| Review Record | `.nkreview.md` |
| Status Report | `.nkstatus.md` |
| Skill / Persona | `.skill.md` |
| Spec | `.nkspec.md` |
| Workflow | `.nkworkflow.md` |
| Capability 声明 | `.nkcapabilities.md` |
| 文档 | `.md` |

**共同特征**：AI（或人）产出语义内容，AI + 人消费，低中频更新。

#### 程序产出 → JSON/JSONL

| 产物 | 文件模式 | 理由 |
|-----|--------|-----|
| Event Log | `events.jsonl` | 框架 emit，高频 append |
| Audit Log | `audits.jsonl` | ApprovalEngine 记录，合规/哈希链 |
| Step 原始日志 | `steps.jsonl` | Step 执行器采集，毫秒级 |
| Capability 索引 | `capability-index.json` | 从 MD 派生的查询缓存 |
| Draft 索引 | `draft-index.json` | 从 MD 派生的查询缓存 |
| Session Lock | `session-lock.json` | 并发控制 |

**共同特征**：代码逻辑产出，AI 不感知，程序消费或派生缓存。

#### 协议强制 → JSON

| 产物 | 格式 | 说明 |
|-----|-----|-----|
| VSCode Manifest | `package.json` | 协议要求 |

### 7.4 目录布局（修订版）

**重要修订**：核心产物精简为 3 个 + Session 扩展，**创作资产全部归 neko-assets + 媒体库管理**，不在 `.neko/` 内重复设计 assets 体系。

#### 项目工作区 `.neko/`（项目专属轻量产物）

```
.neko/
  preferences.md         ← 用户审批/模式偏好（项目级）

  drafts/                ← Draft 阶段 AI 产出
    draft-<runId>.md
  plans/                 ← Plan 阶段 AI 产出（技术命令式）
    plan-<runId>.md
  tasks/                 ← Plan 阶段 AI 产出（用户可见清单）
    task-<runId>.md

  sessions/              ← AI 产出（对话+任务上下文合并）
    session-<runId>.md
    _active.json         ← 程序维护当前活跃 session 索引

  logs/                  ← 程序产出（JSONL）
    events.jsonl
    audits.jsonl
    steps.jsonl

  cache/                 ← 程序派生（JSON，可重建）
    capability-index.json
    draft-index.json

  state/                 ← 程序并发控制
    session-lock.json

  settings.json          ← 媒体库变量（已有，PathResolver 使用）
  settings.local.json    ← 本地覆盖（已有）

  archives/              ← 可选：长任务叙事归档导出
    *.md
```

**移除项**：
- ❌ `assets/` — 由 neko-assets + 媒体库管理（见 §9）
- ❌ `reviews/` — Review 历史合并到 Draft frontmatter
- ❌ `statuses/` — Status 叙事合并到 Task 正文
- ❌ `skills/workflows/specs/capabilities/` — 由能力体系管理（见 §9）
- ❌ `proposals/` / `todos/` — 2026-04-22 重命名为 `drafts/` / `tasks/`
- ❌ `.nkproposal.md` / `.nkplan.md` / `.nktodo.md` — 同日迁移为 `<kind>-<runId>.md`

#### 媒体库 `${MEDIA_LIBRARY}/`（创作资产，跨项目共享）

由 neko-assets 子包管理，详见 §9：

```
${MEDIA_LIBRARY}/
  characters/            ← 角色资产
  styles/                ← 风格资产
  worlds/                ← 世界观资产
  media/                 ← 通用媒体
  loras/ presets/        ← 工程预设
  assets-manifest.json   ← AssetManifest（程序产出）
```

#### 全局用户目录 `~/.neko/`（跨项目偏好 + Agent 能力）

```
~/.neko/
  preferences.md         ← 全局用户偏好（项目级 fallback）
  skills/                ← 全局 Skill
  workflows/             ← 全局 Workflow
  pipelines/             ← 全局 Pipeline
```

#### Memory（保留现有，跨项目用户画像）

```
~/.claude/projects/.../memory/
  *.md
```

#### 协议强制

```
packages/*/package.json  ← VSCode 协议
```

#### 三层数据归属总览

| 数据类型 | 归属 | 管理方 |
|--------|-----|------|
| Proposal/Plan/Todo | 项目 `.neko/` | neko-agent |
| Session（对话+任务上下文）| 项目 `.neko/sessions/` | neko-agent |
| User Preferences | 项目 `.neko/preferences.md` + 全局 `~/.neko/preferences.md` | neko-agent（L0.ApprovalEngine 消费）|
| Character/Style/World | 媒体库 | **neko-assets** |
| Media（视频/音频/图像/3D）| 媒体库 | **neko-assets** |
| LoRA/Preset/Template | 媒体库 | **neko-assets** |
| Skill/Workflow/Pipeline | 全局 `~/.neko/` 或媒体库 | neko-agent（注册）+ neko-assets（存储）|
| Logs | 项目 `.neko/logs/` | 程序自动 |
| Cache | 项目 `.neko/cache/` | 程序自动 |
| User Memory | 全局 memory/ | Claude 内置 |

### 7.5 Frontmatter 设计原则

**Frontmatter 是 AI 产出的结构化摘要**，不是"程序私有字段区"。

```markdown
---
# 所有字段由 AI 写入
id: cut-tiktok-001
kind: proposal
status: pending_review     ← AI 反映当前状态
domain: cut
createdAt: 2026-04-20T10:00:00Z
---

# 方案正文...
```

**Frontmatter 最小化**：只含索引必要字段（id/kind/status/domain/时间戳），业务内容走正文。

**时间戳特殊处理**：文件 `updatedAt` 优先用文件系统 mtime（程序级元数据），避免让 AI 写易错。

### 7.6 派生关系与引用关系

#### 派生关系（MD 事实源 → JSON 缓存）

```
capabilities/cut.nkcapabilities.md  (AI/人产出，事实源)
  ↓ 启动期扫描
cache/capability-index.json         (程序构建，可重建)
```

#### 引用关系（AI 产物引用程序产物）

```
AI 产出：todo.md 含 "Shot 3 耗时 15s"
   ↓ AI 通过工具读取
程序产出：steps.jsonl 含 { stepId: 'step-42', duration: 15000 }
```

**AI 读取程序产物作为输入，AI 在 MD 中产出结论**。程序不自动插入 MD 字段。

### 7.7 按需生成（JSONL → MD 摘要）

对合规/人类消费场景，程序产物可按需聚合为 MD：

```
audits.jsonl     (事实源，程序产出)
  ↓ AI 聚合
audit-report-2026-Q2.md  (按需生成，供人审阅)
```

**原则**：事实源不变，按需生成派生物，不影响二分法。

---

## 8. 创作资产（neko-assets 集成）

### 8.1 定位

**创作资产统一由 neko-assets 子包 + 媒体库管理**，不在 `.neko/` 内重复设计资产体系。

这与 CLAUDE.md 记忆中的 AssetManifest + PathResolver 设计完全契合，改动最小（只需扩展 AssetType 枚举）。

### 8.2 AssetType 扩展

```typescript
type AssetType =
  // 媒体素材（已有）
  | 'video' | 'audio' | 'image' | 'model-3d' | 'font'
  // 创作设定
  | 'character' | 'style' | 'world' | 'mood-board'
  // 工程素材
  | 'lora' | 'preset' | 'template'
  // Agent 能力资产（简化后：仅 Skill，Workflow/Pipeline 内嵌 Skill）
  | 'skill';
```

**重大简化**：移除独立的 `workflow` / `pipeline` AssetType，它们作为 Skill frontmatter 字段存在，不独立分发（见 §5.2）。

### 8.3 媒体库布局

```
${MEDIA_LIBRARY}/                    ← 用户配置的媒体库根
  ├─ assets-manifest.json            ← 全局清单（neko-assets 维护）
  │
  ├─ characters/                     ← 角色资产
  │   └─ {character-id}/
  │       ├─ profile.nkcharacter.md  ← AI 生成的设定
  │       ├─ portrait.png            ← 立绘
  │       └─ voice-samples/          ← 音色参考
  │
  ├─ styles/                         ← 风格资产
  │   └─ {style-id}/
  │       ├─ profile.nkstyle.md
  │       └─ reference-board.png
  │
  ├─ worlds/                         ← 世界观资产
  ├─ media/                          ← 通用媒体
  ├─ loras/ presets/                 ← 工程预设
  └─ shared/                         ← 跨项目共享空间
```

**关键**：一个资产 = 一个目录（MD 设定 + 富媒体），按类型分目录（不按项目）。

### 8.4 asset:// URI 引用机制

SDD 产物通过 **asset:// URI** 引用资产，不内嵌素材：

```markdown
<!-- drafts/draft-001.md -->
---
id: draft-001
kind: draft
referenceChain:
  - asset://characters/hero
  - asset://styles/cyberpunk
  - asset://worlds/sci-fi-2099
---

## 主角
@asset://characters/hero

## 风格基调
@asset://styles/cyberpunk
```

**优势**：
- 项目内只存引用（轻量）
- 实际素材在媒体库（外部）
- 多项目可共享同一角色
- Git diff 只看引用变化

### 8.5 路径解析

通过 `@neko/shared` 的 PathResolver 解析：

```
asset://characters/hero
  ↓ PathResolver.resolve()
${MEDIA_LIBRARY}/characters/hero/
  ↓ 展开变量（从 .neko/settings.json 读取 MEDIA_LIBRARY）
/Users/{user}/MyNekoLibrary/characters/hero/
```

### 8.6 neko-assets 公开接口

供 neko-agent、neko-cut 等其他子包消费：

```typescript
interface AssetService {
  // 生命周期
  create(spec: AssetSpec): Promise<AssetUri>;
  update(id: string, content: AssetContent): Promise<void>;
  delete(id: string): Promise<void>;
  
  // 查询
  list(filter?: AssetFilter): Promise<Asset[]>;
  search(query: string): Promise<Asset[]>;
  resolve(uri: AssetUri): Promise<LocalPath>;
  
  // 关系
  getReferences(id: string): Promise<string[]>;   // 谁引用了这个资产
  getDependencies(id: string): Promise<string[]>; // 这个资产引用了什么
}
```

### 8.7 AI 协作协议

**AI 不直接操作媒体库文件**，统一通过 AssetService API：

```
AI 创建角色设定:
  1. AI 产出 .nkcharacter.md 内容
  2. 调用 assetService.create({ type: 'character', id: 'aria', content, attachments })
  3. 返回 asset://characters/aria URI
  4. AI 在 Proposal 中引用该 URI

AI 引用角色:
  1. assetService.search('aria') → asset://characters/aria
  2. assetService.resolve(uri) → 实际路径
  3. AI 把设定内容注入 Proposal/Plan 上下文

AI 更新角色:
  1. 读取现有 .nkcharacter.md
  2. AI 产出更新版本
  3. assetService.update(id, newContent)
  4. neko-assets 维护版本 + 更新 AssetManifest
```

### 8.8 边界情况处理

| 场景 | 归属 | 理由 |
|-----|-----|-----|
| AI 生成的 12 候选图，用户只选 1 张 | 选中的 → 资产；未选的 → 临时 | 默认不归资产避免污染媒体库 |
| 一次性创作元素（某 TikTok 视频专用字卡）| 任务工作区临时 | 无复用价值 |
| 用户上传的参考图（mood-board）| 媒体库 | 用户上传即有保留意图 |
| 长任务叙事（渲染过程） | TodoList 正文 | 非独立资产，单任务记录 |
| 用户主动"提升"为正式资产 | 媒体库 | 用户显式决策 |

### 8.9 职责边界

```
neko-assets:         创作资产生命周期管理（存储/版本/索引/UI）
neko-agent:          Agent 能力注册 + SDD 产物（Proposal/Plan/Todo）
neko-market:         资产分发（安装到媒体库由 neko-assets 接管）
@neko/shared:        PathResolver 路径解析，AssetManifest 类型定义
```

**三方分工**：
- neko-assets 管**物理存储 + 元数据**
- neko-agent 管**能力注册 + 任务流程**
- neko-market 管**分发与安装**

### 8.10 neko-market 简化分发模型

**重大简化**：market 只分发两类：

```
Tier 1: Skills（主分发单位，100% 场景）
  - 创作域 Skills（cut-editor / story-writer / puppet-rigger / ...）
  - 营销域 Skills（tiktok-marketer / linkedin-writer / ...）
  - 工程域 Skills（code-reviewer / test-generator / ...)
  - 自包含：人格 + 编排（phases）+ 加工链（pipelines）+ 引用资产

Tier 2: Assets（辅助，被 Skill 引用）
  - 角色设定（character）
  - 风格板（style）
  - 世界观（world）
  - LoRA / Preset / Template
  - 可独立下载，也可被 Skill 自动拉取依赖
```

**删除的分发类目**：
- ❌ 独立 Workflow 包（内嵌 Skill）
- ❌ 独立 Pipeline 包（内嵌 Skill）
- ❌ 独立"插件"（合并到 Skill）
- ❌ 多粒度 bundle（简化为 Skill 单文件 + Asset）

**用户心智**：
```
当前（简化后）:
  用户想做 TikTok 视频 → 下载 tiktok-creator Skill（一个概念）
  Skill 自带所需编排 + 引用资产 + 默认 pipeline

对比（复杂设计）:
  用户需要下载 cut-editor 插件 + tiktok-15s Workflow
  + tiktok-export Pipeline + preview Pipeline + cyberpunk Style
  （5 个不同概念，用户困惑）
```

**设计原则**：极简分发粒度，用户心智清晰为 "Skill 读书 / Asset 买素材"。Skill 自包含可直接运行，不依赖外部 Workflow/Pipeline 额外下载。

---

## 9. 审批治理与用户偏好

### 9.1 审批对象差异化

**不应一刀切"审批所有产物"**，应按决策意义差异化：

| 审批对象 | 默认审批 | 可用户调整 | 审批主体 | 理由 |
|--------|--------|---------|--------|-----|
| **Proposal（创作编排）** | ✅ 是（PlanMode/AutoMode 非简单任务）| ✅ 可设为总是/从不 | 用户 | 业务方向决策，必须确认 |
| **ExecutionPlan（执行计划）** | ❌ 不审批（可选查看）| ✅ 可设为强制查看 | - | 技术细节用户通常看不懂 tool call |
| **TodoList（任务清单）** | ❌ 不审批（支持查看/干预）| ✅ 可设为强制确认 | - | 进度投影，无决策意义 |
| **Operation L1 critical**（不可逆）| ✅ 强制，不可跳过 | ❌ 不可降级 | 用户 | 架构层安全兜底 |
| **Operation L2 costly**（高成本）| ✅ 按阈值触发 | ✅ 可调阈值 | 用户/策略 | 可由用户设阈值 |
| **Operation L3 normal**（低风险可逆）| ❌ 免审批 | ✅ 可提升到审批 | - | 默认不打扰 |

### 9.2 审批粒度三级模型

```
Level 1 Critical（强制，不可跳过）:
  - reversible: false 且 cost high
  - 发布/推送到外部平台
  - 覆盖/删除已有资产
  - 任何模式下都要审（L0 强制）

Level 2 Costly（默认阈值触发）:
  - token / 时间 / API 成本超用户阈值
  - 批量操作（> N 次）
  - 用户可调阈值或禁用

Level 3 Normal（默认免审批）:
  - reversible: true 且 cost low
  - 预览/只读操作
  - 单步原子动作
```

### 9.3 用户偏好声明（preferences.md）

**设计哲学**：审批规则应是**用户可读可写的 MD 声明**，而非设置面板 JSON。

#### 9.3.1 两层 Preference 文件

```
项目级: .neko/preferences.md            (项目专属规则)
全局级: ~/.neko/preferences.md          (跨项目默认)

继承规则: 项目级覆盖全局级（类似 tsconfig 继承）
```

#### 9.3.2 preferences.md 结构

```markdown
---
kind: user-preferences
scope: project           # or global
version: 1
---

# 我的创作偏好

## 审批规则

### 始终审批（架构层强制外追加）
- 任何 4K 或更高分辨率导出
- 任何超过 10 分钟的渲染任务
- 任何发布到外部平台的操作

### 免审批
- 音量/亮度等可逆调整
- 预览渲染（低分辨率）

### 成本阈值
- 单次 token 消耗 > 50,000 → 审批
- 单次 API 成本 > $5 → 审批
- 单任务时长 > 30 分钟 → 审批

## 默认模式
AutoMode

## 默认 Skill
- cut-editor（做剪辑时自动激活）

## 默认 Workflow
- tiktok-15s（短视频模板）

## Proposal 审批偏好
- 提供至少 2 个方案候选
- 允许 fork 分叉探索

## Plan 审阅
- 强制查看（不自动跳过）

## 通知偏好
- 长任务每 5 分钟推送进度
- 失败时立即通知
```

#### 9.3.3 生效机制

```
用户编辑 preferences.md
  ↓ 保存
neko-agent 启动期读取（全局 + 项目级合并）
  ↓ 解析 frontmatter + 正文规则
L0.ApprovalEngine 接收为策略包
  ↓
所有审批决策按用户规则执行
```

### 9.4 审批设计原则

1. **审批粒度与决策意义对称** — 只审有决策意义的对象
2. **审批可加强但不可降级** — critical 级强制审批不可被用户禁用
3. **审批声明式可读** — MD 优于 JSON 设置面板
4. **审批分层叠加** — 全局 → 项目 → 任务三层继承

### 9.5 不同创作者画像示例

**严格创作者**：所有动作审批、PlanMode 默认、多方案对比
**高效创作者**：只审高危、AutoMode 默认、自动跳过 Plan
**企业团队**：发布需两人审批、成本 > $50 需经理审批、审计保留 90 天

详细示例见 附录 C。

### 9.6 Skill 作为合规审计载体

**核心洞察**：Skill 天然适合创作工具的合规审计，比传统 DSL 更适合 AI 原生场景。

#### 合规审计可行性

| 审计需求 | Skill 方案 |
|---------|---------|
| 规则可追溯 | Skill MD 文件 + Git 版本 |
| 规则人可读 | ✅ 天然可读（自然语言 + YAML frontmatter）|
| 规则版本化 | Git |
| 执行记录 | JSONL 日志（events/audits/steps）|
| 证据链 | `audits.jsonl.skillSha` 链接 Skill 版本 ↔ 执行日志 |
| 审计员友好 | ✅ 直接读 MD 理解规则 |
| 可质询 | ✅ 指向 Skill 具体段落 + Agent 对话式解释 |

#### Skill 合规 Frontmatter 字段

```markdown
---
id: enterprise-tiktok-creator
kind: skill
version: 1.0.0

# 合规元数据
compliance:
  framework: SOC2              # 合规框架
  auditRequired: true
  reviewedBy: [legal, security]
  reviewDate: 2026-04-01

# 审批规则（合规核心）
approvalRules:
  - name: 高成本操作
    condition: cost > 200
    require: humanApproval
    reason: 2026 Q1 财务制度要求
  - name: 发布操作
    condition: type == publish
    require: humanApproval
    reason: 合规要求不得自动发布
  - name: 跨境数据
    condition: tool matches /.*cross-border.*/
    require: humanApproval
    reason: GDPR 合规

# 审计字段
audit:
  logLevel: detailed
  retention: 90d
  fields: [userId, cost, decision, reason]
---
```

#### 执行时的审计行为

```
Agent 执行 Operation 时:
  1. 读取当前 Skill 的 approvalRules
  2. 匹配规则 → 触发 L0.ApprovalEngine 强制审批
  3. 决策记录到 audits.jsonl:
     {
       "t": "2026-04-15T10:30:00Z",
       "op": "cut.export-4k",
       "cost": 150,
       "decision": "auto-approved",
       "skillId": "tiktok-creator",
       "skillVersion": "1.0.0",
       "skillSha": "abc123...",         ← 规则快照
       "rule": "high-cost-operation",
       "reason": "threshold $200 not exceeded"
     }
```

#### 审计证据链

```
审计员查询决策 X 是否合规
  ↓
读 audits.jsonl 找到 X 的记录
  ↓
读取 skillSha 对应的 Git 版本
  ↓
展示当时生效的 Skill 规则
  ↓
对比规则与执行，判断合规
```

**完整可追溯**：规则快照 + 执行记录 + 决策理由。

#### 审计导出

```
命令: /audit export --from 2026-04-01 --to 2026-04-30

输出: audit-report-2026-04.md
  - 审计期内所有决策
  - 每个决策指向的 Skill 规则
  - 不合规项（如有）
  - 统计摘要
```

**MD 格式**便于发给审计员/管理层。

#### 适用边界

| 场景 | 适用度 | 说明 |
|-----|-----|-----|
| 创作工具合规（SOC 2 等）| ✅ 适用 | 80% 企业场景 |
| 业务合规（财务/法务制度）| ✅ 适用 | 阈值 + 触发规则够用 |
| 团队协作规范 | ✅ 适用 | 审批流程清晰 |
| 极严格金融合规 | 🟡 需补充 | 可能需传统 DSL 配合 |
| 医疗/制药严格合规 | 🟡 需补充 | 同上 |

**关键**：**P0 Skill 审计覆盖 80% 企业场景**，严格场景在 P2 可补充传统 DSL。

---

## 10. 命令与术语一致性原则

**状态变更（2026-04-22）**：本章早期版本（v1）提出"术语双轨分层"——
架构协议层保留英文工程术语，UI 呈现层走中文创作者术语 + 双名
slash（`/specify` 与 `/构思` 并存）。**经实施评审，双轨方案被放弃**，
改为本章当前版本（v2）的**统一命令原则**。v1 内容作为历史记录保留
在 §10.7。

### 10.1 核心原则：命令一致性优先于本地化

**一套术语，一套命令**——架构协议层与 UI 呈现层共用同一个英文名字。
这比本地化更有价值：

- **一致性**：用户、文档、日志、代码、AI prompt 引用同一个标识符，
  不会出现"文档说 Specify、UI 说构思、日志写 specify"的三重表达
- **可教学性**：新用户学一次命令就够，不用在中文 slash 和英文 slash
  之间切换；AI 文档示例能直接复制到 UI 执行
- **可搜索性**：bug 报告、社区讨论、Git commit 引用的命令名与 UI 中
  看到的完全一致，降低跨语境协作摩擦
- **零翻译维护**：无需维护 CreatorTerms 映射表、无需处理术语演进时
  的双向同步、无需为新语言重复实现

### 10.2 权威命令表

SDD stage slash 命令在 AutoMode 下**由 §3.2 入口判定规则自动选择**，
用户通常不需要显式命令；仅 PlanMode 显式切换命令公开：

| 功能 | 命令 | 说明 |
|-----|-----|-----|
| 切换到 PlanMode | `/plan` | 强制走完整 SDD 3 阶段（§3.1）|
| 展开 Skill | `/<skill-name>` | 通过 `Skill.command` 字段注册 |
| 引用已有产物 | `@draft-<id>` / `@plan-<id>` / `@task-<id>` | §3.2 规则 2，在 AutoMode 下触发对应阶段继续 |

**无单独的 `/draft` `/apply` slash**——这些是 SDD**阶段**（stage），
不是命令。它们由 StagePlanner 根据用户输入自动判定（§3.2 六条规则），
从而保持"一个意图，一个 slash"的心智简单。
PlanMode 下也由 §4.1 强制从 Draft 起步，不需要用户手动命令。

### 10.3 工程术语表（唯一标识符集合）

代码、日志、文档、UI、API 统一使用以下英文术语：

| 概念 | 术语 | 用途 |
|-----|-----|-----|
| SDD 阶段 | `Draft` / `Plan` / `Apply` | 阶段名（2026-04-22 从四阶段简化）|
| 产物（声明式）| `Draft` | Draft 阶段产出，业务目标 |
| 产物（命令式）| `ExecutionPlan` | Plan 阶段产出，tool call 列表；类型字段 `draftId` 指向源 Draft |
| 产物（清单）| `Task` | Plan 阶段派生，进度投影（原 `TodoList`） |
| 模式 | `AutoMode` / `PlanMode` | L3 模式档位 |
| 动作 | `approve` / `reject` / `refine` / `fork` | Review 决策动词 |

**禁止**：
- ❌ 双名 slash command 注册（`/specify` 与 `/构思` 并存）
- ❌ `CreatorTerms` 之类的术语映射表
- ❌ UI 层使用与代码层不同的显示名（"规划模式" vs "PlanMode"）

**允许**：
- ✅ 用户消息气泡、错误提示等**自由文本**内容按用户语言书写（这是
  内容，不是命令 / 术语）
- ✅ 文档正文说明可以用中文解释 Draft 做什么，但"Draft"这个
  **词本身**始终以英文出现

### 10.4 文件命名约定

SDD 三件套采用 `<kind>-<runId>.md` 前缀方案（`draft-`、`plan-`、`task-`），
`.md` 是唯一扩展名。原 `.nkproposal.md` / `.nkplan.md` / `.nktodo.md`
扩展名方案已于 2026-04-22 废止。命名不本地化，跨系统兼容性优先。

### 10.5 未来国际化（若启用）的边界

如果未来确有非汉语用户群体需要，**只本地化自由文本**（按钮提示、
错误文案、帮助说明），命令名与术语仍然保持英文。这与 VSCode、Git、
npm 的做法一致：命令永远是英文，翻译只改描述。

### 10.6 与 §3 的交叉约束

ADR §3.1 "AutoMode / PlanMode 两档" 表格中 PlanMode 触发方式一栏
曾写 `/构思` / `/plan`。该行在本章修订后应理解为：**仅 `/plan`**。
`/构思` 不会被注册。修订点在本轮提交中同步到 §3.1。

### 10.7 历史记录：v1 双轨分层（已废弃）

v1 原提议内容如下，**不再实施**，仅作决策追溯：

> 原 §10.1 分层原则：
> - 架构协议层（代码/Schema/ADR/文件扩展名）：保留工程术语对齐业界
> - UI 呈现层（slash command/按钮/标签/消息）：使用创作者母语术语降低心智负担

---

## 11. 轻量化设计原则

### 11.1 设计哲学

**"AI 是最强的编排执行器"** — 传统 DSL 为程序服务，Skill 为 AI 服务。

传统 Workflow 引擎（Airflow/Temporal/n8n）需要 DSL + 解析器 + 调度器是因为执行器是**确定性程序**不懂自然语言；AI Agent 可以**直接读自然语言编排指令执行**，不需要独立 DSL 层。

### 11.2 核心四大优势

#### 优势 1: 创作者直接理解和编写

- Skill 是 MD + YAML frontmatter
- 门槛低，创作者**一看就懂**
- 可**自己编辑**（修改默认参数 / 加新阶段）

**对比**：传统 Workflow DSL 学习曲线高，创作者望而却步。

#### 优势 2: 提高 Skill 丰富度

驱动因素：**门槛低 → 产出多**。

```
门槛低:
  - 创作者自己写 Skill，不需程序员介入
  - 模仿现有 Skill 改造

丰富度高:
  - 社区贡献多
  - market Skill 数量快速增长
  - 长尾需求被覆盖
```

**对比**：传统 Workflow 分发生态难以形成。

#### 优势 3: 方便共享

- 单文件 `.skill.md`（+ frontmatter 引用的 assets）
- Git / 邮件 / 链接任意分享
- 无复杂依赖链

**对比**：传统 Workflow 可能依赖多个 Pipeline + Custom Operation + Config，分享不便。

#### 优势 4: 方便 AI 理解和调整

**最核心的优势**。

```
AI 读取 Skill:
  - 自由文本 → 人格 / 话术 / 解释
  - Frontmatter → 结构化约束
  - 两者结合 → AI 完整理解

AI 调整 Skill:
  - 基于用户反馈自动修改
  - 基于数据自动优化阈值
  - 协助用户生成新 Skill
```

**典型场景**：

```
用户: "我觉得最近导出总失败，帮我调整 Skill"

Agent:
  1. 读取 tiktok-creator.skill.md
  2. 查询 audits.jsonl 找导出失败原因（OOM 多）
  3. 修改 Skill 的 export pipeline 默认分辨率: 4K → 1080p
  4. 说明修改理由
  5. 用户审批 Skill 修改
  6. 保存新版本（Git 记录）
```

**AI 可以自行维护 Skill**，这是传统 DSL 做不到的。

### 11.3 轻量化 vs 重型设计对比

| 维度 | 重型设计（已放弃）| 轻量化设计（当前）|
|-----|-------------|-----------|
| L1 能力 kind 数 | 10+ | 3（Skill/Tool/Operation）|
| market 分发类目 | 6+ | 2（Skills/Assets）|
| 独立文件体系 | Workflow + Pipeline + Skill | 只有 Skill |
| 用户心智负担 | 高（需学多种概念）| 低（只学 Skill）|
| 创作者编辑门槛 | 高（需学 DSL）| 低（会 MD 就行）|
| AI 调整难度 | 高（编辑 DSL 易错）| 低（编辑 MD 自然）|
| 社区贡献门槛 | 高 | 低 |
| 合规审计可行性 | 中（需开发审计系统）| 高（Skill 自然支持）|
| 代码量 | 多 | **少（预计降 70%）**|

### 11.4 按需升级路径（再次强调）

```
P0（当前）: Skill 内置轻量声明式
  - 覆盖 90% 需求
  - 0 额外复杂度

P1（有复用需求时）: 抽取共享 Pipeline 文件
  - 多 Skill 引用同一 pipeline
  - 引入 pipeline:// URI

P2（市场需求时）: 独立 Workflow 文件
  - 第三方分享编排模板
  - neko-market 扩展

P3（企业需求时）: 严格 DSL + Schema 校验
  - 金融/医疗合规
  - 精确重放
```

**关键**：**每一步由真实需求驱动**，不 pre-build。当前信号都没触发，停留 P0。

### 11.5 轻量化设计的不变原则

即使未来升级到 P1-P3，以下核心不变：

1. **Skill 始终是场景包入口**（不被 Workflow/Pipeline 替代）
2. **AI 原生执行**（DSL 只是 AI 的输入，不是独立调度器）
3. **MD + Frontmatter 格式**（人机共读，AI 可改）
4. **market 以 Skill 为核心**（不碎片化分发）

---

## 12. 典型场景端到端走查

### 12.1 简单任务（AutoMode 快路径）

```
用户：把 BGM 调高 3dB

[AutoMode 判定: 原子指令 → 直接 Apply]
  Step:
    think: 单步可逆 Operation
    act: 调用 audio.adjust-gain(+3)
    ↓ L0 自动:
      - ApprovalEngine: 免审（reversible=true）
      - EventBus: emit 'step.completed'
      - steps.jsonl: append Step 日志

用户看到：完成。
不产出：Draft/Plan/Task（简单任务跳过）
```

### 12.2 中等任务（自动升级）

```
用户：生成 3 张海报变体

[复杂度评估 → 升级 PlanMode]

  Draft:
    AI 产出 Draft → drafts/draft-poster-001.md
    ↓ ReviewGate: L0 判定低风险自动通过

  Plan:
    AI 编译 ExecutionPlan → plans/plan-poster-001.md
    [call image.gen × 3]
    AI 调用 TaskWrite 同轮派生 → tasks/task-poster-001.md
    - [ ] 生成变体 1
    - [ ] 生成变体 2
    - [ ] 生成变体 3

  Apply:
    逐 task 执行，L0:
      - TaskManager 管理
      - RetryEngine 处理失败
      - EventBus 广播进度 → events.jsonl
      - steps.jsonl 记录每步

    AI 每步后调用 TaskWrite 更新 task.md

用户看到：Draft（MD 渲染）→ 进度条 → 3 张图
```

### 12.3 复杂任务（用户显式 /plan）

```
用户：/plan 帮我做 TikTok 视频

[PlanMode 显式激活]

  Draft:
    AI 调用 orchestration-skill 引导发问
    AI 产出 Draft → drafts/draft-tiktok-001.md
    （含 3 个风格方向）
    ↓ ReviewGate 等待用户审批

用户：选方向 2，refine 时长改 20s
    AI 更新 Draft（status: refined）
    ↓ ReviewGate 再次审批
用户：确认

  Plan:
    AI 编译 → plans/plan-tiktok-001.md
    [12 shots + BGM + subtitles]
    TaskWrite → tasks/task-tiktok-001.md

  Apply:
    逐 task 执行
    Shot 5 失败（OOM）
      ↓ L0.RetryEngine 级别 2 降分辨率 → 成功
      ↓ events.jsonl: task.failed + task.recovered
      ↓ AI 调用 TaskWrite 更新 task.md（追加失败叙事）

用户看到：Draft 审批 → 进度条 → 最终视频
```

### 12.4 高风险任务（自动拦截）

```
用户：导出 4K 视频

[costProfile = { reversible: false, time: hours } → 强制 PlanMode]

  Draft:
    AI 产出 Draft（导出配置）
    ↓ ReviewGate: L0.ApprovalEngine 强制人工审批

用户：确认导出

  Apply:
    Apply 前再次 Approve（双重审批：Draft 级 + Apply 级）
    L0.TaskManager 长任务模式
    L0.EventBus 每分钟广播进度

用户看到：审批确认 → 长进度 → 完成通知
```

---

## 13. 与业界的对照

| 特征 | Speckit | Claude Code | Cursor | neko-suite 整合架构 |
|-----|---------|------------|--------|-----|
| 默认模式 | 总 SDD | 灵活（/plan）| 直接 | **AutoMode 默认** |
| 结构化入口 | /specify | /plan | - | **/plan 显式 + 自动升级** |
| 流程阶段 | 4 阶段 | 灵活 | 灵活 | **3 阶段 Draft/Plan/Apply（合并原 Plan+Tasks；Plan/Apply 对齐 Terraform）** |
| 能力架构 | 模板驱动 | 工具注册 | 工具注册 | **扁平能力池 + 注册协议** |
| 审批 | 无 | Permission | 无 | **L0 默认提供** |
| 事件 | 无 | 有 | 有 | **L0 默认提供** |
| 任务管理 | 无 | TodoWrite | 无 | **L0 TaskManager + AI TaskWrite** |
| 重试 | 无 | 有 | 有 | **L0 五级自愈** |
| 产物格式 | 全 MD | MD + JSON | MD + JSON | **二分：AI→MD / 程序→JSON** |

---

## 14. 与早期探索的差异

### 10.1 放弃的设计

| 早期设计 | 放弃原因 |
|--------|--------|
| 外环 5 阶段（Orchestration/Proposal/Review/Execution/Status）| 无真实需求验证，业界共识 2-4 阶段 |
| 创作流 vs 执行流双流术语 | 对称美学诱导，实际是"条件激活的单一流程" |
| 四维概念（阶段/能力/Step/执行能力）| 过度抽象，实际是四层架构 + 二分格式 |
| 10 类能力分离注册 | 子包贡献心智负担高，扁平池更简洁 |
| 8 层防御机制 | market 未开放前是 pre-build 复杂度 |
| 三通道发现（manifest/command/fs）| 启动期统一扫描即可 |
| ProposalKind / ReviewStrategy / OrchestrationSkill 多类分离 | 合并到扁平 capability kind 枚举 |
| Plan/TODO/Approve/Apply 四机制原语 | Plan/ExecutionPlan 拆分，Approve/Apply 下沉 L0 |
| AI + 程序协作产出同一文件 | 概念错误，AI 完全拥有语义产物所有权 |
| Frontmatter 作为"程序私有字段区" | 概念错误，Frontmatter 是 AI 产出的结构化摘要 |

### 10.2 保留的设计

| 早期设计 | 保留方式 |
|--------|--------|
| L1 原语对齐业界（Claude Code / Terraform / ReAct）| 保留，体现在 L2 流程和 L1 能力 |
| 单引擎 + 双策略包 | 保留为 L0.ApprovalEngine 实现 |
| 五级自愈链条 | 保留为 L0.RetryEngine 实现 |
| 分级懒加载（LoadingTier）| 保留，用于 L1 能力按需加载 |
| AgentCapabilityProvider 注册模式 | 保留并扩展为统一 capabilities 协议 |
| TOOL_NAMES 常量 SSOT | 保留，用于命名空间规范 |
| TodoList 概念 | 保留为 AI 产出 MD（2026-04-22 重命名为 Task，落盘为 `task-<runId>.md`）|
| ReviewGate 概念 | 保留为特殊 L1 能力 |

---

## 15. 模块落位

```
@neko/shared/types/
  capability.ts              统一能力接口（kind 枚举）
  artifact-format.ts         格式规范（MD frontmatter schema）
  nkv/                       Format SDK（扩展支持 .md + frontmatter）

neko-agent/packages/agent/services/
  mode-manager.ts            L3 模式切换
  sdd-orchestrator.ts        L2 PlanMode 3 阶段编排（Draft/Plan/Apply）
  step-executor.ts           L2 Step 循环（AutoMode 快路径 + Apply 阶段）
  capability-registry.ts     L1 扁平能力聚合
  approval-engine.ts         L0 单引擎双策略包
  event-bus.ts               L0 统一事件
  task-manager.ts            L0 任务管理（含 TaskWrite 工具）
  retry-engine.ts            L0 五级自愈

neko-agent/packages/agent/tools/core/
  task-write-tool.ts         AI 工具（落盘 `tasks/task-<runId>.md`，原 TodoWriteTool）
  draft-write-tool.ts        AI 工具（落盘 `drafts/draft-<id>.md`，原 ProposalWriteTool）
  plan-write-tool.ts         AI 工具（落盘 `plans/plan-<id>.md`）

第一方子包（示例 neko-cut）:
  extension/src/
    capabilityProvider.ts    统一 Capability 贡献（扁平数组）
  package.json
    contributes.neko.capabilities: [...]
    contributes.neko.capabilitiesDoc: ./capabilities.md
  capabilities.md            详细能力文档（AI/人消费）
```

---

## 16. 分阶段推进

| 阶段 | 动作 | 验收 |
|-----|-----|-----|
| **P0（现在）** | 本 ADR 评审；早期两份 ADR 标注为"设计探索" | 文档体系清晰 |
| **P1（3 周）** | L0 基础设施重构（PermissionManager → ApprovalEngine 等）| 四大基础设施单测通过 |
| **P1（并行）** | 格式层：`.nk*.md` 编解码 + frontmatter schema linter | Proposal/Plan/TodoList MD 化 |
| **P2（4 周）** | L3 模式切换 + L2 SDD 4 阶段 | 端到端 PlanMode 走通 |
| **P3（4 周）** | L1 扁平能力池 + neko-cut 示范迁移 | neko-cut 按新协议贡献 |
| **P4（按需）** | 其他子包迁移（neko-story 优先）| 5 创作域覆盖 ≥ 80% |
| **P5（视情况）** | neko-market 扩展（Skill/Shader/Model）| market 分发就绪 |

**工程复用度**：
- PermissionManager / Pipeline 事件 / TodoList / 自愈策略：**已有代码保留 70%**
- 主要新增：模式切换、SDD 流程编排、MD 格式层
- 主要修改：能力注册协议统一、产物格式二分

---

## 17. 指标与验收

| 阶段 | 指标 | 阈值 |
|-----|-----|-----|
| P1 | 四大 L0 基础设施接入率 | 100%（所有能力调用走 L0）|
| P1 | MD 格式 schema 覆盖率 | 100%（11 类 AI 产物）|
| P2 | PlanMode 4 阶段端到端 | 典型任务跑通 |
| P2 | AutoMode 简单任务延迟 | < 3s（对比业界）|
| P3 | 能力贡献单包迁移时间 | < 1 天 |
| P4 | 5 创作域子包注册覆盖率 | ≥ 80% |
| L0 | 技术错误自愈率 | ≥ 80% |
| L0 | 级别 5 用户介入频率 | ≤ 5% |

---

## 18. 核心原则速查

### 14.1 架构原则

1. **四层职责正交**（Mode/Flow/Capability/Infra 各司其职）
2. **默认最短路径**（AutoMode 默认且能自动判定简单任务快路径，PlanMode 显式切换）
3. **对齐业界共识**（Speckit 4 阶段、Claude Code 模式切换、VSCode 扁平能力池）
4. **能力扁平注册**（子包单一 Provider 贡献，按 kind 区分）
5. **基础设施默认透明**（L0 对业务层透明接管）

### 14.2 格式原则

1. **AI 产出 → Markdown**（11 类文件）
2. **程序产出 → JSON/JSONL**（日志 + 索引 + 协议）
3. **AI 完全拥有语义产物所有权**（Frontmatter 也是 AI 写）
4. **Frontmatter 是结构化摘要，不是程序字段区**
5. **派生关系**：MD 事实源 + JSON 索引（可重建）
6. **引用关系**：AI 产物引用程序产物 ID，不交叉写入

### 14.3 声明式/命令式分层

1. **Proposal（声明式 What）**：用户审批对象，业务目标
2. **ExecutionPlan（命令式 How）**：Agent 自用，tool call 列表
3. **两层通过编译连接**：Agent 从 Proposal 编译 ExecutionPlan
4. **失败语义不同**：Proposal 失败 = 方向错（用户介入），Plan 失败 = 技术问题（自愈）

---

## 19. 反模式（禁止）

### 架构反模式
- ❌ 推翻 L3/L2/L1/L0 四层分工，让业务层处理基础设施
- ❌ 让 AutoMode 简单任务也跑完整 SDD 3 阶段（违背"默认最短"）
- ❌ 能力注册按 kind 分多个 contributes 片段（应合并为扁平数组）
- ❌ 让基础设施对业务层可见（L0 应透明）

### 格式反模式
- ❌ 程序直接修改 AI 产出的 MD 文件内容
- ❌ 把 Frontmatter 当作"程序字段区"设计协作模型
- ❌ 让 AI 产出 JSON/JSONL 状态（违背自然形态）
- ❌ 让程序产出 MD 文件（违背自然形态）
- ❌ 为高频日志（events/audits/steps）选 MD 格式
- ❌ 把 JSON 索引当事实源（应从 MD 派生重建）

### Plan 反模式
- ❌ 用"Plan"单独命名业务型产物（Plan 仅指 ExecutionPlan / `plan-<id>.md`，其业务意图由 Draft 承载）
- ❌ 让 Plan 承载业务语义（Plan 是纯命令式 tool call 列表）
- ❌ 让用户审批 Plan（审批对象是 Draft）

### 能力反模式
- ❌ 能力不声明 kind（无法按模式筛选）
- ❌ 能力不声明 costProfile（L0.ApprovalEngine 无法决策）
- ❌ Operation 不声明 reversible/idempotent（回滚链断）

---

## 20. 下一步行动

### 16.1 立即（本周）
1. 本 ADR 落盘评审
2. 在 [dual-flow-architecture.md](./dual-flow-architecture.md) 和 [capability-registration-and-distribution.md](./capability-registration-and-distribution.md) 头部加"已被简化版替代"标注
3. 协议草案：`@neko/shared/types/capability.ts` + `artifact-format.ts`

### 16.2 2 周内
1. L0 基础设施接口草案
2. MD frontmatter schema 定义（11 类 AI 产物）
3. 格式层单测覆盖

### 16.3 4 周内
1. P1 完成：L0 基础设施重构 + MD 格式层就位
2. P2 启动：L3/L2 模式和流程编排
3. neko-cut 开始按新协议迁移

---

## 21. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|-----|-----|-----|-----|
| PlanMode 3 阶段用户感觉繁重 | 低 | 中 | AutoMode 默认走快路径；PlanMode 仅显式切换；阶段从 4 缩减为 3 后更紧凑 |
| LLM 产出 frontmatter 错误 | 中 | 低 | Schema fail-soft + 自动修复 |
| 扁平能力池跨域冲突 | 低 | 中 | 强制命名空间（`{domain}.`）|
| L0 基础设施重构影响现有 Pipeline | 中 | 高 | 保留兼容层，渐进迁移 |
| MD 文件数量膨胀 | 低 | 低 | 按 session 分目录 + 归档策略 |
| 老 ADR 被误读为当前方案 | 高 | 中 | 头部明显标注 + 交叉引用 |

---

## 22. 变更历史

| 日期 | 变更 | 作者 |
|-----|-----|-----|
| 2026-04-20 | 初版 Proposed，整合早期双流 + 能力注册两份 ADR，采用四层架构 + 二分格式原则 | Architecture Team |
| 2026-04-20 | 修订：默认模式改为 AutoMode（DirectMode 降级为显式覆盖）；新增入口阶段判定 6 规则；产物精简为 3 核心 + Session；移除 `.neko/assets/`，归并到 neko-assets + 媒体库；新增 §8 创作资产、§9 审批治理 + preferences.md、§10 创作者术语分层 | Architecture Team |
| 2026-04-20 | 重大简化：L1 能力 kind 从 10+ 收敛为 3 核心（Skill/Tool/Operation），Workflow/Pipeline 内嵌到 Skill frontmatter（phases+pipelines 字段），AI 原生执行通过 L0.StageTracker/Guardian 注入+巡检；neko-market 简化为 Skills+Assets 两类分发（对齐 Claude Skills 生态）；§9.6 新增 Skill 作为合规审计载体（skillSha 证据链）；§11 新增轻量化设计原则（创作者易写/丰富度高/共享简单/AI 可维护）；代码量预计降 70% | Architecture Team |
| 2026-04-20 | Skill 格式定位为 neko 原生（不兼容 Claude Skills，仅为 neko 生态服务）：核心字段统一（name/description/version/domain 必填 + allowedTools/autoInvoke/phases/pipelines/referencedAssets/referencedSkills/compliance 可选）；强制 description 含 What+When 模式支持 AutoMode 自动触发；命名规则（≤64 字符/小写连字符/`neko-` 前缀保留官方）；载体两种并存（单文件 `.skill.md` 轻量 + 文件夹 `skill.md` + scripts/references/assets 复杂场景）；三级懒加载（元数据常驻/正文激活时加载/资源按需加载）；人格声明在正文不在 frontmatter；新增 autoInvoke 字段精细控制高危 Skill 禁用自动激活 | Architecture Team |
| 2026-04-21 | 新增子包依赖声明 requiredSubpackages（以子包粒度而非命令粒度声明依赖），激活前校验避免运行时缺失；五级失效处理（必需缺失阻止激活/可选缺失降级/fallback message/version 不兼容提示升级/执行时 L0.RetryEngine 二次校验）；对齐成熟生态依赖管理（npm dependencies / VSCode extensionDependencies）；未来场景/Tool Group 维度作为扩展点保留不 pre-build；删除 DirectMode（AutoMode 已覆盖简单任务快路径 + PlanMode 承载深度参与，两档足够；Direct 调用作为独立的 Invocation Style 概念保留供未来扩展） | Architecture Team |
| 2026-04-22 | §10 从 "术语双轨分层 + 双名 slash" 改为 "统一英文命令原则"（F 波文档决策）。撤销 CreatorTerms 映射表、撤销 `/specify`/`/构思` 双名注册、撤销 UI 呈现层与协议层的术语分离。保留 v1 原提议在 §10.7 作决策追溯。相关地方（§3.1 PlanMode 触发命令一栏）同步清理为仅 `/plan`。理由：一套英文术语同时用于文档 / 代码 / 日志 / UI / AI prompt 比"代码英文 + UI 中文"的双轨更有价值——一致性、可教学性、可搜索性、零翻译维护。 | Architecture Team |
| 2026-04-22 | 收尾对齐（纯机械）：§5.1/§5.3 新增 `CapabilityKind` 判别式联合类型（`'skill' \| 'tool' \| 'operation'`）+ `capabilityKindOf()` 分类器。**Operation 不是独立接口** —— 代码层 Tool 和 Operation 共用 `Tool` interface，通过 `isDestructive` trait 区分（destructive=true ⇒ 'operation'）。Skill/Tool registry 仍然分离（查询路径不同），ADR "扁平池"是 Agent 组合视角的概念框架，不是数据结构强制。§6.3 TaskQueue 改称 TaskManager 匹配现有代码（`packages/agent/src/task/task-manager.ts`），说明 TaskManager 除入队出队还承担 persistence / recovery / 并发池职责。 | Architecture Team |
| 2026-04-22 | **三阶段重命名（Phase A）**：SDD 从 `Specify/Plan/Tasks/Implement` 四阶段简化为 `Draft/Plan/Apply` 三阶段——原 Plan+Tasks 合并入单个 Plan 阶段（两者共享 persona / 工具 / guardians / 失败语义，只是产出物命名不同）；Implement 改名 Apply 借用 Terraform 成熟范式；Specify 改名 Draft 避开 `design` 在创作工具里的"视觉设计"歧义。产物 `Proposal` → `Draft`、`TodoList` → `Task`；文件命名从 `.nkproposal.md` / `.nkplan.md` / `.nktodo.md` 扩展名迁移为 `drafts/draft-<id>.md` / `plans/plan-<id>.md` / `tasks/task-<id>.md` 前缀方案（收益：ls 分组清晰、普通 MD 编辑器零配置打开、Git diff 原生识别）。ExecutionPlan 的 `proposalId` 字段改名 `draftId`；EventBus 频道 `creation.proposal.presented` → `creation.draft.presented`、`execution.todo.updated` → `execution.task.updated`；ApprovalEngine channel `proposal-review` → `draft-review`。代码改动：agent-types 新增 `draft.ts` / `task.ts`，删除 `proposal.ts` / `todo-list.ts`；agent 包内 `DraftWriteTool` / `TaskWriteTool` 替换原 `ProposalWriteTool` / `TodoWriteTool`；neko-paths 的 SUBDIRS 与 prefix 常量全面更新。工具逻辑保持不变（只改名 + 改路径），Phase B（后续 PR）将删除这 3 个 WriteTool，改为通用 Write + prompt 约束 + 后置 validator。 | Architecture Team |
| 2026-04-22 | **Phase B — 专用 WriteTool 下线 + ArtifactWatcher 接管**：删除 `DraftWriteTool` / `PlanWriteTool` / `TaskWriteTool` 三件套。AI 改用通用 `Write` 工具对 `.neko/drafts\|plans\|tasks/*.md` 直写；路径与 frontmatter 合同由 `creation-persona` 提示词约束（§5 新版正文列出完整 schema）。新增 `artifact/artifact-validator.ts`（纯函数，无 I/O，检测必填字段 / kind 匹配 / 时间戳格式 / status 枚举）与 `artifact/artifact-watcher.ts`（复用 HookLoader 的 `fs.watch` + 300ms debounce 模式，按子目录映射 `draft\|plan\|task` kind，读文件后调 validator，结果 emit 到 EventBus）。新增事件 `execution.artifact.written` / `execution.artifact.invalid`（在 agent-types `EXECUTION_CHANNELS` 注册），后者 payload 含结构化 `issues[]`（`missing-frontmatter` / `malformed-frontmatter` / `missing-field` / `wrong-kind` / `invalid-status` / `invalid-timestamp`）供下游 narrator / Agent 下一轮修复使用。集成点：`AgentSession` 构造时随 NekoPaths 一起实例化 watcher，dispose 时一并关闭 fs.watch handle 并清理 pending debounces。设计原则：watcher 是**非阻塞守卫**——文件已经在磁盘上，校验失败只发事件不回滚（对齐 §6.5 StageGuardian 的巡检-而非-拦截定位）。净代码减少：删除 3 工具 + 对应 6 个测试文件，新增 validator/watcher 共 2 个源文件 + 2 个测试文件（22 个新 case 覆盖 happy path / 结构失败 / schema 失败 / debounce / dispose / 真实 fs 冒烟）。工具移除后 `serializeDraft` / `serializeTask` / `serializeExecutionPlan` 成为独立可复用库（保留供未来 UI 渲染 / 回环测试用）。 | Architecture Team |
| 2026-04-22 | **Phase B 闭环（Observation loop + 运行时 runId 注入）**：Phase B 初版的 `artifact.invalid` 事件只有 watcher emit 端，没有消费端——承诺的"AI 自修复"只存在于 persona 提示词里。新增三件修补。 **(1)** `narrator/milestone-tracker.ts` 的 `defaultClassify` 补齐 `ARTIFACT_WRITTEN` / `ARTIFACT_INVALID` 两个 case；`progress-narrator.ts` 的图标表同步（✎ / ⚠）。 **(2)** 新增 `artifact/artifact-observation-hooks.ts`（ExecutorHooks），订阅 `execution.artifact.invalid`，在下一次 `beforeThink` 把 buffered issues 渲染成 system 消息追加到 `context.messages`，让 AI 真正看到 watcher 诊断并自修复。`AgentSession` 把它链到 `runnerHooks` 后面（与 `stageGuardian.tick` 组合），并在 dispose 时解订阅。 **(3)** `StagePersonaBinding` 新增 `getRunId` 可选 deps——激活 persona 时把 prompt 里的 `{runId}` / `{stage}` 字面量替换为活 SddRun 的 id / 当前 stage；`creation-persona.ts` 正文的 artifact-file 合同从 `<runId>` 改为 `{runId}`，让 AI 读到的永远是已解析好的具体路径（`.neko/drafts/draft-tiktok-001.md`），不再依赖 LLM 去会话上下文里二次检索。新增 `artifact-observation-hooks.test.ts`（8 个 case：no-op / 单事件注入 / 多事件排序 / 多 issue 展开 / 溢出截断 / 二次 drain / dispose 断链 / null bus 容错）。Phase B 闭环完成后端到端流程：AI 写 draft → watcher 300ms 后校验 → invalid 事件注入下一 beforeThink → AI 看到 issues → 重写。 | Architecture Team |

---

## 附录 A：与 Speckit 对照

| Speckit | neko-suite 整合架构 |
|--------|---------------------|
| /specify | Draft 阶段 → Draft |
| /plan + /tasks | Plan 阶段 → ExecutionPlan + Task（合并） |
| /implement | Apply 阶段 → Step Loop |
| Specifications 是主产物 | `drafts/draft-<id>.md` 是主产物 |
| 纯 Markdown | Markdown + 二分格式（+ 程序日志 JSONL）|
| 无审批 | L0 ApprovalEngine |
| 无事件 | L0 EventBus |
| 无任务管理 | L0 TaskManager |
| 无重试 | L0 RetryEngine |

**差异说明**：Speckit 专注代码任务，无需复杂基础设施；neko-suite 是创作工具，需要 L0 处理成本/审批/长任务。

## 附录 B：格式决策树

```
这个产物由谁产出内容？
  │
  ├─ AI 产出（或人产出）
  │   → Markdown（`<kind>-<runId>.md` / `.skill.md` / `.md`）
  │   - SDD 三件套（Draft / Plan / Task，前缀命名）
  │   - Task（AI 调 TaskWrite 工具）
  │   - Session/Skill/Workflow/Spec/Capability 声明
  │
  ├─ 程序自动记录
  │   → JSONL（append-only）
  │   - Event Log / Audit Log / Step Log
  │
  ├─ 程序派生构建
  │   → JSON（可重建的缓存/索引）
  │   - Capability Index / Draft Index / Cache
  │
  └─ 协议强制
      → 协议格式
      - package.json（VSCode）
```

**单一规则**：看内容谁产出。I/O 层谁执行不影响分类。
