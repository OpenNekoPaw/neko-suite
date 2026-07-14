## Context

Neko Suite has three current client products but their build roots are split across reusable packages. Home has already been extracted into `apps/neko-home`; `apps/neko-tui` exists but still builds through an Agent package executable entry; Neko for VSCode remains a pure Extension Pack under `packages/neko-suite`. The old `packages/neko-desktop` product is no longer part of the roadmap.

This change is a product-build ownership migration. It is not a future Studio design exercise and does not require moving all host-specific or terminal code into application directories.

## Goals / Non-Goals

**Goals:**

- Make `apps/neko-home`, `apps/neko-tui`, and `apps/neko-vscode` the only successful product build/package/release roots.
- Keep apps thin and compose documented public package entries.
- Delete `packages/neko-desktop` after Home and shared replacements cover retained behavior.
- Remove package-local product executable/package entries without compatibility forwarding.
- Preserve valuable local user data and stable VSCode/Agent identities.

**Non-Goals:**

- Do not create or reserve a buildable `apps/neko-studio`.
- Do not preserve native Studio executable spikes from Desktop.
- Do not move AgentSession, Ink components, CLI command semantics, debug automation protocol, domain Extensions, Custom Editors, or domain runtime implementations into apps merely to change build ownership.
- Do not redesign TUI, VSCode, Engine viewport, or professional editing workflows beyond moving their product build roots.
- Do not turn Home into a professional timeline, canvas, scene, code, or media editor; Home manages Agent work and AIGC creation lifecycle and hands precise editing to a professional tool.
- Do not split applications into separate repositories.

## Decisions

### Decision: apps own product builds; packages own reusable runtime

The target layout is:

```text
apps/
  neko-home/       # Electron executable and package
  neko-tui/        # terminal executable and package
  neko-vscode/     # Extension Pack manifest and VSIX

packages/
  neko-agent/      # Agent and terminal runtime
  neko-engine/
  neko-host/
  neko-workbench-core/
  <domain packages>
```

An app owns product identity, executable/package entry, build, focused tests, packaging, and release selection. A package may expose public runtime/UI/adapter entries but must not expose a competing product `bin`, VSIX product manifest, start command, or release entry.

This is intentionally narrower than moving every application-flavored module. Ownership follows stable responsibility: terminal command semantics and Ink presentation evolve with Agent TUI behavior, while the final executable build belongs to the TUI product.

### Decision: Home replaces Desktop; Desktop is deleted

Home is a Codex-style control surface with two coordinated responsibilities:

- multi-session Agent management: create, select, resume, queue, cancel, observe, and recover independent Agent sessions with explicit session/runtime identity;
- AIGC creation management: observe generation tasks, status, outputs, provenance, validation, retry/cancel controls, and promotion/handoff of generated work through owning package contracts.

Each Agent session owns its mutable configuration projection, queue, runtime state, task bindings, logs, and resource handles. The selected session is only a UI projection and never the state owner. AIGC tasks and generated outputs use stable Task/Run/Resource/Artifact identities; Home does not reinterpret cache paths as durable assets or duplicate media/provider semantics.

Home retains only Desktop behavior already classified and migrated as Home-owned or genuinely shared. The CodeMirror editor, editor tabs, VSCode-like workbench, creative-editor switch, Desktop fixtures, and Desktop functional scenarios are deleted. Application-neutral contracts already accepted in Engine client, Proto, Host, or Workbench Core remain there.

No Desktop source is retained for a future Studio. A future native product begins with a new OpenSpec based on then-current Engine and product requirements. Git history preserves prototype evidence without keeping a successful or compilable product path.

### Decision: TUI executable moves without relocating Agent semantics

`@neko/cli` remains the owner of terminal runtime, Commander command semantics, configuration/session behavior, Ink UI, Node host adapters, and evaluation-neutral debug protocol. It exposes a documented public terminal application entry.

`apps/neko-tui` owns the only `bin`, executable bundling, build/package scripts, and release target. The Agent package loses its own `bin`, executable build scripts, and self-starting product entry after real Evaluation uses the app executable. The app must not import Agent package internals.

Rejected: moving the full CLI source into `apps/neko-tui`. That would move domain and terminal semantics merely to satisfy directory shape and would make `apps` a feature implementation layer.

### Decision: Neko for VSCode is a product manifest root

`apps/neko-vscode` owns the existing `neko.neko-suite` Extension Pack identity, extension list, README/license packaging inputs, VSIX command, and release metadata. All member Extensions remain in domain packages. `packages/neko-suite` is deleted after the app-root VSIX installs and activates successfully.

### Decision: replacement paths are one-way

For each product, migrate callers and validation to the app root, prove the app path, then delete or poison the package-local product entry. No forwarding alias, dual build, or fallback remains. Old paths must be absent or fail visibly.

## Five-Layer Analysis

Responsibility:

- Apps own executable/product packaging and release.
- Domain packages own runtime semantics and host adapters.
- Shared packages own host-neutral contracts.
- Engine remains authoritative for media, rendering, devices, and Engine state.

Dependency:

- `apps/* -> public package exports`.
- `packages/* -X-> apps/*`.
- TUI does not import Webview, VSCode, Electron, or package internals.
- VSCode product root contains no domain runtime.

Interface:

- TUI consumes one typed terminal application entry.
- VSCode composes stable extension identifiers.
- Home uses typed Electron bridge, explicit Agent session/runtime identities, stable Task/Run/Resource/Artifact identities, and host/application contracts.
- Missing public entries and unknown identities fail visibly.

Extension:

- A new product can add an app root without relocating domain behavior.
- A future Studio composes then-current public contracts in a separate change.
- Package APIs remain independently testable.

Testing:

- Boundary checks prove app-to-public-package dependency direction.
- Path tests prove app build roots are hit and old product entries cannot succeed.
- Home uses deterministic instance-isolation tests plus Electron functional scenarios for multi-session switching, queue/cancel/restart, AIGC task/output projection, and professional-tool handoff.
- TUI uses deterministic tests plus real Agent Evaluation.
- VSCode uses VSIX/install activation and Extension Development Host scenarios.

Proportionality:

- No new registry, provider layer, build abstraction, or compatibility adapter is introduced.
- Each app uses its host's existing build tooling.
- Future Studio complexity is excluded.

Fail-visible behavior:

- Missing public runtime entries, unknown product identity, old executable commands, stale package roots, and unknown schemas fail directly.
- Build or runtime failure never falls back to Desktop, package-local TUI executable, or package-local Extension Pack.

## Migration Plan

1. Keep the completed application ownership inventory and boundary checks.
2. Validate the existing Home replacement slice, map every Desktop scenario/module, then delete `packages/neko-desktop`, root scripts, dependencies, fixtures, scenarios, generated artifacts, and tooling references.
3. Make `apps/neko-tui` the only executable build over the public Agent terminal entry; migrate Evaluation/CI, run real cases, then remove Agent-package `bin` and executable builds.
4. Create `apps/neko-vscode` from the pure Extension Pack product files; preserve `neko.neko-suite`, validate VSIX install/activation, then delete `packages/neko-suite`.
5. Continue the separately scoped Home multi-session/AIGC management tasks after product-root cleanup, without restoring Desktop code.
6. Update architecture/docs/tooling and run focused plus repository quality gates.

Rollback before old-path deletion may restore callers to the old entry. After deletion, rollback means reverting the complete migration change, not maintaining a compatibility path.

## Risks / Trade-offs

- [Risk] A reusable Desktop contract is deleted with the product. -> Mitigation: inventory and reference scans must show its canonical public owner or explicit retirement before deletion.
- [Risk] TUI app becomes a copy of Agent TUI. -> Mitigation: app builds one public Agent entry and contains no copied terminal implementation.
- [Risk] VSCode Marketplace identity changes. -> Mitigation: preserve publisher/name/version and verify the produced VSIX manifest and activation.
- [Risk] User data is confused with source/build output. -> Mitigation: inventory durable state separately; delete only repository source and rebuildable outputs.
- [Risk] Existing dirty work is overwritten. -> Mitigation: delete only inventoried Desktop/product files and review the current working tree before each removal slice.
