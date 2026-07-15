## 1. Contract And Legacy-Path Cutoff

- [x] 1.1 Audit `CanvasBoard*`, generated-draft, `GeneratedAssetIndex`, media delivery, `NekoProjectAuthoringTarget`, Cut command, TUI, and public Extension API producers/consumers; record the exact canonical replacements and any valuable persisted data each old path owns.
- [x] 1.2 Replace the shared multi-Board resolve/binding contract with a Canvas-owned workspace/explicit projection request and result contract; keep stable output/artifact provenance, revision, diagnostics, and path-transparent `ResourceRef` validation.
- [x] 1.3 Add shared contract tests for canonical `neko/boards/workspace.nkc`, explicit `.nkc`, unsupported projection kinds, replay identity, missing workspace, and rejection of active/recent/conversation/scope target inputs.
- [x] 1.4 Add Cut-specific target validation over `NekoProjectAuthoringTarget` so durable Cut operations accept only explicit `file` or explicitly allowed `new` `.nkv` targets; add tests rejecting `active`, omitted kind/URI, invalid extension, and create-new on non-create operations.
- [x] 1.5 Add architecture/path poison tests that fail if new requests reach `AgentCanvasBoardWorkRuntime`, conversation Board binding, `CanvasBoardIndexService`, scope resolution, runtime-only generated-draft apply, or active Cut durable mutation.
- [x] 1.6 Disconnect legacy Board binding/index/runtime Group success paths from default host assembly before accepting the new path; make any temporarily reachable migration entry fail closed for ordinary new requests.

## 2. Generated Output Workspace Persistence

- [x] 2.1 Converge VSCode and TUI media delivery settings on the existing workspace-relative `neko/generated/<kind>/` planner; remove `.neko/.cache/generated` as the creator-visible terminal output directory while retaining cache for provider scratch.
- [x] 2.2 Update the generated-output owner to atomically materialize validated creator-visible files, then commit stable id, revision/digest, MIME/media kind, task/run lineage, and Host-local location to `GeneratedAssetIndex` before terminal success.
- [x] 2.3 Make completion replay idempotent by output identity and revision, prevent overwrite of another revision, and add partial-write/index-failure diagnostics and cleanup tests.
- [x] 2.4 Preserve Agent/Webview path transparency: task result and continuation payloads expose stable generated-output `ResourceRef`, while absolute paths remain inside Host content access and render projection.
- [x] 2.5 Update generated-output content access/reload so both VSCode and TUI resolve workspace-persisted outputs after restart without AssetLibrary fallback or filename guessing.
- [x] 2.6 Add reference-aware explicit delete/retain behavior for canonical generated outputs, or fail closed with a diagnostic if the existing owner cannot yet prove references; Canvas node deletion must not delete files.
- [x] 2.7 Preserve existing `neko/generated/` files in place and extend the existing index migration/adoption path to register resolvable sources idempotently; report missing/unreadable legacy files without moving, deleting, or cache-fallback recovery.
- [x] 2.8 Update Asset promotion/import tests so generated-output and AssetEntity identities remain distinct, promotion is optional for Board projection, and promotion never silently deletes the canonical generated source.

## 3. Workspace Board Projector

- [x] 3.1 Implement a Canvas-owned `WorkspaceBoardProjector` using the host-neutral Canvas planner/codec and `CanvasProjectAuthoringService`; derive the default target only from one bound workspace root and support an optional explicit `.nkc` URI.
- [x] 3.2 Implement idempotent creation of `neko/boards/workspace.nkc` and its ordinary Inbox Group/placement region; reject invalid existing schema/version without overwriting or alternate-Board creation.
- [x] 3.3 Project generated media and declared creator-useful durable artifacts as ordinary persisted Group/Media/Document nodes using stable output/artifact provenance and existing Canvas source contracts; do not add a GeneratedInboxNode or Board profile.
- [x] 3.4 Preserve creator geometry, Group membership, connections, labels, annotations, and edited text during replay/metadata refresh; create a distinguishable candidate or fail visibly when a new revision cannot safely update an existing node.
- [x] 3.5 Return projection status separately from generation/task success so output remains recoverable when Canvas is unavailable or revision-conflicting; implement same-request idempotent retry without active/other-Board fallback.
- [x] 3.6 Simplify the public `NekoCanvasAPI.boards` surface to the canonical projector API and migrate all in-repo callers; remove resolve/index/binding inputs and reject unknown legacy payloads.
- [x] 3.7 Wire VSCode terminal typed task/artifact results to the public Canvas projector through a thin Host adapter that performs no natural-language intent classification, Board selection, plan interpretation, or Canvas-specific approval.
- [x] 3.8 Compose the same host-neutral projector in TUI with the session-bound workspace/file adapter; report `authoring-capability-unavailable` or `workspace-required` visibly when composition is unavailable or ambiguous.
- [x] 3.9 Notify an open Canvas Webview after the host save and render the persisted ordinary Inbox nodes through existing renderers; verify projection also succeeds with no open Webview.

## 4. Remove Multi-Board And Runtime-Draft Infrastructure

- [x] 4.1 Remove `AgentCanvasBoardCoordinator`, `AgentCanvasBoardWorkRuntime`, conversation Board Memento keys, intent classification, retry actions, and their host wiring after canonical projector path tests pass.
- [x] 4.2 Remove `CanvasBoardIndexService`, multi-Board scope resolver, automatic arbitrary Board creation, and related public contracts/tests; preserve ordinary explicit multi-`.nkc` editor behavior.
- [x] 4.3 Remove `CanvasGeneratedDraftProjectionService`, runtime generated layer as the default result path, and promotion-and-Board-apply orchestration; keep Asset promotion as an independent explicit Asset operation.
- [x] 4.4 Remove or rewrite `GeneratedDraftLayer` Webview UI, unsaved/pinned runtime warnings, messages, DTOs, and tests so the UI reports generated-output persistence, optional Asset membership, projection failure, and unavailable states without runtime-only ownership.
- [x] 4.5 Run static architecture/unused checks and delete obsolete Board routing, draft Group, binding, classifier, and compatibility exports rather than retaining aliases or fallback adapters.

## 5. Explicit Cut Project Targeting

- [x] 5.1 Enforce explicit `file`/`new` target validation in every `CutProjectAuthoringService` load/create/update/import operation and return resulting document identity/revision from successful mutations.
- [x] 5.2 Migrate Cut authoring commands and timeline command adapters from `{ kind: 'active' }` to an explicit document URI captured from the invoking editor instance before async execution.
- [x] 5.3 Migrate Agent capability, generated clip import, Canvas draft/storyboard handoff, plugin transfer, TUI, and public package API callers to pass an explicit `.nkv` target or explicit create-new target.
- [x] 5.4 Require applicable Cut project revision/digest for stale-read or asynchronous mutations and add conflict tests proving focus changes cannot retarget a completion.
- [x] 5.5 Ensure ordinary media generation without explicit Cut intent only creates generated output and optional Workspace Board projection; add tests proving it creates or mutates no `.nkv` even when one project is active or uniquely present.
- [x] 5.6 Remove or fail-close durable timeline APIs/commands that still infer the current Cut project; retain instance-bound interactive editor operations only where the adapter materializes document identity before crossing the authoring boundary.
- [x] 5.7 Verify generic Tool approval/owning policy covers explicit Cut mutations and create-new operations; remove any Board/plan state used as authorization or target selection.

## 6. Migration And Documentation

- [x] 6.1 Add one-time cleanup for obsolete conversation Board binding/index metadata that never deletes `.nkc` files; add migration tests proving existing ordinary Boards remain openable and explicitly targetable.
- [x] 6.2 Add explicit retain/project handling for resolvable old runtime generated-output records and actionable diagnostics for unavailable records; do not claim runtime-only layout was migrated.
- [x] 6.3 Update the Agent creative orchestration ADR to state that Agent core owns no creative destination, Board routing, delivery runtime, or Cut target state and only observes generic Tool/Task results and approval.
- [x] 6.4 Update Canvas README/architecture and relevant ADRs to document `workspace.nkc`, ordinary explicit multiple `.nkc`, generated Inbox projection, `.nkc` spatial authority, and no directory-based layout reconstruction.
- [x] 6.5 Update Cut README/video architecture and Canvas-Cut ADR to document multiple explicit `.nkv` projects, no implicit active target, and generated-output/Board-to-Cut handoff only through explicit authoring intent.
- [x] 6.6 Update storage/generated lifecycle documentation to distinguish provider scratch, `neko/generated/` workspace output, optional AssetLibrary curation, and project references; document retention/deletion and source-control policy without mutating user `.gitignore`.

## 7. Verification And Acceptance

- [ ] 7.1 Run focused shared, Platform, Agent Extension, Canvas Extension/Webview, Cut Extension, and TUI tests covering producer/consumer contracts, storage, reload, projection, authoring targets, migration, and poisoned legacy paths; record commands and results.
- [x] 7.2 Add a focused isolated VSCode Extension Development Host functional scenario that generates or fixtures a typed output, verifies the durable file and ordinary Inbox node after Canvas reopen, checks user movement survives replay, and gates runtime/CSP/console errors; run it through the repository Webview functional runner.
- [ ] 7.3 Record the Agent Evaluation disposition for the changed terminal result/TUI projection behavior, then update or create the smallest mapped suite with one positive case proving generated file + stable resource + Workspace Board node and one forbidden-path assertion proving no Asset identity, multi-Board resolver, or runtime draft path participated.
- [ ] 7.4 Run key-free Evaluation validation and the focused real TUI case when provider/model credentials are available; record target/model identity, canonical-path facts, artifact evidence, forbidden fallback, report location, cost availability, blockers, and residual risk.
- [ ] 7.5 Run `pnpm build`, `pnpm test`, and `pnpm check` for the shared cross-package contract change; run `pnpm check:legacy-debt` and `pnpm check:unused` after deleting old infrastructure.
- [ ] 7.6 Run `pnpm test:agent:eval` as harness validation and the selected real Agent evaluation separately; do not report the key-free harness as real Agent behavior acceptance.
- [ ] 7.7 Run `git diff --check`, `openspec validate simplify-agent-creative-output-destinations --strict`, and a final Neko quality review; document all unexecuted runtime validation and remaining data/UX risks before completion.
