//! Initialize impl for FormApp — reads FormRequest from stdin, populates
//! QML properties, and starts the countdown timer task.

use crate::cxxqt_bridge::ffi;
use cxx_qt::CxxQtType;
use cxx_qt::Threading;
use cxx_qt_lib::QString;
use std::pin::Pin;

impl cxx_qt::Initialize for ffi::FormApp {
    fn initialize(mut self: Pin<&mut Self>) {
        // Spawn async initialization on the CxxQt threading runtime.
        let qt_thread = self.qt_thread();
        let state_arc = self.rust().state.clone();

        // Read FormRequest from stdin on a background task, then
        // update QML properties on the Qt thread.
        let qt_thread_timer = self.qt_thread();
        let state_arc_timer = self.rust().state.clone();

        tokio::spawn(async move {
            // Read FormRequest from stdin via StdioTransport.
            // The transport is kept alive for later refinement round-trips.
            let (request, transport) = match read_form_request().await {
                Ok(pair) => pair,
                Err(err) => {
                    eprintln!("Failed to read FormRequest from stdin: {err}");
                    std::process::exit(1);
                }
            };

            let title = request.metadata.title.clone();
            let description = request
                .metadata
                .description
                .clone()
                .unwrap_or_default();
            let duration = request.timeout.duration_seconds as i32;

            // Serialize questions to JSON for QML consumption.
            let questions_json = match serde_json::to_string(&request.questions) {
                Ok(json) => json,
                Err(err) => {
                    eprintln!("Failed to serialize questions: {err}");
                    "[]".to_string()
                }
            };

            // Cache the full request JSON for response construction.
            let request_json = serde_json::to_string(&request).unwrap_or_default();

            // Store in shared state.
            {
                let mut state = state_arc.lock().unwrap();
                state.request_json = request_json;
                state.questions_json_cache = questions_json.clone();
                state.original_questions_snapshot = questions_json.clone();
                state.transport = Some(std::sync::Arc::new(
                    tokio::sync::Mutex::new(transport),
                ));
            }

            // Update QML properties on the Qt thread.
            let q_title = title;
            let q_desc = description;
            let q_json = questions_json;
            let q_duration = duration;

            qt_thread
                .queue(move |mut qobj| {
                    qobj.as_mut().set_title(QString::from(&q_title));
                    qobj.as_mut().set_description(QString::from(&q_desc));
                    qobj.as_mut()
                        .set_questions_json(QString::from(&q_json));
                    qobj.as_mut().set_remaining_seconds(q_duration);
                    qobj.as_mut().set_total_seconds(q_duration);
                })
                .unwrap();

            // Start countdown timer task.
            spawn_timer_task(qt_thread_timer, state_arc_timer, duration as u32).await;
        });
    }
}

/// Read a FormRequest from stdin and return both the request and the live transport.
///
/// The transport is kept alive so subsequent refinement round-trips can reuse
/// the same stdin/stdout handles without losing buffered bytes.
async fn read_form_request() -> Result<
    (pm_gui_forms::protocol::FormRequest, pm_gui_forms::transport::StdioTransport),
    pm_gui_forms::transport::TransportError,
> {
    use pm_gui_forms::transport::FormTransport;
    let mut transport = pm_gui_forms::transport::StdioTransport::new();
    let request = transport.read_request().await?;
    Ok((request, transport))
}

/// Spawn the countdown timer task that ticks once per second, updating
/// `remainingSeconds` on the Qt thread. On expiry, fires `timerExpired`
/// signal and auto-submits.
async fn spawn_timer_task(
    qt_thread: cxx_qt::CxxQtThread<ffi::FormApp>,
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
            // Timer expired — auto-submit with recommendations and fire signal.
            qt_thread
                .queue(move |mut qobj| {
                    // Auto-fill all unanswered with recommendations, then submit.
                    qobj.as_mut().use_all_recommendations();
                    qobj.as_mut().submit_form();
                    qobj.as_mut().timer_expired();
                })
                .unwrap();
            return;
        }
    }
}
