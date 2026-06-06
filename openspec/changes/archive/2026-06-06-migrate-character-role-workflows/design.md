## Context

The completed NPC test bench work introduced strong primitives: project-scoped profile assembly, no-tool roleplay sessions, transcript/evaluation artifacts, and suggestion write-back with user confirmation. Later Dashboard workflow work expanded the surface to `test-npc`, `character-perspective`, `validate-character`, and `improve-character`.

The product language now conflates distinct actor relationships:

```text
Character Dialogue: Agent plays character, user tests.
Embody Character:   User plays character, Agent provides character knowledge feedback.
Validation Skill:   One Agent plays character, another Agent tests it automatically.
Improvement Skill:  Agent proposes authoring improvements from evidence.
```

Only the first two are stable interaction modes that belong in the core Dashboard detail surface. Validation and improvement are automation strategies whose prompts, scoring, scope, and evidence policy will evolve through Skills.

Five-layer analysis:

- Responsibilities: shared contracts own action ids and DTOs; Dashboard owns entity action presentation; Agent extension owns command dispatch and session lifecycle; Agent/runtime owns no-tool character dialogue primitives; Skills own validation/improvement strategy composition.
- Dependencies: Dashboard Webview continues to send typed action DTOs only. Skills call narrow Agent/extension/runtime primitives and MUST NOT import Dashboard UI implementation or mutate entity stores directly.
- Interfaces: the migration is intentionally breaking. Old `test-npc`, `character-perspective`, `validate-character`, and `improve-character` ids are removed rather than aliased.
- Extension: future character automation grows through Skills or explicit primitive ports, not through more Dashboard first-level actions.
- Testing: contract tests prove old ids are rejected; route tests prove the two core actions delegate correctly; Skill primitive tests prove validation/improvement can still run without Dashboard core buttons.

## Goals / Non-Goals

**Goals:**

- Establish `角色对话` / `character-dialogue` and `代入角色` / `embody-character` as the only core character role workflow actions.
- Remove old NPC-centric action ids, command ids, conversation kind literals, and artifact path names in one implementation change.
- Keep `/as` as the official Character Dialogue shortcut while renaming exit to `/exit-as`.
- Move `角色验证` and `完善角色` to Skills that compose core primitives.
- Preserve roleplay tool isolation: Character Dialogue sessions still receive no creative authoring tools.
- Preserve project-scoped context and artifact storage.
- Preserve suggestion-only write-back with explicit user confirmation.

**Non-Goals:**

- Supporting backwards compatibility for old action ids, command ids, slash commands, or artifact directories.
- Keeping `validate-character` or `improve-character` as Dashboard core actions.
- Turning ordinary Agent chat into a persistent character persona.
- Granting project-read or authoring tools to the character dialogue responder.
- Implementing every validation/improvement Skill prompt in this change beyond enough contracts or stubs to prove integration.
- Migrating historical `.neko/npc-tests/*.json` files automatically.

## Decisions

### 1. Use actor-relationship terminology as the source of truth

The core terms are defined by who is playing the character:

- Character Dialogue: Agent plays the character and the user tests it.
- Embody Character: user plays the character and Agent answers as a project-aware knowledge coach.

Follow-up correction: OpenSpec change `isolate-embody-character-runtime` supersedes the earlier implementation assumption that Embody Character should run as an ordinary Agent workflow. Embody Character now reuses the role-session shell with a read-only feedback capability policy and no creative Skill/tool surface.

All public labels, command names, test names, and new function names should follow this model.

Alternative considered: keep `NPC` in internal names and only change UI labels. Rejected because it would preserve the same conceptual ambiguity in tests, type names, and future extension points.

### 2. Make the migration breaking instead of alias-based

Old identifiers are removed from type unions and command registration. Requests using old ids fail type guards and action validation.

Alternative considered: keep old ids as legacy aliases. Rejected because the user explicitly wants a one-time migration and because aliases would keep old semantics alive in Dashboard sources, commands, and docs.

### 3. Keep core Dashboard actions minimal

Dashboard character detail exposes only:

- `character-dialogue`
- `embody-character`

Validation and improvement appear through Skill discovery, command palette, or a future "More Skills" surface, not as first-level source actions.

Alternative considered: keep validation and improvement as Dashboard actions that invoke Skills. Rejected because this still makes them look like core product modes and keeps the action list crowded.

### 4. Expose primitives for Skills, not workflows for Dashboard

Core should keep reusable primitives:

- assemble character profile
- collect project-scoped character evidence
- run no-tool character dialogue turns or headless probes
- evaluate transcript/report
- save project-local artifact
- apply suggestions only after confirmation

Skills such as `character-validation` and `character-improvement` compose those primitives into strategies. The primitive API should be narrow and host-safe; Skills must not rely on Webview state or Dashboard UI internals.

Alternative considered: implement validation as a second controller method owned by Dashboard action routing. Rejected because validation strategy is expected to vary more quickly than core role interaction.

### 5. Rename artifacts but do not migrate historical files

New artifacts use `.neko/character-tests/`. Old `.neko/npc-tests/` files remain historical artifacts and are not automatically rewritten.

Alternative considered: migrate old files in-place. Rejected because these are evidence artifacts, not source-of-truth data, and rewriting them may harm reproducibility.

## Risks / Trade-offs

- Breaking contracts may fail unupdated feature packages -> mitigate with full-repo `rg` gates and contract tests that reject old ids.
- Existing completed OpenSpec changes conflict with this direction -> mitigate by marking this change as the superseding migration and updating ADR/OpenSpec docs during implementation.
- Skill migration could leave users without a visible validation entry -> mitigate by documenting Skill invocation and optionally adding a non-core "More Skills" affordance separately.
- Renaming `Npc*` types broadly can create noisy diffs -> mitigate by batching commits by layer and avoiding unrelated refactors.
- Artifact path rename can hide prior evidence from new UI -> mitigate by documenting that historical `.neko/npc-tests/` remains readable only as legacy evidence if a viewer exists, not as active save target.

## Migration Plan

1. Update shared contracts first: action ids, workflow action union, command constants, slash constants, conversation kind literals, artifact path constants, and type guards.
2. Update Agent runtime names and exports for character dialogue sessions, no-tool responder primitives, prompt/evaluator projection, and Skill-facing primitive ports.
3. Update Agent extension command registration and slash handling: register `neko.agent.characterDialogue`, `neko.agent.embodyCharacter`, `/as`, and `/exit-as`; remove old commands.
4. Update Dashboard/entity sources to expose only `character-dialogue` and `embody-character` for character entities.
5. Update Agent Webview tab kind, header labels, input-area conditions, and event routes from `npc-test` to `character-dialogue`.
6. Add or update Skills for `character-validation` and `character-improvement` to call core primitives or clearly document pending primitive integration.
7. Update README, ADR, and OpenSpec docs to remove the old terminology except in migration notes.
8. Run targeted contract/runtime/extension/webview/entity tests, then run repo quality checks as feasible.

Rollback is not alias-based. If implementation cannot complete, revert the migration branch or keep the old committed state; do not ship a partial state where old and new ids both exist.

## Open Questions

- Resolved: new active artifact saves use `.neko/character-tests/`.
- Resolved: `character-validation` and `character-improvement` Skills live in this repo and compose Agent-owned primitive ports.
- Deferred: shared schema-history DTO names such as `NpcProfileSource`, `NpcTranscriptArtifact`, and `NpcEvaluationReport` remain for now. Public action ids, command ids, slash commands, Webview conversation kind, Webview session projection fields, controller/runtime facade names, prompt/evaluator exports, and artifact paths have migrated to character role terminology. A future schema migration may rename these DTOs if archived specs and downstream packages are ready.
