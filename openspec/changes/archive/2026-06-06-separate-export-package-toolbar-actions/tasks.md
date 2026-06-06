## 1. Contracts And Canvas Correction

- [x] 1.1 Rename the Canvas mixed export/package toolbar action to explicit Export and Package actions with stable `open-export` / `open-package` attributes.
- [x] 1.2 Update Canvas Webview and Extension Host routing so Export and Package use separate whitelisted message paths.
- [x] 1.3 Update Canvas i18n and tests for the separated actions.

## 2. Package Toolbar Entries

- [x] 2.1 Add Cut Export and Package left rail buttons, reusing the existing export panel for Export and a no-engine package intent for Package.
- [x] 2.2 Add Audio Export and Package left rail buttons, reusing the existing export side panel for Export and a no-engine package intent for Package.
- [x] 2.3 Add Sketch Export and Package left rail buttons, reusing existing Webview export actions for Export and a no-engine package intent for Package.
- [x] 2.4 Add Puppet Export and Package left rail buttons, routing Export to existing asset export commands and Package to a no-engine package intent.
- [x] 2.5 Add Model Export and Package left rail buttons, routing Export to GLB / motion / config choices and Package to a no-engine package intent.

## 3. Extension Host Routing

- [x] 3.1 Add whitelisted Package handlers for packages whose package action needs VSCode SaveDialog or active document context.
- [x] 3.2 Add or reuse whitelisted Export handlers for packages whose export action needs Extension Host QuickPick or command routing.
- [x] 3.3 Ensure Package handlers do not call Engine clients or ExportService render/transcode APIs, and Export handlers stay responsible for finished-product type selection.

## 4. Verification

- [x] 4.1 Add/update toolbar, layout, or protocol tests for each touched package.
- [x] 4.2 Run targeted Webview tests for touched toolbar/layout components.
- [x] 4.3 Run targeted Extension protocol tests or package extension builds for touched Extension Host routing.
- [x] 4.4 Run OpenSpec validation for `separate-export-package-toolbar-actions`.
