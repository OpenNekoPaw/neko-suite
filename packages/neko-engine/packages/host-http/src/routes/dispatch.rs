//! Dispatch endpoints — route HTTP requests to EngineApi
//!
//! - POST /v1/dispatch — Generic ActionRequest dispatch
//! - POST /v1/:group — Group-level dispatch (action in body)
//! - POST /v1/:group/:id/:action — RESTful resource-level dispatch

use axum::extract::{Path, State};
use axum::Json;
use neko_native_api::EngineApi;
use neko_types::{ActionRequest, ActionResponse, ApiError, ErrorCode};
use serde_json::Value;
use std::sync::Arc;

/// Acquire the global admission semaphore and dispatch.
/// Returns 503 Service Unavailable if all permits are held.
async fn dispatch_with_admission(
    engine: &Arc<EngineApi>,
    request: ActionRequest,
) -> ActionResponse {
    let permit = match engine.admission_semaphore().try_acquire() {
        Ok(permit) => permit,
        Err(_) => {
            tracing::warn!(
                "Admission semaphore full, rejecting {}:{}",
                request.group,
                request.action,
            );
            return ActionResponse::from_error(
                request.id,
                ApiError::new(
                    ErrorCode::ServiceOverloaded,
                    "Server is busy, please retry later",
                ),
            );
        }
    };
    let response = engine.dispatch(request).await;
    drop(permit);
    response
}

/// POST /v1/dispatch
///
/// Generic dispatch: the full ActionRequest is in the JSON body.
pub async fn handle_dispatch(
    State(engine): State<Arc<EngineApi>>,
    Json(request): Json<ActionRequest>,
) -> Json<ActionResponse> {
    Json(dispatch_with_admission(&engine, request).await)
}

/// POST /v1/:group
///
/// Group-level dispatch: group from URL path, action and other fields from body.
pub async fn handle_group_dispatch(
    State(engine): State<Arc<EngineApi>>,
    Path(group): Path<String>,
    Json(mut request): Json<ActionRequest>,
) -> Json<ActionResponse> {
    request.group = group;
    Json(dispatch_with_admission(&engine, request).await)
}

/// Request body for resource-level dispatch (options + body only)
#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDispatchBody {
    #[serde(default)]
    options: Value,
    #[serde(default)]
    body: Option<Value>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    stream_id: Option<String>,
}

/// POST /v1/:group/:id/:action
///
/// RESTful resource-level dispatch: group, id, action from URL path.
pub async fn handle_resource_dispatch(
    State(engine): State<Arc<EngineApi>>,
    Path((group, id, action)): Path<(String, String, String)>,
    body: Option<Json<ResourceDispatchBody>>,
) -> Json<ActionResponse> {
    let body = body.map(|Json(b)| b).unwrap_or_default();

    let request = ActionRequest {
        group,
        id,
        action,
        source: body.source,
        session_id: body.session_id,
        stream_id: body.stream_id,
        options: body.options,
        body: body.body,
    };

    Json(dispatch_with_admission(&engine, request).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_types::ActionRequest;

    fn test_engine() -> Arc<EngineApi> {
        Arc::new(EngineApi::without_gpu().unwrap())
    }

    #[tokio::test]
    async fn test_handle_dispatch_health() {
        let engine = test_engine();
        let request = ActionRequest::new("nodes", "health");

        let Json(response) = handle_dispatch(State(engine), Json(request)).await;
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_handle_dispatch_unknown() {
        let engine = test_engine();
        let request = ActionRequest::new("unknown", "test");

        let Json(response) = handle_dispatch(State(engine), Json(request)).await;
        assert!(response.is_error());
    }

    #[tokio::test]
    async fn test_handle_group_dispatch() {
        let engine = test_engine();
        let mut request = ActionRequest::new("", "health");
        // group will be overridden by path
        request.group = "should_be_overridden".to_string();

        let Json(response) =
            handle_group_dispatch(State(engine), Path("nodes".to_string()), Json(request)).await;
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_handle_resource_dispatch() {
        let engine = test_engine();

        let Json(response) = handle_resource_dispatch(
            State(engine),
            Path(("nodes".to_string(), "".to_string(), "health".to_string())),
            None,
        )
        .await;
        assert!(response.is_ok());
    }
}
