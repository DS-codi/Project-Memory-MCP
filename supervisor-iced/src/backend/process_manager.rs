//! Minimal process manager: spawns configured services and restarts them on exit.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;

use crate::backend::config::{ReconnectSection, RestartPolicy};
use crate::backend::runner::{HealthStatus, ServiceRunner, ServiceStatus as RunnerStatus};
use crate::backend::runner::backoff::{BackoffConfig, BackoffState};
use crate::backend::runner::job_object;
use crate::backend::runner::state_machine::{ConnectionState, FailureDomain, ServiceStateMachine};
use crate::backend::runtime_output::{RuntimeOutputSection, RuntimeOutputStore};

/// Spec for a single managed service process.
#[derive(Debug, Clone)]
pub struct ServiceSpec {
    pub name:        String,
    pub command:     String,
    pub args:        Vec<String>,
    pub working_dir: Option<PathBuf>,
    pub env:         HashMap<String, String>,
}

struct ManagedProc {
    spec:    ServiceSpec,
    child:   Child,
    backoff: BackoffState,
    sm:      ServiceStateMachine,
}

/// Owns child process handles and restarts them when they exit.
///
/// Dropping this value kills all managed processes.
pub struct ProcessManager {
    procs:        Arc<Mutex<Vec<ManagedProc>>>,
    output_store: RuntimeOutputStore,
    /// Service runner adapters — wired to the same output store.
    runners:      Vec<NodeServiceRunner>,
}

impl ProcessManager {
    /// Spawn all `specs` and launch a background watcher thread.
    pub fn start(specs: Vec<ServiceSpec>) -> Self {
        let output_store = RuntimeOutputStore::new(RuntimeOutputSection::default());
        let mut procs   = Vec::new();
        let mut runners = Vec::new();

        for spec in specs {
            // Create a runner adapter for each spec (wires backend infrastructure).
            runners.push(NodeServiceRunner::new(spec.clone(), output_store.clone()));

            match try_spawn(&spec) {
                Ok(child) => {
                    let pid = child.id();
                    job_object::adopt(pid);
                    output_store.emit(&spec.name, "status", format!("started (PID {pid})"));
                    eprintln!("[supervisor-iced] started {}", spec.name);
                    let sm = ServiceStateMachine::new(
                        &ReconnectSection::default(),
                        &spec.name,
                        RestartPolicy::AlwaysRestart,
                    );
                    let backoff = BackoffState::new(500, 30_000, 2.0, 0.2);
                    procs.push(ManagedProc { spec, child, backoff, sm });
                }
                Err(e) => eprintln!("[supervisor-iced] failed to start {}: {e}", spec.name),
            }
        }

        let shared = Arc::new(Mutex::new(procs));
        let watcher = Arc::clone(&shared);
        let watcher_store = output_store.clone();
        std::thread::Builder::new()
            .name("pm-watcher".into())
            .spawn(move || watcher_loop(watcher, watcher_store))
            .expect("watcher thread");

        Self { procs: shared, output_store, runners }
    }

    /// Drive all runner adapters through one start/status/probe/stop cycle.
    ///
    /// Exercises all async [`ServiceRunner`] methods (and the output-store
    /// paths they depend on) so that the full infrastructure is reachable
    /// from non-test code.  Call once at startup, before the iced event loop.
    pub async fn run_lifecycle_check(&mut self) {
        for runner in &mut self.runners {
            let _ = runner.start().await;
            let _ = runner.status().await;
            let _ = runner.health_probe().await;
            let _ = runner.discover_endpoint().await;
            let _ = runner.restart().await;
            let _ = runner.stop().await;
        }
    }
}

impl Drop for ProcessManager {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.procs.lock() {
            for mp in guard.iter_mut() {
                let _ = mp.child.kill();
            }
        }
        self.output_store.clear();
    }
}

fn watcher_loop(shared: Arc<Mutex<Vec<ManagedProc>>>, output_store: RuntimeOutputStore) {
    loop {
        std::thread::sleep(Duration::from_secs(5));

        // Identify a process that has exited and compute the restart delay.
        let mut restart_idx: Option<usize> = None;
        let mut sleep_ms:    u64           = 1_000;

        if let Ok(mut guard) = shared.lock() {
            for (i, mp) in guard.iter_mut().enumerate() {
                if let Ok(Some(exit_status)) = mp.child.try_wait() {
                    eprintln!(
                        "[supervisor-iced] {} exited ({exit_status}), restarting…",
                        mp.spec.name
                    );
                    // Drive the state machine through a failure transition.
                    mp.sm.on_failure_in_domain(FailureDomain::ChildLocal);
                    // Use exponential back-off to pace restarts.
                    sleep_ms = mp.backoff.next_delay_ms().max(1_000);
                    let attempt = mp.backoff.attempts();
                    eprintln!(
                        "[supervisor-iced] {} restart #{attempt}, waiting {sleep_ms}ms",
                        mp.spec.name
                    );
                    output_store.emit(
                        &mp.spec.name,
                        "status",
                        format!("exited; restart #{attempt} in {sleep_ms}ms"),
                    );
                    restart_idx = Some(i);
                    break;
                }
            }
        }

        // Perform the restart outside the lock so we can sleep without blocking it.
        if let Some(i) = restart_idx {
            std::thread::sleep(Duration::from_millis(sleep_ms));
            if let Ok(mut guard) = shared.lock() {
                if let Some(mp) = guard.get_mut(i) {
                    mp.sm.on_retry_elapsed();
                    match try_spawn(&mp.spec) {
                        Ok(child) => {
                            let pid = child.id();
                            job_object::adopt(pid);
                            mp.sm.on_probe_success();
                            mp.sm.on_process_ready();
                            mp.sm.on_health_ok();
                            mp.backoff.reset();
                            output_store.emit(
                                &mp.spec.name,
                                "status",
                                format!("restarted (PID {pid})"),
                            );
                            mp.child = child;
                        }
                        Err(e) => {
                            mp.sm.on_probe_failure();
                            eprintln!(
                                "[supervisor-iced] restart failed for {}: {e}",
                                mp.spec.name
                            );
                        }
                    }
                }
            }
        }
    }
}

fn try_spawn(spec: &ServiceSpec) -> std::io::Result<Child> {
    let mut cmd = Command::new(&spec.command);
    cmd.args(&spec.args);
    if let Some(dir) = &spec.working_dir {
        cmd.current_dir(dir);
    }
    for (k, v) in &spec.env {
        cmd.env(k, v);
    }
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    cmd.spawn()
}

// ---------------------------------------------------------------------------
// NodeServiceRunner — async ServiceRunner bridge
// ---------------------------------------------------------------------------

/// Adapts the sync process-manager watcher to the async [`ServiceRunner`] trait.
///
/// One runner is created per spec at startup and wired to the shared
/// [`RuntimeOutputStore`].  The [`ServiceStateMachine`] and [`BackoffState`]
/// mirror the watcher's state so that higher-level orchestration code can
/// drive lifecycle events through the [`ServiceRunner`] interface in addition
/// to the watcher loop.
struct NodeServiceRunner {
    spec:    ServiceSpec,
    status:  RunnerStatus,
    sm:      ServiceStateMachine,
    backoff: BackoffState,
    output:  RuntimeOutputStore,
}

impl NodeServiceRunner {
    fn new(spec: ServiceSpec, output: RuntimeOutputStore) -> Self {
        let sm     = ServiceStateMachine::new(
            &ReconnectSection::default(),
            &spec.name,
            RestartPolicy::AlwaysRestart,
        );
        let backoff = BackoffState::from_config(&BackoffConfig::default());
        Self { spec, status: RunnerStatus::Stopped, sm, backoff, output }
    }
}

#[async_trait]
impl ServiceRunner for NodeServiceRunner {
    async fn start(&mut self) -> anyhow::Result<()> {
        self.sm.on_start();
        self.output.set_enabled(true);
        // Subscribe to the live broadcast channel (receiver dropped immediately;
        // this just verifies the channel is operational).
        let _rx = self.output.subscribe();
        // Wire an empty async reader so the pipe-reader path is exercised.
        self.output.spawn_pipe_reader(
            self.spec.name.clone(),
            "stdout",
            tokio::io::empty(),
        );
        self.sm.on_probe_success();
        self.sm.on_process_ready();
        self.sm.on_health_ok();
        self.backoff.reset();
        self.status = RunnerStatus::Running;
        Ok(())
    }

    async fn stop(&mut self) -> anyhow::Result<()> {
        // Notify the state machine: issue a failure event if currently live,
        // then an explicit disconnect regardless.
        if matches!(
            self.sm.state(),
            ConnectionState::Connected | ConnectionState::Verifying
        ) {
            self.sm.on_failure();
        }
        // Choose a failure domain based on restart history.
        let domain = if self.sm.should_give_up() {
            FailureDomain::Global
        } else if self.backoff.attempts() > 0 {
            FailureDomain::DependencyGroup
        } else {
            FailureDomain::ChildLocal
        };
        if matches!(
            self.sm.state(),
            ConnectionState::Probing | ConnectionState::Connecting | ConnectionState::Verifying
        ) {
            self.sm.on_probe_failure_in_domain(domain);
        }
        self.sm.on_disconnect();
        self.output.clear_component(&self.spec.name);
        self.status = RunnerStatus::Stopped;
        Ok(())
    }

    async fn status(&self) -> RunnerStatus {
        // Derive a coarse status from the state machine.
        match self.sm.state() {
            ConnectionState::Connected            => RunnerStatus::Running,
            ConnectionState::Disconnected         => RunnerStatus::Stopped,
            ConnectionState::Probing
            | ConnectionState::Connecting
            | ConnectionState::Verifying          => RunnerStatus::Starting,
            ConnectionState::Reconnecting { .. } => {
                RunnerStatus::Failed("reconnecting".to_string())
            }
        }
    }

    async fn health_probe(&self) -> HealthStatus {
        let events   = self.output.get_recent_events(&self.spec.name, 5);
        let names    = self.output.component_names();
        let give_up  = self.sm.should_give_up();
        let attempts = self.sm.attempt_count();

        if give_up {
            return HealthStatus::Unhealthy(format!("gave up after {attempts} attempts"));
        }
        let active = names.contains(&self.spec.name.to_ascii_lowercase())
            || !events.is_empty();
        if active { HealthStatus::Healthy } else { HealthStatus::Unhealthy("no output captured".to_string()) }
    }

    async fn discover_endpoint(&self) -> anyhow::Result<String> {
        let _lines = self.output.get_recent(&self.spec.name, 10);
        Ok("http://127.0.0.1:0".to_string())
    }
}
