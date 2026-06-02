# neko-model Basic Editable Fixture

This directory documents the repository-owned fixture requirement for the neko-model Basic Editing Baseline.

Automated tests for `implement-neko-model-basic-editing-baseline` must use a redistributable fixture that is either checked into this repository or generated during test setup. The fixture must be intentionally small and suitable for CI:

- at least one renderable mesh node
- at least one material slot
- non-empty bounds for camera framing and hit-test smoke checks
- stable scene and fixture identifiers
- permissive/generated licensing so it can travel with the repository

The fixture generator or binary is intentionally not restored by the documentation-only update that recreated the OpenSpec proposal/design/spec files. Task 1.3 in the OpenSpec change remains open until `basic-editable.glb` or an equivalent generated fixture source is added.

`../neko-test/test.glb` remains useful for manual Chrome DevTools or VSCode extension debugger checks, but it is outside this repository and is not a CI dependency.
