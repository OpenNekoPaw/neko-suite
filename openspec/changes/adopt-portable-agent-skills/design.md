## Context

The current Skill stack has four coupled representations:

- `SKILL.md` frontmatter and body.
- A sibling Neko-only `manifest.json` that carries dependencies, relationships, media hints, compliance, and catalog metadata.
- Runtime `Skill` fields that mix portable author data with Host facts such as source, path, enabled state, and editability.
- File services and tests that discover and write personal/project Skills under `.neko/skills`.

Creation is also file-template oriented: `createSkillFile` creates a directory and placeholder `SKILL.md`, returns an existing path as success, and can write the legacy manifest separately. That shape cannot guarantee a complete package, atomic visibility, or a single validation result before commit.

The accepted architecture ADR defines a three-layer model:

```text
Portable package       SKILL.md + optional scripts/references/assets
Neko Host overlay      optional agents/neko.yaml
Host/Registry facts    source/path/trust/enablement/catalog/compatibility
```

This change crosses Layer 0 contracts, Agent file runtime/loader, Extension Host file services, catalog projection, UI guidance, and evaluation. It remains local-client architecture: no remote registry service, database, tenancy layer, or generalized package manager is introduced.

`complete-agent-skill-lifecycle` remains the owner of activation slots, lifetimes, conflicts, and request-time projection. This change only changes what a registered Skill package is and how it is created/discovered.

### Five-layer analysis

**Responsibility**

- Portable parser/serializer owns `SKILL.md` author data and portable validation.
- Neko overlay parser/serializer owns only `agents/neko.yaml` and overlay schema validation.
- Skill file runtime owns canonical root resolution, path containment, atomic directory commit, scanning, duplication, deletion, and explicit migration input.
- Registry/catalog projection owns Host facts and compatibility resolution.
- Existing lifecycle runtime owns enablement/activation; creation and discovery do not mutate lifecycle state.

**Dependency**

- Portable/overlay DTOs and diagnostics live in `@neko/shared` (Layer 0) without VSCode, Node, React, or domain package imports.
- Agent package implements filesystem-neutral planning/parsing behind injected fs/path interfaces.
- Extension supplies Node/VSCode adapters and watchers; Webview receives projections only.
- Domain capabilities/profiles are resolved through existing registries rather than imported into the loader.

**Interface**

- `CreateSkillInput` accepts a complete portable definition, optional resources, optional Neko overlay, and a project/personal target.
- Resource entries are typed as UTF-8 or base64 content and must use contained relative paths.
- `CreateSkillResult` reports the committed package path, source, fingerprint/diagnostics when available, and never represents activation success.
- Validation reports portable, overlay, compatibility, and first-party quality as distinct dimensions.

**Extension**

- Other hosts can add `agents/<host>.yaml` without changing the portable parser.
- Future Neko overlay versions add an explicit versioned parser; unknown versions fail visibly rather than guessing.
- Future creation/editing surfaces reuse the same serializer and validator instead of duplicating templates.
- A small root resolver separates Skill roots from command roots; it is not a generalized virtual filesystem.

**Testing**

- Contract/parser unit tests cover portable fields, folder/name equality, overlay versions, and diagnostic separation.
- File-runtime tests cover canonical roots, traversal, conflict, atomic cleanup, no manifest, no auto-activation, and poison legacy roots.
- Loader/catalog tests cover manually created standard packages and Host-derived runtime facts.
- Extension tests cover service composition and canonical watchers/actions.
- Focused Agent evaluation proves native `CreateSkill` invocation reaches `.agents/skills` and cannot succeed through `.neko/skills` or manifest fallback.

## Goals / Non-Goals

**Goals:**

- Make `SKILL.md` the only required canonical Skill file.
- Load standard instruction-only Skills without Neko conversion.
- Support an optional versioned `agents/neko.yaml` overlay.
- Implement complete typed native creation with validation and atomic commit.
- Make project/personal canonical roots `.agents/skills`.
- Remove root `manifest.json` and `.neko/skills` from normal create/discovery success paths.
- Preserve valuable legacy data through an explicit, fail-closed migration boundary.
- Keep Host/runtime facts out of author-controlled metadata.

**Non-Goals:**

- Redesign active Skill slots, lifetimes, clearability, or conflict policy.
- Require draft, validate, review, or apply artifacts before creation.
- Add a Skill-specific approval mechanism beyond existing file/sandbox/trust policy.
- Auto-enable or auto-activate a newly created or discovered Skill.
- Standardize every host's overlay fields or rewrite unknown `agents/*` files.
- Remove Marketplace asset manifests, Codex plugin manifests, or unrelated `.neko/commands` behavior.
- Add cloud sync, remote package resolution, semver dependency installation, or executable sandbox orchestration.

## Decisions

### Decision 1: Use a portable author contract and a separate Host projection

Add Layer 0 contracts centered on:

```ts
interface PortableSkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly allowedTools?: readonly string[];
}

interface NekoSkillOverlay {
  readonly schemaVersion: 1;
  readonly interface?: NekoSkillInterfaceMetadata;
  readonly dependencies?: NekoSkillDependencies;
  readonly relationships?: NekoSkillRelationships;
}
```

The runtime `Skill` may continue to carry resolved fields required by existing activation callers, but source, directory path, enabled state, catalog actions, trust, provenance, fingerprint, and compatibility status are populated by loader/registry inputs, never accepted from package author metadata.

Rationale: this preserves existing activation consumers while correcting ownership at the package boundary.

Rejected: put all Neko fields in `SKILL.md`. Other hosts would ingest Neko internals and author-controlled files could claim runtime trust/editability.

Rejected: keep `manifest.json` as an optional compatibility file. That would preserve dual truth and make tests pass through the forbidden legacy path.

### Decision 2: Validate four dimensions independently

Validation returns separate sections:

1. portable validity;
2. Neko overlay validity;
3. current Host compatibility;
4. Neko first-party quality.

Portable validity enforces at minimum:

- name length at most 64;
- lowercase letters/digits separated by single hyphens;
- no leading, trailing, or consecutive hyphens;
- directory basename equals frontmatter name when loading from a directory;
- non-empty description of at most 1024 characters;
- compatibility length at most 500 characters;
- metadata values are strings;
- referenced/resource paths remain within the Skill directory.

Overlay validity requires `schemaVersion: 1`, validates known Neko structures, and rejects unknown versions. Other host overlays are ignored by Neko loading and preserved by whole-directory duplication/edit operations.

Rationale: an external Skill can be portable-valid yet incompatible with the current Neko installation, and a user Skill can be valid without satisfying first-party prompt-quality policy.

Rejected: one boolean validator with warnings. It cannot distinguish a corrupt package from a missing optional capability and encourages unsafe fallback.

### Decision 3: Resolve Skill roots explicitly, without legacy fallback

Project and personal Skill roots are:

- `<workspace>/.agents/skills`
- `${HOME}/.agents/skills`

Command artifacts remain under their existing command roots because they are a different namespace and file shape.

A small root contract resolves writable/discovery roots by target/source. Normal scan and watch plans contain only canonical Skill roots. `.neko/skills` is reachable only through an explicitly named migration API; a missing canonical root is created rather than replaced by a legacy root.

Rationale: one canonical path makes manual creation, general file creation, native creation, watch/rescan, and catalog projection converge.

Rejected: dual-read new and old roots. Source precedence could hide migration conflicts and a poisoned legacy directory could still make a new-path test pass.

### Decision 4: Native creation commits a complete directory atomically

`CreateSkillInput` contains the target, portable definition, optional resources, and optional Neko overlay. Creation performs:

1. validate the complete in-memory package;
2. resolve the canonical writable root;
3. reject an existing final directory with a typed conflict diagnostic;
4. reject absolute, empty, reserved, or escaping resource paths and prevent resources from replacing `SKILL.md` or `agents/neko.yaml`;
5. create a sibling temporary directory under the same root;
6. write serialized `SKILL.md`, resources, and a non-empty overlay only when supplied;
7. rename the temporary directory to the final directory;
8. remove the temporary directory on any failure;
9. invalidate/rescan file state and return the committed result.

The injected fs interface gains `rename`; tests use a deterministic in-memory implementation. The temporary directory is an implementation detail, not a user-visible draft artifact.

Creation never returns an existing file as success, writes `manifest.json`, activates the Skill, or grants permissions.

Rationale: directory rename within one local filesystem gives the watcher a complete package boundary and prevents partial Skills from becoming discoverable.

Rejected: write files directly to the target and clean up later. A watcher can observe partial state.

Rejected: mandatory draft/review/apply. That is authoring guidance, not a generic native capability contract.

### Decision 5: Keep loader and catalog responsibilities separate

The loader reads `SKILL.md`, optional support resources, and optional `agents/neko.yaml`. It does not read root `manifest.json` during normal discovery. It produces a loaded Skill plus author metadata/overlay diagnostics.

Catalog projection derives:

- source from the scan/root descriptor;
- directory/file paths from the discovered location;
- enablement/editability/actions from Host policy;
- trust/provenance from the source provider/market/plugin boundary;
- compatibility from overlay dependencies and registered runtime capabilities;
- display metadata from portable content or the optional Neko interface overlay.

Rationale: registry facts cannot be safely self-asserted by an author file.

Rejected: mechanically move every manifest field into the overlay. Fields such as source, enabled, editable, actions, and compliance status are Host facts, not overlay metadata.

### Decision 6: Legacy import is explicit and fail-closed

A legacy migration reader may parse `.neko/skills/<name>/SKILL.md` and sibling `manifest.json` only when an explicit migration operation is requested. It maps representable author metadata into `SKILL.md` or `agents/neko.yaml`, preserves resource files, and reports diagnostics for unmappable fields.

Migration does not overwrite an existing canonical target, delete the source, or silently drop unknown data. Normal loader/create/catalog code has no fallback call to the migration reader.

Rationale: prelaunch cleanup can break unpublished format contracts but must not destroy valuable local user content.

Rejected: silently move directories on startup. It changes user data without an explicit operation and cannot safely resolve target conflicts.

### Decision 7: Activation and permission remain downstream

Create/discover/rescan only changes registry availability. Existing explicit `$skill`, UI invocation, or Agent `ActivateSkill` paths remain the only activation paths, and current lifecycle/tool guards remain authoritative.

The system `skill-creator` Skill may guide interviews, decomposition, validation, and forward testing. It is neither the only writer nor a permission owner.

Rationale: content creation must not smuggle activation state or tool authority through author metadata.

## Risks / Trade-offs

- **[Breaking local layout] Existing `.neko/skills` stop appearing in normal discovery.** → Provide explicit migration diagnostics and documentation; never delete source data automatically.
- **[Broad type impact] Removing manifest-backed fields touches loader, catalog, builtins, and tests.** → Migrate contract-first, keep runtime projection fields only where downstream activation still needs them, and use compile errors to enumerate callers.
- **[Atomic rename portability] Rename can fail because of permissions or cross-device placement.** → Create the temporary directory as a sibling under the same canonical root and surface the filesystem error; do not copy-fallback into partial success.
- **[YAML ambiguity] Hand-written overlay values may have unexpected YAML types.** → Parse as unknown and validate every field; reject unknown schema versions and invalid required structures.
- **[External Skill compatibility] Portable validity does not guarantee local script/tool availability.** → Report compatibility separately and keep activation fail-closed when required dependencies are unavailable.
- **[Concurrent creation] Two creators can race for the same name.** → Final rename/conflict handling is authoritative; no overwrite or merge behavior is provided.
- **[Scope growth] A generalized package registry would overcomplicate a local client.** → Implement only shared DTOs, a root resolver, parser/serializer, and existing Host adapters needed by current callers.

## Migration Plan

1. Introduce shared portable/overlay/create contracts and serializers/validators without changing activation semantics.
2. Change normal scan/watch/write roots to `.agents/skills` and add poison tests proving `.neko/skills` cannot satisfy canonical discovery.
3. Change loader to consume `SKILL.md` plus optional `agents/neko.yaml`; remove normal manifest reads and manifest write APIs.
4. Project Host facts in registry/catalog code and migrate builtin/file fixtures away from author-controlled manifest data.
5. Replace template-only creation callers with complete typed creation and atomic commit; keep duplicate/delete/edit behavior on canonical directories.
6. Add explicit legacy migration reader/service and conflict/unmappable diagnostics without wiring it as startup fallback.
7. Update Extension/UI/config guidance and documentation.
8. Run focused package tests, type checks, legacy-debt checks, Agent evaluation harness tests, and a real focused Agent evaluation when provider/runtime prerequisites are available.

Rollback during development is a code revert plus continued source data retention. There is no automatic reverse migration: canonical `.agents/skills` content remains user-owned and can be manually copied if an unpublished build is rolled back.

## Open Questions

None blocking. Overlay dependency fields will initially cover only registries already present in the repository; new dependency kinds require a later schema-versioned extension rather than permissive unknown-field execution.
