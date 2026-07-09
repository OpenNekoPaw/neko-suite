## ADDED Requirements

### Requirement: VSCode bridge is a transport implementation

The shared VSCode Webview bridge SHALL remain the canonical VSCode transport implementation, but host-neutral Webview runtime surfaces MUST depend on injected host facades instead of depending on the VSCode bridge as their public host API.

#### Scenario: Host-neutral Agent Webview runs in VSCode

- **WHEN** Agent Webview runs inside VSCode after host adapter normalization
- **THEN** the injected Agent host runtime adapter MUST delegate VSCode transport to `@neko/shared/vscode`
- **AND** Agent components MUST consume the injected adapter or package facade rather than importing the shared VSCode bridge directly for host-neutral behavior

#### Scenario: Host-neutral Agent Webview runs in Electron

- **WHEN** the same Agent Webview root runs inside Electron/Desktop
- **THEN** the injected Agent host runtime adapter MUST use Electron scoped IPC transport
- **AND** the Webview root MUST NOT require `@neko/shared/vscode` to be present as a successful host path

### Requirement: New host-neutral Webview code avoids direct VSCode globals

Production Webview code for host-neutral runtime surfaces SHALL NOT introduce new direct global VSCode API calls after an injected host adapter path exists.

#### Scenario: New Webview code calls a VSCode global directly

- **WHEN** new production code under a host-neutral Webview surface calls `window.vscodeApi`, `acquireVsCodeApi`, or `@neko/shared/vscode` directly
- **THEN** validation MUST fail unless the file is an approved VSCode transport adapter or migration shim
- **AND** the diagnostic MUST point to the injected host adapter or package facade
