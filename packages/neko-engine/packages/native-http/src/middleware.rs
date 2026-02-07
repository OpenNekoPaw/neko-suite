//! CORS and other middleware

use axum::Router;
use tower_http::cors::{Any, CorsLayer};

/// Apply middleware layers to the router
pub fn apply_middleware(app: Router) -> Router {
    app.layer(
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any),
    )
}
