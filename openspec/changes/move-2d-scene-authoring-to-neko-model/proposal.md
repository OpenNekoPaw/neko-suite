## Why

Puppet Webview currently carries some generic 2D scene and native bone-editing vocabulary even though the product direction is already split: `.nkm` owns 2D/3D Scene authoring and `.nkp` owns Live2D/Puppet character truth. This change makes that split explicit so 2D Scene creation grows inside `neko-model`, while `neko-puppet` becomes a Live2D/Puppet-specific editor instead of a second scene editor.

## What Changes

- Move 2D Scene authoring responsibility to `neko-model` and the Scene domain:
  - `.nkm profile: 2d` owns sprite, tilemap, 2D light, parallax, particle, camera, scene graph, and 2D scene preview workflows.
  - `neko-model` owns the Webview/editor entry points for 2D Scene authoring alongside existing 3D and Live scene profiles.
- Narrow `neko-puppet` to Character domain responsibilities:
  - `.nkp profile: live2d` owns Live2D/MOC3/model3 bundle import, parameters, expressions, motions, physics, and tracking mapping.
  - `.nkp profile: neko-puppet` owns native 2D puppet meshes, bones, BlendShape, parameter, motion, expression, and tracking mapping.
  - Puppet Webview must not expose generic 2D Scene creation, stage layout, camera/light editing, tilemap editing, or scene graph authoring as first-class workflows.
- Refactor naming and contracts that currently imply Puppet is a Scene editor:
  - Rename Webview-local `PuppetSceneController` style concepts toward puppet/character viewport terms.
  - Replace or isolate `scene:puppet:*` viewport action names when the shared viewport protocol gains a puppet/character domain.
  - Preserve shared `ViewportShell` reuse where it remains a UI interaction shell, not a domain ownership signal.
- Update documentation and package boundary references so Scene/Character responsibilities agree across `docs/domains`, package READMEs, and OpenSpec.
- **BREAKING** for unreleased internal drafts: any draft workflow that treated `.nkp` as a 2D Scene project must be rebuilt or reauthored as `.nkm profile: 2d`. Existing Live2D/MOC3 `.nkp` files remain in the Puppet editor path.

## Capabilities

### New Capabilities

- `scene-character-authoring-boundary`: Defines the externally visible ownership boundary between `.nkm` Scene authoring in `neko-model` and `.nkp` Live2D/Puppet character authoring in `neko-puppet`.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-model`: add or clarify 2D Scene authoring entry points, `.nkm profile: 2d` UI routing, scene commands, and validation.
  - `packages/neko-puppet`: remove or hide generic 2D Scene creation affordances, rename puppet viewport/controller semantics, and keep Live2D/Puppet authoring focused on character parameters and motions.
  - `packages/neko-types`: update shared project/viewport contracts if a puppet/character viewport domain or `.nkm profile: 2d` validation fields are missing.
  - `packages/neko-client` and `packages/neko-proto`: update only if Scene/Puppet engine command or viewport protocol contracts need explicit profile/domain fields.
  - `packages/neko-engine`: preserve `runtime-scene` as Scene authority and `runtime-puppet` as Puppet/Live2D authority; add support only where the contract requires it.
- Affected docs:
  - `docs/domains/scene/*`, `docs/domains/character/*`, `docs/architecture/package-boundaries.md`, `packages/neko-model/README.md`, and `packages/neko-puppet/README.md`.
- Compatibility:
  - Prelaunch internal `.nkp` drafts that represent generic 2D scenes are not migrated as Puppet data; they should be recreated as `.nkm profile: 2d`.
  - Live2D/MOC3 bundle-backed `.nkp` projects continue to load through `neko-puppet`.
  - Shared viewport shell reuse remains allowed, but domain names and action prefixes should no longer imply Puppet is owned by the Scene authoring capability.
