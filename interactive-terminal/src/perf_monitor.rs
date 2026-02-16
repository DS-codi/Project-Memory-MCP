use sysinfo::{CpuExt, Pid, PidExt, ProcessExt, System, SystemExt};

#[derive(Debug, Clone, Copy)]
pub struct PerfSnapshot {
    pub cpu_usage_percent: f64,
    pub memory_usage_mb: f64,
}

pub struct PerfMonitor {
    system: System,
    pid: Pid,
}

impl PerfMonitor {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        Self {
            system,
            pid: Pid::from_u32(std::process::id()),
        }
    }

    pub fn sample(&mut self) -> PerfSnapshot {
        self.system.refresh_cpu();
        self.system.refresh_memory();
        self.system.refresh_process(self.pid);

        let process = self.system.process(self.pid);

        let cpu_usage_percent = process
            .map(|proc| proc.cpu_usage() as f64)
            .unwrap_or_else(|| self.system.global_cpu_info().cpu_usage() as f64);

        let memory_usage_mb = process
            .map(|proc| proc.memory() as f64 / 1024.0)
            .unwrap_or_else(|| self.system.used_memory() as f64 / 1024.0 / 1024.0);

        PerfSnapshot {
            cpu_usage_percent,
            memory_usage_mb,
        }
    }
}
