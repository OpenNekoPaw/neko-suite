## Why

Dashboard currently shows Agent skills as a flat list of executable cards. This hides the difference between orchestrator skills, focused sub-skills, quick actions, built-in skills, and editable `.neko/skills` files, making the media-to-video skill set hard to scan and difficult to manage.

Neko Agent already has a file-based skill runtime with lazy loading, manifest metadata, watchers, and create/edit/delete helpers. The missing piece is a stable catalog projection that Dashboard can render and act on without parsing Markdown or duplicating Agent internals.

## What Changes

- Add a Skill Catalog projection for Dashboard and other UI consumers, including skill source, role, group, visibility, editability, related-skill links, and safe action descriptors.
- Extend NekoAgent's Dashboard skill provider to include both built-in skills and scanned project/personal `.neko/skills` entries.
- Mark built-in media workflow skills as orchestrator or focused sub-skill through deterministic metadata rather than display tags.
- Let Dashboard render skills by role and source, folding focused sub-skills under their orchestrator by default while still offering an advanced/all view.
- Add safe Dashboard actions for running, opening, editing, revealing, duplicating/forking, and creating skills through Extension Host commands.
- Keep workflow ordering and task guidance in Skill Markdown; do not introduce a workflow DAG, route catalog, or hardcoded media pipeline.

## Capabilities

### New Capabilities

- `agent-skill-catalog-management`: Defines the Agent skill catalog projection, role/source/editability metadata, file-skill inclusion, and safe management actions.

### Modified Capabilities

- `dashboard-project-overview`: Dashboard shall present installed Agent skills as a structured, manageable catalog rather than a flat list only.

## Impact

- Shared types: `SkillDef` / Dashboard skill DTOs or a sibling catalog DTO gain catalog metadata and action descriptors.
- NekoAgent extension: skill provider merges built-in skills with `.neko/skills` scan results and registers safe skill management commands.
- NekoAgent skill runtime: may add catalog metadata helpers and manifest projection utilities, without changing skill injection semantics.
- Dashboard extension/webview: skill reader, protocol, UI grouping/filtering, and action buttons are updated.
- Tests: registry/projection tests, Dashboard rendering/action tests, file-skill scan integration tests, and regression tests preventing Markdown parsing in Dashboard.
