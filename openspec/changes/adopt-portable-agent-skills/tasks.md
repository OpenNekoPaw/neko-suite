## 1. Shared contracts and validation

- [x] 1.1 Add portable Skill definition, resource, Neko overlay, validation diagnostic, compatibility, native creation, result, and migration contracts to `@neko/shared`.
- [x] 1.2 Replace canonical Skill directory constants and documentation with `.agents/skills` while keeping command artifact roots separate.
- [x] 1.3 Implement portable `SKILL.md` parsing/serialization and deterministic validation for names, descriptions, compatibility, metadata, and directory identity.
- [x] 1.4 Implement versioned `agents/neko.yaml` parsing/serialization and validation without generating empty overlays.
- [x] 1.5 Add focused contract/parser tests that distinguish portable validity, overlay validity, compatibility, and first-party quality.

## 2. Canonical file runtime and native creation

- [x] 2.1 Refactor Skill scan/watch/root planning to use project and personal `.agents/skills` roots without `.neko/skills` fallback.
- [x] 2.2 Replace template-oriented `CreateSkillFileInput` with complete typed `CreateSkillInput` and serialize the full package.
- [x] 2.3 Implement contained resource-path validation, reserved-file collision checks, target conflicts, sibling temporary directories, atomic rename, and failure cleanup.
- [x] 2.4 Ensure successful creation invalidates/rescans the shared file runtime and returns a typed result without activation side effects.
- [x] 2.5 Update duplicate/delete/edit helpers to operate on canonical roots and preserve unknown host overlays.
- [x] 2.6 Add file-runtime tests for canonical roots, complete packages, no manifest/empty overlay, traversal rejection, conflicts, atomic cleanup, concurrent commit conflicts, and poisoned legacy roots.

## 3. Loader, overlay, registry, and catalog projection

- [x] 3.1 Update normal Skill loading and lazy loading to read portable `SKILL.md` plus optional `agents/neko.yaml` and to ignore root `manifest.json`.
- [x] 3.2 Enforce directory/frontmatter identity and fail visibly on invalid portable or Neko overlay data.
- [x] 3.3 Project source/path/enablement/editability/actions/trust/provenance/compatibility from loader and Host/Registry context rather than author metadata.
- [x] 3.4 Remove manifest-backed catalog/runtime success paths and migrate builtin/file catalog fixtures to portable or Host-owned metadata.
- [x] 3.5 Add loader, lazy-loader, registry, GetContext, and catalog tests for minimal external Skills, optional fields/overlay, Host-derived facts, and ignored legacy manifests.

## 4. Extension and TUI host integration

- [x] 4.1 Update `SkillFileService` Node adapter and watchers for atomic rename, canonical roots, typed creation, and removal of `writeSkillManifest`.
- [x] 4.2 Update Extension skill catalog fork/create/duplicate/delete actions to use complete creation or canonical directory operations without manifest writes.
- [x] 4.3 Add `CreateSkill` as a core native Agent tool backed by the per-conversation Skill provider, with typed parameters and visible diagnostics.
- [x] 4.4 Wire Extension Host native creation to the shared Skill file runtime and registry refresh without changing lifecycle activation state.
- [x] 4.5 Wire TUI native creation to the same file runtime and registry refresh, keeping configured command roots and activation lifecycle separate.
- [x] 4.6 Update Extension/TUI tests for tool registration, provider delegation, canonical result paths, and inactive-after-create behavior.

## 5. Explicit legacy migration boundary

- [x] 5.1 Add a migration-only reader/planner for `.neko/skills` and legacy root `manifest.json` that maps representable author metadata into portable/overlay contracts.
- [x] 5.2 Fail migration visibly on canonical target conflict or unmappable legacy data and never delete or overwrite source content.
- [x] 5.3 Add migration tests proving legacy parsing is reachable only through the explicit migration API and cannot mask normal loader/create failure.

## 6. User guidance and architecture synchronization

- [x] 6.1 Update platform diagnostics, Extension/Webview/TUI strings, fixtures, and settings guidance from `.neko/skills` to `.agents/skills`.
- [x] 6.2 Remove stale single-Skill `manifest.json` authoring guidance while preserving Marketplace/plugin/cache manifest documentation.
- [x] 6.3 Maintain anti-regression tests ensuring Skill prompt content does not absorb runtime tool protocols or Host schema details.

## 7. Verification and Agent evaluation

- [x] 7.1 Run focused Vitest and TypeScript checks for shared, Agent Skill runtime, Extension, TUI, and Webview slices and fix regressions.
- [x] 7.2 Add focused Agent evaluation scenarios for successful native creation, invalid/traversal/conflict failure, and poisoned legacy fallback with canonical-path evidence.
- [x] 7.3 Run `pnpm test:agent:eval` and a real focused TUI/Agent evaluation when provider credentials and debug automation are available; otherwise record the exact blocker and residual risk.
- [x] 7.4 Run `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check`, `pnpm test`, and `pnpm build` as permitted by the workspace, recording pre-existing or environment blockers separately.
- [x] 7.5 Perform the `neko-quality-review` self-review, resolve blocking findings, and document verification commands plus remaining risk.
