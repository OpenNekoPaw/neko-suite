## ADDED Requirements

### Requirement: Canonical CI command parity
The repository SHALL expose canonical build, coverage test, and quality commands that are used by both local full CI and GitHub pull-request CI.

#### Scenario: Developer runs full local CI
- **WHEN** a developer runs the documented full local CI command
- **THEN** it MUST invoke the same canonical build, coverage, test, and quality commands used by pull-request CI
- **AND** any faster command MUST be named and documented as a non-equivalent fast check.

### Requirement: Pull-request gates cannot be skipped by test configuration changes
TypeScript build, test, and quality jobs SHALL start for every pull request that can affect repository execution or validation, including root and package-level test/build configuration.

#### Scenario: Test infrastructure config changes
- **WHEN** a pull request changes a package Vitest config, shared coverage config, TypeScript config, workspace config, ESLint config, Knip config, dependency-cruiser config, workflow, quality input, script, package manifest, or lockfile
- **THEN** the TypeScript build, test, and quality jobs MUST run
- **AND** change detection MUST NOT silently classify the pull request as requiring no TypeScript validation.

### Requirement: Production source is explicitly included in coverage
Every source-bearing TypeScript workspace with tests SHALL use the shared coverage contract and explicitly include its owning production source scope.

#### Scenario: Source file is never imported by tests
- **WHEN** a production source file matches the workspace coverage include and no test imports it
- **THEN** the file MUST appear as uncovered in the coverage result
- **AND** it MUST NOT disappear from the threshold denominator.

### Requirement: Workspace test ownership is unique and auditable
Every production workspace SHALL have exactly one canonical test owner or an explicit aggregator owner, and the repository SHALL reject duplicate or unowned test scopes.

#### Scenario: Parent and child both scan the same tests
- **WHEN** a parent package Vitest config and a child workspace test command include the same test files
- **THEN** the ownership audit MUST fail with both owners and the overlapping scope.

#### Scenario: Source-bearing workspace has no tests
- **WHEN** a source-bearing workspace has no canonical test owner or intentionally has no tests
- **THEN** the audit MUST require a recorded owner, rationale, validation alternative, and closing condition
- **AND** `<NONEXISTENT>` or an unexplained empty-test success MUST NOT satisfy the requirement.

### Requirement: Test infrastructure failures are classified visibly
Repository test orchestration SHALL distinguish configuration, infrastructure, and test-case failures in machine-readable output.

#### Scenario: Test command cannot start
- **WHEN** a required runner, config, dependency, fixture, or host cannot start
- **THEN** the result MUST identify an infrastructure or configuration failure
- **AND** it MUST NOT return a successful empty test result.
