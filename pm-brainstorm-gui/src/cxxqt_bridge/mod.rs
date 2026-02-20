//! CxxQt bridge for the brainstorm form GUI.
//!
//! Defines `FormApp` QObject exposed to QML with properties for question
//! data, timer state, metadata, and invokables for user actions.

mod initialize;
mod invokables;

use cxx_qt_lib::QString;
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

pub(crate) use form_state::FormAppRust;

/// Internal mutable state shared between the bridge and async tasks.
pub(crate) struct AppState {
    /// Answers collected so far, keyed by question_id.
    pub answers: HashMap<String, String>,
    /// Deserialized FormRequest (JSON string cached for quick access).
    pub request_json: String,
    /// Questions array as JSON (set once on init, mutated on refinement).
    pub questions_json_cache: String,
    /// Snapshot of original questions before any refinement.
    pub original_questions_snapshot: String,
    /// How many refinement round-trips have completed.
    pub refinement_count: u32,
    /// Whether the timer is currently paused.
    pub timer_paused: bool,
    /// Handle to cancel the countdown timer task.
    pub timer_cancel: Option<tokio::sync::oneshot::Sender<()>>,
    /// Shared transport (held alive across refinement round-trips).
    pub transport: Option<std::sync::Arc<tokio::sync::Mutex<pm_gui_forms::transport::StdioTransport>>>,
    /// Per-question diffs accumulated across all refinement round-trips.
    /// Used to build the RefinementSession attached to the final FormResponse.
    pub refinement_diffs: Vec<pm_gui_forms::protocol::QuestionDiff>,
    /// UTC timestamp of the first refinement request (None if no refinements yet).
    pub refinement_started_at: Option<chrono::DateTime<chrono::Utc>>,
    /// UTC timestamp of the most recent completed refinement.
    pub last_refined_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            answers: HashMap::new(),
            request_json: String::new(),
            questions_json_cache: String::new(),
            original_questions_snapshot: String::new(),
            refinement_count: 0,
            timer_paused: false,
            timer_cancel: None,
            transport: None,
            refinement_diffs: Vec::new(),
            refinement_started_at: None,
            last_refined_at: None,
        }
    }
}

/// Each field tagged with `#[qproperty]` in the bridge macro must have a
/// corresponding field here with matching name and type.
mod form_state {
    use cxx_qt_lib::QString;
    use std::sync::{Arc, Mutex};

    pub struct FormAppRust {
        // ── QML-bound properties (must match #[qproperty] declarations) ──
        pub(crate) title: QString,
        pub(crate) description: QString,
        pub(crate) questions_json: QString,
        pub(crate) answers_json: QString,
        pub(crate) remaining_seconds: i32,
        pub(crate) total_seconds: i32,
        pub(crate) timer_paused: bool,
        pub(crate) form_submitted: bool,
        /// True while waiting for a FormRefinementResponse from the Supervisor.
        pub(crate) refinement_pending: bool,
        /// JSON array of question objects that were updated in the last refinement.
        pub(crate) refined_questions_json: QString,
        /// How many refinement round-trips have completed (mirrors AppState).
        pub(crate) refinement_count: i32,
        // ── Internal state ──
        pub(crate) state: Arc<Mutex<super::AppState>>,
    }

    impl Default for FormAppRust {
        fn default() -> Self {
            Self {
                title: QString::from("Brainstorm"),
                description: QString::from(""),
                questions_json: QString::from("[]"),
                answers_json: QString::from("{}"),
                remaining_seconds: 300,
                total_seconds: 300,
                timer_paused: false,
                form_submitted: false,
                refinement_pending: false,
                refined_questions_json: QString::from("[]"),
                refinement_count: 0,
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
        #[qproperty(QString, description)]
        #[qproperty(QString, questions_json, cxx_name = "questionsJson")]
        #[qproperty(QString, answers_json, cxx_name = "answersJson")]
        #[qproperty(i32, remaining_seconds, cxx_name = "remainingSeconds")]
        #[qproperty(i32, total_seconds, cxx_name = "totalSeconds")]
        #[qproperty(bool, timer_paused, cxx_name = "timerPaused")]
        #[qproperty(bool, form_submitted, cxx_name = "formSubmitted")]
        #[qproperty(bool, refinement_pending, cxx_name = "refinementPending")]
        #[qproperty(QString, refined_questions_json, cxx_name = "refinedQuestionsJson")]
        #[qproperty(i32, refinement_count, cxx_name = "refinementCount")]
        type FormApp = super::FormAppRust;

        // ── Signals ────────────────────────────────────────────────

        /// Emitted when the countdown timer reaches zero.
        #[qsignal]
        #[cxx_name = "timerExpired"]
        fn timer_expired(self: Pin<&mut FormApp>);

        /// Emitted after the form has been submitted (user or auto).
        #[qsignal]
        #[cxx_name = "formCompleted"]
        fn form_completed(self: Pin<&mut FormApp>);

        /// Emitted when a refinement round-trip completes and updated questions are ready.
        #[qsignal]
        #[cxx_name = "refinementCompleted"]
        fn refinement_completed(self: Pin<&mut FormApp>);

        // ── Invokables (called from QML) ───────────────────────────

        /// Set or update the answer for a given question.
        /// `answer_json` is a JSON-encoded AnswerValue object.
        #[qinvokable]
        #[cxx_name = "setAnswer"]
        fn set_answer(self: Pin<&mut FormApp>, question_id: QString, answer_json: QString);

        /// Submit the form — collects all answers, auto-fills missing
        /// ones with recommendations, writes FormResponse to stdout.
        #[qinvokable]
        #[cxx_name = "submitForm"]
        fn submit_form(self: Pin<&mut FormApp>);

        /// Cancel the form — writes a deferred FormResponse with any
        /// partial answers collected so far.
        #[qinvokable]
        #[cxx_name = "cancelForm"]
        fn cancel_form(self: Pin<&mut FormApp>);

        /// "Use All Recommendations" shortcut — pre-fills every
        /// unanswered question with the recommended option.
        #[qinvokable]
        #[cxx_name = "useAllRecommendations"]
        fn use_all_recommendations(self: Pin<&mut FormApp>);

        /// Toggle marking a question for refinement.
        #[qinvokable]
        #[cxx_name = "toggleRefinement"]
        fn toggle_refinement(self: Pin<&mut FormApp>, question_id: QString);

        /// Store per-question user feedback for the upcoming refinement request.
        /// The feedback text is sent to the Brainstorm agent alongside the question ID.
        #[qinvokable]
        #[cxx_name = "setRefinementFeedback"]
        fn set_refinement_feedback(self: Pin<&mut FormApp>, question_id: QString, feedback: QString);

        /// Submit a refinement request for all marked questions.
        /// Writes FormResponse(RefinementRequested) to stdout and awaits a
        /// FormRefinementResponse from the Supervisor on stdin.
        /// Sets `refinementPending = true` until the response arrives, then
        /// emits `refinementCompleted`.
        #[qinvokable]
        #[cxx_name = "requestRefinement"]
        fn request_refinement(self: Pin<&mut FormApp>);

        /// Submit an immediate refinement request for a single question.
        /// Equivalent to marking exactly one question, providing optional
        /// one-line feedback, and calling `requestRefinement()`.
        /// Sets `refinementPending = true`; emits `refinementCompleted` on success.
        #[qinvokable]
        #[cxx_name = "requestRefinementForQuestion"]
        fn request_refinement_for_question(self: Pin<&mut FormApp>, question_id: QString, feedback: QString);

        /// Pause the countdown timer (e.g. on user hover / interaction).
        #[qinvokable]
        #[cxx_name = "pauseTimer"]
        fn pause_timer(self: Pin<&mut FormApp>);

        /// Resume the countdown timer after a pause.
        #[qinvokable]
        #[cxx_name = "resumeTimer"]
        fn resume_timer(self: Pin<&mut FormApp>);
    }

    impl cxx_qt::Initialize for FormApp {}
    impl cxx_qt::Threading for FormApp {}
}
