## MODIFIED Requirements

### Requirement: Canvas And Agent Lightweight Consumption
The system SHALL keep Canvas and Agent panoramic handling lightweight. They MUST consume engine-generated thumbnails, FOV crops, proxy previews, or pre-rendered rotation assets through composable preview capability contracts and MUST delegate interactive panoramic viewing to `neko-preview`.

#### Scenario: Agent shows panoramic thumbnail
- **WHEN** Agent displays a panoramic image result
- **THEN** it uses an engine-generated FOV crop or thumbnail and opens `neko-preview` for interactive spherical viewing

#### Scenario: Canvas shows panoramic node preview
- **WHEN** Canvas displays a panoramic asset node
- **THEN** it shows a flat/proxy thumbnail or pre-rendered preview through preview capabilities and delegates spherical interaction to `neko-preview`

#### Scenario: Canvas preview capability does not embed sphere renderer
- **WHEN** a Canvas block declares panoramic preview capability
- **THEN** the Canvas renderer consumes engine-issued preview variants and delegate commands without mounting a WebGL sphere viewer
