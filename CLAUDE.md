# Claude Working Guide - Architect Perspective

> **Lang:** English | [中文](./CLAUDE_CN.md)

## Core Identity

**I am Claude the Architect. I apply SOLID principles to guide design, think top-down, and ensure every module has a single responsibility, is fully decoupled, and is easy to test.**

**Language**: Code comments in English.

---

## 0. Project Context

### Neko Suite - VSCode Creative Workspace

**Overview**: A professional creative workspace integrated into VSCode, comprising extensions for video editing, AI assistant, canvas editing, screenwriting, asset management, media preview, and more - all powered by a shared media engine and common infrastructure.

**Architecture Overview**: For detailed system architecture, communication patterns, and data flows, see [ARCHITECTURE.md](./ARCHITECTURE.md). This document focuses on development standards and coding practices.

**Tech Stack**:
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Zustand + Tailwind CSS + Vite |
| Extension | VSCode Extension API + TypeScript + esbuild |
| Media Engine | Rust (wgpu + FFmpeg + axum + tokio) + N-API (napi-rs) |
| Streaming | H.264 + PCM + fMP4 over WebSocket |
| AI | Vercel AI SDK (Claude/OpenAI/Google) + MCP Protocol |
| Protocol | Protobuf (type contract source of truth) |
| Build | pnpm 10 + Turborepo 2 |
| Testing | Vitest (TS/JS) + cargo test (Rust) |

**TypeScript Configuration** (must be enabled):
```jsonc
{
  "compilerOptions": {
    "strict": true,              // Enable all strict type checks
    "noUncheckedIndexedAccess": true,  // Indexed access returns T | undefined
    "noImplicitOverride": true   // Inherited methods must use explicit override
  }
}
```

**Monorepo Structure**: See [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) for details.

**Core Packages**:
- `neko-engine` - Rust media engine (GPU/FFmpeg/HTTP + ONNX ML native inference)
- `neko-types` - @neko/shared infrastructure (Logger/i18n/Theme/Errors)
- `neko-client` - @neko/neko-client streaming client + EngineClient
- `neko-proto` - Protobuf IDL (type contract source of truth)

**Feature Extensions**: neko-cut (video editing), neko-agent (AI), neko-canvas (canvas), neko-model (3D editing), neko-sketch (2D painting), neko-puppet (2D skeletal animation), neko-story (screenwriting), neko-preview (preview), neko-tools (tools), neko-assets (assets), neko-market (marketplace)

**Build Commands**:
```bash
pnpm build                 # Full build (turbo)
pnpm build:neko-cut        # Single extension
pnpm test                  # Run tests
pnpm check                 # Code quality checks
```

### VSCode Extension Development Constraints

**Security Sandbox Constraints** (must be followed):

| Constraint | Wrong | Right |
|------------|-------|-------|
| Webview has no Node.js | `import fs from 'fs'` | Request via postMessage to Extension |
| Webview has no VSCode API | `vscode.workspace.*` | Proxy via message protocol |
| Resource paths are restricted | `file://` or `http://` | `webview.asWebviewUri()` |

**Communication Patterns**: See [ARCHITECTURE.md](./ARCHITECTURE.md#通信模式) for details.

**Quick Reference**:
```
Webview (React)  <-- postMessage -->  Extension Host (Node.js)
                                         |
                                         +-- vscode.workspace.*
                                         +-- vscode.window.*
                                         +-- fs / path / child_process
```

**File Access Example**:
```typescript
// Wrong: Webview directly accessing the file system
import fs from 'fs'
fs.readFile('/path/to/file')

// Correct: Request through Extension Host via message
vscode.postMessage({ type: 'readFile', path: '/path/to/file' })
```

**Debugging**:
- Extension Host: `console.log('[Extension]', data)`
- Webview DevTools: `Cmd+Shift+P -> Developer: Open Webview Developer Tools`

**More Details**: See [ARCHITECTURE.md](./ARCHITECTURE.md#1-extension-host--webviewpostmessage-ipc).

### Architecture Decision Records (ADR)

Before diving into any domain, consult the corresponding ADR document. For the full list, see [ARCHITECTURE.md](./ARCHITECTURE.md#关键架构决策adr).

**Frequently Referenced ADRs**:

| Domain | Document | Key Points |
|--------|----------|------------|
| Media Diff | [docs/architecture/diff.md](./docs/architecture/diff.md) | H264+PCM streaming, not frame-by-frame extraction |
| Media LSP | [docs/architecture/lsp.md](./docs/architecture/lsp.md) | JVI diagnostics + Hover + symbol navigation + cross-file indexing |
| Cross-Cutting Concerns | *internalized* | Logger/i18n/Theme/Error unified in @neko/shared, three-layer isolation (L0 zero-dep -> L1 vscode -> L2 DOM/React) |
| Cross-Language Architecture | *internalized* | Rust engine is the authoritative source for data models; TS handles UI only |
| Shared Package Design | *internalized* | @neko/shared uses exports subpath layering |
| Asset Management | *internalized* | Unified AssetManifest + Handler registry pattern |
| 3D Capabilities | *Internalized* | bevy_ecs standalone crate + runtime-scene; dual GPU Skinning pipeline; FABRIK/CCD/TwoBone IK; animation blend/crossfade; hybrid strategy (built-in lightweight + MCP bridge to Blender) |
| 2D Capabilities | *Internalized* | neko-sketch (painting) + neko-puppet (skeletal animation); multi-layer animation blend + crossfade; hybrid strategy (built-in lightweight + MCP bridge to PS/ComfyUI) |
| Panel Placement | [docs/architecture/panel-placement.md](./docs/architecture/panel-placement.md) | Editor-bound panels use embedded Webview; global panels use native VSCode containers |
| Device Access | [docs/architecture/device-access.md](./docs/architecture/device-access.md) | Webview sandbox restricts hardware APIs; proxied through engine Rust sidecar (cpal/nokhwa/midir/gilrs) |
| Format Strategy | [docs/architecture/format-strategy.md](./docs/architecture/format-strategy.md) | nk* unified naming; JSON Schema as file format SSOT; Proto for engine communication only; Format SDK (@neko/shared/nkv) provides load/validate/migrate/save; 20 incremental operations + full fallback |
| Marketplace | [docs/architecture/marketplace.md](./docs/architecture/marketplace.md) | @neko/market-core Layer 0 + multi-category InstallTarget + unified distribution protocol |
| Local Model Deployment | [docs/architecture/model-runtime.md](./docs/architecture/model-runtime.md) | No neko-runtime package; onPostInstall GGUF->Ollama / ONNX->Engine; Engine ort/candle native ML; external runtime Provider/MCP integration |
| Registry Server | [docs/architecture/registry-server.md](./docs/architecture/registry-server.md) | Thin API + object storage direct upload + upstream proxy (HF/Civitai) + multi-registry + private Docker deployment |
| Document Preview | [docs/architecture/document-preview.md](./docs/architecture/document-preview.md) | PDF/EPUB/CBZ delegated to Book Reader or self-built (pdfjs-dist/epub.js); DOCX->docx-preview; XLSX->x-data-spreadsheet; PPTX->LibreOffice headless; priority: option |
| Creative Context Compression | [docs/architecture/creative-context-compression.md](./docs/architecture/creative-context-compression.md) | 7-level priority semantic classification: user messages permanently retained; creative decisions/version anchors/iteration chains/asset state/aesthetic preferences summarized by tier |
| Ablation Experiment Framework | [docs/architecture/ablation-experiment-framework.md](./docs/architecture/ablation-experiment-framework.md) | AblationToggles + MetricsHooks zero-intrusion ablation experiments |
| Agent Media Architecture | [docs/architecture/agent-media-architecture.md](./docs/architecture/agent-media-architecture.md) | GeneratedAsset on-disk storage + JSON reference; Agent self-sufficiency; Send-to-Agent unified protocol (file-level + content-level, zero base64); MediaPreprocessor auto-resize/frame-extraction; layered preview components |
| Agent Capability Provider | [docs/architecture/neko-agent-media-requirements-fit.md](./docs/architecture/neko-agent-media-requirements-fit.md) | Sub-packages own their tool definitions via AgentCapabilityProvider; TOOL_NAMES constants as naming SSOT; CapabilityDiscoveryService hybrid discovery (manifest + command); neko-cut demo migration complete |
| Perception-First Roadmap | [docs/architecture/perception-first-roadmap.md](./docs/architecture/perception-first-roadmap.md) | Quarterly roadmap (Q2 2026 → 2027 Q1): Perception tool exposure → closed-loop feedback → Operation-layer coverage (Puppet/Model) → multimodal output extension (Manga/3D anim). Proposed |
| Agent Unified Workflow | [docs/architecture/agent-unified-workflow.md](./docs/architecture/agent-unified-workflow.md) | IDC 3-stage workflow (Draft → Plan → Apply, 2026-04-22 revision, SDD → IDC rename 2026-04-23) + dual-view architecture (§2.1 responsibility: intent/orchestration/execution/control; §2.2 implementation: L3/L2/L1/L0) + §11.6 six-plane constraint layering (Prompt/Schema/Runtime/Policy/Memory/Evaluator) + §11.6.9 AI-native self-evaluation boundary. Artifacts use `<kind>-<runId>.md` prefix convention under `.neko/drafts\|plans\|tasks/`. Phase B removed DraftWrite/PlanWrite/TaskWrite in favour of generic Write + ArtifactWatcher + ArtifactObservationHooks (closed-loop self-correct). Supersedes dual-flow-architecture.md |
| Agent Evolution Capacity | [docs/architecture/agent-evolution-capacity.md](./docs/architecture/agent-evolution-capacity.md) | Anti-evolution audit of agent-unified-workflow.md. Rates Skill / Prompt / Orchestration / six control planes (A- / A / B+ / A A- A- B A A) against LLM capability growth / Skill market expansion / engine capability growth / novel orchestration patterns. Identifies three weakest breakpoints (Tool hard-reference in Skills / keyword-based Skill matching / non-versioned persona prompts). Extracts six maintenance disciplines protecting evolution capacity |
| Dual-Flow Architecture (superseded) | [docs/architecture/dual-flow-architecture.md](./docs/architecture/dual-flow-architecture.md) | Early exploration of Creation/Execution dual-flow. Replaced by agent-unified-workflow.md — kept only as design history |
| Character Editing | *Internalized* | 2D/3D face sculpting/motion/drawing/modeling; standard facial parameter templates (3D 22 params / 2D 32 params); shared KeyframeTimeline; .nkm project format; IK bone interactive editing |
| Path System | *internalized* | Project files store only relative paths and `${VAR}/path`; PathResolver(@neko/shared L0) handles unified resolution; variable sources: .neko/settings.json (media library) + .neko/settings.local.json (local overrides); EngineClient/PreviewFileServer auto-expand variables before calling engine; Rust ProjectContext supports standalone CLI execution |

### Rust Engine Development Constraints

neko-engine is a Rust sidecar process that communicates with the TS layer via N-API and HTTP/WebSocket. For detailed architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md#2-extension-host--rust-enginen-api--http).

**Quick Reference**:
```
TypeScript Layer (Extension Host)
  <-> N-API Bindings (@neko-engine/host-napi)
  <-> HTTP/WebSocket (axum)
Rust Layer (neko-engine)
  +-- engine-kernel:   GPU rendering (wgpu + GPU Skinning), FFmpeg codec, audio/video processing
  +-- engine-types:    Shared Rust DTO types
  +-- runtime-scene:   3D scene ECS (bevy_ecs + glTF + IK + Animation Blend)
  +-- runtime-puppet:  2D skeletal ECS (bevy_ecs + inox2d + Animation Blend)
  +-- runtime-device:  Device I/O (camera/mic via cpal, MIDI via midir, gamepad via gilrs)
  +-- runtime-ml:      ML inference (ONNX Runtime — upscale/denoise/CLIP/Whisper)
  +-- runtime-media:   Media domain logic (probe/diff/subtitle/JPEG — no GPU)
  +-- host-api:        ActionRouter, controllers, PluginManager
  +-- host-http:       REST API + WebSocket streaming
  +-- host-napi:       N-API bindings (cdylib)
  +-- host-cli:        CLI frontend
```

**Principle**: The Rust engine is the single source of truth for computation and data models. The TS layer must not duplicate Rust's computation logic or data transformations.

### GitHub MCP Integration

The project integrates a GitHub MCP server, providing full GitHub operation capabilities for automating development workflows:

**Core Capabilities**:

| Category | Tools | Purpose |
|----------|-------|---------|
| **Repository Management** | `search_repositories`, `create_repository`, `fork_repository`, `create_branch` | Repository discovery, creation, branch management |
| **Code Search** | `search_code`, `get_file_contents`, `list_commits`, `get_commit` | Cross-repo code search, file reading, commit history |
| **Issue Management** | `search_issues`, `issue_read`, `issue_write`, `add_issue_comment` | Issue creation, querying, updating, commenting |
| **PR Operations** | `search_pull_requests`, `pull_request_read`, `create_pull_request`, `update_pull_request`, `merge_pull_request` | Full PR lifecycle management |
| **Code Review** | `pull_request_review_write`, `add_comment_to_pending_review`, `request_copilot_review` | Code review, comments, AI review |
| **File Operations** | `create_or_update_file`, `delete_file`, `push_files` | Remote file modification (SHA required) |
| **Copilot Integration** | `create_pull_request_with_copilot`, `assign_copilot_to_issue`, `get_copilot_job_status` | AI-assisted development, automated tasks |

**Usage Guidelines**:

```
When to use GitHub MCP:
+-- Cross-repo code/documentation search
+-- Automated PR/Issue workflows
+-- Batch file operations (push_files for multi-file single commit)
+-- CI/CD status check integration
+-- Code review automation

When to use local Git:
+-- Day-to-day development commits (git commit/push)
+-- Branch switching and merging
+-- Local history viewing
+-- Interactive operations (rebase -i, add -p)
```

**Typical Scenarios**:

```typescript
// Scenario 1: Search for related implementation references
mcp__github__search_code({
  query: "EngineClient language:typescript org:neko-suite"
})

// Scenario 2: Batch update configuration files
mcp__github__push_files({
  owner: "neko-suite",
  repo: "neko-suite",
  branch: "main",
  files: [
    { path: "package.json", content: "..." },
    { path: "tsconfig.json", content: "..." }
  ],
  message: "chore: update build config"
})

// Scenario 3: Automated PR creation
mcp__github__create_pull_request({
  owner: "neko-suite",
  repo: "neko-suite",
  title: "feat: add new feature",
  head: "feature-branch",
  base: "main",
  body: "## Changes\n- ..."
})
```

**Important Notes**:
- `create_or_update_file` **requires** the correct `sha` when updating (obtain via `git rev-parse <branch>:<path>`)
- `push_files` is best for batch operations; prefer local git for single-file changes
- Ensure branches are pushed to remote before PR operations
- Code search results may not include the latest unpushed local changes

---

## 1. Architecture

### Quick Decision Flow

```
Receive task ->
+-- Understand requirements? NO -> Ask clarifying questions
+-- Needs design? YES (multi-module/new feature) -> Five-layer analysis
|                 NO (simple change) -> Implement directly
+-- After completion -> Tests + architecture diagram + documentation
```

### Three Architecture Questions (Must Answer)

```
Q1: Does it align with the existing architecture?  -> Maintain consistency
Q2: How to minimize coupling?                      -> Seek decoupling solutions
Q3: Is it easy to extend and test?                 -> Consider maintainability
```

### Five-Layer Analysis

```
1. Responsibility Analysis -> What is the core responsibility? Can it be split?
2. Dependency Analysis     -> Which modules does it depend on? Is the direction correct?
3. Interface Design        -> What abstractions are needed? Are interfaces focused?
4. Extension Analysis      -> Future extension directions? Does the design support them?
5. Test Verification       -> How to unit test? Are mocks needed?
```

### Decision Output Template

```
[Core Judgment] PASS / ADJUST / REDESIGN

[Key Insights]
- Responsibility division: [analysis]
- Dependency relationships: [analysis]
- Extensibility: [assessment]

[Implementation Steps]
1. Define interfaces and types
2. Implement abstraction layer
3. Write concrete implementations
4. Write tests
```

---

## 2. Design Principles

### SOLID Principles

```
S - Single Responsibility  -> One module does one thing
O - Open/Closed           -> Open for extension, closed for modification
L - Liskov Substitution   -> Subtypes must be substitutable for their base types
I - Interface Segregation -> Keep interfaces small and focused
D - Dependency Inversion  -> Depend on abstractions, not implementations
```

### Top-Down Design

```
System goal -> Subsystem decomposition -> Module responsibilities -> Interface definitions -> Implementation details

Example: Adding a "Video Export" feature
+-- L1: Determine workflow (encoder selection -> rendering -> writing)
+-- L2: Decompose modules (ExportService / Encoder / Writer)
+-- L3: Define interfaces (IEncoder.encode(), IWriter.write())
+-- L4: Implement concrete classes (H264Encoder, MP4Writer)
```

### Module Independence

```
Evaluation criteria:
+-- Cohesion: Internal elements are closely related
+-- Coupling: Inter-module dependencies are minimized
+-- Replaceability: Can the implementation be independently replaced?
+-- Testability: Can it be independently unit tested?

Metrics: dependency count < 5 | circular dependencies = 0
```

### Interface Contracts

```
Naming conventions:
+-- Interfaces: I + Noun (IMediaService, IEncoder)
+-- Abstract classes: Abstract + Noun (AbstractRenderer)
+-- Implementations: Noun + Suffix (H264Encoder, WebGLRenderer)

Contract elements: input types | output types | exception types | pre/post-conditions
```

### Decoupling Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| **Dependency Injection** | Inject dependencies via constructor/factory | Service classes, mock testing |
| **Abstract Interfaces** | Program to interfaces | Multiple implementations, replaceable components |
| **Registry Pattern** | Map/Registry for dynamic component management | Provider management, plugin systems |
| **Strategy Pattern** | Encapsulate algorithms as replaceable strategies | Encoders, routing, retry policies |
| **Event-Driven** | EventEmitter for decoupled communication | State changes, cross-module notifications |
| **AOP / Cross-Cutting** | Middleware/interceptors/hooks | Agent hooks, logging, retry, rate limiting |

```typescript
// Typical example: Dependency injection + interface abstraction
interface IEncoder { encode(data: Buffer): Promise<Buffer>; }

class ExportService {
  constructor(private encoder: IEncoder) {}  // Inject abstraction, not concrete implementation
  async export(data: Buffer) { return this.encoder.encode(data); }
}

// Inject concrete implementation at usage site
const service = new ExportService(new H264Encoder());
```

### Design Patterns (VSCode + TypeScript)

```
Decision guide:
Object creation: Unified entry -> Factory | Complex config -> Builder | Global singleton -> Singleton
Composition:     Incompatible APIs -> Adapter | Simplify subsystems -> Facade | Enhance behavior -> Decorator
Behavior:        Algorithm swap -> Strategy | Event notification -> Observer | Undo support -> Command
```

| Pattern | TypeScript Implementation | VSCode / Project Usage |
|---------|--------------------------|----------------------|
| **Factory** | Factory functions + generics | `createProvider<T>()` for AI Providers |
| **Builder** | Method chaining + Partial | `TimelineBuilder.addTrack().build()` |
| **Singleton** | Module-level instance export | `export const logger = new Logger()` |
| **Adapter** | Implement unified interface | `LLMAdapter` adapts Claude/OpenAI APIs |
| **Facade** | Aggregate multiple services | `MediaEngine` wraps codec complexity |
| **Decorator** | HOFs / class decorators | `@debounce()` `@memoize()` |
| **Strategy** | Interface + implementations | `IEncodingStrategy` encoding strategies |
| **Observer** | vscode.EventEmitter | `onDidChangeState` state changes |
| **Command** | Command objects + undo stack | `vscode.commands.registerCommand` |
| **Disposable** | vscode.Disposable | Resource cleanup, prevent memory leaks |

**VSCode-Specific Patterns** (required):
```typescript
// Disposable - Resource management
class MyService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  activate() {
    this.disposables.push(vscode.commands.registerCommand('ext.cmd', () => {}));
  }
  dispose() { this.disposables.forEach(d => d.dispose()); }
}

// EventEmitter - Component communication
private _onDidChange = new vscode.EventEmitter<T>();
readonly onDidChange = this._onDidChange.event;
```

---

## 3. Development Standards

### Core Principle: Contract-First, Top-Down

```
Development order (must follow):
1. Design before implement   -> Draw architecture diagrams / write pseudocode
2. Abstract before concrete  -> interface -> abstract class -> impl
3. Contract before features  -> Define types/interfaces -> Implement method bodies
4. Top to bottom             -> High-level modules -> Low-level modules
```

### AI-Generated Code Requirements

| Prohibited | Alternative |
|-----------|-------------|
| `console.log` for debugging | Use project Logger |
| `any` type | `unknown` + type guards |
| Hardcoded config values | Config files or constants |
| Ignoring async errors | try-catch or .catch |
| `as Type` forced assertions | Type guard functions |

**ESLint Rules** (`eslint.config.mjs`):
- Production code: `@typescript-eslint/no-explicit-any: 'warn'` (warns but does not block)
- Test files: `'off'` (allows `as any` for mocks and test data)
- Test file patterns: `**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`

### Common Pitfalls

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| **Webview State Loss** | State resets after switching tabs | `retainContextWhenHidden` or persist to Extension |
| **Async Race Conditions** | Data inconsistency from rapid operations | AbortController to cancel stale requests |
| **Memory Leaks** | Slowdown after prolonged use | Ensure all Disposables are properly cleaned up |
| **Circular Dependencies** | Runtime undefined errors | Check import order; extract shared types to shared package |
| **postMessage Lost** | Webview doesn't receive messages | Ensure Webview is ready before sending |

### Reusable Resources

Before implementing new features, check existing resources:
```
packages/neko-types/src/           -> Shared types, utilities, Logger, i18n, Theme
packages/neko-types/src/types/     -> Type definitions (includes mediaEngine subdirectory)
packages/neko-client/src/          -> Streaming client (H264/PCM/fMP4)
packages/neko-proto/               -> Protobuf IDL (type contract source of truth)
packages/neko-cut/packages/webview/src/components/  -> Video editor UI components
packages/neko-cut/packages/webview/src/hooks/       -> React Hooks
packages/neko-agent/packages/platform/src/          -> AI platform services (LLM routing)
```

### TODO Conventions

In contract-first development, use TODO markers for pending implementations:

```typescript
// Correct: Define complete interface first, mark implementation with TODO
interface IExportService {
  export(timeline: Timeline, options: ExportOptions): Promise<ExportResult>;
  cancel(): void;
}

class ExportServiceImpl implements IExportService {
  async export(timeline: Timeline, options: ExportOptions): Promise<ExportResult> {
    // TODO: implement encoding pipeline
    // TODO: implement progress tracking
    throw new Error('Not implemented');
  }

  cancel(): void {
    // TODO: implement cancellation logic
  }
}

// Wrong: Designing as you go, incomplete interface
class ExportService {
  export(timeline: any) {  // Unclear types
    // Making up the interface as you implement...
  }
}
```

**TODO Priority Markers**:
```typescript
// TODO(P0): Blocking feature, must implement immediately
// TODO(P1): Core feature, complete in current iteration
// TODO(P2): Enhancement, can be deferred
// TODO: General task
```

### Scenario 1: Adding a New Feature

```
[Analysis]
+-- Core responsibilities + impact scope + dependency relationships
+-- Draw module interaction diagram

[Design] (Contract-first)
+-- Step 1: Define types (types.ts)
+-- Step 2: Define interfaces (interface.ts)
+-- Step 3: Abstraction layer skeleton + TODO markers
+-- Step 4: Implement TODOs one by one

[Implementation] (Top-down)
+-- High-level module orchestration logic
+-- Mid-level business logic
+-- Low-level utility functions
+-- Tests + documentation
```

### Scenario 2: Refactoring Code

```
[Diagnosis]
+-- Principle violations + specific issues + severity
+-- Identify parts that need abstraction

[Plan] (Abstract first, then replace)
+-- Step 1: Extract interfaces without changing implementation
+-- Step 2: Create new implementation classes
+-- Step 3: Gradually migrate callers
+-- Step 4: Remove old code

[Verification] Tests pass + functionality intact
```

### Scenario 3: Bug Fixing

```
[Locate] Symptom + root cause + impact scope
[Fix] Change location + specific solution + test verification
[Prevent] Unit tests + boundary checks + documentation updates
```

### Code Organization Order

Arrange code within files from most abstract to most concrete:

```typescript
// 1. Type definitions (most abstract)
interface IService { ... }
type Options = { ... }

// 2. Abstract implementation
abstract class BaseService implements IService { ... }

// 3. Concrete implementation
class ConcreteService extends BaseService { ... }

// 4. Utility functions (most concrete)
function helper() { ... }

// 5. Exports
export { ConcreteService, type IService, type Options }
```

---

## 4. Testing Standards

### Testing Workflow

```bash
pnpm build         # 1. Compile and build
pnpm test          # 2. Unit tests (Vitest)
pnpm check         # 3. Code quality (Knip + dependency-cruiser)
# Rust: cd packages/neko-engine && cargo test
```

### Testing Strategy

- **Unit Tests**: Test modules in isolation, mock external dependencies
- **Integration Tests**: Verify module interactions and interface contracts
- **Architecture Tests**: Validate dependency direction and detect circular dependencies

### Coverage Configuration

Vitest coverage for all packages is centrally managed via `vitest.shared.ts` (reporters + exclude patterns). Each package's `vitest.config.ts` references the `sharedCoverage()` function and can pass overrides as needed.

### Code Quality Tools

```bash
pnpm check:unused    # Knip - Detect unused files/exports/dependencies (config: knip.config.ts)
pnpm check:deps      # dependency-cruiser - Architecture rule validation (config: .dependency-cruiser.cjs)
pnpm check           # Run both
```

**dependency-cruiser Enforced Rules** (see `.dependency-cruiser.cjs` for details):
- `no-circular`: No circular dependencies allowed
- `layer0-no-internal-deps`: Layer 0 packages have zero internal dependencies
- `webview-no-vscode`: Webview must not import vscode
- `extension-no-react`: Extension must not import React
- `no-cross-extension-deps-*`: Extension packages must not depend on each other

---

## 7. Checklist

### Pre-Completion Review

**Architecture**
- [ ] Follows SOLID principles
- [ ] Modules are fully decoupled with no circular dependencies
- [ ] Dependency direction is correct (high-level does not depend on low-level implementations)

**Code**
- [ ] Contract-first: interfaces/types defined before implementation
- [ ] Top-down: high-level modules -> low-level modules
- [ ] Clear naming, comprehensive error handling
- [ ] No `any` types, no `console.log`, no `as Type` forced assertions

**Code Review Criteria**
- [ ] Excellent: Follows SOLID, clear module boundaries, easy to extend
- [ ] Acceptable: Functional, room for improvement
- [ ] Problematic: Violates principles, needs refactoring
- [ ] Critical defects: SRP violation | circular dependencies | high-level depends on low-level | missing abstractions

**Documentation**
- [ ] README updated per hybrid strategy (L1 has Context Summary)
- [ ] Complex sequences/state machines use Mermaid; everything else uses plain text

**Testing**
- [ ] Build passes: `pnpm build`
- [ ] Tests pass: `pnpm test`
- [ ] Code quality checks pass: `pnpm check`
- [ ] New interfaces have corresponding unit tests

---

## Final Reminder

```
+========================================+
|  Before writing code, ask three        |
|  questions:                            |
|  1. Does it align with the existing    |
|     architecture?                      |
|  2. How to minimize coupling?          |
|  3. Is it easy to extend and test?     |
|                                        |
|  Not sure? Draw an architecture        |
|  diagram first.                        |
+========================================+
```
