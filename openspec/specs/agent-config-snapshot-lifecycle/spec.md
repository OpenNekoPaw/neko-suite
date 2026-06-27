# agent-config-snapshot-lifecycle Specification

## Purpose
TBD - created by archiving change stabilize-agent-config-snapshots. Update Purpose after archive.
## Requirements
### Requirement: Config reads expose explicit diagnostics

Agent configuration reads MUST distinguish a missing config file from an existing empty, invalid, or unreadable config file.

#### Scenario: Missing config file is not a parse error

- **WHEN** Agent reads a config snapshot and `~/.neko/config.toml` does not exist
- **THEN** the read result MUST identify the state as `missing`
- **AND** Agent MUST NOT create, overwrite, or normalize the config file

#### Scenario: Empty config file is reported as an error

- **WHEN** Agent reads a config snapshot and `~/.neko/config.toml` exists but has no TOML content
- **THEN** the read result MUST identify the state as `empty`
- **AND** Agent MUST surface a safe user-facing diagnostic that names the config file and asks the user to fix it before opening a new session/tab
- **AND** Agent MUST NOT replace the file with defaults

#### Scenario: Invalid TOML is reported as an error

- **WHEN** Agent reads a config snapshot and `~/.neko/config.toml` contains invalid TOML
- **THEN** the read result MUST identify the state as `invalidToml`
- **AND** Extension/platform logging MUST include the parser details
- **AND** Webview-facing diagnostics MUST avoid raw stack traces while still identifying the file and the failure category
- **AND** Agent MUST NOT fall back to default provider/API configuration

#### Scenario: Read failure is reported as an error

- **WHEN** Agent reads a config snapshot and the config file cannot be read because of permissions or IO failure
- **THEN** the read result MUST identify the state as `readError`
- **AND** Agent MUST surface a safe user-facing diagnostic
- **AND** Agent MUST NOT modify the file or parent directory

### Requirement: Config snapshots load only on session or tab open lifecycle

Agent MUST refresh file-backed provider/API configuration only when opening a new conversation session/tab or reopening an existing conversation tab.

#### Scenario: Webview mount requests initial snapshot

- **WHEN** the Agent Webview is mounted for a chat panel
- **THEN** it MUST request the current config/settings snapshot through the canonical Extension message path
- **AND** the snapshot read MUST happen once for that open lifecycle unless another new/reopen lifecycle event occurs

#### Scenario: New chat tab requests snapshot

- **WHEN** the user opens a new chat tab
- **THEN** Agent MUST request a config/settings snapshot for that new tab lifecycle
- **AND** config-dependent UI MUST reflect the snapshot or diagnostic returned for that lifecycle

#### Scenario: Reopened conversation tab requests snapshot

- **WHEN** the user reopens a persisted conversation tab or restores a tab after the panel is closed and opened again
- **THEN** Agent MUST request a config/settings snapshot for that reopened tab lifecycle
- **AND** the restored tab MUST NOT rely on stale config state from the previous panel lifetime

#### Scenario: Active session ignores external config file changes

- **WHEN** `~/.neko/config.toml` changes while an Agent session/tab is already open
- **THEN** Agent MUST NOT refresh provider/API configuration in that active session from a file watcher
- **AND** Agent MUST NOT broadcast or handle config file change messages that cause `getConfig` or `getSettings` to run automatically

### Requirement: Agent does not write user-maintained config files

VS Code Agent runtime and Webview settings flows MUST NOT create, overwrite, import into, normalize, or edit user/workspace config files automatically.

#### Scenario: Settings update does not write config

- **WHEN** the Webview sends an `updateSettings` message such as an execution mode change
- **THEN** Agent MUST update only runtime/session state or return an explicit failure
- **AND** Agent MUST NOT call config file scalar update, provider update, `writeUserConfig`, `writeWorkspaceConfig`, or default config creation paths

#### Scenario: Open config file does not overwrite existing content

- **WHEN** the user invokes the open config file action
- **THEN** Agent MAY open the user config file in VS Code
- **AND** Agent MUST NOT rewrite, normalize, or replace existing content before opening it

#### Scenario: Missing config open is user-owned

- **WHEN** the user invokes the open config file action and the config file does not exist
- **THEN** Agent MUST NOT silently create a default config file
- **AND** Agent MUST either open a user-editable untitled/template document or report that the file is missing with guidance for user-created configuration

#### Scenario: Provider credential import does not mutate config

- **WHEN** Agent starts, opens a tab, or reads a config snapshot
- **THEN** it MUST NOT import provider credentials by writing provider or API key entries back into the user config file
- **AND** any credential projection used for the current runtime MUST remain in memory

### Requirement: Config errors fail closed

Config-dependent Agent execution MUST fail closed when the active session/tab snapshot has an empty, invalid, or unreadable config diagnostic.

#### Scenario: Sending without valid provider config is rejected

- **WHEN** the user sends a message that requires a configured provider and the active snapshot has a config error
- **THEN** Agent MUST reject the action with a clear configuration diagnostic
- **AND** Agent MUST NOT proceed using default provider/API settings or stale config from another session

#### Scenario: Missing config prompts configuration without mutation

- **WHEN** the active snapshot state is `missing` and no provider/API configuration is available
- **THEN** Agent MUST show configuration guidance or onboarding state
- **AND** Agent MUST NOT create or edit the config file on the user's behalf

#### Scenario: Incomplete provider or API configuration is rejected before model lookup

- **WHEN** Agent reads a syntactically valid config snapshot with no enabled provider, no enabled chat model, or no API key for any enabled chat provider
- **THEN** Agent MUST report an explicit missing-configuration diagnostic
- **AND** Agent MUST NOT proceed to model resolution
- **AND** Agent MUST NOT report a default model such as `claude-sonnet-4-20250514` as "not found" unless that model was explicitly requested by the user-owned config or request payload

#### Scenario: Webview displays safe diagnostic state

- **WHEN** Extension sends a config diagnostic for empty, invalid, or unreadable config
- **THEN** Webview MUST display a safe actionable error
- **AND** Webview MUST keep raw parser stacks and provider secrets out of UI state

### Requirement: Legacy watch/write/fallback paths cannot mask the snapshot path

Tests and runtime wiring MUST prove that legacy config watcher, automatic write, and default fallback paths are not used for Agent snapshot loading.

#### Scenario: Watcher path is poisoned in tests

- **WHEN** focused Agent config snapshot tests poison config watcher callbacks to throw
- **THEN** opening a session/tab and reading a snapshot MUST still pass without invoking the poisoned watcher

#### Scenario: Write path is poisoned in tests

- **WHEN** focused Agent settings/config tests poison config write methods to throw
- **THEN** Webview settings updates and config snapshot reads MUST not invoke those poisoned writes

#### Scenario: Invalid config does not pass through default fallback

- **WHEN** focused Agent config tests provide invalid TOML and poison default config fallback to throw
- **THEN** the snapshot read MUST return a config diagnostic
- **AND** no success result may be produced by default provider/model fallback
