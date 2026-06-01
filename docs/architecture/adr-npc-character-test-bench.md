# ADR: NPC Character Test Bench

- **Status**: Accepted / Implemented by OpenSpec change `implement-npc-character-test-bench`
- **Date**: 2026-05-29
- **Author**: NekoMi + Claude

## 1. Context & Motivation

Neko Suite already maintains rich character data across three layers:

| Layer | Data | Source |
|-------|------|--------|
| Identity | `CharacterRecord` — name, aliases, role, gender, ageRange | `characters.json` (git-tracked) |
| Asset | `EntityAssetBinding` — portrait / voice / live2d / live3d / motion | Asset manifest |
| Asset metadata | `CharacterMetadata` — personality[], voiceActor | Asset entity |
| Visual | `VisualFactSuggestion` — hair, outfit, age, expression, skin_tone | Visual identity drafts |
| Relational | `CreativeEntityGraph` — appears-in-scene, alias-of, uses-object | Entity graph (Phase 3) |
| Occurrence | `OccurrenceIndex` — script lines, canvas nodes, assets | Entity occurrence index |

Users create characters for interactive content (games, virtual companions, interactive stories). They need a way to **test whether a character works as an AI NPC** — can it hold a conversation, stay in persona, respond appropriately within its knowledge boundary?

This is fundamentally different from the creative assistant using a character's voice. The goal is **NPC validation**, not creative workflow.

## 2. Decision

### 2.1 Core Positioning

`/as @character` opens an **isolated Agent-owned NPC conversation session** for interactive testing. The NPC session:

- Runs under **runtime tool policy: none** — this is a session isolation policy, not an NPC capability
- Has a **profile-bound behavior boundary** — responds from the assembled profile and is evaluated for knowledge leakage
- Runs in a **separate conversation** — does not contaminate the main agent chat history
- Can be **quickly iterated** — exit, adjust entity data, re-enter

NPC and creative authoring are two different application scenarios. The NPC
profile describes character identity, personality, speech, relationships, and
world knowledge. Tool access belongs to Runtime / Policy: it determines what the
testing session may do, not what the character "is capable of" in-world.

### 2.2 No New Data Type (CharacterCard)

Existing entity/asset composition types already carry the structured data:

```
DashboardCreativeEntityDetail = identity + bindings + visualDrafts + relationships + occurrences
CharacterRecord               = canonicalName, aliases, role, gender, ageRange
CharacterMetadata              = personality[], voiceActor
VisualFactSuggestion           = hair, outfit, age, expression, skin_tone
```

A `CharacterCard` type would duplicate these fields. Instead, we introduce a **projector function** that reads existing entity data and renders an NPC system prompt. The projector is a pure function, not a persisted structure.

However, the existing structured data is **insufficient for rich NPC embodiment**:

| NPC needs | Existing field | Status |
|-----------|---------------|--------|
| Name, aliases | `CharacterRecord.canonicalName/aliases` | Available |
| Role | `CharacterRecord.metadata.role` | Available (sparse) |
| Gender, age | `CharacterRecord.metadata.gender/ageRange` | Available (sparse) |
| Personality traits | `CharacterMetadata.personality[]` | Available when asset entity exists |
| Appearance | `VisualFactSuggestion` | Available when visual draft exists |
| **Backstory** | — | **Missing** |
| **Speech pattern** | — | **Missing** |
| **Goals / motivation** | — | **Missing** |
| **Knowledge boundary** | — | **Missing** |
| **Dialogue samples** | Script (`.fountain`) | Requires extraction |
| **Relationships** | `CreativeEntityGraph` | Structural, currently sparse |

Gap resolution: a two-phase assembly where deterministic data is loaded automatically, and AI-driven extraction (dialogue samples, inferred personality) is offered when the profile is sparse.

### 2.3 Isolated NPC Session, Not Prompt Overlay

| Requirement | Prompt overlay (same session) | Isolated NPC session |
|-------------|-------------------------------|------------------------------|
| No creative tools | Cannot reliably restrict authoring tools | Runtime `toolPolicy: none` enforced |
| Profile-bound behavior | Main session can read project files | NPC session has no project-access tools; evaluator detects leakage |
| Clean history | Mixed with creative conversations | Fresh conversation per NPC test |
| Hard character reset | Prompt removal is soft — "memory" leaks | Session disposal is atomic |
| Multiple characters | Switching prompt is fragile | Create/dispose independent sessions |

`allowedTools` is not an NPC capability field. Existing SubAgent tooling may use
allow lists for creative workers, but NPC testing needs an explicit runtime
policy with three unambiguous modes: no tools, all tools, or allow-list. The NPC
preset must select `none`.

The implemented user-facing lifecycle is `NpcConversationSession` plus
`NpcTestBenchController`. It can reuse SubAgent presets and no-tool runtime
semantics, but the controller does not expose a one-shot worker task to the UI:
it owns multi-turn routing, tab projection, transcript extraction, evaluation,
save policy, and disposal.

### 2.4 `/as @entity` Syntax

```
/as @小明          → Assemble profile → Start NPC session → Enter NPC conversation
/as @小明 --consult → NPC provides advice in character but acknowledges being AI
/as                → Show character picker (MentionMenu filtered to character/entity kind)
/exit-role         → Evaluate/save if requested → Dispose NPC session → Return to main agent conversation
```

The `@` trigger reuses the existing `MentionMenu` infrastructure. When `/as ` is the current prefix, the mention menu filters to `character` and `entity` kinds only.

## 3. Architecture

### 3.1 Data Flow

```
/as @小明
  │
  ├─ Phase 1: Deterministic Assembly (NpcProfileAssembler, entity projection)
  │   ├─ CreativeEntityRegistry.resolveByName('小明')
  │   ├─ EntityAssetBinding.list() → filter portrait/voice
  │   ├─ VisualIdentityDraft → extractedVisualFacts
  │   └─ CharacterMetadata → personality[]
  │
  ├─ Phase 2: AI-Assisted Enrichment (optional, main Agent)
  │   ├─ GetScriptIndex → scenes where character appears
  │   ├─ ReadDocument → extract dialogue samples
  │   ├─ Infer speechPattern from dialogue
  │   └─ User supplements ("小明说话爱用'嘿'")
  │
  ├─ NpcProfileProjector.render(source) → NPC system prompt
  │
  └─ NpcConversationSession({
       profileSnapshot,
       mode,
       responder: no-tool model responder,
       config: {
         toolPolicy: { kind: 'none' },
         modelTier: 'balanced',
         maxIterations: 12,
       },
     })
       │
       └─ NPC Conversation Session (isolated)
           User ↔ NPC dialogue
```

### 3.2 Module Responsibilities and Package Boundary

```
@neko/shared (contracts only)
  ├─ NpcTestBenchLaunchRequest
  ├─ NpcProfileSource
  ├─ NpcProfileFact / NpcProfileFactSource / NpcProfileFactAuthority
  ├─ NpcTranscriptArtifact
  ├─ NpcEvaluationReport / NpcEvaluationSuggestion
  └─ command/action constants

@neko/entity/projections (deterministic profile assembly)
  └─ NpcProfileAssembler
       ├─ resolveEntity(name) → CreativeEntityRef
       ├─ assembleProfile(ref) → NpcProfileSource
       └─ reads entity facts, bindings, visual drafts, relationships, occurrences

@neko/agent (agent runtime domain)
  ├─ npc-profile-projector.ts (pure function)
  │    └─ projectNpcSystemPrompt(source: NpcProfileSource) → string
  ├─ npc-evaluator-projector.ts (pure function)
  │    └─ projectNpcEvaluationPrompt(artifact) → string
  ├─ runtime/npc-conversation-session.ts
  │    └─ NpcConversationSession multi-turn facade
  └─ subagent preset registry
       └─ `npc-character`: SpecializedAgentPreset with `toolPolicy: none`

@neko-agent/extension (orchestration)
  └─ NpcTestBenchController
       ├─ handles /as and neko.agent.testNpc
       ├─ calls NpcProfileAssembler
       ├─ creates/disposes NpcConversationSession instances
       ├─ extracts transcript before disposal
       ├─ evaluates transcript + profile snapshot
       ├─ asks whether to persist .neko/npc-tests artifacts
       └─ applies confirmed suggestions through entity-owned operations

Feature packages (Dashboard / Story / Canvas / Assets)
  └─ invoke the shared command or dashboard action only
       └─ never import @neko/agent or @neko-agent/extension internals
```

The cross-package capability is the **contract and launch path**, not the whole
NPC implementation. Entity/profile data can be assembled outside the Agent
package, while NPC session lifecycle and conversation UI remain Agent-owned.

### 3.3 Dependency Direction and Cycle Avoidance

Safe dependency direction:

```
@neko/shared
  ↑
@neko/entity
  ↑
@neko-agent/extension
  ├─→ @neko/agent
  └─→ @neko/entity

Dashboard / Story / Canvas / Assets
  └─command or capability request→ @neko-agent/extension
```

Forbidden edges:

- `@neko/shared → @neko/entity` — shared contains DTOs, type guards, and constants only.
- `@neko/entity → @neko/agent` — entity projection must not know about SubAgents, prompts, tools, or LLMs.
- `@neko-dashboard → @neko/agent` or `@neko-dashboard → @neko-agent/extension` imports — Dashboard delegates through actions/commands.
- `@neko/agent → @neko/entity` for deterministic assembly — Agent consumes `NpcProfileSource`; it does not read entity stores directly.

Cycle prevention rules:

1. Put `NpcProfileSource`, transcript, evaluation, launch request, and command constants in `@neko/shared`.
2. Put deterministic profile assembly in `@neko/entity/projections`.
3. Put prompt/evaluator projection and `npc-character` preset in `@neko/agent`.
4. Put `/as`, `neko.agent.testNpc`, NPC session lifecycle, transcript extraction, and `.neko/npc-tests` persistence in `@neko-agent/extension`.
5. Other feature packages only emit `NpcTestBenchLaunchRequest` or `DashboardCreativeEntityAction: 'test-npc'`.

### 3.4 Shared Contract Sketch

```typescript
export type NpcTestMode = 'roleplay' | 'consult';

export type NpcProfileFactSource =
  | 'registry'
  | 'asset-metadata'
  | 'visual-draft'
  | 'relationship-graph'
  | 'occurrence-index'
  | 'script-extraction'
  | 'agent-inferred'
  | 'user-supplement';

export type NpcProfileFactAuthority = 'confirmed' | 'suggested';

export interface NpcProfileFact<T = unknown> {
  readonly key: string;
  readonly value: T;
  readonly source: NpcProfileFactSource;
  readonly authority: NpcProfileFactAuthority;
  readonly confidence?: number;
}

export interface NpcProfileSource {
  readonly entityRef: CreativeEntityRef;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly facts: readonly NpcProfileFact[];
  readonly dialogueSamples?: readonly string[];
  readonly sceneAppearances?: readonly string[];
  readonly relationships?: readonly NpcProfileFact<{ name: string; relation: string }>[];
  readonly userSupplements?: string;
  readonly sparsity: 'thin' | 'partial' | 'rich';
}

export interface NpcTestBenchLaunchRequest {
  readonly entityRef: CreativeEntityRef;
  readonly mode?: NpcTestMode;
  readonly enrichment?: 'ask' | 'skip' | 'auto';
  readonly source?: 'slash-command' | 'dashboard' | 'story' | 'canvas' | 'asset';
}
```

`authority: 'suggested'` facts may be used in prompt construction only when
clearly labelled as uncertain. They must not be written back to entity metadata
without explicit user confirmation.

### 3.5 NPC System Prompt Template

```markdown
# You are {name}

{displayName} ({aliases}).

## Identity
- Role: {role}
- Age: {ageRange}
- Gender: {gender}

## Personality
{personality as prose, not bullet list}

## Appearance
{visual facts rendered as natural description}

## Relationships
{relationships as "You know {name} — they are your {relation}"}

## Dialogue Voice
{inferred speech pattern + dialogue samples if available}

## Knowledge Boundary
You appear in these scenes: {sceneAppearances}.
You know these people: {known characters}.
You do NOT know anything outside your experience.
If asked about something you wouldn't know, respond naturally in character.

**Important**: This is a prompt-level behavioral boundary, not a provable
information-security boundary. Runtime `toolPolicy: none` prevents project file
access and creative authoring actions, but the underlying LLM retains its
general world knowledge and may confabulate details that sound plausible but
were never defined in the character data. The evaluator (§6) is specifically
designed to detect such "knowledge leakage" — treat it as the primary
verification mechanism, not this prompt section alone.

## Rules
- Stay in character at all times
- Do not break the fourth wall
- Do not reference being an AI unless in --consult mode
- Respond with the vocabulary, formality, and emotional range of {name}
- When uncertain, respond as {name} would — with curiosity, deflection, or honest ignorance
- Do not invent backstory, relationships, or world facts that are not listed above — prefer honest ignorance over confabulation
```

### 3.6 Sparse Profile Handling

When Phase 1 assembly yields a thin profile (e.g., only name + aliases, no personality or dialogue):

```
Agent: "小明的角色数据较少（仅有名字和别名）。
        选择操作：
        [1] 直接开始 — NPC 会基于名字即兴发挥
        [2] 从剧本提取 — 我先从 .fountain 文件中收集小明的对白和出场信息
        [3] 手动补充 — 你来描述小明的性格和背景"
```

Option 2 triggers Phase 2 (AI-assisted enrichment) before spawning the NPC.

### 3.7 SubAgent Preset

```typescript
// subagent/npc-preset.ts

export type AgentToolPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'allow-list'; readonly tools: readonly string[] };

export const NPC_CHARACTER_PRESET: SpecializedAgentPreset = {
  description: 'AI NPC character for interactive validation testing',
  systemPrompt: '',  // Dynamically generated per character
  toolPolicy: { kind: 'none' },  // Runtime isolation, not an NPC profile capability
  defaultModelTier: 'balanced',
  defaultMaxIterations: 12,
};
```

`toolPolicy: { kind: 'none' }` means the NPC session receives an empty tool
registry. This must not be encoded as `allowedTools: []`, because an empty allow
list can be ambiguous in existing worker-agent tooling. If future NPC tests need
voice preview, facial expression, or game-world actions, those should be modeled
as NPC interaction affordances (for example `speak`, `emote`, `look-at-user`),
not as creative authoring tools.

Added to `SpecializedAgentType`:

```typescript
export type SpecializedAgentType =
  | 'code-search'
  | 'file-explorer'
  // ... existing
  | 'npc-character';  // ← new
```

## 4. Dashboard Integration

### 4.1 New Entity Action

```typescript
export type DashboardCreativeEntityAction =
  | 'open-source'
  | 'show-detail'
  // ... existing
  | 'test-npc';       // ← new
```

### 4.2 Dashboard UI

```
Entity row in Dashboard:
┌──────────────────────────────────────────────────┐
│  🎭 小明  protagonist  confirmed  [3 occurrences]│
│  └─ [Details] [Generate Material] [💬 Test NPC]  │
└──────────────────────────────────────────────────┘
```

### 4.3 Invocation Path

```
Dashboard [💬 Test NPC] click
  → Webview sends DashboardCreativeEntityActionRequest(action: 'test-npc')
  → Dashboard extension routes request to CreativeEntitySourceAggregator
  → Owning source / host adapter validates the entity ref
  → vscode.commands.executeCommand('neko.agent.testNpc', NpcTestBenchLaunchRequest)
  → Focus Agent panel
  → NpcTestBenchController.start(request)
  → NpcProfileAssembler.assembleProfile(entityRef)
  → NpcConversationSession starts with no-tool responder config
  → Open NPC conversation tab
```

Both the Story-backed source and the neutral `@neko/entity` source may expose
`test-npc`. The Dashboard Webview never imports Agent internals and never
assembles profiles; it only emits a typed creative entity action request. This
matters because the aggregator can dedupe confirmed rows in favor of the neutral
entity source, so the neutral source must also know how to delegate the action.

### 4.4 VSCode Command

```typescript
vscode.commands.registerCommand(
  'neko.agent.testNpc',
  async (request: NpcTestBenchLaunchRequest) => {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    await chatViewProvider.startNpcTest(request);
  },
);
```

## 5. UI Design

### 5.1 NPC Conversation Tab

The NPC test runs in a **separate conversation session** within the Agent panel, visually distinct from the main chat:

```
Agent Panel:
┌────────────────────────────────────────┐
│  Chat ▼  │  🎭 小明 (NPC Test)  │     │  ← tab bar
├────────────────────────────────────────┤
│                                        │
│  🎭 小明                               │
│  protagonist · 16-18 · 热情开朗         │  ← NPC identity header
│  ──────────────────────────────        │
│                                        │
│  小明: 嘿！你是新来的同学吗？看你面生    │
│        啊，我叫小明！                   │
│                                        │
│  You: 你好，我是刚转来的。              │
│                                        │
│  小明: 哇，转学生！那你之前在哪上学？    │
│        这边的食堂超好吃，走我带你去！    │
│                                        │
├────────────────────────────────────────┤
│  [Input]                    ▶ Send     │
│  [Exit NPC Test]                       │
└────────────────────────────────────────┘
```

### 5.2 NPC Identity Header

Shows assembled profile summary. Clicking it reveals the full NPC profile used for the system prompt (for debugging/tuning).

### 5.3 NPC Conversation Kind

```typescript
export type ConversationKind = 'chat' | 'npc-test';
```

NPC test should not extend the existing media-oriented
`SessionMode = 'agent' | 'image' | 'video' | 'audio'`. It is a
conversation/session kind, not a media model routing mode. When
`conversationKind === 'npc-test'`:

- Model selector hidden (uses SubAgent tier)
- Execution mode selector hidden (no tools)
- Media generation bar hidden
- NPC identity header shown
- Exit button prominent

## 6. Feedback Loop (Phase 3)

### 6.0 Storage Scope

NPC context is **project-scoped by default**. A character's identity, world
facts, relationships, and validated NPC behavior belong to the project that
defines that character. They must not be pulled from implicit global memory.

Storage split:

| Data | Scope | Location | Notes |
|------|-------|----------|-------|
| Confirmed character facts | Project, git-tracked | `characters.json` / `neko/entities/*` / entity fact files | Source of truth for reusable character data |
| NPC profile projection | Derived, not persisted | Recomputed from project facts | Avoids duplicating `CharacterCard`-like data |
| Active NPC conversation context | Project runtime session | In memory | Destroyed on exit unless explicitly saved as a test artifact |
| NPC transcript / evaluation | Project-local test artifact | `.neko/npc-tests/*.json` | Gitignored by default; validation evidence, not entity truth |
| User preferences | User/global or project override | `~/.neko/config.json` / `.neko/config.json` | Model tier, save-transcript preference, UI defaults |

Global storage may hold user preferences or explicitly installed reusable
identity / character packs, but those packs must be imported or bound into the
current project before affecting an NPC profile. Global memory must not inject
character facts such as "小明 is a hot-blooded student" into unrelated projects.

After an NPC test conversation, the main Agent can generate an evaluation:

```
/exit-role
  → Transcript extracted and evaluated
  → User chooses whether to save project-local evidence
  → NPC session disposed
  → Agent: "NPC 测试报告：
     ✅ 人格一致性: 小明始终保持热情开朗的语气
     ⚠️ 知识泄漏: 第 3 轮回复中提到了'期末考试结果'，
        但角色数据中没有定义这一知识
     ❌ 关系空白: 当提到'老张'时 NPC 不认识，
        但剧本中老张是小明的班主任

     建议补充:
     - 添加 relationship: 老张 → 班主任
     - 补充 knowledge: 期末考试相关剧情
     - 添加 catchphrase 或 speech pattern 数据"
```

This feeds back into the entity editing cycle.

### 6.1 NPC Transcript Lifecycle

The evaluation report requires the full NPC conversation as input. Transcript handling:

1. **During session**: NPC conversation is held in the project-scoped NPC session's in-memory message history. It is not written to the main Agent conversation history and is not written to `.neko/memory.md`.
2. **On `/exit-role`**: Before disposing the NPC session, the handler extracts the full transcript and evaluates it against the profile snapshot. The default evaluator uses the structured NPC evaluation prompt with no tools and falls back to a baseline structured report if model evaluation fails.
3. **Persistence decision**: The default save policy asks the user. If accepted, NPC transcripts are saved as lightweight JSON under the current project root at `.neko/npc-tests/{entityId}-{timestamp}.json` containing `{ entityRef, profileSnapshot, transcript[], evaluation }`. This is a **project-local test artifact** (gitignored by default), not a conversation record and not global memory.
4. **Retention**: Kept locally for the user to review or re-run the evaluator. No automatic cleanup — users manage via file explorer or a future `/npc-history` command.

This resolves Open Question §11.3: NPC transcripts are persisted as test artifacts, not as `.nksession.md` or standard conversation records, because they serve a different purpose (validation, not creative work).

### 6.2 AI-Inferred Facts Are Suggestions, Not Authority

Phase 2 AI enrichment (§3.1) may infer personality traits, speech patterns, or relationships from script analysis. These inferences **must not** be written directly into `CharacterRecord.metadata` or `EntityAssetBinding`.

Write-back path:

```
AI infers: "小明说话爱用语气词'嘿'"
  ↓
Presented as suggestion in evaluation report:
  "建议补充 speech pattern: '口语化，爱用嘿'"
  ↓
User confirms → [Apply] button
  ↓
CreativeEntityService.updateMetadata(entityId, { speechPattern: '...' })
```

This follows the existing `CreativeEntityCandidateStatus` pattern:
AI-discovered facts start as `'suggested'` and require user confirmation before
becoming authoritative.

Evaluator suggestions **do not** map to `EntityAssetRequirement` by default.
`EntityAssetRequirement` is reserved for missing representations or material
needs. Speech pattern, backstory, motivation, knowledge boundary, and
relationship suggestions should use a dedicated shared contract such as
`CreativeEntityFactSuggestion` / `NpcEvaluationSuggestion`, then be applied via
`CreativeEntityService.updateMetadata()` or a relationship update command only
after user confirmation.

## 7. Relationship to Existing Architecture

### 7.1 Operator System

```
/  = Directive   — /as triggers NPC test mode
@  = Reference   — @小明 selects the character entity
                    (combined: /as @小明)
```

No new operator needed. `/as` is a builtin slash command; `@` mention provides entity selection.

### 7.2 SubAgent System

Reuses existing `SubAgentManager` infrastructure:
- New `npc-character` preset added to `SPECIALIZED_PRESETS`
- Explicit `toolPolicy: { kind: 'none' }` for conversation-only NPC
- `NpcConversationSession` facade uses the same no-tool runtime semantics for multi-turn dialogue

### 7.3 IDC Persona

NPC test is **orthogonal** to the IDC stage persona system:
- IDC persona governs the main Agent's behavior (creation-persona / execution-persona)
- NPC session is a separate conversation kind — IDC does not apply to it
- Exiting NPC returns to the main session with its IDC state intact

### 7.4 Skill System

`/as` is a **builtin command**, not a Skill:
- Skills inject prompts into the main session — NPC needs a separate session
- Skills support `$ARGUMENTS` interpolation — NPC needs full profile assembly, not text substitution
- Skills use authoring-tool policy — NPC testing needs runtime isolation plus a character profile, not a skill allow-list

The `/as` command handler lives in `SlashCommandHandler` and delegates to
`NpcTestBenchController`. The controller calls `NpcProfileAssembler` through the
entity projection boundary, then owns NPC session lifecycle and transcript
persistence.

### 7.5 Entity Dashboard

The dashboard's `DashboardCreativeEntityAction` system supports the `test-npc` action natively:
- Dashboard Webview sends `DashboardCreativeEntityActionRequest`
- `CreativeEntitySourceAggregator.executeAction(request)` delegates to the owning source
- The owning source or host adapter dispatches to `neko.agent.testNpc` VSCode command
- Entity detail panel can show a [💬 Test NPC] button
- No Agent imports are added to Dashboard Webview or source aggregation code

## 8. Migration Plan

### Phase 1: NPC SubAgent + /as Command (~4d)

| PR | Scope |
|----|-------|
| PR0 | Add explicit SubAgent `toolPolicy` semantics and verify `none` creates an empty tool registry |
| PR1 | `NpcProfileSource`, launch request, transcript, evaluation, and suggestion DTOs in `@neko/shared` |
| PR2 | `npc-character` SubAgent preset + `SpecializedAgentType` extension |
| PR3 | `NpcProfileAssembler` in `@neko/entity/projections` for Phase 1 deterministic assembly |
| PR4 | `/as` + `/exit-role` builtin commands + SlashCommandHandler routing |
| PR5 | `NpcTestBenchController` in `@neko-agent/extension` for launch, NPC session lifecycle, and disposal |
| PR6 | NPC conversation session UI (tab header, identity header, exit button) |

### Phase 2: Dashboard + Enrichment (~2d)

| PR | Scope |
|----|-------|
| PR7 | `test-npc` DashboardCreativeEntityAction + `neko.agent.testNpc` command |
| PR8 | Phase 2 AI-assisted enrichment (script extraction, sparse profile prompt) |

### Phase 3: Feedback Loop (~3d)

| PR | Scope |
|----|-------|
| PR9 | NPC transcript extraction + `.neko/npc-tests/` persistence (§6.1) |
| PR10 | Post-test evaluation report generation (transcript + profile snapshot → evaluator prompt) |
| PR11 | One-click `NpcEvaluationSuggestion` → entity metadata/relationship write-back with user confirmation (§6.2) |

Total: ~9d, 11 PRs.

## 9. Implementation Status

The OpenSpec change `implement-npc-character-test-bench` is implemented. The
original five integration gaps have been closed and covered by targeted tests:

| Gap | Current status |
|-----|----------------|
| `/as` / `/exit-role` builtin registration and dispatch | Closed. Builtin slash command routing delegates both commands to `NpcTestBenchController`. |
| Dashboard `test-npc` action | Closed. Dashboard delegates `test-npc` to `neko.agent.testNpc` through source/host action handling. |
| Webview NPC session UI | Closed. NPC tabs render `NpcSessionHeader`, route NPC `sendMessage` to the controller, route NPC exit events, and hide creative controls. |
| Relationship / occurrence readers | Closed at the NPC boundary. `createDashboardNpcProfileEvidenceReader()` reads all available Dashboard source details, merges relationship and occurrence evidence, and dedupes projections. Remaining sparsity depends on upstream entity graph / occurrence-index providers. |
| InputArea NPC mode awareness | Closed. `input-area-presenter` uses the NPC conversation kind to hide model, execution mode, and media generation controls. |

Default project enrichment is also implemented. When a thin profile chooses
`Extract project evidence`, `NpcTestBenchController` first uses an injected
`enrichProfile` dependency when present; otherwise it falls back to
`defaultEnrichNpcProfile()`. The default path:

- converts project-scoped dialogue samples, scene appearances, and relationships into `suggested` profile facts;
- optionally asks the selected chat model to infer supported profile facts with `tools: []` and `toolChoice: 'none'`;
- labels model-derived facts as `agent-inferred` and `suggested`;
- never writes inferred facts back to entity metadata without user confirmation.

### 9.1 Remaining Non-Blocking Data-Quality Work

| Item | Status |
|------|--------|
| Richer AI enrichment | Non-blocking P2+. The default implementation extracts facts from existing profile evidence and can run a no-tool LLM inference step. Better script-semantic extraction, long-form backstory inference, and richer speech-pattern mining remain upstream enrichment improvements, not blockers for NPC launch. |
| Relationship / occurrence data depth | Non-blocking data pipeline work. NPC readers are connected to Dashboard detail and aggregate multiple sources. If `DashboardCreativeEntityDetail.relationships` or `.occurrences` is sparse, the fix belongs in the owning entity graph, occurrence index, or source provider, not in NPC session logic. |

## 10. Alternatives Considered

### 10.1 Prompt Overlay on Main Session

Rejected. The main session has 90+ creative tools, project file access, and mixed conversation history. An NPC that can `ReadDocument` or `GenerateImage` breaks the testing premise.

### 10.2 New CharacterCard Data Type

Rejected. `DashboardCreativeEntityDetail` + `CharacterRecord` + `CharacterMetadata` + `VisualFactSuggestion` already carry the structured data. A CharacterCard would duplicate these fields. The NPC system prompt is a **projection** (function output), not a **persisted entity**.

### 10.3 Skill-Driven Approach

Rejected for Phase 1. A Skill injects a prompt into the main session — it cannot create an isolated session, restrict tools, or provide a clean conversation context. However, the Phase 2 enrichment step (extracting dialogue from scripts) can reuse Skill infrastructure internally.

### 10.4 New `#` Operator

Rejected. `/as @entity` reuses both `/` (command) and `@` (entity selection) without adding cognitive overhead. A third operator is not justified by the feature scope.

## 11. Open Questions

1. **Model selection**: Should users be able to override the NPC model tier? (e.g., use a faster model for quick iteration, powerful model for final validation)
2. **Multi-NPC dialogue**: Phase 2+ could support `/as @小明 @小红` to create two NPC sessions that converse with each other while the user observes. Architecture supports this (multiple isolated NPC conversation sessions) but UX needs design.
3. ~~**NPC persistence scope**~~: Resolved in §6.0-§6.1 — NPC context follows the current project. Transcripts and evaluations are saved as project-local `.neko/npc-tests/{entityId}-{timestamp}.json` test artifacts (gitignored), while global storage is limited to preferences or explicitly installed reusable packs.
4. **Voice preview**: When a character has a voice binding, should the NPC response include TTS playback? (Depends on engine voice synthesis availability.)
5. **Interaction affordances**: Future actions such as emote playback, gaze, gesture preview, or "look at selected scene object" should be modeled as host-side NPC affordances, not as creative authoring tools granted to the NPC model session.
