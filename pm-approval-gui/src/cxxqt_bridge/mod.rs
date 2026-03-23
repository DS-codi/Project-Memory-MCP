//! CxxQt bridge for the approval gate dialog.
//!
//! Defines `ApprovalApp` QObject exposed to QML with properties for
//! step context, timer state, and invokables for approve/reject actions.

mod initialize;
mod invokables;

pub(crate) use approval_state::ApprovalAppRust;

/// Render modes supported by the standalone approval GUI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ApprovalRenderMode {
    Binary,
    MultipleChoice,
}

/// Internal mutable state shared between the bridge and async tasks.
pub(crate) struct AppState {
    /// Deserialized FormRequest (JSON string cached for response construction).
    pub request_json: String,
    /// User notes from the notes field.
    pub user_notes: String,
    /// Whether the timer is currently paused.
    pub timer_paused: bool,
    /// The on_timeout action from the request ("approve" or "defer").
    pub on_timeout_action: String,
    /// Dynamic render mode for the decision controls.
    pub mode: ApprovalRenderMode,
    /// Decision question id to use for response payloads.
    pub decision_question_id: String,
    /// Selected radio option id when in multiple-choice mode.
    pub selected_option_id: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            request_json: String::new(),
            user_notes: String::new(),
            timer_paused: false,
            on_timeout_action: "approve".to_string(),
            mode: ApprovalRenderMode::Binary,
            decision_question_id: "approval_decision".to_string(),
            selected_option_id: None,
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
        pub(crate) multiple_choice_mode: bool,
        pub(crate) decision_label: QString,
        pub(crate) decision_description: QString,
        pub(crate) decision_question_id: QString,
        pub(crate) approve_label: QString,
        pub(crate) reject_label: QString,
        pub(crate) allow_notes: bool,
        pub(crate) notes_placeholder: QString,
        pub(crate) choice_options_json: QString,
        pub(crate) selected_option_id: QString,
        pub(crate) allow_free_text: bool,
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
                multiple_choice_mode: false,
                decision_label: QString::from(""),
                decision_description: QString::from(""),
                decision_question_id: QString::from("approval_decision"),
                approve_label: QString::from("Approve"),
                reject_label: QString::from("Reject"),
                allow_notes: true,
                notes_placeholder: QString::from("Add notes about your decision (optional)"),
                choice_options_json: QString::from("[]"),
                selected_option_id: QString::from(""),
                allow_free_text: true,
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
        #[qproperty(bool, multiple_choice_mode, cxx_name = "multipleChoiceMode")]
        #[qproperty(QString, decision_label, cxx_name = "decisionLabel")]
        #[qproperty(QString, decision_description, cxx_name = "decisionDescription")]
        #[qproperty(QString, decision_question_id, cxx_name = "decisionQuestionId")]
        #[qproperty(QString, approve_label, cxx_name = "approveLabel")]
        #[qproperty(QString, reject_label, cxx_name = "rejectLabel")]
        #[qproperty(bool, allow_notes, cxx_name = "allowNotes")]
        #[qproperty(QString, notes_placeholder, cxx_name = "notesPlaceholder")]
        #[qproperty(QString, choice_options_json, cxx_name = "choiceOptionsJson")]
        #[qproperty(QString, selected_option_id, cxx_name = "selectedOptionId")]
        #[qproperty(bool, allow_free_text, cxx_name = "allowFreeText")]
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

        /// Track the selected option id for multiple-choice mode.
        #[qinvokable]
        #[cxx_name = "setSelectedOption"]
        fn set_selected_option(self: Pin<&mut ApprovalApp>, option_id: QString);

        /// Submit the current radio-selection decision.
        #[qinvokable]
        #[cxx_name = "submitSelection"]
        fn submit_selection(self: Pin<&mut ApprovalApp>);

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
