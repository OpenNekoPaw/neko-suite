## Canvas Authoring Contract Audit

Date: 2026-07-06

### Reused Contracts

- `packages/neko-types/src/types/canvas.ts`
  - Reuse `CanvasNodeType`, `ConnectionType`, `CanvasConnection`, `CanvasNode`, container capability, and core node/connection registries as the domain vocabulary for catalog summaries.
- `packages/neko-types/src/types/canvas-agent-operations.ts`
  - Reuse `CanvasNodeCreateSpec`, `CanvasCreateConnectionRequest`, `CanvasCreateCompositeRequest`, `CanvasUpdateBlockRequest`, `CanvasAgentTargetRef`, `CanvasAgentProvenance`, `CanvasAgentActiveContextRequest`, and `CanvasAgentActiveContextResult`.
  - These remain operation payload contracts; new authoring catalog/result DTOs wrap their semantics but do not replace them.
- `packages/neko-types/src/types/extension-api.ts`
  - Reuse Extension Host `api.canvas.nodes` as the canonical Canvas mutation boundary for active editor state, undo/history, and Webview mediation.
- `packages/neko-types/src/types/canvas-markdown-capabilities.ts`
  - Reuse Markdown capability DTOs, approval context, stable resource validation policy, and runtime-only identity rejection for Markdown ingest paths.
- `packages/neko-types/src/types/tool-names.ts`
  - Reuse existing Canvas tool-name constants for node, composite, block, context, generation, and Markdown lifecycle tools.
- `packages/neko-agent/packages/webview/src/components/ChatView/SendToMenu.tsx`
  - Reuse the visible split between Agent-led Canvas authoring and explicit direct asset transfer; Markdown content now uses the general authoring handoff instead of a Markdown-specific Webview protocol message.

### Extended Contracts

- `packages/neko-types/src/types/canvas-authoring-contracts.ts`
  - Added shared Canvas authoring catalog DTOs for sections, node/preset/container/connection descriptors, targetable fields, resource policies, operations, recipes, refs, diagnostics, and result envelopes.
  - Added validators for catalog requests, catalog results, result envelopes, operation descriptors, diagnostics, and stable refs at the Agent/Canvas package boundary.
- `packages/neko-types/src/types/tool-names.ts`
  - Added `canvas_describe_authoring_capabilities` as the read-only catalog query tool name.
- `packages/neko-markdown`
  - Added public Markdown extension projection contracts consumed by Agent Webview while leaving resource/field semantics to Agent, Canvas, and owning domains.

### Deprecated Or Migration-Only Paths

- `canvas-markdown-storyboard`
  - Removed during prelaunch cleanup. Storyboard guidance now lives only inside the general `canvas-authoring` Skill.
- `requestCanvasMarkdownHandoff`
  - Removed during prelaunch cleanup. Markdown/table shortcuts now send `requestCanvasAuthoringHandoff` with `sourceKind: "markdown"` and Markdown source/profile hints.
- Hidden Send to Canvas mutation through Webview/Extension heuristics
  - New authoring requests must become Agent-visible handoff intent before Canvas mutation.
- Structured plugin-transfer payloads that masquerade as authoring
  - Direct `sendToPlugin -> neko.canvas.importAsset` remains an explicit asset import/add-source path, not canonical Agent-authored Canvas composition.

### Canvas-Private Responsibilities

- Durable `.nkc` mutation, active editor selection, viewport insertion point, undo/history, Webview bridge state, and resource authorization remain Canvas Extension Host responsibilities.
- Node/preset/container/connection validation and prompt-field alignment validation remain Canvas-owned.
- Full Canvas document JSON and Webview runtime state are not exposed as Agent context; Agent receives bounded summaries, refs, catalog sections, and structured diagnostics.

### First Slice Boundary

- This slice defines contracts and fail-visible validators only. It does not register the catalog tool, build the catalog from runtime Canvas state, expose connection mutations, or replace Send to Canvas routing.
