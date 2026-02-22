//! MCP instance pool manager.
//!
//! Manages a set of Node.js MCP server processes, each listening on a unique
//! port.  The pool handles:
//!
//! - Spawning the initial `min_instances` on startup.
//! - Reporting which instance has the fewest active connections
//!   (`least_loaded_port`) so the proxy can route new VS Code sessions there.
//! - Scaling up (spawning a new instance) when every existing instance has
//!   reached `max_connections_per_instance` and the pool is below
//!   `max_instances`.

use std::collections::HashMap;

use crate::config::{NodeRunnerConfig, PoolConfig};
use crate::control::registry::McpConnectionEntry;
use crate::runner::node::NodeRunner;
use crate::runner::ServiceRunner;

// ---------------------------------------------------------------------------
// ManagedInstance
// ---------------------------------------------------------------------------

/// One managed MCP Node.js process in the pool.
pub struct ManagedInstance {
    /// The HTTP port this instance listens on.
    pub port: u16,
    runner: NodeRunner,
    /// Number of active connections currently assigned to this instance.
    /// Updated by the poll loop via `update_connection_count`.
    pub connection_count: usize,
    /// `true` once the instance has successfully passed a health probe.
    pub healthy: bool,
    /// Consecutive failed health probes.  When this reaches 2 the instance is
    /// considered dead and will be respawned.
    pub consecutive_failures: u32,
}

impl ManagedInstance {
    fn new(port: u16, node_cfg: &NodeRunnerConfig, health_timeout_ms: u64) -> Self {
        let mut cfg = node_cfg.clone();
        // Override transport and port env vars so each instance binds the right port.
        cfg.env.insert("MCP_TRANSPORT".to_string(), "streamable-http".to_string());
        cfg.env.insert("MCP_PORT".to_string(), port.to_string());
        // Also inject as CLI args if the config uses arg-based startup.
        // The server accepts --transport and --port flags.
        cfg.args = build_args(&node_cfg.args, port);

        Self {
            port,
            runner: NodeRunner::new(cfg, health_timeout_ms, port),
            connection_count: 0,
            healthy: false,
            consecutive_failures: 0,
        }
    }

    pub async fn start(&mut self) -> anyhow::Result<()> {
        self.runner.start().await
    }

    pub async fn stop(&mut self) -> anyhow::Result<()> {
        self.runner.stop().await
    }

    /// Restart the instance process.  If the process is already dead (detected
    /// via `try_wait`), marks the runner stopped first to avoid a spurious kill
    /// attempt, then spawns fresh.
    pub async fn restart(&mut self) {
        if self.runner.is_process_dead() {
            self.runner.mark_stopped();
        } else {
            let _ = self.runner.stop().await;
        }
        self.consecutive_failures = 0;
        self.healthy = false;
        match self.runner.start().await {
            Ok(()) => eprintln!("[pool] respawned MCP instance on port {}", self.port),
            Err(e) => eprintln!("[pool] failed to respawn MCP instance on port {}: {e}", self.port),
        }
    }

    pub async fn health_probe(&self) -> bool {
        matches!(self.runner.health_probe().await, crate::runner::HealthStatus::Healthy)
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

/// Replace or inject `--transport` and `--port` in a Node args list.
fn build_args(base_args: &[String], port: u16) -> Vec<String> {
    let mut args: Vec<String> = base_args.to_vec();
    // Remove any existing --transport / --port pairs.
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--transport" || args[i] == "--port" {
            args.remove(i);
            if i < args.len() {
                args.remove(i);
            }
        } else {
            i += 1;
        }
    }
    args.push("--transport".to_string());
    args.push("streamable-http".to_string());
    args.push("--port".to_string());
    args.push(port.to_string());
    args
}

// ---------------------------------------------------------------------------
// Orphan process cleanup
// ---------------------------------------------------------------------------

/// Kill any process already listening on one of the given ports.
///
/// Called during `ManagedPool::init()` so that Node.js MCP instances left
/// over from a previous supervisor run do not block the new pool from
/// binding to the same ports.
async fn kill_orphans_on_ports(ports: &[u16]) {
    for &port in ports {
        if let Some(pid) = find_pid_for_port(port).await {
            kill_pid(pid, port);
        }
    }
}

/// Return the PID of the process listening on `port`, or `None` if the port
/// is free or the lookup fails.
#[cfg(windows)]
async fn find_pid_for_port(port: u16) -> Option<u32> {
    let output = tokio::process::Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output()
        .await
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if !line.to_ascii_uppercase().contains("LISTENING") {
            continue;
        }
        // Match lines that contain ":PORT " (port at the end of an address
        // field, followed by a space).
        let needle = format!(":{port} ");
        if !line.contains(&needle) {
            continue;
        }
        // PID is the last whitespace-delimited token on the line.
        if let Some(pid_str) = line.split_whitespace().last() {
            if let Ok(pid) = pid_str.parse::<u32>() {
                return Some(pid);
            }
        }
    }
    None
}

#[cfg(not(windows))]
async fn find_pid_for_port(port: u16) -> Option<u32> {
    let output = tokio::process::Command::new("lsof")
        .args([
            "-iTCP",
            &format!(":{port}"),
            "-sTCP:LISTEN",
            "-t",
        ])
        .output()
        .await
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.split_whitespace().next()?.parse::<u32>().ok()
}

/// Send a forceful termination signal to `pid`.
fn kill_pid(pid: u32, port: u16) {
    #[cfg(windows)]
    {
        match std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
        {
            Ok(out) if out.status.success() => {
                eprintln!("[pool] killed orphan PID {pid} on port {port}");
            }
            Ok(out) => {
                let msg = String::from_utf8_lossy(&out.stderr);
                eprintln!("[pool] could not kill orphan PID {pid} on port {port}: {msg}");
            }
            Err(e) => {
                eprintln!("[pool] error killing orphan PID {pid} on port {port}: {e}");
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map(|out| {
                if out.status.success() {
                    eprintln!("[pool] killed orphan PID {pid} on port {port}");
                } else {
                    eprintln!("[pool] could not kill orphan PID {pid} on port {port}");
                }
            });
    }
}

/// Pool of managed MCP instances.
pub struct ManagedPool {
    pool_cfg: PoolConfig,
    node_cfg: NodeRunnerConfig,
    health_timeout_ms: u64,
    /// Instances keyed by port.
    instances: HashMap<u16, ManagedInstance>,
}

impl ManagedPool {
    /// Create a new pool from config.  Call `init().await` to spawn the
    /// initial instances.
    pub fn new(pool_cfg: PoolConfig, node_cfg: NodeRunnerConfig, health_timeout_ms: u64) -> Self {
        Self {
            pool_cfg,
            node_cfg,
            health_timeout_ms,
            instances: HashMap::new(),
        }
    }

    /// Spawn `min_instances` instances starting at `base_port`.
    pub async fn init(&mut self) {
        for i in 0..self.pool_cfg.min_instances {
            let port = self.pool_cfg.base_port + i;
            self.spawn_instance(port).await;
        }
    }

    /// Spawn a single new instance on `port`.  No-op if already present.
    async fn spawn_instance(&mut self, port: u16) {
        if self.instances.contains_key(&port) {
            return;
        }
        let mut instance = ManagedInstance::new(port, &self.node_cfg, self.health_timeout_ms);
        match instance.start().await {
            Ok(()) => {
                eprintln!("[pool] MCP instance started on port {port}");
                self.instances.insert(port, instance);
            }
            Err(e) => {
                eprintln!("[pool] failed to start MCP instance on port {port}: {e}");
            }
        }
    }

    /// Returns `true` if a scale-up was triggered (new instance spawned).
    ///
    /// A scale-up is performed when every current instance has reached
    /// `max_connections_per_instance` AND the pool size is below
    /// `max_instances`.
    pub async fn maybe_scale_up(&mut self, connections: &[McpConnectionEntry]) -> bool {
        // Update per-instance connection counts.
        for instance in self.instances.values_mut() {
            instance.connection_count = connections
                .iter()
                .filter(|c| c.instance_port == instance.port)
                .count();
        }

        let total = self.instances.len() as u16;
        if total >= self.pool_cfg.max_instances {
            return false;
        }

        let all_at_capacity = self.instances.values().all(|inst| {
            inst.connection_count >= self.pool_cfg.max_connections_per_instance
        });

        if !all_at_capacity {
            return false;
        }

        // Find the next free port.
        let next_port = self.pool_cfg.base_port + total;
        eprintln!(
            "[pool] all {total} instances at capacity ({} conns each) — spawning new instance on port {next_port}",
            self.pool_cfg.max_connections_per_instance
        );
        self.spawn_instance(next_port).await;
        true
    }

    /// Force a scale-up regardless of load (used by `ScaleUpMcp` command).
    /// Returns `Err` if already at `max_instances`.
    pub async fn force_scale_up(&mut self) -> anyhow::Result<u16> {
        let total = self.instances.len() as u16;
        if total >= self.pool_cfg.max_instances {
            anyhow::bail!(
                "already at max_instances ({})",
                self.pool_cfg.max_instances
            );
        }
        let next_port = self.pool_cfg.base_port + total;
        self.spawn_instance(next_port).await;
        Ok(next_port)
    }

    /// Return the port of the instance with the fewest active connections.
    ///
    /// Falls back to `base_port` if no instances are running (should not
    /// happen after `init()` succeeds).
    pub fn least_loaded_port(&self) -> u16 {
        self.instances
            .values()
            .min_by_key(|i| i.connection_count)
            .map(|i| i.port)
            .unwrap_or(self.pool_cfg.base_port)
    }

    /// Refresh health flags for all instances.  Instances that fail 2
    /// consecutive probes (or whose process is detected as already dead) are
    /// automatically restarted.
    pub async fn refresh_health(&mut self) {
        for instance in self.instances.values_mut() {
            let alive = instance.health_probe().await;
            if alive {
                instance.healthy = true;
                instance.consecutive_failures = 0;
            } else {
                instance.healthy = false;
                instance.consecutive_failures += 1;
                let dead = instance.runner.is_process_dead();
                if dead || instance.consecutive_failures >= 2 {
                    eprintln!(
                        "[pool] instance on port {} is dead (failures={}, process_dead={}) — respawning",
                        instance.port, instance.consecutive_failures, dead
                    );
                    instance.restart().await;
                }
            }
        }
    }

    /// Return the base URL of the least-loaded healthy instance.
    pub fn least_loaded_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.least_loaded_port())
    }

    /// All currently running instance ports.
    pub fn ports(&self) -> Vec<u16> {
        let mut ports: Vec<u16> = self.instances.keys().copied().collect();
        ports.sort();
        ports
    }

    /// Stop all instances.
    pub async fn stop_all(&mut self) {
        for (port, instance) in self.instances.iter_mut() {
            if let Err(e) = instance.stop().await {
                eprintln!("[pool] error stopping instance on port {port}: {e}");
            }
        }
        self.instances.clear();
    }
}
