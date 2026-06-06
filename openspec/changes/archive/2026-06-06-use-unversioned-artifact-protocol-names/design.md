## Context

Current Neko code uses several version naming patterns:

- Runtime payloads with an explicit field and unversioned public type, such as `PerceptionCard` with `version: 1`.
- Side-by-side versioned variants with an unversioned union and migrator, such as `NkEntityArtifactV1 | NkEntityArtifactV2`.
- Pre-release protocols whose public names already include `V1`, such as `StoryboardTableV1`, `CompositeArtifactV1`, and `GenericTableV1`.
- External API names that include versions, such as AI SDK `ImageModelV3`, which Neko should not rename.

For artifact protocols, the durable compatibility signal is already inside payloads: `schemaVersion` for schema shape and `profileVersion` for shared profile descriptors. TypeScript names and registry ids are developer-facing protocol identifiers; if those identifiers include `V1` before public release, Skills and registries will spread version-specific names into prompts and persisted metadata unnecessarily.

Five-layer analysis:

| Layer | Design stance |
| ----- | ------------- |
| Responsibilities | Shared contracts expose canonical protocol names; validators inspect version fields; migrators own true multi-version transitions. |
| Dependencies | Registry, Skill, Agent, Canvas, and Cut depend on stable protocol ids, not TypeScript version suffixes. |
| Interfaces | Public ids become `CompositeArtifact`, `GenericTable`, and `StoryboardTable`; payloads keep `schemaVersion: 1`. |
| Extension | Future breaking versions introduce exact variants only when old and new versions must coexist. |
| Testing | Type tests, runtime validators, projector tests, Skill metadata tests, and `rg` checks catch stale public `V1` protocol names. |

## Goals / Non-Goals

**Goals:**

- Make unversioned names the public API for pre-release Neko-owned artifact/storyboard protocols.
- Preserve runtime version safety through `schemaVersion` and `profileVersion`.
- Update protocol strings consumed by Agent, Skills, registry facets, renderers, projectors, and transfer DTOs.
- Keep future `V2` support possible through explicit side-by-side variants and migrators when needed.
- Keep external library version names and existing true multi-version artifacts unchanged.

**Non-Goals:**

- Do not change persisted `kind` literals such as `composite-artifact` or `storyboard-table` unless they currently encode a version suffix.
- Do not implement `CompositeArtifactV2`, `GenericTableV2`, or `StoryboardTableV2`.
- Do not change AI SDK provider names such as `ImageModelV3`.
- Do not collapse true multi-version contracts such as `NkEntityArtifactV1` / `NkEntityArtifactV2`.
- Do not add long-term public compatibility aliases for pre-release names.

## Decisions

### Decision 1: Public names are unversioned; payload versions stay explicit

Canonical public exports and protocol ids should be:

```ts
CompositeArtifact
GenericTable
StoryboardTable
validateCompositeArtifact()
validateGenericTable()
validateStoryboardTable()
```

Payloads continue to carry:

```ts
schemaVersion: 1
profileVersion?: number
```

Rationale: consumers can only rely on serialized fields across package, process, Webview, and file boundaries. TypeScript suffixes do not help runtime compatibility and make Skill/registry language noisier.

### Decision 2: Version suffixes are reserved for coexistence or migration

Use `FooV1` / `FooV2` only when at least two incompatible variants must exist at the same time:

```ts
type Foo = FooV1 | FooV2;
function migrateFooToV2(value: Foo): FooV2;
```

This matches existing `NkEntityArtifact` behavior and keeps the future path clear. A future `CompositeArtifactV2` is not planned by this change; it appears only if the artifact schema breaks in a way that cannot be handled by optional fields, profile evolution, domain payloads, or registry additions.

### Decision 3: Pre-release rename should be clean, not alias-first

Because these artifact names are not public release contracts yet, implementation should update call sites rather than exporting long-lived compatibility aliases such as `CompositeArtifactV1 = CompositeArtifact`.

Temporary local aliases may be used inside a migration patch if they reduce churn, but they must not remain in public exports, Skill metadata, registry ids, or docs after the task completes.

### Decision 4: Registry and Skill strings must rename with types

The important cleanup is not only TypeScript type names. These strings also need canonical unversioned names:

- `validationRequirements`
- `producedArtifacts`
- `renders` / `accepts`
- artifact protocol facet ids
- profile `protocol`
- projector input/output protocol ids
- `domainKind` values such as `StoryboardTable`
- validator ids such as `neko.shared.validateCompositeArtifact`

Rationale: Agent planning and cross-package discovery operate through these strings. Leaving `V1` there would keep the old protocol name alive even after type exports are renamed.

### Decision 5: Apply to composite and storyboard protocol groups together

Renaming only `CompositeArtifactV1` and `GenericTableV1` would still leave comic-to-animation flows asking for `StoryboardTableV1` inside domain blocks. The implementation should rename the storyboard public protocol group at the same time:

- `StoryboardTable`
- `StoryboardSceneRow`
- `StoryboardShotRow`
- `StoryboardMediaRef`
- `StoryboardValidationDiagnostic`
- `normalizeStoryboardTable`
- `projectStoryboardTableToCanvasPayload`
- `projectStoryboardTableToCutPayload`

`schemaVersion: 1` remains unchanged.

## Risks / Trade-offs

- [Risk] Rename touches many packages. -> Mitigation: keep scope mechanical, run focused type/tests, and avoid behavior changes.
- [Risk] Old names linger in prompts or registry ids. -> Mitigation: add targeted tests or `rg` checks for disallowed public strings outside archive/legacy allowlists.
- [Risk] Branches depending on old names conflict. -> Mitigation: current project is pre-release; resolve conflicts by adopting canonical names rather than adding public aliases.
- [Risk] Future migration needs exact old variants. -> Mitigation: introduce `FooV1` / `FooV2` only at the time side-by-side support is required.
- [Risk] Docs lose clarity that this is schema version 1. -> Mitigation: show `schemaVersion: 1` in examples and add a naming policy note.

## Migration Plan

1. Rename shared type exports, constants, validators, normalizers, and projectors.
2. Rename protocol ids and registry metadata strings.
3. Rename Agent transfer DTO imports and composite/storyboard presenter references.
4. Rename built-in Skill metadata and prompt text.
5. Update ADR/OpenSpec wording and examples.
6. Run focused tests and type checks, then scan for stale public `CompositeArtifactV1`, `GenericTableV1`, and `StoryboardTableV1` references outside archive/legacy allowlists.
