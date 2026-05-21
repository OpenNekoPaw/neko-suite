# Domain Taxonomy Decision

Initial normalized creative domains:

- `scene`: engine-facing 3D scene/model domain. Existing operation tools keep using `model`.
- `puppet`: engine-facing 2D puppet domain. Existing operation tools keep using `puppet`.
- `sketch`: 2D raster/vector sketch domain.
- `canvas`: infinite-canvas composition domain.
- `timeline`: timeline editing domain.
- `audio`: audio editing/analysis domain.
- `project`: project/file organization domain.
- `mixed`: cross-domain orchestration where a single service port is not enough.

Mapping:

- operation `model` -> creative `scene`, service port id `scene-render`
- operation `puppet` -> creative `puppet`, service port id `puppet-render`
- operation `sketch` -> creative `sketch`
- operation `canvas` -> creative `canvas`
- operation `timeline` -> creative `timeline`
- operation `audio` -> creative `audio`
- operation `project` -> creative `project`

Engine provider registrations:

- `InspectScene3D` -> creative `scene`, service port id `scene-render`
- `InspectPuppet2D` -> creative `puppet`, service port id `puppet-render`
- audio analysis/transcription tools -> creative `audio`, service port id `audio-render`
- media/effects/frame tools -> creative `timeline`, service port id `media-render`

The metadata is serializable orchestration data. It does not expose concrete
runtime services, Bevy/ECS world handles, or renderer implementations to the
Intent layer.
