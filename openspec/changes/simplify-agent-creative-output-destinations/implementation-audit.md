## Implementation Audit

Date: 2026-07-15

### Canvas Board routing and delivery

| Current owner/path | Current responsibility and state | Canonical replacement | Data handling |
| --- | --- | --- | --- |
| `@neko/shared/types/canvas-board-routing.ts` | Multi-Board query, binding, resolution, frozen target, delivery DTOs and validators | Canvas workspace/explicit projection request and result contract | No persisted user data; replace contract and fixtures directly |
| `AgentCanvasBoardCoordinator` | Stores `neko.agent.canvasBoardBindings.v1` in VS Code Memento and calls `NekoCanvasAPI.boards.resolve/deliver` | Thin typed-result to Canvas projection adapter | Stop reading/writing binding key; cleanup metadata only, never `.nkc` files |
| `AgentCanvasBoardWorkRuntime` and `agentCanvasDeliveryClassifier` | Infers creative intent/content, resolves Board before turn, delivers prose/artifacts/media after turn | No replacement runtime; Host forwards already-declared typed results | No durable user data; delete after projector is connected |
| `CanvasBoardIndexService` and `CanvasBoardResolverService` | Scans `neko/boards/*.nkc`, matches stable scope, observes revisions and creates arbitrary Boards | `WorkspaceBoardProjector` derives `neko/boards/workspace.nkc` or accepts explicit `.nkc` | Existing `.nkc` files remain ordinary documents and are never deleted |
| `CanvasBoardDeliveryService` and `canvasBoardProjection.ts` | Applies Markdown/file refs but routes unpromoted media to runtime draft projection | `WorkspaceBoardProjector` writes ordinary Group/Media/Document nodes | Reuse normal `.nkc` codec/authoring and stable refs |
| `CanvasGeneratedDraftProjectionService`, promotion orchestrator and `GeneratedDraftLayer` | In-memory candidate Groups, pin/discard state, Save to Assets then Board apply | Durable generated output plus ordinary Inbox nodes; Asset promotion independent | Runtime-only layout has no durable migration; resolvable generated sources can be explicitly projected |

### Generated output lifecycle

| Current owner/path | Current responsibility and state | Canonical replacement | Data handling |
| --- | --- | --- | --- |
| TUI `NodeMediaTaskDeliveryHost` | Writes terminal outputs to workspace `neko/generated/<kind>/` and indexes them | Retain behavior and share one output-dir/materialization contract | Existing generated files remain in place |
| VSCode `MediaTaskDeliveryHost` | Writes terminal outputs under project-local `.neko/.cache/generated/<kind>/`; configured output is constrained to that cache root | Use the workspace `neko/generated/<kind>/` planner used by TUI | Provider scratch stays cache-owned; creator-visible completion moves only through canonical materialization |
| Platform `GeneratedAssetIndex` + ResourceCache store | Persists generated id, host path, stable asset/resource refs and supports legacy JSON migration | Remains generated-output identity owner; extend atomic commit/adoption and reference-aware deletion refusal | Preserve SQLite/index records and legacy files; missing files diagnose without filename/cache fallback |
| AssetLibrary promotion | Creates distinct AssetEntity from a resolved generated candidate | Remains explicit optional curation | Promotion must not delete canonical generated source |

### Cut project authoring

| Current owner/path | Current responsibility and state | Canonical replacement | Data handling |
| --- | --- | --- | --- |
| `CutProjectAuthoringService` | Headless `.nkv` load/create/update/import; generic validator still accepts `active` with URI | Cut-specific validator accepts only explicit `file` and operation-allowed `new` targets | Existing `.nkv` files and schema are unchanged |
| generated clip and storyboard/Canvas draft command resolvers | Prefer explicit target, otherwise use active Cut, otherwise auto-create a workspace `.nkv` | Require explicit file target or explicit create-new target from invocation | Remove active/recent/unique/default-create fallback |
| interactive `VideoEditorProvider` commands | Own an instance-bound document URI | Adapter materializes that URI as `{ kind: 'file', documentUri }` before async authoring | UI-local operations can remain instance-bound |
| Agent/Canvas/plugin transfer/Cut operation adapters | Call public Cut authoring/commands with mixed target forms | Pass explicit target and applicable project revision/digest | No Agent-owned target or approval state |

### Host and ownership boundary

- Agent core retains only generic Tool/Task/result/Approval contracts and receives no Canvas or Cut destination fields.
- Canvas owns projection validation, target derivation, ordinary node planning, revision apply and diagnostics.
- VSCode and TUI own instance-scoped workspace adapters and generated-output indexes; Webviews own only interaction/render projection.
- `.nkc` remains the only spatial fact source. `neko/generated/` and its index resolve content but never reconstruct layout from directory order.
- Legacy success paths are removed or poisoned; no dual routing, active-document fallback, runtime Group fallback or automatic Asset promotion remains.
