//! Logging utilities: secrets redaction for pre-log sanitisation.
//!
//! Call [`redact_secrets`] on any string before including it in a log field
//! to ensure credentials are never written to structured log output.

use std::borrow::Cow;

/// Field names that may carry secret values (matched case-insensitively).
const SECRET_FIELDS: &[&str] = &["mcp_secret", "token", "password", "secret", "key"];

/// Replaces known secret patterns with `"[REDACTED]"` before logging.
///
/// Scans `input` for occurrences of any name in [`SECRET_FIELDS`] followed
/// by an `=` or `:` separator and a double-quoted string value, e.g.:
///
/// ```text
/// password = "hunter2"  →  password = "[REDACTED]"
/// MCP_SECRET: "abc123"  →  MCP_SECRET: "[REDACTED]"
/// token =  "eyJhb…"    →  token =  "[REDACTED]"
/// ```
///
/// Matching is **case-insensitive** on the field name; the value itself is
/// replaced verbatim without inspection.
///
/// Returns [`Cow::Borrowed`] (zero copy) when no secret field name is found,
/// or [`Cow::Owned`] with every matched secret value replaced by
/// `[REDACTED]`.
pub fn redact_secrets(input: &str) -> Cow<'_, str> {
    // Fast path: skip allocation entirely when none of the field names appear.
    let lower = input.to_ascii_lowercase();
    let needs_scan = SECRET_FIELDS.iter().any(|f| lower.contains(f));
    if !needs_scan {
        return Cow::Borrowed(input);
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

    if changed {
        Cow::Owned(output)
    } else {
        // No substitution occurred (field name appeared without a quoted value
        // following it).  Return the original slice to avoid an allocation.
        Cow::Borrowed(input)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

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
}
