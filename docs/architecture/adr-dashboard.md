# ADR: Neko Dashboard — Table-Centric Project Control Panel

- **Status**: Accepted / Implemented baseline (automated gates passed; VSCode manual verification pending)
- **Date**: 2026-05-12
- **Scope**: new package `neko-dashboard` (extension + webview), `@neko/shared` (`packages/neko-types`, shared types + task contract)
- **Related**: `adr-canvas-block-container.md` (canvas node architecture), `format-strategy.md` (project file formats), `vscode-constraints.md`, `openspec/specs/dashboard-project-overview/spec.md`, `openspec/specs/dashboard-runtime-context/spec.md`, `openspec/specs/dashboard-task-monitoring/spec.md`
- **Implementation**: `openspec/changes/archive/2026-05-13-add-neko-dashboard-control-panel/`

---

## 1. Context

### 1.1 Problem

Neko Suite has 11+ creative extensions (cut/canvas/agent/story/sketch/model/puppet/audio/live/preview/assets), each with its own entry point and file format. There is no unified view that answers:

- What projects exist in this workspace?
- What is the status of each creative asset?
- Where did I leave off?
- How do I quickly navigate between creative directions?

Users must remember file paths and manually open `.nkv`, `.nkc`, `.nks`, `.nka` files. There is no "home screen" for the creative workspace.

### 1.2 Why Not Reuse neko-canvas?

neko-canvas is a **semantic orchestration editor** — its core value is spatial arrangement, node connections, and visual workflow composition. A dashboard needs:

| Requirement | Canvas fit | Dashboard fit |
|-------------|-----------|---------------|
| Structured data display (status, dates, progress) | Poor — nodes are spatial, not tabular | Native — tables excel at structured data |
| Zero-file activation (open workspace → see overview) | Poor — requires `.nkc` file | Native — WebviewPanel, no file needed |
| Real-time status aggregation (engine, agent, build) | Unrelated to canvas editing | Core feature |
| Quick navigation (click → open editor) | Possible but overengineered | Simple link/button |
| Spatial layout / connections / ports | Core feature | Not needed |

Canvas solves "how do I arrange and connect creative materials spatially." Dashboard solves "what is the state of my project and where do I go next." These are orthogonal concerns.

### 1.3 Do We Need Nodes, Connections, and Layout?

**No.** The analysis:

| Canvas feature | Dashboard need | Verdict |
|----------------|---------------|---------|
| **Infinite canvas** (pan/zoom/viewport culling) | Dashboard content fits in a scrollable page | Not needed |
| **Node drag & drop** | Projects don't need spatial arrangement | Not needed |
| **Connection system** (ports, type validation, SVG curves) | No dependency graph between projects | Not needed |
| **Snap & alignment** | No free-form positioning | Not needed |
| **History/undo** | Dashboard is read-mostly, no editing to undo | Not needed |
| **Node resize** | Table columns resize, but that's standard table behavior | Not needed |

Importing canvas infrastructure (11K LOC webview, 1400 LOC store, 7 interaction hooks) for a dashboard would violate YAGNI and introduce unnecessary coupling between packages.

---

## 2. Decision

Build a **table-centric dashboard** as a lightweight WebviewPanel. The table is the primary UI primitive — not nodes, not cards, not a canvas.

### 2.1 Core Principles

1. **Table-first** — structured data (projects, assets, sessions) displayed in sortable/filterable tables
2. **Read-mostly** — dashboard observes state, rarely mutates it; actions are navigation commands
3. **Zero-file** — activates on workspace open, no project file required
4. **Lightweight** — target < 3K LOC webview, no canvas/node/connection infrastructure
5. **Aggregation hub** — pulls status from multiple extensions via commands/events, owns no domain data

### 2.2 Architecture

```
┌─────────────────────────────────────────────────────┐
│              VSCode Extension Host                    │
│                                                     │
│  DashboardProvider (WebviewPanel)                    │
│    ├─ ProjectScanner                                │
│    │    └─ Scans workspace for .nkv/.nkc/.nks/.nka  │
│    ├─ TaskAggregator                                │
│    │    └─ DashboardTaskSource adapter registry      │
│    ├─ StatusReader                                  │
│    │    ├─ Engine health (neko.engine.getStatus)     │
│    │    ├─ Agent sessions (neko.agent.getSessionCount)│
│    │    └─ Recent edits (fs.stat mtime)              │
│    └─ NavigationDispatcher                          │
│         └─ vscode.commands → open editors            │
│                                                     │
│         │ postMessage                                │
│         ▼                                            │
│  ┌───────────────────────────────────────────┐      │
│  │         Webview (React 18 + Vite)          │      │
│  │                                           │      │
│  │  DashboardApp.tsx                         │      │
│  │    ├─ [Work Mode]                         │      │
│  │    │    ├─ ProjectTable                   │      │
│  │    │    │    ├─ Sortable columns          │      │
│  │    │    │    ├─ Type filter               │      │
│  │    │    │    ├─ Status badges             │      │
│  │    │    │    └─ Row actions (open/reveal) │      │
│  │    │    ├─ TaskTable                      │      │
│  │    │    │    ├─ Export tasks              │      │
│  │    │    │    ├─ Agent async tasks         │      │
│  │    │    │    └─ Status + progress + cancel│      │
│  │    │    ├─ RecentActivityTable            │      │
│  │    │    ├─ ContextStrip                   │      │
│  │    │    │    ├─ Engine state               │      │
│  │    │    │    ├─ Agent sessions + skills    │      │
│  │    │    │    └─ AccountBadge (future P2)   │      │
│  │    │    └─ QuickActions                   │      │
│  │    │                                      │      │
│  │    └─ [Welcome Mode]                      │      │
│  │         ├─ Creative Workflow Cards        │      │
│  │         ├─ Quick Start (create project)   │      │
│  │         ├─ Installed Skills overview      │      │
│  │         └─ Provider Status                │      │
│  │                                           │      │
│  │  State: useState / useReducer (no Zustand)│      │
│  └───────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

### 2.3 Table Schema

#### ProjectTable (primary view)

| Column | Type | Source | Sortable | Filterable |
|--------|------|--------|----------|------------|
| Name | string | filename | ✓ | text search |
| Type | badge | extension (.nkv→video, .nkc→canvas, .nks→sketch, .nka→audio, .nkm→model, .nkp→puppet) | ✓ | multi-select |
| Status | badge | fs.stat (modified/unmodified since last open) | ✓ | multi-select |
| Last Modified | relative time | fs.stat mtime | ✓ | date range |
| Size | bytes | fs.stat size | ✓ | — |
| Path | truncated path | relative to workspace | — | — |

#### TaskTable (active tasks view)

| Column | Type | Source | Sortable |
|--------|------|--------|----------|
| Task | description | task registry | — |
| Source | badge | neko-cut / neko-canvas / neko-agent | ✓ |
| Type | badge | export / generate-image / generate-video / tts / batch | ✓ |
| Status | badge | queued / running / done / error / cancelled | ✓ |
| Progress | bar + text | task reporter (e.g. 45%, 3/8) | — |
| Started | relative time | task creation timestamp | ✓ |
| Actions | buttons | cancel / retry / reveal output | — |

Task sources and event contracts:

| Source | Task types | Event mechanism | Existing infrastructure | Contract status |
|--------|-----------|----------------|------------------------|----------------|
| neko-cut | Video/audio export | `DashboardTaskSource` adapter | `exportProgress` message (internal to editor/webview) | **Needs new public API** |
| neko-canvas | Batch generation | `DashboardTaskSource` adapter | `generationProgress` message + BatchGenerationScheduler | **Needs new public API** |
| neko-agent | Image/video/music/TTS, SubAgent | `DashboardTaskSource` adapter | `AgentWorkItem` system (already structured) | **Needs adapter wrapper** |
| neko-engine | Render jobs, ML inference | `DashboardTaskSource` adapter | Engine export pipeline progress | **Needs new public API** |

> **Important**: The event names above (e.g. `exportProgress`, `generationProgress`) are currently internal postMessage protocols between each extension's webview and host. They are NOT yet stable cross-extension APIs. P1 implementation requires each source extension to expose a `DashboardTaskSource`-compatible command or event.

#### 2.3.1 Shared Task Contract (`@neko/shared`)

All task contract types live in `@neko/shared/types/dashboard-task.ts` (`packages/neko-types/src/types/dashboard-task.ts`) as Layer 0 zero-dependency DTOs. See §2.3.2 for the full type definitions (`DashboardTask`, `DashboardTaskStatus`, `DashboardTaskEvent`, `DashboardTaskSource`, `DashboardDisposableLike`).

Key invariants:
- **No absolute paths**: output refs store workspace-relative paths or `${VAR}/path` placeholders (per project path system rules); extension host resolves them when user clicks "reveal output"
- **No VSCode type leakage**: `DashboardDisposableLike` replaces `vscode.Disposable` in the shared interface
- **Agent extension fields are optional**: `conversationId` / `workItemKind` only present for agent-sourced tasks
- **Stable task identity**: Dashboard owns display-level `taskId`, while each source owns `sourceTaskId`; cancel/retry calls use a typed task reference so aggregation IDs are never confused with source-local IDs
- **Explicit progress semantics**: `progress` is a percentage in the inclusive range `0..100`; unknown progress is represented by omitting the field
- **Runtime validation required**: Dashboard treats command results as `unknown` at the boundary and accepts a source only after structural validation

#### 2.3.2 Task Source Adapter Interface

Split into two layers per `@neko/shared` three-layer isolation rule:

```typescript
// @neko/shared/types/dashboard-task.ts — Layer 0 (zero-dep DTO)

export type DashboardTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export type DashboardTaskAction = 'cancel' | 'retry' | 'reveal-output';
export type DashboardTaskOutputKind = 'file' | 'folder' | 'url' | 'asset';

export interface DashboardTaskRef {
  readonly source: string;
  readonly sourceTaskId: string;
}

export interface DashboardTaskOutputRef {
  readonly kind: DashboardTaskOutputKind;
  readonly ref: string;          // workspace-relative path OR ${VAR}/path for local refs — never absolute
  readonly label?: string;
}

export interface DashboardTask {
  readonly taskId: string;       // dashboard aggregation id: `${source}:${sourceTaskId}`
  readonly source: string;       // stable extension source id, e.g. `neko-cut`
  readonly sourceDisplayName?: string;
  readonly sourceTaskId: string;
  readonly kind: string;         // export / generate-image / generate-video / tts / batch / render / inference
  readonly title: string;
  readonly status: DashboardTaskStatus;
  readonly progress?: number;    // percentage, 0..100 inclusive; omitted when unknown
  readonly actions: readonly DashboardTaskAction[];
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly outputs?: readonly DashboardTaskOutputRef[];
  readonly currentStep?: string;
  readonly error?: string;
  readonly conversationId?: string;  // agent-specific optional
  readonly workItemKind?: 'media-task' | 'tool-background-task' | 'subagent';
}

export interface DashboardTaskEvent {
  readonly task: DashboardTask;
  readonly type: 'added' | 'updated' | 'removed';
}

export interface DashboardTaskSourceCapabilities {
  readonly cancel?: boolean;
  readonly retry?: boolean;
  readonly revealOutput?: boolean;
}

// Local disposable shape — avoids leaking vscode.Disposable into Layer 0
export interface DashboardDisposableLike {
  dispose(): void;
}

export interface DashboardTaskSource {
  readonly contractVersion: 1;
  readonly source: string;
  readonly sourceDisplayName?: string;
  readonly capabilities?: DashboardTaskSourceCapabilities;
  getSnapshot(): Promise<DashboardTask[]>;
  onDidChangeTask(listener: (event: DashboardTaskEvent) => void): DashboardDisposableLike;
  cancel?(task: DashboardTaskRef): Promise<void>;
  retry?(task: DashboardTaskRef): Promise<void>;
}
```

Note: `DashboardTaskSource` is a pure structural interface. Source extensions may implement it using `vscode.EventEmitter` (whose `Event.dispose` satisfies `DashboardDisposableLike`). Dashboard does not need to know about VSCode types when consuming the interface.

The adapter implementation belongs inside the source extension. For example, `neko-cut` owns the export-to-dashboard mapping and exposes it through `neko.cut.getDashboardTaskSource`; `neko-dashboard` must not import `neko-cut`, `neko-agent`, `neko-canvas`, or `neko-engine` packages directly.

#### 2.3.3 Source Discovery: Pull-First, Push-Optional

Push-only registration has activation-order risk: if a source extension activates before Dashboard, the registration call fails silently. To avoid this, Dashboard uses a **pull-first** discovery model:

```typescript
// Each source extension exposes a programmatic command:
vscode.commands.registerCommand('neko.cut.getDashboardTaskSource', () => cutTaskSource);
vscode.commands.registerCommand('neko.agent.getDashboardTaskSource', () => agentTaskSource);
vscode.commands.registerCommand('neko.canvas.getDashboardTaskSource', () => canvasTaskSource);
vscode.commands.registerCommand('neko.engine.getDashboardTaskSource', () => engineTaskSource);
```

On Dashboard open, `TaskAggregator` iterates over a **known source list** and calls each `get*TaskSource` command. Missing extensions simply return `undefined` — Dashboard degrades gracefully. The known list is an MVP bootstrap mechanism, not a permanent extension registry; future sources should be discoverable through a contribution point or optional push registration without changing dashboard core code.

Push registration (`neko.dashboard.registerTaskSource`) remains as an **optimization** for source extensions that want to announce themselves proactively (e.g. to update an already-open Dashboard), but is never the source of truth for discovery.

| Mode | When | Failure behavior |
|------|------|-----------------|
| Pull (primary) | Dashboard opens / refresh | Missing command → source not listed; no error |
| Push (optional) | Source extension activates | Dashboard not yet open → queued or dropped; not required for correctness |

Dashboard degrades gracefully — if a source extension is not installed or hasn't registered, its task list is simply empty.

Boundary handling:
- Command return values are treated as `unknown` and validated before subscription.
- Invalid sources are ignored and logged through the shared logger; they must not break the Dashboard panel.
- Duplicate sources are keyed by `source`; the latest valid registration replaces the previous one after disposing the old subscription.
- All task updates are normalized by `taskId = ${source}:${sourceTaskId}` before entering webview state.

Initial snapshot race handling:
- Dashboard subscribes to `onDidChangeTask` before awaiting `getSnapshot()` so events emitted during initial load are not missed.
- During registration, any task id observed from an event is protected from being overwritten by the later initial snapshot. This keeps a stale snapshot from rolling progress back when a source emits `updated` before `getSnapshot()` resolves.
- Snapshot rows still fill gaps for tasks that did not emit an event during the registration window. After registration, source events remain the authority for live task state.
- If a source needs stronger conflict resolution later, it should emit monotonic `updatedAt` or sequence metadata in a future contract revision; contract v1 intentionally keeps the merge rule simple and keyed by `${source}:${sourceTaskId}`.

#### Agent Task Integration Detail

neko-agent already tracks background tasks via `AgentWorkItem` (`agent-types/src/work-item.ts`):

- **Task types**: `media-task` (image/video/audio generation), `tool-background-task`, `subagent`
- **State machine**: `queued → processing → completed / failed / cancelled`
- **Per-task data**: progress (0-100), steps with individual status, result (urls/localPaths/assets), error, ETA
- **Multi-session**: `AgentWorkItemStore = Map<conversationId, Map<taskId, AgentWorkItem>>`
- **AgentManager**: `getRunningConversations()`, `hasRunningAgents()`, `isRunning(conversationId)`

Dashboard subscribes to WorkItem state changes (not raw LLM streaming). The agent adapter maps `AgentWorkItem` → `DashboardTask`:

```typescript
// neko-agent adapter example
class AgentDashboardTaskSource implements DashboardTaskSource {
  readonly contractVersion = 1;
  readonly source = 'neko-agent';
  readonly sourceDisplayName = 'Neko Agent';
  readonly capabilities = { cancel: true, retry: true, revealOutput: true };

  async getSnapshot(): Promise<DashboardTask[]> {
    return Array.from(workItemStore.values())
      .flatMap(map => Array.from(map.values()))
      .map(workItem => ({
        taskId: `neko-agent:${workItem.id}`,
        source: 'neko-agent',
        sourceDisplayName: 'Neko Agent',
        sourceTaskId: workItem.id,
        kind: workItem.kind === 'media-task' ? workItem.task.type : workItem.kind,
        title: workItem.title,
        status: mapStatus(workItem.status),
        progress: workItem.progress,
        actions: [
          ...(workItem.status === 'processing' ? ['cancel' as const] : []),
          ...(workItem.status === 'failed' ? ['retry' as const] : []),
          ...(workItem.result?.localPaths?.length ? ['reveal-output' as const] : []),
        ],
        startedAt: new Date(workItem.createdAt).getTime(),
        completedAt: isTerminalStatus(workItem.status)
          ? new Date(workItem.updatedAt).getTime()
          : undefined,
        outputs: toDashboardOutputs(workItem.result?.localPaths),
        conversationId: workItem.conversationId,
        workItemKind: workItem.kind,
      }));
  }

  onDidChangeTask(listener) { /* subscribe to AgentWorkItemStore changes */ }
  async cancel(task) { /* delegate to AgentManager.cancel(task.sourceTaskId) */ }
}
```

#### Agent Session State vs Agent Task State

| Information | Where it belongs | Dashboard treatment |
|-------------|-----------------|---------------------|
| How many sessions exist | ContextStrip | Static count, read once |
| Which session is streaming | Agent Panel (user is actively chatting) | Not shown — irrelevant to Dashboard |
| Background tasks across all sessions | TaskTable | Event-driven, per-task rows |
| Conversation content/history | Agent Panel | Never shown in Dashboard |

Dashboard shows **tasks**, not **sessions**. A user doesn't care that "conversation-abc123 is running" — they care that "shot-03 image generation is at 67%". The `conversationId` appears as a secondary label in the Source column for disambiguation when multiple sessions have concurrent tasks.

Design notes:
- Dashboard does **not** own task execution — it subscribes to progress events from source extensions
- "Cancel" action delegates to source extension via command (e.g. `neko.cut.cancelExport`)
- "Reveal output" opens the generated file in the appropriate editor/preview

**Task persistence strategy**:
- **Active tasks** (queued/running): in-memory only, lost on VSCode restart — acceptable because the tasks themselves are also lost
- **Completed tasks** (done/error): persisted to `.neko/dashboard-activity.json` (lightweight index: taskId, title, source, status, `outputs`, completedAt). Capped at 50 entries, FIFO eviction. Local output refs store only workspace-relative paths or `${VAR}/path` placeholders — never absolute paths. Extension host resolves refs via `PathResolver` when the user clicks "reveal output"
- This enables the "What did the AI produce while I was away?" use case (§9.1 P2) without requiring full task state persistence
- The activity index is **append-only from Dashboard's perspective** — source extensions own task lifecycle, Dashboard only records completion events

#### RecentActivityTable (secondary view)

| Column | Type | Source |
|--------|------|--------|
| File | link | recent editor history |
| Action | badge | opened / edited / created |
| Time | relative | timestamp |
| Extension | icon | which neko-* opened it |

### 2.4 Runtime Status: Hybrid Strategy (Static + Event-Driven)

Two categories of runtime information have fundamentally different temporal characteristics:

#### Category A: Environment State → Static Indicator (read-once)

Engine state transitions: `idle → starting → ready` (once at startup), then stays `ready` for the entire session. Rarely transitions to `error`.

| Property | Value |
|----------|-------|
| Change frequency | 1-2 times per session |
| User question | "Can I start working?" |
| Miss cost | Low — StatusBar already shows real-time state |
| Existing coverage | `$(check) Neko Engine` in StatusBar (always visible) |

**Decision**: `ContextStrip` reads status once on Dashboard open. Manual refresh button available. No polling, no event subscription for environment state.

#### Category B: Task Progress → Event-Driven Push (mandatory)

Export and generation tasks change every few seconds and have a clear "done" moment the user is waiting for.

| Property | Value |
|----------|-------|
| Change frequency | Every 1-5 seconds (progress ticks) |
| User question | "Is my export/generation done yet?" |
| Miss cost | High — user waits indefinitely without knowing task completed |
| Existing patterns | `exportProgress` in neko-cut, `generationProgress` in neko-canvas BatchGenerationScheduler |

**Decision**: `TaskTable` subscribes to progress events from source extensions. Updates are pushed to webview immediately via `taskProgress` messages. This is not optional — a static snapshot of "3 tasks running" that never updates is useless.

#### Summary

```
┌─────────────────────────────────────────────────────────┐
│  ContextStrip (environment)     TaskTable (tasks)        │
│  ┌───────────────────────┐     ┌──────────────────────┐ │
│  │ Engine: ready ✓       │     │ Export scene-01  78% │ │
│  │ Agent: 2 sessions     │     │ Gen shot-03    done ✓│ │
│  │ Assets: 142 files     │     │ TTS narration  queue │ │
│  │                       │     │                      │ │
│  │ [read once on open]   │     │ [event-driven push]  │ │
│  └───────────────────────┘     └──────────────────────┘ │
│                                                         │
│  Static: changes ~0 times       Dynamic: changes every  │
│  while Dashboard is open        few seconds             │
└─────────────────────────────────────────────────────────┘
```

This hybrid approach avoids two failure modes:
1. **Over-polling** — subscribing to engine state events that fire once per session wastes resources
2. **Under-updating** — reading task state once and never refreshing makes TaskTable a dead display

### 2.5 Activation Strategy

```jsonc
// package.json contributes
{
  "commands": [
    { "command": "neko.dashboard.show", "title": "Show Dashboard", "category": "Neko" }
  ],
  "menus": {
    "commandPalette": [{ "command": "neko.dashboard.show" }]
  }
}
```

Activation triggers:
1. Command palette: `Neko: Show Dashboard`
2. Auto-show on workspace open only when `neko.dashboard.showOnStartup` is enabled and the workspace contains `.neko/` or `.nk*` files; default is `false` to avoid interrupting existing VSCode workflows
3. Activity Bar welcome view (when no editor is open)

### 2.6 Communication Protocol

#### Webview → Extension

```
ready                          — Webview mounted
refresh                        — User requests full data refresh
openProject(path)              — Navigate to project file
createProject(type)            — Create new project file
revealInExplorer(path)         — Show in file explorer
cancelTask(taskId)             — Delegate cancel to source extension
retryTask(taskId)              — Delegate retry to source extension
revealTaskOutput(taskId)       — Open generated file
```

#### Extension → Webview

```
update(dashboardData)          — Full state push (projects + status + recent + tasks)
taskProgress(taskEvent)        — Incremental task status/progress update
taskCompleted(taskId, result)  — Task finished (success or error)
```

`taskId` in webview messages is always the dashboard aggregation id. Extension-host code resolves it back to `DashboardTaskRef` before invoking `DashboardTaskSource.cancel()` or `retry()`.

### 2.7 What Dashboard Does NOT Do

| Concern | Owner | Dashboard role |
|---------|-------|---------------|
| Spatial arrangement of assets | neko-canvas | Link to open canvas |
| AI conversation | neko-agent | Show task progress, link to panel |
| Media playback | neko-preview | — |
| Asset browsing/tagging | neko-assets | Show asset count |
| File editing | respective editors | Navigate to editor |
| Project file format | format-strategy.md | Read-only scan |
| Task execution | source extensions | Subscribe to progress, delegate cancel/retry |
| Continuous status monitoring | VSCode StatusBar | Read-once static indicator |
| Timeline operation history | neko-cut / neko-canvas internal | Too granular — undo/redo belongs in editor |
| Git status / diff | VSCode Source Control | Already fully covered by SCM view |
| Git commit log | VSCode SCM / GitLens | Version control tool's domain |
| Asset library path config | VSCode Settings | Configuration, not status |
| Market registry URL config | VSCode Settings | Configuration, not status |
| Installed market plugins list | neko-market sidebar | Already has dedicated UI |
| Provider detailed parameters | VSCode Settings | Configuration, not status |

Dashboard is a **read-only aggregation view with navigation and task monitoring**. It does not own or mutate creative data, and does not execute tasks itself.

### 2.8 Information Inclusion Criteria

The decision rule for whether to show something in Dashboard:

> **"Does this information help the user decide what to do next within 5 seconds?"**

| Category | Include? | Rationale |
|----------|----------|-----------|
| **Status** (what's happening now) | ✓ | Tasks running, engine ready, sessions active |
| **Recency** (what happened recently) | ✓ | Last edited files, completed tasks |
| **Navigation** (where to go) | ✓ | Project list, quick actions |
| **Configuration** (how things are set up) | ✗ | Rarely changes, belongs in Settings (`Cmd+,`) |
| **History** (detailed past operations) | ✗ | Too granular, belongs in respective editors |
| **Version control** (git state) | ✗ | VSCode SCM already covers this completely |
| **Content** (what's inside a file) | ✗ | Belongs in the file's editor |

### 2.9 Welcome Mode vs Work Mode

Dashboard adapts its content based on workspace state:

#### Trigger Logic

```typescript
const mode = hasNkProjectFiles(workspaceRoot) ? 'work' : 'welcome';
```

#### Welcome Mode (no `.nk*` files in workspace)

Shown when the workspace has no creative project files, or on first use. Purpose: help users understand what Neko Suite can do and get started.

| Section | Content |
|---------|---------|
| **Quick Start** | "Create New..." buttons for each project type (.nkv/.nkc/.nks/.nka/.nkm) with one-line descriptions |
| **Provider Status** | "Claude + DALL-E 3 ready" — confirms AI is configured and usable |

P0 Welcome Mode is intentionally sparse: quick project creation plus provider readiness. Rich onboarding content is deferred so the dashboard stays an operational surface rather than a marketing or marketplace discovery page.

Deferred Welcome content:
- **Creative Workflow Cards** (P2): visual flow diagrams for Video / 2D / 3D / Audio workflows
- **Installed Skills** (P2): active Agent skills with short descriptions
- **Recommended Skills** (P3): marketplace recommendations, shown only when marketplace data is available

#### Work Mode (workspace has `.nk*` files)

Standard operational view. Shows ProjectTable + TaskTable + ContextStrip + RecentActivity + QuickActions.

The ContextStrip in work mode includes a compact capability summary:

```
Engine: ready ✓ | Agent: 2 sessions (Claude, DALL-E 3) | Skills: 8 active | Assets: 142 files
```

#### Skill Display Boundary

| Information | Show in Dashboard? | Rationale |
|-------------|-------------------|-----------|
| Installed skill names + one-line descriptions | ✓ Welcome mode | Helps new users understand Agent capabilities |
| Skill count + active provider names | ✓ Work mode ContextStrip | Compact capability awareness |
| Skill configuration / parameters | ✗ | Belongs in Agent settings |
| Skill prompt content / internals | ✗ | Implementation detail |
| Skill activation/deactivation controls | ✗ | Belongs in Agent panel |

---

## 3. Alternatives Considered

### 3.1 Extend neko-canvas with "Dashboard Mode"

Rejected. Adds a second responsibility to canvas (SRP violation), requires solving "no-file activation" within a CustomEditorProvider (which is file-bound by design), and imports 11K LOC of unnecessary infrastructure.

### 3.2 Activity Bar sidebar (WebviewViewProvider)

Rejected as primary surface. 250-400px width cannot display meaningful table data. However, a complementary TreeView in Explorer sidebar (project file list + status icons) is acceptable as a lightweight always-visible entry point.

### 3.3 Bottom Panel tab

Rejected. Panel area is already occupied by neko-agent (AI chat) + Terminal + Output. Dashboard's "overview" purpose conflicts with Panel's "auxiliary output" positioning.

### 3.4 Card grid instead of table

Considered. Cards are visually richer (thumbnails, progress bars) but:
- Less information-dense than tables for 10+ projects
- Harder to sort/filter
- Thumbnails require async generation (engine dependency)

Decision: table as primary, with optional card view toggle for users who prefer visual browsing. Table is the default and MVP.

---

## 4. Package Structure

```
packages/neko-dashboard/
├── package.json              # VSCode extension manifest
├── packages/
│   ├── extension/src/
│   │   ├── extension.ts      # activate() + DashboardProvider
│   │   ├── projectScanner.ts # Workspace file discovery
│   │   ├── taskAggregator.ts # Subscribe to task progress events
│   │   └── statusReader.ts   # One-shot status reads (engine/agent/assets)
│   └── webview/src/
│       ├── App.tsx           # Root component
│       ├── components/
│       │   ├── ProjectTable.tsx
│       │   ├── TaskTable.tsx
│       │   ├── RecentActivity.tsx
│       │   ├── ContextStrip.tsx
│       │   └── QuickActions.tsx
│       └── services/
│           └── messenger.ts  # postMessage wrapper
└── l10n/                     # i18n bundles
```

Estimated size: ~3-4K LOC total (extension ~800, webview ~2500).

---

## 5. Dependencies

| Dependency | Direction | Purpose |
|------------|-----------|---------|
| `@neko/shared` | import | Logger, i18n, theme, `DashboardTask` / `DashboardTaskSource` contracts |
| neko-engine | command boundary | Render/ML job progress through source-owned adapter; `neko.engine.getStatus` (programmatic, no UI) |
| neko-agent | command boundary | WorkItem progress through source-owned adapter; `neko.agent.getSessionCount` (programmatic, no UI) |
| neko-cut | command boundary | Export progress through source-owned adapter |
| neko-canvas | command boundary | Batch generation progress through source-owned adapter |
| neko-assets | command query | `neko.assets.getSummary` (programmatic, no UI) |

**Command naming convention**: Dashboard calls only programmatic commands (suffix `get*` / `query*`) that return data silently. It must NOT call interactive commands (e.g. `neko.engine.status` which shows a QuickPick UI). New programmatic commands needed:

| Command | Returns | Owner |
|---------|---------|-------|
| `neko.engine.getStatus` | `{ state: 'idle'|'starting'|'ready'|'error', port?: number }` | neko-engine |
| `neko.agent.getSessionCount` | `{ total: number, running: number }` | neko-agent |
| `neko.assets.getSummary` | `{ fileCount: number, totalSize: number }` | neko-assets |
| `neko.cut.getDashboardTaskSource` | `DashboardTaskSource \| undefined` | neko-cut |
| `neko.canvas.getDashboardTaskSource` | `DashboardTaskSource \| undefined` | neko-canvas |
| `neko.agent.getDashboardTaskSource` | `DashboardTaskSource \| undefined` | neko-agent |
| `neko.engine.getDashboardTaskSource` | `DashboardTaskSource \| undefined` | neko-engine |
| `neko.dashboard.registerTaskSource` | void (optional push registration) | neko-dashboard |

No hard extension dependencies — dashboard degrades gracefully if other extensions are not installed (shows "not available" for missing status, empty task list for missing sources). In implementation terms, `packages/neko-dashboard` may import `@neko/shared` and VSCode APIs, but must not import source extension packages. Source packages own their adapters and expose them only through programmatic commands.

---

## 6. Migration Path

| Phase | Scope | Effort | Blocked by |
|-------|-------|--------|------------|
| P0 | ProjectTable + file scanning + open navigation + minimal RecentActivity (top 5 recent files via fs.stat mtime) + Welcome/Work mode | ~3 days | — |
| P1a | Define `DashboardTask` + `DashboardTaskSource` + `DashboardDisposableLike` in `@neko/shared`; add source validation helpers; reserve `getDashboardTaskSource` command names | ~0.75 day | — |
| P1b | TaskTable UI + TaskAggregator (pull-first discovery) + first adapter (neko-cut export) | ~2 days | P1a |
| P1c | Agent adapter + Canvas adapter (validate contract generality) + `.neko/dashboard-activity.json` persistence | ~1.5 days | P1b |
| P2 | ContextStrip + QuickActions + status/summary programmatic commands + full RecentActivity (with action type + extension icon) + deferred Welcome content | ~1.5 days | — |
| P3 | AccountBadge + auth status integration | ~0.5 day | neko-hub backend |
| P4 | Card view toggle + Explorer TreeView companion | ~1 day | — |
| P5 | SyncStatus + QuotaIndicator (cloud features) | ~1 day | neko-assets sync + neko-hub quota API |

Total: ~11.25 engineering days. P0+P2+P4 independent (~5.5 days). P1 requires cross-extension contract work (~4.25 days). P3+P5 blocked by neko-hub.

**Critical path**: P0 → P1a → P1b → P1c. The shared contract (P1a) must land before any adapter implementation.

**P0 RecentActivity scope**: P0 ships a minimal version — just the 5 most-recently-modified `.nk*` files shown as a list, matching the §9.1 P0 priority "Where did I leave off?". P2 expands it to a full table with action type (opened/edited/created) and extension-specific icons.

---

## 7. Quality Gates

Dashboard ships only after the affected slice has focused tests. The goal is not broad end-to-end coverage in P0, but clear contract and boundary protection before cross-extension task monitoring lands.

### 7.1 P0 Tests

| Area | Required coverage |
|------|-------------------|
| ProjectScanner | Finds supported `.nk*` files across workspace folders; ignores `node_modules`, `.git`, and `.neko/.cache`; reports workspace-relative paths only |
| ProjectTable state | Sort by name/type/mtime/size; text search; type filter; empty-state behavior |
| RecentActivity minimal view | Selects the five most-recently-modified `.nk*` files; handles missing/deleted files without throwing |
| NavigationDispatcher | Opens project files through VSCode commands; rejects absolute or out-of-workspace paths from webview messages |
| Welcome/Work mode | Switches by workspace content; default startup does not auto-open unless setting allows it |

### 7.2 P1 Contract Tests

| Area | Required coverage |
|------|-------------------|
| Shared contract guards | Accept valid `DashboardTaskSource`; reject missing `contractVersion`, invalid `source`, invalid `progress`, absolute local output refs, and non-disposable listeners |
| TaskAggregator | Handles missing commands, commands that throw, commands that return invalid objects, duplicate sources, and dispose lifecycle |
| Task event merge | Applies `added` / `updated` / `removed` idempotently by `${source}:${sourceTaskId}` |
| Task actions | Resolves dashboard `taskId` back to `DashboardTaskRef` before cancel/retry; surfaces source errors without corrupting table state |
| Activity persistence | Appends terminal task results, caps at 50 entries, survives missing/corrupt `.neko/dashboard-activity.json`, and never writes absolute paths |

### 7.3 Manual Verification

Minimum manual checks before enabling P1 by default:
1. Open a workspace with no `.nk*` files: Dashboard stays in Welcome Mode and does not auto-open unless configured.
2. Open a workspace with mixed `.nkv`, `.nkc`, `.nks`, `.nka`, `.nkm`, `.nkp` files: ProjectTable shows relative paths and sortable metadata.
3. Start a fake or real export task: TaskTable updates progress without polling and cancel delegates to the source extension.
4. Restart VSCode after a completed task: completed output appears from `.neko/dashboard-activity.json` and reveal resolves through `PathResolver`.

---

## 8. Relationship to neko-canvas

```
neko-dashboard                          neko-canvas
┌──────────────────┐                   ┌──────────────────┐
│ "What exists?"   │  ── open ──→      │ "How to arrange?"│
│ "What's the      │                   │ "How to connect?"│
│  status?"        │  ← link back ──   │ "How to compose?"│
│ "Where to go?"   │                   │                  │
└──────────────────┘                   └──────────────────┘
   Table-centric                          Node-centric
   Read-only + navigate                   Edit + orchestrate
   No file required                       .nkc file required
   Lightweight (~3K LOC)                  Full editor (~11K LOC)
```

Dashboard links to canvas (and all other editors). Canvas can link back to dashboard. They are peers, not parent-child.

---

## 9. Creator Information Needs Analysis

What does a creative professional need to see when they open their workspace?

### 9.1 Information Priority (by frequency of need)

| Priority | Question | Dashboard answer | Update frequency |
|----------|----------|-----------------|-----------------|
| **P0** | "Where did I leave off?" | RecentActivity — last edited files with timestamps | On open |
| **P0** | "Is my export/generation done?" | TaskTable — active tasks with progress | Real-time (event-driven) |
| **P1** | "What projects do I have?" | ProjectTable — all .nk* files with type/status | On open + file watcher |
| **P1** | "Can I start working?" (engine ready?) | ContextStrip — engine state badge | On open (one-shot) |
| **P2** | "What did the AI produce while I was away?" | Activity index — completed task results (persisted to `.neko/dashboard-activity.json`) | On open (read from disk) |
| **P2** | "How big is my project?" | ProjectTable — file sizes, asset count | On open |
| **P3** | "What's changed since last session?" | RecentActivity — mtime-based change indicators (P3 optional: SCM adapter for git-aware status, default off) | On open |

### 9.2 Creator Workflow Patterns

| Workflow | Dashboard touchpoint | Action |
|----------|---------------------|--------|
| **Resume work** | Open dashboard → see last edited → click to open | Navigate |
| **Check async results** | Open dashboard → TaskTable shows "done" → reveal output | Navigate |
| **Start new direction** | QuickActions → "New Video Project" / "New Canvas" | Create + navigate |
| **Multi-project overview** | ProjectTable → sort by last modified → scan status | Read |
| **Waiting for export** | TaskTable → see progress bar → continue other work | Monitor |

### 9.3 What Creators Do NOT Need in Dashboard

| Information | Why excluded | Where it lives |
|-------------|-------------|----------------|
| Timeline details (tracks, clips, keyframes) | Too granular — belongs in editor | neko-cut |
| AI conversation history | Belongs in chat context | neko-agent panel |
| Individual asset metadata (tags, dimensions) | Belongs in asset browser | neko-assets sidebar |
| Code/script content | Belongs in text editor | neko-story |
| Render settings (codec, bitrate, resolution) | Belongs in export dialog | neko-cut export panel |
| Engine configuration (GPU, memory, threads) | Belongs in settings | VSCode settings |
| Detailed error logs | Belongs in output channel | Output panel |

### 9.4 Design Implication

The analysis confirms: Dashboard is a **triage surface** — it helps creators decide "what to do next" in under 5 seconds. It is not a workspace for doing the work itself.

Key UX principles:
1. **Scannable** — tables with sort/filter, not walls of text
2. **Actionable** — every row has a clear "open" action, one click away from the real editor
3. **Non-blocking** — dashboard never prevents other work; it's a tab you glance at
4. **Active tasks in-memory, completions persisted** — running tasks are lost on restart (acceptable, since the tasks themselves are lost); completed results are persisted to `.neko/dashboard-activity.json` for cross-session visibility

---

## 10. Future Slots: Account & Cloud State

### 10.1 Rationale for Pre-Planning

neko-auth (OAuth 2.0 + PKCE) is implemented but pending backend integration. Cloud storage sync (`neko.assets.cloudProvider`) is configured but not operational. These features will become available incrementally. Dashboard should reserve UI slots now to avoid layout redesign later.

### 10.2 Planned Slots

| Slot | Location | Trigger | Priority | Blocked by |
|------|----------|---------|----------|------------|
| **AccountBadge** | ContextStrip (rightmost) | neko-auth backend ready | P2 | neko-hub server deployment |
| **SyncStatus** | ContextStrip or ProjectTable column | Cloud sync operational | P3 | neko-assets sync implementation |
| **QuotaIndicator** | ContextStrip (tooltip or expandable) | Usage API available | P3 | neko-hub billing/quota API |
| **SubscriptionTier** | Welcome mode header | Commercial model decided | Unplanned | Business decision |

### 10.3 AccountBadge Design (P2)

```
┌─────────────────────────────────────────────────────────────┐
│ Engine: ready ✓ | Agent: 2 sessions | Skills: 8 | 🔒 Logged in (user@email.com) │
└─────────────────────────────────────────────────────────────┘
                                                        ↑ AccountBadge
```

States:
- `🔒 Logged in (user@email.com)` — authenticated, all cloud features available
- `🔓 Not logged in` — click to trigger OAuth flow
- `⚠️ Token expired` — click to re-authenticate

Data source: `neko.auth.getStatus` command (one-shot read, same as engine status).

### 10.4 SyncStatus Design (P3)

Two possible placements (decide when implementing):

**Option A**: ContextStrip badge
```
Cloud: synced ✓ (3 min ago)
Cloud: syncing... (2/14 files)
Cloud: offline
```

**Option B**: ProjectTable column
| Name | Type | Sync | Last Modified |
|------|------|------|---------------|
| scene-01.nkv | video | ✓ synced | 5 min ago |
| draft.nkc | canvas | ↑ pending | 2 min ago |

Option B is more granular (per-file sync state) but adds complexity. Defer decision until sync is operational.

### 10.5 QuotaIndicator Design (P3)

Relevant when cloud generation APIs have usage limits:

```
┌──────────────────────────────────┐
│ Quota: 847 / 1000 images this month │
│ ████████████████░░░░ 85%         │
└──────────────────────────────────┘
```

Shown as tooltip on ContextStrip or as a collapsible section. Only visible when quota API is available and usage > 50%.

### 10.6 Implementation Strategy

```
P0-P1 (now):     Build Dashboard without account/cloud — slots are empty/hidden
P2 (auth ready): AccountBadge appears in ContextStrip — one-shot status read
P3 (sync ready): SyncStatus appears — event-driven for active syncs, static otherwise
P3 (quota API):  QuotaIndicator appears — periodic refresh (every 5 min, not real-time)
```

All slots use the same hybrid strategy as §2.4:
- **Rarely-changing state** (logged in, subscription tier) → static, read once
- **Actively-changing state** (sync progress, quota approaching limit) → event-driven push

No slot requires Dashboard to manage authentication flows or sync operations — it only displays status and links to the responsible extension's UI for actions.
