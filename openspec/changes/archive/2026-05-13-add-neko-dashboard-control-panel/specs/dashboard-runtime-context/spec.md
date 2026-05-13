## ADDED Requirements

### Requirement: Runtime context strip
The Dashboard SHALL provide a compact runtime context strip in Work Mode that summarizes environment and capability state such as engine readiness, agent sessions/providers, skill count, and asset summary. The context strip MUST be informational and MUST NOT own the underlying domains.

#### Scenario: Context strip loads status
- **WHEN** the Dashboard opens in Work Mode
- **THEN** it displays available runtime summary values returned by programmatic source commands

#### Scenario: Missing status source
- **WHEN** a runtime status command is not registered
- **THEN** the Dashboard shows the corresponding source as unavailable or omitted without failing the panel

### Requirement: Programmatic status commands only
The Dashboard SHALL call only non-interactive programmatic commands for runtime summaries. It MUST NOT call interactive commands that display QuickPick, dialogs, editors, or other UI as part of status loading.

#### Scenario: Engine status loaded silently
- **WHEN** Dashboard requests engine status
- **THEN** it calls `neko.engine.getStatus` or equivalent silent command and does not open an interactive engine status UI

#### Scenario: Asset summary loaded silently
- **WHEN** Dashboard requests asset summary
- **THEN** it calls `neko.assets.getSummary` or equivalent silent command and renders returned counts if available

### Requirement: Static versus dynamic update strategy
The Dashboard SHALL treat stable environment state as read-once with manual refresh and SHALL treat task progress as event-driven. It MUST NOT poll stable environment status continuously.

#### Scenario: Environment read once
- **WHEN** the Dashboard opens
- **THEN** it reads engine, agent session, provider, and asset summary state once for the initial context strip

#### Scenario: Manual refresh
- **WHEN** the user activates Dashboard refresh
- **THEN** the Dashboard re-reads project data and runtime context summaries

#### Scenario: No environment polling
- **WHEN** the Dashboard remains open after initial load
- **THEN** it does not continuously poll engine or agent status commands for stable environment values

### Requirement: Quick actions delegate to owner commands
The Dashboard SHALL provide quick actions for common navigation and creation workflows. Quick actions MUST delegate to the owning extension or shared creation command and MUST NOT create or mutate domain project content directly in Webview code.

#### Scenario: Create new video project
- **WHEN** the user selects a New Video Project quick action
- **THEN** the Extension Host delegates project creation to the owning command or shared project creation service

#### Scenario: Open agent panel
- **WHEN** the user selects an Agent-related quick action
- **THEN** the Extension Host invokes the owning agent command instead of importing agent UI code

### Requirement: Skill and provider display boundaries
The Dashboard SHALL display only high-level skill and provider availability. It MUST NOT display skill prompt internals, provider configuration forms, or skill activation controls.

#### Scenario: Work Mode skill summary
- **WHEN** skill summary data is available in Work Mode
- **THEN** the ContextStrip shows a compact skill count and active provider names

#### Scenario: Configuration excluded
- **WHEN** provider or skill configuration details exist
- **THEN** Dashboard links or delegates to the owning settings surface rather than rendering editable configuration

### Requirement: Future account and cloud slots
The Dashboard SHALL reserve integration slots for account, sync, and quota status while keeping those features hidden until source commands or APIs are available. Dashboard MUST NOT manage authentication or cloud sync flows directly.

#### Scenario: Auth status available
- **WHEN** `neko.auth.getStatus` becomes available
- **THEN** the Dashboard may display AccountBadge state and delegate login or refresh actions to the auth extension

#### Scenario: Sync status unavailable
- **WHEN** cloud sync APIs are not available
- **THEN** SyncStatus and QuotaIndicator remain hidden or unavailable without layout failure

#### Scenario: Cloud action delegated
- **WHEN** the user interacts with an account, sync, or quota status action
- **THEN** Dashboard delegates to the responsible extension or backend command rather than executing auth or sync logic itself
