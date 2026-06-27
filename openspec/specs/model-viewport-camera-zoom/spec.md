# model-viewport-camera-zoom Specification

## Purpose
TBD - created by archiving change improve-model-viewport-camera-zoom. Update Purpose after archive.
## Requirements
### Requirement: Default zoom prevents accidental clipping

The Model viewport SHALL prevent default wheel, keyboard, and orbit drag zoom from moving the editor camera near plane through the focused selection or scene surface.

#### Scenario: Zoom stops before a centered model surface
- **WHEN** the orbit target is inside a visible 1:1 model and the user zooms inward with the default viewport zoom gesture
- **THEN** the editor camera radius is clamped to at least the focused front-surface depth plus the active near clip distance and safety margin

#### Scenario: Zoom fallback works without a surface hit
- **WHEN** no cursor surface hit is available during a zoom gesture
- **THEN** the viewport uses selected object bounds or scene bounds to compute a safe minimum camera radius

### Requirement: Small objects remain inspectable

The Model viewport SHALL use scale-aware editor camera projection values so small selected objects can be inspected closely without disabling default clipping protection.

#### Scenario: Tiny selected object uses smaller editor near clip
- **WHEN** the user frames or zooms into a small selected mesh
- **THEN** the editor camera near clip and clipping margin are derived from the selected or focused bounds within configured minimum and maximum limits

#### Scenario: Large scene keeps stable depth precision
- **WHEN** the user views a large scene or selected bounds
- **THEN** the editor camera far and near clip values are clamped to avoid excessive far/near ratios while keeping the focused content visible

### Requirement: Surface-anchored zoom uses cursor hit when available

The Model viewport SHALL prefer a cursor surface hit as the zoom anchor when the Engine can provide a valid hit for the current viewport position.

#### Scenario: Wheel zoom follows the pointed surface
- **WHEN** the user wheels over a visible model surface and the Engine returns a valid hit point
- **THEN** the viewport treats that hit point as the temporary zoom focal point and stops before clipping that surface

#### Scenario: Stale hit does not control zoom
- **WHEN** a cached surface hit is older than the allowed wheel-burst TTL or no longer matches the current scene revision
- **THEN** the viewport ignores that hit and falls back to bounds-based zoom safety

### Requirement: Internal viewing is explicit

The Model viewport SHALL only allow default clipping guard bypass through an explicit internal viewing mode or temporary bypass gesture.

#### Scenario: Default zoom cannot enter object volume
- **WHEN** the user performs normal zoom without an internal viewing mode or bypass gesture
- **THEN** the viewport prevents the editor camera from entering the focused object volume

#### Scenario: Bypass mode reports intentional clipping
- **WHEN** the user enables an internal viewing mode or holds the configured bypass modifier while zooming through geometry
- **THEN** the viewport allows the bypass and shows a visible state indicating intentional internal viewing or clipping guard bypass

### Requirement: Creative object scale is not hard-limited by viewport zoom

The Model editor SHALL NOT reject or clamp object transform scale solely to avoid viewport clipping.

#### Scenario: Tiny prop remains valid creative content
- **WHEN** a scene contains a tiny mesh or prop
- **THEN** the viewport adapts camera zoom, pan, grid, and projection behavior instead of forcing the object scale into a fixed world-size range

#### Scenario: Suspicious scale can be advisory
- **WHEN** object scale appears risky for export, physics, animation, or inspection
- **THEN** the editor may show a warning, but the warning does not block normal viewport inspection or authoring transforms

### Requirement: Runtime validation covers Webview and Engine boundaries

Changes to Model viewport camera zoom SHALL include validation for the affected Webview, client contract, Proto, and Engine surfaces.

#### Scenario: Webview-only zoom behavior changes
- **WHEN** the implementation changes only Webview camera state, gesture handling, or HUD feedback
- **THEN** focused Model Webview tests, typecheck, 3D Route A boundary checks, and VS Code Webview runtime smoke are run or documented as residual risk

#### Scenario: Engine or Proto camera contracts change
- **WHEN** the implementation adds or modifies editor camera projection fields, hit-test payloads, or Engine camera ingestion
- **THEN** contract tests, generated type checks, Engine tests, client normalizer tests, and relevant smoke checks are run or documented as residual risk
