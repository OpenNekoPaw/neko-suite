## 1. Baseline Audit and Canonical Mapping

- [x] 1.1 Inventory builtin creative Skills, `$skill` catalog metadata, ordinary `command` fields, allowed/optional tools, copied toolDefinitions, related tests, and documentation.
- [x] 1.2 Inventory Story/CreativeTable/Canvas storyboard/Cut storyboard DTOs and record the canonical Storyboard owner plus projection adapters to retain or remove.
- [x] 1.3 Inventory Image/Video operations across Agent Media, Sketch, Canvas, Cut, Audio, Engine, and provider adapters, including actual supported/degraded/unsupported behavior.
- [x] 1.4 Inventory Quality runtime inputs, evidence shapes, CLIP/LLM/audio/frame dependencies, cache/path assumptions, and current generated-asset/task storage.
- [x] 1.5 Inventory `.nks/.nkv/.nkp/.nkm/.nka` revision, codec, validation, preview, runtime-probe, export-readiness, and headless authoring entry points.
- [x] 1.6 Add a documented legacy-to-canonical migration table for old Skill names, old Quality inputs, old stage artifacts, aliases, owners, removal conditions, and poison-test expectations.

## 2. Shared Storyboard, Operation, and Quality Contracts

- [x] 2.1 Define the canonical Storyboard scene/shot/source-trace/revision contract in the selected owning/shared package after completing the DTO reuse audit.
- [x] 2.2 Define Storyboard source-profile ids, validation result, projection/handoff metadata, and fail-visible diagnostics for invalid or unsupported sources.
- [x] 2.3 Define capability-neutral Image and Video operation ids, requests/results, support levels, provider requirements, limits, and unsupported/degraded diagnostics.
- [x] 2.4 Define `QualityTarget`, target kinds, revision/content digest, media range, expected intent, lineage, and stable ResourceRef requirements.
- [x] 2.5 Define `QualityEvidence`, issue/location/coverage/confidence, `QualityGatePolicy`, `QualityGateResult`, stale state, repair-plan, and evaluator identity/version contracts.
- [x] 2.6 Define the small ProjectQuality facade contract for validate, snapshot, preview, runtime probe, and export readiness without introducing shared `.nk*` parsers.
- [x] 2.7 Add runtime validators and unit/contract tests for unknown versions, invalid refs, cache/render/runtime handles, unsupported operations, stale evidence, and malformed results.

## 3. Canonical Skill Taxonomy and Catalog

- [x] 3.1 Add canonical builtin `storyboard` Skill metadata/content with source profiles and canonical output semantics.
- [x] 3.2 Add canonical builtin `image` Skill metadata/content with operation profiles and owning-capability-neutral methods.
- [x] 3.3 Add canonical builtin `video` Skill metadata/content with single-clip generation/transformation profiles and Cut boundary guidance.
- [x] 3.4 Refactor `media-to-video` into canonical `media-production` metadata/content covering the end-to-end staged workflow.
- [x] 3.5 Refactor media `quality-assessment` into canonical `media-quality-review` metadata/content and avoid collision with repository code-quality review Skills.
- [x] 3.6 Retain `video-editing` as timeline editing methodology, remove duplicated Cut tool tutorials, and link it to canonical Cut capability metadata.
- [x] 3.7 Move source/stage identities such as comic conversion, animation planning, Cut payload building, generated-shot assembly, and export packaging into profile/stage registries.
- [x] 3.8 Remove ordinary builtin Skill `command` exposure and verify `$skill` and Agent activation remain the only canonical Skill paths.
- [x] 3.9 Remove copied executable tool schemas from Skill definitions and extend protocol-backflow tests for builtin and custom Skill content.
- [x] 3.10 Add catalog/routing tests proving canonical Skills appear once, profiles/stages do not appear as peers, and no package-specific Skill-name branches are required.

## 4. Storyboard Source Normalization

- [x] 4.1 Implement prompt/text source adapters using Story planning APIs and map their results to the canonical Storyboard contract.
- [x] 4.2 Implement script/screenplay source adapter preserving scene boundaries, dialogue context, narrative order, and source trace.
- [x] 4.3 Implement document adapter using Content extraction and explicit routing to text, visual, comic, or mixed Storyboard profiles.
- [x] 4.4 Migrate comic/manga/webtoon OCR, panel segmentation, reading order, speech-bubble mapping, and continuity logic into `from-comic` without applying it to non-comic sources.
- [x] 4.5 Implement image-sequence Storyboard normalization with stable image ResourceRefs and ordered source trace.
- [x] 4.6 Implement revision-aware existing-Storyboard refinement for shot split, merge, reorder, rewrite, and reference changes.
- [x] 4.7 Add Canvas Storyboard projection adapter and tests proving Canvas node/render state is not canonical Storyboard truth.
- [x] 4.8 Update Cut handoff adapter to consume validated canonical Storyboard revisions without dual-writing Storyboard truth.
- [x] 4.9 Add fixture tests for prompt, prose, screenplay, PDF/document, comic/webtoon, image sequence, mixed document, and existing Storyboard sources.
- [x] 4.10 Restore distinct shot-level `imagePrompt` and scene-level `videoPrompt` invariants in the canonical Storyboard Skill, contract, normalization, projection, and review rendering.
- [x] 4.11 Add path-level regressions proving Story planning → canonical Storyboard → Canvas/Webview preserves prompt intent, canonical `imagePrompt` wins over deprecated `generationPrompt`, and ambiguous resource aliases fail visibly.

## 5. Image and Video Capability Convergence

- [x] 5.1 Add an Image operation capability registry that composes Media, Sketch, Canvas, and Engine adapters without cross-feature imports.
- [x] 5.2 Register and verify current Image generate, edit, inpaint, upscale, colorize, style-transfer, layer/composite, and background-related capabilities.
- [x] 5.3 Define and implement explicit outpaint behavior rather than relying on undocumented aspect-ratio or prompt substitution.
- [x] 5.4 Split image `split` into explicit grid/crop, comic-panel, and semantic-segmentation profiles, implementing only audited supported profiles and diagnosing the rest.
- [x] 5.5 Add a Video operation capability registry for prompt, image, keyframe, reference/video-to-video, transform/restyle, extend/enhance, and timeline preparation.
- [x] 5.6 Register current Media Provider video request fields, including stable first/end frame refs, reference video, edit instruction, motion, camera, shot scale, duration, and aspect ratio.
- [x] 5.7 Integrate Canvas ShotNode first/last-frame relationships through the canonical keyframe video operation without persisting Canvas runtime handles.
- [x] 5.8 Add Cut adapters for accepted generated clip insertion and single-clip timeline preparation while keeping timeline-wide edits in Cut/video-editing.
- [x] 5.9 Update provider adapters to declare operation support and fail visibly when end-frame, video transformation, enhancement, extension, or other requested controls are unavailable.
- [x] 5.10 Add capability-matrix tests proving unsupported fields are not silently dropped and provider-specific extensions do not leak into canonical Skill content.

## 6. Quality Core and External Perception Adapters

- [x] 6.1 Refactor Quality runtime entry points from canonical `mediaPath` inputs to `QualityTarget` ResourceRef/revision inputs with authorized materialization adapters.
- [x] 6.2 Split existing evaluation into typed structural, technical, perception, and policy evaluator ports plus a deterministic aggregator.
- [x] 6.3 Adapt current multimodal LLM image/video evaluation to the PerceptionEvaluator port and record provider/model/version/coverage in evidence.
- [x] 6.4 Adapt current CLIP consistency scorer to an optional local perception/screening adapter without making its score a complete Gate verdict.
- [x] 6.5 Adapt frame extraction/video probe and audio loudness/silence analysis to TechnicalEvaluator evidence.
- [x] 6.6 Add authorized external perception materialization that sends only required media/reference content and rejects arbitrary local paths or project archives.
- [x] 6.7 Implement image, video-clip, audio, Storyboard, cross-shot consistency, timeline/final-cut, project-artifact, and deliverable profile selection.
- [x] 6.8 Implement revision/content-digest comparison that marks QualityEvidence and Gate results stale after relevant asset or project edits.
- [x] 6.9 Separate read-only evaluation from approved repair execution, enforce bounded retries, preserve original evidence/assets, and produce new lineage-bearing revisions.
- [x] 6.10 Add rejection/migration-only handling for legacy `mediaPath` requests and poison tests proving default runtime cannot silently fall back.
- [x] 6.11 Add evaluator/aggregator tests for missing perception providers, technical failure with high visual score, partial sampling coverage, policy manual-review, and stale evidence.

## 7. Owning `.nk*` Project Validators

- [x] 7.1 Implement or adapt `.nks` ProjectQuality facade for schema/version, resources, layer/frame integrity, revision, preview, and export readiness.
- [x] 7.2 Implement or adapt `.nkv` ProjectQuality facade for media refs, clip ranges, tracks, timeline revision, subtitles/audio/output settings, preview, and export readiness.
- [x] 7.3 Implement or adapt `.nka` ProjectQuality facade for sources, routing/track mix, duration, loudness/peak readiness, revision, and final-mix preview.
- [x] 7.4 Implement or adapt `.nkp` ProjectQuality facade for source refs, parameters, motions, expressions, physics/tracking mappings, adapter availability, and runtime preview.
- [x] 7.5 Implement or adapt `.nkm` ProjectQuality facade for scene graph, assets, camera/light/timeline, profile/runtime adapter availability, and render preview.
- [x] 7.6 Add save/reopen and headless validation tests proving validators use explicit project targets and current durable revisions without active Webview state.
- [x] 7.7 Add unknown/future schema, missing asset, illegal cache/runtime identity, graph/timeline corruption, and validator-unavailable fail-visible tests for each applicable format.
- [x] 7.8 Add quality orchestration adapters that consume owning facade evidence without importing or duplicating format parsers.

## 8. Media Production, Preflight, Export, and Deliverable Verification

- [x] 8.1 Define workflow run/stage state using existing Agent task and generated-asset lifecycle services with stable stage artifact references and diagnostics.
- [ ] 8.2 Implement source-to-Storyboard, Storyboard validation, shot-generation planning, media generation, and asset Gate stages.
- [ ] 8.3 Implement approved asset handoff to Canvas/Cut/Audio owning headless authoring APIs with explicit targets and returned project revisions.
- [ ] 8.4 Implement workflow cancellation and resume from validated stage artifacts without replaying completed mutations or depending on runtime handles.
- [ ] 8.5 Implement pre-export policy evaluation over the current `.nk*` revision, required assets, final-cut/audio/subtitle/framing evidence, and approval state.
- [ ] 8.6 Block export when preflight is missing, failed, stale, or bound to another revision, with explicit manual-override policy handling where allowed.
- [ ] 8.7 Record exported deliverable lineage to the exact project revision and preflight result used.
- [ ] 8.8 Implement post-export technical verification for probe/decode, container/codec, duration, dimensions/fps, tracks, truncation, configured black/frozen checks, and audio loudness/peak.
- [ ] 8.9 Implement policy-controlled post-export perception review with explicit sampling/coverage metadata.
- [ ] 8.10 Implement the repair loop that targets the owning package, creates a new revision, invalidates evidence, reruns preflight, re-exports, and re-verifies.
- [ ] 8.11 Add end-to-end path tests for prompt-to-video, script-to-video, comic-to-animation, image/keyframe-to-video, project repair, and failed deliverable re-export.

## 9. Generated Asset Lifecycle and Migration Cleanup

- [x] 9.1 Extend generated draft/promoted asset records or associated evidence storage to bind QualityEvidence to stable asset identity, revision/digest, and generation lineage.
- [x] 9.2 Ensure background task backfill exposes stable generated asset and workflow stage refs required for later quality review.
- [x] 9.3 Implement evidence transfer/lineage behavior for draft promotion without treating cache file existence as durable ownership.
- [x] 9.4 Implement bounded, observable migration aliases for approved legacy Skill names and record replacement diagnostics/telemetry.
- [x] 9.5 Update Agent prompts, capability catalogs, evaluation manifests, fixtures, locale metadata, and docs to use canonical Skill and operation identities.
- [x] 9.6 Remove expired stage-Skill exports, old command metadata, duplicate toolDefinitions, legacy Quality fixtures, dual-read/dual-write adapters, and default fallback branches.
- [x] 9.7 Add legacy debt and unused-code assertions proving removed names and path-only Quality entry points cannot return default success.

## 10. Validation, Documentation, and Release Readiness

- [ ] 10.1 Run focused unit and contract tests for every changed package, then run `pnpm check`, `pnpm test`, and relevant builds.
- [ ] 10.2 Run `pnpm check:legacy-debt` and `pnpm check:unused` or the repository aggregate quality commands after migration cleanup.
- [ ] 10.3 Run `pnpm test:agent:eval` as harness self-validation and execute focused real Agent evaluations for Skill selection, provider negotiation, workflow recovery, quality review, and repair behavior.
- [ ] 10.4 Run `cargo test` and representative media fixtures for any Engine/FFmpeg/ONNX probe, extraction, decode, loudness, black-frame, or frozen-frame changes.
- [ ] 10.5 Run Extension Development Host Webview smoke through `vscode-extension-debugger` for any changed Storyboard, quality evidence, stale-state, approval, or workflow UI.
- [ ] 10.6 Run `neko-quality-review`, classify residual risks, and add path-level evidence that canonical handlers/adapters were invoked while legacy paths were poisoned.
- [ ] 10.7 Update `README_CN.md`/`README.md`, `ARCHITECTURE_CN.md`/`ARCHITECTURE.md`, relevant domain architecture documents, Skill authoring guidance, and quality/export workflow documentation.
- [ ] 10.8 Record unresolved Provider support, optional perception dependencies, unsupported project profiles, migration expiry, data-format decisions, and remaining risks before implementation is declared release-ready.
