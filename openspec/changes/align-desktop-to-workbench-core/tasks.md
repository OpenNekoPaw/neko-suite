## 1. Desktop Contract And Main Assembly

- [x] 1.1 Extend desktop shared contracts with a Workbench Core snapshot DTO.
- [x] 1.2 Assemble Workbench Core snapshot in Electron main using workspace provider and desktop bootstrap contribution adapter.
- [x] 1.3 Update desktop fixtures and contract tests to include Workbench Core snapshot.

## 2. Renderer Consumption

- [x] 2.1 Surface Workbench Core contribution/provider status in renderer status/diagnostic metadata without changing layout behavior.
- [x] 2.2 Add renderer tests proving `snapshot.workbench` is consumed and no desktop-local scanner internals are read in renderer.

## 3. Validation

- [x] 3.1 Run focused desktop typecheck/tests.
- [x] 3.2 Validate OpenSpec change and record residual risk.
