//! Supervisor control-plane API.
//!
//! This module owns the transport layer (named pipe on Windows, TCP fallback)
//! and the NDJSON message framing / protocol types.

pub mod handshake;
pub mod handler;
pub mod pipe;
pub mod protocol;
pub mod registry;
pub mod tcp;
