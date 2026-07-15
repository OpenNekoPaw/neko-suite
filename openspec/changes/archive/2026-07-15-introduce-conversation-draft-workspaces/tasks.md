## 1. Ownership And Reuse Audit

- [x] 1.1 Audit Canvas Board index/navigation, `.nkc` codec/source/revision policy, `CanvasProjectAuthoringService`, Basic/Professional right-dock composition, foundational node/subsystem manifests, Markdown capabilities, and existing `neko/boards/` callers; record the canonical public entries to reuse.
- [x] 1.2 Audit Agent explicit/active Canvas target selection, conversation/task bindings, artifact/generated-result delivery, async continuation/backfill, Storyboard Skill routing, Send-to-Canvas behavior, and runtime observability across VSCode/Home/TUI.
- [x] 1.3 Audit `@neko/ui`/Canvas components for file/reference, Markdown document, script presentation, image, audio, video, group/frame, lazy media preview, virtualization, keyboard/focus, i18n, error boundaries, and tests; record reuse decisions.
- [x] 1.4 Audit generated-output retention, `WORKSPACE_GENERATED_ASSET_ROOT`, Asset Library registration, cleanup/recovery, and all legacy cache/runtime path records; prove no new media store is needed.
- [x] 1.5 Audit the Agent Evaluation coverage index and existing Storyboard/media/artifact/session/Canvas suites; record `reuse | update | create | excluded`, required facts, forbidden fallbacks, validators, provider prerequisites, and Skill identity/fingerprint requirements.
- [x] 1.6 Add poison/path tests proving unspecified Agent requests cannot succeed through global active/recent Canvas, professional-directory Canvas, raw `.nkc` mutation, generic Send-to-Canvas retention, legacy storyboard compiler, specialized Storyboard node fallback, cache path, or false Asset membership.

## 2. Minimal Shared Contracts

- [x] 2.1 Define or extend minimal Layer 0 Board Canvas query/filter/summary, resolver input/result, conversation/task binding, immutable Canvas write target, delivery provenance, and diagnostic contracts; reuse existing Canvas/ResourceRef identities and avoid Draft/Board DTO hierarchies.
- [x] 2.2 Define strict validation for explicit/conversation/index/create resolution sources, cross-conversation reuse, Canvas/document/revision mismatch, stale/deleted targets, unsafe paths, and unknown result kinds.
- [x] 2.3 Add contract tests proving no persisted Basic profile, new file format, new node union, raw `.nkc` payload, absolute path, render URI, cache path, token, or process handle enters the shared routing/delivery DTOs.
- [x] 2.4 Add dependency checks proving Agent consumes public Canvas contracts without importing Canvas Webview/Extension internals and Canvas does not depend on Agent runtime internals.

## 3. Canvas Board Index And Resolver

- [x] 3.1 Extend the Canvas-owned index/query to return sanitized `.nkc` summaries scoped to `neko/boards/`, including stable document/Canvas identity, title, revision, safe project/work/scope, node summary, and updated time without raw content or unsafe paths.
- [x] 3.2 Implement deterministic resolver order: explicit target, valid conversation/task binding, one exact compatible indexed Board Canvas, otherwise create a new `neko/boards/<safe-name>.nkc` through `CanvasProjectAuthoringService`.
- [x] 3.3 Implement ambiguous/no-match behavior: semantic or filename similarity may produce a user-facing suggestion but cannot silently select a write target; no match or unconfirmed ambiguity creates a new Board Canvas.
- [x] 3.4 Reject active/recent/professional-directory/cross-conversation fallback and add focused resolver tests for exact match, ambiguity, no match, explicit override, stale binding, deleted file, unsafe summary, and concurrent conversations.
- [x] 3.5 Bind resolved Canvas/document/revision identity to the conversation and freeze it into each turn/task/run before asynchronous work starts; add switch-tab/switch-Canvas/restart/stale-revision tests.
- [x] 3.6 Ensure conversation archive/delete removes only bindings/runtime projections and never deletes the `.nkc` or retained generated sources.

## 4. Canvas Basic Right-Dock Catalog

- [x] 4.1 Update existing Canvas right-dock composition so Board context defaults to Basic mode and Basic uses only owning foundational descriptors for file/reference, text/Markdown document, script presentation, image, audio, video, and neutral group/frame/layout elements.
- [x] 4.2 Remove specialized Storyboard/creative table, Scene/Shot/Gallery production, timeline/track/clip/playback workflow, professional subsystem, Agent, Tool, Skill, Model, Provider, and executable workflow creation entries from Basic catalog composition.
- [x] 4.3 Preserve unchanged `.nkc` semantics: Basic mode must render existing valid professional nodes, allow explicit Professional mode selection, and add no persisted profile, validator restriction, migration, or node-type fork.
- [x] 4.4 Add catalog/component tests proving foundational descriptors are reused rather than copied, specialized entries are absent in Basic, existing professional nodes still render, Professional mode still composes its current entries, and no schema mutation occurs.
- [x] 4.5 Add accessibility, keyboard/focus, i18n, theme/foundation, large/off-screen Canvas, lazy media preview, missing source, and runtime error tests for the adjusted Basic surface.

## 5. Typed Agent Auto-Delivery

- [x] 5.1 Define deterministic delivery classification for creator-useful Markdown, selected files/references, image/audio/video outputs, reviewable variants, and creator-output task projections; explicitly exclude ordinary prose, reasoning, logs, scratch, unselected search hits, duplicates, runtime handles, and non-reviewable failures.
- [x] 5.2 Author eligible Markdown as normal document content in the frozen Board Canvas through existing Canvas Markdown capabilities; preserve source trace, provenance, selected references, revision, and idempotent artifact identity.
- [x] 5.3 Author selected file/reference and retained image/audio/video outputs through existing Canvas headless authoring using stable ResourceRef/generated-output identities and a task placement region without moving user-arranged nodes.
- [x] 5.4 Integrate async continuation/backfill so task placeholders and terminal outputs update only the frozen Canvas target even after UI navigation; replay must not create duplicate indistinguishable nodes.
- [x] 5.5 Protect user edits with revision-checked authoring; stale Markdown/node updates fail visibly or create a reviewable alternative instead of last-write-wins.
- [x] 5.6 Implement missing/deleted/unauthorized/revision-conflicting target recovery: retain the result in its owning lifecycle, emit an actionable diagnostic, and never retarget another Canvas.
- [x] 5.7 Add producer/consumer/path tests across Agent, Canvas capability/authoring owner, generated-output owner, conversation binding, and Webview projection for positive, exclusion, replay, restart, race, conflict, and poison cases.

## 6. Generated Output And Asset Boundaries

- [x] 6.1 Reuse `WORKSPACE_GENERATED_ASSET_ROOT = 'neko/generated'` and reject root-level `generated/`, `.neko/generated/`, Board-local media stores, cache paths, render URIs, and temporary files as durable Canvas sources.
- [x] 6.2 Implement/verify lifecycle `provider scratch -> runtime candidate -> Board-Canvas-retained generated output -> optional professional use and/or Asset Library registration` with stable identity and provenance.
- [x] 6.3 Ensure Canvas/Cut/Audio may use stable generated sources without Asset Library membership, and Asset registration does not imply current project usage or unconditional file movement.
- [ ] 6.4 Implement reference-aware/user-confirmed cleanup, storage-use projection, and recovery/retention diagnostics for runtime/cache-only legacy records without silently deleting valuable outputs.
- [x] 6.5 Add load/restart/render/usage/Asset-registration/cleanup tests that poison false Asset refs, forced copies, stale render projections, cache paths, and silent deletion.

## 7. Storyboard Markdown And Skill Routing

- [x] 7.1 Update canonical Storyboard Skill methodology so unspecified planning/analysis produces flexible Markdown with source trace, uncertainties, references, narrative/visual/action/camera/dialogue/sound/duration content; keep Board/tool/message/task/path protocol out of Skill content.
- [x] 7.2 Update runtime capability prompt/catalog routing so unspecified Storyboard output is a normal Markdown document delivered to the resolved Board Canvas, while structured Storyboard/table creation requires explicit professional intent.
- [x] 7.3 Ensure Canvas Basic catalog contains no specialized Storyboard table or Scene/Shot creation entry and unspecified Storyboard delivery cannot route through structured fallback.
- [x] 7.4 Update Storyboard/creative-table validation so flexible Markdown may retain variable columns and unresolved production choices; explicit structured authoring continues to use the canonical Storyboard validator and semantic prompts.
- [x] 7.5 Add anti-protocol-backflow tests for builtin/custom Skill content and deterministic routing tests for unspecified Markdown intent, explicit structured intent, adjacent negatives, missing capability, and forbidden legacy paths.
- [ ] 7.6 Update/create focused real Agent Evaluation cases for prompt/text/script/document/comic/image-sequence inputs, Board resolver reuse/create, Markdown delivery, explicit structured authoring, adjacent negatives, durable identity, validator evidence, and fallback poison.

## 8. Send-To-Canvas Cleanup And Host Acceptance

- [x] 8.1 Remove or reword generic Send-to-Canvas retention affordances for current typed Agent results; retain only explicit historical/external Add to Board Canvas behavior that still has a real user path.
- [x] 8.2 Remove, isolate, or fail-close unspecified success through retired draft/storyboard compiler, generic structured Canvas/plugin-transfer fallback, direct raw Canvas node mutation, global active target, and legacy prompt authority; update legacy-debt checks and fixtures.
- [ ] 8.3 Add isolated synthetic fixture scenarios to `pnpm test:webview:functional` for resolver exact reuse/new creation/ambiguity, automatic Markdown/file/image/audio/video delivery, Canvas switching during async work, restart recovery, revision conflict, stale-target diagnostic, Basic catalog contents, and explicit Professional mode.
- [ ] 8.4 Use Extension Development Host plus runtime-error gates for authoritative Canvas/Agent interaction, focus, CSP, message, file creation, media preview, and persistence evidence; do not substitute ordinary browser/Vite acceptance.

## 9. Evaluation, Quality Gates, And Documentation

- [x] 9.1 Run key-free Evaluation platform validation and selected-case dry validation for every indexed suite affected by Storyboard Skill, capability routing, artifact/task delivery, session binding, generated output, and Webview facts.
- [ ] 9.2 Run focused real TUI Agent cases with declared target/model/config identities and repeated samples where quality/stability is claimed; record hard-gate evidence, resolver source, Canvas identity, forbidden fallback absence, durable artifacts, usage/cost, and report locations.
- [x] 9.3 Run affected package tests/typechecks/builds, focused Webview functional scenarios, `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, and `pnpm ci:local` or record exact blockers/residual risk.
- [ ] 9.4 Run `openspec validate introduce-conversation-draft-workspaces --strict`, `git diff --check`, architecture/dependency checks, and privacy review proving fixtures/reports contain no secrets, real workspaces, absolute user paths, or runtime tokens.
- [x] 9.5 Update Chinese-first creator/architecture/domain/package documentation, and corresponding English semantics where affected, covering Board=Canvas, `neko/boards/` resolver behavior, Basic catalog, auto-delivery, generated-output/Assets boundaries, Storyboard Markdown default, and Send-to-Canvas cleanup.
- [x] 9.6 Record final verification commands/results, Evaluation cases/reports, Extension host/version, reuse audit, migration outcome, unexecuted gates, and remaining risks before completion.
