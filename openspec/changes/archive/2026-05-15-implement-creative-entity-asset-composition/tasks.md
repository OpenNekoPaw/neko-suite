## 1. Shared Contracts

- [x] 1.1 Add `CreativeEntity`, `CreativeEntityKind`, and registry facade contract types in the shared contract layer.
- [x] 1.2 Add `EntityAssetBinding`, binding file shape, binding status/source enums, and validation helpers.
- [x] 1.3 Add `RepresentationKind`, `RepresentationResolveRequest`, `RepresentationResolveResult`, and target default fallback chain constants.
- [x] 1.4 Add `AssetRefScheme`, `ParsedAssetRef`, `AssetRefValidation`, `ResolvedAssetRef`, and `AssetRefResolver` contracts.
- [x] 1.5 Add `VisualIdentityDraft`, `VisualFactKey`, well-known visual fact constants, and `VisualFactSuggestion` contracts.
- [x] 1.6 Add `EntityAssetRequirement` contracts and requirement status/kind helpers.
- [x] 1.7 Add representation file role metadata for Live2D, Live3D, voice, motion, expression, physics, calibration, and tracking-profile roles.

## 2. Entity Facade And Binding Storage

- [x] 2.1 Implement `CharacterRecordAdapter` that exposes existing `characters.json` records as `CreativeEntity(kind='character')`.
- [x] 2.2 Implement `CreativeEntityRegistry` facade with list/get/resolve-by-name behavior backed by the character adapter.
- [x] 2.3 Implement `EntityAssetBindingService` read/write support for `.neko/entity-bindings.json` or `.neko/entity-bindings/*.json`.
- [x] 2.4 Ensure binding storage never writes under `.neko/.cache/` and preserves Git-friendly deterministic formatting.
- [x] 2.5 Add unit tests for entity facade mapping, binding persistence, binding replacement diffs, and cache deletion resilience.

## 3. AssetRef Resolution And Federation Boundary

- [x] 3.1 Implement `AssetRefResolver.parse()` and `validate()` for `project://`, `market://`, `shared://`, and `external://` refs including query parameters.
- [x] 3.2 Implement `project://` resolution through the project asset library without exposing workspace file paths to consumers.
- [x] 3.3 Implement `market://` resolution through market install records or a market API bridge without changing bindings during update checks.
- [x] 3.4 Add placeholder or integration points for `shared://` and `external://` source status, read-only flags, and fingerprint/availability reporting.
- [x] 3.5 Integrate resolved asset refs with `AssetFederationRegistry` for capabilities/semantics while keeping binding writes outside Federation handlers.
- [x] 3.6 Add tests for scheme parsing, query handling, source-vs-scheme semantics, PathResolver boundary behavior, and Federation non-ownership of bindings.

## 4. Representation Resolution

- [x] 4.1 Implement `RepresentationResolver` composition over `CreativeEntityRegistry`, `EntityAssetBindingService`, `AssetRefResolver`, and Asset Federation capabilities.
- [x] 4.2 Implement default fallback chains for story, canvas, agent, live, and cut targets.
- [x] 4.3 Implement `preferredKind`, custom `fallbackOrder`, and `allowFallback=false` behavior.
- [x] 4.4 Return `resolvedKind` and `fallback` on resolved responses and actionable missing representation data on missing responses.
- [x] 4.5 Add tests for Canvas fallback to portrait, Live refusal to use portrait, explicit no-fallback failure, and missing action suggestions.

## 5. Visual Drafts And Missing Requirements

- [x] 5.1 Implement `VisualIdentityDraftService` storage or in-memory interface for draft creation, asset selection, fact suggestions, acceptance, and discard.
- [x] 5.2 Implement `EntityAssetRequirementService` for missing portrait/reference/live2d/live3d/voice/motion needs.
- [x] 5.3 Integrate generated media lineage so `characterIds` and `sourceNodeId` can populate visual drafts and requirements.
- [x] 5.4 Add tests that AI extracted visual facts remain draft suggestions until accepted and support custom `VisualFactKey` strings.
- [x] 5.5 Add tests that missing representations produce requirements without creating fake asset files.

## 6. Cross-Modal Integrations

- [x] 6.1 Update Story integration to create or expose candidate creative entities and missing material requirements from script character detection.
- [x] 6.2 Update Canvas integration to store stable entity references and index gallery, shot, text, comment, and container occurrences.
- [x] 6.3 Update Agent generation flows to carry `characterIds`, `sourceNodeId`, visual draft context, and confirmed binding actions.
- [x] 6.4 Update Assets integration to show binding candidates, representation package details, and cancel-binding behavior distinct from delete-asset behavior.
- [x] 6.5 Update Live integration to use `RepresentationResolver` for avatar bundle selection and missing Live2D/Live3D prompts.
- [x] 6.6 Extend `CreativeEntityGraphService` or related graph builders to include confirmed binding edges and generated asset lineage.

## 7. UI Surfaces

- [x] 7.1 Add or extend an entity detail surface that shows aliases, status, relationships, occurrences, defaults, and missing requirements.
- [x] 7.2 Add binding controls for setting default portrait, Live2D, Live3D, voice, motion, and reference roles.
- [x] 7.3 Add AI visual draft review controls for selecting generated images and accepting/rejecting visual fact suggestions.
- [x] 7.4 Add missing material queue actions for generate, import, bind existing, and dismiss.
- [x] 7.5 Add representation package detail UI for component file roles, missing components, capabilities, and default assignment.

## 8. Verification And Documentation

- [x] 8.1 Add contract tests for all new shared types, validators, and fallback constants.
- [x] 8.2 Add service tests for binding storage, assetRef resolution, representation resolution, drafts, and requirements.
- [x] 8.3 Add integration tests for Story-to-Canvas-to-GeneratedAsset lineage and graph reconstruction.
- [x] 8.4 Run the minimal affected package tests and type checks for shared contracts and touched extension packages.
- [x] 8.5 Update architecture docs or README entry points if implementation changes storage paths, APIs, or user workflows.
