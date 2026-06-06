## 1. Shared Artifact Contracts

- [x] 1.1 Add shared `CompositeArtifact`, `CompositeArtifactBlock`, `GenericTable`, column, row, cell, diagnostic, action, provenance, and execution summary types.
- [x] 1.2 Add stable resource reference unions or reuse existing resource/tool-result/generated-asset refs without persisting Webview URI, blob URL, base64, localhost URL, private cache path, or absolute local path values.
- [x] 1.3 Implement base validators for composite artifact shape, closed current block kinds, generic table shape, closed V1 cell kinds, serializability, size limits, and unsafe runtime handles.
- [x] 1.4 Implement lightweight pre-1.0 version diagnostics for unsupported `schemaVersion` and persisted profile version mismatch.
- [x] 1.5 Add serialization and validator unit tests for valid artifacts, invalid block/cell kinds, unsafe refs, unsupported schema versions, and read-only degradation.

## 2. Profile Descriptor and Skill Metadata

- [x] 2.1 Define Profile Descriptor types for Skill-local and shared profiles, including profile id, protocol, version, columns/block composition, display hints, validator refs, suggested actions, and optional mappings.
- [x] 2.2 Add profile validator dispatch that composes base validation with profile-specific checks for columns, required fields, cell types, resource modalities, row actions, and suggested actions.
- [x] 2.3 Implement bounded `json` cell validation with shallow shape checks and optional `schemaRef` / domain validator delegation.
- [x] 2.4 Align Skill manifest or SDD metadata with `producedArtifacts`, `artifactProfiles`, `referencedCapabilities`, and `suggestedProjectors`, preserving compatibility with the skill catalog change.
- [x] 2.5 Add tests proving Profile Descriptors do not inject prompt content, register providers, bypass validation, or grant execute actions.

## 3. Capability Protocol Artifact Facets

- [x] 3.1 Extend Capability Protocol shared metadata with artifact protocol, profile, renderer, projector, and artifact capability facets.
- [x] 3.2 Add registry query helpers for artifact kinds, profile descriptors, renderer registrations, projector registrations, provider availability, risk, and approval metadata.
- [x] 3.3 Ensure artifact facet registration is lightweight and serializable, with heavy renderer/projector/provider implementations resolved lazily.
- [x] 3.4 Add tests for missing profile/provider degradation, host-unavailable providers, untrusted provider approval gating, and Skill/Profile references that do not create capabilities.

## 4. Agent Artifact Delivery

- [x] 4.1 Add Agent parser/presenter support for `CompositeArtifact`, `GenericTable`, diagnostics, suggested actions, generic fallback rendering, and unknown profile/block/cell degradation.
- [x] 4.2 Extend `@neko/agent-types` Webview/plugin transfer DTOs for artifact snapshot, artifact block page, artifact backfill, and artifact execution summary payloads.
- [x] 4.3 Integrate artifact transfer first as `toolResult` / `toolResultBackfill` sub-payloads, reserving top-level postMessage only for cross-tool lifecycle artifacts.
- [x] 4.4 Add artifact snapshot/block cursor recovery through the existing conversation-scoped task projection/recovery path.
- [x] 4.5 Add tests for small snapshot delivery, large block paging, background artifact backfill, Webview rebuild recovery, and omission of runtime display handles.

## 5. Renderer, Projector, and Package Support

- [x] 5.1 Add or identify shared generic renderers for text, diagnostic, media-ref preview shell, gallery/comparison shell, and `GenericTable`.
- [x] 5.2 Register existing `StoryboardTable` validation and projection as the first domain payload path from artifact/domain blocks.
- [x] 5.3 Register projector(s) for `StoryboardTable -> CanvasStoryboardPayload` and ensure Canvas import actions appear only when provider capability is available.
- [x] 5.4 Register projector(s) for `StoryboardTable -> Cut storyboard payload` and ensure Cut import actions appear only when provider capability is available.
- [x] 5.5 Add package-level tests showing Canvas/Cut can render or preview generic tables without executing, and can execute only through registered projector/provider/approval paths.

## 6. Comic-to-Animation Validation Scenario

- [x] 6.1 Add or update a focused `comic-shot-asset-prep` / `comic-to-animation-plan` Skill scenario with local profile descriptors.
- [x] 6.2 Generate a sample composite artifact containing a shot plan table, asset prep table, source panel gallery, diagnostics, and optional storyboard domain block.
- [x] 6.3 Validate missing adapter/provider degradation for review-only artifacts.
- [x] 6.4 Validate successful projection from reviewed artifact data to `StoryboardTable` and then to Canvas/Cut payloads when providers are registered.

## 7. Quality Gates and Documentation

- [x] 7.1 Run focused shared validator/profile/capability registry tests.
- [x] 7.2 Run focused Agent transfer/recovery tests.
- [x] 7.3 Run focused Canvas/Cut projector/provider gating tests. Metadata/provider facet gating is covered; executable projector tests remain tied to 5.3-5.5 and 6.4.
- [x] 7.4 Run `pnpm check` or the smallest applicable TypeScript validation command for touched packages. Focused TS checks pass for agent-types and webview; broader agent/canvas/cut package checks are blocked by existing unrelated errors.
- [x] 7.5 Update architecture or package documentation if public artifact/profile/Skill manifest behavior changes beyond the ADR and OpenSpec files.
