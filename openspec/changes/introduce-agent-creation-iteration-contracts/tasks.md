## 1. Agent Creation Contracts

- [ ] 1.1 Add `AgentCreation`, `AgentCreationIteration`, attachment, diagnostic, trace, status, and activity DTOs in `packages/neko-agent/packages/agent-types/src/`.
- [ ] 1.2 Add validators/type guards for creation, iteration, text artifact refs, media refs, prompt-chain observations, and diagnostics.
- [ ] 1.3 Export the new contracts from `packages/neko-agent/packages/agent-types/src/index.ts`.
- [ ] 1.4 Add unit tests proving valid payloads pass and invalid IDC stages such as `observe`, `evaluate`, and `revise` fail as `idcStage`.
- [ ] 1.5 Add tests proving media attachments reject Webview URIs, `.neko/.cache` paths, system temp paths, and unapproved absolute paths as durable identity.

## 2. Legacy Creation Event Boundary

- [ ] 2.1 Audit existing `creation-events.ts` exports and decide whether to add explicit `AgentCreation*` names beside legacy run/persona events or rename the legacy event union.
- [ ] 2.2 Update comments and exports so legacy run/persona events cannot be confused with canonical creation/iteration events.
- [ ] 2.3 Add tests that cover the legacy event namespace and the new canonical creation event namespace separately.

## 3. Runtime Creation Iteration Helpers

- [ ] 3.1 Add host-agnostic Agent runtime helpers or a small service for constructing creation ids, iteration ids, and iteration event envelopes without depending on `AgentWorkflowRun`.
- [ ] 3.2 Connect IDC context to iteration creation so `idcStage` is populated only with `draft`, `plan`, or `apply`.
- [ ] 3.3 Connect Skill lifecycle projection/records to iteration events through stable record ids or equivalent active Skill projection ids.
- [ ] 3.4 Connect text artifact writes/observations to iteration inputs and outputs using project-visible paths or artifact ids, not `ResourceRef`.
- [ ] 3.5 Add runtime tests proving creation tracking still works when `workflowRunId` is absent or poisoned.

## 4. Prompt-Chain Observation Events

- [ ] 4.1 Add prompt-chain observation DTOs for `checkpoint`, `skip`, `reorder`, and `complete`.
- [ ] 4.2 Add runtime emission helpers for prompt-chain observations linked by `creationId`, `iterationId`, and `promptChainId`.
- [ ] 4.3 Wire explicit prompt-chain Skill execution paths to record at least start/checkpoint, skip or reorder when applicable, and completion observations.
- [ ] 4.4 Add tests proving prompt-chain observations are records of Agent decisions and do not create executable workflow nodes.

## 5. Media Ref Path-Level Validation

- [ ] 5.1 Add a focused generated media fixture that starts with `GeneratedAsset.assetRef` and is promoted or represented as `ResourceRef` before durable handoff.
- [ ] 5.2 Add Storyboard attachment tests proving generated media uses `assetRef` / `ResourceRef` and rejects cache path or Webview URI identities.
- [ ] 5.3 Add Canvas transfer tests proving cache-backed generated refs are promoted or diagnosed before Canvas receives durable input.
- [ ] 5.4 Add Canvas-to-Cut draft handoff tests proving stable media refs or existing validated project-relative/variable paths are preserved.
- [ ] 5.5 Add Preview/Webview projection tests proving render URIs remain runtime-only and do not replace the creation iteration's stable media ref.

## 6. Workflow Runtime Downgrade

- [ ] 6.1 Mark `agent-workflow-runtime.ts` and `AgentWorkflowRun` usage as legacy projection/trace in code comments or type names where practical.
- [ ] 6.2 Move reusable IDC entry-stage selection helpers toward IDC/stage policy if they are still needed by new code.
- [ ] 6.3 Ensure no new creation/iteration implementation imports `createAgentWorkflowRuntime` or requires `AgentWorkflowRuntime`.
- [ ] 6.4 Add or update tests proving `runtime.workflowRuntime` bootstrap surfaces still provide `stageTracking`, `idcTaskProjection`, and `controlPlane`.

## 7. Validation

- [ ] 7.1 Run targeted `agent-types` tests for creation contracts and validators.
- [ ] 7.2 Run targeted `agent` runtime tests for iteration helpers, prompt-chain observations, IDC/Skill attachment, and workflow identity poisoning.
- [ ] 7.3 Run targeted extension/service tests for generated media promotion and Canvas transfer paths.
- [ ] 7.4 Run targeted shared type tests for Storyboard, Canvas/Cut draft, content access, and generated asset ref behavior touched by the path-level fixtures.
- [ ] 7.5 Run `pnpm check` or record why a narrower validation set is sufficient for this contract-first change.
