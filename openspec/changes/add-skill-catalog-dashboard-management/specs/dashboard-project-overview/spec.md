## ADDED Requirements

### Requirement: Dashboard skill catalog surface
The Dashboard SHALL present Agent skills as a structured catalog that supports role grouping, source visibility, tag filtering, and safe skill actions.

#### Scenario: Orchestrator card shows focused skills
- **WHEN** the skill catalog contains an orchestrator with associated focused sub-skills
- **THEN** Dashboard SHALL render the orchestrator as a primary entry and show its focused sub-skills as child rows or an expandable group rather than as unrelated primary cards

#### Scenario: Advanced view shows all visible entries
- **WHEN** the user enables the advanced or all-skills view
- **THEN** Dashboard SHALL show advanced catalog entries including focused sub-skills and non-primary duplicates when those entries are not hidden

#### Scenario: Skill tags remain topical filters
- **WHEN** the user filters by a tag such as `漫画`, `分镜`, `Cut`, or `导出`
- **THEN** Dashboard SHALL filter catalog entries by projected tags without using tags to infer hierarchy or editability

### Requirement: Dashboard skill source and role indicators
The Dashboard SHALL show projected source and role metadata so users can distinguish built-in skills, workspace skills, user skills, plugin skills, orchestrators, focused sub-skills, standalone skills, quick actions, and hidden/internal entries where visible.

#### Scenario: Workspace skill is marked editable
- **WHEN** a projected skill has source `project` and editable true
- **THEN** Dashboard SHALL display a workspace/source indicator and an edit action for that skill

#### Scenario: Built-in skill is marked non-editable
- **WHEN** a projected skill has source `builtin` and editable false
- **THEN** Dashboard SHALL show it as built-in and SHALL NOT offer direct edit; it MAY offer fork/copy when the projection declares that action

### Requirement: Dashboard dispatches typed skill actions
The Dashboard Webview SHALL dispatch typed skill action requests to the Extension Host and SHALL NOT send raw local file paths for skill editing or revealing.

#### Scenario: Run skill action
- **WHEN** the user activates Run on a skill catalog entry
- **THEN** Dashboard SHALL send a typed run action or invoke the safe skill command with the projected skill id

#### Scenario: Edit skill action
- **WHEN** the user activates Edit on an editable skill catalog entry
- **THEN** Dashboard SHALL send the skill id, source, extension id, and action id to the Extension Host without including an absolute path

#### Scenario: Create skill action
- **WHEN** the user activates New Skill from Dashboard
- **THEN** Dashboard SHALL request the Extension Host to create a project or personal skill template and open the created `SKILL.md`

### Requirement: Dashboard reacts to skill catalog updates
The Dashboard SHALL refresh its skill catalog when Agent skill files or provider skill metadata change.

#### Scenario: Skill file created while Dashboard is open
- **WHEN** a new `.neko/skills/<name>/SKILL.md` file is created while Dashboard is open
- **THEN** Dashboard SHALL update the catalog after the Agent skill watcher/rescan reports the change

#### Scenario: Skill deleted while Dashboard is open
- **WHEN** an editable skill is deleted while Dashboard is open
- **THEN** Dashboard SHALL remove or mark the stale catalog entry without leaving an action button that targets the deleted file
