## ADDED Requirements

### Requirement: Dashboard command and startup behavior
The system SHALL provide a `neko.dashboard.show` command that opens the Dashboard as a VSCode WebviewPanel without requiring a project file. The system MUST NOT auto-open the Dashboard on workspace startup unless `neko.dashboard.showOnStartup` is enabled and the workspace contains `.neko/` or at least one supported `.nk*` file.

#### Scenario: User opens Dashboard from command palette
- **WHEN** the user runs `Neko: Show Dashboard`
- **THEN** the system opens or reveals the Dashboard WebviewPanel

#### Scenario: Startup auto-show disabled by default
- **WHEN** a workspace opens with `.neko/` or `.nk*` files and `neko.dashboard.showOnStartup` is unset
- **THEN** the system does not automatically open the Dashboard

#### Scenario: Startup auto-show enabled with workspace evidence
- **WHEN** a workspace opens with `.neko/` or `.nk*` files and `neko.dashboard.showOnStartup` is true
- **THEN** the system opens the Dashboard without requiring a project file

### Requirement: Workspace project discovery
The system SHALL scan workspace folders for supported Neko project files and produce project rows with workspace-relative paths, file type, last modified time, and size. The scanner MUST ignore `node_modules`, `.git`, and `.neko/.cache`.

#### Scenario: Mixed project files discovered
- **WHEN** the workspace contains `.nkv`, `.nkc`, `.nks`, `.nka`, `.nkm`, and `.nkp` files
- **THEN** the ProjectTable lists each supported file with a workspace-relative path and mapped project type

#### Scenario: Excluded folders ignored
- **WHEN** supported file extensions appear under `node_modules`, `.git`, or `.neko/.cache`
- **THEN** the ProjectTable does not include those files

#### Scenario: Multi-root workspace
- **WHEN** a VSCode workspace contains multiple workspace folders with supported Neko project files
- **THEN** the scanner reports files from each workspace folder without using absolute paths in webview state

### Requirement: Table-centric project view
The Dashboard SHALL use a table as the primary project overview surface. The ProjectTable MUST support sorting by name, type, last modified time, and size, plus text search and type filtering.

#### Scenario: Sort by last modified
- **WHEN** the user sorts the ProjectTable by last modified time
- **THEN** project rows reorder by file modification timestamp

#### Scenario: Filter by project type
- **WHEN** the user filters the ProjectTable to video and canvas files
- **THEN** the table shows `.nkv` and `.nkc` rows and hides other supported project types

#### Scenario: Search by name or path
- **WHEN** the user enters a search query matching a project filename or relative path
- **THEN** the table shows only matching project rows

### Requirement: Recent activity overview
The Dashboard SHALL show a recent activity surface that helps the user resume work. P0 MUST show the five most-recently-modified supported `.nk*` files and MUST handle missing or deleted files without crashing.

#### Scenario: Recent files shown on open
- **WHEN** the Dashboard opens in a workspace with more than five supported project files
- **THEN** RecentActivity shows the five files with the newest modification times

#### Scenario: Deleted file ignored
- **WHEN** a file selected for recent activity is deleted before metadata is rendered
- **THEN** the Dashboard skips or marks that row without throwing an unhandled error

### Requirement: Welcome and Work modes
The Dashboard SHALL enter Welcome Mode when no supported `.nk*` files are found and Work Mode when at least one supported `.nk*` file is found. P0 Welcome Mode MUST include quick project creation and provider readiness only.

#### Scenario: Empty creative workspace
- **WHEN** the workspace has no supported `.nk*` files
- **THEN** the Dashboard renders Welcome Mode with Quick Start actions and Provider Status

#### Scenario: Existing creative workspace
- **WHEN** the workspace has at least one supported `.nk*` file
- **THEN** the Dashboard renders Work Mode with ProjectTable, RecentActivity, and available operational sections

### Requirement: Safe project navigation
The Dashboard SHALL navigate to project files through Extension Host commands. Webview-originating navigation requests MUST be validated so absolute paths or paths outside the workspace are rejected.

#### Scenario: Open valid project row
- **WHEN** the user activates Open on a ProjectTable row with a workspace-relative path
- **THEN** the Extension Host opens the file through the appropriate VSCode/editor command

#### Scenario: Reject unsafe webview path
- **WHEN** the Webview sends an `openProject` message with an absolute path or out-of-workspace traversal
- **THEN** the Extension Host rejects the request and does not open the file
