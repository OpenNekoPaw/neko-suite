## 1. Shared Protocol Renames

- [x] 1.1 Rename composite artifact public exports in `packages/neko-types` from `CompositeArtifactV1` / `GenericTableV1` and related artifact helper types to unversioned names while preserving `schemaVersion: 1`.
- [x] 1.2 Rename composite artifact constants, validators, and helper guards to unversioned names such as `COMPOSITE_ARTIFACT_SCHEMA_VERSION`, `validateCompositeArtifact`, and `validateGenericTable`.
- [x] 1.3 Rename storyboard public exports from `StoryboardTableV1` and related scene/shot/media/profile/diagnostic types to unversioned names while preserving `schemaVersion: 1`.
- [x] 1.4 Rename storyboard validators, normalizers, image-strategy interpreter types, and Canvas/Cut projectors to unversioned names.

## 2. Runtime, Registry, And Transfer Updates

- [x] 2.1 Update Agent transfer DTOs, tool result artifact payloads, and Webview protocol references to the unversioned shared types.
- [x] 2.2 Update composite-content parser/presenter logic to recognize `domainKind: "StoryboardTable"` and remove public reliance on `domainKind: "StoryboardTableV1"` except for explicitly documented legacy input normalization.
- [x] 2.3 Update capability artifact facets, renderer/projector `accepts` and `renders`, profile `protocol`, validation requirement strings, and validator ids to use canonical unversioned protocol names.
- [x] 2.4 Update Canvas/Cut storyboard projection integration to consume `StoryboardTable` and expose actions only through the renamed projector ids.

## 3. Skills And Documentation

- [x] 3.1 Update built-in Skill metadata and Markdown prompts so Agent is instructed to output `CompositeArtifact`, `GenericTable`, and `StoryboardTable` with `schemaVersion: 1`.
- [x] 3.2 Update the composite artifact ADR and active OpenSpec change text to describe unversioned public names and field-based versioning.
- [x] 3.3 Add a short architecture note that `V1` / `V2` suffixes are reserved for side-by-side variants, migration code, or external API names.

## 4. Verification

- [x] 4.1 Update unit tests for composite artifact validation, storyboard validation, artifact projection, Agent transfer, Webview presenters, and built-in Skill metadata.
- [x] 4.2 Add or update tests that assert registry/Skill protocol strings use `CompositeArtifact`, `GenericTable`, and `StoryboardTable`.
- [x] 4.3 Run focused validation commands for affected packages and `openspec validate use-unversioned-artifact-protocol-names --type change --strict`.
- [x] 4.4 Scan for stale public protocol strings `CompositeArtifactV1`, `GenericTableV1`, and `StoryboardTableV1` outside archive/legacy allowlists and resolve any active references.
