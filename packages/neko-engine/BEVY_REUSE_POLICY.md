# Bevy Reuse Policy

Neko Engine reuses narrow Bevy infrastructure crates where they reduce duplicated
runtime plumbing, but Neko owns engine lifecycle, scheduling, renderer,
viewport, export, host integration, and durable project contracts.

## Approved Direct Crates

| Crate | Current use | Owner boundary |
| --- | --- | --- |
| `bevy_ecs = 0.15` | `World`, `Entity`, `Component`, `Resource`, `Query`, change detection, ECS data access | Runtime crates and selected renderer extract paths; Neko services still own lifecycle and ticking |
| `bevy_tasks = 0.15` | CPU-bound parallel work such as native puppet BlendShape and 2D skinning batches | Runtime-owned compute only, with serial fallback and parity tests |

`bevy_tasks` is already present in the dependency graph through `bevy_ecs`; direct
usage is allowed when the crate using it declares the dependency explicitly and
keeps deterministic fallback behavior.

## Evaluation Only

| Crate | Gate |
| --- | --- |
| `bevy_color` | May be evaluated for color conversion helpers after a focused proposal or task update |
| `bevy_math` | TODO(P1): blocked until `runtime-scene`, `runtime-puppet`, `engine-types`, and renderer crates align on one compatible `glam` version |

Current math boundary: `glam = 0.29` in `runtime-scene`, `runtime-puppet`, and
the workspace manifest. Do not expose `bevy_math` types across DTO, ECS, extract,
or renderer boundaries while this remains true.

## Excluded Crates And Runtime Concepts

The engine MUST NOT introduce Bevy-owned application/runtime architecture into
Neko runtime or renderer crates without a new proposal. This includes:

- `bevy_app`
- `bevy_render`
- `bevy_window`
- `bevy_asset`
- `bevy_pbr`
- `bevy_winit`
- `bevy_sprite`
- `bevy_scene`
- `bevy_core_pipeline`
- Bevy `App` ownership
- Bevy `Schedule` ownership
- Bevy `AssetServer`
- Bevy window/plugin runtime

Bevy renderer, animation, picking, gizmo, shadow, post-process, and morph code
may be used as design references. Ported algorithms and shaders land in
Neko-owned crates such as `engine-gpu`, renderer companion crates, or runtime
contract crates, with Neko tests and dependency guardrails.
