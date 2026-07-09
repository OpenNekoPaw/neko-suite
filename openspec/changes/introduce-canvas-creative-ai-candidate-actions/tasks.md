## 1. Shared Contracts

- [x] 1.1 Add or refine shared Canvas creative action DTOs for action id, source refs, target refs, candidate refs, creative parameters, revision, idempotency, and diagnostics.
- [x] 1.2 Add candidate apply and promotion request/result contracts with stale-target, judge-rejected, deleted-target, and idempotent duplicate outcomes.
- [x] 1.3 Add Agent creative lane snapshot contracts for image, audio, video, and text/judge lanes with queued/running/completed/failed counts.
- [x] 1.4 Add validators for invalid action ids, missing fill targets, missing revisions, unsupported edit inputs, runtime-only resource identities, and unknown schema versions.

## 2. Canvas Preflight And Invocation

- [x] 2.1 Add Canvas Webview creative action messages for optimize prompt, generate image, edit image, generate video, and edit video without reusing `sendToAgent`.
- [x] 2.2 Implement Canvas Extension preflight that resolves shot/scene prompt docs, reference media, creative parameters, model capability requirements, target refs, candidate refs, revisions, and idempotency keys.
- [x] 2.3 Merge or project legacy voice prompt content into `videoPromptDocument` for new action requests and stop creating `voicePromptDocument` from the new path.
- [x] 2.4 Return parameter diagnostics to the Canvas Webview for missing prompts, missing edit source media, unsupported model capability, unsupported advanced parameters, invalid duration/aspect ratio, and missing target refs.
- [x] 2.5 Build explicit creative invocation envelopes for each action and reject requests that would require Agent to infer targets from free text or Webview selection.

## 3. Agent Run Scheduling

- [x] 3.1 Extend the Agent creative invocation command path so accepted Canvas invocations start run/workItem execution rather than only accepting a run snapshot.
- [x] 3.2 Add media lane scheduling for image, audio, video, and text/judge workItems with configurable maximum active counts.
- [x] 3.3 Resolve provider/model/profile/runtime settings from Agent configuration and capability catalogs, using Canvas input only as creative requirements or preferences.
- [x] 3.4 Project Canvas creative runs into visible background Agent creative sessions that can be opened from the Agent conversation list.
- [x] 3.5 Emit workItem and aggregate run snapshots for Canvas, Agent session projection, cancellation, retry, failure, and completion.

## 4. Candidate Apply, Judge, And Promotion

- [x] 4.1 Extend Canvas apply adapter to write prompt, image, and video candidates without mutating formal shot/scene targets.
- [x] 4.2 Add promotion apply that re-checks target revision and writes candidate content to the formal target only after user acceptance or judge pass.
- [x] 4.3 Add judge workItem execution and result projection for candidate quality review, including infrastructure failure diagnostics.
- [x] 4.4 Add UI controls or messages for accepting, rejecting, retrying, deleting, and inspecting candidates.
- [x] 4.5 Record candidate, judge, and promotion provenance in Canvas and Agent observations without writing Project Memory automatically.

## 5. Canvas UI And Progress

- [x] 5.1 Wire Shot UI buttons to the new creative action request path and keep `Send to Agent` behavior unchanged.
- [x] 5.2 Disable or diagnose AI buttons when Agent availability, target refs, candidate refs, prompt docs, source media, or model capability requirements are invalid.
- [x] 5.3 Display aggregate run progress in Canvas using Agent snapshots for total, completed, failed, running, and queued counts.
- [x] 5.4 Render candidate prompt/media results and promotion state without storing Webview URI, blob URL, cache path, temp path, or `dataUrl` as durable identity.
- [x] 5.5 Update i18n strings for new diagnostics, button states, progress, candidate review, judge result, and promotion actions.

## 6. Legacy Path Cleanup

- [x] 6.1 Remove or fail-close migrated button success through `neko.agent.generateForNode`, `generationProgress`, and `dataUrl` writeback.
- [x] 6.2 Add poison tests proving migrated buttons do not use `sendToAgent`, foreground Agent selected conversation, direct provider SDK calls, or Webview store mutation as success paths.
- [x] 6.3 Keep any remaining legacy generation command explicitly scoped to unmigrated flows with owner, removal condition, diagnostics, and tests.

## 7. Tests And Validation

- [x] 7.1 Add shared contract tests for action requests, candidate/promotion requests, lane snapshots, invalid refs, revision, idempotency, and diagnostics.
- [x] 7.2 Add Canvas Extension tests for preflight, invocation construction, candidate apply, promotion apply, stale target, missing target, and video prompt authority.
- [x] 7.3 Add Canvas Webview tests for button disabled state, diagnostics, candidate rendering, accept/retry/delete actions, and aggregate progress.
- [x] 7.4 Add Agent runtime tests for lane concurrency, queued workItems, duplicate idempotency, cancellation, retry, judge pass/fail, provider capability mismatch, and apply failure.
- [x] 7.5 Run targeted validation for touched packages, including focused Vitest suites and `pnpm check` or narrower package checks.
- [x] 7.6 Run VS Code Webview runtime smoke for Canvas AI buttons, candidate/progress UI, diagnostics, and Agent background session projection, or record residual risk if unavailable.

## 8. Documentation

- [x] 8.1 Link the Canvas candidate-first ADR from architecture docs and reference it from implementation notes where needed.
- [x] 8.2 Update Canvas/Agent package documentation to describe the new Canvas AI button path, candidate-first promotion, media lane scheduling, and legacy path removal.
- [x] 8.3 Record validation commands and residual risk in the implementation delivery notes.
