## 1. Contracts and canonical lifecycle

- [x] 1.1 Reconcile this change with `separate-generated-output-from-asset-library`, then add failing path-level tests proving an unpromoted generated-output/resource identity is not AssetLibrary identity and cannot enter `.nkc` as a durable media source.
- [x] 1.2 Define the minimal host-neutral runtime generated-Group projection, candidate lifecycle state, versioned single/batch Save to Assets request, per-candidate result, frozen Board target, and Canvas apply result contracts with strict validators and unknown-version diagnostics.
- [x] 1.3 Extend the existing Canvas node/subsystem descriptor contract only as needed to declare foundational low-chrome versus structured presentation, and add registry tests proving Basic presentation does not become persisted `.nkc` data.
- [x] 1.4 Add shared/project-codec guards and tests that reject runtime projection IDs, render URIs, cache paths, and unpromoted generated refs from durable Canvas save while continuing to accept stable Asset refs and valid legacy generated-source refs.

## 2. Asset-owned promotion and legacy generated sources

- [x] 2.1 Audit the existing AssetLibrary/import/promotion facades and implement one canonical adapter that promotes a generated candidate into AssetEntity/variant/file ownership with source validation, provenance, digest/revision checks, and stable returned identity.
- [x] 2.2 Implement idempotent batch promotion with per-candidate success/failure results, retry of unresolved candidates, and explicit handling for content changes or duplicate requests; add producer/consumer contract tests.
- [x] 2.3 Disconnect or poison new Canvas/Board retention writes to `neko/generated/<kind>/` and add tests proving new success paths use Asset ownership without direct Canvas file IO or generated-root fallback.
- [x] 2.4 Preserve explicit read/import support for existing `neko/generated/<kind>/` sources, including available, missing, already-imported, and import-failure cases; prove import never silently deletes, moves, or rewrites the legacy source/Canvas reference.
- [x] 2.5 Verify Canvas node/Group deletion only removes Canvas references and cannot delete AssetLibrary entities/files; cover Asset-owned reference/confirmation behavior separately.

## 3. Runtime generated review Groups and Board delivery

- [x] 3.1 Implement an Extension-owned runtime generated-draft projection service keyed by task/run/candidate identity and frozen Board target/revision, with explicit ownership, disposal, pin/unpin, and unavailable diagnostics.
- [x] 3.2 Change generated media completion in Board delivery to create/update one runtime review Group instead of calling durable Canvas `importAsset`; keep Markdown and already-durable file/reference delivery on their canonical automatic paths and poison the old media success path.
- [x] 3.3 Project runtime Group/candidate state to the Canvas Webview through validated messages without exposing Host paths, Asset storage details, or mutable project facts to the Webview.
- [x] 3.4 Implement single-selection and whole/selected-Group Save to Assets orchestration, then author successfully promoted candidates as one ordinary manual Group plus Asset-backed children through a revision-checked headless Canvas composite mutation.
- [x] 3.5 Preserve per-candidate saved/promoting/failed state across partial promotion; when Asset save succeeds but Board apply conflicts, retain Asset identity and require explicit retry against a valid intended target without active-Canvas fallback.
- [x] 3.6 Implement explicit unsaved close/discard behavior and best-effort reconstruction from the owning task/generated-output lifecycle; return fail-visible unavailable state when runtime bytes or metadata no longer exist.

## 4. Spatial Group domain behavior

- [x] 4.1 Replace the all-`parentId` child suppression rule with a pure policy-aware render-plan projector that renders descendants of expanded manual Groups and keeps managed Scene/Gallery/Table children on their owning presentation paths.
- [x] 4.2 Implement deterministic manual-Group membership resolution on drop, including deepest-container selection, stacking/stable-ID tie break, drag-out release, nested Groups, accepted-child policy, and cycle/self-parent rejection tests.
- [x] 4.3 Extend Canvas store/history operations for explicit sort/auto-arrange, expand-only bounds, Fit to content, collapse/expand, and resize clamping while preserving absolute child coordinates and one undo entry per user action.
- [x] 4.4 Add regression tests proving Group movement translates every descendant by one delta, child movement leaves siblings unchanged, manual placement survives ordinary updates, and collapse/expand restores exact geometry.
- [x] 4.5 Update culling, marquee selection, z-order/hit testing, clipboard/group duplication, minimap, and connection projection so real spatial descendants remain correct during nested selection, transform, collapse, and viewport movement.

## 5. Canvas Webview presentation and interaction

- [x] 5.1 Replace the current Group child-summary success renderer with a semi-transparent spatial frame, floating editable name/count label, explicit selected boundary/handles, collapsed presentation, and empty-state behavior using existing theme/icon/i18n foundations.
- [x] 5.2 Implement low-chrome foundational node shells derived from descriptors: name plus content by default, no persistent outer card/footer chrome, and explicit hover, selection, keyboard-focus, editing, loading, missing, locked, playback, and error states.
- [x] 5.3 Implement one screen-space selection contextual toolbar and multi-selection toolbar that reuse canonical action policies/dispatchers, enforce viewport collision handling and stable zoom size, and expose overflow actions without duplicating `ContextMenu` handlers.
- [x] 5.4 Add Group interactions for child-first selection, Group selection from label/border/empty background, subtree drag from eligible Group chrome, drag-in/out preview, explicit Sort/Auto-arrange, Fit to content, collapse, and Save to Assets.
- [x] 5.5 Add runtime generated-Group UI for unsaved/promoting/saved-to-assets/added-to-board/unavailable/failed states, per-item partial failure and retry, single/group save, and discard confirmation.
- [x] 5.6 Complete component reuse and accessibility review: shared UI primitives, Codicons, localized accessible names, keyboard parity, focus order, non-color state cues, reduced motion, theme contrast, and 150-300 ms non-layout-shifting feedback.

## 6. Integration, evaluation, and documentation

- [x] 6.1 Add focused shared, Canvas domain/store, Canvas Webview, Extension message/service, Agent delivery, Asset promotion, project-codec, and legacy migration tests with assertions that canonical handlers/adapters run and old generated-root/active-Canvas paths do not participate.
- [x] 6.2 Update and run the owning focused Agent Evaluation for real generated task completion, stable unpromoted generated-output identity, terminal delivery, and forbidden pre-promotion Asset lookup/import; record that VS Code-owned runtime Group, explicit promotion, frozen Board apply, and replay/idempotency are excluded from TUI Evaluation and are accepted through 6.3 Extension Development Host scenarios.
- [x] 6.3 Add isolated Extension Development Host functional scenarios for foundational low-chrome states, contextual toolbar, spatial child movement, Group subtree movement, sorting/fit/collapse, single/batch Save to Assets, partial failure, stale target, keyboard/focus, light/dark themes, CSP, and runtime error gates.
- [x] 6.4 Run affected package tests/typechecks/builds, `pnpm build`, `pnpm test`, `pnpm check`, relevant legacy/unused gates, focused Agent Evaluation, and the Canvas Webview functional scenarios; record exact commands, results, and residual risk.
- [x] 6.5 Update `docs/domains/interactive/architecture.md`, `docs/architecture/asset-library.md`, `docs/architecture/cache-file-access-and-paths.md`, headless authoring/Agent integration docs, and affected package documentation so new generation retention names AssetLibrary/AssetStore rather than `neko/generated`, while documenting protected legacy read/import behavior.
- [x] 6.6 Perform `neko-quality-review` for the completed high-risk cross-package/Webview change, resolve P0/P1 findings, and capture remaining risks before OpenSpec archive.
