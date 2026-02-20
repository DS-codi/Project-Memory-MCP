//! CxxQt bridge for the approval gate dialog.
//!
//! Defines `ApprovalApp` QObject exposed to QML with properties for
//! step context, timer state, and invokables for approve/reject actions.

mod initialize;
mod invokables;

use cxx_qt_lib::QString;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

pub(crate) use approval_state::ApprovalAppRust;

/// Internal mutable state shared between the bridge and async tasks.
pub(crate) struct AppState {
    /// Deserialized FormRequest (JSON string cached for response construction).
    pub request_json: String,
    /// The confirm/reject answer JSON (set when user clicks approve or reject).
    pub decision_answer: Option<String>,
    /// User notes from the notes field.
    pub user_notes: String,
    /// Whether the timer is currently paused.
    pub timer_paused: bool,
    /// The on_timeout action from the request ("approve" or "defer").
    pub on_timeout_action: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            request_json: String::new(),
            decision_answer: None,
            user_notes: String::new(),
            timer_paused: false,
            on_timeout_action: "approve".to_string(),
        }
    }
}

/// Rust struct backing the ApprovalApp QObject.
///
/// Each field tagged with `#[qproperty]` in the bridge macro must have a
/// corresponding field here with matching name and type.
mod approval_state {
    use cxx_qt_lib::QString;
    use std::sync::{Arc, Mutex};

    pub struct ApprovalAppRust {
        // ── QML-bound properties (must match #[qproperty] declarations) ──
        pub(crate) title: QString,
        pub(crate) plan_title: QString,
        pub(crate) phase: QString,
        pub(crate) step_task: QString,
        pub(crate) step_index: i32,
        pub(crate) urgency: QString,
        pub(crate) remaining_seconds: i32,
        pub(crate) total_seconds: i32,
        pub(crate) timer_paused: bool,
        pub(crate) form_submitted: bool,
        // ── Internal state ──
        pub(crate) state: Arc<Mutex<super::AppState>>,
    }

    impl Default for ApprovalAppRust {
        fn default() -> Self {
            Self {
                title: QString::from("Approval Required"),
                plan_title: QString::from(""),
                phase: QString::from(""),
                step_task: QString::from(""),
                step_index: 0,
                urgency: QString::from("medium"),
                remaining_seconds: 60,
                total_seconds: 60,
                timer_paused: false,
                form_submitted: false,
                state: Arc::new(Mutex::new(super::AppState::default())),
            }
        }
    }
}

#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        #[qproperty(QString, title)]
        #[qproperty(QString, plan_title, cxx_name = "planTitle")]
        #[qproperty(QString, phase)]
        #[qproperty(QString, step_task, cxx_name = "stepTask")]
        #[qproperty(i32, step_index, cxx_name = "stepIndex")]
        #[qproperty(QString, urgency)]
        #[qproperty(i32, remaining_seconds, cxx_name = "remainingSeconds")]
        #[qproperty(i32, total_seconds, cxx_name = "totalSeconds")]
        #[qproperty(bool, timer_paused, cxx_name = "timerPaused")]
        #[qproperty(bool, form_submitted, cxx_name = "formSubmitted")]
        type ApprovalApp = super::ApprovalAppRust;

        // ── Signals ────────────────────────────────────────────────

        /// Emitted when the countdown timer reaches zero.
        #[qsignal]
        #[cxx_name = "timerExpired"]
        fn timer_expired(self: Pin<&mut ApprovalApp>);

        /// Emitted after the form has been submitted (user or auto).
        #[qsignal]
        #[cxx_name = "formCompleted"]
        fn form_completed(self: Pin<&mut ApprovalApp>);

        // ── Invokables (called from QML) ───────────────────────────

        /// Approve the gated step. Writes an approved FormResponse to stdout.
        #[qinvokable]
        fn approve(self: Pin<&mut ApprovalApp>);

        /// Reject the gated step. Writes a cancelled FormResponse to stdout.
        #[qinvokable]
        fn reject(self: Pin<&mut ApprovalApp>);

        /// Set the user notes text (called from QML on text change).
        #[qinvokable]
        #[cxx_name = "setNotes"]
        fn set_notes(self: Pin<&mut ApprovalApp>, notes: QString);

        /// Pause the countdown timer (e.g. on user interaction).
        #[qinvokable]
        #[cxx_name = "pauseTimer"]
        fn pause_timer(self: Pin<&mut ApprovalApp>);

        /// Resume the countdown timer after a pause.
        #[qinvokable]
        #[cxx_name = "resumeTimer"]
        fn resume_timer(self: Pin<&mut ApprovalApp>);
    }

    impl cxx_qt::Initialize for ApprovalApp {}
    impl cxx_qt::Threading for ApprovalApp {}
}
