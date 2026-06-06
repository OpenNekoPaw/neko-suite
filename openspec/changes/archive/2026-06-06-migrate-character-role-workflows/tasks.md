## 1. Shared Contracts

- [x] 1.1 Rename shared Dashboard action ids from `test-npc` and `character-perspective` to `character-dialogue` and `embody-character`.
- [x] 1.2 Remove `validate-character` and `improve-character` from core Dashboard action unions, workflow action unions, constants, and type guards.
- [x] 1.3 Rename Agent command constants to `neko.agent.characterDialogue` and `neko.agent.embodyCharacter`; remove validation/improvement core command constants.
- [x] 1.4 Rename slash constants from `/exit-role` to `/exit-as` while keeping `/as` as the official Character Dialogue shortcut.
- [x] 1.5 Rename conversation kind and tab projection contracts from `npc-test` to `character-dialogue`.
- [x] 1.6 Rename artifact path/schema constants from NPC test terminology to character-role terminology and select the final new directory name.
- [x] 1.7 Update shared contract tests to accept only new ids and reject old ids.

## 2. Runtime And Domain Primitives

- [x] 2.1 Rename NPC dialogue runtime types, session facade, prompt projector exports, and evaluator exports to character dialogue / character role terminology.
- [x] 2.2 Preserve no-tool runtime behavior for Character Dialogue and update tests proving the responder receives an empty tool registry.
- [x] 2.3 Rename profile/transcript/report DTO usage where practical, or document any intentionally deferred `Npc*` internal names in the design follow-up notes.
- [x] 2.4 Add or expose narrow primitive ports for Skills: assemble profile, collect evidence, run headless dialogue probes, evaluate transcript, save artifact, and apply suggestions with confirmation.
- [x] 2.5 Update runtime and projector tests for Character Dialogue and Skill primitive naming.

## 3. Agent Extension

- [x] 3.1 Rename `NpcTestBenchController` and related launch/exit result types to character dialogue / role workflow terminology.
- [x] 3.2 Register `neko.agent.characterDialogue` and route it to the isolated Character Dialogue launch path.
- [x] 3.3 Register `neko.agent.embodyCharacter` and route it to an isolated feedback session where the user embodies the character and Agent provides project-aware feedback.
- [x] 3.4 Remove public registration for `neko.agent.testNpc`, `neko.agent.characterPerspective`, `neko.agent.validateCharacter`, and `neko.agent.improveCharacter`.
- [x] 3.5 Update slash command parsing and dispatch to use `/as` and `/exit-as`; remove `/exit-role`.
- [x] 3.6 Update transcript evaluation and save logic to write the new character-role artifact path.
- [x] 3.7 Update extension command, slash handler, router, and controller tests for the new command/action names and removed legacy ids.

## 4. Dashboard And Entity Sources

- [x] 4.1 Update neutral entity Dashboard source capabilities and action descriptors to expose `character-dialogue` and `embody-character` only.
- [x] 4.2 Remove `validate-character` and `improve-character` from Dashboard source capabilities, descriptors, delegation, and tests.
- [x] 4.3 Update Story or other creative entity sources that emit character NPC actions to the new core action ids.
- [x] 4.4 Update Dashboard action delegation payloads so `character-dialogue` invokes `neko.agent.characterDialogue`.
- [x] 4.5 Update Dashboard action delegation payloads so `embody-character` invokes `neko.agent.embodyCharacter` and does not create a Character Dialogue tab.
- [x] 4.6 Update Dashboard i18n labels to `角色对话` / `Character Dialogue` and `代入角色` / `Embody Character`.
- [x] 4.7 Update Dashboard/entity tests to prove old action ids are no longer surfaced.

## 5. Agent Webview

- [x] 5.1 Rename Webview conversation kind checks from `npc-test` to `character-dialogue`.
- [x] 5.2 Rename NPC session header/component labels and i18n text to Character Dialogue terminology.
- [x] 5.3 Update input-area presenter logic so Character Dialogue still hides model/mode/media generation controls.
- [x] 5.4 Update Webview message routing, tab state, exit events, and tests for `character-dialogue` and `/exit-as`.

## 6. Skills

- [x] 6.1 Add or update a `character-validation` Skill that describes automated dual-Agent validation using core primitives.
- [x] 6.2 Add or update a `character-improvement` Skill that proposes character setting improvements as user-confirmed suggestions.
- [x] 6.3 Ensure Skills do not import Dashboard Webview modules or mutate entity facts directly.
- [x] 6.4 Add lightweight Skill documentation or tests showing how validation/improvement compose the primitive ports.

## 7. Documentation And Migration Cleanup

- [x] 7.1 Update `README_CN.md` and any English README sections describing Dashboard character actions, `/as`, `/exit-as`, artifacts, and Skill workflows.
- [x] 7.2 Update `docs/architecture/adr-npc-character-test-bench.md` or create a superseding ADR section documenting the terminology migration.
- [x] 7.3 Update or supersede OpenSpec artifacts that still promote Dashboard `validate-character` and `improve-character` as core actions.
- [x] 7.4 Run full-repo searches for old public identifiers and remove them outside explicit migration notes.
- [x] 7.5 Document that existing `.neko/npc-tests/` artifacts are historical evidence and are not rewritten by this migration.

## 8. Validation

- [x] 8.1 Run targeted shared contract tests for Dashboard creative entity and character role workflow DTOs.
- [x] 8.2 Run targeted entity/Dashboard source tests for action visibility and command delegation.
- [x] 8.3 Run targeted Agent extension tests for command registration, slash handling, routing, controller launch/exit, and artifact saves.
- [x] 8.4 Run targeted Agent Webview tests for Character Dialogue rendering and input controls.
- [x] 8.5 Run the Neko quality self-review gate for this non-trivial cross-module migration.
- [x] 8.6 Run `pnpm check` or record any pre-existing unrelated failures with concrete file references.
