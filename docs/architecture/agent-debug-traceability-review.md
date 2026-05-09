# neko-agent Debug Logging & Call Chain Traceability Review

> **Date**: 2026-05-09
> **Status**: Review with implementation update
> **Scope**: Debug logging coverage, correlation ID tracing, call chain visibility across all neko-agent sub-packages

---

## 0. 2026-05-09 Implementation Update

The traceability gaps identified in this review have been addressed by the
`improve-agent-traceability-and-session-boundaries` change. The original review
sections below remain as the baseline problem statement; this section records
the current architecture after the implementation.

### 0.1 Trace Contract

- `AgentTraceContext` is defined in `packages/neko-types/src/types/agent-trace.ts`.
- Trace data is always attached under `LogEntry.data.trace` through
  `withAgentTrace()`. The generic `LogEntry` shape is unchanged.
- `createAgentTraceContext()` creates the turn-level trace at session entry, and
  `deriveAgentTraceContext()` derives phase/request traces for session, think,
  act, observe, hook, LLM, tool, compaction, workflow, approval, feedback, and
  subagent paths.
- `turnId` is an agent-level identity generated with `createAgentTurnId()` and is
  independent from Journal `eventId`.

### 0.2 Trace Propagation Boundaries

- `AgentSession.execute()` creates the initial trace from `conversationId`,
  active `runId`, execution mode, and a stable turn identity.
- `AgentExecutor`, think phase, act phase, hook runner, ReAct workflow runner,
  approval engine, feedback bridge, context compaction, and subagent task tools
  receive trace explicitly through typed context/options.
- Platform LLM calls use `ServiceCallContext.trace`; trace is deliberately not
  part of `ServiceOptions`, so provider-specific chat options and projected
  messages remain free of observability metadata.
- Tool execution uses `ToolExecuteOptions.trace`; model-authored tool arguments
  remain unchanged and never receive a synthetic `trace` argument.
- Tests cover provider payload isolation, tool argument isolation, and
  reconstruction of one turn from session/executor/LLM/tool/debug logs.

### 0.3 Logger / EventBus / Journal Separation

Logger, EventBus, and Journal are complementary channels:

| Channel | Responsibility | Payload Shape |
|---------|----------------|---------------|
| Logger | Real-time developer debugging: how/why a decision happened | `data.trace`, summary counts, durations, decisions, error summaries |
| EventBus | Runtime milestone fan-out and in-process subscribers | Domain events such as stage activation, apply committed, autoheal, run ended |
| JournalWriter | Durable audit/replay trail | High-level persisted events; replay does not depend on debug logs |

Key workflow milestones may be written to both EventBus and Logger, but with
different semantics. For example, IDC stage activation still emits the workflow
event while Logger records `neko.agent.workflow.stage_activation.decided` with
trace, task shape, entry signal, activated stages, terminal stage, and decision
duration.

### 0.4 Current Debug Coverage

The execution hot path now emits structured debug summaries for:

- session start, done, error, and end;
- ReAct iteration start/end and think/act/observe phase summaries;
- hook entry/exit, duration, mutation status, and failure/skip reasons;
- LLM request/response summaries with linked request trace;
- tool request/result/partition summaries with linked tool request trace;
- context compaction check, skip, manual start, completed, and failed;
- IDC stage activation decisions;
- approval evaluation, confirmation request/fallback, and decision summaries;
- feedback cycle skipped/captured and tool-result observation summaries;
- subagent spawn, resume, completed, output, and failure lifecycle summaries.

Raw prompts, full provider messages, full model responses, raw tool arguments,
and raw tool results remain restricted to existing `.raw` debug log messages.

### 0.5 Validation Anchors

- `packages/neko-types/src/types/__tests__/agent-trace.test.ts`
- `packages/neko-types/src/logger/__tests__/captured-log-transport.test.ts`
- `packages/neko-agent/packages/agent/src/__tests__/execution-traceability.integration.test.ts`
- `packages/neko-agent/packages/agent/src/__tests__/execution-runtime-summary-trace.test.ts`
- `packages/neko-agent/packages/agent/src/tools/__tests__/tool-registry-trace.test.ts`
- `packages/neko-agent/packages/platform/src/service/__tests__/service.test.ts`

## 1. Original Overall Assessment: C+

| Dimension | Grade | Summary |
|-----------|-------|---------|
| Logger infrastructure | A | Structured types, hierarchical child loggers, transport abstraction, diagnostic module |
| Log coverage | D+ | Only 36% of agent modules have any logging; 34 files use `.debug()` |
| Correlation tracing | D | IDs exist (conversationId/runId) but NOT auto-threaded through log entries |
| Call chain visibility | C | LLM + tool calls well-logged; executor/hooks/context invisible |
| Event audit trail | B+ | EventBus + JournalWriter provide structured milestones |
| Debug-level density | D | 103 debug statements across 351 files (0.3 per file average) |

**Bottom line**: A developer tracing a single user message through the pipeline sees LLM requests and tool calls clearly, but everything in between — the executor loop, hook chain, context compression, stage activation, skill injection — is a black box.

---

## 2. Logger Infrastructure (A)

The logger system at `packages/neko-types/src/logger/` is well-designed:

- **4 levels**: Debug(0), Info(1), Warn(2), Error(3), Off(4)
- **Hierarchical**: `child(subSource)` creates nested loggers (e.g. `'Agent' → 'Agent:ThinkPhase'`)
- **Structured**: `LogEntry` has `timestamp`, `source`, `message`, `data?`, `error?`
- **Pluggable transport**: `ILogTransport` interface; `ConsoleTransport` default
- **Registry pattern**: `createLoggerRegistry(packageName, defaultLevel)` scopes logger factories
- **Diagnostic module**: `classifyCommonFailureReason()` for structured error classification

**Missing from infrastructure**: No built-in correlation/trace ID field in `LogEntry`. IDs are domain-specific and manually included in `data` payloads.

---

## 3. Coverage by Module

### 3.1 Package-Level Coverage

| Package | Total .ts files | Files with logging | Coverage |
|---------|----------------|-------------------|----------|
| agent | 351 | 126 | 36% |
| platform | 94 | 35 | 37% |
| extension | 93 | 50 | 54% |

### 3.2 Critical Module Coverage

| Module | Files | With Logging | Status |
|--------|-------|-------------|--------|
| `executor/` (1,815 LoC) | 9 | 3 (warn/error only) | **CRITICAL GAP** |
| `hooks/` (417 LoC) | 3 | 0 | **ZERO LOGGING** |
| `session/agent-session.ts` | 1 | 1 | Has logging (prompt composition) |
| `skill/skill-injection-coordinator.ts` | 1 | 1 | Has debug logging |
| `approval/approval-engine.ts` | 1 | 1 | Warn-only |
| `context/` | 10 | 5 | 50% |
| `subagent/` | 12 | 5 | 42% |
| `runtime/` | 56 | 16 | 29% |
| `tools/` | 25 | 12 | 48% |
| `platform/service/service.ts` | 1 | 1 | Comprehensive debug |
| `platform/llm/` | 7 | 3 | 43% |

---

## 4. Execution Path Trace Map

What a developer sees when tracing a user message through the full pipeline:

### 4.1 Session Entry (`agent-session.ts` execute())

```
User Input
  │
  ├── [NO LOG] Input received, execution mode
  ├── [JOURNAL] userMessageEventId written to JSONL
  ├── [NO LOG] Hook stdout appended
  ├── [NO LOG] Plan mode reminder injected
  ├── [NO LOG] IDC run started
  ├── [NO LOG] User message added to history
  ├── [NO LOG] Version log evaluation
  ├── [NO LOG] Feedback cycle captured
  ├── [NO LOG] Memory recall updated
  ├── [NO LOG] System prompt synced
  │
  └── executor.executeStream() called ──►
```

**Verdict**: Session entry is a logging dead zone. Only the JournalWriter captures the raw event.

### 4.2 Executor Dispatch (`agent-executor.ts`)

```
executeStream()
  │
  ├── [NO LOG] startTime = Date.now()
  ├── [NO LOG] onExecuteStart hook
  ├── [NO LOG] setState('think')
  │
  ├── for each iteration:
  │   ├── [NO LOG] Think phase start
  │   ├── think-phase.ts ──► (see 4.3)
  │   ├── [NO LOG] Think phase end
  │   ├── [NO LOG] setState('act')
  │   ├── act-phase.ts ──► (see 4.4)
  │   ├── [NO LOG] Act phase end
  │   ├── [NO LOG] setState('observe')
  │   └── [NO LOG] Iteration complete
  │
  ├── [NO LOG] onExecuteEnd hook
  └── [NO LOG] Total timing computed but not logged
```

**Verdict**: The core ReAct loop is completely invisible in logs. Zero debug/info calls.

### 4.3 Think Phase (`think-phase.ts`)

```
prepareThinkContext()
  │
  ├── [NO LOG] beforeThink hooks run
  ├── [NO LOG] Tool filter computed
  ├── [NO LOG] Tool definitions built
  │
  └── service.chat() ──►
       │
       ├── [DEBUG] 'neko.agent.llm.request' (requestId, routing, message summary)
       ├── [DEBUG] 'neko.agent.llm.request.raw' (full prompt, messages, tools)
       │
       ├── ... LLM API call ...
       │
       ├── [DEBUG] 'neko.agent.llm.response' (requestId, duration, usage, finish reason)
       ├── [DEBUG] 'neko.agent.llm.response.raw' (full message content)
       └── [WARN]  'Response truncated' (only if max_tokens hit)

  post-processing:
  ├── [NO LOG] Tool calls extracted and parsed
  ├── [NO LOG] Think tags stripped
  ├── [NO LOG] afterThink hook runs
  └── [NO LOG] AgentStep assembled
```

**Verdict**: LLM call itself is well-instrumented (4 debug logs per call). Everything before and after is silent.

### 4.4 Act Phase (`act-phase.ts`) → Tool Registry

```
executeToolCalls()
  │
  ├── [NO LOG] beforeAct hooks run
  ├── [NO LOG] Tool calls partitioned (concurrent vs serial)
  │
  ├── for each tool call:
  │   ├── [DEBUG] 'neko.agent.tool.execute.request' (requestId, toolName, argSummary)
  │   ├── [DEBUG] 'neko.agent.tool.execute.request.raw' (full args)
  │   │
  │   ├── ... tool execution ...
  │   │
  │   ├── [DEBUG] 'neko.agent.tool.execute.result' (toolName, duration, success, resultSummary)
  │   ├── [DEBUG] 'neko.agent.tool.execute.result.raw' (full result)
  │   └── [WARN]  'neko.agent.tool.execute.failed' (on exception)
  │
  ├── [NO LOG] afterAct hooks run
  └── [NO LOG] Tool results assembled
```

**Verdict**: Tool execution is the best-instrumented layer (4 debug logs per tool call). But hook execution around it is invisible.

### 4.5 ReAct Loop Runner (`react-loop-runner.ts`)

```
beforeThink hook (per iteration):
  │
  ├── [NO LOG] Task shape classified
  ├── [NO LOG] Entry signal derived
  ├── [NO LOG] Stage activation planned
  ├── [EVENT] execution.round.activation.decided (to EventBus, not stderr)
  └── [NO LOG] Stage tracker notified

afterAct hook:
  │
  ├── [NO LOG] Tool results tracked
  ├── [EVENT] execution.apply.committed (to EventBus)
  ├── [NO LOG] Autoheal chain invoked
  ├── [ERROR] 'Autoheal chain threw' (only on exception)
  └── [EVENT] execution.autoheal.* (to EventBus)

onExecuteEnd hook:
  │
  ├── [EVENT] creation.run.ended (to EventBus)
  └── [NO LOG] Run status finalized
```

**Verdict**: Stage activation decisions go to EventBus (structured but not stderr-visible). Only error-level logging on failures.

### 4.6 Hook Chain (`hooks.ts` + `executor-hooks-factory.ts`)

```
Hook chain execution:
  │
  ├── MemoryHooks.beforeThink()
  │   └── [NO LOG] Context compressed (result invisible)
  │
  ├── ValidationHooks.beforeThink()
  │   └── [NO LOG] Input validated
  │
  ├── PermissionHooks.beforeAct()
  │   └── [NO LOG] Permission checked
  │
  ├── RetryHooks.onToolCall()
  │   └── [NO LOG] Retry decision made (count tracked but not logged)
  │
  └── Custom hooks
      └── [NO LOG]
```

**Verdict**: 417 LoC of hook logic with ZERO logging. This is the most critical traceability gap — hooks modify context, validate, compress, and retry, all invisibly.

---

## 5. Correlation ID Analysis

### 5.1 IDs That Exist

| ID | Format | Scope | Generated In |
|----|--------|-------|-------------|
| `conversationId` | `workDirHash-ulid` | Session | AgentSession init |
| `runId` | ulid | IDC run | IdcRunStore |
| `requestId` (LLM) | `llm-${base36Time}-${seq}` | Single LLM call | service.ts |
| `requestId` (tool) | `tool-${base36Time}-${seq}` | Single tool call | tool-registry.ts |
| `eventId` | ulid | Journal entry | JournalWriter |

### 5.2 The Correlation Gap

```
conversationId ──┐
                  │  (NO LINK)
runId ───────────┤
                  │  (NO LINK)
llm-requestId ───┤
                  │  (NO LINK)
tool-requestId ──┘
```

Each ID lives in its own scope. There is no mechanism to:
- Link an LLM request to the iteration that triggered it
- Link a tool execution to the LLM response that requested it
- Link any of these to the conversationId/runId
- Reconstruct the call chain from logs alone

### 5.3 What Tracing Would Look Like (Current vs Ideal)

**Current logs** (debug level enabled):
```
[14:23:01.123] [Platform:Service] neko.agent.llm.request { requestId: 'llm-abc123-1', routing: { modelId: 'claude-4', providerId: 'anthropic' }, messageCount: 5 }
[14:23:03.456] [Platform:Service] neko.agent.llm.response { requestId: 'llm-abc123-1', duration: 2333, usage: { prompt: 1200, completion: 340 } }
[14:23:03.460] [Agent:ToolRegistry] neko.agent.tool.execute.request { requestId: 'tool-def456-1', toolName: 'ReadFile', argSummary: { keyCount: 1 } }
[14:23:03.480] [Agent:ToolRegistry] neko.agent.tool.execute.result { requestId: 'tool-def456-1', toolName: 'ReadFile', duration: 20, success: true }
```

**Missing context**: Which conversation? Which iteration? Why was this tool called? What hooks ran? What stage? Was context compressed before this LLM call?

**Ideal logs** (with correlation):
```
[14:23:01.123] [Agent:Session] execute.start { conversationId: 'abc-ulid', runId: 'run-001', mode: 'auto', input: '...(truncated)' }
[14:23:01.124] [Agent:Hooks] beforeThink { conversationId: 'abc-ulid', iteration: 1, hooks: ['memory', 'validation', 'permission'] }
[14:23:01.125] [Agent:Hooks] memory.compress { conversationId: 'abc-ulid', before: 12000, after: 8000, ratio: 0.67 }
[14:23:01.126] [Agent:Executor] think.start { conversationId: 'abc-ulid', iteration: 1, toolCount: 15, model: 'claude-4' }
[14:23:01.127] [Platform:Service] llm.request { requestId: 'llm-abc123-1', conversationId: 'abc-ulid', iteration: 1, ... }
[14:23:03.456] [Platform:Service] llm.response { requestId: 'llm-abc123-1', conversationId: 'abc-ulid', ... }
[14:23:03.457] [Agent:Executor] think.end { conversationId: 'abc-ulid', iteration: 1, toolCalls: 1, duration: 2333 }
[14:23:03.458] [Agent:Hooks] beforeAct { conversationId: 'abc-ulid', iteration: 1, toolCalls: ['ReadFile'] }
[14:23:03.459] [Agent:ToolRegistry] tool.request { requestId: 'tool-def456-1', conversationId: 'abc-ulid', iteration: 1, ... }
[14:23:03.480] [Agent:ToolRegistry] tool.result { requestId: 'tool-def456-1', conversationId: 'abc-ulid', ... }
[14:23:03.481] [Agent:Hooks] afterAct { conversationId: 'abc-ulid', iteration: 1, results: [{ tool: 'ReadFile', success: true }] }
```

---

## 6. Event System vs Debug Logging

The architecture has two parallel observability systems that serve different purposes:

| Aspect | EventBus | Logger |
|--------|----------|--------|
| Purpose | Structured audit trail | Real-time developer debugging |
| Granularity | High-level milestones | Fine-grained operations |
| Persistence | JournalWriter (JSONL) | Console/OutputChannel (ephemeral) |
| Correlation | Always carries `runId` | Rarely carries IDs |
| Consumers | ArtifactWatcher, FeedbackCoordinator, UI | Developer eyes |
| Coverage | 18+ event channels | Sparse (36% of modules) |

**The problem**: EventBus covers the "what happened" audit trail well (run started, stage decided, artifact written, quality evaluated). But it does NOT cover the "why/how" debug trail (why was this tool chosen, how was context compressed, what did the hook chain do).

These are complementary, not competing. The EventBus should not replace debug logging.

---

## 7. Specific Gaps by Severity

### 7.1 P0: Executor + Hook Chain (Zero Visibility)

**Files with zero debug logging in the execution hot path**:

| File | Lines | Role | Impact |
|------|-------|------|--------|
| `agent-executor.ts` | 471 | ReAct loop orchestrator | Cannot trace iteration boundaries |
| `act-phase.ts` | 249 | Tool dispatch orchestrator | Cannot trace concurrent/serial partition |
| `think-phase.ts` | 457 | LLM call orchestrator | Cannot trace tool filter or hook effects |
| `executor-hooks-factory.ts` | 176 | Hook chain assembly | Cannot trace hook composition |
| `hooks.ts` | 222 | Memory/retry/validation hooks | Cannot trace context modifications |

**Total**: 1,575 LoC of core execution path with effectively zero debug logging.

### 7.2 P0: Missing Correlation ID Threading

No mechanism to link:
- `conversationId` → `runId` → `iteration` → `llm-requestId` → `tool-requestId`

Without this, logs from concurrent sessions or subagents are impossible to disentangle.

### 7.3 P1: Context Compression Invisible

`autoCompactIfNeeded()` runs in session.execute() but:
- No log of when compression triggers
- No log of token count before/after
- No log of compression ratio
- No log of what was summarized vs preserved
- Only logs on failure (circuit breaker open)

### 7.4 P1: Stage Activation Decisions Not Logged

`react-loop-runner.ts` classifies task shape, derives entry signal, plans stages — all without logging. These decisions go to EventBus only, which requires a separate event viewer to inspect.

### 7.5 P1: Subagent Lifecycle Silent

`subagent-manager.ts` (649 LoC):
- Only error-level logging
- No debug on: task delegation, permission bridge, sidechain sync, model tier resolution
- Cannot trace why a subagent was spawned or what tools it received

### 7.6 P2: Approval Engine Decisions

`approval-engine.ts`:
- Only warn-level logging
- No debug on: which strategy pack matched, what context was evaluated, escalation reasons

### 7.7 P2: Skill Injection Partially Logged

`skill-injection-coordinator.ts` has debug logging for injection requests and results — this is a positive example. But:
- No log of Track D (ToolSet activation) details
- No log of rollback on failure

---

## 8. Recommendations

### 8.1 P0: Introduce Trace Context

```typescript
interface TraceContext {
  conversationId: string;
  runId?: string;
  iteration?: number;
  phase?: 'think' | 'act' | 'observe';
}

// Create at session.execute() entry
const trace: TraceContext = {
  conversationId: this._config.conversationId,
  runId: this._runStore?.getActive()?.id,
};

// Thread through executor → phases → hooks → service
// Every logger.debug() call includes trace in data payload
```

### 8.2 P0: Instrument Executor Hot Path

Add debug logging at 8 critical points in the ReAct loop:

```
1. execute.start        → { conversationId, mode, inputLength }
2. iteration.start      → { iteration, maxIterations }
3. think.start          → { toolCount, model, contextTokens }
4. think.end            → { toolCallCount, finishReason, duration }
5. act.start            → { toolCalls: [name], concurrent/serial }
6. act.end              → { results: [{ tool, success, duration }] }
7. iteration.end        → { iteration, cumulativeTokens }
8. execute.end          → { totalIterations, totalDuration, totalTokens }
```

### 8.3 P0: Instrument Hook Chain

Add entry/exit debug logging for each hook:

```
hook.beforeThink.start  → { hookName, contextMessageCount }
hook.beforeThink.end    → { hookName, modified: boolean, duration }
hook.compress           → { before: tokens, after: tokens, ratio }
hook.retry              → { toolName, attempt, maxAttempts, backoff }
```

### 8.4 P1: Context Compression Metrics

Log when auto-compact triggers:

```
context.compact.trigger  → { tokenCount, threshold, trigger: 'auto'|'manual' }
context.compact.result   → { before, after, ratio, summaryCount, duration }
context.compact.skip     → { reason, failureCount, circuitOpen }
```

### 8.5 P1: Stage Activation Debug

Log stage decisions to both EventBus AND logger:

```
stage.classify           → { taskShape, entrySignal, roundIndex }
stage.activate           → { decision: { stages, terminal }, runId }
stage.transition         → { from, to, trigger }
```

### 8.6 P2: Subagent Lifecycle

```
subagent.spawn           → { parentId, subagentId, type, toolCount }
subagent.complete        → { subagentId, status, duration, tokenUsage }
subagent.error           → { subagentId, error, retryable }
```

---

## 9. Logging Density Target

Current state vs recommended:

| Module | Current debug calls | Target | Gap |
|--------|-------------------|--------|-----|
| executor/ (1,815 LoC) | ~5 (warn/error) | 20-25 | +15-20 |
| hooks/ (417 LoC) | 0 | 10-12 | +10-12 |
| session execute() (~200 LoC) | 0 | 6-8 | +6-8 |
| context/ (10 files) | ~10 | 20 | +10 |
| react-loop-runner (484 LoC) | 2 (error only) | 8-10 | +6-8 |
| subagent/ (12 files) | ~3 (error only) | 10-12 | +7-9 |
| approval/ | ~2 (warn only) | 6-8 | +4-6 |
| platform/service.ts | ~10 (good) | 10-12 | OK |
| tools/tool-registry.ts | ~8 (good) | 8-10 | OK |

**Total gap**: ~55-75 debug log statements needed to achieve reasonable traceability.

---

## 10. Summary

The logging infrastructure (Logger API) is well-designed but severely under-utilized. The two best-instrumented points — `service.ts` (LLM calls) and `tool-registry.ts` (tool execution) — show what good debug logging looks like. But these are islands in a sea of silence.

The core execution path (executor → think → act → hooks) has effectively zero debug logging. A developer investigating a bug in the ReAct loop, context compression, or hook behavior has no log trail to follow.

The EventBus provides structured milestones (run started, stage decided, artifact written) but is designed for audit/observability, not debugging. It captures the "what" but not the "why/how."

**Three highest-impact improvements**:
1. Thread a `TraceContext` (conversationId + runId + iteration) through all log calls
2. Add 8 debug log points in the executor ReAct loop
3. Add entry/exit debug logging for each hook in the hook chain
