## ADDED Requirements

### Requirement: Dashboard exposes NPC test action for character entities
Dashboard SHALL expose a `test-npc` creative entity action for confirmed or candidate character entities when an Agent NPC test launch path is available. The action MUST be delegated through shared Dashboard action contracts and host commands rather than Dashboard Webview importing Agent internals.

#### Scenario: Character row shows NPC test action
- **WHEN** Dashboard renders a character entity row or detail whose source supports NPC testing
- **THEN** the row or detail action list includes `test-npc` with a localized label

#### Scenario: Non-character row omits NPC action
- **WHEN** Dashboard renders an entity kind that cannot be tested as an NPC
- **THEN** the source omits or disables `test-npc` with a reason

#### Scenario: Webview delegates action
- **WHEN** the user clicks the NPC test action in Dashboard
- **THEN** Webview sends a `DashboardCreativeEntityActionRequest` and does not call Agent runtime APIs directly

### Requirement: Dashboard NPC test action launches Agent-owned controller
Dashboard SHALL delegate `test-npc` to the owning source or extension host, which SHALL invoke `neko.agent.testNpc` with an `NpcTestBenchLaunchRequest`. The Agent extension owns NPC profile assembly, session creation, and UI focus.

#### Scenario: Source maps entity ref to launch request
- **WHEN** Dashboard action handling receives `test-npc` for a valid entity ref
- **THEN** the owning source or host adapter converts it into an `NpcTestBenchLaunchRequest` with entity ref, source, and project scope

#### Scenario: Agent panel receives focus
- **WHEN** `neko.agent.testNpc` is invoked from Dashboard
- **THEN** the Agent panel is focused and the NPC test bench controller starts or reports a validation error

#### Scenario: Dashboard does not assemble profile
- **WHEN** Dashboard delegates `test-npc`
- **THEN** Dashboard does not read entity stores, assemble NPC prompts, create SubAgents, or persist NPC transcript artifacts
