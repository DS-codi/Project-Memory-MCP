//! NDJSON transport layer for form communication.
//!
//! Provides the [`FormTransport`] trait and [`StdioTransport`] implementation
//! for reading/writing form messages over stdin/stdout.

mod ndjson;
mod stdio;

pub use ndjson::{ndjson_decode, ndjson_encode};
pub use stdio::StdioTransport;

use async_trait::async_trait;

use crate::protocol::envelope::{FormRequest, FormResponse};
use crate::protocol::refinement::{FormRefinementRequest, FormRefinementResponse};

/// Abstraction over the NDJSON transport channel between Supervisor and GUI.
///
/// The primary implementation is [`StdioTransport`] (stdin/stdout for
/// Supervisor-spawned child processes). Additional implementations (TCP,
/// Unix socket) can be added by downstream consumers.
#[async_trait]
pub trait FormTransport: Send + Sync {
    /// Read a [`FormRequest`] from the transport (GUI reads from Supervisor).
    async fn read_request(&mut self) -> Result<FormRequest, TransportError>;

    /// Write a [`FormResponse`] to the transport (GUI writes to Supervisor).
    async fn write_response(&mut self, response: &FormResponse) -> Result<(), TransportError>;

    /// Read a [`FormRefinementResponse`] (GUI reads updated questions from Supervisor).
    async fn read_refinement_response(
        &mut self,
    ) -> Result<FormRefinementResponse, TransportError>;

    /// Write a [`FormRefinementRequest`] (Supervisor-side convenience; not used by GUI).
    async fn write_refinement_request(
        &mut self,
        request: &FormRefinementRequest,
    ) -> Result<(), TransportError>;
}

/// Errors that can occur during transport operations.
#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Transport closed (EOF)")]
    Eof,
}
