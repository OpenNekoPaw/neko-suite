## Context

The accepted NPC test bench architecture introduced isolated `npc-test` conversations and `toolPolicy: { kind: 'none' }` for roleplay validation. Early launch UX included `/as @character`, but the current Dashboard creative entity surface can now show character rows, details, occurrences, and source-owned actions. Character operations are therefore better initiated from the entity surface instead of the Agent input slash menu.

The Agent still needs NPC-related work, but those jobs are not roleplay context switches. For interactive films, branching stories, and games, Agent should analyze a character's knowledge boundary, simulate interaction paths, and suggest character design improvements while using project-read tools. That is a normal Agent workflow, not an `npc-test` conversation.

Five-layer analysis:

- Responsibility: Dashboard owns entity-action presentation; creative entity sources own action validity and source refs; Agent extension owns VSCode commands and NPC test session lifecycle; Agent runtime owns tool-enabled analysis and validation workflows; entity services own fact mutation.
- Dependency: Dashboard Webview sends DTO actions only and imports no Agent internals. Agent extension may invoke entity/source adapters through shared contracts. Runtime validation consumes project context through existing tool/capability ports, not Dashboard UI modules.
- Interface: `DashboardCreativeEntityActionRequest` remains the cross-panel action protocol. `neko.agent.testNpc` remains the roleplay launch command. New analysis actions use explicit action ids and payloads instead of overloading `/as`.
- Extension: Additional character operations can be added as Dashboard actions without growing the slash command grammar. Validation workflows can become tools, skills, or workflow nodes as long as their public contract remains project-scoped and suggestion-only.
- Testing: Contract tests cover action ids and payload guards; Dashboard tests cover action visibility and delegation; Agent tests cover hidden `/as` catalog behavior, NPC roleplay no-tool isolation, and tool-enabled validation routing.

## Goals / Non-Goals

**Goals:**

- Make Dashboard the primary user-facing entry for NPC roleplay testing and character-centered NPC workflows.
- Remove `/as` from Agent Webview slash suggestions/help while preserving a safe migration path if existing parser behavior remains temporarily.
- Keep isolated roleplay tests no-tool and separate from main Agent conversation history.
- Add Agent workflow contracts for character perspective analysis, role validation, interaction-flow testing, and character improvement suggestions.
- Keep all entity mutations behind explicit user confirmation and entity-owned update commands.
- Preserve existing package boundaries between Dashboard, Agent Webview, Agent extension, Agent runtime, Story, and entity services.

**Non-Goals:**

- Adding a new `SessionMode: 'npc'`.
- Turning ordinary Agent chat into a long-lived roleplay persona.
- Granting tools to `npc-test` roleplay sessions.
- Making Dashboard assemble NPC prompts, read project files directly from Webview, or persist NPC artifacts.
- Automatically writing inferred character facts from validation reports.
- Implementing production game runtime NPC memory or multi-character simulation in this change.

## Decisions

### 1. Dashboard is the primary NPC operation surface

Character rows and details SHALL expose the visible actions for `test-npc`, `character-perspective`, `validate-character`, and `improve-character` when the owning source can produce a valid entity ref. The action list is more discoverable because it is attached to the selected character and can show disabled reasons for candidates, missing scope, or unavailable Agent launch paths.

Alternative considered: keep `/as` as the primary entry and add more slash variants. Rejected because the Agent input cannot show the full entity context, does not naturally collect validation scope, and makes a separate conversation look like a command result inside the current chat.

### 2. `/as` is hidden compatibility, not product UX

The Agent Webview slash catalog, autocomplete, and help text SHALL NOT expose `/as`. The extension MAY keep typed `/as @character` handling temporarily for migration, debug, or existing tests, but successful handling must still route to `neko.agent.testNpc` and create a separate `npc-test` conversation. If compatibility is removed, manual `/as` input should fail with a clear Dashboard-entry message rather than partially changing chat state.

Alternative considered: hard-remove all `/as` parsing immediately. Rejected as an implementation choice for the first cleanup because existing tests and developer workflows may still depend on the command while Dashboard action coverage is being added.

### 3. Roleplay testing and Agent validation are separate runtime paths

`test-npc` creates an isolated NPC roleplay session with `toolPolicy: { kind: 'none' }`. `character-perspective`, `validate-character`, and `improve-character` run as ordinary Agent workflows with project-read and analysis tools allowed by existing Agent policy. They may inspect Story occurrences, entity facts, and prior validation artifacts, but they do not impersonate the character in the active Agent conversation.

Alternative considered: reuse the no-tool NPC responder for validation. Rejected because validation needs project evidence, multiple scopes, and report generation that require Agent tooling.

### 4. Suggestions remain separate from entity mutation

Validation and improvement workflows produce typed findings and `NpcEvaluationSuggestion`-like outputs. Applying suggestions routes through `CreativeEntityService` or source-owned commands after explicit user confirmation. Dashboard and Agent report suggested changes, but neither writes entity facts as a side effect of analysis.

Alternative considered: let validation auto-patch sparse profiles. Rejected because model-inferred facts may be wrong, user prompts may introduce test-only improvisation, and project entity facts are the source of truth.

### 5. Scope payloads are explicit and optional

Dashboard action payloads may include story scope such as occurrence ids, scene ids, document refs, or a selected entity ref. If no scope is provided, Agent workflows default to the current project and ask for missing scope only when required. Payloads use workspace-relative or source-owned refs, never absolute local paths from Webview state.

Alternative considered: infer scope entirely from active editor state. Rejected because Dashboard actions should be deterministic and testable even when editor focus changes.

## Risks / Trade-offs

- `/as` compatibility can keep confusing behavior alive too long -> hide it from UI immediately, add tests that catalog/help omit it, and add a follow-up task to remove parser handling after Dashboard action smoke passes.
- Dashboard action surface may become crowded -> group character-only NPC actions in detail view first and keep row actions to the highest-value commands.
- Validation workflows can over-read project context -> enforce project-scoped refs, tool policy checks, and clear report provenance.
- Agent workflow outputs may look authoritative -> label findings as validation evidence or suggestions and require explicit confirmation before mutation.
- Two active OpenSpec changes may both mention `npc-character-test-bench` -> archive/apply order must reconcile this proposal with `implement-npc-character-test-bench`; if that change lands first, convert this change's NPC test bench spec into a modified delta.

## Migration Plan

1. Extend Dashboard action contracts and i18n labels for the three new character operations while keeping `test-npc` unchanged.
2. Update entity/Story Dashboard sources to expose actions only for character entities and include disabled reasons when the action cannot run.
3. Add Agent command/workflow handlers for character perspective, validation, and improvement; route Dashboard actions through shared commands or source-owned host handling.
4. Remove `/as` from Agent Webview slash command catalog, mention filters, and help UI; keep parser compatibility only if needed.
5. Add or update tests for Dashboard action visibility/delegation, slash catalog cleanup, NPC roleplay launch, and Agent validation workflow routing.
6. After Dashboard launch is verified, remove hidden `/as` parser compatibility or keep it behind an explicit developer/debug flag.

Rollback is straightforward: disable the new Dashboard actions and keep `neko.agent.testNpc` available. Hiding `/as` can be reverted independently if Dashboard launch is blocked.

## Open Questions

- Should `character-perspective` and `validate-character` launch a prefilled Agent conversation turn, a structured report tab, or both?
- Should row-level Dashboard actions show only `test-npc` while detail view shows all NPC operations?
- Should typed `/as` compatibility be removed in the same implementation change or one release later?
- What minimum report schema should `validate-character` return before richer interaction-path simulation is implemented?
