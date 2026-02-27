use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum RuntimeError {
    RuntimeDisabled { reason: &'static str },
    InvalidRequest { message: String },
    Overloaded {
        reason: &'static str,
        retry_after_ms: u64,
        queue_depth: usize,
    },
    Cancelled { session_id: String },
    TimedOut { session_id: String, timeout_ms: u64 },
    HardStop {
        reason: &'static str,
        requested_cohort: String,
        allowed_cohorts: Vec<String>,
    },
    SubprocessFailure { message: String },
    Internal { message: String },
}

impl RuntimeError {
    pub fn message(&self) -> String {
        match self {
            RuntimeError::RuntimeDisabled { reason } => {
                format!("runtime disabled: {reason}")
            }
            RuntimeError::InvalidRequest { message } => message.clone(),
            RuntimeError::Overloaded { reason, .. } => format!("runtime overloaded: {reason}"),
            RuntimeError::Cancelled { session_id } => format!("runtime session cancelled: {session_id}"),
            RuntimeError::TimedOut {
                session_id,
                timeout_ms,
            } => {
                format!("runtime session timed out: {session_id} after {timeout_ms}ms")
            }
            RuntimeError::HardStop {
                reason,
                requested_cohort,
                ..
            } => format!("runtime hard-stop gate blocked cohort '{requested_cohort}': {reason}"),
            RuntimeError::SubprocessFailure { message } => message.clone(),
            RuntimeError::Internal { message } => message.clone(),
        }
    }

    pub fn envelope(&self) -> serde_json::Value {
        match self {
            RuntimeError::RuntimeDisabled { reason } => serde_json::json!({
                "error_class": "runtime_precondition",
                "reason": reason,
            }),
            RuntimeError::Overloaded {
                reason,
                retry_after_ms,
                queue_depth,
            } => serde_json::json!({
                "error_class": "overload",
                "reason": reason,
                "retry_after_ms": retry_after_ms,
                "queue_depth": queue_depth,
            }),
            RuntimeError::Cancelled { session_id } => serde_json::json!({
                "error_class": "cancelled",
                "session_id": session_id,
            }),
            RuntimeError::TimedOut {
                session_id,
                timeout_ms,
            } => serde_json::json!({
                "error_class": "timed_out",
                "session_id": session_id,
                "timeout_ms": timeout_ms,
            }),
            RuntimeError::HardStop {
                reason,
                requested_cohort,
                allowed_cohorts,
            } => serde_json::json!({
                "error_class": "hard_stop",
                "reason": reason,
                "requested_cohort": requested_cohort,
                "allowed_cohorts": allowed_cohorts,
            }),
            RuntimeError::InvalidRequest { message } => serde_json::json!({
                "error_class": "invalid_request",
                "message": message,
            }),
            RuntimeError::SubprocessFailure { message } => serde_json::json!({
                "error_class": "subprocess_failure",
                "message": message,
            }),
            RuntimeError::Internal { message } => serde_json::json!({
                "error_class": "internal",
                "message": message,
            }),
        }
    }
}

impl Display for RuntimeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message())
    }
}

impl std::error::Error for RuntimeError {}
