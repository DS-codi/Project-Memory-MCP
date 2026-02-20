//! Low-level NDJSON (newline-delimited JSON) framing helpers.

use serde::{de::DeserializeOwned, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use super::TransportError;

/// Read one NDJSON line from an async reader and deserialize it.
///
/// Returns [`TransportError::Eof`] when the reader reaches end-of-stream.
pub async fn ndjson_decode<R, T>(reader: &mut BufReader<R>) -> Result<T, TransportError>
where
    R: tokio::io::AsyncRead + Unpin,
    T: DeserializeOwned,
{
    let mut line = String::new();
    let bytes_read = reader.read_line(&mut line).await?;
    if bytes_read == 0 {
        return Err(TransportError::Eof);
    }
    let value = serde_json::from_str(line.trim())?;
    Ok(value)
}

/// Serialize a value as a single NDJSON line and write it to an async writer.
///
/// Appends a newline and flushes the writer to ensure delivery.
pub async fn ndjson_encode<W, T>(writer: &mut W, value: &T) -> Result<(), TransportError>
where
    W: tokio::io::AsyncWrite + Unpin,
    T: Serialize,
{
    let json = serde_json::to_string(value)?;
    writer.write_all(json.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await?;
    Ok(())
}
