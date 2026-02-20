//! stdin/stdout NDJSON transport for Supervisor-spawned GUI processes.

use async_trait::async_trait;
use tokio::io::{self, BufReader, Stdin, Stdout};

use super::ndjson::{ndjson_decode, ndjson_encode};
use super::{FormTransport, TransportError};
use crate::protocol::envelope::{FormRequest, FormResponse};
use crate::protocol::refinement::{FormRefinementRequest, FormRefinementResponse};

/// NDJSON transport over stdin (reads) and stdout (writes).
///
/// This is the primary transport for GUI processes spawned by the
/// Supervisor with piped stdio. Each side reads and writes one JSON
/// object per line.
pub struct StdioTransport {
    reader: BufReader<Stdin>,
    writer: Stdout,
}

impl StdioTransport {
    /// Create a new transport attached to the process's stdin/stdout.
    pub fn new() -> Self {
        Self {
            reader: BufReader::new(io::stdin()),
            writer: io::stdout(),
        }
    }
}

impl Default for StdioTransport {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl FormTransport for StdioTransport {
    async fn read_request(&mut self) -> Result<FormRequest, TransportError> {
        ndjson_decode(&mut self.reader).await
    }

    async fn write_response(&mut self, response: &FormResponse) -> Result<(), TransportError> {
        ndjson_encode(&mut self.writer, response).await
    }

    async fn read_refinement_response(
        &mut self,
    ) -> Result<FormRefinementResponse, TransportError> {
        ndjson_decode(&mut self.reader).await
    }

    async fn write_refinement_request(
        &mut self,
        request: &FormRefinementRequest,
    ) -> Result<(), TransportError> {
        ndjson_encode(&mut self.writer, request).await
    }
}
