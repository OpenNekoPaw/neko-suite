## 1. Boundary Documentation

- [x] 1.1 Update `docs/domains/scene/README.md` and `docs/domains/scene/architecture.md` to state that `neko-model` owns `.nkm profile: 2d` authoring entry points.
- [x] 1.2 Update `docs/domains/character/README.md` and `docs/domains/character/architecture.md` to state that `neko-puppet` owns `.nkp profile: live2d` and `.nkp profile: neko-puppet`, not generic 2D Scene authoring.
- [x] 1.3 Update `docs/architecture/package-boundaries.md` package responsibility rows for `neko-model` and `neko-puppet`.
- [x] 1.4 Update `packages/neko-model/README.md` and `packages/neko-puppet/README.md` so package-local docs match the Scene/Character boundary.

## 2. Contracts And Project Format Guards

- [x] 2.1 Audit `packages/neko-types/src/types/puppet.ts` and model/scene project contracts for current `.nkp` and `.nkm` profile support.
- [x] 2.2 Add or update contract tests proving `.nkm profile: 2d` accepts Scene authoring fields and `.nkp` remains Character/Puppet scoped.
- [x] 2.3 Add wrong-domain diagnostics or validators for `.nkp` drafts that contain generic 2D Scene fields such as tilemaps, stage cameras, lights, parallax, particles, or scene switching.
- [x] 2.4 Decide whether shared viewport contracts need a `puppet` or `character` `ViewportDomain`; if yes, update `@neko/shared` contracts before feature package usage.

## 3. Neko Model 2D Scene Ownership

- [x] 3.1 Audit `packages/neko-model` editor routing for `.nkm profile: 2d` and identify missing unavailable/degraded states.
- [x] 3.2 Add or update `neko-model` Webview routing so `.nkm profile: 2d` opens in the Scene editor path instead of falling through to 3D-only assumptions.
- [x] 3.3 Ensure 2D Scene authoring commands compile to Scene/Viewport commands through `@neko/neko-client` and do not bypass Engine authority.
- [x] 3.4 Add focused `neko-model` tests for `.nkm profile: 2d` open/routing behavior and any available first-slice 2D Scene controls.

## 4. Neko Puppet Live2D/Puppet Scope Cleanup

- [x] 4.1 Audit `packages/neko-puppet/packages/webview` for generic 2D Scene creation affordances, labels, controller names, and action names.
- [x] 4.2 Rename Webview-local `PuppetSceneController` concepts toward Puppet/Character viewport naming without changing behavior.
- [x] 4.3 Remove, hide, or move any tilemap, scene camera, scene light, parallax, particle, or generic scene graph affordance from Puppet UI if present.
- [x] 4.4 Keep Live2D/MOC3 bundle import, parameter sliders, motions, expressions, physics, tracking mapping, and native Puppet rig controls working through `.nkp`.
- [x] 4.5 Add or update Puppet Webview tests proving generic Scene tools are absent while Live2D/Puppet tools remain available.

## 5. Cross-Domain Integration

- [x] 5.1 Verify `.nkm profile: live` references `.nkp` actors through stable refs without copying Puppet parameter, motion, expression, or physics truth.
- [x] 5.2 Update Agent capability registration or metadata so generic 2D Scene creation targets `neko-model`, while Live2D/Puppet actions target `neko-puppet`.
- [x] 5.3 Update asset/market install targets if any 2D Scene templates are currently registered as Puppet templates.

## 6. Validation

- [x] 6.1 Run `pnpm --filter @neko-model/webview test` for Scene routing and viewport behavior.
- [x] 6.2 Run `pnpm --filter @neko-puppet/webview test` for Puppet Webview scope and Live2D/Puppet behavior.
- [x] 6.3 Run contract tests for `packages/neko-types` covering `.nkm`/`.nkp` boundary validation.
- [x] 6.4 Run `pnpm check:3d-route-a-boundaries` and any dependency boundary checks touched by the change.
- [x] 6.5 For Webview visual or interaction changes, run `pnpm smoke:webview:runtime` or equivalent Extension Development Host validation with `vscode-extension-debugger`.
- [x] 6.6 Record residual risk if any Engine, Proto, or VSCode runtime validation cannot be run.
