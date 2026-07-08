## 1. Workbench Core Adapter Contract

- [x] 1.1 Add feature Webview host adapter descriptor, registry snapshot, and diagnostics to `@neko/workbench-core`.
- [x] 1.2 Add Workbench Core tests for valid descriptors, duplicate ids, unsupported host/capability diagnostics, and host-neutral shape.

## 2. Package-Owned Adapter Entries

- [x] 2.1 Add package-owned descriptor factories for the initial Desktop-consumed feature Webview adapters.
- [x] 2.2 Add tests proving descriptor owners are feature packages and descriptors do not carry runtime handles.

## 3. Desktop Consumption

- [x] 3.1 Update Desktop workbench bootstrap adapter to consume package-owned feature Webview adapter descriptors for custom editor metadata.
- [x] 3.2 Update Desktop tests to prove migrated feature adapters are package-owned and temporary bootstrap mappings remain visible.

## 4. Validation

- [x] 4.1 Run focused Workbench Core, feature Webview descriptor, and Desktop typecheck/tests.
- [x] 4.2 Validate OpenSpec change and record residual risk.
