# Animation Compatibility Audit

## runtime-scene

- `SceneBlendLayer::new(clip_index, elapsed_seconds, weight, looping)` must remain available.
- `SceneBlendLayer::elapsed_seconds()` must return seconds.
- `SceneBlendLayer::set_elapsed_seconds(elapsed_seconds)` must accept seconds.
- `SceneBlendLayer` must dereference to `AnimationBlendLayer` so existing field access such as `clip_index`, `weight`, and `looping` keeps compiling.
- `SceneBlendLayerInfo::new(clip_name, elapsed_seconds, weight, looping)` must remain available.
- `SceneBlendLayerInfo::clip_name()`, `elapsed_seconds()`, `weight()`, and `looping()` must remain available.
- `SceneBlendLayerInfo` serialized shape must remain `{ clip_name, elapsed, weight, looping }`, where `elapsed` is seconds.
- `SceneAnimationBlendState::new(layers)` and `Default` must remain available.
- `SceneAnimationBlendState` must dereference to `AnimationBlendState<SceneBlendLayer>`.
- `SceneCrossfadeRequest::new(target_clip_index, fade_duration_seconds, fade_elapsed_seconds, loop_anim)` must remain available.
- `SceneCrossfadeRequest::fade_duration_seconds()`, `fade_elapsed_seconds()`, and `advance_seconds(delta_seconds)` must remain available.
- `SceneCrossfadeRequest` must dereference to `AnimationCrossfadeRequest`.

## runtime-puppet

- `BlendLayer::new(clip_index, elapsed_ms, weight, looping)` must remain available.
- `BlendLayer::elapsed_ms()` must return milliseconds.
- `BlendLayer::set_elapsed_ms(elapsed_ms)` must accept milliseconds.
- `BlendLayer` must dereference to `AnimationBlendLayer` so existing field access such as `clip_index`, `weight`, and `looping` keeps compiling.
- `BlendLayerInfo::new(clip_name, elapsed_ms, weight, looping)` must remain available.
- `BlendLayerInfo::clip_name()`, `elapsed_ms()`, `weight()`, and `looping()` must remain available.
- `BlendLayerInfo` serialized shape must remain `{ clip_name, elapsed_ms, weight, looping }`, where `elapsed_ms` is milliseconds.
- `AnimationBlendStateComponent::new(layers)` and `Default` must remain available.
- `AnimationBlendStateComponent` must dereference to `AnimationBlendState<BlendLayer>`.
- `pub use AnimationBlendStateComponent as AnimationBlendState` must remain available.
- `CrossfadeRequest::new(target_clip_index, fade_duration_ms, fade_elapsed_ms, loop_anim)` must remain available.
- `CrossfadeRequest::fade_duration_ms()`, `fade_elapsed_ms()`, and `advance_ms(delta_ms)` must remain available.
- `CrossfadeRequest` must dereference to `AnimationCrossfadeRequest`.
