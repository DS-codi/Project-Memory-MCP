//! Supervisor control-plane API.
//!
//! This module owns the transport layer (named pipe on Windows, TCP fallback)
//! and the NDJSON message framing / protocol types.

pub mod handshake;
pub mod handler;
pub mod mcp_admin;
pub mod pipe;
pub mod protocol;
pub mod registry;
pub mod tcp;

use tokio::sync::oneshot;

use crate::control::protocol::{ControlRequest, ControlResponse};

/// A request envelope pairing a decoded [`ControlRequest`] with a one-shot
/// reply channel.  The transport layer creates the channel, forwards the
/// envelope to the central dispatch loop, and awaits the reply to write back
/// to the caller over the same connection.
pub type RequestEnvelope = (ControlRequest, oneshot::Sender<ControlResponse>);
