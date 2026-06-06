## Why

`StoryboardTable` is a good semantic storyboard protocol, but it is becoming the wrong center for non-storyboard tables such as skill catalogs, asset prep sheets, character/dialogue maps, generation comparisons, QC reports, and cross-package media planning artifacts. If every structured result is forced through storyboard semantics, the protocol becomes an untestable "universal JSON"; if every package invents its own table shape, Agent, Canvas, Cut, and Dashboard drift back to Markdown parsing and hardcoded kind branches.

This change moves the system from `Storyboard-first` to `Artifact-first`: Agent produces structured composite artifacts, packages render and review generic blocks/tables, projectors convert reviewed artifacts into domain payloads, and registered capability providers perform side-effecting execution after validation and approval.

## What Changes

- Add shared `CompositeArtifact` and `GenericTable` contracts for multimodal structured artifacts and dynamic review tables.
- Add Profile Descriptor support for Skill-local and shared table/artifact profiles, including pre-1.0 lightweight version handling and validator dispatch.
- Add bounded validators for artifact shape, closed current block/cell vocabularies, stable resource references, `json` cell safety, profile conformance, and unknown-profile/block/cell degradation.
- Extend Agent rich-content delivery to carry artifact snapshots, block pages, backfills, and execution summaries through the existing Webview transfer path.
- Add artifact protocol/profile/renderer/projector/capability facets to the existing Capability Protocol registry, not a parallel registry.
- Register first projectors for existing storyboard flows, keeping `StoryboardTable` as the strong semantic domain payload for Canvas/Cut.
- Define execution boundaries so view/review/transform/execute actions remain separate and side effects always go through validator, projector/adapter, capability provider, approval gate, and execution summary.
- Clarify multimodal boundaries: persisted artifacts store stable refs only; `PerceptionCard` remains a media-observation intermediate and is not merged into artifact schema.

## Capabilities

### New Capabilities

- `composite-artifact-contracts`: Defines `CompositeArtifact`, `GenericTable`, block/cell vocabularies, stable multimodal refs, diagnostics, suggested actions, execution summaries, and pre-1.0 schema/profile version rules.
- `artifact-profile-validation`: Defines Profile Descriptor sources, Skill-local and shared profile behavior, profile validator dispatch, `json` cell bounded validation, and Skill/Profile/Capability boundaries.
- `artifact-delivery-runtime`: Defines Agent artifact generation, Webview/plugin transfer, renderer dispatch, block paging, backfill, Webview recovery, and the relationship to `PerceptionCard`.
- `artifact-projection-execution`: Defines artifact action layers, projector/adapter behavior, Canvas/Cut directed support, approval requirements, `EditOperation` boundaries, and execution summary write-back.

### Modified Capabilities

- `agent-capability-injection`: Add artifact protocol/profile/renderer/projector/capability facets to the existing Capability Protocol registration and injection model.

## Impact

- Shared contracts: new types and validators under `@neko/shared` / `packages/neko-types`, plus tests for serialization, degradation, version handling, stable refs, and profile validation.
- Agent runtime/types: composite artifact parser/presenter, artifact transfer payloads, bounded diagnostics for unknown profiles/blocks/cells, artifact backfill and recovery integration.
- Capability protocol: contribution metadata gains artifact facets while preserving registration/injection separation and trust/approval policy.
- Skills: manifest/metadata may declare `producedArtifacts`, `artifactProfiles`, `referencedCapabilities`, and `suggestedProjectors`; Profile Descriptors may live beside `SKILL.md` or in shared registries.
- Canvas/Cut/Story/Dashboard: generic artifact/table rendering can be adopted incrementally; directed execution requires registered projectors/capabilities.
- Existing storyboard path: `StoryboardTable` remains compatible and becomes the first domain payload projected from reviewed artifacts.
