# Neko Engine API Routing Structure Analysis

## Overview

The neko-engine uses a **Controller-based MVC architecture** with an action dispatch pattern. The routing system maps `group:action` requests to specific controller methods.

## Architecture Layers

```
View Layer (native-napi, native-cli, native-http)
    │
    ▼ ActionRequest / ActionResponse
┌─────────────────────────────────────────┐
│           Controller Layer               │
│  EngineApi → ActionRouter → Controllers  │
│  ResourceRegistry │ StreamRegistry       │
└─────────────────────────────────────────┘
    │
    ▼ Service trait calls
Model Layer (native-core services)
```

## File Structure

```
packages/native-api/src/
├── lib.rs                    # Public API exports
├── engine.rs                 # EngineApi - Main facade
├── router.rs                 # ActionRouter - Request dispatcher
├── error.rs                  # ApiError types
├── session.rs                # Session management
├── registry/
│   ├── resource.rs           # ResourceRegistry (deterministic IDs)
│   └── stream.rs             # StreamRegistry (broadcast channels)
└── controllers/
    ├── mod.rs                # Controller trait definition
    ├── video.rs              # VideoController
    ├── audio.rs              # AudioController
    ├── image.rs              # ImageController
    ├── timeline.rs           # TimelineController
    ├── task.rs               # TaskController
    ├── node.rs               # NodeController
    ├── stream.rs             # StreamController
    ├── models.rs             # ModelsController (placeholder)
    ├── canvas.rs             # CanvasController (placeholder)
    ├── scenes.rs             # ScenesController (placeholder)
    └── utils.rs              # Shared utilities (base64 encoding)
```

## Core Types

### ActionRequest (from neko-types)
```rust
pub struct ActionRequest {
    pub group: String,      // e.g., "videos", "audios", "timelines"
    pub action: String,     // e.g., "probe", "capture", "stream"
    pub id: String,         // Optional resource ID
    pub options: Value,     // JSON options
    pub body: Option<Value> // Optional JSON body
}
```

### ActionResponse (from neko-types)
```rust
pub struct ActionResponse {
    pub id: String,
    pub status: String,     // "ok" or "error"
    pub data: Option<Value>,
    pub error: Option<ApiError>
}
```

## Controller Pattern

### Controller Trait
```rust
pub trait Controller: Send + Sync {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse>;

    fn group(&self) -> &'static str;
    fn actions(&self) -> &'static [&'static str];
}
```

### Typical Controller Structure
```rust
pub struct VideoController {
    video_service: Arc<VideoService>,
    resource_registry: Arc<ResourceRegistry>,
}

impl Controller for VideoController {
    async fn handle(&self, action: &str, ...) -> ApiResult<ActionResponse> {
        match action {
            "probe" => { /* implementation */ },
            "capture" => { /* implementation */ },
            // ... more actions
            _ => Err(ApiError::UnknownAction { group, action })
        }
    }

    fn group(&self) -> &'static str { "videos" }

    fn actions(&self) -> &'static [&'static str] {
        &["probe", "capture", "extract", "stream", ...]
    }
}
```

## Registered Groups and Actions

### 1. **videos** (VideoController)
**Actions:**
- `probe` - Get video metadata
- `capture` - Extract single frame at time
- `extract` - Extract subtitles or frame range
- `stream` - Start video stream
- `transcode` - Transcode video
- `keyframes` - Get keyframe list
- `waveform` - Generate audio waveform
- `proxy` - Generate proxy file
- `stop` - Stop stream
- `pause` - Pause stream
- `resume` - Resume stream
- `speed` - Set playback speed
- `seek` - Seek to time
- `loop` - Set loop region

**Pattern:** Resource-based with self-healing (resolve by ID or source path)

**Request Options Examples:**
```rust
// Probe
{ "source": "/path/to/video.mp4" }

// Capture
{
    "source": "/path/to/video.mp4",
    "time": 5.0,
    "quality": 85,
    "format": "jpeg",
    "width": 1920,
    "height": 1080
}

// Stream control
{
    "stream_id": "stream-123",
    "speed": 1.5
}
```

---

### 2. **audios** (AudioController)
**Actions:**
- `probe` - Get audio metadata
- `transcode` - Transcode audio
- `stream` - Start audio stream
- `waveform` - Generate waveform
- `stop` - Stop stream
- `pause` - Pause stream
- `resume` - Resume stream
- `speed` - Set playback speed

**Pattern:** Similar to videos, resource-based with self-healing

**Request Options Examples:**
```rust
// Transcode
{
    "source": "/path/to/audio.mp3",
    "output": "/path/to/output.aac",
    "codec": "aac",
    "bitrate": 128000,
    "sample_rate": 48000,
    "channels": 2
}
```

---

### 3. **images** (ImageController)
**Actions:**
- `probe` - Get image metadata
- `capture` - Capture/resize image
- `encode` - Encode RGBA to JPEG

**Pattern:** Resource-based with self-healing

**Request Options Examples:**
```rust
// Encode
{
    "data": "base64-encoded-rgba-data",
    "width": 1920,
    "height": 1080,
    "quality": 85
}
```

---

### 4. **timelines** (TimelineController)
**Actions:**
- `probe` - Probe .jvi timeline file
- `composite` - Composite single frame
- `stream` - Start timeline stream
- `stop` - Stop stream
- `pause` - Pause stream
- `resume` - Resume stream
- `speed` - Set playback speed
- `loop` - Set loop region
- `seek` - Seek to time
- `export` - Export timeline to video
- `export_progress` - Get export progress
- `export_cancel` - Cancel export

**Pattern:** Body-based (Timeline data in request body)

**Request Examples:**
```rust
// Composite
{
    "options": { "frame": 30 },
    "body": {
        "duration": 10.0,
        "resolution": { "width": 1920, "height": 1080 },
        "fps": 30.0,
        "tracks": [...]
    }
}

// Export
{
    "body": {
        "timeline": { /* Timeline data */ },
        "output": "/path/to/output.mp4",
        "settings": { /* ExportSettings */ }
    }
}
```

---

### 5. **tasks** (TaskController)
**Actions:**
- `list` - List all tasks
- `get` - Get task by ID
- `cancel` - Cancel task

**Pattern:** Task management

---

### 6. **nodes** (NodeController)
**Actions:**
- `health` - Health check
- `metric` - Get metrics

**Pattern:** System monitoring

---

### 7. **streams** (StreamController)
**Actions:**
- `create` - Create stream
- `activate` - Activate stream
- `pause` - Pause stream
- `resume` - Resume stream
- `destroy` - Destroy stream
- `list` - List streams

**Pattern:** Stream lifecycle management

---

### 8. **models** (ModelsController) - PLACEHOLDER
**Actions:**
- `probe`
- `capture`
- `stream`

**Status:** Not yet implemented (returns ServiceError)

---

### 9. **canvas** (CanvasController) - PLACEHOLDER
**Actions:**
- `composite`
- `capture`
- `export`

**Status:** Not yet implemented (returns ServiceError)

---

### 10. **scenes** (ScenesController) - PLACEHOLDER
**Actions:**
- `composite`
- `capture`
- `stream`

**Status:** Not yet implemented (returns ServiceError)

---

## Request Flow

```
1. Client creates ActionRequest
   ↓
2. EngineApi.dispatch(request)
   ↓
3. ActionRouter.route(request)
   ↓
4. Match request.group → Select Controller
   ↓
5. Controller.handle(action, resource_id, options, body)
   ↓
6. Match action → Execute logic
   ↓
7. Call Service layer (VideoService, AudioService, etc.)
   ↓
8. Return ActionResponse
```

## Error Handling

### ApiError Types
```rust
pub enum ApiError {
    NotFound(String),              // Resource not found
    InvalidRequest(String),        // Invalid parameters
    UnknownAction { group, action }, // Unknown action
    ServiceError(String),          // Service layer error
    StreamError(String),           // Stream error
    SerializationError(String),    // JSON error
    Internal(String),              // Internal error
}
```

### Error Codes (mapped to neko-types::ErrorCode)
- `NotFound` → `ResourceNotFound`
- `InvalidRequest` → `InvalidParameter`
- `UnknownAction` → `InvalidParameter`
- `ServiceError` → `InternalError`
- `StreamError` → `StreamNotFound`
- `SerializationError` → `ValidationError`

## Resource Management

### ResourceRegistry
- **Purpose:** Deterministic resource ID generation
- **Pattern:** `resource_id = hash(file_path)`
- **Self-healing:** Can resolve by ID or re-register by path
- **Used by:** VideoController, AudioController, ImageController

### StreamRegistry
- **Purpose:** Manage per-stream broadcast channels
- **Pattern:** `stream_id = uuid`
- **Lifecycle:** create → activate → pause/resume → destroy
- **Used by:** StreamController, video/audio/timeline streams

## Common Patterns

### 1. Resource Resolution (Self-Healing)
```rust
async fn resolve_resource(&self, id: Option<&str>, source: Option<&str>) -> ApiResult<ResourceId> {
    // Try ID first
    if let Some(id_str) = id {
        let resource_id = ResourceId::from_string(id_str);
        if self.resource_registry.resolve(&resource_id).await.is_some() {
            return Ok(resource_id);
        }
    }

    // Fall back to source path (self-healing)
    if let Some(source_path) = source {
        let path = Path::new(source_path);
        let resource_id = self.resource_registry.register(path).await;
        return Ok(resource_id);
    }

    Err(ApiError::InvalidRequest("Either resource_id or source path required"))
}
```

### 2. Options Deserialization
```rust
#[derive(Debug, Deserialize, Default)]
struct CaptureRequestOptions {
    source: Option<String>,
    time: f64,
    #[serde(default = "default_quality")]
    quality: u32,
    format: String,
}

fn default_quality() -> u32 { 85 }

// Usage
let opts: CaptureRequestOptions = serde_json::from_value(options).unwrap_or_default();
```

### 3. Base64 Encoding (for binary data transport)
```rust
use crate::controllers::utils::base64_encode;

let response = serde_json::json!({
    "width": frame_data.width,
    "height": frame_data.height,
    "data": base64_encode(&frame_data.data),
});
```

## Diff Endpoint Patterns (NOT YET IMPLEMENTED)

Based on the `mediaDiffProtocol.ts` types, here's what a future diff implementation might look like:

### Potential Groups:
- **mediaDiff** - Media comparison operations

### Potential Actions:
- `init` - Initialize Git-based diff
- `initLocal` - Initialize local file diff
- `setViewMode` - Change view mode
- `seek` - Seek to time
- `getFrame` - Get frame at time
- `cancel` - Cancel analysis

### Request Pattern:
```rust
// InitDiffRequest
{
    "group": "mediaDiff",
    "action": "init",
    "options": {
        "fileUri": "file:///path/to/video.mp4",
        "ref": "HEAD"
    }
}

// InitLocalDiffRequest
{
    "group": "mediaDiff",
    "action": "initLocal",
    "options": {
        "currentUri": "file:///path/to/current.mp4",
        "previousUri": "file:///path/to/previous.mp4"
    }
}
```

### Response Pattern:
```rust
// DiffResultResponse
{
    "status": "ok",
    "data": {
        "mediaType": "video",
        "similarity": 0.85,
        "details": {
            "duration": { "current": 10.5, "previous": 10.0 },
            "resolution": {
                "current": { "width": 1920, "height": 1080 },
                "previous": { "width": 1280, "height": 720 }
            },
            "keyframeDiffs": [
                { "time": 0.0, "similarity": 0.95 },
                { "time": 1.0, "similarity": 0.82 }
            ]
        }
    }
}
```

## Testing Strategy

### Unit Tests
Each controller has tests for:
- Unknown action handling
- Missing required parameters
- Invalid input validation
- Action list verification

### Integration Tests
Router tests verify:
- Correct controller selection
- Group listing
- Action listing per group
- Error propagation

## Key Design Decisions

1. **Trait-based Controllers** - Uniform interface, easy to add new groups
2. **Self-healing Resources** - Can recover from ID loss by re-registering path
3. **Async-first** - All operations are async for I/O efficiency
4. **JSON Options** - Flexible, extensible parameter passing
5. **Base64 Binary Transport** - Safe for JSON serialization
6. **Placeholder Controllers** - Reserve namespace for future features
7. **Centralized Error Handling** - Consistent error responses

## Adding a New Group

To add a new group (e.g., `mediaDiff`):

1. **Create controller file:** `src/controllers/media_diff.rs`
```rust
pub struct MediaDiffController {
    // dependencies
}

impl Controller for MediaDiffController {
    async fn handle(&self, action: &str, ...) -> ApiResult<ActionResponse> {
        match action {
            "init" => { /* implementation */ },
            "initLocal" => { /* implementation */ },
            _ => Err(ApiError::UnknownAction { group: "mediaDiff", action })
        }
    }

    fn group(&self) -> &'static str { "mediaDiff" }
    fn actions(&self) -> &'static [&'static str] {
        &["init", "initLocal", "setViewMode", "seek", "getFrame", "cancel"]
    }
}
```

2. **Export in mod.rs:**
```rust
mod media_diff;
pub use media_diff::MediaDiffController;
```

3. **Register in router.rs:**
```rust
pub struct ActionRouter {
    // ... existing controllers
    media_diff_controller: MediaDiffController,
}

impl ActionRouter {
    pub fn new(...) -> Self {
        Self {
            // ... existing
            media_diff_controller: MediaDiffController::new(...),
        }
    }

    pub async fn route(&self, request: ActionRequest) -> ApiResult<ActionResponse> {
        match request.group.as_str() {
            // ... existing groups
            "mediaDiff" => {
                self.media_diff_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            _ => Err(ApiError::UnknownAction { group, action })
        }
    }

    pub fn groups(&self) -> Vec<&str> {
        vec![
            // ... existing
            "mediaDiff",
        ]
    }

    pub fn actions(&self, group: &str) -> Option<&'static [&'static str]> {
        match group {
            // ... existing
            "mediaDiff" => Some(self.media_diff_controller.actions()),
            _ => None,
        }
    }
}
```

4. **Add tests:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_media_diff_controller_init() {
        let controller = MediaDiffController::new(...);
        let opts = serde_json::json!({
            "fileUri": "file:///test.mp4",
            "ref": "HEAD"
        });
        let result = controller.handle("init", None, opts, None).await;
        assert!(result.is_ok());
    }
}
```

## Summary

The neko-engine API routing is:
- **Well-structured** - Clear separation of concerns
- **Extensible** - Easy to add new groups/actions
- **Type-safe** - Rust's type system prevents many errors
- **Testable** - Each layer can be tested independently
- **Self-documenting** - Controllers declare their actions
- **Consistent** - All groups follow the same pattern

The architecture is ready for adding a `mediaDiff` group following the established patterns.
