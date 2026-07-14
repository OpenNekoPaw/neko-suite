## Context

Neko Suite has three current client products but their build roots are split across reusable packages. Home has already been extracted into `apps/neko-home`; `apps/neko-tui` exists but still builds through an Agent package executable entry; Neko for VSCode remains a pure Extension Pack under `packages/neko-suite`. The old `packages/neko-desktop` product is no longer part of the roadmap.

This change is a product ownership migration. It is not a future Studio design exercise. Single-product host composition belongs in its application root; only proven host-neutral runtime and domain behavior remain package-owned.

## Goals / Non-Goals

**Goals:**

- Make `apps/neko-home`, `apps/neko-tui`, and `apps/neko-vscode` the only successful product build/package/release roots.
- Keep apps focused on product and host composition while consuming documented public domain/runtime package entries.
- Delete `packages/neko-desktop` after Home and shared replacements cover retained behavior.
- Remove package-local product executable/package entries without compatibility forwarding.
- Preserve valuable local user data and stable VSCode/Agent identities.

**Non-Goals:**

- Do not create or reserve a buildable `apps/neko-studio`.
- Do not preserve native Studio executable spikes from Desktop.
- Do not move host-neutral `AgentSession`, provider/platform behavior, domain Extensions, Custom Editors, or shared contracts into apps merely to change directory shape.
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
  neko-agent/      # host-neutral Agent runtime and host integrations
  neko-engine/
  neko-host/
  neko-workbench-core/
  <domain packages>
```

An app owns product identity, its single-product host composition, executable/package entry, focused tests, packaging, and release selection. A package exposes behavior only when it is host-neutral, independently reusable, or already has more than one production consumer; it must not expose a competing product `bin`, VSIX product manifest, start command, or release entry.

Ownership follows stable responsibility rather than directory size. The terminal command surface, Ink presentation, process lifecycle, Node host assembly, and debug automation protocol all evolve with the Neko TUI product and have one production consumer, so they belong to `apps/neko-tui`. Agent execution, provider/platform behavior, portable task/session contracts, and other host-neutral capabilities remain in their existing public packages.

### Decision: Home replaces Desktop; Desktop is deleted

Home is a Codex-style control surface with two coordinated responsibilities:

- multi-session Agent management: create, select, resume, queue, cancel, observe, and recover independent Agent sessions with explicit session/runtime identity;
- AIGC creation management: observe generation tasks, status, outputs, provenance, validation, retry/cancel controls, and promotion/handoff of generated work through owning package contracts.

Each Agent session owns its mutable configuration projection, queue, runtime state, task bindings, logs, and resource handles. The selected session is only a UI projection and never the state owner. AIGC tasks and generated outputs use stable Task/Run/Resource/Artifact identities; Home does not reinterpret cache paths as durable assets or duplicate media/provider semantics.

Home retains only Desktop behavior already classified and migrated as Home-owned or genuinely shared. The CodeMirror editor, editor tabs, VSCode-like workbench, creative-editor switch, Desktop fixtures, and Desktop functional scenarios are deleted. Application-neutral contracts already accepted in Engine client, Proto, Host, or Workbench Core remain there.

No Desktop source is retained for a future Studio. A future native product begins with a new OpenSpec based on then-current Engine and product requirements. Git history preserves prototype evidence without keeping a successful or compilable product path.

### Decision: TUI owns its complete terminal host composition

The dependency audit found only one production consumer of `@neko/cli`: `apps/neko-tui`. Its broad root/component exports and wildcard source exports have no repository consumers. Evaluation interacts with the app executable at the process boundary; other references are path selection, CI, architecture checks, or test fixtures rather than runtime consumers.

`apps/neko-tui` therefore owns Commander command semantics, configuration/session host composition, Ink UI, terminal presentation, Node host adapters, evaluation-neutral debug automation, the only `bin`, executable bundling, tests, and release target. It consumes `@neko/agent`, `@neko/platform`, `@neko/host`, and other public package entries directly and must not import package internals.

`@neko/cli` is deleted rather than retained as a forwarding facade or speculative SDK. If a second production host later needs the same lifecycle and error semantics, the proven common capability can be extracted to a neutral package in a separate change. Shared storage or task behavior discovered during migration must move to its existing neutral owner, not remain in a package named after the retired product surface.

Rejected: retaining `@neko/cli` only to keep `apps/neko-tui` physically small. A one-consumer public package with wildcard exports increases coupling and creates two ownership locations without a real substitution or reuse boundary.

### Decision: Neko for VSCode is a product manifest root

`apps/neko-vscode` owns the existing `neko.neko-suite` Extension Pack identity, extension list, README/license packaging inputs, VSIX command, and release metadata. All member Extensions remain in domain packages. `packages/neko-suite` is deleted after the app-root VSIX installs and activates successfully.

### Decision: replacement paths are one-way

For each product, migrate callers and validation to the app root, prove the app path, then delete or poison the package-local product entry. No forwarding alias, dual build, or fallback remains. Old paths must be absent or fail visibly.

## Five-Layer Analysis

Responsibility:

- Apps own executable/product packaging, release, and single-product host composition.
- Domain packages own host-neutral runtime semantics and public contracts.
- Shared packages own host-neutral contracts.
- Engine remains authoritative for media, rendering, devices, and Engine state.

Dependency:

- `apps/* -> public package exports`.
- `packages/* -X-> apps/*`.
- TUI imports only public package entries and does not import Webview, VSCode, Electron, or package internals.
- No package imports `apps/neko-tui`; cross-host conformance fixtures belong to neutral test owners or the consuming app.
- VSCode product root contains no domain runtime.

Interface:

- TUI composes public Agent/platform/host contracts directly inside its application root.
- VSCode composes stable extension identifiers.
- Home uses typed Electron bridge, explicit Agent session/runtime identities, stable Task/Run/Resource/Artifact identities, and host/application contracts.
- Missing public entries and unknown identities fail visibly.

Extension:

- A new product can add an app root without relocating domain behavior.
- A future Studio composes then-current public contracts in a separate change.
- Package APIs remain independently testable without exposing a TUI-specific facade.

Testing:

- Boundary checks prove app-to-public-package dependency direction and reject restoration of `@neko/cli`.
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
3. Move the complete TUI host composition and tests into `apps/neko-tui`; migrate Evaluation/CI and cross-host conformance callers, delete `@neko/cli`, then rerun canonical real cases.
4. Create `apps/neko-vscode` from the pure Extension Pack product files; preserve `neko.neko-suite`, validate VSIX install/activation, then delete `packages/neko-suite`.
5. Continue the separately scoped Home multi-session/AIGC management tasks after product-root cleanup, without restoring Desktop code.
6. Update architecture/docs/tooling and run focused plus repository quality gates.

Rollback before old-path deletion may restore callers to the old entry. After deletion, rollback means reverting the complete migration change, not maintaining a compatibility path.

## Risks / Trade-offs

- [Risk] A reusable Desktop contract is deleted with the product. -> Mitigation: inventory and reference scans must show its canonical public owner or explicit retirement before deletion.
- [Risk] Host-neutral Agent behavior is accidentally moved into the app. -> Mitigation: keep `AgentSession`, platform/provider behavior, task contracts, shared storage contracts, and other multi-host capabilities in their existing public owners; move only terminal host composition.
- [Risk] VSCode Marketplace identity changes. -> Mitigation: preserve publisher/name/version and verify the produced VSIX manifest and activation.
- [Risk] User data is confused with source/build output. -> Mitigation: inventory durable state separately; delete only repository source and rebuildable outputs.
- [Risk] Existing dirty work is overwritten. -> Mitigation: delete only inventoried Desktop/product files and review the current working tree before each removal slice.
