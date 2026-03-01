use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::control::runtime::backpressure::BackpressureGate;
use crate::control::runtime::cancel::CancellationRegistry;
use crate::control::runtime::contracts::{
    RuntimeDispatchMode, RuntimeDispatchResult, RuntimeSessionSnapshot, RuntimeSessionState,
};
use crate::control::runtime::errors::RuntimeError;
use crate::control::runtime::sessions::SessionCoordinator;
use crate::control::runtime::telemetry::RuntimeTelemetry;

#[derive(Debug, Clone)]
pub struct RuntimeDispatcherConfig {
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: Option<PathBuf>,
    pub env: HashMap<String, String>,
    pub runtime_enabled: bool,
    pub max_concurrency: usize,
    pub queue_limit: usize,
    pub queue_wait_timeout_ms: u64,
    pub default_timeout_ms: u64,
    pub per_session_inflight_limit: usize,
    pub enabled_wave_cohorts: Vec<String>,
    pub hard_stop_gate: bool,
}

pub struct RuntimeDispatcher {
    cfg: RuntimeDispatcherConfig,
    runtime_enabled: AtomicBool,
    enabled_wave_cohorts: tokio::sync::RwLock<Vec<String>>,
    hard_stop_gate: AtomicBool,
    backpressure: BackpressureGate,
    sessions: SessionCoordinator,
    cancellations: CancellationRegistry,
    telemetry: RuntimeTelemetry,
}

impl RuntimeDispatcher {
    pub fn new(cfg: RuntimeDispatcherConfig) -> Self {
        Self {
            runtime_enabled: AtomicBool::new(cfg.runtime_enabled),
            enabled_wave_cohorts: tokio::sync::RwLock::new(cfg.enabled_wave_cohorts.clone()),
            hard_stop_gate: AtomicBool::new(cfg.hard_stop_gate),
            backpressure: BackpressureGate::new(
                cfg.max_concurrency,
                cfg.queue_limit,
                cfg.per_session_inflight_limit,
            ),
            sessions: SessionCoordinator::new(),
            cancellations: CancellationRegistry::new(),
            telemetry: RuntimeTelemetry::default(),
            cfg,
        }
    }

    pub fn runtime_enabled(&self) -> bool {
        self.runtime_enabled.load(Ordering::SeqCst)
    }

    pub async fn set_policy(
        &self,
        enabled: Option<bool>,
        wave_cohorts: Option<Vec<String>>,
        hard_stop_gate: Option<bool>,
    ) -> serde_json::Value {
        if let Some(enabled) = enabled {
            self.runtime_enabled.store(enabled, Ordering::SeqCst);
        }

        if let Some(wave_cohorts) = wave_cohorts {
            let mut guard = self.enabled_wave_cohorts.write().await;
            *guard = wave_cohorts;
        }

        if let Some(hard_stop_gate) = hard_stop_gate {
            self.hard_stop_gate.store(hard_stop_gate, Ordering::SeqCst);
        }

        let enabled_wave_cohorts = self.enabled_wave_cohorts.read().await.clone();

        serde_json::json!({
            "runtime_enabled": self.runtime_enabled(),
            "wave_cohorts": enabled_wave_cohorts,
            "hard_stop_gate": self.hard_stop_gate.load(Ordering::SeqCst),
        })
    }

    pub async fn dispatch(
        &self,
        payload: &serde_json::Value,
        timeout_ms: Option<u64>,
    ) -> Result<RuntimeDispatchResult, RuntimeError> {
        let mode = parse_mode(payload);
        let requested_session = parse_session_id(payload);
        let requested_cohort = parse_wave_cohort(payload).unwrap_or_else(|| "unclassified".to_string());

        match mode {
            RuntimeDispatchMode::Init => {
                let snap = self.sessions.init_session(requested_session).await;
                let state = snap.state.clone();
                return Ok(RuntimeDispatchResult {
                    session_id: snap.session_id.clone(),
                    state,
                    data: serde_json::json!({ "session": snap }),
                });
            }
            RuntimeDispatchMode::Cancel => {
                let session_id = requested_session.ok_or_else(|| RuntimeError::InvalidRequest {
                    message: "cancel operation requires runtime.session_id".to_string(),
                })?;
                let snapshot = self.cancel_session(session_id).await?;
                let state = snapshot.state.clone();
                return Ok(RuntimeDispatchResult {
                    session_id: snapshot.session_id.clone(),
                    state,
                    data: serde_json::json!({ "session": snapshot }),
                });
            }
            RuntimeDispatchMode::Complete => {
                let session_id = requested_session.ok_or_else(|| RuntimeError::InvalidRequest {
                    message: "complete operation requires runtime.session_id".to_string(),
                })?;
                let snapshot = self
                    .sessions
                    .set_state(session_id, RuntimeSessionState::Completed, None)
                    .await
                    .ok_or_else(|| RuntimeError::InvalidRequest {
                        message: format!("unknown runtime session: {session_id}"),
                    })?;
                let state = snapshot.state.clone();
                self.cancellations.clear(session_id).await;
                return Ok(RuntimeDispatchResult {
                    session_id: snapshot.session_id.clone(),
                    state,
                    data: serde_json::json!({ "session": snapshot }),
                });
            }
            RuntimeDispatchMode::Execute => {}
        }

        if !self.runtime_enabled() {
            return Err(RuntimeError::RuntimeDisabled {
                reason: "runtime_disabled",
            });
        }

        let enabled_wave_cohorts = self.enabled_wave_cohorts.read().await.clone();
        let hard_stop_gate = self.hard_stop_gate.load(Ordering::SeqCst);

        if hard_stop_gate
            && !enabled_wave_cohorts.is_empty()
            && !enabled_wave_cohorts
                .iter()
                .any(|allowed| allowed.eq_ignore_ascii_case(&requested_cohort))
        {
            self.telemetry.on_hard_stop();
            return Err(RuntimeError::HardStop {
                reason: "cohort_not_enabled",
                requested_cohort,
                allowed_cohorts: enabled_wave_cohorts,
            });
        }

        let session = self.sessions.init_session(requested_session).await;
        let session_id = session.session_id.clone();

        self.telemetry.on_started();
        self.sessions
            .set_state(&session_id, RuntimeSessionState::Executing, None)
            .await;

        let lease = self
            .backpressure
            .acquire(&session_id, self.cfg.queue_wait_timeout_ms)
            .await
            .inspect_err(|e| {
                if matches!(e, RuntimeError::Overloaded { .. }) {
                    self.telemetry.on_overloaded();
                }
            })?;

        if self.cancellations.is_cancelled(&session_id).await {
            self.telemetry.on_cancelled();
            self.sessions
                .set_state(&session_id, RuntimeSessionState::Cancelled, None)
                .await;
            return Err(RuntimeError::Cancelled { session_id });
        }

        let mut cmd = Command::new(&self.cfg.command);
        cmd.args(&self.cfg.args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        if let Some(ref cwd) = self.cfg.working_dir {
            cmd.current_dir(cwd);
        }
        if !self.cfg.env.is_empty() {
            cmd.envs(&self.cfg.env);
        }

        let mut child = cmd.spawn().map_err(|e| RuntimeError::SubprocessFailure {
            message: format!("failed to spawn mcp runtime command {}: {e}", self.cfg.command),
        })?;

        if let Some(mut stdin) = child.stdin.take() {
            let mut input = serde_json::to_vec(payload).map_err(|e| RuntimeError::InvalidRequest {
                message: format!("invalid payload json: {e}"),
            })?;
            input.push(b'\n');
            stdin
                .write_all(&input)
                .await
                .map_err(|e| RuntimeError::SubprocessFailure {
                    message: format!("failed to write payload to runtime stdin: {e}"),
                })?;
            stdin
                .shutdown()
                .await
                .map_err(|e| RuntimeError::SubprocessFailure {
                    message: format!("failed to close runtime stdin: {e}"),
                })?;
        }

        let effective_timeout_ms = timeout_ms.unwrap_or(self.cfg.default_timeout_ms);
        let output = tokio::time::timeout(
            Duration::from_millis(effective_timeout_ms),
            child.wait_with_output(),
        )
        .await
        .map_err(|_| RuntimeError::TimedOut {
            session_id: session_id.clone(),
            timeout_ms: effective_timeout_ms,
        })
        .and_then(|result| {
            result.map_err(|e| RuntimeError::SubprocessFailure {
                message: format!("runtime subprocess wait failed: {e}"),
            })
        });

        drop(lease);

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

                if !output.status.success() {
                    let msg = format!(
                        "runtime subprocess failed (exit={}): {}",
                        output.status.code().unwrap_or(-1),
                        if stderr.is_empty() { "no stderr" } else { &stderr }
                    );
                    self.telemetry.on_failed();
                    self.sessions
                        .set_state(&session_id, RuntimeSessionState::Failed, Some(msg.clone()))
                        .await;
                    return Err(RuntimeError::SubprocessFailure { message: msg });
                }

                let parsed_stdout = if stdout.is_empty() {
                    serde_json::Value::Null
                } else {
                    serde_json::from_str::<serde_json::Value>(&stdout)
                        .unwrap_or_else(|_| serde_json::json!({ "stdout": stdout }))
                };

                self.telemetry.on_completed();
                self.sessions
                    .set_state(&session_id, RuntimeSessionState::Completed, None)
                    .await;
                self.cancellations.clear(&session_id).await;

                Ok(RuntimeDispatchResult {
                    session_id,
                    state: RuntimeSessionState::Completed,
                    data: serde_json::json!({
                        "result": parsed_stdout,
                        "stderr": if stderr.is_empty() { serde_json::Value::Null } else { serde_json::json!(stderr) },
                        "exit_code": output.status.code(),
                        "runtime": {
                            "mode": "native_supervisor",
                            "queue_depth": self.backpressure.queue_depth(),
                        },
                    }),
                })
            }
            Err(RuntimeError::TimedOut {
                session_id,
                timeout_ms,
            }) => {
                self.telemetry.on_timed_out();
                self.sessions
                    .set_state(&session_id, RuntimeSessionState::TimedOut, None)
                    .await;
                self.cancellations.clear(&session_id).await;
                Err(RuntimeError::TimedOut {
                    session_id,
                    timeout_ms,
                })
            }
            Err(err) => {
                self.telemetry.on_failed();
                self.sessions
                    .set_state(&session_id, RuntimeSessionState::Failed, Some(err.message()))
                    .await;
                self.cancellations.clear(&session_id).await;
                Err(err)
            }
        }
    }

    pub async fn cancel_session(
        &self,
        session_id: &str,
    ) -> Result<RuntimeSessionSnapshot, RuntimeError> {
        let Some(snapshot) = self.sessions.snapshot(session_id).await else {
            return Err(RuntimeError::InvalidRequest {
                message: format!("unknown runtime session: {session_id}"),
            });
        };

        if matches!(snapshot.state, RuntimeSessionState::Completed) {
            return Ok(snapshot);
        }

        self.telemetry.on_cancelled();
        self.sessions
            .set_state(session_id, RuntimeSessionState::Cancelling, None)
            .await;
        self.cancellations.request_cancel(session_id).await;

        self.sessions
            .set_state(session_id, RuntimeSessionState::Cancelled, None)
            .await
            .ok_or_else(|| RuntimeError::Internal {
                message: format!("failed to mark runtime session cancelled: {session_id}"),
            })
    }

    pub async fn list_sessions(&self) -> Vec<RuntimeSessionSnapshot> {
        self.sessions.list().await
    }

    pub fn telemetry_snapshot(&self) -> serde_json::Value {
        self.telemetry.snapshot()
    }
}

fn parse_mode(payload: &serde_json::Value) -> RuntimeDispatchMode {
    let op = payload
        .get("runtime")
        .and_then(|v| v.get("op"))
        .and_then(|v| v.as_str())
        .unwrap_or("execute");

    match op {
        "init" => RuntimeDispatchMode::Init,
        "cancel" => RuntimeDispatchMode::Cancel,
        "complete" => RuntimeDispatchMode::Complete,
        _ => RuntimeDispatchMode::Execute,
    }
}

fn parse_session_id(payload: &serde_json::Value) -> Option<&str> {
    payload
        .get("runtime")
        .and_then(|v| v.get("session_id"))
        .and_then(|v| v.as_str())
}

fn parse_wave_cohort(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("runtime")
        .and_then(|v| {
            v.get("wave_cohort")
                .and_then(|s| s.as_str())
                .or_else(|| v.get("cohort").and_then(|s| s.as_str()))
        })
        .or_else(|| payload.get("wave_cohort").and_then(|v| v.as_str()))
        .or_else(|| payload.get("cohort").and_then(|v| v.as_str()))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn success_command() -> (String, Vec<String>) {
        #[cfg(windows)]
        {
            (
                "powershell".to_string(),
                vec![
                    "-NoProfile".to_string(),
                    "-Command".to_string(),
                    "Write-Output '{\"ok\":true}'".to_string(),
                ],
            )
        }

        #[cfg(not(windows))]
        {
            (
                "sh".to_string(),
                vec!["-c".to_string(), "echo '{\"ok\":true}'".to_string()],
            )
        }
    }

    fn sleep_command() -> (String, Vec<String>) {
        #[cfg(windows)]
        {
            (
                "cmd".to_string(),
                vec![
                    "/C".to_string(),
                    "ping 127.0.0.1 -n 2 >nul".to_string(),
                ],
            )
        }

        #[cfg(not(windows))]
        {
            (
                "sh".to_string(),
                vec!["-c".to_string(), "sleep 1".to_string()],
            )
        }
    }

    fn make_dispatcher_with(
        command: String,
        args: Vec<String>,
        max_concurrency: usize,
        queue_limit: usize,
        queue_wait_timeout_ms: u64,
        default_timeout_ms: u64,
        per_session_inflight_limit: usize,
    ) -> RuntimeDispatcher {
        RuntimeDispatcher::new(RuntimeDispatcherConfig {
            command,
            args,
            working_dir: None,
            env: HashMap::new(),
            runtime_enabled: true,
            max_concurrency,
            queue_limit,
            queue_wait_timeout_ms,
            default_timeout_ms,
            per_session_inflight_limit,
            enabled_wave_cohorts: Vec::new(),
            hard_stop_gate: false,
        })
    }

    #[tokio::test]
    async fn init_execute_complete_lifecycle_is_deterministic() {
        let (command, args) = success_command();
        let dispatcher = make_dispatcher_with(command, args, 2, 8, 100, 500, 2);

        let init = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "init", "session_id": "lifecycle-1" }
                }),
                None,
            )
            .await
            .expect("init should succeed");
        assert_eq!(init.session_id, "lifecycle-1");
        assert!(matches!(init.state, RuntimeSessionState::Initialized));

        let execute = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "execute", "session_id": "lifecycle-1" }
                }),
                Some(500),
            )
            .await
            .expect("execute should succeed");
        assert_eq!(execute.session_id, "lifecycle-1");
        assert!(matches!(execute.state, RuntimeSessionState::Completed));
        assert_eq!(execute.data["result"]["ok"], true);

        let complete = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "complete", "session_id": "lifecycle-1" }
                }),
                None,
            )
            .await
            .expect("complete should succeed");
        assert_eq!(complete.session_id, "lifecycle-1");
        assert!(matches!(complete.state, RuntimeSessionState::Completed));
    }

    #[tokio::test]
    async fn completion_is_idempotent_for_same_session() {
        let (command, args) = success_command();
        let dispatcher = make_dispatcher_with(command, args, 1, 4, 50, 500, 1);

        dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "init", "session_id": "idempotent-complete" }
                }),
                None,
            )
            .await
            .expect("init should succeed");

        let first = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "complete", "session_id": "idempotent-complete" }
                }),
                None,
            )
            .await
            .expect("first complete should succeed");
        let second = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "complete", "session_id": "idempotent-complete" }
                }),
                None,
            )
            .await
            .expect("second complete should also succeed");

        assert!(matches!(first.state, RuntimeSessionState::Completed));
        assert!(matches!(second.state, RuntimeSessionState::Completed));
        assert_eq!(first.session_id, second.session_id);
    }

    #[tokio::test]
    async fn execute_respects_timeout_and_returns_timed_out_envelope() {
        let (command, args) = sleep_command();
        let dispatcher = make_dispatcher_with(command, args, 1, 2, 50, 50, 1);

        let err = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "execute", "session_id": "timeout-1" }
                }),
                Some(10),
            )
            .await
            .expect_err("execute should time out");

        match &err {
            RuntimeError::TimedOut {
                session_id,
                timeout_ms,
            } => {
                assert_eq!(session_id, "timeout-1");
                assert_eq!(*timeout_ms, 10);
            }
            other => panic!("expected timed out error, got {other:?}"),
        }

        let envelope = err.envelope();
        assert_eq!(envelope["error_class"], "timed_out");
        assert_eq!(envelope["session_id"], "timeout-1");
        assert_eq!(envelope["timeout_ms"], 10);
    }

    #[tokio::test]
    async fn cancel_then_execute_same_session_returns_cancelled_envelope() {
        let (command, args) = sleep_command();
        let dispatcher = make_dispatcher_with(command, args, 1, 2, 50, 500, 1);

        dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "init", "session_id": "cancel-race" }
                }),
                None,
            )
            .await
            .expect("init should succeed");

        let cancel = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "cancel", "session_id": "cancel-race" }
                }),
                None,
            )
            .await
            .expect("cancel should succeed");
        assert!(matches!(cancel.state, RuntimeSessionState::Cancelled));

        let err = dispatcher
            .dispatch(
                &serde_json::json!({
                    "runtime": { "op": "execute", "session_id": "cancel-race" }
                }),
                Some(200),
            )
            .await
            .expect_err("execute should fail for cancelled session");

        match &err {
            RuntimeError::Cancelled { session_id } => {
                assert_eq!(session_id, "cancel-race");
            }
            other => panic!("expected cancelled error, got {other:?}"),
        }

        let envelope = err.envelope();
        assert_eq!(envelope["error_class"], "cancelled");
        assert_eq!(envelope["session_id"], "cancel-race");
    }

    #[tokio::test]
    async fn stress_load_returns_overload_envelopes_when_backpressure_limits_are_hit() {
        let (command, args) = sleep_command();
        let dispatcher = Arc::new(make_dispatcher_with(command, args, 1, 1, 1, 2_000, 4));

        let mut handles = Vec::new();
        for i in 0..10 {
            let d = Arc::clone(&dispatcher);
            handles.push(tokio::spawn(async move {
                d.dispatch(
                    &serde_json::json!({
                        "runtime": { "op": "execute", "session_id": format!("load-{i}") }
                    }),
                    Some(2_000),
                )
                .await
            }));
        }

        let mut overload_count = 0usize;
        for handle in handles {
            match handle.await.expect("task should complete") {
                Ok(result) => {
                    assert!(matches!(result.state, RuntimeSessionState::Completed));
                    assert!(result.data["runtime"]["queue_depth"].as_u64().unwrap_or(0) <= 1);
                }
                Err(RuntimeError::Overloaded {
                    reason,
                    retry_after_ms,
                    queue_depth,
                }) => {
                    overload_count += 1;
                    assert!(
                        reason == "queue_full"
                            || reason == "concurrency_exhausted"
                            || reason == "session_limit_exceeded"
                    );
                    assert!(retry_after_ms >= 1);
                    assert!(queue_depth >= 1);
                }
                Err(other) => panic!("unexpected error under load: {other:?}"),
            }
        }

        assert!(overload_count > 0, "expected at least one overload under stress");
    }
}
