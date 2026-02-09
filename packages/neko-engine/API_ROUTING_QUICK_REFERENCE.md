# Neko Engine API Quick Reference

## Request Format

```json
{
  "group": "videos",
  "action": "capture",
  "id": "resource-id-or-empty",
  "options": { /* action-specific options */ },
  "body": { /* optional body data */ }
}
```

## Response Format

```json
{
  "id": "resource-id",
  "status": "ok",
  "data": { /* response data */ },
  "error": { /* error if status is "error" */ }
}
```

## All Groups & Actions

| Group | Actions | Status | Pattern |
|-------|---------|--------|---------|
| **videos** | probe, capture, extract, stream, transcode, keyframes, waveform, proxy, stop, pause, resume, speed, seek, loop | ✅ Implemented | Resource-based |
| **audios** | probe, transcode, stream, waveform, stop, pause, resume, speed | ✅ Implemented | Resource-based |
| **images** | probe, capture, encode | ✅ Implemented | Resource-based |
| **timelines** | probe, composite, stream, stop, pause, resume, speed, loop, seek, export, export_progress, export_cancel | ✅ Implemented | Body-based |
| **tasks** | list, get, cancel | ✅ Implemented | Task management |
| **nodes** | health, metric | ✅ Implemented | System monitoring |
| **streams** | create, activate, pause, resume, destroy, list | ✅ Implemented | Lifecycle management |
| **models** | probe, capture, stream | ⏳ Placeholder | Reserved |
| **canvas** | composite, capture, export | ⏳ Placeholder | Reserved |
| **scenes** | composite, capture, stream | ⏳ Placeholder | Reserved |

## Common Request Examples

### Video: Probe
```json
{
  "group": "videos",
  "action": "probe",
  "options": { "source": "/path/to/video.mp4" }
}
```

### Video: Capture Frame
```json
{
  "group": "videos",
  "action": "capture",
  "options": {
    "source": "/path/to/video.mp4",
    "time": 5.0,
    "quality": 85,
    "format": "jpeg"
  }
}
```

### Audio: Transcode
```json
{
  "group": "audios",
  "action": "transcode",
  "options": {
    "source": "/path/to/audio.mp3",
    "output": "/path/to/output.aac",
    "codec": "aac",
    "bitrate": 128000
  }
}
```

### Timeline: Composite
```json
{
  "group": "timelines",
  "action": "composite",
  "options": { "frame": 30 },
  "body": {
    "duration": 10.0,
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30.0,
    "tracks": []
  }
}
```

### Timeline: Export
```json
{
  "group": "timelines",
  "action": "export",
  "body": {
    "timeline": { /* Timeline data */ },
    "output": "/path/to/output.mp4",
    "settings": {
      "codec": "h264",
      "preset": "medium",
      "bitrate": 5000000
    }
  }
}
```

### Stream Control
```json
{
  "group": "videos",
  "action": "pause",
  "options": { "stream_id": "stream-123" }
}
```

## Error Codes

| ApiError | ErrorCode | HTTP Equivalent |
|----------|-----------|-----------------|
| NotFound | ResourceNotFound | 404 |
| InvalidRequest | InvalidParameter | 400 |
| UnknownAction | InvalidParameter | 400 |
| ServiceError | InternalError | 500 |
| StreamError | StreamNotFound | 404 |
| SerializationError | ValidationError | 400 |
| Internal | InternalError | 500 |

## Resource Resolution Pattern

Controllers support **self-healing** resource resolution:

1. **By ID:** `"id": "resource-abc123"`
2. **By Path:** `"options": { "source": "/path/to/file.mp4" }`
3. **Fallback:** If ID not found, re-register by path

## File Locations

```
packages/native-api/src/
├── engine.rs              # EngineApi - Main entry point
├── router.rs              # ActionRouter - Dispatcher
├── error.rs               # Error types
└── controllers/
    ├── video.rs           # videos:*
    ├── audio.rs           # audios:*
    ├── image.rs           # images:*
    ├── timeline.rs        # timelines:*
    ├── task.rs            # tasks:*
    ├── node.rs            # nodes:*
    ├── stream.rs          # streams:*
    ├── models.rs          # models:* (placeholder)
    ├── canvas.rs          # canvas:* (placeholder)
    └── scenes.rs          # scenes:* (placeholder)
```

## Adding New Actions

### 1. Add to Controller
```rust
impl Controller for VideoController {
    async fn handle(&self, action: &str, ...) -> ApiResult<ActionResponse> {
        match action {
            // ... existing actions
            "new_action" => {
                // Implementation
                Ok(ActionResponse::ok("", response_data))
            }
            _ => Err(ApiError::UnknownAction { group, action })
        }
    }

    fn actions(&self) -> &'static [&'static str] {
        &["probe", "capture", /* ... */, "new_action"]
    }
}
```

### 2. Add Tests
```rust
#[tokio::test]
async fn test_new_action() {
    let controller = create_test_controller();
    let result = controller.handle("new_action", None, opts, None).await;
    assert!(result.is_ok());
}
```

## Key Design Principles

1. ✅ **Trait-based** - All controllers implement `Controller` trait
2. ✅ **Async-first** - All operations are async
3. ✅ **Type-safe** - Rust type system + serde validation
4. ✅ **Self-healing** - Resource resolution by ID or path
5. ✅ **Testable** - Each controller has unit tests
6. ✅ **Extensible** - Easy to add new groups/actions
7. ✅ **Consistent** - Uniform error handling and response format
