# Implementation Audit

This audit records the implementation facts used by tasks 1.1–1.6. It is a
change artifact, not a new runtime state owner.

## Fixed IDC call chain

The Extension runtime contributes creative-process recovery and Skill runtime
ports. `agent-session-factory.ts` currently treats the presence of Skill
registry/service/lifecycle ports as a reason to synthesize `stageTracking`.
`session-config-projection.ts` projects that into `AgentSessionConfig`, after
which `AgentSession` creates an IDC run, stage tracker, persona binding, stage
planner/dispatcher hook and stage events. This means an ordinary Agent session
can enter IDC without an explicit user request.

## Retirement classification

Delete from production:

- `IdcStage`, stage task/entry/activation contracts and the fixed creation and
  execution events that depend on them;
- stage activation matrix, planner, registry, tracker, guardian, dispatcher and
  persona binding;
- session/runtime `stageTracking`, active IDC run state, stage APIs and fixed
  creation metadata;
- runtime `Draft`, `ExecutionPlan` and staged checklist `Task` DTOs, artifact
  service/watcher/validator/index, session artifact facade and mandatory schema
  prompt;
- automatic `creation-persona`, `execution-persona` and `iteration-persona`
  builtins, their catalog/localization entries and the `stagePersona` lifecycle
  slot;
- fixed creative-process stage registries, stage transitions and stage-exit
  self-evaluation hooks.

Migrate to existing owners:

- Approval, preferences, permission/Tool traits, event/audit/step logging,
  autoheal, validation and async continuation move to ordinary session,
  conversation, turn, Tool and Task identity;
- content analysis, character/style/sound decisions and bounded repair methods
  move to owning creative Skills;
- execution discipline and output-grounded completion move to the base system
  prompt/runtime;
- real asynchronous generation and subagent execution remains owned by
  `TaskManager` and its existing WorkItem projections.

Diagnostic/test-only:

- old persisted stage/persona/checkpoint records may be recognized only to
  return an explicit retired-state diagnostic; they must not be restored;
- architecture guards and focused evaluations poison retired entry points;
  direct IDC success fixtures are deleted.

User-authored Markdown, Skill files, generated assets, `.nk*` projects,
preferences, settings and trust state are preserved. Runtime artifact indexes,
run-to-artifact maps and stage/persona/checkpoint state have no project-fact
value and may be rejected or rebuilt without deleting visible files.

## General-service coupling

The `AgentSession` `stageTracking` branch currently owns EventBus creation,
workspace event/audit/step sinks, ApprovalEngine, preferences loading,
autoheal, artifact watcher startup and the ReAct hook that installs validation
hooks. Validation can be constructed without IDC, but its factory still
receives stage/event ports and its hooks are not installed without the stage
runner. Tool traits and permission hooks already initialize independently.
Task result observation, journal persistence, pending-message delivery and
Extension continuation are already generic and must not be removed.

## Plan Mode audit

`builtin-prompts.ts` currently describes a software architect that explains
what/why rather than executable how. Permission reminders separately copy
`EnterPlanMode`/`ExitPlanMode`, `TodoRead` and privileged `.neko/plan.md`
protocols that have no matching canonical Tool implementation. Plan mode also
injects fixed creation metadata and can therefore activate IDC.

`executionMode: auto | ask | plan` is the single canonical mode. The separate
conversation `promptMode`, plan-card approval dispatch and Webview/TUI
“execute plan” actions are parallel state/command paths: they switch mode and
re-submit prose without binding or re-reading current content. They are removed
in favour of ordinary Markdown review, conversation approval and current Tool
resolution. Read-only external, protected or cost-bearing analysis still uses
real trust/cost/Approval policy; Tool-name heuristics do not grant permission.

## Progress/TODO audit

`TaskManager -> WorkItem -> TaskCard/TUI tasks` is the canonical owner for real
asynchronous work and results. The IDC checklist-to-TaskManager projection is a
snapshot bridge and is deleted rather than renamed to TODO. A near-term TODO is
ordinary assistant/Markdown display state with `pending`, `in_progress`,
`completed` and `blocked`, with at most one `in_progress`. It may be rebuilt or
deleted without changing execution. Actual output/progress remains in Tool and
Task results, generated files and owning projects.

No `TodoManager`, `PlanProgressStore`, TODO protocol action or orchestration
page is required. A future rich TODO view may only be a pure projection of the
current conversation/Markdown; it cannot become a persistence or execution
owner.

## Overlap audit

Existing user changes overlap `agent-types/src/index.ts`, Agent capability
planning files, architecture guards, session types/tests, capability runtime,
Skill localization and Webview projection. Implementation must use incremental
patches and must not reset or replace those changes. Capability-planning
projection work is not an IDC replacement and is not made the canonical plan
runtime by this change.
