## Context

Neko Agent already supports multiple skill sources:

- Built-in skills declared in TypeScript, some with Markdown bodies imported as raw text.
- Project and personal file skills under `.neko/skills/<name>/SKILL.md` and `~/.neko/skills/<name>/SKILL.md`.
- Slash commands under `.neko/commands` and `~/.neko/commands`.
- Plugin/market-contributed skills through existing capability registration paths.

The file skill runtime already provides scanning, lazy loading, watching, creation, duplication, deletion, and conversion to configured skill state. The Dashboard currently uses a much narrower `ISkillProvider.getSkills()` projection that flattens built-in skills into `SkillDef` cards. That projection loses source, role, editability, file identity, and relationships, so users see orchestrators, sub-skills, quick actions, and internal personas in one undifferentiated list.

The existing media-to-video design also established an important constraint: workflow ordering belongs in Skill Markdown prompt-chain text, while manifest/runtime metadata should remain deterministic and non-orchestrating. This change extends that principle to UI cataloging and management.

Five-layer analysis:

| Layer | Design stance |
| ----- | ------------- |
| Responsibilities | Agent owns skill discovery/catalog projection and file-skill management; Dashboard owns browsing and typed action dispatch; Skill Markdown owns prompt-chain guidance. |
| Dependencies | Shared types define catalog DTOs; Extension Host resolves paths and executes VSCode commands; Webview never receives raw editable absolute paths. |
| Interfaces | Prefer extending `SkillDef` or adding a sibling `SkillCatalogEntry` projection over exposing `Skill` internals directly. |
| Extension | New skill roles/sources can be projected by metadata without Dashboard parsing Markdown or media workflow content. |
| Testing | Cover projection, source precedence, safe action dispatch, Dashboard grouping/filtering, and `.neko/skills` watcher refresh behavior. |

## Goals / Non-Goals

**Goals:**

- Surface built-in, project, personal, market, and plugin skills in one Dashboard catalog.
- Distinguish orchestrator, focused sub-skill, standalone, quick-action, and persona entries.
- Group focused sub-skills under orchestrator skills while preserving an advanced all-skills view.
- Provide safe run/open/edit/reveal/duplicate/create actions for editable file skills.
- Let users fork non-editable built-in skills into workspace or personal `.neko/skills`.
- Keep Dashboard from parsing Markdown or receiving unmanaged absolute paths.
- Preserve `.neko/skills` as first-class project customization.

**Non-Goals:**

- Do not implement a full Skill IDE inside Dashboard.
- Do not parse SKILL.md headings/tables to infer workflow or role.
- Do not introduce a workflow route DSL, DAG, or hardcoded media-to-video pipeline.
- Do not make `.neko/commands` appear as normal skills; they are quick actions / slash commands.
- Do not allow Webview-originated arbitrary file open/edit requests.

## Decisions

### Decision 1: Introduce a catalog projection, not UI-side Markdown parsing

Add a DTO shaped for UI and management, either as an extension of `SkillDef` or a sibling Dashboard-specific projection:

```ts
type SkillCatalogRole =
  | 'orchestrator'
  | 'focused-skill'
  | 'standalone'
  | 'quick-action'
  | 'persona';

type SkillCatalogSource = 'builtin' | 'project' | 'personal' | 'market' | 'plugin';

interface SkillCatalogMeta {
  role: SkillCatalogRole;
  source: SkillCatalogSource;
  groupId?: string;
  parentSkillIds?: readonly string[];
  visibility?: 'primary' | 'advanced' | 'hidden';
  editable: boolean;
  actions: readonly SkillCatalogAction[];
}
```

Dashboard reads this projection and renders it. It never opens or parses `content`, `SKILL.md`, or `manifest.json` directly.

Alternative considered: infer groups from tags or Markdown sections. Rejected because tags are display filters and Markdown is prompt-chain content, not a UI contract.

### Decision 2: Store catalog role in deterministic metadata

For built-in skills, role/group metadata can initially live in a small TypeScript map next to existing built-in display metadata. For file skills, metadata should be read from `manifest.json` using a new non-orchestrating catalog block, for example:

```json
{
  "version": "1.0.0",
  "domain": "media",
  "catalog": {
    "role": "focused-skill",
    "groupId": "media-to-video",
    "visibility": "advanced"
  }
}
```

If adding `catalog` directly to `SkillManifest` is too broad, use a namespaced extension block such as `extensions["neko.catalog"]`. The implementation should pick one path and validate that catalog metadata does not contain workflow order.

Alternative considered: use `mediaWorkflow.tags` to determine role. Rejected because not every cataloged skill is a media workflow, and tags are not stable hierarchy.

### Decision 3: Merge built-in and `.neko/skills` through NekoAgent provider

NekoAgent should project:

- built-in skills from `getBuiltinSkills({ locale })`;
- project and personal file skills from `SkillFileService` scan/cache;
- commands from `.neko/commands` as quick actions or a separate command section;
- plugin skills when already available through runtime registries, if safe to expose.

Source precedence for duplicate names should be deterministic:

1. project
2. personal
3. market/plugin
4. builtin

When a higher-priority skill overrides a lower-priority one, the catalog should expose one primary entry and optionally an advanced duplicate detail. This avoids confusing users with multiple cards for the same skill id.

### Decision 4: Dashboard actions are typed and host-resolved

Dashboard Webview should send action requests like:

```ts
{
  type: 'skillAction',
  action: 'edit',
  skillRef: { extensionId: 'neko.neko-agent', id: 'comic-to-storyboard', source: 'project' }
}
```

The Extension Host resolves this reference to a known command and path. It can then open `SKILL.md`, reveal the directory, duplicate a skill, or create a new skill. The Webview should not pass absolute paths, local cache paths, or arbitrary VSCode command ids for editing.

Safe initial actions:

- `run`: invoke skill through `neko.agent.invokeSkill`.
- `edit`: open `SKILL.md` for project/personal file skills.
- `reveal`: reveal known project/personal skill directory.
- `duplicate`: copy existing project/personal skill directory to project/personal target.
- `fork`: copy a built-in or non-editable skill into project/personal `.neko/skills`.
- `create`: create a new project/personal skill template and open it.
- `rescan`: call existing `neko.agent.rescanSkills`.

### Decision 5: Dashboard UI is a catalog, not a second settings screen

Dashboard should remain a workbench overview. It should provide:

- primary catalog cards grouped by role/source;
- tag filters for topical discovery;
- source badges (`内置`, `工作区`, `用户`, `插件`);
- role badges (`编排`, `子技能`, `独立`, `命令`);
- compact child-skill rows under orchestrators;
- advanced/all toggle;
- quick action buttons for run/edit/reveal/fork.

Full resource editing, tools-ref editing, and support file authoring can remain in Agent settings or the VSCode editor.

### Decision 6: Built-in Markdown migration is incremental

The catalog change should not require converting all built-in skills to Markdown. However, future cleanup should prefer:

- `SKILL.md` or raw Markdown imports for long prompt-chain bodies;
- TypeScript for structural metadata, tool allowlists, and catalog metadata;
- shared tests to ensure Bun/esbuild/Vite can bundle raw Markdown consistently.

## Risks / Trade-offs

- [Risk] Catalog metadata becomes another workflow DSL. -> Mitigation: validate catalog fields as display/management only and reject ordered steps/stages/branches.
- [Risk] Dashboard duplicates Agent settings functionality. -> Mitigation: Dashboard only exposes quick management actions and opens VSCode editor for real editing.
- [Risk] File skill paths leak to Webview. -> Mitigation: Webview sends skill refs; Extension Host resolves known directories and validates source.
- [Risk] Duplicate skill ids confuse users. -> Mitigation: deterministic source precedence with optional advanced duplicate visibility.
- [Risk] `getSkills()` becomes async or expensive. -> Mitigation: use `SkillFileService` cache and watcher updates; keep full content lazy-loaded.
- [Risk] Existing plugin skill providers only return simple `SkillDef`. -> Mitigation: default missing catalog metadata to `standalone`, `plugin`, non-editable.

## Migration Plan

1. Add shared catalog DTOs and validation helpers.
2. Project built-in skills with default role/source/visibility/action metadata.
3. Project `.neko/skills` scan results into catalog entries without loading full content beyond existing cached scan.
4. Add safe NekoAgent skill management commands for edit/reveal/fork/create/rescan.
5. Update Dashboard protocol and UI to render grouped skill catalog and dispatch typed skill actions.
6. Add tests for projection, source precedence, Dashboard grouping/actions, and safe path handling.
7. Optionally migrate long built-in prompt strings to Markdown raw files in a follow-up cleanup.

Rollback is safe: Dashboard can fall back to the current flat `SkillDef` list. Existing `.neko/skills` files and built-in skill execution semantics remain unchanged.

## Open Questions

- Should catalog metadata live directly in `SkillManifest.catalog` or under `extensions["neko.catalog"]`?
- Should `.neko/commands` appear in the Dashboard skill area as quick actions or in a separate command palette section?
- Should built-in skill fork create only `SKILL.md`, or also a `manifest.json` preserving catalog/relationship metadata?
- Should Dashboard refresh on every skill file watcher event, or should NekoAgent expose an explicit dashboard skill changed event?
