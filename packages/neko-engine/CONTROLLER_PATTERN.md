# Neko Engine Controller Implementation Pattern

## Overview

This document describes the exact pattern for implementing controllers in neko-engine's MVC architecture.

## Architecture Flow

```
ActionRequest → ActionRouter → Controller → Service Layer → Domain Logic
```

## Controller Trait Definition

Location: `packages/native-api/src/controllers/mod.rs`

```rust
pub trait Controller: Send + Sync {
    /// Handle an action
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse>;

    /// Get the group name this controller handles
    fn group(&self) -> &'static str;

    /// List supported actions
    fn actions(&self) -> &'static [&'static str];
}
```

## Complete Controller Implementation Pattern

### 1. File Structure

```rust
//! [Group]Controller - handles [group]:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::ResourceRegistry;
use neko_native_core::services::{I[Group]Service, [Group]Service};
use neko_types::{ActionResponse, ResourceId};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
```

### 2. Controller Struct

```rust
/// Controller for [group]-related actions
pub struct [Group]Controller {
    [group]_service: Arc<[Group]Service>,
    resource_registry: Arc<ResourceRegistry>,  // Optional, for resource-based controllers
}

impl [Group]Controller {
    /// Create a new [Group]Controller
    pub fn new(
        [group]_service: Arc<[Group]Service>,
        resource_registry: Arc<ResourceRegistry>,
    ) -> Self {
        Self {
            [group]_service,
            resource_registry,
        }
    }

    /// Resolve resource: either by ID or by source path (self-healing)
    async fn resolve_resource(
        &self,
        id: Option<&str>,
        source: Option<&str>,
    ) -> ApiResult<ResourceId> {
        if let Some(id_str) = id {
            let resource_id = ResourceId::from_string(id_str.to_string());
            if self.resource_registry.resolve(&resource_id).await.is_some() {
                return Ok(resource_id);
            }
        }

        if let Some(source_path) = source {
            let path = Path::new(source_path);
            let resource_id = self.resource_registry.register(path).await;
            return Ok(resource_id);
        }

        Err(ApiError::InvalidRequest(
            "Either resource_id or source path required".to_string(),
        ))
    }
}
```

### 3. Request Options Structs

Define one struct per action with `#[derive(Debug, Deserialize, Default)]`:

```rust
/// Options for [group]:[action]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]  // Use camelCase for JSON compatibility
struct [Action]RequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,

    /// Action-specific parameters
    #[serde(default = "default_quality")]
    quality: u32,

    // ... other fields
}

fn default_quality() -> u32 {
    85
}
```

### 4. Controller Trait Implementation

```rust
impl Controller for [Group]Controller {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "action1" => {
                // 1. Parse options
                let opts: Action1RequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                // 2. Resolve resource (if needed)
                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                // 3. Call service layer
                let result = self.[group]_service.action1(&res_id, opts).await?;

                // 4. Build response
                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "result": result,
                    "success": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            "action2" => {
                // Similar pattern...
            }
            _ => Err(ApiError::UnknownAction {
                group: "[group]".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        "[group]"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["action1", "action2", "action3"]
    }
}
```

### 5. Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use neko_native_core::services::TaskService;

    fn create_test_controller() -> [Group]Controller {
        let task_service = Arc::new(TaskService::new());
        let [group]_service = Arc::new([Group]Service::new(None, task_service));
        let resource_registry = Arc::new(ResourceRegistry::new());
        [Group]Controller::new([group]_service, resource_registry)
    }

    #[tokio::test]
    async fn test_[group]_controller_action1_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("action1", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_[group]_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_[group]_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();

        assert!(actions.contains(&"action1"));
        assert!(actions.contains(&"action2"));
        assert_eq!(actions.len(), 2);
    }
}
```

## Router Registration

Location: `packages/native-api/src/router.rs`

### 1. Add Controller Field

```rust
pub struct ActionRouter {
    // ... existing controllers
    [group]_controller: [Group]Controller,
}
```

### 2. Initialize in Constructor

```rust
impl ActionRouter {
    pub fn new(
        // ... existing services
        [group]_service: Arc<[Group]Service>,
        resource_registry: Arc<ResourceRegistry>,
    ) -> Self {
        Self {
            // ... existing controllers
            [group]_controller: [Group]Controller::new([group]_service, resource_registry),
        }
    }
}
```

### 3. Add Route Case

```rust
pub async fn route(&self, request: ActionRequest) -> ApiResult<ActionResponse> {
    // ...
    match request.group.as_str() {
        // ... existing groups
        "[group]" => {
            self.[group]_controller
                .handle(&request.action, resource_id, request.options, request.body)
                .await
        }
        _ => Err(ApiError::UnknownAction {
            group: request.group.clone(),
            action: request.action.clone(),
        }),
    }
}
```

### 4. Add to Groups List

```rust
pub fn groups(&self) -> Vec<&str> {
    vec![
        // ... existing groups
        "[group]",
    ]
}

pub fn actions(&self, group: &str) -> Option<&'static [&'static str]> {
    match group {
        // ... existing groups
        "[group]" => Some(self.[group]_controller.actions()),
        _ => None,
    }
}
```

## Error Handling Pattern

### Error Types (from `error.rs`)

```rust
pub enum ApiError {
    NotFound(String),           // Resource not found
    InvalidRequest(String),     // Invalid parameters
    UnknownAction { group: String, action: String },
    ServiceError(String),       // Service layer error
    StreamError(String),        // Stream-related error
    SerializationError(String), // JSON serialization error
    Internal(String),           // Internal error
}
```

### Usage Pattern

```rust
// Validate required parameters
let param = opts.param.ok_or_else(|| {
    ApiError::InvalidRequest("param required for [group]:[action]".to_string())
})?;

// Service errors are auto-converted via From trait
let result = self.service.method().await?;

// Manual error conversion
.map_err(|e| ApiError::ServiceError(format!("Operation failed: {}", e)))?
```

## Response Construction Pattern

### Success Response

```rust
let response = serde_json::json!({
    "resourceId": res_id.as_str(),
    "field1": value1,
    "field2": value2,
    "success": true,
});

Ok(ActionResponse::ok("", response))
```

### With Base64 Encoding (for binary data)

```rust
use crate::controllers::utils::base64_encode;

let response = serde_json::json!({
    "data": base64_encode(&binary_data),
    "size": binary_data.len(),
});
```

### With Type Conversion

```rust
let typed_data: Vec<neko_types::SomeType> = internal_data
    .into_iter()
    .map(|item| neko_types::SomeType {
        field1: item.field1,
        field2: item.field2,
    })
    .collect();

let response = serde_json::json!({
    "items": serde_json::to_value(&typed_data)?,
});
```

## Common Patterns

### 1. Resource Resolution (Self-Healing)

```rust
// Try resource_id first, fall back to source path
let res_id = self
    .resolve_resource(resource_id, opts.source.as_deref())
    .await?;
```

### 2. Probe Action (Register Resource)

```rust
"probe" => {
    let opts: ProbeOptions = serde_json::from_value(options).unwrap_or_default();

    let source = opts.source.as_deref().or(resource_id).ok_or_else(|| {
        ApiError::InvalidRequest("source path required for [group]:probe".to_string())
    })?;

    let path = Path::new(source);
    let media_info = self.[group]_service.probe(path).await?;

    // Register the resource
    let id = self.resource_registry.register(path).await;

    // Include resource_id in response
    let mut response = serde_json::to_value(media_info)?;
    if let Value::Object(ref mut map) = response {
        map.insert("resourceId".to_string(), Value::String(id.as_str().to_string()));
    }

    Ok(ActionResponse::ok("", response))
}
```

### 3. Stream Control Actions

```rust
"stop" | "pause" | "resume" | "speed" => {
    let opts: StreamControlOptions =
        serde_json::from_value(options).unwrap_or_default();

    let stream_id_str = opts.stream_id.ok_or_else(|| {
        ApiError::InvalidRequest(format!("stream_id required for [group]:{}", action))
    })?;
    let stream_id = StreamId::from_string(stream_id_str);

    match action {
        "stop" => {
            self.[group]_service.stop_stream(&stream_id).await?;
            let response = serde_json::json!({
                "streamId": stream_id.as_str(),
                "status": "stopped",
            });
            Ok(ActionResponse::ok("", response))
        }
        // ... other control actions
        _ => unreachable!(),
    }
}
```

### 4. Format Parsing

```rust
let format = match opts.format.to_lowercase().as_str() {
    "jpeg" | "jpg" => FrameFormat::Jpeg,
    "png" => FrameFormat::Png,
    "rgba" => FrameFormat::Rgba,
    _ => FrameFormat::Jpeg,  // Default
};
```

## Example: Complete VideoController Action

```rust
"capture" => {
    // 1. Parse options with defaults
    let opts: CaptureRequestOptions =
        serde_json::from_value(options).unwrap_or_default();

    // 2. Resolve resource (self-healing)
    let res_id = self
        .resolve_resource(resource_id, opts.source.as_deref())
        .await?;

    // 3. Parse format enum
    let format = match opts.format.to_lowercase().as_str() {
        "jpeg" | "jpg" => FrameFormat::Jpeg,
        "png" => FrameFormat::Png,
        "rgba" => FrameFormat::Rgba,
        _ => FrameFormat::Jpeg,
    };

    // 4. Build service options
    let capture_opts = CaptureOptions {
        quality: opts.quality,
        format,
        width: opts.width,
        height: opts.height,
    };

    // 5. Call service layer
    let frame_data = self.video_service
        .capture(&res_id, opts.time, capture_opts)
        .await?;

    // 6. Build response with base64 encoding
    let response = serde_json::json!({
        "resourceId": res_id.as_str(),
        "width": frame_data.width,
        "height": frame_data.height,
        "format": format!("{:?}", frame_data.format).to_lowercase(),
        "timestamp": frame_data.timestamp,
        "size": frame_data.data.len(),
        "data": base64_encode(&frame_data.data),
    });

    Ok(ActionResponse::ok("", response))
}
```

## Key Principles

1. **Separation of Concerns**: Controllers handle HTTP/JSON concerns, services handle business logic
2. **Self-Healing Resources**: Support both resource_id and source path for resilience
3. **Type Safety**: Use strongly-typed option structs with serde
4. **Error Propagation**: Use `?` operator with proper error conversion
5. **Consistent Response Format**: Always include relevant IDs and status
6. **Default Values**: Use `#[serde(default)]` and default functions
7. **Base64 Encoding**: Use for binary data in JSON responses
8. **Comprehensive Testing**: Test missing parameters, unknown actions, and happy paths

## Checklist for New Controller

- [ ] Create controller file in `packages/native-api/src/controllers/`
- [ ] Define controller struct with service and registry dependencies
- [ ] Implement `resolve_resource()` helper (if resource-based)
- [ ] Define option structs for each action
- [ ] Implement `Controller` trait with action dispatch
- [ ] Add unit tests for error cases and action list
- [ ] Register in `mod.rs` exports
- [ ] Add to `ActionRouter` struct, constructor, and route match
- [ ] Add to `groups()` and `actions()` methods
- [ ] Update router tests
