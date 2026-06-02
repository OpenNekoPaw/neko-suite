## 1. Contracts And Source Actions

- [x] 1.1 Extend shared Dashboard creative entity action ids and type guards for `character-perspective`, `validate-character`, and `improve-character`.
- [x] 1.2 Define minimal payload/result DTOs for character-scoped NPC Agent workflows using entity refs and source-owned scope refs.
- [x] 1.3 Update neutral entity and Story Dashboard sources to expose NPC operation actions only for eligible character entities.
- [x] 1.4 Add disabled reasons for unavailable Agent commands, unresolved candidates, and unsupported entity kinds.
- [x] 1.5 Add contract/source tests for action visibility, payload validation, and non-character omission.

## 2. Dashboard UX Delegation

- [x] 2.1 Add localized Dashboard labels for `test-npc`, `character-perspective`, `validate-character`, and `improve-character`.
- [x] 2.2 Render the full NPC operation set in character detail view and keep row actions compact.
- [x] 2.3 Route each NPC operation through `DashboardCreativeEntityActionRequest` without Webview importing Agent internals.
- [x] 2.4 Report action failures and disabled reasons in Dashboard without mutating entity facts.
- [x] 2.5 Add Dashboard Webview tests for action rendering and delegation.

## 3. Agent Command And Workflow Routing

- [x] 3.1 Keep `neko.agent.testNpc` as the command path for `test-npc` Dashboard actions and verify it creates `ConversationKind: 'npc-test'`.
- [x] 3.2 Add Agent command/workflow handlers for `character-perspective`, `validate-character`, and `improve-character`.
- [x] 3.3 Implement character perspective report assembly from project-scoped entity facts, occurrences, relationships, and story context.
- [x] 3.4 Implement validation report routing for completeness, knowledge-boundary, dialogue voice, relationship, and interaction-flow findings.
- [x] 3.5 Implement character improvement suggestions as pending suggestions that require explicit entity-source apply actions.

## 4. Slash Command Cleanup

- [x] 4.1 Remove `/as` from the Agent Webview visible slash command catalog, autocomplete, mention-filter prompts, and help affordances.
- [x] 4.2 Keep typed `/as @character` parser compatibility only if required for migration, and ensure it delegates to the NPC test controller rather than ordinary slash runtime.
- [x] 4.3 Add a clear guidance result for manual `/as` input if compatibility parsing is disabled.
- [x] 4.4 Update slash command handler and Webview presenter tests so `/as` is hidden while unrelated plugin slash commands remain visible.

## 5. Validation And Quality Gates

- [x] 5.1 Add tests proving `npc-test` roleplay still uses `toolPolicy: { kind: 'none' }` and does not receive project-read or authoring tools.
- [x] 5.2 Add Agent workflow tests proving NPC validation workflows may use ordinary project-read tools without granting tools to roleplay responders.
- [x] 5.3 Run targeted Agent extension tests for NPC launch, slash cleanup, and workflow routing.
- [x] 5.4 Run targeted Dashboard/entity tests for action source contracts and UI delegation.
- [x] 5.5 Run OpenSpec validation for `refine-npc-dashboard-agent-workflows` and perform Neko quality self-review.

## 6. Migration And Documentation

- [x] 6.1 Update the NPC test bench ADR or add a follow-up note that Dashboard is now the primary NPC operation entry and `/as` is hidden compatibility/debug routing.
- [x] 6.2 Document apply/archive ordering with the pending `implement-npc-character-test-bench` change so `npc-character-test-bench` spec deltas do not conflict.
- [x] 6.3 Add release or developer notes explaining the Dashboard-first NPC workflow and the deprecation/removal plan for visible `/as`.
