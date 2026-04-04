//! Logging utilities: secrets redaction + tracing-subscriber integration.
//!
//! ## Secrets redaction
//!
//! Call [`redact_secrets`] on any string before including it in a log field
//! to ensure credentials are never written to structured log output.
//!
//! ## Tracing-subscriber integration
//!
//! Wrap any [`MakeWriter`] with [`RedactingMakeWriter`] so that every byte
//! written to the log sink passes through [`redact_secrets`] first.  Use
//! [`init_tracing`] for a ready-made subscriber setup that applies redaction
//! automatically.
//!
//! ```ignore
//! use supervisor_iced::backend::logging::init_tracing;
//! init_tracing();  // env-filter from RUST_LOG, redacted stderr output
//! ```

use std::borrow::Cow;
use std::io;

// ---------------------------------------------------------------------------
// Secrets redaction
// ---------------------------------------------------------------------------

/// Field names that may carry secret values (matched case-insensitively).
///
/// `key` covers `api_key` as a sub-name match (the scanner checks every byte
/// offset, so `api_key = "v"` is caught when `key` aligns at offset 4).
/// `api_key` is also listed explicitly so the intent is self-documenting.
/// `authorization` covers the quoted form `Authorization: "Bearer <tok>"`.
const SECRET_FIELDS: &[&str] = &[
    "mcp_secret",
    "token",
    "password",
    "secret",
    "key",
    "api_key",
    "authorization",
];

/// Bearer-token prefix (case-insensitive) for the *unquoted* HTTP header form:
///
/// ```text
/// Authorization: Bearer eyJhb…   →   Authorization: Bearer [REDACTED]
/// ```
const BEARER_PREFIX: &str = "bearer ";

/// Replaces known secret patterns with `"[REDACTED]"` before logging.
///
/// **Pass 1 — quoted field values.**  Scans `input` for occurrences of any
/// name in [`SECRET_FIELDS`] followed by an `=` or `:` separator and a
/// double-quoted string value, e.g.:
///
/// ```text
/// password = "hunter2"        →  password = "[REDACTED]"
/// MCP_SECRET: "abc123"        →  MCP_SECRET: "[REDACTED]"
/// token =  "eyJhb…"           →  token =  "[REDACTED]"
/// api_key = "sk-live-…"       →  api_key = "[REDACTED]"
/// Authorization: "Bearer …"   →  Authorization: "[REDACTED]"
/// ```
///
/// **Pass 2 — unquoted `Authorization: Bearer` header.**  Catches the plain
/// HTTP header form where the token is not double-quoted:
///
/// ```text
/// Authorization: Bearer eyJhb…   →   Authorization: Bearer [REDACTED]
/// ```
///
/// Matching is **case-insensitive** on the field name; the value itself is
/// replaced verbatim without inspection.
///
/// Returns [`Cow::Borrowed`] (zero copy) when no secret field name is found,
/// or [`Cow::Owned`] with every matched secret value replaced by
/// `[REDACTED]`.
pub fn redact_secrets(input: &str) -> Cow<'_, str> {
    // Run both passes; short-circuit when there is nothing to do.
    let after_fields: Option<String> = redact_field_values(input);
    let work: &str = after_fields.as_deref().unwrap_or(input);
    let after_bearer: Option<String> = redact_bearer_tokens(work);

    match (after_fields, after_bearer) {
        (_, Some(s)) => Cow::Owned(s),
        (Some(s), None) => Cow::Owned(s),
        (None, None) => Cow::Borrowed(input),
    }
}

// ---------------------------------------------------------------------------
// Pass 1 — quoted field=value patterns
// ---------------------------------------------------------------------------

/// Returns `Some(String)` with substitutions applied when the input contains
/// at least one secret-field pattern with a quoted value; `None` otherwise.
fn redact_field_values(input: &str) -> Option<String> {
    // Fast path: skip allocation entirely when none of the field names appear.
    let lower = input.to_ascii_lowercase();
    let needs_scan = SECRET_FIELDS.iter().any(|f| lower.contains(f));
    if !needs_scan {
        return None;
    }

    let bytes = input.as_bytes();
    let lower_bytes = lower.as_bytes();
    let len = bytes.len();
    let mut output = String::with_capacity(len);
    let mut i = 0;
    let mut changed = false;

    'main: while i < len {
        // Try each secret field name at the current position.
        for field in SECRET_FIELDS {
            let fb = field.as_bytes();
            if i + fb.len() > len {
                continue;
            }
            if lower_bytes[i..i + fb.len()] != *fb {
                continue;
            }

            // Matched the field name.  Scan ahead for <separator> <"value">.
            let mut j = i + fb.len();

            // Skip horizontal whitespace before separator.
            while j < len && (bytes[j] == b' ' || bytes[j] == b'\t') {
                j += 1;
            }

            // Require `=` or `:` separator.
            if j >= len || (bytes[j] != b'=' && bytes[j] != b':') {
                continue; // no separator — try next field name
            }
            j += 1;

            // Skip horizontal whitespace after separator.
            while j < len && (bytes[j] == b' ' || bytes[j] == b'\t') {
                j += 1;
            }

            // Require an opening double-quote.
            if j >= len || bytes[j] != b'"' {
                continue; // no quoted value — try next field name
            }
            let quote_open = j;
            j += 1; // advance past opening `"`

            // Scan for the closing double-quote (no escape-sequence handling
            // needed; we just want to cover the common structured-log formats).
            while j < len && bytes[j] != b'"' {
                j += 1;
            }
            if j >= len {
                // Unterminated string literal — emit as-is and move on.
                continue;
            }

            // Emit: everything up to and including the opening quote,
            //       the redaction marker, then the closing quote.
            output.push_str(&input[i..=quote_open]);
            output.push_str("[REDACTED]");
            output.push('"');
            changed = true;
            i = j + 1; // advance past the closing `"`
            continue 'main;
        }

        // No field matched at position `i` — emit one UTF-8 scalar value.
        // Using `chars().next()` ensures correct handling of multi-byte
        // characters even though most log content will be ASCII.
        if let Some(ch) = input[i..].chars().next() {
            output.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }

    if changed { Some(output) } else { None }
}

// ---------------------------------------------------------------------------
// Pass 2 — unquoted Authorization: Bearer <token>
// ---------------------------------------------------------------------------

/// Returns `Some(String)` with bearer tokens replaced when the input contains
/// the unquoted `Authorization: Bearer <token>` pattern; `None` otherwise.
///
/// The token is considered to run until the next ASCII whitespace character
/// or the end of the string, matching the common HTTP header serialisation.
fn redact_bearer_tokens(input: &str) -> Option<String> {
    // Fast path.
    let lower = input.to_ascii_lowercase();
    if !lower.contains(BEARER_PREFIX) {
        return None;
    }

    let mut output = String::with_capacity(input.len());
    let mut rest = input;
    let mut changed = false;

    while let Some(pos) = rest.to_ascii_lowercase().find(BEARER_PREFIX) {
        // Emit everything up to and including "Bearer ".
        let bearer_end = pos + BEARER_PREFIX.len();
        output.push_str(&rest[..bearer_end]);

        let after = &rest[bearer_end..];

        // Locate the end of the token (whitespace or EOL).
        let token_end = after
            .find(|c: char| c.is_ascii_whitespace())
            .unwrap_or(after.len());

        if token_end == 0 {
            // Nothing after "Bearer " — emit as-is to avoid infinite loop.
            rest = after;
            continue;
        }

        output.push_str("[REDACTED]");
        changed = true;
        rest = &after[token_end..];
    }

    if !changed {
        return None;
    }

    output.push_str(rest);
    Some(output)
}

// ---------------------------------------------------------------------------
// tracing-subscriber integration — RedactingMakeWriter
// ---------------------------------------------------------------------------

/// Wraps an [`io::Write`] instance so that every write passes through
/// [`redact_secrets`] before reaching the inner sink.
pub struct RedactingWriter<W: io::Write> {
    inner: W,
}

impl<W: io::Write> io::Write for RedactingWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match std::str::from_utf8(buf) {
            Ok(s) => {
                let redacted = redact_secrets(s);
                self.inner.write_all(redacted.as_bytes())?;
            }
            Err(_) => {
                // Non-UTF-8 bytes (should not occur in practice with the
                // tracing-subscriber fmt layer) — pass through unchanged.
                self.inner.write_all(buf)?;
            }
        }
        // Report the original length so the caller's bookkeeping stays correct.
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

/// A [`tracing_subscriber::fmt::MakeWriter`] that wraps every writer produced
/// by the inner factory with [`RedactingWriter`], ensuring that all log output
/// is sanitised before being written to the sink.
///
/// # Example
///
/// ```ignore
/// use tracing_subscriber::{fmt, EnvFilter};
/// use supervisor_iced::backend::logging::RedactingMakeWriter;
///
/// tracing_subscriber::fmt()
///     .with_env_filter(EnvFilter::from_default_env())
///     .with_writer(RedactingMakeWriter(std::io::stderr))
///     .init();
/// ```
pub struct RedactingMakeWriter<W>(pub W);

impl<'a, W> tracing_subscriber::fmt::MakeWriter<'a> for RedactingMakeWriter<W>
where
    W: tracing_subscriber::fmt::MakeWriter<'a>,
{
    type Writer = RedactingWriter<W::Writer>;

    fn make_writer(&'a self) -> Self::Writer {
        RedactingWriter {
            inner: self.0.make_writer(),
        }
    }
}

// ---------------------------------------------------------------------------
// Convenience initialiser
// ---------------------------------------------------------------------------

/// Initialise a global `tracing` subscriber that:
///
/// * reads the log level from `RUST_LOG` (defaults to `info`),
/// * writes to **stderr**,
/// * passes all output through [`RedactingMakeWriter`] so that secrets are
///   never written to the log sink.
///
/// Call this once, early in `main`, before spawning any tasks.
/// Subsequent calls are silently ignored (the global default is already set).
pub fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let _ = fmt()
        .with_env_filter(filter)
        .with_writer(RedactingMakeWriter(io::stderr))
        .try_init();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Pass 1: quoted field=value patterns (ported from supervisor/src/logging.rs)
    // -----------------------------------------------------------------------

    #[test]
    fn redacts_password_equals() {
        let input = r#"password = "hunter2""#;
        let result = redact_secrets(input);
        assert_eq!(result, r#"password = "[REDACTED]""#);
        assert!(matches!(result, Cow::Owned(_)));
    }

    #[test]
    fn redacts_mcp_secret_colon() {
        let input = r#"MCP_SECRET: "abc123""#;
        let result = redact_secrets(input);
        assert_eq!(result, r#"MCP_SECRET: "[REDACTED]""#);
    }

    #[test]
    fn redacts_token_extra_spaces() {
        let input = r#"token =  "Bearer eyJhb""#;
        let result = redact_secrets(input);
        assert_eq!(result, r#"token =  "[REDACTED]""#);
    }

    #[test]
    fn redacts_secret_field() {
        let input = r#"secret="s3cr3t""#;
        let result = redact_secrets(input);
        assert_eq!(result, r#"secret="[REDACTED]""#);
    }

    #[test]
    fn case_insensitive_field_name() {
        let input = r#"PASSWORD = "Pa$$w0rd""#;
        let result = redact_secrets(input);
        assert_eq!(result, r#"PASSWORD = "[REDACTED]""#);
    }

    #[test]
    fn redacts_multiple_fields_in_one_string() {
        let input = r#"token = "abc" and password = "xyz""#;
        let out = redact_secrets(input);
        assert!(out.contains("[REDACTED]"));
        assert!(!out.contains("abc"));
        assert!(!out.contains("xyz"));
    }

    #[test]
    fn no_change_for_safe_input() {
        let input = r#"service_id = "mcp", state = "Connected""#;
        let result = redact_secrets(input);
        assert_eq!(result.as_ref(), input);
        // None of the secret field names appear, so we get a borrowed slice.
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    #[test]
    fn borrowed_when_no_secret_field_names_present() {
        let input = "hello world, nothing to see here";
        let result = redact_secrets(input);
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    #[test]
    fn unterminated_quote_left_as_is() {
        // Opening quote with no closing quote — should not panic, emit as-is.
        let input = r#"password = "unterminated"#;
        let result = redact_secrets(input);
        // No complete quoted value to replace.
        assert_eq!(result.as_ref(), input);
    }

    #[test]
    fn empty_input_returns_borrowed() {
        let result = redact_secrets("");
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    // -----------------------------------------------------------------------
    // Pass 1: api_key and authorization (new fields)
    // -----------------------------------------------------------------------

    #[test]
    fn redacts_api_key_quoted() {
        let input = r#"api_key = "sk-live-abc123""#;
        let result = redact_secrets(input);
        // `key` sub-match (offset 4) catches this; `api_key` explicit entry
        // also catches it at offset 0 — either way the value is redacted.
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("sk-live-abc123"));
    }

    #[test]
    fn redacts_api_key_no_spaces() {
        let input = r#"api_key="sk-test-xyz""#;
        let result = redact_secrets(input);
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("sk-test-xyz"));
    }

    #[test]
    fn redacts_authorization_quoted_bearer() {
        let input = r#"Authorization: "Bearer eyJhbGciOiJSUzI1NiJ9""#;
        let result = redact_secrets(input);
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("eyJhbGciOiJSUzI1NiJ9"));
    }

    // -----------------------------------------------------------------------
    // Pass 2: unquoted Authorization: Bearer <token>
    // -----------------------------------------------------------------------

    #[test]
    fn redacts_bearer_token_unquoted() {
        let input = "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig";
        let result = redact_secrets(input);
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("eyJhbGciOiJSUzI1NiJ9"));
        assert!(result.contains("Authorization: Bearer "));
    }

    #[test]
    fn redacts_bearer_token_case_insensitive() {
        let input = "authorization: bearer mysecrettoken extra-info";
        let result = redact_secrets(input);
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("mysecrettoken"));
        // Text after the token is preserved.
        assert!(result.contains("extra-info"));
    }

    #[test]
    fn redacts_bearer_at_end_of_string() {
        let input = "Authorization: Bearer tok123";
        let result = redact_secrets(input);
        assert!(result.contains("[REDACTED]"));
        assert!(!result.contains("tok123"));
    }

    #[test]
    fn redacts_multiple_bearer_tokens() {
        let input = "Authorization: Bearer tok1 and Authorization: Bearer tok2";
        let result = redact_secrets(input);
        assert!(!result.contains("tok1"));
        assert!(!result.contains("tok2"));
        assert_eq!(result.matches("[REDACTED]").count(), 2);
    }

    #[test]
    fn no_change_no_bearer_present() {
        let input = "Content-Type: application/json";
        let result = redact_secrets(input);
        assert!(matches!(result, Cow::Borrowed(_)));
    }

    #[test]
    fn bearer_without_token_left_as_is() {
        // "Bearer " at the very end with nothing following — should not panic.
        let input = "Authorization: Bearer ";
        let result = redact_secrets(input);
        // token_end == 0 means the suffix is emitted as-is; no replacement.
        assert_eq!(result.as_ref(), input);
    }
}
