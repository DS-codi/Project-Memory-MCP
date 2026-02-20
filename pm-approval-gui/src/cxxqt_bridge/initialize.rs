//! Initialize impl for ApprovalApp — reads FormRequest from stdin,
//! populates QML properties (including step context), and starts the
//! countdown timer task.

use crate::cxxqt_bridge::ffi;
use cxx_qt::CxxQtType;
use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;

use pm_gui_forms::protocol::ApprovalStepContext;

impl cxx_qt::Initialize for ffi::ApprovalApp {
    fn initialize(mut self: Pin<&mut Self>) {
        let qt_thread = self.qt_thread();
        let state_arc = self.rust().state.clone();

        let qt_thread_timer = self.qt_thread();
        let state_arc_timer = self.rust().state.clone();

        tokio::spawn(async move {
            // Read FormRequest from stdin via StdioTransport.
            let request = match read_form_request().await {
                Ok(req) => req,
                Err(err) => {
                    eprintln!("Failed to read FormRequest from stdin: {err}");
                    std::process::exit(1);
                }
            };

            let title = request.metadata.title.clone();
            let duration = request.timeout.duration_seconds as i32;
            let on_timeout = format!("{:?}", request.timeout.on_timeout).to_lowercase();

            // Extract step context from the optional context field.
            let step_ctx: Option<ApprovalStepContext> = request
                .context
                .as_ref()
                .and_then(|v| serde_json::from_value(v.clone()).ok());

            let plan_title = step_ctx
                .as_ref()
                .map(|c| c.plan_title.clone())
                .unwrap_or_default();
            let phase = step_ctx
                .as_ref()
                .map(|c| c.phase.clone())
                .unwrap_or_default();
            let step_task = step_ctx
                .as_ref()
                .map(|c| c.step_task.clone())
                .unwrap_or_else(|| {
                    request
                        .metadata
                        .description
                        .clone()
                        .unwrap_or_default()
                });
            let step_index = step_ctx.as_ref().map(|c| c.step_index as i32).unwrap_or(0);
            let urgency = step_ctx
                .as_ref()
                .map(|c| format!("{:?}", c.urgency).to_lowercase())
                .unwrap_or_else(|| "medium".to_string());

            // Cache the full request JSON for response construction.
            let request_json = serde_json::to_string(&request).unwrap_or_default();

            // Store in shared state.
            {
                let mut state = state_arc.lock().unwrap();
                state.request_json = request_json;
                state.on_timeout_action = on_timeout;
            }

            // Update QML properties on the Qt thread.
            qt_thread
                .queue(move |mut qobj| {
                    qobj.as_mut().set_title(QString::from(&title));
                    qobj.as_mut().set_plan_title(QString::from(&plan_title));
                    qobj.as_mut().set_phase(QString::from(&phase));
                    qobj.as_mut().set_step_task(QString::from(&step_task));
                    qobj.as_mut().set_step_index(step_index);
                    qobj.as_mut().set_urgency(QString::from(&urgency));
                    qobj.as_mut().set_remaining_seconds(duration);
                    qobj.as_mut().set_total_seconds(duration);
                })
                .unwrap();

            // Start countdown timer task.
            spawn_timer_task(qt_thread_timer, state_arc_timer, duration as u32).await;
        });
    }
}

/// Read a FormRequest from stdin using the StdioTransport.
async fn read_form_request(
) -> Result<pm_gui_forms::protocol::FormRequest, pm_gui_forms::transport::TransportError> {
    let mut transport = pm_gui_forms::transport::StdioTransport::new();
    use pm_gui_forms::transport::FormTransport;
    transport.read_request().await
}

/// Spawn the countdown timer task that ticks once per second, updating
/// `remainingSeconds` on the Qt thread. On expiry, fires `timerExpired`
/// signal and auto-submits based on the on_timeout config.
async fn spawn_timer_task(
    qt_thread: cxx_qt::CxxQtThread<ffi::ApprovalApp>,
    state_arc: std::sync::Arc<std::sync::Mutex<crate::cxxqt_bridge::AppState>>,
    duration_seconds: u32,
) {
    use tokio::time::{interval, Duration};

    let mut remaining = duration_seconds;
    let mut tick = interval(Duration::from_secs(1));

    // Consume the first immediate tick.
    tick.tick().await;

    loop {
        tick.tick().await;

        // Check if paused.
        let paused = {
            let state = state_arc.lock().unwrap();
            state.timer_paused
        };

        if paused {
            continue;
        }

        remaining = remaining.saturating_sub(1);
        let r = remaining;

        let qt = qt_thread.clone();
        qt.queue(move |mut qobj| {
            qobj.as_mut().set_remaining_seconds(r as i32);
        })
        .unwrap();

        if remaining == 0 {
            // Timer expired — read on_timeout action and auto-submit.
            let on_timeout = {
                let state = state_arc.lock().unwrap();
                state.on_timeout_action.clone()
            };

            qt_thread
                .queue(move |mut qobj| {
                    match on_timeout.as_str() {
                        "approve" => qobj.as_mut().approve(),
                        _ => qobj.as_mut().reject(),
                    }
                    qobj.as_mut().timer_expired();
                })
                .unwrap();
            return;
        }
    }
}
