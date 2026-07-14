## Why

Neko Suite currently mixes product build roots with reusable packages. The standalone Electron product lives in `packages/neko-desktop`, the TUI executable is built by `packages/neko-agent/packages/cli-tui`, and the VSCode Extension Pack is packaged from `packages/neko-suite`. This makes product ownership and release selection unclear and leaves the retired Desktop editor shell as a second successful editor path.

The repository needs one application layer for the three current products: Neko Home, Neko TUI, and Neko for VSCode. Reusable host-neutral runtime and domain behavior remain package-owned, while each single-product host composition, executable, packaging, testing, and release entry point moves to `apps/*`.

## What Changes

- Define `apps/neko-home`, `apps/neko-tui`, and `apps/neko-vscode` as the only current product build and release roots.
- Build Home as the standalone Electron control surface for Codex-style multi-session Agent work and AIGC creation management, then remove the old Desktop editor/workbench product rather than preserving it as a Studio experiment.
- Move the terminal UI, CLI command semantics, TUI session composition, Node host adapters, and evaluation-neutral debug protocol into `apps/neko-tui`; keep host-neutral Agent runtime and contracts in their existing public packages.
- Move the pure Neko Extension Pack manifest, VSIX packaging, and release ownership from `packages/neko-suite` to `apps/neko-vscode`; domain Extensions and Custom Editors stay in their owning packages.
- **BREAKING**: delete `packages/neko-desktop`, Desktop commands, Desktop-only fixtures/scenarios, CodeMirror/editor-shell dependencies, and successful legacy build/start/package entries after their required Home/shared replacements pass.
- **BREAKING**: delete the single-consumer `@neko/cli` package after its source, tests, and tooling callers move to `apps/neko-tui`, and remove the package-local `neko-suite` product root after canonical app builds pass. Legacy entries must not forward to apps.
- Defer any future native Desktop/Studio product to a separate OpenSpec change. Git history and accepted shared Engine/Workbench contracts are sufficient; this change does not retain executable Studio spike code.

## Capabilities

### New Capabilities

- `client-application-layout`: Defines the three canonical `apps/*` product build roots, allowed dependencies, and independent build/test/package/release ownership.
- `neko-home-application-host`: Defines Home as the Electron multi-session Agent and AIGC creation-management control surface without the retired Desktop editor shell.
- `desktop-shell-retirement`: Defines complete deletion of the old Desktop product and its successful entry paths after replacement gates pass.

### Modified Capabilities

- None. Existing domain capabilities remain owned by their packages.

## Impact

- New/current product roots: `apps/neko-home`, `apps/neko-tui`, `apps/neko-vscode`.
- Removed product roots: `packages/neko-desktop`, the complete single-product `@neko/cli` package, and `packages/neko-suite`.
- Affected tooling: pnpm workspace discovery, Turborepo, root scripts, CI/release, VSIX packaging, Agent Evaluation executable selection, Electron functional scenarios, Knip, and legacy-debt checks.
- No project files, conversations, settings, credentials, trust state, installed packages, or generated artifacts may be deleted by removing source packages. Rebuildable `dist`, coverage, cache, and test reports are not user data.
- A future native Desktop/Studio has no compatibility promise with the removed prototype and requires a new accepted proposal.
