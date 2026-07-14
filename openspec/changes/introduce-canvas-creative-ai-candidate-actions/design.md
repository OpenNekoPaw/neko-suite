## Context

Canvas currently has UI affordances and legacy generation paths that can route a generation request to Agent but still depend on `neko.agent.generateForNode`, `generationProgress`, and `dataUrl` mutation. That path is not sufficient for prompt optimization, image/video editing, candidate review, judge-based promotion, stable ResourceRef outputs, or per-media concurrency control.

The architecture already defines the important boundaries:

- `docs/architecture/adr-agent-creative-invocation-run-boundary.md` makes document/run/workItem the execution authority for creative package AI calls.
- `docs/architecture/adr-agent-message-task-queue-boundary.md` separates messages, task queues, and workItem task cards.
- `docs/architecture/adr-canvas-creative-ai-candidate-actions.md` records the Canvas-specific candidate-first decision.
- `ExternalCreativeAiInvocation`, `CreativeAiRunRuntime`, Canvas apply adapters, storyboard prompt contracts, and Agent workItem projections already exist as foundations.

This change is L3/L4 in effect because it touches AI workflow, Webview/Extension message paths, shared contracts, media generation lifecycle, candidate writeback, and a core creative workflow.

## Goals / Non-Goals

**Goals:**

- Keep `Send to Agent` as a foreground context handoff and introduce separate Canvas AI action requests for background creative runs.
- Require target fill refs and candidate refs before Agent execution.
- Apply optimized prompts and generated/edited media as candidates first.
- Promote candidates only after explicit user acceptance or a passing judge workItem, with revision re-check.
- Use `videoPromptDocument` as the only new video/voice prompt authority.
- Let Canvas own creative parameter extraction and validation while Agent owns scheduling, provider/model runtime resolution, progress, retries, cancellation, judge execution, and apply orchestration.
- Limit concurrent image, audio, video, and text/judge work independently in Agent.
- Show Canvas aggregate progress while keeping single workItem progress in Agent.
- Use ResourceRef/artifact identities for generated media and package-owned Canvas apply for writeback.

**Non-Goals:**

- Do not modify `Send to Agent` foreground behavior.
- Do not add provider/model SDK calls to Canvas.
- Do not keep `voicePromptDocument` as a new-path input or output authority.
- Do not use `dataUrl`, Webview URI, cache path, temp path, or provider runtime handles as durable result identity.
- Do not automatically write background session history to Project Memory.
- Do not create a cloud queue service, daemon, gateway session router, or remote orchestration layer.

## Decisions

### 1. Canvas AI buttons use typed action requests, not `sendToAgent`

Canvas Webview will send a typed creative action request such as optimize prompt, generate image, edit image, generate video, or edit video. Canvas Extension resolves document identity, prompt state, reference media, candidate target, mutating target, revisions, idempotency, and creative parameters before invoking Agent.

Alternative rejected: reuse `sendToAgent` with an intent string. That would route work through foreground chat semantics, lose target fill refs, and make tests prove only that a message was sent, not that a candidate was created or promoted.

### 2. Candidate-first is mandatory for all generated or optimized results

Agent results are first applied to a Canvas candidate target. Promotion to the mutating target is a separate action that requires user acceptance or judge pass and re-checks target revision.

Alternative rejected: write directly to prompt/media fields after provider success. Direct writes make provider quality the only gate and can overwrite user edits with low-quality output. Revision checks protect freshness, not quality.

### 3. `videoPromptDocument` absorbs voice/dialogue prompt content

New paths read and write `videoPromptDocument` only for video, voice, dialogue, sound, movement, camera, and screen action prompt content. Existing `voicePromptDocument` data may be merged during projection or migration, but new actions do not create it.

Alternative rejected: keep a separate voice prompt document and concatenate later. That leaves the model-facing prompt split across authorities and can separate dialogue/audio from visual timing.

### 4. Canvas validates creative parameters; Agent resolves runtime parameters

Canvas validates creative parameters because it owns shot/scene facts and UI diagnostics. Agent resolves runtime parameters because it owns provider catalog, profile/model config, retries, timeouts, cost gates, and scheduling lanes.

Canvas may pass model capability requirements or user/model preferences from shot/scene config, but not provider runtime handles or raw SDK parameters. If Canvas detects a missing prompt, missing reference, unsupported edit mode, invalid duration, unsupported aspect ratio, or invalid target, it reports diagnostics without starting Agent work.

Alternative rejected: let Agent infer everything from natural language. That would hide configuration errors and make tests compare final text rather than typed action contracts.

### 5. Agent uses run/workItem with media lanes and visible session projection

Agent creates or reuses a creative run and workItems for the action targets. For Canvas product traceability, the run is projected into a visible background Agent creative session that users can open from the Agent conversation list. The run/workItem remains the execution, idempotency, progress, cancellation, cost, and writeback authority.

Agent scheduling uses independent lanes for image, audio, video, and text/judge work. WorkItems beyond the lane limit remain queued with diagnostics/status. Canvas consumes aggregate counts; Agent owns individual progress.

Alternative rejected: make conversation the concurrency unit. Conversations are user-visible inspection and continuation surfaces; using them as the scheduler would fragment history and make cost/concurrency limits harder to enforce.

### 6. Migrated buttons must poison legacy success paths

For migrated Canvas AI buttons, tests must fail if execution succeeds through `sendToAgent`, `neko.agent.generateForNode`, `generationProgress`, `dataUrl`, direct Canvas Webview store mutation, or a package-local provider call.

Alternative rejected: keep old and new paths in parallel until the UI looks right. Parallel success paths hide broken new behavior and make acceptance result-only instead of path-level.

## Five-Layer Analysis

### Responsibility

- Shared contracts own host-neutral DTOs and validators.
- Canvas Webview owns button UI, local drafts, disabled/diagnostic state, aggregate progress rendering, and candidate review controls.
- Canvas Extension owns preflight, creative parameter extraction, target/candidate refs, revision, idempotency, and package-owned apply.
- Agent runtime owns run/workItem execution, lane scheduling, judge, retries, cancellation, progress, and observations.
- Agent Extension owns VS Code command bridges, provider/model config access, background session projection, and Canvas apply orchestration.

### Dependency

- Webview stays Layer 2 and never imports VS Code, Node, Agent runtime, provider SDKs, or feature package internals.
- Shared DTOs stay Layer 0 and do not import Canvas/Agent implementations.
- Canvas and Agent communicate through shared contracts plus command/API facades.
- Agent writes Canvas facts only through Canvas-owned apply adapters.

### Interface

- Canvas Webview request: action id, node/scene ids, local draft state token, and optional user-selected creative config.
- Canvas Extension envelope: documentRef, sourceRef, targetRef, candidateTargetRef, action config, creative params, reference media, revisions, idempotency, and routing/projection metadata.
- Agent snapshots: run status, workItem status, lane status, total/completed/failed/queued/running counts, candidate refs, diagnostics, and session projection refs.
- Canvas apply: candidate apply, promotion apply, stale-target, judge-rejected, deleted-target, and idempotent duplicate handling.

### Extension

- Additional creative packages can use the same candidate-first and run/workItem pattern with their own apply adapters.
- New media models are added through Agent capability/model catalogs and Canvas capability projections, not Canvas provider code.
- Future compare/review panels can read candidate refs and judge diagnostics without changing the execution path.

### Testing

- Contract tests for DTO validators and fail-visible invalid envelopes.
- Canvas Extension tests for preflight and invocation construction.
- Canvas Webview tests for disabled buttons, diagnostics, candidate controls, and progress counts.
- Agent runtime tests for lane scheduling, workItem lifecycle, idempotency, judge, and apply orchestration.
- Legacy poison tests proving migrated buttons cannot succeed through old paths.
- Real VS Code Webview functional scenarios for Extension/Webview behavior.

### Proportionality

This design adds no remote services, daemons, or distributed queues. The extra contracts are needed because the real local boundaries are Webview sandboxing, package-owned project facts, provider cost/latency, generated media identity, and revision-safe writeback.

### Fail-Visible Behavior

- Unknown action id, missing target refs, missing candidate refs, missing revision, invalid source refs, stale target, unsupported model capability, missing provider config, lane config errors, unsupported edit inputs, and invalid ResourceRef all fail with diagnostics.
- No migrated button may return success via a legacy fallback path.
- Judge failure records a failed/rejected candidate, not a mutating apply success.

## Risks / Trade-offs

- [Risk] Candidate-first adds one more user step. -> Mitigation: allow judge-approved auto-promotion only when explicitly configured and still re-check revision.
- [Risk] Lane limits can make batch generation feel slower. -> Mitigation: expose aggregate queued/running/completed counts and keep limits configurable by media kind.
- [Risk] Existing voice prompt data may be split from video prompt. -> Mitigation: merge old voice prompt into video prompt during projection/migration and stop creating new voice docs.
- [Risk] Background session projection may be mistaken for execution authority. -> Mitigation: document and test that run/workItem state remains authoritative.
- [Risk] ResourceRef promotion and Canvas candidate UI may require more surface work than a direct dataUrl mutation. -> Mitigation: migrate buttons incrementally and poison only migrated paths.

## Migration Plan

1. Add shared contracts and validators for Canvas creative action requests, candidate refs, promotion, lane snapshots, and diagnostics.
2. Add Canvas preflight and invocation builder for optimize prompt, generate/edit image, and generate/edit video.
3. Add Agent run/workItem execution bridge with media lane scheduling and visible background session projection.
4. Add candidate apply and promotion apply in Canvas apply adapter, including revision re-check and judge rejection states.
5. Migrate Webview buttons from `sendToAgent`/`generateForNode` to typed creative action requests.
6. Poison migrated legacy paths in tests, then remove or fail-close obsolete success paths.
7. Run focused unit/contract tests and real VS Code Webview functional scenarios.

## Open Questions

- What are the initial default lane limits for image, audio, video, and text/judge work?
- Which actions should allow judge-approved auto-promotion in v1, if any?
- Should candidate review live inside the current shot overlay first, or use a dedicated candidate comparison panel?
