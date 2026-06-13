## 1. Baseline Scanner And Ledger

- [x] 1.1 Add a repo-wide cleanup scanner that reports all-source and non-test-source `legacy` / `fallback` / `deprecated` counts with explicit glob exclusions.
- [x] 1.2 Extend the scanner to report package and file hotspots, term counts, and representative examples.
- [x] 1.3 Add semantic class output for `delete-now`, `migrate-now`, `current-bridge`, `runtime-resilience`, `boundary-canonicalizer`, `presentation-default`, `domain-status`, `generated-source`, `test-only`, and `false-positive-word`.
- [x] 1.4 Create a non-Agent cleanup ledger seeded from current hotspots with package, surface, semantic class, action, owner, replacement, remove condition, and validation commands.
- [x] 1.5 Add a validation command that fails when an active preserved non-Agent legacy/deprecated compatibility surface lacks ledger metadata.
- [x] 1.6 Update `adr-code-debt-cleanup-strategy.md` to clarify that `cleanup-prelaunch-legacy-surfaces` was stage one, not a repository-wide cleanup completion.

## 2. Static Analysis And Dead Code

- [x] 2.1 Re-run `pnpm check:unused` and classify each of the 18 unused files as delete-now, false-positive entrypoint, or deferred with owner.
- [x] 2.2 Delete confirmed unused Dashboard Webview files or model real entrypoints if the Skill Catalog route still owns them.
- [x] 2.3 Delete or model confirmed unused Canvas Webview files: `InlineControls.tsx`, `components/content/index.ts`, and `ImageViewer.tsx`.
- [x] 2.4 Delete or model confirmed unused Puppet files: `export/index.ts`, `PuppetMotionInstallTarget.ts`, and `utils/inp-parser.ts`.
- [x] 2.5 Delete or model confirmed unused Sketch files: `gradient-shaders.ts` and `psd-import.ts`.
- [x] 2.6 Delete or model confirmed unused Story files: `tailwind.config.js` and `sceneBreakdown.ts`.
- [x] 2.7 Resolve scripts reported by knip: `check-3d-route-a-boundaries.mjs` and `scene-render-diagnostics.mjs`.
- [x] 2.8 Resolve dependency drift: `@neko/neko-client` in `neko-market`, `@neko/neko-client` / `@neko/shared` in `neko-tools`, `@vitejs/plugin-react` in `neko-ui`, and unlisted `jsdom` test dependencies.
- [x] 2.9 Re-run `pnpm check:unused` and record the reduced baseline in ADR.

## 3. Low-Risk Deprecated Alias Cleanup

- [x] 3.1 Inventory deprecated shared re-export modules and aliases such as `neko-types/src/utils/animation.ts`, `types/ui-state.ts`, `types/mask.ts`, `types/colorCorrection.ts`, and legacy UI type aliases.
- [x] 3.2 Migrate internal callers to canonical package-local sources.
- [x] 3.3 Delete deprecated alias files or narrow them to documented current exports only.
- [x] 3.4 Run stale import scans for deleted aliases and touched package tests.

## 4. Shared Schema And Type Old-Format Cleanup

- [x] 4.1 Inventory `neko-types` old-format readers: storyboard legacy sections/media refs, asset manifest legacy type migration, storage deprecated aliases, canvas legacy mirrors, and workspace media legacy path variants.
- [x] 4.2 Convert canonical fixtures/tests for storyboard tables to current `scenes[]` / `shots[]` / canonical media refs and delete stale old-format fixtures.
- [x] 4.3 Remove `normalizeLegacyStoryboardSections()` and related legacy media-ref normalization after current fixtures pass.
- [x] 4.4 Convert asset manifest tests and fixtures to canonical asset/package types and delete legacy asset type migration helpers when no current caller remains.
- [x] 4.5 Remove storage deprecated compat aliases or isolate any one-time local migration into a boundary migrator with ledger metadata.
- [x] 4.6 Remove or defer generated/proto legacy fields only through source schema/IDL changes and generated output validation.
- [x] 4.7 Run `pnpm --dir packages/neko-types test` and targeted stale-surface scans.

## 5. Canvas Legacy Data Path Cleanup

- [x] 5.1 Inventory Canvas legacy anchors, legacy cells path, group `childIds`, `LegacyNodeRenderer`, and fallback node renderer compatibility.
- [x] 5.2 Migrate connection fixtures and render code to canonical port-based connection geometry.
- [x] 5.3 Migrate container/cell fixtures and code to `container.childPlacements` and composable content metadata.
- [x] 5.4 Remove legacy anchor/cell/group compatibility readers after canonical tests pass.
- [x] 5.5 Rename presentational Canvas fallback helpers to `default`, `placeholder`, or `emptyState` where no runtime failure is handled.
- [x] 5.6 Run Canvas targeted tests/builds and stale-surface scans.

## 6. Asset And Market Manifest Cleanup

- [x] 6.1 Inventory legacy package type and asset type migration in `neko-assets`, `neko-market`, and shared manifest contracts.
- [x] 6.2 Convert installed package and manifest fixtures to canonical package/asset type fields.
- [x] 6.3 Remove legacy manifest migration code when canonical readers and tests pass.
- [x] 6.4 Review `legacyFallbackRef` in character asset export; migrate to canonical binding/resource metadata or register as a current bridge with removal trigger.
- [x] 6.5 Run Asset and Market targeted tests and stale-surface scans.

## 7. Agent Remaining Legacy Runtime Cleanup

- [x] 7.1 Inventory remaining Agent `legacy` surfaces after stage-one cleanup: legacy workflow adapter, artifact restore legacy fallback, document tool legacy read mode, IDC runtime state legacy content, and capability registry legacy names.
- [x] 7.2 Remove or sunset Agent legacy workflow adapter paths when canonical workflow runtime covers all current callers.
- [x] 7.3 Migrate artifact restore fixtures to canonical artifact index entries and delete legacy fallback restore readers.
- [x] 7.4 Replace document tool `content` legacy read mode wording and behavior with explicit canonical read modes or a ledger-backed current compatibility bridge.
- [x] 7.5 Remove capability registry legacy name support if no current provider still emits old tool names.
- [x] 7.6 Run Agent targeted tests and `pnpm check:agent-boundaries`.

## 8. Runtime Resilience And Presentation Default Hardening

- [x] 8.1 Inventory non-schema `fallback` hits and classify them as runtime-resilience, current-bridge, boundary-canonicalizer, presentation-default, or cleanup candidate.
- [x] 8.2 Add or identify tests for retained runtime resilience in provider/model/GPU/media/network/file failure paths.
- [x] 8.3 Rename presentation-only fallback helpers and props to clearer names such as `defaultLabel`, `placeholderText`, `emptyState`, or `unavailableLabel`.
- [x] 8.4 Update cleanup scanner and ADR so renamed presentation defaults no longer inflate fallback debt counts.

## 9. Verification And Documentation

- [x] 9.1 Run stale-surface scans for all deleted compatibility surfaces.
- [x] 9.2 Run touched package tests/builds after each package batch.
- [x] 9.3 Run `pnpm check:unused` after static-analysis and deletion batches.
- [x] 9.4 Run broader `pnpm check`, `pnpm test`, and `pnpm build` once `check:unused` no longer blocks or document exact remaining unrelated baseline.
- [x] 9.5 Update `adr-code-debt-cleanup-strategy.md` with final scan counts, deleted surfaces, preserved exceptions, and remaining risks.
- [x] 9.6 Ensure the cleanup ledger and guard commands are documented in package or architecture docs before archiving.

## 10. Raw Term Burndown

- [x] 10.1 Re-open the post-cleanup raw-search baseline for `legacy`, `fallback`, and `deprecated`; record occurrence/file counts and top hotspots.
- [x] 10.2 Audit AI SDK bridge callers instead of renaming `legacy`; keep the active fal.ai / DashScope / Kling legacy bridge with resolver tests and provider sunset metadata.
- [x] 10.3 Delete Canvas `.legacy` built-in presets and `creationMode: 'legacy'` selection after confirming current callers use canonical `.basic` / container presets.
- [x] 10.4 Delete the legacy document cache provider, `legacy-cache-path` content refs, and `legacyCachePath` metadata reads after migrating current document resources to the canonical provider path.
- [x] 10.5 Re-run raw term scans, stale-surface scans, targeted tests, and update `adr-code-debt-cleanup-strategy.md` / cleanup ledger with deleted surfaces and intentionally preserved current bridges.
