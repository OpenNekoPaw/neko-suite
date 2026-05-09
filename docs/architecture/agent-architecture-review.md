# neko-agent Architecture Review

> **Date**: 2026-05-09
> **Status**: Review with implementation update
> **Scope**: Abstraction / Composition / Decoupling / Reuse across all neko-agent sub-packages

---

## 0. 2026-05-09 Implementation Update

The `improve-agent-traceability-and-session-boundaries` change has converted the
highest-risk `AgentSession` state ownership into focused runtime collaborators
while preserving `IAgentSession` as the CLI/Extension/TUI facade. The original
review remains below as the baseline assessment; this section records the
current boundary after the first extraction pass.

### 0.1 Current AgentSession Facade Boundary

`AgentSession` still owns the public session API and the turn-level execution
entry point, but the following subdomains now have explicit collaborators:

| Collaborator | Responsibility |
|--------------|----------------|
| `SessionPersistence` | Runtime state restore, persist debounce, flush, subscriptions, and dispose cleanup |
| `IdcRunLifecycle` | IDC run start/restore/close and stage transition buffering |
| `SessionArtifactFacade` | Artifact service access, artifact restore, write context, observed artifact sync queue, and IDC task projection queue |
| `FeedbackRuntimeBridge` | Feedback cycle capture, feedback guidance snapshot, control-plane guidance application, and trace-aware feedback summaries |
| `PromptRuntimeFacade` | Prompt module sync, system prompt composition, and executor prompt-cache updates |

This keeps the facade source-compatible while removing persistence sinks,
timers, artifact queues, feedback cycle state, and IDC stage transition buffers
from direct session ownership.

### 0.2 Boundary Guards

`packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts`
now guards the most important architectural constraints:

- Webview must not import runtime, platform, ai-sdk, or `vscode` modules.
- Runtime/session collaborators must not import VSCode, React, Webview, or
  Extension-only modules.
- Extension remains a host adapter and must not implement the runtime
  collaborators.
- New private fields in `AgentSession` must be allowlisted, which makes direct
  ownership of persistence sinks, timers, feedback state, artifact sync queues,
  or stage transition buffers visible during tests.
- New `AgentSession` private fields are also classified by high-risk ownership
  category. The guard reports new timer, sink, queue, feedback guidance state,
  stage transition buffer, and prompt module instance fields unless they are an
  approved collaborator reference or explicitly listed as legacy migration debt.

Current legacy field debt is intentionally visible rather than silently accepted:

| Category | Legacy Fields | Target Owner |
|----------|---------------|--------------|
| Prompt module instances | `_memoryProjectModule`, `_memoryRecallModule`, `_creativeVersionLogModule`, `_feedbackGuidanceModule`, `_skillInjectionModule`, `_agentsMdModule`, `_artifactSchemaModule`, `_subpackageFragmentsModule` | `PromptRuntimeFacade` / prompt orchestrator |
| Persistent sinks | `_eventSink`, `_auditsSink`, `_stepsSink`, `_journalWriter` | persistence / event sink facade |
| Pending runtime queue | `_pendingConfirmations` | approval / confirmation bridge |

Approved collaborator references remain allowed: `_sessionPersistence`,
`_artifactFacade`, `_feedbackRuntime`, `_promptRuntime`, and
`_idcRunLifecycle`.

### 0.3 Remaining Risks

This extraction is intentionally incremental. `AgentSession` is still a large
facade and still contains the main execution loop plus some observation,
approval fallback, compaction, history, and feedback parsing logic. The next
natural extractions are:

- `ExecutionOrchestrator` for the remaining execute-loop sequencing;
- `FeedbackObserver` for tool-result observation and quality/consistency parsing;
- a smaller approval/confirmation bridge if confirmation fallback logic grows;
- additional prompt/runtime composition cleanup once prompt module ownership is
  fully stabilized.

The current guard strategy focuses on state ownership and forbidden imports
rather than a hard line-count target. That avoids blocking legitimate facade
code while still preventing the previous pattern of adding new runtime
subdomain state directly to `AgentSession`.

## 1. Package Structure Overview

neko-agent comprises 7 sub-packages with clear layered dependencies:

```
agent-types (zero deps) ──────────────────────────── Foundation
     │
     ├── agent (core runtime, 20+ modules)
     ├── platform (multi-provider LLM abstraction)
     │
     ├── extension (VSCode host)  ← depends on agent + platform
     ├── cli-tui (CLI host)       ← depends on agent + platform
     │
     └── webview (React UI)       ← depends on agent-types only
```

---

## 2. Overall Rating: B+

| Dimension | Grade | Summary |
|-----------|-------|---------|
| Abstraction | A- | Strong interface-driven design; 9 contract files, 7 abstract bases. Undermined by AgentSession God class |
| Composition | A | Hook middleware chain, factory composition, strategy packs — best part of the architecture |
| Decoupling | B+ | DI + registries + adapters; no circular deps. High fan-out in runtime/session modules |
| Reuse | B+ | BaseRegistry, BaseAdapter eliminate duplication. Some registries don't inherit base |
| Test isolation | A- | 229 test files, integration tests for cross-module paths. No shared fixture library |

---

## 3. Architectural Strengths

### 3.1 Composition Patterns (A)

**Hook Middleware Chain** — `createExecutorHooks()` composes 5 layers:
```
Memory → Validation → Permission → Retry → Custom
```
Each layer is independently disableable for A/B testing via AblationToggles.

**Factory Chain** — `AgentSessionFactory` composes 7 sub-factories:
```
initializeProjectMemory()
  → registerCoreRuntimeTools()
    → resolveAgentRuntimePromptFragments()
      → buildAgentRuntimeConfig()
        → buildFeedbackLoop()
          → registerSubAgentRuntime()
            → createAgentSessionWithRuntime()
```
Pure functions with explicit parameter threading.

**Approval Strategy Packs** — `ApprovalEngine` registers `StrategyPack[]` (pure sync functions), evaluation order: paradigm-specific → shared scope → user prompt → auto-reject. Supports `registerPriority()` for short-circuit.

**SessionConfigProjection** — 3-layer merge with fixed precedence (explicit > workflow > capability).

### 3.2 Abstraction Layer (A-)

- **9 contract files** define system boundaries: `agent-state-contract`, `engine-bridge-contract`, `conversation-ui-contract`, `plugin-transfer-contract`, `perception/contracts`, etc.
- **7 abstract base classes**: `BaseAdapter` (LLM), `BaseMediaAdapter` (media), `BaseRegistry` (registry), `SkillMatcher`, `BaseMCPClient`, `BaseEditorModel`, `AISdkAdapter`
- **Executor uses interfaces only**: `IService`, `IToolRegistry`, `IToolGroupRegistry`, `IToolInjectionManager` — not concrete types
- **Unidirectional dependency flow**: executor → session → subsystems (no cycles)

### 3.3 Adapter System (25+)

| Domain | Count | Pattern |
|--------|-------|---------|
| LLM | 8 | Anthropic, Google, OpenAI, Azure, Ollama, Generic + abstract bases |
| Media | 10+ | DashScope, FAL, Luma, Midjourney, Suno, Runway, Vidu, Minimax, LibLib |
| Approval | 3 | Permission, PlanReview, QualityGate |
| Operation | 3 | Canvas, Model, Timeline updates |

### 3.4 Registry Pattern (15+)

`BaseRegistry<TKey, TValue>` provides `get/register/unregister/has/listTypes`. Concrete: `AdapterRegistry`, `MediaAdapterRegistry`, `ProviderRegistry`, `ToolRegistry`, `SkillRegistry`, `ToolGroupRegistry`, `ToolCategoryRegistry`, `ArtifactRegistry`, `StageRegistry`, etc.

### 3.5 Skill Module Cohesion

- 64% internal imports (78 of 121) — focused responsibility
- `SkillInjectionCoordinator` manages 4-track atomic injection (Prompt / Permission / Guard / ToolSet)
- `SkillRegistry.registerLazySkill()` + `ensureLoaded()`: frontmatter resident, content on-demand
- Token baseline reduced from ~60K+ to ~8K (resident only)

---

## 4. Key Problems

### 4.1 P0: AgentSession God Class

**File**: `agent/src/session/agent-session.ts`

| Metric | Value | Healthy Threshold |
|--------|-------|-------------------|
| Total lines | 3,449 | < 800 |
| Class body | 2,413 lines (179–2592) | < 600 |
| Module-level helpers | 857 lines (47 pure functions) | — |
| Private fields | 103 | < 20 |
| Public methods (IAgentSession) | 32 | OK for Facade |
| Methods actually called by CLI | 13 | — |

**The Facade role is legitimate** — CLI and Extension both need a unified agent API, and 32 public methods across 5 semantic domains (config / execution / tool confirmation / history / context) is reasonable granularity. Similar patterns: VS Code's `ExtensionHost`, Jupyter's `KernelSession`, LangChain's `AgentExecutor`.

**The implementation is not** — subsystems already exist (`FeedbackCoordinator`, `ArtifactWatcher`, `StageTracker`, `PromptModuleOrchestrator`) but delegation is incomplete. Large amounts of implementation detail leak into the session layer:

| Area | Est. Lines | Should be in Session? |
|------|-----------|----------------------|
| Constructor + subsystem init | ~250 | Partially — factory should be external |
| `execute()` main loop | ~200 | **Yes** — core responsibility |
| IDC Run lifecycle | ~300 | **No** → `IdcRunLifecycle` |
| Runtime state persistence/restore | ~200 | **No** → `RuntimeStatePersistence` |
| Feedback / quality / consistency detection | ~400 | **No** → logic leaked from `FeedbackCoordinator` |
| Prompt module orchestration | ~150 | Borderline — mostly delegated |
| Artifact write/restore | ~200 | **No** → logic leaked from `ArtifactService` |
| Compression + logging | ~150 | Partially |

**103 private fields breakdown**:
- 10 prompt module instances held directly (should be behind `PromptModuleOrchestrator`)
- 8 persistence sinks/timers (should be behind `SessionPersistence`)
- 6 feedback/approval state fields (should be inside `FeedbackCoordinator`)
- Internal state of subsystems leaked into session (`_feedbackGuidanceState`, `_stageTransitions`)

**Diagnostic**: the problem is not "it does too many things" but "it knows too many details." Subsystems exist but delegation is incomplete.

### 4.2 P1: Platform Service Consolidation

**File**: `platform/src/service/service.ts` (945 lines)

Mixes three concerns:
- Multi-provider chat routing + streaming
- Embedding support
- Image generation + tool calling

**Recommendation**: Split into `ChatService`, `EmbeddingService`, `ImageGenerationService`.

### 4.3 P1: FeedbackCoordinator Size

**File**: `agent/src/feedback/feedback-coordinator.ts` (1,099 lines, 76 methods)

Accumulating responsibilities. Should identify cohesive method groups and extract helper classes.

### 4.4 P1: Runtime Fan-Out

**Module**: `agent/src/runtime/` — 226 outbound imports, only 6 inbound.

Asymmetric coupling. Expected for an orchestration hub, but should audit whether all exports are necessary vs internal-only.

### 4.5 P2: Registry Inheritance Gap

`ToolCategoryRegistry`, `SkillRegistry`, `ToolGroupRegistry` implement the same pattern as `BaseRegistry` but don't inherit it. Each inlines `Map<K, V>` + `get/register/unregister`. Low priority — keeps dependencies light, but creates maintenance duplication.

### 4.6 P2: Config Manager Mixed Concerns

**File**: `platform/src/config/config-manager.ts` (700 lines)

Mixes config management + model discovery + API key validation. Could split into `ConfigManager` + `ModelDiscoveryService`.

---

## 5. Dependency Analysis

### 5.1 Fan-In Hotspots (Most Depended Upon)

| Module | Inbound | Risk |
|--------|---------|------|
| utils/logger | 56 | Stable API mitigates risk |
| skill | 53 | Well-abstracted through interfaces |
| prompt | 34 | Consider facade for composition |
| session | 31 | God class is root issue |

### 5.2 Fan-Out Hubs (Orchestration)

| Module | Outbound | Assessment |
|--------|----------|------------|
| runtime | 226 | Expected; audit export surface |
| skill | 177 | Proper separation of concerns |
| session | 160 | God class symptom |

### 5.3 Circular Dependency Risk: LOW

All critical module pairs show unidirectional dependencies:

| Relationship | Direction |
|-------------|-----------|
| executor → session | Executor: 0 imports from session; Session: 5 from executor |
| skill → executor | Executor: 6 from skill; Skill: 0 from executor |
| skill → session | Session: 4 from skill; Skill: 0 from session |
| context → others | 0 circular imports |

---

## 6. Recommended Refactoring

### 6.1 P0: Thin AgentSession Facade (~600 lines target)

```
AgentSession (Thin Facade)
├── execute()              → delegate → ExecutionOrchestrator
├── configure()            → delegate → SessionConfigManager
├── skill injection        → delegate → SkillInjectionCoordinator (exists)
├── IDC run lifecycle      → delegate → IdcRunLifecycle (new)
├── persistence            → delegate → SessionPersistence (new)
├── feedback observation   → delegate → FeedbackCoordinator (exists, reclaim leaked logic)
├── artifact management    → delegate → ArtifactService (exists, reclaim leaked logic)
└── prompt composition     → delegate → PromptModuleOrchestrator (exists, remove direct refs)
```

**Principle**: Session holds 8-10 subsystem references. Each public method is 1-5 lines of delegation. `execute()` is the only method allowed to contain orchestration logic — but tool feedback parsing, quality thresholds, IDC run snapshot serialization must return to their subsystems.

### 6.2 P1: Platform Service Split

```
Service (945 lines) →
├── ChatService        (chat routing + streaming)
├── EmbeddingService   (embeddings)
└── ImageService       (image generation)
```

### 6.3 P1: FeedbackCoordinator Decomposition

Identify cohesive method groups → extract into:
- `FeedbackObserver` (tool result observation)
- `FeedbackGuidanceManager` (guidance state)
- `FeedbackCycleTracker` (cycle lifecycle)

### 6.4 P2: Registry Base Unification

`ToolCategoryRegistry`, `SkillRegistry`, `ToolGroupRegistry` → extend `BaseRegistry<TKey, TValue>`.

---

## 7. Module Maturity Assessment

| Module | Maturity | Notes |
|--------|----------|-------|
| executor | High | Clean abstraction, minimal dependencies |
| skill | High | 64% internal cohesion, well-isolated |
| context | High | Focused responsibility, low coupling |
| tools | Moderate | Well-structured, some large implementation files |
| hooks | High | Exemplary composition pattern |
| approval | High | Clean strategy-pack design |
| session | Low | God class, needs facade thinning |
| runtime | Low | High fan-out, needs export audit |
| platform/llm | High | Clean adapter pattern |
| platform/service | Low | Multiple concerns in single class |

---

## 8. Appendix: God Class Decision Framework

When is a large class justified vs problematic?

| Trait | Justified Facade | Problematic God Class |
|-------|------------------|----------------------|
| Public methods | Thin delegation (1-3 lines) | Contains business logic |
| Private methods | Few, orchestration only | Many, concrete implementation |
| Fields | Holds subsystem references | Holds subsystem internal state |
| Constructor | Receives assembled deps | Creates and configures deps |
| Typical size | 400-800 lines | 2000+ lines |

**AgentSession current state**:
- Public methods: partially thin, partially logic-heavy ⚠️
- Private methods: many with concrete implementation ❌
- Fields: subsystem refs + leaked internal state ❌
- Constructor: self-creates ApprovalEngine, StageTracker, EventBus ❌

**Conclusion**: The Facade role is legitimate; the current implementation is not. Target: compress class body from 2,413 to ~600 lines through complete delegation.
