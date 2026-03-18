//! API-key authentication middleware for the GUI HTTP server.
//!
//! All routes **except** `GET /gui/ping` are protected.  Requests must carry
//! the expected key in an `X-PM-API-Key` header.  A missing or wrong key gets
//! a `401 Unauthorized` JSON response.
//!
//! # Usage
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use axum::Router;
//!
//! let protected = Router::new()
//!     .route("/api/secret", get(secret_handler))
//!     .layer(axum::middleware::from_fn_with_state(
//!         Arc::new(Some("my-secret".to_string())),
//!         auth_middleware::require_api_key,
//!     ));
//!
//! let router = Router::new()
//!     .route("/gui/ping", get(ping_handler))
//!     .merge(protected);
//! ```

use std::sync::Arc;

use axum::{
    Json,
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;

/// Axum middleware that enforces `X-PM-API-Key` header authentication.
///
/// The expected key is carried in `State<Arc<Option<String>>>`.
/// - If the state holds `None` the middleware is a no-op (no key configured).
/// - Otherwise the request header must exactly match the expected value.
pub async fn require_api_key(
    State(expected_key): State<Arc<Option<String>>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if let Some(expected) = expected_key.as_ref() {
        let provided = request
            .headers()
            .get("X-PM-API-Key")
            .and_then(|v| v.to_str().ok());

        if provided != Some(expected.as_str()) {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "unauthorized" })),
            )
                .into_response();
        }
    }

    next.run(request).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode},
        routing::get,
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt; // for `oneshot`

    async fn dummy_handler() -> &'static str {
        "ok"
    }

    fn make_router(api_key: Option<String>) -> Router {
        let key_state = Arc::new(api_key);

        let protected = Router::new()
            .route("/protected", get(dummy_handler))
            .layer(axum::middleware::from_fn_with_state(
                key_state,
                require_api_key,
            ));

        Router::new()
            .route("/gui/ping", get(dummy_handler))
            .merge(protected)
    }

    async fn body_str(body: Body) -> String {
        let bytes = body.collect().await.unwrap().to_bytes();
        String::from_utf8_lossy(&bytes).to_string()
    }

    // ── Tests ────────────────────────────────────────────────────────────────

    /// A valid key gives 200.
    #[tokio::test]
    async fn valid_key_passes() {
        let router = make_router(Some("secret".to_string()));
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/protected")
                    .header("X-PM-API-Key", "secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    /// A missing key gives 401.
    #[tokio::test]
    async fn missing_key_gives_401() {
        let router = make_router(Some("secret".to_string()));
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/protected")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    /// A wrong key gives 401.
    #[tokio::test]
    async fn wrong_key_gives_401() {
        let router = make_router(Some("secret".to_string()));
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/protected")
                    .header("X-PM-API-Key", "wrong")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body = body_str(response.into_body()).await;
        assert!(body.contains("unauthorized"), "body: {body}");
    }

    /// GET /gui/ping is exempt — no key required.
    #[tokio::test]
    async fn ping_is_exempt() {
        let router = make_router(Some("secret".to_string()));
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/gui/ping")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
}
