# ADR: Four-Layer Architecture Contract — neko 创作引擎四层架构契约规约

## 状态

Proposed (2026-04-25)

## 关联 ADR

- 上层依赖:[adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md), [adr-xr-authoring-runtime-split.md](./adr-xr-authoring-runtime-split.md), [adr-engine-four-layer-audit.md](./adr-engine-four-layer-audit.md), [adr-engine-ai-native-foundation.md](./adr-engine-ai-native-foundation.md)
- 横切配合:[adr-control-plane-feedback-arbiter.md](./adr-control-plane-feedback-arbiter.md), [adr-capability-protocol.md](./adr-capability-protocol.md), [adr-skill-as-prompt-chains.md](./adr-skill-as-prompt-chains.md)

## 背景

neko-suite 历经多轮 ADR 演进,Agent / Engine / Skill / Capability / Memory 各域分别完成了详细设计,但**缺少一份贯穿全栈的层架构契约**。当下游域 ADR 描述"AI 怎么用引擎"、"如何编排 Skill"、"如何反馈"时,默认假设了一套四层结构,这套结构却从未被显式形式化。

具体表现:

- **意图层与编排层混淆**:LLM 直接调 Tool 的反模式频繁出现,失去 Plan 的可审计性。
- **状态权威态分裂**:TS Zustand 与 Rust ECS World 各持一份 Timeline,产生镜像同步债务。
- **控制层僭越执行**:FeedbackArbiter 在原始设计中允许直接写文件,变成"第二个执行层"。
- **时间尺度跨界**:LLM 偶尔出现在 render loop 中,违反硬实时约束。

这些反模式都源于**缺乏统一的层契约**。本 ADR 形式化四层架构,作为后续所有引擎/Agent ADR 的**地基条款**。

## 决策

定义 **四层架构 = (意图层, 编排层, 数据·执行层, 控制层) + 五条不变量**,作为 neko-suite 创作引擎所有域必须遵守的根契约。

### 命名脱实现化

明确命名只描述责任,不绑定实现技术:

| 旧名(技术绑定) | 新名(责任描述) | 抽象后的好处 |
|------------------|-------------------|--------------|
| AI 意图层 | 意图层 | 人/LLM/脚本/录制回放都可作意图源 |
| OOP 编排层 | 编排层 | 不强制 OOP,可函数式/规则引擎/DAG |
| ECS 数据层 | 数据·执行层 | 不强制 ECS,可关系库/不可变树 |
| AI 控制 Feedback | 控制层 | 反馈+决策+学习合并为"控制" |

## 设计要点

### 1. 各层精确契约

契约 = (输入类型, 输出类型, 不变量, 反例)。任何实现违反这四要素之一就破坏了架构。

#### Layer 1:意图层(Intent)

```
INPUT     :  RawSignal  =  NaturalLang | UIEvent | RecordedTrace | ScheduledTrigger
OUTPUT    :  IntentDescriptor {
                goal:           string
                domain:         DomainTag
                constraints:    StructuredRules
                expectedOutput: ArtifactSpec
                priority/budget
             }

不变量 I1 : 不持有任何"如何做"的知识(不知道有哪些 Tool,不知道存储在哪)
不变量 I2 : 是无副作用的(读不写,可重放)
不变量 I3 : 输出只能是数据,不能是闭包/回调

反例     : "AI 直接调 Tool" — 跳过编排层,违反 I1
反例     : "意图层缓存 Plan 加速" — 持有了执行知识,违反 I1
```

意图层是**纯翻译器**:`User Says X → IntentDescriptor`。它不规划、不执行、不记忆。

#### Layer 2:编排层(Orchestration)

```
INPUT     :  IntentDescriptor + AvailableCapabilities + CurrentState(只读快照)
OUTPUT    :  ExecutionPlan {
                stages:        [StageId]
                operations:    [Op{tool, args, preconditions, postconditions}]
                approvalGates: [GateId]
                fallbacks:     [(Op, FallbackOp)]
             }

不变量 O1 : 输出 Plan 是可序列化、可审计、可重放的
不变量 O2 : 不直接操作状态,只生产 Plan(分离 plan 与 act)
不变量 O3 : 同样的 Intent + State 应得到稳定 Plan(否则反馈无法归因)

反例     : "编排器边规划边执行" — 违反 O2,失去回滚能力
反例     : "Plan 里塞匿名函数" — 违反 O1,无法持久化
反例     : "Tool 在 Plan 内部递归扩展" — 违反 O3,失去可解释性
```

编排层产物是**死的纸**(Plan)。这张纸下游谁都能看。

#### Layer 3:数据·执行层(Data / Execution)

```
INPUT     :  Operation (来自 Plan)
OUTPUT    :  StateDelta + ObservableEffect (snapshot stream / events)
持有       :  AuthoritativeState (唯一可信源)

不变量 D1 : 是唯一的状态权威。任何上层都通过它读,而不是镜像
不变量 D2 : 每次状态变化必须能产出 (delta, cause-op-id) 对
不变量 D3 : 执行的 timing 与编排解耦(Plan 不规定执行时序细节)

反例     : "TS 端缓存 Timeline 当作真相" — 违反 D1(neko-cut 当前债务)
反例     : "执行不报告 delta,靠上层轮询 snapshot" — 违反 D2
反例     : "Plan 里写死帧率" — 违反 D3
```

数据和执行**形式上**可分(ECS Components vs Systems),**契约上**不可分——上层看到的是"一坨状态 + 改它的能力"。

#### Layer 4:控制层(Control)

```
INPUT     :  从 Intent/Orchestration/Data 全部三层订阅的 Signals
OUTPUT    :  ControlDecision = Adjust(target_layer, adjustment)
            其中 target_layer ∈ {Intent, Orchestration, Data}

职责切片 :   ┌─ Monitor:  采集多源信号
             ├─ Analyze:  归一化 + 优先级仲裁
             ├─ Decide :  应用 Policy → 产出 Decision
             └─ Memorize: 落库供下次决策参考(MAPE-K 的 K)

不变量 C1 : 横切但不替代任何层(不能自己执行,只能"建议层 X 改")
不变量 C2 : 决策路径必须有有限优先级序(避免环路)
不变量 C3 : 频次受限(rate-limit),不能每微秒都触发
不变量 C4 : 所有决策可解释(signal_id → policy_rule → decision)

反例     : "控制层直接改状态" — 违反 C1(变成第二个执行层)
反例     : "控制层通过修改 Intent 来'纠正'用户" — 违反 C1 的精神
反例     : "用户反馈与预算冲突,无优先级,死锁" — 违反 C2
```

控制层是**元层**。它**只签字,不动手**。

### 2. 层间接口(只允许 4 种数据形态穿越边界)

```
┌──────────────────────────────────────────────────────────────────────┐
│   Intent     ───► IntentDescriptor (data, immutable, serializable)   │
│      │                                                                │
│      ▼                                                                │
│   Orchestrate ───► ExecutionPlan (data, immutable, serializable)     │
│      │                                                                │
│      ▼                                                                │
│   Data/Exec  ◄──── Operation (one item from Plan)                    │
│      │       ───►  StateDelta + Event (stream, append-only)          │
│      │                                                                │
│      └──────────► Snapshot Query (read-only, for upper layers)       │
│                                                                       │
│                    ▲     ▲      ▲                                    │
│                    │     │      │  (subscribe, never mutate)         │
│   Control ─────────┴─────┴──────┘                                    │
│      │                                                                │
│      └──► Decision = Adjust(layer, suggestion)                       │
└──────────────────────────────────────────────────────────────────────┘

只允许 4 种数据形态穿越层边界:
  ① IntentDescriptor   (Intent → Orchestration)
  ② ExecutionPlan      (Orchestration → Data/Exec)
  ③ StateDelta/Event   (Data/Exec → upward subscribers)
  ④ ControlDecision    (Control → any one layer)

禁止的形态:
  ✗ 引用 / 闭包 / 回调函数(违反可序列化)
  ✗ 跨 2 层直传(必须经过中间层)
  ✗ 双向 RPC(必须是数据流 + 事件流)
```

### 3. 五条不可违反的不变量

任何 PR、任何重构、任何"小修改"必须先用这五条体检:

```
Inv-1  单向数据流(layer skip 禁令)
       Intent 不能直接出现在 Data/Exec 的 Op 里
       Data/Exec 的 raw event 不能直接驱动 Intent
       违反症状:LLM 输出里出现 "ECS 实体 ID"

Inv-2  唯一权威态(SSOT)
       状态只活在 Data/Exec。其他层只持只读投影/快照
       违反症状:TS 与 Rust 各有一份,需要同步逻辑

Inv-3  数据流跨层,行为流不跨层
       穿越边界的只能是 (data, event),不能是 callback/RPC/订阅
       违反症状:Webview 直接 import Engine 的方法签名

Inv-4  控制层不动手
       Control 只产 Decision = Adjust(...)。从不直接改 state
       违反症状:FeedbackArbiter 自己写文件 / 调 Tool

Inv-5  时间尺度分层
       Intent  : 秒级            (LLM 推理)
       Orch.   : 100ms 级        (Plan 编译)
       Data/Ex : 毫秒级          (帧循环)
       Control : 异步、节流      (不进帧)
       违反症状:LLM 出现在 OnUpdate 中
```

### 4. 与控制论 / MAPE-K / OODA / BDI 的对应

本架构**不是新发明**,是 60 年控制论 + 25 年自治计算 + 30 年 BDI Agent 在 LLM 时代的重新对齐。

```
经典控制论:
   Reference R(t) ─►(+)─► Controller ─► Plant ─► Output Y(t)
                    ▲                           │
                    └──────── Sensor S ◄────────┘

我们的四层 ↔ 控制论:
   Intent      = Reference R(t)            "想要什么"
   Orchestrate = Controller (PID/MPC)      "怎么调"
   Data/Exec   = Plant + Sensor            "现实"
   Control     = 自适应/学习增益调节器     "调控制器本身"

IBM Autonomic Computing 的 MAPE-K (2003):
   M Monitor   ─┐
   A Analyze   ─┼ 都在控制层
   P Plan      ─┤(Plan 概念被 MAPE-K 算作 P)
   E Execute   ─┘对应数据·执行层
   K Knowledge  对应控制层的 Memorize 切片

OODA Loop (Boyd):
   Observe → 控制层 Monitor
   Orient  → 控制层 Analyze
   Decide  → 控制层 + 编排层
   Act     → 数据·执行层

BDI Agent Model:
   Belief    → Data/Exec 的 snapshot 投影
   Desire    → Intent
   Intention → ExecutionPlan
```

意义:失败模式都已被研究过,有大量先验可借鉴。

### 5. 落到 neko-suite

| 层 | 当前已有 | 缺失/建议补 |
|----|---------|------------|
| Intent | creation-persona Draft.md(隐式于正文) | IntentExtractor 形式化、IntentDescriptor 数据类型 |
| Orchestration | StagePlanner(硬编码 D→P→A)、ToolInjectionManager、Capability Provider | StageRegistry(control-plane ADR)、DomainRouter(2d/3d/xr/media/ml) |
| Data/Exec | runtime-scene World、runtime-puppet World、.nk* artifact 文件 | runtime-media 收 Timeline SSOT、共享 engine-ecs-core trait、StateDelta 流统一 |
| Control | SelfEvaluationHooks、ArtifactObservationHooks(各 hooks 散落) | FeedbackArbiter、ControlDecision 数据类型、信号总线 engine-feedback-bus |

## 后果

### 正面

- **可解释性**:任何状态变化能溯源到 (Intent → Plan → Op → Delta)
- **可重放**:Plan 可序列化 ⇒ 任何会话可回放
- **可演化**:层间纯数据接口 ⇒ 任一层独立替换
- **可教学**:新贡献者读五条不变量即可上手 review
- **跨域复用**:同一组层契约描述 2D/3D/XR/Media/ML 等所有域

### 负面 / 权衡

- **形式化成本**:之前隐式的设计需要显式落到代码
- **Plan 序列化开销**:复杂 Plan 的序列化体积可能大(预计 KB-MB 级)
- **不变量执行**:需要 lint / runtime 检查;否则纸面规约形同虚设

## 实施路径

```
S0  本 ADR 落地 + 现有反模式标注
    ── 在 review 模板中加入 5 条不变量 checklist
    ── 现有违反点(timeline 镜像、hooks 散落)挂 issue

S1  类型规约
    ── 定义 IntentDescriptor / ExecutionPlan / StateDelta / ControlDecision 在 @neko/shared
    ── 现有代码逐步对接

S2  违反点修复
    ── runtime-media Timeline 收 SSOT(消除 Inv-2 违反)
    ── FeedbackArbiter 落地为纯 Decision 输出(消除 Inv-4 违反)

S3  自动化检查
    ── dependency-cruiser 规则:不允许跨层直 import
    ── runtime 检查:Plan 序列化必须无函数引用
```

## 反模式清单(Code Review 直接用)

```
AP-1  "意图层短路"
      现象:LLM 直接 invokeTool('AddClip',...) 而不经 Plan
      代价:回滚不能、审计不能、重放不能
      修法:强制 Tool 必须有 plan_id 参数

AP-2  "状态镜像"
      现象:TS Zustand 与 Rust World 各持一份 Timeline
      代价:漂移 / bug 难复现 / 持久化二义性
      修法:Rust 推 delta,TS 仅维护 derived-view 缓存

AP-3  "控制层吃 Op"
      现象:FeedbackArbiter 自己 writeFile / spawnTool
      代价:出现"第二个执行层",日志不能解释为什么状态变了
      修法:Control 只能 emit Decision,谁执行由 Orchestration 接

AP-4  "层间订阅闭包"
      现象:Plan 里塞 onComplete: () => {...}
      代价:Plan 无法序列化、无法重放、无法跨进程
      修法:用 PlanContinuation { next_stage_id } 数据替代闭包

AP-5  "时间尺度跨界"
      现象:render-loop 里 await llm.generate(...)
      代价:帧时长爆炸 / 实时性崩溃
      修法:LLM 只在 Authoring/Plan 阶段;运行期跑预编译产物
```
