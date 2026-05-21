# ADR: Engine AI-Native Foundation — 引擎 AI-Native 化地基

## 状态

Proposed (2026-04-25,**2026-04-25 修订**:语义化素材部分迁移至 [adr-asset-federation.md](./adr-asset-federation.md))

## 关联 ADR

- 上层依赖:[adr-four-layer-contract.md](./adr-four-layer-contract.md), [adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md)
- 横向配合:[adr-capability-protocol.md](./adr-capability-protocol.md), [adr-provider-expression-context.md](./adr-provider-expression-context.md), [adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md), [agent-memory-unification.md](./agent-memory-unification.md)
- **平行配合**:[adr-asset-federation.md](./adr-asset-federation.md) ★ — 子包素材联邦深化,本 ADR 不再涵盖中心化素材模型
- 既有重叠:[adr-character-unified-index.md](./adr-character-unified-index.md), [asset-knowledge-graph.md](./asset-knowledge-graph.md)

## 更新说明 (2026-04-25)

初版 ADR 把"语义化素材"建模为引擎中心化(SemanticAsset 由 engine 自动语义化)。这是错的——neko-suite 是 11+ 子包的联邦,每个子包(neko-cut/.../neko-story)拥有自己的原生格式(.nkcut/.nks/.nkpup/.nkm/.fountain),引擎不应也不能直接读它们。

修订要点:

- **素材语义化** = 子包贡献 `AssetHandler`(类比 `AgentCapabilityProvider`),引擎只提供共享词汇 + 索引 + 联邦协议
- **新增** [adr-asset-federation.md](./adr-asset-federation.md) 专门覆盖联邦架构、AssetHandler trait、跨包共享三级、Send-to-Anywhere 协议
- 本 ADR 保留:语义运行时(F4)、能力卡片(F1+F5)、自动适配(F3)、因果链(F6)、引擎层共享词汇(`engine-semantic-ontology`)与索引(`engine-vector-index`)
- 本 ADR **删除**:Asset 管理改造表(原"资产嵌入/自动标签/跨格式适配/引用图/重复检测"——这些迁移到子包 Handler)

## 背景

把 LLM 接到现有引擎只能得到 *"AI-enabled"*——LLM 学会调你的 API。**AI-Native** 反过来:**引擎说人话、自暴露能力、自适配差异**,LLM 反而做的事变少了。

判定一个引擎是否 AI-Native,看 6 个特征:

```
F1  自描述      :  每个 API/资产/参数都有语义卡片(不止 type signature)
F2  跨模态对齐  :  3D 的"微笑"和 2D 的"微笑"指向同一语义槽
F3  自动适配    :  把 A 模型的动画/参数/特效 → B 模型,引擎自完成
F4  双向语义流  :  AI 能命令也能观察,观察输出是语义事件不是 raw delta
F5  失败可解释  :  错误回包带语义因(不止 errno)
F6  因果可追溯  :  任何输出能溯源到 (intent → plan → op → result) 链路
```

**当前 neko-engine 的 AI 友好度评分**(F1–F6 每项 0–10,满分 60):

| Crate / 域 | F1 自描述 | F2 跨模态 | F3 自适配 | F4 双向语义 | F5 失败语义 | F6 因果链 | 总分 |
|------------|-----------|-----------|-----------|-------------|-------------|-----------|------|
| `runtime-scene` (3D) | 3 | 0 | 1 | 2 | 1 | 1 | **8/60** |
| `runtime-puppet` (2D) | 4 | 0 | 0 | 6 | 1 | 1 | **12/60** |
| `runtime-media` (NLE) | 5 | 1 | 0 | 1 | 2 | 2 | **11/60** |
| `runtime-ml` | 6 | 3 | 1 | 4 | 3 | 0 | **17/60** |
| `runtime-device` | 4 | — | — | 5 | 4 | 0 | **13/60** |
| Asset 管理 | 3 | 1 | 0 | 0 | 1 | 0 | **5/60** |
| `engine-kernel` GPU/特效 | 1 | 0 | 0 | 0 | 0 | 0 | **1/60** |

**最薄弱的两条**:F2 跨模态对齐(平均 0.7/10)、F6 因果链(平均 0.6/10)——这正是用户提的"骨骼/素材/系统自动适配"的根本短板。

## 决策

通过新建 **6 个跨切共享 crate**,把当前散落在各域的"AI 友好"实现收口,并补齐 F2 / F3 / F6 三大短板,使 neko-engine 成为真正的 AI-Native 引擎。

## 设计要点

### 1. 四个核心改造维度

#### 维度 A:语义对齐(F1 + F2)

```
当前问题                                改造方向
────────────                            ────────────
glTF 骨骼名千人千面                  ─► 强制映射到 Humanoid Standard
   "mixamorig:LeftArm" 等             (Hips/Spine/Chest/L_Shoulder/...)

MOC3 参数名艺术家自取                ─► 已有 32-param 标准,
                                        但 loader 未强制对齐

3D 面部 22 标准 / 2D 32 标准         ─► 共有 SemanticSlot 抽象
   各做一套                             SmileSlot 既能驱动 3D 也能驱动 2D

NLE Clip 只有 path                   ─► ClipSemantics {
                                          subject, action, environment,
                                          emotion, energy, timeOfDay }

特效着色器名(curves/hsl/lut)        ─► 加 EffectSemantics {
                                          mood: warm|cold|neutral,
                                          intensity, polarity }

ML 模型按 id 访问                    ─► CapabilityCard (provider-bridge ADR
                                        已 Proposed,需扩到所有 ML 模型)
```

**关键洞察**:语义对齐**不是给每个东西加 description 字段**,而是建立**共享的语义本体(ontology)**。"微笑"槽不是字符串,是 `SemanticSlot::FacialExpression::Smile`,跨模态时引擎自己路由到具体实现。

#### 维度 B:自动适配(F3)— 用户问的核心

```
                       ┌─ 骨骼适配 ────────────────────┐
                       │  VRM A → VRM B  (Humanoid 标准间) │
                       │  VRM   → MOC3 (3D→2D 降级)       │
                       │  VRM   → MMD                     │
                       └──────────────────────────────────┘
                       ┌─ 动画适配 ────────────────────┐
                       │  Walk cycle 按骨长比例缩放       │
                       │  IK 目标语义保持(看相机/握剑)   │
                       │  缺失骨骼自动 fallback           │
                       └──────────────────────────────────┘
   AdapterEngine ─────►┌─ 参数适配 ────────────────────┐
   (新 crate)          │  smile=0.7 → 在 22 / 32 / morph  │
                       │  各自正确路由                   │
                       └──────────────────────────────────┘
                       ┌─ 资产适配 ────────────────────┐
                       │  PSD → .nks 图层树               │
                       │  glTF → .nkm                     │
                       │  RAW → 视频帧                    │
                       └──────────────────────────────────┘
                       ┌─ 特效适配 ────────────────────┐
                       │  LUT 按色彩空间自动转换           │
                       │  滤镜按目标分辨率重采样           │
                       └──────────────────────────────────┘
```

**质量保证机制**(每个适配都必须有):

1. **AdaptationConfidence ∈ [0,1]**:引擎自报"这次适配靠谱程度"
2. **DegradationMode**:语义保 / 几何保 / 时序保(选其一,告知用户)
3. **AdaptationTrace**:记录每个适配步骤,失败时可回滚

#### 维度 C:能力卡片(F1 + F5)

每个 Tool / Asset / Operation 必须有 **CapabilityCard**(三合一 markdown,与 [adr-provider-expression-context.md](./adr-provider-expression-context.md) 对齐):

```yaml
# capability-card: tool/scene/set-pose
semantic:
  what:  "让角色摆出指定姿势"
  when:  "用户描述身体姿态,无需精确角度"
  notWhen: "需要逐帧动画时(用 SetKeyframe)"
  preconditions:
    - "Skeleton 必须已绑定"
    - "Pose 必须可解释为 humanoid-standard"
  failureModes:
    - { reason: "missing-bone", semantic: "目标骨骼在当前模型不存在",
        adaptation: "自动 fallback 到最近父级" }
    - { reason: "ik-unsolvable", semantic: "目标位置超出可达范围",
        userMessage: "'手够不到那里,要不要让角色靠近些?'" }
schema:
  # 标准 JSON schema (技术契约)
  ...
```

**这一条直接回答 F5**:失败回包不是 `Err("missing bone 'L_Wrist'")`,是 `{ semanticReason: "missing-bone", suggestion: "fallback to parent", adaptation: { applied: true, confidence: 0.6 } }`,LLM 能读懂并据此决策。

#### 维度 D:因果可追溯(F6)

每个状态变化必须挂上**因果链**:

```
StateDelta {
  cause: {
    intent_id:  "intent-2026-04-25-A1",
    plan_id:    "plan-2026-04-25-A1.3",
    op_id:      "op-AddClip-7",
    tool:       "neko.cut.AddClip",
    upstream:   ["op-Trim-6"]      ← DAG 上游
  },
  delta: { ... },
  evidence: { artifact_path, snapshot_hash }
}
```

**作用**:
- AI 能学习("这种 Plan 在这种状态下成功率 80%")
- 控制层能归因("失败是因为上游 op-Trim-6 越界")
- 用户能撤销到任意因果点

### 2. 必须新增的 6 个跨切 crate(引擎层)+ 1 个联邦协议(跨包)

```
                               定位                              对应已有 ADR
   ─────────────────────  ────────────────────────────  ──────────────────────
   engine-semantic-ontology  全局语义本体(标准骨骼/      ★ 新建,含已散落的
                             参数/资产分类 + 共享词汇)     22/32 面部标准
                             ★★ 仅持词汇/槽/身份注册,
                                不持具体素材

   engine-capability-card    自描述卡片格式 + 验证器       extends capability-protocol
                                                            + provider-expression-context

   engine-adapter            骨骼/参数/特效自适配         ★ 新建
                             器(F3 的实施层;素材跨格   (素材跨格式适配走子包
                             式不在此层管)                 Handler,见 asset-federation)

   engine-provenance         因果链记录 + 查询             ★ 新建
                             (F6 的实施层,跨子包写入)    

   engine-semantic-bus       语义事件总线(把 raw delta     extends feedback bus
                             翻译成语义事件,跨子包广播)   (control-plane ADR)

   engine-vector-index       嵌入索引基础设施              ★ 新建,合并
                             ★★ 索引数据由子包 Handler     LSP ScriptIndex 实现
                                推送,引擎不爬子包文件
```

**+ 联邦协议层**(独立 ADR):

```
   AssetFederationRegistry   跨包素材联邦入口             ★★ 见 adr-asset-federation.md
                             ─ AssetHandler trait        子包贡献 Handler,与
                             ─ uri 路由                   AgentCapabilityProvider 同形
                             ─ Send-to-Anywhere 协议
```

> 这 6+1 个组件 **不是** 新功能,是把现有散落代码沉淀。例如 [LSP ScriptIndex](./media-lsp.md) 的 HNSW 索引、neko-puppet 的 32-param 表、provider-bridge ADR 的卡片格式、CLAUDE.md 的 AssetManifest+Handler 模式,都已存在但各自为政——必须收回到共享层 / 联邦协议。

### 3. 语义状态的历史管理策略

**关键决策**:语义状态分 5 类,各自历史载体不同。**Git 与 Journal 分工管理,不混用**。

```
层级                       例子                         历史载体
─────────────────────  ──────────────────────────  ──────────────
① 本体/Schema          22 面部标准 / 32 puppet     Git(月/年级)
                       参数 / 资产分类树             需 PR review

② CapabilityCard 源    Tool 的语义卡片源文件       Git(周/月级)

③ 项目内 Card 覆盖     .neko/cards/*.md 用户       Git(项目内)
                       本地改                       沉淀回流 PR

④ 运行时语义调整       会话中"这不是 happy,     engine-provenance
                       是 wistful" / 自动重打 tag    Journal(秒级)
                                                    .neko/journal/

⑤ 派生数据             CLIP 嵌入 / 自动转录        无历史,可重生
                                                    依赖源变化重算
```

**判别规则**(给 review 用):

- 改它需要 review 吗? → Git
- 改它是会话内的细粒度行为吗? → Journal
- 改它的源变了能重算吗? → 无历史

**与现有 ADR 对齐**:这套分层正是 [agent-memory-unification.md](./agent-memory-unification.md) 的 Journal-as-SSOT 模式延伸——语义运行时调整 = Journal 事件,语义快照 = 项目文件(Git),衍生品 = 缓存。

`engine-provenance` 在这里承担两个角色:

1. **写入端**:每次状态变化生成 `(StateDelta, Cause)` 记录,append 到 .neko/journal/
2. **查询端**:支持"这个 tag 是谁/什么时候/为什么打的"反向追溯

### 4. 各域改造清单

#### `runtime-scene` (3D)

| 改造项 | 当前 | 目标 | 优先级 |
|--------|------|------|--------|
| 骨骼语义化 | glTF 原始 bone name | 加 `HumanoidMapping` 组件,映射到 22 标准骨 | **P0** |
| 动画语义标签 | clip name 任意字符串 | `AnimationSemantics { category: locomotion\|emote\|gesture, ... }` | **P0** |
| IK 目标语义 | 世界空间 vec3 | `IkSemanticTarget { lookAt(camera) \| holdProp(asset_id) \| ... }` | P1 |
| 跨模型动画移植 | 不存在 | 经 engine-adapter,带 confidence 返回 | P1 |
| Pose 库语义化 | 无 | 嵌入索引,自然语言搜索"叉腰自信" | P2 |

#### `runtime-puppet` (2D)

| 改造项 | 当前 | 目标 | 优先级 |
|--------|------|------|--------|
| 参数名标准化 | MOC3 原始名 | loader 强制映射到 32 标准参数 | **P0** |
| 跨 puppet 表情移植 | 不存在 | "笑容 0.7" 在任何 MOC3 模型工作 | **P0** |
| 与 3D 模型表情共享 | 无 | SemanticSlot 路由,3D 微笑 ↔ 2D 微笑同槽 | P1 |
| 形变质量评估 | 无 | MOC3 形变范围越界时 confidence 衰减并报警 | P2 |

#### `runtime-media` (NLE)

| 改造项 | 当前 | 目标 | 优先级 |
|--------|------|------|--------|
| Clip 语义元数据 | path + duration | `ClipSemantics`(subject/action/emotion 由 CLIP/Whisper 自填) | **P0** |
| 特效语义化 | 着色器内部参数 | `EffectSemantics { mood, intensity }` 投影到底层参数 | **P0** |
| 转场语义命名 | "fade/cut/wipe" | "回忆/紧张/放松/...叙事性转场" | P1 |
| 时间线作为 SSOT | TS Zustand 镜像 | Rust ECS 唯一权威(P0 域债务) | **P0** |
| Beat / 节拍语义 | 无 | 音轨自动 onset detection,Clip 边界吸附 | P2 |

#### `runtime-ml`

| 改造项 | 当前 | 目标 | 优先级 |
|--------|------|------|--------|
| 模型 CapabilityCard | 模型 id | 三合一 md(已有 ADR,需落地) | **P0** |
| 输出附 confidence | 部分有 | 全部强制返回置信度 | **P0** |
| 失败语义因 | OOM/timeout 等技术因 | + 语义因(分辨率不匹配/风格冲突/...) | P1 |
| 模型自动选型 | 用户指定 | 按 IntentDescriptor 路由 | P1 |
| 嵌入复用 | CLIP/script 各自一份 | 收口到 engine-vector-index | **P0** |

#### Asset 管理(迁移说明)

> ⚠ 原"资产嵌入/自动标签/跨格式适配/引用图/重复检测"五项改造**已迁移**至 [adr-asset-federation.md](./adr-asset-federation.md),不在本 ADR 范围内。
>
> 修订理由:这些改造的执行主体应当是各子包的 `AssetHandler`,不是引擎自己——引擎不读 `.nkcut`/`.nks`/`.nkpup` 等子包原生格式。
>
> 在本 ADR 中,引擎层只承担:
>
> - 提供 `engine-vector-index` 索引基础设施(子包 Handler push 数据进来)
> - 提供 `engine-semantic-ontology` 共享词汇(SemanticSlot / IdentityRegistry)
> - 提供 `engine-provenance` 跨包因果链记录
> - 提供 `engine-semantic-bus` 跨包事件总线
>
> 具体每个子包的 Handler 改造(neko-cut/neko-canvas/neko-model/neko-sketch/neko-puppet/neko-story 等)见 [adr-asset-federation.md §6](./adr-asset-federation.md)。

#### `engine-kernel` GPU/特效

| 改造项 | 当前 | 目标 | 优先级 |
|--------|------|------|--------|
| 着色器 CapabilityCard | 无任何元数据 | 每个 effect 必带语义卡片 | **P0** |
| 特效组合可由 AI 装配 | 固定链 | EffectSemantics → 自动选择 + 排序 | P1 |
| GPU 预算反馈 | 无 | `frame-budget-overrun` 信号 | P1 |

## 后果

### 正面

- **AI 体验质变**:从"AI 会调 API"到"引擎自我描述,AI 自然使用"
- **跨模态复用**:同一表情/动画/特效跨 2D/3D/XR 自动适配
- **可学习**:因果链使 AI 能从历史会话学习成功模式
- **可解释**:任何状态变化能反向追溯到意图

### 负面 / 权衡

- **前期投入大**:6 个新 crate + 各域改造,~30 PR
- **本体设计风险**:SemanticOntology 设计错误后续难改,需多次 review
- **性能开销**:每个 op 加因果链记录有写入开销(预估 < 5%)
- **AdaptationConfidence 校准难**:需大量样本数据训练

## 实施路径

```
S1  地基(必须先做,无前置依赖)
    ┌──────────────────────────────────────────────────┐
    │ ① engine-semantic-ontology  抽出 22/32 + 资产分类  │
    │ ② engine-capability-card    格式 + 验证器          │
    │ ③ engine-vector-index       合并散落嵌入实现       │
    │ ④ engine-provenance         因果链 schema          │
    └──────────────────────────────────────────────────┘
    工作量: 8-10 PR,无法并行(本体须先稳)

S2  适配引擎 + 各域 P0
    ┌──────────────────────────────────────────────────┐
    │ ⑤ engine-adapter            骨骼/参数/特效适配     │
    │ ⑥ engine-semantic-bus       语义事件总线          │
    │ ⑦ runtime-* P0 改造          按各域表标 P0 项     │
    └──────────────────────────────────────────────────┘
    工作量: 12-15 PR,⑤⑥⑦ 可并行

S3  贯通 + AI 体验改造
    ┌──────────────────────────────────────────────────┐
    │ ⑧ 各域 P1                    跨模态/自动选型       │
    │ ⑨ 因果链贯通到 UI            撤销/学习/解释        │
    │ ⑩ Capability Card → LLM      Prompt 自动注入       │
    └──────────────────────────────────────────────────┘
    工作量: 10-12 PR
```

## 与既有 ADR 的关系图

```
   adr-capability-protocol  (已 Proposed)
            │
            ├──► engine-capability-card 是它的字段扩展
            │
   adr-provider-expression-context  (已 Proposed)
            │
            ├──► 三合一 markdown 格式,扩到所有 Tool/Asset
            │
   adr-control-plane-feedback-arbiter  (已 Proposed)
            │
            ├──► engine-semantic-bus 在它之上加语义翻译层
            │
   adr-skill-as-prompt-chains  (已 Proposed)
            │
            ├──► CapabilityCard 是 Skill 引用的目标
            │
   agent-memory-unification  (已 Proposed)
            │
            └──► engine-provenance 是 Journal 的因果增强

   ──── 既有可能重叠 ─────────────────────────────────
   adr-character-unified-index   ── engine-semantic-ontology 应吸收
   asset-knowledge-graph         ── engine-vector-index 应吸收
```

**结论**:本 ADR 改造**不与任何已有 ADR 冲突**,是它们的**承载基座**。已有 5 份 Proposed ADR 都在描述"AI 怎么用引擎",这次回答"引擎自己得长成什么样,AI 才用得起来"。

## 反模式清单

```
AP-1  "给每个东西加 description 字段就叫 AI-Native"
      现象:Tool/Asset 上塞 description: "用来 X 的"
      代价:LLM 无法做语义查询(关键词匹配 ≠ 语义对齐)
      修法:建本体 SemanticOntology,description 只是次要文档

AP-2  "CapabilityCard 由人手写"
      现象:每个 Tool 作者写一份 CapabilityCard
      代价:格式漂移、遗漏 failureModes
      修法:cargo-card 工具自动从代码提取 + 人工补充语义

AP-3  "因果链记录全量 raw delta"
      现象:每帧 Component 改动都记录
      代价:Journal 爆炸
      修法:语义事件粒度记录,raw delta 走 derived 缓存

AP-4  "适配失败硬报错"
      现象:VRM 缺骨,直接 Err("missing bone L_Wrist")
      代价:LLM 不知怎么修,用户体验差
      修法:返回 { confidence, degradation, semantic_reason }

AP-5  "本体未稳就开干"
      现象:S2/S3 与 S1 并行
      代价:本体改一次,所有 Card / Adapter 跟着改
      修法:S1 必须先稳定 1-2 个月,再开 S2

AP-6  "引擎层中心化素材"(2026-04-25 修订新增)
      现象:engine-* crate 直接读 .nkcut/.nks/.nkpup 等子包格式
      代价:破坏子包自治、循环依赖、无法扩展新子包
      修法:走 AssetFederationRegistry,引擎只通过 AssetHandler trait
            访问素材,看不到原始字节(详见 adr-asset-federation.md)
```
