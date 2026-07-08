## 1. Workbench Core Resource Provider Contracts

- [x] 1.1 Add resource provider snapshot, workspace tree node, provider diagnostic, file kind, and runtime projection contracts to `@neko/workbench-core`.
- [x] 1.2 Add shared workspace file classification, media detection, thumbnail label, portable ref, and provider validation helpers.
- [x] 1.3 Add Workbench Core tests for classification, media detection, provider validation, unsafe identity rejection, and boundary neutrality.

## 2. Desktop Workspace Provider Adapter

- [x] 2.1 Refactor desktop workspace scan classification to use `@neko/workbench-core` helpers while preserving existing desktop file kinds and thumbnails.
- [x] 2.2 Add a desktop workspace resource provider adapter wrapping `createWorkspaceFileTreeSnapshot` and marking provider kind as `bootstrap-temporary`.
- [x] 2.3 Add desktop tests proving provider snapshot output, temporary bootstrap marker, truncation diagnostics, and preserved workspace tree shape.

## 3. Validation

- [x] 3.1 Run focused `@neko/workbench-core` typecheck/tests.
- [x] 3.2 Run focused `neko-desktop` typecheck/tests.
- [x] 3.3 Validate OpenSpec change and record residual risk.
