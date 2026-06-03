## Why

The current NPC/Dashboard terminology mixes three different actor relationships: the Agent playing a character, the user playing a character, and automated validation. This makes `test-npc`, `character-perspective`, `validate-character`, and `improve-character` look like peer Dashboard actions even though only two of them are core interaction modes.

This change performs a breaking migration to clear product language and contracts: core keeps **character dialogue** and **embody character**, while automated validation and character improvement move to Skills that compose core primitives.

## What Changes

- **BREAKING** Replace the user-facing `测试 NPC` / `Test NPC` entry with `角色对话` / `Character Dialogue`.
- **BREAKING** Replace the user-facing `角色视角` / `Character perspective` entry with `代入角色` / `Embody Character`.
- **BREAKING** Remove `验证角色` / `validate-character` from core Dashboard actions and core Agent commands; expose character validation through a Skill workflow instead.
- **BREAKING** Remove `完善设定` / `improve-character` from core Dashboard actions and core Agent commands; expose character improvement through a Skill workflow instead.
- **BREAKING** Rename shared action ids and command constants:
  - `test-npc` -> `character-dialogue`
  - `character-perspective` -> `embody-character`
  - remove `validate-character`
  - remove `improve-character`
  - `neko.agent.testNpc` -> `neko.agent.characterDialogue`
  - `neko.agent.characterPerspective` -> `neko.agent.embodyCharacter`
  - remove `neko.agent.validateCharacter`
  - remove `neko.agent.improveCharacter`
- **BREAKING** Rename Agent conversation projection from `npc-test` to `character-dialogue`.
- **BREAKING** Rename NPC test artifacts from `.neko/npc-tests/` to a character-role artifact namespace such as `.neko/character-tests/`.
- Keep `/as @character` as the official slash shortcut for Character Dialogue, but rename the exit command from `/exit-role` to `/exit-as`.
- Keep the no-tool roleplay/runtime isolation primitive, project-scoped profile assembly, transcript capture, evaluator/report contracts, and user-confirmed suggestion application as core primitives.
- Add Skill-facing primitive requirements so `character-validation` and `character-improvement` can compose profile assembly, headless character dialogue probes, evidence collection, evaluation, and suggestion application without becoming Dashboard core actions.

## Capabilities

### New Capabilities

- `character-role-workflows`: Defines the two core role workflows, their actor relationships, artifacts, Skill-facing primitives, and the breaking terminology migration.

### Modified Capabilities

- `dashboard-creative-entity-management`: Replace NPC workflow Dashboard actions with only `character-dialogue` and `embody-character` for character entities; remove core validation/improvement actions.
- `agent-runtime-boundaries`: Rename NPC conversation projection/runtime paths to character dialogue terminology and require validation/improvement automation to compose through Skills or narrow primitives rather than Webview-owned workflows.

## Impact

- Shared contracts: Dashboard action unions, command constants, type guards, DTO names, conversation kind literals, artifact paths, and tests in `packages/neko-types`.
- Entity/Dashboard sources: action descriptors, disabled reasons, delegation payloads, and tests in `@neko/entity` and Story-provided Dashboard sources.
- Agent extension: command registration, slash command handling, `NpcTestBenchController` naming/behavior, Webview message routing, artifact save paths, and controller tests.
- Agent runtime: character dialogue session naming, no-tool responder primitive, evaluator/projector naming, and Skill-callable headless probe APIs.
- Agent Webview: tab kind, header labels, input-area mode detection, message routing, i18n, and tests.
- Docs/OpenSpec: README, ADR, active NPC-related changes, and user-facing command documentation.
- Skills: add or update `character-validation` and `character-improvement` Skills to call core primitives and produce suggestion-only results.
