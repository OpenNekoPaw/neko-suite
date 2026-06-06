## 1. Shared Contracts

- [x] 1.1 Add shared skill catalog role/source/action DTOs with runtime-safe defaults for providers that only expose existing `SkillDef`.
- [x] 1.2 Extend `SkillManifest` or add a namespaced manifest extension for non-orchestrating catalog metadata, including validation that rejects workflow-order fields.
- [x] 1.3 Add helpers to project `Skill`, `LazySkill`, and `ConfiguredSkill` into catalog entries without loading full Markdown content.
- [x] 1.4 Add unit tests for catalog metadata validation, role defaults, action defaults, and non-orchestrating field rejection.

## 2. NekoAgent Catalog Provider

- [x] 2.1 Define built-in catalog metadata for orchestrator, focused sub-skill, standalone, quick-action, and persona skills.
- [x] 2.2 Update NekoAgent's Dashboard-facing skill provider to merge built-in skills with cached project/personal `.neko/skills` scan results.
- [x] 2.3 Implement deterministic source precedence for duplicate skill ids: project, personal, market/plugin, builtin.
- [x] 2.4 Project `.neko/commands` as quick actions or keep them out of the main skill catalog according to the chosen design decision.
- [x] 2.5 Ensure skill file watcher/rescan updates the provider cache used by Dashboard.
- [x] 2.6 Add provider tests for built-in grouping, file-skill inclusion, duplicate precedence, hidden persona filtering, and locale/tag preservation.

## 3. Skill Management Commands

- [x] 3.1 Add typed NekoAgent host commands for skill run, edit, reveal, fork, create, duplicate, and rescan actions.
- [x] 3.2 Resolve project/personal skill paths only in Extension Host from trusted skill refs; reject unknown ids, unsupported sources, and path-like Webview payloads.
- [x] 3.3 Implement fork/copy from non-editable built-in skills into project or personal `.neko/skills`, preserving relevant manifest/catalog metadata.
- [x] 3.4 Add command tests for safe path resolution, edit/reveal behavior, fork/create outputs, and invalid action rejection.

## 4. Dashboard Integration

- [x] 4.1 Extend Dashboard protocol/types to carry catalog metadata and typed skill action requests.
- [x] 4.2 Update `SkillReader` to consume catalog metadata while preserving compatibility with older `SkillDef` providers.
- [x] 4.3 Replace flat skill rendering with grouped catalog sections: primary orchestrators, standalone skills, quick actions, and advanced/all entries.
- [x] 4.4 Render source badges, role badges, child sub-skill rows, tag filters, counts, and safe action buttons.
- [x] 4.5 Add New Skill and Rescan actions to the Dashboard skill section.
- [x] 4.6 Add Dashboard tests for grouping, tag filtering, advanced toggle, source/role badges, and typed action dispatch without absolute paths.

## 5. Validation and Documentation

- [x] 5.1 Run focused tests for shared catalog helpers, NekoAgent provider/actions, Dashboard protocol, and SkillList rendering.
- [x] 5.2 Run `pnpm --dir packages/neko-agent run compile:extension` and `pnpm --dir packages/neko-dashboard run compile:webview`.
- [x] 5.3 Run `pnpm --dir packages/neko-agent/packages/cli-tui run build:exe` to keep raw Markdown import compatibility covered.
- [ ] 5.4 Run a VSCode debug smoke check for Dashboard skill catalog display and edit/fork actions.
- [x] 5.5 Update relevant architecture or README documentation if the public skill catalog or `.neko/skills` management behavior changes.
