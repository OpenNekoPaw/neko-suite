## Context

The ADR `docs/architecture/adr-storyboard-entity-canvas-projection-boundary.md` establishes that Storyboard, Canvas, and unified entities stay independently modeled. Creative tools need low-friction entity binding and Quick Edit, but entity-global writes must remain owned by `neko-entity` and complex management remains in Dashboard.

Current code exposes only `neko.entity.getDashboardCreativeEntitySource` and `neko.entity.processMemoryContribution` as entity commands. `CreativeEntityService` already has methods for confirm, rename, alias, metadata, binding, and visual draft operations, but most are not exposed as typed facade commands.

## Goals / Non-Goals

**Goals:**

- Expose typed Entity Facade commands for resolve, candidate lifecycle, binding, detail reads, and Quick Edit writes.
- Keep Quick Edit centralized in Extension Host command handlers and service methods.
- Allow creative tools to trigger binding and edits without importing `neko-entity` internals.
- Provide project-scoped runtime/event sharing so Dashboard, Canvas, Inspector, and tools receive consistent change events.
- Make overlay a future optional trigger surface, not a dependency.

**Non-Goals:**

- Do not implement Canvas Hover Card or Inspector UI in this change.
- Do not implement orphan lifecycle fields or FileWatcher logic here.
- Do not migrate `characters.json` or entity storage format.
- Do not build per-Webview rich edit forms for entity-global fields.

## Decisions

### Decision 1: Commands are the cross-extension boundary

The facade registers `neko.entity.*` commands with serializable DTOs. Canvas, Assets, Agent, Sketch, Model, and Story call these commands through VSCode command protocol or their own Webview-to-host message bridge.

Alternatives considered: direct package imports or shared React overlay ownership. Direct imports violate extension boundaries; overlay only solves rendering and still requires write routing.

### Decision 2: Quick Edit lives in Extension Host

Quick Edit commands own validation, dedup checks, source-approved policy, native UI invocation, service mutation, and event emission. Webviews expose trigger buttons only.

Short fields can use `showInputBox` or `showQuickPick`; long text, multi-field memory edits, merge, and relationship edits remain Dashboard workflows.

### Decision 3: Entity runtime is project-scoped and shared

Command handlers and Dashboard source adapters MUST obtain the same runtime/event bus for a project root. Creating isolated runtimes per command would cause `onDidChangeEntity` listeners to miss confirm or binding events.

### Decision 4: Widget protocol is trigger-only

`EntityBindingWidget` describes host context, entity/candidate refs, asset refs, and requested actions. It does not store entity facts, implement validation independently, or directly mutate files.

## Risks / Trade-offs

- **Risk: facade command surface grows too broad.** -> Keep commands typed and small; complex workflows stay in Dashboard.
- **Risk: native UI interrupts visual context.** -> Use Inspector/Hover Card for preview and native UI only for short entity-global edits.
- **Risk: multi-root commands target the wrong project.** -> Require project root or context URI in write requests; reject ambiguous requests.
- **Risk: event listeners miss changes.** -> Centralize runtime registry by project root and test cross-command event propagation.

## Migration Plan

1. Add facade DTOs and validation guards.
2. Add project runtime registry and refactor existing entity commands to use it.
3. Register read, resolve, candidate, binding, draft, and quick-edit commands.
4. Add simple host-native UI wrappers for Quick Edit commands.
5. Update tools incrementally to call facade commands instead of building custom write paths.
6. Keep Dashboard as the fallback for unsupported complex edits.
