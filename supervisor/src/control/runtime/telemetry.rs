use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Default)]
pub struct RuntimeTelemetry {
    started_total: AtomicU64,
    completed_total: AtomicU64,
    failed_total: AtomicU64,
    cancelled_total: AtomicU64,
    timed_out_total: AtomicU64,
    overloaded_total: AtomicU64,
    hard_stop_total: AtomicU64,
}

impl RuntimeTelemetry {
    pub fn on_started(&self) {
        self.started_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn on_completed(&self) {
        self.completed_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn on_failed(&self) {
        self.failed_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn on_cancelled(&self) {
        self.cancelled_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn on_timed_out(&self) {
        self.timed_out_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn on_overloaded(&self) {
        self.overloaded_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn on_hard_stop(&self) {
        self.hard_stop_total.fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> serde_json::Value {
        serde_json::json!({
            "started_total": self.started_total.load(Ordering::Relaxed),
            "completed_total": self.completed_total.load(Ordering::Relaxed),
            "failed_total": self.failed_total.load(Ordering::Relaxed),
            "cancelled_total": self.cancelled_total.load(Ordering::Relaxed),
            "timed_out_total": self.timed_out_total.load(Ordering::Relaxed),
            "overloaded_total": self.overloaded_total.load(Ordering::Relaxed),
            "hard_stop_total": self.hard_stop_total.load(Ordering::Relaxed),
        })
    }
}
