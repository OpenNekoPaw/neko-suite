## ADDED Requirements

### Requirement: Agent experiment alternate session paths are removed
Neko Agent SHALL NOT expose a product CLI experiment command, direct-session experiment runner, ablation marker, experiment-only no-op branch, preset registry, comparison reporter, or alias that bypasses the canonical external TUI Evaluation path.

#### Scenario: CLI command surface is inspected after migration
- **WHEN** callers attempt to use `neko experiment` or import the removed experiment runner/presets
- **THEN** the command or import MUST be absent or fail visibly
- **AND** it MUST NOT delegate to a retained direct AgentSession path or return legacy experiment success

#### Scenario: New ablation case executes
- **WHEN** an ablation suite runs through `scripts/agent-eval`
- **THEN** tests MUST prove TUI debug automation and the platform runner were used
- **AND** the removed marker, runner, CLI command and report path MUST be poisoned or absent
