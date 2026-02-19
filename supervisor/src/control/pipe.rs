//! Windows named-pipe transport for the supervisor control API.
//!
//! On non-Windows platforms this module still compiles, but `serve_named_pipe`
//! returns an immediate error so the rest of the codebase can remain
//! platform-agnostic.

use tokio::sync::mpsc;

use crate::control::protocol::{decode_request, ControlRequest};

// ---------------------------------------------------------------------------
// Windows implementation
// ---------------------------------------------------------------------------

#[cfg(windows)]
pub async fn serve_named_pipe(
    pipe_name: &str,
    tx: mpsc::Sender<ControlRequest>,
) -> anyhow::Result<()> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::net::windows::named_pipe::ServerOptions;

    let pipe_name = pipe_name.to_string();

    let mut i: u32 = 0;
    loop {
        // The very first server instance must set `first_pipe_instance(true)`.
        // Subsequent instances created inside the loop use `false` so that
        // multiple outstanding server instances can coexist.
        let server = ServerOptions::new()
            .first_pipe_instance(i == 0)
            .create(&pipe_name)?;

        i = i.wrapping_add(1);

        // Block until a client connects.
        server.connect().await?;

        let tx = tx.clone();
        let name = pipe_name.clone();

        // Spawn a task to service this client; the loop immediately creates
        // the next server instance ready for the following connection.
        tokio::spawn(async move {
            let reader = BufReader::new(server);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                match decode_request(&line) {
                    Ok(req) => {
                        if tx.send(req).await.is_err() {
                            // Channel closed — supervisor is shutting down.
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("[WARN pipe] {name}: bad request: {e}");
                    }
                }
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Non-Windows stub
// ---------------------------------------------------------------------------

#[cfg(not(windows))]
pub async fn serve_named_pipe(
    _pipe_name: &str,
    _tx: mpsc::Sender<ControlRequest>,
) -> anyhow::Result<()> {
    Err(anyhow::anyhow!(
        "named pipes are only available on Windows; use TCP transport instead"
    ))
}
