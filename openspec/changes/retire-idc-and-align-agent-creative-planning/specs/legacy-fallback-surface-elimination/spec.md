## ADDED Requirements

### Requirement: IDC staged-creation compatibility success is eliminated
Production code SHALL remove or fail-close legacy IDC run, fixed stage, stage persona, Draft/ExecutionPlan/Task runtime, and related start/resume/restore/transition paths after the Agent-native conversation, planning, Approval, Task, and Tool paths are available. No compatibility adapter, alias, fallback branch, persisted-state restore, or test fixture MAY return successful staged-creation behavior for a new request.

#### Scenario: Retired stage API is called
- **WHEN** production or test code calls a removed IDC stage planner, tracker, persona binding, run restore, or execution-artifact API for a new Agent request
- **THEN** the call SHALL fail with an explicit retired-path diagnostic or test poison
- **AND** it SHALL NOT route the request through another IDC or workflow compatibility adapter

#### Scenario: New Agent path excludes legacy fixtures
- **WHEN** tests validate content analysis, creator approval, Plan Mode, TODO progress, approved execution, recovery, or async continuation
- **THEN** they SHALL assert the canonical session/turn, document, Approval, Tool/Task, and output paths were used
- **AND** legacy IDC fixtures, stage events, persona records, or Draft/ExecutionPlan state SHALL NOT satisfy the test

### Requirement: Retained IDC terminology is classified and time-bounded
Any IDC or fixed-stage term that temporarily remains outside deleted production execution SHALL be classified as documentation history, migration diagnostic, or test poison with an owner and removal condition. Unclassified production IDC/stage terminology SHALL fail legacy-debt review.

#### Scenario: Repository cleanup still finds IDC terminology
- **WHEN** legacy-debt or repository searches find IDC run/stage/persona terms after migration
- **THEN** each retained occurrence SHALL be non-executable and documented with its migration purpose and removal condition
- **AND** production occurrences that can influence Agent behavior or return success SHALL fail the quality gate
