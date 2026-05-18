## ADDED Requirements

### Requirement: Dashboard Work Mode Includes Semantic Entity Management
Dashboard Work Mode SHALL include a project semantic management section for Creative Entities while preserving the existing separation between project overview, runtime context, task monitoring, and owning extension workflows.

#### Scenario: Creative Entities section available in Work Mode
- **WHEN** Dashboard opens in Work Mode
- **THEN** the user can navigate to a Creative Entities section without opening Story or Assets-specific panels first

#### Scenario: Welcome Mode does not require entity source
- **WHEN** Dashboard opens in Welcome Mode with no project evidence or entity source
- **THEN** the absence of creative entities does not block quick start, provider readiness, or project creation actions

### Requirement: Dashboard Delegates Entity Domain Operations
Dashboard SHALL display high-level entity management state and delegate domain operations such as entity confirmation, asset binding, asset import, generation, metadata sync, and representation package inspection to owning sources or commands.

#### Scenario: Entity action routed through host
- **WHEN** the user activates an entity action from Dashboard Webview
- **THEN** Dashboard Extension Host validates the request and delegates it to a source or command rather than executing domain writes in Webview code

#### Scenario: Assets operation delegated
- **WHEN** an entity action requires asset selection, asset import, or asset metadata update
- **THEN** Dashboard delegates that operation to Assets or a source adapter that owns the asset mutation

### Requirement: Dashboard Semantic State Uses Manual Refresh And Source Events
Dashboard SHALL load semantic entity state on open and manual refresh, and MAY update it from source events. It MUST NOT continuously poll stable entity sources.

#### Scenario: Manual refresh reloads entities
- **WHEN** the user activates Dashboard refresh
- **THEN** Dashboard reloads project overview, runtime context, tasks, and creative entity snapshots

#### Scenario: No continuous semantic polling
- **WHEN** Dashboard remains open after initial load
- **THEN** it does not continuously poll entity source commands for stable semantic state
