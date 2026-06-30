## Why

Agent 已经具备 IDC 阶段、创作文档路径、Skill 生命周期和事件频道骨架，但影视创作仍缺少一个明确的长期创作域模型来承接媒体追踪、prompt-chain 执行痕迹和质量审查结果。当前 `AgentWorkflowRun`、`IdcRun`、生成资产 ref 和文本 artifact 并存，容易把固定 workflow run 误当成创作身份锚点，也难以证明 Agent 是自主判断能力而不是执行一条隐藏流水线。

## What Changes

- Introduce a new Agent creation contract centered on `Creation`, `CreationIteration`, and `CreationEvent`.
- Add typed iteration activity tracking that references IDC's existing `draft` / `plan` / `apply` stages without adding new IDC phases.
- Add minimal prompt-chain execution event contracts for checkpoint, skip, reorder, and completion observations.
- Define how text artifacts, media resource refs, Skill lifecycle records, IDC context, and quality review diagnostics attach to creation iterations.
- Retire `agent-workflow-runtime.ts` as a future canonical identity source by documenting and testing that new creation tracking uses `creationId` / `iterationId`, not `workflowRunId`.
- Add path-level validation for generated media flowing through Storyboard, Canvas, Cut, and Preview using `assetRef` / `ResourceRef` instead of cache paths, Webview URIs, or temporary absolute paths.

## Capabilities

### New Capabilities

- `agent-creation-iteration-contracts`: Defines the canonical Agent creation and iteration contracts, prompt-chain execution events, and resource/reference attachment behavior for autonomous creative workflows.

### Modified Capabilities

- None. Existing generated asset, content access, Skill trigger, and Canvas/Cut handoff capabilities remain authoritative for their domains; this change adds a cross-Agent creation tracking contract and path-level tests that compose them.

## Impact

- Affected packages:
  - `packages/neko-agent/packages/agent-types`: new public DTOs and validators for creation, iteration, event, prompt-chain observation, and projection payloads.
  - `packages/neko-agent/packages/agent`: creation/iteration event helpers, IDC/Skill lifecycle attachment points, prompt-chain event emission, and tests proving `workflowRunId` is not the canonical identity.
  - `packages/neko-agent/packages/extension`: host adapter wiring for creation event persistence/projection only where needed; no Webview policy ownership moves into Extension.
  - `packages/neko-types`: only if shared Layer 0 refs need reusable helper types; otherwise keep the new Agent-specific contract in `agent-types`.
- Affected architecture:
  - Implements the P0/P1/P2 priorities from `docs/architecture/adr-agent-autonomous-filmmaking-creation-boundary.md`.
  - Keeps `runtime.workflowRuntime` as a bootstrap plane while preventing `agent-workflow-runtime.ts` from gaining new canonical creative semantics.
- Compatibility:
  - Prelaunch internal DTO changes may be breaking.
  - Existing creation documents and media resources are not migrated by this change.
  - Legacy workflow projection may remain temporarily, but new creation tracking must fail tests if it depends on `workflowRunId` as the identity anchor.
