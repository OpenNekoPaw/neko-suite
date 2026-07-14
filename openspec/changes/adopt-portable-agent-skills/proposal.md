## Why

Neko Skills currently split one Skill's author contract across `SKILL.md`, a Neko-specific root `manifest.json`, Host catalog projection, and legacy `.neko/skills` roots. This prevents direct reuse of standard Agent Skills and incorrectly turns optional authoring guidance such as draft/review/apply into a generic capability restriction.

The repository already has accepted architecture guidance for a portable-first Skill package and a native typed `CreateSkill` capability. This change implements that boundary now so creation, manual editing, discovery, catalog projection, and activation all consume one canonical package shape before more Skill lifecycle work deepens the legacy format dependency.

## What Changes

- Adopt the open Agent Skills package shape: required `SKILL.md`, with optional `scripts/`, `references/`, `assets/`, and Host overlays under `agents/`.
- Add optional `agents/neko.yaml` validation and projection for Neko interface/dependency/relationship metadata without making the overlay mandatory.
- Move new project and personal Skills to `<workspace>/.agents/skills/` and `${HOME}/.agents/skills/`.
- Keep Neko configuration roots unchanged at `<workspace>/.neko/` and `${HOME}/.neko/`; the portable Skill namespace does not replace Neko's user or workspace configuration namespace.
- Add a typed native `CreateSkill` input that validates a complete definition and atomically commits a finished Skill directory; it does not require persisted drafts, review artifacts, apply commands, or a Skill-specific approval gate.
- Keep manual file creation and general file capabilities valid ways to create Skills; discovery rescans the canonical roots independently of the creation entry point.
- Derive source, absolute path, provenance, trust, enablement, editability, catalog actions, fingerprint, and compatibility from Host/Registry state instead of author-controlled package metadata.
- Separate portable validity, Neko overlay validity, Neko compatibility, and first-party content quality diagnostics.
- **BREAKING** Stop treating root `manifest.json` as a canonical Skill file and stop discovering new Skills from `.neko/skills` through fallback or dual-read behavior.
- Add an explicit legacy migration boundary that may read `.neko/skills` and legacy `manifest.json` only as migration input, fails on conflicts or unmappable data, and never silently overwrites or deletes user data.
- Preserve the existing activation lifecycle contract: creation or discovery does not auto-enable, auto-activate, or grant tool/model/trust permissions.

## Capabilities

### New Capabilities

- `portable-agent-skills`: Defines the canonical portable Skill package, optional Neko Host overlay, canonical roots, validation layers, and explicit legacy migration boundary.
- `agent-skill-creation`: Defines typed native Skill creation, atomic commit behavior, conflict/path safety, and equivalence with manually or generally file-created Skills.

### Modified Capabilities

- `agent-skill-candidate-routing`: Changes catalog projection requirements so author packages contribute portable/overlay metadata while Host/Registry derives runtime facts such as source, path, trust, enablement, editability, actions, and compatibility.

## Impact

- Shared contracts in `packages/neko-types/src/types/skill.ts` and public Agent exports.
- Skill parser, loader, validator, file runtime, registry/catalog projection, and their tests in `packages/neko-agent/packages/agent`.
- VSCode Extension Skill file services, catalog actions/provider, and any watcher/rescan composition that resolves writable roots.
- Platform configuration diagnostics and Webview/TUI user-facing root guidance.
- Builtin/custom Skill fixtures or tests that currently depend on root `manifest.json` or `.neko/skills`.
- Agent evaluation scenarios and debug evidence for the native `CreateSkill` canonical path and forbidden legacy fallback.
- No Rust Engine, Protobuf, cloud service, Marketplace package manifest, plugin manifest, or active Skill slot/lifetime redesign is included.

Compatibility is intentionally breaking for the unpublished Neko-specific Skill layout. Existing valuable local Skills are not silently deleted: they require explicit migration or manual relocation, and migration must stop with visible diagnostics on conflicts or data that cannot be represented safely.
