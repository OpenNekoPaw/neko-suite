## Why

Dashboard creative entity rows now provide a natural place to operate on characters, while `/as` in the Agent Webview behaves like a context switch into a separate NPC session rather than a command inside the current Agent conversation. Keeping `/as` as a visible slash command makes the Agent input surface carry a workflow that cannot be cleanly embedded in chat history or tool execution.

At the same time, Agent still needs NPC-related capabilities for interactive story and game validation: building a character knowledge snapshot, checking whether a character leaks future facts, stress-testing dialogue flows, and helping authors complete sparse character design.

## What Changes

- Make Dashboard the primary user-facing entry for character-centered NPC operations:
  - `test-npc`: start isolated roleplay testing with runtime tools disabled.
  - `character-perspective`: inspect what the character knows, believes, misunderstands, and should not know at a selected story scope.
  - `validate-character`: run validation checks against profile completeness, knowledge boundaries, dialogue voice, and interaction paths.
  - `improve-character`: produce suggested profile/design improvements without directly mutating entity facts.
- Remove `/as` from the visible Agent Webview slash command catalog and help affordances.
- Keep the underlying Agent-owned command path, especially `neko.agent.testNpc`, so Dashboard and extension integrations can launch NPC tests without importing Agent internals.
- Keep optional backwards-compatible typed `/as @character` handling as a hidden/debug migration path only if implementation needs a short transition; it MUST NOT be presented as the normal UX.
- Add Agent workflow requirements for NPC analysis and validation that run in ordinary Agent context with project-read tools as needed, separate from no-tool NPC roleplay sessions.
- Preserve the existing rule that NPC roleplay tests are represented as `ConversationKind: 'npc-test'`, not as a new media `SessionMode`.

## Capabilities

### New Capabilities

- `npc-agent-workflows`: Defines Agent workflows for character perspective analysis, character validation, interaction-flow NPC checks, and character improvement suggestions.
- `npc-character-test-bench`: Defines the Dashboard-first launch surface and hidden `/as` compatibility posture for isolated NPC roleplay testing. This refines the pending `implement-npc-character-test-bench` change; if that change is archived first, convert this capability delta to a modified requirement before archive.

### Modified Capabilities

- `dashboard-creative-entity-management`: Promote Dashboard character entity actions from only `test-npc` to the full NPC operation surface while preserving delegated source/action ownership.
- `agent-runtime-boundaries`: Clarify that the Agent Webview slash command catalog must not expose NPC roleplay context switches as normal chat commands, while Agent runtime may still provide tool-enabled NPC validation workflows.

## Impact

- Shared contracts: extend Dashboard creative entity action ids and payload/result shapes for `character-perspective`, `validate-character`, and `improve-character`; keep `test-npc` mapped to `NpcTestBenchLaunchRequest`.
- Dashboard Webview/extension: add localized character action labels and delegate actions through existing `DashboardCreativeEntityActionRequest` source/host handling.
- Agent extension: remove `/as` from slash command suggestions/help, keep or deprecate parser handling behind compatibility, and continue to own `neko.agent.testNpc`.
- Agent runtime/tools: add or expose project-scoped NPC analysis/validation workflow entry points that may read project context but do not mutate entity facts without confirmation.
- Tests: update slash command catalog tests, Dashboard action contract tests, NPC launch routing tests, and add focused tests for character perspective/validation/improvement routing.
