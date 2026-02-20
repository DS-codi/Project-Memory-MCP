//! Pure Rust countdown timer with pause/resume and elapsed tracking.
//!
//! This module provides the logic; the QML `CountdownBar` component drives
//! the visual representation in consumer binaries.

use std::time::{Duration, Instant};

use tokio::sync::mpsc;
use tokio::time;

/// Events emitted by the countdown timer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimerEvent {
    /// Emitted once per second with the number of seconds remaining.
    Tick { remaining_seconds: u32 },
    /// Emitted when the countdown reaches zero.
    Expired,
}

/// A countdown timer that ticks once per second.
///
/// # Lifecycle
///
/// 1. Create with [`CountdownTimer::new`].
/// 2. Spawn the timer task with [`CountdownTimer::start`] — returns a
///    [`mpsc::Receiver<TimerEvent>`] to consume ticks.
/// 3. Pause / resume with the returned [`TimerHandle`].
/// 4. The task exits after emitting [`TimerEvent::Expired`] or when the
///    handle is dropped.
pub struct CountdownTimer {
    duration_seconds: u32,
}

impl CountdownTimer {
    /// Create a new timer for the given duration.
    pub fn new(duration_seconds: u32) -> Self {
        Self { duration_seconds }
    }

    /// Spawn the timer on the current Tokio runtime.
    ///
    /// Returns a channel receiver for [`TimerEvent`]s and a [`TimerHandle`]
    /// for pause/resume control.
    pub fn start(self) -> (mpsc::Receiver<TimerEvent>, TimerHandle) {
        let (event_tx, event_rx) = mpsc::channel(16);
        let (cmd_tx, cmd_rx) = mpsc::channel(4);

        tokio::spawn(timer_task(self.duration_seconds, event_tx, cmd_rx));

        let handle = TimerHandle { cmd_tx };
        (event_rx, handle)
    }
}

/// Control handle for a running countdown timer.
#[derive(Clone)]
pub struct TimerHandle {
    cmd_tx: mpsc::Sender<TimerCommand>,
}

#[derive(Debug)]
enum TimerCommand {
    Pause,
    Resume,
    Cancel,
}

impl TimerHandle {
    /// Pause the countdown. Ticks stop being emitted until resumed.
    pub async fn pause(&self) {
        let _ = self.cmd_tx.send(TimerCommand::Pause).await;
    }

    /// Resume the countdown after a pause.
    pub async fn resume(&self) {
        let _ = self.cmd_tx.send(TimerCommand::Resume).await;
    }

    /// Cancel the timer. The task exits without emitting `Expired`.
    pub async fn cancel(&self) {
        let _ = self.cmd_tx.send(TimerCommand::Cancel).await;
    }

    /// The total number of seconds elapsed since the timer was started,
    /// excluding paused time. This is a snapshot — call when you need
    /// the value for an answer payload.
    ///
    /// **Note:** For precise tracking, store the start [`Instant`] externally.
    /// This method is provided for convenience when elapsed time is derived
    /// from `duration - remaining`.
    pub fn elapsed_from_remaining(&self, duration: u32, remaining: u32) -> u32 {
        duration.saturating_sub(remaining)
    }
}

/// Internal task that drives the countdown.
async fn timer_task(
    total_seconds: u32,
    tx: mpsc::Sender<TimerEvent>,
    mut cmd_rx: mpsc::Receiver<TimerCommand>,
) {
    let mut remaining = total_seconds;
    let mut paused = false;
    let tick_duration = Duration::from_secs(1);

    // Emit initial tick with full duration.
    let _ = tx
        .send(TimerEvent::Tick {
            remaining_seconds: remaining,
        })
        .await;

    loop {
        if remaining == 0 {
            let _ = tx.send(TimerEvent::Expired).await;
            return;
        }

        // Wait for one tick or a command, whichever comes first.
        let sleep = time::sleep(tick_duration);
        tokio::pin!(sleep);

        tokio::select! {
            _ = &mut sleep, if !paused => {
                remaining = remaining.saturating_sub(1);
                let _ = tx.send(TimerEvent::Tick { remaining_seconds: remaining }).await;
            }
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(TimerCommand::Pause) => { paused = true; }
                    Some(TimerCommand::Resume) => { paused = false; }
                    Some(TimerCommand::Cancel) | None => { return; }
                }
            }
        }
    }
}

/// Snapshot of a timer's state at a specific moment.
#[derive(Debug, Clone, Copy)]
pub struct TimerSnapshot {
    pub total_seconds: u32,
    pub remaining_seconds: u32,
    pub paused: bool,
}

impl TimerSnapshot {
    /// Seconds elapsed (total − remaining).
    pub fn elapsed_seconds(&self) -> u32 {
        self.total_seconds.saturating_sub(self.remaining_seconds)
    }
}
