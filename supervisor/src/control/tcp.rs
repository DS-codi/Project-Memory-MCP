//! TCP loopback transport for the supervisor control API.
//!
//! This is the cross-platform fallback when the named-pipe transport is
//! unavailable or explicitly disabled via `control_transport = "tcp"` in
//! the supervisor config.

use anyhow::Context;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

use crate::control::protocol::{decode_request, encode_response};
use crate::control::RequestEnvelope;

/// Bind a TCP listener on `bind_addr` and dispatch each incoming NDJSON line
/// as a [`ControlRequest`] on `tx`.
///
/// Each accepted connection is served in its own Tokio task.
pub async fn serve_tcp(
    bind_addr: &str,
    tx: mpsc::Sender<RequestEnvelope>,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind_addr)
        .await
        .with_context(|| format!("failed to bind TCP control listener on {bind_addr}"))?;

    eprintln!("[INFO tcp] control listener bound on {bind_addr}");

    loop {
        let (stream, peer) = listener.accept().await?;

        let tx = tx.clone();

        tokio::spawn(async move {
            let (reader_half, mut writer) = stream.into_split();
            let reader = BufReader::new(reader_half);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                match decode_request(&line) {
                    Ok(req) => {
                        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
                        if tx.send((req, resp_tx)).await.is_err() {
                            // Channel closed — supervisor is shutting down.
                            break;
                        }
                        if let Ok(resp) = resp_rx.await {
                            let encoded = encode_response(&resp);
                            if writer.write_all(encoded.as_bytes()).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[WARN tcp] {peer}: bad request: {e}");
                    }
                }
            }

            eprintln!("[INFO tcp] {peer}: connection closed");
        });
    }
}
