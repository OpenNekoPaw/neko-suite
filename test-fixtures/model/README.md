# neko-model Basic Editable Fixture

This directory defines the repository-owned fixture source for the neko-model Basic Editing Baseline.

`basic-editable.ts` generates a deterministic GLB using the project-owned `generateDefaultCubeGlb` helper from `@neko/shared/vscode/extension`. The generated asset is intentionally small and redistributable:

- one renderable mesh node
- one material slot
- non-empty bounds for camera framing and hit-test smoke checks
- stable scene and fixture identifiers

Automated tests should import `generateBasicEditableGlb()` or generate `basic-editable.glb` during test setup. They must not require `../neko-test/test.glb`.

`../neko-test/test.glb` remains useful for manual Chrome DevTools or VSCode extension debugger checks, but it is outside this repository and is not a CI dependency.
